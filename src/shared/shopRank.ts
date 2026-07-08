export const SHOP_RANK_API_PATH = '/compass_api/shop/mall/market/shop_rank';
export const SHOP_RANK_CAPTURE_SOURCE = 'DY_CAPTURE_SHOP_RANK';
export const SHOP_RANK_CAPTURED = 'SHOP_RANK_CAPTURED';

// bridge 安装完成后通知 background，Popup 据此判断是否需要兜底注入脚本。
export const BRIDGE_READY = 'DY_CAPTURE_BRIDGE_READY';
// bridge 把捕获到的原始响应上报给 background 统一保存。
export const REPORT_SHOP_RANK_CAPTURE = 'REPORT_SHOP_RANK_CAPTURE';
// Popup 向 background 查询当前活动 tab 的最新捕获。
export const GET_TAB_SHOP_RANK_CAPTURE = 'GET_TAB_SHOP_RANK_CAPTURE';
// page 脚本完成 fetch/XHR patch 后通知 bridge，bridge 再转发给 background。
// 用来区分「bridge 装上了但 page 脚本没装上」和「page 装上了但没拦到请求」。
export const PAGE_READY = 'DY_CAPTURE_PAGE_READY';

export type JsonRecord = Record<string, unknown>;
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

type CompassCell = JsonRecord & {
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

type CompassRow = {
    cell_info?: Record<string, CompassCell>;
};

export type ShopRankExportRecord = JsonRecord;

export interface ShopRankCapture {
    url: string;
    capturedAt: string;
    pageNo: number | null;
    pageSize: number | null;
    rawResponse: unknown;
    records: JsonRecord[];
}

export interface RawShopRankCapture {
    url: string;
    capturedAt: string;
    rawResponse: unknown;
}

export interface ShopRankCaptureError {
    url: string;
    capturedAt: string;
    error: string;
}

export interface ShopRankCapturedMessage {
    source: typeof SHOP_RANK_CAPTURE_SOURCE;
    type: typeof SHOP_RANK_CAPTURED;
    payload: RawShopRankCapture;
}

export interface BridgeReadyMessage {
    type: typeof BRIDGE_READY;
}

export interface ReportShopRankCaptureMessage {
    type: typeof REPORT_SHOP_RANK_CAPTURE;
    payload: RawShopRankCapture;
}

export interface GetTabShopRankCaptureMessage {
    type: typeof GET_TAB_SHOP_RANK_CAPTURE;
    tabId: number;
}

export interface PageReadyPayload {
    // window.fetch 是否已被 patch（含 'native code' 说明仍是原生，patch 没生效）。
    fetchPatched: boolean;
    xhrPatched: boolean;
    origin: string;
    frameUrl: string;
}

export interface PageReadyMessage {
    source: typeof SHOP_RANK_CAPTURE_SOURCE;
    type: typeof PAGE_READY;
    payload: PageReadyPayload;
}

// background 通过 webRequest.onBeforeRequest 探测到的 shop_rank 请求（只看 URL，不读 body）。
export interface ShopRankRequestSeen {
    url: string;
    at: string;
}

export interface GetLatestShopRankPageResponse {
    ok: boolean;
    capture: ShopRankCapture | null;
    hasRawCapture?: boolean;
    // 标识当前 tab 是否已有 bridge 上报过就绪状态，Popup 用来决定是否兜底注入脚本。
    bridgeReady?: boolean;
    // page 脚本是否上报过 PAGE_READY（patch 自检完成）。
    pageReady?: boolean;
    fetchPatched?: boolean;
    xhrPatched?: boolean;
    // background 是否探测到 shop_rank 请求被发起（用于区分请求走了 SW/Worker）。
    shopRankRequestSeen?: ShopRankRequestSeen | null;
    // 多页获取进度：Popup 用来显示「正在获取第 X/N 页...」。
    captureProgress?: { currentPage: number; totalPages: number; status: string } | null;
    error?: string;
}

const LIST_FIELD_NAMES = ['list', 'rank_list', 'rankList', 'records', 'items', 'data_list', 'dataList', 'shop_list', 'shopList'];

export function isShopRankUrl(url: string): boolean {
    return url.includes(SHOP_RANK_API_PATH);
}

export function createShopRankCapture(url: string, rawResponse: unknown): ShopRankCapture {
    const parsedUrl = parseUrl(url);
    const compassRecords = parseCompassShopRankRecords(rawResponse);

    return {
        url,
        capturedAt: new Date().toISOString(),
        pageNo: getNumberParam(parsedUrl, 'page_no'),
        pageSize: getNumberParam(parsedUrl, 'page_size'),
        rawResponse,
        records: compassRecords ?? findRecordList(rawResponse)
    };
}

export function buildShopRankCaptureState(rawCapture: RawShopRankCapture | null): GetLatestShopRankPageResponse {
    if (!rawCapture) {
        return {
            ok: true,
            capture: null,
            hasRawCapture: false
        };
    }

    try {
        return {
            ok: true,
            capture: createShopRankCapture(rawCapture.url, rawCapture.rawResponse),
            hasRawCapture: true
        };
    } catch (error) {
        return {
            ok: true,
            capture: null,
            hasRawCapture: true,
            error: `解析店铺榜单响应失败：${getErrorMessage(error)}`
        };
    }
}

export function parseCompassShopRankRecords(rawResponse: unknown): ShopRankExportRecord[] | null {
    const rows = getCompassShopRankRows(rawResponse);

    if (!rows) {
        return null;
    }

    return rows.map(row => mapCompassShopRankRow(row));
}

export function findRecordList(value: unknown): JsonRecord[] {
    // 罗盘接口字段可能会调整，先找常见列表字段，再兜底找第一组对象数组。
    const found = findListByPreferredField(value);

    if (found) {
        return found;
    }

    const fallback = findFirstObjectArray(value);
    return fallback ?? [];
}

export function createCsvContent(records: JsonRecord[]): string {
    const headers = collectHeaders(records);
    const rows = records.map(record => headers.map(header => formatCsvCell(record[header])).join(','));

    // 加 BOM 是为了让 Excel 直接打开中文 CSV 时不乱码。
    return ['\uFEFF' + headers.join(','), ...rows].join('\n');
}

export function formatIndexCell(fieldName: string, cell: CompassCell | undefined): string {
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

export function getCaptureFileName(capture: ShopRankCapture): string {
    const pageText = capture.pageNo ? `page-${capture.pageNo}` : 'page-current';
    const timeText = capture.capturedAt.replace(/[:.]/g, '-');

    return `罗盘店铺榜单-${pageText}-${timeText}.csv`;
}

function parseUrl(url: string): URL | null {
    try {
        return new URL(url, window.location.origin);
    } catch {
        return null;
    }
}

function getCompassShopRankRows(rawResponse: unknown): CompassRow[] | null {
    const table = getPath(rawResponse, ['data', 'module_data', 'search_shop_rank', 'compass_general_table_value']);

    if (!isPlainObject(table) || !Array.isArray(table.data)) {
        return null;
    }

    // 只要命中了罗盘表格结构，就不静默过滤坏行；否则真实接口变形时会误报“捕获不到数据”。
    return table.data.map((row, index) => {
        if (!isPlainObject(row)) {
            throw new Error(`第 ${index + 1} 行不是有效对象`);
        }

        return row as CompassRow;
    });
}

function mapCompassShopRankRow(row: CompassRow): ShopRankExportRecord {
    const cellInfo = row.cell_info ?? {};
    const rankValues = cellInfo.rank?.index_values;
    const shop = cellInfo.shop?.shop ?? {};
    const products = cellInfo.product_list?.product_list ?? [];
    const record: ShopRankExportRecord = {
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

function getPath(value: unknown, path: string[]): unknown {
    let current = value;

    for (const key of path) {
        if (!isPlainObject(current)) {
            return undefined;
        }

        current = current[key];
    }

    return current;
}

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

function formatIndexValue(fieldName: string, item: IndexValueItem): string {
    const rawValue = item.value;

    if (rawValue === undefined) {
        return '';
    }

    if (item.unit === 3) {
        // 罗盘金额字段返回的是“分”，页面展示用“元”，所以这里先除以 100。
        const yuan = rawValue / 100;

        if (fieldName === 'pay_amt') {
            return `￥${formatCompactNumber(yuan)}`;
        }

        // 客单价虽然也是金额，但页面按普通元金额展示，不做“万”压缩。
        return `￥${formatPlainNumber(yuan, 2)}`;
    }

    if (fieldName === 'ad_efficiency') {
        return formatPlainNumber(rawValue, 2);
    }

    return formatCompactNumber(rawValue);
}

function formatCompactNumber(value: number): string {
    if (Math.abs(value) >= 10000) {
        return `${formatPlainNumber(value / 10000, 2)}万`;
    }

    return formatPlainNumber(value, 0);
}

function formatPlainNumber(value: number, maxFractionDigits: number): string {
    return value.toLocaleString('zh-CN', {
        maximumFractionDigits: maxFractionDigits
    });
}

function formatInteger(value: number | undefined): string {
    if (value === undefined) {
        return '';
    }

    return value.toLocaleString('zh-CN', {
        maximumFractionDigits: 0
    });
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function getNumberParam(url: URL | null, name: string): number | null {
    if (!url) {
        return null;
    }

    const value = Number(url.searchParams.get(name));
    return Number.isFinite(value) ? value : null;
}

function findListByPreferredField(value: unknown): JsonRecord[] | null {
    if (!isPlainObject(value)) {
        return null;
    }

    for (const fieldName of LIST_FIELD_NAMES) {
        const fieldValue = value[fieldName];

        if (isRecordArray(fieldValue)) {
            return fieldValue;
        }
    }

    for (const childValue of Object.values(value)) {
        const found = findListByPreferredField(childValue);

        if (found) {
            return found;
        }
    }

    return null;
}

function findFirstObjectArray(value: unknown): JsonRecord[] | null {
    if (isRecordArray(value)) {
        return value;
    }

    if (!isPlainObject(value) && !Array.isArray(value)) {
        return null;
    }

    const childValues = Array.isArray(value) ? value : Object.values(value);

    for (const childValue of childValues) {
        const found = findFirstObjectArray(childValue);

        if (found) {
            return found;
        }
    }

    return null;
}

function isRecordArray(value: unknown): value is JsonRecord[] {
    return Array.isArray(value) && value.length > 0 && value.every(isPlainObject);
}

function isPlainObject(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectHeaders(records: JsonRecord[]): string[] {
    const headers = new Set<string>();

    for (const record of records) {
        for (const key of Object.keys(record)) {
            headers.add(key);
        }
    }

    return Array.from(headers);
}

function formatCsvCell(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    // 嵌套对象保留为 JSON 字符串，避免接口字段暂未映射时丢失原始信息。
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

// ====================== 多页分页工具 ======================

export interface ShopRankPageResult {
    pageNo: number;
    pageSize: number;
    total: number;
}

/**
 * 从 shop_rank rawResponse 中提取分页信息。
 * 罗盘响应结构为 data.module_data.search_shop_rank.compass_general_table_value.page_result。
 * 如果路径不存在或字段不是有效数字，返回 null。
 */
export function extractPageResult (rawResponse: unknown): ShopRankPageResult | null {
    const pageResult = getPath(rawResponse, ['data', 'module_data', 'search_shop_rank', 'compass_general_table_value', 'page_result']);

    if (!isPlainObject(pageResult)) {
        return null;
    }

    const pageNo = Number(pageResult.page_no);
    const pageSize = Number(pageResult.page_size);
    const total = Number(pageResult.total);

    if (!Number.isFinite(pageNo) || !Number.isFinite(pageSize) || !Number.isFinite(total)) {
        return null;
    }

    return { pageNo, pageSize, total };
}

/**
 * 根据第一页 URL 生成剩余页的 URL 列表（第 2 页到最后一页）。
 * 只修改 URL 中 page_no 查询参数，其余参数保持不变。
 */
export function buildPageUrls (firstPageUrl: string, totalPages: number): string[] {
    const urls: string[] = [];

    for (let page = 2; page <= totalPages; page += 1) {
        const url = new URL(firstPageUrl);

        url.searchParams.set('page_no', String(page));
        urls.push(url.toString());
    }

    return urls;
}

/**
 * 合并多个分页的 rawResponse 为单个 rawResponse。
 * 深拷贝第一页的整体响应结构，然后把各页 compass_general_table_value.data 的行拼接在一起。
 * 合并后的响应结构与单页响应完全一致，现有的 createShopRankCapture / parseCompassShopRankRecords 无需改动。
 */
export function mergeMultiPageResponses (responses: unknown[]): unknown {
    if (responses.length === 0) {
        return null;
    }

    // 深拷贝第一页作为底座，后续页的数据行追加到其 data 数组中。
    const base = JSON.parse(JSON.stringify(responses[0]));

    // 所有页的数据行都收集到这里，然后一次性写回底座。
    const allRows: unknown[] = [];

    for (const response of responses) {
        const rows = getCompassShopRankRows(response);

        if (rows) {
            allRows.push(...rows);
        }
    }

    if (allRows.length === 0) {
        return base;
    }

    // 把合并后的数据行写回底座中的 compass_general_table_value.data。
    const table = getPath(base, ['data', 'module_data', 'search_shop_rank', 'compass_general_table_value']);

    if (isPlainObject(table) && Array.isArray(table.data)) {
        table.data = allRows;
    }

    return base;
}
