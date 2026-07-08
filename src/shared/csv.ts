import type { JsonRecord } from './types';

// 收集所有记录中出现过的字段名（去重、保序），作为 CSV 表头。
function collectHeaders (records: JsonRecord[]): string[] {
    const headers = new Set<string>();

    for (const record of records) {
        for (const key of Object.keys(record)) {
            headers.add(key);
        }
    }

    return Array.from(headers);
}

// 单个单元格转 CSV 文本：嵌套对象保留为 JSON 字符串，避免接口字段暂未映射时丢失原始信息。
function formatCsvCell (value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

// 把记录数组拼成 CSV 文本。加 BOM 是为了让 Excel 直接打开中文 CSV 时不乱码。
export function createCsvContent (records: JsonRecord[]): string {
    const headers = collectHeaders(records);
    const rows = records.map(record => headers.map(header => formatCsvCell(record[header])).join(','));

    return ['﻿' + headers.join(','), ...rows].join('\n');
}
