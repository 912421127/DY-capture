# 新增接口导出开发指南

这份文档用于后续自己新增一个“接口捕获 + CSV 导出”功能。当前项目已经把不同接口抽象成 `feature`，所以新增接口时通常只需要在 `src/features/` 下新增一个目录，再把它注册到 `src/features/index.ts`。

可以参考这两个现有示例：

- `src/features/product-hot-sale-rank/`：商品热销榜，列表路径是 `data.data_result`。
- `src/features/shop-rank/`：店铺榜单，列表路径是 `data.module_data.search_shop_rank.compass_general_table_value.data`。

## 1. 先抓接口信息

在罗盘页面打开 Chrome DevTools：

1. 进入目标页面。
2. 打开 `Network`。
3. 刷新页面，或点击筛选按钮触发接口请求。
4. 找到你要导出的接口。
5. 右键接口，复制 `Copy as cURL`，同时保存一份返回 JSON。

开发前先记录这些信息：

- 页面地址：例如 `/shop/chance/rank-product`。
- 接口路径：例如 `/compass_api/shop/product/product_rank/market_hot_sale`。
- 列表路径：例如 `data.data_result`。
- 分页路径：例如 `data.page_result`。
- 分页参数名：通常是 `page_no` 和 `page_size`。
- 要导出的字段：例如排名、商品名称、店铺名称、支付金额等。
- 字段单位：金额到底是“分”还是“元”，比例是 `0.1` 还是 `10`。

如果不确定字段路径，先用格式化后的 JSON 搜索字段名，不要凭感觉写。

## 2. 新建 feature 目录

新接口建议新建一个独立目录：

```text
src/features/你的功能名/
  index.ts
  parse.ts
  pagination.ts
  types.ts
```

命名建议：

- 文件夹用短横线：`product-hot-sale-rank`。
- feature id 用下划线：`product_hot_sale_rank`。
- 用户可见名称用中文：`罗盘商品热销榜`。

这 4 个文件的职责：

- `types.ts`：写接口返回里会用到的字段类型。
- `parse.ts`：判断接口 URL，并把原始 JSON 转成 CSV 行。
- `pagination.ts`：提取分页信息、生成下一页 URL、合并多页响应。
- `index.ts`：把这个功能包装成 `CaptureFeature`，供项目统一注册。

## 3. 写 `types.ts`

只定义你会用到的字段，不需要把接口所有字段都写全。接口字段可能缺失，所以字段尽量加 `?`。

```ts
export type DemoRow = {
    product_info?: {
        id?: string;
        name?: string;
        rank?: number;
    };
};

export interface DemoPageResult {
    pageNo: number;
    pageSize: number;
    total: number;
}
```

如果某个字段是数组，也只写你要导出的字段：

```ts
export type DemoShop = {
    shop_id?: string;
    shop_name?: string;
};
```

## 4. 写 `parse.ts`

`parse.ts` 负责两件事：

1. 判断某个请求 URL 是不是目标接口。
2. 把原始响应转成 CSV 行。

基础结构：

```ts
import type { JsonRecord } from '../../shared/types';
import { formatInteger } from '../../shared/format';
import { getPath, isPlainObject } from '../../shared/parse';
import type { DemoRow } from './types';

export const DEMO_API_PATH = '/compass_api/xxx/yyy';

export function isDemoUrl(url: string): boolean {
    return url.includes(DEMO_API_PATH);
}

export function parseDemoRecords(rawResponse: unknown): JsonRecord[] | null {
    const rows = getDemoRows(rawResponse);

    if (!rows) {
        return null;
    }

    return rows.map(row => mapDemoRow(row));
}
```

提取列表：

```ts
export function getDemoRows(rawResponse: unknown): DemoRow[] | null {
    const rows = getPath(rawResponse, ['data', 'data_result']);

    if (!Array.isArray(rows)) {
        return null;
    }

    return rows.map((row, index) => {
        if (!isPlainObject(row)) {
            throw new Error(`第 ${index + 1} 行不是有效对象`);
        }

        return row as DemoRow;
    });
}
```

映射 CSV 行：

```ts
function mapDemoRow(row: DemoRow): JsonRecord {
    const product = row.product_info ?? {};

    return {
        排名: formatInteger(product.rank),
        商品ID: product.id ?? '',
        商品名称: product.name ?? ''
    };
}
```

注意事项：

- CSV 表头直接用中文，例如 `商品名称`。
- 缺字段时返回空字符串，不要把 `undefined` 导出给用户。
- 如果命中了列表结构，但某一行不是对象，可以抛错，这样更容易发现接口结构变了。

常用工具：

- `src/shared/parse.ts`
  - `getPath(raw, ['data', 'list'])`：安全读取嵌套字段。
  - `isPlainObject(value)`：判断是不是普通对象。
- `src/shared/format.ts`
  - `formatInteger(value)`：整数千分位。
  - `formatPlainNumber(value, maxFractionDigits)`：普通数字。
  - `formatCompactNumber(value)`：超过一万显示成 `万`。

## 5. 常用字段格式化

金额：先确认接口单位。如果接口返回的是“分”，导出“元”时要除以 100。

```ts
function formatPriceByCent(value: number | undefined): string {
    if (value === undefined) {
        return '';
    }

    return `￥${formatCompactNumber(value / 100)}`;
}
```

比例：如果接口返回 `0.1` 表示 10%，导出时乘 100。

```ts
function formatRatio(value: number | undefined): string {
    if (value === undefined) {
        return '';
    }

    return `${formatPlainNumber(value * 100, 2)}%`;
}
```

布尔值：面向用户导出 `是/否`。

```ts
function formatBool(value: boolean | undefined): string {
    if (value === undefined) {
        return '';
    }

    return value ? '是' : '否';
}
```

排名变化：

```ts
function formatRankChange(value: number | undefined): string {
    if (value === undefined) {
        return '';
    }

    if (value > 0) {
        return `↑${formatInteger(value)}`;
    }

    if (value < 0) {
        return `↓${formatInteger(Math.abs(value))}`;
    }

    return '0';
}
```

区间值：例如接口返回两个值，导出成 `￥10万-￥25万` 或 `10%-15%`。

```ts
function formatRange(values: Array<{ unit?: string; value?: number }> | undefined): string {
    if (!values || values.length === 0) {
        return '';
    }

    return values
        .map(item => {
            if (item.value === undefined) {
                return '';
            }

            if (item.unit === 'price') {
                return `￥${formatCompactNumber(item.value / 100)}`;
            }

            if (item.unit === 'ratio') {
                return `${formatPlainNumber(item.value * 100, 2)}%`;
            }

            return formatCompactNumber(item.value);
        })
        .filter(value => value !== '')
        .join('-');
}
```

## 6. 写 `pagination.ts`

分页文件负责 3 件事：

- 从第一页响应里读出 `pageNo/pageSize/total`。
- 根据第一页 URL 生成第 2 页到最后一页的 URL。
- 把多页响应合成一个响应，再交给 `parse.ts` 统一解析。

提取分页：

```ts
import { getPath, isPlainObject } from '../../shared/parse';
import { getDemoRows } from './parse';
import type { DemoPageResult } from './types';

export function extractPageResult(rawResponse: unknown): DemoPageResult | null {
    const pageResult = getPath(rawResponse, ['data', 'page_result']);

    if (!isPlainObject(pageResult)) {
        return null;
    }

    const pageNo = Number(pageResult.page_no);
    const pageSize = Number(pageResult.page_size);
    const total = Number(pageResult.total);

    if (!Number.isFinite(pageNo) || !Number.isFinite(pageSize) || !Number.isFinite(total)) {
        return null;
    }

    return { pageNo, pageSize, total };
}
```

生成分页 URL：

```ts
export function buildPageUrls(firstPageUrl: string, totalPages: number): string[] {
    const urls: string[] = [];

    for (let page = 2; page <= totalPages; page += 1) {
        const url = new URL(firstPageUrl);
        url.searchParams.set('page_no', String(page));
        urls.push(url.toString());
    }

    return urls;
}
```

合并多页：

```ts
export function mergeMultiPageResponses(responses: unknown[]): unknown {
    if (responses.length === 0) {
        return null;
    }

    const base = JSON.parse(JSON.stringify(responses[0]));
    const allRows: unknown[] = [];

    for (const response of responses) {
        const rows = getDemoRows(response);

        if (rows) {
            allRows.push(...rows);
        }
    }

    const data = getPath(base, ['data']);

    if (isPlainObject(data) && Array.isArray(data.data_result)) {
        data.data_result = allRows;
    }

    return base;
}
```

如果新接口列表不是 `data.data_result`，要同步改：

- `parse.ts` 里的列表路径。
- `pagination.ts` 合并时写回的路径。

## 7. 写 `index.ts`

`index.ts` 把当前功能注册成统一的 `CaptureFeature`。

```ts
import type { Capture } from '../../shared/types';
import type { CaptureFeature } from '../types';
import { buildPageUrls, extractPageResult, mergeMultiPageResponses } from './pagination';
import { isDemoUrl, parseDemoRecords } from './parse';

const DEMO_HOSTS = ['compass.jinritemai.com'];

function matchDemoPage(url: string): boolean {
    try {
        return new URL(url).pathname === '/shop/chance/xxx';
    } catch {
        return false;
    }
}

export const demoFeature: CaptureFeature = {
    id: 'demo_rank',
    displayName: '罗盘示例榜单',
    matchUrl: isDemoUrl,
    hosts: DEMO_HOSTS,
    matchPageUrl: matchDemoPage,
    parse: parseDemoRecords,
    getFileName: getDemoFileName,
    extractPageResult,
    buildPageUrls,
    mergePages: mergeMultiPageResponses
};

function getDemoFileName(capture: Capture): string {
    const pageText = capture.pageNo ? `page-${capture.pageNo}` : 'page-current';
    const timeText = capture.capturedAt.replace(/[:.]/g, '-');

    return `罗盘示例榜单-${pageText}-${timeText}.csv`;
}
```

页面匹配不要写得太宽。比如不要直接匹配整个 `compass.jinritemai.com`，否则 Popup 可能自动选错功能。

## 8. 注册到 `src/features/index.ts`

打开 `src/features/index.ts`，引入新 feature：

```ts
import { demoFeature } from './demo';
```

加入 `FEATURES`：

```ts
export const FEATURES: CaptureFeature[] = [
    shopRankFeature,
    productHotSaleRankFeature,
    demoFeature
];
```

注册后，下面这些流程会自动生效：

- content script 判断接口是否要捕获。
- background 按 feature 保存捕获数据。
- Popup 自动显示功能选项。
- 导出时复用当前 feature 的分页和解析逻辑。

一般不需要修改 `entrypoints/` 里的主流程。

## 9. 写测试

建议至少写 3 类测试：

1. 解析测试：确认 JSON 能转成预期 CSV 行。
2. 分页测试：确认能提取分页、生成下一页 URL、合并多页。
3. 注册表测试：确认接口 URL 和页面 URL 能命中新 feature。

运行单个测试：

```bash
node_modules/.bin/vite-node tests/你的测试文件.test.ts
```

如果本地样本 JSON 是绝对路径，可以像现有测试一样：文件不存在时跳过，避免换机器后直接失败。

## 10. 验证和实际使用

改完代码后优先运行：

```bash
npm run compile
```

实际页面验证：

1. 运行开发环境：

   ```bash
   npm run dev
   ```

2. 打开扩展开发版本。
3. 进入目标罗盘页面。
4. 刷新页面，或点击筛选触发接口。
5. 打开插件 Popup。
6. 确认自动选中新功能。
7. 点击导出 CSV。
8. 检查 CSV 字段、页数、总条数是否符合预期。

## 11. 常见问题排查

捕获不到接口：

- 检查 `parse.ts` 里的接口路径是否写对。
- 检查接口是不是从当前页面发出的。
- 刷新页面或重新点击筛选，让页面重新请求接口。

Popup 自动选错功能：

- 检查 `index.ts` 的 `matchPageUrl` 是否写得太宽。
- 每个 feature 尽量匹配具体页面路径。

导出只有第一页：

- 检查 `pagination.ts` 的 `extractPageResult` 路径是否正确。
- 检查接口返回里是否真的有 `total` 和 `page_size`。

多页导出为空或重复：

- 检查 `mergeMultiPageResponses` 写回的列表路径是否和 `parse.ts` 一致。
- 检查 `buildPageUrls` 修改的分页参数名是否正确。

CSV 字段为空：

- 对照真实 JSON 检查字段路径。
- 字段可能在数组里，例如 `shop_list[0].shop_name`。
- 缺字段时导出空字符串是正常的，但关键字段全空通常说明路径写错。

金额或比例不对：

- 先确认接口单位。
- 金额如果是分，导出元要除以 100。
- 比例如果是 `0.1`，导出百分比要乘以 100。

编译报类型错误：

- 检查 `types.ts` 字段类型。
- 不确定字段是否存在时，加 `?`。
- 读取嵌套对象时用 `?? {}` 或可选链 `?.`。

## 12. 开发小抄

新增接口最小步骤：

1. 保存接口返回 JSON。
2. 新建 `src/features/xxx/`。
3. 写 `types.ts`。
4. 写 `parse.ts`，先让当前页能解析出 CSV。
5. 写 `pagination.ts`，让导出能拉全页。
6. 写 `index.ts`，补齐 `CaptureFeature`。
7. 在 `src/features/index.ts` 注册。
8. 跑 `npm run compile`。
9. 打开页面实际导出 CSV 检查。

优先保持代码简单直白。新增接口时只改当前接口相关文件，不顺手重构其它功能。
