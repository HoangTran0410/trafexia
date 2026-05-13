<script setup lang="ts">
import { ref } from 'vue';
import { useLicenseStore } from '@/stores/licenseStore';
import { X, Crown, Check, ArrowRight, Loader2, Mail, Key as KeyIcon } from 'lucide-vue-next';
import { useToast } from 'primevue/usetoast';

const licenseStore = useLicenseStore();
const toast = useToast();

const licenseKey = ref('');
const email = ref('');
const isActivating = ref(false);
const activePanel = ref<'pricing' | 'activate'>('pricing');

const freeFeatures = [
  'HTTP/HTTPS Interception',
  'Basic Request/Response View',
  'JSON/XML Formatting',
  'Basic Search & Filter',
  'Standard Text Export',
];

const proFeatures = [
  'Map Local / Map Remote',
  'Network Throttling Engine',
  'SSL Pinning Bypass',
  'Request Diff & Compare',
  'JavaScript Scripting',
  'Postman & HAR Export',
  'Unlimited Mock Rules',
];

async function activate() {
  if (!licenseKey.value.trim() || !email.value.trim()) {
    toast.add({ severity: 'warn', summary: 'Missing Info', detail: 'Please enter both license key and email', life: 3000 });
    return;
  }

  isActivating.value = true;
  try {
    await licenseStore.activateLicense(licenseKey.value.trim(), email.value.trim());
    toast.add({ severity: 'success', summary: 'PRO ACTIVATED', detail: `Welcome to Trafexia Pro`, life: 5000 });
    close();
  } catch (err: any) {
    toast.add({ severity: 'error', summary: 'ACTIVATION FAILED', detail: err.message || 'Invalid license key', life: 5000 });
  } finally {
    isActivating.value = false;
  }
}

function close() {
  licenseStore.showUpgradeDialog = false;
  licenseStore.upgradeFeature = '';
  licenseKey.value = '';
  email.value = '';
  activePanel.value = 'pricing';
}

function openPurchase() {
  window.open('https://trafexia.dev/pricing', '_blank');
}

async function deactivate() {
  await licenseStore.deactivateLicense();
  toast.add({ severity: 'info', summary: 'License Deactivated', detail: 'Reverted to Free tier', life: 3000 });
  close();
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="licenseStore.showUpgradeDialog" class="pricing-overlay" @click.self="close">
        <div class="pricing-container animate-slide-up">
          <button class="close-btn" @click="close">
            <X :size="16" />
          </button>

          <div v-if="activePanel === 'pricing'" class="pricing-panel">
            <div class="header">
              <h2 v-if="licenseStore.isPro">You're on Pro</h2>
              <h2 v-else>Select your protocol</h2>
              <p v-if="licenseStore.isPro">All professional features are unlocked.</p>
              <p v-else>Choose the tier that fits your debugging requirements.</p>
            </div>

            <!-- Show Pro status if already active -->
            <div v-if="licenseStore.isPro" class="pro-active-card">
              <Crown :size="36" class="pro-crown" />
              <h3>Professional License Active</h3>
              <p v-if="licenseStore.daysRemaining !== null" class="days-info">{{ licenseStore.daysRemaining }} days remaining</p>
              <p v-if="licenseStore.license.email" class="email-info">{{ licenseStore.license.email }}</p>
              <div class="divider"></div>
              <button class="tier-btn deactivate" @click="deactivate">Deactivate License</button>
            </div>

            <!-- Show tier comparison for free users -->
            <div v-else class="tier-grid">
              <!-- Free Tier -->
              <div class="tier-card free">
                <div class="tier-header">
                  <span class="tier-name">Community</span>
                  <div class="price">
                    <span class="amount">$0</span>
                    <span class="period">forever</span>
                  </div>
                </div>
                <div class="features-list">
                  <div v-for="f in freeFeatures" :key="f" class="feature-item">
                    <Check :size="12" class="icon" />
                    <span>{{ f }}</span>
                  </div>
                </div>
                <button class="tier-btn secondary" disabled>Current Tier</button>
              </div>

              <!-- Pro Tier -->
              <div class="tier-card pro">
                <div class="pro-label">RECOMMENDED</div>
                <div class="tier-header">
                  <span class="tier-name">Professional</span>
                  <div class="price">
                    <span class="amount">$29</span>
                    <span class="period">/ year</span>
                  </div>
                </div>
                <div class="features-list">
                  <div v-for="f in proFeatures" :key="f" class="feature-item">
                    <Check :size="12" class="icon pro" />
                    <span>{{ f }}</span>
                  </div>
                </div>
                <button class="tier-btn primary" @click="openPurchase">
                  Upgrade Now <ArrowRight :size="14" />
                </button>
              </div>
            </div>

            <div class="footer" v-if="!licenseStore.isPro">
              <p>Already have a license? <button class="link-btn" @click="activePanel = 'activate'">Activate here</button></p>
            </div>
          </div>

          <div v-if="activePanel === 'activate'" class="activate-panel">
            <div class="header text-left">
              <h2>Activate Pro</h2>
              <p>Verify your license to unlock professional capabilities.</p>
            </div>

            <div class="form-body">
              <div class="input-group">
                <label>Registered Email</label>
                <div class="input-wrap">
                  <Mail :size="14" class="icon" />
                  <input v-model="email" type="email" placeholder="admin@example.com" />
                </div>
              </div>
              <div class="input-group">
                <label>License Key</label>
                <div class="input-wrap">
                  <KeyIcon :size="14" class="icon" />
                  <input v-model="licenseKey" type="text" class="mono" placeholder="TRFX-XXXX-XXXX-XXXX" />
                </div>
              </div>
              
              <button class="activate-btn" @click="activate" :disabled="isActivating">
                <Loader2 v-if="isActivating" class="animate-spin" :size="16" />
                <span v-else>Verify Activation</span>
              </button>
            </div>

            <div class="panel-footer">
              <button class="back-btn" @click="activePanel = 'pricing'">← Back to comparison</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pricing-overlay {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.9);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}

.pricing-container {
  width: 100%;
  max-width: 720px;
  max-height: 95vh;
  background: #0B1120;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  position: relative;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
  overflow-y: auto;
}

.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  color: #94A3B8;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 20;
}

.pricing-panel {
  padding: 48px;
}

.header {
  text-align: center;
  margin-bottom: 40px;
}

.header h2 {
  font-size: 28px;
  font-weight: 700;
  color: #F1F5F9;
  margin-bottom: 8px;
}

.header p {
  color: #94A3B8;
  font-size: 15px;
}

.tier-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
}

.tier-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  position: relative;
}

.tier-card.pro {
  background: rgba(56, 189, 248, 0.03);
  border-color: rgba(56, 189, 248, 0.2);
  box-shadow: 0 0 40px rgba(56, 189, 248, 0.05);
}

.pro-label {
  position: absolute;
  top: 12px;
  right: 12px;
  background: #38BDF8;
  color: #0F172A;
  font-size: 9px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 4px;
}

.tier-header {
  margin-bottom: 24px;
}

.tier-name {
  font-size: 13px;
  font-weight: 600;
  color: #64748B;
  text-transform: uppercase;
  letter-spacing: 1px;
  display: block;
  margin-bottom: 8px;
}

.price {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.amount { font-size: 32px; font-weight: 700; color: #F1F5F9; }
.period { font-size: 14px; color: #64748B; }

.features-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 32px;
  flex: 1;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #94A3B8;
}

.icon {
  color: #64748B;
  flex-shrink: 0;
}

.icon.pro {
  color: #38BDF8;
}

.tier-btn {
  height: 40px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.tier-btn.primary {
  background: #38BDF8;
  color: #0F172A;
}

.tier-btn.secondary {
  background: rgba(255, 255, 255, 0.05);
  color: #64748B;
  cursor: default;
}

.tier-btn.primary:hover {
  transform: translateY(-1px);
  filter: brightness(1.1);
}

.footer {
  margin-top: 32px;
  text-align: center;
  font-size: 13px;
  color: #64748B;
}

/* Pro Active Card */
.pro-active-card {
  text-align: center;
  padding: 48px 40px 40px;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.06), rgba(99, 102, 241, 0.04));
  border: 1px solid rgba(56, 189, 248, 0.12);
  border-radius: 16px;
  position: relative;
  overflow: hidden;
}

.pro-active-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 200px;
  height: 1px;
  background: linear-gradient(90deg, transparent, #38BDF8, transparent);
}

.pro-active-card .pro-crown {
  color: #38BDF8;
  margin: 0 auto 20px;
  display: block;
  filter: drop-shadow(0 0 12px rgba(56, 189, 248, 0.4));
  animation: crownPulse 3s ease-in-out infinite;
}

@keyframes crownPulse {
  0%, 100% { filter: drop-shadow(0 0 12px rgba(56, 189, 248, 0.3)); }
  50% { filter: drop-shadow(0 0 20px rgba(56, 189, 248, 0.6)); }
}

.pro-active-card h3 {
  font-size: 22px;
  font-weight: 700;
  color: #F1F5F9;
  margin-bottom: 16px;
  letter-spacing: -0.3px;
}

.pro-active-card .days-info {
  font-size: 14px;
  color: #38BDF8;
  font-weight: 600;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.pro-active-card .days-info::before {
  content: '';
  width: 6px;
  height: 6px;
  background: #10B981;
  border-radius: 50%;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
}

.pro-active-card .email-info {
  font-size: 12px;
  color: #64748B;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.3px;
}

.pro-active-card .divider {
  width: 60px;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 28px auto 24px;
}

.tier-btn.deactivate {
  margin-top: 0;
  background: transparent;
  color: #64748B;
  border: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12px;
  font-weight: 600;
  padding: 8px 20px;
  height: 36px;
}

.tier-btn.deactivate:hover {
  background: rgba(239, 68, 68, 0.08);
  color: #EF4444;
  border-color: rgba(239, 68, 68, 0.2);
}

.link-btn {
  background: none;
  border: none;
  color: #38BDF8;
  font-weight: 600;
  cursor: pointer;
}

/* Responsive Overrides */
@media (max-width: 768px) {
  .pricing-panel {
    padding: 32px 24px;
  }
  
  .header h2 {
    font-size: 24px;
  }
  
  .tier-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  
  .tier-card {
    padding: 24px;
  }
}

@media (max-height: 700px) {
  .pricing-panel {
    padding: 24px;
  }
  
  .header {
    margin-bottom: 24px;
  }
  
  .features-list {
    margin-bottom: 20px;
  }
}

/* Activate Panel */
.activate-panel { padding: 48px; }
.form-body { display: flex; flex-direction: column; gap: 20px; }
.input-group { display: flex; flex-direction: column; gap: 8px; }
.input-group label { font-size: 12px; font-weight: 600; color: #94A3B8; text-transform: uppercase; }
.input-wrap { position: relative; display: flex; align-items: center; }
.input-wrap .icon { position: absolute; left: 12px; color: #64748B; }
.input-wrap input {
  width: 100%;
  height: 44px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 0 12px 0 38px;
  color: #F1F5F9;
  font-size: 14px;
}
.input-wrap input:focus { border-color: #38BDF8; outline: none; }
.mono { font-family: 'JetBrains Mono', monospace; }

.activate-btn {
  height: 44px;
  background: #10B981;
  color: #0F172A;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
}

.panel-footer { margin-top: 24px; text-align: center; }
.back-btn { background: none; border: none; color: #64748B; font-size: 13px; cursor: pointer; }

/* Transitions */
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.animate-slide-up { animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.animate-spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
