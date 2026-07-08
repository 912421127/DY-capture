import { getPath, isPlainObject } from '../../shared/parse';
import { getCompassShopRankRows } from './parse';
import type { ShopRankPageResult } from './types';

/**
 * 从 shop_rank 原始响应中提取分页信息。
 * 罗盘响应结构为 data.module_data.search_shop_rank.compass_general_table_value.page_result。
 * 如果路径不存在或字段不是有效数字，返回 null。
 */
export function extractPageResult (rawResponse: unknown): ShopRankPageResult | null {
    const pageResult = getPath(rawResponse, ['data', 'module_data', 'search_shop_rank', 'compass_general_table_value', 'page_result']);

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
 * 只修改 URL 中 page_no 查询参数，其余参数保持不变。
 * 因为 query_condition=ZIPPO 会先写到第一页 URL 里，所以这里生成第 2 页、第 3 页时会自动带上它。
 */
export function buildPageUrls (firstPageUrl: string, totalPages: number): string[] {
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
 * 深拷贝第一页的整体响应结构，然后把各页 compass_general_table_value.data 的行拼接在一起。
 * 合并后的响应结构与单页响应完全一致，现有的解析逻辑无需改动。
 * 这样做的好处是：解析 CSV 的代码不用关心“单页还是多页”，它只处理一份看起来像第一页的响应。
 */
export function mergeMultiPageResponses (responses: unknown[]): unknown {
    if (responses.length === 0) {
        return null;
    }

    // 深拷贝第一页作为底座，后续页的数据行追加到其 data 数组中。
    const base = JSON.parse(JSON.stringify(responses[0]));

    // 所有页的数据行都收集到这里，然后一次性写回底座。
    const allRows: unknown[] = [];

    for (const response of responses) {
        const rows = getCompassShopRankRows(response);

        if (rows) {
            allRows.push(...rows);
        }
    }

    if (allRows.length === 0) {
        return base;
    }

    // 把合并后的数据行写回底座中的 compass_general_table_value.data。
    const table = getPath(base, ['data', 'module_data', 'search_shop_rank', 'compass_general_table_value']);

    if (isPlainObject(table) && Array.isArray(table.data)) {
        table.data = allRows;
    }

    return base;
}
