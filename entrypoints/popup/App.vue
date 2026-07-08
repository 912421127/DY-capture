<script setup lang="ts">
import { useCapturePopup } from './useCapturePopup';

const {
    noticeType,
    noticeMessage,
    autoExportEnabled,
    autoExportLoading,
    openingAutoExportPages,
    testingAutoExport,
    hasOpenedAutoExportPages,
    autoExportPageText,
    autoExportResultText,
    autoExportStatusText,
    nextAutoExportText,
    openAutoExportPages,
    onAutoExportChange,
    testAutoExport
} = useCapturePopup();
</script>

<template>
    <main class="popup-page">
        <a-typography-title :level="4" class="popup-title">DY Capture</a-typography-title>

        <a-alert class="status-alert" :type="noticeType" :message="noticeMessage" show-icon />

        <section v-if="!hasOpenedAutoExportPages" class="entry-section">
            <a-typography-paragraph class="popup-description">先打开采集页面，插件会自动准备所有已支持的数据页面。</a-typography-paragraph>
            <a-button type="primary" block size="large" :loading="openingAutoExportPages" @click="openAutoExportPages">打开采集页面</a-button>
        </section>

        <section v-else class="auto-export-section">
            <!-- <div class="auto-export-header">
                <div>
                    <strong>自动导出</strong>
                    <div class="auto-export-tip">开启后每 1 小时静默导出一次</div>
                </div>
                <a-switch :checked="autoExportEnabled" :loading="autoExportLoading" @change="onAutoExportChange" />
            </div>

            <div class="status-rows auto-export-rows">
                <div class="status-row">
                    <span class="status-label">页面准备</span>
                    <span>{{ autoExportPageText }}</span>
                </div>
                <div class="status-row">
                    <span class="status-label">导出状态</span>
                    <span class="status-value">{{ autoExportStatusText }}</span>
                </div>
                <div class="status-row">
                    <span class="status-label">测试结果</span>
                    <span class="status-value">{{ autoExportResultText }}</span>
                </div>
                <div class="status-row">
                    <span class="status-label">下次执行</span>
                    <span>{{ nextAutoExportText }}</span>
                </div>
            </div> -->

            <a-button block :loading="testingAutoExport" @click="testAutoExport">手动导出</a-button>
        </section>
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

.entry-section {
    margin-top: 12px;
}

.auto-export-section {
    margin-top: 12px;
}

.auto-export-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
}

.auto-export-tip {
    margin-top: 4px;
    color: #777777;
    font-size: 12px;
}

.auto-export-rows {
    margin-bottom: 10px;
}

.status-value {
    max-width: 210px;
    text-align: right;
    word-break: break-all;
}
</style>
