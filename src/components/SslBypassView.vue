<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed } from "vue";
import TabView from "primevue/tabview";
import TabPanel from "primevue/tabpanel";
import DataTable from "primevue/datatable";
import Column from "primevue/column";
import Dropdown from "primevue/dropdown";
import {
  Upload,
  Download,
  Play,
  Square,
  Loader2,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Info,
  Shield,
  Zap,
  Terminal,
  Package,
  X,
  Minus,
  Cpu,
  Fingerprint
} from "lucide-vue-next";
import { useSslBypassStore } from "@/stores/sslBypassStore";
import type { BypassFramework, FridaArch } from "@shared/types";

const store = useSslBypassStore();
const emit = defineEmits<{ (e: "close"): void }>();

const isMinimized = ref(false);
const apkFilePath = ref("");
const apkFileName = ref("");
const isDragging = ref(false);
const packageName = ref("");
const selectedFramework = ref<BypassFramework>("all");
const logContainerRef = ref<HTMLElement | null>(null);
const gadgetArch = ref<FridaArch>("arm64-v8a");

const frameworkOptions = [
  { label: "AI Universal Bypass", value: "all" },
  { label: "OkHttp3 / Retrofit", value: "okhttp3" },
  { label: "Conscrypt (System)", value: "conscrypt" },
  { label: "WebView / Chrome", value: "webview" },
  { label: "Flutter (Native)", value: "flutter" },
  { label: "React Native", value: "react-native" },
];

const archOptions = [
  { label: "ARM64-v8a (Android 10+)", value: "arm64-v8a" },
  { label: "x86_64 (Emulator)", value: "x86_64" },
];

let listeners: any[] = [];

onMounted(() => {
  listeners.push(window.electronAPI.onFridaLog((log) => {
    store.addFridaLog(log);
    nextTick(() => {
      if (logContainerRef.value) {
        logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight;
      }
    });
  }));

  listeners.push(window.electronAPI.onHostDetected((host) => {
    store.addDetectedHost(host);
  }));

  store.refreshDetectedHosts();
});

onUnmounted(() => listeners.forEach(l => l?.()));

async function patchApk() {
  if (!apkFilePath.value) return;
  const outputPath = apkFilePath.value.replace(".apk", "-patched.apk");
  await store.patchApk(apkFilePath.value, outputPath);
}

async function toggleFrida() {
  if (store.fridaRunning) {
    await store.stopFrida();
  } else {
    if (!packageName.value.trim()) return;
    await store.startFrida(packageName.value.trim(), selectedFramework.value);
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
                @drop.prevent="isDragging = false; /* handle drop logic */"
              >
                <div class="drop-content">
                  <Upload :size="32" class="icon" />
                  <div class="text">
                    <p class="p-main">{{ apkFileName || 'DRAG & DROP TARGET APK' }}</p>
                    <p class="p-sub">BINARY ANALYSIS ENGINE READY</p>
                  </div>
                </div>
              </div>

              <div class="controls-row" v-if="apkFileName">
                <button class="elite-btn primary" @click="patchApk">
                  <Zap :size="14" /> <span>INITIALIZE PATCH</span>
                </button>
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
                <div class="field-eg">
                  <label>TARGET PACKAGE</label>
                  <div class="input-eg">
                    <Fingerprint :size="14" class="icon" />
                    <input v-model="packageName" placeholder="com.example.app" />
                  </div>
                </div>
                <div class="field-eg">
                  <label>FRAMEWORK</label>
                  <Dropdown v-model="selectedFramework" :options="frameworkOptions" optionLabel="label" optionValue="value" class="dropdown-eg" />
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
                  <div v-for="(log, idx) in store.fridaLogs" :key="idx" class="log-line" :class="log.level">
                    <span class="ts">[{{ new Date(log.timestamp).toLocaleTimeString() }}]</span>
                    <span class="msg">{{ log.message }}</span>
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
  background: rgba(2, 6, 23, 0.8);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
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
</style>
