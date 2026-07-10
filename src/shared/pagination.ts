import { getPath, isPlainObject } from './parse';

export interface PageResult {
    pageNo: number;
    pageSize: number;
    total: number;
}

interface MergePageResponsesOptions {
    responses: unknown[];
    getRows: (response: unknown) => unknown[] | null;
    targetPath: string[];
    targetField: string;
}

// 各接口的分页字段位置不同，路径由 feature 提供，通用层只负责校验数值。
export function extractPageResultAtPath(rawResponse: unknown, path: string[]): PageResult | null {
    const pageResult = getPath(rawResponse, path);

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

export function buildPageUrls(firstPageUrl: string, totalPages: number): string[] {
    const urls: string[] = [];

    for (let page = 2; page <= totalPages; page += 1) {
        const url = new URL(firstPageUrl);
        url.searchParams.set('page_no', String(page));
        urls.push(url.toString());
    }

    return urls;
}

// 复制首页再写入合并后的列表，避免影响缓存的单页原始响应。
export function mergePageResponses(options: MergePageResponsesOptions): unknown {
    if (options.responses.length === 0) {
        return null;
    }

    const base = JSON.parse(JSON.stringify(options.responses[0]));
    const allRows: unknown[] = [];

    for (const response of options.responses) {
        const rows = options.getRows(response);

        if (rows) {
            allRows.push(...rows);
        }
    }

    if (allRows.length === 0) {
        return base;
    }

    const target = getPath(base, options.targetPath);

    if (isPlainObject(target) && Array.isArray(target[options.targetField])) {
        target[options.targetField] = allRows;
    }

    return base;
}
