import { browser } from 'wxt/browser';
import {
    type FeatureCaptureState,
    type GetAllTabCaptureMessage,
    type GetAllTabCaptureResponse,
    type GetTabCaptureMessage,
    GET_AUTO_EXPORT_STATE,
    isBridgeReady,
    isGetAutoExportState,
    isGetAllTabCapture,
    isGetTabCapture,
    isOpenAutoExportPages,
    isPageReady,
    isReportCapture,
    isRunAutoExportOnce,
    isSetAutoExportSettings,
    type AutoExportStateResponse,
    type OpenAutoExportPagesResponse,
    type RunAutoExportOnceResponse,
    type SetAutoExportSettingsMessage
} from '../src/shared/protocol';
import { buildCaptureState } from '../src/shared/state';
import type { CaptureStateResponse, RequestSeen } from '../src/shared/types';
import { createCaptureStore } from '../src/shared/captureStore';
import { FEATURES, findFeatureByApiUrl, findFeatureById, type CaptureFeature } from '../src/features';
import {
    AUTO_EXPORT_ALARM_NAME,
    AUTO_EXPORT_INTERVAL_MINUTES,
    AUTO_EXPORT_SETTINGS_KEY,
    AUTO_EXPORT_STATUS_KEY,
    createDefaultAutoExportSettings,
    createDefaultAutoExportStatus,
    getNextAutoExportTime,
    normalizeAutoExportSettings,
    normalizeAutoExportStatus,
    type AutoExportFeatureResult,
    type AutoExportPageResult,
    type AutoExportSettings,
    type AutoExportStatus
} from '../src/shared/autoExport';
import { runCaptureExportJob } from '../src/shared/exportJob';
import { runAutoExportFeatures } from '../src/shared/multiExport';
import { fetchPageInsideCompassPage } from '../src/shared/fetchPage';

const PAGE_SCRIPT_FILE = '/content-scripts/capture.js';

// background 是扩展的“中转站”：
// 1. 接收 content script 上报的当前页接口响应；
// 2. 记录 webRequest 看到的最近一次目标接口 URL；
// 3. popup 打开时，把这些状态按 tabId 返回给 UI。
// 自动导出会在后台复用罗盘页面登录态，按注册表里的 feature 逐个导出 CSV。
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

        if (isGetAutoExportState(message)) {
            return handleGetAutoExportState();
        }

        if (isSetAutoExportSettings(message)) {
            return handleSetAutoExportSettings(message);
        }

        if (isOpenAutoExportPages(message)) {
            return handleOpenAutoExportPages();
        }

        if (isRunAutoExportOnce(message)) {
            return handleRunAutoExportOnce();
        }

        return undefined;
    });

    browser.alarms.onAlarm.addListener(alarm => {
        if (alarm.name !== AUTO_EXPORT_ALARM_NAME) {
            return;
        }

        void runScheduledAutoExport();
    });

    browser.runtime.onInstalled.addListener(() => {
        void restoreAutoExportAlarm();
    });

    browser.runtime.onStartup.addListener(() => {
        void restoreAutoExportAlarm();
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

    async function handleGetAutoExportState(): Promise<AutoExportStateResponse> {
        const settings = await getAutoExportSettings();
        const status = await getAutoExportStatus();

        return { ok: true, settings, status };
    }

    async function handleSetAutoExportSettings(message: SetAutoExportSettingsMessage): Promise<AutoExportStateResponse> {
        const settings: AutoExportSettings = {
            enabled: message.settings.enabled
        };
        const now = new Date();
        const currentStatus = await getAutoExportStatus();
        const nextRunAt = settings.enabled ? getNextAutoExportTime(now).toISOString() : null;
        const status: AutoExportStatus = {
            ...currentStatus,
            running: false,
            lastError: null,
            nextRunAt
        };

        await browser.storage.local.set({
            [AUTO_EXPORT_SETTINGS_KEY]: settings,
            [AUTO_EXPORT_STATUS_KEY]: status
        });

        if (settings.enabled) {
            await browser.alarms.create(AUTO_EXPORT_ALARM_NAME, {
                delayInMinutes: AUTO_EXPORT_INTERVAL_MINUTES,
                periodInMinutes: AUTO_EXPORT_INTERVAL_MINUTES
            });
        } else {
            await browser.alarms.clear(AUTO_EXPORT_ALARM_NAME);
        }

        return { ok: true, settings, status };
    }

    async function handleOpenAutoExportPages(): Promise<OpenAutoExportPagesResponse> {
        const status = await prepareAutoExportPages();

        return {
            ok: status.pageResults.every(result => result.ok),
            status,
            error: status.lastError ?? undefined
        };
    }

    async function handleRunAutoExportOnce(): Promise<RunAutoExportOnceResponse> {
        const status = await runAutoExportAll({ updateNextRunAt: false });

        return {
            ok: status.featureResults.some(result => result.ok),
            status,
            error: status.lastError ?? undefined
        };
    }

    async function runScheduledAutoExport(): Promise<void> {
        const settings = await getAutoExportSettings();

        if (!settings.enabled) {
            await browser.alarms.clear(AUTO_EXPORT_ALARM_NAME);
            return;
        }

        await runAutoExportAll({ updateNextRunAt: true });
    }

    async function prepareAutoExportPages(): Promise<AutoExportStatus> {
        const currentStatus = await getAutoExportStatus();
        const pageResults: AutoExportPageResult[] = [];

        for (const feature of FEATURES) {
            try {
                const tabId = await ensureAutoExportTab(feature);

                pageResults.push({
                    captureType: feature.id,
                    displayName: feature.displayName,
                    ok: true,
                    tabId,
                    error: null
                });
            } catch (error) {
                pageResults.push({
                    captureType: feature.id,
                    displayName: feature.displayName,
                    ok: false,
                    tabId: null,
                    error: getFriendlyErrorMessage(error)
                });
            }
        }

        const failedResults = pageResults.filter(result => !result.ok);

        return saveAutoExportStatus({
            ...currentStatus,
            running: false,
            pagesReady: pageResults.length > 0 && failedResults.length === 0,
            pageResults,
            lastError: failedResults.length > 0 ? buildFailedSummary(failedResults) : null
        });
    }

    async function runAutoExportAll(options: { updateNextRunAt: boolean }): Promise<AutoExportStatus> {
        const currentStatus = await getAutoExportStatus();

        if (currentStatus.running) {
            return currentStatus;
        }

        const startedAt = new Date().toISOString();
        const nextRunAt = options.updateNextRunAt ? getNextAutoExportTime().toISOString() : currentStatus.nextRunAt;

        await saveAutoExportStatus({
            ...currentStatus,
            running: true,
            lastRunAt: startedAt,
            lastError: null,
            nextRunAt
        });

        const featureResults = await runAutoExportFeatures(FEATURES, async feature => {
            const tabId = await ensureAutoExportTab(feature);
            const seedUrl = await waitForSeedUrl(feature, tabId);
            const result = await runCaptureExportJob({
                feature,
                seedUrl,
                fetchPage: url => fetchPageResponseForAutoExport(tabId, url)
            });

            await downloadCsv(result.csvContent, result.fileName);

            return result.capture.records.length;
        });
        const okResults = featureResults.filter(result => result.ok);
        const failedResults = featureResults.filter(result => !result.ok);

        return saveAutoExportStatus({
            ...currentStatus,
            running: false,
            pagesReady: true,
            featureResults,
            lastRunAt: startedAt,
            lastSuccessAt: okResults.length > 0 ? new Date().toISOString() : currentStatus.lastSuccessAt,
            lastError: failedResults.length > 0 ? buildFailedSummary(failedResults) : null,
            nextRunAt
        });
    }

    async function ensureAutoExportTab(feature: CaptureFeature): Promise<number> {
        const tabs = await browser.tabs.query({ url: feature.hosts.map(host => `https://${host}/*`) });
        const existingTab = tabs.find(tab => tab.id !== undefined && tab.url && feature.matchPageUrl(tab.url));

        if (existingTab?.id !== undefined) {
            await ensureCaptureScriptsInjected(existingTab.id);
            return existingTab.id;
        }

        const tab = await browser.tabs.create({ url: feature.autoOpenUrl, active: false });

        if (tab.id === undefined) {
            throw new Error('无法打开罗盘后台页面，请检查浏览器是否允许扩展创建标签页。');
        }

        await waitForTabComplete(tab.id);
        await ensureCaptureScriptsInjected(tab.id);
        return tab.id;
    }

    async function waitForSeedUrl(feature: CaptureFeature, tabId: number): Promise<string> {
        for (let index = 0; index < 30; index += 1) {
            const entry = await store.getFeatureEntry(feature.id, tabId);
            const seedUrl = entry.rawCapture?.url || entry.requestSeen?.url;

            if (seedUrl && feature.matchUrl(seedUrl)) {
                return seedUrl;
            }

            await sleep(1000);
        }

        throw new Error(`还没有获取到${feature.displayName}接口参数。请确认已登录罗盘，或打开对应页面触发一次筛选后再试。`);
    }

    async function ensureCaptureScriptsInjected(tabId: number): Promise<void> {
        await browser.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: [PAGE_SCRIPT_FILE],
            world: 'MAIN'
        });
    }

    async function fetchPageResponseForAutoExport(tabId: number, url: string): Promise<unknown> {
        const [result] = await browser.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: fetchPageInsideCompassPage,
            args: [url]
        });

        if (result?.result === undefined || result.result === null) {
            throw new Error('页面没有返回分页数据，请刷新罗盘页面后重试。');
        }

        return result.result;
    }

    async function waitForTabComplete(tabId: number): Promise<void> {
        const tab = await browser.tabs.get(tabId);

        if (tab.status === 'complete') {
            return;
        }

        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                browser.tabs.onUpdated.removeListener(listener);
                reject(new Error('罗盘后台页面加载超时，请稍后重试。'));
            }, 30000);

            const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
                if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
                    return;
                }

                clearTimeout(timer);
                browser.tabs.onUpdated.removeListener(listener);
                resolve();
            };

            browser.tabs.onUpdated.addListener(listener);
        });
    }

    async function downloadCsv(csvContent: string, fileName: string): Promise<void> {
        const downloadUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`;

        await browser.downloads.download({
            url: downloadUrl,
            filename: fileName,
            saveAs: false
        });
    }

    async function restoreAutoExportAlarm(): Promise<void> {
        const settings = await getAutoExportSettings();
        const status = await getAutoExportStatus();

        if (!settings.enabled) {
            await browser.alarms.clear(AUTO_EXPORT_ALARM_NAME);
            await saveAutoExportStatus({ ...status, running: false, nextRunAt: null });
            return;
        }

        const nextRunAt = getNextAutoExportTime().toISOString();

        await browser.alarms.create(AUTO_EXPORT_ALARM_NAME, {
            delayInMinutes: AUTO_EXPORT_INTERVAL_MINUTES,
            periodInMinutes: AUTO_EXPORT_INTERVAL_MINUTES
        });
        await saveAutoExportStatus({ ...status, running: false, nextRunAt });
    }

    async function getAutoExportSettings(): Promise<AutoExportSettings> {
        const data = await browser.storage.local.get([AUTO_EXPORT_SETTINGS_KEY]);

        return normalizeAutoExportSettings(data[AUTO_EXPORT_SETTINGS_KEY]);
    }

    async function getAutoExportStatus(): Promise<AutoExportStatus> {
        const data = await browser.storage.local.get([AUTO_EXPORT_STATUS_KEY]);

        return normalizeAutoExportStatus(data[AUTO_EXPORT_STATUS_KEY]);
    }

    async function saveAutoExportStatus(status: AutoExportStatus): Promise<AutoExportStatus> {
        await browser.storage.local.set({ [AUTO_EXPORT_STATUS_KEY]: status });
        return status;
    }

    function sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getFriendlyErrorMessage(error: unknown): string {
        const message = error instanceof Error ? error.message : String(error);

        return message || '自动导出失败，请打开罗盘页面检查登录状态后重试。';
    }

    function buildFailedSummary(results: Array<AutoExportPageResult | AutoExportFeatureResult>): string {
        return results.map(result => `${result.displayName}：${result.error || '失败'}`).join('；');
    }
});


