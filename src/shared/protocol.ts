import type { CaptureType, PageReadyPayload, RawCapture } from './types';

// 消息类型常量（按职责区分，不再绑定具体数据类型）。
export const BRIDGE_READY = 'DY_CAPTURE_BRIDGE_READY';
export const PAGE_READY = 'DY_CAPTURE_PAGE_READY';
export const REPORT_CAPTURE = 'DY_CAPTURE_REPORT_CAPTURE';
export const GET_TAB_CAPTURE = 'DY_CAPTURE_GET_TAB_CAPTURE';

// bridge 安装完成后通知 background，Popup 据此判断是否需要兜底注入脚本。
export interface BridgeReadyMessage {
    type: typeof BRIDGE_READY;
}

// page 脚本完成 fetch/XHR patch 后直接上报 background。
// 用来区分「脚本装上了但没拦到请求」和「请求根本没走主页面 fetch（Service Worker / Worker 发起）」。
export interface PageReadyMessage {
    type: typeof PAGE_READY;
    payload: PageReadyPayload;
}

// page 脚本把捕获到的原始响应上报给 background 统一保存（带数据类型，便于分类存储）。
export interface ReportCaptureMessage {
    type: typeof REPORT_CAPTURE;
    captureType: CaptureType;
    payload: RawCapture;
}

// Popup 向 background 查询当前活动 tab、指定数据类型的捕获。
export interface GetTabCaptureMessage {
    type: typeof GET_TAB_CAPTURE;
    tabId: number;
    captureType: CaptureType;
}

// ---- 类型守卫（background 与 bridge 共用，避免各文件重复实现） ----

export function isBridgeReady (value: unknown): value is BridgeReadyMessage {
    return Boolean(value) && typeof value === 'object' && (value as { type?: string }).type === BRIDGE_READY;
}

export function isPageReady (value: unknown): value is PageReadyMessage {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const message = value as Partial<PageReadyMessage>;
    return message.type === PAGE_READY && Boolean(message.payload);
}

// page 脚本上报给 background 的「已捕获」消息。
export function isReportCapture (value: unknown): value is ReportCaptureMessage {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const message = value as Partial<ReportCaptureMessage>;
    return message.type === REPORT_CAPTURE && Boolean(message.payload);
}

// Popup 发来的查询请求。
export function isGetTabCapture (value: unknown): value is GetTabCaptureMessage {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const message = value as Partial<GetTabCaptureMessage>;
    return message.type === GET_TAB_CAPTURE && typeof message.tabId === 'number' && typeof message.captureType === 'string';
}
