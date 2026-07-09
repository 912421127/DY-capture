import { browser } from 'wxt/browser';
import { fetchPageInsideCompassPage } from '../../src/shared/fetchPage';

// 在当前罗盘页面 MAIN world 里请求一页数据。
// 这样请求会复用页面自己的登录态，也方便在页面 Network 面板里排查。
export async function fetchPageResponseForExport(tabId: number, url: string): Promise<unknown> {
    const [result] = await browser.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: fetchPageInsideCompassPage,
        args: [url]
    });

    if (result?.result === undefined || result.result === null) {
        throw new Error('页面没有返回分页数据，请刷新罗盘页面后重试。');
    }

    return result.result;
}
