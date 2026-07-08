import type { Capture } from '../../shared/types';
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
