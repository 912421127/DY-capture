import { defineConfig } from 'wxt';

export default defineConfig({
    modules: ['@wxt-dev/module-vue'],
    manifest: {
        name: 'DY Capture',
        description: '抖音数据采集浏览器插件基础框架',
        // storage：background 按 tabId 保存罗盘捕获结果（应对 service worker 回收）。
        // webRequest：诊断 shop_rank 请求是否真实发起（只看 URL，不读 body）。
        // cookies：排除罗盘对扩展请求额外鉴权的可能性（MAIN world fetch 自带页面 cookie，此权限仅用于排查）。
        permissions: ['activeTab', 'scripting', 'storage', 'webRequest', 'cookies'],
        host_permissions: ['https://compass.jinritemai.com/*']
    },
    webExt: {
        disabled: true
    }
});
