import type { JsonRecord } from '../../shared/types';
import { getPath, isPlainObject } from '../../shared/parse';
import { formatInteger, formatPlainNumber, formatCompactNumber } from '../../shared/format';
import type { CompassCell, CompassRow } from './types';

// 罗盘 shop_rank 接口路径，page 脚本用它判断是否拦截该请求。
export const SHOP_RANK_API_PATH = '/compass_api/shop/mall/market/shop_rank';

// 判断某个请求 URL 是否为店铺榜单接口。
export function isShopRankUrl (url: string): boolean {
    return url.includes(SHOP_RANK_API_PATH);
}

// 把罗盘原始响应解析成 CSV 行（带中文表头）。
export function parseCompassShopRankRecords (rawResponse: unknown): JsonRecord[] | null {
    const rows = getCompassShopRankRows(rawResponse);

    if (!rows) {
        return null;
    }

    return rows.map(row => mapCompassShopRankRow(row));
}

// 提取罗盘表格行（供解析 CSV 与合并多页响应复用）。
export function getCompassShopRankRows (rawResponse: unknown): CompassRow[] | null {
    const table = getPath(rawResponse, ['data', 'module_data', 'search_shop_rank', 'compass_general_table_value']);

    if (!isPlainObject(table) || !Array.isArray(table.data)) {
        return null;
    }

    // 只要命中了罗盘表格结构，就不静默过滤坏行；否则真实接口变形时会误报「捕获不到数据」。
    return table.data.map((row, index) => {
        if (!isPlainObject(row)) {
            throw new Error(`第 ${index + 1} 行不是有效对象`);
        }

        return row as CompassRow;
    });
}

// 把罗盘单元格的 index_values 结构格式化成展示文本：存在上下限时拼成「下限-上限」，否则取当前值。
function formatIndexCell (fieldName: string, cell: CompassCell | undefined): string {
    const indexValues = cell?.index_values;

    if (!indexValues) {
        return '';
    }

    const lower = indexValues.extra_value?.lower;
    const upper = indexValues.extra_value?.upper;

    if (lower && upper) {
        return `${formatIndexValue(fieldName, lower)}-${formatIndexValue(fieldName, upper)}`;
    }

    if (indexValues.value) {
        return formatIndexValue(fieldName, indexValues.value);
    }

    return '';
}

// 按字段把指标值格式化成金额 / 人数等展示文本（金额分→元，大数压缩）。
function formatIndexValue (fieldName: string, item: { unit?: number; value?: number }): string {
    const rawValue = item.value;

    if (rawValue === undefined) {
        return '';
    }

    if (item.unit === 3) {
        // 罗盘金额字段返回的是「分」，页面展示用「元」，所以这里先除以 100。
        const yuan = rawValue / 100;

        if (fieldName === 'pay_amt') {
            return `￥${formatCompactNumber(yuan)}`;
        }

        // 客单价虽然也是金额，但页面按普通元金额展示，不做「万」压缩。
        return `￥${formatPlainNumber(yuan, 2)}`;
    }

    if (fieldName === 'ad_efficiency') {
        return formatPlainNumber(rawValue, 2);
    }

    return formatCompactNumber(rawValue);
}

// 排名变化值格式化为带箭头的文本：上升用 ↑、下降用 ↓，无变化显示 0。
function formatRankChange (value: number | undefined): string {
    if (value === undefined) {
        return '';
    }

    if (value > 0) {
        return `↑${formatInteger(value)}`;
    }

    if (value < 0) {
        return `↓${formatInteger(Math.abs(value))}`;
    }

    return '0';
}

function mapCompassShopRankRow (row: CompassRow): JsonRecord {
    const cellInfo = row.cell_info ?? {};
    const rankValues = cellInfo.rank?.index_values;
    const shop = cellInfo.shop?.shop ?? {};
    const products = cellInfo.product_list?.product_list ?? [];

    const record: JsonRecord = {
        排名: formatInteger(rankValues?.value?.value),
        排名变化: formatRankChange(rankValues?.last_period_change?.value),
        上期排名: formatInteger(rankValues?.last_value?.value),
        店铺ID: shop.shop_id ?? '',
        店铺名称: shop.shop_name ?? '',
        店铺Logo: shop.shop_logo ?? '',
        店铺二维码: shop.qr_code ?? '',
        是否本店: cellInfo.is_self?.value?.value === 1 ? '是' : '否',
        用户支付金额: formatIndexCell('pay_amt', cellInfo.pay_amt),
        成交订单数: formatIndexCell('pay_cnt', cellInfo.pay_cnt),
        商品曝光人数: formatIndexCell('product_show_ucnt', cellInfo.product_show_ucnt),
        '投放效率（店铺被投）': formatIndexCell('ad_efficiency', cellInfo.ad_efficiency),
        客单价: formatIndexCell('pay_user_unit_price', cellInfo.pay_user_unit_price),
        商品点击人数: formatIndexCell('product_click_ucnt', cellInfo.product_click_ucnt),
        成交人数: formatIndexCell('pay_ucnt', cellInfo.pay_ucnt)
    };

    // 页面只展示 TOP 成交商品缩略图，CSV 展开前 3 个商品的核心信息，方便后续排查和二次分析。
    for (let index = 0; index < 3; index += 1) {
        const product = products[index];
        const position = index + 1;

        record[`TOP商品${position}名称`] = product?.product_name ?? '';
        record[`TOP商品${position}ID`] = product?.product_id ?? '';
        record[`TOP商品${position}链接`] = product?.detail_h5_url ?? '';
        record[`TOP商品${position}图片`] = product?.product_image ?? '';
    }

    return record;
}
