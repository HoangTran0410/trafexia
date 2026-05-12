import { Transform, TransformCallback } from 'stream';
import type { ThrottleProfile, ThrottlePreset } from '../../../shared/types';
import { THROTTLE_PRESETS } from '../../../shared/types';
import type { TrafficStorage } from './TrafficStorage';

const THROTTLE_SETTING_KEY = 'throttle_profile';

/**
 * A Transform stream that throttles data based on a speed limit (Bps) and latency (ms).
 */
export class ThrottleTransform extends Transform {
  private bps: number;
  private latency: number;
  private packetLoss: number;
  private firstChunk = true;
  private bytesSent = 0;
  private startTime: number = 0;

  constructor(bps: number, latency: number, packetLoss: number = 0) {
    super();
    this.bps = bps;
    this.latency = latency;
    this.packetLoss = packetLoss;
  }

  _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);

    // Simulate packet loss
    if (this.packetLoss > 0 && Math.random() * 100 < this.packetLoss) {
      console.log(`[ThrottleTransform] Dropped packet of size ${data.length}`);
      callback();
      return;
    }

    if (this.firstChunk) {
      this.firstChunk = false;
      this.startTime = Date.now();
      
      // Apply initial latency delay
      if (this.latency > 0) {
        setTimeout(() => this.processChunk(data, callback), this.latency);
        return;
      }
    }

    this.processChunk(data, callback);
  }

  private processChunk(data: Buffer, callback: TransformCallback): void {
    if (this.bps <= 0) {
      this.push(data);
      callback();
      return;
    }

    // Calculate when this chunk *should* be finished sending
    // Total bytes / Bytes per second = total seconds
    this.bytesSent += data.length;
    const targetTimeMs = (this.bytesSent / this.bps) * 1000;
    const currentTimeMs = Date.now() - this.startTime;
    const waitTime = Math.max(0, targetTimeMs - currentTimeMs);

    if (waitTime > 0) {
      setTimeout(() => {
        this.push(data);
        callback();
      }, waitTime);
    } else {
      this.push(data);
      callback();
    }
  }
}

export class ThrottleService {
  private storage: TrafficStorage;
  private profile: ThrottleProfile;

  constructor(storage: TrafficStorage) {
    this.storage = storage;
    this.profile = this.getDefaultProfile();
  }

  /**
   * Initialize - load from storage
   */
  async initialize(): Promise<void> {
    const saved = this.storage.getSetting(THROTTLE_SETTING_KEY);
    if (saved) {
      try {
        this.profile = JSON.parse(saved);
        console.log(`[ThrottleService] Loaded profile: ${this.profile.preset}, enabled: ${this.profile.enabled}`);
      } catch {
        this.profile = this.getDefaultProfile();
      }
    }
  }

  /**
   * Get current throttle profile
   */
  getProfile(): ThrottleProfile {
    return { ...this.profile };
  }

  /**
   * Set throttle profile
   */
  setProfile(profile: ThrottleProfile): void {
    // If using a preset, apply its values
    if (profile.preset !== 'custom' && profile.preset !== 'none') {
      const preset = THROTTLE_PRESETS[profile.preset as Exclude<ThrottlePreset, 'custom' | 'none'>];
      if (preset) {
        profile.downloadSpeed = preset.download;
        profile.uploadSpeed = preset.upload;
        profile.latency = preset.latency;
      }
    }

    this.profile = profile;
    this.saveProfile();
    console.log(`[ThrottleService] Profile set: ${profile.preset}, enabled: ${profile.enabled}`);
  }

  /**
   * Disable throttling
   */
  disable(): void {
    this.profile.enabled = false;
    this.saveProfile();
    console.log('[ThrottleService] Throttling disabled');
  }

  /**
   * Check if throttling is active
   */
  isEnabled(): boolean {
    return this.profile.enabled && this.profile.preset !== 'none';
  }

  /**
   * Check if a URL should be throttled
   */
  shouldThrottle(url: string): boolean {
    if (!this.isEnabled()) return false;
    
    if (this.profile.urlPattern) {
      try {
        const regex = new RegExp(this.profile.urlPattern, 'i');
        return regex.test(url);
      } catch {
        return true; // If regex is invalid, throttle all
      }
    }

    return true; // No URL filter = throttle all
  }

  /**
   * Create a throttle transform stream for a given direction
   */
  createThrottleStream(direction: 'download' | 'upload', url?: string): Transform | null {
    if (!this.isEnabled()) return null;
    if (url && !this.shouldThrottle(url)) return null;

    const speed = direction === 'download' 
      ? this.profile.downloadSpeed 
      : this.profile.uploadSpeed;

    return new ThrottleTransform(speed, this.profile.latency, this.profile.packetLoss);
  }

  private getDefaultProfile(): ThrottleProfile {
    return {
      enabled: false,
      preset: 'none',
      downloadSpeed: 0,
      uploadSpeed: 0,
      latency: 0,
      packetLoss: 0,
    };
  }

  private saveProfile(): void {
    this.storage.setSetting(THROTTLE_SETTING_KEY, JSON.stringify(this.profile));
  }
}
