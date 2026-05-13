import { ipcMain, BrowserWindow, shell, dialog } from 'electron';
import * as fs from 'fs';
import type { CertificateManager } from './services/CertificateManager';
import type { ProxyServer } from './services/ProxyServer';
import type { TrafficStorage } from './services/TrafficStorage';
import type { CertServer } from './services/CertServer';
import type { BreakpointService } from './services/BreakpointService';
import type { MockService } from './services/MockService';
import type { RequestComposer } from './services/RequestComposer';
import type { LicenseService } from './services/LicenseService';
import type { MapService } from './services/MapService';
import type { ThrottleService } from './services/ThrottleService';
import type { AndroidService } from './services/AndroidService';
import type { IosService } from './services/IosService';
import type {
  ProxyConfig,
  ProxyStatus,
  FilterOptions,
  CapturedRequest,
  AppSettings,
  ExportFormat,
  HarLog,
  HarEntry,
  ComposedRequest,
  BreakpointConfig,
  InterceptedRequest,
  MockRule,
  MapRule,
  ThrottleProfile,
  LicenseInfo,
  LicenseTier,
  AndroidDevice,
  IosDevice
} from '../../shared/types';
import { IPC_CHANNELS, DEFAULT_SETTINGS } from '../../shared/types';
import { getLocalIp } from './utils/network';

interface Services {
  certificateManager: CertificateManager;
  proxyServer: ProxyServer;
  trafficStorage: TrafficStorage;
  certServer: CertServer;
  breakpointService: BreakpointService;
  mockService: MockService;
  requestComposer: RequestComposer;
  licenseService: LicenseService;
  mapService: MapService;
  throttleService: ThrottleService;
  androidService: AndroidService;
  iosService: IosService;
  mainWindow: () => BrowserWindow | null;
}

export function setupIpcHandlers(services: Services): void {
  const { certificateManager, proxyServer, trafficStorage, certServer, breakpointService, mockService, requestComposer, licenseService, mapService, throttleService, androidService, iosService, mainWindow } = services;

  /**
   * Server-side feature gate enforcement.
   * Throws if the current license tier doesn't allow the feature.
   * This is the REAL enforcement — UI guards are just UX hints.
   */
  function requireFeature(featureId: string): void {
    if (!licenseService.hasFeature(featureId)) {
      throw new Error(`FEATURE_LOCKED:${featureId}: Your current license tier does not support this feature.`);
    }
  }

  // ===== Proxy Control =====

  ipcMain.handle(IPC_CHANNELS.PROXY_START, async (_event, config: ProxyConfig): Promise<ProxyStatus> => {
    try {
      // Start cert server first
      if (!certServer.isRunning()) {
        await certServer.start(config.port + 1); // Cert server on proxy port + 1
      }

      // Start proxy server
      const status = await proxyServer.start(config);

      // Listen for captured requests and forward to renderer with batching
      let requestBuffer: CapturedRequest[] = [];
      let batchTimeout: NodeJS.Timeout | null = null;

      const sendBatch = () => {
        if (requestBuffer.length === 0) return;
        
        const win = mainWindow();
        if (win && !win.isDestroyed()) {
          // Send as an array if multiple, or single if one
          win.webContents.send(IPC_CHANNELS.REQUEST_CAPTURED, requestBuffer.length === 1 ? requestBuffer[0] : requestBuffer);
        }
        requestBuffer = [];
        if (batchTimeout) {
          clearTimeout(batchTimeout);
          batchTimeout = null;
        }
      };

      const handleCapturedRequest = (request: CapturedRequest) => {
        requestBuffer.push(request);
        
        if (requestBuffer.length >= 50) {
          sendBatch();
        } else if (!batchTimeout) {
          batchTimeout = setTimeout(sendBatch, 50); // Faster batching for better UX
        }
      };

      proxyServer.on('request', handleCapturedRequest);
      proxyServer.on('request:complete', handleCapturedRequest);

      console.log('[IPC] Proxy started:', status);
      return status;
    } catch (error) {
      console.error('[IPC] Failed to start proxy:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROXY_STOP, async (): Promise<void> => {
    try {
      await proxyServer.stop();
      await certServer.stop();
      console.log('[IPC] Proxy stopped');
    } catch (error) {
      console.error('[IPC] Failed to stop proxy:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROXY_STATUS, async (): Promise<ProxyStatus | null> => {
    return proxyServer.getStatus();
  });

  // ===== Certificate =====

  ipcMain.handle(IPC_CHANNELS.CERT_GET_QR, async (): Promise<string> => {
    try {
      const settings = loadSettings(trafficStorage);
      const qrCode = await certServer.generateSimpleQrCode(settings.proxyPort);
      return qrCode;
    } catch (error) {
      console.error('[IPC] Failed to generate QR code:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.CERT_GET_PATH, async (): Promise<string> => {
    return certificateManager.getCertPath();
  });

  // ===== Requests =====

  ipcMain.handle(IPC_CHANNELS.REQUESTS_GET_ALL, async (_event, filter?: FilterOptions): Promise<CapturedRequest[]> => {
    try {
      return trafficStorage.getRequests(filter);
    } catch (error) {
      console.error('[IPC] Failed to get requests:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.REQUESTS_GET_BY_ID, async (_event, id: number): Promise<CapturedRequest | null> => {
    try {
      return trafficStorage.getRequestById(id);
    } catch (error) {
      console.error('[IPC] Failed to get request by ID:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.REQUESTS_CLEAR, async (): Promise<void> => {
    try {
      trafficStorage.clearAll();
      console.log('[IPC] All requests cleared');
    } catch (error) {
      console.error('[IPC] Failed to clear requests:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.REQUESTS_DELETE, async (_event, id: number): Promise<void> => {
    try {
      trafficStorage.deleteRequest(id);
    } catch (error) {
      console.error('[IPC] Failed to delete request:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.REQUESTS_COUNT, async (): Promise<number> => {
    return trafficStorage.getRequestCount();
  });

  ipcMain.handle(IPC_CHANNELS.REQUESTS_EXPORT, async (_event, format: ExportFormat, ids?: number[]): Promise<string> => {
    try {
      let requests: CapturedRequest[];

      if (ids && ids.length > 0) {
        requests = ids
          .map(id => trafficStorage.getRequestById(id))
          .filter((r): r is CapturedRequest => r !== null);
      } else {
        requests = trafficStorage.getRequests({ limit: 10000 });
      }

      let content: string;
      let defaultName: string;
      let filters: Electron.FileFilter[];

      switch (format) {
        case 'har':
          content = exportAsHar(requests);
          defaultName = 'trafexia-export.har';
          filters = [{ name: 'HAR Files', extensions: ['har'] }];
          break;
        case 'json':
          content = JSON.stringify(requests, null, 2);
          defaultName = 'trafexia-export.json';
          filters = [{ name: 'JSON Files', extensions: ['json'] }];
          break;
        case 'curl':
          content = requests.map(r => exportAsCurl(r)).join('\n\n');
          defaultName = 'trafexia-curl.txt';
          filters = [{ name: 'Text Files', extensions: ['txt'] }];
          break;
        case 'python':
          content = exportAsPython(requests);
          defaultName = 'trafexia-requests.py';
          filters = [{ name: 'Python Files', extensions: ['py'] }];
          break;
        case 'postman':
          content = exportAsPostman(requests);
          defaultName = 'trafexia-postman.json';
          filters = [{ name: 'JSON Files', extensions: ['json'] }];
          break;
        default:
          throw new Error(`Unknown export format: ${format}`);
      }

      // Show save dialog
      const result = await dialog.showSaveDialog({
        defaultPath: defaultName,
        filters,
      });

      if (result.filePath) {
        fs.writeFileSync(result.filePath, content, 'utf-8');
        shell.showItemInFolder(result.filePath);
        return result.filePath;
      }

      return '';
    } catch (error) {
      console.error('[IPC] Failed to export requests:', error);
      throw error;
    }
  });

  // ===== Settings =====

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (): Promise<AppSettings> => {
    return loadSettings(trafficStorage);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_event, settings: Partial<AppSettings>): Promise<void> => {
    try {
      const current = loadSettings(trafficStorage);
      const updated = { ...current, ...settings };
      trafficStorage.setSetting('app_settings', JSON.stringify(updated));
      console.log('[IPC] Settings saved');
    } catch (error) {
      console.error('[IPC] Failed to save settings:', error);
      throw error;
    }
  });

  // ===== App =====

  ipcMain.handle(IPC_CHANNELS.APP_GET_LOCAL_IP, async (): Promise<string> => {
    return getLocalIp();
  });

  ipcMain.handle(IPC_CHANNELS.APP_SELECT_FILE, async (_event, options?: { filters?: { name: string; extensions: string[] }[]; title?: string }): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: options?.title || 'Select File',
      filters: options?.filters,
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // ===== Browser/Emulator =====

  ipcMain.handle(IPC_CHANNELS.LAUNCH_BROWSER, async (_event, browser: 'chrome' | 'firefox' | 'edge'): Promise<boolean> => {
    const { spawn } = await import('child_process');
    const settings = loadSettings(trafficStorage);
    const localIp = getLocalIp();
    const proxyUrl = `${localIp}:${settings.proxyPort}`;

    try {
      const platform = process.platform;
      let command: string;
      let args: string[];

      if (browser === 'chrome') {
        if (platform === 'darwin') {
          command = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        } else if (platform === 'win32') {
          command = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        } else {
          command = 'google-chrome';
        }
        args = [
          `--proxy-server=http://${proxyUrl}`,
          '--ignore-certificate-errors',
          '--user-data-dir=/tmp/trafexia-chrome-profile',
        ];
      } else if (browser === 'firefox') {
        // Firefox doesn't support proxy via command line easily, just open it
        if (platform === 'darwin') {
          command = '/Applications/Firefox.app/Contents/MacOS/firefox';
        } else if (platform === 'win32') {
          command = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
        } else {
          command = 'firefox';
        }
        args = [];
      } else if (browser === 'edge') {
        if (platform === 'darwin') {
          command = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
        } else if (platform === 'win32') {
          command = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
        } else {
          command = 'microsoft-edge';
        }
        args = [
          `--proxy-server=http://${proxyUrl}`,
          '--ignore-certificate-errors',
          '--user-data-dir=/tmp/trafexia-edge-profile',
        ];
      } else {
        throw new Error(`Unknown browser: ${browser}`);
      }

      spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        shell: platform === 'win32'
      }).unref();

      console.log(`[IPC] Launched ${browser} with proxy ${proxyUrl}`);
      return true;
    } catch (error) {
      console.error('[IPC] Failed to launch browser:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LAUNCH_EMULATOR, async (): Promise<boolean> => {
    const { spawn } = await import('child_process');
    const settings = loadSettings(trafficStorage);
    const localIp = getLocalIp();
    const proxyUrl = `${localIp}:${settings.proxyPort}`;

    try {
      // Launch emulator
      // First, check if any emulator is running
      // If not, start the default emulator
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Check for running emulators
      const { stdout: devicesOutput } = await execAsync('adb devices');
      const hasRunningEmulator = devicesOutput.includes('emulator-');

      if (!hasRunningEmulator) {
        // Get list of available AVDs
        const { stdout: avdOutput } = await execAsync('emulator -list-avds');
        const avds = avdOutput.trim().split('\n').filter(line => line.trim());

        if (avds.length === 0) {
          throw new Error('No Android Virtual Devices found. Please create one using Android Studio.');
        }

        // Launch the first available AVD
        const avdName = avds[0];
        console.log(`[IPC] Launching emulator: ${avdName}`);

        spawn('emulator', [`@${avdName}`], {
          detached: true,
          stdio: 'ignore',
        }).unref();

        // Wait a bit for emulator to start
        console.log('[IPC] Waiting for emulator to start...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // Wait for device to be ready
      console.log('[IPC] Waiting for device to be ready...');
      await execAsync('adb wait-for-device');

      // Configure proxy
      console.log(`[IPC] Configuring proxy: ${proxyUrl}`);
      await execAsync(`adb shell settings put global http_proxy ${proxyUrl}`);

      console.log('[IPC] Android emulator launched and configured successfully');
      return true;
    } catch (error) {
      console.error('[IPC] Failed to launch emulator:', error);
      throw error;
    }
  });
  
  ipcMain.handle(IPC_CHANNELS.LAUNCH_SIMULATOR, async (): Promise<boolean> => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      if (process.platform !== 'darwin') {
        throw new Error('iOS Simulator is only available on macOS');
      }

      console.log('[IPC] Launching iOS Simulator...');
      // Just opening the app will boot the last used simulator
      await execAsync('open -a Simulator');
      
      return true;
    } catch (error) {
      console.error('[IPC] Failed to launch simulator:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ANDROID_GET_DEVICES, async (): Promise<AndroidDevice[]> => {
    try {
      return await androidService.listDevices();
    } catch (error) {
      console.error('[IPC] Failed to get Android devices:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ANDROID_BRIDGE_DEVICE, async (_event, deviceId: string): Promise<boolean> => {
    try {
      const settings = loadSettings(trafficStorage);
      const localIp = getLocalIp();
      const proxyUrl = `${localIp}:${settings.proxyPort}`;
      
      return await androidService.bridgeDevice(deviceId, proxyUrl);
    } catch (error) {
      console.error('[IPC] Failed to bridge Android device:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ANDROID_GET_AVDS, async (): Promise<string[]> => {
    try {
      return await androidService.listAvds();
    } catch (error) {
      console.error('[IPC] Failed to get Android AVDs:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ANDROID_LAUNCH_AVD, async (_event, name: string): Promise<boolean> => {
    try {
      return await androidService.launchAvd(name);
    } catch (error) {
      console.error('[IPC] Failed to launch Android AVD:', error);
      throw error;
    }
  });
  
  ipcMain.handle(IPC_CHANNELS.ANDROID_INSTALL_APK, async (_event, deviceId: string, apkPath: string): Promise<boolean> => {
    try {
      return await androidService.installApk(deviceId, apkPath);
    } catch (error) {
      console.error('[IPC] Failed to install APK:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ANDROID_INSTALL_MULTIPLE_APKS, async (_event, deviceId: string, apkPaths: string[]): Promise<boolean> => {
    try {
      return await androidService.installMultipleApks(deviceId, apkPaths);
    } catch (error) {
      console.error('[IPC] Failed to install multiple APKs:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.IOS_GET_DEVICES, async (): Promise<IosDevice[]> => {
    try {
      return await iosService.listDevices();
    } catch (error) {
      console.error('[IPC] Failed to get iOS devices:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.IOS_LAUNCH_DEVICE, async (_event, udid: string): Promise<boolean> => {
    try {
      return await iosService.launchDevice(udid);
    } catch (error) {
      console.error('[IPC] Failed to launch iOS device:', error);
      throw error;
    }
  });

  // ===== Request Replay & Composer =====

  ipcMain.handle(IPC_CHANNELS.REQUEST_REPLAY, async (_event, id: number): Promise<CapturedRequest> => {
    try {
      const originalRequest = trafficStorage.getRequestById(id);
      if (!originalRequest) {
        throw new Error(`Request not found: ${id}`);
      }

      console.log('[IPC] Replaying request:', id);
      const result = await requestComposer.replayRequest(originalRequest);
      
      // Save replayed request to storage
      const savedId = trafficStorage.saveRequest(result);
      const saved = trafficStorage.getRequestById(savedId);
      
      if (saved) {
        // Emit to renderer
        const win = mainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.REQUEST_CAPTURED, saved);
        }
      }
      
      return saved || result;
    } catch (error) {
      console.error('[IPC] Failed to replay request:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.REQUEST_COMPOSE, async (_event, request: ComposedRequest): Promise<CapturedRequest> => {
    try {
      console.log('[IPC] Composing request:', request.method, request.url);
      const result = await requestComposer.sendRequest(request);
      
      // Save composed request to storage
      const savedId = trafficStorage.saveRequest(result);
      const saved = trafficStorage.getRequestById(savedId);
      
      if (saved) {
        // Emit to renderer
        const win = mainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.REQUEST_CAPTURED, saved);
        }
      }
      
      return saved || result;
    } catch (error) {
      console.error('[IPC] Failed to compose request:', error);
      throw error;
    }
  });

  // ===== Breakpoints =====

  ipcMain.handle(IPC_CHANNELS.BREAKPOINT_SET_CONFIG, async (_event, config: BreakpointConfig): Promise<void> => {
    try {
      breakpointService.setConfig(config);
      console.log('[IPC] Breakpoint config updated:', config);
    } catch (error) {
      console.error('[IPC] Failed to set breakpoint config:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.BREAKPOINT_GET_CONFIG, async (): Promise<BreakpointConfig> => {
    return breakpointService.getConfig();
  });

  ipcMain.handle(IPC_CHANNELS.BREAKPOINT_CONTINUE, async (_event, id: string, modified?: InterceptedRequest): Promise<void> => {
    try {
      breakpointService.continue(id, modified);
      console.log('[IPC] Breakpoint continued:', id);
    } catch (error) {
      console.error('[IPC] Failed to continue breakpoint:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.BREAKPOINT_DROP, async (_event, id: string): Promise<void> => {
    try {
      breakpointService.drop(id);
      console.log('[IPC] Breakpoint dropped:', id);
    } catch (error) {
      console.error('[IPC] Failed to drop breakpoint:', error);
      throw error;
    }
  });

  // ===== Mock Rules =====

  ipcMain.handle(IPC_CHANNELS.MOCK_GET_RULES, async (): Promise<MockRule[]> => {
    return mockService.getRules();
  });

  ipcMain.handle(IPC_CHANNELS.MOCK_ADD_RULE, async (_event, rule: Omit<MockRule, 'id'>): Promise<MockRule> => {
    try {
      // Free tier: max 5 mock rules
      if (!licenseService.hasFeature('unlimited-mock')) {
        const existing = mockService.getRules();
        if (existing.length >= 5) {
          throw new Error('FEATURE_LOCKED:unlimited-mock');
        }
      }
      const newRule = mockService.addRule(rule);
      console.log('[IPC] Mock rule added:', newRule.name);
      return newRule;
    } catch (error) {
      console.error('[IPC] Failed to add mock rule:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.MOCK_UPDATE_RULE, async (_event, id: string, updates: Partial<MockRule>): Promise<void> => {
    try {
      mockService.updateRule(id, updates);
      console.log('[IPC] Mock rule updated:', id);
    } catch (error) {
      console.error('[IPC] Failed to update mock rule:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.MOCK_DELETE_RULE, async (_event, id: string): Promise<void> => {
    try {
      mockService.deleteRule(id);
      console.log('[IPC] Mock rule deleted:', id);
    } catch (error) {
      console.error('[IPC] Failed to delete mock rule:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.MOCK_TOGGLE_RULE, async (_event, id: string, enabled: boolean): Promise<void> => {
    try {
      mockService.toggleRule(id, enabled);
      console.log('[IPC] Mock rule toggled:', id, enabled);
    } catch (error) {
      console.error('[IPC] Failed to toggle mock rule:', error);
      throw error;
    }
  });

  // ===== Map Rules (Pro) =====

  ipcMain.handle(IPC_CHANNELS.MAP_GET_RULES, async (): Promise<MapRule[]> => {
    return mapService.getRules();
  });

  ipcMain.handle(IPC_CHANNELS.MAP_ADD_RULE, async (_event, rule: Omit<MapRule, 'id'>): Promise<MapRule> => {
    try {
      requireFeature('map-rules');
      const newRule = mapService.addRule(rule);
      console.log('[IPC] Map rule added:', newRule.name);
      return newRule;
    } catch (error) {
      console.error('[IPC] Failed to add map rule:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.MAP_UPDATE_RULE, async (_event, id: string, updates: Partial<MapRule>): Promise<void> => {
    requireFeature('map-rules');
    mapService.updateRule(id, updates);
  });

  ipcMain.handle(IPC_CHANNELS.MAP_DELETE_RULE, async (_event, id: string): Promise<void> => {
    requireFeature('map-rules');
    mapService.deleteRule(id);
  });

  ipcMain.handle(IPC_CHANNELS.MAP_TOGGLE_RULE, async (_event, id: string, enabled: boolean): Promise<void> => {
    requireFeature('map-rules');
    mapService.toggleRule(id, enabled);
  });

  // ===== Throttle (Pro) =====

  ipcMain.handle(IPC_CHANNELS.THROTTLE_GET_PROFILE, async (): Promise<ThrottleProfile> => {
    return throttleService.getProfile();
  });

  ipcMain.handle(IPC_CHANNELS.THROTTLE_SET_PROFILE, async (_event, profile: ThrottleProfile): Promise<void> => {
    requireFeature('throttle');
    throttleService.setProfile(profile);
  });

  ipcMain.handle(IPC_CHANNELS.THROTTLE_DISABLE, async (): Promise<void> => {
    throttleService.disable();
  });

  // ===== License =====

  ipcMain.handle(IPC_CHANNELS.LICENSE_GET, async (): Promise<LicenseInfo> => {
    return licenseService.getLicense();
  });

  ipcMain.handle(IPC_CHANNELS.LICENSE_ACTIVATE, async (_event, key: string, email: string): Promise<LicenseInfo> => {
    return licenseService.activateLicense(key, email);
  });

  ipcMain.handle(IPC_CHANNELS.LICENSE_DEACTIVATE, async (): Promise<void> => {
    return licenseService.deactivateLicense();
  });

  ipcMain.handle(IPC_CHANNELS.LICENSE_GET_FEATURE_GATES, async (): Promise<Record<string, LicenseTier>> => {
    return licenseService.getFeatureGates();
  });
}

// ===== Helper Functions =====

function loadSettings(storage: TrafficStorage): AppSettings {
  const saved = storage.getSetting('app_settings');
  if (saved) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
  return DEFAULT_SETTINGS;
}

function exportAsHar(requests: CapturedRequest[]): string {
  const harLog: HarLog = {
    version: '1.2',
    creator: {
      name: 'Trafexia',
      version: '1.0.0',
    },
    entries: requests.map((req): HarEntry => {
      const requestHeaders = Object.entries(req.requestHeaders).map(([name, value]) => ({ name, value }));
      const responseHeaders = Object.entries(req.responseHeaders).map(([name, value]) => ({ name, value }));

      // Parse query string
      const url = new URL(req.url);
      const queryString = Array.from(url.searchParams.entries()).map(([name, value]) => ({ name, value }));

      return {
        startedDateTime: new Date(req.timestamp).toISOString(),
        time: req.duration,
        request: {
          method: req.method,
          url: req.url,
          httpVersion: 'HTTP/1.1',
          headers: requestHeaders,
          queryString,
          postData: req.requestBody ? {
            mimeType: req.requestHeaders['content-type'] || 'text/plain',
            text: req.requestBody,
          } : undefined,
          headersSize: -1,
          bodySize: req.requestBody?.length || 0,
        },
        response: {
          status: req.status,
          statusText: getStatusText(req.status),
          httpVersion: 'HTTP/1.1',
          headers: responseHeaders,
          content: {
            size: req.size,
            mimeType: req.contentType || 'text/plain',
            text: req.responseBody || undefined,
          },
          headersSize: -1,
          bodySize: req.size,
        },
        cache: {},
        timings: {
          send: 0,
          wait: req.duration,
          receive: 0,
        },
      };
    }),
  };

  return JSON.stringify({ log: harLog }, null, 2);
}

function exportAsCurl(request: CapturedRequest): string {
  let curl = `curl -X ${request.method} '${request.url}'`;

  // Add headers
  for (const [key, value] of Object.entries(request.requestHeaders)) {
    if (key.toLowerCase() !== 'host') {
      curl += ` \\\n  -H '${key}: ${value}'`;
    }
  }

  // Add body
  if (request.requestBody) {
    const escapedBody = request.requestBody.replace(/'/g, "'\\''");
    curl += ` \\\n  -d '${escapedBody}'`;
  }

  return curl;
}

function exportAsPython(requests: CapturedRequest[]): string {
  let code = `import requests\n\n`;

  requests.forEach((req, index) => {
    const funcName = `request_${index + 1}`;
    code += `def ${funcName}():\n`;
    code += `    """${req.method} ${req.path}"""\n`;
    code += `    url = "${req.url}"\n`;

    // Headers
    const headers = { ...req.requestHeaders };
    delete headers['host'];
    delete headers['content-length'];
    code += `    headers = ${JSON.stringify(headers, null, 8).replace(/\n/g, '\n    ')}\n`;

    // Body
    if (req.requestBody) {
      try {
        const jsonBody = JSON.parse(req.requestBody);
        code += `    json_data = ${JSON.stringify(jsonBody, null, 8).replace(/\n/g, '\n    ')}\n`;
        code += `    response = requests.${req.method.toLowerCase()}(url, headers=headers, json=json_data)\n`;
      } catch {
        code += `    data = """${req.requestBody}"""\n`;
        code += `    response = requests.${req.method.toLowerCase()}(url, headers=headers, data=data)\n`;
      }
    } else {
      code += `    response = requests.${req.method.toLowerCase()}(url, headers=headers)\n`;
    }

    code += `    return response\n\n`;
  });

  return code;
}

function exportAsPostman(requests: CapturedRequest[]): string {
  const collection = {
    info: {
      name: 'Trafexia Export',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: requests.map((req) => {
      const url = new URL(req.url);

      return {
        name: `${req.method} ${req.path}`,
        request: {
          method: req.method,
          header: Object.entries(req.requestHeaders)
            .filter(([key]) => key.toLowerCase() !== 'host')
            .map(([key, value]) => ({ key, value, type: 'text' })),
          url: {
            raw: req.url,
            protocol: url.protocol.replace(':', ''),
            host: url.hostname.split('.'),
            port: url.port || undefined,
            path: url.pathname.split('/').filter(Boolean),
            query: Array.from(url.searchParams.entries()).map(([key, value]) => ({ key, value })),
          },
          body: req.requestBody ? {
            mode: 'raw',
            raw: req.requestBody,
            options: {
              raw: {
                language: req.requestHeaders['content-type']?.includes('json') ? 'json' : 'text',
              },
            },
          } : undefined,
        },
      };
    }),
  };

  return JSON.stringify(collection, null, 2);
}

function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    304: 'Not Modified',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  return statusTexts[status] || 'Unknown';
}
