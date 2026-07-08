<script setup lang="ts">
import { useCapturePopup } from './useCapturePopup';

const {
    selectedFeatureId,
    featureOptions,
    dataTypeName,
    loading,
    exporting,
    capture,
    noticeType,
    noticeMessage,
    lastResponse,
    showDebug,
    canDownload,
    exportProgressText,
    requestCapturedText,
    csvReadyText,
    requestSeenText,
    loadLatestCapture,
    downloadCsv,
    onFeatureChange,
    formatBool
} = useCapturePopup();
</script>

<template>
    <main class="popup-page">
        <a-typography-title :level="4" class="popup-title">DY Capture</a-typography-title>

        <!-- 数据类型下拉框：来自统一注册表，新增页面/接口提取功能会自动出现。 -->
        <a-select v-model:value="selectedFeatureId" :options="featureOptions" @change="onFeatureChange" style="width: 100%; margin-bottom: 12px" />

        <a-typography-paragraph class="popup-description">捕获{{ dataTypeName }}当前页接口响应，并导出 CSV。</a-typography-paragraph>

        <section class="capture-status">
            <a-alert class="status-alert" :type="noticeType" :message="noticeMessage" show-icon />

            <div class="status-rows">
                <div class="status-row">
                    <span class="status-label">接口请求</span>
                    <strong>{{ requestCapturedText }}</strong>
                </div>
                <div class="status-row">
                    <span class="status-label">CSV 导出</span>
                    <span>{{ csvReadyText }}</span>
                </div>
                <div class="status-row">
                    <span class="status-label">导出进度</span>
                    <span>{{ exportProgressText }}</span>
                </div>
            </div>
        </section>

        <div class="button-row">
            <a-button block :loading="loading" :disabled="exporting" @click="loadLatestCapture">刷新捕获</a-button>
            <a-button type="primary" block :loading="exporting" :disabled="!canDownload" @click="downloadCsv">下载 CSV</a-button>
        </div>

        <!-- 诊断面板：开关控制显隐，默认收起，避免把技术细节暴露给普通用户。 -->
        <div class="debug-section">
            <div class="debug-toggle" @click="showDebug = !showDebug">
                <span>调试信息</span>
                <span class="debug-arrow" :class="{ expanded: showDebug }">▶</span>
            </div>
            <div v-if="showDebug" class="debug-panel">
                <div class="debug-row">
                    <span class="debug-label">脚本就绪</span>
                    <span>{{ formatBool(lastResponse?.bridgeReady) }}</span>
                </div>
                <div class="debug-row">
                    <span class="debug-label">page 脚本就绪</span>
                    <span>{{ formatBool(lastResponse?.pageReady) }}</span>
                </div>
                <div class="debug-row">
                    <span class="debug-label">fetch 已 patch</span>
                    <span>{{ formatBool(lastResponse?.fetchPatched) }}</span>
                </div>
                <div class="debug-row">
                    <span class="debug-label">XHR 已 patch</span>
                    <span>{{ formatBool(lastResponse?.xhrPatched) }}</span>
                </div>
                <div class="debug-row debug-row-url">
                    <span class="debug-label">接口请求</span>
                    <span class="debug-value-url">{{ requestSeenText }}</span>
                </div>
            </div>
        </div>
    </main>
</template>

<style scoped>
.popup-page {
    width: 360px;
    min-height: 260px;
    padding: 20px;
    background: #ffffff;
}

.popup-title {
    margin-bottom: 8px;
}

.popup-description {
    color: #555555;
}

.capture-status {
    padding-bottom: 12px;
    border-bottom: 1px solid #eeeeee;
}

.status-alert {
    margin-bottom: 12px;
}

.status-rows {
    padding: 4px 0;
}

.status-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    line-height: 28px;
}

.status-label {
    color: #666666;
}

.button-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 16px;
}

/* 调试面板：开关 + 技术细节区域 */
.debug-section {
    margin-top: 12px;
}

.debug-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    cursor: pointer;
    color: #999999;
    font-size: 13px;
    user-select: none;
    transition: color 0.2s;
}

.debug-toggle:hover {
    color: #666666;
}

.debug-arrow {
    display: inline-block;
    font-size: 10px;
    transition: transform 0.2s;
}

.debug-arrow.expanded {
    transform: rotate(90deg);
}

.debug-panel {
    margin-top: 8px;
    padding: 10px 12px;
    background: #fafafa;
    border-radius: 6px;
    font-size: 12px;
    line-height: 22px;
}

.debug-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
}

.debug-row + .debug-row {
    margin-top: 4px;
}

.debug-label {
    color: #888888;
    flex-shrink: 0;
}

.debug-value-url {
    text-align: right;
    word-break: break-all;
    color: #555555;
}
</style>
