<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { X, Plus, Trash2, Edit, Power, PowerOff, FileCode, Globe } from 'lucide-vue-next';
import { useToast } from 'primevue/usetoast';
import { useLicenseStore } from '@/stores/licenseStore';
import type { MapRule } from '@shared/types';

const toast = useToast();
const licenseStore = useLicenseStore();
const emit = defineEmits<{ close: [] }>();

const rules = ref<MapRule[]>([]);
const showEditor = ref(false);
const editingRule = ref<MapRule | null>(null);

// Editor form
const formName = ref('');
const formType = ref<'local' | 'remote'>('remote');
const formSourcePattern = ref('');
const formSourceMethod = ref('');
const formDestinationUrl = ref('');
const formLocalFilePath = ref('');
const formLocalStatus = ref(200);
const formLocalHeaders = ref('Content-Type: application/json');
const formPreserveHost = ref(false);
const formEnabled = ref(true);

const HTTP_METHODS = ['', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const localRulesCount = computed(() => rules.value.filter(r => r.type === 'local').length);
const remoteRulesCount = computed(() => rules.value.filter(r => r.type === 'remote').length);
const activeRulesCount = computed(() => rules.value.filter(r => r.enabled).length);

onMounted(async () => {
  await loadRules();
});

async function loadRules() {
  try {
    rules.value = await window.electronAPI.getMapRules();
  } catch (error) {
    console.error('Failed to load map rules:', error);
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not load map rules', life: 3000 });
  }
}

function openEditor(rule?: MapRule) {
  if (!licenseStore.guardFeature('map-rules')) return;

  if (rule) {
    editingRule.value = rule;
    formName.value = rule.name;
    formType.value = rule.type;
    formSourcePattern.value = rule.sourceUrlPattern;
    formSourceMethod.value = rule.sourceMethod || '';
    formDestinationUrl.value = rule.destinationUrl || '';
    formLocalFilePath.value = rule.localFilePath || '';
    formLocalStatus.value = rule.localResponseStatus || 200;
    formLocalHeaders.value = rule.localResponseHeaders
      ? Object.entries(rule.localResponseHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')
      : 'Content-Type: application/json';
    formPreserveHost.value = rule.preserveHost || false;
    formEnabled.value = rule.enabled;
  } else {
    editingRule.value = null;
    formName.value = 'New Map Rule';
    formType.value = 'remote';
    formSourcePattern.value = '.*api\\.example\\.com/v1/.*';
    formSourceMethod.value = '';
    formDestinationUrl.value = 'https://staging-api.example.com/v1/';
    formLocalFilePath.value = '';
    formLocalStatus.value = 200;
    formLocalHeaders.value = 'Content-Type: application/json';
    formPreserveHost.value = false;
    formEnabled.value = true;
  }
  showEditor.value = true;
}

function closeEditor() {
  showEditor.value = false;
  editingRule.value = null;
}

function parseHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      headers[trimmed.slice(0, colonIndex).trim()] = trimmed.slice(colonIndex + 1).trim();
    }
  }
  return headers;
}

async function saveRule() {
  try {
    const ruleData: Omit<MapRule, 'id'> = {
      name: formName.value.trim(),
      enabled: formEnabled.value,
      type: formType.value,
      sourceUrlPattern: formSourcePattern.value.trim(),
      sourceMethod: formSourceMethod.value || undefined,
      destinationUrl: formType.value === 'remote' ? formDestinationUrl.value.trim() : undefined,
      localFilePath: formType.value === 'local' ? formLocalFilePath.value.trim() : undefined,
      localResponseStatus: formType.value === 'local' ? formLocalStatus.value : undefined,
      localResponseHeaders: formType.value === 'local' ? parseHeaders(formLocalHeaders.value) : undefined,
      preserveHost: formPreserveHost.value,
    };

    if (!ruleData.name || !ruleData.sourceUrlPattern) {
      toast.add({ severity: 'warn', summary: 'Validation', detail: 'Name and source URL pattern are required', life: 3000 });
      return;
    }

    if (formType.value === 'remote' && !ruleData.destinationUrl) {
      toast.add({ severity: 'warn', summary: 'Validation', detail: 'Destination URL is required for Map Remote', life: 3000 });
      return;
    }

    if (formType.value === 'local' && !ruleData.localFilePath) {
      toast.add({ severity: 'warn', summary: 'Validation', detail: 'Local file path is required for Map Local', life: 3000 });
      return;
    }

    if (editingRule.value) {
      await window.electronAPI.updateMapRule(editingRule.value.id, ruleData);
      toast.add({ severity: 'success', summary: 'Updated', detail: 'Map rule updated', life: 2000 });
    } else {
      await window.electronAPI.addMapRule(ruleData);
      toast.add({ severity: 'success', summary: 'Created', detail: 'Map rule created', life: 2000 });
    }

    await loadRules();
    closeEditor();
  } catch (error) {
    console.error('Failed to save map rule:', error);
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not save map rule', life: 3000 });
  }
}

async function deleteRule(id: string) {
  if (!confirm('Delete this map rule?')) return;
  try {
    await window.electronAPI.deleteMapRule(id);
    await loadRules();
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'Map rule deleted', life: 2000 });
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not delete map rule', life: 3000 });
  }
}

async function toggleRule(rule: MapRule) {
  try {
    await window.electronAPI.toggleMapRule(rule.id, !rule.enabled);
    await loadRules();
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Could not toggle map rule', life: 3000 });
  }
}
</script>

<template>
  <div class="map-overlay" @click.self="emit('close')">
    <div class="map-dialog">
      <!-- Header -->
      <div class="map-header">
        <div class="header-info">
          <h2>Map Local / Remote</h2>
          <div class="stats">
            <span class="stat-badge">{{ activeRulesCount }} active</span>
            <span class="stat-badge local"><FileCode :size="12" /> {{ localRulesCount }} local</span>
            <span class="stat-badge remote"><Globe :size="12" /> {{ remoteRulesCount }} remote</span>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary" @click="openEditor()">
            <Plus style="width: 16px; height: 16px; margin-right: 6px;" />
            Add Rule
          </button>
          <button class="btn btn-ghost btn-icon" @click="emit('close')" title="Close">
            <X style="width: 18px; height: 18px;" />
          </button>
        </div>
      </div>

      <!-- Rules List -->
      <div class="map-content">
        <div v-if="rules.length === 0" class="empty-state">
          <div class="empty-icon">
            <Globe :size="48" />
          </div>
          <p>No map rules configured</p>
          <p class="empty-hint">Redirect requests to local files or different URLs</p>
        </div>

        <div v-for="rule in rules" :key="rule.id" class="rule-card" :class="{ disabled: !rule.enabled }">
          <div class="rule-header">
            <div class="rule-info">
              <div class="rule-title-row">
                <span class="type-badge" :class="rule.type">
                  <FileCode v-if="rule.type === 'local'" :size="12" />
                  <Globe v-else :size="12" />
                  {{ rule.type === 'local' ? 'Local' : 'Remote' }}
                </span>
                <h3>{{ rule.name }}</h3>
              </div>
              <div class="rule-details">
                <div class="rule-flow">
                  <span class="flow-source">{{ rule.sourceUrlPattern }}</span>
                  <span class="flow-arrow">→</span>
                  <span class="flow-dest" v-if="rule.type === 'remote'">{{ rule.destinationUrl }}</span>
                  <span class="flow-dest local" v-else>{{ rule.localFilePath }}</span>
                </div>
              </div>
              <div class="rule-meta" v-if="rule.sourceMethod">
                <span class="badge">{{ rule.sourceMethod }}</span>
              </div>
            </div>
            <div class="rule-actions">
              <button class="btn btn-icon" @click="toggleRule(rule)" :title="rule.enabled ? 'Disable' : 'Enable'">
                <Power v-if="rule.enabled" style="width: 16px; height: 16px; color: #3fb950;" />
                <PowerOff v-else style="width: 16px; height: 16px; color: #8b949e;" />
              </button>
              <button class="btn btn-icon" @click="openEditor(rule)" title="Edit">
                <Edit style="width: 16px; height: 16px;" />
              </button>
              <button class="btn btn-icon" @click="deleteRule(rule.id)" title="Delete">
                <Trash2 style="width: 16px; height: 16px; color: #f85149;" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Editor Dialog -->
      <div v-if="showEditor" class="editor-overlay" @click.self="closeEditor">
        <div class="editor-dialog">
          <div class="editor-header">
            <h3>{{ editingRule ? 'Edit' : 'New' }} Map Rule</h3>
            <button class="btn btn-ghost btn-icon" @click="closeEditor">
              <X style="width: 16px; height: 16px;" />
            </button>
          </div>

          <div class="editor-content">
            <div class="form-group">
              <label>Rule Name</label>
              <input v-model="formName" type="text" class="input" placeholder="e.g., Redirect API to staging" />
            </div>

            <!-- Type Toggle -->
            <div class="type-toggle">
              <button
                :class="['toggle-btn', { active: formType === 'remote' }]"
                @click="formType = 'remote'"
              >
                <Globe :size="16" />
                Map Remote
              </button>
              <button
                :class="['toggle-btn', { active: formType === 'local' }]"
                @click="formType = 'local'"
              >
                <FileCode :size="16" />
                Map Local
              </button>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex: 1;">
                <label>Source URL Pattern (Regex)</label>
                <input v-model="formSourcePattern" type="text" class="input mono" placeholder=".*api\.example\.com/v1/.*" />
              </div>
              <div class="form-group" style="width: 120px;">
                <label>Method</label>
                <select v-model="formSourceMethod" class="select">
                  <option v-for="m in HTTP_METHODS" :key="m" :value="m">{{ m || 'ALL' }}</option>
                </select>
              </div>
            </div>

            <!-- Map Remote Fields -->
            <template v-if="formType === 'remote'">
              <div class="form-group">
                <label>Destination URL</label>
                <input v-model="formDestinationUrl" type="text" class="input mono" placeholder="https://staging-api.example.com/v1/" />
              </div>
              <div class="form-group">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                  <input v-model="formPreserveHost" type="checkbox" />
                  <span>Preserve original Host header</span>
                </label>
              </div>
            </template>

            <!-- Map Local Fields -->
            <template v-if="formType === 'local'">
              <div class="form-group">
                <label>Local File Path</label>
                <div class="file-input-row">
                  <input v-model="formLocalFilePath" type="text" class="input mono" placeholder="/path/to/response.json" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group" style="width: 120px;">
                  <label>Status Code</label>
                  <input v-model.number="formLocalStatus" type="number" class="input" />
                </div>
              </div>
              <div class="form-group">
                <label>Response Headers</label>
                <textarea v-model="formLocalHeaders" class="textarea" rows="3"></textarea>
              </div>
            </template>

            <div class="form-group">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input v-model="formEnabled" type="checkbox" />
                <span>Enabled</span>
              </label>
            </div>
          </div>

          <div class="editor-footer">
            <button class="btn btn-ghost" @click="closeEditor">Cancel</button>
            <button class="btn btn-primary" @click="saveRule">Save Rule</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.map-dialog {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  width: 90%;
  max-width: 950px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
}

.map-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #30363d;
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.map-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #e6edf3;
}

.stats {
  display: flex;
  gap: 8px;
}

.stat-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 8px;
  background: #21262d;
  border-radius: 4px;
  color: #8b949e;
}

.stat-badge.local { color: #f0883e; }
.stat-badge.remote { color: #58a6ff; }

.map-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #8b949e;
}

.empty-icon {
  color: #484f58;
  margin-bottom: 16px;
}

.empty-hint {
  font-size: 13px;
  color: #6e7681;
}

.rule-card {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  transition: border-color 0.2s;
}

.rule-card:hover {
  border-color: #484f58;
}

.rule-card.disabled {
  opacity: 0.5;
}

.rule-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.rule-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.rule-info h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #e6edf3;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.type-badge.local {
  background: rgba(240, 136, 62, 0.15);
  color: #f0883e;
}

.type-badge.remote {
  background: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
}

.rule-details {
  margin-bottom: 4px;
}

.rule-flow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-family: monospace;
}

.flow-source {
  color: #c9d1d9;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 3px;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow-arrow {
  color: #3fb950;
  font-weight: bold;
}

.flow-dest {
  color: #58a6ff;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow-dest.local {
  color: #f0883e;
}

.rule-meta {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  color: #8b949e;
}

.rule-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

/* Type Toggle */
.type-toggle {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
  background: #0d1117;
  border-radius: 8px;
  border: 1px solid #30363d;
  overflow: hidden;
}

.toggle-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: transparent;
  border: none;
  color: #8b949e;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}

.toggle-btn.active {
  background: rgba(88, 166, 255, 0.1);
  color: #58a6ff;
}

.file-input-row {
  display: flex;
  gap: 8px;
}

/* Reuse editor styles from MockRulesManager */
.editor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.editor-dialog {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 10px;
  width: 90%;
  max-width: 700px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #30363d;
}

.editor-header h3 {
  margin: 0;
  font-size: 16px;
  color: #e6edf3;
}

.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #8b949e;
}

.input, .select, .textarea {
  width: 100%;
  padding: 8px 12px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #e6edf3;
  font-size: 13px;
}

.input:focus, .select:focus, .textarea:focus {
  outline: none;
  border-color: #58a6ff;
}

.mono {
  font-family: 'SF Mono', 'Consolas', monospace;
}

.textarea {
  font-family: 'SF Mono', 'Consolas', monospace;
  resize: vertical;
}

.editor-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid #30363d;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  display: flex;
  align-items: center;
}

.btn-primary {
  background: #238636;
  color: white;
}

.btn-primary:hover {
  background: #2ea043;
}

.btn-ghost {
  background: transparent;
  color: #e6edf3;
  border: 1px solid #30363d;
}

.btn-ghost:hover {
  background: #21262d;
}

.btn-icon {
  padding: 6px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #8b949e;
  cursor: pointer;
  border-radius: 4px;
}

.btn-icon:hover {
  background: #21262d;
  color: #e6edf3;
}
</style>
