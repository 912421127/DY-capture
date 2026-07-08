import { browser } from 'wxt/browser';
import {
    BRIDGE_READY,
    buildPageUrls,
    buildShopRankCaptureState,
    GET_TAB_SHOP_RANK_CAPTURE,
    extractPageResult,
    isShopRankUrl,
    mergeMultiPageResponses,
    PAGE_READY,
    REPORT_SHOP_RANK_CAPTURE,
    type BridgeReadyMessage,
    type GetLatestShopRankPageResponse,
    type GetTabShopRankCaptureMessage,
    type PageReadyMessage,
    type PageReadyPayload,
    type RawShopRankCapture,
    type ReportShopRankCaptureMessage,
    type ShopRankRequestSeen
} from '../src/shared/shopRank';

export default defineBackground(() => {
    // MV3 的 service worker 空闲时会被系统回收，内存里的捕获会随之丢失。
    // 这里用 storage.session 按 tabId 持久化最近一次原始响应和各类就绪状态，
    // 这样即便 background 被回收，Popup 仍能读到当前 tab 的最新捕获与诊断信息。
    const captureKey = (tabId: number) => `shopRankCapture:${tabId}`;
    const readyKey = (tabId: number) => `shopRankBridgeReady:${tabId}`;
    const pageReadyKey = (tabId: number) => `shopRankPageReady:${tabId}`;
    const requestSeenKey = (tabId: number) => `shopRankRequestSeen:${tabId}`;
    // 多页获取进度：Popup 查询时读到这个 key 会显示「正在获取第 X/N 页...」。
    const captureProgressKey = (tabId: number) => `shopRankCaptureProgress:${tabId}`;

    browser.runtime.onMessage.addListener((message: unknown, sender) => {
        const tabId = sender.tab?.id;

        // BRIDGE_READY / PAGE_READY / REPORT 都来自 content script，必须能定位到所属 tab。
        if (tabId !== undefined) {
            if (isBridgeReady(message)) {
                void browser.storage.session.set({ [readyKey(tabId)]: true });
                return undefined;
            }

            if (isPageReady(message)) {
                void browser.storage.session.set({ [pageReadyKey(tabId)]: message.payload });
                return undefined;
            }

            if (isReportCapture(message)) {
                void browser.storage.session.set({ [captureKey(tabId)]: message.payload });
                return undefined;
            }
        }

        // GET_TAB 来自 Popup，消息体里自带要查询的 tabId。
        if (isGetTabCapture(message)) {
            return handleGetTabCapture(message.tabId);
        }

        return undefined;
    });

    // webRequest 诊断：只看请求 URL 是否命中 shop_rank，不读 body、不阻塞。
    // 用来区分「page 脚本没拦到」和「请求根本没走主页面 fetch（Service Worker / Worker 发起）」。
    // tabId < 0 表示请求由扩展自身的 service worker 发起，忽略。
    // 命中时除了记录诊断，还会用 background 自己的 fetch + cookies 重取一次响应体，
    // 写到 captureKey，Popup 就能拿到（应对 SW/Worker 场景下 page patch 看不到请求的情况）。
    browser.webRequest.onBeforeRequest.addListener(
        details => {
            if (details.tabId < 0) {
                return;
            }

            if (!isShopRankUrl(details.url)) {
                return;
            }

            const seen: ShopRankRequestSeen = { url: details.url, at: new Date().toISOString() };
            void browser.storage.session.set({ [requestSeenKey(details.tabId)]: seen });

            // 背景重取是非阻塞的，webRequest listener 必须同步返回，所以用 void 包裹。
            // details.initiator 是发起该请求的页面 origin（SW 场景下也是触发页的 origin），
            // 用作 Referer；缺失时兜底到罗盘首页。
            void reFetchShopRank(details.tabId, details.url, details.initiator);
        },
        { urls: ['https://compass.jinritemai.com/*'] }
    );

    // 按 tabId 追踪当前正在进行的重取 AbortController。
    // 用户快速切换筛选条件时，新请求会取消旧请求，避免 N 次并发重取把后端打爆。
    const inFlightRefetches = new Map<number, AbortController>();

    async function reFetchShopRank (tabId: number, url: string, initiator?: string): Promise<void> {
        // 1) 取消该 tab 正在进行的旧重取（含多页循环），保证只保留最新一次筛选结果。
        const prevController = inFlightRefetches.get(tabId);
        if (prevController) {
            prevController.abort();
        }

        const controller = new AbortController();
        inFlightRefetches.set(tabId, controller);

        try {
            // 2) 读取域名下所有 cookie（含 HttpOnly，扩展 cookies API 不受 HttpOnly 限制）。
            const cookies = await browser.cookies.getAll({ domain: 'compass.jinritemai.com' });

            if (cookies.length === 0) {
                console.warn('[DY Capture] 未获取到 compass 域名的 cookie，用户可能未登录');
                return;
            }

            const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            const referer = initiator || 'https://compass.jinritemai.com/';

            // 3) 先获取第一页。
            const page1Response = await fetchOnePage(url, cookieHeader, referer, controller.signal);

            if (!page1Response) {
                return;
            }

            // 4) 检查是否有更多页。单页或无法解析分页信息时，按原有逻辑直接写入。
            const pageResult = extractPageResult(page1Response);

            if (!pageResult || pageResult.total <= pageResult.pageSize) {
                await storeSingleCapture(tabId, url, page1Response);
                return;
            }

            // 5) 多页场景：生成剩余页 URL，逐页获取（页间 500ms 间隔），合并写入。
            const totalPages = Math.ceil(pageResult.total / pageResult.pageSize);
            const remainingUrls = buildPageUrls(url, totalPages);
            const allResponses = [page1Response];

            await setProgress(tabId, { currentPage: 1, totalPages, status: 'fetching' });

            for (let i = 0; i < remainingUrls.length; i += 1) {
                if (controller.signal.aborted) {
                    return;
                }

                // 对后端温和逐页请求，避免触发限流。
                await sleep(500);
                const pageResp = await fetchOnePage(remainingUrls[i], cookieHeader, referer, controller.signal);

                if (pageResp) {
                    allResponses.push(pageResp);
                } else {
                    console.warn('[DY Capture] 跳过分页获取失败:', remainingUrls[i]);
                }

                await setProgress(tabId, { currentPage: i + 2, totalPages, status: 'fetching' });
            }

            // 6) 合并所有页的响应，写入 captureKey。合并后的结构与单页一致，CSV 导出逻辑无需改动。
            await setProgress(tabId, { currentPage: totalPages, totalPages, status: 'merging' });
            const mergedResponse = mergeMultiPageResponses(allResponses);

            if (mergedResponse) {
                await browser.storage.session.set({
                    [captureKey(tabId)]: { url, capturedAt: new Date().toISOString(), rawResponse: mergedResponse }
                });
                console.info(`[DY Capture] 多页重取完成: ${totalPages} 页`, url);
            }
        } catch (error: unknown) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return;
            }
            console.warn('[DY Capture] 背景重取失败', error);
        } finally {
            void clearProgress(tabId);

            if (inFlightRefetches.get(tabId) === controller) {
                inFlightRefetches.delete(tabId);
            }
        }
    }

    async function fetchOnePage (url: string, cookieHeader: string, referer: string, signal: AbortSignal): Promise<unknown | null> {
        const response = await fetch(url, {
            credentials: 'include',
            headers: { Cookie: cookieHeader, Referer: referer },
            signal
        });

        if (!response.ok) {
            console.warn(`[DY Capture] 背景重取返回非 2xx 状态: ${response.status}`, url);
            return null;
        }

        return response.json();
    }

    async function storeSingleCapture (tabId: number, url: string, rawResponse: unknown): Promise<void> {
        const capture: RawShopRankCapture = { url, capturedAt: new Date().toISOString(), rawResponse };
        await browser.storage.session.set({ [captureKey(tabId)]: capture });
        console.info('[DY Capture] 背景重取成功', url);
    }

    async function setProgress (tabId: number, progress: { currentPage: number; totalPages: number; status: string }): Promise<void> {
        await browser.storage.session.set({ [captureProgressKey(tabId)]: progress });
    }

    async function clearProgress (tabId: number): Promise<void> {
        await browser.storage.session.remove([captureProgressKey(tabId)]);
    }

    function sleep (ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 标签页关闭时清理对应缓存，避免 storage.session 堆积无用数据。
    browser.tabs.onRemoved.addListener(tabId => {
        void browser.storage.session.remove([captureKey(tabId), readyKey(tabId), pageReadyKey(tabId), requestSeenKey(tabId), captureProgressKey(tabId)]);
    });

    // 顶层 frame 重新加载或跳转时，旧捕获已失效，先清掉再等 bridge 重新上报。
    // tabs.onUpdated 只在顶层导航触发，不会被子 frame 的内部跳转误清。
    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === 'loading') {
            void browser.storage.session.remove([captureKey(tabId), readyKey(tabId), pageReadyKey(tabId), requestSeenKey(tabId), captureProgressKey(tabId)]);
        }
    });

    async function handleGetTabCapture (tabId: number): Promise<GetLatestShopRankPageResponse> {
        // storage.session.get 返回的是按 key 名索引的对象，不是数组。
        const entry = await browser.storage.session.get([
            captureKey(tabId), readyKey(tabId), pageReadyKey(tabId),
            requestSeenKey(tabId), captureProgressKey(tabId)
        ]);
        const rawCapture = entry[captureKey(tabId)] as RawShopRankCapture | undefined;
        const bridgeReady = Boolean(entry[readyKey(tabId)]);
        const pageReadyPayload = entry[pageReadyKey(tabId)] as PageReadyPayload | undefined;
        const requestSeen = entry[requestSeenKey(tabId)] as ShopRankRequestSeen | undefined;
        const captureProgress = entry[captureProgressKey(tabId)] as { currentPage: number; totalPages: number; status: string } | undefined;

        // 复用同一份状态构建逻辑，保证解析行为和错误提示与旧 bridge 实现一致。
        const state = buildShopRankCaptureState(rawCapture ?? null);
        return {
            ...state,
            bridgeReady,
            pageReady: Boolean(pageReadyPayload),
            fetchPatched: pageReadyPayload?.fetchPatched,
            xhrPatched: pageReadyPayload?.xhrPatched,
            shopRankRequestSeen: requestSeen ?? null,
            captureProgress: captureProgress ?? null
        };
    }
});

function isBridgeReady (value: unknown): value is BridgeReadyMessage {
    return Boolean(value) && typeof value === 'object' && (value as { type?: string }).type === BRIDGE_READY;
}

function isPageReady (value: unknown): value is PageReadyMessage {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const message = value as Partial<PageReadyMessage>;
    return message.type === PAGE_READY && Boolean(message.payload);
}

function isReportCapture (value: unknown): value is ReportShopRankCaptureMessage {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const message = value as Partial<ReportShopRankCaptureMessage>;
    return message.type === REPORT_SHOP_RANK_CAPTURE && Boolean(message.payload);
}

function isGetTabCapture (value: unknown): value is GetTabShopRankCaptureMessage {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const message = value as Partial<GetTabShopRankCaptureMessage>;
    return message.type === GET_TAB_SHOP_RANK_CAPTURE && typeof message.tabId === 'number';
}
