/**
 * Feature Lock Error Handler
 * 
 * When the Electron backend throws a FEATURE_LOCKED error,
 * this intercepts it and shows the upgrade dialog instead of
 * a raw error message.
 * 
 * Usage:
 *   try { await window.electronAPI.startFrida(...) }
 *   catch (e) { handleFeatureLockError(e) }
 */

import { useLicenseStore } from '@/stores/licenseStore';

export function isFeatureLockError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.startsWith('FEATURE_LOCKED:');
  }
  if (typeof error === 'string') {
    return error.startsWith('FEATURE_LOCKED:');
  }
  return false;
}

export function extractLockedFeature(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.replace('FEATURE_LOCKED:', '').trim();
}

/**
 * Handle a caught error. If it's a feature lock error, show the upgrade dialog.
 * Returns true if the error was a feature lock (handled), false otherwise.
 */
export function handleFeatureLockError(error: unknown): boolean {
  if (!isFeatureLockError(error)) return false;
  
  const featureId = extractLockedFeature(error);
  const licenseStore = useLicenseStore();
  licenseStore.upgradeFeature = featureId;
  licenseStore.showUpgradeDialog = true;
  return true;
}
