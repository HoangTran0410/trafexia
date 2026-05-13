<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import TabView from "primevue/tabview";
import TabPanel from "primevue/tabpanel";
import Dropdown from "primevue/dropdown";
import {
  Upload,
  Play,
  Square,
  Loader2,
  Trash2,
  Shield,
  Zap,
  Terminal,
  RefreshCw,
  Package,
  X,
  Minus,
  Cpu,
  Fingerprint,
  Smartphone,
  Activity
} from "lucide-vue-next";
import { useSslBypassStore } from "@/stores/sslBypassStore";
import { useTrafficStore } from "@/stores/trafficStore";
import type { BypassFramework, AndroidDevice } from "@shared/types";

const store = useSslBypassStore();
const trafficStore = useTrafficStore();
const emit = defineEmits<{ (e: "close"): void }>();

const isMinimized = ref(false);
const apkFilePath = ref("");
const apkFileName = ref("");
const isDragging = ref(false);
const packageName = ref("");
const selectedFramework = ref<BypassFramework>("all");
const logContainerRef = ref<HTMLElement | null>(null);

const devices = ref<AndroidDevice[]>([]);
const selectedDeviceId = ref<string>("");
const selectedArch = ref<"arm64" | "arm" | "x86_64" | "x86">("arm64");
const autoInstall = ref(false);
const archOptions = [
  { label: "ARM64 (Modern Devices)", value: "arm64" },
  { label: "ARM (Old Devices)", value: "arm" },
  { label: "x86_64 (64-bit Emulator)", value: "x86_64" },
  { label: "x86 (32-bit Emulator)", value: "x86" },
];

const filteredTraffic = computed(() => {
  // If we have a selected device, try to filter traffic by its IP
  const device = devices.value.find(d => d.id === selectedDeviceId.value);
  if (device && device.ip) {
    return (trafficStore.requests || []).filter(t => t.clientIp === device.ip).slice(-50).reverse();
  }
  return (trafficStore.requests || []).slice(-20).reverse();
});

const frameworkOptions = [
  { label: "AI Universal Bypass", value: "all" },
  { label: "OkHttp3 / Retrofit", value: "okhttp3" },
  { label: "Conscrypt (System)", value: "conscrypt" },
  { label: "WebView / Chrome", value: "webview" },
  { label: "Flutter (Native)", value: "flutter" },
  { label: "React Native", value: "react-native" },
];

let listeners: any[] = [];
let scrollThrottleTimer: any = null;

onMounted(() => {
  listeners.push(window.electronAPI.onFridaLog((log) => {
    store.addFridaLog(log);
    
    // Throttle auto-scroll to 5fps to avoid layout thrashing
    if (!scrollThrottleTimer) {
      scrollThrottleTimer = setTimeout(() => {
        if (logContainerRef.value) {
          logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight;
        }
        scrollThrottleTimer = null;
      }, 200);
    }
  }));

  listeners.push(window.electronAPI.onHostDetected((host) => {
    store.addDetectedHost(host);
  }));

  store.refreshDetectedHosts();
  refreshDevices();
});

async function refreshDevices() {
  try {
    devices.value = await window.electronAPI.getAndroidDevices();
    if (devices.value.length > 0 && !selectedDeviceId.value) {
      selectedDeviceId.value = devices.value[0].id;
    }
  } catch (error) {
    console.error("Failed to fetch devices:", error);
  }
}

async function handleFileSelect() {
  const file = await window.electronAPI.selectFile({
    title: 'Select APK/XAPK File',
    filters: [{ name: 'Android Packages', extensions: ['apk', 'xapk', 'zip'] }]
  });
  if (file) {
    apkFilePath.value = file;
    apkFileName.value = file.split('/').pop() || '';
  }
}

onUnmounted(() => {
  listeners.forEach(l => l?.());
  if (scrollThrottleTimer) clearTimeout(scrollThrottleTimer);
});

async function patchApk() {
  if (!apkFilePath.value) return;
  const outputPath = apkFilePath.value.replace(".apk", "-patched.apk");
  const result = await store.patchApk(apkFilePath.value, outputPath);
  
  if (result.success && autoInstall.value && selectedDeviceId.value) {
    await installToDevice(outputPath);
  }
}

async function injectGadget() {
  if (!apkFilePath.value) return;
  const outputPath = apkFilePath.value.replace(/\.[^.]+$/, "-injected.apk");
  const processedPaths = await store.injectGadget(apkFilePath.value, selectedArch.value, outputPath);
  
  if (autoInstall.value && selectedDeviceId.value) {
    await installToDevice(processedPaths);
  }
}

async function installToDevice(customPaths?: string | string[]) {
  if (!selectedDeviceId.value) return;
  
  if (Array.isArray(customPaths)) {
    if (customPaths.length === 1) {
      await store.installApk(selectedDeviceId.value, customPaths[0]);
    } else {
      await store.installMultipleApks(selectedDeviceId.value, customPaths);
    }
  } else {
    const path = customPaths || apkFilePath.value;
    if (!path) return;
    await store.installApk(selectedDeviceId.value, path);
  }
}

async function toggleFrida() {
  if (store.fridaRunning) {
    await store.stopFrida();
  } else {
    if (!packageName.value.trim()) return;
    await store.startFrida(packageName.value.trim(), selectedFramework.value, selectedDeviceId.value);
  }
}
</script>

<template>
  <div class="elite-bypass-overlay" :class="{ 'minimized': isMinimized }">
    <div class="elite-bypass-window">
      <!-- Window Header -->
      <div class="window-header">
        <div class="brand">
          <div class="logo-ring">
            <Shield :size="14" />
          </div>
          <div class="title">
            <span class="main">SECURE PROTOCOL BYPASS</span>
            <span class="sub">BYPASS ENGINE v4.0.2</span>
          </div>
        </div>
        <div class="window-controls">
          <button class="win-btn" @click="isMinimized = !isMinimized"><Minus :size="14" /></button>
          <button class="win-btn close" @click="emit('close')"><X :size="14" /></button>
        </div>
      </div>

      <div v-show="!isMinimized" class="window-body">
        <TabView class="elite-tabs">
          <!-- APK PATCHER -->
          <TabPanel>
            <template #header>
              <div class="tab-label"><Package :size="14" /> <span>PACKAGING</span></div>
            </template>
            <div class="tab-pane">
              <div 
                class="drop-zone-premium" 
                :class="{ active: isDragging, 'has-file': !!apkFileName }"
                @dragover.prevent="isDragging = true"
                @dragleave="isDragging = false"
                @drop.prevent="isDragging = false"
                @click="handleFileSelect"
              >
                <div class="drop-content">
                  <Upload :size="32" class="icon" />
                  <div class="text">
                    <p class="p-main">{{ apkFileName || 'DRAG & DROP or CLICK TO SELECT APK' }}</p>
                    <p class="p-sub">BINARY ANALYSIS ENGINE READY</p>
                  </div>
                </div>
              </div>

              <div class="packaging-options" v-if="apkFileName">
                <div class="injection-grid">
                  <div class="field-eg full">
                    <label>TARGET ARCHITECTURE (FOR GADGET)</label>
                    <Dropdown 
                      v-model="selectedArch" 
                      :options="archOptions" 
                      optionLabel="label" 
                      optionValue="value" 
                      class="dropdown-eg full" 
                      appendTo="self"
                    />
                  </div>
                  <div class="field-eg full">
                    <label>TARGET DEVICE (FOR INSTALL)</label>
                    <div class="input-eg">
                      <Smartphone :size="14" class="icon" />
                      <Dropdown 
                        v-model="selectedDeviceId" 
                        :options="devices" 
                        optionLabel="model" 
                        optionValue="id" 
                        placeholder="SELECT DEVICE..."
                        class="dropdown-eg full" 
                        appendTo="self"
                      />
                    </div>
                  </div>
                </div>

                <div class="auto-install-row">
                  <label class="checkbox-container">
                    <input type="checkbox" v-model="autoInstall">
                    <span class="checkmark"></span>
                    <span class="label-text">AUTO-INSTALL AFTER PROCESSING</span>
                  </label>
                </div>

                <div class="controls-grid">
                  <button class="elite-btn primary" @click="patchApk" :disabled="store.isPatching">
                    <Zap :size="14" /> <span>PATCH APK (NO-ROOT)</span>
                  </button>
                  <button class="elite-btn secondary" @click="injectGadget" :disabled="store.isInjecting">
                    <Activity :size="14" /> <span>INJECT GADGET</span>
                  </button>
                  <button class="elite-btn ghost" @click="installToDevice()" v-if="selectedDeviceId">
                    <RefreshCw :size="14" /> <span>INSTALL CURRENT</span>
                  </button>
                </div>
              </div>
            </div>
          </TabPanel>

          <!-- DYNAMIC INJECTION -->
          <TabPanel>
            <template #header>
              <div class="tab-label"><Terminal :size="14" /> <span>DYNAMIC</span></div>
            </template>
            <div class="tab-pane">
              <div class="injection-grid">
                <div class="field-eg full">
                  <div class="label-row">
                    <label>TARGET DEVICE</label>
                    <button class="refresh-mini-btn" @click="refreshDevices" :disabled="store.isPatching">
                      <RefreshCw :size="10" :class="{ 'animate-spin': store.isPatching }" />
                    </button>
                  </div>
                  <div class="input-eg">
                    <Smartphone :size="14" class="icon" />
                    <Dropdown 
                      v-model="selectedDeviceId" 
                      :options="devices" 
                      optionLabel="model" 
                      optionValue="id" 
                      placeholder="SCANNING FOR DEVICES..."
                      class="dropdown-eg full" 
                      appendTo="self"
                    >
                      <template #option="slotProps">
                        <div class="device-option">
                          <span class="d-model">{{ slotProps.option.model }}</span>
                          <span class="d-id">{{ slotProps.option.id }} ({{ slotProps.option.type }})</span>
                        </div>
                      </template>
                    </Dropdown>
                  </div>
                </div>
                <div class="field-eg">
                  <label>TARGET PACKAGE</label>
                  <div class="input-eg">
                    <Fingerprint :size="14" class="icon" />
                    <input v-model="packageName" placeholder="com.example.app" />
                  </div>
                </div>
                <div class="field-eg">
                  <label>FRAMEWORK</label>
                  <Dropdown 
                    v-model="selectedFramework" 
                    :options="frameworkOptions" 
                    optionLabel="label" 
                    optionValue="value" 
                    placeholder="AUTO DETECT" 
                    class="dropdown-eg full" 
                    appendTo="self"
                  />
                </div>
              </div>

              <button class="inject-toggle-btn" :class="{ running: store.fridaRunning }" @click="toggleFrida">
                <Loader2 v-if="store.isPatching" class="animate-spin" :size="16" />
                <Play v-else-if="!store.fridaRunning" :size="16" fill="currentColor" />
                <Square v-else :size="16" fill="currentColor" />
                <span>{{ store.fridaRunning ? 'TERMINATE SESSION' : 'INJECT BYPASS SCRIPT' }}</span>
              </button>

              <div class="console-box">
                <div class="console-head">
                  <div class="label"><Cpu :size="12" /> LIVE STREAM</div>
                  <button class="clear-btn" @click="store.clearLogs()"><Trash2 :size="12" /></button>
                </div>
                <div class="console-log" ref="logContainerRef">
                  <div v-for="log in store.fridaLogs" :key="log.timestamp + log.message" class="log-line" :class="log.level">
                    <span class="ts">[{{ new Date(log.timestamp).toLocaleTimeString() }}]</span>
                    <span class="msg">{{ log.message }}</span>
                  </div>
                </div>
              </div>
            </div>
          </TabPanel>

          <!-- REALTIME TRAFFIC -->
          <TabPanel>
            <template #header>
              <div class="tab-label"><Activity :size="14" /> <span>TRAFFIC</span></div>
            </template>
            <div class="tab-pane">
              <div class="realtime-traffic-box">
                <div v-if="filteredTraffic.length === 0" class="empty-traffic">
                  <Activity :size="32" class="icon" />
                  <p>WAITING FOR NETWORK ACTIVITY...</p>
                </div>
                <div v-else class="traffic-list-mini">
                  <div v-for="t in filteredTraffic" :key="t.id" class="traffic-row-mini">
                    <span class="method" :class="t.method">{{ t.method }}</span>
                    <span class="host">{{ t.host }}</span>
                    <span class="path">{{ t.path }}</span>
                    <span class="status" :class="{ error: t.statusCode >= 400 }">{{ t.statusCode || '---' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </TabPanel>
        </TabView>
      </div>
    </div>
  </div>
</template>

<style scoped>
.elite-bypass-overlay {
  position: fixed;
  inset: 0;
  background: #020617;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5000;
  padding: 20px;
}

.elite-bypass-overlay.minimized {
  background: transparent;
  pointer-events: none;
  align-items: flex-end;
  justify-content: flex-end;
}

.elite-bypass-window {
  width: 100%;
  max-width: 800px;
  background: #0B1120;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  pointer-events: auto;
}

.window-header {
  height: 52px;
  padding: 0 16px;
  background: #0F172A;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand { display: flex; align-items: center; gap: 12px; }
.logo-ring { width: 28px; height: 28px; border-radius: 50%; border: 1px solid #38BDF8; display: flex; align-items: center; justify-content: center; color: #38BDF8; background: rgba(56, 189, 248, 0.1); }

.title { display: flex; flex-direction: column; }
.title .main { font-size: 11px; font-weight: 900; color: #F1F5F9; letter-spacing: 1px; }
.title .sub { font-size: 8px; font-weight: 700; color: #64748B; letter-spacing: 0.5px; }

.window-controls { display: flex; gap: 4px; }
.win-btn { width: 28px; height: 28px; border: none; background: transparent; color: #64748B; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.win-btn:hover { background: rgba(255, 255, 255, 0.05); color: #F1F5F9; }
.win-btn.close:hover { background: rgba(248, 81, 73, 0.2); color: #F85149; }

.window-body { padding: 0; min-height: 480px; }

.tab-label { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 1px; }

.tab-pane { padding: 24px; display: flex; flex-direction: column; gap: 24px; }

.drop-zone-premium {
  height: 160px;
  border: 2px dashed rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.drop-zone-premium:hover { border-color: #38BDF8; background: rgba(56, 189, 248, 0.02); }
.drop-zone-premium.has-file { border-style: solid; border-color: #10B981; background: rgba(16, 185, 129, 0.02); }

.drop-content { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.drop-content .icon { color: #64748B; }
.drop-zone-premium.has-file .icon { color: #10B981; }

.p-main { font-size: 14px; font-weight: 700; color: #F1F5F9; }
.p-sub { font-size: 9px; font-weight: 800; color: #64748B; letter-spacing: 1px; }

.injection-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.field-eg label { font-size: 10px; font-weight: 800; color: #64748B; letter-spacing: 0.5px; margin-bottom: 8px; display: block; }

.input-eg { position: relative; display: flex; align-items: center; }
.input-eg .icon { position: absolute; left: 10px; color: #64748B; }
.input-eg input { width: 100%; height: 36px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 0 10px 0 32px; color: #F1F5F9; font-size: 13px; }

.inject-toggle-btn {
  height: 44px;
  background: #38BDF8;
  color: #0F172A;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.inject-toggle-btn.running { background: rgba(248, 81, 73, 0.1); color: #F85149; border: 1px solid rgba(248, 81, 73, 0.2); }

.console-box { flex: 1; background: #020617; border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; }
.console-head { height: 32px; background: rgba(255, 255, 255, 0.02); border-bottom: 1px solid rgba(255, 255, 255, 0.05); display: flex; align-items: center; justify-content: space-between; padding: 0 12px; }
.console-head .label { font-size: 10px; font-weight: 800; color: #64748B; display: flex; align-items: center; gap: 6px; }

.console-log { height: 200px; padding: 12px; overflow-y: auto; font-family: 'SF Mono', monospace; font-size: 11px; }
.log-line { margin-bottom: 4px; display: flex; gap: 8px; }
.log-line.error { color: #F85149; }
.log-line.success { color: #10B981; }
.log-line .ts { color: #475569; flex-shrink: 0; }

.field-eg.full { grid-column: 1 / -1; }
.dropdown-eg.full { width: 100%; }

.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.refresh-mini-btn {
  background: transparent;
  border: none;
  color: #38BDF8;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  opacity: 0.7;
}
.refresh-mini-btn:hover { opacity: 1; background: rgba(56, 189, 248, 0.1); }

.device-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.d-model {
  font-size: 12px;
  font-weight: 700;
  color: #F1F5F9;
}
.d-id {
  font-size: 10px;
  color: #64748B;
  font-family: monospace;
}

:deep(.p-dropdown) {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
:deep(.p-dropdown-label) {
  color: #F1F5F9;
  font-size: 13px;
}
:deep(.p-dropdown-panel) {
  background: #0F172A;
  border: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 9999 !important;
}
:deep(.p-dropdown-item) {
  color: #94A3B8;
  padding: 8px 12px;
}
:deep(.p-dropdown-item:hover) {
  background: rgba(56, 189, 248, 0.1);
  color: #38BDF8;
}

/* Realtime Traffic Styles */
.realtime-traffic-box {
  height: 380px;
  background: #020617;
  border-radius: 8px;
  overflow-y: auto;
  padding: 8px;
}
.empty-traffic {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #475569;
  gap: 16px;
}
.traffic-list-mini {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.traffic-row-mini {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 4px;
  font-family: 'SF Mono', monospace;
  font-size: 11px;
}
.traffic-row-mini:hover { background: rgba(56, 189, 248, 0.05); }
.traffic-row-mini .method { font-weight: 900; width: 45px; }
.traffic-row-mini .method.GET { color: #38BDF8; }
.traffic-row-mini .method.POST { color: #10B981; }
.traffic-row-mini .host { color: #94A3B8; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.traffic-row-mini .path { color: #F1F5F9; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.traffic-row-mini .status { font-weight: 700; width: 30px; text-align: right; }
.traffic-row-mini .status.error { color: #F85149; }

/* Packaging Options Styles */
.packaging-options {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.controls-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.elite-btn {
  height: 40px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.elite-btn.primary { background: #38BDF8; color: #0F172A; }
.elite-btn.secondary { background: #8B5CF6; color: #F1F5F9; }
.elite-btn.ghost { background: rgba(255, 255, 255, 0.05); color: #94A3B8; border: 1px solid rgba(255, 255, 255, 0.1); }
.elite-btn.ghost:hover { background: rgba(255, 255, 255, 0.1); color: #F1F5F9; }

.elite-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.auto-install-row {
  display: flex;
  align-items: center;
}

.checkbox-container {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
}

.checkbox-container input { display: none; }

.checkmark {
  width: 18px;
  height: 18px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  position: relative;
  transition: all 0.2s;
}

.checkbox-container input:checked ~ .checkmark {
  background: #38BDF8;
  border-color: #38BDF8;
}

.checkmark:after {
  content: "";
  position: absolute;
  display: none;
  left: 6px;
  top: 2px;
  width: 5px;
  height: 10px;
  border: solid #0F172A;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.checkbox-container input:checked ~ .checkmark:after { display: block; }

.label-text {
  font-size: 10px;
  font-weight: 800;
  color: #94A3B8;
  letter-spacing: 0.5px;
}

.checkbox-container:hover .checkmark { border-color: #38BDF8; }

</style>
