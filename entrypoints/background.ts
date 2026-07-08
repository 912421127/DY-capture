import { browser } from 'wxt/browser';
import {
    BRIDGE_READY,
    GET_ALL_TAB_CAPTURE,
    GET_TAB_CAPTURE,
    REPORT_CAPTURE,
    type GetAllTabCaptureMessage,
    type GetAllTabCaptureResponse,
    type FeatureCaptureState,
    type GetTabCaptureMessage,
    isBridgeReady,
    isGetAllTabCapture,
    isGetTabCapture,
    isPageReady,
    isReportCapture
} from '../src/shared/protocol';
import { buildCaptureState } from '../src/shared/state';
import {
    bridgeReadyKey,
    captureKey,
    captureProgressKey,
    pageReadyKey,
    requestSeenKey
} from '../src/shared/storage';
import type {
    CaptureProgress,
    CaptureStateResponse,
    PageReadyPayload,
    RawCapture,
    RequestSeen
} from '../src/shared/types';
import { FEATURES, findFeatureById, findFeatureByApiUrl, getContentScriptMatches, type CaptureFeature } from '../src/features';

// FEATURES / findFeatureByApiUrl / getContentScriptMatches 都来自统一注册表 src/features，
// 新增数据类型时只改注册表，background 核心逻辑不用动。

export default defineBackground(() => {
    // MV3 的 service worker 空闲时会被系统回收，内存里的捕获会随之丢失。
    // 这里用 storage.session 按「数据类型 + tabId」持久化最近一次原始响应和各类就绪状态，
    // 这样即便 background 被回收，Popup 仍能读到当前 tab 的最新捕获与诊断信息。
    const captureKeyFor = (captureType: string, tabId: number) => captureKey(captureType, tabId);
    const readyKey = (tabId: number) => bridgeReadyKey(tabId);
    const pageReadyKeyFor = (tabId: number) => pageReadyKey(tabId);
    const requestSeenKeyFor = (tabId: number) => requestSeenKey(tabId);
    const captureProgressKeyFor = (tabId: number) => captureProgressKey(tabId);

    browser.runtime.onMessage.addListener((message: unknown, sender) => {
        const tabId = sender.tab?.id;

        // BRIDGE_READY / PAGE_READY / REPORT 都来自 content script，必须能定位到所属 tab。
        if (tabId !== undefined) {
            if (isBridgeReady(message)) {
                void browser.storage.session.set({ [readyKey(tabId)]: true });
                return undefined;
            }

            if (isPageReady(message)) {
                void browser.storage.session.set({ [pageReadyKeyFor(tabId)]: message.payload });
                return undefined;
            }

            if (isReportCapture(message)) {
                // 按数据类型分别存储，同一 tab 上多个数据类型互不覆盖。
                void browser.storage.session.set({ [captureKeyFor(message.captureType, tabId)]: message.payload });
                return undefined;
            }
        }

        // GET_TAB 来自 Popup，消息体里自带要查询的 tabId 与 captureType。
        if (isGetTabCapture(message)) {
            return handleGetTabCapture(message);
        }

        // GET_ALL_TAB 来自 Popup，一次查询当前 tab 下所有数据类型的捕获状态。
        if (isGetAllTabCapture(message)) {
            return handleGetAllTabCapture(message);
        }

        return undefined;
    });

    // webRequest 诊断：只看请求 URL 是否命中某个数据类型，不读 body、不阻塞。
    // 用来区分「page 脚本没拦到」和「请求根本没走主页面 fetch（Service Worker / Worker 发起）」。
    // tabId < 0 表示请求由扩展自身的 service worker 发起，忽略。
    // 命中时除了记录诊断，还会用 background 自己的 fetch + cookies 重取一次响应体，
    // 写到存储，Popup 就能拿到（应对 SW/Worker 场景下 page patch 看不到请求的情况）。
    browser.webRequest.onBeforeRequest.addListener(
        details => {
            if (details.tabId < 0) {
                return;
            }

            const feature = findFeatureByApiUrl(details.url);

            if (!feature) {
                return;
            }

            const seen: RequestSeen = { url: details.url, at: new Date().toISOString() };
            void browser.storage.session.set({ [requestSeenKeyFor(details.tabId)]: seen });

            // 背景重取是非阻塞的，webRequest listener 必须同步返回，所以用 void 包裹。
            // details.initiator 是发起该请求的页面 origin（SW 场景下也是触发页的 origin），
            // 用作 Referer；缺失时兜底到罗盘首页。
            void reFetch(feature, details.tabId, details.url, details.initiator);
        },
        { urls: ['https://compass.jinritemai.com/*'] }
    );

    // 按 tabId 追踪当前正在进行的重取 AbortController。
    // 用户快速切换筛选条件时，新请求会取消旧请求，避免 N 次并发重取把后端打爆。
    const inFlightRefetches = new Map<number, AbortController>();

    async function reFetch (feature: CaptureFeature, tabId: number, url: string, initiator?: string): Promise<void> {
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
            const pageResult = feature.extractPageResult(page1Response);

            if (!pageResult || pageResult.total <= pageResult.pageSize) {
                await storeSingleCapture(feature, tabId, url, page1Response);
                return;
            }

            // 5) 多页场景：生成剩余页 URL，逐页获取（页间 500ms 间隔），合并写入。
            const totalPages = Math.ceil(pageResult.total / pageResult.pageSize);
            const remainingUrls = feature.buildPageUrls(url, totalPages);
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

            // 6) 合并所有页的响应，写入存储。合并后的结构与单页一致，CSV 导出逻辑无需改动。
            await setProgress(tabId, { currentPage: totalPages, totalPages, status: 'merging' });
            const mergedResponse = feature.mergePages(allResponses);

            if (mergedResponse) {
                await browser.storage.session.set({
                    [captureKeyFor(feature.id, tabId)]: { url, capturedAt: new Date().toISOString(), rawResponse: mergedResponse }
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

    async function storeSingleCapture (feature: CaptureFeature, tabId: number, url: string, rawResponse: unknown): Promise<void> {
        const capture: RawCapture = { url, capturedAt: new Date().toISOString(), rawResponse };
        await browser.storage.session.set({ [captureKeyFor(feature.id, tabId)]: capture });
        console.info('[DY Capture] 背景重取成功', url);
    }

    async function setProgress (tabId: number, progress: CaptureProgress): Promise<void> {
        await browser.storage.session.set({ [captureProgressKeyFor(tabId)]: progress });
    }

    async function clearProgress (tabId: number): Promise<void> {
        await browser.storage.session.remove([captureProgressKeyFor(tabId)]);
    }

    function sleep (ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 标签页关闭时清理对应缓存，避免 storage.session 堆积无用数据。
    // 每种数据类型各有一份捕获，按 FEATURES 全部清理。
    browser.tabs.onRemoved.addListener(tabId => {
        void browser.storage.session.remove([
            ...FEATURES.map(feature => captureKeyFor(feature.id, tabId)),
            readyKey(tabId),
            pageReadyKeyFor(tabId),
            requestSeenKeyFor(tabId),
            captureProgressKeyFor(tabId)
        ]);
    });

    // 顶层 frame 重新加载或跳转时，旧捕获已失效，先清掉再等 bridge 重新上报。
    // tabs.onUpdated 只在顶层导航触发，不会被子 frame 的内部跳转误清。
    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === 'loading') {
            void browser.storage.session.remove([
                ...FEATURES.map(feature => captureKeyFor(feature.id, tabId)),
                readyKey(tabId),
                pageReadyKeyFor(tabId),
                requestSeenKeyFor(tabId),
                captureProgressKeyFor(tabId)
            ]);
        }
    });

    // 读取单个数据类型在当前 tab 的捕获状态，复用 buildCaptureState 保证解析行为一致。
    async function buildFeatureState (feature: CaptureFeature, tabId: number): Promise<FeatureCaptureState> {
        // storage.session.get 返回的是按 key 名索引的对象，不是数组。
        const entry = await browser.storage.session.get([
            captureKeyFor(feature.id, tabId),
            readyKey(tabId),
            pageReadyKeyFor(tabId),
            requestSeenKeyFor(tabId),
            captureProgressKeyFor(tabId)
        ]);

        const rawCapture = entry[captureKeyFor(feature.id, tabId)] as RawCapture | undefined;
        const bridgeReady = Boolean(entry[readyKey(tabId)]);
        const pageReadyPayload = entry[pageReadyKeyFor(tabId)] as PageReadyPayload | undefined;
        const requestSeen = entry[requestSeenKeyFor(tabId)] as RequestSeen | undefined;
        const captureProgress = entry[captureProgressKeyFor(tabId)] as CaptureProgress | undefined;

        // 复用同一份状态构建逻辑，保证解析行为和错误提示与捕获链路一致。
        const state = buildCaptureState(rawCapture ?? null, feature.parse);

        return {
            id: feature.id,
            displayName: feature.displayName,
            state: {
                ...state,
                bridgeReady,
                pageReady: Boolean(pageReadyPayload),
                fetchPatched: pageReadyPayload?.fetchPatched,
                xhrPatched: pageReadyPayload?.xhrPatched,
                requestSeen: requestSeen ?? null,
                captureProgress: captureProgress ?? null
            }
        };
    }

    async function handleGetTabCapture (message: GetTabCaptureMessage): Promise<CaptureStateResponse> {
        const feature = findFeatureById(message.captureType);

        if (!feature) {
            return { ok: false, capture: null, error: `未支持的数据类型：${message.captureType}` };
        }

        const result = await buildFeatureState(feature, message.tabId);
        return result.state;
    }

    // 一次性返回当前 tab 下所有数据类型的捕获状态，供 Popup 自动匹配与下拉展示。
    async function handleGetAllTabCapture (message: GetAllTabCaptureMessage): Promise<GetAllTabCaptureResponse> {
        const features = await Promise.all(FEATURES.map(feature => buildFeatureState(feature, message.tabId)));

        return { ok: true, features };
    }
});
