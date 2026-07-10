import assert from 'node:assert/strict';
import { buildCaptureState } from '../src/shared/state';
import { parseCompassShopRankRecords } from '../src/features/shop-rank/parse';

const rawCapture = {
    url: 'https://compass.jinritemai.com/compass_api/shop/mall/market/shop_rank?page_no=1&page_size=20',
    capturedAt: '2026-07-07T00:00:00.000Z',
    rawResponse: {
        data: {
            module_data: {
                search_shop_rank: {
                    compass_general_table_value: {
                        data: [null]
                    }
                }
            }
        }
    }
};

// 调用通用的捕获状态构建逻辑，并传入店铺榜单的解析函数（模拟 background 按数据类型解析）。
const state = buildCaptureState(rawCapture, parseCompassShopRankRecords);

assert.equal(state.hasRawCapture, true);
assert.equal(state.capture, null);
// 解析失败时应当兜底返回错误提示，而不是让异常冒泡到 UI。
assert.match(state.error ?? '', /解析响应失败/);

console.log('shop rank capture state ok');
