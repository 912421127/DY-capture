import { computed, onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import { FEATURES, findFeatureByPageUrl } from '../../src/features';
import {
    GET_ALL_TAB_CAPTURE,
    GET_AUTO_EXPORT_STATE,
    GET_TAB_CAPTURE,
    OPEN_AUTO_EXPORT_PAGES,
    RUN_AUTO_EXPORT_ONCE,
    SET_AUTO_EXPORT_SETTINGS,
    type AutoExportStateResponse,
    type GetAllTabCaptureResponse,
    type OpenAutoExportPagesResponse,
    type RunAutoExportOnceResponse
} from '../../src/shared/protocol';
import type { AutoExportStatus } from '../../src/shared/autoExport';
import type { Capture, CaptureStateResponse, RequestSeen } from '../../src/shared/types';
import { runCaptureExportJob } from '../../src/shared/exportJob';
import { fetchPageResponseForExport } from './fetchAllPagesForExport';

type NoticeType = 'success' | 'info' | 'warning' | 'error';

// 通用内容脚本产物路径，覆盖所有 feature。
const PAGE_SCRIPT_FILE = '/content-scripts/capture.js';

export function useCapturePopup() {
    const selectedFeatureId = ref<string>(FEATURES[0].id);
    const selectedFeature = computed(() => FEATURES.find(f => f.id === selectedFeatureId.value) ?? FEATURES[0]);
    const featureOptions = computed(() => FEATURES.map(f => ({ label: f.displayName, value: f.id })));
    const dataTypeName = computed(() => selectedFeature.value.displayName);

    const loading = ref(false);
    const exporting = ref(false);
    const capture = ref<Capture | null>(null);
    const noticeType = ref<NoticeType>('info');
    const noticeMessage = ref(`请先打开 ${dataTypeName.value} 页面，并刷新页面触发接口请求。`);
    const lastResponse = ref<CaptureStateResponse | null>(null);
    const showDebug = ref(false);
    const exportCurrentPage = ref(0);
    const exportTotalPages = ref(0);
    const exportDone = ref(false);
    const autoExportEnabled = ref(false);
    const autoExportLoading = ref(false);
    const openingAutoExportPages = ref(false);
    const testingAutoExport = ref(false);
    const autoExportStatus = ref<AutoExportStatus | null>(null);

    const canDownload = computed(() => Boolean(capture.value?.url || lastResponse.value?.requestSeen?.url));
    const requestCapturedText = computed(() => canDownload.value ? '已捕获' : '未捕获');
    const csvReadyText = computed(() => canDownload.value ? '可导出 CSV' : '请先触发页面请求');
    const exportProgressText = computed(() => {
        if (exporting.value && exportTotalPages.value > 0) {
            return `${exportCurrentPage.value}/${exportTotalPages.value}`;
        }

        if (exportDone.value) {
            return '导出完成';
        }

        return '未开始';
    });
    const requestSeenText = computed(() => formatRequestSeen(lastResponse.value?.requestSeen ?? null));
    const autoExportStatusText = computed(() => formatAutoExportStatus(autoExportStatus.value));
    const nextAutoExportText = computed(() => formatDateTime(autoExportStatus.value?.nextRunAt ?? null));
    // 只有全部采集页面都准备成功，才进入自动导出面板；部分失败时继续停留在打开入口。
    const hasOpenedAutoExportPages = computed(() => autoExportStatus.value?.pagesReady === true);
    const autoExportPageText = computed(() => formatAutoExportPages(autoExportStatus.value));
    const autoExportResultText = computed(() => formatAutoExportResults(autoExportStatus.value));

    onMounted(async () => {
        await loadAutoExportState();
    });

    function onFeatureChange() {
        capture.value = null;
        lastResponse.value = null;
        resetExportProgress();
        if (autoExportEnabled.value) {
            void saveAutoExportSettings(true);
        }
        void loadLatestCapture();
    }

    async function autoSelectFeature() {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        const matchedByPage = tab?.url ? findFeatureByPageUrl(tab.url) : undefined;

        if (matchedByPage) {
            selectedFeatureId.value = matchedByPage.id;
            return;
        }

        if (tab?.id) {
            const all = await requestAllCapture(tab.id);
            const hit = all.features.find(f => f.state.hasRawCapture);

            if (hit) {
                selectedFeatureId.value = hit.id;
                return;
            }
        }

        selectedFeatureId.value = FEATURES[0].id;
    }

    async function loadLatestCapture() {
        loading.value = true;

        try {
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

            if (!tab?.id) {
                throw new Error('没有找到当前活动标签页。');
            }

            const tabId = tab.id;

            assertFeatureTab(tab.url);

            const response = await requestLatestCapture(tabId);
            lastResponse.value = response;

            if (response.hasRawCapture) {
                capture.value = response.capture;
                updateNoticeByResponse(response);
                return;
            }

            capture.value = null;

            if (!response.bridgeReady) {
                const frameCount = await ensureCaptureScriptsInjected(tab.id);
                noticeType.value = 'info';
                noticeMessage.value = `已注入 ${frameCount} 个 frame，请刷新 ${dataTypeName.value} 页面或点击页面筛选触发接口后，再点刷新捕获。`;
                return;
            }

            if (!response.pageReady) {
                noticeType.value = 'warning';
                noticeMessage.value = '采集 bridge 已就绪，但页面 patch 脚本未上报。可能是 MAIN world 注入失败，请刷新页面后再试。';
                return;
            }

            if (response.fetchPatched === false) {
                noticeType.value = 'warning';
                noticeMessage.value = '页面 fetch 未成功 patch（可能被框架覆盖）。已尝试在 DOMContentLoaded 重打补丁，请刷新页面后再点刷新捕获。';
                return;
            }

            if (response.requestSeen) {
                noticeType.value = 'info';
                noticeMessage.value = '已捕获接口请求，可以导出 CSV。';
                return;
            }

            noticeType.value = 'info';
            noticeMessage.value = '未捕获到接口请求，请刷新页面或点击筛选。';
        } catch (error) {
            capture.value = null;
            noticeType.value = 'warning';
            noticeMessage.value = getFriendlyErrorMessage(error);
        } finally {
            loading.value = false;
        }
    }

    function assertFeatureTab(url: string | undefined) {
        if (!url) {
            throw new Error('当前标签页地址不可读，请切到对应页面后再试。');
        }

        const host = new URL(url).hostname;

        if (!selectedFeature.value.hosts.includes(host)) {
            throw new Error(`请先切到 ${selectedFeature.value.hosts.join('/')} 的${dataTypeName.value}页面，再点击刷新捕获。`);
        }
    }

    async function requestLatestCapture(tabId: number): Promise<CaptureStateResponse> {
        const response = (await browser.runtime.sendMessage({
            type: GET_TAB_CAPTURE,
            tabId,
            captureType: selectedFeature.value.id
        })) as CaptureStateResponse | undefined;

        if (!response?.ok) {
            throw new Error(response?.error || '当前页面还没有准备好。');
        }

        return response;
    }

    async function requestAllCapture(tabId: number): Promise<GetAllTabCaptureResponse> {
        const response = (await browser.runtime.sendMessage({
            type: GET_ALL_TAB_CAPTURE,
            tabId
        })) as GetAllTabCaptureResponse | undefined;

        if (!response?.ok) {
            return { ok: false, features: [] };
        }

        return response;
    }

    async function ensureCaptureScriptsInjected(tabId: number): Promise<number> {
        // 接口请求由页面自己的 JS 发起，只有 MAIN world 才能 patch 到页面真实的 fetch/XHR。
        const results = await browser.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: [PAGE_SCRIPT_FILE],
            world: 'MAIN'
        });

        return results.length;
    }

    function updateNoticeByResponse(response: CaptureStateResponse) {
        if (response.hasRawCapture && response.error) {
            noticeType.value = 'error';
            noticeMessage.value = response.error;
            return;
        }

        updateNoticeByCapture(response.capture);
    }

    function updateNoticeByCapture(nextCapture: Capture | null) {
        if (!nextCapture) {
            noticeType.value = 'info';
            noticeMessage.value = '采集脚本已加载，但还没有捕获到接口响应。请刷新页面或点击页面筛选按钮触发接口后，再点刷新捕获。';
            return;
        }

        if (nextCapture.records.length === 0) {
            noticeType.value = 'warning';
            noticeMessage.value = '已捕获到接口响应，但没有从响应里解析出列表数据。';
            return;
        }

        noticeType.value = 'success';
        noticeMessage.value = `已捕获当前页 ${nextCapture.records.length} 条记录，可以下载 CSV。`;
    }

    // 点击“下载 CSV”后的主流程：
    // 1. 读取 background 保存的最近一次接口 URL；
    // 2. 在罗盘页面里从第 1 页开始逐页请求；
    // 3. 每完成一页就更新 1/10、2/10 这样的进度；
    // 4. 把所有页的原始响应合并，再交给 feature 解析成 CSV 行。
    async function downloadCsv() {
        if (exporting.value) {
            return;
        }

        exporting.value = true;
        resetExportProgress();

        try {
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

            if (!tab?.id) {
                throw new Error('没有找到当前活动标签页。');
            }

            const tabId = tab.id;

            assertFeatureTab(tab.url);

            const response = await requestLatestCapture(tabId);
            lastResponse.value = response;

            if (response.capture) {
                capture.value = response.capture;
            }

            const seedUrl = response.capture?.url || response.requestSeen?.url || capture.value?.url || lastResponse.value?.requestSeen?.url;

            if (!seedUrl) {
                throw new Error(`还没有获取到${dataTypeName.value}接口参数。请刷新页面或点击页面筛选触发接口后再导出。`);
            }

            noticeType.value = 'info';
            noticeMessage.value = '正在导出 CSV，请稍等...';

            const result = await runCaptureExportJob({
                feature: selectedFeature.value,
                seedUrl,
                fetchPage: url => fetchPageResponseForExport(tabId, url),
                onProgress: updateExportProgress
            });

            capture.value = result.capture;
            downloadCaptureCsv(result.csvContent, result.fileName);
            exportDone.value = true;
            noticeType.value = 'success';
            noticeMessage.value = `导出完成，共 ${result.capture.records.length} 条记录。`;
        } catch (error) {
            noticeType.value = 'warning';
            noticeMessage.value = getFriendlyErrorMessage(error);
        } finally {
            exporting.value = false;
        }
    }

    function resetExportProgress() {
        exportCurrentPage.value = 0;
        exportTotalPages.value = 0;
        exportDone.value = false;
    }

    function updateExportProgress(currentPage: number, totalPages: number) {
        exportCurrentPage.value = currentPage;
        exportTotalPages.value = totalPages;
        noticeMessage.value = `正在导出 CSV：第 ${currentPage}/${totalPages} 页。`;
    }

    function downloadCaptureCsv(csvContent: string, fileName: string) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = downloadUrl;
        link.download = fileName;
        link.click();

        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    }

    async function loadAutoExportState() {
        const response = (await browser.runtime.sendMessage({
            type: GET_AUTO_EXPORT_STATE
        })) as AutoExportStateResponse | undefined;

        if (!response?.ok) {
            return;
        }

        autoExportEnabled.value = response.settings.enabled;
        autoExportStatus.value = response.status;
    }

    async function onAutoExportChange(checked: boolean) {
        await saveAutoExportSettings(checked);
    }

    async function saveAutoExportSettings(enabled: boolean) {
        autoExportLoading.value = true;

        try {
            const response = (await browser.runtime.sendMessage({
                type: SET_AUTO_EXPORT_SETTINGS,
                settings: {
                    enabled
                }
            })) as AutoExportStateResponse | undefined;

            if (!response?.ok) {
                throw new Error(response?.error || '保存自动导出设置失败。');
            }

            autoExportEnabled.value = response.settings.enabled;
            autoExportStatus.value = response.status;
            noticeType.value = 'success';
            noticeMessage.value = response.settings.enabled ? '自动导出已开启，每 1 小时执行一次。' : '自动导出已关闭。';
        } catch (error) {
            autoExportEnabled.value = !enabled;
            noticeType.value = 'warning';
            noticeMessage.value = getFriendlyErrorMessage(error);
        } finally {
            autoExportLoading.value = false;
        }
    }

    async function openAutoExportPages() {
        if (openingAutoExportPages.value) {
            return;
        }

        openingAutoExportPages.value = true;

        try {
            noticeType.value = 'info';
            noticeMessage.value = '正在打开采集页面，请稍等...';

            const response = (await browser.runtime.sendMessage({
                type: OPEN_AUTO_EXPORT_PAGES
            })) as OpenAutoExportPagesResponse | undefined;

            if (!response) {
                throw new Error('后台没有返回打开页面结果。');
            }

            autoExportStatus.value = response.status;

            if (!response.ok) {
                throw new Error(response.error || '部分采集页面打开失败。');
            }

            noticeType.value = 'success';
            // noticeMessage.value = '采集页面已打开，可以开启自动导出或点击手动导出。';
            noticeMessage.value = '采集页面已打开，可以点击手动导出。';
        } catch (error) {
            noticeType.value = 'warning';
            noticeMessage.value = getFriendlyErrorMessage(error);
        } finally {
            openingAutoExportPages.value = false;
        }
    }

    async function testAutoExport() {
        if (testingAutoExport.value) {
            return;
        }

        testingAutoExport.value = true;

        try {
            noticeType.value = 'info';
            noticeMessage.value = '正在手动导出，请稍等...';

            const response = (await browser.runtime.sendMessage({
                type: RUN_AUTO_EXPORT_ONCE
            })) as RunAutoExportOnceResponse | undefined;

            if (!response) {
                throw new Error('后台没有返回手动导出结果。');
            }

            autoExportStatus.value = response.status;

            if (!response.ok) {
                throw new Error(response.error || '手动导出失败。');
            }

            noticeType.value = 'success';
            noticeMessage.value = '手动导出完成，CSV 已开始下载。';
        } catch (error) {
            noticeType.value = 'warning';
            noticeMessage.value = getFriendlyErrorMessage(error);
        } finally {
            testingAutoExport.value = false;
        }
    }

    function getFriendlyErrorMessage(error: unknown): string {
        const message = error instanceof Error ? error.message : String(error);

        return message || '读取当前页数据失败，请刷新页面后重试。';
    }

    function formatBool(value: boolean | undefined): string {
        if (value === undefined) {
            return '-';
        }

        return value ? '是' : '否';
    }

    function formatRequestSeen(value: RequestSeen | null): string {
        if (!value) {
            return '无';
        }

        const time = new Date(value.at).toLocaleTimeString('zh-CN');
        return `${time}（${value.url}）`;
    }

    function formatAutoExportStatus(status: AutoExportStatus | null): string {
        if (!status) {
            return '未开启';
        }

        if (status.running) {
            return '正在导出';
        }

        if (status.lastError) {
            return `失败：${status.lastError}`;
        }

        if (status.lastSuccessAt) {
            return `成功：${formatDateTime(status.lastSuccessAt)}`;
        }

        return autoExportEnabled.value ? '等待首次执行' : '未开启';
    }

    function formatAutoExportPages(status: AutoExportStatus | null): string {
        if (!status?.pageResults.length) {
            return '尚未打开';
        }

        const readyCount = status.pageResults.filter(result => result.ok).length;

        return `已准备 ${readyCount}/${status.pageResults.length} 个页面`;
    }

    function formatAutoExportResults(status: AutoExportStatus | null): string {
        if (!status?.featureResults.length) {
            return '尚未测试';
        }

        const successCount = status.featureResults.filter(result => result.ok).length;
        const failedResults = status.featureResults.filter(result => !result.ok);

        if (failedResults.length === 0) {
            return `成功 ${successCount}/${status.featureResults.length} 个`;
        }

        return `成功 ${successCount}/${status.featureResults.length} 个；${failedResults.map(result => `${result.displayName}失败`).join('、')}`;
    }

    function formatDateTime(value: string | null): string {
        if (!value) {
            return '-';
        }

        return new Date(value).toLocaleString('zh-CN');
    }

    return {
        selectedFeatureId,
        featureOptions,
        dataTypeName,
        loading,
        exporting,
        capture,
        noticeType,
        noticeMessage,
        lastResponse,
        showDebug,
        canDownload,
        exportProgressText,
        requestCapturedText,
        csvReadyText,
        requestSeenText,
        autoExportEnabled,
        autoExportLoading,
        openingAutoExportPages,
        testingAutoExport,
        hasOpenedAutoExportPages,
        autoExportPageText,
        autoExportResultText,
        autoExportStatusText,
        nextAutoExportText,
        loadLatestCapture,
        downloadCsv,
        openAutoExportPages,
        onAutoExportChange,
        testAutoExport,
        onFeatureChange,
        formatBool
    };
}
