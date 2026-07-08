import type { JsonRecord } from './types';

// 常见列表字段名，罗盘等接口字段可能调整，先找它们，再兜底找第一组对象数组。
const LIST_FIELD_NAMES = ['list', 'rank_list', 'rankList', 'records', 'items', 'data_list', 'dataList', 'shop_list', 'shopList'];

// 按路径读取嵌套字段，任意一层不是普通对象就返回 undefined。
export function getPath (value: unknown, path: string[]): unknown {
    let current = value;

    for (const key of path) {
        if (!isPlainObject(current)) {
            return undefined;
        }

        current = current[key];
    }

    return current;
}

// 判断是否为「非空且每个元素都是普通对象」的数组，用于识别候选列表数据。
export function isRecordArray (value: unknown): value is JsonRecord[] {
    return Array.isArray(value) && value.length > 0 && value.every(isPlainObject);
}

// 判断是否为普通对象（非 null、非数组），用于安全地按字段名访问。
export function isPlainObject (value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 从原始响应里提取记录列表：优先匹配常见列表字段，否则兜底找第一组对象数组。
// 接口结构可能会调整，罗盘字段找不到时仍能尽量拿到数据。
export function findRecordList (value: unknown): JsonRecord[] {
    const found = findListByPreferredField(value);

    if (found) {
        return found;
    }

    const fallback = findFirstObjectArray(value);
    return fallback ?? [];
}

function findListByPreferredField (value: unknown): JsonRecord[] | null {
    if (!isPlainObject(value)) {
        return null;
    }

    for (const fieldName of LIST_FIELD_NAMES) {
        const fieldValue = value[fieldName];

        if (isRecordArray(fieldValue)) {
            return fieldValue;
        }
    }

    for (const childValue of Object.values(value)) {
        const found = findListByPreferredField(childValue);

        if (found) {
            return found;
        }
    }

    return null;
}

function findFirstObjectArray (value: unknown): JsonRecord[] | null {
    if (isRecordArray(value)) {
        return value;
    }

    if (!isPlainObject(value) && !Array.isArray(value)) {
        return null;
    }

    const childValues = Array.isArray(value) ? value : Object.values(value);

    for (const childValue of childValues) {
        const found = findFirstObjectArray(childValue);

        if (found) {
            return found;
        }
    }

    return null;
}
