<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import { createCsvContent } from '../../src/shared/csv';
import { GET_TAB_CAPTURE } from '../../src/shared/protocol';
import type { Capture, CaptureStateResponse, RequestSeen } from '../../src/shared/types';
import { shopRankFeature } from '../../src/features/shop-rank';

type NoticeType = 'success' | 'info' | 'warning' | 'error';

const COMPASS_HOST = 'compass.jinritemai.com';
// WXT 的 PublicPath 类型只校验带开头 / 的形式（见 .wxt/types/paths.d.ts），
// Chrome 运行时对带不带 / 都能解析，这里沿用类型安全的写法。
// 关键修复是 allFrames: true，让兜底注入覆盖所有 frame。
const BRIDGE_SCRIPT_FILE = '/content-scripts/shop-rank-bridge.js';
const PAGE_SCRIPT_FILE = '/content-scripts/shop-rank-page.js';

// 当前弹窗对应的数据类型（后续加数据时可切换为其它 feature）。
const captureType = shopRankFeature.id;
// 给用户看的中文名称，用于提示文案。
const dataTypeName = shopRankFeature.displayName;

const loading = ref(false);
const capture = ref<Capture | null>(null);
const noticeType = ref<NoticeType>('info');
const noticeMessage = ref(`请先打开 ${dataTypeName} 页面，并刷新页面触发接口请求。`);
// 保留最近一次 background 返回的原始响应，供诊断面板展示，方便定位捕获失败原因。
const lastResponse = ref<CaptureStateResponse | null>(null);

const recordCount = computed(() => capture.value?.records.length ?? 0);
const canDownload = computed(() => Boolean(capture.value && recordCount.value > 0));
const capturedTimeText = computed(() => {
  if (!capture.value) {
    return '-';
  }

  return new Date(capture.value.capturedAt).toLocaleString('zh-CN');
});

const requestSeenText = computed(() => formatRequestSeen(lastResponse.value?.requestSeen ?? null));

onMounted(() => {
  void loadLatestCapture();
});

async function loadLatestCapture() {
  loading.value = true;

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      throw new Error('没有找到当前活动标签页。');
    }

    assertCompassTab(tab.url);

    // 统一向 background 查询当前 tab、指定数据类型的捕获，不再直接问顶层 frame，
    // 避免 iframe / 微前端 frame 里的捕获拿不到。
    const response = await requestLatestCapture(tab.id);
    lastResponse.value = response;

    // 多页获取进行中：显示进度，用户可以隔几秒刷新查看最新状态。
    if (response.captureProgress && response.captureProgress.status === 'fetching') {
      const { currentPage, totalPages } = response.captureProgress;
      noticeType.value = 'info';
      noticeMessage.value = `正在获取全部数据：第 ${currentPage}/${totalPages} 页...`;
      return;
    }

    if (response.hasRawCapture) {
      capture.value = response.capture;
      updateNoticeByResponse(response);
      return;
    }

    // 还没捕获到接口响应。先看脚本注入情况，再给针对性提示。
    capture.value = null;

    if (!response.bridgeReady) {
      // 脚本还没注入（常见于先打开页面、后重载插件），这里兜底注入所有 frame。
      const frameCount = await ensureCaptureScriptsInjected(tab.id);
      noticeType.value = 'info';
      noticeMessage.value = `已注入 ${frameCount} 个 frame，请刷新 ${dataTypeName} 页面或点击页面筛选触发接口后，再点刷新捕获。`;
      return;
    }

    if (!response.pageReady) {
      // bridge 装上了但 page 脚本没上报，多半是 MAIN world 注入失败。
      noticeType.value = 'warning';
      noticeMessage.value = '采集 bridge 已就绪，但页面 patch 脚本未上报。可能是 MAIN world 注入失败，请刷新页面后再试。';
      return;
    }

    if (response.fetchPatched === false) {
      // page 脚本装上了，但 fetch 没被 patch 成功（被框架覆盖），DOMContentLoaded 已尝试重打。
      noticeType.value = 'warning';
      noticeMessage.value = '页面 fetch 未成功 patch（可能被框架覆盖）。已尝试在 DOMContentLoaded 重打补丁，请刷新页面后再点刷新捕获。';
      return;
    }

    if (response.requestSeen) {
      // background 探测到请求时已经尝试了重取。重取成功的话 capture 应该非空，
      // 不会走到这个分支；走到这里说明重取也失败了。
      const time = new Date(response.requestSeen.at).toLocaleTimeString('zh-CN');
      noticeType.value = 'warning';
      noticeMessage.value = `已检测到接口请求（${time}），但背景重取未成功。请确认已登录罗盘，或尝试刷新页面后重试。`;
      return;
    }

    // 脚本就绪、fetch 已 patch，但还没看到请求，提示用户去触发接口。
    noticeType.value = 'info';
    noticeMessage.value = `采集脚本已就绪，请刷新 ${dataTypeName} 页面或点击页面筛选按钮触发接口后，再点刷新捕获。`;
  } catch (error) {
    capture.value = null;
    noticeType.value = 'warning';
    noticeMessage.value = getFriendlyErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

function assertCompassTab(url: string | undefined) {
  if (!url) {
    throw new Error('当前标签页地址不可读，请切到罗盘页面后再试。');
  }

  const parsedUrl = new URL(url);

  if (parsedUrl.hostname !== COMPASS_HOST) {
    throw new Error('请先切到 compass.jinritemai.com 的罗盘页面，再点击刷新捕获。');
  }
}

async function requestLatestCapture(tabId: number): Promise<CaptureStateResponse> {
  const response = await browser.runtime.sendMessage({ type: GET_TAB_CAPTURE, tabId, captureType }) as CaptureStateResponse | undefined;

  if (!response?.ok) {
    throw new Error(response?.error || '当前页面还没有准备好。');
  }

  return response;
}

async function ensureCaptureScriptsInjected(tabId: number): Promise<number> {
  // bridge 先注入隔离环境，负责接收主页面的 postMessage 并上报 background。
  const bridgeResults = await browser.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: [BRIDGE_SCRIPT_FILE]
  });

  // 接口请求由页面自己的 JS 发起，只有 MAIN world 才能 patch 到页面真实的 fetch/XHR。
  await browser.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: [PAGE_SCRIPT_FILE],
    world: 'MAIN'
  });

  // executeScript 返回每个 frame 的注入结果，数组长度即命中的 frame 数。
  return bridgeResults.length;
}

function updateNoticeByResponse(response: CaptureStateResponse) {
  if (response.hasRawCapture && response.error) {
    noticeType.value = 'error';
    noticeMessage.value = response.error;
    return;
  }

  updateNoticeByCapture(response.capture);
}

function updateNoticeByCapture(nextCapture: Capture | null) {
  if (!nextCapture) {
    noticeType.value = 'info';
    noticeMessage.value = '采集脚本已加载，但还没有捕获到接口响应。请刷新页面或点击页面筛选按钮触发接口后，再点刷新捕获。';
    return;
  }

  if (nextCapture.records.length === 0) {
    noticeType.value = 'warning';
    noticeMessage.value = '已捕获到接口响应，但没有从响应里解析出列表数据。';
    return;
  }

  noticeType.value = 'success';
  noticeMessage.value = `已捕获当前页 ${nextCapture.records.length} 条记录，可以下载 CSV。`;
}

function downloadCsv() {
  if (!capture.value || capture.value.records.length === 0) {
    return;
  }

  const csvContent = createCsvContent(capture.value.records);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = downloadUrl;
  link.download = shopRankFeature.getFileName(capture.value);
  link.click();

  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

function getFriendlyErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return message || '读取当前页数据失败，请刷新页面后重试。';
}

function formatBool(value: boolean | undefined): string {
  if (value === undefined) {
    return '-';
  }

  return value ? '是' : '否';
}

function formatRequestSeen(value: RequestSeen | null): string {
  if (!value) {
    return '无';
  }

  const time = new Date(value.at).toLocaleTimeString('zh-CN');
  return `${time}（${value.url}）`;
}
</script>

<template>
  <main class="popup-page">
    <a-typography-title :level="4" class="popup-title">DY Capture</a-typography-title>
    <a-typography-paragraph class="popup-description">
      捕获{{ dataTypeName }}当前页接口响应，并导出 CSV。
    </a-typography-paragraph>

    <a-alert class="popup-alert" :type="noticeType" :message="noticeMessage" show-icon />

    <section class="capture-summary">
      <div class="summary-row">
        <span class="summary-label">当前页记录</span>
        <strong>{{ recordCount }}</strong>
      </div>
      <div class="summary-row">
        <span class="summary-label">捕获时间</span>
        <span>{{ capturedTimeText }}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">页码</span>
        <span>{{ capture?.pageNo ?? '-' }}</span>
      </div>
    </section>

    <div class="button-row">
      <a-button block :loading="loading" @click="loadLatestCapture">
        刷新捕获
      </a-button>
      <a-button type="primary" block :disabled="!canDownload" @click="downloadCsv">
        下载 CSV
      </a-button>
    </div>

    <!-- 诊断面板默认收起，只在排查捕获失败时展开查看，避免把技术细节暴露给普通用户。 -->
    <a-collapse class="debug-collapse" :bordered="false" ghost :default-active-key="[]">
      <a-collapse-panel key="debug" header="诊断信息">
        <div class="summary-row">
          <span class="summary-label">bridge 就绪</span>
          <span>{{ formatBool(lastResponse?.bridgeReady) }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">page 脚本就绪</span>
          <span>{{ formatBool(lastResponse?.pageReady) }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">fetch 已 patch</span>
          <span>{{ formatBool(lastResponse?.fetchPatched) }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">XHR 已 patch</span>
          <span>{{ formatBool(lastResponse?.xhrPatched) }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">接口请求</span>
          <span>{{ requestSeenText }}</span>
        </div>
      </a-collapse-panel>
    </a-collapse>
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

.popup-alert {
  margin-bottom: 16px;
}

.capture-summary {
  padding: 12px 0;
  border-top: 1px solid #eeeeee;
  border-bottom: 1px solid #eeeeee;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  line-height: 28px;
}

.summary-label {
  color: #666666;
}

.button-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 16px;
}

.debug-collapse {
  margin-top: 12px;
}
</style>
