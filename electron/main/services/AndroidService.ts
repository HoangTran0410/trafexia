import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { AndroidDevice } from '../../../shared/types';

const execAsync = promisify(exec);

export class AndroidService {
  private adbPath: string = 'adb';
  private emulatorPath: string = 'emulator';

  constructor() {
    this.detectAdb();
    this.detectEmulator();
  }

  private detectAdb() {
    const home = os.homedir();
    const commonPaths = [
      path.join(home, 'Library/Android/sdk/platform-tools/adb'),
      path.join(home, 'Android/Sdk/platform-tools/adb'),
      '/usr/local/bin/adb',
      '/opt/homebrew/bin/adb'
    ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        this.adbPath = p;
        console.log(`[AndroidService] Found adb at: ${p}`);
        return;
      }
    }
    console.warn('[AndroidService] adb not found in common paths, falling back to system PATH');
  }

  private detectEmulator() {
    const home = os.homedir();
    const commonPaths = [
      path.join(home, 'Library/Android/sdk/emulator/emulator'),
      path.join(home, 'Android/Sdk/emulator/emulator'),
    ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        this.emulatorPath = p;
        console.log(`[AndroidService] Found emulator at: ${p}`);
        return;
      }
    }
  }

  /**
   * List available Android Virtual Devices (AVDs)
   */
  async listAvds(): Promise<string[]> {
    try {
      const { stdout } = await execAsync(`${this.emulatorPath} -list-avds`);
      return stdout.trim().split('\n').filter(line => line.trim());
    } catch (error) {
      console.error('[AndroidService] Failed to list AVDs:', error);
      return [];
    }
  }

  /**
   * Launch a specific AVD
   */
  async launchAvd(name: string): Promise<boolean> {
    const { spawn } = await import('child_process');
    try {
      console.log(`[AndroidService] Launching AVD: ${name}`);
      const process = spawn(this.emulatorPath, [`@${name}`], {
        detached: true,
        stdio: 'ignore'
      });
      process.unref();
      return true;
    } catch (error) {
      console.error(`[AndroidService] Failed to launch AVD ${name}:`, error);
      return false;
    }
  }

  /**
   * List all connected Android devices and emulators
   */
  async listDevices(): Promise<AndroidDevice[]> {
    try {
      console.log('[AndroidService] Scanning for devices using:', this.adbPath);
      const { stdout } = await execAsync(`${this.adbPath} devices -l`);
      const lines = stdout.trim().split('\n');
      console.log(`[AndroidService] adb output: ${lines.length} lines`);
      const devices: AndroidDevice[] = [];

      // Skip the first line ("List of devices attached")
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(/\s+/);
        if (parts.length < 2) continue;

        const id = parts[0];
        const status = parts[1];
        
        // Extract model name from the -l output (e.g. model:Pixel_4)
        const modelMatch = line.match(/model:([^\s]+)/);
        const model = modelMatch ? modelMatch[1].replace(/_/g, ' ') : id;

        const type = id.startsWith('emulator-') ? 'emulator' : 'physical';
        
        // Check if rooted
        const isRooted = await this.checkRoot(id);

        devices.push({
          id,
          model,
          type,
          status,
          isRooted
        });
      }

      return devices;
    } catch (error) {
      console.error('[AndroidService] Failed to list devices:', error);
      return [];
    }
  }

  /**
   * Check if a device has root access
   */
  private async checkRoot(deviceId: string): Promise<boolean> {
    try {
      // Try to run 'su' command
      const { stdout } = await execAsync(`${this.adbPath} -s ${deviceId} shell which su`);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Configure proxy on a specific device
   */
  async bridgeDevice(deviceId: string, proxyUrl: string): Promise<boolean> {
    try {
      console.log(`[AndroidService] Configuring proxy ${proxyUrl} on device ${deviceId}`);
      await execAsync(`${this.adbPath} -s ${deviceId} shell settings put global http_proxy ${proxyUrl}`);
      return true;
    } catch (error) {
      console.error(`[AndroidService] Failed to bridge device ${deviceId}:`, error);
      return false;
    }
  }

  /**
   * Install an APK on a specific device
   */
  async installApk(deviceId: string, apkPath: string): Promise<boolean> {
    try {
      console.log(`[AndroidService] Installing APK ${apkPath} on device ${deviceId}`);
      // -r: replace existing application
      // -d: allow version code downgrade
      // -t: allow test packages
      // -g: grant all runtime permissions
      const cmd = `"${this.adbPath}" -s ${deviceId} install -r -d -t -g "${apkPath}"`;
      await execAsync(cmd);
      console.log(`[AndroidService] APK installed successfully on ${deviceId}`);
      return true;
    } catch (error) {
      console.error(`[AndroidService] Failed to install APK on device ${deviceId}:`, error);
      
      // Attempt to uninstall first if it's a split/signature conflict
      if (error instanceof Error && (error.message.includes('MISSING_SPLIT') || error.message.includes('UPDATE_INCOMPATIBLE'))) {
        try {
          console.log(`[AndroidService] Attempting to uninstall before retry...`);
          // Try to find package name from filename (e.g. com.locket.Locket-injected.apk)
          const filename = path.basename(apkPath);
          const pkgMatch = filename.match(/^([a-zA-Z0-9._]+)/);
          if (pkgMatch) {
            await execAsync(`"${this.adbPath}" -s ${deviceId} uninstall ${pkgMatch[1]}`);
            const retryCmd = `"${this.adbPath}" -s ${deviceId} install -r -d -t -g "${apkPath}"`;
            await execAsync(retryCmd);
            return true;
          }
        } catch (retryError) {
          console.error(`[AndroidService] Uninstall/Retry failed:`, retryError);
        }
      }
      return false;
    }
  }

  /**
   * Clear proxy on a specific device
   */
  async clearProxy(deviceId: string): Promise<boolean> {
    try {
      console.log(`[AndroidService] Clearing proxy on device ${deviceId}`);
      await execAsync(`${this.adbPath} -s ${deviceId} shell settings put global http_proxy :0`);
      return true;
    } catch (error) {
      console.error(`[AndroidService] Failed to clear proxy on device ${deviceId}:`, error);
    }
  }

  /**
   * Install multiple APKs (Split APKs / App Bundle) on a specific device
   */
  async installMultipleApks(deviceId: string, apkPaths: string[]): Promise<boolean> {
    try {
      console.log(`[AndroidService] Installing ${apkPaths.length} APKs on device ${deviceId}`);
      const paths = apkPaths.map(p => `"${p}"`).join(' ');
      const cmd = `"${this.adbPath}" -s ${deviceId} install-multiple -r -d -t -g ${paths}`;
      await execAsync(cmd);
      return true;
    } catch (error) {
      console.error(`[AndroidService] Failed to install multiple APKs on device ${deviceId}:`, error);
      
      // Fallback: Attempt to uninstall first
      if (error instanceof Error && (error.message.includes('UPDATE_INCOMPATIBLE') || error.message.includes('VERSION_DOWNGRADE'))) {
        try {
          console.log(`[AndroidService] Attempting to uninstall before retry...`);
          const baseName = path.basename(apkPaths[0]);
          const pkgMatch = baseName.match(/^([a-zA-Z0-9._]+)/);
          if (pkgMatch) {
            await execAsync(`"${this.adbPath}" -s ${deviceId} uninstall ${pkgMatch[1]}`);
            const retryCmd = `"${this.adbPath}" -s ${deviceId} install-multiple -r -d -t -g ${apkPaths.map(p => `"${p}"`).join(' ')}`;
            await execAsync(retryCmd);
            return true;
          }
        } catch (retryError) {
          console.error(`[AndroidService] Uninstall/Retry failed:`, retryError);
        }
      }
      return false;
    }
  }
}
