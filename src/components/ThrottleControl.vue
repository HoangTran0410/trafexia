<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Gauge, WifiOff } from 'lucide-vue-next';
import { useToast } from 'primevue/usetoast';
import { useLicenseStore } from '@/stores/licenseStore';
import type { ThrottleProfile, ThrottlePreset } from '@shared/types';
import { THROTTLE_PRESETS } from '@shared/types';

const emit = defineEmits<{ close: [] }>();
const toast = useToast();
const licenseStore = useLicenseStore();

const profile = ref<ThrottleProfile>({
  enabled: false,
  preset: 'none',
  downloadSpeed: 0,
  uploadSpeed: 0,
  latency: 0,
  packetLoss: 0,
  urlPattern: '',
});

const isLoading = ref(false);
const showCustom = ref(false);

const presetOptions = computed(() => [
  { value: 'none', label: '🚀 No Throttling', desc: 'Full speed' },
  { value: 'gprs', label: '📟 GPRS', desc: '50 Kbps / 500ms latency' },
  { value: 'edge', label: '📱 EDGE', desc: '250 Kbps / 300ms latency' },
  { value: '3g', label: '📶 3G', desc: '750 Kbps / 200ms latency' },
  { value: '3g-good', label: '📶 3G Good', desc: '1.5 Mbps / 100ms latency' },
  { value: '4g', label: '⚡ 4G/LTE', desc: '4 Mbps / 50ms latency' },
  { value: 'dsl', label: '🌐 DSL', desc: '2 Mbps / 20ms latency' },
  { value: 'wifi', label: '📡 WiFi', desc: '30 Mbps / 5ms latency' },
  { value: 'custom', label: '⚙️ Custom', desc: 'Set your own values' },
]);

const isActive = computed(() => profile.value.enabled && profile.value.preset !== 'none');

const currentPresetLabel = computed(() => {
  if (!isActive.value) return 'Off';
  const option = presetOptions.value.find(o => o.value === profile.value.preset);
  return option?.label || 'Custom';
});

onMounted(async () => {
  try {
    profile.value = await window.electronAPI.getThrottleProfile();
    showCustom.value = profile.value.preset === 'custom';
  } catch (e) {
    console.error('Failed to load throttle profile:', e);
  }
});

async function selectPreset(preset: ThrottlePreset | 'custom') {
  if (!licenseStore.guardFeature('throttle')) return;

  profile.value.preset = preset;
  
  if (preset === 'none') {
    profile.value.enabled = false;
  } else if (preset !== 'custom') {
    profile.value.enabled = true;
    const presetData = THROTTLE_PRESETS[preset as Exclude<ThrottlePreset, 'custom' | 'none'>];
    if (presetData) {
      profile.value.downloadSpeed = presetData.download;
      profile.value.uploadSpeed = presetData.upload;
      profile.value.latency = presetData.latency;
    }
  } else {
    profile.value.enabled = true;
    showCustom.value = true;
  }

  await applyProfile();
}

async function applyProfile() {
  isLoading.value = true;
  try {
    // Clone to plain object to avoid Proxy cloning issues in IPC
    const plainProfile = JSON.parse(JSON.stringify(profile.value));
    await window.electronAPI.setThrottleProfile(plainProfile);
    toast.add({
      severity: isActive.value ? 'warn' : 'success',
      summary: isActive.value ? 'Throttling Active' : 'Throttling Disabled',
      detail: isActive.value ? `Speed: ${currentPresetLabel.value}` : 'Full speed restored',
      life: 3000,
    });
  } catch (e) {
    console.error('Failed to set throttle:', e);
    toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to apply throttle profile', life: 3000 });
  } finally {
    isLoading.value = false;
  }
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '0';
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}
</script>

<template>
  <div class="throttle-panel">
    <div class="throttle-header">
      <div class="header-left">
        <Gauge :size="20" :class="{ 'text-active': isActive }" />
        <h3>Network Throttle</h3>
        <span v-if="isActive" class="active-badge">ACTIVE</span>
      </div>
      <button class="btn-close" @click="emit('close')">✕</button>
    </div>

    <!-- Preset Grid -->
    <div class="preset-grid">
      <button
        v-for="option in presetOptions"
        :key="option.value"
        class="preset-btn"
        :class="{ 
          active: profile.preset === option.value,
          danger: option.value !== 'none' && option.value !== 'custom' && profile.preset === option.value && profile.enabled
        }"
        @click="selectPreset(option.value as ThrottlePreset)"
      >
        <span class="preset-label">{{ option.label }}</span>
        <span class="preset-desc">{{ option.desc }}</span>
      </button>
    </div>

    <!-- Custom Settings -->
    <div v-if="showCustom && profile.preset === 'custom'" class="custom-settings">
      <div class="setting-row">
        <label>Download Speed</label>
        <div class="input-group">
          <input type="number" v-model.number="profile.downloadSpeed" min="0" class="num-input" />
          <span class="unit">B/s</span>
        </div>
        <span class="current-val">{{ formatSpeed(profile.downloadSpeed) }}</span>
      </div>
      <div class="setting-row">
        <label>Upload Speed</label>
        <div class="input-group">
          <input type="number" v-model.number="profile.uploadSpeed" min="0" class="num-input" />
          <span class="unit">B/s</span>
        </div>
        <span class="current-val">{{ formatSpeed(profile.uploadSpeed) }}</span>
      </div>
      <div class="setting-row">
        <label>Latency</label>
        <div class="input-group">
          <input type="number" v-model.number="profile.latency" min="0" max="10000" class="num-input" />
          <span class="unit">ms</span>
        </div>
      </div>
      <div class="setting-row">
        <label>Packet Loss</label>
        <div class="input-group">
          <input type="number" v-model.number="profile.packetLoss" min="0" max="100" step="1" class="num-input" />
          <span class="unit">%</span>
        </div>
      </div>
      <div class="setting-row">
        <label>URL Pattern (optional)</label>
        <input type="text" v-model="profile.urlPattern" placeholder=".*api\.example\.com.*" class="text-input" />
      </div>
      <button class="btn-apply" @click="applyProfile" :disabled="isLoading">
        {{ isLoading ? 'Applying...' : 'Apply Custom Profile' }}
      </button>
    </div>

    <!-- Status -->
    <div v-if="isActive" class="status-bar">
      <WifiOff :size="14" />
      <span>Throttling is active — responses will be delayed</span>
    </div>
  </div>
</template>

<style scoped>
.throttle-panel {
  background: #161b22;
  border-radius: 12px;
  border: 1px solid rgba(48, 54, 61, 0.8);
  overflow: hidden;
}

.throttle-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(48, 54, 61, 0.8);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-left h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #e6edf3;
}

.text-active {
  color: #f0883e;
}

.active-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  background: rgba(240, 136, 62, 0.2);
  color: #f0883e;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.btn-close {
  background: none;
  border: none;
  color: #8b949e;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.btn-close:hover {
  background: rgba(248, 81, 73, 0.1);
  color: #f85149;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 16px 20px;
}

.preset-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(48, 54, 61, 0.6);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  color: #c9d1d9;
}

.preset-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(88, 166, 255, 0.3);
}

.preset-btn.active {
  background: rgba(88, 166, 255, 0.1);
  border-color: rgba(88, 166, 255, 0.5);
}

.preset-btn.active.danger {
  background: rgba(240, 136, 62, 0.1);
  border-color: rgba(240, 136, 62, 0.4);
}

.preset-label {
  font-size: 13px;
  font-weight: 600;
}

.preset-desc {
  font-size: 10px;
  color: #6e7681;
  text-align: center;
}

.custom-settings {
  padding: 0 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.setting-row label {
  font-size: 12px;
  font-weight: 500;
  color: #8b949e;
  min-width: 110px;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.num-input {
  width: 100px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(48, 54, 61, 0.8);
  border-radius: 6px;
  color: #e6edf3;
  font-size: 13px;
  font-family: 'SF Mono', monospace;
}

.text-input {
  flex: 1;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(48, 54, 61, 0.8);
  border-radius: 6px;
  color: #e6edf3;
  font-size: 13px;
  font-family: 'SF Mono', monospace;
}

.unit {
  font-size: 11px;
  color: #6e7681;
  min-width: 24px;
}

.current-val {
  font-size: 11px;
  color: #58a6ff;
  font-family: 'SF Mono', monospace;
}

.btn-apply {
  padding: 10px 20px;
  background: linear-gradient(135deg, #58a6ff, #8860d0);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 4px;
  transition: all 0.2s;
}

.btn-apply:hover:not(:disabled) {
  box-shadow: 0 4px 15px rgba(88, 166, 255, 0.3);
}

.btn-apply:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: rgba(240, 136, 62, 0.1);
  border-top: 1px solid rgba(240, 136, 62, 0.2);
  font-size: 12px;
  color: #f0883e;
}
</style>
