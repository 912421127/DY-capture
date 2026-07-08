import { shopRankFeature } from './shop-rank';
import { productHotSaleRankFeature } from './product-hot-sale-rank';
import type { CaptureFeature } from './types';

// 重新导出类型，方便 background / popup 统一从注册表入口引入。
export type { CaptureFeature } from './types';

// 统一 feature 注册表：所有可捕获的数据类型（页面 + 接口）都集中登记在这里。
// 新手可以把它理解成“功能菜单”：
// - content script 用它判断哪个接口需要捕获；
// - background 用它按数据类型保存 / 查询状态；
// - popup 用它生成下拉选项和导出文件名。
// 新增数据类型时，只需在 src/features/ 下加一个 feature 并 push 进 FEATURES，
// background / content script / popup 都从这里取，核心逻辑与 UI 都不用改。
export const FEATURES: CaptureFeature[] = [shopRankFeature, productHotSaleRankFeature];

// 按 API 请求 URL 匹配（content script 拦截、webRequest 诊断用）。
export function findFeatureByApiUrl(url: string): CaptureFeature | undefined {
    return FEATURES.find(feature => feature.matchUrl(url));
}

// 按数据类型 id 查找（Popup 查询时定位具体 feature）。
export function findFeatureById(id: string): CaptureFeature | undefined {
    return FEATURES.find(feature => feature.id === id);
}

// 按「页面地址」匹配（Popup 自动匹配提取组件用）。
export function findFeatureByPageUrl(pageUrl: string): CaptureFeature | undefined {
    return FEATURES.find(feature => feature.matchPageUrl(pageUrl));
}

// 由所有 feature 的 hosts 生成 content script 的注入范围（matches）。
export function getContentScriptMatches(): string[] {
    return uniqueValues(FEATURES.flatMap(feature => feature.hosts.map(host => `https://${host}/*`)));
}

// 生成 manifest 的 host_permissions，供 wxt.config.ts 复用，避免与注册表脱节。
export function getHostPermissions(): string[] {
    return uniqueValues(FEATURES.flatMap(feature => feature.hosts.map(host => `https://${host}/*`)));
}

function uniqueValues(values: string[]): string[] {
    // 多个 feature 可能共用同一个罗盘域名，这里去重后再写入 manifest / matches。
    return Array.from(new Set(values));
}
