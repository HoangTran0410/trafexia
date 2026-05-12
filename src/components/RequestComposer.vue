<script setup lang="ts">
import { ref, computed } from 'vue';
import { X, Send } from 'lucide-vue-next';
import { useToast } from 'primevue/usetoast';
import type { ComposedRequest } from '../../shared/types';

const toast = useToast();
const emit = defineEmits<{
  close: [];
}>();

const method = ref('GET');
const url = ref('https://api.example.com/data');
const headersText = ref('Content-Type: application/json\nUser-Agent: Trafexia/1.0');
const body = ref('{\n  "key": "value"\n}');
const isSending = ref(false);

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const parsedHeaders = computed(() => {
  const headers: Record<string, string> = {};
  const lines = headersText.value.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const name = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();
      if (name) {
        headers[name] = value;
      }
    }
  }
  
  return headers;
});

const isValid = computed(() => {
  if (!url.value.trim()) return false;
  try {
    new URL(url.value);
    return true;
  } catch {
    return false;
  }
});

async function sendRequest() {
  if (!isValid.value || isSending.value) return;
  
  isSending.value = true;
  try {
    const request: ComposedRequest = {
      method: method.value,
      url: url.value.trim(),
      headers: parsedHeaders.value,
      body: body.value.trim() || undefined,
    };
    
    toast.add({
      severity: 'info',
      summary: 'Sending...',
      detail: `${request.method} ${request.url}`,
      life: 2000
    });
    
    // Clone to plain object to avoid Proxy cloning issues in IPC
    const plainRequest = JSON.parse(JSON.stringify(request));
    await window.electronAPI.composeRequest(plainRequest);
    
    toast.add({
      severity: 'success',
      summary: 'Sent',
      detail: 'Request completed successfully',
      life: 3000
    });
    
    // Keep dialog open so user can modify and send again
  } catch (error) {
    console.error('Failed to send request:', error);
    toast.add({
      severity: 'error',
      summary: 'Failed',
      detail: error instanceof Error ? error.message : 'Could not send request',
      life: 4000
    });
  } finally {
    isSending.value = false;
  }
}

function loadExample() {
  method.value = 'POST';
  url.value = 'https://jsonplaceholder.typicode.com/posts';
  headersText.value = 'Content-Type: application/json\nUser-Agent: Trafexia/1.0';
  body.value = JSON.stringify({
    title: 'Test Post',
    body: 'This is a test from Trafexia',
    userId: 1
  }, null, 2);
}
</script>

<template>
  <div class="composer-overlay" @click.self="emit('close')">
    <div class="composer-dialog">
      <!-- Header -->
      <div class="composer-header">
        <h2>Request Composer</h2>
        <button class="btn btn-ghost btn-icon" @click="emit('close')" title="Close">
          <X style="width: 18px; height: 18px;" />
        </button>
      </div>

      <!-- Content -->
      <div class="composer-content">
        <!-- Method and URL -->
        <div style="display: flex; gap: 8px; margin-bottom: 16px;">
          <select v-model="method" class="method-select">
            <option v-for="m in HTTP_METHODS" :key="m" :value="m">{{ m }}</option>
          </select>
          <input 
            v-model="url" 
            type="text" 
            class="url-input" 
            placeholder="https://api.example.com/endpoint"
            @keyup.enter="sendRequest"
          />
        </div>

        <!-- Headers -->
        <div class="section">
          <label class="section-label">Headers (one per line: Name: Value)</label>
          <textarea 
            v-model="headersText" 
            class="textarea" 
            rows="6"
            placeholder="Content-Type: application/json&#10;Authorization: Bearer token"
          ></textarea>
        </div>

        <!-- Body -->
        <div class="section">
          <label class="section-label">Request Body</label>
          <textarea 
            v-model="body" 
            class="textarea" 
            rows="10"
            placeholder='{"key": "value"}'
          ></textarea>
        </div>
      </div>

      <!-- Footer -->
      <div class="composer-footer">
        <button class="btn btn-ghost" @click="loadExample">
          Load Example
        </button>
        <div style="flex: 1;"></div>
        <button class="btn btn-ghost" @click="emit('close')">
          Cancel
        </button>
        <button 
          class="btn btn-primary" 
          @click="sendRequest"
          :disabled="!isValid || isSending"
        >
          <Send style="width: 16px; height: 16px; margin-right: 6px;" />
          {{ isSending ? 'Sending...' : 'Send Request' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.composer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.composer-dialog {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.composer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #30363d;
}

.composer-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #e6edf3;
}

.composer-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.method-select {
  width: 120px;
  padding: 8px 12px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #e6edf3;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.method-select:focus {
  outline: none;
  border-color: #58a6ff;
}

.url-input {
  flex: 1;
  padding: 8px 12px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #e6edf3;
  font-family: monospace;
  font-size: 13px;
}

.url-input:focus {
  outline: none;
  border-color: #58a6ff;
}

.section {
  margin-bottom: 16px;
}

.section-label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #8b949e;
}

.textarea {
  width: 100%;
  padding: 10px 12px;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  color: #e6edf3;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
}

.textarea:focus {
  outline: none;
  border-color: #58a6ff;
}

.composer-footer {
  display: flex;
  align-items: center;
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

.btn-primary:hover:not(:disabled) {
  background: #2ea043;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
