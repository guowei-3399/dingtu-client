import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createIsolatedBrowserHost, BROWSER_APPLICATIONS } from './isolated-browser.mjs';

function fixture() {
  const events = [], sessions = new Map(), windows = [];
  let authenticated = true, proxyReady = true, scope = 'customer-one/device-one';
  class Contents extends EventEmitter {
    setWindowOpenHandler(fn) { this.openHandler = fn; }
    setWebRTCIPHandlingPolicy(value) { this.rtc = value; }
    stop() { this.stopped = true; }
  }
  class Window extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = new Contents(); this.destroyed = false; windows.push(this); events.push('window'); }
    async loadURL(url) { this.url = url; events.push('load'); }
    show() { this.shown = true; }
    focus() { this.focused = true; }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  const session = { fromPartition(partition) {
    if (!sessions.has(partition)) {
      const ses = new EventEmitter();
      ses.partition = partition;
      ses.webRequest = { onBeforeRequest(fn) { ses.requestHandler = fn; } };
      ses.setProxy = async options => { ses.proxy = options; events.push('proxy'); };
      ses.closeAllConnections = async () => { events.push('close-connections'); };
      ses.setPermissionRequestHandler = fn => { ses.permission = fn; };
      ses.setPermissionCheckHandler = fn => { ses.permissionCheck = fn; };
      sessions.set(partition, ses);
    }
    return sessions.get(partition);
  } };
  const host = createIsolatedBrowserHost({ BrowserWindow: Window, session, isAuthenticated: () => authenticated, isProxyReady: () => proxyReady, scopeProvider: () => scope });
  return { host, events, windows, sessions, setAuth: value => { authenticated = value; }, setProxy: value => { proxyReady = value; }, setScope: value => { scope = value; } };
}

test('browser applies fixed 17899 proxy before opening a fixed official entry', async () => {
  const f = fixture();
  const result = await f.host.open({ appId: 'claude', instanceId: 'claude1' });
  const win = f.windows[0], ses = win.options.webPreferences.session;
  assert.deepEqual(result, { appId: 'claude', instanceId: 'claude1', status: 'opened' });
  assert.equal(win.url, 'https://claude.com/');
  assert.ok(f.events.indexOf('proxy') < f.events.indexOf('window'));
  assert.deepEqual(ses.proxy, { mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:17899', proxyBypassRules: '<-loopback>' });
  assert.equal(win.options.webPreferences.nodeIntegration, false);
  assert.equal(win.options.webPreferences.sandbox, true);
  assert.equal(win.options.webPreferences.contextIsolation, true);
  assert.equal(win.options.webPreferences.preload, undefined);
  assert.ok(!JSON.stringify(result).includes('customer-one'));
});

test('account authorization popups retain the instance session and never inherit preload or Node', async () => {
  const f = fixture();
  await f.host.open({ appId: 'chatgpt', instanceId: 'gpt1' });
  const first = f.windows[0], ses = first.options.webPreferences.session;
  const rule = first.webContents.openHandler({ url: 'https://auth.openai.com/authorize?state=private' });
  assert.equal(rule.action, 'allow');
  const contents = rule.createWindow({ width: 700, webPreferences: { preload: 'evil.cjs', nodeIntegration: true } });
  const popup = f.windows[1];
  assert.equal(contents, popup.webContents);
  assert.equal(popup.options.webPreferences.session, ses);
  assert.equal(popup.options.webPreferences.preload, undefined);
  assert.equal(popup.options.webPreferences.nodeIntegration, false);
  for (const url of ['http://example.com/', 'file:///C:/private', 'javascript:alert(1)', 'https://user:password@example.com/']) assert.equal(popup.webContents.openHandler({ url }).action, 'deny');
});

test('every instance and account has an independent persistent storage partition', async () => {
  const f = fixture();
  await f.host.open({ appId: 'claude', instanceId: 'cc1' });
  const firstSession = f.windows[0].options.webPreferences.session;
  await f.host.open({ appId: 'claude', instanceId: 'cc2' });
  assert.notEqual(f.windows[1].options.webPreferences.session, firstSession);
  f.setScope('customer-two/device-two');
  await f.host.open({ appId: 'claude', instanceId: 'cc1' });
  assert.notEqual(f.windows[2].options.webPreferences.session, firstSession);
  for (const partition of f.sessions.keys()) assert.match(partition, /^persist:dingtu-browser-[0-9a-f]{64}$/);
});

test('unauthorized or unavailable proxy prevents browser launch and pending request traffic', async () => {
  const f = fixture(); f.setAuth(false);
  await assert.rejects(f.host.open({ appId: 'claude', instanceId: 'cc1' }), { code: 'AUTH_REQUIRED' });
  f.setAuth(true); f.setProxy(false);
  await assert.rejects(f.host.open({ appId: 'claude', instanceId: 'cc1' }), { code: 'LOCAL_PROXY_NOT_READY' });
  assert.equal(f.windows.length, 0);
  f.setProxy(true); await f.host.open({ appId: 'claude', instanceId: 'cc1' });
  const ses = f.windows[0].options.webPreferences.session;
  const check = url => { let decision; ses.requestHandler({ url }, x => { decision = x; }); return decision; };
  assert.deepEqual(check('https://claude.ai/api'), { cancel: false });
  assert.deepEqual(check('wss://claude.ai/stream'), { cancel: false });
  assert.deepEqual(check('http://127.0.0.1/private'), { cancel: true });
  f.setProxy(false);
  assert.deepEqual(check('https://claude.ai/api'), { cancel: true });
  assert.equal(f.windows[0].webContents.openHandler({ url: 'https://auth.example.com/' }).action, 'deny');
});

test('stop and logout close all windows and cancel pending work even if auth flags lag', async () => {
  const f = fixture();
  await f.host.open({ appId: 'claude', instanceId: 'cc1' });
  const main = f.windows[0], ses = main.options.webPreferences.session;
  main.webContents.openHandler({ url: 'https://auth.example.com/' }).createWindow({});
  await f.host.closeAll();
  assert.ok(f.windows.every(win => win.destroyed));
  let decision; ses.requestHandler({ url: 'https://claude.ai/api' }, x => { decision = x; });
  assert.deepEqual(decision, { cancel: true });
  assert.equal(main.webContents.openHandler({ url: 'https://auth.example.com/' }).action, 'deny');
});

test('browser refuses renderer URLs, unsupported applications and malformed names', async () => {
  const f = fixture();
  for (const value of [{ appId: 'claude', instanceId: 'cc1', url: 'https://evil.example/' }, { appId: 'unknown', instanceId: 'cc1' }, { appId: 'claude', instanceId: '../cc1' }, { appId: 'claude', instanceId: 'cc1', proxy: 'DIRECT' }]) await assert.rejects(f.host.open(value), { code: 'BROWSER_INPUT_INVALID' });
  assert.equal(f.windows.length, 0);
  assert.ok(BROWSER_APPLICATIONS.some(app => app.appId === 'codex'));
});

test('browser blocks native permissions, downloads and non-HTTPS navigations', async () => {
  const f = fixture(); await f.host.open({ appId: 'grok', instanceId: 'grok1' });
  const win = f.windows[0], ses = win.options.webPreferences.session;
  let allowed; ses.permission(null, 'media', value => { allowed = value; });
  assert.equal(allowed, false); assert.equal(ses.permissionCheck(), false);
  let prevented = false; const event = { preventDefault() { prevented = true; } };
  win.webContents.emit('will-navigate', event, 'file:///C:/private'); assert.equal(prevented, true);
  prevented = false; ses.emit('will-download', event); assert.equal(prevented, true);
});

test('proxy configuration failure never creates a partially protected window', async () => {
  const f = fixture();
  // Create an inert session using a first successful launch, then force reconfiguration failure.
  await f.host.open({ appId: 'gemini', instanceId: 'gemini1' }); await f.host.closeAll();
  const ses = f.windows[0].options.webPreferences.session;
  ses.setProxy = async () => { throw new Error('private connection detail'); };
  await assert.rejects(f.host.open({ appId: 'gemini', instanceId: 'gemini1' }), { code: 'BROWSER_PROXY_FAILED', message: '隔离浏览器代理准备失败。' });
  assert.equal(f.windows.length, 1);
});

test('closing while proxy initialization is pending invalidates the launch before any new window exists', async () => {
  const f = fixture();
  await f.host.open({ appId: 'claude', instanceId: 'cc1' }); await f.host.closeAll();
  const ses = f.windows[0].options.webPreferences.session;
  let release, started;
  const preparing = new Promise(resolve => { started = resolve; });
  ses.setProxy = () => { started(); return new Promise(resolve => { release = resolve; }); };
  const opening = f.host.open({ appId: 'claude', instanceId: 'cc1' });
  const assertion = assert.rejects(opening, { code: 'BROWSER_SESSION_ENDED' });
  await preparing; await f.host.closeAll(); release(); await assertion;
  assert.equal(f.windows.length, 1);
  assert.equal(f.windows[0].destroyed, true);
});

test('reopening an instance reuses only its own account storage and does not accumulate download listeners', async () => {
  const f = fixture();
  await f.host.open({ appId: 'claude', instanceId: 'cc1' });
  const ses = f.windows[0].options.webPreferences.session;
  await f.host.open({ appId: 'claude', instanceId: 'cc1' });
  assert.equal(f.windows.length, 1);
  assert.equal(f.windows[0].focused, true);
  await f.host.closeAll(); await f.host.open({ appId: 'claude', instanceId: 'cc1' });
  assert.equal(f.windows.length, 2);
  assert.equal(f.windows[1].options.webPreferences.session, ses);
  assert.equal(ses.listenerCount('will-download'), 1);
});

test('stalled upstream page load times out cleanly and destroys the hidden window instead of hanging forever', async () => {
  const windows = [];
  class Contents extends EventEmitter {
    setWindowOpenHandler() {}
    setWebRTCIPHandlingPolicy() {}
    stop() { this.stopped = true; }
  }
  class StalledWindow extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = new Contents(); this.destroyed = false; windows.push(this); }
    loadURL() { return new Promise(() => {}); }
    show() { this.shown = true; }
    focus() {}
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  const session = {
    fromPartition() {
      const ses = new EventEmitter();
      ses.webRequest = { onBeforeRequest() {} };
      ses.setProxy = async () => {};
      ses.closeAllConnections = async () => {};
      ses.setPermissionRequestHandler = () => {};
      ses.setPermissionCheckHandler = () => {};
      return ses;
    },
  };
  const host = createIsolatedBrowserHost({
    BrowserWindow: StalledWindow,
    session,
    isAuthenticated: () => true,
    isProxyReady: () => true,
    scopeProvider: () => 'scope-timeout',
    loadTimeoutMs: 80,
  });
  await assert.rejects(host.open({ appId: 'metamuse', instanceId: 'main' }), { code: 'BROWSER_LOAD_FAILED' });
  assert.equal(windows.length, 1);
  assert.equal(windows[0].destroyed, true);
  assert.equal(windows[0].webContents.stopped, true);
});

test('isolated-browser strips Electron UA, enforces en-US headers, shows window immediately before navigation, captures Manus session, and runs checkFingerprint', async () => {
  const events = [];
  const sessions = new Map();
  const windows = [];
  const capturedSessions = [];
  let cookiesToReturn = [];
  const defaultUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Electron/37.10.3 dingtu-desktop/0.2.0 Chrome/137.0.0.0 Safari/537.36';

  class Contents extends EventEmitter {
    constructor() {
      super();
      this.ua = '';
      this.cdpCalls = [];
      this.debugger = {
        attached: false,
        isAttached: () => this.debugger.attached,
        attach: () => { this.debugger.attached = true; },
        sendCommand: async (method, params) => { this.cdpCalls.push({ method, params }); return {}; },
      };
    }
    setUserAgent(v) { this.ua = v; }
    setWindowOpenHandler(fn) { this.openHandler = fn; }
    setWebRTCIPHandlingPolicy(value) { this.rtc = value; }
    getURL() { return 'https://manus.im/app'; }
    async executeJavaScript(src) {
      if (src.includes('__NEXT_DATA__')) return 'manus-test@example.com';
      return {
        timezone: 'America/Los_Angeles',
        locale: 'en-US',
        languages: ['en-US', 'en'],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/137.0.0.0 Safari/537.36',
      };
    }
    stop() { this.stopped = true; }
  }
  class Window extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = new Contents(); this.destroyed = false; this.title = options.title; windows.push(this); }
    setTitle(t) { this.title = t; }
    show() { events.push(`show:${windows.indexOf(this)}`); this.shown = true; }
    focus() { this.focused = true; }
    async loadURL(url) {
      events.push(`load:${windows.indexOf(this)}:${url}`);
      this.url = url;
      if (url === 'https://manus.im/') {
        this.webContents.emit('did-finish-load');
      }
    }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }

  const session = {
    fromPartition(partition) {
      if (!sessions.has(partition)) {
        const ses = new EventEmitter();
        ses.partition = partition;
        ses.userAgentArgs = [];
        ses.getUserAgent = () => defaultUa;
        ses.setUserAgent = (ua, acceptLang) => { ses.userAgentArgs.push({ ua, acceptLang }); };
        ses.cookies = { get: async () => cookiesToReturn };
        ses.webRequest = {
          onBeforeRequest(fn) { ses.requestHandler = fn; },
          onBeforeSendHeaders(fn) { ses.beforeSendHeaders = fn; },
        };
        ses.setProxy = async options => { ses.proxy = options; };
        ses.closeAllConnections = async () => {};
        ses.setPermissionRequestHandler = () => {};
        ses.setPermissionCheckHandler = () => {};
        ses.clearStorageData = async () => {};
        sessions.set(partition, ses);
      }
      return sessions.get(partition);
    },
  };

  const host = createIsolatedBrowserHost({
    BrowserWindow: Window,
    session,
    isAuthenticated: () => true,
    isProxyReady: () => true,
    scopeProvider: () => 'dev-1',
    exitGeoProvider: () => ({ countryCode: 'US', timezone: 'America/Los_Angeles', locale: 'en-US' }),
    onAuthorizedSession: async payload => { capturedSessions.push(payload); },
  });

  cookiesToReturn = [{ domain: '.manus.im', name: 'session_id', value: 'manus_secret_session_value_1234' }];
  await host.open({ appId: 'manus', instanceId: 'main' });
  await new Promise(r => setTimeout(r, 20));

  const mainWin = windows[0];
  const ses = mainWin.options.webPreferences.session;
  assert.doesNotMatch(ses.userAgentArgs[0].ua, /Electron|dingtu-desktop/);

  // Localhost / LAN port-scan blocker cancels 7890, 17899, localhost, [::1], and RFC1918 targets
  for (const scanUrl of ['http://127.0.0.1:7890/', 'https://127.0.0.1:17899/', 'wss://localhost:7890/', 'https://[::1]:7890/', 'https://192.168.1.1/', 'https://10.0.0.1/', 'https://169.254.169.254/']) {
    let dec;
    ses.requestHandler({ url: scanUrl }, x => { dec = x; });
    assert.deepEqual(dec, { cancel: true }, `Expected local/LAN scan URL blocked: ${scanUrl}`);
  }

  // Window is shown right after about:blank prewarm BEFORE external navigation finishes
  assert.ok(events.indexOf('show:0') >= 0 && events.indexOf('show:0') < events.indexOf('load:0:https://manus.im/'));

  // Session cookie captured automatically on persistent Manus login
  assert.equal(capturedSessions.length, 1);
  assert.equal(capturedSessions[0].appId, 'manus');
  assert.equal(capturedSessions[0].email, 'manus-test@example.com');

  // Popup attaches same persistent session without preload or Node integration
  const rule = mainWin.webContents.openHandler({ url: 'https://auth.meta.com/login' });
  rule.createWindow({ width: 500 });
  const popup = windows[1];
  await new Promise(r => setTimeout(r, 20));
  assert.equal(popup.options.webPreferences.session, ses);
  assert.equal(popup.options.webPreferences.nodeIntegration, false);
});
