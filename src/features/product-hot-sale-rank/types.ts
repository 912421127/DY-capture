// 商品热销榜接口里的区间指标，unit 是字符串：price / number / ratio。
export type ProductHotSaleRangeItem = {
    unit?: string;
    value?: number;
};

export type ProductHotSaleRange = {
    value_range?: ProductHotSaleRangeItem[];
};

export type ProductHotSaleShop = {
    image?: string;
    shop_id?: string;
    shop_name?: string;
    author_info?: {
        author_id?: string;
        author_logo?: string;
        author_nick_name?: string;
        aweme_id?: string;
    };
};

export type ProductHotSaleRow = {
    flow_index?: string;
    hot_index?: string;
    trade_index?: string;
    is_addible?: boolean;
    is_comparable?: boolean;
    is_viewable?: boolean;
    not_addible_reason?: string;
    not_comparable_reason?: string;
    not_viewable_reason?: string;
    new_pay_amt?: ProductHotSaleRange;
    pay_combo_cnt?: ProductHotSaleRange;
    product_click_cnt?: ProductHotSaleRange;
    product_click_pay_cnt_ratio?: ProductHotSaleRange;
    product_info?: {
        id?: string;
        image_url?: string;
        leaf_category_id?: number;
        name?: string;
        newly_on_ranking?: boolean;
        price_bin?: string;
        product_detail_h5_url?: string;
        rank?: number;
        rank_change?: number;
        shop_list?: ProductHotSaleShop[];
    };
};

// 分页信息（用于多页获取）。
export interface ProductHotSalePageResult {
    pageNo: number;
    pageSize: number;
    total: number;
}
