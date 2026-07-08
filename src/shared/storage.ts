import type { CaptureType } from './types';

// storage.session 的 key 构造。捕获按「数据类型 + tabId」区分，
// 其余就绪 / 诊断状态是按 tab 维度共享的（同一页面多个数据类型共用）。
export const captureKey = (captureType: CaptureType, tabId: number) => `capture:${captureType}:${tabId}`;
export const bridgeReadyKey = (tabId: number) => `bridgeReady:${tabId}`;
export const pageReadyKey = (tabId: number) => `pageReady:${tabId}`;
export const requestSeenKey = (tabId: number) => `requestSeen:${tabId}`;
export const captureProgressKey = (tabId: number) => `captureProgress:${tabId}`;
