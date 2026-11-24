import crypto from 'node:crypto';
import { isTunnelEnvironmentMode } from './environment-mode.mjs';
import { buildWebSessionProfileScript, detectAuthorizedWebSession } from './oauth-account-flow.mjs';

const DEFAULT_CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const fail = (code, message) => Object.assign(new Error(message), { code });

/**
 * Strip Electron/app tokens from the Chromium User-Agent so upstream IdPs
 * (Google, OpenAI, GitHub, AWS Builder ID) accept standard browser navigation.
 */
export function buildCleanChromeUserAgent(rawUa) {
  if (typeof rawUa !== 'string' || !rawUa.trim()) return DEFAULT_CHROME_UA;
  const cleaned = rawUa
    .replace(/\s*Electron\/[^\s]+/gi, '')
    .replace(/\s*dingtu-desktop\/[^\s]+/gi, '')
    .replace(/\s*定途\/[^\s]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || DEFAULT_CHROME_UA;
}

function normalizeLoopbackOrigins(allowedLoopbackOrigins) {
  const result = new Set();
  if (!allowedLoopbackOrigins) return result;
  for (const item of allowedLoopbackOrigins) {
    if (typeof item !== 'string' || !item.trim()) continue;
    try {
      const parsed = new URL(item.trim());
      if (parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
        result.add(parsed.origin.toLowerCase());
      }
    } catch {}
  }
  return result;
}

function isLocalOrPrivateIpv4Host(rawHost) {
  const parts = rawHost.split('.');
  if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return false;
  const [a, b] = parts.map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function isNonPublicLocalUrl(rawUrl, allowedLoopbackOrigins = []) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return true;
  let parsed;
  try { parsed = new URL(rawUrl.trim()); } catch { return true; }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) return true;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isLocal = LOOPBACK_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.local') || isLocalOrPrivateIpv4Host(host);
  if (!isLocal) return false;
  if (parsed.protocol === 'http:') {
    const allowedSet = allowedLoopbackOrigins instanceof Set ? allowedLoopbackOrigins : normalizeLoopbackOrigins(allowedLoopbackOrigins);
    if (allowedSet.has(parsed.origin.toLowerCase())) return false;
  }
  return true;
}

/**
 * Permit HTTPS public URLs and explicitly allowlisted loopback HTTP redirect origins without embedded credentials.
 */
export function isAllowedAuthNavigation(rawUrl, allowedLoopbackOrigins = []) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  if (parsed.protocol === 'https:') {
    return !isNonPublicLocalUrl(rawUrl, []);
  }
  if (parsed.protocol !== 'http:') return false;
  if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) return false;
  const allowedSet = allowedLoopbackOrigins instanceof Set
    ? allowedLoopbackOrigins
    : normalizeLoopbackOrigins(allowedLoopbackOrigins);
  return allowedSet.has(parsed.origin.toLowerCase());
}

/**
 * Manage ephemeral in-app Electron BrowserWindows for basic OAuth & Web Login connectivity.
 */
export function createInAppAuthBrowser({
  BrowserWindow,
  session,
  getParentWindow = () => null,
  environmentModeProvider = () => 'safe_tunnel',
  proxyReadyProvider = () => false,
  iconPath = null,
} = {}) {
  if (typeof BrowserWindow !== 'function' || typeof session?.fromPartition !== 'function') {
    throw fail('BROWSER_CONFIGURATION_INVALID', '内置授权浏览器配置无效。');
  }

  async function createBasicSession({ appId = 'oauth', partitionPrefix = 'dingtu-oauth', useSafeTunnelProxy = true, allowedLoopbackOrigins = [] } = {}) {
    const safeApp = String(appId || 'oauth').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'oauth';
    const partition = `${partitionPrefix}-${safeApp}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const authSession = session.fromPartition(partition);
    const cleanUa = buildCleanChromeUserAgent(authSession.getUserAgent?.());
    const loopbackSet = allowedLoopbackOrigins instanceof Set
      ? allowedLoopbackOrigins
      : normalizeLoopbackOrigins(allowedLoopbackOrigins);

    const proxied = Boolean(
      useSafeTunnelProxy
      && isTunnelEnvironmentMode(environmentModeProvider())
      && proxyReadyProvider() === true,
    );

    authSession.setUserAgent?.(cleanUa);
    authSession.setPermissionRequestHandler?.((_wc, _perm, callback) => callback(false));
    authSession.setPermissionCheckHandler?.(() => false);
    authSession.on?.('will-download', event => event.preventDefault());
    authSession.webRequest?.onBeforeRequest?.((details, callback) => {
      callback({ cancel: isNonPublicLocalUrl(details.url, loopbackSet) });
    });

    if (proxied) {
      await authSession.setProxy?.({
        mode: 'fixed_servers',
        proxyRules: 'http://127.0.0.1:17899',
        proxyBypassRules: '127.0.0.1;localhost;[::1]',
      });
    } else {
      await authSession.setProxy?.({ mode: 'system' });
    }
    await authSession.closeAllConnections?.();

    const webPreferences = {
      session: authSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      preload: undefined,
      additionalArguments: [],
      plugins: false,
      experimentalFeatures: false,
    };

    return { authSession, cleanUa, proxied, webPreferences };
  }

  function attachWindowGuards(targetWin, { cleanUa, loopbackSet, childWindows, webPreferences }) {
    const wc = targetWin?.webContents;
    if (!wc) return;
    wc.setUserAgent?.(cleanUa);

    const blockDisallowed = (event, rawUrl) => {
      if (!isAllowedAuthNavigation(rawUrl, loopbackSet)) event.preventDefault();
    };
    wc.on?.('will-navigate', blockDisallowed);
    wc.on?.('will-redirect', blockDisallowed);

    wc.setWindowOpenHandler?.(({ url: popupUrl }) => {
      const allowedBlank = popupUrl === 'about:blank' || !popupUrl;
      if ((!allowedBlank && !isAllowedAuthNavigation(popupUrl, loopbackSet)) || childWindows.size >= 6) {
        return { action: 'deny' };
      }
      return {
        action: 'allow',
        outlivesOpener: false,
        overrideBrowserWindowOptions: {
          width: 540,
          height: 720,
          autoHideMenuBar: true,
          ...(iconPath ? { icon: iconPath } : {}),
          webPreferences,
        },
        createWindow(options) {
          const childWin = new BrowserWindow({
            ...options,
            autoHideMenuBar: true,
            ...(iconPath ? { icon: iconPath } : {}),
            webPreferences,
          });
          childWindows.add(childWin);
          childWin.on?.('closed', () => childWindows.delete(childWin));
          attachWindowGuards(childWin, { cleanUa, loopbackSet, childWindows, webPreferences });
          return childWin.webContents;
        },
      };
    });
  }

  function resolveParentWindow() {
    try {
      const candidate = getParentWindow();
      return candidate && !candidate.isDestroyed?.() ? candidate : undefined;
    } catch {
      return undefined;
    }
  }

  async function openOAuthWindow({
    appId = 'oauth',
    url,
    title = 'OAuth 授权登录',
    allowedLoopbackOrigins = [],
    useSafeTunnelProxy = true,
    onClosed = null,
  } = {}) {
    const loopbackSet = normalizeLoopbackOrigins(allowedLoopbackOrigins);
    if (!isAllowedAuthNavigation(url, loopbackSet)) {
      throw fail('BROWSER_URL_NOT_ALLOWED', '该内置授权地址不被允许。');
    }

    const { authSession, cleanUa, webPreferences } = await createBasicSession({
      appId,
      partitionPrefix: 'dingtu-oauth',
      useSafeTunnelProxy,
      allowedLoopbackOrigins: loopbackSet,
    });
    const parent = resolveParentWindow();
    const win = new BrowserWindow({
      width: 560,
      height: 760,
      title,
      autoHideMenuBar: true,
      ...(iconPath ? { icon: iconPath } : {}),
      ...(parent ? { parent } : {}),
      webPreferences,
    });

    const childWindows = new Set();
    let closedByCaller = false;
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      for (const cw of [...childWindows]) {
        try { if (!cw.isDestroyed?.()) cw.close(); } catch {}
      }
      childWindows.clear();
      authSession.clearStorageData?.().catch(() => {});
    };

    attachWindowGuards(win, { cleanUa, loopbackSet, childWindows, webPreferences });

    win.on?.('closed', () => {
      const userClosed = !closedByCaller;
      cleanup();
      if (userClosed) {
        try { onClosed?.(); } catch {}
      }
    });

    try {
      await win.loadURL(url);
    } catch (err) {
      if (err?.code !== 'ERR_ABORTED' && err?.errno !== -3) {
        closedByCaller = true;
        try { if (!win.isDestroyed?.()) win.close(); } catch {}
        cleanup();
        throw fail('AUTH_BROWSER_OPEN_FAILED', '无法加载内置授权页面。');
      }
    }

    return Object.freeze({
      ok: true,
      close: () => {
        closedByCaller = true;
        if (!win.isDestroyed?.()) {
          win.close();
        } else {
          cleanup();
        }
      },
    });
  }

  async function openWebLoginWindow({
    appId,
    url,
    origins = [],
    cookieNames = [],
    onCaptured,
    onClosed,
  } = {}) {
    const loopbackSet = new Set();
    if (!isAllowedAuthNavigation(url, loopbackSet)) {
      throw fail('BROWSER_URL_NOT_ALLOWED', '该内置登录地址不被允许。');
    }

    const { authSession, cleanUa, webPreferences } = await createBasicSession({
      appId,
      partitionPrefix: 'dingtu-weblogin',
      useSafeTunnelProxy: true,
    });
    const parent = resolveParentWindow();
    const win = new BrowserWindow({
      width: 540,
      height: 760,
      title: `登录 ${appId || '应用'}`,
      autoHideMenuBar: true,
      ...(iconPath ? { icon: iconPath } : {}),
      ...(parent ? { parent } : {}),
      webPreferences,
    });

    const childWindows = new Set();
    let finished = false;
    let timer = null;

    const cleanup = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      for (const cw of [...childWindows]) {
        try { if (!cw.isDestroyed?.()) cw.close(); } catch {}
      }
      childWindows.clear();
      authSession.clearStorageData?.().catch(() => {});
    };

    attachWindowGuards(win, { cleanUa, loopbackSet, childWindows, webPreferences });

    const checkCookies = async () => {
      if (finished || win.isDestroyed?.()) return;
      try {
        const allCookies = await authSession.cookies.get({});
        const currentUrl = typeof win.webContents?.getURL === 'function' ? win.webContents.getURL() : url;
        const preCheck = detectAuthorizedWebSession({
          appId,
          cookies: allCookies,
          currentUrl,
          origins,
          cookieNames,
        });
        if (!preCheck) return;
        let profile = null;
        if (typeof win.webContents?.executeJavaScript === 'function') {
          try {
            profile = await Promise.race([
              win.webContents.executeJavaScript(buildWebSessionProfileScript(appId), true),
              new Promise(r => setTimeout(() => r(null), 1600)),
            ]);
          } catch {}
        }
        const detected = detectAuthorizedWebSession({
          appId,
          cookies: allCookies,
          currentUrl,
          pageEmail: profile?.email || null,
          origins,
          cookieNames,
        });
        if (!detected) return;
        finished = true;
        if (timer) { clearInterval(timer); timer = null; }
        await onCaptured?.({
          cookieName: detected.cookieName,
          cookieValue: detected.cookieValue,
          email: detected.email || profile?.email || null,
          label: detected.email || profile?.email || (profile?.name ? `${appId} · ${profile.name}` : detected.label),
          plan: profile?.plan || null,
          usageData: profile?.usageData || null,
          extraMeta: { cookieHeader: detected.cookieHeader },
        });
        if (!win.isDestroyed?.()) win.close();
      } catch {}
    };

    timer = setInterval(checkCookies, 1500);
    timer.unref?.();
    win.webContents?.on?.('did-finish-load', checkCookies);
    win.webContents?.on?.('did-navigate', checkCookies);
    win.webContents?.on?.('did-frame-finish-load', checkCookies);

    win.on?.('closed', () => {
      cleanup();
      if (!finished) {
        finished = true;
        try { onClosed?.(); } catch {}
      }
    });

    try {
      await win.loadURL(url);
    } catch (err) {
      if (err?.code !== 'ERR_ABORTED' && err?.errno !== -3) {
        finished = true;
        try { if (!win.isDestroyed?.()) win.close(); } catch {}
        cleanup();
        throw fail('AUTH_BROWSER_OPEN_FAILED', '无法加载内置登录页面。');
      }
    }

    return Object.freeze({
      ok: true,
      close: () => {
        finished = true;
        cleanup();
        if (!win.isDestroyed?.()) win.close();
      },
    });
  }

  return Object.freeze({
    openOAuthWindow,
    openWebLoginWindow,
  });
}
