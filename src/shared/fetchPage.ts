// 在目标罗盘页面 MAIN world 里 fetch 一页数据。
// 这样请求会复用页面自己的登录态和 Cookie。
// 注意：这个函数会被 Chrome 复制到网页里执行，必须保持自包含，不能引用外部变量。
export async function fetchPageInsideCompassPage(url: string): Promise<unknown> {
    const response = await fetch(url, { credentials: 'include' });

    if (!response.ok) {
        throw new Error(`接口请求失败：HTTP ${response.status}。请刷新罗盘页面或重新登录后再试。`);
    }

    return response.json();
}
