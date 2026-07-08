<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import { createCsvContent } from '../../src/shared/csv';
import { FEATURES, findFeatureByPageUrl } from '../../src/features';
import {
    GET_ALL_TAB_CAPTURE,
    GET_TAB_CAPTURE,
    type GetAllTabCaptureResponse
} from '../../src/shared/protocol';
import type { Capture, CaptureStateResponse, RequestSeen } from '../../src/shared/types';

type NoticeType = 'success' | 'info' | 'warning' | 'error';

// 通用内容脚本产物路径，覆盖所有 feature，新增 feature 时无需新增脚本文件。
const PAGE_SCRIPT_FILE = '/content-scripts/capture.js';

// 当前选中的数据类型（下拉框绑定）。打开弹窗时会按页面地址 / 已抓数据自动匹配。
const selectedFeatureId = ref<string>(FEATURES[0].id);
const selectedFeature = computed(() => FEATURES.find(f => f.id === selectedFeatureId.value)!);

// 下拉框选项：来自统一注册表，新增 feature 自动出现。
const featureOptions = computed(() => FEATURES.map(f => ({ label: f.displayName, value: f.id })));

// 给用户看的中文名称，用于提示文案（随选中项变化）。
const dataTypeName = computed(() => selectedFeature.value.displayName);

const loading = ref(false);
const capture = ref<Capture | null>(null);
const noticeType = ref<NoticeType>('info');
const noticeMessage = ref(`请先打开 ${dataTypeName.value} 页面，并刷新页面触发接口请求。`);
// 保留最近一次 background 返回的原始响应，供诊断面板展示，方便定位捕获失败原因。
const lastResponse = ref<CaptureStateResponse | null>(null);
// 诊断面板开关：默认关闭，用户主动展开查看技术细节。
const showDebug = ref(false);
// 自动轮询定时器：多页抓取进行中时，定时刷新状态展示。
let pollTimer: ReturnType<typeof setInterval> | null = null;
// 轮询间隔（毫秒），兼顾实时性和对 background 的请求压力。
const POLL_INTERVAL = 1500;

const recordCount = computed(() => capture.value?.records.length ?? 0);
const canDownload = computed(() => Boolean(capture.value && recordCount.value > 0));
const capturedTimeText = computed(() => {
  if (!capture.value) {
    return '-';
  }

  return new Date(capture.value.capturedAt).toLocaleString('zh-CN');
});

const requestSeenText = computed(() => formatRequestSeen(lastResponse.value?.requestSeen ?? null));

onMounted(async () => {
  // 先按当前页面自动匹配提取组件，再加载对应捕获。
  await autoSelectFeature();
  await loadLatestCapture();
});

// popup 关闭或组件卸载时清除轮询，避免内存泄漏。
onUnmounted(() => {
  stopPolling();
});

// 下拉框切换：清空旧数据并重新加载新选中的数据类型。
function onFeatureChange() {
  capture.value = null;
  lastResponse.value = null;
  void loadLatestCapture();
}

// 自动匹配：先按当前标签页页面地址匹配；没命中再选「当前 tab 已抓到数据」的 feature；都没有则默认第一个。
async function autoSelectFeature() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  const matchedByPage = tab?.url ? findFeatureByPageUrl(tab.url) : undefined;

  if (matchedByPage) {
    selectedFeatureId.value = matchedByPage.id;
    return;
  }

  if (tab?.id) {
    const all = await requestAllCapture(tab.id);
    const hit = all.features.find(f => f.state.hasRawCapture);

    if (hit) {
      selectedFeatureId.value = hit.id;
      return;
    }
  }

  selectedFeatureId.value = FEATURES[0].id;
}

async function loadLatestCapture() {
  loading.value = true;

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      throw new Error('没有找到当前活动标签页。');
    }

    assertFeatureTab(tab.url);

    // 统一向 background 查询当前 tab、指定数据类型的捕获，不再直接问顶层 frame，
    // 避免 iframe / 微前端 frame 里的捕获拿不到。
    const response = await requestLatestCapture(tab.id);
    lastResponse.value = response;

    // 多页获取进行中：显示进度，并启动自动轮询刷新。
    if (response.captureProgress && response.captureProgress.status === 'fetching') {
      const { currentPage, totalPages } = response.captureProgress;
      noticeType.value = 'info';
      noticeMessage.value = `正在获取全部数据：第 ${currentPage}/${totalPages} 页...`;
      startPolling();
      return;
    }

    if (response.hasRawCapture) {
      capture.value = response.capture;
      stopPolling(); // 数据已就绪，停止轮询
      updateNoticeByResponse(response);
      return;
    }

    // 还没捕获到接口响应。先看脚本注入情况，再给针对性提示。
    capture.value = null;
    stopPolling(); // 非抓取中状态，停止轮询

    if (!response.bridgeReady) {
      // 脚本还没注入（常见于先打开页面、后重载插件），这里兜底注入所有 frame。
      const frameCount = await ensureCaptureScriptsInjected(tab.id);
      noticeType.value = 'info';
      noticeMessage.value = `已注入 ${frameCount} 个 frame，请刷新 ${dataTypeName.value} 页面或点击页面筛选触发接口后，再点刷新捕获。`;
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
    noticeMessage.value = `采集脚本已就绪，请刷新 ${dataTypeName.value} 页面或点击页面筛选按钮触发接口后，再点刷新捕获。`;
  } catch (error) {
    capture.value = null;
    stopPolling(); // 出错时停止轮询
    noticeType.value = 'warning';
    noticeMessage.value = getFriendlyErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

// 启动自动轮询：多页抓取进行中时，定时向 background 查询最新状态。
function startPolling() {
  stopPolling(); // 防止重复启动
  pollTimer = setInterval(() => {
    void loadLatestCapture();
  }, POLL_INTERVAL);
}

// 停止轮询：数据就绪、出错或组件卸载时调用。
function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function assertFeatureTab(url: string | undefined) {
  if (!url) {
    throw new Error('当前标签页地址不可读，请切到对应页面后再试。');
  }

  const host = new URL(url).hostname;

  if (!selectedFeature.value.hosts.includes(host)) {
    throw new Error(`请先切到 ${selectedFeature.value.hosts.join('/')} 的${dataTypeName.value}页面，再点击刷新捕获。`);
  }
}

async function requestLatestCapture(tabId: number): Promise<CaptureStateResponse> {
  const response = await browser.runtime.sendMessage({
    type: GET_TAB_CAPTURE,
    tabId,
    captureType: selectedFeature.value.id
  }) as CaptureStateResponse | undefined;

  if (!response?.ok) {
    throw new Error(response?.error || '当前页面还没有准备好。');
  }

  return response;
}

// 一次性拉取当前 tab 下所有数据类型的捕获状态，供自动匹配的「已抓数据兜底」使用。
async function requestAllCapture(tabId: number): Promise<GetAllTabCaptureResponse> {
  const response = await browser.runtime.sendMessage({
    type: GET_ALL_TAB_CAPTURE,
    tabId
  }) as GetAllTabCaptureResponse | undefined;

  if (!response?.ok) {
    return { ok: false, features: [] };
  }

  return response;
}

async function ensureCaptureScriptsInjected(tabId: number): Promise<number> {
  // 接口请求由页面自己的 JS 发起，只有 MAIN world 才能 patch 到页面真实的 fetch/XHR。
  // page 脚本安装后会直接上报 background，无需独立的 bridge 中转。
  const results = await browser.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: [PAGE_SCRIPT_FILE],
    world: 'MAIN'
  });

  // executeScript 返回每个 frame 的注入结果，数组长度即命中的 frame 数。
  return results.length;
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
  link.download = selectedFeature.value.getFileName(capture.value);
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

    <!-- 数据类型下拉框：来自统一注册表，新增页面/接口提取功能会自动出现。 -->
    <a-select
      v-model:value="selectedFeatureId"
      :options="featureOptions"
      @change="onFeatureChange"
      style="width: 100%; margin-bottom: 12px"
    />

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
