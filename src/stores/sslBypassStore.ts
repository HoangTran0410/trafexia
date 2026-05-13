import { defineStore } from "pinia";
import { ref, computed, shallowRef } from "vue";
import type {
  DetectedPinningHost,
  FridaLogEntry,
  PatchResult,
  BypassFramework,
  FridaArch,
} from "@shared/types";
import { handleFeatureLockError } from "@/utils/featureLock";

export const useSslBypassStore = defineStore("sslBypass", () => {
  // State
  const detectedHosts = ref<DetectedPinningHost[]>([]);
  const fridaRunning = ref(false);
  const currentPackage = ref("");
  const currentFramework = ref<BypassFramework>("all");
  const patchLog = ref<PatchResult | null>(null);
  const fridaLogs = shallowRef<FridaLogEntry[]>([]);
  const isPatching = ref(false);
  const isInjecting = ref(false);

  // Buffer for high-frequency log updates
  let logBuffer: FridaLogEntry[] = [];
  let updateTimer: any = null;

  // Getters
  const detectedCount = computed(() => detectedHosts.value.length);
  const hasLogs = computed(() => fridaLogs.value.length > 0);

  // Actions
  async function patchApk(
    inputPath: string,
    outputPath: string,
  ): Promise<PatchResult> {
    isPatching.value = true;
    patchLog.value = null;
    try {
      const result = await window.electronAPI.patchApk(inputPath, outputPath);
      patchLog.value = result;
      return result;
    } catch (error) {
      if (handleFeatureLockError(error)) {
        // Feature locked — upgrade dialog shown, return empty result
        return { success: false, patchedItems: [], warnings: ['PRO license required'], outputPath: '' };
      }
      const msg = error instanceof Error ? error.message : String(error);
      const failResult: PatchResult = { success: false, patchedItems: [], warnings: [msg], outputPath: '' };
      patchLog.value = failResult;
      return failResult;
    } finally {
      isPatching.value = false;
    }
  }

  async function injectGadget(
    apkPath: string,
    arch: FridaArch,
    outputPath: string,
  ): Promise<string[]> {
    isInjecting.value = true;
    try {
      return await window.electronAPI.injectGadget(apkPath, arch, outputPath);
    } finally {
      isInjecting.value = false;
    }
  }

  async function installApk(deviceId: string, apkPath: string): Promise<boolean> {
    try {
      return await window.electronAPI.installApk(deviceId, apkPath);
    } catch (error) {
      console.error("Failed to install APK:", error);
      return false;
    }
  }

  async function installMultipleApks(deviceId: string, apkPaths: string[]): Promise<boolean> {
    try {
      return await window.electronAPI.installMultipleApks(deviceId, apkPaths);
    } catch (error) {
      console.error("Failed to install multiple APKs:", error);
      return false;
    }
  }

  async function startFrida(
    packageName: string,
    framework: BypassFramework,
    deviceId?: string,
  ): Promise<void> {
    try {
      currentPackage.value = packageName;
      currentFramework.value = framework;
      fridaLogs.value = [];
      await window.electronAPI.startFrida(packageName, framework, deviceId);
      fridaRunning.value = true;
    } catch (error) {
      fridaRunning.value = false;
      if (!handleFeatureLockError(error)) {
        throw error; // Re-throw non-lock errors
      }
    }
  }

  async function stopFrida(): Promise<void> {
    try {
      await window.electronAPI.stopFrida();
    } finally {
      fridaRunning.value = false;
    }
  }

  async function refreshDetectedHosts(): Promise<void> {
    detectedHosts.value = await window.electronAPI.getDetectedHosts();
  }

  function addFridaLog(log: FridaLogEntry): void {
    logBuffer.push(log);
    
    if (!updateTimer) {
      updateTimer = setTimeout(() => {
        const newLogs = [...fridaLogs.value, ...logBuffer];
        // Capped at 50 logs for absolute maximum performance
        fridaLogs.value = newLogs.slice(-50);
        logBuffer = [];
        updateTimer = null;
      }, 100); // 10 updates per second max
    }
  }

  function addDetectedHost(host: DetectedPinningHost): void {
    const existing = detectedHosts.value.find((h) => h.host === host.host);
    if (existing) {
      existing.detectedAt = host.detectedAt;
    } else {
      detectedHosts.value.push(host);
    }
  }

  function clearLogs(): void {
    fridaLogs.value = [];
  }

  function clearPatchLog(): void {
    patchLog.value = null;
  }

  return {
    // State
    detectedHosts,
    fridaRunning,
    currentPackage,
    currentFramework,
    patchLog,
    fridaLogs,
    isPatching,
    isInjecting,

    // Getters
    detectedCount,
    hasLogs,

    // Actions
    patchApk,
    injectGadget,
    installApk,
    installMultipleApks,
    startFrida,
    stopFrida,
    refreshDetectedHosts,
    addFridaLog,
    addDetectedHost,
    clearLogs,
    clearPatchLog,
  };
});
