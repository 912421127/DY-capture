import {
    buildPageUrls as buildSharedPageUrls,
    extractPageResultAtPath,
    mergePageResponses
} from '../../shared/pagination';
import { getProductHotSaleRows } from './parse';
import type { ProductHotSalePageResult } from './types';

export function extractPageResult(rawResponse: unknown): ProductHotSalePageResult | null {
    return extractPageResultAtPath(rawResponse, ['data', 'page_result']);
}

export function buildPageUrls(firstPageUrl: string, totalPages: number): string[] {
    return buildSharedPageUrls(firstPageUrl, totalPages);
}

// 商品热销榜只声明自身列表所在位置，避免复制通用的分页循环和合并逻辑。
export function mergeMultiPageResponses(responses: unknown[]): unknown {
    return mergePageResponses({
        responses,
        getRows: getProductHotSaleRows,
        targetPath: ['data'],
        targetField: 'data_result'
    });
}
