import type { Capture } from '../../shared/types';
import { formatBeijingDateTime } from '../../shared/format';
import type { CaptureFeature } from '../types';
import { parseCompassShopRankRecords, isShopRankUrl } from './parse';
import { extractPageResult, buildPageUrls, mergeMultiPageResponses } from './pagination';

// 店铺榜单所属域名，用于 content script 的注入范围与 Popup 的域名校验。
const SHOP_RANK_HOSTS = ['compass.jinritemai.com'];

// 店铺榜单页面路径，避免商品热销榜页面误选中店铺榜单。
function matchShopRankPage(url: string): boolean {
    try {
        const parsedUrl = new URL(url);

        return SHOP_RANK_HOSTS.includes(parsedUrl.hostname) && parsedUrl.pathname === '/shop/chance/rank-shop';
    } catch {
        return false;
    }
}

// 店铺榜单数据类型：把专属逻辑收敛到本模块，核心只认 CaptureFeature 接口。
export const shopRankFeature: CaptureFeature = {
    id: 'shop_rank',
    displayName: '罗盘店铺榜单',
    matchUrl: isShopRankUrl,
    hosts: SHOP_RANK_HOSTS,
    autoOpenUrl: 'https://compass.jinritemai.com/shop/chance/rank-shop',
    matchPageUrl: matchShopRankPage,
    fixedQueryParams: { query_condition: 'ZIPPO' },
    parse: parseCompassShopRankRecords,
    getFileName: getShopRankFileName,
    extractPageResult,
    buildPageUrls,
    mergePages: mergeMultiPageResponses
};

// 文件名使用北京时间，避免后台静默导出时受浏览器或系统时区影响。
function getShopRankFileName (capture: Capture): string {
    const pageText = capture.pageNo ? `page-${capture.pageNo}` : 'page-current';
    const timeText = formatBeijingDateTime(capture.capturedAt).replace(/:/g, '-');

    return `罗盘店铺榜单-${pageText}-${timeText}.csv`;
}
