// 通用数字格式化工具：与具体数据类型无关，多个 feature 共用。

// 按中文千分位格式输出数字，并限制最大小数位数。
export function formatPlainNumber (value: number, maxFractionDigits: number): string {
    return value.toLocaleString('zh-CN', {
        maximumFractionDigits: maxFractionDigits
    });
}

// 把整数（含 undefined）格式化为中文千分位字符串，缺失时返回空串。
export function formatInteger (value: number | undefined): string {
    if (value === undefined) {
        return '';
    }

    return value.toLocaleString('zh-CN', {
        maximumFractionDigits: 0
    });
}

// 大数压缩展示：超过一万用「万」作单位（保留两位），否则按整数展示。
export function formatCompactNumber (value: number): string {
    if (Math.abs(value) >= 10000) {
        return `${formatPlainNumber(value / 10000, 2)}万`;
    }

    return formatPlainNumber(value, 0);
}
