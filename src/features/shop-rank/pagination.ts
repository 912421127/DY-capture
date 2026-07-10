import {
    buildPageUrls as buildSharedPageUrls,
    extractPageResultAtPath,
    mergePageResponses
} from '../../shared/pagination';
import { getCompassShopRankRows } from './parse';
import type { ShopRankPageResult } from './types';

export function extractPageResult (rawResponse: unknown): ShopRankPageResult | null {
    return extractPageResultAtPath(rawResponse, [
        'data',
        'module_data',
        'search_shop_rank',
        'compass_general_table_value',
        'page_result'
    ]);
}

export function buildPageUrls (firstPageUrl: string, totalPages: number): string[] {
    return buildSharedPageUrls(firstPageUrl, totalPages);
}

// 店铺榜单只保留接口专属的行读取位置，分页合并交给通用工具处理。
export function mergeMultiPageResponses (responses: unknown[]): unknown {
    return mergePageResponses({
        responses,
        getRows: getCompassShopRankRows,
        targetPath: ['data', 'module_data', 'search_shop_rank', 'compass_general_table_value'],
        targetField: 'data'
    });
}
