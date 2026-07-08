import { browser } from 'wxt/browser';

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

// 注意：这个函数会被 Chrome 复制到网页里执行，必须保持自包含。
async function fetchPageInsideCompassPage(url: string): Promise<unknown> {
    const response = await fetch(url, { credentials: 'include' });

    if (!response.ok) {
        throw new Error(`接口请求失败：HTTP ${response.status}。请刷新罗盘页面或重新触发筛选后再试。`);
    }

    return response.json();
}
