import type { JsonRecord } from '../../shared/types';

// 罗盘 shop_rank 响应里的指标值结构（可能含上下限、环比、上期值）。
type IndexValueItem = {
    unit?: number;
    value?: number;
};

type IndexValues = {
    value?: IndexValueItem;
    extra_value?: {
        lower?: IndexValueItem;
        upper?: IndexValueItem;
        first_on_rank?: IndexValueItem;
    };
    last_period_change?: IndexValueItem;
    last_value?: IndexValueItem;
};

// 罗盘表格里一个单元格的数据结构。
export type CompassCell = JsonRecord & {
    index_values?: IndexValues;
    shop?: {
        shop_id?: string;
        shop_name?: string;
        shop_logo?: string;
        qr_code?: string;
    };
    product_list?: Array<{
        product_id?: string;
        product_name?: string;
        detail_h5_url?: string;
        product_image?: string;
    }>;
    value?: IndexValueItem;
};

// 罗盘表格里的一行（cell_info 是「字段名 → 单元格」的映射）。
export type CompassRow = {
    cell_info?: Record<string, CompassCell>;
};

// 分页信息（用于多页获取）。
export interface ShopRankPageResult {
    pageNo: number;
    pageSize: number;
    total: number;
}
