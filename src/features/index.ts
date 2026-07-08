import type { CaptureFeature } from './shop-rank';
import { shopRankFeature } from './shop-rank';

// 重新导出类型，方便 background / popup 统一从注册表入口引入。
export type { CaptureFeature } from './shop-rank';

// 统一 feature 注册表：所有可捕获的数据类型（页面 + 接口）都集中登记在这里。
// 新增数据类型时，只需在 src/features/ 下加一个 feature 并 push 进 FEATURES，
// background / content script / popup 都从这里取，核心逻辑与 UI 都不用改。
export const FEATURES: CaptureFeature[] = [shopRankFeature];

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
    return FEATURES.flatMap(feature => feature.hosts.map(host => `https://${host}/*`));
}

// 生成 manifest 的 host_permissions，供 wxt.config.ts 复用，避免与注册表脱节。
export function getHostPermissions(): string[] {
    return FEATURES.flatMap(feature => feature.hosts.map(host => `https://${host}/*`));
}
