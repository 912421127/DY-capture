import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCompassShopRankRecords } from '../src/features/shop-rank/parse';

const samplePath = '/Users/xyc/.codex/attachments/21d7d9da-7cda-4745-a085-fd0b11421dd2/pasted-text.txt';
const sampleResponse = JSON.parse(readFileSync(samplePath, 'utf8'));
const records = parseCompassShopRankRecords(sampleResponse);

assert.ok(records);
assert.equal(records.length, 21);

assert.deepEqual(
    {
        rank: records[0]['排名'],
        rankChange: records[0]['排名变化'],
        shopName: records[0]['店铺名称'],
        payAmount: records[0]['用户支付金额'],
        payCount: records[0]['成交订单数'],
        showUserCount: records[0]['商品曝光人数'],
        adEfficiency: records[0]['投放效率（店铺被投）'],
        unitPrice: records[0]['客单价'],
        clickUserCount: records[0]['商品点击人数'],
        payUserCount: records[0]['成交人数']
    },
    {
        rank: '48',
        rankChange: '↑13',
        shopName: 'ZIPPO同城打火机专卖店',
        payAmount: '￥20.17万',
        payCount: '3,522',
        showUserCount: '18.25万',
        adEfficiency: '6.67',
        unitPrice: '￥139.76',
        clickUserCount: '1.65万',
        payUserCount: '1,443'
    }
);

assert.deepEqual(
    {
        payAmount: records[1]['用户支付金额'],
        payCount: records[1]['成交订单数'],
        adEfficiency: records[1]['投放效率（店铺被投）'],
        unitPrice: records[1]['客单价']
    },
    {
        payAmount: '￥100万-￥250万',
        payCount: '1万-2.5万',
        adEfficiency: '3-5',
        unitPrice: '￥0-￥250'
    }
);

assert.equal(records[0]['TOP商品1名称'], 'ZIPPO/之宝打火机正版磨砂标志定制刻字专属打火机送男士走心礼物');
assert.equal(records[0]['TOP商品1ID'], '3494543199802930489');

console.log('shop rank mapping ok');
