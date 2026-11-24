import { app, BrowserWindow, clipboard, dialog, session, ipcMain, safeStorage, powerMonitor, shell } from 'electron';
import net from 'node:net';
import path from 'node:path';
import { existsSync, openSync, writeFileSync, readFileSync, closeSync, unlinkSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPreloadArguments, resolvePortalUrl, resolveSingBoxBinary } from './runtime-contract.mjs';
import { createControlClient } from './control-client.mjs';
import { loadProductionTrust } from './production-trust.mjs';
import { createProductionTunnelClient } from './production-tunnel.mjs';
import { createProductionProxyController } from './production-proxy.mjs';
import { createDeviceAuthHost } from './device-auth.mjs';
import { createDeviceSessionStore } from './device-session-store.mjs';
import { createElectronDeviceSessionBackend } from './electron-device-session-store.mjs';
import { matchesDesktopUrl, registerDesktopIpc } from './desktop-ipc.mjs';
import { createAppLauncher } from './app-launcher.mjs';
import { createAppProcessRestarter } from './app-process-restarter.mjs';
import { createAgentInstanceHost } from './agent-instance-host.mjs';
import { createLocalProxySupervisor } from './local-proxy.mjs';
import { createAuthAuditLogger } from './auth-audit.mjs';
import { createIsolatedBrowserHost } from './isolated-browser.mjs';
import { createEnvironmentModeController, isTunnelEnvironmentMode } from './environment-mode.mjs';
import { createRelayDirectoryCache } from './relay-directory.mjs';
import { createConcurrencyPolicy } from './concurrency-policy.mjs';
import { createWorkbenchAccountManager } from './workbench-accounts.mjs';
import { createOAuthAccountFlowManager } from './oauth-account-flow.mjs';
import { createInAppAuthBrowser } from './oauth-browser-window.mjs';
import { createExternalOAuthBrowser } from './external-oauth-browser.mjs';
import { createLocalUsageScanner } from './local-usage-scanner.mjs';
import { createWakeupScheduler } from './wakeup-scheduler.mjs';
import { createTelemetrySyncer } from './telemetry-sync.mjs';
import { projectClientRead } from './client-projection.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const portalUrl = resolvePortalUrl(process.env.NOYA_PORTAL_URL || (app.isPackaged ? 'https://dingtu.noyapi.cn/assistant/' : 'http://127.0.0.1:4174/assistant/'), { production: app.isPackaged || process.env.NODE_ENV === 'production' });
const localPortalUrl = pathToFileURL(path.join(here, 'index.html')).toString();
const preloadArguments = buildPreloadArguments({
  platform: process.platform,
  apiBase: process.env.NOYA_API_BASE || '',
  localProxyPort: process.env.NOYA_LOCAL_PROXY_PORT,
  production: app.isPackaged || process.env.NODE_ENV === 'production',
});
let authHost;
let agentHost;
let localProxy;
let mainWindow = null;
let unregisterDesktopIpc = null;
let proxyController = null;
let isolatedBrowser = null;
let environmentController = null;
let relayDirectoryCache = null;
let concurrencyPolicy = null;
let workbenchAccounts = null;
let oauthFlowManager = null;
let externalOAuthBrowser = null;
let localUsageScanner = null;
let wakeupScheduler = null;
let telemetrySyncer = null;
let authAudit;

const userDataDir = app.getPath('userData');
const instanceLockPath = path.join(userDataDir, 'dingtu-instance.lock');
let instanceLockFd = null;
let activationServer = null;
let singleInstanceLock = app.requestSingleInstanceLock();
function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
function readInstanceRecord() {
  try { const value = JSON.parse(readFileSync(instanceLockPath, 'utf8')); return value && Number.isInteger(value.pid) && Number.isInteger(value.port) ? value : null; } catch { return null; }
}
function pidIsAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function acquireInstanceFileLock() {
  mkdirSync(userDataDir, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { instanceLockFd = openSync(instanceLockPath, 'wx'); writeFileSync(instanceLockFd, JSON.stringify({ pid: process.pid, port: 0 })); return true; }
    catch (error) {
      if (error?.code !== 'EEXIST') return false;
      const record = readInstanceRecord();
      if (record?.pid && record.pid !== process.pid && pidIsAlive(record.pid)) return false;
      try { unlinkSync(instanceLockPath); } catch {}
    }
  }
  return false;
}
function publishActivationPort(port) {
  try { writeFileSync(instanceLockPath, JSON.stringify({ pid: process.pid, port })); } catch {}
}
async function startActivationServer() {
  await new Promise((resolve, reject) => {
    activationServer = net.createServer(socket => { socket.on('data', () => focusMainWindow()); socket.end('ok'); });
    activationServer.once('error', reject);
    activationServer.listen(0, '127.0.0.1', () => { activationServer.removeListener('error', reject); publishActivationPort(activationServer.address().port); resolve(); });
  });
}
async function activateExistingInstance() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const record = readInstanceRecord();
    if (record?.port > 0) {
      const sent = await new Promise(resolve => { const socket = net.createConnection({ host: '127.0.0.1', port: record.port }, () => { socket.end('activate'); resolve(true); }); socket.once('error', () => resolve(false)); });
      if (sent) return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}
function releaseInstanceFileLock() {
  try { activationServer?.close(); } catch {}
  if (instanceLockFd !== null) { try { closeSync(instanceLockFd); } catch {} instanceLockFd = null; }
  try { const record = readInstanceRecord(); if (record?.pid === process.pid) unlinkSync(instanceLockPath); } catch {}
}
let instanceOwner = singleInstanceLock ? acquireInstanceFileLock() : false;
if (singleInstanceLock && instanceOwner) app.on('second-instance', focusMainWindow);

async function ensureLocksForLaunch() {
  return singleInstanceLock && instanceOwner;
}

async function createWindow() {
  const win = new BrowserWindow({
    show: false,
    width: 1280, height: 860, minWidth: 960, minHeight: 640,
    backgroundColor: '#f5f6fb',
    icon: path.join(here, 'assets/branding/dingtu-round-transparent.png'),
    webPreferences: { preload: path.join(here, 'preload.cjs'), additionalArguments: [...preloadArguments], contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
  });
  mainWindow = win;
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, raw) => { if (!matchesDesktopUrl(raw, localPortalUrl)) event.preventDefault(); });
  if (!authHost) {
    const baseUrl = process.env.NOYA_API_BASE || new URL(portalUrl).origin;
    const backend = createElectronDeviceSessionBackend({ platform: process.platform, safeStorage,
      filePath: path.join(app.getPath('userData'), 'noya-device-session-v1.bin') });
    const store = createDeviceSessionStore({ platform: process.platform, backend, key: 'Noya/DeviceSession/v1' });
    authAudit = createAuthAuditLogger({ directory: app.getPath('logs') });
    relayDirectoryCache = createRelayDirectoryCache();
    environmentController = createEnvironmentModeController({
      initialMode: 'safe_tunnel',
      stopTunnel: () => (proxyController?.stopAndWait ? proxyController.stopAndWait() : proxyController?.stop?.()),
      closeBrowsers: () => isolatedBrowser?.closeAll(),
      onAudit: authAudit.write,
    });
    localProxy = createLocalProxySupervisor({
      onStateChange: value => {
        try { proxyController?.notifyProxyStateChange?.(value); } catch {}
        try { telemetrySyncer?.notifyProxyStateChange?.(value); } catch {}
        if (value.state !== 'running' && isTunnelEnvironmentMode(environmentController?.getMode())) {
          void isolatedBrowser?.closeAll();
        }
      },
    });
    const inAppAuthBrowser = createInAppAuthBrowser({
      BrowserWindow,
      session,
      getParentWindow: () => mainWindow,
      environmentModeProvider: () => environmentController?.getMode?.() || 'safe_tunnel',
      proxyReadyProvider: () => localProxy?.status?.().state === 'running',
      iconPath: path.join(here, 'assets/branding/dingtu-round-transparent.png'),
    });
    authHost = createDeviceAuthHost({ platform: ({ win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform]), appVersion: app.getVersion(), deviceName: '定途桌面端', store,
      createClient: options => createControlClient({ baseUrl, production: app.isPackaged || process.env.NODE_ENV === 'production', ...options }),
      openExternal: async url => {
        const allowedLoopbackOrigins = [];
        try {
          const redirectUri = new URL(url).searchParams.get('redirect_uri');
          if (redirectUri) allowedLoopbackOrigins.push(new URL(redirectUri).origin);
        } catch {}
        if (!app.isPackaged) {
          try { allowedLoopbackOrigins.push(new URL(baseUrl).origin); } catch {}
        }
        return await inAppAuthBrowser.openOAuthWindow({
          appId: 'dingtu-auth',
          url,
          title: '定途账号授权登录',
          allowedLoopbackOrigins,
          useSafeTunnelProxy: false,
          onClosed: () => { void authHost?.cancelLogin?.(); },
        });
      },
      onAudit: authAudit.write,
      onTelemetryEvent: payload => { try { telemetrySyncer?.recordEvent?.(payload); } catch {} },
      onLatencySample: sample => { try { telemetrySyncer?.recordLatencySample?.(sample); } catch {} },
      onSessionInvalid: () => { relayDirectoryCache?.clear(); concurrencyPolicy?.clear(); environmentController?.updateExitGeo(null); proxyController?.stop(); telemetrySyncer?.notifyProxyStateChange?.({ state: 'stopped' }); },
      onSessionRefreshed: () => { proxyController?.notifySessionRefreshed(); telemetrySyncer?.notifySessionReady?.(); } });
    concurrencyPolicy = createConcurrencyPolicy({
      resolveCustomerType: async () => {
        const me = projectClientRead('me', await authHost.read('me', {}));
        return me.user.customerType;
      },
    });
    const runtimeDir = app.isPackaged
      ? path.join(process.resourcesPath, 'sing-box')
      : path.join(here, '..', 'runtime', 'sing-box');
    const runtimeBinary = resolveSingBoxBinary({ runtimeDir, platform: process.platform, arch: process.arch });
    const runtimeConfig = path.join(app.getPath('userData'), 'noya-sing-box-runtime.json');
    proxyController = createProductionProxyController({
      auth: authHost, proxy: localProxy, binary: runtimeBinary, configPath: runtimeConfig,
      hasBinary: candidate => Boolean(candidate) && existsSync(candidate),
      closeBrowsers: () => {
        if (isTunnelEnvironmentMode(environmentController?.getMode())) return isolatedBrowser?.closeAll();
        return undefined;
      },
      onAudit: authAudit.write,
      onTelemetryEvent: payload => { try { telemetrySyncer?.recordEvent?.(payload); } catch {} },
      onLatencySample: sample => { try { telemetrySyncer?.recordLatencySample?.(sample); } catch {} },
      onOriginResolved: info => {
        try {
          telemetrySyncer?.setActiveOrigin?.(info);
          void telemetrySyncer?.runLatencyProbe?.({
            trigger: 'connect',
            originHost: info?.originHost || null,
            originIp: info?.originIp || null,
            originPort: info?.originPort || 443,
            dnsMs: info?.dnsMs ?? null,
          }).catch(() => {});
        } catch {}
      },
      loadTransport() {
        const trustPath = path.join(here, 'assets/production-trust.json');
        const trust = loadProductionTrust(trustPath);
        return createProductionTunnelClient({ origin: trust.origin, trustedKeys: trust.keys });
      },
    });
    const launcher = createAppLauncher({ platform: process.platform });
    const processRestarter = createAppProcessRestarter({ platform: process.platform });
    agentHost = createAgentInstanceHost({
      platform: ({ win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform]),
      launcher,
      isAuthenticated: () => authHost.snapshot().status === 'authenticated',
      isProxyReady: () => localProxy.status().state === 'running',
      environmentModeProvider: () => environmentController.getMode(),
      relayResolver: relayId => relayDirectoryCache.resolveActiveRelay(relayId),
      scopeProvider: () => authHost.snapshot().device?.id ?? null,
      profileRootDir: app.getPath('userData'),
    });
    isolatedBrowser = createIsolatedBrowserHost({
      BrowserWindow, session,
      isAuthenticated: () => authHost.snapshot().status === 'authenticated',
      isProxyReady: () => localProxy.status().state === 'running',
      scopeProvider: () => authHost.snapshot().device?.id,
      environmentModeProvider: () => environmentController.getMode(),
      onAuthorizedSession: async payload => {
        if (!workbenchAccounts || typeof workbenchAccounts.upsertAuthorizedAccount !== 'function') return;
        const saved = await workbenchAccounts.upsertAuthorizedAccount({
          appId: payload.appId,
          alias: payload.alias || 'main',
          email: payload.email || null,
          label: payload.label || '',
          plan: payload.plan || null,
          usageData: payload.usageData || null,
          quotaState: payload.usageData ? 'synced' : 'container_ready',
          source: 'isolated-container',
          extraMeta: {
            cookieName: payload.cookieName || null,
            sessionCookie: payload.cookieValue || null,
            ...(payload.extraMeta || {}),
          },
        });
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('noya:accounts-updated', {
            appId: payload.appId,
            accountId: saved?.id || payload.alias || 'main',
          });
        }
      },
    });

    workbenchAccounts = createWorkbenchAccountManager({
      platform: ({ win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform]),
      filePath: path.join(app.getPath('userData'), 'dingtu-workbench-accounts-v1.bin'),
      safeStorage,
      launcher,
      environmentModeProvider: () => environmentController.getMode(),
      proxyUrlProvider: () => localProxy.status().state === 'running' ? 'http://127.0.0.1:17899' : null,
      webSessionProber: opts => isolatedBrowser.probeAccountSession(opts),
    });
    externalOAuthBrowser = createExternalOAuthBrowser({
      environmentModeProvider: () => environmentController.getMode(),
      proxyReadyProvider: () => localProxy.status().state === 'running',
      openExternalFallback: url => shell.openExternal(url),
    });
    oauthFlowManager = createOAuthAccountFlowManager({
      openOAuthWindow: opts => externalOAuthBrowser.openOAuthWindow(opts),
      openWebLoginWindow: opts => inAppAuthBrowser.openWebLoginWindow(opts),
      environmentModeProvider: () => environmentController.getMode(),
      proxyUrlProvider: () => localProxy.status().state === 'running' ? 'http://127.0.0.1:17899' : null,
      onAccountAuthorized: payload => workbenchAccounts.upsertAuthorizedAccount(payload),
    });
    localUsageScanner = createLocalUsageScanner();
    wakeupScheduler = createWakeupScheduler({
      filePath: path.join(app.getPath('userData'), 'dingtu-wakeup-tasks-v1.bin'),
      safeStorage,
      onRunTask: async task => {
        await workbenchAccounts.refreshQuota({
          appId: task.appId,
          ...(task.accountId ? { accountId: task.accountId } : {}),
        });
        const list = await workbenchAccounts.list(task.appId);
        const total = Array.isArray(list?.accounts) ? list.accounts.length : 0;
        return { ok: true, message: `${task.appId} 已刷新 ${total} 个账号配额` };
      },
    });
    wakeupScheduler.start(60_000);
    telemetrySyncer = createTelemetrySyncer({
      usageScanner: localUsageScanner,
      authHost,
      environment: environmentController,
      proxy: proxyController,
      accounts: workbenchAccounts,
      platform: ({ win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform] || 'windows'),
      appVersion: app.getVersion(),
    });
    telemetrySyncer.start(15 * 60_000);
    const pickDirectory = async ({ appId } = {}) => {
      const res = await dialog.showOpenDialog(mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined, {
        title: `选择 ${appId || '应用'} 本地数据目录`,
        properties: ['openDirectory'],
      });
      return res.canceled || !res.filePaths?.[0] ? null : res.filePaths[0];
    };
    // Accept the packaged local renderer and the configured assistant origin.
    unregisterDesktopIpc = registerDesktopIpc({
      ipcMain, getWindow: () => mainWindow, portalUrl: [localPortalUrl, portalUrl],
      host: authHost, agents: agentHost, proxy: proxyController,
      browser: isolatedBrowser, environment: environmentController,
      relayCache: relayDirectoryCache, concurrency: concurrencyPolicy,
      accounts: workbenchAccounts,
      oauth: oauthFlowManager,
      usageScanner: localUsageScanner,
      wakeup: wakeupScheduler,
      pickDirectory,
      telemetry: telemetrySyncer,
      processRestarter,
      writeClipboardText: text => clipboard.writeText(String(text || '')),
      onAudit: authAudit.write,
    });
  }
  // Always ship and load the reviewed renderer.
  await win.loadURL(localPortalUrl);
}

app.whenReady().then(async () => {
  const ownsLocks = await ensureLocksForLaunch();
  if (!ownsLocks) {
    if (!instanceOwner) await activateExistingInstance();
    app.quit();
    return;
  }
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowClipboardWrite = permission === 'clipboard-sanitized-write'
      && Boolean(mainWindow && !mainWindow.isDestroyed() && webContents === mainWindow.webContents && matchesDesktopUrl(webContents.getURL(), localPortalUrl));
    callback(allowClipboardWrite);
  });
  await startActivationServer();
  await createWindow();
  powerMonitor?.on?.('suspend', () => {
    try { telemetrySyncer?.notifySystemSuspend?.(); } catch {}
  });
  powerMonitor?.on?.('resume', () => {
    try { telemetrySyncer?.notifySystemResume?.(); } catch {}
    try { proxyController?.notifySystemResume?.({ force: true }); } catch {}
  });
  powerMonitor?.on?.('unlock-screen', () => {
    try { proxyController?.notifySystemResume?.({ force: false }); } catch {}
  });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => {
  if (!singleInstanceLock || !instanceOwner) return;
  releaseInstanceFileLock();
  try { telemetrySyncer?.dispose?.(); } catch {}
  try { wakeupScheduler?.dispose?.(); } catch {}
  try { oauthFlowManager?.dispose?.(); } catch {}
  try { externalOAuthBrowser?.dispose?.(); } catch {}
  try { proxyController?.stop(); } catch {}
  try { isolatedBrowser?.closeAll(); } catch {}
  try { localProxy?.stop(); } catch {}
  try { unregisterDesktopIpc?.(); } catch {}
  try { authHost?.close?.(); } catch {}
});
