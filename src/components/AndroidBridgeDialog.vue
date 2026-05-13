<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Smartphone, RefreshCw, ShieldCheck, ShieldAlert, Monitor, CheckCircle2, Play } from 'lucide-vue-next';
import type { AndroidDevice } from '@shared/types';
import { useToast } from 'primevue/usetoast';

const emit = defineEmits<{
  close: [];
}>();

const toast = useToast();
const devices = ref<AndroidDevice[]>([]);
const isLoading = ref(false);
const isBridging = ref<string | null>(null);
const avds = ref<string[]>([]);
const isLaunching = ref<string | null>(null);

async function refreshDevices() {
  isLoading.value = true;
  try {
    devices.value = await window.electronAPI.getAndroidDevices();
    // Also fetch available AVDs if devices is empty or just to have them
    avds.value = await window.electronAPI.getAndroidAvds();
  } catch (error) {
    console.error('Failed to load devices:', error);
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to list Android devices',
      life: 3000
    });
  } finally {
    isLoading.value = false;
  }
}

async function launchAvd(name: string) {
  isLaunching.value = name;
  try {
    const success = await window.electronAPI.launchAndroidAvd(name);
    if (success) {
      toast.add({
        severity: 'info',
        summary: 'Starting',
        detail: `Launching emulator ${name}...`,
        life: 3000
      });
      // Start polling for devices
      const poll = setInterval(async () => {
        const newDevices = await window.electronAPI.getAndroidDevices();
        if (newDevices.length > devices.value.length) {
          devices.value = newDevices;
          clearInterval(poll);
        }
      }, 2000);
      // Stop polling after 30s
      setTimeout(() => clearInterval(poll), 30000);
    }
  } catch (error) {
    console.error('Failed to launch AVD:', error);
  } finally {
    isLaunching.value = null;
  }
}

async function bridgeToDevice(device: AndroidDevice) {
  isBridging.value = device.id;
  try {
    const success = await window.electronAPI.bridgeAndroidDevice(device.id);
    if (success) {
      toast.add({
        severity: 'success',
        summary: 'Connected',
        detail: `Successfully bridged to ${device.model}`,
        life: 3000
      });
      emit('close');
    } else {
      throw new Error('Failed to bridge');
    }
  } catch (error) {
    console.error('Failed to bridge device:', error);
    toast.add({
      severity: 'error',
      summary: 'Failed',
      detail: `Could not configure proxy on ${device.model}`,
      life: 3000
    });
  } finally {
    isBridging.value = null;
  }
}

onMounted(() => {
  refreshDevices();
});
</script>

<template>
  <div class="bridge-overlay" @click.self="$emit('close')">
    <div class="bridge-dialog">
      <div class="bridge-header">
        <div class="title-wrap">
          <Smartphone :size="20" class="text-sky" />
          <h2>Android Bridge</h2>
        </div>
        <button class="refresh-btn" :class="{ 'spinning': isLoading }" @click="refreshDevices" :disabled="isLoading">
          <RefreshCw :size="16" />
        </button>
      </div>

      <div class="bridge-content">
        <div v-if="isLoading && devices.length === 0" class="empty-state">
          <RefreshCw class="animate-spin text-muted" :size="32" />
          <p>Scanning for devices...</p>
        </div>

        <div v-else-if="devices.length === 0" class="empty-state">
          <Smartphone class="text-muted" :size="32" />
          <p>No active devices detected</p>
          
          <div v-if="avds.length > 0" class="avd-suggestions">
            <span class="suggestion-title">Launch an emulator:</span>
            <div class="avd-list">
              <div v-for="avd in avds" :key="avd" class="avd-item">
                <div class="avd-info">
                  <Monitor :size="14" class="text-purple" />
                  <span>{{ avd }}</span>
                </div>
                <button 
                  class="launch-btn" 
                  @click="launchAvd(avd)"
                  :disabled="!!isLaunching"
                >
                  <RefreshCw v-if="isLaunching === avd" class="animate-spin" :size="10" />
                  <Play v-else :size="10" fill="currentColor" />
                  {{ isLaunching === avd ? 'STARTING...' : 'LAUNCH' }}
                </button>
              </div>
            </div>
          </div>
          
          <span v-else class="hint">Connect a device via USB or create an emulator in Android Studio</span>
        </div>

        <div v-else class="device-list">
          <div v-for="device in devices" :key="device.id" class="device-card">
            <div class="device-info">
              <div class="icon-box" :class="device.type">
                <Monitor v-if="device.type === 'emulator'" :size="18" />
                <Smartphone v-else :size="18" />
              </div>
              <div class="details">
                <div class="model-row">
                  <span class="model">{{ device.model }}</span>
                  <span class="id">{{ device.id }}</span>
                </div>
                <div class="status-row">
                  <span class="badge status" :class="device.status">{{ device.status }}</span>
                  <span class="badge type">{{ device.type }}</span>
                  <span class="badge root" :class="{ 'rooted': device.isRooted }">
                    <ShieldCheck v-if="device.isRooted" :size="10" />
                    <ShieldAlert v-else :size="10" />
                    {{ device.isRooted ? 'ROOTED' : 'UNROOTED' }}
                  </span>
                </div>
              </div>
            </div>

            <button 
              class="connect-btn" 
              @click="bridgeToDevice(device)"
              :disabled="!!isBridging"
            >
              <RefreshCw v-if="isBridging === device.id" class="animate-spin" :size="14" />
              <CheckCircle2 v-else :size="14" />
              <span>{{ isBridging === device.id ? 'CONNECTING' : 'BRIDGE' }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="bridge-footer">
        <p class="footer-hint">
          ADB bridge sets the global HTTP proxy on the device automatically.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bridge-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bridge-dialog {
  width: 90%;
  max-width: 500px;
  background: #0D1117;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.bridge-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bridge-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #F1F5F9;
}

.refresh-btn {
  background: transparent;
  border: none;
  color: #94A3B8;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.refresh-btn:hover {
  color: #38BDF8;
  background: rgba(56, 189, 248, 0.1);
}

.refresh-btn.spinning {
  animation: spin 1s linear infinite;
}

.bridge-content {
  padding: 20px;
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  text-align: center;
}

.empty-state p {
  margin: 16px 0 4px;
  color: #F1F5F9;
  font-weight: 500;
}

.avd-suggestions {
  margin-top: 24px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}

.suggestion-title {
  font-size: 11px;
  font-weight: 700;
  color: #64748B;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.avd-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.avd-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
}

.avd-info {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #E2E8F0;
}

.launch-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(168, 85, 247, 0.1);
  color: #A855F7;
  border: 1px solid rgba(168, 85, 247, 0.2);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
}

.launch-btn:hover:not(:disabled) {
  background: #A855F7;
  color: #FFFFFF;
}

.launch-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hint {
  font-size: 12px;
  color: #64748B;
}

.device-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.device-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  transition: all 0.2s;
}

.device-card:hover {
  border-color: rgba(56, 189, 248, 0.3);
  background: rgba(56, 189, 248, 0.02);
}

.device-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-box {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  color: #94A3B8;
}

.icon-box.emulator { color: #A855F7; }
.icon-box.physical { color: #10B981; }

.details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.model-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model {
  font-weight: 600;
  font-size: 14px;
  color: #F1F5F9;
}

.id {
  font-size: 11px;
  color: #64748B;
  font-family: 'SF Mono', monospace;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.badge {
  font-size: 9px;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.badge.status.device { background: rgba(16, 185, 129, 0.1); color: #10B981; }
.badge.type { background: rgba(148, 163, 184, 0.1); color: #94A3B8; }
.badge.root { 
  display: flex; 
  align-items: center; 
  gap: 3px;
  background: rgba(248, 81, 73, 0.1); 
  color: #F85149; 
}
.badge.root.rooted { 
  background: rgba(56, 189, 248, 0.1); 
  color: #38BDF8; 
}

.connect-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #38BDF8;
  color: #0F172A;
  border: none;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.connect-btn:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.connect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bridge-footer {
  padding: 12px 20px;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.footer-hint {
  margin: 0;
  font-size: 11px;
  color: #64748B;
  text-align: center;
}

.text-sky { color: #38BDF8; }
.text-muted { color: #334155; }

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
