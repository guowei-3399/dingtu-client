import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { isTunnelEnvironmentMode } from './environment-mode.mjs';

const fail = (code, message = code) => Object.assign(new Error(message), { code });
const failHttp = (code, message, res) => Object.assign(new Error(message), {
  code,
  status: Number(res?.status) || 0,
  upstreamData: res?.data ?? null,
});

export const ANTIGRAVITY_OAUTH_CLIENT_ID = process.env.DINGTU_ANTIGRAVITY_OAUTH_CLIENT_ID || 'configure-antigravity-oauth-client-id';
export const ANTIGRAVITY_OAUTH_CLIENT_SECRET = process.env.DINGTU_ANTIGRAVITY_OAUTH_CLIENT_SECRET || '';
export const GEMINI_CLI_OAUTH_CLIENT_ID = process.env.DINGTU_GEMINI_CLI_OAUTH_CLIENT_ID || 'configure-gemini-cli-oauth-client-id';
export const GEMINI_CLI_OAUTH_CLIENT_SECRET = process.env.DINGTU_GEMINI_CLI_OAUTH_CLIENT_SECRET || '';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
export const CLOUD_CODE_ENDPOINTS = Object.freeze([
  'https://daily-cloudcode-pa.googleapis.com',
  'https://cloudcode-pa.googleapis.com',
]);
export function buildCloudCodeUserAgent(platform = process.platform, arch = process.arch) {
  const osType = platform === 'darwin' ? 'darwin' : platform === 'linux' ? 'linux' : 'windows';
  const archType = arch === 'arm64' || arch === 'aarch64' ? 'arm64' : 'amd64';
  return `antigravity/2.25.0 (aidev_client; os_type=${osType}; arch=${archType}; cl=1003475615)`;
}
export function buildLoadCodeAssistUserAgent(platform = process.platform, arch = process.arch) {
  const osType = platform === 'darwin' ? 'darwin' : platform === 'linux' ? 'linux' : 'windows';
  const archType = arch === 'arm64' || arch === 'aarch64' ? 'arm64' : 'amd64';
  return `antigravity/2.25.0 ${osType}/${archType} google-api-nodejs-client/10.3.0`;
}
export const CLOUD_CODE_USER_AGENT = buildCloudCodeUserAgent();
export const LOAD_CODE_ASSIST_USER_AGENT = buildLoadCodeAssistUserAgent();
export const LOAD_CODE_ASSIST_X_GOOG_API_CLIENT = 'gl-node/22.21.1';
export const ANTIGRAVITY_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
  'https://www.googleapis.com/auth/aicode',
]);
export const GEMINI_CLI_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]);

export const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
export const GITHUB_OAUTH_TOKEN_URL = 'https://github.com/login/oauth/access_token';
export const GITHUB_USER_URL = 'https://api.github.com/user';
export const COPILOT_VSCODE_CLIENT_ID = 'Iv1.b507a08c87ecfe98';

export const CODEX_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const CODEX_AUTH_URL = 'https://auth.openai.com/oauth/authorize';
export const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token';

export const CLAUDE_CODE_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
export const CLAUDE_CODE_TOKEN_URLS = Object.freeze([
  'https://platform.claude.com/v1/oauth/token',
  'https://console.anthropic.com/v1/oauth/token',
]);

export const KIRO_START_URL = 'https://view.awsapps.com/start';
export const KIRO_DEFAULT_REGION = 'us-east-1';

export const WEB_LOGIN_TARGETS = Object.freeze({
  'claude-desktop': Object.freeze({
    url: 'https://claude.ai/login',
    origins: ['https://claude.ai'],
    cookieNames: ['sessionKey'],
    labelPrefix: 'Claude Desktop',
  }),
  claude: Object.freeze({
    url: 'https://claude.ai/login',
    origins: ['https://claude.ai', 'https://claude.com'],
    cookieNames: ['sessionKey'],
    labelPrefix: 'Claude Web',
  }),
  cursor: Object.freeze({
    url: 'https://cursor.com/dashboard',
    origins: ['https://cursor.com', 'https://www.cursor.com'],
    cookieNames: ['WorkosCursorSessionToken'],
    labelPrefix: 'Cursor',
  }),
  windsurf: Object.freeze({
    url: 'https://windsurf.com/profile',
    origins: ['https://windsurf.com', 'https://codeium.com'],
    cookieNames: ['__session', 'codeium_session', 'windsurf_session'],
    labelPrefix: 'Windsurf',
  }),
  chatgpt: Object.freeze({
    url: 'https://chatgpt.com/',
    origins: ['https://chatgpt.com', 'https://chat.openai.com'],
    cookieNames: ['__Secure-next-auth.session-token', '__Secure-next-auth.session-token.0'],
    labelPrefix: 'ChatGPT',
  }),
  grok: Object.freeze({
    url: 'https://grok.com/',
    origins: ['https://grok.com', 'https://accounts.x.ai'],
    cookieNames: ['sso', 'sso-rw'],
    labelPrefix: 'Grok',
  }),
  'grok-cli': Object.freeze({
    url: 'https://grok.com/',
    origins: ['https://grok.com', 'https://accounts.x.ai'],
    cookieNames: ['sso', 'sso-rw'],
    labelPrefix: 'Grok CLI',
  }),
  manus: Object.freeze({
    url: 'https://manus.im/',
    origins: ['https://manus.im', 'https://api.manus.im', 'https://app.manus.im'],
    cookieNames: ['session_id', 'session', 'manus_session', 'auth_token', 'access_token', '__Secure-next-auth.session-token', '__Host-next-auth.session-token', 'token', 'jwt', 'uid'],
    allowAnyAuthCookie: true,
    labelPrefix: 'Manus',
  }),
  metamuse: Object.freeze({
    url: 'https://muse.ai/',
    origins: ['https://muse.ai', 'https://www.muse.ai', 'https://api.muse.ai'],
    cookieNames: ['sessionid', 'session', 'c_user', 'xs', 'access_token', 'auth_token', '__Secure-next-auth.session-token', 'muse_session'],
    allowAnyAuthCookie: true,
    labelPrefix: 'Meta Muse',
  }),
  'gemini-web': Object.freeze({
    url: 'https://gemini.google.com/',
    origins: ['https://gemini.google.com', 'https://google.com'],
    cookieNames: ['__Secure-1PSID', '__Secure-3PSID', 'SID'],
    labelPrefix: 'Gemini Web',
  }),
});

const TRACKING_OR_CDN_COOKIE_PATTERN = /^(?:_ga|_gid|_gat|_fbp|_fbc|__cf_bm|cf_clearance|_cfuvid|__cfruid|__cflb|locale|lang|language|theme|csrf|xsrf|g_state|nid|aec|socs|consent|optanon|amplitude|sentry|ph_|mp_|ajs_|intercom-)/i;
const AUTH_LIKE_COOKIE_PATTERN = /^(?:__session|__client|__client_uat|session|session_id|sessionid|_manus_session|manus_session|_muse_session|muse_session|access_token|auth_token|id_token|token|jwt|c_user|xs|uid|sb-[a-z0-9-]+-auth-token.*)$|(?:session|auth_token|auth-token|clerk|next-auth)/i;
const LOGIN_PAGE_URL_PATTERN = /^https?:\/\/(?:accounts\.google\.com|auth\.meta\.com|login\.microsoftonline\.com)\b/i;

function isUnauthenticatedLoginUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  if (LOGIN_PAGE_URL_PATTERN.test(rawUrl.trim())) return true;
  try {
    const parsed = new URL(rawUrl.trim());
    return /^\/(?:login|signin|sign-in|auth|oauth)(?:\/|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function cookieMatchesOrigins(cookieDomain, originHosts) {
  const host = String(cookieDomain || '').replace(/^\./, '').toLowerCase();
  if (!host) return false;
  return originHosts.some(oh => host === oh || oh.endsWith(`.${host}`) || host.endsWith(`.${oh}`));
}

function validCleanEmail(candidate) {
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return /^[^\s@]{1,64}@[^\s@]{1,120}\.[^\s@]{2,}$/.test(trimmed) ? trimmed : null;
}

/**
 * Generates a read-only, same-origin in-page script to extract user email, plan tier, and usage buckets
 * inside an authenticated isolated browser / Web Login window (bypassing external Cloudflare blocks).
 */
export function buildWebSessionProfileScript(appId = '') {
  const safeApp = JSON.stringify(String(appId || ''));
  return `(async () => {
    const appId = ${safeApp};
    const out = { email: null, name: null, plan: null, usageData: null, sessionVerified: false, usageStatus: 0 };
    const cleanEmail = v => (typeof v === 'string' && /^[^\\s@]{1,64}@[^\\s@]{1,120}\\.[^\\s@]{2,}$/.test(v.trim()) ? v.trim() : null);
    const jsonGetWithStatus = async p => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 1600);
        const r = await fetch(p, { credentials: 'include', headers: { Accept: 'application/json' }, signal: ctl.signal });
        clearTimeout(t);
        const data = r.ok ? await r.json().catch(() => null) : null;
        return { ok: r.ok, status: r.status, data };
      } catch {
        return { ok: false, status: 0, data: null };
      }
    };
    try {
      const host = String(location.hostname || '').toLowerCase();
      if ((appId === 'claude' || appId === 'claude-desktop') && host.endsWith('claude.ai')) {
        const bootRes = await jsonGetWithStatus('/api/bootstrap');
        const boot = bootRes.data;
        if (bootRes.ok && boot) out.sessionVerified = true;
        const bootAcct = boot?.account || boot?.user || null;
        out.email = cleanEmail(bootAcct?.email_address || bootAcct?.email);
        out.name = typeof (bootAcct?.display_name || bootAcct?.full_name) === 'string' ? (bootAcct.display_name || bootAcct.full_name).trim().slice(0, 48) : null;
        let orgs = Array.isArray(bootAcct?.memberships)
          ? bootAcct.memberships.map(m => m?.organization).filter(Boolean)
          : (Array.isArray(boot?.organizations) ? boot.organizations : null);
        if (!out.email) {
          const curRes = await jsonGetWithStatus('/api/auth/current_account');
          if (curRes.ok && curRes.data) out.sessionVerified = true;
          const ca = curRes.data?.account || curRes.data;
          out.email = cleanEmail(ca?.email_address || ca?.email);
          if (!orgs && Array.isArray(ca?.memberships)) orgs = ca.memberships.map(m => m?.organization).filter(Boolean);
        }
        if (!orgs || !orgs.length) {
          const orgRes = await jsonGetWithStatus('/api/organizations');
          if (orgRes.ok && Array.isArray(orgRes.data)) {
            out.sessionVerified = true;
            orgs = orgRes.data;
          }
        }
        if (Array.isArray(orgs) && orgs.length) {
          const org = orgs[0];
          const orgId = org?.uuid || org?.id;
          const tierRaw = String(org?.rate_limit_tier || (Array.isArray(org?.capabilities) ? org.capabilities.join(' ') : '')).toUpperCase();
          if (tierRaw.includes('MAX')) out.plan = 'MAX';
          else if (tierRaw.includes('PRO')) out.plan = 'PRO';
          else if (tierRaw.includes('TEAM') || tierRaw.includes('ENTERPRISE')) out.plan = 'TEAM';
          else if (tierRaw) out.plan = 'FREE';
          if (orgId) {
            const uRes = await jsonGetWithStatus('/api/organizations/' + encodeURIComponent(orgId) + '/usage');
            out.usageStatus = uRes.status;
            if (uRes.ok && uRes.data && typeof uRes.data === 'object') out.usageData = uRes.data;
          }
        }
      } else if (appId === 'chatgpt' && (host.endsWith('chatgpt.com') || host.endsWith('openai.com'))) {
        const [meRes, whamRes] = await Promise.all([jsonGetWithStatus('/backend-api/me'), jsonGetWithStatus('/backend-api/wham/usage')]);
        if (meRes.ok || whamRes.ok) out.sessionVerified = true;
        out.usageStatus = whamRes.status;
        out.email = cleanEmail(meRes.data?.email);
        out.name = typeof meRes.data?.name === 'string' ? meRes.data.name.trim().slice(0, 48) : null;
        if (whamRes.ok && whamRes.data && typeof whamRes.data === 'object') {
          out.usageData = whamRes.data;
          if (typeof whamRes.data.plan_type === 'string' && whamRes.data.plan_type.trim()) out.plan = whamRes.data.plan_type.trim().toUpperCase().slice(0, 32);
        }
      }
      if (!out.email) {
        const nd = globalThis.__NEXT_DATA__?.props?.pageProps?.user?.email || globalThis.__NEXT_DATA__?.props?.pageProps?.session?.user?.email;
        out.email = cleanEmail(nd);
      }
      if (!out.email && Array.isArray(globalThis.__next_f)) {
        const joined = globalThis.__next_f.map(x => (Array.isArray(x) ? String(x[1] || '') : '')).join(' ').slice(0, 120000);
        const m = /"email(?:_address)?"\\s*:\\s*"([^"\\s@]{1,64}@[^"\\s@]{1,120}\\.[^"\\s@]{2,})"/i.exec(joined);
        if (m) out.email = cleanEmail(m[1]);
      }
      if (!out.email) {
        try {
          for (let i = 0; i < Math.min(localStorage.length, 40) && !out.email; i += 1) {
            const k = localStorage.key(i) || '';
            if (!/user|profile|account|auth|clerk|supabase|ajs_user_traits|session/i.test(k)) continue;
            const rawVal = String(localStorage.getItem(k) || '').slice(0, 16000);
            const m = /"email(?:_address|Address)?"\\s*:\\s*"([^"\\s@]{1,64}@[^"\\s@]{1,120}\\.[^"\\s@]{2,})"/i.exec(rawVal);
            if (m && cleanEmail(m[1])) out.email = cleanEmail(m[1]);
          }
        } catch {}
      }
      if (!out.email) {
        const meta = document.querySelector('meta[name*="email"],[data-user-email],[data-email]');
        out.email = cleanEmail(meta?.getAttribute?.('data-user-email') || meta?.getAttribute?.('data-email') || meta?.getAttribute?.('content'));
      }
      if (!out.email) {
        for (const el of document.querySelectorAll('[aria-label*="@"],[title*="@"],a[href^="mailto:"]')) {
          const txt = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('href')?.replace(/^mailto:/i, '') || '';
          const m = /([A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,120}\\.[A-Za-z]{2,24})/.exec(txt);
          if (m && cleanEmail(m[1])) { out.email = cleanEmail(m[1]); break; }
        }
      }
    } catch {}
    return out;
  })()`;
}

export function detectAuthorizedWebSession({
  appId,
  cookies = [],
  currentUrl = '',
  pageEmail = null,
  origins = null,
  cookieNames = null,
} = {}) {
  const normalizedApp = appId === 'gemini' ? 'gemini-web' : appId;
  const spec = WEB_LOGIN_TARGETS[normalizedApp];
  const resolvedOrigins = Array.isArray(origins) && origins.length ? origins : spec?.origins;
  const resolvedCookieNames = Array.isArray(cookieNames) && cookieNames.length ? cookieNames : (spec?.cookieNames || []);
  const allowAnyAuthCookie = Boolean(spec?.allowAnyAuthCookie);
  const labelPrefix = spec?.labelPrefix || normalizedApp || 'Web';
  if (!Array.isArray(resolvedOrigins) || !resolvedOrigins.length || !Array.isArray(cookies)) return null;

  const originHosts = resolvedOrigins
    .map(o => { try { return new URL(o).hostname.toLowerCase(); } catch { return ''; } })
    .filter(Boolean);
  if (!originHosts.length) return null;

  const domainMatched = cookies.filter(c => c && c.name && c.value && cookieMatchesOrigins(c.domain, originHosts));
  if (!domainMatched.length) return null;

  let hit = domainMatched.find(c => resolvedCookieNames.some(name => c.name === name || c.name.startsWith(`${name}.`)));
  if (!hit && allowAnyAuthCookie && !isUnauthenticatedLoginUrl(currentUrl)) {
    hit = domainMatched.find(c => {
      const name = String(c.name || '');
      const val = String(c.value || '');
      if (TRACKING_OR_CDN_COOKIE_PATTERN.test(name)) return false;
      if (!AUTH_LIKE_COOKIE_PATTERN.test(name)) return false;
      if (name === '__client_uat') return /^\d+$/.test(val) && Number(val) > 0;
      if (name === 'c_user') return /^\d{4,}$/.test(val);
      return val.length >= 10;
    });
  }
  if (!hit) return null;

  let extractedEmail = validCleanEmail(pageEmail);
  let extractedName = null;
  for (const c of domainMatched) {
    for (const rawCandidate of [String(c.value || ''), (() => { try { return decodeURIComponent(String(c.value || '')); } catch { return ''; } })()]) {
      if (!rawCandidate || rawCandidate.split('.').length < 3) continue;
      const jwtPayload = decodeJwtPayloadSafe(rawCandidate);
      if (!jwtPayload) continue;
      extractedEmail = extractedEmail || validCleanEmail(jwtPayload.email) || validCleanEmail(jwtPayload.user?.email) || validCleanEmail(jwtPayload.preferred_username);
      if (!extractedName && typeof jwtPayload.name === 'string' && jwtPayload.name.trim()) {
        extractedName = jwtPayload.name.trim().slice(0, 48);
      }
    }
  }

  const digest = crypto.createHash('sha256').update(`${normalizedApp}:${hit.name}:${hit.value}`).digest('hex');
  const cookieHeader = domainMatched.map(c => `${c.name}=${c.value}`).join('; ');
  return {
    appId: normalizedApp,
    cookieName: hit.name,
    cookieValue: hit.value,
    cookieHeader,
    email: extractedEmail,
    label: extractedEmail || (extractedName ? `${labelPrefix} · ${extractedName}` : `${labelPrefix} 已授权会话 #${digest.slice(0, 6)}`),
    digest,
  };
}

function clampPct(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function toneForPct(pct) {
  if (!Number.isFinite(pct)) return 'neutral';
  if (pct >= 50) return 'high';
  if (pct >= 20) return 'mid';
  return 'low';
}

function decodeJwtPayloadSafe(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (normalized.length % 4)) % 4;
    const raw = Buffer.from(normalized + '='.repeat(padLen), 'base64').toString('utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function httpRequestWithProxy({
  url,
  method = 'GET',
  headers = {},
  body = null,
  proxyUrl = null,
  timeoutMs = 8_000,
  fetchImpl = globalThis.fetch,
}) {
  const upperMethod = String(method || 'GET').toUpperCase();
  const payload = body === null || body === undefined
    ? null
    : (typeof body === 'string' || Buffer.isBuffer(body)
      ? body
      : body instanceof URLSearchParams
        ? body.toString()
        : JSON.stringify(body));

  if (!proxyUrl) {
    let timer = null;
    const controller = new AbortController();
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(fail('REQUEST_TIMEOUT', '上游请求超时。'));
      }, timeoutMs);
    });
    try {
      const response = await Promise.race([
        Promise.resolve().then(() => fetchImpl(url, {
          method: upperMethod,
          headers,
          ...(payload !== null ? { body: payload } : {}),
          signal: controller.signal,
        })),
        timeoutPromise,
      ]);
      const text = typeof response.text === 'function' ? await response.text().catch(() => '') : '';
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch {}
      }
      if (!data && response && typeof response.json === 'function' && !text) {
        data = await response.json().catch(() => null);
      }
      return { ok: Boolean(response.ok), status: response.status || 0, data, text };
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }

  const parsedTarget = new URL(url);
  const parsedProxy = new URL(proxyUrl);
  const targetPort = Number(parsedTarget.port || (parsedTarget.protocol === 'https:' ? 443 : 80));
  const bodyBuf = payload !== null ? (Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8')) : null;
  const reqHeaders = { ...headers, Host: parsedTarget.host };
  if (bodyBuf && !Object.keys(reqHeaders).some(k => k.toLowerCase() === 'content-length')) {
    reqHeaders['Content-Length'] = String(bodyBuf.length);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let connectReq = null;
    let tlsSocket = null;
    let upstreamReq = null;
    const cleanup = () => {
      try { upstreamReq?.destroy(); } catch {}
      try { tlsSocket?.destroy(); } catch {}
      try { connectReq?.destroy(); } catch {}
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(fail('REQUEST_TIMEOUT', '经安全通道请求上游超时。'));
    }, timeoutMs);

    const finishOk = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const finishErr = err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(err);
    };

    connectReq = http.request({
      host: parsedProxy.hostname,
      port: Number(parsedProxy.port || 17899),
      method: 'CONNECT',
      path: `${parsedTarget.hostname}:${targetPort}`,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        finishErr(fail('PROXY_CONNECT_FAILED', `安全通道代理握手失败 (${res.statusCode})`));
        return;
      }
      tlsSocket = parsedTarget.protocol === 'https:'
        ? tls.connect({ socket, servername: parsedTarget.hostname })
        : socket;
      tlsSocket.on('error', finishErr);

      const transport = parsedTarget.protocol === 'https:' ? https : http;
      upstreamReq = transport.request({
        hostname: parsedTarget.hostname,
        port: targetPort,
        path: `${parsedTarget.pathname}${parsedTarget.search}`,
        method: upperMethod,
        headers: reqHeaders,
        createConnection: () => tlsSocket,
      }, response => {
        const chunks = [];
        let size = 0;
        response.on('data', chunk => {
          size += chunk.length;
          if (size <= 512 * 1024) chunks.push(chunk);
        });
        response.on('end', () => {
          const status = response.statusCode || 0;
          const text = Buffer.concat(chunks).toString('utf8');
          let data = null;
          if (text) {
            try { data = JSON.parse(text); } catch {}
          }
          finishOk({ ok: status >= 200 && status < 300, status, data, text });
        });
      });
      upstreamReq.on('error', finishErr);
      if (bodyBuf) upstreamReq.write(bodyBuf);
      upstreamReq.end();
    });
    connectReq.on('error', finishErr);
    connectReq.end();
  });
}

async function exchangeGoogleToken({
  code,
  redirectUri,
  clientId = ANTIGRAVITY_OAUTH_CLIENT_ID,
  clientSecret = ANTIGRAVITY_OAUTH_CLIENT_SECRET,
  codeVerifier = null,
  proxyUrl = null,
  fetchImpl = globalThis.fetch,
}) {
  const formObj = {
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  };
  if (clientSecret) formObj.client_secret = clientSecret;
  if (codeVerifier) formObj.code_verifier = codeVerifier;
  const form = new URLSearchParams(formObj);
  const res = await httpRequestWithProxy({
    url: GOOGLE_TOKEN_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'vscode/1.X.X (Antigravity/4.3.0)',
    },
    body: form.toString(),
    proxyUrl,
    fetchImpl,
  });
  if (!res.ok || !res.data?.access_token) {
    throw fail('OAUTH_TOKEN_EXCHANGE_FAILED', 'Google OAuth 授权码兑换失败，请重试。');
  }
  const expiresIn = Number(res.data.expires_in) || 3600;
  return {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token || null,
    idToken: res.data.id_token || null,
    expiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

export async function exchangeAntigravityCode({ code, redirectUri, proxyUrl = null, fetchImpl = globalThis.fetch }) {
  return exchangeGoogleToken({
    code,
    redirectUri,
    clientId: ANTIGRAVITY_OAUTH_CLIENT_ID,
    clientSecret: ANTIGRAVITY_OAUTH_CLIENT_SECRET,
    proxyUrl,
    fetchImpl,
  });
}

export async function exchangeGeminiCliCode({
  code,
  redirectUri,
  clientId = GEMINI_CLI_OAUTH_CLIENT_ID,
  clientSecret = GEMINI_CLI_OAUTH_CLIENT_SECRET,
  codeVerifier = null,
  proxyUrl = null,
  fetchImpl = globalThis.fetch,
}) {
  return exchangeGoogleToken({ code, redirectUri, clientId, clientSecret, codeVerifier, proxyUrl, fetchImpl });
}

export async function refreshGoogleOAuthToken({
  refreshToken,
  clientId = ANTIGRAVITY_OAUTH_CLIENT_ID,
  clientSecret = ANTIGRAVITY_OAUTH_CLIENT_SECRET,
  proxyUrl = null,
  fetchImpl = globalThis.fetch,
}) {
  const cleanRefresh = typeof refreshToken === 'string' ? refreshToken.trim() : '';
  if (!cleanRefresh) throw fail('TOKEN_INVALID', '缺少有效的 Google Refresh Token。');
  const formObj = {
    client_id: clientId,
    refresh_token: cleanRefresh,
    grant_type: 'refresh_token',
  };
  if (clientSecret) formObj.client_secret = clientSecret;
  const form = new URLSearchParams(formObj);
  const res = await httpRequestWithProxy({
    url: GOOGLE_TOKEN_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'vscode/1.X.X (Antigravity/4.3.0)',
    },
    body: form.toString(),
    proxyUrl,
    fetchImpl,
  });
  if (!res.ok || !res.data?.access_token) {
    throw failHttp('OAUTH_TOKEN_EXCHANGE_FAILED', 'Refresh Token 刷新失败或已失效。', res);
  }
  const expiresIn = Number(res.data.expires_in) || 3600;
  return {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token || cleanRefresh,
    idToken: res.data.id_token || null,
    expiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

export async function refreshAntigravityToken({ refreshToken, proxyUrl = null, fetchImpl = globalThis.fetch }) {
  return refreshGoogleOAuthToken({
    refreshToken,
    clientId: ANTIGRAVITY_OAUTH_CLIENT_ID,
    clientSecret: ANTIGRAVITY_OAUTH_CLIENT_SECRET,
    proxyUrl,
    fetchImpl,
  });
}

export async function refreshGeminiCliToken({
  refreshToken,
  clientId = GEMINI_CLI_OAUTH_CLIENT_ID,
  clientSecret = GEMINI_CLI_OAUTH_CLIENT_SECRET,
  proxyUrl = null,
  fetchImpl = globalThis.fetch,
}) {
  return refreshGoogleOAuthToken({ refreshToken, clientId, clientSecret, proxyUrl, fetchImpl });
}

export async function exchangeCodexCode({ code, redirectUri, codeVerifier, proxyUrl = null, fetchImpl = globalThis.fetch }) {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CODEX_OAUTH_CLIENT_ID,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
  const res = await httpRequestWithProxy({
    url: CODEX_TOKEN_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'DingtuDesktop/0.2.0',
    },
    body: form.toString(),
    proxyUrl,
    fetchImpl,
  });
  if (!res.ok || !res.data?.access_token) {
    throw fail('OAUTH_TOKEN_EXCHANGE_FAILED', 'Codex OpenAI OAuth 授权码兑换失败，请重试。');
  }
  const expiresIn = Number(res.data.expires_in) || 3600;
  return {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token || null,
    idToken: res.data.id_token || null,
    expiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

export async function refreshCodexToken({ refreshToken, proxyUrl = null, fetchImpl = globalThis.fetch }) {
  const cleanRefresh = typeof refreshToken === 'string' ? refreshToken.trim() : '';
  if (!cleanRefresh) throw fail('TOKEN_INVALID', '缺少 Codex Refresh Token。');
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CODEX_OAUTH_CLIENT_ID,
    refresh_token: cleanRefresh,
  });
  const res = await httpRequestWithProxy({
    url: CODEX_TOKEN_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'DingtuDesktop/0.2.0',
    },
    body: form.toString(),
    proxyUrl,
    fetchImpl,
  });
  if (!res.ok || !res.data?.access_token) {
    throw failHttp('OAUTH_TOKEN_EXCHANGE_FAILED', 'Codex Refresh Token 刷新失败或已过期。', res);
  }
  const expiresIn = Number(res.data.expires_in) || 3600;
  return {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token || cleanRefresh,
    idToken: res.data.id_token || null,
    expiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

export async function refreshClaudeCodeToken({ refreshToken, proxyUrl = null, fetchImpl = globalThis.fetch }) {
  const cleanRefresh = typeof refreshToken === 'string' ? refreshToken.trim() : '';
  if (!cleanRefresh) throw fail('TOKEN_INVALID', '缺少 Claude Code Refresh Token。');
  let lastErr = null;
  for (const endpoint of CLAUDE_CODE_TOKEN_URLS) {
    try {
      const res = await httpRequestWithProxy({
        url: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'DingtuDesktop/0.2.0',
        },
        body: {
          grant_type: 'refresh_token',
          refresh_token: cleanRefresh,
          client_id: CLAUDE_CODE_CLIENT_ID,
        },
        proxyUrl,
        fetchImpl,
      });
      if (res.ok && res.data?.access_token) {
        const expiresIn = Number(res.data.expires_in) || 28800;
        return {
          accessToken: res.data.access_token,
          refreshToken: res.data.refresh_token || cleanRefresh,
          expiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
        };
      }
      lastErr = failHttp('OAUTH_TOKEN_EXCHANGE_FAILED', `Claude Code 令牌刷新失败 (${res.status})`, res);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || fail('OAUTH_TOKEN_EXCHANGE_FAILED', 'Claude Code Refresh Token 刷新失败。');
}

export async function refreshKiroToken({
  refreshToken,
  clientId = null,
  clientSecret = null,
  region = KIRO_DEFAULT_REGION,
  authMethod = '',
  proxyUrl = null,
  fetchImpl = globalThis.fetch,
}) {
  const cleanRefresh = typeof refreshToken === 'string' ? refreshToken.trim() : '';
  if (!cleanRefresh) throw fail('TOKEN_INVALID', '缺少 Kiro Refresh Token。');
  const safeRegion = /^[a-z0-9-]+$/.test(String(region || '')) ? region : KIRO_DEFAULT_REGION;
  const isSocial = String(authMethod).toLowerCase() === 'social' || (!clientId && !clientSecret);
  if (isSocial) {
    const res = await httpRequestWithProxy({
      url: `https://prod.${safeRegion}.auth.desktop.kiro.dev/refreshToken`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: { refreshToken: cleanRefresh },
      proxyUrl,
      fetchImpl,
    });
    if (!res.ok || !res.data?.accessToken) {
      throw failHttp('OAUTH_TOKEN_EXCHANGE_FAILED', 'Kiro 社交登录令牌刷新失败。', res);
    }
    const expiresIn = Number(res.data.expiresIn) || 3600;
    return {
      accessToken: res.data.accessToken,
      refreshToken: res.data.refreshToken || cleanRefresh,
      expiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
      profileArn: res.data.profileArn || null,
    };
  }
  const res = await httpRequestWithProxy({
    url: `https://oidc.${safeRegion}.amazonaws.com/token`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: {
      clientId,
      clientSecret,
      refreshToken: cleanRefresh,
      grantType: 'refresh_token',
    },
    proxyUrl,
    fetchImpl,
  });
  if (!res.ok || !res.data?.accessToken) {
    throw failHttp('OAUTH_TOKEN_EXCHANGE_FAILED', 'Kiro AWS OIDC 令牌刷新失败。', res);
  }
  const expiresIn = Number(res.data.expiresIn) || 3600;
  return {
    accessToken: res.data.accessToken,
    refreshToken: res.data.refreshToken || cleanRefresh,
    expiry: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

export async function fetchGoogleUserInfo({ accessToken, proxyUrl = null, fetchImpl = globalThis.fetch }) {
  if (!accessToken) return null;
  const res = await httpRequestWithProxy({
    url: GOOGLE_USERINFO_URL,
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
    proxyUrl,
    fetchImpl,
  });
  if (!res.ok || !res.data) return null;
  return {
    email: typeof res.data.email === 'string' ? res.data.email : null,
    name: typeof res.data.name === 'string' ? res.data.name : null,
    id: typeof res.data.id === 'string' ? res.data.id : null,
  };
}

export async function fetchCopilotQuota({ accessToken, proxyUrl = null, fetchImpl = globalThis.fetch }) {
  if (!accessToken) throw fail('TOKEN_INVALID', '缺少 GitHub Copilot Token。');
  const res = await httpRequestWithProxy({
    url: 'https://api.github.com/copilot_internal/user',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'GithubCopilot/1.250.0',
    },
    proxyUrl,
    fetchImpl,
  });
  if (!res.ok || !res.data) {
    throw failHttp('QUOTA_FETCH_FAILED', `Copilot 配额查询失败 (${res.status || 'network'})。`, res);
  }
  const plan = typeof res.data.copilot_plan === 'string' && res.data.copilot_plan.trim()
    ? res.data.copilot_plan.trim().toUpperCase().slice(0, 48)
    : 'FREE';
  const resetAt = typeof res.data.quota_reset_date === 'string'
    ? res.data.quota_reset_date
    : (typeof res.data.limited_user_reset_date === 'string' ? res.data.limited_user_reset_date : null);
  const quotas = [];
  const snapshots = res.data.quota_snapshots || {};
  for (const [key, label] of [['premium_interactions', 'Premium 交互'], ['chat', 'Chat 额度'], ['completions', 'Inline 补全']]) {
    const snap = snapshots[key];
    if (snap && typeof snap.percent_remaining === 'number') {
      const remainingPct = clampPct(snap.percent_remaining);
      quotas.push({
        id: key,
        label,
        remainingPct,
        usedText: `${remainingPct}%`,
        resetAt,
        tone: toneForPct(remainingPct),
      });
    }
  }
  if (!quotas.length && res.data.limited_user_quotas && res.data.monthly_quotas) {
    for (const [key, label] of [['chat', 'Chat 额度'], ['completions', 'Inline 补全']]) {
      const rem = Number(res.data.limited_user_quotas[key]);
      const cap = Number(res.data.monthly_quotas[key]);
      if (Number.isFinite(rem) && Number.isFinite(cap) && cap > 0) {
        const remainingPct = clampPct((rem / cap) * 100);
        quotas.push({
          id: key,
          label,
          remainingPct,
          usedText: `${rem}/${cap}`,
          resetAt,
          tone: toneForPct(remainingPct),
        });
      }
    }
  }
  return { plan, quotas };
}

function normalizeAntigravityTier(rawTier) {
  const raw = typeof rawTier === 'string' ? rawTier : (rawTier?.id || rawTier?.name || '');
  const upper = String(raw).toUpperCase();
  if (!upper) return 'FREE';
  if (upper.includes('ULTRA')) return 'ULTRA';
  if (upper.includes('PRO')) return 'PRO';
  if (upper.includes('ENTERPRISE') || upper.includes('TEAM')) return 'PRO';
  if (upper.includes('FREE') || upper.includes('STANDARD') || upper.includes('LEGACY')) return 'FREE';
  return upper.slice(0, 16);
}

function modelSortWeight(id, label) {
  const txt = `${id} ${label}`.toLowerCase();
  if (txt.includes('argon')) return 50;
  if (txt.includes('carbon')) return 55;
  if (txt.includes('gemini') && txt.includes('5h')) return 10;
  if (txt.includes('gemini') && txt.includes('weekly')) return 20;
  if (txt.includes('claude') && txt.includes('5h')) return 30;
  if (txt.includes('claude') && txt.includes('weekly')) return 40;
  if (txt.includes('gemini') && txt.includes('pro')) return 60;
  if (txt.includes('gemini') && txt.includes('flash')) return 70;
  if (txt.includes('claude')) return 80;
  if (txt.includes('gemini')) return 85;
  if (txt.includes('gpt')) return 90;
  return 95;
}

// Aligned with jlcodes99/cockpit-tools src/utils/antigravityQuotaWindows.json
export const ANTIGRAVITY_SUMMARY_BUCKET_SPECS = Object.freeze([
  Object.freeze({ id: 'gemini-5h', label: 'Gemini · 5h', family: 'Gemini', weekly: false, aliases: ['gemini-5h', 'gemini:5h'] }),
  Object.freeze({ id: 'gemini-weekly', label: 'Gemini · Weekly', family: 'Gemini', weekly: true, aliases: ['gemini-weekly', 'gemini:weekly'] }),
  Object.freeze({ id: 'claude-5h', label: 'Claude · 5h', family: 'Claude', weekly: false, aliases: ['3p-5h', 'claude:5h'] }),
  Object.freeze({ id: 'claude-weekly', label: 'Claude · Weekly', family: 'Claude', weekly: true, aliases: ['3p-weekly', 'claude:weekly'] }),
  Object.freeze({ id: 'gemini-argon-wtu-weekly', label: 'Gemini 4 Argon (Weekly)', family: 'Argon', weekly: true, aliases: ['gemini-argon-wtu-weekly', 'argon:weekly'] }),
  Object.freeze({ id: 'gemini-carbon-wtu-weekly', label: 'Gemini 4 Carbon (Weekly)', family: 'Carbon', weekly: true, aliases: ['gemini-carbon-wtu-weekly', 'carbon:weekly'] }),
]);

const SUMMARY_ALIAS_MAP = new Map();
for (const spec of ANTIGRAVITY_SUMMARY_BUCKET_SPECS) {
  SUMMARY_ALIAS_MAP.set(spec.id.toLowerCase(), spec);
  for (const alias of spec.aliases) {
    SUMMARY_ALIAS_MAP.set(alias.toLowerCase(), spec);
  }
}

export function parseQuotaSummaryResponse(summaryJson) {
  if (!summaryJson || typeof summaryJson !== 'object' || !Array.isArray(summaryJson.groups)) {
    return { valid: false, stale: true, buckets: [], families: new Set() };
  }
  if (summaryJson.groups.length === 0) {
    return { valid: true, stale: false, buckets: [], families: new Set() };
  }

  const bucketMap = new Map();
  const families = new Set();
  let sawRawBucket = false;
  for (const group of summaryJson.groups) {
    const rawBuckets = Array.isArray(group?.buckets) ? group.buckets : [];
    for (const bucket of rawBuckets) {
      if (!bucket || typeof bucket !== 'object') continue;
      sawRawBucket = true;
      const rawId = typeof bucket.bucketId === 'string' ? bucket.bucketId.trim() : '';
      const fraction = typeof bucket.remainingFraction === 'number' && Number.isFinite(bucket.remainingFraction)
        ? bucket.remainingFraction
        : null;
      if (!rawId || fraction === null) continue;
      const pct = clampPct(fraction * 100);
      if (pct === null) continue;
      const summaryExhausted = fraction <= 0;
      const resetAt = typeof bucket.resetTime === 'string' && bucket.resetTime.trim() ? bucket.resetTime.trim() : null;
      const spec = SUMMARY_ALIAS_MAP.get(rawId.toLowerCase()) || null;
      const id = spec ? spec.id : rawId.toLowerCase();
      const label = spec
        ? spec.label
        : String(bucket.displayName || rawId).trim().slice(0, 48);
      if (spec?.family) families.add(spec.family);

      const entry = {
        id,
        label,
        remainingPct: pct,
        usedText: `${pct}%`,
        resetAt,
        tone: toneForPct(pct),
        summaryExhausted,
      };
      const prev = bucketMap.get(id);
      if (!prev || entry.remainingPct < prev.remainingPct) {
        bucketMap.set(id, entry);
      } else if (entry.remainingPct === prev.remainingPct) {
        if (entry.summaryExhausted) prev.summaryExhausted = true;
        if (entry.resetAt && (!prev.resetAt || Date.parse(entry.resetAt) < Date.parse(prev.resetAt))) {
          prev.resetAt = entry.resetAt;
        }
      }
    }
  }

  if (sawRawBucket && bucketMap.size === 0) {
    return { valid: false, stale: true, buckets: [], families: new Set() };
  }
  return { valid: true, stale: false, buckets: [...bucketMap.values()], families };
}

function classifyCloudCodeForbidden(res) {
  const message = String(res?.data?.error?.message || res?.text || '').trim();
  const lower = message.toLowerCase();
  if (/verify your account|validation_required|account verification|complete verification/i.test(lower)) {
    return { explicit: true, reason: 'VALIDATION_REQUIRED', message };
  }
  if (/subscription required|not eligible|account.*disabled|account.*suspended|account.*banned|account.*terminated|account.*deactivated|terms of service|tos/i.test(lower)) {
    return { explicit: true, reason: 'SUBSCRIPTION_REQUIRED', message };
  }
  return { explicit: false, reason: 'PERMISSION_DENIED', message };
}

export function normalizeCloudCodeQuotas(modelsObj = {}, nowMs = Date.now(), quotaSummary = null) {
  const summaryParsed = quotaSummary ? parseQuotaSummaryResponse(quotaSummary) : { valid: false, stale: true, buckets: [], families: new Set() };
  const rawEntries = [];
  for (const [rawKey, info] of Object.entries(modelsObj || {})) {
    const modelId = rawKey.replace(/^ep\d+::/, '');
    if (info?.isInternal === true) continue;
    if (/^(?:tab_|chat_|model_placeholder|rev\d+)/i.test(modelId)) continue;
    const q = info?.quotaInfo;
    if (!q) continue;
    const hasFraction = typeof q.remainingFraction === 'number';
    const resetAt = typeof q.resetTime === 'string' ? q.resetTime : null;
    if (!hasFraction && !resetAt) continue;
    if (/-disabled$/i.test(modelId) && !resetAt && q.remainingFraction === 0) continue;
    const pct = clampPct((hasFraction ? q.remainingFraction : 0) * 100);
    if (pct === null) continue;
    const label = String(info?.displayName || modelId).trim();
    const resetMs = resetAt ? Date.parse(resetAt) : NaN;
    const refNow = Number.isFinite(info?._refNow) ? info._refNow : nowMs;
    const diffMs = Number.isFinite(resetMs) ? resetMs - refNow : NaN;
    const lower = `${modelId} ${label}`.toLowerCase();
    const family = lower.includes('claude')
      ? 'Claude'
      : lower.includes('argon')
        ? 'Argon'
        : lower.includes('carbon')
          ? 'Carbon'
          : lower.includes('gemini')
            ? 'Gemini'
            : lower.includes('gpt')
              ? 'GPT'
              : 'Other';
    let windowKind = null;
    if (typeof info?._explicitWindow === 'string') {
      windowKind = info._explicitWindow;
    } else if (Number.isFinite(diffMs)) {
      windowKind = diffMs <= 9 * 3600_000 ? '5h' : 'Weekly';
    }
    rawEntries.push({ modelId, label, pct, resetAt, family, windowKind });
  }

  // Authoritative 5h/Weekly/Argon/Carbon buckets from retrieveUserQuotaSummary take precedence.
  const buckets = new Map();
  for (const sb of summaryParsed.buckets) {
    buckets.set(sb.id, { ...sb });
  }

  // Group remaining observed models from fetchAvailableModels without overwriting summary families.
  const extrasByLabel = new Map();
  const pushExtra = entry => {
    const key = entry.label.toLowerCase();
    const prev = extrasByLabel.get(key);
    if (!prev) {
      extrasByLabel.set(key, entry);
      return;
    }
    if (entry.remainingPct < prev.remainingPct) {
      extrasByLabel.set(key, entry);
    } else if (entry.remainingPct === prev.remainingPct && entry.resetAt && (!prev.resetAt || Date.parse(entry.resetAt) > Date.parse(prev.resetAt))) {
      extrasByLabel.set(key, entry);
    }
  };

  for (const item of rawEntries) {
    if ((item.family === 'Gemini' || item.family === 'Claude') && item.windowKind) {
      if (summaryParsed.families.has(item.family)) continue;
      const bucketId = `${item.family.toLowerCase()}-${item.windowKind.toLowerCase()}`;
      const bucketLabel = `${item.family} · ${item.windowKind}`;
      const cur = buckets.get(bucketId);
      if (!cur) {
        buckets.set(bucketId, {
          id: bucketId,
          label: bucketLabel,
          remainingPct: item.pct,
          usedText: `${item.pct}%`,
          resetAt: item.resetAt,
          tone: toneForPct(item.pct),
        });
      } else {
        cur.remainingPct = Math.min(cur.remainingPct, item.pct);
        cur.usedText = `${cur.remainingPct}%`;
        cur.tone = toneForPct(cur.remainingPct);
        if (item.resetAt && (!cur.resetAt || Date.parse(item.resetAt) < Date.parse(cur.resetAt))) {
          cur.resetAt = item.resetAt;
        }
      }
    } else if (item.family === 'Argon' || item.family === 'Carbon') {
      if (summaryParsed.families.has(item.family)) continue;
      const label = item.label.toLowerCase().includes('weekly') ? item.label : `${item.label} (Weekly)`;
      pushExtra({
        id: item.modelId,
        label: label.slice(0, 48),
        remainingPct: item.pct,
        usedText: `${item.pct}%`,
        resetAt: item.resetAt,
        tone: toneForPct(item.pct),
      });
    } else if (item.family === 'Gemini' || item.family === 'Claude') {
      if (summaryParsed.families.has(item.family)) continue;
      pushExtra({
        id: item.modelId,
        label: item.label.slice(0, 48),
        remainingPct: item.pct,
        usedText: `${item.pct}%`,
        resetAt: item.resetAt,
        tone: toneForPct(item.pct),
      });
    } else {
      pushExtra({
        id: item.modelId,
        label: item.label.slice(0, 48),
        remainingPct: item.pct,
        usedText: `${item.pct}%`,
        resetAt: item.resetAt,
        tone: toneForPct(item.pct),
      });
    }
  }

  // Report only real observed quota windows returned by Cloud Code without fabricating
  // unverified placeholder percentages.
  const seenLabels = new Set();
  const combined = [];
  for (const item of [...buckets.values(), ...extrasByLabel.values()]) {
    const key = item.label.toLowerCase();
    if (seenLabels.has(key)) continue;
    seenLabels.add(key);
    combined.push({ ...item, weight: modelSortWeight(item.id, item.label) });
  }
  combined.sort((a, b) => a.weight - b.weight || a.label.localeCompare(b.label));
  return combined.slice(0, 8).map(({ weight, ...rest }) => rest);
}

export async function fetchAntigravityQuota({
  accessToken,
  proxyUrl = null,
  fetchImpl = globalThis.fetch,
  nowMs = Date.now(),
  endpoints = CLOUD_CODE_ENDPOINTS,
}) {
  if (!accessToken) throw fail('TOKEN_INVALID', '缺少 Antigravity Access Token。');

  // Query primary daily-cloudcode-pa first (matching jlcodes99/cockpit-tools):
  // loadCodeAssist -> fetchAvailableModels + retrieveUserQuotaSummary (real 5h & Weekly buckets).
  // Never merge legacy cloudcode-pa with primary because legacy holds untouched 100%/5h counters.
  const probeEndpoint = async (base, epIdx) => {
    let epProjectId = null;
    let epTier = null;
    let epCredits = [];
    const loadRes = await httpRequestWithProxy({
      url: `${base}/v1internal:loadCodeAssist`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': LOAD_CODE_ASSIST_USER_AGENT,
        'x-goog-api-client': LOAD_CODE_ASSIST_X_GOOG_API_CLIENT,
      },
      body: {
        metadata: {
          ideType: 'ANTIGRAVITY',
          platform: 'PLATFORM_UNSPECIFIED',
          pluginType: 'GEMINI',
        },
      },
      proxyUrl,
      fetchImpl,
    }).catch(() => null);

    if (loadRes?.ok && loadRes.data) {
      const proj = loadRes.data.cloudaicompanionProject;
      epProjectId = typeof proj === 'string' ? proj : (typeof proj?.id === 'string' ? proj.id : null);
      const chosenTier = loadRes.data.paidTier || loadRes.data.currentTier;
      if (chosenTier) epTier = normalizeAntigravityTier(chosenTier);
      const rawCredits = loadRes.data.paidTier?.availableCredits || loadRes.data.currentTier?.availableCredits;
      if (Array.isArray(rawCredits)) {
        epCredits = rawCredits
          .filter(item => item && item.creditType && item.creditAmount !== undefined)
          .map(item => ({ type: String(item.creditType), amount: String(item.creditAmount) }));
      }
    }

    const body = epProjectId ? { project: epProjectId } : {};
    const cloudCodeHeaders = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': CLOUD_CODE_USER_AGENT,
    };

    const modelsRes = await httpRequestWithProxy({
      url: `${base}/v1internal:fetchAvailableModels`,
      method: 'POST',
      headers: cloudCodeHeaders,
      body,
      proxyUrl,
      fetchImpl,
    });

    const modelsDenied = modelsRes?.status === 403 ? classifyCloudCodeForbidden(modelsRes) : null;
    const shouldQuerySummary = Boolean(modelsRes?.ok) || (modelsRes?.status === 403 && !modelsDenied?.explicit);

    let summaryRes = null;
    if (shouldQuerySummary) {
      summaryRes = await httpRequestWithProxy({
        url: `${base}/v1internal:retrieveUserQuotaSummary`,
        method: 'POST',
        headers: cloudCodeHeaders,
        body,
        proxyUrl,
        fetchImpl,
      }).catch(() => null);
    }

    return { epIdx, epProjectId, epTier, epCredits, loadRes, modelsRes, modelsDenied, summaryRes };
  };

  let projectId = null;
  let tier = 'FREE';
  let credits = [];
  let chosenQuotas = null;
  let quotaSummaryStale = true;
  let summaryError = null;
  let isForbidden = false;
  let firstErrorRes = null;

  for (let idx = 0; idx < endpoints.length; idx += 1) {
    const base = endpoints[idx];
    let res;
    try {
      res = await probeEndpoint(base, idx);
    } catch (err) {
      if (!firstErrorRes) firstErrorRes = err;
      continue;
    }
    if (!projectId && res.epProjectId) projectId = res.epProjectId;
    if (res.epTier && (tier === 'FREE' || idx === 0)) tier = res.epTier;
    if (!credits.length && res.epCredits.length) credits = res.epCredits;

    const summaryParsed = res.summaryRes?.ok
      ? parseQuotaSummaryResponse(res.summaryRes.data)
      : { valid: false, stale: true, buckets: [], families: new Set() };
    const summaryDenied = res.summaryRes?.status === 403 ? classifyCloudCodeForbidden(res.summaryRes) : null;

    if (res.modelsRes?.ok && res.modelsRes.data?.models && typeof res.modelsRes.data.models === 'object') {
      const normalized = normalizeCloudCodeQuotas(
        res.modelsRes.data.models,
        nowMs,
        res.summaryRes?.ok ? res.summaryRes.data : null,
      );
      if (normalized.length > 0 || idx === endpoints.length - 1) {
        chosenQuotas = normalized;
        quotaSummaryStale = summaryParsed.stale || Boolean(summaryDenied?.explicit);
        if (summaryDenied?.explicit) {
          summaryError = { status: 403, reason: summaryDenied.reason, message: summaryDenied.message };
        }
        isForbidden = false;
        break;
      }
    } else if (res.modelsRes?.status === 403) {
      if (res.modelsDenied?.explicit) {
        isForbidden = true;
        firstErrorRes = res.modelsRes;
        break;
      }
      if (res.summaryRes?.ok && summaryParsed.buckets.length > 0) {
        chosenQuotas = normalizeCloudCodeQuotas({}, nowMs, res.summaryRes.data);
        quotaSummaryStale = false;
        isForbidden = false;
        break;
      }
      if (summaryDenied?.explicit) {
        isForbidden = true;
        summaryError = { status: 403, reason: summaryDenied.reason, message: summaryDenied.message };
        firstErrorRes = res.summaryRes;
        break;
      }
      if (!firstErrorRes) {
        firstErrorRes = res.summaryRes?.status ? res.summaryRes : res.modelsRes;
      }
    } else if (!firstErrorRes) {
      firstErrorRes = res.modelsRes?.status ? res.modelsRes : res.loadRes;
    }
  }

  if (!chosenQuotas) {
    const err = failHttp(
      'QUOTA_FETCH_FAILED',
      `Antigravity 配额查询失败 (${firstErrorRes?.status || 'network'})。`,
      firstErrorRes,
    );
    err.isForbidden = isForbidden;
    if (summaryError?.reason) err.reason = summaryError.reason;
    throw err;
  }

  return {
    projectId,
    plan: tier,
    credits,
    quotas: chosenQuotas,
    quotaSummaryStale,
    summaryError,
    isForbidden,
  };
}

export function createOAuthAccountFlowManager({
  openExternal = async () => {},
  openOAuthWindow = null,
  openWebLoginWindow = null,
  proxyUrlProvider = () => null,
  environmentModeProvider = () => 'safe_tunnel',
  onAccountAuthorized = async () => null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const flows = new Map();

  async function launchOAuthBrowser(flow, { url, title, allowedLoopbackOrigins = [] }) {
    if (typeof openOAuthWindow === 'function') {
      const handle = await openOAuthWindow({
        appId: flow.appId,
        url,
        title,
        allowedLoopbackOrigins,
        onClosed: () => {
          if (flow.status === 'pending' && !flow.completing) {
            flow.status = 'cancelled';
            flow.error = '已关闭授权浏览器窗口。';
            closeFlowHandles(flow);
          }
        },
      });
      flow.browserName = handle?.browser || null;
      flow.browserFallback = Boolean(handle?.fallback);
      flow.disposeWindow = handle?.close || null;
      return;
    }
    flow.browserName = 'system';
    flow.browserFallback = true;
    await openExternal(url);
  }

  function effectiveProxyUrl() {
    return isTunnelEnvironmentMode(environmentModeProvider()) ? proxyUrlProvider() : null;
  }

  function sanitizeFlow(flow) {
    return Object.freeze({
      flowId: flow.flowId,
      appId: flow.appId,
      alias: flow.alias,
      mode: flow.mode,
      status: flow.status,
      authUrl: flow.authUrl || null,
      userCode: flow.userCode || null,
      verificationUri: flow.verificationUri || null,
      browserName: flow.browserName || null,
      browserFallback: Boolean(flow.browserFallback),
      expiresAt: flow.expiresAt,
      error: flow.error || null,
      account: flow.account || null,
    });
  }

  function closeFlowHandles(flow) {
    if (flow.expiryTimer) {
      clearTimeout(flow.expiryTimer);
      flow.expiryTimer = null;
    }
    if (flow.pollTimer) {
      clearTimeout(flow.pollTimer);
      flow.pollTimer = null;
    }
    if (flow.server) {
      try { flow.server.closeAllConnections?.(); } catch {}
      try { flow.server.close(); } catch {}
      flow.server = null;
    }
    if (typeof flow.disposeWindow === 'function') {
      try { flow.disposeWindow(); } catch {}
      flow.disposeWindow = null;
    }
  }

  async function completeGoogleAuthorization(flow, code) {
    if (flow.status !== 'pending' || flow.completing) return;
    flow.completing = true;
    try {
      const proxyUrl = effectiveProxyUrl();
      const isGeminiCli = flow.appId === 'gemini-cli';
      const tokens = isGeminiCli
        ? await exchangeGeminiCliCode({
          code,
          redirectUri: flow.redirectUri,
          codeVerifier: flow.codeVerifier,
          proxyUrl,
          fetchImpl,
        })
        : await exchangeAntigravityCode({
          code,
          redirectUri: flow.redirectUri,
          proxyUrl,
          fetchImpl,
        });
      const userInfo = await fetchGoogleUserInfo({ accessToken: tokens.accessToken, proxyUrl, fetchImpl }).catch(() => null);
      let quotaMeta = null;
      try {
        quotaMeta = await fetchAntigravityQuota({ accessToken: tokens.accessToken, proxyUrl, fetchImpl });
      } catch {}

      const account = await onAccountAuthorized({
        appId: flow.appId,
        alias: flow.alias,
        email: userInfo?.email || null,
        label: userInfo?.email || userInfo?.name || flow.alias,
        plan: quotaMeta?.plan || 'FREE',
        oauthToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        idToken: tokens.idToken,
        tokenExpiry: tokens.expiry,
        projectId: quotaMeta?.projectId || null,
        credits: quotaMeta?.credits || [],
        quotas: quotaMeta?.quotas || [],
        quotaState: quotaMeta?.quotas?.length ? 'synced' : 'local_detected',
        source: 'oauth',
        extraMeta: isGeminiCli
          ? { clientId: GEMINI_CLI_OAUTH_CLIENT_ID, clientSecret: GEMINI_CLI_OAUTH_CLIENT_SECRET }
          : undefined,
      });
      flow.status = 'completed';
      flow.account = account;
      flow.error = null;
    } catch (err) {
      flow.status = 'failed';
      flow.error = err?.message || 'Google OAuth 授权完成失败。';
    } finally {
      flow.completing = false;
      closeFlowHandles(flow);
    }
  }

  async function completeCodexAuthorization(flow, code) {
    if (flow.status !== 'pending' || flow.completing) return;
    flow.completing = true;
    try {
      const proxyUrl = effectiveProxyUrl();
      const tokens = await exchangeCodexCode({
        code,
        redirectUri: flow.redirectUri,
        codeVerifier: flow.codeVerifier,
        proxyUrl,
        fetchImpl,
      });
      const idPayload = decodeJwtPayloadSafe(tokens.idToken) || {};
      const authClaim = idPayload['https://api.openai.com/auth'] || {};
      const email = typeof idPayload.email === 'string' ? idPayload.email : null;
      const plan = authClaim.chatgpt_plan_type || idPayload.chatgpt_plan_type || null;
      const accountId = authClaim.chatgpt_account_id || null;

      const account = await onAccountAuthorized({
        appId: flow.appId,
        alias: flow.alias,
        email,
        label: email || flow.alias,
        plan: plan ? String(plan) : null,
        oauthToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        idToken: tokens.idToken,
        tokenExpiry: tokens.expiry,
        quotaState: 'local_detected',
        source: 'oauth',
        extraMeta: accountId ? { accountId } : {},
      });
      flow.status = 'completed';
      flow.account = account;
      flow.error = null;
    } catch (err) {
      flow.status = 'failed';
      flow.error = err?.message || 'Codex OpenAI OAuth 授权失败。';
    } finally {
      flow.completing = false;
      closeFlowHandles(flow);
    }
  }

  async function start({ appId, alias = 'main' }) {
    const flowId = crypto.randomBytes(12).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();

    if (appId === 'antigravity' || appId === 'gemini-cli') {
      const stateToken = crypto.randomBytes(16).toString('hex');
      const codeVerifier = appId === 'gemini-cli' ? crypto.randomBytes(32).toString('base64url') : null;
      const codeChallenge = codeVerifier ? crypto.createHash('sha256').update(codeVerifier).digest('base64url') : null;
      const flow = {
        flowId,
        appId,
        alias,
        mode: 'browser',
        status: 'pending',
        stateToken,
        codeVerifier,
        redirectUri: null,
        authUrl: null,
        expiresAt,
        error: null,
        account: null,
        server: null,
        expiryTimer: null,
        pollTimer: null,
        completing: false,
      };

      const callbackPath = appId === 'gemini-cli' ? '/oauth2callback' : '/oauth-callback';
      await new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
          try {
            const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
            if (reqUrl.pathname !== callbackPath && reqUrl.pathname !== '/oauth-callback') {
              res.writeHead(404).end();
              return;
            }
            const errParam = reqUrl.searchParams.get('error');
            const code = reqUrl.searchParams.get('code');
            const returnedState = reqUrl.searchParams.get('state');
            if (errParam) {
              flow.status = 'failed';
              flow.error = `Google 授权未完成: ${errParam}`;
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<html><body><h2>授权已取消或失败</h2><p>请返回定途客户端重试。</p></body></html>');
              closeFlowHandles(flow);
              return;
            }
            if (!code || returnedState !== flow.stateToken) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<html><body><h2>授权回调参数无效</h2></body></html>');
              return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><body style="font-family:sans-serif;padding:40px;text-align:center;"><h2>授权成功</h2><p>凭据已加密保存至定途工作台，您可以关闭此页面返回客户端。</p></body></html>');
            void completeGoogleAuthorization(flow, code);
          } catch {
            res.writeHead(500).end();
          }
        });
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.removeListener('error', reject);
          const addr = server.address();
          flow.server = server;
          flow.redirectUri = `http://127.0.0.1:${addr.port}${callbackPath}`;
          const urlObj = new URL(GOOGLE_AUTH_URL);
          urlObj.searchParams.set('client_id', appId === 'gemini-cli' ? GEMINI_CLI_OAUTH_CLIENT_ID : ANTIGRAVITY_OAUTH_CLIENT_ID);
          urlObj.searchParams.set('redirect_uri', flow.redirectUri);
          urlObj.searchParams.set('response_type', 'code');
          urlObj.searchParams.set('scope', (appId === 'gemini-cli' ? GEMINI_CLI_SCOPES : ANTIGRAVITY_SCOPES).join(' '));
          urlObj.searchParams.set('access_type', 'offline');
          urlObj.searchParams.set('prompt', 'consent');
          urlObj.searchParams.set('include_granted_scopes', 'true');
          urlObj.searchParams.set('state', flow.stateToken);
          if (codeChallenge) {
            urlObj.searchParams.set('code_challenge', codeChallenge);
            urlObj.searchParams.set('code_challenge_method', 'S256');
          }
          flow.authUrl = urlObj.toString();
          resolve();
        });
      });

      flow.expiryTimer = setTimeout(() => {
        if (flow.status === 'pending') {
          flow.status = 'expired';
          flow.error = 'OAuth 授权已超时，请重新发起。';
          closeFlowHandles(flow);
        }
      }, 5 * 60_000);
      flow.expiryTimer.unref?.();
      flows.set(flowId, flow);

      try {
        await launchOAuthBrowser(flow, {
          url: flow.authUrl,
          title: appId === 'gemini-cli' ? 'Gemini CLI OAuth 授权' : 'Antigravity OAuth 授权',
          allowedLoopbackOrigins: flow.redirectUri ? [new URL(flow.redirectUri).origin] : [],
        });
      } catch {}
      return sanitizeFlow(flow);
    }

    if (appId === 'codex' || appId === 'codex-desktop') {
      const stateToken = crypto.randomBytes(16).toString('hex');
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      const flow = {
        flowId,
        appId,
        alias,
        mode: 'browser',
        status: 'pending',
        stateToken,
        codeVerifier,
        redirectUri: null,
        authUrl: null,
        expiresAt,
        error: null,
        account: null,
        server: null,
        expiryTimer: null,
        pollTimer: null,
        completing: false,
      };

      const startLoopback = port => new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
          try {
            const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
            if (reqUrl.pathname !== '/auth/callback') {
              res.writeHead(404).end();
              return;
            }
            const errParam = reqUrl.searchParams.get('error');
            const code = reqUrl.searchParams.get('code');
            const returnedState = reqUrl.searchParams.get('state');
            if (errParam) {
              flow.status = 'failed';
              flow.error = `OpenAI 授权未完成: ${errParam}`;
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<html><body><h2>授权已取消或失败</h2></body></html>');
              closeFlowHandles(flow);
              return;
            }
            if (!code || returnedState !== flow.stateToken) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<html><body><h2>授权回调参数无效</h2></body></html>');
              return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<html><body style="font-family:sans-serif;padding:40px;text-align:center;"><h2>Codex 授权成功</h2><p>您可以关闭此页面返回定途客户端。</p></body></html>');
            void completeCodexAuthorization(flow, code);
          } catch {
            res.writeHead(500).end();
          }
        });
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', reject);
          const addr = server.address();
          flow.server = server;
          flow.redirectUri = `http://localhost:${addr.port}/auth/callback`;
          const urlObj = new URL(CODEX_AUTH_URL);
          urlObj.searchParams.set('response_type', 'code');
          urlObj.searchParams.set('client_id', CODEX_OAUTH_CLIENT_ID);
          urlObj.searchParams.set('redirect_uri', flow.redirectUri);
          urlObj.searchParams.set('scope', 'openid profile email offline_access');
          urlObj.searchParams.set('code_challenge', codeChallenge);
          urlObj.searchParams.set('code_challenge_method', 'S256');
          urlObj.searchParams.set('id_token_add_organizations', 'true');
          urlObj.searchParams.set('codex_cli_simplified_flow', 'true');
          urlObj.searchParams.set('state', flow.stateToken);
          flow.authUrl = urlObj.toString();
          resolve();
        });
      });

      try {
        await startLoopback(1455);
      } catch {
        await startLoopback(0);
      }

      flow.expiryTimer = setTimeout(() => {
        if (flow.status === 'pending') {
          flow.status = 'expired';
          flow.error = 'Codex OAuth 授权已超时，请重新发起。';
          closeFlowHandles(flow);
        }
      }, 5 * 60_000);
      flow.expiryTimer.unref?.();
      flows.set(flowId, flow);

      try {
        const loopbackOrigins = [];
        if (flow.redirectUri) {
          const orig = new URL(flow.redirectUri).origin;
          loopbackOrigins.push(orig, orig.replace('localhost', '127.0.0.1'));
        }
        await launchOAuthBrowser(flow, {
          url: flow.authUrl,
          title: 'Codex OAuth 授权',
          allowedLoopbackOrigins: loopbackOrigins,
        });
      } catch {}
      return sanitizeFlow(flow);
    }

    if (appId === 'copilot') {
      const proxyUrl = effectiveProxyUrl();
      const form = new URLSearchParams({
        client_id: COPILOT_VSCODE_CLIENT_ID,
        scope: 'read:user',
      });
      const devRes = await httpRequestWithProxy({
        url: GITHUB_DEVICE_CODE_URL,
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        proxyUrl,
        fetchImpl,
      });
      if (!devRes.ok || !devRes.data?.device_code || !devRes.data?.user_code) {
        throw fail('OAUTH_TOKEN_EXCHANGE_FAILED', '无法向 GitHub 申请设备授权码，请检查网络环境。');
      }

      const intervalMs = Math.max(5000, (Number(devRes.data.interval) || 5) * 1000);
      const expiresSec = Number(devRes.data.expires_in) || 600;
      const flow = {
        flowId,
        appId,
        alias,
        mode: 'device_code',
        status: 'pending',
        deviceCode: devRes.data.device_code,
        userCode: devRes.data.user_code,
        verificationUri: devRes.data.verification_uri || 'https://github.com/login/device',
        authUrl: devRes.data.verification_uri || 'https://github.com/login/device',
        expiresAt: new Date(Date.now() + expiresSec * 1000).toISOString(),
        error: null,
        account: null,
        server: null,
        expiryTimer: null,
        pollTimer: null,
      };
      flows.set(flowId, flow);

      const pollOnce = async () => {
        if (flow.status !== 'pending') return;
        try {
          const tokForm = new URLSearchParams({
            client_id: COPILOT_VSCODE_CLIENT_ID,
            device_code: flow.deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          });
          const tokRes = await httpRequestWithProxy({
            url: GITHUB_OAUTH_TOKEN_URL,
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: tokForm.toString(),
            proxyUrl: effectiveProxyUrl(),
            fetchImpl,
          });
          if (flow.status !== 'pending') return;
          if (tokRes.data?.access_token) {
            const accessToken = tokRes.data.access_token;
            const curProxy = effectiveProxyUrl();
            const userRes = await httpRequestWithProxy({
              url: GITHUB_USER_URL,
              method: 'GET',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'DingtuDesktop/0.2.0',
              },
              proxyUrl: curProxy,
              fetchImpl,
            }).catch(() => null);
            const quotaMeta = await fetchCopilotQuota({ accessToken, proxyUrl: curProxy, fetchImpl }).catch(() => null);
            const login = userRes?.data?.login || flow.alias;
            const email = userRes?.data?.email || null;
            const account = await onAccountAuthorized({
              appId: 'copilot',
              alias: flow.alias,
              label: login,
              email,
              plan: quotaMeta?.plan || 'GitHub',
              oauthToken: accessToken,
              quotas: quotaMeta?.quotas || [],
              quotaState: quotaMeta?.quotas?.length ? 'synced' : 'local_detected',
              source: 'oauth',
            });
            flow.status = 'completed';
            flow.account = account;
            closeFlowHandles(flow);
            return;
          }
          if (tokRes.data?.error === 'expired_token' || tokRes.data?.error === 'access_denied') {
            flow.status = 'failed';
            flow.error = tokRes.data.error === 'access_denied' ? '已拒绝 GitHub 授权。' : '设备授权码已过期。';
            closeFlowHandles(flow);
            return;
          }
        } catch {}
        if (flow.status === 'pending') {
          flow.pollTimer = setTimeout(pollOnce, intervalMs);
          flow.pollTimer.unref?.();
        }
      };

      flow.expiryTimer = setTimeout(() => {
        if (flow.status === 'pending') {
          flow.status = 'expired';
          flow.error = 'GitHub 设备授权已超时，请重新发起。';
          closeFlowHandles(flow);
        }
      }, expiresSec * 1000);
      flow.expiryTimer.unref?.();
      flow.pollTimer = setTimeout(pollOnce, intervalMs);
      flow.pollTimer.unref?.();

      try {
        await launchOAuthBrowser(flow, {
          url: flow.verificationUri,
          title: `GitHub Copilot 授权（验证码：${flow.userCode}）`,
          allowedLoopbackOrigins: [],
        });
      } catch {}
      return sanitizeFlow(flow);
    }

    if (appId === 'kiro') {
      const proxyUrl = effectiveProxyUrl();
      const oidcBase = `https://oidc.${KIRO_DEFAULT_REGION}.amazonaws.com`;
      const regRes = await httpRequestWithProxy({
        url: `${oidcBase}/client/register`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: {
          clientName: 'Dingtu Workbench',
          clientType: 'public',
          scopes: [
            'codewhisperer:completions',
            'codewhisperer:analysis',
            'codewhisperer:conversations',
            'codewhisperer:transformations',
            'codewhisperer:taskassist',
          ],
        },
        proxyUrl,
        fetchImpl,
      });
      if (!regRes.ok || !regRes.data?.clientId || !regRes.data?.clientSecret) {
        throw fail('OAUTH_TOKEN_EXCHANGE_FAILED', 'AWS Builder ID 客户端注册失败，请检查网络环境。');
      }
      const { clientId, clientSecret } = regRes.data;
      const devRes = await httpRequestWithProxy({
        url: `${oidcBase}/device_authorization`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: { clientId, clientSecret, startUrl: KIRO_START_URL },
        proxyUrl,
        fetchImpl,
      });
      if (!devRes.ok || !devRes.data?.deviceCode || !devRes.data?.userCode) {
        throw fail('OAUTH_TOKEN_EXCHANGE_FAILED', 'Kiro AWS Builder ID 设备码申请失败。');
      }

      const intervalMs = Math.max(3000, (Number(devRes.data.interval) || 5) * 1000);
      const expiresSec = Number(devRes.data.expiresIn) || 600;
      const verifyUrl = devRes.data.verificationUriComplete || devRes.data.verificationUri || KIRO_START_URL;
      const flow = {
        flowId,
        appId: 'kiro',
        alias,
        mode: 'device_code',
        status: 'pending',
        deviceCode: devRes.data.deviceCode,
        clientId,
        clientSecret,
        userCode: devRes.data.userCode,
        verificationUri: verifyUrl,
        authUrl: verifyUrl,
        expiresAt: new Date(Date.now() + expiresSec * 1000).toISOString(),
        error: null,
        account: null,
        server: null,
        expiryTimer: null,
        pollTimer: null,
      };
      flows.set(flowId, flow);

      const pollOnce = async () => {
        if (flow.status !== 'pending') return;
        try {
          const tokRes = await httpRequestWithProxy({
            url: `${oidcBase}/token`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: {
              clientId: flow.clientId,
              clientSecret: flow.clientSecret,
              deviceCode: flow.deviceCode,
              grantType: 'urn:ietf:params:oauth:grant-type:device_code',
            },
            proxyUrl: effectiveProxyUrl(),
            fetchImpl,
          });
          if (flow.status !== 'pending') return;
          if (tokRes.ok && tokRes.data?.accessToken) {
            const expiresIn = Number(tokRes.data.expiresIn) || 3600;
            const expiryIso = new Date(Date.now() + expiresIn * 1000).toISOString();
            const account = await onAccountAuthorized({
              appId: 'kiro',
              alias: flow.alias,
              label: `Kiro Builder ID (${flow.alias})`,
              email: null,
              plan: 'Builder ID',
              oauthToken: tokRes.data.accessToken,
              refreshToken: tokRes.data.refreshToken || null,
              tokenExpiry: expiryIso,
              quotaState: 'local_detected',
              source: 'oauth',
              extraMeta: {
                authMethod: 'IdC',
                region: KIRO_DEFAULT_REGION,
                startUrl: KIRO_START_URL,
                clientId: flow.clientId,
                clientSecret: flow.clientSecret,
              },
            });
            flow.status = 'completed';
            flow.account = account;
            closeFlowHandles(flow);
            return;
          }
          if (tokRes.data?.error === 'expired_token' || tokRes.data?.error === 'access_denied') {
            flow.status = 'failed';
            flow.error = tokRes.data.error === 'access_denied' ? '已拒绝 AWS Builder ID 授权。' : '设备授权码已过期。';
            closeFlowHandles(flow);
            return;
          }
        } catch {}
        if (flow.status === 'pending') {
          flow.pollTimer = setTimeout(pollOnce, intervalMs);
          flow.pollTimer.unref?.();
        }
      };

      flow.expiryTimer = setTimeout(() => {
        if (flow.status === 'pending') {
          flow.status = 'expired';
          flow.error = 'Kiro 设备授权已超时，请重新发起。';
          closeFlowHandles(flow);
        }
      }, expiresSec * 1000);
      flow.expiryTimer.unref?.();
      flow.pollTimer = setTimeout(pollOnce, intervalMs);
      flow.pollTimer.unref?.();

      try {
        await launchOAuthBrowser(flow, {
          url: verifyUrl,
          title: `Kiro AWS Builder ID 授权（验证码：${flow.userCode}）`,
          allowedLoopbackOrigins: [],
        });
      } catch {}
      return sanitizeFlow(flow);
    }

    const webSpec = WEB_LOGIN_TARGETS[appId];
    if (webSpec && typeof openWebLoginWindow === 'function') {
      const flow = {
        flowId,
        appId,
        alias,
        mode: 'web_window',
        status: 'pending',
        authUrl: webSpec.url,
        verificationUri: webSpec.url,
        expiresAt,
        error: null,
        account: null,
        server: null,
        expiryTimer: null,
        pollTimer: null,
        disposeWindow: null,
      };
      flows.set(flowId, flow);

      flow.expiryTimer = setTimeout(() => {
        if (flow.status === 'pending') {
          flow.status = 'expired';
          flow.error = '内置登录窗口已超时，请重试。';
          closeFlowHandles(flow);
        }
      }, 5 * 60_000);
      flow.expiryTimer.unref?.();

      try {
        const handle = await openWebLoginWindow({
          appId,
          alias,
          url: webSpec.url,
          origins: webSpec.origins,
          cookieNames: webSpec.cookieNames,
          onCaptured: async captured => {
            if (flow.status !== 'pending') return;
            try {
              const cookieValue = captured?.cookieValue || '';
              const email = captured?.email || null;
              const account = await onAccountAuthorized({
                appId,
                alias: flow.alias,
                email,
                label: email || captured?.label || `${webSpec.labelPrefix} (${flow.alias})`,
                plan: captured?.plan || null,
                usageData: captured?.usageData || null,
                oauthToken: appId === 'cursor' && cookieValue.includes('%3A%3A')
                  ? decodeURIComponent(cookieValue).split('::').slice(1).join('::') || null
                  : (captured?.accessToken || null),
                quotaState: captured?.usageData ? 'synced' : 'local_detected',
                source: 'oauth',
                extraMeta: {
                  sessionCookie: cookieValue || null,
                  cookieName: captured?.cookieName || webSpec.cookieNames[0],
                  ...(captured?.extraMeta || {}),
                },
              });
              flow.status = 'completed';
              flow.account = account;
              flow.error = null;
            } catch (err) {
              flow.status = 'failed';
              flow.error = err?.message || '网页会话凭据保存失败。';
            } finally {
              closeFlowHandles(flow);
            }
          },
          onClosed: () => {
            if (flow.status === 'pending') {
              flow.status = 'cancelled';
              flow.error = '已关闭官方登录窗口。';
              closeFlowHandles(flow);
            }
          },
        });
        flow.disposeWindow = handle?.close || null;
      } catch (err) {
        flow.status = 'failed';
        flow.error = err?.message || '无法打开内置登录窗口。';
        closeFlowHandles(flow);
      }
      return sanitizeFlow(flow);
    }

    throw fail('OAUTH_FLOW_UNSUPPORTED', '该应用暂不支持网页 OAuth 一键登录，请使用 Token 导入、本机导入或官网登录。');
  }

  async function submitCallback({ flowId, callbackUrl }) {
    const flow = flows.get(flowId);
    if (!flow) throw fail('OAUTH_FLOW_NOT_FOUND', '授权会话不存在或已结束。');
    if (!['antigravity', 'gemini-cli', 'codex', 'codex-desktop'].includes(flow.appId)) {
      throw fail('OAUTH_FLOW_UNSUPPORTED', '当前授权流程不需要手动提交回调地址。');
    }
    let code = '';
    const trimmed = String(callbackUrl || '').trim();
    if (!trimmed) throw fail('OAUTH_TOKEN_EXCHANGE_FAILED', '请粘贴完整的回调 URL 或授权码。');
    if (/^https?:\/\//i.test(trimmed)) {
      let parsed;
      try { parsed = new URL(trimmed); } catch { throw fail('OAUTH_TOKEN_EXCHANGE_FAILED', '回调 URL 格式无效。'); }
      code = parsed.searchParams.get('code') || '';
      const st = parsed.searchParams.get('state');
      if (st && st !== flow.stateToken) throw fail('OAUTH_TOKEN_EXCHANGE_FAILED', '授权状态校验不匹配，请重新发起授权。');
    } else {
      code = trimmed;
    }
    if (!code) throw fail('OAUTH_TOKEN_EXCHANGE_FAILED', '回调中未找到有效的授权码 (code)。');
    if (flow.appId === 'codex' || flow.appId === 'codex-desktop') {
      await completeCodexAuthorization(flow, code);
    } else {
      await completeGoogleAuthorization(flow, code);
    }
    return sanitizeFlow(flow);
  }

  function status({ flowId }) {
    const flow = flows.get(flowId);
    if (!flow) throw fail('OAUTH_FLOW_NOT_FOUND', '授权会话不存在或已过期。');
    return sanitizeFlow(flow);
  }

  function cancel({ flowId }) {
    const flow = flows.get(flowId);
    if (!flow) return Object.freeze({ cancelled: false });
    if (flow.status === 'pending') {
      flow.status = 'cancelled';
      flow.error = '已取消 OAuth 授权。';
    }
    closeFlowHandles(flow);
    return Object.freeze({ cancelled: true, status: sanitizeFlow(flow) });
  }

  function dispose() {
    for (const flow of flows.values()) {
      closeFlowHandles(flow);
    }
    flows.clear();
  }

  return Object.freeze({
    start,
    submitCallback,
    status,
    cancel,
    dispose,
  });
}
