import type { Capture, CaptureStateResponse, JsonRecord, RawCapture } from './types';
import { findRecordList } from './parse';

// 把捕获状态构建逻辑抽成通用版本：原始响应交由具体 feature 的解析函数处理。
// 这样 background、bridge 的解析行为与错误提示保持一致，新增数据类型只需传入不同的 parser。
export function buildCaptureState (
    rawCapture: RawCapture | null,
    parse: (rawResponse: unknown) => JsonRecord[] | null
): CaptureStateResponse {
    if (!rawCapture) {
        return { ok: true, capture: null, hasRawCapture: false };
    }

    try {
        return {
            ok: true,
            capture: createCapture(rawCapture, parse),
            hasRawCapture: true
        };
    } catch (error) {
        return {
            ok: true,
            capture: null,
            hasRawCapture: true,
            error: `解析响应失败：${getErrorMessage(error)}`
        };
    }
}

function createCapture (rawCapture: RawCapture, parse: (rawResponse: unknown) => JsonRecord[] | null): Capture {
    const parsedUrl = parseUrl(rawCapture.url);

    return {
        url: rawCapture.url,
        capturedAt: rawCapture.capturedAt,
        pageNo: getNumberParam(parsedUrl, 'page_no'),
        pageSize: getNumberParam(parsedUrl, 'page_size'),
        rawResponse: rawCapture.rawResponse,
        records: parse(rawCapture.rawResponse) ?? findRecordList(rawCapture.rawResponse)
    };
}

function parseUrl (url: string): URL | null {
    try {
        return new URL(url, window.location.origin);
    } catch {
        return null;
    }
}

function getNumberParam (url: URL | null, name: string): number | null {
    if (!url) {
        return null;
    }

    const value = Number(url.searchParams.get(name));
    return Number.isFinite(value) ? value : null;
}

function getErrorMessage (error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}
