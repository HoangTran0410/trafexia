<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import Toast from "primevue/toast";
import ConfirmDialog from "primevue/confirmdialog";
import Dialog from "primevue/dialog";
import {
  Network,
  Settings,
  QrCode,
  Trash2,
  Filter,
  X,
  Download,
  Pencil,
  ShieldCheck,
  Lock,
  Gauge,
  GitCompare,
  Crown,
  Map,
} from "lucide-vue-next";
import { useToast } from "primevue/usetoast";

import { generatePostmanCollection } from "./utils/postmanExport";

import { useTrafficStore } from "@/stores/trafficStore";
import { useProxyStore } from "@/stores/proxyStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useLicenseStore } from "@/stores/licenseStore";

import ProxyControl from "@/components/ProxyControl.vue";
import RequestList from "@/components/RequestList.vue";
import FilterPanel from "@/components/FilterPanel.vue";
import RequestDetail from "@/components/RequestDetail.vue";
import SettingsDialog from "@/components/SettingsDialog.vue";
import RequestComposer from "@/components/RequestComposer.vue";
import MockRulesManager from "@/components/MockRulesManager.vue";
import BreakpointEditor from "@/components/BreakpointEditor.vue";
import TimelineView from "@/components/TimelineView.vue";
import SslBypassView from "@/components/SslBypassView.vue";
import LicenseDialog from "@/components/LicenseDialog.vue";
import ThrottleControl from "@/components/ThrottleControl.vue";
import DiffViewer from "@/components/DiffViewer.vue";
import MapRulesManager from "@/components/MapRulesManager.vue";

const trafficStore = useTrafficStore();
const proxyStore = useProxyStore();
const settingsStore = useSettingsStore();
const licenseStore = useLicenseStore();
const toast = useToast();

// State
const showFilters = ref(false);
const showSettings = ref(false);
const showQrCode = ref(false);
const showComposer = ref(false);
const showMockRules = ref(false);
const showSslBypass = ref(false);
const showThrottle = ref(false);
const showDiff = ref(false);
const showMapRules = ref(false);
const viewMode = ref<"list" | "timeline">("list");

// Computed
const hasSelectedRequest = computed(() => !!trafficStore.selectedRequest);
const requestCount = computed(() => trafficStore.filteredRequests.length);

// Event handlers
function handleRequestCaptured(request: any) {
  if (Array.isArray(request)) {
    request.forEach(r => trafficStore.updateRequest(r));
  } else {
    trafficStore.updateRequest(request);
  }
}

function handleProxyError(error: string) {
  console.error("[App] Proxy error:", error);
}

// Lifecycle
onMounted(async () => {
  await settingsStore.loadSettings();
  await trafficStore.loadRequests();
  await licenseStore.loadLicense();

  window.electronAPI.onRequestCaptured(handleRequestCaptured);
  window.electronAPI.onProxyError(handleProxyError);
});

onUnmounted(() => {
  // Cleanup listeners
});

async function openQrCode() {
  if (proxyStore.isRunning) {
    await proxyStore.refreshQrCode();
    showQrCode.value = true;
  }
}

const mainContainer = ref<HTMLElement | null>(null);
const leftPanelWidth = ref(40); // Initial %, used when split
const isResizing = ref(false);

const listPanelStyle = computed(() => {
  if (!hasSelectedRequest.value) {
    return { flex: "1", minWidth: "300px", overflow: "hidden" };
  }
  return {
    width: `${leftPanelWidth.value}%`,
    minWidth: "200px",
    maxWidth: "80%",
    overflow: "hidden",
  }; // Use width, not flex
});

function startResize() {
  isResizing.value = true;
  document.addEventListener("mousemove", handleResize);
  document.addEventListener("mouseup", stopResize);
  document.body.style.userSelect = "none";
  document.body.style.cursor = "col-resize";
}

function handleResize(e: MouseEvent) {
  if (!mainContainer.value) return;
  const containerRect = mainContainer.value.getBoundingClientRect();
  const newWidth =
    ((e.clientX - containerRect.left) / containerRect.width) * 100;

  if (newWidth > 15 && newWidth < 85) {
    leftPanelWidth.value = newWidth;
  }
}

function stopResize() {
  isResizing.value = false;
  document.removeEventListener("mousemove", handleResize);
  document.removeEventListener("mouseup", stopResize);
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
}

function clearRequests() {
  trafficStore.clearAll();
}

function exportPostman() {
  const collectionJson = generatePostmanCollection(
    trafficStore.requests,
    "Trafexia Export",
  );
  const blob = new Blob([collectionJson], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trafexia_export_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.add({
    severity: "success",
    summary: "Exported",
    detail: "Postman Collection exported successfully",
    life: 3000,
  });
}
</script>

<template>
  <div class="app-container">
    <!-- Global Components -->
    <Toast position="bottom-right" />
    <ConfirmDialog />

    <header class="app-header">
      <!-- Left: Brand -->
      <div class="header-left">
        <div class="app-brand">
          <div class="brand-logo">
            <Network :size="20" />
          </div>
          <span class="brand-name">TRAFEXIA</span>
        </div>
      </div>

      <!-- Center: Proxy Control (takes remaining space) -->
      <div class="header-center">
        <ProxyControl />
      </div>

      <!-- Right: Actions -->
      <div class="header-right">
        <!-- Tools Group -->
        <div class="action-group">
          <button class="icon-btn"
            @click="licenseStore.guardFeature('request-composer') && (showComposer = true)"
            :title="'Composer' + (!licenseStore.hasFeature('request-composer') ? ' (Locked)' : '')"
            :class="{ locked: !licenseStore.hasFeature('request-composer') }">
            <Pencil :size="14" />
          </button>
          <button class="icon-btn"
            @click="licenseStore.guardFeature('mock-rules') && (showMockRules = true)"
            :title="'Mock' + (!licenseStore.hasFeature('mock-rules') ? ' (Locked)' : '')"
            :class="{ locked: !licenseStore.hasFeature('mock-rules') }">
            <ShieldCheck :size="14" />
          </button>
          <button class="icon-btn"
            @click="licenseStore.guardFeature('map-rules') && (showMapRules = true)"
            :title="'Map' + (!licenseStore.hasFeature('map-rules') ? ' — PRO' : '')"
            :class="{ locked: !licenseStore.hasFeature('map-rules') }">
            <Map :size="14" />
          </button>
          <button class="icon-btn"
            @click="licenseStore.guardFeature('ssl-bypass') && (showSslBypass = true)"
            :title="'SSL Bypass' + (!licenseStore.hasFeature('ssl-bypass') ? ' — PRO' : '')"
            :class="{ locked: !licenseStore.hasFeature('ssl-bypass') }">
            <Lock :size="14" />
          </button>
          <button class="icon-btn"
            @click="licenseStore.guardFeature('throttle') && (showThrottle = !showThrottle)"
            :title="'Throttle' + (!licenseStore.hasFeature('throttle') ? ' — PRO' : '')"
            :class="{ locked: !licenseStore.hasFeature('throttle') }">
            <Gauge :size="14" />
          </button>
          <button class="icon-btn"
            @click="licenseStore.guardFeature('diff-compare') && (showDiff = true)"
            :title="'Diff' + (!licenseStore.hasFeature('diff-compare') ? ' — PRO' : '')"
            :class="{ locked: !licenseStore.hasFeature('diff-compare') }">
            <GitCompare :size="14" />
          </button>
        </div>

        <!-- Utility Group -->
        <div class="action-group">
          <button class="icon-btn"
            @click="licenseStore.guardFeature('export-postman') && exportPostman()"
            :title="'Export' + (!licenseStore.hasFeature('export-postman') ? ' — PRO' : '')"
            :class="{ locked: !licenseStore.hasFeature('export-postman') }">
            <Download :size="14" />
          </button>
          <button class="icon-btn"
            @click="licenseStore.guardFeature('qr-code') && openQrCode()"
            :disabled="!proxyStore.isRunning"
            :title="proxyStore.isRunning ? 'QR Connect' : 'Start proxy first'"
            :class="{ locked: !licenseStore.hasFeature('qr-code') }">
            <QrCode :size="14" />
          </button>
          <button class="icon-btn"
            @click="licenseStore.guardFeature('clear-requests') && clearRequests()"
            :title="'Clear'"
            :class="{ locked: !licenseStore.hasFeature('clear-requests') }">
            <Trash2 :size="14" />
          </button>
          <button class="icon-btn"
            :class="{ active: showFilters, locked: !licenseStore.hasFeature('filter-requests') }"
            @click="licenseStore.guardFeature('filter-requests') && (showFilters = !showFilters)"
            title="Filters">
            <Filter :size="14" />
          </button>
          <button class="icon-btn" @click="showSettings = true" title="Settings">
            <Settings :size="14" />
          </button>
        </div>

        <!-- View Toggle -->
        <div class="view-group">
          <button :class="['view-btn', { active: viewMode === 'list' }]" @click="viewMode = 'list'">
            <i class="pi pi-list"></i>
          </button>
          <button :class="['view-btn', { active: viewMode === 'timeline' }]" @click="viewMode = 'timeline'">
            <i class="pi pi-chart-bar"></i>
          </button>
        </div>

        <!-- License Badge -->
        <button
          class="license-badge-premium"
          :class="licenseStore.isFree ? 'free' : 'pro'"
          @click="licenseStore.showUpgradeDialog = true"
        >
          <Crown :size="12" v-if="licenseStore.isPro" />
          <Lock :size="10" v-else />
          <span>{{ licenseStore.tierLabel }}</span>
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <main class="app-content">
      <!-- Filter Sidebar -->
      <aside
        v-if="showFilters"
        class="filter-sidebar"
      >
        <div
          style="
            padding: 12px 16px;
            border-bottom: 1px solid rgba(48, 54, 61, 0.8);
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-weight: 600;
            font-size: 13px;
            color: #e6edf3;
          "
        >
          <span>Filters</span>
          <button
            style="
              background: none;
              border: none;
              color: #8b949e;
              cursor: pointer;
              padding: 4px;
            "
            @click="showFilters = false"
          >
            <X style="width: 16px; height: 16px" />
          </button>
        </div>
        <FilterPanel />
      </aside>

      <!-- Main Content -->
      <div
        style="flex: 1; display: flex; overflow: hidden"
        ref="mainContainer"
        v-if="viewMode === 'list'"
      >
        <!-- Request List Panel -->
        <div :style="listPanelStyle">
          <RequestList />
        </div>

        <!-- Resizable Divider -->
        <div
          v-if="hasSelectedRequest"
          @mousedown="startResize"
          style="
            width: 4px;
            background: rgba(48, 54, 61, 0.8);
            cursor: col-resize;
            flex-shrink: 0;
            z-index: 10;
            transition: background 0.2s;
          "
          class="resize-handle"
        ></div>

        <!-- Detail Panel -->
        <div
          v-if="hasSelectedRequest"
          style="flex: 1; min-width: 0; overflow: hidden"
        >
          <RequestDetail />
        </div>
      </div>

      <!-- Timeline View -->
      <div v-else style="flex: 1; overflow: hidden">
        <TimelineView />
      </div>
    </main>

    <!-- Settings Dialog -->
    <SettingsDialog v-model:visible="showSettings" />

    <!-- Request Composer Dialog -->
    <RequestComposer v-if="showComposer" @close="showComposer = false" />

    <!-- Mock Rules Manager Dialog -->
    <MockRulesManager v-if="showMockRules" @close="showMockRules = false" />

    <!-- Map Rules Manager Dialog -->
    <MapRulesManager v-if="showMapRules" @close="showMapRules = false" />

    <!-- SSL Bypass View -->
    <SslBypassView v-if="showSslBypass" @close="showSslBypass = false" />

    <!-- Breakpoint Editor -->
    <BreakpointEditor />

    <!-- License Dialog -->
    <LicenseDialog />

    <!-- Diff Viewer -->
    <DiffViewer v-if="showDiff" @close="showDiff = false" />

    <!-- Throttle Panel (floating) -->
    <Teleport to="body">
      <div v-if="showThrottle" class="throttle-floating">
        <ThrottleControl @close="showThrottle = false" />
      </div>
    </Teleport>

    <!-- QR Code Dialog -->
    <Dialog
      v-model:visible="showQrCode"
      header="Connect Mobile Device"
      :modal="true"
      :style="{ width: '400px' }"
    >
      <div class="qr-dialog-content" v-if="proxyStore.qrCodeData">
        <div class="qr-code-wrapper">
          <img
            :src="proxyStore.qrCodeData.qrCode"
            alt="QR Code"
            class="qr-code-image"
          />
        </div>
        <div class="qr-info">
          <p class="qr-instruction">Scan this QR code to open the setup page</p>
          <div class="proxy-details">
            <div class="detail-item">
              <span class="detail-label">Proxy Address</span>
              <code class="detail-value"
                >{{ proxyStore.qrCodeData.proxyHost }}:{{
                  proxyStore.qrCodeData.proxyPort
                }}</code
              >
            </div>
            <div class="detail-item">
              <span class="detail-label">Setup URL</span>
              <code class="detail-value">{{
                proxyStore.qrCodeData.setupUrl
              }}</code>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
}

.app-header {
  height: 56px;
  background: #0B1120;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  padding: 0 20px;
  justify-content: space-between;
  -webkit-app-region: drag;
  z-index: 100;
  overflow: hidden;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  -webkit-app-region: no-drag;
  flex-shrink: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  -webkit-app-region: no-drag;
  flex-shrink: 0;
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.brand-logo {
  width: 28px;
  height: 28px;
  background: #38BDF8;
  color: #0F172A;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.brand-name {
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 2px;
  color: #F1F5F9;
  white-space: nowrap;
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  -webkit-app-region: no-drag;
  min-width: 0;
  padding: 0 8px;
}

.request-stats {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.request-stats .count { font-size: 14px; font-weight: 700; color: #38BDF8; }
.request-stats .label { font-size: 9px; font-weight: 800; color: #64748B; letter-spacing: 1px; }

.action-group, .view-group {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 3px;
}

.icon-btn, .view-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #94A3B8;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-btn.locked {
  opacity: 0.4;
  cursor: not-allowed;
  position: relative;
}

.icon-btn.locked::after {
  content: '🔒';
  position: absolute;
  top: -4px;
  right: -4px;
  font-size: 8px;
  line-height: 1;
}

.icon-btn:hover, .view-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #F1F5F9;
}

.icon-btn.locked:hover {
  background: transparent;
  color: #94A3B8;
}

.icon-btn.active {
  background: rgba(56, 189, 248, 0.15);
  color: #38BDF8;
}

.icon-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.icon-btn:disabled:hover {
  background: transparent;
  color: #94A3B8;
}

.view-btn.active {
  background: #38BDF8;
  color: #0F172A;
}

.license-badge-premium {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.license-badge-premium.free {
  background: rgba(148, 163, 184, 0.1);
  color: #94A3B8;
  border-color: rgba(148, 163, 184, 0.2);
}

.license-badge-premium.pro {
  background: rgba(56, 189, 248, 0.1);
  color: #38BDF8;
  border-color: rgba(56, 189, 248, 0.3);
  box-shadow: 0 0 15px rgba(56, 189, 248, 0.1);
}

.license-badge-premium.pro:hover {
  background: rgba(56, 189, 248, 0.2);
  transform: translateY(-1px);
}

.app-header > * {
  -webkit-app-region: no-drag;
}

.app-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  padding-right: 8px;
}

.app-title {
  font-weight: 600;
  font-size: 17px;
  color: var(--color-text-primary);
  white-space: nowrap;
}

.w-4 {
  width: 16px;
  height: 16px;
}

.w-5 {
  width: 20px;
  height: 20px;
}

.w-6 {
  width: 24px;
  height: 24px;
}

.h-4 {
  height: 16px;
}

.h-5 {
  height: 20px;
}

.h-6 {
  height: 24px;
}

.text-accent {
  color: var(--color-accent);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.request-counter {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 0 12px;
  color: var(--color-text-secondary);
}

.counter-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.counter-label {
  font-size: 12px;
}

.btn-icon.active {
  background: var(--color-accent-muted);
  color: var(--color-accent);
}

.app-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: var(--sidebar-width);
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  font-size: 13px;
  color: var(--color-text-primary);
}

/* QR Dialog */
.qr-dialog-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.qr-code-wrapper {
  padding: 16px;
  background: white;
  border-radius: 12px;
}

.qr-code-image {
  width: 200px;
  height: 200px;
}

.qr-info {
  text-align: center;
}

.qr-instruction {
  color: var(--color-text-secondary);
  margin-bottom: 16px;
}

.proxy-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  font-size: 13px;
  padding: 6px 10px;
  background: var(--color-bg-tertiary);
  border-radius: 4px;
  color: var(--color-text-primary);
}

:deep(.p-splitter) {
  background: transparent;
  border: none;
}

:deep(.p-splitter-gutter) {
  background: var(--color-border);
}

:deep(.p-splitter-gutter:hover) {
  background: var(--color-accent);
}

.resize-handle:hover {
  background: #58a6ff !important;
}

.view-toggle {
  display: flex;
  gap: 2px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 2px;
  margin-left: 8px;
}

.view-toggle-btn {
  padding: 6px 12px;
  background: transparent;
  color: var(--color-text-secondary);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
  font-size: 14px;
}

.view-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-text-primary);
}

.view-toggle-btn.active {
  background: var(--color-accent);
  color: white;
}

/* License Badge */
.license-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.license-badge.free {
  background: rgba(139, 148, 158, 0.1);
  color: #8b949e;
  border-color: rgba(139, 148, 158, 0.2);
}

.license-badge.free:hover {
  background: rgba(88, 166, 255, 0.1);
  color: #58a6ff;
  border-color: rgba(88, 166, 255, 0.3);
}

.license-badge.pro {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.15));
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.3);
}

.license-badge.pro:hover {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.25), rgba(245, 158, 11, 0.25));
}

/* Throttle Floating Panel */
.throttle-floating {
  position: fixed;
  top: 64px;
  right: 16px;
  z-index: 5000;
  width: 440px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
  border-radius: 12px;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from { transform: translateY(-8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* ===== RESPONSIVE ===== */

.filter-sidebar {
  width: 360px;
  max-width: 40vw;
  background: #161b22;
  border-right: 1px solid rgba(48, 54, 61, 0.8);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

/* Medium screens (<1200px): tighten gaps */
@media (max-width: 1200px) {
  .header-right { gap: 4px; }
  .action-group, .view-group { gap: 1px; padding: 2px; }
  .filter-sidebar { width: 300px; }
}

/* Small screens (<1000px): hide less important items */
@media (max-width: 1000px) {
  .app-header { padding: 0 10px; }
  .brand-name { display: none; }
  .view-group { display: none; }
  .license-badge-premium span { display: none; }
  .license-badge-premium { padding: 4px 6px; }
  .icon-btn, .view-btn { width: 26px; height: 26px; }
  .filter-sidebar { width: 260px; }
}

/* Very small screens (<800px): compact mode */
@media (max-width: 800px) {
  .app-header { height: 48px; padding: 0 8px; }
  .header-right { gap: 2px; }
  .action-group { border: none; background: none; padding: 0; gap: 1px; }
  .icon-btn, .view-btn { width: 24px; height: 24px; }
  .throttle-floating { width: calc(100vw - 32px); right: 16px; }
  .filter-sidebar { width: 100%; max-width: 100vw; position: absolute; z-index: 50; left: 0; top: 0; bottom: 0; }
  /* Hide tools group on very small screens, keep utility */
  .header-right > .action-group:first-child { display: none; }
}
</style>
