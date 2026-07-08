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

export function formatBeijingDateTime(value: Date | string): string {
    const date = typeof value === 'string' ? new Date(value) : value;
    const formatter = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(date);

    // CSV 面向国内用户，导出时间固定用北京时间，避免浏览器所在时区导致时间看起来不一致。
    const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';

    return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
}
