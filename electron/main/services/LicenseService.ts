import * as crypto from 'crypto';
import * as os from 'os';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore/lite';
import { db } from '../utils/firebase';
import type { TrafficStorage } from './TrafficStorage';
import type { LicenseInfo, LicenseTier } from '../../../shared/types';
import { FEATURE_GATES } from '../../../shared/types';

const LICENSE_SETTING_KEY = 'license_data';

export class LicenseService {
  private storage: TrafficStorage;
  private currentLicense: LicenseInfo;
  private featureGates: Record<string, LicenseTier> = {};

  constructor(storage: TrafficStorage) {
    this.storage = storage;
    this.currentLicense = this.getFreeLicense();
    // Use statically imported FEATURE_GATES as default
    this.featureGates = { ...FEATURE_GATES };
  }

  /**
   * Initialize license - load from storage
   */
  async initialize(): Promise<void> {
    const saved = this.storage.getSetting(LICENSE_SETTING_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved) as LicenseInfo;
        // Validate the license locally first
        if (this.validateLicenseData(data)) {
          this.currentLicense = data;
          console.log(`[LicenseService] License loaded: ${data.tier} tier (${data.email})`);
          
          // Perform async online check in background
          this.checkOnlineStatus(data).catch(err => {
            console.error('[LicenseService] Background online check failed:', err);
          });
        } else {
          console.log('[LicenseService] Saved license is invalid or expired, using free tier');
          this.currentLicense = this.getFreeLicense();
        }
      } catch {
        this.currentLicense = this.getFreeLicense();
      }
    }

    // Always try to fetch feature gates on startup
    this.fetchFeatureGates().catch(err => {
      console.error('[LicenseService] Failed to fetch remote feature gates:', err);
    });
  }

  /**
   * Fetch dynamic feature gates from Firebase
   */
  async fetchFeatureGates(): Promise<void> {
    try {
      const querySnapshot = await getDocs(collection(db, 'features'));
      if (!querySnapshot.empty) {
        const newGates: Record<string, LicenseTier> = {};
        querySnapshot.docs.forEach(doc => {
          newGates[doc.id] = doc.data().tier as LicenseTier;
        });
        
        // IMPORTANT: Merge with defaults, don't overwrite!
        this.featureGates = { ...FEATURE_GATES, ...newGates };
        console.log(`[LicenseService] Remote feature gates synchronized. Total gated features: ${Object.keys(this.featureGates).length}`);
      } else {
        // Ensure defaults are set if remote is empty
        this.featureGates = { ...FEATURE_GATES };
      }
    } catch (error) {
      console.error('[LicenseService] Error fetching feature gates:', error);
      // Fallback to static defaults
      this.featureGates = { ...FEATURE_GATES };
    }
  }

  /**
   * Get the current feature gate configuration
   */
  getFeatureGates(): Record<string, LicenseTier> {
    return { ...this.featureGates };
  }

  /**
   * Check online status of a license
   */
  private async checkOnlineStatus(license: LicenseInfo): Promise<void> {
    if (license.tier === 'free' || !license.licenseKey) return;

    try {
      const q = query(collection(db, 'licenses'), where('licenseKey', '==', license.licenseKey));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        console.warn('[LicenseService] License not found online, reverting to free');
        this.deactivateLicense();
        return;
      }

      const fbData = querySnapshot.docs[0].data();
      
      // If revoked or expired or machine binding changed
      if (
        fbData.status !== 'active' || 
        (fbData.expiresAt && Date.now() > fbData.expiresAt) ||
        (fbData.machineId && fbData.machineId !== this.getMachineId())
      ) {
        console.warn('[LicenseService] Online check failed (revoked/expired), reverting to free');
        this.deactivateLicense();
      } else {
        console.log('[LicenseService] Online status verified: Active');
      }
    } catch (error) {
      console.error('[LicenseService] Failed to check online status:', error);
      // Don't deactivate if network is just down, keep local validation
    }
  }

  /**
   * Get current license info
   */
  getLicense(): LicenseInfo {
    // Re-validate on each access
    if (this.currentLicense.tier !== 'free') {
      if (!this.validateLicenseData(this.currentLicense)) {
        this.currentLicense = this.getFreeLicense();
        this.saveLicense();
      }
    }
    return { ...this.currentLicense };
  }

  /**
   * Activate a license key
   */
  async activateLicense(key: string, email: string): Promise<LicenseInfo> {
    // Validate key format: TRFX-P/TXXXX-XXXX-XXXX-XXXX
    const keyRegex = /^TRFX-[A-Z0-9]{5}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    if (!keyRegex.test(key)) {
      throw new Error('Invalid license key format. Expected: TRFX-PXXXX-XXXX-XXXX-XXXX');
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email address');
    }

    console.log(`[LicenseService] Attempting online activation for ${email}...`);

    try {
      // 1. Check Firebase for this key
      const q = query(collection(db, 'licenses'), where('licenseKey', '==', key));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error('License key not found. Please check your key or contact support.');
      }

      const licenseDoc = querySnapshot.docs[0];
      const fbData = licenseDoc.data();

      // 2. Validate email binding
      if (fbData.email.toLowerCase() !== email.toLowerCase()) {
        throw new Error('This license key is registered to a different email address.');
      }

      // 3. Check machine binding (if already activated)
      const machineId = this.getMachineId();
      if (fbData.status === 'active' && fbData.machineId && fbData.machineId !== machineId) {
        throw new Error('This license is already active on another device. Please deactivate it first.');
      }

      // 4. Update activation info in Firebase if pending
      if (fbData.status !== 'active') {
        await updateDoc(doc(db, 'licenses', licenseDoc.id), {
          status: 'active',
          machineId: machineId,
          activatedAt: Date.now()
        });
      }

      // 5. Save locally
      const license: LicenseInfo = {
        tier: fbData.tier as LicenseTier,
        licenseKey: key,
        email: fbData.email,
        expiresAt: fbData.expiresAt,
        activatedAt: Date.now(),
        machineId: machineId,
        isValid: true,
      };

      this.currentLicense = license;
      this.saveLicense();

      console.log(`[LicenseService] Online activation successful: ${fbData.tier} tier for ${email}`);
      return { ...license };

    } catch (error: any) {
      console.error('[LicenseService] Activation error:', error);
      throw error;
    }
  }

  /**
   * Deactivate license (revert to free)
   */
  async deactivateLicense(): Promise<void> {
    this.currentLicense = this.getFreeLicense();
    this.saveLicense();
    console.log('[LicenseService] License deactivated, reverted to free tier');
  }

  /**
   * Check if a feature is available for the current license
   */
  hasFeature(featureId: string): boolean {
    const requiredTier = this.featureGates[featureId];
    
    // If feature not defined or set to free, allow
    if (!requiredTier || requiredTier === 'free') return true;
    
    const tierLevel: Record<LicenseTier, number> = {
      'free': 0,
      'pro': 1,
      'team': 2,
    };

    const userTier = this.currentLicense.tier || 'free';
    const userLevel = tierLevel[userTier] ?? 0;
    const requiredLevel = tierLevel[requiredTier] ?? 0;

    const allowed = userLevel >= requiredLevel;
    
    if (!allowed) {
      console.warn(`[LicenseService] Feature access denied: ${featureId} (Required: ${requiredTier}, User: ${userTier})`);
    }

    return allowed;
  }

  /**
   * Get the machine-specific ID for license binding
   */
  private getMachineId(): string {
    const interfaces = os.networkInterfaces();
    const hostname = os.hostname();
    const platform = os.platform();
    const arch = os.arch();
    
    // Get first non-internal MAC address
    let mac = 'unknown';
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name];
      if (iface) {
        for (const info of iface) {
          if (!info.internal && info.mac !== '00:00:00:00:00:00') {
            mac = info.mac;
            break;
          }
        }
      }
      if (mac !== 'unknown') break;
    }

    const raw = `${hostname}-${platform}-${arch}-${mac}`;
    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
  }

  /**
   * Validate license data
   */
  private validateLicenseData(data: LicenseInfo): boolean {
    if (!data.isValid) return false;
    if (data.tier === 'free') return true;
    
    // Check expiration
    if (data.expiresAt && Date.now() > data.expiresAt) {
      return false;
    }

    // Check machine binding
    if (data.machineId && data.machineId !== this.getMachineId()) {
      return false;
    }

    // Check key format
    if (!data.licenseKey) return false;

    return true;
  }

  /**
   * Get default free license
   */
  private getFreeLicense(): LicenseInfo {
    return {
      tier: 'free',
      isValid: true,
      machineId: this.getMachineId(),
    };
  }

  /**
   * Save license to storage
   */
  private saveLicense(): void {
    this.storage.setSetting(LICENSE_SETTING_KEY, JSON.stringify(this.currentLicense));
  }
}
