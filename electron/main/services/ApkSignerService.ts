import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ApkSignerService {
  private apksignerPath: string = '';

  constructor() {
    this.detectApkSigner();
  }

  private detectApkSigner() {
    const home = os.homedir();
    const sdkPath = path.join(home, 'Library/Android/sdk');
    const buildToolsPath = path.join(sdkPath, 'build-tools');

    if (fs.existsSync(buildToolsPath)) {
      const versions = fs.readdirSync(buildToolsPath).sort().reverse();
      for (const v of versions) {
        const p = path.join(buildToolsPath, v, 'apksigner');
        if (fs.existsSync(p)) {
          this.apksignerPath = p;
          console.log(`[ApkSignerService] Found apksigner at: ${p}`);
          return;
        }
      }
    }
    console.warn('[ApkSignerService] apksigner not found in build-tools');
  }

  async signApk(apkPath: string): Promise<boolean> {
    if (!this.apksignerPath) {
      console.warn('[ApkSignerService] apksigner not found, skipping signing');
      return false;
    }

    const home = os.homedir();
    const keystorePath = path.join(home, '.android/debug.keystore');

    if (!fs.existsSync(keystorePath)) {
      console.error('[ApkSignerService] Debug keystore not found at:', keystorePath);
      return false;
    }

    try {
      console.log(`[ApkSignerService] Signing APK: ${apkPath}`);
      // Default Android debug keystore credentials
      const cmd = `"${this.apksignerPath}" sign --ks "${keystorePath}" --ks-pass pass:android --key-pass pass:android "${apkPath}"`;
      await execAsync(cmd);
      return true;
    } catch (error) {
      console.error('[ApkSignerService] Failed to sign APK:', error);
      return false;
    }
  }
}
