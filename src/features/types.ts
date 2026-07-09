import type { Capture, CaptureType, JsonRecord } from '../shared/types';

// 分页信息只保留核心字段，具体接口如何提取交给各 feature 自己处理。
export interface CapturePageResult {
    pageNo: number;
    pageSize: number;
    total: number;
}

// 一种可捕获的数据类型（feature）需要向核心提供的全部能力。
// 新增数据类型时，照着这个接口实现一个 feature，再加入注册表即可。
export interface CaptureFeature {
    // 数据类型标识，用于消息与存储区分（如 'shop_rank'）。
    id: CaptureType;
    // 给用户看的中文名称，用于 Popup 提示文案。
    displayName: string;
    // 判断某个请求 URL 是否属于本数据类型。
    matchUrl: (url: string) => boolean;
    // 该数据类型所属域名（用于 content script 的注入范围与 Popup 的域名校验）。
    hosts: string[];
    // 自动导出时后台打开的罗盘页面地址。
    autoOpenUrl: string;
    // 判断某个「页面地址」是否属于本数据类型，Popup 据此自动匹配提取组件。
    matchPageUrl: (url: string) => boolean;
    // 每次请求时附加的固定 URL 查询参数（如筛选条件），自动加到所有分页 URL 上。
    fixedQueryParams?: Record<string, string>;
    // 把原始响应解析成 CSV 行（映射 + 格式化）。
    parse: (rawResponse: unknown) => JsonRecord[] | null;
    // 根据捕获生成下载文件名。
    getFileName: (capture: Capture) => string;
    // 从原始响应提取分页信息。
    extractPageResult: (rawResponse: unknown) => CapturePageResult | null;
    // 生成剩余页 URL。
    buildPageUrls: (firstPageUrl: string, totalPages: number) => string[];
    // 合并多页响应。
    mergePages: (responses: unknown[]) => unknown;
}
