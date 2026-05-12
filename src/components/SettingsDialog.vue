<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import InputSwitch from 'primevue/inputswitch';
import Button from 'primevue/button';
import { useToast } from 'primevue/usetoast';
import {
  Download,
  Shield,
  Clock,
  FileDown,
  Chrome,
  Globe,
  Smartphone,
  Copy
} from 'lucide-vue-next';

import { useSettingsStore } from '@/stores/settingsStore';
import { useProxyStore } from '@/stores/proxyStore';
import { useLicenseStore } from '@/stores/licenseStore';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();

const toast = useToast();
const settingsStore = useSettingsStore();
const proxyStore = useProxyStore();
const licenseStore = useLicenseStore();

// Local settings copy
const localSettings = ref({ ...settingsStore.settings });

// Sync when dialog opens
watch(() => props.visible, (newVal) => {
  if (newVal) {
    localSettings.value = { ...settingsStore.settings };
  }
});

const isVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value),
});

async function saveSettings() {
  await settingsStore.saveSettings(localSettings.value);
  toast.add({
    severity: 'success',
    summary: 'Settings Saved',
    detail: 'Your settings have been saved',
    life: 2000,
  });
  isVisible.value = false;
}

async function exportAllRequests(format: 'har' | 'json') {
  try {
    const path = await window.electronAPI.exportRequests(format);
    if (path) {
      toast.add({
        severity: 'success',
        summary: 'Export Complete',
        detail: `Requests exported to ${path}`,
        life: 3000,
      });
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Export Failed',
      detail: 'Could not export requests',
      life: 3000,
    });
  }
}

async function openCertPath() {
  const certPath = await window.electronAPI.getCertPath();
  toast.add({
    severity: 'info',
    summary: 'Certificate Location',
    detail: certPath,
    life: 5000,
  });
}

// Browser/Emulator functions
async function launchBrowser(browser: 'chrome' | 'edge') {
  try {
    await window.electronAPI.launchBrowser(browser);
    toast.add({
      severity: 'success',
      summary: 'Browser Launched',
      detail: `${browser === 'chrome' ? 'Chrome' : 'Edge'} launched with proxy settings`,
      life: 3000,
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Launch Failed',
      detail: `Could not launch ${browser}. Make sure it's installed.`,
      life: 4000,
    });
  }
}

async function copyAdbCommand() {
  const localIp = await window.electronAPI.getLocalIp();
  const port = settingsStore.settings.proxyPort;
  const command = `adb shell settings put global http_proxy ${localIp}:${port}`;
  
  await navigator.clipboard.writeText(command);
  toast.add({
    severity: 'success',
    summary: 'Copied!',
    detail: 'ADB command copied to clipboard',
    life: 2000,
  });
}

async function copyAdbClearCommand() {
  const command = `adb shell settings put global http_proxy :0`;
  await navigator.clipboard.writeText(command);
  toast.add({
    severity: 'success',
    summary: 'Copied!',
    detail: 'ADB clear proxy command copied',
    life: 2000,
  });
}
</script>

<template>
  <Dialog v-model:visible="isVisible" header="Settings" :modal="true" :style="{ width: '540px' }" :closable="true"
    class="settings-dialog" :pt="{
      root: { class: 'bg-[#161b22] border border-[#30363d] text-[#c9d1d9]' },
      header: { class: 'bg-[#161b22] border-b border-[#30363d] px-6 py-4 text-[#c9d1d9]' },
      content: { class: 'bg-[#161b22] px-6 py-6 text-[#c9d1d9]' },
      footer: { class: 'bg-[#161b22] border-t border-[#30363d] px-6 py-4' },
      closeButton: { class: 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]' }
    }">
    <div class="space-y-8">
      <!-- Proxy Settings -->
      <section>
        <h4 class="text-sm font-semibold text-[#e6edf3] mb-4 flex items-center gap-2">
          <Shield class="w-4 h-4 text-blue-400" />
          Proxy Configuration
        </h4>

        <div class="space-y-4">
          <div class="setting-item">
            <div class="setting-info">
              <label class="setting-label">Proxy Port</label>
              <span class="setting-desc">Port for incoming connections</span>
            </div>
            <InputNumber v-model="localSettings.proxyPort" :min="1024" :max="65535" :useGrouping="false"
              class="w-32 custom-input" :disabled="proxyStore.isRunning" />
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <label class="setting-label">HTTPS Interception</label>
              <span class="setting-desc">Decrypt and inspect secure traffic</span>
            </div>
            <InputSwitch v-model="localSettings.enableHttps" />
          </div>
        </div>
      </section>

      <!-- Storage Settings -->
      <section>
        <h4 class="text-sm font-semibold text-[#e6edf3] mb-4 flex items-center gap-2">
          <Clock class="w-4 h-4 text-orange-400" />
          Storage Retention
        </h4>

        <div class="setting-item">
          <div class="setting-info">
            <label class="setting-label">Auto-clear Requests</label>
            <span class="setting-desc">Remove traffic older than specified hours</span>
          </div>
          <div class="flex items-center gap-3">
            <InputNumber v-model="localSettings.autoClearHours" :min="1" :max="168" class="w-24 custom-input"
              suffix=" h" />
          </div>
        </div>
      </section>

      <!-- Data Management -->
      <section>
        <h4 class="text-sm font-semibold text-[#e6edf3] mb-4 flex items-center gap-2">
          <FileDown class="w-4 h-4 text-green-400" />
          Data Management
        </h4>

        <div class="grid grid-cols-2 gap-4">
          <button class="action-card" :class="{ 'feature-locked': !licenseStore.hasFeature('export-har') }" @click="licenseStore.guardFeature('export-har') && exportAllRequests('har')">
            <FileDown class="w-5 h-5 mb-2 text-blue-400" />
            <span class="font-medium">Export HAR</span>
            <span class="text-xs text-center text-[#8b949e]">Standard HTTP Archive format</span>
            <span v-if="!licenseStore.hasFeature('export-har')" class="lock-badge">PRO</span>
          </button>

          <button class="action-card" :class="{ 'feature-locked': !licenseStore.hasFeature('export-har') }" @click="licenseStore.guardFeature('export-har') && exportAllRequests('json')">
            <FileDown class="w-5 h-5 mb-2 text-green-400" />
            <span class="font-medium">Export JSON</span>
            <span class="text-xs text-center text-[#8b949e]">Raw request data</span>
            <span v-if="!licenseStore.hasFeature('export-har')" class="lock-badge">PRO</span>
          </button>
        </div>
      </section>

      <!-- Quick Connect -->
      <section>
        <h4 class="text-sm font-semibold text-[#e6edf3] mb-4 flex items-center gap-2">
          <Globe class="w-4 h-4 text-purple-400" />
          Quick Connect
        </h4>

        <!-- Browser Section -->
        <div class="mb-4">
          <span class="text-xs text-[#8b949e] block mb-3">Launch browser with proxy configured:</span>
          <div class="grid grid-cols-2 gap-3">
            <button class="action-card-sm" @click="launchBrowser('chrome')">
              <Chrome class="w-5 h-5 text-blue-400" />
              <span class="font-medium">Chrome</span>
            </button>
            <button class="action-card-sm" @click="launchBrowser('edge')">
              <Globe class="w-5 h-5 text-cyan-400" />
              <span class="font-medium">Edge</span>
            </button>
          </div>
        </div>

        <!-- Emulator Section -->
        <div>
          <span class="text-xs text-[#8b949e] block mb-3">Android Emulator (ADB commands):</span>
          <div class="grid grid-cols-2 gap-3">
            <button class="action-card-sm" @click="copyAdbCommand">
              <Smartphone class="w-5 h-5 text-green-400" />
              <span class="font-medium">Set Proxy</span>
            </button>
            <button class="action-card-sm" @click="copyAdbClearCommand">
              <Copy class="w-5 h-5 text-orange-400" />
              <span class="font-medium">Clear Proxy</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Certificate -->
      <section class="bg-[#21262d] rounded-lg p-4 border border-[#30363d]">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h5 class="text-sm font-medium text-[#e6edf3] flex items-center gap-2 mb-1">
              <Download class="w-4 h-4 text-yellow-400" />
              CA Certificate
            </h5>
            <p class="text-xs text-[#8b949e] leading-relaxed">
              Required for HTTPS interception on devices. Install this root CA on your target device.
            </p>
          </div>
          <Button label="Show File" severity="secondary" :pt="{
            root: { class: 'bg-[#30363d] border border-[#484f58] hover:bg-[#484f58] text-[#c9d1d9] text-xs px-3 py-2 h-auto' }
          }" @click="openCertPath" />
        </div>
      </section>
    </div>

    <template #footer>
      <div class="flex justify-end gap-3 pt-2">
        <Button label="Cancel" text :pt="{
          root: { class: 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] px-6 h-10' }
        }" @click="isVisible = false" />
        <Button label="Save Changes" :pt="{
          root: { class: 'bg-[#238636] hover:bg-[#2ea043] border border-[rgba(240,246,252,0.1)] text-white font-medium px-6 h-10 shadow-sm' }
        }" @click="saveSettings" />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.settings-dialog {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

section {
  padding-bottom: 24px;
  border-bottom: 1px solid #30363d;
  margin-bottom: 24px;
}

section:last-child {
  padding-bottom: 0;
  border-bottom: none;
  margin-bottom: 0;
}

section h4 {
  font-size: 14px;
  font-weight: 600;
  color: #e6edf3;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  min-height: 48px;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  padding-right: 24px;
}

.setting-label {
  font-size: 15px;
  color: #e6edf3;
  font-weight: 600;
}

.setting-desc {
  font-size: 14px;
  color: #8b949e;
  line-height: 1.5;
}

.custom-input {
  text-align: right;
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #c9d1d9;
  height: 100px;
}

.action-card:hover {
  background: #30363d;
  border-color: #8b949e;
}

.action-card .font-medium {
  font-size: 15px;
  margin-bottom: 6px;
  font-weight: 600;
  color: #e6edf3;
}

.action-card svg {
  width: 24px !important;
  height: 24px !important;
  margin-bottom: 8px;
}

.action-card-sm {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #c9d1d9;
}

.action-card-sm:hover {
  background: #30363d;
  border-color: #8b949e;
}

.action-card-sm .font-medium {
  font-size: 14px;
  font-weight: 600;
  color: #e6edf3;
}

.action-card-sm svg {
  width: 20px !important;
  height: 20px !important;
}

/* Feature lock styles */
.action-card.feature-locked {
  opacity: 0.5;
  cursor: not-allowed;
  position: relative;
}

.action-card.feature-locked:hover {
  background: #21262d;
  border-color: #30363d;
}

.lock-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #38BDF8;
  background: rgba(56, 189, 248, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

/* Deep/Global overrides for PrimeVue inside this component */
:deep(.p-inputnumber-input) {
  background: #0d1117 !important;
  border: 1px solid #30363d !important;
  color: #e6edf3 !important;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  text-align: right;
  transition: border-color 0.2s;
  height: 40px;
  width: 100%;
}

:deep(.p-inputnumber-input:focus) {
  border-color: #58a6ff !important;
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.3) !important;
}

:deep(.p-inputswitch) {
  width: 44px;
  height: 26px;
}

:deep(.p-inputswitch .p-inputswitch-slider) {
  background: #30363d;
  border-radius: 26px;
  transition: background-color 0.2s;
}

:deep(.p-inputswitch .p-inputswitch-slider:before) {
  width: 20px;
  height: 20px;
  left: 3px;
  margin-top: -10px;
  border-radius: 50%;
  background: #e6edf3;
  transition: transform 0.2s;
}

:deep(.p-inputswitch.p-inputswitch-checked .p-inputswitch-slider) {
  background: #238636;
}

:deep(.p-inputswitch.p-inputswitch-checked .p-inputswitch-slider:before) {
  transform: translateX(18px);
}
</style>
```
