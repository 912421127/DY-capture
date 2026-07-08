import type { JsonRecord } from '../../shared/types';
import { formatCompactNumber, formatInteger, formatPlainNumber } from '../../shared/format';
import { getPath, isPlainObject } from '../../shared/parse';
import type { ProductHotSaleRange, ProductHotSaleRangeItem, ProductHotSaleRow } from './types';

// 罗盘商品热销榜接口路径，page 脚本用它判断是否拦截该请求。
export const PRODUCT_HOT_SALE_RANK_API_PATH = '/compass_api/shop/product/product_rank/market_hot_sale';

// 判断某个请求 URL 是否为商品热销榜接口。
export function isProductHotSaleRankUrl(url: string): boolean {
    return url.includes(PRODUCT_HOT_SALE_RANK_API_PATH);
}

// 把商品热销榜原始响应解析成 CSV 行（带中文表头）。
export function parseCompassProductHotSaleRankRecords(rawResponse: unknown): JsonRecord[] | null {
    const rows = getProductHotSaleRows(rawResponse);

    if (!rows) {
        return null;
    }

    return rows.map(row => mapProductHotSaleRow(row));
}

// 提取商品热销榜列表（供解析 CSV 与合并多页响应复用）。
export function getProductHotSaleRows(rawResponse: unknown): ProductHotSaleRow[] | null {
    const rows = getPath(rawResponse, ['data', 'data_result']);

    if (!Array.isArray(rows)) {
        return null;
    }

    // 命中接口结构后严格校验行对象，避免接口变形时静默导出脏数据。
    return rows.map((row, index) => {
        if (!isPlainObject(row)) {
            throw new Error(`第 ${index + 1} 行不是有效对象`);
        }

        return row as ProductHotSaleRow;
    });
}

// 区间指标统一格式化：金额按分转元，比例转百分比，其它数字按中文展示习惯压缩。
function formatRange(range: ProductHotSaleRange | undefined): string {
    const values = range?.value_range;

    if (!values || values.length === 0) {
        return '';
    }

    const formattedValues = values
        .map(item => formatRangeItem(item))
        .filter(value => value !== '');

    return formattedValues.join('-');
}

function formatRangeItem(item: ProductHotSaleRangeItem): string {
    if (item.value === undefined) {
        return '';
    }

    if (item.unit === 'price') {
        // 接口金额单位是分，CSV 面向用户展示元，和罗盘页面保持一致。
        return `￥${formatCompactNumber(item.value / 100)}`;
    }

    if (item.unit === 'ratio') {
        return `${formatPlainNumber(item.value * 100, 2)}%`;
    }

    return formatCompactNumber(item.value);
}

// 排名变化值格式化为带箭头的文本：上升用 ↑、下降用 ↓，无变化显示 0。
function formatRankChange(value: number | undefined): string {
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

function formatBool(value: boolean | undefined): string {
    if (value === undefined) {
        return '';
    }

    return value ? '是' : '否';
}

function mapProductHotSaleRow(row: ProductHotSaleRow): JsonRecord {
    const product = row.product_info ?? {};
    const shops = product.shop_list ?? [];

    const record: JsonRecord = {
        排名: formatInteger(product.rank),
        排名变化: formatRankChange(product.rank_change),
        是否新上榜: formatBool(product.newly_on_ranking),
        商品ID: product.id ?? '',
        商品名称: product.name ?? '',
        商品图片: product.image_url ?? '',
        商品链接: product.product_detail_h5_url ?? '',
        价格区间: product.price_bin ?? '',
        叶子类目ID: product.leaf_category_id ?? '',
        支付金额: formatRange(row.new_pay_amt),
        成交件数: formatRange(row.pay_combo_cnt),
        商品点击人数: formatRange(row.product_click_cnt),
        点击成交转化率: formatRange(row.product_click_pay_cnt_ratio),
        流量指数: row.flow_index ?? '',
        热度指数: row.hot_index ?? '',
        交易指数: row.trade_index ?? '',
        是否可查看: formatBool(row.is_viewable),
        不可查看原因: row.not_viewable_reason ?? '',
        是否可添加: formatBool(row.is_addible),
        不可添加原因: row.not_addible_reason ?? '',
        是否可对比: formatBool(row.is_comparable),
        不可对比原因: row.not_comparable_reason ?? ''
    };

    // 商品可能关联多个店铺，CSV 展开前 3 个，兼顾信息完整和表格可读性。
    for (let index = 0; index < 3; index += 1) {
        const shop = shops[index];
        const author = shop?.author_info;
        const position = index + 1;

        record[`店铺${position}ID`] = shop?.shop_id ?? '';
        record[`店铺${position}名称`] = shop?.shop_name ?? '';
        record[`店铺${position}图片`] = shop?.image ?? '';
        record[`店铺${position}达人ID`] = author?.author_id ?? '';
        record[`店铺${position}达人昵称`] = author?.author_nick_name ?? '';
        record[`店铺${position}抖音号`] = author?.aweme_id ?? '';
        record[`店铺${position}达人头像`] = author?.author_logo ?? '';
    }

    return record;
}
