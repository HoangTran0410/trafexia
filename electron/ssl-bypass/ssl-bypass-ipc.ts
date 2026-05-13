/**
 * SSL Bypass IPC Bridge — registers ipcMain handlers for all
 * ssl-bypass:* channels and manages the Frida child process lifecycle.
 *
 * Key design: the Frida process stdout/stderr is piped to the renderer
 * via webContents.send so the UI can show a live log console.
 */

import { ipcMain, BrowserWindow, app } from "electron";
import { ChildProcess, spawn } from "child_process";
import * as path from "path";
import { patchAPK } from "./apk-patcher";
import { injectGadget } from "./frida-injector";
import { getBypassScript } from "./bypass-scripts";
import * as fs from "fs";
import AdmZip from "adm-zip";
import { SslBypassRule } from "./ssl-bypass-rule";
import type { LicenseService } from "../main/services/LicenseService";
import type { ApkSignerService } from "../main/services/ApkSignerService";
import { IPC_CHANNELS } from "../../shared/types";
import type {
  FridaArch,
  BypassFramework,
  FridaLogEntry,
} from "../../shared/types";

/** Active Frida child process */
let fridaProcess: ChildProcess | null = null;

/** SSL bypass rule instance */
let sslBypassRule: SslBypassRule | null = null;

/**
 * Setup all SSL bypass IPC handlers.
 */
export function setupSslBypassIpc(
  mainWindow: () => BrowserWindow | null,
  licenseService?: LicenseService,
  apkSignerService?: ApkSignerService,
): SslBypassRule {
  sslBypassRule = new SslBypassRule();

  function requireSslBypass(): void {
    if (licenseService && !licenseService.hasFeature('ssl-bypass')) {
      throw new Error('FEATURE_LOCKED:ssl-bypass');
    }
  }

  // === Patch APK ===
  ipcMain.handle(
    IPC_CHANNELS.SSL_BYPASS_PATCH_APK,
    async (_event, inputPath: string, outputPath: string) => {
      try {
        requireSslBypass();
        console.log(`[SSL-Bypass-IPC] Patching APK: ${inputPath}`);
        const result = await patchAPK(inputPath, outputPath);
        if (result.success && apkSignerService) {
          await apkSignerService.signApk(outputPath);
        }
        return result;
      } catch (error) {
        console.error("[SSL-Bypass-IPC] Failed to patch APK:", error);
        throw error;
      }
    },
  );

  // === Inject Frida Gadget ===
  ipcMain.handle(
    IPC_CHANNELS.SSL_BYPASS_INJECT_GADGET,
    async (_event, apkPath: string, arch: FridaArch, outputPath: string): Promise<string[]> => {
      try {
        requireSslBypass();
        const cacheDir = path.join(app.getPath("userData"), "frida-gadgets");
        const ext = path.extname(apkPath).toLowerCase();

        if (ext === ".xapk" || ext === ".zip") {
          console.log(`[SSL-Bypass-IPC] Processing XAPK/Bundle: ${apkPath}`);
          const tempDir = path.join(path.dirname(outputPath), "xapk_temp_" + Date.now());
          if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

          const zip = new AdmZip(apkPath);
          zip.extractAllTo(tempDir, true);

          // Find all APKs
          const allFiles = fs.readdirSync(tempDir);
          const apkFiles = allFiles.filter(f => f.endsWith(".apk")).map(f => path.join(tempDir, f));
          
          if (apkFiles.length === 0) throw new Error("No APKs found inside XAPK/Bundle");

          // Find base APK (prefer 'base.apk' or files with 'base' in name, fallback to largest)
          let baseApk = apkFiles.find(f => path.basename(f).toLowerCase().includes('base')) || 
                        apkFiles.reduce((prev, current) => {
                          return fs.statSync(current).size > fs.statSync(prev).size ? current : prev;
                        });

          console.log(`[SSL-Bypass-IPC] Files in XAPK: ${apkFiles.map(f => path.basename(f)).join(', ')}`);
          console.log(`[SSL-Bypass-IPC] Identified base APK for injection: ${path.basename(baseApk)}`);
          
          // Inject Gadget into base
          const injectedBase = outputPath; // Use the requested output path for the base
          await injectGadget(baseApk, arch, injectedBase, cacheDir);
          
          // Return all APKs (injected base + original splits)
          const finalApks = [injectedBase, ...apkFiles.filter(f => f !== baseApk)];
          
          // CRITICAL: All APKs in a multiple-install session MUST have the same signature
          if (apkSignerService) {
            console.log(`[SSL-Bypass-IPC] Batch signing ${finalApks.length} APKs...`);
            for (const apk of finalApks) {
              await apkSignerService.signApk(apk);
            }
          }

          return finalApks;
        } else {
          // Normal single APK
          await injectGadget(apkPath, arch, outputPath, cacheDir);
          if (apkSignerService) {
            await apkSignerService.signApk(outputPath);
          }
          return [outputPath];
        }
      } catch (error) {
        console.error("[SSL-Bypass-IPC] Failed to inject gadget:", error);
        throw error;
      }
    },
  );

  // === Start Frida ===
  ipcMain.handle(
    IPC_CHANNELS.SSL_BYPASS_START_FRIDA,
    async (_event, packageName: string, framework: BypassFramework, deviceId?: string) => {
      try {
        requireSslBypass();
        if (fridaProcess) {
          console.log("[SSL-Bypass-IPC] Stopping existing Frida process...");
          try {
            fridaProcess.kill();
          } catch (e) {}
          fridaProcess = null;
        }

        const script = getBypassScript(framework);

        // Write script to temp file
        const fs = await import("fs");
        const os = await import("os");
        const scriptPath = path.join(os.tmpdir(), "trafexia-bypass.js");
        fs.writeFileSync(scriptPath, script, "utf-8");

        console.log(
          `[SSL-Bypass-IPC] Starting Frida for ${packageName} with ${framework} bypass on device ${deviceId || 'default USB'}`,
        );

        // Resolve frida binary path
        const fridaPath = await resolveFridaPath();
        console.log(`[SSL-Bypass-IPC] Using Frida binary: ${fridaPath}`);

        // Spawn frida process
        // frida -U -f <package> -l <script>
        // Use -W (await) to wait for the app to start manually.
        // This is much more stable than -f (spawn) which often hangs.
        const args = [
          "-W",
          packageName, // Await this package
          "-l",
          scriptPath, // Load script
        ];

        if (deviceId) {
          args.unshift("-D", deviceId);
        } else {
          args.unshift("-U"); // Default to USB
        }

        fridaProcess = spawn(fridaPath, args, {
          stdio: ["pipe", "pipe", "pipe"],
        });

        const sendLog = (log: FridaLogEntry) => {
          const currentWin = mainWindow();
          if (currentWin && !currentWin.isDestroyed()) {
            currentWin.webContents.send(IPC_CHANNELS.SSL_BYPASS_FRIDA_LOG, log);
          }
        };

        const currentProcess = fridaProcess;

        currentProcess.stdout?.on("data", (data: Buffer) => {
          const message = data.toString().trim();
          if (message) {
            // Log to terminal for easier debugging
            console.log(`[Frida Stdout] ${message}`);
            
            sendLog({
              timestamp: Date.now(),
              message,
              level: "info",
            });

            // Auto-resume if Frida is waiting at the spawn point
            if (message.includes("Spawning") || message.includes("Resume with") || message.includes("Waiting for spawn")) {
              currentProcess.stdin?.write("%resume\n");
              currentProcess.stdin?.write("resume\n");
            }
          }
        });

        // Safety timeout: try to resume after 2 seconds regardless of logs
        setTimeout(() => {
          if (currentProcess && !currentProcess.killed) {
            currentProcess.stdin?.write("%resume\n");
            currentProcess.stdin?.write("resume\n");
          }
        }, 2000);

        fridaProcess.stderr?.on("data", (data: Buffer) => {
          const text = data.toString("utf-8").trim();
          if (text) {
            // Log to terminal for easier debugging
            console.error(`[Frida Stderr] ${text}`);
            
            sendLog({
              timestamp: Date.now(),
              message: text,
              level: "error",
            });
          }
        });

        fridaProcess.on("error", (err) => {
          const message = err.message.includes("ENOENT")
            ? `frida command not found at '${fridaPath}'. Install it with: pip install frida-tools`
            : err.message;
          sendLog({
            timestamp: Date.now(),
            message: `[Frida Process Error] ${message}`,
            level: "error",
          });
          fridaProcess = null;
        });

        fridaProcess.on("close", (code) => {
          sendLog({
            timestamp: Date.now(),
            message: `[Frida Process] Exited with code ${code ?? "unknown"}`,
            level: code === 0 ? "info" : "error",
          });
          fridaProcess = null;
        });

        console.log(
          "[SSL-Bypass-IPC] Frida process started, PID:",
          fridaProcess.pid,
        );
      } catch (error) {
        console.error("[SSL-Bypass-IPC] Failed to start Frida:", error);
        fridaProcess = null;
        throw error;
      }
    },
  );

  // === Stop Frida ===
  ipcMain.handle(IPC_CHANNELS.SSL_BYPASS_STOP_FRIDA, async () => {
    try {
      if (fridaProcess) {
        console.log("[SSL-Bypass-IPC] Stopping Frida process...");
        fridaProcess.kill("SIGTERM");

        // Force kill after 3 seconds if still running
        const killTimeout = setTimeout(() => {
          if (fridaProcess) {
            fridaProcess.kill("SIGKILL");
            fridaProcess = null;
          }
        }, 3000);

        fridaProcess.on("close", () => {
          clearTimeout(killTimeout);
          fridaProcess = null;
        });
      }
    } catch (error) {
      console.error("[SSL-Bypass-IPC] Failed to stop Frida:", error);
      fridaProcess = null;
      throw error;
    }
  });

  // === Get Detected Hosts ===
  ipcMain.handle(IPC_CHANNELS.SSL_BYPASS_GET_DETECTED_HOSTS, async () => {
    return sslBypassRule?.getDetectedHosts() ?? [];
  });

  return sslBypassRule;
}

/**
 * Cleanup Frida process — call this from app.on('before-quit').
 */
export function cleanupFridaProcess(): void {
  if (fridaProcess) {
    console.log("[SSL-Bypass-IPC] Cleaning up Frida process...");
    try {
      fridaProcess.kill("SIGKILL");
    } catch {
      // Ignore errors during cleanup
    }
    fridaProcess = null;
  }
}

/**
 * Get the current SslBypassRule instance.
 */
export function getSslBypassRule(): SslBypassRule | null {
  return sslBypassRule;
}

/**
 * Resolve the path to the frida binary.
 * Checks system PATH first, then common Python/Homebrew locations.
 */
async function resolveFridaPath(): Promise<string> {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const os = await import("os");

  // 1. Try global PATH
  try {
    execSync("frida --version", { stdio: "ignore" });
    return "frida";
  } catch {
    // Not in PATH
  }

  // 2. Common locations
  const home = os.homedir();
  const potentialPaths = [
    // Python user-base bins (macOS)
    path.join(home, "Library/Python/3.9/bin/frida"),
    path.join(home, "Library/Python/3.8/bin/frida"),
    path.join(home, "Library/Python/3.10/bin/frida"),
    path.join(home, "Library/Python/3.11/bin/frida"),
    path.join(home, "Library/Python/3.12/bin/frida"),
    // Homebrew
    "/opt/homebrew/bin/frida",
    "/usr/local/bin/frida",
    // Python Linux
    path.join(home, ".local/bin/frida"),
  ];

  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Fallback to 'frida' and let spawn fail with ENOENT
  return "frida";
}
