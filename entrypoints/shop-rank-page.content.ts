import { browser } from 'wxt/browser';
import {
    BRIDGE_READY,
    PAGE_READY,
    REPORT_CAPTURE,
    type PageReadyMessage,
    type ReportCaptureMessage
} from '../src/shared/protocol';
import { shopRankFeature } from '../src/features/shop-rank';

// 当前支持的数据类型。新增时把对应 feature 加进 FEATURES 即可，核心逻辑不用改。
const FEATURES = [shopRankFeature];

declare global {
    interface Window {
        __DY_CAPTURE_SHOP_RANK_INSTALLED__?: boolean;
        __dyCaptureRequestUrl?: string;
    }
    interface XMLHttpRequest {
        __dyCaptureRequestUrl?: string;
    }
}

export default defineContentScript({
    matches: ['https://compass.jinritemai.com/*'],
    runAt: 'document_start',
    world: 'MAIN',
    // 罗盘接口请求可能发生在 iframe / 微前端 frame，需要在每个 frame 的主环境里 patch fetch/XHR。
    allFrames: true,
    main () {
        // 粘性守卫：防止同一 frame 被重复注入（manifest + popup 兜底）导致 patch 叠层、重复捕获。
        // 框架覆盖 fetch 的场景由下面的 DOMContentLoaded 兜底重打处理，不靠去掉守卫。
        if (window.__DY_CAPTURE_SHOP_RANK_INSTALLED__) {
            return;
        }

        window.__DY_CAPTURE_SHOP_RANK_INSTALLED__ = true;

        // 通知 background：本 frame 的采集脚本已就绪。
        // Popup 据此判断脚本是否已注入，避免每次都重复兜底注入。
        void browser.runtime.sendMessage({ type: BRIDGE_READY })
            .catch(error => console.warn('[DY Capture] 上报 BRIDGE_READY 失败', error));

        patchFetch();
        patchXhr();

        // 自检 fetch/XHR 是否真的被 patch。如果被框架反向覆盖，这里会反映成 false。
        emitPageReady();

        // 框架可能在 document_start 之后覆盖 window.fetch，导致我们的 patch 失效。
        // 在 DOMContentLoaded 再检查一次，被覆盖了就重打 fetch（XHR 不重打，避免 loadend 监听叠加）。
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                if (isFetchPatched()) {
                    return;
                }

                console.warn('[DY Capture] 检测到 window.fetch 被覆盖，重新打补丁');
                patchFetch();
                emitPageReady();
            }, { once: true });
        }
    }
});

function findFeature (url: string) {
    return FEATURES.find(feature => feature.matchUrl(url));
}

function patchFetch () {
    const originalFetch = window.fetch;

    window.fetch = async function patchedFetch (input: RequestInfo | URL, init?: RequestInit) {
        const response = await originalFetch.call(this, input, init);
        const url = getFetchUrl(input);

        // 找到匹配的数据类型才拦截，避免误捕获非目标接口。
        const feature = url ? findFeature(url) : undefined;

        if (feature && url) {
            // clone 后读取响应，不影响罗盘页面自己的业务代码继续消费原 response。
            // 用 const 锁定 url 的字符串类型，避免闭包里类型收窄丢失。
            const capturedUrl = url;
            response
                .clone()
                .json()
                .then(rawResponse => emitCapture(feature.id, capturedUrl, rawResponse))
                .catch(error => console.warn('[DY Capture] 读取响应失败', capturedUrl, error));
        }

        return response;
    };
}

function patchXhr () {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function patchedOpen (this: XMLHttpRequest, method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
        // XHR 的 URL 在 open 阶段才能拿到，先挂到实例上，send/loadend 时再解析响应。
        this.__dyCaptureRequestUrl = String(url);
        return originalOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
    } as XMLHttpRequest['open'];

    XMLHttpRequest.prototype.send = function patchedSend (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
        const requestUrl = this.__dyCaptureRequestUrl;

        // 找到匹配的数据类型才拦截。
        const feature = requestUrl ? findFeature(requestUrl) : undefined;

        if (feature && requestUrl) {
            // 用 const 锁定字符串类型，避免 loadend 回调里类型收窄丢失。
            const capturedUrl = requestUrl;
            this.addEventListener('loadend', () => {
                const rawResponse = parseXhrResponse(this);

                if (rawResponse !== null) {
                    emitCapture(feature.id, capturedUrl, rawResponse);
                } else {
                    console.warn('[DY Capture] 无法解析 XHR 响应', capturedUrl);
                }
            });
        }

        return originalSend.call(this, body);
    };
}

function isFetchPatched (): boolean {
    // patch 后 window.fetch 是我们的包装函数，toString 不再含 'native code'。
    return !String(window.fetch).includes('native code');
}

function isXhrPatched (): boolean {
    return !String(XMLHttpRequest.prototype.open).includes('native code');
}

function emitPageReady () {
    const message: PageReadyMessage = {
        type: PAGE_READY,
        payload: {
            fetchPatched: isFetchPatched(),
            xhrPatched: isXhrPatched(),
            origin: window.location.origin,
            frameUrl: window.location.href
        }
    };

    // 直接上报 background（page 脚本运行在 MAIN world，runtime.sendMessage 仍可用）。
    // 不再经 window.postMessage 跨 world 中转，少一层转发。
    void browser.runtime.sendMessage(message)
        .catch(error => console.warn('[DY Capture] 上报 PAGE_READY 失败', error));
}

function getFetchUrl (input: RequestInfo | URL): string | null {
    if (typeof input === 'string') {
        return input;
    }

    if (input instanceof URL) {
        return input.toString();
    }

    if (input instanceof Request) {
        return input.url;
    }

    return null;
}

function parseXhrResponse (xhr: XMLHttpRequest): unknown | null {
    try {
        if (xhr.responseType === 'json') {
            return xhr.response;
        }

        if (xhr.responseType === '' || xhr.responseType === 'text') {
            return JSON.parse(xhr.responseText);
        }
    } catch (error) {
        console.warn('[DY Capture] 解析 XHR 响应 JSON 失败', error);
        return null;
    }

    return null;
}

function emitCapture (captureType: string, url: string, rawResponse: unknown) {
    // 主环境只转发页面已经收到的原始响应，不做字段解析。
    // 解析逻辑放在 background 里，避免真实响应结构变化时影响接口捕获链路。
    const message: ReportCaptureMessage = {
        type: REPORT_CAPTURE,
        captureType,
        payload: {
            url,
            capturedAt: new Date().toISOString(),
            rawResponse
        }
    };

    void browser.runtime.sendMessage(message)
        .catch(error => console.warn('[DY Capture] 上报 REPORT_CAPTURE 失败', error));
}
