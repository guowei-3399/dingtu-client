import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCleanChromeUserAgent,
  createInAppAuthBrowser,
  isAllowedAuthNavigation,
} from './oauth-browser-window.mjs';

function createMockElectron({ ua = 'Mozilla/5.0 Chrome/137.0.0.0 Electron/37.10.3 dingtu-desktop/0.2.0 定途/0.2.0 Safari/537.36', cookies = [] } = {}) {
  const sessions = new Map();
  const windows = [];

  class MockBrowserWindow {
    constructor(options) {
      this.options = options;
      this.destroyed = false;
      this.listeners = new Map();
      this.closedCount = 0;
      this.loadedUrls = [];
      const wcListeners = new Map();
      this.webContents = {
        userAgent: ua,
        webrtcPolicy: null,
        windowOpenHandler: null,
        cdpCalls: [],
        debugger: {
          attached: false,
          isAttached: () => this.webContents.debugger.attached,
          attach: () => { this.webContents.debugger.attached = true; },
          detach: () => { this.webContents.debugger.attached = false; },
          sendCommand: async (method, params) => { this.webContents.cdpCalls.push({ method, params }); return {}; },
        },
        setUserAgent: v => { this.webContents.userAgent = v; },
        setWebRTCIPHandlingPolicy: v => { this.webContents.webrtcPolicy = v; },
        setWindowOpenHandler: fn => { this.webContents.windowOpenHandler = fn; },
        on: (ev, fn) => {
          const arr = wcListeners.get(ev) || [];
          arr.push(fn);
          wcListeners.set(ev, arr);
        },
        emit: (ev, ...args) => {
          for (const fn of (wcListeners.get(ev) || [])) fn(...args);
        },
      };
      windows.push(this);
    }
    on(ev, fn) {
      const arr = this.listeners.get(ev) || [];
      arr.push(fn);
      this.listeners.set(ev, arr);
    }
    isDestroyed() { return this.destroyed; }
    async loadURL(url) { this.loadedUrls.push(url); }
    close() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.closedCount += 1;
      for (const fn of (this.listeners.get('closed') || [])) fn();
    }
  }

  const session = {
    fromPartition(partition) {
      let existing = sessions.get(partition);
      if (!existing) {
        const ev = new Map();
        existing = {
          partition,
          userAgent: ua,
          proxyCalls: [],
          closedConnections: 0,
          clearedStorage: 0,
          permRequest: null,
          permCheck: null,
          cookies: { get: async () => cookies },
          getUserAgent: () => existing.userAgent,
          setUserAgent: v => { existing.userAgent = v; },
          setProxy: async cfg => { existing.proxyCalls.push(cfg); },
          closeAllConnections: async () => { existing.closedConnections += 1; },
          clearStorageData: async () => { existing.clearedStorage += 1; },
          setPermissionRequestHandler: fn => { existing.permRequest = fn; },
          setPermissionCheckHandler: fn => { existing.permCheck = fn; },
          webRequest: {
            onBeforeRequest: fn => { existing.beforeRequest = fn; },
            onBeforeSendHeaders: fn => { existing.beforeSendHeaders = fn; },
          },
          on: (name, fn) => { ev.set(name, fn); },
        };
        sessions.set(partition, existing);
      }
      return existing;
    },
  };

  return { BrowserWindow: MockBrowserWindow, session, sessions, windows };
}

test('buildCleanChromeUserAgent and isAllowedAuthNavigation enforce Chrome UA and loopback-only HTTP', () => {
  const clean = buildCleanChromeUserAgent('Mozilla/5.0 dingtu-desktop/0.2.0 Electron/37.10.3 定途/0.2.0 Chrome/137.0.0.0 Safari/537.36');
  assert.doesNotMatch(clean, /Electron|dingtu-desktop|定途/);
  assert.match(clean, /Chrome\/137\.0\.0\.0/);
  assert.match(buildCleanChromeUserAgent(''), /Chrome\//);

  assert.equal(isAllowedAuthNavigation('https://accounts.google.com/o/oauth2/v2/auth'), true);
  assert.equal(isAllowedAuthNavigation('http://127.0.0.1:1455/auth/callback', ['http://127.0.0.1:1455']), true);
  assert.equal(isAllowedAuthNavigation('http://127.0.0.1:9999/auth/callback', ['http://127.0.0.1:1455']), false);
  assert.equal(isAllowedAuthNavigation('http://example.com/login', ['http://127.0.0.1:1455']), false);
  assert.equal(isAllowedAuthNavigation('file:///C:/Windows/win.ini'), false);
  assert.equal(isAllowedAuthNavigation('javascript:alert(1)'), false);
  assert.equal(isAllowedAuthNavigation('https://user:pass@accounts.google.com/'), false);
});

test('openOAuthWindow isolates sessions, sets 17899 proxy with loopback bypass, guards popups, and cleans up', async () => {
  const env = createMockElectron();
  let mode = 'safe_tunnel';
  let proxyReady = true;
  let userClosedCount = 0;

  const browser = createInAppAuthBrowser({
    BrowserWindow: env.BrowserWindow,
    session: env.session,
    environmentModeProvider: () => mode,
    proxyReadyProvider: () => proxyReady,
    exitGeoProvider: () => ({ countryCode: 'US', timezone: 'America/Los_Angeles', locale: 'en-US' }),
  });

  await assert.rejects(
    () => browser.openOAuthWindow({ url: 'http://127.0.0.1:5555/callback', allowedLoopbackOrigins: [] }),
    { code: 'BROWSER_URL_NOT_ALLOWED' },
  );

  const handle = await browser.openOAuthWindow({
    appId: 'codex',
    url: 'https://auth.openai.com/oauth/authorize',
    title: 'Codex OAuth 授权',
    allowedLoopbackOrigins: ['http://localhost:1455', 'http://127.0.0.1:1455'],
    useSafeTunnelProxy: true,
    onClosed: () => { userClosedCount += 1; },
  });
  assert.equal(handle.ok, true);
  assert.equal(env.windows.length, 1);

  const win = env.windows[0];
  const ses = [...env.sessions.values()][0];
  assert.equal(ses.partition.startsWith('persist:'), false);
  assert.deepEqual(ses.proxyCalls[0], {
    mode: 'fixed_servers',
    proxyRules: 'http://127.0.0.1:17899',
    proxyBypassRules: '127.0.0.1;localhost;[::1]',
  });
  assert.equal(win.options.webPreferences.sandbox, true);
  assert.equal(win.options.webPreferences.contextIsolation, true);
  assert.equal(win.options.webPreferences.nodeIntegration, false);
  assert.doesNotMatch(win.webContents.userAgent, /Electron|dingtu-desktop/);

  // Navigation guard permits allowed loopback & HTTPS, blocks non-allowlisted HTTP/file
  let blockedFile = false;
  win.webContents.emit('will-navigate', { preventDefault: () => { blockedFile = true; } }, 'file:///tmp/secret');
  assert.equal(blockedFile, true);

  let blockedLoopback = false;
  win.webContents.emit('will-redirect', { preventDefault: () => { blockedLoopback = true; } }, 'http://127.0.0.1:1455/auth/callback?code=abc');
  assert.equal(blockedLoopback, false);

  // webRequest port-scan guard allows allowlisted 1455 callback while blocking 7890/17899/LAN
  let dec;
  ses.beforeRequest({ url: 'http://127.0.0.1:1455/auth/callback?code=ok' }, x => { dec = x; });
  assert.deepEqual(dec, { cancel: false });
  ses.beforeRequest({ url: 'http://127.0.0.1:7890/' }, x => { dec = x; });
  assert.deepEqual(dec, { cancel: true });
  ses.beforeRequest({ url: 'https://192.168.1.1/' }, x => { dec = x; });
  assert.deepEqual(dec, { cancel: true });

  // Popup handler keeps SSO popups in-app using the same session
  assert.equal(win.webContents.windowOpenHandler({ url: 'file:///bad' }).action, 'deny');
  const popupDecision = win.webContents.windowOpenHandler({ url: 'https://accounts.google.com/o/oauth2' });
  assert.equal(popupDecision.action, 'allow');
  const childWc = popupDecision.createWindow({ width: 400, height: 500 });
  assert.ok(childWc);
  assert.equal(env.windows.length, 2);

  // Programmatic close() closes main & child windows, clears ephemeral storage, and does not invoke onClosed
  handle.close();
  assert.equal(env.windows[0].destroyed, true);
  assert.equal(env.windows[1].destroyed, true);
  assert.equal(ses.clearedStorage, 1);
  assert.equal(userClosedCount, 0);

  // System-proxy mode when useSafeTunnelProxy is false (Dingtu desktop PKCE login), plus user close triggers onClosed
  const authHandle = await browser.openOAuthWindow({
    appId: 'dingtu-auth',
    url: 'https://dingtu.noyapi.cn/api/v1/client/authorize',
    allowedLoopbackOrigins: ['http://127.0.0.1:49100'],
    useSafeTunnelProxy: false,
    onClosed: () => { userClosedCount += 1; },
  });
  const authSes = [...env.sessions.values()][1];
  assert.deepEqual(authSes.proxyCalls[0], { mode: 'system' });
  env.windows[2].close();
  assert.equal(userClosedCount, 1);
  authHandle.close();
});

test('openWebLoginWindow enforces HTTPS-only guard and captures matching session cookie', async () => {
  const env = createMockElectron({
    cookies: [{ domain: '.cursor.com', name: 'WorkosCursorSessionToken', value: 'user_1%3A%3Atok' }],
  });
  const browser = createInAppAuthBrowser({
    BrowserWindow: env.BrowserWindow,
    session: env.session,
    environmentModeProvider: () => 'own_network',
    proxyReadyProvider: () => false,
  });

  let captured = null;
  const handle = await browser.openWebLoginWindow({
    appId: 'cursor',
    url: 'https://authenticator.cursor.sh/',
    origins: ['https://cursor.com'],
    cookieNames: ['WorkosCursorSessionToken'],
    onCaptured: async payload => { captured = payload; },
  });
  env.windows[0].webContents.emit('did-finish-load');
  await new Promise(r => setTimeout(r, 20));
  assert.equal(captured?.cookieName, 'WorkosCursorSessionToken');
  assert.equal(captured?.cookieValue, 'user_1%3A%3Atok');
  handle.close();
});
