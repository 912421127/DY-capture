import type { Capture } from '../../shared/types';
import { formatBeijingDateTime } from '../../shared/format';
import type { CaptureFeature } from '../types';
import { buildPageUrls, extractPageResult, mergeMultiPageResponses } from './pagination';
import { isProductHotSaleRankUrl, parseCompassProductHotSaleRankRecords } from './parse';

// 商品热销榜所属域名，用于 content script 注入范围与 Popup 域名校验。
const PRODUCT_HOT_SALE_RANK_HOSTS = ['compass.jinritemai.com'];

// 商品热销榜页面路径，Popup 据此自动选择当前 feature。
function matchProductHotSaleRankPage(url: string): boolean {
    try {
        return new URL(url).pathname === '/shop/chance/rank-product';
    } catch {
        return false;
    }
}

// 商品热销榜数据类型：接口结构独立于店铺榜单，所以单独注册一个 feature。
export const productHotSaleRankFeature: CaptureFeature = {
    id: 'product_hot_sale_rank',
    displayName: '罗盘商品热销榜',
    matchUrl: isProductHotSaleRankUrl,
    hosts: PRODUCT_HOT_SALE_RANK_HOSTS,
    autoOpenUrl: 'https://compass.jinritemai.com/shop/chance/rank-product',
    matchPageUrl: matchProductHotSaleRankPage,
    parse: parseCompassProductHotSaleRankRecords,
    getFileName: getProductHotSaleRankFileName,
    extractPageResult,
    buildPageUrls,
    mergePages: mergeMultiPageResponses
};

// 文件名使用北京时间，避免后台静默导出时受浏览器或系统时区影响。
function getProductHotSaleRankFileName(capture: Capture): string {
    const pageText = capture.pageNo ? `page-${capture.pageNo}` : 'page-current';
    const timeText = formatBeijingDateTime(capture.capturedAt).replace(/:/g, '-');

    return `罗盘商品热销榜-${pageText}-${timeText}.csv`;
}
