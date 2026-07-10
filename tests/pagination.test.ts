import assert from 'node:assert/strict';
import {
    buildPageUrls,
    extractPageResultAtPath,
    mergePageResponses
} from '../src/shared/pagination';

const firstPage = {
    data: {
        page_result: {
            page_no: 1,
            page_size: 20,
            total: 25
        },
        data_result: [{ id: 1 }]
    }
};

const secondPage = {
    data: {
        data_result: [{ id: 2 }]
    }
};

// 分页字段路径和列表字段由 feature 提供，通用逻辑不依赖任何具体接口。
assert.deepEqual(
    extractPageResultAtPath(firstPage, ['data', 'page_result']),
    { pageNo: 1, pageSize: 20, total: 25 }
);
assert.deepEqual(
    buildPageUrls('https://example.com/api?keyword=zippo&page_no=1', 3),
    [
        'https://example.com/api?keyword=zippo&page_no=2',
        'https://example.com/api?keyword=zippo&page_no=3'
    ]
);

const merged = mergePageResponses({
    responses: [firstPage, secondPage],
    getRows: response => (response as { data?: { data_result?: unknown[] } }).data?.data_result ?? null,
    targetPath: ['data'],
    targetField: 'data_result'
}) as { data: { data_result: Array<{ id: number }> } };

assert.deepEqual(merged.data.data_result, [{ id: 1 }, { id: 2 }]);
assert.deepEqual(firstPage.data.data_result, [{ id: 1 }]);

console.log('pagination helpers ok');
