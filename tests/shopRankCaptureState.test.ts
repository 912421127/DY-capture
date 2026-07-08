import assert from 'node:assert/strict';
import { buildShopRankCaptureState } from '../src/shared/shopRank';

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

const state = buildShopRankCaptureState(rawCapture);

assert.equal(state.hasRawCapture, true);
assert.equal(state.capture, null);
assert.match(state.error ?? '', /解析店铺榜单响应失败/);

console.log('shop rank capture state ok');
