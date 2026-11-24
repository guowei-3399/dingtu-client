import { createHash } from 'node:crypto';
import { isTunnelEnvironmentMode } from './environment-mode.mjs';
import { buildCleanChromeUserAgent, isNonPublicLocalUrl } from './oauth-browser-window.mjs';
import { buildWebSessionProfileScript, detectAuthorizedWebSession } from './oauth-account-flow.mjs';

export const BROWSER_APPLICATIONS = Object.freeze([
  { appId: 'claude', name: 'Claude', officialUrl: 'https://claude.com/' },
  { appId: 'chatgpt', name: 'ChatGPT', officialUrl: 'https://chatgpt.com/' },
  { appId: 'codex', name: 'Codex', officialUrl: 'https://chatgpt.com/codex' },
  { appId: 'grok', name: 'Grok', officialUrl: 'https://grok.com/' },
  { appId: 'gemini', name: 'Gemini', officialUrl: 'https://gemini.google.com/' },
  { appId: 'metamuse', name: 'Meta Muse', officialUrl: 'https://muse.ai/', defaultAppShell: true },
  { appId: 'manus', name: 'Manus', officialUrl: 'https://manus.im/', defaultAppShell: true },
  { appId: 'antigravity', name: 'Antigravity', officialUrl: 'https://antigravity.google/' },
  { appId: 'copilot', name: 'GitHub Copilot', officialUrl: 'https://github.com/features/copilot' },
  { appId: 'windsurf', name: 'Windsurf', officialUrl: 'https://windsurf.com/' },
  { appId: 'kiro', name: 'Kiro', officialUrl: 'https://kiro.dev/' },
  { appId: 'cursor', name: 'Cursor', officialUrl: 'https://cursor.com/' },
].map(Object.freeze));

export const ALLOWED_BROWSER_APP_IDS = Object.freeze(BROWSER_APPLICATIONS.map(app => app.appId));

const entries = new Map(BROWSER_APPLICATIONS.map(app => [app.appId, app]));
const fail = (code, message) => Object.assign(new Error(message), { code });
const inputError = () => fail('BROWSER_INPUT_INVALID', '隔离浏览器参数无效。');
const safeHttps = raw => {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password && !isNonPublicLocalUrl(raw);
  } catch {
    return false;
  }
};
const safeResource = raw => {
  try {
    const url = new URL(raw);
    return ['https:', 'wss:'].includes(url.protocol) && !url.username && !url.password && !isNonPublicLocalUrl(raw);
  } catch {
    return false;
  }
};
const safeTunnelProxyConfig = Object.freeze({ mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:17899', proxyBypassRules: '<-loopback>' });
const ownNetworkProxyConfig = Object.freeze({ mode: 'system' });

/**
 * Basic isolated-partition Chromium host for the Open-Source Learning Edition:
 * maintains persistent per-slot storage partitions and routes via 127.0.0.1:17899
 * in basic proxy mode (or OS network in own_network mode), without fingerprint spoofing.
 */
export function createIsolatedBrowserHost({
  BrowserWindow,
  session,
  isAuthenticated = () => false,
  isProxyReady = () => false,
  scopeProvider = () => null,
  environmentModeProvider = () => 'safe_tunnel',
  onAuthorizedSession = null,
  loadTimeoutMs = 12_000,
} = {}) {
  if (typeof BrowserWindow !== 'function' || typeof session?.fromPartition !== 'function'
    || typeof isAuthenticated !== 'function' || typeof isProxyReady !== 'function'
    || typeof scopeProvider !== 'function' || typeof environmentModeProvider !== 'function'
    || !Number.isSafeInteger(loadTimeoutMs) || loadTimeoutMs < 50 || loadTimeoutMs > 120_000) throw fail('BROWSER_CONFIGURATION_INVALID', '隔离浏览器配置无效。');
  const records = new Map();
  const downloadProtected = new WeakSet();
  let epoch = 0, currentScope = null, closeBarrier = Promise.resolve();

  function currentMode() {
    return environmentModeProvider() === 'own_network' ? 'own_network' : 'safe_tunnel';
  }
  function applySessionIdentity(ses) {
    const rawUa = typeof ses.getUserAgent === 'function' ? ses.getUserAgent() : '';
    const cleanUa = buildCleanChromeUserAgent(rawUa);
    if (typeof ses.setUserAgent === 'function') {
      ses.setUserAgent(cleanUa);
    }
    return { cleanUa };
  }
  function requireScope(expectedMode = currentMode()) {
    if (isAuthenticated() !== true) throw fail('AUTH_REQUIRED', '请先完成定途授权。');
    if (isTunnelEnvironmentMode(expectedMode) && isProxyReady() !== true) {
      throw fail('LOCAL_PROXY_NOT_READY', '本机 17899 代理尚未就绪。');
    }
    const scope = scopeProvider();
    if (typeof scope !== 'string' || !scope || scope.length > 512 || /[\u0000-\u001f\u007f]/.test(scope)) throw fail('AUTH_REQUIRED', '当前账号范围尚未就绪。');
    return scope;
  }
  function active(record) {
    try {
      return record.valid && record.epoch === epoch
        && currentMode() === record.mode
        && requireScope(record.mode) === record.scope;
    } catch {
      return false;
    }
  }
  function assertActive(record) {
    if (!active(record)) throw fail('BROWSER_SESSION_ENDED', '隔离浏览器会话已结束。');
  }
  function webPreferences(ses) {
    return { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
      preload: undefined, additionalArguments: [], plugins: false, experimentalFeatures: false };
  }
  function protectWindow(win, record) {
    record.windows.add(win);
    const { cleanUa } = applySessionIdentity(record.ses);
    win.webContents.setUserAgent?.(cleanUa);
    const checkNavigation = (event, raw) => {
      if (!active(record) || !safeHttps(raw)) event.preventDefault();
    };
    win.webContents.on('will-navigate', checkNavigation);
    win.webContents.on('will-redirect', checkNavigation);
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (!active(record) || (!safeHttps(url) && url !== 'about:blank') || record.windows.size >= 8) return { action: 'deny' };
      return {
        action: 'allow', outlivesOpener: false,
        overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: webPreferences(record.ses) },
        createWindow(options) {
          assertActive(record);
          const child = new BrowserWindow({ ...options, autoHideMenuBar: true, webPreferences: webPreferences(record.ses) });
          protectWindow(child, record);
          return child.webContents;
        },
      };
    });
    win.on('closed', () => { record.windows.delete(win); if (record.main === win) record.main = null; });
  }
  function configureSession(record) {
    const ses = record.ses;
    applySessionIdentity(ses);
    ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    if (!downloadProtected.has(ses)) {
      ses.on('will-download', event => event.preventDefault());
      downloadProtected.add(ses);
    }
    ses.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !active(record) || isNonPublicLocalUrl(details.url) || !safeResource(details.url) });
    });
    const targetProxy = isTunnelEnvironmentMode(record.mode) ? safeTunnelProxyConfig : ownNetworkProxyConfig;
    return (async () => {
      try {
        await ses.setProxy({ ...targetProxy });
        await ses.closeAllConnections();
      } catch { record.valid = false; throw fail('BROWSER_PROXY_FAILED', '隔离浏览器代理准备失败。'); }
      assertActive(record);
    })();
  }
  async function closeAll() {
    ++epoch;
    const pending = [];
    for (const record of records.values()) {
      record.valid = false;
      for (const win of [...record.windows]) { try { win.webContents.stop(); win.destroy(); } catch {} }
      try { pending.push(record.ses.closeAllConnections()); } catch {}
    }
    records.clear(); currentScope = null;
    const previous = closeBarrier;
    closeBarrier = Promise.allSettled([previous, ...pending]).then(() => {});
    await closeBarrier;
  }
  async function closeInstance(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some(key => !['appId', 'instanceId'].includes(key))
      || !entries.has(input.appId)
      || typeof input.instanceId !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(input.instanceId)) throw inputError();
    let closed = false;
    for (const [key, record] of records.entries()) {
      if (record.appId === input.appId && record.instanceId === input.instanceId) {
        record.valid = false;
        records.delete(key);
        for (const win of [...record.windows]) { try { win.webContents.stop(); win.destroy(); } catch {} }
        try { await record.ses.closeAllConnections(); } catch {}
        closed = true;
      }
    }
    return { appId: input.appId, instanceId: input.instanceId, status: closed ? 'closed' : 'not_found' };
  }
  function list() {
    const items = [];
    for (const record of records.values()) {
      if (!record.valid || !record.main || record.main.isDestroyed()) continue;
      items.push({
        appId: record.appId,
        name: record.appName,
        instanceId: record.instanceId,
        appShell: record.appShell,
        mode: record.mode,
        status: 'opened',
      });
    }
    return Object.freeze(items);
  }
  async function open(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['appId', 'instanceId', 'appShell'].includes(key))
      || !entries.has(input.appId) || typeof input.instanceId !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(input.instanceId)
      || (input.appShell !== undefined && typeof input.appShell !== 'boolean')) throw inputError();
    const mode = currentMode();
    const scope = requireScope(mode);
    if (currentScope !== null && currentScope !== scope) await closeAll();
    const startedEpoch = epoch;
    await closeBarrier;
    if (startedEpoch !== epoch || currentMode() !== mode || requireScope(mode) !== scope) throw fail('BROWSER_SESSION_ENDED', '隔离浏览器会话已结束。');
    currentScope = scope;
    const entry = entries.get(input.appId);
    const appShell = input.appShell !== undefined ? input.appShell : Boolean(entry.defaultAppShell);
    const partitionSlot = (
      input.instanceId === 'default'
      || input.instanceId === `${input.appId}-main`
      || input.instanceId === `${input.appId}-default`
    ) ? 'main' : input.instanceId;
    const partitionHash = createHash('sha256').update(JSON.stringify([scope, input.appId, partitionSlot])).digest('hex');
    const recordKey = `${mode}:${partitionHash}`;
    let record = records.get(recordKey);
    if (!record) {
      if (records.size >= 16) throw fail('BROWSER_LIMIT_REACHED', '打开的隔离浏览器实例已达到上限。');
      record = {
        scope, epoch, mode, appId: input.appId, appName: entry.name, instanceId: input.instanceId, appShell,
        valid: true, ses: session.fromPartition('persist:dingtu-browser-' + partitionHash),
        windows: new Set(), main: null, pending: null, lastCapturedDigest: null,
      };
      records.set(recordKey, record);
      record.ready = configureSession(record);
    }
    try { await record.ready; } catch (error) { if (records.get(recordKey) === record) records.delete(recordKey); throw error; }
    assertActive(record);
    applySessionIdentity(record.ses);
    const result = input.appShell !== undefined
      ? { appId: input.appId, instanceId: input.instanceId, appShell, status: 'opened' }
      : { appId: input.appId, instanceId: input.instanceId, status: 'opened' };
    if (record.pending) { await record.pending; assertActive(record); return result; }
    if (record.main && !record.main.isDestroyed()) { record.main.show(); record.main.focus(); return result; }
    const titlePrefix = mode === 'own_network'
      ? '定途 [自有网络]'
      : (appShell ? '定途容器' : '定途');
    const steadyTitle = `${titlePrefix} · ${entry.name} · ${input.instanceId}`;
    const loadingTitle = `${titlePrefix} · ${entry.name}（正在加载…）`;
    const win = new BrowserWindow({
      width: appShell ? 1280 : 1200,
      height: appShell ? 880 : 860,
      minWidth: 640,
      minHeight: 480,
      show: false,
      autoHideMenuBar: appShell,
      title: steadyTitle,
      webPreferences: webPreferences(record.ses),
    });
    function loadWithDeadline(targetUrl, timeoutMs = loadTimeoutMs) {
      return new Promise((resolve, reject) => {
        let settled = false;
        let committed = false;
        let timer = null;
        const cleanup = () => {
          if (timer !== null) { clearTimeout(timer); timer = null; }
          win.webContents.removeListener?.('dom-ready', onDomReady);
          win.webContents.removeListener?.('did-navigate', onCommit);
        };
        const finishOk = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        };
        const finishErr = err => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        };
        const onCommit = () => {
          committed = true;
          if (!win.isDestroyed?.()) win.setTitle?.(steadyTitle);
        };
        const onDomReady = () => {
          if (!win.isDestroyed?.()) win.setTitle?.(steadyTitle);
          finishOk();
        };
        win.webContents.once?.('did-navigate', onCommit);
        win.webContents.once?.('dom-ready', onDomReady);
        timer = setTimeout(() => {
          if (committed) finishOk();
          else finishErr(fail('BROWSER_LOAD_FAILED', '容器连接目标站点超时。'));
        }, timeoutMs);
        Promise.resolve().then(() => win.loadURL(targetUrl)).then(finishOk, finishErr);
      });
    }
    function attachSessionCaptureObserver(targetWin) {
      const webCaptureApps = new Set(['manus', 'metamuse', 'chatgpt', 'claude', 'grok', 'gemini']);
      if (typeof onAuthorizedSession !== 'function' || !webCaptureApps.has(record.appId) || typeof record.ses?.cookies?.get !== 'function') {
        return;
      }
      let captureTimer = null;
      let probing = false;
      const probe = async () => {
        if (probing || !active(record) || targetWin.isDestroyed?.()) return;
        probing = true;
        try {
          const allCookies = await record.ses.cookies.get({});
          const currentUrl = typeof targetWin.webContents?.getURL === 'function' ? targetWin.webContents.getURL() : '';
          const preCheck = detectAuthorizedWebSession({
            appId: record.appId,
            cookies: allCookies,
            currentUrl,
          });
          if (!preCheck) return;
          let profile = null;
          if (typeof targetWin.webContents?.executeJavaScript === 'function' && currentUrl && !currentUrl.startsWith('about:')) {
            try {
              profile = await Promise.race([
                targetWin.webContents.executeJavaScript(buildWebSessionProfileScript(record.appId), true),
                new Promise(r => setTimeout(() => r(null), 1800)),
              ]);
            } catch {}
          }
          const rawProfile = profile && typeof profile === 'object' ? profile : null;
          const profileEmail = typeof profile === 'string' ? profile.trim() : (rawProfile?.email || null);
          const detected = detectAuthorizedWebSession({
            appId: record.appId,
            cookies: allCookies,
            currentUrl,
            pageEmail: profileEmail || null,
          });
          if (!detected) return;
          const captureKey = `${detected.digest}:${detected.email || ''}:${rawProfile?.plan || ''}:${rawProfile?.usageData ? '1' : '0'}`;
          if (captureKey === record.lastCapturedDigest) return;
          record.lastCapturedDigest = captureKey;
          await onAuthorizedSession({
            appId: detected.appId,
            alias: partitionSlot,
            email: detected.email || profileEmail || null,
            label: detected.email || profileEmail || detected.label,
            plan: rawProfile?.plan || null,
            usageData: rawProfile?.usageData || null,
            cookieName: detected.cookieName,
            cookieValue: detected.cookieValue,
            extraMeta: {
              cookieHeader: detected.cookieHeader,
              capturedFrom: 'isolated-container',
            },
          });
        } catch {} finally {
          probing = false;
        }
      };
      targetWin.webContents.on?.('did-navigate', probe);
      targetWin.webContents.on?.('did-finish-load', probe);
      targetWin.webContents.on?.('did-navigate-in-page', probe);
      captureTimer = setInterval(probe, 3000);
      captureTimer.unref?.();
      targetWin.on?.('closed', () => {
        if (captureTimer) { clearInterval(captureTimer); captureTimer = null; }
      });
    }
    record.main = win; protectWindow(win, record);
    attachSessionCaptureObserver(win);
    record.pending = (async () => {
      try {
        if (!win.isDestroyed?.()) {
          win.setTitle?.(loadingTitle);
          win.show();
          win.focus?.();
        }
        await loadWithDeadline(entry.officialUrl, loadTimeoutMs); assertActive(record);
        if (!win.isDestroyed?.()) win.setTitle?.(steadyTitle);
      } catch (error) {
        try { win.webContents.stop(); win.destroy(); } catch {}
        if (error?.code === 'BROWSER_SESSION_ENDED') throw error;
        throw fail('BROWSER_LOAD_FAILED', '隔离浏览器加载失败，请检查定途连接。');
      }
    })();
    try { await record.pending; } finally { record.pending = null; }
    return result;
  }

  async function probeAccountSession(input = {}) {
    const rawApp = input?.appId === 'gemini-web' ? 'gemini' : input?.appId;
    if (!rawApp || !entries.has(rawApp)) return null;
    let scope;
    const mode = currentMode();
    try {
      scope = requireScope(mode);
    } catch {
      return null;
    }
    const rawInstanceId = typeof input?.instanceId === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(input.instanceId)
      ? input.instanceId
      : 'main';
    const partitionSlot = (
      rawInstanceId === 'default'
      || rawInstanceId === `${rawApp}-main`
      || rawInstanceId === `${rawApp}-default`
    ) ? 'main' : rawInstanceId;
    const partitionHash = createHash('sha256').update(JSON.stringify([scope, rawApp, partitionSlot])).digest('hex');
    const recordKey = `${mode}:${partitionHash}`;
    const openRecord = records.get(recordKey);

    if (openRecord?.valid && openRecord.main && !openRecord.main.isDestroyed() && typeof openRecord.main.webContents?.executeJavaScript === 'function') {
      try {
        const allCookies = typeof openRecord.ses?.cookies?.get === 'function' ? await openRecord.ses.cookies.get({}) : [];
        const currentUrl = typeof openRecord.main.webContents.getURL === 'function' ? openRecord.main.webContents.getURL() : '';
        const profile = await Promise.race([
          openRecord.main.webContents.executeJavaScript(buildWebSessionProfileScript(rawApp), true),
          new Promise(r => setTimeout(() => r(null), 2200)),
        ]);
        const detected = detectAuthorizedWebSession({
          appId: rawApp,
          cookies: allCookies,
          currentUrl,
          pageEmail: profile?.email || null,
        });
        if (profile?.email || profile?.usageData || profile?.sessionVerified || detected) {
          return {
            email: profile?.email || detected?.email || null,
            plan: profile?.plan || null,
            usageData: profile?.usageData || null,
            sessionVerified: Boolean(profile?.sessionVerified || profile?.email || profile?.usageData),
            usageStatus: Number(profile?.usageStatus) || 0,
            cookieName: detected?.cookieName || null,
            cookieValue: detected?.cookieValue || null,
            cookieHeader: detected?.cookieHeader || null,
          };
        }
      } catch {}
    }

    const ses = openRecord?.ses || session.fromPartition('persist:dingtu-browser-' + partitionHash);
    if (typeof ses?.cookies?.get !== 'function') return null;
    const { cleanUa } = applySessionIdentity(ses);
    try {
      const targetProxy = isTunnelEnvironmentMode(mode) ? safeTunnelProxyConfig : ownNetworkProxyConfig;
      await ses.setProxy?.({ ...targetProxy });
    } catch {}

    const allCookies = await ses.cookies.get({}).catch(() => []);
    const detected = detectAuthorizedWebSession({ appId: rawApp, cookies: allCookies });
    if (!detected) return null;

    let email = detected.email || null;
    let plan = null;
    let usageData = null;
    let sessionVerified = false;
    let usageStatus = 0;

    if (typeof ses.fetch === 'function') {
      const sesJson = async url => {
        try {
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), 4000);
          const r = await ses.fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
              Accept: 'application/json',
              'User-Agent': cleanUa,
              Referer: rawApp === 'claude' ? 'https://claude.ai/chats' : 'https://chatgpt.com/',
            },
            signal: ctl.signal,
          });
          clearTimeout(t);
          const data = r.ok ? await r.json().catch(() => null) : null;
          return { ok: r.ok, status: r.status, data };
        } catch {
          return { ok: false, status: 0, data: null };
        }
      };

      if (rawApp === 'claude') {
        const bootRes = await sesJson('https://claude.ai/api/bootstrap');
        const boot = bootRes.data;
        if (bootRes.ok && boot) sessionVerified = true;
        const acct = boot?.account || boot?.user || null;
        if (!email && typeof (acct?.email_address || acct?.email) === 'string') {
          email = (acct.email_address || acct.email).trim() || null;
        }
        let orgs = Array.isArray(acct?.memberships)
          ? acct.memberships.map(m => m?.organization).filter(Boolean)
          : (Array.isArray(boot?.organizations) ? boot.organizations : null);
        if (!orgs || !orgs.length) {
          const orgRes = await sesJson('https://claude.ai/api/organizations');
          if (orgRes.ok && Array.isArray(orgRes.data)) {
            sessionVerified = true;
            orgs = orgRes.data;
          }
        }
        if (Array.isArray(orgs) && orgs.length) {
          const org = orgs[0];
          const orgId = org?.uuid || org?.id;
          const tierRaw = String(org?.rate_limit_tier || (Array.isArray(org?.capabilities) ? org.capabilities.join(' ') : '')).toUpperCase();
          if (tierRaw.includes('MAX')) plan = 'MAX';
          else if (tierRaw.includes('PRO')) plan = 'PRO';
          else if (tierRaw.includes('TEAM') || tierRaw.includes('ENTERPRISE')) plan = 'TEAM';
          else if (tierRaw) plan = 'FREE';
          if (orgId) {
            const uRes = await sesJson(`https://claude.ai/api/organizations/${encodeURIComponent(orgId)}/usage`);
            usageStatus = uRes.status;
            if (uRes.ok && uRes.data) usageData = uRes.data;
          }
        }
      } else if (rawApp === 'chatgpt') {
        const [meRes, whamRes] = await Promise.all([
          sesJson('https://chatgpt.com/backend-api/me'),
          sesJson('https://chatgpt.com/backend-api/wham/usage'),
        ]);
        if (meRes.ok || whamRes.ok) sessionVerified = true;
        usageStatus = whamRes.status;
        if (!email && typeof meRes.data?.email === 'string') email = meRes.data.email.trim() || null;
        if (whamRes.ok && whamRes.data && typeof whamRes.data === 'object') {
          usageData = whamRes.data;
          if (typeof whamRes.data.plan_type === 'string' && whamRes.data.plan_type.trim()) plan = whamRes.data.plan_type.trim().toUpperCase().slice(0, 32);
        }
      }
    }

    if ((rawApp === 'claude' || rawApp === 'chatgpt') && (!email || (!usageData && usageStatus !== 200))) {
      let bgWin = null;
      try {
        bgWin = new BrowserWindow({
          width: 900,
          height: 680,
          show: false,
          webPreferences: webPreferences(ses),
        });
        bgWin.webContents.setUserAgent?.(cleanUa);
        const targetProbeUrl = rawApp === 'claude' ? 'https://claude.ai/chats' : 'https://chatgpt.com/';
        await Promise.race([
          bgWin.loadURL(targetProbeUrl),
          new Promise(r => setTimeout(r, 6000)),
        ]).catch(() => {});
        await new Promise(r => setTimeout(r, 350));
        if (typeof bgWin.webContents?.executeJavaScript === 'function') {
          const profile = await Promise.race([
            bgWin.webContents.executeJavaScript(buildWebSessionProfileScript(rawApp), true),
            new Promise(r => setTimeout(() => r(null), 3000)),
          ]);
          if (profile?.email) email = profile.email;
          if (profile?.plan) plan = profile.plan;
          if (profile?.usageData) usageData = profile.usageData;
          if (profile?.sessionVerified) sessionVerified = true;
          if (profile?.usageStatus) usageStatus = profile.usageStatus;
        }
      } catch {} finally {
        try { if (bgWin && !bgWin.isDestroyed?.()) bgWin.destroy(); } catch {}
      }
    }

    return {
      email,
      plan,
      usageData,
      sessionVerified: Boolean(sessionVerified || email || usageData),
      usageStatus,
      cookieName: detected.cookieName,
      cookieValue: detected.cookieValue,
      cookieHeader: detected.cookieHeader,
    };
  }

  return Object.freeze({ open, list, closeInstance, closeAll, probeAccountSession });
}
