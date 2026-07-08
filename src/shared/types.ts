// 与具体数据类型无关的通用类型定义。
// 新增一种可捕获的数据（如商品数据、交易数据）时，不需要改动这里的类型。

// 数据类型标识，每种业务数据一个，例如 'shop_rank'。
export type CaptureType = string;

// 任意 JSON 对象，用于记录行与原始响应。
export type JsonRecord = Record<string, unknown>;

// 页面脚本捕获到的原始响应（尚未按数据类型解析）。
export interface RawCapture {
    url: string;
    capturedAt: string;
    rawResponse: unknown;
}

// 解析后的完整捕获：records 是已经映射成 CSV 行的对象数组。
export interface Capture {
    url: string;
    capturedAt: string;
    pageNo: number | null;
    pageSize: number | null;
    rawResponse: unknown;
    records: JsonRecord[];
}

// page 脚本对 fetch/XHR patch 的自检结果。
export interface PageReadyPayload {
    // window.fetch 是否已被 patch（含 'native code' 说明仍是原生，patch 没生效）。
    fetchPatched: boolean;
    xhrPatched: boolean;
    origin: string;
    frameUrl: string;
}

// background 通过 webRequest 探测到的请求（只看 URL，不读 body）。
export interface RequestSeen {
    url: string;
    at: string;
}

// 返回给 Popup 的捕获状态（解析 / 错误提示由具体 feature 的解析逻辑决定）。
export interface CaptureStateResponse {
    ok: boolean;
    capture: Capture | null;
    hasRawCapture?: boolean;
    // 当前 tab 是否已有 bridge 上报就绪（Popup 决定是否兜底注入脚本）。
    bridgeReady?: boolean;
    // page 脚本是否上报过就绪（patch 自检完成）。
    pageReady?: boolean;
    fetchPatched?: boolean;
    xhrPatched?: boolean;
    // background 是否探测到请求被发起（用于区分请求走了 SW/Worker）。
    requestSeen?: RequestSeen | null;
    error?: string;
}
