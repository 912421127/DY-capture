import type { CaptureFeature } from '../features';
import { createCsvContent } from './csv';
import { formatBeijingDateTime } from './format';
import { buildCaptureState } from './state';
import type { Capture, JsonRecord, RawCapture } from './types';

export interface CaptureExportJobOptions {
    feature: CaptureFeature;
    seedUrl: string;
    fetchPage: (url: string) => Promise<unknown>;
    now?: () => Date;
    sleep?: (ms: number) => Promise<void>;
    onProgress?: (currentPage: number, totalPages: number) => void;
}

export interface CaptureExportJobResult {
    capture: Capture;
    csvContent: string;
    fileName: string;
}

export async function runCaptureExportJob(options: CaptureExportJobOptions): Promise<CaptureExportJobResult> {
    const firstPageUrl = buildFirstPageUrl(options.seedUrl);
    const firstPageResponse = await options.fetchPage(firstPageUrl);

    if (firstPageResponse === undefined || firstPageResponse === null) {
        throw new Error('接口没有返回有效分页数据，请刷新罗盘页面后重试。');
    }

    const allResponses: unknown[] = [firstPageResponse];
    const pageResult = options.feature.extractPageResult(firstPageResponse);
    const totalPages = pageResult && pageResult.total > pageResult.pageSize
        ? Math.ceil(pageResult.total / pageResult.pageSize)
        : 1;

    options.onProgress?.(1, totalPages);

    if (totalPages > 1) {
        const remainingUrls = options.feature.buildPageUrls(firstPageUrl, totalPages);

        for (let index = 0; index < remainingUrls.length; index += 1) {
            // 罗盘接口连续请求过快时容易失败，保留原手动导出的轻量等待。
            await (options.sleep ?? sleep)(500);
            allResponses.push(await options.fetchPage(remainingUrls[index]));
            options.onProgress?.(index + 2, totalPages);
        }
    }

    const capturedAt = (options.now ?? (() => new Date()))().toISOString();
    const rawCapture: RawCapture = {
        url: firstPageUrl,
        capturedAt,
        rawResponse: options.feature.mergePages(allResponses)
    };
    const state = buildCaptureState(rawCapture, options.feature.parse);

    if (!state.capture || state.capture.records.length === 0) {
        throw new Error(state.error || '已获取接口响应，但没有解析出可导出的列表数据。');
    }

    return {
        capture: state.capture,
        csvContent: createCsvContent(addExportTimeToRecords(state.capture.records, state.capture.capturedAt)),
        fileName: options.feature.getFileName(state.capture)
    };
}

export function buildFirstPageUrl(seedUrl: string): string {
    const url = new URL(seedUrl);

    url.searchParams.set('page_no', '1');
    return url.toString();
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function addExportTimeToRecords(records: JsonRecord[], capturedAt: string): JsonRecord[] {
    const exportTime = formatBeijingDateTime(capturedAt);

    // 不直接修改 feature 解析出的 records，避免影响页面状态和后续复用。
    return records.map(record => ({
        导出时间: exportTime,
        ...record
    }));
}
