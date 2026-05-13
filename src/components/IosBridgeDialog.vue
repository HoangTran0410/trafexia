<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Smartphone, RefreshCw, Play, Apple } from 'lucide-vue-next';
import type { IosDevice } from '@shared/types';
import { useToast } from 'primevue/usetoast';

defineEmits<{
  close: [];
}>();

const toast = useToast();
const devices = ref<IosDevice[]>([]);
const isLoading = ref(false);
const isLaunching = ref<string | null>(null);

async function refreshDevices() {
  isLoading.value = true;
  try {
    devices.value = await window.electronAPI.getIosDevices();
  } catch (error) {
    console.error('Failed to load iOS devices:', error);
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to list iOS simulators',
      life: 3000
    });
  } finally {
    isLoading.value = false;
  }
}

async function launchDevice(device: IosDevice) {
  isLaunching.value = device.udid;
  try {
    const success = await window.electronAPI.launchIosDevice(device.udid);
    if (success) {
      toast.add({
        severity: 'info',
        summary: 'Starting',
        detail: `Launching ${device.name}...`,
        life: 3000
      });
      // Update state locally
      device.state = 'Booting';
      // Poll for status
      const poll = setInterval(async () => {
        const currentDevices = await window.electronAPI.getIosDevices();
        const updated = currentDevices.find(d => d.udid === device.udid);
        if (updated && updated.state === 'Booted') {
          device.state = 'Booted';
          clearInterval(poll);
        }
      }, 2000);
      setTimeout(() => clearInterval(poll), 30000);
    }
  } catch (error) {
    console.error('Failed to launch iOS device:', error);
  } finally {
    isLaunching.value = null;
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
          <Apple :size="20" class="text-apple" />
          <h2>iOS Bridge</h2>
        </div>
        <button class="refresh-btn" :class="{ 'spinning': isLoading }" @click="refreshDevices" :disabled="isLoading">
          <RefreshCw :size="16" />
        </button>
      </div>

      <div class="bridge-content">
        <div v-if="isLoading && devices.length === 0" class="empty-state">
          <RefreshCw class="animate-spin text-muted" :size="32" />
          <p>Scanning for simulators...</p>
        </div>

        <div v-else-if="devices.length === 0" class="empty-state">
          <Apple class="text-muted" :size="32" />
          <p>No iOS Simulators detected</p>
          <span class="hint">Ensure Xcode and Command Line Tools are installed</span>
        </div>

        <div v-else class="device-list">
          <div v-for="device in devices" :key="device.udid" class="device-card">
            <div class="device-info">
              <div class="icon-box" :class="{ 'booted': device.state === 'Booted' }">
                <Smartphone :size="18" />
              </div>
              <div class="details">
                <div class="model-row">
                  <span class="model">{{ device.name }}</span>
                  <span class="runtime">{{ device.runtime }}</span>
                </div>
                <div class="status-row">
                  <span class="badge status" :class="device.state.toLowerCase()">{{ device.state }}</span>
                </div>
              </div>
            </div>

            <button 
              v-if="device.state !== 'Booted'"
              class="launch-btn" 
              @click="launchDevice(device)"
              :disabled="!!isLaunching"
            >
              <RefreshCw v-if="isLaunching === device.udid" class="animate-spin" :size="14" />
              <Play v-else :size="14" fill="currentColor" />
              <span>{{ isLaunching === device.udid ? 'BOOTING' : 'LAUNCH' }}</span>
            </button>
            <div v-else class="connected-badge">
              <CheckCircle2 :size="14" class="text-green" />
              <span>ACTIVE</span>
            </div>
          </div>
        </div>
      </div>

      <div class="bridge-footer">
        <p class="footer-hint">
          iOS Simulators use the macOS system proxy by default.
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

.text-apple { color: #FFFFFF; }

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
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.03);
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
  color: #64748B;
}

.icon-box.booted { color: #10B981; background: rgba(16, 185, 129, 0.1); }

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

.runtime {
  font-size: 10px;
  color: #64748B;
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 6px;
  border-radius: 4px;
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
  text-transform: uppercase;
}

.badge.booted { background: rgba(16, 185, 129, 0.1); color: #10B981; }
.badge.shutdown { background: rgba(148, 163, 184, 0.1); color: #94A3B8; }
.badge.booting { background: rgba(56, 189, 248, 0.1); color: #38BDF8; }

.launch-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #F1F5F9;
  color: #0F172A;
  border: none;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.launch-btn:hover:not(:disabled) {
  filter: brightness(0.9);
  transform: translateY(-1px);
}

.launch-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.connected-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #10B981;
  font-size: 10px;
  font-weight: 800;
  padding-right: 8px;
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

.text-muted { color: #334155; }
.text-green { color: #10B981; }

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
