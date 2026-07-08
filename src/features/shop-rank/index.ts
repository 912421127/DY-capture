import type { Capture, CaptureType, JsonRecord } from '../../shared/types';
import { parseCompassShopRankRecords, isShopRankUrl } from './parse';
import { extractPageResult, buildPageUrls, mergeMultiPageResponses } from './pagination';

// 一种可捕获的数据类型（feature）需要向核心提供的全部能力。
// 新增数据类型时，照着这个结构写一个 feature 对象即可，核心逻辑不用改。
export interface CaptureFeature {
    // 数据类型标识，用于消息与存储区分（如 'shop_rank'）。
    id: CaptureType;
    // 给用户看的中文名称，用于 Popup 提示文案。
    displayName: string;
    // 接口路径，page 脚本用它判断是否拦截请求。
    apiPath: string;
    // 判断某个请求 URL 是否属于本数据类型。
    matchUrl: (url: string) => boolean;
    // 该数据类型所属域名（用于 content script 的注入范围与 Popup 的域名校验）。
    hosts: string[];
    // 判断某个「页面地址」是否属于本数据类型，Popup 据此自动匹配提取组件。
    matchPageUrl: (url: string) => boolean;
    // 把原始响应解析成 CSV 行（映射 + 格式化）。
    parse: (rawResponse: unknown) => JsonRecord[] | null;
    // 根据捕获生成下载文件名。
    getFileName: (capture: Capture) => string;
    // 从原始响应提取分页信息。
    extractPageResult: (rawResponse: unknown) => { pageNo: number; pageSize: number; total: number } | null;
    // 生成剩余页 URL。
    buildPageUrls: (firstPageUrl: string, totalPages: number) => string[];
    // 合并多页响应。
    mergePages: (responses: unknown[]) => unknown;
}

// 店铺榜单所属域名，用于 content script 的注入范围与 Popup 的域名校验。
const SHOP_RANK_HOSTS = ['compass.jinritemai.com'];

// 按页面地址粗匹配：当前只有一个 feature，先按整个罗盘域名匹配；
// 后续新增页面时再细化成具体的页面路径规则。
function matchShopRankPage(url: string): boolean {
    try {
        return SHOP_RANK_HOSTS.includes(new URL(url).hostname);
    } catch {
        return false;
    }
}

// 店铺榜单数据类型：把专属逻辑收敛到本模块，核心只认 CaptureFeature 接口。
export const shopRankFeature: CaptureFeature = {
    id: 'shop_rank',
    displayName: '罗盘店铺榜单',
    apiPath: '/compass_api/shop/mall/market/shop_rank',
    matchUrl: isShopRankUrl,
    hosts: SHOP_RANK_HOSTS,
    matchPageUrl: matchShopRankPage,
    parse: parseCompassShopRankRecords,
    getFileName: getShopRankFileName,
    extractPageResult,
    buildPageUrls,
    mergePages: mergeMultiPageResponses
};

// 文件名形如「罗盘店铺榜单-page-3-2026-07-08T09-00-00.csv」。
function getShopRankFileName (capture: Capture): string {
    const pageText = capture.pageNo ? `page-${capture.pageNo}` : 'page-current';
    const timeText = capture.capturedAt.replace(/[:.]/g, '-');

    return `罗盘店铺榜单-${pageText}-${timeText}.csv`;
}
