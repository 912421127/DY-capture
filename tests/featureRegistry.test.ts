import assert from 'node:assert/strict';
import {
    FEATURES,
    findFeatureById,
    findFeatureByPageUrl,
    findFeatureByApiUrl,
    getContentScriptMatches,
    getHostPermissions
} from '../src/features';
import { shopRankFeature } from '../src/features/shop-rank';

// 注册表应至少包含店铺榜单这一个 feature。
assert.ok(FEATURES.includes(shopRankFeature));

// 按 id 查找。
assert.equal(findFeatureById('shop_rank'), shopRankFeature);
assert.equal(findFeatureById('not_exist'), undefined);

// 按 API 请求 URL 匹配（页面 fetch/XHR 拦截用）。
const apiUrl = 'https://compass.jinritemai.com/compass_api/shop/mall/market/shop_rank?page_no=1';
assert.equal(findFeatureByApiUrl(apiUrl), shopRankFeature);
assert.equal(findFeatureByApiUrl('https://other.com/api'), undefined);

// 按页面地址匹配（Popup 自动匹配用）：罗盘域名内任意路径都应命中。
assert.equal(findFeatureByPageUrl('https://compass.jinritemai.com/any/path'), shopRankFeature);
assert.equal(findFeatureByPageUrl('http://other.com'), undefined);

// 由 hosts 推导的 content script 注入范围与 manifest host_permissions 应一致。
assert.deepEqual(getContentScriptMatches(), ['https://compass.jinritemai.com/*']);
assert.deepEqual(getHostPermissions(), ['https://compass.jinritemai.com/*']);

console.log('feature registry ok');
