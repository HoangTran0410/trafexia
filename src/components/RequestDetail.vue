<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Copy,
  Terminal,
  ChevronDown,
  ChevronRight,
  X,
  ArrowUpFromLine,
  ArrowDownFromLine,
  RefreshCw
} from 'lucide-vue-next';
import { useToast } from 'primevue/usetoast';
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import 'highlight.js/styles/github-dark.css';

import { useTrafficStore } from '@/stores/trafficStore';
import { useLicenseStore } from '@/stores/licenseStore';
import {
  getStatusClass,
  prettyPrintJson,
  generateCurl,
  detectContentCategory
} from '@/utils/formatters';

hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);

const toast = useToast();
const trafficStore = useTrafficStore();
const licenseStore = useLicenseStore();
const activeTab = ref<'headers' | 'body' | 'response' | 'raw'>('headers');
const showRequestHeaders = ref(true);
const showResponseHeaders = ref(true);

const request = computed(() => trafficStore.selectedRequest);

const requestHeaders = computed(() => {
  if (!request.value) return [];
  return Object.entries(request.value.requestHeaders).map(([name, value]) => ({ name, value }));
});

const responseHeaders = computed(() => {
  if (!request.value?.responseHeaders) return [];
  return Object.entries(request.value.responseHeaders).map(([name, value]) => ({ name, value: value || '' }));
});

const formattedRequestBody = computed(() => {
  if (!request.value?.requestBody) return null;
  const contentType = request.value.requestHeaders?.['content-type'] || '';
  if (detectContentCategory(contentType) === 'json') {
    try {
      const formatted = prettyPrintJson(request.value.requestBody);
      const highlighted = hljs.highlight(formatted, { language: 'json' }).value;
      return { html: highlighted, raw: formatted };
    } catch (e) {
      console.warn('[RequestDetail] Failed to format request body:', e);
      return { html: null, raw: request.value.requestBody };
    }
  }
  return { html: null, raw: request.value.requestBody };
});

const formattedResponseBody = computed(() => {
  if (!request.value?.responseBody) return null;
  const category = detectContentCategory(request.value.contentType || '');
  if (category === 'json') {
    try {
      const formatted = prettyPrintJson(request.value.responseBody);
      const highlighted = hljs.highlight(formatted, { language: 'json' }).value;
      return { html: highlighted, raw: formatted, type: 'json' };
    } catch (e) {
      console.warn('[RequestDetail] Failed to format response body:', e);
      return { html: null, raw: request.value.responseBody, type: 'text' };
    }
  }
  if (category === 'html' || category === 'xml') {
    try {
      const highlighted = hljs.highlight(request.value.responseBody, { language: 'xml' }).value;
      return { html: highlighted, raw: request.value.responseBody, type: 'html' };
    } catch (e) {
      console.warn('[RequestDetail] Failed to format HTML body:', e);
      return { html: null, raw: request.value.responseBody, type: 'text' };
    }
  }
  return { html: null, raw: request.value.responseBody || '', type: 'text' };
});

async function copyToClipboard(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ severity: 'success', summary: 'Copied', detail: message, life: 2000 });
  } catch {
    toast.add({ severity: 'error', summary: 'Failed', detail: 'Could not copy', life: 3000 });
  }
}

function copyUrl() {
  if (!licenseStore.guardFeature('copy-url')) return;
  if (request.value) copyToClipboard(request.value.url, 'URL copied');
}

function copyAsCurl() {
  if (!licenseStore.guardFeature('copy-curl')) return;
  if (request.value) copyToClipboard(generateCurl(request.value), 'cURL command copied');
}

function copyRequestBody() {
  if (request.value?.requestBody) {
    copyToClipboard(request.value.requestBody, 'Request body copied');
  } else {
    toast.add({ severity: 'info', summary: 'Empty', detail: 'No request body', life: 2000 });
  }
}

function copyResponseBody() {
  if (request.value?.responseBody) {
    copyToClipboard(request.value.responseBody, 'Response body copied');
  } else {
    toast.add({ severity: 'info', summary: 'Empty', detail: 'No response body', life: 2000 });
  }
}

const isReplaying = ref(false);

async function replayRequest() {
  if (!request.value || isReplaying.value) return;
  if (!licenseStore.guardFeature('replay')) return;
  
  isReplaying.value = true;
  try {
    toast.add({ severity: 'info', summary: 'Replaying...', detail: `${request.value.method} ${request.value.url}`, life: 2000 });
    await window.electronAPI.replayRequest(request.value.id);
    toast.add({ severity: 'success', summary: 'Replayed', detail: 'Request sent successfully', life: 3000 });
  } catch (error) {
    console.error('Failed to replay request:', error);
    toast.add({ severity: 'error', summary: 'Failed', detail: 'Could not replay request', life: 3000 });
  } finally {
    isReplaying.value = false;
  }
}

function close() {
  trafficStore.setSelectedRequest(null);
}
</script>

<template>
  <div v-if="request"
    style="position: relative; height: 100%; display: flex; flex-direction: column; background: #161b22; overflow: hidden;">


    <!-- Header -->
    <div
      style="display: flex; align-items: center; gap: 10px; padding: 8px 16px; background: #21262d; border-bottom: 1px solid rgba(48, 54, 61, 0.8);">
      <span :class="['method-badge', request.method]">{{ request.method }}</span>
      <span :class="['status-badge', getStatusClass(request.status)]">
        {{ request.status || '...' }}
      </span>
      <span
        style="flex: 1; font-family: monospace; font-size: 13px; color: #e6edf3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
        :title="request.url">{{ request.url }}</span>

      <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
        <!-- Replay (free, remotely gateable) -->
        <button
          class="btn btn-ghost btn-icon"
          @click="replayRequest"
          :disabled="isReplaying || !licenseStore.hasFeature('replay')"
          :title="licenseStore.hasFeature('replay') ? 'Replay Request' : 'Replay — Locked'"
          :class="{ 'feature-locked': !licenseStore.hasFeature('replay') }"
        >
          <RefreshCw style="width: 16px; height: 16px;" :class="{ 'animate-spin': isReplaying }" />
        </button>
        <div style="width: 1px; height: 16px; background: #30363d; margin: 0 4px;"></div>

        <!-- Copy URL (free, remotely gateable) -->
        <button
          class="btn btn-ghost btn-icon"
          @click="copyUrl"
          :title="licenseStore.hasFeature('copy-url') ? 'Copy URL' : 'Copy URL — Locked'"
          :class="{ 'feature-locked': !licenseStore.hasFeature('copy-url') }"
        >
          <Copy style="width: 16px; height: 16px;" />
        </button>

        <!-- Copy as cURL (free, remotely gateable) -->
        <button
          class="btn btn-ghost btn-icon"
          @click="copyAsCurl"
          :title="licenseStore.hasFeature('copy-curl') ? 'Copy as cURL' : 'Copy cURL — Locked'"
          :class="{ 'feature-locked': !licenseStore.hasFeature('copy-curl') }"
        >
          <Terminal style="width: 16px; height: 16px;" />
        </button>
        <button class="btn btn-ghost btn-icon" @click="copyRequestBody" title="Copy Request Body">
          <ArrowUpFromLine style="width: 16px; height: 16px;" />
        </button>
        <button class="btn btn-ghost btn-icon" @click="copyResponseBody" title="Copy Response Body">
          <ArrowDownFromLine style="width: 16px; height: 16px;" />
        </button>
        <div style="width: 1px; height: 16px; background: #30363d; margin: 0 4px;"></div>
        <button class="btn btn-ghost btn-icon" @click="close" title="Close Panel">
          <X style="width: 16px; height: 16px; color: #f85149;" />
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="detail-tabs">
      <button type="button" class="detail-tab" :class="{ active: activeTab === 'headers' }"
        @click.stop="activeTab = 'headers'">Headers</button>
      <button type="button" class="detail-tab" :class="{ active: activeTab === 'body' }"
        @click.stop="activeTab = 'body'">Body</button>
      <button type="button" class="detail-tab" :class="{ active: activeTab === 'response' }"
        @click.stop="activeTab = 'response'">Response</button>
      <button type="button" class="detail-tab" :class="{ active: activeTab === 'raw' }"
        @click.stop="activeTab = 'raw'">Raw</button>
    </div>

    <!-- Content -->
    <div class="detail-content">
      <!-- Headers Tab -->
      <div v-if="activeTab === 'headers'" class="tab-content">
        <!-- Request Headers -->
        <div class="headers-section">
          <button class="section-toggle" @click="showRequestHeaders = !showRequestHeaders">
            <ChevronDown v-if="showRequestHeaders" class="w-4 h-4" />
            <ChevronRight v-else class="w-4 h-4" />
            <span>Request Headers</span>
            <span class="header-count">{{ requestHeaders.length }}</span>
          </button>
          <table v-if="showRequestHeaders" class="headers-table">
            <tr v-for="header in requestHeaders" :key="header.name">
              <td class="header-name">{{ header.name }}</td>
              <td class="header-value">{{ header.value }}</td>
            </tr>
          </table>
        </div>

        <!-- Response Headers -->
        <div class="headers-section">
          <button class="section-toggle" @click="showResponseHeaders = !showResponseHeaders">
            <ChevronDown v-if="showResponseHeaders" class="w-4 h-4" />
            <ChevronRight v-else class="w-4 h-4" />
            <span>Response Headers</span>
            <span class="header-count">{{ responseHeaders.length }}</span>
          </button>
          <table v-if="showResponseHeaders" class="headers-table">
            <tr v-for="header in responseHeaders" :key="header.name">
              <td class="header-name">{{ header.name }}</td>
              <td class="header-value">{{ header.value }}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Body Tab -->
      <div v-if="activeTab === 'body'" class="tab-content">
        <div v-if="request.requestBody" class="code-block">
          <pre v-if="formattedRequestBody?.html" v-html="formattedRequestBody.html"></pre>
          <pre v-else>{{ formattedRequestBody?.raw }}</pre>
        </div>
        <p v-else class="no-content">No request body</p>
      </div>

      <!-- Response Tab -->
      <div v-if="activeTab === 'response'" class="tab-content">
        <div v-if="request.responseBody" class="code-block">
          <pre v-if="formattedResponseBody?.html" v-html="formattedResponseBody.html"></pre>
          <pre v-else>{{ formattedResponseBody?.raw }}</pre>
        </div>
        <p v-else class="no-content">No response body</p>
      </div>

      <!-- Raw Tab -->
      <div v-if="activeTab === 'raw'" class="tab-content raw-content">
        <div class="raw-section">
          <h4>Request</h4>
          <div class="code-block compact">
            <pre>{{ request.method || '' }} {{ request.path || '' }} HTTP/1.1
Host: {{ request.host || '' }}
{{request.requestHeaders ? Object.entries(request.requestHeaders).filter(([k]) => k.toLowerCase() !== 'host').map(([k, v]) => `${k}: ${v || ''}`).join('\n') : ''}}

{{ request.requestBody || '' }}</pre>
          </div>
        </div>
        <div class="raw-section">
          <h4>Response</h4>
          <div class="code-block compact">
            <pre>HTTP/1.1 {{ request.status || 0 }}
{{request.responseHeaders ? Object.entries(request.responseHeaders).map(([k, v]) => `${k}: ${v || ''}`).join('\n') : ''}}

{{ request.responseBody || '' }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.request-detail {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  min-height: 48px;
}

.detail-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.detail-url {
  flex: 1;
  font-family: 'SF Mono', monospace;
  font-size: 13px;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.close-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: var(--color-error);
  color: white;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}

.close-button:hover {
  filter: brightness(1.1);
}

.detail-tabs {
  display: flex;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  padding: 0 16px;
}

.detail-tab {
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: -1px;
}

.detail-tab:hover {
  color: var(--color-text-primary);
}

.detail-tab.active {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}

.detail-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.headers-section {
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  overflow: hidden;
}

.section-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: none;
  border: none;
  color: var(--color-text-primary);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.section-toggle:hover {
  background: var(--color-bg-elevated);
}

.header-count {
  margin-left: auto;
  font-weight: 400;
  color: var(--color-text-muted);
}

.headers-table {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}

.headers-table tr {
  border-top: 1px solid var(--color-border);
}

.headers-table td {
  padding: 8px 16px;
  vertical-align: top;
}

.header-name {
  width: 200px;
  font-weight: 500;
  color: var(--color-accent);
  font-family: 'SF Mono', monospace;
  font-size: 12px;
}

.header-value {
  color: var(--color-text-secondary);
  font-family: 'SF Mono', monospace;
  font-size: 12px;
  word-break: break-all;
}

.code-block {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
  font-family: 'SF Mono', monospace;
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.code-block.compact {
  padding: 12px;
  font-size: 12px;
}

.code-block pre {
  margin: 0;
}

.no-content {
  color: var(--color-text-muted);
  font-style: italic;
  text-align: center;
  padding: 40px;
}

.raw-content {
  gap: 24px;
}

.raw-section h4 {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}

.feature-locked {
  opacity: 0.35;
  cursor: not-allowed !important;
  pointer-events: none;
}
</style>
