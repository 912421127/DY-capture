import { browser } from 'wxt/browser';
import {
    type FeatureCaptureState,
    type GetAllTabCaptureMessage,
    type GetAllTabCaptureResponse,
    type GetTabCaptureMessage,
    isBridgeReady,
    isGetAllTabCapture,
    isGetTabCapture,
    isPageReady,
    isReportCapture
} from '../src/shared/protocol';
import { buildCaptureState } from '../src/shared/state';
import type { CaptureStateResponse, RequestSeen } from '../src/shared/types';
import { createCaptureStore } from '../src/shared/captureStore';
import { FEATURES, findFeatureByApiUrl, findFeatureById, type CaptureFeature } from '../src/features';

// background 是扩展的“中转站”：
// 1. 接收 content script 上报的当前页接口响应；
// 2. 记录 webRequest 看到的最近一次目标接口 URL；
// 3. popup 打开时，把这些状态按 tabId 返回给 UI。
// 注意：分页请求和 CSV 导出已经放到 popup 点击“下载 CSV”时执行，这里不再后台自动拉全量数据。
export default defineBackground(() => {
    const store = createCaptureStore(browser.storage.session);
    const captureTypes = FEATURES.map(feature => feature.id);

    browser.runtime.onMessage.addListener((message: unknown, sender) => {
        const tabId = sender.tab?.id;

        // 这些消息来自 content script，必须能定位到所属 tab。
        if (tabId !== undefined) {
            if (isBridgeReady(message)) {
                void store.setBridgeReady(tabId);
                return undefined;
            }

            if (isPageReady(message)) {
                void store.setPageReady(tabId, message.payload);
                return undefined;
            }

            if (isReportCapture(message)) {
                // 按数据类型分别存储，同一 tab 上多个数据类型互不覆盖。
                void store.setRawCapture(message.captureType, tabId, message.payload);
                return undefined;
            }
        }

        // Popup 查询当前 tab、指定数据类型的捕获。
        if (isGetTabCapture(message)) {
            return handleGetTabCapture(message);
        }

        // Popup 一次查询当前 tab 下所有数据类型的捕获状态。
        if (isGetAllTabCapture(message)) {
            return handleGetAllTabCapture(message);
        }

        return undefined;
    });

    // webRequest 只记录最近一次目标接口请求的 URL，不读取响应体。
    // 如果 content script 因为页面框架或 Worker 没抓到响应，popup 仍能用这个 URL 判断“接口已经出现过”。
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
            void store.setRequestSeen(details.tabId, seen);
        },
        { urls: ['https://compass.jinritemai.com/*'] }
    );

    // 标签页关闭时清理对应缓存，避免 storage.session 堆积无用数据。
    browser.tabs.onRemoved.addListener(tabId => {
        void store.clearTab(captureTypes, tabId);
    });

    // 顶层 frame 重新加载或跳转时，旧捕获已失效，先清掉再等 bridge 重新上报。
    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === 'loading') {
            void store.clearTab(captureTypes, tabId);
        }
    });

    async function buildFeatureState(feature: CaptureFeature, tabId: number): Promise<FeatureCaptureState> {
        const entry = await store.getFeatureEntry(feature.id, tabId);
        const state = buildCaptureState(entry.rawCapture ?? null, feature.parse);

        return {
            id: feature.id,
            displayName: feature.displayName,
            state: {
                ...state,
                bridgeReady: entry.bridgeReady,
                pageReady: Boolean(entry.pageReadyPayload),
                fetchPatched: entry.pageReadyPayload?.fetchPatched,
                xhrPatched: entry.pageReadyPayload?.xhrPatched,
                requestSeen: entry.requestSeen ?? null
            }
        };
    }

    async function handleGetTabCapture(message: GetTabCaptureMessage): Promise<CaptureStateResponse> {
        const feature = findFeatureById(message.captureType);

        if (!feature) {
            return { ok: false, capture: null, error: `未支持的数据类型：${message.captureType}` };
        }

        const result = await buildFeatureState(feature, message.tabId);
        return result.state;
    }

    async function handleGetAllTabCapture(message: GetAllTabCaptureMessage): Promise<GetAllTabCaptureResponse> {
        const features = await Promise.all(FEATURES.map(feature => buildFeatureState(feature, message.tabId)));

        return { ok: true, features };
    }
});
