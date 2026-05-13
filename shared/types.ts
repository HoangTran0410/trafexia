// ===== Proxy Configuration =====
export interface ProxyConfig {
  port: number;
  host: string;
  enableHttps: boolean;
}

// ===== Proxy Status =====
export interface ProxyStatus {
  running: boolean;
  port: number;
  localIp: string;
  certDownloadUrl: string;
}

// ===== Captured Request =====
export interface CapturedRequest {
  id: number;
  timestamp: number;
  method: string;
  url: string;
  host: string;
  path: string;
  status: number;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  contentType: string;
  duration: number;
  size: number;
}

// ===== Database Row (raw from SQLite) =====
export interface RequestDbRow {
  id: number;
  timestamp: number;
  method: string;
  url: string;
  host: string;
  path: string;
  status: number;
  request_headers: string; // JSON string
  request_body: string | null;
  response_headers: string; // JSON string
  response_body: string | null;
  content_type: string;
  duration: number;
  size: number;
}

// ===== Filter Options =====
export interface FilterOptions {
  searchQuery?: string;
  methods?: string[];
  useRegex?: boolean;
  searchInBody?: boolean;
  searchInHeaders?: boolean;
  minSize?: number | null;
  maxSize?: number | null;
  minDuration?: number | null;
  maxDuration?: number | null;
  statusCodes?: string[];
  hosts?: string[];
  contentTypes?: string[];
  dateRange?: { start: number; end: number };
  limit?: number;
  offset?: number;
}

// ===== App Settings =====
export interface AppSettings {
  proxyPort: number;
  certServerPort: number;
  enableHttps: boolean;
  autoClearHours: number;
  darkMode: boolean;
  maxRequestBodySize: number; // bytes
  maxResponseBodySize: number; // bytes
}

// ===== QR Code Data =====
export interface QrCodeData {
  proxyIp: string;
  proxyPort: number;
  certUrl: string;
  setupInstructions: string;
}

// ===== Export Formats =====
export type ExportFormat = "har" | "json" | "curl" | "python" | "postman";

// ===== Request Composer =====
export interface ComposedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

// ===== Breakpoint Configuration =====
export interface BreakpointConfig {
  enabled: boolean;
  breakOnRequest: boolean;
  breakOnResponse: boolean;
  urlPattern?: string; // Regex pattern to match URLs
}

// ===== Intercepted Request/Response =====
export interface InterceptedRequest {
  id: string;
  type: "request" | "response";
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  status?: number; // Only for responses
}

// ===== Mock Rule =====
export interface MockRule {
  id: string;
  enabled: boolean;
  name: string;
  urlPattern: string; // Regex pattern
  method?: string; // Optional method filter
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: string;
  delay?: number; // Optional delay in ms
}

// ===== HAR Types =====
export interface HarLog {
  version: string;
  creator: {
    name: string;
    version: string;
  };
  entries: HarEntry[];
}

export interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: { name: string; value: string }[];
    queryString: { name: string; value: string }[];
    postData?: {
      mimeType: string;
      text: string;
    };
    headersSize: number;
    bodySize: number;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: { name: string; value: string }[];
    content: {
      size: number;
      mimeType: string;
      text?: string;
    };
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, unknown>;
  timings: {
    send: number;
    wait: number;
    receive: number;
  };
}

// ===== SSL Bypass Types =====
export interface PatchedItem {
  type:
    | "network_security_config"
    | "manifest"
    | "smali_pin_removed"
    | "smali_trust_override";
  file: string;
  description: string;
}

export interface PatchResult {
  success: boolean;
  patchedItems: PatchedItem[];
  warnings: string[];
  outputPath: string;
}

export interface DetectedPinningHost {
  host: string;
  framework: string;
  detectedAt: number;
  bypassed: boolean;
}

export type FridaArch = "arm64" | "arm" | "x86_64" | "x86";

export type BypassFramework =
  | "auto"
  | "okhttp3"
  | "conscrypt"
  | "webview"
  | "flutter"
  | "react-native"
  | "all";

export interface FridaLogEntry {
  timestamp: number;
  level: "info" | "success" | "error" | "warning";
  message: string;
}

// ===== IPC Channel Names =====
export const IPC_CHANNELS = {
  // Proxy control
  PROXY_START: "proxy:start",
  PROXY_STOP: "proxy:stop",
  PROXY_STATUS: "proxy:status",
  PROXY_ERROR: "proxy:error",

  // Certificate
  CERT_GET_QR: "cert:get-qr",
  CERT_GET_PATH: "cert:get-path",

  // Requests
  REQUEST_CAPTURED: "request:captured",
  REQUESTS_GET_ALL: "requests:get-all",
  REQUESTS_GET_BY_ID: "requests:get-by-id",
  REQUESTS_CLEAR: "requests:clear",
  REQUESTS_DELETE: "requests:delete",
  REQUESTS_EXPORT: "requests:export",
  REQUESTS_COUNT: "requests:count",

  // Settings
  SETTINGS_GET: "settings:get",
  SETTINGS_SAVE: "settings:save",

  // App
  APP_GET_LOCAL_IP: "app:get-local-ip",
  APP_SELECT_FILE: "app:select-file",

  // Browser/Emulator
  LAUNCH_BROWSER: "app:launch-browser",
  LAUNCH_EMULATOR: "app:launch-emulator",
  LAUNCH_SIMULATOR: "app:launch-simulator",
  ANDROID_GET_DEVICES: "android:get-devices",
  ANDROID_BRIDGE_DEVICE: "android:bridge-device",
  ANDROID_GET_AVDS: "android:get-avds",
  ANDROID_LAUNCH_AVD: "android:launch-avd",
  IOS_GET_DEVICES: "ios:get-devices",
  IOS_LAUNCH_DEVICE: "ios:launch-device",
  ANDROID_INSTALL_APK: "android:install-apk",
  ANDROID_INSTALL_MULTIPLE_APKS: "android:install-multiple-apks",

  // Request Replay & Composer
  REQUEST_REPLAY: "request:replay",
  REQUEST_COMPOSE: "request:compose",

  // Breakpoints
  BREAKPOINT_SET_CONFIG: "breakpoint:set-config",
  BREAKPOINT_GET_CONFIG: "breakpoint:get-config",
  BREAKPOINT_REQUEST_PENDING: "breakpoint:request-pending",
  BREAKPOINT_CONTINUE: "breakpoint:continue",
  BREAKPOINT_DROP: "breakpoint:drop",

  // Mock Rules
  MOCK_GET_RULES: "mock:get-rules",
  MOCK_ADD_RULE: "mock:add-rule",
  MOCK_UPDATE_RULE: "mock:update-rule",
  MOCK_DELETE_RULE: "mock:delete-rule",
  MOCK_TOGGLE_RULE: "mock:toggle-rule",

  // SSL Bypass
  SSL_BYPASS_PATCH_APK: "ssl-bypass:patch-apk",
  SSL_BYPASS_INJECT_GADGET: "ssl-bypass:inject-gadget",
  SSL_BYPASS_START_FRIDA: "ssl-bypass:start-frida",
  SSL_BYPASS_STOP_FRIDA: "ssl-bypass:stop-frida",
  SSL_BYPASS_GET_DETECTED_HOSTS: "ssl-bypass:get-detected-hosts",
  SSL_BYPASS_FRIDA_LOG: "ssl-bypass:frida-log",
  SSL_BYPASS_HOST_DETECTED: "ssl-bypass:host-detected",

  // Map Rules (Pro)
  MAP_GET_RULES: "map:get-rules",
  MAP_ADD_RULE: "map:add-rule",
  MAP_UPDATE_RULE: "map:update-rule",
  MAP_DELETE_RULE: "map:delete-rule",
  MAP_TOGGLE_RULE: "map:toggle-rule",

  // Throttle (Pro)
  THROTTLE_SET_PROFILE: "throttle:set-profile",
  THROTTLE_GET_PROFILE: "throttle:get-profile",
  THROTTLE_DISABLE: "throttle:disable",

  // License
  LICENSE_GET: "license:get",
  LICENSE_ACTIVATE: "license:activate",
  LICENSE_DEACTIVATE: "license:deactivate",
  LICENSE_GET_FEATURE_GATES: "license:get-feature-gates",

  // Session (Pro)
  SESSION_SAVE: "session:save",
  SESSION_LOAD: "session:load",
  SESSION_LIST: "session:list",
  SESSION_DELETE: "session:delete",
} as const;

// ===== Map Rule (Map Local / Map Remote) =====
export interface MapRule {
  id: string;
  enabled: boolean;
  name: string;
  type: "local" | "remote"; // Map to local file or remote URL
  sourceUrlPattern: string; // Regex pattern to match
  sourceMethod?: string; // Optional method filter
  // For Map Remote
  destinationUrl?: string; // Redirect to this URL
  // For Map Local
  localFilePath?: string; // Serve from local file
  localResponseStatus?: number;
  localResponseHeaders?: Record<string, string>;
  // Common
  preserveHost?: boolean; // Keep original Host header
  created_at?: number;
}

// ===== Throttle Profile =====
export interface ThrottleProfile {
  enabled: boolean;
  preset: ThrottlePreset | "custom";
  // Custom values (bytes per second)
  downloadSpeed: number;   // Download bandwidth limit (bytes/sec)
  uploadSpeed: number;     // Upload bandwidth limit (bytes/sec)
  latency: number;         // Additional latency in ms
  packetLoss: number;      // Packet loss percentage (0-100)
  urlPattern?: string;     // Optional: only throttle matching URLs
}

export type ThrottlePreset =
  | "none"
  | "gprs"      // 50 Kbps
  | "edge"      // 250 Kbps
  | "3g"        // 750 Kbps
  | "3g-good"   // 1.5 Mbps
  | "4g"        // 4 Mbps
  | "dsl"       // 2 Mbps
  | "wifi"      // 30 Mbps
  | "custom";

export const THROTTLE_PRESETS: Record<Exclude<ThrottlePreset, "custom" | "none">, { label: string; download: number; upload: number; latency: number }> = {
  gprs:      { label: "GPRS (50 Kbps)",       download: 6250,     upload: 2500,    latency: 500 },
  edge:      { label: "EDGE (250 Kbps)",      download: 31250,    upload: 12500,   latency: 300 },
  "3g":      { label: "3G (750 Kbps)",        download: 93750,    upload: 31250,   latency: 200 },
  "3g-good": { label: "3G Good (1.5 Mbps)",   download: 187500,   upload: 93750,   latency: 100 },
  "4g":      { label: "4G/LTE (4 Mbps)",      download: 500000,   upload: 250000,  latency: 50 },
  dsl:       { label: "DSL (2 Mbps)",         download: 250000,   upload: 62500,   latency: 20 },
  wifi:      { label: "WiFi (30 Mbps)",       download: 3750000,  upload: 1875000, latency: 5 },
};

// ===== License =====
export type LicenseTier = "free" | "pro" | "team";

export interface LicenseInfo {
  tier: LicenseTier;
  licenseKey?: string;
  email?: string;
  expiresAt?: number; // Timestamp
  activatedAt?: number;
  machineId?: string;
  isValid: boolean;
}

export const FEATURE_GATES: Record<string, LicenseTier> = {
  // === FREE TIER (default on) ===
  "qr-code": "free",
  "copy-curl": "free",
  "copy-url": "free",
  "clear-requests": "free",
  "filter-requests": "free",
  "mock-rules": "free",
  "breakpoints": "free",
  "request-composer": "free",
  "replay": "free",

  // === PRO TIER ===
  "map-rules": "pro",
  "throttle": "pro",
  "diff-compare": "pro",
  "ssl-bypass": "pro",
  "session-save": "pro",
  "websocket": "pro",
  "graphql": "pro",
  "unlimited-mock": "pro",
  "unlimited-breakpoints": "pro",
  "scripting": "pro",

  // === EXPORT ===
  "export-curl": "free",
  "export-har": "pro",
  "export-postman": "pro",
  "export-python": "pro",
  "export-advanced": "pro",

  // === TEAM TIER ===
  "shared-sessions": "team",
  "team-collaboration": "team",
};

// ===== Android Device =====
export interface AndroidDevice {
  id: string;
  model: string;
  type: "emulator" | "physical";
  isRooted: boolean;
  status: string;
}

// ===== iOS Device =====
export interface IosDevice {
  udid: string;
  name: string;
  state: string;
  isAvailable: boolean;
  runtime: string;
}

// ===== Session =====
export interface SavedSession {
  id: string;
  name: string;
  description?: string;
  requestCount: number;
  createdAt: number;
  size: number; // bytes
}

// ===== IPC Handler Types =====
export interface IpcApi {
  // Proxy
  startProxy: (config: ProxyConfig) => Promise<ProxyStatus>;
  stopProxy: () => Promise<void>;
  getProxyStatus: () => Promise<ProxyStatus | null>;

  // Certificate
  getQrCode: () => Promise<string>;
  getCertPath: () => Promise<string>;

  // Requests
  getRequests: (filter?: FilterOptions) => Promise<CapturedRequest[]>;
  getRequestById: (id: number) => Promise<CapturedRequest | null>;
  clearRequests: () => Promise<void>;
  deleteRequest: (id: number) => Promise<void>;
  exportRequests: (format: ExportFormat, ids?: number[]) => Promise<string>;
  getRequestCount: () => Promise<number>;

  // Settings
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<void>;

  // App
  getLocalIp: () => Promise<string>;
  selectFile: (options?: { filters?: { name: string; extensions: string[] }[]; title?: string }) => Promise<string | null>;

  // Browser/Emulator
  launchBrowser: (browser: "chrome" | "firefox" | "edge") => Promise<boolean>;
  launchEmulator: () => Promise<boolean>;
  launchSimulator: () => Promise<boolean>;
  getAndroidDevices: () => Promise<AndroidDevice[]>;
  bridgeAndroidDevice: (deviceId: string) => Promise<boolean>;
  getAndroidAvds: () => Promise<string[]>;
  launchAndroidAvd: (name: string) => Promise<boolean>;
  installApk: (deviceId: string, apkPath: string) => Promise<boolean>;
  installMultipleApks: (deviceId: string, apkPaths: string[]) => Promise<boolean>;
  getIosDevices: () => Promise<IosDevice[]>;
  launchIosDevice: (udid: string) => Promise<boolean>;

  // Request Replay & Composer
  replayRequest: (id: number) => Promise<CapturedRequest>;
  composeRequest: (request: ComposedRequest) => Promise<CapturedRequest>;

  // Breakpoints
  setBreakpointConfig: (config: BreakpointConfig) => Promise<void>;
  getBreakpointConfig: () => Promise<BreakpointConfig>;
  continueBreakpoint: (
    id: string,
    modified?: InterceptedRequest,
  ) => Promise<void>;
  dropBreakpoint: (id: string) => Promise<void>;

  // Mock Rules
  getMockRules: () => Promise<MockRule[]>;
  addMockRule: (rule: Omit<MockRule, "id">) => Promise<MockRule>;
  updateMockRule: (id: string, rule: Partial<MockRule>) => Promise<void>;
  deleteMockRule: (id: string) => Promise<void>;
  toggleMockRule: (id: string, enabled: boolean) => Promise<void>;

  // SSL Bypass
  patchApk: (inputPath: string, outputPath: string) => Promise<PatchResult>;
  injectGadget: (apkPath: string, arch: FridaArch, outputPath: string) => Promise<string[]>;
  startFrida: (
    packageName: string,
    framework: BypassFramework,
    deviceId?: string,
  ) => Promise<void>;
  stopFrida: () => Promise<void>;
  getDetectedHosts: () => Promise<DetectedPinningHost[]>;

  // Map Rules (Pro)
  getMapRules: () => Promise<MapRule[]>;
  addMapRule: (rule: Omit<MapRule, "id">) => Promise<MapRule>;
  updateMapRule: (id: string, rule: Partial<MapRule>) => Promise<void>;
  deleteMapRule: (id: string) => Promise<void>;
  toggleMapRule: (id: string, enabled: boolean) => Promise<void>;

  // Throttle (Pro)
  setThrottleProfile: (profile: ThrottleProfile) => Promise<void>;
  getThrottleProfile: () => Promise<ThrottleProfile>;
  disableThrottle: () => Promise<void>;

  // License
  getLicense: () => Promise<LicenseInfo>;
  activateLicense: (key: string, email: string) => Promise<LicenseInfo>;
  deactivateLicense: () => Promise<void>;
  getFeatureGates: () => Promise<Record<string, LicenseTier>>;

  // Session (Pro)
  saveSession: (name: string, description?: string) => Promise<SavedSession>;
  loadSession: (id: string) => Promise<CapturedRequest[]>;
  listSessions: () => Promise<SavedSession[]>;
  deleteSession: (id: string) => Promise<void>;

  // Events
  onRequestCaptured: (
    callback: (request: CapturedRequest) => void,
  ) => () => void;
  onProxyError: (callback: (error: string) => void) => () => void;
  onBreakpointHit: (
    callback: (intercepted: InterceptedRequest) => void,
  ) => () => void;
  onFridaLog: (callback: (log: FridaLogEntry) => void) => () => void;
  onHostDetected: (callback: (host: DetectedPinningHost) => void) => () => void;
}

// ===== Content Type Categories =====
export const CONTENT_TYPE_CATEGORIES = {
  json: ["application/json", "text/json"],
  html: ["text/html"],
  xml: ["application/xml", "text/xml"],
  text: ["text/plain", "text/css", "text/javascript", "application/javascript"],
  image: [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/svg+xml",
  ],
  binary: ["application/octet-stream", "application/pdf", "application/zip"],
  form: ["application/x-www-form-urlencoded", "multipart/form-data"],
} as const;

// ===== HTTP Methods =====
export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "CONNECT",
  "TRACE",
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

// ===== Status Code Ranges =====
export const STATUS_CODE_RANGES = {
  info: { min: 100, max: 199, label: "1xx Informational" },
  success: { min: 200, max: 299, label: "2xx Success" },
  redirect: { min: 300, max: 399, label: "3xx Redirect" },
  clientError: { min: 400, max: 499, label: "4xx Client Error" },
  serverError: { min: 500, max: 599, label: "5xx Server Error" },
} as const;

// ===== Default Settings =====
export const DEFAULT_SETTINGS: AppSettings = {
  proxyPort: 8888,
  certServerPort: 8889,
  enableHttps: true,
  autoClearHours: 24,
  darkMode: true,
  maxRequestBodySize: 1024 * 1024, // 1MB
  maxResponseBodySize: 5 * 1024 * 1024, // 5MB
};
