<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTrafficStore } from '@/stores/trafficStore';
import { GitCompare, X, ArrowLeftRight, ChevronDown } from 'lucide-vue-next';
import type { CapturedRequest } from '@shared/types';

const emit = defineEmits<{ close: [] }>();
const trafficStore = useTrafficStore();

const leftId = ref<number | null>(null);
const rightId = ref<number | null>(null);
const diffMode = ref<'headers' | 'body' | 'response'>('headers');
const showRequestSelect = ref<'left' | 'right' | null>(null);
const searchQuery = ref('');

const recentRequests = computed(() => {
  const q = searchQuery.value.toLowerCase();
  let items = trafficStore.filteredRequests.slice(0, 200);
  if (q) {
    items = items.filter(r => 
      r.url.toLowerCase().includes(q) ||
      r.host.toLowerCase().includes(q) ||
      r.method.toLowerCase().includes(q)
    );
  }
  return items;
});

const leftRequest = computed(() => {
  if (!leftId.value) return null;
  return trafficStore.requests.find(r => r.id === leftId.value) || null;
});

const rightRequest = computed(() => {
  if (!rightId.value) return null;
  return trafficStore.requests.find(r => r.id === rightId.value) || null;
});

const diffLines = computed(() => {
  if (!leftRequest.value || !rightRequest.value) return [];

  let leftText = '';
  let rightText = '';

  switch (diffMode.value) {
    case 'headers': {
      leftText = formatHeaders(leftRequest.value);
      rightText = formatHeaders(rightRequest.value);
      break;
    }
    case 'body': {
      leftText = formatBody(leftRequest.value.requestBody);
      rightText = formatBody(rightRequest.value.requestBody);
      break;
    }
    case 'response': {
      leftText = formatBody(leftRequest.value.responseBody);
      rightText = formatBody(rightRequest.value.responseBody);
      break;
    }
  }

  return computeDiff(leftText.split('\n'), rightText.split('\n'));
});

function formatHeaders(req: CapturedRequest): string {
  const lines: string[] = [];
  lines.push(`${req.method} ${req.path} HTTP/1.1`);
  lines.push(`Host: ${req.host}`);
  lines.push(`Status: ${req.status}`);
  lines.push('');
  lines.push('--- Request Headers ---');
  for (const [k, v] of Object.entries(req.requestHeaders)) {
    lines.push(`${k}: ${v}`);
  }
  lines.push('');
  lines.push('--- Response Headers ---');
  for (const [k, v] of Object.entries(req.responseHeaders || {})) {
    lines.push(`${k}: ${v}`);
  }
  return lines.join('\n');
}

function formatBody(body: string | null): string {
  if (!body) return '(empty)';
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

interface DiffLine {
  type: 'same' | 'added' | 'removed' | 'changed';
  leftLine: string;
  rightLine: string;
  lineNum: number;
}

function computeDiff(left: string[], right: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  const maxLen = Math.max(left.length, right.length);

  for (let i = 0; i < maxLen; i++) {
    const l = i < left.length ? left[i] : '';
    const r = i < right.length ? right[i] : '';

    if (l === r) {
      result.push({ type: 'same', leftLine: l, rightLine: r, lineNum: i + 1 });
    } else if (i >= left.length) {
      result.push({ type: 'added', leftLine: '', rightLine: r, lineNum: i + 1 });
    } else if (i >= right.length) {
      result.push({ type: 'removed', leftLine: l, rightLine: '', lineNum: i + 1 });
    } else {
      result.push({ type: 'changed', leftLine: l, rightLine: r, lineNum: i + 1 });
    }
  }

  return result;
}

function selectRequest(side: 'left' | 'right', req: CapturedRequest) {
  if (side === 'left') leftId.value = req.id;
  else rightId.value = req.id;
  showRequestSelect.value = null;
  searchQuery.value = '';
}

function swapRequests() {
  const temp = leftId.value;
  leftId.value = rightId.value;
  rightId.value = temp;
}

const diffStats = computed(() => {
  let added = 0, removed = 0, changed = 0;
  for (const line of diffLines.value) {
    if (line.type === 'added') added++;
    if (line.type === 'removed') removed++;
    if (line.type === 'changed') changed++;
  }
  return { added, removed, changed };
});
</script>

<template>
  <div class="diff-overlay" @click.self="emit('close')">
    <div class="diff-dialog">
      <!-- Header -->
      <div class="diff-header">
        <div class="header-left">
          <GitCompare :size="20" class="text-accent" />
          <h3>Request Diff / Compare</h3>
        </div>
        <button class="btn-close" @click="emit('close')">
          <X :size="18" />
        </button>
      </div>

      <!-- Request Selectors -->
      <div class="selectors">
        <div class="selector">
          <label>Left (Original)</label>
          <button class="selector-btn" @click="showRequestSelect = showRequestSelect === 'left' ? null : 'left'">
            <span v-if="leftRequest" class="selected-req">
              <span class="method-tag">{{ leftRequest.method }}</span>
              {{ leftRequest.host }}{{ leftRequest.path.substring(0, 40) }}
            </span>
            <span v-else class="placeholder">Select request...</span>
            <ChevronDown :size="14" />
          </button>
        </div>

        <button class="swap-btn" @click="swapRequests" title="Swap">
          <ArrowLeftRight :size="16" />
        </button>

        <div class="selector">
          <label>Right (Compare)</label>
          <button class="selector-btn" @click="showRequestSelect = showRequestSelect === 'right' ? null : 'right'">
            <span v-if="rightRequest" class="selected-req">
              <span class="method-tag">{{ rightRequest.method }}</span>
              {{ rightRequest.host }}{{ rightRequest.path.substring(0, 40) }}
            </span>
            <span v-else class="placeholder">Select request...</span>
            <ChevronDown :size="14" />
          </button>
        </div>
      </div>

      <!-- Request Dropdown -->
      <div v-if="showRequestSelect" class="request-dropdown">
        <input 
          v-model="searchQuery"
          type="text"
          placeholder="Search requests..."
          class="search-input"
          autofocus
        />
        <div class="request-list">
          <div
            v-for="req in recentRequests"
            :key="req.id"
            class="request-item"
            @click="selectRequest(showRequestSelect!, req)"
          >
            <span class="method-tag" :class="req.method.toLowerCase()">{{ req.method }}</span>
            <span class="req-host">{{ req.host }}</span>
            <span class="req-path">{{ req.path }}</span>
            <span class="req-status" :class="req.status >= 400 ? 'error' : ''">{{ req.status }}</span>
          </div>
          <div v-if="recentRequests.length === 0" class="no-results">No matching requests</div>
        </div>
      </div>

      <!-- Diff Mode Tabs -->
      <div class="diff-tabs" v-if="leftRequest && rightRequest">
        <button 
          v-for="mode in (['headers', 'body', 'response'] as const)"
          :key="mode"
          class="diff-tab"
          :class="{ active: diffMode === mode }"
          @click="diffMode = mode"
        >
          {{ mode.charAt(0).toUpperCase() + mode.slice(1) }}
        </button>
        <div class="diff-stats">
          <span class="stat added" v-if="diffStats.added">+{{ diffStats.added }}</span>
          <span class="stat removed" v-if="diffStats.removed">-{{ diffStats.removed }}</span>
          <span class="stat changed" v-if="diffStats.changed">~{{ diffStats.changed }}</span>
        </div>
      </div>

      <!-- Diff Content -->
      <div class="diff-content" v-if="leftRequest && rightRequest">
        <div class="diff-table">
          <div class="diff-cols">
            <div class="diff-col-header">Left</div>
            <div class="diff-col-header">Right</div>
          </div>
          <div 
            v-for="line in diffLines" 
            :key="line.lineNum"
            class="diff-row"
            :class="line.type"
          >
            <div class="diff-cell left">
              <span class="line-num">{{ line.lineNum }}</span>
              <span class="line-text">{{ line.leftLine }}</span>
            </div>
            <div class="diff-cell right">
              <span class="line-num">{{ line.lineNum }}</span>
              <span class="line-text">{{ line.rightLine }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="empty-state">
        <GitCompare :size="48" />
        <p>Select two requests to compare</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diff-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
}

.diff-dialog {
  width: 95vw;
  max-width: 1400px;
  height: 85vh;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #30363d;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-left h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #e6edf3;
}

.text-accent { color: #58a6ff; }

.btn-close {
  background: none;
  border: none;
  color: #8b949e;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
}

.btn-close:hover {
  background: rgba(248, 81, 73, 0.1);
  color: #f85149;
}

/* Selectors */
.selectors {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid #21262d;
}

.selector {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.selector label {
  font-size: 11px;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.selector-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  color: #e6edf3;
  cursor: pointer;
  font-size: 12px;
  transition: border-color 0.2s;
}

.selector-btn:hover {
  border-color: #58a6ff;
}

.selected-req {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.placeholder {
  color: #6e7681;
}

.method-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
  flex-shrink: 0;
}

.method-tag.get { background: rgba(63, 185, 80, 0.15); color: #3fb950; }
.method-tag.post { background: rgba(88, 166, 255, 0.15); color: #58a6ff; }
.method-tag.put { background: rgba(240, 136, 62, 0.15); color: #f0883e; }
.method-tag.delete { background: rgba(248, 81, 73, 0.15); color: #f85149; }

.swap-btn {
  padding: 8px;
  background: rgba(88, 166, 255, 0.1);
  border: 1px solid rgba(88, 166, 255, 0.3);
  border-radius: 8px;
  color: #58a6ff;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 0;
}

.swap-btn:hover {
  background: rgba(88, 166, 255, 0.2);
}

/* Dropdown */
.request-dropdown {
  border-bottom: 1px solid #21262d;
  max-height: 250px;
  display: flex;
  flex-direction: column;
}

.search-input {
  padding: 10px 20px;
  background: transparent;
  border: none;
  border-bottom: 1px solid #21262d;
  color: #e6edf3;
  font-size: 13px;
  outline: none;
}

.request-list {
  overflow-y: auto;
  flex: 1;
}

.request-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 20px;
  cursor: pointer;
  font-size: 12px;
  color: #c9d1d9;
  transition: background 0.1s;
}

.request-item:hover {
  background: #161b22;
}

.req-host {
  color: #8b949e;
  flex-shrink: 0;
}

.req-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #6e7681;
  font-family: monospace;
  font-size: 11px;
}

.req-status {
  font-family: monospace;
  font-weight: 600;
  color: #3fb950;
}

.req-status.error {
  color: #f85149;
}

.no-results {
  padding: 20px;
  text-align: center;
  color: #6e7681;
  font-size: 13px;
}

/* Diff Tabs */
.diff-tabs {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 20px;
  border-bottom: 1px solid #21262d;
  background: #161b22;
}

.diff-tab {
  padding: 10px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #8b949e;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.diff-tab:hover {
  color: #e6edf3;
}

.diff-tab.active {
  color: #58a6ff;
  border-bottom-color: #58a6ff;
}

.diff-stats {
  margin-left: auto;
  display: flex;
  gap: 8px;
  font-family: monospace;
  font-size: 12px;
}

.stat.added { color: #3fb950; }
.stat.removed { color: #f85149; }
.stat.changed { color: #f0883e; }

/* Diff Content */
.diff-content {
  flex: 1;
  overflow: auto;
}

.diff-cols {
  display: flex;
  position: sticky;
  top: 0;
  z-index: 2;
}

.diff-col-header {
  flex: 1;
  padding: 8px 16px;
  font-size: 11px;
  font-weight: 600;
  color: #8b949e;
  background: #161b22;
  border-bottom: 1px solid #21262d;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.diff-row {
  display: flex;
  font-family: 'SF Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  border-bottom: 1px solid rgba(48, 54, 61, 0.3);
}

.diff-row.same .diff-cell {
  background: transparent;
}

.diff-row.added .diff-cell.right {
  background: rgba(63, 185, 80, 0.1);
}

.diff-row.removed .diff-cell.left {
  background: rgba(248, 81, 73, 0.1);
}

.diff-row.changed .diff-cell.left {
  background: rgba(248, 81, 73, 0.08);
}

.diff-row.changed .diff-cell.right {
  background: rgba(63, 185, 80, 0.08);
}

.diff-cell {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 4px 16px;
  min-width: 0;
}

.diff-cell.left {
  border-right: 1px solid #21262d;
}

.line-num {
  color: #484f58;
  min-width: 32px;
  text-align: right;
  user-select: none;
  flex-shrink: 0;
}

.line-text {
  color: #c9d1d9;
  white-space: pre-wrap;
  word-break: break-all;
  min-width: 0;
}

.diff-row.added .line-text {
  color: #3fb950;
}

.diff-row.removed .line-text {
  color: #f85149;
}

/* Empty State */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #484f58;
}

.empty-state p {
  font-size: 14px;
  color: #6e7681;
}
</style>
