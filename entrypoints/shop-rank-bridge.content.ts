import { browser } from 'wxt/browser';
import {
    BRIDGE_READY,
    PAGE_READY,
    REPORT_SHOP_RANK_CAPTURE,
    SHOP_RANK_CAPTURE_SOURCE,
    SHOP_RANK_CAPTURED,
    type PageReadyMessage,
    type RawShopRankCapture,
    type ShopRankCapturedMessage
} from '../src/shared/shopRank';

declare global {
    interface Window {
        __DY_CAPTURE_SHOP_RANK_BRIDGE_INSTALLED__?: boolean;
    }
}

export default defineContentScript({
    matches: ['https://compass.jinritemai.com/*'],
    runAt: 'document_start',
    // 罗盘接口请求可能发生在 iframe / 微前端 frame，这里开启所有 frame 注入，
    // 保证每个 frame 里的 page 脚本都有对应的 bridge 负责上报。
    allFrames: true,
    main () {
        if (window.__DY_CAPTURE_SHOP_RANK_BRIDGE_INSTALLED__) {
            return;
        }

        window.__DY_CAPTURE_SHOP_RANK_BRIDGE_INSTALLED__ = true;

        // 通知 background：本 frame 的 bridge 已就绪。
        // Popup 据此判断脚本是否已注入，避免每次都重复兜底注入。
        void browser.runtime.sendMessage({ type: BRIDGE_READY })
            .catch(error => console.warn('[DY Capture] 上报 BRIDGE_READY 失败', error));

        window.addEventListener('message', event => {
            // 放宽 source 校验：Chrome 多 frame + ISOLATED world 偶现 event.source 引用不一致，
            // 这里只靠消息形状（source/type/payload）判别，足以过滤无关消息。
            const data = event.data as unknown;

            if (isPageReadyMessage(data)) {
                void browser.runtime.sendMessage({ type: PAGE_READY, payload: data.payload })
                    .catch(error => console.warn('[DY Capture] 上报 PAGE_READY 失败', error));
                return;
            }

            if (isCapturedMessage(data)) {
                // bridge 运行在隔离环境，把原始响应统一上报给 background 保存。
                // 子 frame 的捕获也会走到这里，Popup 只问 background 就能拿到整个 tab 的结果。
                const payload: RawShopRankCapture = data.payload;
                void browser.runtime.sendMessage({ type: REPORT_SHOP_RANK_CAPTURE, payload })
                    .catch(error => console.warn('[DY Capture] 上报 REPORT_SHOP_RANK_CAPTURE 失败', error));
            }
        });
    }
});

function isPageReadyMessage (value: unknown): value is PageReadyMessage {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const message = value as Partial<PageReadyMessage>;

    return message.source === SHOP_RANK_CAPTURE_SOURCE && message.type === PAGE_READY && Boolean(message.payload);
}

function isCapturedMessage (value: unknown): value is ShopRankCapturedMessage {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const message = value as Partial<ShopRankCapturedMessage>;

    return message.source === SHOP_RANK_CAPTURE_SOURCE && message.type === SHOP_RANK_CAPTURED && Boolean(message.payload);
}
