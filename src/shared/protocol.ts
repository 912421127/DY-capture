import type { CaptureStateResponse, CaptureType, PageReadyPayload, RawCapture } from './types';
import type { AutoExportSettings, AutoExportStatus } from './autoExport';

// 消息类型常量（按职责区分，不再绑定具体数据类型）。
export const BRIDGE_READY = 'DY_CAPTURE_BRIDGE_READY';
export const PAGE_READY = 'DY_CAPTURE_PAGE_READY';
export const REPORT_CAPTURE = 'DY_CAPTURE_REPORT_CAPTURE';
export const GET_TAB_CAPTURE = 'DY_CAPTURE_GET_TAB_CAPTURE';
// Popup 一次性查询当前 tab 下所有数据类型的捕获状态（用于自动匹配的"已抓数据兜底"与下拉展示）。
export const GET_ALL_TAB_CAPTURE = 'DY_CAPTURE_GET_ALL_TAB_CAPTURE';
export const GET_AUTO_EXPORT_STATE = 'DY_CAPTURE_GET_AUTO_EXPORT_STATE';
export const SET_AUTO_EXPORT_SETTINGS = 'DY_CAPTURE_SET_AUTO_EXPORT_SETTINGS';
export const OPEN_AUTO_EXPORT_PAGES = 'DY_CAPTURE_OPEN_AUTO_EXPORT_PAGES';
export const RUN_AUTO_EXPORT_ONCE = 'DY_CAPTURE_RUN_AUTO_EXPORT_ONCE';

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

// Popup 一次性查询所有数据类型的请求。
export interface GetAllTabCaptureMessage {
    type: typeof GET_ALL_TAB_CAPTURE;
    tabId: number;
}

// 单个数据类型在 Popup 下拉里展示的捕获状态。
export interface FeatureCaptureState {
    id: CaptureType;
    displayName: string;
    state: CaptureStateResponse;
}

// 返回给 Popup 的全部数据类型捕获状态。
export interface GetAllTabCaptureResponse {
    ok: boolean;
    features: FeatureCaptureState[];
    error?: string;
}

// Popup 发来的全量查询请求。
export function isGetAllTabCapture (value: unknown): value is GetAllTabCaptureMessage {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const message = value as Partial<GetAllTabCaptureMessage>;
    return message.type === GET_ALL_TAB_CAPTURE && typeof message.tabId === 'number';
}

export interface AutoExportStateResponse {
    ok: boolean;
    settings: AutoExportSettings;
    status: AutoExportStatus;
    error?: string;
}

export interface GetAutoExportStateMessage {
    type: typeof GET_AUTO_EXPORT_STATE;
}

export interface SetAutoExportSettingsMessage {
    type: typeof SET_AUTO_EXPORT_SETTINGS;
    settings: AutoExportSettings;
}

export interface OpenAutoExportPagesMessage {
    type: typeof OPEN_AUTO_EXPORT_PAGES;
}

export interface OpenAutoExportPagesResponse {
    ok: boolean;
    status: AutoExportStatus;
    error?: string;
}

export interface RunAutoExportOnceMessage {
    type: typeof RUN_AUTO_EXPORT_ONCE;
}

export interface RunAutoExportOnceResponse {
    ok: boolean;
    status: AutoExportStatus;
    error?: string;
}

export function isGetAutoExportState(value: unknown): value is GetAutoExportStateMessage {
    return Boolean(value) && typeof value === 'object' && (value as { type?: string }).type === GET_AUTO_EXPORT_STATE;
}

export function isSetAutoExportSettings(value: unknown): value is SetAutoExportSettingsMessage {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const message = value as Partial<SetAutoExportSettingsMessage>;
    return message.type === SET_AUTO_EXPORT_SETTINGS && Boolean(message.settings);
}

export function isOpenAutoExportPages(value: unknown): value is OpenAutoExportPagesMessage {
    return Boolean(value) && typeof value === 'object' && (value as { type?: string }).type === OPEN_AUTO_EXPORT_PAGES;
}

export function isRunAutoExportOnce(value: unknown): value is RunAutoExportOnceMessage {
    return Boolean(value) && typeof value === 'object' && (value as { type?: string }).type === RUN_AUTO_EXPORT_ONCE;
}
