import { EventEmitter } from 'events';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as url from 'url';
import * as tls from 'tls';
import * as zlib from 'zlib';
import type { CertificateManager } from './CertificateManager';
import type { TrafficStorage } from './TrafficStorage';
import type { BreakpointService } from './BreakpointService';
import type { MockService } from './MockService';
import type { MapService } from './MapService';
import type { ThrottleService } from './ThrottleService';
import type { CapturedRequest, ProxyConfig, ProxyStatus } from '../../../shared/types';
import { getLocalIp } from '../utils/network';


export class ProxyServer extends EventEmitter {
  private server: http.Server | null = null;
  private certManager: CertificateManager;
  private storage: TrafficStorage;
  private breakpointService?: BreakpointService;
  private mockService?: MockService;
  private mapService?: MapService;
  private throttleService?: ThrottleService;
  private config: ProxyConfig | null = null;
  private running = false;
  private certCache: Map<string, { key: string; cert: string }> = new Map();
  private activeSockets: Set<net.Socket | tls.TLSSocket> = new Set();

  constructor(
    certManager: CertificateManager, 
    storage: TrafficStorage,
    breakpointService?: BreakpointService,
    mockService?: MockService,
    mapService?: MapService,
    throttleService?: ThrottleService
  ) {
    super();
    this.certManager = certManager;
    this.storage = storage;
    this.breakpointService = breakpointService;
    this.mockService = mockService;
    this.mapService = mapService;
    this.throttleService = throttleService;
  }

  /**
   * Start the proxy server
   */
  async start(config: ProxyConfig): Promise<ProxyStatus> {
    if (this.running) {
      throw new Error('Proxy server is already running');
    }

    this.config = config;

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      // Handle CONNECT method for HTTPS
      this.server.on('connect', (req, clientSocket: net.Socket, head) => {
        this.handleConnect(req, clientSocket, head);
      });
      
      // Handle WebSocket upgrades
      this.server.on('upgrade', (req, clientSocket: net.Socket, head) => {
        this.handleWebSocketUpgrade(req, clientSocket, head);
      });

      // Handle client errors gracefully (Android disconnects, etc.)
      this.server.on('clientError', (err, socket) => {
        const msg = err.message || '';
        // Suppress common errors from mobile devices
        if (!msg.includes('ECONNRESET') && !msg.includes('EPIPE')) {
          console.error('[ProxyServer] Client error:', msg);
        }
        if (socket.writable) {
          socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        }
      });

      // Set keep-alive timeout for mobile connections
      this.server.keepAliveTimeout = 60000; // 60 seconds
      this.server.headersTimeout = 65000; // Slightly higher than keepAlive

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${config.port} is already in use`));
        } else {
          reject(err);
        }
      });

      // Track connections for clean shutdown
      this.server.on('connection', (socket: net.Socket) => {
        this.activeSockets.add(socket);
        socket.on('close', () => {
          this.activeSockets.delete(socket);
        });
      });

      this.server.listen(config.port, '0.0.0.0', () => {
        this.running = true;
        console.log(`[ProxyServer] Started on port ${config.port}`);
        resolve(this.getStatus()!);
      });
    });
  }

  /**
   * Stop the proxy server
   */
  async stop(): Promise<void> {
    if (!this.server || !this.running) {
      return;
    }

    console.log(`[ProxyServer] Stopping... (${this.activeSockets.size} active connections)`);

    // Destroy all active connections immediately
    for (const socket of this.activeSockets) {
      try {
        socket.destroy();
      } catch {
        // Ignore errors when destroying sockets
      }
    }
    this.activeSockets.clear();

    // Close server with timeout
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('[ProxyServer] Force stopped (timeout)');
        this.running = false;
        this.server = null;
        resolve();
      }, 2000); // 2 second timeout

      this.server!.close((err) => {
        clearTimeout(timeout);
        if (err) {
          console.error('[ProxyServer] Error closing server:', err);
        }
        this.running = false;
        this.server = null;
        console.log('[ProxyServer] Stopped');
        resolve();
      });
    });
  }

  /**
   * Check if proxy is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get current proxy status
   */
  getStatus(): ProxyStatus | null {
    if (!this.config) return null;

    const localIp = getLocalIp();
    return {
      running: this.running,
      port: this.config.port,
      localIp,
      certDownloadUrl: `http://${localIp}:8889/cert`,
    };
  }

  /**
   * Handle regular HTTP requests
   */
  private handleRequest(clientReq: http.IncomingMessage, clientRes: http.ServerResponse): void {
    const startTime = Date.now();
    const requestUrl = clientReq.url || '';

    let parsedUrl: url.URL;
    try {
      parsedUrl = new url.URL(requestUrl);
    } catch {
      // Relative URL - should not happen for proxy requests
      clientRes.writeHead(400);
      clientRes.end('Bad Request');
      return;
    }

    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: clientReq.method,
      headers: { ...clientReq.headers },
    };

    // Remove proxy-specific headers
    delete (options.headers as Record<string, unknown>)['proxy-connection'];

    // Capture request with size limit to maintain smoothness
    const requestBody: Buffer[] = [];
    let requestSize = 0;
    const MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 5MB limit for capturing

    clientReq.on('data', (chunk) => {
      if (requestSize + chunk.length < MAX_BUFFER_SIZE) {
        requestBody.push(chunk);
        requestSize += chunk.length;
      }
    });

    clientReq.on('end', async () => {
      const fullBody = Buffer.concat(requestBody);
      const reqBodyStr = requestSize < MAX_BUFFER_SIZE ? fullBody.toString('utf-8') : '[Request body too large to capture]';

      // Check for mock rules first
      if (this.mockService) {
        const mockRule = this.mockService.findMatchingRule(clientReq.method || 'GET', requestUrl);
        if (mockRule) {
          console.log('[ProxyServer] Mock rule matched:', mockRule.name);
          
          // Apply delay if specified
          if (mockRule.delay && mockRule.delay > 0) {
            await new Promise(resolve => setTimeout(resolve, mockRule.delay));
          }

          const mock = this.mockService.generateMockResponse(mockRule);
          
          // Save mocked request
          const capturedRequest: Omit<CapturedRequest, 'id'> = {
            timestamp: startTime,
            method: clientReq.method || 'GET',
            url: requestUrl,
            host: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            status: mock.status,
            requestHeaders: this.headersToRecord(clientReq.headers),
            requestBody: reqBodyStr || null,
            responseHeaders: mock.headers,
            responseBody: mock.body,
            contentType: mock.headers['content-type'] || 'text/plain',
            duration: Date.now() - startTime + (mockRule.delay || 0),
            size: Buffer.byteLength(mock.body),
          };

          const requestId = this.storage.saveRequest(capturedRequest);
          const saved = this.storage.getRequestById(requestId);
          if (saved) {
            this.emit('request:complete', saved);
          }

          // Send mock response to client
          clientRes.writeHead(mock.status, mock.headers);
          clientRes.end(mock.body);
          return;
        }
      }

      // Check for Map Local/Remote rules
      if (this.mapService) {
        const mapRule = this.mapService.findMatchingRule(clientReq.method || 'GET', requestUrl);
        if (mapRule) {
          if (mapRule.type === 'local') {
            // Map Local: serve from local file
            const localResponse = this.mapService.applyLocalMapping(mapRule);
            if (localResponse) {
              console.log('[ProxyServer] Map Local matched:', mapRule.name);
              const capturedRequest: Omit<CapturedRequest, 'id'> = {
                timestamp: startTime,
                method: clientReq.method || 'GET',
                url: requestUrl,
                host: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                status: localResponse.status,
                requestHeaders: this.headersToRecord(clientReq.headers),
                requestBody: reqBodyStr || null,
                responseHeaders: localResponse.headers,
                responseBody: localResponse.body,
                contentType: localResponse.headers['content-type'] || 'text/plain',
                duration: Date.now() - startTime,
                size: Buffer.byteLength(localResponse.body),
              };
              const requestId = this.storage.saveRequest(capturedRequest);
              const saved = this.storage.getRequestById(requestId);
              if (saved) this.emit('request:complete', saved);

              clientRes.writeHead(localResponse.status, localResponse.headers);
              clientRes.end(localResponse.body);
              return;
            }
          } else if (mapRule.type === 'remote') {
            // Map Remote: rewrite URL
            const newUrl = this.mapService.applyRemoteMapping(mapRule, requestUrl);
            console.log('[ProxyServer] Map Remote:', requestUrl, '->', newUrl);
            try {
              const newParsed = new url.URL(newUrl);
              options.hostname = newParsed.hostname;
              options.port = newParsed.port || 80;
              options.path = newParsed.pathname + newParsed.search;
              if (!mapRule.preserveHost) {
                (options.headers as Record<string, unknown>)['host'] = newParsed.host;
              }
            } catch (e) {
              console.error('[ProxyServer] Invalid Map Remote URL:', newUrl);
            }
          }
        }
      }

      // Check for breakpoint on request
      if (this.breakpointService?.shouldBreak('request', clientReq.method || 'GET', requestUrl)) {
        try {
          const modified = await this.breakpointService.pauseAtBreakpoint(
            'request',
            clientReq.method || 'GET',
            requestUrl,
            this.headersToRecord(clientReq.headers),
            reqBodyStr || null
          );

          if (modified) {
            // User modified the request - use modified version
            options.method = modified.method;
            options.headers = modified.headers;
            requestBody.length = 0;
            if (modified.body) {
              requestBody.push(Buffer.from(modified.body));
            }
          }
        } catch (error) {
          // Request dropped by user
          console.log('[ProxyServer] Request dropped at breakpoint');
          clientRes.writeHead(499, { 'Content-Type': 'text/plain' });
          clientRes.end('Request dropped by user');
          return;
        }
      }

      // Save request to database
      const capturedRequest: Omit<CapturedRequest, 'id'> = {
        timestamp: startTime,
        method: clientReq.method || 'GET',
        url: requestUrl,
        host: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        status: 0,
        requestHeaders: this.headersToRecord(clientReq.headers),
        requestBody: reqBodyStr || null,
        responseHeaders: {},
        responseBody: null,
        contentType: '',
        duration: 0,
        size: 0,
      };

      const requestId = this.storage.saveRequest(capturedRequest);
      this.emit('request', { ...capturedRequest, id: requestId });

      // Make proxy request
      const proxyReq = http.request(options, (proxyRes) => {
        this.handleProxyResponse(requestId, startTime, proxyRes, clientRes, requestUrl);
      });

      proxyReq.on('error', (err) => {
        console.error('[ProxyServer] Request error:', err.message);
        this.storage.updateResponse(requestId, {
          status: 502,
          responseHeaders: {},
          responseBody: err.message,
          contentType: 'text/plain',
          duration: Date.now() - startTime,
          size: 0,
        });

        if (!clientRes.headersSent) {
          clientRes.writeHead(502);
          clientRes.end('Proxy Error: ' + err.message);
        }
      });

      // Forward request body
      if (requestBody.length > 0) {
        const fullBody = Buffer.concat(requestBody);
        const uploadThrottle = this.throttleService?.createThrottleStream('upload', requestUrl);
        if (uploadThrottle) {
          uploadThrottle.pipe(proxyReq);
          uploadThrottle.write(fullBody);
          uploadThrottle.end();
        } else {
          proxyReq.write(fullBody);
          proxyReq.end();
        }
      } else {
        proxyReq.end();
      }
    });
  }

  /**
   * Handle CONNECT method for HTTPS tunneling
   */
  private handleConnect(req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer): void {
    const [hostname, portStr] = (req.url || '').split(':');
    const port = parseInt(portStr, 10) || 443;

    if (!this.config?.enableHttps) {
      // Simple tunnel without interception
      const serverSocket = net.connect(port, hostname, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        serverSocket.write(head);
        
        const fullUrl = `https://${hostname}:${port}`;
        const downloadThrottle = this.throttleService?.createThrottleStream('download', fullUrl);
        const uploadThrottle = this.throttleService?.createThrottleStream('upload', fullUrl);

        if (downloadThrottle) {
          serverSocket.pipe(downloadThrottle).pipe(clientSocket);
        } else {
          serverSocket.pipe(clientSocket);
        }

        if (uploadThrottle) {
          clientSocket.pipe(uploadThrottle).pipe(serverSocket);
        } else {
          clientSocket.pipe(serverSocket);
        }
      });

      // Track server socket for clean shutdown
      this.activeSockets.add(serverSocket);
      serverSocket.on('close', () => this.activeSockets.delete(serverSocket));

      serverSocket.on('error', () => {
        clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      });
    } else {
      // MITM interception
      this.handleMitmConnect(hostname, port, clientSocket, head);
    }
  }

  /**
   * Handle MITM HTTPS interception
   */
  private handleMitmConnect(hostname: string, port: number, clientSocket: net.Socket, head: Buffer): void {
    // Get or generate certificate for this domain
    let certData = this.certCache.get(hostname);
    if (!certData) {
      try {
        certData = this.certManager.generateServerCert(hostname);
        this.certCache.set(hostname, certData);
      } catch (err) {
        console.error('[ProxyServer] Failed to generate cert for', hostname, err);
        clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        return;
      }
    }

    // Send connection established
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

    // Create TLS server socket for client connection with maximum compatibility
    const secureContext = tls.createSecureContext({
      key: certData.key,
      cert: certData.cert,
      minVersion: 'TLSv1' as tls.SecureVersion,
      maxVersion: 'TLSv1.3' as tls.SecureVersion,
      // Support wide range of ciphers for compatibility
      ciphers: [
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'TLS_AES_128_GCM_SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-SHA384',
        'ECDHE-RSA-AES128-SHA256',
        'ECDHE-RSA-AES256-SHA',
        'ECDHE-RSA-AES128-SHA',
        'AES256-GCM-SHA384',
        'AES128-GCM-SHA256',
        'AES256-SHA256',
        'AES128-SHA256',
        'AES256-SHA',
        'AES128-SHA',
        'HIGH',
        '!aNULL',
        '!eNULL',
        '!EXPORT',
      ].join(':'),
      honorCipherOrder: false, // Let client choose preferred cipher
    });

    const tlsSocket = new tls.TLSSocket(clientSocket, {
      secureContext,
      isServer: true,
      requestCert: false,
      rejectUnauthorized: false,
      enableTrace: false,
      // Only advertise HTTP/1.1 since we don't have HTTP/2 frame parser
      // Servers will fallback to HTTP/1.1 which we can properly parse
      ALPNProtocols: ['http/1.1'],
    });

    // Track TLS socket for clean shutdown
    this.activeSockets.add(tlsSocket);
    tlsSocket.on('close', () => this.activeSockets.delete(tlsSocket));

    tlsSocket.on('error', (err) => {
      // Suppress common errors for apps with cert pinning or unsupported protocols
      const msg = err.message || '';
      const suppressedErrors = [
        'ECONNRESET', 
        'EPIPE', 
        'UNSUPPORTED_PROTOCOL', 
        'INAPPROPRIATE_FALLBACK', 
        'UNEXPECTED_MESSAGE', 
        'bad decrypt',
        'CERTIFICATE_UNKNOWN', // Client rejected our cert
        'UNKNOWN_CA',          // Client doesn't know our CA
        'BAD_CERTIFICATE'      // Client found something wrong with the cert
      ];
      if (!suppressedErrors.some(e => msg.includes(e))) {
        console.error('[ProxyServer] TLS error:', msg);
      }
    });

    // Wait for TLS handshake to complete
    tlsSocket.on('secure', () => {
      // Now handle HTTP over the TLS connection
      this.handleTlsConnection(hostname, port, tlsSocket);
    });

    // Handle data before secure event (shouldn't happen, but just in case)
    if (head && head.length > 0) {
      tlsSocket.unshift(head);
    }
  }

  /**
   * Handle TLS connection after handshake
   */
  private handleTlsConnection(hostname: string, port: number, tlsSocket: tls.TLSSocket): void {
    let buffer = Buffer.alloc(0);

    const parseRequest = () => {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return null;

      const headerStr = buffer.slice(0, headerEnd).toString('utf-8');
      const lines = headerStr.split('\r\n');
      const [method, path] = lines[0].split(' ');

      const headers: Record<string, string> = {};
      for (let i = 1; i < lines.length; i++) {
        const colonIdx = lines[i].indexOf(':');
        if (colonIdx > 0) {
          const key = lines[i].slice(0, colonIdx).trim().toLowerCase();
          const value = lines[i].slice(colonIdx + 1).trim();
          headers[key] = value;
        }
      }

      return { method, path, headers, headerEnd };
    };

    tlsSocket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      const parsed = parseRequest();
      if (!parsed) return;

      const { method, path, headers, headerEnd } = parsed;
      const contentLength = parseInt(headers['content-length'] || '0', 10);
      const bodyStart = headerEnd + 4;
      const totalLength = bodyStart + contentLength;

      if (buffer.length < totalLength) return;

      const body = buffer.slice(bodyStart, totalLength);
      buffer = buffer.slice(totalLength);

      // Process the request
      this.processHttpsRequest(hostname, port, method, path, headers, body, tlsSocket);
    });
  }

  /**
   * Process HTTPS request and forward to target
   */
  private processHttpsRequest(
    hostname: string,
    port: number,
    method: string,
    path: string,
    reqHeaders: Record<string, string>,
    body: Buffer,
    clientSocket: tls.TLSSocket
  ): void {
    const startTime = Date.now();
    const fullUrl = `https://${hostname}${port !== 443 ? ':' + port : ''}${path}`;

    // Build headers for outgoing request
    const outHeaders: Record<string, string> = { ...reqHeaders };
    delete outHeaders['proxy-connection'];
    outHeaders['host'] = hostname;

    // Check for mock rules first
    if (this.mockService) {
      const mockRule = this.mockService.findMatchingRule(method, fullUrl);
      if (mockRule) {
        console.log('[ProxyServer] Mock rule matched for HTTPS:', mockRule.name);
        
        // Apply delay if specified
        if (mockRule.delay && mockRule.delay > 0) {
          setTimeout(() => {
            this.sendMockResponseToHttpsClient(mockRule, startTime, fullUrl, hostname, path, method, reqHeaders, body, clientSocket);
          }, mockRule.delay);
        } else {
          this.sendMockResponseToHttpsClient(mockRule, startTime, fullUrl, hostname, path, method, reqHeaders, body, clientSocket);
        }
        return; // Don't make real request
      }
    }

    // Check for Map Local/Remote rules (HTTPS)
    if (this.mapService) {
      const mapRule = this.mapService.findMatchingRule(method, fullUrl);
      if (mapRule) {
        if (mapRule.type === 'local') {
          const localResponse = this.mapService.applyLocalMapping(mapRule);
          if (localResponse) {
            console.log('[ProxyServer] Map Local matched (HTTPS):', mapRule.name);
            const capturedReq: Omit<CapturedRequest, 'id'> = {
              timestamp: startTime,
              method, url: fullUrl, host: hostname, path,
              status: localResponse.status,
              requestHeaders: reqHeaders,
              requestBody: body.length > 0 ? body.toString('utf-8') : null,
              responseHeaders: localResponse.headers,
              responseBody: localResponse.body,
              contentType: localResponse.headers['content-type'] || 'text/plain',
              duration: Date.now() - startTime,
              size: Buffer.byteLength(localResponse.body),
            };
            const reqId = this.storage.saveRequest(capturedReq);
            const saved = this.storage.getRequestById(reqId);
            if (saved) this.emit('request:complete', saved);

            if (clientSocket.writable && !clientSocket.destroyed) {
              const bodyBuf = Buffer.from(localResponse.body);
              let resHead = `HTTP/1.1 ${localResponse.status} OK\r\n`;
              for (const [k, v] of Object.entries(localResponse.headers)) {
                resHead += `${k}: ${v}\r\n`;
              }
              resHead += `Content-Length: ${bodyBuf.length}\r\n\r\n`;
              clientSocket.write(resHead);
              clientSocket.write(bodyBuf);
            }
            return;
          }
        } else if (mapRule.type === 'remote' && mapRule.destinationUrl) {
          // Map Remote: rewrite target
          const newUrl = this.mapService.applyRemoteMapping(mapRule, fullUrl);
          console.log('[ProxyServer] Map Remote (HTTPS):', fullUrl, '->', newUrl);
          try {
            const newParsed = new URL(newUrl);
            hostname = newParsed.hostname;
            port = parseInt(newParsed.port) || 443;
            path = newParsed.pathname + newParsed.search;
            if (!mapRule.preserveHost) {
              outHeaders['host'] = newParsed.host;
            }
          } catch (e) {
            console.error('[ProxyServer] Invalid Map Remote URL:', newUrl);
          }
        }
      }
    }

    // Save request to database
    const capturedRequest: Omit<CapturedRequest, 'id'> = {
      timestamp: startTime,
      method: method,
      url: fullUrl,
      host: hostname,
      path: path,
      status: 0,
      requestHeaders: reqHeaders,
      requestBody: body.length > 0 ? body.toString('utf-8') : null,
      responseHeaders: {},
      responseBody: null,
      contentType: '',
      duration: 0,
      size: 0,
    };

    const requestId = this.storage.saveRequest(capturedRequest);
    this.emit('request', { ...capturedRequest, id: requestId });

    // Make HTTPS request to target server
    const options: https.RequestOptions = {
      hostname,
      port,
      path,
      method,
      headers: outHeaders,
      rejectUnauthorized: false,
      // Enhance upstream compatibility
      minVersion: 'TLSv1',
      maxVersion: 'TLSv1.3',
      ciphers: [
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'TLS_AES_128_GCM_SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-SHA384',
        'ECDHE-RSA-AES128-SHA256',
        'ECDHE-RSA-AES256-SHA',
        'ECDHE-RSA-AES128-SHA',
        'AES256-GCM-SHA384',
        'AES128-GCM-SHA256',
        'AES256-SHA256',
        'AES128-SHA256',
        'AES256-SHA',
        'AES128-SHA',
        'HIGH',
        '!aNULL',
        '!eNULL',
        '!EXPORT'
      ].join(':'),
    };

    const proxyReq = https.request(options, (proxyRes) => {
      const responseBody: Buffer[] = [];

      proxyRes.on('data', (chunk) => responseBody.push(chunk));

      proxyRes.on('end', async () => {
        const duration = Date.now() - startTime;
        // Keep original compressed body for forwarding to client
        const originalBodyBuffer = Buffer.concat(responseBody);
        const contentType = proxyRes.headers['content-type'] || '';
        const contentEncoding = proxyRes.headers['content-encoding'] || '';

        // Decompress a copy for database storage only
        let decompressedBuffer = originalBodyBuffer;
        try {
          if (contentEncoding === 'gzip') {
            decompressedBuffer = zlib.gunzipSync(originalBodyBuffer);
          } else if (contentEncoding === 'deflate') {
            decompressedBuffer = zlib.inflateSync(originalBodyBuffer);
          } else if (contentEncoding === 'br') {
            decompressedBuffer = zlib.brotliDecompressSync(originalBodyBuffer);
          }
        } catch (e) {
          console.error('[ProxyServer] Decompression error:', e);
          // Keep original buffer if decompression fails
          decompressedBuffer = originalBodyBuffer;
        }

        // Update database with decompressed content
        const maxSize = 5 * 1024 * 1024;
        let bodyStr: string | null = null;
        if (decompressedBuffer.length <= maxSize) {
          try {
            bodyStr = decompressedBuffer.toString('utf-8');
          } catch {
            bodyStr = '[Binary data]';
          }
        } else {
          bodyStr = `[Body too large: ${decompressedBuffer.length} bytes]`;
        }

        const resHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (typeof value === 'string') resHeaders[key] = value;
          else if (Array.isArray(value)) resHeaders[key] = value.join(', ');
        }

        this.storage.updateResponse(requestId, {
          status: proxyRes.statusCode || 0,
          responseHeaders: resHeaders,
          responseBody: bodyStr,
          contentType,
          duration,
          size: originalBodyBuffer.length, // Use original size
        });

        const completeRequest = this.storage.getRequestById(requestId);
        if (completeRequest) {
          this.emit('request:complete', completeRequest);
        }

        // Send response to client - use original compressed body
        // Check if socket is still writable
        if (!clientSocket.writable || clientSocket.destroyed) {
          console.error('[ProxyServer] Client socket is not writable, skipping response');
          return;
        }

        let responseHead = `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage || ''}\r\n`;
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          // Skip Transfer-Encoding header as we're sending complete body
          if (key.toLowerCase() === 'transfer-encoding') continue;
          if (typeof value === 'string') {
            responseHead += `${key}: ${value}\r\n`;
          } else if (Array.isArray(value)) {
            value.forEach(v => responseHead += `${key}: ${v}\r\n`);
          }
        }
        // Update Content-Length to match actual body size
        responseHead += `Content-Length: ${originalBodyBuffer.length}\r\n`;
        responseHead += '\r\n';

        try {
          clientSocket.write(responseHead);
          
          // Apply throttle stream if enabled
          const throttleStream = this.throttleService?.createThrottleStream('download', fullUrl);
          if (throttleStream) {
            // Write body through throttle stream
            throttleStream.pipe(clientSocket);
            throttleStream.write(originalBodyBuffer);
            throttleStream.end();
          } else {
            clientSocket.write(originalBodyBuffer);
          }
        } catch (err) {
          console.error('[ProxyServer] Error writing response to client:', err);
        }
      });
    });

    proxyReq.on('error', (err) => {
      console.error('[ProxyServer] HTTPS request error:', err.message);
      this.storage.updateResponse(requestId, {
        status: 502,
        responseHeaders: {},
        responseBody: err.message,
        contentType: 'text/plain',
        duration: Date.now() - startTime,
        size: 0,
      });

      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    });

    if (body.length > 0) {
      const uploadThrottle = this.throttleService?.createThrottleStream('upload', fullUrl);
      if (uploadThrottle) {
        uploadThrottle.pipe(proxyReq);
        uploadThrottle.write(body);
        uploadThrottle.end();
      } else {
        proxyReq.write(body);
        proxyReq.end();
      }
    } else {
      proxyReq.end();
    }
  }

  /**
   * Send mock response to HTTPS client
   */
  private sendMockResponseToHttpsClient(
    mockRule: any,
    startTime: number,
    fullUrl: string,
    hostname: string,
    path: string,
    method: string,
    reqHeaders: Record<string, string>,
    body: Buffer,
    clientSocket: tls.TLSSocket
  ): void {
    const mock = this.mockService!.generateMockResponse(mockRule);
    
    // Save mocked request
    const capturedRequest: Omit<CapturedRequest, 'id'> = {
      timestamp: startTime,
      method: method,
      url: fullUrl,
      host: hostname,
      path: path,
      status: mock.status,
      requestHeaders: reqHeaders,
      requestBody: body.length > 0 ? body.toString('utf-8') : null,
      responseHeaders: mock.headers,
      responseBody: mock.body,
      contentType: mock.headers['content-type'] || 'text/plain',
      duration: Date.now() - startTime + (mockRule.delay || 0),
      size: Buffer.byteLength(mock.body),
    };

    const requestId = this.storage.saveRequest(capturedRequest);
    const saved = this.storage.getRequestById(requestId);
    if (saved) {
      this.emit('request:complete', saved);
    }

    // Send mock response to client
    if (!clientSocket.writable || clientSocket.destroyed) {
      console.error('[ProxyServer] Client socket is not writable, skipping mock response');
      return;
    }

    let responseHead = `HTTP/1.1 ${mock.status} ${http.STATUS_CODES[mock.status] || 'OK'}\r\n`;
    for (const [key, value] of Object.entries(mock.headers)) {
      responseHead += `${key}: ${value}\r\n`;
    }
    const bodyBuffer = Buffer.from(mock.body);
    responseHead += `Content-Length: ${bodyBuffer.length}\r\n`;
    responseHead += '\r\n';

    try {
      clientSocket.write(responseHead);
      clientSocket.write(bodyBuffer);
    } catch (err) {
      console.error('[ProxyServer] Error writing mock response to HTTPS client:', err);
    }
  }

  /**
   * Handle proxy response
   */
  private handleProxyResponse(
    requestId: number,
    startTime: number,
    proxyRes: http.IncomingMessage,
    clientRes: http.ServerResponse,
    url?: string
  ): void {
    const responseBody: Buffer[] = [];

    proxyRes.on('data', (chunk) => responseBody.push(chunk));

    proxyRes.on('end', () => {
      const duration = Date.now() - startTime;
      let bodyBuffer = Buffer.concat(responseBody);
      const contentType = proxyRes.headers['content-type'] || '';
      const contentEncoding = proxyRes.headers['content-encoding'] || '';

      // Decompress if needed (for storage only, not forwarding)
      let decompressedBuffer = bodyBuffer;
      try {
        if (contentEncoding === 'gzip') {
          decompressedBuffer = zlib.gunzipSync(bodyBuffer);
        } else if (contentEncoding === 'deflate') {
          decompressedBuffer = zlib.inflateSync(bodyBuffer);
        } else if (contentEncoding === 'br') {
          decompressedBuffer = zlib.brotliDecompressSync(bodyBuffer);
        }
      } catch (e) {
        // Keep original if decompression fails
      }

      // Limit response body size
      const maxSize = 5 * 1024 * 1024; // 5MB
      let bodyStr: string | null = null;
      if (decompressedBuffer.length <= maxSize) {
        try {
          bodyStr = decompressedBuffer.toString('utf-8');
        } catch {
          bodyStr = '[Binary data]';
        }
      } else {
        bodyStr = `[Body too large: ${decompressedBuffer.length} bytes]`;
      }

      // Update database with response
      this.storage.updateResponse(requestId, {
        status: proxyRes.statusCode || 0,
        responseHeaders: this.headersToRecord(proxyRes.headers),
        responseBody: bodyStr,
        contentType,
        duration,
        size: bodyBuffer.length,
      });

      // Get complete request and emit
      const completeRequest = this.storage.getRequestById(requestId);
      if (completeRequest) {
        this.emit('request:complete', completeRequest);
      }
    });

    // Forward response to client
    clientRes.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    
    // Apply throttle stream if enabled
    const throttleStream = this.throttleService?.createThrottleStream('download', url);
    if (throttleStream) {
      proxyRes.pipe(throttleStream).pipe(clientRes);
    } else {
      proxyRes.pipe(clientRes);
    }
  }

  /**
   * Convert headers to Record<string, string>
   */
  private headersToRecord(headers: http.IncomingHttpHeaders): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') {
        result[key] = value;
      } else if (Array.isArray(value)) {
        result[key] = value.join(', ');
      }
    }
    return result;
  }
  
  /**
   * Handle WebSocket upgrade requests
   */
  private handleWebSocketUpgrade(clientReq: http.IncomingMessage, clientSocket: net.Socket, _head: Buffer): void {
    const requestUrl = clientReq.url || '';
    const startTime = Date.now();
    
    let parsedUrl: url.URL;
    try {
      parsedUrl = new url.URL(requestUrl);
    } catch {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    
    // Save WebSocket connection initiation
    const requestId = this.storage.saveRequest({
      method: 'WEBSOCKET',
      url: requestUrl,
      host: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      requestHeaders: this.headersToRecord(clientReq.headers),
      requestBody: '',
      timestamp: startTime,
      status: 0,
      responseHeaders: {},
      responseBody: null,
      contentType: 'websocket',
      duration: 0,
      size: 0,
    });
    
    // Establish connection to target WebSocket server
    const wsOptions: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: { ...clientReq.headers },
    };
    
    const targetRequest = http.request(wsOptions);
    
    targetRequest.on('upgrade', (targetRes, targetSocket, targetHead) => {
      // Forward upgrade response to client
      clientSocket.write('HTTP/1.1 101 Switching Protocols\r\n');
      for (const [key, value] of Object.entries(targetRes.headers)) {
        clientSocket.write(`${key}: ${value}\r\n`);
      }
      clientSocket.write('\r\n');
      clientSocket.write(targetHead);
      
      // Update storage with successful upgrade
      this.storage.updateResponse(requestId, {
        status: 101,
        responseHeaders: this.headersToRecord(targetRes.headers),
        responseBody: '[WebSocket Connection Established]',
        contentType: 'websocket',
        duration: Date.now() - startTime,
        size: 0,
      });
      
      const completeRequest = this.storage.getRequestById(requestId);
      if (completeRequest) {
        this.emit('request:complete', completeRequest);
      }
      
      // Track WebSocket frames (optional - can be extensive)
      let clientToServerFrames = 0;
      let serverToClientFrames = 0;
      
      // Pipe data bidirectionally
      targetSocket.on('data', (data) => {
        serverToClientFrames++;
        clientSocket.write(data);
      });
      
      clientSocket.on('data', (data) => {
        clientToServerFrames++;
        targetSocket.write(data);
      });
      
      // Handle closures
      const cleanup = () => {
        targetSocket.end();
        clientSocket.end();
        console.log(`[WebSocket] Closed ${parsedUrl.hostname} - C→S: ${clientToServerFrames}, S→C: ${serverToClientFrames}`);
      };
      
      targetSocket.on('end', cleanup);
      targetSocket.on('error', (err) => {
        console.error('[WebSocket] Target error:', err.message);
        cleanup();
      });
      
      clientSocket.on('end', cleanup);
      clientSocket.on('error', (err) => {
        console.error('[WebSocket] Client error:', err.message);
        cleanup();
      });
    });
    
    targetRequest.on('error', (err) => {
      console.error('[WebSocket] Upgrade error:', err.message);
      clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      
      this.storage.updateResponse(requestId, {
        status: 502,
        responseHeaders: {},
        responseBody: `WebSocket upgrade failed: ${err.message}`,
        contentType: 'text/plain',
        duration: Date.now() - startTime,
        size: 0,
      });
    });
    
    targetRequest.end();
  }
}
