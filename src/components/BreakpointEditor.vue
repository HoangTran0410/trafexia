<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { X, Play, Trash2, Edit2 } from 'lucide-vue-next';
import { useToast } from 'primevue/usetoast';
import type { InterceptedRequest } from '../../shared/types';

const toast = useToast();
const pendingRequest = ref<InterceptedRequest | null>(null);
const isEditing = ref(false);

// Editable fields
const editedMethod = ref('');
const editedUrl = ref('');
const editedHeaders = ref('');
const editedBody = ref('');

let unsubscribe: (() => void) | null = null;

onMounted(() => {
  // Listen for breakpoint hits
  unsubscribe = window.electronAPI.onBreakpointHit((intercepted) => {
    pendingRequest.value = intercepted;
    isEditing.value = false;
    loadRequest(intercepted);
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});

function loadRequest(request: InterceptedRequest) {
  editedMethod.value = request.method;
  editedUrl.value = request.url;
  editedHeaders.value = Object.entries(request.headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  editedBody.value = request.body || '';
}

function parseHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const name = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();
      if (name) headers[name] = value;
    }
  }
  
  return headers;
}

async function continueRequest(modified: boolean = false) {
  if (!pendingRequest.value) return;

  try {
    if (modified && isEditing.value) {
      // Send modified request
      const modifiedRequest: InterceptedRequest = {
        ...pendingRequest.value,
        method: editedMethod.value,
        url: editedUrl.value,
        headers: parseHeaders(editedHeaders.value),
        body: editedBody.value || null,
      };
      
      // Clone to plain object to avoid Proxy cloning issues in IPC
      const plainModified = JSON.parse(JSON.stringify(modifiedRequest));
      await window.electronAPI.continueBreakpoint(pendingRequest.value.id, plainModified);
      
      toast.add({
        severity: 'success',
        summary: 'Continued',
        detail: 'Request forwarded with modifications',
        life: 2000
      });
    } else {
      // Continue with original
      await window.electronAPI.continueBreakpoint(pendingRequest.value.id);
      
      toast.add({
        severity: 'info',
        summary: 'Continued',
        detail: 'Request forwarded without changes',
        life: 2000
      });
    }
    
    pendingRequest.value = null;
  } catch (error) {
    console.error('Failed to continue request:', error);
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Could not continue request',
      life: 3000
    });
  }
}

async function dropRequest() {
  if (!pendingRequest.value) return;

  if (!confirm('Drop this request? It will not be forwarded to the server.')) {
    return;
  }

  try {
    await window.electronAPI.dropBreakpoint(pendingRequest.value.id);
    
    toast.add({
      severity: 'warn',
      summary: 'Dropped',
      detail: 'Request was not forwarded',
      life: 2000
    });
    
    pendingRequest.value = null;
  } catch (error) {
    console.error('Failed to drop request:', error);
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Could not drop request',
      life: 3000
    });
  }
}

const typeLabel = computed(() => {
  if (!pendingRequest.value) return '';
  return pendingRequest.value.type === 'request' ? 'Request' : 'Response';
});

const typeColor = computed(() => {
  if (!pendingRequest.value) return '';
  return pendingRequest.value.type === 'request' ? '#58a6ff' : '#3fb950';
});
</script>

<template>
  <div v-if="pendingRequest" class="breakpoint-overlay">
    <div class="breakpoint-dialog">
      <!-- Header -->
      <div class="breakpoint-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="type-badge" :style="{ borderColor: typeColor, color: typeColor }">
            {{ typeLabel }}
          </div>
          <h2>Breakpoint Hit</h2>
        </div>
        <button class="btn btn-ghost btn-icon" @click="dropRequest" title="Drop Request">
          <X style="width: 18px; height: 18px; color: #f85149;" />
        </button>
      </div>

      <!-- Info Bar -->
      <div class="info-bar">
        <span class="method-badge">{{ pendingRequest.method }}</span>
        <span class="url-text">{{ pendingRequest.url }}</span>
        <span v-if="pendingRequest.status" class="status-text">
          Status: {{ pendingRequest.status }}
        </span>
      </div>

      <!-- Content -->
      <div class="breakpoint-content">
        <!-- View/Edit Toggle -->
        <div class="toggle-bar">
          <button 
            class="toggle-btn" 
            :class="{ active: !isEditing }"
            @click="isEditing = false"
          >
            View
          </button>
          <button 
            class="toggle-btn" 
            :class="{ active: isEditing }"
            @click="isEditing = true"
          >
            <Edit2 style="width: 14px; height: 14px; margin-right: 4px;" />
            Edit
          </button>
        </div>

        <!-- View Mode -->
        <div v-if="!isEditing" class="view-mode">
          <div class="section">
            <h3>Method & URL</h3>
            <div class="view-field">
              <span class="method-tag">{{ pendingRequest.method }}</span>
              <code>{{ pendingRequest.url }}</code>
            </div>
          </div>

          <div class="section">
            <h3>Headers</h3>
            <div class="headers-list">
              <div v-for="[name, value] in Object.entries(pendingRequest.headers)" :key="name" class="header-row">
                <span class="header-name">{{ name }}:</span>
                <span class="header-value">{{ value }}</span>
              </div>
            </div>
          </div>

          <div v-if="pendingRequest.body" class="section">
            <h3>Body</h3>
            <pre class="body-preview">{{ pendingRequest.body }}</pre>
          </div>
        </div>

        <!-- Edit Mode -->
        <div v-else class="edit-mode">
          <div class="form-row">
            <div class="form-group" style="width: 120px;">
              <label>Method</label>
              <select v-model="editedMethod" class="select">
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
                <option>PATCH</option>
                <option>DELETE</option>
                <option>HEAD</option>
                <option>OPTIONS</option>
              </select>
            </div>
            <div class="form-group" style="flex: 1;">
              <label>URL</label>
              <input v-model="editedUrl" type="text" class="input" />
            </div>
          </div>

          <div class="form-group">
            <label>Headers (one per line: Name: Value)</label>
            <textarea v-model="editedHeaders" class="textarea" rows="8"></textarea>
          </div>

          <div class="form-group">
            <label>Body</label>
            <textarea v-model="editedBody" class="textarea" rows="10"></textarea>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="breakpoint-footer">
        <button class="btn btn-danger" @click="dropRequest">
          <Trash2 style="width: 16px; height: 16px; margin-right: 6px;" />
          Drop
        </button>
        <div style="flex: 1;"></div>
        <button v-if="!isEditing" class="btn btn-primary" @click="continueRequest(false)">
          <Play style="width: 16px; height: 16px; margin-right: 6px;" />
          Continue
        </button>
        <button v-else class="btn btn-primary" @click="continueRequest(true)">
          <Play style="width: 16px; height: 16px; margin-right: 6px;" />
          Continue with Changes
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.breakpoint-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(4px);
  animation: fadeIn 0.2s;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.breakpoint-dialog {
  background: #161b22;
  border: 2px solid #f85149;
  border-radius: 8px;
  width: 90%;
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(248, 81, 73, 0.3);
  animation: slideUp 0.3s;
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.breakpoint-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #30363d;
  background: linear-gradient(to right, rgba(248, 81, 73, 0.1), transparent);
}

.breakpoint-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #e6edf3;
}

.type-badge {
  padding: 4px 12px;
  border: 1px solid;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: #0d1117;
  border-bottom: 1px solid #30363d;
}

.method-badge {
  padding: 4px 8px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #58a6ff;
}

.url-text {
  flex: 1;
  font-family: monospace;
  font-size: 13px;
  color: #e6edf3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-text {
  font-size: 12px;
  color: #8b949e;
}

.breakpoint-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.toggle-bar {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  padding: 4px;
  background: #0d1117;
  border-radius: 6px;
  width: fit-content;
}

.toggle-btn {
  padding: 6px 16px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #8b949e;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
}

.toggle-btn:hover {
  color: #e6edf3;
  background: #21262d;
}

.toggle-btn.active {
  background: #238636;
  color: white;
}

.view-mode .section {
  margin-bottom: 24px;
}

.view-mode h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.view-field {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
}

.method-tag {
  padding: 4px 8px;
  background: #238636;
  color: white;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.view-field code {
  flex: 1;
  font-family: monospace;
  font-size: 13px;
  color: #e6edf3;
}

.headers-list {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 12px;
  max-height: 300px;
  overflow-y: auto;
}

.header-row {
  display: flex;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  font-family: monospace;
}

.header-name {
  color: #8b949e;
  min-width: 150px;
}

.header-value {
  flex: 1;
  color: #e6edf3;
  word-break: break-all;
}

.body-preview {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 16px;
  margin: 0;
  font-family: monospace;
  font-size: 13px;
  color: #e6edf3;
  max-height: 300px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.edit-mode .form-group {
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

.textarea {
  font-family: 'Consolas', monospace;
  resize: vertical;
}

.breakpoint-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid #30363d;
  background: #0d1117;
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

.btn-danger {
  background: transparent;
  color: #f85149;
  border: 1px solid #f85149;
}

.btn-danger:hover {
  background: rgba(248, 81, 73, 0.1);
}

.btn-ghost {
  background: transparent;
  color: #8b949e;
  border: none;
}

.btn-ghost:hover {
  color: #e6edf3;
  background: #21262d;
}

.btn-icon {
  padding: 6px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
