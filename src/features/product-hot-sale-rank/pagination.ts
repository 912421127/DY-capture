import { getPath, isPlainObject } from '../../shared/parse';
import { getProductHotSaleRows } from './parse';
import type { ProductHotSalePageResult } from './types';

/**
 * 从商品热销榜原始响应中提取分页信息。
 * 罗盘响应结构为 data.page_result。
 */
export function extractPageResult(rawResponse: unknown): ProductHotSalePageResult | null {
    const pageResult = getPath(rawResponse, ['data', 'page_result']);

    if (!isPlainObject(pageResult)) {
        return null;
    }

    const pageNo = Number(pageResult.page_no);
    const pageSize = Number(pageResult.page_size);
    const total = Number(pageResult.total);

    if (!Number.isFinite(pageNo) || !Number.isFinite(pageSize) || !Number.isFinite(total)) {
        return null;
    }

    return { pageNo, pageSize, total };
}

/**
 * 根据第一页 URL 生成剩余页的 URL 列表（第 2 页到最后一页）。
 * 只修改 page_no，其它筛选参数保持页面原始请求的值。
 */
export function buildPageUrls(firstPageUrl: string, totalPages: number): string[] {
    const urls: string[] = [];

    for (let page = 2; page <= totalPages; page += 1) {
        const url = new URL(firstPageUrl);
        url.searchParams.set('page_no', String(page));
        urls.push(url.toString());
    }

    return urls;
}

/**
 * 合并多个分页的 rawResponse 为单个 rawResponse。
 * 深拷贝第一页作为底座，再把各页 data.data_result 追加到一起。
 */
export function mergeMultiPageResponses(responses: unknown[]): unknown {
    if (responses.length === 0) {
        return null;
    }

    const base = JSON.parse(JSON.stringify(responses[0]));
    const allRows: unknown[] = [];

    for (const response of responses) {
        const rows = getProductHotSaleRows(response);

        if (rows) {
            allRows.push(...rows);
        }
    }

    if (allRows.length === 0) {
        return base;
    }

    const data = getPath(base, ['data']);

    if (isPlainObject(data) && Array.isArray(data.data_result)) {
        data.data_result = allRows;
    }

    return base;
}
