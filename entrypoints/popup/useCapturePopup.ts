import { computed, onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import { createCsvContent } from '../../src/shared/csv';
import { FEATURES, findFeatureByPageUrl } from '../../src/features';
import { GET_ALL_TAB_CAPTURE, GET_TAB_CAPTURE, type GetAllTabCaptureResponse } from '../../src/shared/protocol';
import { buildCaptureState } from '../../src/shared/state';
import type { Capture, CaptureStateResponse, RawCapture, RequestSeen } from '../../src/shared/types';
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

    onMounted(async () => {
        await autoSelectFeature();
        await loadLatestCapture();
    });

    function onFeatureChange() {
        capture.value = null;
        lastResponse.value = null;
        resetExportProgress();
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

            assertFeatureTab(tab.url);

            const response = await requestLatestCapture(tab.id);
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

            assertFeatureTab(tab.url);

            const response = await requestLatestCapture(tab.id);
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

            const firstPageUrl = buildFirstPageUrl(seedUrl);
            const firstPageResponse = await fetchPageResponseForExport(tab.id, firstPageUrl);

            if (firstPageResponse === undefined || firstPageResponse === null) {
                throw new Error('接口没有返回有效分页数据，请刷新罗盘页面后重试。');
            }

            const allResponses: unknown[] = [firstPageResponse];
            const pageResult = selectedFeature.value.extractPageResult(firstPageResponse);
            const totalPages = pageResult && pageResult.total > pageResult.pageSize
                ? Math.ceil(pageResult.total / pageResult.pageSize)
                : 1;

            updateExportProgress(1, totalPages);

            if (totalPages > 1) {
                const remainingUrls = selectedFeature.value.buildPageUrls(firstPageUrl, totalPages);

                for (let index = 0; index < remainingUrls.length; index += 1) {
                    await sleep(500);
                    allResponses.push(await fetchPageResponseForExport(tab.id, remainingUrls[index]));
                    updateExportProgress(index + 2, totalPages);
                }
            }

            const mergedResponse = selectedFeature.value.mergePages(allResponses);
            const rawCapture: RawCapture = {
                url: firstPageUrl,
                capturedAt: new Date().toISOString(),
                rawResponse: mergedResponse
            };
            const state = buildCaptureState(rawCapture, selectedFeature.value.parse);

            if (!state.capture || state.capture.records.length === 0) {
                throw new Error(state.error || '已获取接口响应，但没有解析出可导出的列表数据。');
            }

            capture.value = state.capture;
            downloadCaptureCsv(state.capture);
            exportDone.value = true;
            noticeType.value = 'success';
            noticeMessage.value = `导出完成，共 ${state.capture.records.length} 条记录。`;
        } catch (error) {
            noticeType.value = 'warning';
            noticeMessage.value = getFriendlyErrorMessage(error);
        } finally {
            exporting.value = false;
        }
    }

    function buildFirstPageUrl(seedUrl: string): string {
        const url = new URL(seedUrl);
        // 当前导出固定按 ZIPPO 关键词查询。后续如果要支持用户输入，只需要把这里的固定值改成表单值。这里先注释，暂时不需要
        // url.searchParams.set('query_condition', 'ZIPPO');
        url.searchParams.set('page_no', '1');
        return url.toString();
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

    function sleep(ms: number): Promise<void> {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }

    function downloadCaptureCsv(nextCapture: Capture) {
        const csvContent = createCsvContent(nextCapture.records);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = downloadUrl;
        link.download = selectedFeature.value.getFileName(nextCapture);
        link.click();

        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
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
        loadLatestCapture,
        downloadCsv,
        onFeatureChange,
        formatBool
    };
}
