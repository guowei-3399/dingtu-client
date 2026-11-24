import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { getBuiltInAgentAdapter } from './builtin-agent-adapters.mjs';
import {
  readAntigravityActiveHints,
  readAntigravityCredential,
  writeAntigravityCredential,
} from './antigravity-credential-helper.mjs';
import { discoverLocalAccounts } from './local-account-importers.mjs';
import {
  fetchAntigravityQuota,
  fetchCopilotQuota,
  fetchGoogleUserInfo,
  httpRequestWithProxy,
  refreshAntigravityToken,
  refreshClaudeCodeToken,
  refreshCodexToken,
  refreshGeminiCliToken,
  refreshKiroToken,
} from './oauth-account-flow.mjs';

const requireFromHere = createRequire(import.meta.url);
const fail = (code, message = code, status = 0) => Object.assign(new Error(message), { code, ...(status ? { status } : {}) });

export const SUPPORTED_WORKBENCH_APPS = Object.freeze([
  'antigravity',
  'codex',
  'codex-cli',
  'codex-desktop',
  'copilot',
  'windsurf',
  'kiro',
  'cursor',
  'grok-cli',
  'claude-code',
  'gemini-cli',
  'claude-desktop',
  'metamuse',
  'manus',
  'chatgpt',
  'claude',
  'gemini-web',
  'grok',
]);

const supportedAppSet = new Set(SUPPORTED_WORKBENCH_APPS);
const webContainerApps = new Set(['metamuse', 'manus', 'chatgpt', 'claude', 'gemini-web', 'grok']);
const pureWebContainerApps = new Set(['metamuse', 'manus', 'gemini-web']);
const aliasPattern = /^[a-z][a-z0-9_-]{0,31}$/;
const MAX_ACCOUNTS_PER_APP = 64;
const MAX_TOTP_ENTRIES = 100;
const MAX_TOTP_HISTORY = 25;
const MAX_GROUPS = 24;
const MAX_SWITCH_HISTORY = 15;

function canonicalAppId(appId) {
  if (appId === 'codex-cli') return 'codex';
  return appId;
}

function adapterIdForApp(appId, platform) {
  if (appId === 'codex') return 'codex-cli';
  if (appId === 'metamuse') return platform === 'macos' ? 'muse-desktop' : null;
  if (webContainerApps.has(appId)) return null;
  return appId;
}

function clampPct(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function toneForPct(pct) {
  if (pct === null || !Number.isFinite(pct)) return 'neutral';
  if (pct >= 50) return 'high';
  if (pct >= 20) return 'mid';
  return 'low';
}

function cleanText(value, maxLen = 120) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLen);
}

function sanitizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const clean = cleanText(String(item || ''), 24);
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    out.push(clean);
    if (out.length >= 10) break;
  }
  return out;
}

function sanitizeAliasCandidate(raw, fallback = 'acct') {
  const base = String(raw || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  if (/^[a-z][a-z0-9_-]{0,31}$/.test(base)) return base;
  return `${fallback}-${crypto.randomBytes(3).toString('hex')}`;
}

function decodeJwtPayload(token) {
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

function normalizeEmail(value) {
  const clean = cleanText(typeof value === 'string' ? value : '', 160).toLowerCase();
  return clean && clean.includes('@') ? clean : null;
}

function extractCodexIdentityFromAuthObject(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { email: null, accountId: null, sub: null };
  }
  const idPayload = decodeJwtPayload(parsed?.tokens?.id_token);
  const authMeta = idPayload?.['https://api.openai.com/auth'];
  const email = normalizeEmail(idPayload?.email) || normalizeEmail(parsed?.email);
  const accountId = cleanText(
    parsed?.tokens?.account_id
    || authMeta?.chatgpt_account_id
    || idPayload?.chatgpt_account_id
    || '',
    96,
  ) || null;
  const sub = cleanText(idPayload?.sub || '', 120) || null;
  return { email, accountId, sub };
}

function extractCodexIdentityFromBuffer(buf) {
  try {
    const parsed = JSON.parse(Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf || ''));
    return extractCodexIdentityFromAuthObject(parsed);
  } catch {
    return { email: null, accountId: null, sub: null };
  }
}

function codexIdentityMatchesRecord(identity, record) {
  if (!identity || !record) return false;
  const recIdPayload = decodeJwtPayload(record.idToken);
  const recAuthMeta = recIdPayload?.['https://api.openai.com/auth'];
  const recEmail = normalizeEmail(record.email) || normalizeEmail(recIdPayload?.email);
  const recAccountId = cleanText(record.extraMeta?.accountId || recAuthMeta?.chatgpt_account_id || '', 96) || null;
  const recSub = cleanText(recIdPayload?.sub || '', 120) || null;

  if (identity.email && recEmail && identity.email !== recEmail) return false;
  if (identity.accountId && recAccountId && identity.accountId !== recAccountId) return false;
  if (identity.sub && recSub && identity.sub !== recSub) return false;

  return Boolean(
    (identity.email && recEmail && identity.email === recEmail)
    || (identity.accountId && recAccountId && identity.accountId === recAccountId)
    || (identity.sub && recSub && identity.sub === recSub),
  );
}

function normalizeHandle(value) {
  const clean = cleanText(typeof value === 'string' ? value : '', 160).toLowerCase();
  return clean || null;
}

function parseJsonObject(input) {
  try {
    const raw = Buffer.isBuffer(input) ? input.toString('utf8') : String(input || '');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function diskIdentityMatchesPrevAccount(diskEmail, prevAccount, diskHandle = null) {
  const prevEmail = normalizeEmail(prevAccount?.email) || normalizeEmail(prevAccount?.label);
  if (prevEmail) return Boolean(normalizeEmail(diskEmail) && normalizeEmail(diskEmail) === prevEmail);
  if (diskHandle !== null) {
    const prevHandle = normalizeHandle(prevAccount?.label);
    const genericLabel = /本机账号|本机配置|本机已登录会话/.test(prevAccount?.label || '');
    if (prevHandle && !genericLabel) return normalizeHandle(diskHandle) === prevHandle;
  }
  return true;
}

function targetEmailConflicts(candidateEmail, record) {
  const targetEmail = normalizeEmail(record?.email) || normalizeEmail(record?.label);
  const cand = normalizeEmail(candidateEmail);
  return Boolean(targetEmail && cand && cand !== targetEmail);
}

function extractWhamWindowQuotas(data, nowMs) {
  if (!data || typeof data !== 'object') return [];
  const rateLimit = data.rate_limit || {};
  let fiveHourEntry = null;
  let weeklyEntry = null;

  for (const [slotKey, defaultKind] of [['primary_window', '5h'], ['secondary_window', 'weekly']]) {
    const win = rateLimit[slotKey];
    if (!win || typeof win.used_percent !== 'number') continue;
    const kind = Number.isFinite(win.limit_window_seconds)
      ? (win.limit_window_seconds >= 86400 ? 'weekly' : '5h')
      : defaultKind;
    const pct = clampPct(100 - win.used_percent);
    let resetAt = null;
    if (Number.isFinite(win.reset_at)) resetAt = new Date(win.reset_at * 1000).toISOString();
    else if (Number.isFinite(win.reset_after_seconds)) resetAt = new Date(nowMs + win.reset_after_seconds * 1000).toISOString();
    if (kind === '5h' && !fiveHourEntry) {
      fiveHourEntry = {
        id: 'primary_window',
        label: '5h 限额',
        remainingPct: pct,
        usedText: `${pct}% 剩余`,
        resetAt,
        tone: toneForPct(pct),
      };
    } else if (kind === 'weekly' && !weeklyEntry) {
      weeklyEntry = {
        id: 'secondary_window',
        label: '周限额',
        remainingPct: pct,
        usedText: `${pct}% 剩余`,
        resetAt,
        tone: toneForPct(pct),
      };
    }
  }

  const quotas = [];
  if (fiveHourEntry || weeklyEntry) {
    quotas.push(fiveHourEntry || {
      id: 'primary_window',
      label: '5h 限额',
      remainingPct: null,
      usedText: '—',
      statusHint: weeklyEntry?.remainingPct === 0 ? '周额度已用尽' : '当前套餐未返回 5h 窗口',
      resetAt: null,
      tone: 'neutral',
    });
    quotas.push(weeklyEntry || {
      id: 'secondary_window',
      label: '周限额',
      remainingPct: null,
      usedText: '—',
      statusHint: '当前套餐未返回周窗口',
      resetAt: null,
      tone: 'neutral',
    });
  }

  const reviewWin = data.code_review_rate_limit?.primary_window;
  if (reviewWin && typeof reviewWin.used_percent === 'number') {
    const pct = clampPct(100 - reviewWin.used_percent);
    const resetAt = Number.isFinite(reviewWin.reset_at) ? new Date(reviewWin.reset_at * 1000).toISOString() : null;
    quotas.push({
      id: 'code_review',
      label: '代码审查',
      remainingPct: pct,
      usedText: `${pct}% 剩余`,
      resetAt,
      tone: toneForPct(pct),
    });
  }
  return quotas;
}

function extractAnthropicWindowQuotas(data, { includeModels = true } = {}) {
  if (!data || typeof data !== 'object') return [];
  const makeEntry = (key, label) => {
    const bucket = data[key];
    if (!bucket || typeof bucket.utilization !== 'number') return null;
    const remainingPct = clampPct(100 - bucket.utilization);
    return {
      id: key,
      label,
      remainingPct,
      usedText: `${remainingPct}% 剩余`,
      resetAt: typeof bucket.resets_at === 'string' ? bucket.resets_at : null,
      tone: toneForPct(remainingPct),
    };
  };

  const fiveHour = makeEntry('five_hour', '5h 限额');
  const sevenDay = makeEntry('seven_day', '7d 限额');
  const quotas = [];
  if (fiveHour || sevenDay) {
    quotas.push(fiveHour || {
      id: 'five_hour',
      label: '5h 限额',
      remainingPct: null,
      usedText: '—',
      statusHint: sevenDay?.remainingPct === 0 ? '周额度已用尽' : '接口未返回 5h 窗口',
      resetAt: null,
      tone: 'neutral',
    });
    quotas.push(sevenDay || {
      id: 'seven_day',
      label: '7d 限额',
      remainingPct: null,
      usedText: '—',
      statusHint: '接口未返回周窗口',
      resetAt: null,
      tone: 'neutral',
    });
  } else if (Object.hasOwn(data, 'five_hour') || Object.hasOwn(data, 'seven_day')) {
    // claude.ai /usage returns {"five_hour": null, "seven_day": null} when 0 messages have been sent in the active window (100% remaining).
    quotas.push({
      id: 'five_hour',
      label: '5h 限额',
      remainingPct: 100,
      usedText: '100% 剩余',
      resetAt: null,
      tone: 'high',
    });
    quotas.push({
      id: 'seven_day',
      label: '7d 限额',
      remainingPct: 100,
      usedText: '100% 剩余',
      resetAt: null,
      tone: 'high',
    });
  }
  if (includeModels) {
    for (const [key, label] of [['seven_day_opus', 'Opus · 7d'], ['seven_day_sonnet', 'Sonnet · 7d']]) {
      const m = makeEntry(key, label);
      if (m) quotas.push(m);
    }
  }
  return quotas;
}

function applyQuotaFailureToRecord(record, { appLabel = '账号', status = 0, data = null, refreshErr = null, defaultMessage = '' } = {}) {
  const codeStatus = Number(status) || Number(refreshErr?.status) || 0;
  let errBlob = '';
  try {
    errBlob = JSON.stringify({
      d: data ?? null,
      rd: refreshErr?.upstreamData ?? null,
      m: refreshErr?.message || '',
    }).toLowerCase();
  } catch {
    errBlob = String(refreshErr?.message || '').toLowerCase();
  }

  const isExplicitForbidden = refreshErr?.isForbidden !== false;
  const isBannedOrDeactivated = isExplicitForbidden && (/account_deactivated|deactivated_workspace|user_not_found|account_not_found|account_suspended|account_banned|organization_disabled|user_banned|access_terminated|account_disabled|account has been disabled|account is deactivated|account.*suspended|account.*banned|account.*terminated|account.*deleted/.test(errBlob)
    || (codeStatus === 403 && /deactivat|suspend|ban|disable|terminat|not_found|verify your account|validation_required/.test(errBlob)));
  if (isBannedOrDeactivated) {
    record.status = 'banned';
    record.quotaState = 'refresh_failed';
    record.quotas = [];
    record.lastError = `${appLabel} 账号已被封禁、停用或已注销（上游拒绝访问）`;
    return false;
  }

  const isAuthRevokedOrInvalid = codeStatus === 401
    || /invalid_refresh_token|invalid_grant|token_revoked|refresh_token_reused|refresh_token_expired|invalid_jwt|invalid_token|token has been expired or revoked/.test(errBlob);
  if (isAuthRevokedOrInvalid) {
    record.status = 'invalid';
    record.quotaState = 'refresh_failed';
    record.quotas = [];
    record.lastError = `${appLabel} 登录凭据已失效或账号已封号/注销（${codeStatus || 401}），请重新验证或移除`;
    return false;
  }

  record.quotaState = 'refresh_failed';
  record.lastError = cleanText(defaultMessage || `${appLabel} 配额查询失败 (${codeStatus || 'network'})`, 140);
  return false;
}

function preserveValidAntigravityPartnerQuotas(nextQuotas) {
  // Cloud Code primary endpoint (daily-cloudcode-pa) is the single source of truth;
  // never retain stale synthetic partner entries (resetAt: null) from previous refreshes.
  return Array.isArray(nextQuotas) ? nextQuotas : [];
}

const vaultSleepBuf = new Int32Array(new SharedArrayBuffer(4));
function pauseVaultSyncMs(ms) {
  try { Atomics.wait(vaultSleepBuf, 0, 0, ms); } catch {}
}

function atomicWriteBuffer(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, content, { mode: 0o600 });
  const lockCodes = new Set(['EBUSY', 'EPERM', 'EACCES']);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      renameSync(tmp, filePath);
      return;
    } catch (err) {
      if (!lockCodes.has(err?.code) || attempt === 4) {
        if (lockCodes.has(err?.code)) {
          try {
            writeFileSync(filePath, content, { mode: 0o600 });
            try { unlinkSync(tmp); } catch {}
            return;
          } catch {}
        }
        try { unlinkSync(tmp); } catch {}
        throw err;
      }
      pauseVaultSyncMs(40 * (attempt + 1));
    }
  }
}

function loadSqliteModule() {
  try {
    const mod = requireFromHere('node:sqlite');
    return typeof mod?.DatabaseSync === 'function' ? mod : null;
  } catch {
    return null;
  }
}

// RFC 4648 Base32 decoding & RFC 6238 TOTP generation
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function decodeBase32(input) {
  const clean = String(input || '').toUpperCase().replace(/[\s-]+/g, '').replace(/=+$/, '');
  if (!clean || clean.length < 8 || clean.length > 256 || !/^[A-Z2-7]+$/.test(clean)) {
    throw fail('TOTP_SECRET_INVALID', '2FA 秘钥格式无效，请输入至少 8 位的 Base32 秘钥或 otpauth:// 链接。');
  }
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw fail('TOTP_SECRET_INVALID', '2FA 秘钥包含无效字符。');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  if (!bytes.length) throw fail('TOTP_SECRET_INVALID', '2FA 秘钥解析结果为空。');
  return { normalizedSecret: clean, keyBuffer: Buffer.from(bytes) };
}

export function parseTotpInput(rawInput, overrideName = '') {
  const raw = typeof rawInput === 'string' ? rawInput.trim() : '';
  if (!raw || raw.length > 1024) {
    throw fail('TOTP_SECRET_INVALID', '请输入有效的 otpauth:// 链接或 Base32 秘钥。');
  }
  let secretStr = raw;
  let name = cleanText(overrideName, 80);
  let issuer = '';
  let algorithm = 'SHA1';
  let digits = 6;
  let period = 30;

  if (/^otpauth:\/\//i.test(raw)) {
    let parsed;
    try { parsed = new URL(raw); } catch { throw fail('TOTP_SECRET_INVALID', 'otpauth:// 链接格式无效。'); }
    if (parsed.hostname.toLowerCase() !== 'totp') {
      throw fail('TOTP_SECRET_INVALID', '仅支持 otpauth://totp/... 类型动态口令。');
    }
    secretStr = parsed.searchParams.get('secret') || '';
    const labelPath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    const paramIssuer = cleanText(parsed.searchParams.get('issuer') || '', 48);
    if (labelPath.includes(':')) {
      const [prefix, ...rest] = labelPath.split(':');
      issuer = paramIssuer || cleanText(prefix, 48);
      if (!name) name = cleanText(rest.join(':'), 80);
    } else if (!name) {
      name = cleanText(labelPath, 80);
      issuer = paramIssuer;
    } else {
      issuer = paramIssuer;
    }
    const rawAlgo = (parsed.searchParams.get('algorithm') || 'SHA1').toUpperCase();
    if (!['SHA1', 'SHA256', 'SHA512'].includes(rawAlgo)) throw fail('TOTP_SECRET_INVALID', '不支持的 2FA 哈希算法。');
    algorithm = rawAlgo;
    const rawDigits = Number(parsed.searchParams.get('digits') || 6);
    if (![6, 8].includes(rawDigits)) throw fail('TOTP_SECRET_INVALID', '2FA 位数仅支持 6 位或 8 位。');
    digits = rawDigits;
    const rawPeriod = Number(parsed.searchParams.get('period') || 30);
    if (!Number.isSafeInteger(rawPeriod) || rawPeriod < 15 || rawPeriod > 120) {
      throw fail('TOTP_SECRET_INVALID', '2FA 周期仅支持 15–120 秒。');
    }
    period = rawPeriod;
  }

  const { normalizedSecret } = decodeBase32(secretStr);
  return {
    secret: normalizedSecret,
    name: name || issuer || `密钥 ${normalizedSecret.slice(0, 4)}`,
    issuer: issuer || '',
    algorithm,
    digits,
    period,
  };
}

export function generateTotpCode({ secret, algorithm = 'SHA1', digits = 6, period = 30 }, nowMs = Date.now()) {
  const { keyBuffer } = decodeBase32(secret);
  const sec = Math.floor(nowMs / 1000);
  const counter = Math.floor(sec / period);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter), 0);
  const hmac = crypto.createHmac(algorithm.toLowerCase(), keyBuffer).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  const code = String(binary % (10 ** digits)).padStart(digits, '0');
  const remainingSeconds = period - (sec % period);
  return { code, period, remainingSeconds };
}

function maskSecretPreview(secret) {
  const s = String(secret || '');
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

function projectTotpItem(entry, nowMs) {
  const live = generateTotpCode(entry, nowMs);
  return Object.freeze({
    id: entry.id,
    name: entry.name,
    issuer: entry.issuer || '',
    maskedSecret: maskSecretPreview(entry.secret),
    digits: entry.digits || 6,
    period: live.period,
    code: live.code,
    remainingSeconds: live.remainingSeconds,
    createdAt: entry.createdAt || null,
    lastUsedAt: entry.lastUsedAt || null,
  });
}

function credentialHintForRecord(record) {
  if (record.oauthToken || record.refreshToken) return 'token_ready';
  if (record.extraMeta?.sessionCookie) return 'session_cookie';
  if (webContainerApps.has(record.appId)) return 'container_only';
  return 'missing_credential';
}

function projectAccount(record, activeId, groups = []) {
  const accountKey = `${record.appId}:${record.id}`;
  const matchedGroups = groups
    .filter(g => Array.isArray(g.accountKeys) && g.accountKeys.includes(accountKey))
    .map(g => g.id);

  return Object.freeze({
    id: record.id,
    appId: record.appId,
    label: record.label,
    email: record.email || null,
    plan: record.plan || null,
    source: record.source,
    isActive: activeId === record.id,
    status: record.status || 'ready',
    quotaState: record.quotaState || 'session_only',
    credentialHint: credentialHintForRecord(record),
    lastError: record.lastError ? cleanText(String(record.lastError), 140) : null,
    quotas: Array.isArray(record.quotas) ? record.quotas.map(item => ({
      id: item.id,
      label: item.label,
      remainingPct: clampPct(item.remainingPct),
      usedText: cleanText(item.usedText || '', 64),
      statusHint: item.statusHint ? cleanText(String(item.statusHint), 48) : null,
      resetAt: item.resetAt || null,
      tone: item.tone || toneForPct(clampPct(item.remainingPct)),
      ...(typeof item.summaryExhausted === 'boolean' ? { summaryExhausted: item.summaryExhausted } : {}),
    })) : [],
    credits: Array.isArray(record.credits) ? record.credits.map(c => ({
      type: cleanText(String(c.type || ''), 32),
      amount: cleanText(String(c.amount || ''), 32),
    })) : [],
    tags: Array.isArray(record.tags) ? [...record.tags] : [],
    groups: matchedGroups,
    note: typeof record.note === 'string' ? record.note : '',
    switchHistory: Array.isArray(record.switchHistory) ? [...record.switchHistory] : [],
    lastCheckedAt: record.lastCheckedAt || null,
    lastSwitchedAt: record.lastSwitchedAt || null,
    updatedAt: record.updatedAt || null,
  });
}

function isTokenExpiringSoon(expiryIso, nowMs) {
  if (!expiryIso) return false;
  const parsed = typeof expiryIso === 'number' ? expiryIso : Date.parse(expiryIso);
  if (!Number.isFinite(parsed)) return false;
  return parsed - nowMs < 300_000;
}

function pickCursorUserId(accessToken, cookieStr = '') {
  if (cookieStr && cookieStr.includes('::')) {
    return decodeURIComponent(cookieStr).split('::')[0] || '';
  }
  if (cookieStr && cookieStr.includes('%3A%3A')) {
    return decodeURIComponent(cookieStr).split('::')[0] || '';
  }
  const claims = decodeJwtPayload(accessToken);
  const sub = typeof claims?.sub === 'string' ? claims.sub : '';
  if (!sub) return '';
  const pipe = sub.indexOf('|');
  return pipe >= 0 ? sub.slice(pipe + 1) : sub;
}

export function createWorkbenchAccountManager({
  platform = ({ win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform] || 'windows'),
  filePath,
  safeStorage,
  homeDir = os.homedir(),
  appDataDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  localAppDataDir = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  extraCcSwitchDirs = [],
  scanPortableDrives = homeDir === os.homedir(),
  launcher = null,
  proxyUrlProvider = () => null,
  environmentModeProvider = () => 'safe_tunnel',
  webSessionProber = null,
  execWindowsCred = null,
  fetchImpl = globalThis.fetch,
  now = Date.now,
} = {}) {
  if (typeof filePath !== 'string' || !filePath) throw fail('ACCOUNTS_CONFIG_INVALID', '账号保险库路径无效。');
  if (!safeStorage || typeof safeStorage.encryptString !== 'function' || typeof safeStorage.decryptString !== 'function') {
    throw fail('ACCOUNTS_CONFIG_INVALID', '系统加密组件不可用。');
  }

  let loaded = false;
  let state = {
    version: 1,
    accounts: [],
    activeByApp: {},
    totpEntries: [],
    totpHistory: [],
    groups: [],
    autoRefreshMinutes: 0,
    customDataDirs: {},
  };

  const currentMs = () => (typeof now === 'function' ? now() : Number(now) || Date.now());
  const currentIso = () => new Date(currentMs()).toISOString();

  function effectiveProxyUrl() {
    const mode = environmentModeProvider() === 'own_network' ? 'own_network' : 'safe_tunnel';
    return mode === 'safe_tunnel' ? proxyUrlProvider() : null;
  }

  function requireEncryptionAvailable() {
    if (typeof safeStorage.isEncryptionAvailable === 'function' && !safeStorage.isEncryptionAvailable()) {
      throw fail('SECURE_STORE_UNAVAILABLE', '本机安全存储不可用。');
    }
  }

  function pruneDroppedApps() {
    state.accounts = (Array.isArray(state.accounts) ? state.accounts : []).filter(
      item => item && supportedAppSet.has(canonicalAppId(item.appId)),
    );
    const nextActive = {};
    for (const [k, v] of Object.entries(state.activeByApp || {})) {
      const ck = canonicalAppId(k);
      if (supportedAppSet.has(ck) && typeof v === 'string') nextActive[ck] = v;
    }
    state.activeByApp = nextActive;
    state.groups = Array.isArray(state.groups) ? state.groups : [];
    state.autoRefreshMinutes = [0, 2, 5, 10].includes(state.autoRefreshMinutes) ? state.autoRefreshMinutes : 0;
    state.customDataDirs = state.customDataDirs && typeof state.customDataDirs === 'object' ? state.customDataDirs : {};
  }

  function decodeIdTokenEmailSync(idToken) {
    if (typeof idToken !== 'string') return null;
    const parts = idToken.split('.');
    if (parts.length < 2) return null;
    try {
      const norm = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = (4 - (norm.length % 4)) % 4;
      const obj = JSON.parse(Buffer.from(norm + '='.repeat(pad), 'base64').toString('utf8'));
      const em = cleanText(obj?.email || '', 160);
      return em && em.includes('@') ? em : null;
    } catch {
      return null;
    }
  }

  function resolveLocalEmailSync(appId, record) {
    const fromTok = decodeIdTokenEmailSync(record?.idToken);
    if (fromTok) return fromTok;
    try {
      if (appId === 'antigravity' || appId === 'gemini-cli') {
        const hints = readAntigravityActiveHints({
          platform: platform === 'windows' ? 'win32' : platform,
          homeDir,
          appDataDir,
        });
        if (hints.email) return hints.email;
        if (hints.appStorageEmail) return hints.appStorageEmail;
      } else if (appId === 'codex' || appId === 'codex-desktop') {
        for (const authPath of [
          path.join(homeDir, '.codex', 'auth.json'),
          path.join(homeDir, '.codex-cli', 'auth.json'),
        ]) {
          if (!existsSync(authPath)) continue;
          const obj = JSON.parse(readFileSync(authPath, 'utf8'));
          const em = decodeIdTokenEmailSync(obj?.tokens?.id_token) || cleanText(obj?.email || '', 160);
          if (em && em.includes('@')) return em;
        }
      } else if (appId === 'claude-code' || appId === 'claude-desktop') {
        const ccPath = path.join(homeDir, '.claude.json');
        if (existsSync(ccPath)) {
          const obj = JSON.parse(readFileSync(ccPath, 'utf8'));
          const em = cleanText(obj?.oauthAccount?.emailAddress || '', 160);
          if (em && em.includes('@')) return em;
        }
      } else if (appId === 'grok-cli') {
        const grokPath = path.join(homeDir, '.grok', 'auth.json');
        if (existsSync(grokPath)) {
          const parsed = JSON.parse(readFileSync(grokPath, 'utf8'));
          const activeScope = parsed?.default || parsed?.activeScope || null;
          const entry = (activeScope && parsed?.scopes?.[activeScope])
            || (parsed?.scopes && Object.values(parsed.scopes)[0])
            || parsed;
          const em = cleanText(entry?.email || parsed?.email || '', 160);
          if (em && em.includes('@')) return em;
        }
      }
    } catch {}
    return null;
  }

  function hydratePlaceholderIdentities() {
    let changed = false;
    for (const rec of state.accounts) {
      if (!rec) continue;
      const isPlaceholder = !rec.email
        || rec.label === '本机已登录会话'
        || (typeof rec.label === 'string' && (rec.label.includes('尚未登录') || rec.label.endsWith('本机账号')));
      if (!isPlaceholder) continue;
      const resolved = resolveLocalEmailSync(rec.appId, rec);
      if (resolved && (rec.email !== resolved || rec.label !== resolved)) {
        rec.email = resolved;
        rec.label = resolved;
        changed = true;
      }
    }
    if (changed) {
      try { saveVault(); } catch {}
    }
  }

  function ensureLoaded() {
    if (loaded) return;
    if (!existsSync(filePath)) {
      loaded = true;
      return;
    }
    requireEncryptionAvailable();
    try {
      const cipher = readFileSync(filePath);
      const plain = safeStorage.decryptString(cipher);
      const parsed = JSON.parse(plain);
      if (parsed && parsed.version === 1 && Array.isArray(parsed.accounts) && parsed.activeByApp && typeof parsed.activeByApp === 'object') {
        state = {
          version: 1,
          accounts: parsed.accounts,
          activeByApp: parsed.activeByApp,
          totpEntries: Array.isArray(parsed.totpEntries) ? parsed.totpEntries : [],
          totpHistory: Array.isArray(parsed.totpHistory) ? parsed.totpHistory : [],
          groups: Array.isArray(parsed.groups) ? parsed.groups : [],
          autoRefreshMinutes: Number.isInteger(parsed.autoRefreshMinutes) ? parsed.autoRefreshMinutes : 0,
          customDataDirs: parsed.customDataDirs && typeof parsed.customDataDirs === 'object' ? parsed.customDataDirs : {},
        };
        pruneDroppedApps();
        hydratePlaceholderIdentities();
      }
      loaded = true;
    } catch {
      state = {
        version: 1,
        accounts: [],
        activeByApp: {},
        totpEntries: [],
        totpHistory: [],
        groups: [],
        autoRefreshMinutes: 0,
        customDataDirs: {},
      };
      loaded = true;
    }
  }

  function saveVault() {
    requireEncryptionAvailable();
    const encrypted = safeStorage.encryptString(JSON.stringify(state));
    atomicWriteBuffer(filePath, encrypted);
  }

  function assertAppId(appId) {
    const normalized = canonicalAppId(appId);
    if (typeof normalized !== 'string' || !supportedAppSet.has(normalized)) {
      throw fail('ACCOUNT_APP_UNSUPPORTED', '不支持的应用标识。');
    }
    return normalized;
  }

  function assertAlias(alias) {
    if (typeof alias !== 'string' || !aliasPattern.test(alias)) {
      throw fail('ACCOUNT_ALIAS_INVALID', '账号标识只能使用小写字母、数字、下划线或短横线。');
    }
    return alias;
  }

  function list(appId = null) {
    ensureLoaded();
    hydratePlaceholderIdentities();
    const filterApp = appId ? assertAppId(appId) : null;
    const filtered = state.accounts
      .filter(item => !filterApp || item.appId === filterApp)
      .map(item => projectAccount(item, state.activeByApp[item.appId] || null, state.groups));
    return Object.freeze({
      accounts: Object.freeze(filtered),
      activeByApp: Object.freeze({ ...state.activeByApp }),
      groups: Object.freeze(state.groups.map(g => ({ ...g, accountKeys: [...(g.accountKeys || [])] }))),
    });
  }

  function upsertRecord(record) {
    ensureLoaded();
    const idx = state.accounts.findIndex(item => item.appId === record.appId && item.id === record.id);
    if (idx >= 0) {
      const existing = state.accounts[idx];
      const nextEmail = record.email || existing.email || null;
      const incomingLabel = record.label || existing.label;
      const shouldPromoteEmailToLabel = Boolean(
        nextEmail
        && (!incomingLabel || /已授权会话|默认安全容器|^Claude(?:\s+Web)?\s*\(|^ChatGPT\s*\(/i.test(incomingLabel)),
      );
      state.accounts[idx] = {
        ...existing,
        ...record,
        email: nextEmail,
        label: shouldPromoteEmailToLabel ? nextEmail : incomingLabel,
        plan: record.plan || existing.plan || null,
        quotas: Array.isArray(record.quotas) && record.quotas.length
          ? record.quotas
          : (record.quotas !== undefined && (!Array.isArray(existing.quotas) || !existing.quotas.length) ? record.quotas : existing.quotas),
        credits: record.credits !== undefined ? record.credits : existing.credits,
        quotaState: (Array.isArray(record.quotas) && record.quotas.length)
          ? 'synced'
          : (existing.quotaState === 'synced' && Array.isArray(existing.quotas) && existing.quotas.length && record.quotaState === 'container_ready'
            ? 'synced'
            : (record.quotaState || existing.quotaState)),
        tags: record.tags !== undefined ? record.tags : (existing.tags || []),
        note: record.note !== undefined ? record.note : (existing.note || ''),
        switchHistory: record.switchHistory !== undefined ? record.switchHistory : (existing.switchHistory || []),
        lastError: record.lastError !== undefined ? record.lastError : existing.lastError ?? null,
        extraMeta: { ...(existing.extraMeta || {}), ...(record.extraMeta || {}) },
        lastCheckedAt: record.lastCheckedAt || existing.lastCheckedAt,
        lastSwitchedAt: record.lastSwitchedAt || existing.lastSwitchedAt,
      };
    } else {
      const countForApp = state.accounts.filter(item => item.appId === record.appId).length;
      if (countForApp >= MAX_ACCOUNTS_PER_APP) {
        throw fail('ACCOUNT_LIMIT_REACHED', `单个应用最多托管 ${MAX_ACCOUNTS_PER_APP} 个账号。`);
      }
      state.accounts.push({
        tags: [],
        note: '',
        credits: [],
        switchHistory: [],
        lastError: null,
        extraMeta: {},
        ...record,
      });
    }
    if (!state.activeByApp[record.appId]) {
      state.activeByApp[record.appId] = record.id;
    }
    saveVault();
    return projectAccount(
      state.accounts.find(item => item.appId === record.appId && item.id === record.id),
      state.activeByApp[record.appId],
      state.groups,
    );
  }

  function add({ appId, alias = 'main', label = '', email = '', plan = '', source = 'manual' } = {}) {
    ensureLoaded();
    const normalizedApp = assertAppId(appId);
    const id = assertAlias(alias);
    const allowedSources = [
      'manual',
      'local-import',
      'isolated-container',
      'oauth',
      'token-import',
      'json-import',
      'antigravity-studio',
      'antigravity-tools',
      'cockpit',
      'cc-switch',
      'codex-switcher',
    ];
    const resolvedSource = allowedSources.includes(source) ? source : 'manual';
    const ts = currentIso();
    const existing = state.accounts.find(item => item.appId === normalizedApp && item.id === id);
    const cleanEmail = cleanText(email, 160);
    const cleanLabel = cleanText(label, 80) || cleanEmail || id;
    const cleanPlan = cleanText(plan, 48);
    if (existing) {
      return upsertRecord({
        ...existing,
        label: cleanLabel,
        email: cleanEmail || existing.email,
        plan: cleanPlan || existing.plan,
        updatedAt: ts,
      });
    }
    return upsertRecord({
      id,
      appId: normalizedApp,
      label: cleanLabel,
      email: cleanEmail || null,
      plan: cleanPlan || null,
      source: webContainerApps.has(normalizedApp) ? 'isolated-container' : resolvedSource,
      status: 'ready',
      quotaState: pureWebContainerApps.has(normalizedApp) ? 'container_ready' : 'session_only',
      quotas: [],
      credits: [],
      tags: [],
      note: '',
      oauthToken: null,
      refreshToken: null,
      idToken: null,
      tokenExpiry: null,
      projectId: null,
      snapshot: null,
      extraMeta: {},
      lastError: null,
      switchHistory: [],
      lastCheckedAt: null,
      lastSwitchedAt: null,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  function upsertAuthorizedAccount({
    appId,
    alias = 'main',
    label = '',
    email = null,
    plan = null,
    usageData = null,
    oauthToken = null,
    refreshToken = null,
    idToken = null,
    tokenExpiry = null,
    projectId = null,
    credits = [],
    quotas = [],
    quotaState = 'local_detected',
    source = 'oauth',
    tags = [],
    note = '',
    extraMeta = {},
  } = {}) {
    ensureLoaded();
    const normalizedApp = assertAppId(appId);
    const id = assertAlias(alias);
    const ts = currentIso();
    const cleanEmail = email ? cleanText(email, 160) : null;
    const rawLabel = cleanText(label, 80);
    const cleanLabel = (cleanEmail && (!rawLabel || /已授权会话|默认安全容器/i.test(rawLabel)))
      ? cleanEmail
      : (rawLabel || cleanEmail || id);
    let resolvedQuotas = Array.isArray(quotas) ? quotas : [];
    if (!resolvedQuotas.length && usageData && typeof usageData === 'object') {
      if (normalizedApp === 'claude' || normalizedApp === 'claude-desktop' || normalizedApp === 'claude-code') {
        resolvedQuotas = extractAnthropicWindowQuotas(usageData, { includeModels: true });
      } else if (normalizedApp === 'chatgpt' || normalizedApp === 'codex' || normalizedApp === 'codex-desktop') {
        resolvedQuotas = extractWhamWindowQuotas(usageData, currentMs());
      }
    }
    const resolvedQuotaState = resolvedQuotas.length ? 'synced' : quotaState;
    return upsertRecord({
      id,
      appId: normalizedApp,
      label: cleanLabel,
      email: cleanEmail,
      plan: plan ? cleanText(plan, 48) : null,
      source,
      status: 'ready',
      quotaState: resolvedQuotaState,
      quotas: resolvedQuotas,
      credits: Array.isArray(credits) ? credits : [],
      tags: sanitizeTags(tags),
      note: cleanText(note, 240),
      oauthToken: oauthToken || null,
      refreshToken: refreshToken || null,
      idToken: idToken || null,
      tokenExpiry: tokenExpiry || null,
      projectId: projectId || null,
      snapshot: null,
      extraMeta: extraMeta && typeof extraMeta === 'object' ? extraMeta : {},
      lastError: null,
      lastCheckedAt: resolvedQuotas.length ? ts : null,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  function getGlobalStorageDir(folderName) {
    const winCandidate = path.join(appDataDir, folderName, 'User', 'globalStorage');
    if (platform === 'windows' || existsSync(winCandidate)) return winCandidate;
    if (platform === 'macos') return path.join(homeDir, 'Library', 'Application Support', folderName, 'User', 'globalStorage');
    return path.join(homeDir, '.config', folderName, 'User', 'globalStorage');
  }

  function getAppSupportDir(folderName) {
    if (platform === 'windows') return path.join(appDataDir, folderName);
    if (platform === 'macos') return path.join(homeDir, 'Library', 'Application Support', folderName);
    return path.join(homeDir, '.config', folderName);
  }

  function findCursorDbPath() {
    return path.join(getGlobalStorageDir('Cursor'), 'state.vscdb');
  }

  function findWindsurfDbPath() {
    return path.join(getGlobalStorageDir('Windsurf'), 'state.vscdb');
  }

  function allowlistedSwitchTarget(appId) {
    if (appId === 'codex' || appId === 'codex-desktop') return path.join(homeDir, '.codex', 'auth.json');
    if (appId === 'claude-code') return path.join(homeDir, '.claude', '.credentials.json');
    if (appId === 'kiro') return path.join(homeDir, '.aws', 'sso', 'cache', 'kiro-auth-token.json');
    if (appId === 'grok-cli') return path.join(homeDir, '.grok', 'auth.json');
    if (appId === 'claude-desktop') return path.join(getAppSupportDir('Claude'), 'config.json');
    if (appId === 'copilot') {
      const hosts = path.join(localAppDataDir, 'github-copilot', 'hosts.json');
      const cfgHosts = path.join(homeDir, '.config', 'github-copilot', 'hosts.json');
      if (existsSync(hosts)) return hosts;
      if (existsSync(cfgHosts)) return cfgHosts;
      return platform === 'windows' ? hosts : cfgHosts;
    }
    return null;
  }

  function readVscdbKeys(dbPath, keyNames) {
    const sqliteMod = loadSqliteModule();
    if (!sqliteMod || !existsSync(dbPath)) return {};
    const db = new sqliteMod.DatabaseSync(dbPath, { open: true, readOnly: true });
    try {
      const placeholders = keyNames.map(() => '?').join(',');
      const rows = db.prepare(`SELECT key, value FROM ItemTable WHERE key IN (${placeholders})`).all(...keyNames);
      const out = {};
      for (const row of rows) out[row.key] = row.value == null ? '' : String(row.value);
      return out;
    } finally {
      db.close();
    }
  }

  function writeVscdbKeys(dbPath, updates) {
    const sqliteMod = loadSqliteModule();
    if (!sqliteMod || !existsSync(dbPath)) return false;
    const db = new sqliteMod.DatabaseSync(dbPath);
    try {
      db.exec('BEGIN IMMEDIATE');
      const upsert = db.prepare('INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)');
      for (const [k, v] of Object.entries(updates)) {
        if (typeof v === 'string') upsert.run(k, v);
      }
      db.exec('COMMIT');
      return true;
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch {}
      throw err;
    } finally {
      db.close();
    }
  }

  async function probeLocalApp(appId) {
    const ts = currentIso();

    if (appId === 'antigravity') {
      const credOpts = { platform: platform === 'windows' ? 'win32' : platform, homeDir, appDataDir, ...(execWindowsCred ? { execWindowsCred } : {}) };
      const cred = await readAntigravityCredential(credOpts).catch(() => null);
      if (cred?.found) {
        let accessToken = cred.accessToken || null;
        let refreshToken = cred.refreshToken || null;
        let idToken = cred.idToken || null;
        let tokenExpiry = cred.expiry || null;
        let email = cred.email || null;
        let plan = null;
        let projectId = null;
        let credits = [];
        let quotas = [];
        let quotaState = 'local_detected';

        const mode = environmentModeProvider() === 'own_network' ? 'own_network' : 'safe_tunnel';
        const proxyUrl = effectiveProxyUrl();
        const canNetwork = mode === 'own_network' || Boolean(proxyUrl);

        if (canNetwork && refreshToken && (!accessToken || isTokenExpiringSoon(tokenExpiry, currentMs()))) {
          try {
            const refreshed = await refreshAntigravityToken({ refreshToken, proxyUrl, fetchImpl });
            accessToken = refreshed.accessToken || accessToken;
            refreshToken = refreshed.refreshToken || refreshToken;
            idToken = refreshed.idToken || idToken;
            tokenExpiry = refreshed.expiry || tokenExpiry;
          } catch {}
        }
        if (canNetwork && accessToken) {
          if (!email) {
            const uinfo = await fetchGoogleUserInfo({ accessToken, proxyUrl, fetchImpl }).catch(() => null);
            email = uinfo?.email || email;
          }
          try {
            const qRes = await fetchAntigravityQuota({ accessToken, proxyUrl, fetchImpl, nowMs: currentMs() });
            plan = qRes.plan || plan;
            projectId = qRes.projectId || null;
            credits = qRes.credits || [];
            quotas = qRes.quotas || [];
            if (quotas.length) quotaState = 'synced';
          } catch {}
        }

        return {
          label: email || 'Antigravity 本机账号',
          email,
          plan: plan || 'FREE',
          source: 'local-import',
          quotaState,
          quotas,
          credits,
          oauthToken: accessToken,
          refreshToken,
          idToken,
          tokenExpiry,
          projectId,
          snapshot: {
            kind: 'antigravity-oauth',
            accessToken,
            refreshToken,
            idToken,
            expiry: tokenExpiry,
          },
          lastError: null,
          updatedAt: ts,
        };
      }
      if (existsSync(path.join(appDataDir, 'Antigravity')) || existsSync(path.join(appDataDir, 'Antigravity IDE'))) {
        return {
          label: 'Antigravity 本机配置（尚未登录）',
          email: null,
          plan: null,
          source: 'local-import',
          quotaState: 'local_detected',
          oauthToken: null,
          snapshot: null,
          lastError: '尚未检测到 Antigravity 登录凭据',
          updatedAt: ts,
        };
      }
      return null;
    }

    if (appId === 'codex' || appId === 'codex-desktop') {
      const authPath = path.join(homeDir, '.codex', 'auth.json');
      if (!existsSync(authPath)) return null;
      const rawBuf = readFileSync(authPath);
      let parsed;
      try { parsed = JSON.parse(rawBuf.toString('utf8')); } catch { return null; }
      const idPayload = decodeJwtPayload(parsed?.tokens?.id_token);
      const authMeta = idPayload?.['https://api.openai.com/auth'];
      const email = cleanText(idPayload?.email || parsed?.email || '', 160) || null;
      const plan = cleanText(authMeta?.chatgpt_plan_type || idPayload?.chatgpt_plan_type || (parsed?.OPENAI_API_KEY ? 'API KEY' : ''), 48) || null;
      const accountId = cleanText(parsed?.tokens?.account_id || authMeta?.chatgpt_account_id || '', 96) || null;
      const oauthToken = parsed?.tokens?.access_token || null;
      const refreshToken = parsed?.tokens?.refresh_token || null;
      return {
        label: email || 'Codex 本机账号',
        email,
        plan,
        source: 'local-import',
        quotaState: oauthToken ? 'local_detected' : 'session_only',
        oauthToken,
        refreshToken,
        idToken: parsed?.tokens?.id_token || null,
        extraMeta: { ...(accountId ? { accountId } : {}) },
        snapshot: { kind: 'file', targetPath: authPath, payloadBase64: rawBuf.toString('base64') },
        lastError: null,
        updatedAt: ts,
      };
    }

    if (appId === 'claude-code') {
      const cfgPath = path.join(homeDir, '.claude.json');
      const credsPath = path.join(homeDir, '.claude', '.credentials.json');
      let email = null;
      let plan = null;
      let oauthToken = null;
      let refreshToken = null;
      let tokenExpiry = null;
      let oauthAccount = null;
      let claudeAiOauth = null;
      let credsRawBase64 = null;

      if (existsSync(cfgPath)) {
        try {
          const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
          if (cfg?.oauthAccount && typeof cfg.oauthAccount === 'object') {
            oauthAccount = cfg.oauthAccount;
            email = cleanText(cfg.oauthAccount.emailAddress || '', 160) || null;
            plan = cleanText(cfg.oauthAccount.organizationRole || cfg.oauthAccount.billingType || '', 48) || null;
          }
        } catch {}
      }
      if (existsSync(credsPath)) {
        try {
          const rawBuf = readFileSync(credsPath);
          credsRawBase64 = rawBuf.toString('base64');
          const creds = JSON.parse(rawBuf.toString('utf8'));
          if (creds?.claudeAiOauth && typeof creds.claudeAiOauth === 'object') {
            claudeAiOauth = creds.claudeAiOauth;
            oauthToken = creds.claudeAiOauth.accessToken || null;
            refreshToken = creds.claudeAiOauth.refreshToken || null;
            if (creds.claudeAiOauth.expiresAt) {
              tokenExpiry = Number.isFinite(Number(creds.claudeAiOauth.expiresAt))
                ? new Date(Number(creds.claudeAiOauth.expiresAt)).toISOString()
                : creds.claudeAiOauth.expiresAt;
            }
            if (!plan && creds.claudeAiOauth.subscriptionType) {
              plan = cleanText(creds.claudeAiOauth.subscriptionType, 48);
            }
          }
        } catch {}
      }
      if (!email && !oauthToken) return null;
      return {
        label: email || 'Claude Code 本机账号',
        email,
        plan,
        source: 'local-import',
        quotaState: oauthToken ? 'local_detected' : 'session_only',
        oauthToken,
        refreshToken,
        tokenExpiry,
        extraMeta: oauthAccount ? { claudeOauthAccount: oauthAccount } : {},
        snapshot: {
          kind: 'claude-code-dual',
          targetPath: credsPath,
          payloadBase64: credsRawBase64,
          claudeAiOauth,
          oauthAccount,
        },
        lastError: null,
        updatedAt: ts,
      };
    }

    if (appId === 'claude-desktop') {
      const claudeAppDir = getAppSupportDir('Claude');
      const cfgPath = path.join(claudeAppDir, 'config.json');
      const ccCredPath = path.join(homeDir, '.claude', '.credentials.json');
      let found = false;
      let email = null;
      let plan = null;
      let sessionCookie = null;
      let cfgBase64 = null;
      if (existsSync(cfgPath)) {
        try {
          const rawBuf = readFileSync(cfgPath);
          cfgBase64 = rawBuf.toString('base64');
          const parsed = JSON.parse(rawBuf.toString('utf8'));
          email = cleanText(parsed?.email || parsed?.user?.email || '', 160) || null;
          if (typeof parsed?.sessionKey === 'string' && parsed.sessionKey.trim()) {
            sessionCookie = parsed.sessionKey.trim();
          }
          found = true;
        } catch {}
      }
      if (existsSync(claudeAppDir)) found = true;
      if (!found && existsSync(ccCredPath)) {
        return null;
      }
      if (!found) return null;
      return {
        label: email || 'Claude Desktop 本机配置',
        email,
        plan,
        source: 'local-import',
        quotaState: sessionCookie ? 'local_detected' : 'session_only',
        oauthToken: sessionCookie,
        extraMeta: sessionCookie ? { sessionCookie } : {},
        snapshot: cfgBase64 ? { kind: 'file', targetPath: cfgPath, payloadBase64: cfgBase64 } : null,
        lastError: sessionCookie ? null : '建议通过「网页/内置登录」或粘贴 sessionKey 启用 Claude 配额同步与切号',
        updatedAt: ts,
      };
    }

    if (appId === 'cursor') {
      const globalStorageDir = getGlobalStorageDir('Cursor');
      const vscdbPath = path.join(globalStorageDir, 'state.vscdb');
      const storageJsonPath = path.join(globalStorageDir, 'storage.json');
      let email = null;
      let plan = null;
      let accessToken = null;
      let refreshToken = null;
      const vscdbKeys = readVscdbKeys(vscdbPath, [
        'cursorAuth/cachedEmail',
        'cursorAuth/stripeMembershipType',
        'cursorAuth/accessToken',
        'cursorAuth/refreshToken',
        'cursorAuth/cachedSignUpType',
      ]);
      if (vscdbKeys['cursorAuth/cachedEmail']) email = cleanText(vscdbKeys['cursorAuth/cachedEmail'], 160) || null;
      if (vscdbKeys['cursorAuth/stripeMembershipType']) plan = cleanText(vscdbKeys['cursorAuth/stripeMembershipType'], 48) || null;
      if (vscdbKeys['cursorAuth/accessToken']) accessToken = vscdbKeys['cursorAuth/accessToken'].trim() || null;
      if (vscdbKeys['cursorAuth/refreshToken']) refreshToken = vscdbKeys['cursorAuth/refreshToken'].trim() || null;

      if ((!email || !plan) && existsSync(storageJsonPath)) {
        try {
          const data = JSON.parse(readFileSync(storageJsonPath, 'utf8'));
          email = email || cleanText(data['cursorAuth/cachedEmail'] || '', 160) || null;
          plan = plan || cleanText(data['cursorAuth/stripeMembershipType'] || '', 48) || null;
        } catch {}
      }
      if (!email && !accessToken && !existsSync(vscdbPath) && !existsSync(storageJsonPath)) return null;
      return {
        label: email || 'Cursor 本机账号',
        email,
        plan,
        source: 'local-import',
        quotaState: accessToken ? 'local_detected' : 'session_only',
        oauthToken: accessToken,
        refreshToken,
        snapshot: Object.keys(vscdbKeys).length ? { kind: 'cursor-vscdb', keys: vscdbKeys } : null,
        lastError: null,
        updatedAt: ts,
      };
    }

    if (appId === 'windsurf') {
      const vscdbPath = findWindsurfDbPath();
      const wsDir = getAppSupportDir('Windsurf');
      if (existsSync(vscdbPath)) {
        const keys = readVscdbKeys(vscdbPath, ['windsurfAuthStatus']);
        const rawAuth = keys.windsurfAuthStatus;
        if (rawAuth) {
          let email = null;
          let apiKey = null;
          let plan = null;
          try {
            const parsed = JSON.parse(rawAuth);
            email = cleanText(parsed?.email || parsed?.name || '', 160) || null;
            apiKey = typeof parsed?.apiKey === 'string' && parsed.apiKey.trim() ? parsed.apiKey.trim() : null;
            plan = cleanText(parsed?.planName || parsed?.userStatus?.planStatus?.planInfo?.planName || '', 48) || null;
          } catch {}
          return {
            label: email || 'Windsurf 本机账号',
            email,
            plan,
            source: 'local-import',
            quotaState: apiKey ? 'local_detected' : 'session_only',
            oauthToken: apiKey,
            snapshot: { kind: 'windsurf-vscdb', keys: { windsurfAuthStatus: rawAuth } },
            lastError: null,
            updatedAt: ts,
          };
        }
      }
      if (existsSync(wsDir)) {
        return {
          label: 'Windsurf 本机配置（尚未登录）',
          email: null,
          plan: null,
          source: 'local-import',
          quotaState: 'session_only',
          oauthToken: null,
          snapshot: null,
          lastError: '尚未在 Windsurf 检测到 windsurfAuthStatus 凭据',
          updatedAt: ts,
        };
      }
      return null;
    }

    if (appId === 'gemini-cli') {
      const acctPath = path.join(homeDir, '.gemini', 'google_accounts.json');
      const oauthPath = path.join(homeDir, '.gemini', 'oauth_creds.json');
      let email = null;
      let accountsObj = null;
      let accountsBuf = null;
      let oauthBuf = null;
      let accessToken = null;
      let refreshToken = null;
      let idToken = null;
      let tokenExpiry = null;
      let extraMeta = {};

      if (existsSync(acctPath)) {
        try {
          accountsBuf = readFileSync(acctPath);
          accountsObj = JSON.parse(accountsBuf.toString('utf8'));
          if (typeof accountsObj?.active === 'string') {
            email = cleanText(accountsObj.active, 160) || null;
          } else if (accountsObj?.active && typeof accountsObj.active === 'object') {
            email = cleanText(accountsObj.active.email || accountsObj.active.account || '', 160) || null;
          }
        } catch {}
      }
      if (existsSync(oauthPath)) {
        try {
          oauthBuf = readFileSync(oauthPath);
          const oauthObj = JSON.parse(oauthBuf.toString('utf8'));
          accessToken = oauthObj?.access_token || oauthObj?.token?.access_token || null;
          refreshToken = oauthObj?.refresh_token || oauthObj?.token?.refresh_token || null;
          idToken = oauthObj?.id_token || null;
          if (oauthObj?.expiry_date) {
            tokenExpiry = new Date(Number(oauthObj.expiry_date)).toISOString();
          } else if (oauthObj?.expiry) {
            tokenExpiry = oauthObj.expiry;
          }
          if (oauthObj?.client_id) extraMeta.clientId = oauthObj.client_id;
          if (oauthObj?.client_secret) extraMeta.clientSecret = oauthObj.client_secret;
          if (!email && idToken) {
            const claims = decodeJwtPayload(idToken);
            email = cleanText(claims?.email || '', 160) || null;
          }
        } catch {}
      }
      if (!email && !accessToken && !refreshToken) return null;
      return {
        label: email || 'Gemini CLI 本机账号',
        email,
        plan: null,
        source: 'local-import',
        quotaState: (accessToken || refreshToken) ? 'local_detected' : 'session_only',
        oauthToken: accessToken,
        refreshToken,
        idToken,
        tokenExpiry,
        extraMeta,
        snapshot: {
          kind: 'gemini-cli-dual',
          oauthPath,
          accountsPath: acctPath,
          oauthBase64: oauthBuf ? oauthBuf.toString('base64') : null,
          accountsBase64: accountsBuf ? accountsBuf.toString('base64') : null,
          email,
        },
        lastError: null,
        updatedAt: ts,
      };
    }

    if (appId === 'copilot') {
      const candidates = [
        path.join(localAppDataDir, 'github-copilot', 'hosts.json'),
        path.join(localAppDataDir, 'github-copilot', 'apps.json'),
        path.join(homeDir, '.config', 'github-copilot', 'hosts.json'),
        path.join(homeDir, '.config', 'github-copilot', 'apps.json'),
      ];
      for (const candidate of candidates) {
        if (!existsSync(candidate)) continue;
        try {
          const rawBuf = readFileSync(candidate);
          const parsed = JSON.parse(rawBuf.toString('utf8'));
          const firstEntry = parsed && typeof parsed === 'object' ? Object.values(parsed)[0] : null;
          const user = cleanText(firstEntry?.user || '', 160) || null;
          const oauthToken = typeof firstEntry?.oauth_token === 'string' && firstEntry.oauth_token.trim()
            ? firstEntry.oauth_token.trim()
            : null;
          if (user || oauthToken) {
            const appsPath = candidate.endsWith('hosts.json') ? candidate.replace(/hosts\.json$/, 'apps.json') : null;
            const appsBuf = appsPath && existsSync(appsPath) ? readFileSync(appsPath) : null;
            return {
              label: user || 'Copilot 本机账号',
              email: null,
              plan: 'GitHub',
              source: 'local-import',
              quotaState: oauthToken ? 'local_detected' : 'session_only',
              oauthToken,
              snapshot: appsBuf
                ? { kind: 'copilot-files', targetPath: candidate, payloadBase64: rawBuf.toString('base64'), appsPath, appsBase64: appsBuf.toString('base64') }
                : { kind: 'file', targetPath: candidate, payloadBase64: rawBuf.toString('base64') },
              lastError: null,
              updatedAt: ts,
            };
          }
        } catch {}
      }
      return null;
    }

    if (appId === 'kiro') {
      const cacheDir = path.join(homeDir, '.aws', 'sso', 'cache');
      const kiroTokenPath = path.join(cacheDir, 'kiro-auth-token.json');
      if (existsSync(kiroTokenPath)) {
        try {
          const rawBuf = readFileSync(kiroTokenPath);
          const parsed = JSON.parse(rawBuf.toString('utf8'));
          const accessToken = typeof parsed?.accessToken === 'string' ? parsed.accessToken : null;
          const refreshToken = typeof parsed?.refreshToken === 'string' ? parsed.refreshToken : null;
          const label = cleanText(parsed?.email || parsed?.profileArn || parsed?.startUrl || 'Kiro 本机账号', 80);
          const extraMeta = {
            authMethod: parsed?.authMethod || 'Builder ID',
            region: parsed?.region || 'us-east-1',
            profileArn: parsed?.profileArn || null,
            startUrl: parsed?.startUrl || null,
          };
          let clientPath = null;
          let clientBase64 = null;
          if (parsed?.clientIdHash) {
            const candidate = path.join(cacheDir, `${parsed.clientIdHash}.json`);
            if (existsSync(candidate)) {
              const cBuf = readFileSync(candidate);
              clientPath = candidate;
              clientBase64 = cBuf.toString('base64');
              try {
                const cObj = JSON.parse(cBuf.toString('utf8'));
                if (cObj?.clientId) extraMeta.clientId = cObj.clientId;
                if (cObj?.clientSecret) extraMeta.clientSecret = cObj.clientSecret;
              } catch {}
            }
          }
          return {
            label,
            email: cleanText(parsed?.email || '', 160) || null,
            plan: parsed?.authMethod || 'Builder ID',
            source: 'local-import',
            quotaState: accessToken ? 'local_detected' : 'session_only',
            oauthToken: accessToken,
            refreshToken,
            tokenExpiry: parsed?.expiresAt || null,
            extraMeta,
            snapshot: {
              kind: 'file',
              targetPath: kiroTokenPath,
              payloadBase64: rawBuf.toString('base64'),
              ...(clientPath && clientBase64 ? { companionPath: clientPath, companionBase64: clientBase64 } : {}),
            },
            lastError: null,
            updatedAt: ts,
          };
        } catch {}
      }
      if (existsSync(getAppSupportDir('Kiro'))) {
        return {
          label: 'Kiro 本机配置（尚未登录）',
          email: null,
          plan: null,
          source: 'local-import',
          quotaState: 'session_only',
          oauthToken: null,
          snapshot: null,
          lastError: '未检测到 kiro-auth-token.json，可通过 AWS Builder ID 授权添加',
          updatedAt: ts,
        };
      }
      return null;
    }

    if (appId === 'grok-cli') {
      const grokPath = path.join(homeDir, '.grok', 'auth.json');
      if (existsSync(grokPath)) {
        try {
          const rawBuf = readFileSync(grokPath);
          const parsed = JSON.parse(rawBuf.toString('utf8'));
          const activeScope = parsed?.default || parsed?.activeScope || null;
          const entry = (activeScope && parsed?.scopes?.[activeScope])
            || (parsed?.scopes && Object.values(parsed.scopes)[0])
            || parsed;
          const token = entry?.access_token || entry?.accessToken || entry?.token || entry?.apiKey || null;
          const refreshToken = entry?.refresh_token || entry?.refreshToken || null;
          const email = cleanText(entry?.email || parsed?.email || '', 160) || null;
          return {
            label: email || 'Grok CLI 本机账号',
            email,
            plan: entry?.plan || null,
            source: 'local-import',
            quotaState: token ? 'local_detected' : 'session_only',
            oauthToken: token,
            refreshToken,
            extraMeta: activeScope ? { registryScope: activeScope, scopeEntry: entry } : {},
            snapshot: { kind: 'file', targetPath: grokPath, payloadBase64: rawBuf.toString('base64') },
            lastError: null,
            updatedAt: ts,
          };
        } catch {}
      }
      return null;
    }

    return null;
  }

  function sha256Trimmed(val) {
    if (typeof val !== 'string') return null;
    const trimmed = val.trim();
    if (!trimmed) return null;
    return crypto.createHash('sha256').update(trimmed).digest('hex');
  }

  function isPlaceholderSlot(rec) {
    if (!rec || typeof rec !== 'object') return false;
    return (!rec.email && !rec.oauthToken && !rec.refreshToken && !rec.extraMeta?.sessionCookie)
      || rec.label === '本机已登录会话'
      || (typeof rec.label === 'string' && rec.label.includes('尚未登录'));
  }

  function allocateAliasCandidate(appId, cand, preferredAlias = null) {
    const usedIds = new Set(state.accounts.filter(item => item.appId === appId).map(item => item.id));
    if (preferredAlias && !usedIds.has(preferredAlias)) return preferredAlias;
    if (!usedIds.has('main') && (cand.isActiveHint || usedIds.size === 0)) return 'main';

    const localPart = cand.email ? String(cand.email).split('@')[0] : (cand.label || '');
    let clean = String(localPart || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    if (clean && !/^[a-z]/.test(clean)) clean = `a-${clean}`;
    const base = aliasPattern.test(clean.slice(0, 26)) ? clean.slice(0, 26) : sanitizeAliasCandidate(localPart, appId.slice(0, 8) || 'acct');
    if (!usedIds.has(base)) return base;
    for (let n = 2; n < 200; n += 1) {
      const suffix = `-${n}`;
      const candidateId = `${base.slice(0, 32 - suffix.length)}${suffix}`;
      if (!usedIds.has(candidateId)) return candidateId;
    }
    return sanitizeAliasCandidate('', 'acct');
  }

  function findExistingMatchingSlot(appId, cand, explicitAlias = null, allowExplicitOverwrite = false) {
    const appAccounts = state.accounts.filter(item => item.appId === appId);
    const candEmail = cand.email ? cand.email.toLowerCase() : null;
    const candRtHash = sha256Trimmed(cand.refreshToken);
    const candAtHash = sha256Trimmed(cand.oauthToken);

    if (candEmail) {
      const byEmail = appAccounts.find(item => item.email && item.email.toLowerCase() === candEmail);
      if (byEmail) return byEmail;
    }
    if (candRtHash) {
      const byRt = appAccounts.find(item => {
        const rt = sha256Trimmed(item.refreshToken || item.snapshot?.refreshToken);
        if (!rt || rt !== candRtHash) return false;
        return !candEmail || !item.email || item.email.toLowerCase() === candEmail;
      });
      if (byRt) return byRt;
    }
    if (candAtHash) {
      const byAt = appAccounts.find(item => {
        const at = sha256Trimmed(item.oauthToken || item.snapshot?.accessToken);
        if (!at || at !== candAtHash) return false;
        return !candEmail || !item.email || item.email.toLowerCase() === candEmail;
      });
      if (byAt) return byAt;
    }
    if (explicitAlias) {
      const byAlias = appAccounts.find(item => item.id === explicitAlias);
      if (byAlias) {
        if (allowExplicitOverwrite || !byAlias.email || !candEmail || byAlias.email.toLowerCase() === candEmail) {
          return byAlias;
        }
      }
    }
    if (!explicitAlias && (cand.email || cand.oauthToken || cand.refreshToken)) {
      const emptyPlaceholder = appAccounts.find(
        item => !item.email && !item.oauthToken && !item.refreshToken && !item.extraMeta?.sessionCookie,
      );
      if (emptyPlaceholder) return emptyPlaceholder;
    }
    return null;
  }

  function enrichExistingSlot(existing, cand, ts) {
    let changed = false;
    const isPlaceholderLabel = !existing.label
      || existing.label === '本机已登录会话'
      || existing.label === existing.id
      || (typeof existing.label === 'string' && (existing.label.includes('尚未登录') || existing.label.endsWith('本机账号')));

    if (cand.email && !existing.email) {
      existing.email = cand.email;
      changed = true;
    }
    if (isPlaceholderLabel && (cand.email || (cand.label && !cand.label.includes('尚未登录')))) {
      const nextLabel = cand.email || cand.label;
      if (nextLabel && nextLabel !== existing.label) {
        existing.label = nextLabel;
        changed = true;
      }
    }
    if (cand.plan && (!existing.plan || (existing.plan === 'FREE' && cand.plan !== 'FREE'))) {
      existing.plan = cand.plan;
      changed = true;
    }
    const sameEmailSelfHeal = existing.source === 'local-import'
      && Boolean(existing.email && cand.email && existing.email.toLowerCase() === cand.email.toLowerCase())
      && ['antigravity-studio', 'cockpit', 'antigravity-tools'].includes(cand.source)
      && Boolean(cand.refreshToken && existing.refreshToken !== cand.refreshToken);

    if (sameEmailSelfHeal) {
      existing.refreshToken = cand.refreshToken;
      if (cand.oauthToken) existing.oauthToken = cand.oauthToken;
      if (cand.idToken) existing.idToken = cand.idToken;
      if (cand.tokenExpiry) existing.tokenExpiry = cand.tokenExpiry;
      if (cand.snapshot) existing.snapshot = cand.snapshot;
      if (existing.status === 'invalid' || existing.status === 'banned') existing.status = 'ready';
      changed = true;
    }
    if (cand.refreshToken && !existing.refreshToken) {
      existing.refreshToken = cand.refreshToken;
      if (existing.status === 'invalid') existing.status = 'ready';
      changed = true;
    }
    if (cand.oauthToken && (!existing.oauthToken || (!existing.refreshToken && cand.source === 'local-import' && existing.source === 'local-import'))) {
      if (cand.oauthToken !== existing.oauthToken) {
        existing.oauthToken = cand.oauthToken;
        if (existing.status === 'invalid') existing.status = 'ready';
        changed = true;
      }
    }
    if (cand.idToken && !existing.idToken) {
      existing.idToken = cand.idToken;
      changed = true;
    }
    if (cand.tokenExpiry && !existing.tokenExpiry) {
      existing.tokenExpiry = cand.tokenExpiry;
      changed = true;
    }
    if (cand.projectId && !existing.projectId) {
      existing.projectId = cand.projectId;
      changed = true;
    }
    if (cand.snapshot && !existing.snapshot) {
      existing.snapshot = cand.snapshot;
      changed = true;
    }
    const isDeadAccount = existing.status === 'banned' || existing.status === 'invalid';
    if (!isDeadAccount && Array.isArray(cand.quotas) && cand.quotas.length && (!Array.isArray(existing.quotas) || !existing.quotas.length)) {
      existing.quotas = cand.quotas;
      existing.quotaState = 'synced';
      existing.lastError = null;
      existing.lastCheckedAt = existing.lastCheckedAt || ts;
      changed = true;
    } else if (!isDeadAccount && existing.quotaState === 'session_only' && (existing.oauthToken || existing.refreshToken)) {
      existing.quotaState = 'local_detected';
      existing.lastError = null;
      changed = true;
    }
    if (Array.isArray(cand.credits) && cand.credits.length && (!Array.isArray(existing.credits) || !existing.credits.length)) {
      existing.credits = cand.credits;
      changed = true;
    }
    if (Array.isArray(cand.tags) && cand.tags.length) {
      const mergedTags = sanitizeTags([...(existing.tags || []), ...cand.tags]);
      if (mergedTags.length > (existing.tags || []).length) {
        existing.tags = mergedTags;
        changed = true;
      }
    }
    if (cand.note && !existing.note) {
      existing.note = cand.note;
      changed = true;
    }
    if (cand.extraMeta && typeof cand.extraMeta === 'object') {
      const curMeta = existing.extraMeta || {};
      const nextMeta = { ...cand.extraMeta, ...curMeta };
      if (Object.keys(nextMeta).length > Object.keys(curMeta).length) {
        existing.extraMeta = nextMeta;
        changed = true;
      }
    }
    if (changed) existing.updatedAt = ts;
    return changed;
  }

  async function importLocal({ appId = null, alias = null, all = false, silent = false } = {}) {
    ensureLoaded();
    const explicitAlias = typeof alias === 'string' && alias.trim() ? assertAlias(alias.trim()) : null;

    if (!all && appId) {
      const normalizedApp = assertAppId(appId);
      if (webContainerApps.has(normalizedApp)) {
        const webId = explicitAlias || 'main';
        const saved = add({ appId: normalizedApp, alias: webId, label: webId === 'main' ? '默认安全容器' : webId, source: 'isolated-container' });
        return Object.freeze({
          importedCount: 1,
          addedCount: 1,
          updatedCount: 0,
          skippedCount: 0,
          sourcesUsed: Object.freeze([]),
          account: saved,
          ...list(normalizedApp),
        });
      }
    }

    const filterApp = (!all && appId) ? assertAppId(appId) : null;
    const scanApps = filterApp
      ? [filterApp]
      : SUPPORTED_WORKBENCH_APPS.filter(item => item !== 'codex-cli' && !webContainerApps.has(item));

    const discovered = await discoverLocalAccounts({
      appId: filterApp,
      platform,
      homeDir,
      appDataDir,
      localAppDataDir,
      extraCcSwitchDirs,
      scanPortableDrives,
      execWindowsCred,
      now,
    }).catch(() => []);

    const byApp = new Map();
    for (const item of discovered) {
      const candApp = canonicalAppId(item.appId);
      if (!scanApps.includes(candApp)) continue;
      if (!byApp.has(candApp)) byApp.set(candApp, []);
      byApp.get(candApp).push({ ...item, appId: candApp });
    }

    // Include existing native single-app probes for apps not covered directly by multi-source discovery
    // (claude-code, cursor, windsurf, gemini-cli, copilot, kiro, grok-cli, claude-desktop, codex-desktop)
    // and live Antigravity quota probe only when single-app non-silent mode has <=1 account lacking quotas.
    for (const candidateApp of scanApps) {
      const existingList = byApp.get(candidateApp) || [];
      const needAntigravityProbe = candidateApp === 'antigravity'
        && (existingList.length === 0
          || (!silent && filterApp === 'antigravity' && existingList.length === 1 && !existingList[0].quotas?.length));
      if (candidateApp === 'antigravity' && !needAntigravityProbe) continue;

      const probed = await probeLocalApp(candidateApp).catch(() => null);
      if (!probed) continue;
      const isBarePlaceholder = !probed.email && !probed.oauthToken && !probed.refreshToken && !probed.extraMeta?.sessionCookie;
      if (isBarePlaceholder && existingList.length > 0) continue;

      const probedCand = {
        appId: candidateApp,
        ...probed,
        quotas: Array.isArray(probed.quotas) ? probed.quotas : [],
        credits: Array.isArray(probed.credits) ? probed.credits : [],
        tags: [],
        note: '',
        isActiveHint: true,
        priority: 96,
      };
      const match = existingList.find(c =>
        (c.email && probedCand.email && c.email.toLowerCase() === probedCand.email.toLowerCase())
        || (sha256Trimmed(c.refreshToken) && sha256Trimmed(c.refreshToken) === sha256Trimmed(probedCand.refreshToken))
        || (sha256Trimmed(c.oauthToken) && sha256Trimmed(c.oauthToken) === sha256Trimmed(probedCand.oauthToken)),
      );
      if (match) {
        if (probedCand.plan && (!match.plan || match.plan === 'FREE')) match.plan = probedCand.plan;
        if (probedCand.quotas.length && !match.quotas?.length) {
          match.quotas = probedCand.quotas;
          match.quotaState = 'synced';
        }
        if (probedCand.credits.length && !match.credits?.length) match.credits = probedCand.credits;
        if (probedCand.projectId && !match.projectId) match.projectId = probedCand.projectId;
        if (probedCand.snapshot && !match.snapshot) match.snapshot = probedCand.snapshot;
      } else {
        existingList.unshift(probedCand);
        byApp.set(candidateApp, existingList);
      }
    }

    const ts = currentIso();
    let totalCandidates = 0;
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let activeChanged = false;
    let firstAccount = null;
    const sourcesUsed = new Set();

    for (const candApp of scanApps) {
      const cands = byApp.get(candApp) || [];
      totalCandidates += cands.length;
      if (!cands.length) continue;

      let preferredActiveId = null;
      for (let i = 0; i < cands.length; i += 1) {
        const cand = cands[i];
        sourcesUsed.add(cand.source || 'local-import');
        const allowExplicit = Boolean(explicitAlias && filterApp === candApp && cands.length === 1);
        const existing = findExistingMatchingSlot(candApp, cand, allowExplicit ? explicitAlias : null, allowExplicit);

        if (existing) {
          const didEnrich = enrichExistingSlot(existing, cand, ts);
          if (didEnrich) updatedCount += 1;
          else skippedCount += 1;
          if (!preferredActiveId && cand.isActiveHint) preferredActiveId = existing.id;
          if (!firstAccount) firstAccount = projectAccount(existing, state.activeByApp[candApp] || existing.id, state.groups);
          if (allowExplicit && existing.snapshot && state.activeByApp[candApp] !== existing.id) {
            state.activeByApp[candApp] = existing.id;
            activeChanged = true;
          }
          continue;
        }

        const currentCount = state.accounts.filter(item => item.appId === candApp).length;
        if (currentCount >= MAX_ACCOUNTS_PER_APP) {
          skippedCount += 1;
          continue;
        }

        const newId = allocateAliasCandidate(candApp, cand, (i === 0 ? explicitAlias : null));
        const newRec = {
          id: newId,
          appId: candApp,
          label: cleanText(cand.email || cand.label || newId, 80),
          email: cand.email || null,
          plan: cand.plan ? cleanText(cand.plan, 48) : null,
          source: cand.source || 'local-import',
          status: 'ready',
          quotaState: Array.isArray(cand.quotas) && cand.quotas.length
            ? 'synced'
            : (cand.quotaState || ((cand.oauthToken || cand.refreshToken) ? 'local_detected' : 'session_only')),
          quotas: Array.isArray(cand.quotas) ? cand.quotas : [],
          credits: Array.isArray(cand.credits) ? cand.credits : [],
          tags: sanitizeTags(cand.tags),
          note: cleanText(cand.note || '', 240),
          oauthToken: cand.oauthToken || null,
          refreshToken: cand.refreshToken || null,
          idToken: cand.idToken || null,
          tokenExpiry: cand.tokenExpiry || null,
          projectId: cand.projectId || null,
          snapshot: cand.snapshot || null,
          extraMeta: cand.extraMeta && typeof cand.extraMeta === 'object' ? cand.extraMeta : {},
          lastError: cand.lastError || null,
          switchHistory: [],
          lastCheckedAt: Array.isArray(cand.quotas) && cand.quotas.length ? ts : null,
          lastSwitchedAt: null,
          createdAt: ts,
          updatedAt: ts,
        };
        state.accounts.push(newRec);
        addedCount += 1;
        if (!preferredActiveId && cand.isActiveHint) preferredActiveId = newId;
        if (allowExplicit && newRec.snapshot && state.activeByApp[candApp] !== newId) {
          state.activeByApp[candApp] = newId;
          activeChanged = true;
        }
        if (!firstAccount) firstAccount = projectAccount(newRec, state.activeByApp[candApp] || newId, state.groups);
      }

      const curActiveRec = state.activeByApp[candApp]
        ? state.accounts.find(a => a.appId === candApp && a.id === state.activeByApp[candApp])
        : null;
      if (!curActiveRec || isPlaceholderSlot(curActiveRec)) {
        const nextActive = preferredActiveId || state.accounts.find(a => a.appId === candApp)?.id || null;
        if (nextActive && state.activeByApp[candApp] !== nextActive) {
          state.activeByApp[candApp] = nextActive;
          activeChanged = true;
        }
      }
    }

    if (!silent && filterApp && totalCandidates === 0) {
      throw fail('LOCAL_ACCOUNT_NOT_FOUND', '未在本机检测到该应用的已登录配置，请先在应用内登录或点击「+ 添加账号」。');
    }

    if (addedCount > 0 || updatedCount > 0 || activeChanged) {
      saveVault();
    }

    const projected = list(filterApp);
    if (firstAccount) {
      const refreshedFirst = projected.accounts.find(a => a.appId === firstAccount.appId && a.id === firstAccount.id);
      if (refreshedFirst) firstAccount = refreshedFirst;
    }

    return Object.freeze({
      importedCount: addedCount + updatedCount,
      addedCount,
      updatedCount,
      skippedCount,
      sourcesUsed: Object.freeze([...sourcesUsed]),
      ...(filterApp && firstAccount ? { account: firstAccount } : {}),
      ...projected,
    });
  }

  async function importToken({
    appId,
    alias = 'main',
    token = '',
    refreshToken = '',
    email = '',
    plan = '',
    label = '',
    tags = [],
    note = '',
  } = {}) {
    ensureLoaded();
    const normalizedApp = assertAppId(appId);
    const id = assertAlias(alias);
    const cleanToken = typeof token === 'string' ? token.trim() : '';
    let cleanRefresh = typeof refreshToken === 'string' ? refreshToken.trim() : '';
    let accessToken = cleanToken;

    if (normalizedApp === 'antigravity' || normalizedApp === 'gemini-cli') {
      if (!cleanRefresh && cleanToken.startsWith('1//')) {
        cleanRefresh = cleanToken;
        accessToken = '';
      }
      if (!cleanRefresh && !accessToken) {
        throw fail('TOKEN_INVALID', `请提供 ${normalizedApp === 'antigravity' ? 'Antigravity' : 'Gemini CLI'} Refresh Token（1//...）或有效 Access Token。`);
      }
      const proxyUrl = effectiveProxyUrl();
      let tokenExpiry = null;
      let idToken = null;
      if (cleanRefresh) {
        const refreshed = normalizedApp === 'gemini-cli'
          ? await refreshGeminiCliToken({ refreshToken: cleanRefresh, proxyUrl, fetchImpl })
          : await refreshAntigravityToken({ refreshToken: cleanRefresh, proxyUrl, fetchImpl });
        accessToken = refreshed.accessToken;
        cleanRefresh = refreshed.refreshToken || cleanRefresh;
        idToken = refreshed.idToken || null;
        tokenExpiry = refreshed.expiry || null;
      }
      const uinfo = await fetchGoogleUserInfo({ accessToken, proxyUrl, fetchImpl }).catch(() => null);
      let quotaMeta = null;
      try {
        quotaMeta = await fetchAntigravityQuota({ accessToken, proxyUrl, fetchImpl, nowMs: currentMs() });
      } catch {}
      const resolvedEmail = cleanText(email, 160) || uinfo?.email || null;
      const saved = upsertAuthorizedAccount({
        appId: normalizedApp,
        alias: id,
        label: cleanText(label, 80) || resolvedEmail || uinfo?.name || id,
        email: resolvedEmail,
        plan: cleanText(plan, 48) || quotaMeta?.plan || 'FREE',
        oauthToken: accessToken,
        refreshToken: cleanRefresh || null,
        idToken,
        tokenExpiry,
        projectId: quotaMeta?.projectId || null,
        credits: quotaMeta?.credits || [],
        quotas: quotaMeta?.quotas || [],
        quotaState: quotaMeta?.quotas?.length ? 'synced' : 'local_detected',
        source: 'token-import',
        tags,
        note,
      });
      return Object.freeze({ account: saved, ...list(normalizedApp) });
    }

    if (!accessToken && !cleanRefresh) {
      throw fail('TOKEN_INVALID', '请输入有效的账号 Token、Cookie 或凭据字符串。');
    }
    let resolvedEmail = cleanText(email, 160) || null;
    let resolvedPlan = cleanText(plan, 48) || null;
    let resolvedLabel = cleanText(label, 80) || resolvedEmail || id;
    const extraMeta = {};
    if ((normalizedApp === 'claude-desktop' || normalizedApp === 'claude') && accessToken.startsWith('sk-ant-sid')) {
      extraMeta.sessionCookie = accessToken;
    } else if (normalizedApp === 'cursor' && accessToken.includes('%3A%3A')) {
      extraMeta.sessionCookie = accessToken;
      accessToken = decodeURIComponent(accessToken).split('::').slice(1).join('::') || accessToken;
    }

    if (normalizedApp === 'copilot' && accessToken) {
      const mode = environmentModeProvider() === 'own_network' ? 'own_network' : 'safe_tunnel';
      const proxyUrl = effectiveProxyUrl();
      if (mode === 'own_network' || proxyUrl) {
        const userRes = await httpRequestWithProxy({
          url: 'https://api.github.com/user',
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'DingtuDesktop/0.2.0' },
          proxyUrl,
          fetchImpl,
        }).catch(() => null);
        if (userRes?.ok && userRes.data?.login) {
          resolvedLabel = cleanText(label, 80) || cleanText(userRes.data.login, 80) || resolvedLabel;
          resolvedEmail = resolvedEmail || cleanText(userRes.data.email || '', 160) || null;
        }
      }
    }

    const saved = upsertAuthorizedAccount({
      appId: normalizedApp,
      alias: id,
      label: resolvedLabel,
      email: resolvedEmail,
      plan: resolvedPlan,
      oauthToken: accessToken || null,
      refreshToken: cleanRefresh || null,
      quotas: [],
      quotaState: 'local_detected',
      source: 'token-import',
      tags,
      note,
      extraMeta,
    });
    const rec = state.accounts.find(item => item.appId === normalizedApp && item.id === id);
    if (rec && (accessToken || cleanRefresh || extraMeta.sessionCookie)) {
      await refreshSingleAccountQuota(rec, currentIso()).catch(() => false);
      saveVault();
    }
    return Object.freeze({
      account: list(normalizedApp).accounts.find(item => item.id === id) || saved,
      ...list(normalizedApp),
    });
  }

  function importJson({ appId, jsonText, maxAllowed = MAX_ACCOUNTS_PER_APP } = {}) {
    ensureLoaded();
    const normalizedApp = assertAppId(appId);
    if (typeof jsonText !== 'string' || !jsonText.trim() || jsonText.length > 512 * 1024) {
      throw fail('JSON_IMPORT_INVALID', 'JSON 导入内容为空或体积超出限制。');
    }
    let parsed;
    try { parsed = JSON.parse(jsonText); } catch {
      throw fail('JSON_IMPORT_INVALID', 'JSON 格式解析失败，请检查语法。');
    }
    const rawList = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.accounts)
        ? parsed.accounts
        : (parsed && typeof parsed === 'object' ? [parsed] : null);
    if (!rawList || !rawList.length) {
      throw fail('JSON_IMPORT_INVALID', '未在 JSON 中找到可导入的账号记录。');
    }

    const cap = Math.max(1, Math.min(MAX_ACCOUNTS_PER_APP, Number(maxAllowed) || MAX_ACCOUNTS_PER_APP));
    const existingForApp = state.accounts.filter(item => item.appId === normalizedApp);
    const existingIds = new Set(existingForApp.map(item => item.id));
    const ts = currentIso();
    const imported = [];

    for (let i = 0; i < rawList.length; i += 1) {
      const item = rawList[i];
      if (!item || typeof item !== 'object') continue;
      const email = cleanText(item.email || '', 160) || null;
      const label = cleanText(item.label || item.name || email || '', 80) || null;
      const refreshToken = cleanText(
        item.refresh_token || item.refreshToken || item.token?.refresh_token || '',
        1024,
      ) || null;
      const oauthToken = cleanText(
        item.access_token || item.accessToken || item.oauthToken || item.apiKey || item.api_key || item.token?.access_token || '',
        2048,
      ) || null;
      const idToken = cleanText(item.id_token || item.idToken || item.token?.id_token || '', 4096) || null;
      const sessionCookie = cleanText(item.sessionKey || item.session_key || item.sessionCookie || '', 2048) || null;
      const plan = cleanText(item.plan || item.subscription_tier || item.quota?.subscription_tier || '', 48) || null;
      const tags = sanitizeTags(item.tags);
      const note = cleanText(item.note || item.notes || '', 240);

      let targetAlias = cleanText(item.alias || item.id || '', 32);
      if (!aliasPattern.test(targetAlias)) {
        if (existingIds.size === 0 && !imported.length && i === 0) targetAlias = 'main';
        else targetAlias = sanitizeAliasCandidate(email ? email.split('@')[0] : label, 'acct');
      }
      if (!existingIds.has(targetAlias) && existingIds.size + 1 > cap) {
        throw fail(
          cap === 1 ? 'PERSONAL_MULTI_LOGIN_FORBIDDEN' : 'ACCOUNT_LIMIT_REACHED',
          cap === 1
            ? '个人版授权仅支持默认单账号槽位（不能多登），多账号导入需升级企业版授权。'
            : `单个应用最多托管 ${MAX_ACCOUNTS_PER_APP} 个账号。`,
          cap === 1 ? 403 : 0,
        );
      }
      existingIds.add(targetAlias);
      const saved = upsertRecord({
        id: targetAlias,
        appId: normalizedApp,
        label: label || email || targetAlias,
        email,
        plan,
        source: 'json-import',
        status: 'ready',
        quotaState: refreshToken || oauthToken || sessionCookie ? 'local_detected' : 'session_only',
        quotas: [],
        credits: [],
        tags,
        note,
        oauthToken: oauthToken || sessionCookie,
        refreshToken,
        idToken,
        tokenExpiry: item.token?.expiry || item.tokenExpiry || null,
        extraMeta: sessionCookie ? { sessionCookie } : {},
        snapshot: null,
        createdAt: ts,
        updatedAt: ts,
      });
      imported.push(saved);
    }

    if (!imported.length) {
      throw fail('JSON_IMPORT_INVALID', 'JSON 中不包含有效的账号对象。');
    }
    return Object.freeze({
      importedCount: imported.length,
      ...list(normalizedApp),
    });
  }

  function exportJson({ appId = null, accountIds = null } = {}) {
    ensureLoaded();
    const filterApp = appId ? assertAppId(appId) : null;
    const idFilter = Array.isArray(accountIds) && accountIds.length ? new Set(accountIds.map(String)) : null;
    const matched = state.accounts
      .filter(item => (!filterApp || item.appId === filterApp) && (!idFilter || idFilter.has(item.id)))
      .map(item => projectAccount(item, state.activeByApp[item.appId] || null, state.groups));
    const jsonText = JSON.stringify({
      version: 1,
      kind: 'dingtu-accounts-sanitized',
      exportedAt: currentIso(),
      appId: filterApp || 'all',
      accounts: matched,
    }, null, 2);
    return Object.freeze({ count: matched.length, jsonText });
  }

  function updateMeta({ appId, accountId, label = '', plan = '', tags = [], note = '' } = {}) {
    ensureLoaded();
    const normalizedApp = assertAppId(appId);
    const id = assertAlias(accountId);
    const target = state.accounts.find(item => item.appId === normalizedApp && item.id === id);
    if (!target) throw fail('ACCOUNT_NOT_FOUND', '目标账号不存在。');
    if (typeof label === 'string' && label.trim()) target.label = cleanText(label, 80);
    if (typeof plan === 'string') target.plan = cleanText(plan, 48) || target.plan;
    target.tags = sanitizeTags(tags);
    target.note = cleanText(note, 240);
    target.updatedAt = currentIso();
    saveVault();
    return Object.freeze({
      account: projectAccount(target, state.activeByApp[normalizedApp] || null, state.groups),
      ...list(normalizedApp),
    });
  }

  function batchRemove({ appId, accountIds = [] } = {}) {
    ensureLoaded();
    const normalizedApp = assertAppId(appId);
    const toDelete = new Set((Array.isArray(accountIds) ? accountIds : []).filter(x => typeof x === 'string' && aliasPattern.test(x)));
    let removedCount = 0;
    state.accounts = state.accounts.filter(item => {
      if (item.appId === normalizedApp && toDelete.has(item.id)) {
        removedCount += 1;
        return false;
      }
      return true;
    });
    if (toDelete.has(state.activeByApp[normalizedApp])) {
      const fallback = state.accounts.find(item => item.appId === normalizedApp);
      if (fallback) state.activeByApp[normalizedApp] = fallback.id;
      else delete state.activeByApp[normalizedApp];
    }
    if (removedCount > 0) saveVault();
    return Object.freeze({ removedCount, ...list(normalizedApp) });
  }

  async function switchAntigravityAccount(target, prevAccount) {
    const credOpts = { platform: platform === 'windows' ? 'win32' : platform, homeDir, appDataDir, now, ...(execWindowsCred ? { execWindowsCred } : {}) };
    if (prevAccount && !prevAccount.refreshToken) {
      const existing = await readAntigravityCredential(credOpts).catch(() => null);
      if (existing?.found && existing.refreshToken) {
        const diskEmail = normalizeEmail(existing.email) || normalizeEmail(decodeJwtPayload(existing.idToken)?.email);
        if (diskIdentityMatchesPrevAccount(diskEmail, prevAccount)) {
          prevAccount.oauthToken = existing.accessToken || prevAccount.oauthToken;
          prevAccount.refreshToken = existing.refreshToken;
          prevAccount.idToken = existing.idToken || prevAccount.idToken;
          prevAccount.tokenExpiry = existing.expiry || prevAccount.tokenExpiry;
        }
      }
    }

    const refreshToken = target.refreshToken || target.snapshot?.refreshToken || null;
    let accessToken = target.oauthToken || target.snapshot?.accessToken || '';
    let idToken = target.idToken || target.snapshot?.idToken || null;
    let tokenExpiry = target.tokenExpiry || target.snapshot?.expiry || null;

    const idTokenEmail = normalizeEmail(decodeJwtPayload(idToken)?.email);
    if (targetEmailConflicts(idTokenEmail, target)) {
      throw fail('ACCOUNT_SWITCH_FAILED', '检测到该 Antigravity 账号凭据与目标邮箱不一致，已拒绝切换，请重新授权或导入该账号。');
    }

    let switchedLocalFile = false;
    if (refreshToken) {
      const needsRefresh = !accessToken || !tokenExpiry || (Date.parse(tokenExpiry) - currentMs() < 600_000);
      const mode = environmentModeProvider() === 'own_network' ? 'own_network' : 'safe_tunnel';
      const proxyUrl = effectiveProxyUrl();
      if (needsRefresh && (mode === 'own_network' || proxyUrl)) {
        try {
          const refreshed = await refreshAntigravityToken({ refreshToken, proxyUrl, fetchImpl });
          accessToken = refreshed.accessToken;
          target.oauthToken = refreshed.accessToken;
          target.refreshToken = refreshed.refreshToken || refreshToken;
          target.idToken = refreshed.idToken || idToken;
          target.tokenExpiry = refreshed.expiry || tokenExpiry;
          idToken = target.idToken;
          tokenExpiry = target.tokenExpiry;
        } catch {}
      }
      try {
        await writeAntigravityCredential({
          accessToken,
          refreshToken: target.refreshToken || refreshToken,
          idToken,
          expiry: tokenExpiry,
          email: target.email || target.label,
          accountId: target.id,
          syncCli: true,
        }, credOpts);
        switchedLocalFile = true;
      } catch (err) {
        if (err?.code === 'CREDENTIAL_WRITE_FAILED' || err?.code === 'ANTIGRAVITY_CREDENTIAL_TOO_LARGE' || err?.code === 'ACCOUNT_SWITCH_FAILED') {
          throw err;
        }
        throw fail('ACCOUNT_SWITCH_FAILED', '写入 Antigravity 本机凭据失败，请确认旧进程已关闭后重试。');
      }
    }

    const ts = currentIso();
    state.activeByApp.antigravity = target.id;
    target.lastSwitchedAt = ts;
    target.updatedAt = ts;
    target.switchHistory = [ts, ...(Array.isArray(target.switchHistory) ? target.switchHistory : [])].slice(0, MAX_SWITCH_HISTORY);
    try {
      saveVault();
    } catch (err) {
      if (err?.code === 'SECURE_STORE_UNAVAILABLE' || err?.code === 'SECURE_STORE_OPERATION_FAILED') throw err;
      throw fail('SECURE_STORE_OPERATION_FAILED', '保存本地账号状态失败，请重试。');
    }

    return Object.freeze({
      appId: 'antigravity',
      activeAccountId: target.id,
      switchedLocalFile,
      account: projectAccount(target, target.id, state.groups),
    });
  }

  function switchAccount({ appId, accountId } = {}) {
    ensureLoaded();
    const normalizedApp = assertAppId(appId);
    const id = assertAlias(accountId);
    const target = state.accounts.find(item => item.appId === normalizedApp && item.id === id);
    if (!target) {
      throw fail('ACCOUNT_NOT_FOUND', '目标账号槽位不存在。');
    }
    const prevId = state.activeByApp[normalizedApp] || null;
    const prevAccount = prevId && prevId !== id
      ? state.accounts.find(item => item.appId === normalizedApp && item.id === prevId)
      : null;

    if (normalizedApp === 'antigravity') {
      return switchAntigravityAccount(target, prevAccount);
    }

    let switchedLocalFile = false;
    let switchNote = null;
    let partitionIsolated = false;

    if (normalizedApp === 'cursor') {
      const dbPath = findCursorDbPath();
      const targetEmail = normalizeEmail(target.email);
      let targetKeys = target.snapshot?.kind === 'cursor-vscdb'
        ? { ...target.snapshot.keys }
        : {
          ...(target.oauthToken ? { 'cursorAuth/accessToken': target.oauthToken } : {}),
          ...(target.refreshToken ? { 'cursorAuth/refreshToken': target.refreshToken } : {}),
          ...(target.email ? { 'cursorAuth/cachedEmail': target.email } : {}),
          ...(target.plan ? { 'cursorAuth/stripeMembershipType': target.plan } : {}),
        };
      const snapEmail = normalizeEmail(targetKeys['cursorAuth/cachedEmail']);
      const snapConflict = targetEmailConflicts(snapEmail, target);
      if (snapConflict) {
        if (target.oauthToken || target.refreshToken) {
          targetKeys = {
            ...(target.oauthToken ? { 'cursorAuth/accessToken': target.oauthToken } : {}),
            ...(target.refreshToken ? { 'cursorAuth/refreshToken': target.refreshToken } : {}),
            ...(target.email ? { 'cursorAuth/cachedEmail': target.email } : {}),
            ...(target.plan ? { 'cursorAuth/stripeMembershipType': target.plan } : {}),
          };
          target.snapshot = { kind: 'cursor-vscdb', keys: targetKeys };
        } else {
          throw fail('ACCOUNT_SWITCH_FAILED', '检测到该 Cursor 账号快照与目标邮箱不一致，已拒绝写入，请重新导入或授权。');
        }
      }
      if (existsSync(dbPath) && Object.keys(targetKeys).length > 0) {
        try {
          if (prevAccount) {
            const existingKeys = readVscdbKeys(dbPath, [
              'cursorAuth/cachedEmail',
              'cursorAuth/stripeMembershipType',
              'cursorAuth/accessToken',
              'cursorAuth/refreshToken',
              'cursorAuth/cachedSignUpType',
            ]);
            if (Object.keys(existingKeys).length && diskIdentityMatchesPrevAccount(existingKeys['cursorAuth/cachedEmail'], prevAccount)) {
              prevAccount.snapshot = { kind: 'cursor-vscdb', keys: existingKeys };
            }
          }
          switchedLocalFile = writeVscdbKeys(dbPath, targetKeys);
          const verifyKeys = readVscdbKeys(dbPath, ['cursorAuth/cachedEmail']);
          if (targetEmail && normalizeEmail(verifyKeys['cursorAuth/cachedEmail']) && normalizeEmail(verifyKeys['cursorAuth/cachedEmail']) !== targetEmail) {
            throw fail('ACCOUNT_SWITCH_FAILED', '写入 Cursor state.vscdb 后回读校验失败：磁盘邮箱与目标不一致。');
          }
          const storageJsonPath = path.join(path.dirname(dbPath), 'storage.json');
          if (switchedLocalFile && existsSync(storageJsonPath)) {
            try {
              const st = JSON.parse(readFileSync(storageJsonPath, 'utf8'));
              if (targetKeys['cursorAuth/cachedEmail']) st['cursorAuth/cachedEmail'] = targetKeys['cursorAuth/cachedEmail'];
              if (targetKeys['cursorAuth/stripeMembershipType']) st['cursorAuth/stripeMembershipType'] = targetKeys['cursorAuth/stripeMembershipType'];
              atomicWriteBuffer(storageJsonPath, Buffer.from(JSON.stringify(st, null, 2), 'utf8'));
            } catch {}
          }
        } catch (err) {
          if (err?.code === 'ACCOUNT_SWITCH_FAILED') throw err;
          throw fail('ACCOUNT_SWITCH_FAILED', '写入 Cursor state.vscdb 失败，请先关闭 Cursor 后重试。');
        }
      }
    } else if (normalizedApp === 'windsurf') {
      const dbPath = findWindsurfDbPath();
      const targetEmail = normalizeEmail(target.email);
      let authJsonStr = target.snapshot?.kind === 'windsurf-vscdb'
        ? target.snapshot.keys?.windsurfAuthStatus
        : null;
      const snapAuthObj = parseJsonObject(authJsonStr);
      if (snapAuthObj && targetEmailConflicts(snapAuthObj.email || snapAuthObj.name, target)) {
        if (target.oauthToken) {
          authJsonStr = JSON.stringify({
            apiKey: target.oauthToken,
            ...(target.email ? { email: target.email, name: target.label || target.email } : {}),
            ...(target.plan ? { planName: target.plan } : {}),
          });
          target.snapshot = { kind: 'windsurf-vscdb', keys: { windsurfAuthStatus: authJsonStr } };
        } else {
          throw fail('ACCOUNT_SWITCH_FAILED', '检测到该 Windsurf 账号快照与目标邮箱不一致，已拒绝写入，请重新导入。');
        }
      }
      if (!authJsonStr && target.oauthToken) {
        authJsonStr = JSON.stringify({
          apiKey: target.oauthToken,
          ...(target.email ? { email: target.email, name: target.label || target.email } : {}),
          ...(target.plan ? { planName: target.plan } : {}),
        });
        target.snapshot = { kind: 'windsurf-vscdb', keys: { windsurfAuthStatus: authJsonStr } };
      }
      if (existsSync(dbPath) && authJsonStr) {
        try {
          if (prevAccount) {
            const existingKeys = readVscdbKeys(dbPath, ['windsurfAuthStatus']);
            if (existingKeys.windsurfAuthStatus) {
              const prevParsed = parseJsonObject(existingKeys.windsurfAuthStatus);
              if (diskIdentityMatchesPrevAccount(prevParsed?.email || prevParsed?.name, prevAccount)) {
                prevAccount.snapshot = { kind: 'windsurf-vscdb', keys: existingKeys };
              }
            }
          }
          switchedLocalFile = writeVscdbKeys(dbPath, { windsurfAuthStatus: authJsonStr });
          const verifyKeys = readVscdbKeys(dbPath, ['windsurfAuthStatus']);
          const verifyObj = parseJsonObject(verifyKeys.windsurfAuthStatus);
          if (targetEmail && verifyObj?.email && normalizeEmail(verifyObj.email) !== targetEmail) {
            throw fail('ACCOUNT_SWITCH_FAILED', '写入 Windsurf state.vscdb 后回读校验失败：磁盘邮箱与目标不一致。');
          }
        } catch (err) {
          if (err?.code === 'ACCOUNT_SWITCH_FAILED') throw err;
          throw fail('ACCOUNT_SWITCH_FAILED', '写入 Windsurf state.vscdb 失败，请先关闭 Windsurf 后重试。');
        }
      }
    } else if (normalizedApp === 'claude-code') {
      const credsPath = path.join(homeDir, '.claude', '.credentials.json');
      const cfgPath = path.join(homeDir, '.claude.json');
      const targetEmail = normalizeEmail(target.email);
      try {
        if (prevAccount && (existsSync(credsPath) || existsSync(cfgPath))) {
          let prevCreds = null;
          let prevCredsB64 = null;
          let prevOauthAcct = null;
          if (existsSync(credsPath)) {
            const buf = readFileSync(credsPath);
            prevCredsB64 = buf.toString('base64');
            prevCreds = parseJsonObject(buf)?.claudeAiOauth || null;
          }
          if (existsSync(cfgPath)) {
            prevOauthAcct = parseJsonObject(readFileSync(cfgPath))?.oauthAccount || null;
          }
          if (diskIdentityMatchesPrevAccount(prevOauthAcct?.emailAddress, prevAccount)) {
            prevAccount.snapshot = {
              kind: 'claude-code-dual',
              targetPath: credsPath,
              payloadBase64: prevCredsB64,
              claudeAiOauth: prevCreds,
              oauthAccount: prevOauthAcct,
            };
          }
        }
        const snapDualEmail = target.snapshot?.oauthAccount?.emailAddress || null;
        const snapConflict = targetEmailConflicts(snapDualEmail, target);
        if (snapConflict && !target.oauthToken) {
          throw fail('ACCOUNT_SWITCH_FAILED', '检测到该 Claude Code 账号快照与目标邮箱不一致，已拒绝写入，请重新授权。');
        }
        if (!snapConflict && target.snapshot?.kind === 'claude-code-dual') {
          let curCredsObj = existsSync(credsPath) ? (parseJsonObject(readFileSync(credsPath)) || {}) : {};
          if (target.snapshot.claudeAiOauth) {
            curCredsObj.claudeAiOauth = target.snapshot.claudeAiOauth;
            atomicWriteBuffer(credsPath, Buffer.from(JSON.stringify(curCredsObj, null, 2), 'utf8'));
            switchedLocalFile = true;
          } else if (typeof target.snapshot.payloadBase64 === 'string') {
            atomicWriteBuffer(credsPath, Buffer.from(target.snapshot.payloadBase64, 'base64'));
            switchedLocalFile = true;
          }
          const targetOauthAcct = target.snapshot.oauthAccount || target.extraMeta?.claudeOauthAccount;
          if (targetOauthAcct && typeof targetOauthAcct === 'object') {
            const curCfgObj = existsSync(cfgPath) ? (parseJsonObject(readFileSync(cfgPath)) || {}) : {};
            curCfgObj.oauthAccount = targetOauthAcct;
            atomicWriteBuffer(cfgPath, Buffer.from(JSON.stringify(curCfgObj, null, 2), 'utf8'));
            switchedLocalFile = true;
          }
        } else if (!snapConflict && target.snapshot?.kind === 'file' && typeof target.snapshot.payloadBase64 === 'string') {
          atomicWriteBuffer(credsPath, Buffer.from(target.snapshot.payloadBase64, 'base64'));
          switchedLocalFile = true;
        } else if (target.oauthToken) {
          const curCredsObj = existsSync(credsPath) ? (parseJsonObject(readFileSync(credsPath)) || {}) : {};
          const nextCreds = {
            accessToken: target.oauthToken,
            ...(target.refreshToken ? { refreshToken: target.refreshToken } : {}),
            ...(target.plan ? { subscriptionType: target.plan } : {}),
          };
          curCredsObj.claudeAiOauth = nextCreds;
          const nextCredsBuf = Buffer.from(JSON.stringify(curCredsObj, null, 2), 'utf8');
          atomicWriteBuffer(credsPath, nextCredsBuf);
          const extraAcct = target.extraMeta?.claudeOauthAccount;
          const cleanExtraAcct = extraAcct && !targetEmailConflicts(extraAcct.emailAddress, target) ? extraAcct : null;
          let writtenOauthAcct = cleanExtraAcct;
          if (existsSync(cfgPath) || cleanExtraAcct || target.email) {
            const curCfgObj = existsSync(cfgPath) ? (parseJsonObject(readFileSync(cfgPath)) || {}) : {};
            if (cleanExtraAcct) {
              curCfgObj.oauthAccount = cleanExtraAcct;
            } else if (target.email) {
              curCfgObj.oauthAccount = {
                ...(curCfgObj.oauthAccount && typeof curCfgObj.oauthAccount === 'object' ? curCfgObj.oauthAccount : {}),
                emailAddress: target.email,
              };
            }
            if (curCfgObj.oauthAccount) {
              writtenOauthAcct = curCfgObj.oauthAccount;
              atomicWriteBuffer(cfgPath, Buffer.from(JSON.stringify(curCfgObj, null, 2), 'utf8'));
            }
          }
          target.snapshot = {
            kind: 'claude-code-dual',
            targetPath: credsPath,
            payloadBase64: nextCredsBuf.toString('base64'),
            claudeAiOauth: nextCreds,
            oauthAccount: writtenOauthAcct,
          };
          switchedLocalFile = true;
        }
        if (switchedLocalFile && targetEmail && existsSync(cfgPath)) {
          const writtenCfgEmail = normalizeEmail(parseJsonObject(readFileSync(cfgPath))?.oauthAccount?.emailAddress);
          if (writtenCfgEmail && writtenCfgEmail !== targetEmail) {
            throw fail('ACCOUNT_SWITCH_FAILED', '写入 ~/.claude.json 后回读校验失败：磁盘邮箱与目标不一致。');
          }
        }
      } catch (err) {
        if (err?.code === 'ACCOUNT_SWITCH_FAILED') throw err;
        throw fail('ACCOUNT_SWITCH_FAILED', '切换 Claude Code 凭据失败，请确认未占用 ~/.claude/.credentials.json。');
      }
    } else if (normalizedApp === 'gemini-cli') {
      const oauthPath = path.join(homeDir, '.gemini', 'oauth_creds.json');
      const acctPath = path.join(homeDir, '.gemini', 'google_accounts.json');
      const targetEmail = normalizeEmail(target.email);
      const extractGeminiEmails = (acctBuf, oauthBuf) => {
        const acctObj = parseJsonObject(acctBuf);
        const oauthObj = parseJsonObject(oauthBuf);
        const acctEmail = typeof acctObj?.active === 'string' ? acctObj.active : acctObj?.active?.email;
        const jwtEmail = decodeJwtPayload(oauthObj?.id_token)?.email;
        return normalizeEmail(jwtEmail) || normalizeEmail(acctEmail);
      };
      const hasTargetData = Boolean(
        target.snapshot?.kind === 'gemini-cli-dual'
        || target.refreshToken
        || target.oauthToken
        || target.email,
      );
      if (hasTargetData) {
        try {
          if (prevAccount && (existsSync(oauthPath) || existsSync(acctPath))) {
            const diskOauthBuf = existsSync(oauthPath) ? readFileSync(oauthPath) : null;
            const diskAcctBuf = existsSync(acctPath) ? readFileSync(acctPath) : null;
            const diskEmail = extractGeminiEmails(diskAcctBuf, diskOauthBuf);
            if (diskIdentityMatchesPrevAccount(diskEmail, prevAccount)) {
              prevAccount.snapshot = {
                kind: 'gemini-cli-dual',
                oauthPath,
                accountsPath: acctPath,
                oauthBase64: diskOauthBuf ? diskOauthBuf.toString('base64') : null,
                accountsBase64: diskAcctBuf ? diskAcctBuf.toString('base64') : null,
                email: prevAccount.email,
              };
            }
          }
          const snapAcctBuf = target.snapshot?.accountsBase64 ? Buffer.from(target.snapshot.accountsBase64, 'base64') : null;
          const snapOauthBuf = target.snapshot?.oauthBase64 ? Buffer.from(target.snapshot.oauthBase64, 'base64') : null;
          const snapEmail = extractGeminiEmails(snapAcctBuf, snapOauthBuf) || normalizeEmail(target.snapshot?.email);
          const snapConflict = targetEmailConflicts(snapEmail, target);
          const fieldIdEmail = decodeJwtPayload(target.idToken)?.email || null;
          const fieldConflict = targetEmailConflicts(fieldIdEmail, target);

          if ((snapConflict || fieldConflict) && !((target.oauthToken || target.refreshToken) && !fieldConflict)) {
            throw fail('ACCOUNT_SWITCH_FAILED', '检测到该 Gemini CLI 账号凭据与目标邮箱不一致，已拒绝写入，请重新授权或导入。');
          }

          if (!snapConflict && snapOauthBuf) {
            atomicWriteBuffer(oauthPath, snapOauthBuf);
            switchedLocalFile = true;
          } else if ((target.oauthToken || target.refreshToken) && !fieldConflict) {
            const payload = {
              ...(target.oauthToken ? { access_token: target.oauthToken } : {}),
              ...(target.refreshToken ? { refresh_token: target.refreshToken } : {}),
              ...(target.idToken ? { id_token: target.idToken } : {}),
              ...(target.tokenExpiry ? { expiry_date: Date.parse(target.tokenExpiry) || undefined } : {}),
              token_type: 'Bearer',
            };
            const cleanOauthBuf = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
            atomicWriteBuffer(oauthPath, cleanOauthBuf);
            switchedLocalFile = true;
          }
          if (!snapConflict && snapAcctBuf) {
            atomicWriteBuffer(acctPath, snapAcctBuf);
            switchedLocalFile = true;
          } else if (target.email) {
            let curAcct = { active: target.email, old: [] };
            if (existsSync(acctPath)) {
              try {
                const parsed = JSON.parse(readFileSync(acctPath, 'utf8'));
                const oldList = Array.isArray(parsed?.old) ? [...parsed.old] : [];
                const prevActiveStr = typeof parsed?.active === 'string' ? parsed.active : parsed?.active?.email;
                if (prevActiveStr && prevActiveStr !== target.email && !oldList.includes(prevActiveStr)) {
                  oldList.push(prevActiveStr);
                }
                curAcct = {
                  ...parsed,
                  active: typeof parsed?.active === 'object' && parsed.active !== null
                    ? { ...parsed.active, email: target.email }
                    : target.email,
                  old: oldList.filter(x => x !== target.email),
                };
              } catch {}
            }
            const cleanAcctBuf = Buffer.from(JSON.stringify(curAcct, null, 2), 'utf8');
            atomicWriteBuffer(acctPath, cleanAcctBuf);
            switchedLocalFile = true;
          }
          if (snapConflict && switchedLocalFile) {
            target.snapshot = {
              kind: 'gemini-cli-dual',
              oauthPath,
              accountsPath: acctPath,
              oauthBase64: existsSync(oauthPath) ? readFileSync(oauthPath).toString('base64') : null,
              accountsBase64: existsSync(acctPath) ? readFileSync(acctPath).toString('base64') : null,
              email: target.email || null,
            };
          }
          if (switchedLocalFile && targetEmail) {
            const readEmail = extractGeminiEmails(
              existsSync(acctPath) ? readFileSync(acctPath) : null,
              existsSync(oauthPath) ? readFileSync(oauthPath) : null,
            );
            if (readEmail && readEmail !== targetEmail) {
              throw fail('ACCOUNT_SWITCH_FAILED', '写入 Gemini CLI 凭据后回读校验失败：磁盘邮箱与目标不一致。');
            }
          }
        } catch (err) {
          if (err?.code === 'ACCOUNT_SWITCH_FAILED') throw err;
          throw fail('ACCOUNT_SWITCH_FAILED', '写入 Gemini CLI 凭据失败，请稍后重试。');
        }
      }
    } else if (normalizedApp === 'grok-cli') {
      const grokPath = path.join(homeDir, '.grok', 'auth.json');
      const targetEmail = normalizeEmail(target.email);
      const extractGrokEmail = (obj, prefScope = null) => {
        if (!obj || typeof obj !== 'object') return null;
        const activeKey = prefScope || obj.default || obj.activeScope || null;
        const scoped = activeKey && obj.scopes?.[activeKey] ? obj.scopes[activeKey] : null;
        return normalizeEmail(scoped?.email) || normalizeEmail(obj.email);
      };
      try {
        if (prevAccount && existsSync(grokPath)) {
          const diskBuf = readFileSync(grokPath);
          const diskObj = parseJsonObject(diskBuf);
          const diskEmail = extractGrokEmail(diskObj, prevAccount.extraMeta?.registryScope);
          const scopeMatch = Boolean(prevAccount.extraMeta?.registryScope && diskObj?.default === prevAccount.extraMeta.registryScope);
          if ((normalizeEmail(prevAccount.email) ? diskEmail === normalizeEmail(prevAccount.email) : (scopeMatch || diskIdentityMatchesPrevAccount(diskEmail, prevAccount)))) {
            prevAccount.snapshot = {
              kind: 'file',
              targetPath: grokPath,
              payloadBase64: diskBuf.toString('base64'),
            };
          }
        }
        const snapObj = target.snapshot?.kind === 'file' && typeof target.snapshot.payloadBase64 === 'string'
          ? parseJsonObject(Buffer.from(target.snapshot.payloadBase64, 'base64'))
          : null;
        const snapEmail = extractGrokEmail(snapObj, target.extraMeta?.registryScope);
        const snapConflict = targetEmailConflicts(snapEmail, target);
        if (snapConflict && !target.oauthToken) {
          throw fail('ACCOUNT_SWITCH_FAILED', '检测到该 Grok CLI 账号快照与目标邮箱不一致，已拒绝写入，请重新导入。');
        }
        if (!snapConflict && target.snapshot?.kind === 'file' && typeof target.snapshot.payloadBase64 === 'string') {
          const existingObj = existsSync(grokPath) ? parseJsonObject(readFileSync(grokPath)) : null;
          if (existingObj?.scopes && typeof existingObj.scopes === 'object' && target.extraMeta?.registryScope && snapObj) {
            const scopeName = target.extraMeta.registryScope;
            const merged = {
              ...existingObj,
              default: scopeName,
              scopes: {
                ...existingObj.scopes,
                [scopeName]: snapObj.scopes?.[scopeName] || snapObj,
              },
            };
            atomicWriteBuffer(grokPath, Buffer.from(JSON.stringify(merged, null, 2), 'utf8'));
          } else {
            atomicWriteBuffer(grokPath, Buffer.from(target.snapshot.payloadBase64, 'base64'));
          }
          switchedLocalFile = true;
        } else if (target.oauthToken) {
          const existingObj = existsSync(grokPath) ? (parseJsonObject(readFileSync(grokPath)) || {}) : {};
          const payload = {
            ...existingObj,
            ...(target.oauthToken.startsWith('xai-')
              ? { apiKey: target.oauthToken, authMode: 'api_key' }
              : {
                access_token: target.oauthToken,
                ...('accessToken' in existingObj ? { accessToken: target.oauthToken } : {}),
                ...(target.refreshToken ? { refresh_token: target.refreshToken } : {}),
              }),
            ...(target.email ? { email: target.email } : {}),
          };
          const cleanBuf = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
          atomicWriteBuffer(grokPath, cleanBuf);
          target.snapshot = { kind: 'file', targetPath: grokPath, payloadBase64: cleanBuf.toString('base64') };
          switchedLocalFile = true;
        }
        if (switchedLocalFile && targetEmail && existsSync(grokPath)) {
          const writtenEmail = extractGrokEmail(parseJsonObject(readFileSync(grokPath)), target.extraMeta?.registryScope);
          if (writtenEmail && writtenEmail !== targetEmail) {
            throw fail('ACCOUNT_SWITCH_FAILED', '写入 ~/.grok/auth.json 后回读校验失败：磁盘邮箱与目标不一致。');
          }
        }
      } catch (err) {
        if (err?.code === 'ACCOUNT_SWITCH_FAILED') throw err;
        throw fail('ACCOUNT_SWITCH_FAILED', '写入 ~/.grok/auth.json 失败，请确认 Grok CLI 未占用配置。');
      }
    } else if (normalizedApp === 'copilot') {
      const hostsPath = allowlistedSwitchTarget('copilot');
      const extractCopilotUser = bufOrObj => {
        const obj = Buffer.isBuffer(bufOrObj) || typeof bufOrObj === 'string' ? parseJsonObject(bufOrObj) : bufOrObj;
        const first = obj ? Object.values(obj)[0] : null;
        return normalizeHandle(first?.user);
      };
      const expectedCopilotHandle = rec => {
        if (normalizeEmail(rec?.email)) return normalizeHandle(rec.email);
        const lbl = cleanText(rec?.label || '', 160);
        if (!lbl || /本机账号|本机配置|本机已登录会话/.test(lbl)) return null;
        return normalizeHandle(lbl);
      };
      if (hostsPath) {
        try {
          if (prevAccount && existsSync(hostsPath)) {
            const diskBuf = readFileSync(hostsPath);
            const diskUser = extractCopilotUser(diskBuf);
            const prevHandle = expectedCopilotHandle(prevAccount);
            if (!prevHandle || (diskUser && diskUser === prevHandle)) {
              const appsP = hostsPath.replace(/hosts\.json$/, 'apps.json');
              prevAccount.snapshot = {
                kind: 'copilot-files',
                targetPath: hostsPath,
                payloadBase64: diskBuf.toString('base64'),
                appsPath: appsP,
                appsBase64: existsSync(appsP) ? readFileSync(appsP).toString('base64') : null,
              };
            }
          }
          const targetHandle = expectedCopilotHandle(target);
          let snapBuf = typeof target.snapshot?.payloadBase64 === 'string' ? Buffer.from(target.snapshot.payloadBase64, 'base64') : null;
          const snapUser = snapBuf ? extractCopilotUser(snapBuf) : null;
          const snapConflict = Boolean(targetHandle && snapUser && snapUser !== targetHandle);
          if (snapConflict && !target.oauthToken) {
            throw fail('ACCOUNT_SWITCH_FAILED', '检测到该 Copilot 账号快照与目标用户不一致，已拒绝写入，请重新授权或导入。');
          }
          if (!snapConflict && (target.snapshot?.kind === 'copilot-files' || target.snapshot?.kind === 'file') && snapBuf) {
            atomicWriteBuffer(target.snapshot.targetPath || hostsPath, snapBuf);
            if (target.snapshot.kind === 'copilot-files' && target.snapshot.appsPath && target.snapshot.appsBase64) {
              atomicWriteBuffer(target.snapshot.appsPath, Buffer.from(target.snapshot.appsBase64, 'base64'));
            }
            switchedLocalFile = true;
          } else if (target.oauthToken) {
            const existingHosts = existsSync(hostsPath) ? (parseJsonObject(readFileSync(hostsPath)) || {}) : {};
            const hostKey = Object.keys(existingHosts)[0] || 'github.com';
            const userLabel = cleanText(target.label || target.email || existingHosts[hostKey]?.user || 'github-user', 160);
            const nextHosts = {
              ...existingHosts,
              [hostKey]: {
                ...(existingHosts[hostKey] && typeof existingHosts[hostKey] === 'object' ? existingHosts[hostKey] : {}),
                user: userLabel,
                oauth_token: target.oauthToken,
              },
            };
            const hostsBuf = Buffer.from(JSON.stringify(nextHosts, null, 2), 'utf8');
            atomicWriteBuffer(hostsPath, hostsBuf);

            const appsP = hostsPath.replace(/hosts\.json$/, 'apps.json');
            const existingApps = existsSync(appsP) ? (parseJsonObject(readFileSync(appsP)) || {}) : {};
            const appKey = Object.keys(existingApps)[0] || 'github.com:Iv1.b507a08c87ecfe98';
            const nextApps = {
              ...existingApps,
              [appKey]: {
                ...(existingApps[appKey] && typeof existingApps[appKey] === 'object' ? existingApps[appKey] : { githubAppId: 'Iv1.b507a08c87ecfe98' }),
                user: userLabel,
                oauth_token: target.oauthToken,
              },
            };
            const appsBuf = Buffer.from(JSON.stringify(nextApps, null, 2), 'utf8');
            atomicWriteBuffer(appsP, appsBuf);
            target.snapshot = {
              kind: 'copilot-files',
              targetPath: hostsPath,
              payloadBase64: hostsBuf.toString('base64'),
              appsPath: appsP,
              appsBase64: appsBuf.toString('base64'),
            };
            switchedLocalFile = true;
          }
          if (switchedLocalFile && existsSync(hostsPath)) {
            const verifyObj = parseJsonObject(readFileSync(hostsPath));
            const writtenUser = extractCopilotUser(verifyObj);
            if (targetHandle && writtenUser && writtenUser !== targetHandle) {
              throw fail('ACCOUNT_SWITCH_FAILED', '写入 Copilot hosts.json 后回读校验失败：用户与目标槽位不一致。');
            }
          }
        } catch (err) {
          if (err?.code === 'ACCOUNT_SWITCH_FAILED') throw err;
          throw fail('ACCOUNT_SWITCH_FAILED', '写入 GitHub Copilot 凭据文件失败。');
        }
      }
    } else if (normalizedApp === 'kiro') {
      const kiroTokenPath = allowlistedSwitchTarget('kiro');
      const targetEmail = normalizeEmail(target.email);
      if (kiroTokenPath) {
        try {
          if (prevAccount && existsSync(kiroTokenPath)) {
            const diskBuf = readFileSync(kiroTokenPath);
            const diskObj = parseJsonObject(diskBuf);
            const prevEmail = normalizeEmail(prevAccount.email);
            const matchByEmail = prevEmail ? normalizeEmail(diskObj?.email) === prevEmail : true;
            const matchByArn = !prevEmail && prevAccount.extraMeta?.profileArn
              ? diskObj?.profileArn === prevAccount.extraMeta.profileArn
              : matchByEmail;
            if (matchByArn) {
              prevAccount.snapshot = {
                kind: 'file',
                targetPath: kiroTokenPath,
                payloadBase64: diskBuf.toString('base64'),
              };
            }
          }
          const snapBuf = target.snapshot?.kind === 'file' && typeof target.snapshot.payloadBase64 === 'string'
            ? Buffer.from(target.snapshot.payloadBase64, 'base64')
            : null;
          const snapObj = snapBuf ? parseJsonObject(snapBuf) : null;
          const snapConflict = targetEmailConflicts(snapObj?.email, target);
          if (snapConflict && !(target.oauthToken || target.refreshToken)) {
            throw fail('ACCOUNT_SWITCH_FAILED', '检测到该 Kiro 账号快照与目标邮箱不一致，已拒绝写入，请重新授权或导入。');
          }
          if (!snapConflict && snapBuf) {
            atomicWriteBuffer(kiroTokenPath, snapBuf);
            if (target.snapshot.companionPath && target.snapshot.companionBase64) {
              atomicWriteBuffer(target.snapshot.companionPath, Buffer.from(target.snapshot.companionBase64, 'base64'));
            }
            switchedLocalFile = true;
          } else if (target.oauthToken || target.refreshToken) {
            const kiroPayload = {
              accessToken: target.oauthToken || '',
              ...(target.refreshToken ? { refreshToken: target.refreshToken } : {}),
              ...(target.tokenExpiry ? { expiresAt: target.tokenExpiry } : {}),
              authMethod: target.extraMeta?.authMethod || target.plan || 'Builder ID',
              region: target.extraMeta?.region || 'us-east-1',
              ...(target.extraMeta?.profileArn ? { profileArn: target.extraMeta.profileArn } : {}),
              ...(target.extraMeta?.startUrl ? { startUrl: target.extraMeta.startUrl } : {}),
              ...(target.email ? { email: target.email } : {}),
            };
            const cleanBuf = Buffer.from(JSON.stringify(kiroPayload, null, 2), 'utf8');
            atomicWriteBuffer(kiroTokenPath, cleanBuf);
            target.snapshot = { kind: 'file', targetPath: kiroTokenPath, payloadBase64: cleanBuf.toString('base64') };
            switchedLocalFile = true;
          }
          if (switchedLocalFile && targetEmail && existsSync(kiroTokenPath)) {
            const writtenEmail = normalizeEmail(parseJsonObject(readFileSync(kiroTokenPath))?.email);
            if (writtenEmail && writtenEmail !== targetEmail) {
              throw fail('ACCOUNT_SWITCH_FAILED', '写入 Kiro 凭据文件后回读校验失败：磁盘邮箱与目标不一致。');
            }
          }
        } catch (err) {
          if (err?.code === 'ACCOUNT_SWITCH_FAILED') throw err;
          throw fail('ACCOUNT_SWITCH_FAILED', '写入 ~/.aws/sso/cache/kiro-auth-token.json 失败。');
        }
      }
    } else if (normalizedApp === 'claude-desktop') {
      const cfgPath = allowlistedSwitchTarget('claude-desktop');
      if (cfgPath && target.snapshot?.kind === 'file' && typeof target.snapshot.payloadBase64 === 'string') {
        try {
          if (prevAccount && existsSync(cfgPath)) {
            const diskBuf = readFileSync(cfgPath);
            const diskObj = parseJsonObject(diskBuf);
            if (diskIdentityMatchesPrevAccount(diskObj?.email || diskObj?.user?.email, prevAccount)) {
              prevAccount.snapshot = { kind: 'file', targetPath: cfgPath, payloadBase64: diskBuf.toString('base64') };
            }
          }
          const snapObj = parseJsonObject(Buffer.from(target.snapshot.payloadBase64, 'base64'));
          if (!targetEmailConflicts(snapObj?.email || snapObj?.user?.email, target)) {
            atomicWriteBuffer(cfgPath, Buffer.from(target.snapshot.payloadBase64, 'base64'));
            switchedLocalFile = true;
          }
        } catch {}
      }
      switchNote = 'Claude Desktop 官方客户端登录态受系统加密 Cookie 保护，如需多账号免重登隔离切换，请使用「Claude」独立安全容器或「Claude Code」。';
    } else if (webContainerApps.has(normalizedApp)) {
      partitionIsolated = true;
    } else if (normalizedApp === 'codex' || normalizedApp === 'codex-desktop') {
      const allowedTargetPath = allowlistedSwitchTarget(normalizedApp);
      if (allowedTargetPath) {
        try {
          if (prevAccount && existsSync(allowedTargetPath)) {
            const diskBuf = readFileSync(allowedTargetPath);
            const diskIdentity = extractCodexIdentityFromBuffer(diskBuf);
            if (codexIdentityMatchesRecord(diskIdentity, prevAccount)) {
              prevAccount.snapshot = {
                kind: 'file',
                targetPath: allowedTargetPath,
                payloadBase64: diskBuf.toString('base64'),
              };
            }
          }

          const targetIdPayload = decodeJwtPayload(target.idToken);
          const targetAuthMeta = targetIdPayload?.['https://api.openai.com/auth'];
          const targetEmail = normalizeEmail(target.email);
          const targetAccountId = cleanText(target.extraMeta?.accountId || targetAuthMeta?.chatgpt_account_id || '', 96) || null;
          const fieldEmail = normalizeEmail(targetIdPayload?.email);
          const fieldConflict = Boolean(targetEmail && fieldEmail && fieldEmail !== targetEmail);

          let snapBuf = null;
          let snapConflict = false;
          if (target.snapshot?.kind === 'file' && typeof target.snapshot.payloadBase64 === 'string') {
            snapBuf = Buffer.from(target.snapshot.payloadBase64, 'base64');
            const snapId = extractCodexIdentityFromBuffer(snapBuf);
            snapConflict = Boolean(
              (targetEmail && snapId.email && snapId.email !== targetEmail)
              || (targetAccountId && snapId.accountId && snapId.accountId !== targetAccountId),
            );
          }

          const hasCleanFields = Boolean(target.oauthToken || target.refreshToken || target.idToken) && !fieldConflict;

          if (snapBuf && !snapConflict) {
            atomicWriteBuffer(allowedTargetPath, snapBuf);
            switchedLocalFile = true;
          } else if (hasCleanFields) {
            const payload = {
              auth_mode: 'chatgpt',
              OPENAI_API_KEY: null,
              tokens: {
                ...(target.idToken ? { id_token: target.idToken } : {}),
                ...(target.oauthToken ? { access_token: target.oauthToken } : {}),
                ...(target.refreshToken ? { refresh_token: target.refreshToken } : {}),
                ...(targetAccountId ? { account_id: targetAccountId } : {}),
              },
              last_refresh: currentIso(),
            };
            const cleanBuf = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
            atomicWriteBuffer(allowedTargetPath, cleanBuf);
            target.snapshot = {
              kind: 'file',
              targetPath: allowedTargetPath,
              payloadBase64: cleanBuf.toString('base64'),
            };
            switchedLocalFile = true;
          } else if (snapConflict || fieldConflict) {
            throw fail('ACCOUNT_SWITCH_FAILED', '检测到该 Codex 账号凭据与目标邮箱不一致，已拒绝写入错号，请重新导入或通过 OAuth 重新授权该槽位。');
          }

          if (switchedLocalFile && existsSync(allowedTargetPath)) {
            const writtenIdentity = extractCodexIdentityFromBuffer(readFileSync(allowedTargetPath));
            if (targetEmail && writtenIdentity.email && writtenIdentity.email !== targetEmail) {
              throw fail('ACCOUNT_SWITCH_FAILED', '写入 ~/.codex/auth.json 后回读校验失败：磁盘账号与目标邮箱不一致。');
            }
          }
        } catch (err) {
          if (err?.code === 'ACCOUNT_SWITCH_FAILED') throw err;
          throw fail('ACCOUNT_SWITCH_FAILED', '写入 ~/.codex/auth.json 失败，请确认 Codex 未占用配置文件。');
        }
      }
    } else {
      const allowedTargetPath = allowlistedSwitchTarget(normalizedApp);
      if (allowedTargetPath && target.snapshot?.kind === 'file' && typeof target.snapshot.payloadBase64 === 'string') {
        try {
          if (prevAccount && existsSync(allowedTargetPath)) {
            prevAccount.snapshot = {
              kind: 'file',
              targetPath: allowedTargetPath,
              payloadBase64: readFileSync(allowedTargetPath).toString('base64'),
            };
          }
          atomicWriteBuffer(allowedTargetPath, Buffer.from(target.snapshot.payloadBase64, 'base64'));
          if (target.snapshot.companionPath && target.snapshot.companionBase64) {
            atomicWriteBuffer(target.snapshot.companionPath, Buffer.from(target.snapshot.companionBase64, 'base64'));
          }
          switchedLocalFile = true;
        } catch {
          throw fail('ACCOUNT_SWITCH_FAILED', '写入本机应用凭据目录失败，请确认目标应用未占用配置文件。');
        }
      }
    }

    const ts = currentIso();
    state.activeByApp[normalizedApp] = id;
    target.lastSwitchedAt = ts;
    target.updatedAt = ts;
    target.switchHistory = [ts, ...(Array.isArray(target.switchHistory) ? target.switchHistory : [])].slice(0, MAX_SWITCH_HISTORY);
    try {
      saveVault();
    } catch (err) {
      if (err?.code === 'SECURE_STORE_UNAVAILABLE' || err?.code === 'SECURE_STORE_OPERATION_FAILED') throw err;
      throw fail('SECURE_STORE_OPERATION_FAILED', '保存本地账号状态失败，请重试。');
    }

    return Object.freeze({
      appId: normalizedApp,
      activeAccountId: id,
      switchedLocalFile,
      ...(switchNote ? { switchNote } : {}),
      ...(partitionIsolated ? { partitionIsolated: true } : {}),
      account: projectAccount(target, id, state.groups),
    });
  }

  async function refreshSingleAccountQuota(record, ts) {
    // 1. Auto-reprobe before giving up if slot lacks tokens/cookies or was a bare folder placeholder.
    if ((!record.oauthToken && !record.refreshToken && !record.extraMeta?.sessionCookie)
      || record.label === '本机已登录会话'
      || (typeof record.label === 'string' && record.label.includes('尚未登录'))) {
      if (!webContainerApps.has(record.appId)) {
        const probed = await probeLocalApp(record.appId).catch(() => null);
        if (probed) {
          if (probed.email && (!record.email || record.label === '本机已登录会话' || record.label.includes('尚未登录'))) {
            record.email = probed.email;
            record.label = probed.email;
          } else if (probed.label && (record.label === '本机已登录会话' || record.label.includes('尚未登录'))) {
            record.label = probed.label;
          }
          if (probed.plan && !record.plan) record.plan = probed.plan;
          if (probed.oauthToken && !record.oauthToken) record.oauthToken = probed.oauthToken;
          if (probed.refreshToken && !record.refreshToken) record.refreshToken = probed.refreshToken;
          if (probed.idToken && !record.idToken) record.idToken = probed.idToken;
          if (probed.tokenExpiry && !record.tokenExpiry) record.tokenExpiry = probed.tokenExpiry;
          if (probed.snapshot && !record.snapshot) record.snapshot = probed.snapshot;
          if (probed.extraMeta) record.extraMeta = { ...(record.extraMeta || {}), ...probed.extraMeta };
          if (Array.isArray(probed.quotas) && probed.quotas.length) {
            record.quotas = probed.quotas;
            record.credits = probed.credits || [];
            record.quotaState = 'synced';
            record.lastError = null;
            record.lastCheckedAt = ts;
            return true;
          }
        }
      }
    }

    // 2. Pure web containers without external quota APIs verify vault & partition health cleanly (and hydrate email if open).
    if (pureWebContainerApps.has(record.appId)) {
      if (!record.email && typeof webSessionProber === 'function') {
        const probed = await webSessionProber({ appId: record.appId, instanceId: record.id }).catch(() => null);
        if (probed?.email) {
          record.email = cleanText(probed.email, 160);
          if (!record.label || /已授权会话|默认安全容器/i.test(record.label)) record.label = record.email;
        }
      }
      record.lastCheckedAt = ts;
      record.quotaState = 'container_ready';
      record.lastError = null;
      return false;
    }

    const mode = environmentModeProvider() === 'own_network' ? 'own_network' : 'safe_tunnel';
    const proxyUrl = mode === 'safe_tunnel' ? proxyUrlProvider() : null;

    // 2b. For Claude Web / ChatGPT Web isolated containers, probe persistent Chromium partition first (bypasses Cloudflare JA3 blocks and hydrates real email).
    if ((record.appId === 'claude' || record.appId === 'chatgpt') && typeof webSessionProber === 'function' && (mode === 'own_network' || proxyUrl)) {
      const probed = await webSessionProber({ appId: record.appId, instanceId: record.id }).catch(() => null);
      if (probed) {
        if (probed.email) {
          record.email = cleanText(probed.email, 160);
          if (!record.label || /已授权会话|默认安全容器|^Claude(?:\s+Web)?\s*\(|^ChatGPT\s*\(/i.test(record.label)) {
            record.label = record.email;
          }
        }
        if (probed.plan) record.plan = cleanText(probed.plan, 48);
        if (probed.cookieValue) {
          record.extraMeta = {
            ...(record.extraMeta || {}),
            sessionCookie: probed.cookieValue,
            ...(probed.cookieName ? { cookieName: probed.cookieName } : {}),
            ...(probed.cookieHeader ? { cookieHeader: probed.cookieHeader } : {}),
          };
        }
        if (probed.usageData && typeof probed.usageData === 'object') {
          const quotas = record.appId === 'claude'
            ? extractAnthropicWindowQuotas(probed.usageData, { includeModels: true })
            : extractWhamWindowQuotas(probed.usageData, currentMs());
          if (quotas.length) {
            record.lastCheckedAt = ts;
            record.status = 'ready';
            record.quotas = quotas;
            record.quotaState = 'synced';
            record.lastError = null;
            return true;
          }
        }
        if (probed.sessionVerified || probed.email) {
          record.lastCheckedAt = ts;
          record.status = 'ready';
          record.lastError = null;
          if (record.appId === 'claude' && String(record.plan || '').toUpperCase() === 'FREE') {
            record.quotas = [
              { id: 'five_hour', label: '5h 限额', remainingPct: null, usedText: '可用', statusHint: '免费版按会话动态限额', resetAt: null, tone: 'neutral' },
              { id: 'seven_day', label: '7d 限额', remainingPct: null, usedText: '—', statusHint: '升级 Pro/Max 解锁周窗口明细', resetAt: null, tone: 'neutral' },
            ];
            record.quotaState = 'synced';
          } else if (!Array.isArray(record.quotas) || !record.quotas.length) {
            record.quotaState = 'container_ready';
          }
          return true;
        }
      }
    }

    const hasCredential = Boolean(record.oauthToken || record.refreshToken || record.extraMeta?.sessionCookie);

    if (!hasCredential) {
      record.lastCheckedAt = ts;
      record.quotaState = 'session_only';
      record.lastError = '本机暂未检测到有效登录凭据，请先添加账号或重新导入本机凭据';
      return false;
    }
    if (mode === 'safe_tunnel' && !proxyUrl) {
      record.lastCheckedAt = ts;
      record.quotaState = 'proxy_required';
      record.lastError = '安全通道未连接，请先开启底部连接或在设置中切换自有网络';
      return false;
    }

    try {
      if (record.appId === 'antigravity' || record.appId === 'gemini-cli') {
        const isGeminiCli = record.appId === 'gemini-cli';
        const doRefresh = () => isGeminiCli
          ? refreshGeminiCliToken({
            refreshToken: record.refreshToken,
            ...(record.extraMeta?.clientId ? { clientId: record.extraMeta.clientId } : {}),
            ...(record.extraMeta?.clientSecret ? { clientSecret: record.extraMeta.clientSecret } : {}),
            proxyUrl,
            fetchImpl,
          })
          : refreshAntigravityToken({ refreshToken: record.refreshToken, proxyUrl, fetchImpl });

        let accessToken = record.oauthToken;
        if (record.refreshToken && (!accessToken || isTokenExpiringSoon(record.tokenExpiry, currentMs()))) {
          const refreshed = await doRefresh();
          accessToken = refreshed.accessToken;
          record.oauthToken = refreshed.accessToken;
          record.refreshToken = refreshed.refreshToken || record.refreshToken;
          record.idToken = refreshed.idToken || record.idToken;
          record.tokenExpiry = refreshed.expiry || record.tokenExpiry;
        }
        let qRes;
        try {
          qRes = await fetchAntigravityQuota({ accessToken, proxyUrl, fetchImpl, nowMs: currentMs() });
        } catch (err) {
          if (record.refreshToken) {
            const refreshed = await doRefresh();
            accessToken = refreshed.accessToken;
            record.oauthToken = refreshed.accessToken;
            record.refreshToken = refreshed.refreshToken || record.refreshToken;
            record.tokenExpiry = refreshed.expiry || record.tokenExpiry;
            qRes = await fetchAntigravityQuota({ accessToken, proxyUrl, fetchImpl, nowMs: currentMs() });
          } else {
            throw err;
          }
        }
        record.lastCheckedAt = ts;
        record.plan = qRes.plan || record.plan;
        record.projectId = qRes.projectId || record.projectId;
        record.credits = qRes.credits || [];
        record.quotas = preserveValidAntigravityPartnerQuotas(qRes.quotas || [], record.quotas, currentMs());
        if (record.quotas.length) record.status = 'ready';
        record.quotaState = record.quotas.length ? 'synced' : 'refresh_failed';
        record.lastError = record.quotas.length ? null : '未返回可用模型配额';
        return record.quotas.length > 0;
      }

      if (record.appId === 'claude-code') {
        const fetchCcUsage = async tok => httpRequestWithProxy({
          url: 'https://api.anthropic.com/api/oauth/usage',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${tok}`,
            'anthropic-beta': 'oauth-2025-04-20',
            'User-Agent': 'dingtu-workbench/0.2.0',
          },
          proxyUrl,
          fetchImpl,
        });
        let tok = record.oauthToken;
        let refreshErr = null;
        if (record.refreshToken && (!tok || isTokenExpiringSoon(record.tokenExpiry, currentMs()))) {
          try {
            const ref = await refreshClaudeCodeToken({ refreshToken: record.refreshToken, proxyUrl, fetchImpl });
            tok = ref.accessToken;
            record.oauthToken = ref.accessToken;
            record.refreshToken = ref.refreshToken || record.refreshToken;
            record.tokenExpiry = ref.expiry;
          } catch (err) {
            refreshErr = err;
          }
        }
        let res = await fetchCcUsage(tok);
        if (res.status === 401 && record.refreshToken) {
          try {
            const ref = await refreshClaudeCodeToken({ refreshToken: record.refreshToken, proxyUrl, fetchImpl });
            tok = ref.accessToken;
            record.oauthToken = ref.accessToken;
            record.refreshToken = ref.refreshToken || record.refreshToken;
            record.tokenExpiry = ref.expiry;
            refreshErr = null;
            res = await fetchCcUsage(tok);
          } catch (err) {
            refreshErr = err;
          }
        }
        record.lastCheckedAt = ts;
        if (!res.ok || !res.data) {
          return applyQuotaFailureToRecord(record, {
            appLabel: 'Claude Code',
            status: res.status,
            data: res.data,
            refreshErr,
            defaultMessage: `Anthropic 用量接口返回状态 ${res.status || 'network'}`,
          });
        }
        const quotas = extractAnthropicWindowQuotas(res.data, { includeModels: true });
        if (quotas.length) record.status = 'ready';
        record.quotas = quotas;
        record.quotaState = quotas.length ? 'synced' : 'refresh_failed';
        record.lastError = quotas.length ? null : '未返回 Claude Code 用量周期数据';
        return quotas.length > 0;
      }

      if (record.appId === 'claude-desktop' || record.appId === 'claude') {
        const sessionCookie = record.extraMeta?.sessionCookie
          || (typeof record.oauthToken === 'string' && record.oauthToken.startsWith('sk-ant-sid') ? record.oauthToken : null);
        if (sessionCookie) {
          const cookieHdr = record.extraMeta?.cookieHeader && record.extraMeta.cookieHeader.includes('sessionKey=')
            ? record.extraMeta.cookieHeader
            : `sessionKey=${sessionCookie}`;
          const claudeWebHeaders = {
            Accept: 'application/json',
            Cookie: cookieHdr,
            Referer: 'https://claude.ai/chats',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          };
          if (!record.email || /已授权会话|默认安全容器/i.test(record.label || '')) {
            const bootRes = await httpRequestWithProxy({
              url: 'https://claude.ai/api/bootstrap',
              headers: claudeWebHeaders,
              proxyUrl,
              fetchImpl,
            }).catch(() => null);
            const bootEmail = cleanText(
              bootRes?.data?.account?.email_address
                || bootRes?.data?.account?.email
                || bootRes?.data?.user?.email
                || '',
              160,
            );
            if (bootEmail && bootEmail.includes('@')) {
              record.email = bootEmail;
              if (!record.label || /已授权会话|默认安全容器|^Claude/i.test(record.label)) {
                record.label = bootEmail;
              }
            }
          }
          const orgRes = await httpRequestWithProxy({
            url: 'https://claude.ai/api/organizations',
            headers: claudeWebHeaders,
            proxyUrl,
            fetchImpl,
          });
          if (orgRes.ok && Array.isArray(orgRes.data) && orgRes.data.length) {
            const org = orgRes.data[0];
            const orgId = org.uuid || org.id;
            if (org.rate_limit_tier || (Array.isArray(org.capabilities) && org.capabilities.length)) {
              const tierStr = String(org.rate_limit_tier || org.capabilities.join(' ')).toUpperCase();
              if (tierStr.includes('MAX')) record.plan = 'MAX';
              else if (tierStr.includes('PRO')) record.plan = 'PRO';
              else if (tierStr.includes('TEAM') || tierStr.includes('ENTERPRISE')) record.plan = 'TEAM';
              else record.plan = record.plan || 'FREE';
            }
            const usageRes = await httpRequestWithProxy({
              url: `https://claude.ai/api/organizations/${encodeURIComponent(orgId)}/usage`,
              headers: claudeWebHeaders,
              proxyUrl,
              fetchImpl,
            });
            record.lastCheckedAt = ts;
            if (usageRes.ok && usageRes.data) {
              const quotas = extractAnthropicWindowQuotas(usageRes.data, { includeModels: true });
              record.status = 'ready';
              record.quotas = quotas;
              record.quotaState = quotas.length ? 'synced' : 'local_detected';
              record.lastError = quotas.length ? null : '当前组织未返回用量字段';
              return quotas.length > 0;
            }
            if (String(record.plan || '').toUpperCase() === 'FREE') {
              record.status = 'ready';
              record.quotas = [
                { id: 'five_hour', label: '5h 限额', remainingPct: null, usedText: '可用', statusHint: '免费版按会话动态限额', resetAt: null, tone: 'neutral' },
                { id: 'seven_day', label: '7d 限额', remainingPct: null, usedText: '—', statusHint: '升级 Pro/Max 解锁周窗口明细', resetAt: null, tone: 'neutral' },
              ];
              record.quotaState = 'synced';
              record.lastError = null;
              return true;
            }
          }
          record.lastCheckedAt = ts;
          return applyQuotaFailureToRecord(record, {
            appLabel: 'Claude',
            status: orgRes.status,
            data: orgRes.data,
            defaultMessage: `claude.ai 会话查询失败 (${orgRes.status || 'network'})`,
          });
        }
        // Fallback: OAuth token supplied
        const oauthRes = await httpRequestWithProxy({
          url: 'https://api.anthropic.com/api/oauth/usage',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${record.oauthToken}`,
            'anthropic-beta': 'oauth-2025-04-20',
            'User-Agent': 'dingtu-workbench/0.2.0',
          },
          proxyUrl,
          fetchImpl,
        });
        record.lastCheckedAt = ts;
        if (!oauthRes.ok || !oauthRes.data) {
          return applyQuotaFailureToRecord(record, {
            appLabel: 'Claude',
            status: oauthRes.status,
            data: oauthRes.data,
            defaultMessage: `Claude 额度查询失败 (${oauthRes.status || 'network'})`,
          });
        }
        const quotas = extractAnthropicWindowQuotas(oauthRes.data, { includeModels: false });
        if (quotas.length) record.status = 'ready';
        record.quotas = quotas;
        record.quotaState = quotas.length ? 'synced' : 'refresh_failed';
        record.lastError = quotas.length ? null : '未返回 Claude 配额字段';
        return quotas.length > 0;
      }

      if (record.appId === 'codex' || record.appId === 'codex-desktop') {
        const callWham = async tok => {
          const headers = {
            Accept: 'application/json',
            Authorization: `Bearer ${tok}`,
            'User-Agent': 'dingtu-workbench/0.2.0',
          };
          if (record.extraMeta?.accountId) headers['ChatGPT-Account-Id'] = record.extraMeta.accountId;
          return httpRequestWithProxy({
            url: 'https://chatgpt.com/backend-api/wham/usage',
            headers,
            proxyUrl,
            fetchImpl,
          });
        };
        let tok = record.oauthToken;
        let refreshErr = null;
        if (record.refreshToken && (!tok || isTokenExpiringSoon(record.tokenExpiry, currentMs()))) {
          try {
            const ref = await refreshCodexToken({ refreshToken: record.refreshToken, proxyUrl, fetchImpl });
            tok = ref.accessToken;
            record.oauthToken = ref.accessToken;
            record.refreshToken = ref.refreshToken || record.refreshToken;
            record.idToken = ref.idToken || record.idToken;
            record.tokenExpiry = ref.expiry;
          } catch (err) {
            refreshErr = err;
          }
        }
        let res = tok ? await callWham(tok) : { ok: false, status: refreshErr?.status || 401, data: refreshErr?.upstreamData || null };
        if (res.status === 401 && record.refreshToken) {
          try {
            const ref = await refreshCodexToken({ refreshToken: record.refreshToken, proxyUrl, fetchImpl });
            tok = ref.accessToken;
            record.oauthToken = ref.accessToken;
            record.refreshToken = ref.refreshToken || record.refreshToken;
            record.tokenExpiry = ref.expiry;
            refreshErr = null;
            res = await callWham(tok);
          } catch (err) {
            refreshErr = err;
          }
        }
        record.lastCheckedAt = ts;
        if (!res.ok || !res.data) {
          return applyQuotaFailureToRecord(record, {
            appLabel: 'Codex / GPT',
            status: res.status,
            data: res.data,
            refreshErr,
            defaultMessage: `Codex 配额接口返回状态 ${res.status || 'network'}`,
          });
        }
        if (typeof res.data.plan_type === 'string' && res.data.plan_type.trim()) {
          record.plan = cleanText(res.data.plan_type, 48);
        }
        const quotas = extractWhamWindowQuotas(res.data, currentMs());
        if (res.data.credits && typeof res.data.credits.balance === 'number') {
          record.credits = [{ type: 'CODEX_CREDITS', amount: String(res.data.credits.balance) }];
        }
        if (quotas.length) record.status = 'ready';
        record.quotas = quotas;
        record.quotaState = quotas.length ? 'synced' : 'refresh_failed';
        record.lastError = quotas.length ? null : 'Codex 接口未返回限额窗口';
        return quotas.length > 0;
      }

      if (record.appId === 'cursor') {
        const cookieRaw = record.extraMeta?.sessionCookie || '';
        const uid = pickCursorUserId(record.oauthToken, cookieRaw);
        const cookieHeader = cookieRaw
          ? `WorkosCursorSessionToken=${cookieRaw}`
          : (uid && record.oauthToken ? `WorkosCursorSessionToken=${encodeURIComponent(`${uid}::${record.oauthToken}`)}` : '');
        const headers = {
          Accept: 'application/json',
          'User-Agent': 'dingtu-workbench/0.2.0',
          ...(record.oauthToken ? { Authorization: `Bearer ${record.oauthToken}` } : {}),
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        };
        const res = await httpRequestWithProxy({
          url: 'https://cursor.com/api/usage-summary',
          headers,
          proxyUrl,
          fetchImpl,
        });
        record.lastCheckedAt = ts;
        if (!res.ok || !res.data) {
          return applyQuotaFailureToRecord(record, {
            appLabel: 'Cursor',
            status: res.status,
            data: res.data,
            defaultMessage: `Cursor 用量查询失败 (${res.status || 'network'})`,
          });
        }
        if (typeof res.data.membershipType === 'string' && res.data.membershipType.trim()) {
          record.plan = cleanText(res.data.membershipType.toUpperCase(), 48);
        }
        const quotas = [];
        const resetAt = typeof res.data.billingCycleEnd === 'string' ? res.data.billingCycleEnd : null;
        const individual = res.data.individualUsage?.plan || res.data.plan;
        if (individual) {
          if (typeof individual.used === 'number' && typeof individual.limit === 'number' && individual.limit > 0) {
            const remainingPct = clampPct(((individual.limit - individual.used) / individual.limit) * 100);
            quotas.push({
              id: 'cursor-total',
              label: 'Total Usage',
              remainingPct,
              usedText: `${individual.used}/${individual.limit}`,
              resetAt,
              tone: toneForPct(remainingPct),
            });
          } else if (typeof individual.totalPercentUsed === 'number') {
            const remainingPct = clampPct(100 - individual.totalPercentUsed);
            quotas.push({
              id: 'cursor-total',
              label: 'Total Usage',
              remainingPct,
              usedText: `${remainingPct}%`,
              resetAt,
              tone: toneForPct(remainingPct),
            });
          }
          if (typeof individual.autoPercentUsed === 'number') {
            const remainingPct = clampPct(100 - individual.autoPercentUsed);
            quotas.push({
              id: 'cursor-auto',
              label: 'Auto + Composer',
              remainingPct,
              usedText: `${remainingPct}%`,
              resetAt,
              tone: toneForPct(remainingPct),
            });
          }
          if (typeof individual.apiPercentUsed === 'number') {
            const remainingPct = clampPct(100 - individual.apiPercentUsed);
            quotas.push({
              id: 'cursor-api',
              label: 'API Usage',
              remainingPct,
              usedText: `${remainingPct}%`,
              resetAt,
              tone: toneForPct(remainingPct),
            });
          }
        }
        const onDemand = res.data.individualUsage?.onDemand;
        if (onDemand && typeof onDemand.limit === 'number' && onDemand.limit > 0 && typeof onDemand.used === 'number') {
          const remainingPct = clampPct(((onDemand.limit - onDemand.used) / onDemand.limit) * 100);
          quotas.push({
            id: 'cursor-ondemand',
            label: 'On-Demand',
            remainingPct,
            usedText: `$${(onDemand.used / 100).toFixed(2)}/$${(onDemand.limit / 100).toFixed(2)}`,
            resetAt,
            tone: toneForPct(remainingPct),
          });
        }
        record.quotas = quotas;
        record.quotaState = quotas.length ? 'synced' : 'refresh_failed';
        record.lastError = quotas.length ? null : 'Cursor 未返回用量指标';
        return quotas.length > 0;
      }

      if (record.appId === 'copilot') {
        const qRes = await fetchCopilotQuota({ accessToken: record.oauthToken, proxyUrl, fetchImpl });
        record.lastCheckedAt = ts;
        record.plan = qRes.plan || record.plan;
        record.quotas = qRes.quotas;
        record.quotaState = qRes.quotas.length ? 'synced' : 'refresh_failed';
        record.lastError = qRes.quotas.length ? null : 'Copilot 未返回配额快照';
        return qRes.quotas.length > 0;
      }

      if (record.appId === 'windsurf') {
        const endpoints = [
          'https://server.self-serve.windsurf.com/exa.seat_management_pb.SeatManagementService/GetUserStatus',
          'https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus',
        ];
        let res = null;
        for (const ep of endpoints) {
          res = await httpRequestWithProxy({
            url: ep,
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'Connect-Protocol-Version': '1',
              'User-Agent': 'dingtu-workbench/0.2.0',
            },
            body: {
              metadata: {
                ideName: 'windsurf',
                extensionName: 'windsurf',
                apiKey: record.oauthToken,
              },
            },
            proxyUrl,
            fetchImpl,
          }).catch(() => null);
          if (res?.ok && res.data?.userStatus) break;
        }
        record.lastCheckedAt = ts;
        const planStatus = res?.data?.userStatus?.planStatus;
        if (!res?.ok || !planStatus) {
          return applyQuotaFailureToRecord(record, {
            appLabel: 'Windsurf',
            status: res?.status || 0,
            data: res?.data || null,
            defaultMessage: `Windsurf 额度查询失败 (${res?.status || 'network'})`,
          });
        }
        const planName = planStatus.planInfo?.planName || planStatus.planName;
        if (typeof planName === 'string' && planName.trim()) {
          record.plan = cleanText(planName, 48);
        }
        if (res.data.userStatus.email && !record.email) {
          record.email = cleanText(res.data.userStatus.email, 160);
          record.label = record.email;
        }
        const resetAt = typeof planStatus.planEnd === 'string' ? planStatus.planEnd : null;
        const quotas = [];
        const availPrompt = Number(planStatus.availablePromptCredits);
        const usedPrompt = Number(planStatus.usedPromptCredits || 0);
        if (Number.isFinite(availPrompt) && availPrompt > 0) {
          const rem = Math.max(0, availPrompt - usedPrompt);
          const pct = clampPct((rem / availPrompt) * 100);
          quotas.push({
            id: 'windsurf-prompt',
            label: 'Prompt Credits',
            remainingPct: pct,
            usedText: `${rem}/${availPrompt}`,
            resetAt,
            tone: toneForPct(pct),
          });
        }
        const availFlex = Number(planStatus.availableFlexCredits ?? planStatus.availableFlowCredits);
        const usedFlex = Number(planStatus.usedFlexCredits ?? planStatus.usedFlowCredits ?? 0);
        if (Number.isFinite(availFlex) && availFlex > 0) {
          const rem = Math.max(0, availFlex - usedFlex);
          const pct = clampPct((rem / availFlex) * 100);
          quotas.push({
            id: 'windsurf-flex',
            label: 'Add-on Credits',
            remainingPct: pct,
            usedText: `${rem}/${availFlex}`,
            resetAt,
            tone: toneForPct(pct),
          });
        }
        record.quotas = quotas;
        record.quotaState = quotas.length ? 'synced' : 'local_detected';
        record.lastError = quotas.length ? null : 'Windsurf 未返回积分明细';
        return quotas.length > 0;
      }

      if (record.appId === 'kiro') {
        const region = /^[a-z0-9-]+$/.test(String(record.extraMeta?.region || '')) ? record.extraMeta.region : 'us-east-1';
        let accessToken = record.oauthToken;
        const tryRefreshKiro = async () => {
          if (!record.refreshToken) return false;
          const ref = await refreshKiroToken({
            refreshToken: record.refreshToken,
            clientId: record.extraMeta?.clientId || null,
            clientSecret: record.extraMeta?.clientSecret || null,
            region,
            authMethod: record.extraMeta?.authMethod || record.plan || '',
            proxyUrl,
            fetchImpl,
          });
          accessToken = ref.accessToken;
          record.oauthToken = ref.accessToken;
          record.refreshToken = ref.refreshToken || record.refreshToken;
          record.tokenExpiry = ref.expiry;
          return true;
        };
        if (record.refreshToken && (!accessToken || isTokenExpiringSoon(record.tokenExpiry, currentMs()))) {
          await tryRefreshKiro().catch(() => false);
        }
        const queryKiro = async tok => httpRequestWithProxy({
          url: `https://codewhisperer.${region}.amazonaws.com/`,
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-amz-json-1.0',
            'X-Amz-Target': 'AmazonCodeWhispererService.GetUsageLimits',
            Authorization: `Bearer ${tok}`,
            'User-Agent': 'dingtu-workbench/0.2.0',
          },
          body: {
            origin: 'AI_EDITOR',
            resourceType: 'AGENTIC_REQUEST',
            ...(record.extraMeta?.profileArn ? { profileArn: record.extraMeta.profileArn } : {}),
          },
          proxyUrl,
          fetchImpl,
        });
        let res = await queryKiro(accessToken);
        if (res.status === 401 && await tryRefreshKiro().catch(() => false)) {
          res = await queryKiro(accessToken);
        }
        record.lastCheckedAt = ts;
        if (!res.ok || !res.data) {
          return applyQuotaFailureToRecord(record, {
            appLabel: 'Kiro',
            status: res.status,
            data: res.data,
            defaultMessage: `Kiro 用量查询失败 (${res.status || 'network'})`,
          });
        }
        const subTitle = res.data.subscriptionInfo?.subscriptionTitle || res.data.subscriptionInfo?.type;
        if (typeof subTitle === 'string' && subTitle.trim()) {
          record.plan = cleanText(subTitle, 48);
        }
        const quotas = [];
        const resetAt = Number.isFinite(res.data.nextDateReset)
          ? new Date(res.data.nextDateReset * 1000).toISOString()
          : (typeof res.data.nextDateReset === 'string' ? res.data.nextDateReset : null);
        const list = Array.isArray(res.data.usageBreakdownList) ? res.data.usageBreakdownList : [];
        for (const item of list) {
          const cap = Number(item.usageLimitWithPrecision ?? item.usageLimit ?? 0);
          const used = Number(item.currentUsageWithPrecision ?? item.currentUsage ?? 0);
          if (cap > 0) {
            const pct = clampPct(((cap - used) / cap) * 100);
            quotas.push({
              id: `kiro-${String(item.resourceType || quotas.length).toLowerCase()}`,
              label: cleanText(item.displayName || 'Prompt Credits', 36),
              remainingPct: pct,
              usedText: `${Math.max(0, Math.round(cap - used))}/${Math.round(cap)}`,
              resetAt,
              tone: toneForPct(pct),
            });
          }
          const freeTrial = item.freeTrialInfo;
          if (freeTrial && Number(freeTrial.usageLimit) > 0) {
            const fCap = Number(freeTrial.usageLimit);
            const fUsed = Number(freeTrial.currentUsage || 0);
            const pct = clampPct(((fCap - fUsed) / fCap) * 100);
            quotas.push({
              id: 'kiro-bonus',
              label: 'Bonus Credits',
              remainingPct: pct,
              usedText: `${Math.max(0, Math.round(fCap - fUsed))}/${Math.round(fCap)}`,
              resetAt: typeof freeTrial.freeTrialExpiry === 'number'
                ? new Date(freeTrial.freeTrialExpiry * 1000).toISOString()
                : resetAt,
              tone: toneForPct(pct),
            });
          }
        }
        record.quotas = quotas;
        record.quotaState = quotas.length ? 'synced' : 'local_detected';
        record.lastError = quotas.length ? null : 'Kiro 未返回 Credits 用量字段';
        return quotas.length > 0;
      }

      if (record.appId === 'grok-cli' || record.appId === 'grok') {
        const tok = String(record.oauthToken || '');
        const sessionCookie = record.extraMeta?.sessionCookie || '';
        if (tok.startsWith('xai-')) {
          const keyRes = await httpRequestWithProxy({
            url: 'https://api.x.ai/v1/api-key',
            headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' },
            proxyUrl,
            fetchImpl,
          });
          record.lastCheckedAt = ts;
          if (!keyRes.ok) {
            record.quotaState = 'refresh_failed';
            record.lastError = `xAI API Key 校验失败 (${keyRes.status || 'network'})`;
            return false;
          }
          record.plan = 'API KEY';
          record.quotas = [{
            id: 'xai-key',
            label: 'xAI API Key',
            remainingPct: keyRes.data?.disabled || keyRes.data?.blocked ? 0 : 100,
            usedText: keyRes.data?.disabled ? '已停用' : '有效',
            resetAt: null,
            tone: keyRes.data?.disabled ? 'low' : 'high',
          }];
          record.quotaState = 'synced';
          record.lastError = null;
          return true;
        }
        const rateUrl = sessionCookie
          ? 'https://grok.com/rest/rate-limits'
          : 'https://api.x.ai/v1/billing/subscriptions';
        const res = await httpRequestWithProxy({
          url: rateUrl,
          method: sessionCookie ? 'POST' : 'GET',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(sessionCookie ? { Cookie: sessionCookie.includes('=') ? sessionCookie : `sso=${sessionCookie}` } : {}),
            ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
          },
          ...(sessionCookie ? { body: { requestKind: 'DEFAULT', modelName: 'grok-3' } } : {}),
          proxyUrl,
          fetchImpl,
        });
        record.lastCheckedAt = ts;
        if (!res.ok || !res.data) {
          return applyQuotaFailureToRecord(record, {
            appLabel: 'Grok',
            status: res.status,
            data: res.data,
            defaultMessage: `Grok 配额接口返回状态 ${res.status || 'network'}`,
          });
        }
        const quotas = [];
        const rem = Number(res.data.remainingQueries ?? res.data.remainingTokens);
        const total = Number(res.data.totalQueries ?? res.data.totalTokens ?? res.data.limit);
        if (Number.isFinite(rem) && Number.isFinite(total) && total > 0) {
          const pct = clampPct((rem / total) * 100);
          quotas.push({
            id: 'grok-window',
            label: '对话窗口额度',
            remainingPct: pct,
            usedText: `${rem}/${total}`,
            resetAt: res.data.windowEnd || null,
            tone: toneForPct(pct),
          });
        }
        const subs = Array.isArray(res.data.subscriptions) ? res.data.subscriptions : [];
        if (subs[0]?.tier || res.data.subscriptionTier) {
          record.plan = cleanText(String(subs[0]?.tier || res.data.subscriptionTier), 48);
        }
        if (quotas.length === 0 && subs.length > 0) {
          quotas.push({
            id: 'grok-sub',
            label: '订阅状态',
            remainingPct: 100,
            usedText: String(subs[0].status || '有效'),
            resetAt: subs[0].currentPeriodEnd || null,
            tone: 'high',
          });
        }
        record.quotas = quotas;
        record.quotaState = quotas.length ? 'synced' : 'local_detected';
        record.lastError = quotas.length ? null : '未返回 Grok 配额明细';
        return quotas.length > 0;
      }

      if (record.appId === 'chatgpt') {
        const cookieVal = record.extraMeta?.sessionCookie || '';
        const headers = {
          Accept: 'application/json',
          'User-Agent': 'dingtu-workbench/0.2.0',
          ...(record.oauthToken ? { Authorization: `Bearer ${record.oauthToken}` } : {}),
          ...(cookieVal ? { Cookie: `__Secure-next-auth.session-token=${cookieVal}` } : {}),
        };
        const res = await httpRequestWithProxy({
          url: record.oauthToken ? 'https://chatgpt.com/backend-api/wham/usage' : 'https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27',
          headers,
          proxyUrl,
          fetchImpl,
        });
        record.lastCheckedAt = ts;
        if (!res.ok || !res.data) {
          return applyQuotaFailureToRecord(record, {
            appLabel: 'ChatGPT',
            status: res.status,
            data: res.data,
            defaultMessage: `ChatGPT 状态查询失败 (${res.status || 'network'})`,
          });
        }
        const plan = res.data.plan_type || res.data.accounts?.default?.entitlement?.subscription_plan;
        if (typeof plan === 'string' && plan.trim()) record.plan = cleanText(plan.toUpperCase(), 48);
        const quotas = extractWhamWindowQuotas(res.data, currentMs());
        if (!quotas.length && res.data.accounts) {
          quotas.push({ id: 'chatgpt-session', label: '网页会话状态', remainingPct: 100, usedText: '有效', resetAt: null, tone: 'high' });
        }
        if (quotas.length) record.status = 'ready';
        record.quotas = quotas;
        record.quotaState = quotas.length ? 'synced' : 'local_detected';
        record.lastError = null;
        return quotas.length > 0;
      }
    } catch (err) {
      record.lastCheckedAt = ts;
      return applyQuotaFailureToRecord(record, {
        appLabel: record.appId === 'antigravity' ? 'Antigravity' : record.appId,
        status: err?.status || 0,
        data: err?.upstreamData || null,
        refreshErr: err,
        defaultMessage: err?.message || '上游配额查询失败',
      });
    }

    record.lastCheckedAt = ts;
    return false;
  }

  async function refreshQuota({ appId = null, accountId = null } = {}) {
    ensureLoaded();
    const filterApp = appId ? assertAppId(appId) : null;
    const filterId = accountId ? assertAlias(accountId) : null;
    const ts = currentIso();
    const targets = state.accounts.filter(item => (!filterApp || item.appId === filterApp) && (!filterId || item.id === filterId));
    let refreshedCount = 0;
    for (const record of targets) {
      const ok = await refreshSingleAccountQuota(record, ts);
      if (ok) refreshedCount += 1;
    }
    if (targets.length) saveVault();
    const projected = list(filterApp);
    return Object.freeze({
      accounts: projected.accounts,
      activeByApp: projected.activeByApp,
      groups: projected.groups,
      refreshedCount,
    });
  }

  async function detectAll() {
    const apps = {};
    for (const appId of SUPPORTED_WORKBENCH_APPS) {
      if (appId === 'codex-cli') continue;
      if (webContainerApps.has(appId)) {
        apps[appId] = { status: 'container', kind: 'app-shell', path: null };
        continue;
      }
      const adapterId = adapterIdForApp(appId, platform);
      if (!adapterId || !launcher || typeof launcher.detect !== 'function') {
        apps[appId] = { status: 'unknown', kind: 'native', path: null };
        continue;
      }
      try {
        const adapter = getBuiltInAgentAdapter(adapterId, platform);
        const result = await launcher.detect(adapter);
        apps[appId] = {
          status: result?.status === 'installed' ? 'installed' : result?.status === 'not-installed' ? 'not-installed' : 'unknown',
          kind: adapter.template.adapter,
          path: typeof result?.path === 'string' ? result.path : null,
        };
      } catch {
        apps[appId] = { status: 'unknown', kind: 'native', path: null };
      }
    }
    return Object.freeze({ apps: Object.freeze(apps) });
  }

  function remove({ appId, accountId } = {}) {
    ensureLoaded();
    const normalizedApp = assertAppId(appId);
    const id = assertAlias(accountId);
    const idx = state.accounts.findIndex(item => item.appId === normalizedApp && item.id === id);
    if (idx < 0) return Object.freeze({ appId: normalizedApp, accountId: id, removed: false });
    state.accounts.splice(idx, 1);
    const accountKey = `${normalizedApp}:${id}`;
    for (const g of state.groups) {
      if (Array.isArray(g.accountKeys)) {
        g.accountKeys = g.accountKeys.filter(k => k !== accountKey);
      }
    }
    if (state.activeByApp[normalizedApp] === id) {
      const fallback = state.accounts.find(item => item.appId === normalizedApp);
      if (fallback) state.activeByApp[normalizedApp] = fallback.id;
      else delete state.activeByApp[normalizedApp];
    }
    saveVault();
    return Object.freeze({ appId: normalizedApp, accountId: id, removed: true });
  }

  function groupsList() {
    ensureLoaded();
    return Object.freeze({
      groups: Object.freeze(state.groups.map(g => ({ ...g, accountKeys: [...(g.accountKeys || [])] }))),
    });
  }

  function groupsSave({ id = '', name = '', color = 'blue' } = {}) {
    ensureLoaded();
    const cleanName = cleanText(name, 36);
    if (!cleanName) throw fail('ACCOUNT_ALIAS_INVALID', '分组名称不能为空。');
    const safeColor = ['blue', 'green', 'purple', 'orange', 'pink', 'cyan'].includes(color)
      || (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))
      ? color
      : 'blue';
    const cleanId = typeof id === 'string' && aliasPattern.test(id)
      ? id
      : sanitizeAliasCandidate(cleanName, 'grp');
    const idx = state.groups.findIndex(g => g.id === cleanId);
    if (idx >= 0) {
      state.groups[idx] = { ...state.groups[idx], name: cleanName, color: safeColor, updatedAt: currentIso() };
    } else {
      if (state.groups.length >= MAX_GROUPS) throw fail('ACCOUNT_LIMIT_REACHED', `最多创建 ${MAX_GROUPS} 个自定义分组。`);
      state.groups.push({ id: cleanId, name: cleanName, color: safeColor, accountKeys: [], createdAt: currentIso(), updatedAt: currentIso() });
    }
    saveVault();
    return groupsList();
  }

  function groupsRemove({ id = '' } = {}) {
    ensureLoaded();
    const before = state.groups.length;
    state.groups = state.groups.filter(g => g.id !== id);
    if (state.groups.length !== before) saveVault();
    return groupsList();
  }

  function groupsAssign({ groupId = '', appId = '', accountId = '', member = true } = {}) {
    ensureLoaded();
    const group = state.groups.find(g => g.id === groupId);
    if (!group) throw fail('ACCOUNT_NOT_FOUND', '目标分组不存在。');
    const normalizedApp = assertAppId(appId);
    const id = assertAlias(accountId);
    const key = `${normalizedApp}:${id}`;
    group.accountKeys = Array.isArray(group.accountKeys) ? group.accountKeys.filter(k => k !== key) : [];
    if (member) group.accountKeys.push(key);
    group.updatedAt = currentIso();
    saveVault();
    return Object.freeze({ ...groupsList(), ...list(normalizedApp) });
  }

  function settingsGet() {
    ensureLoaded();
    return Object.freeze({
      autoRefreshMinutes: state.autoRefreshMinutes || 0,
      customDataDirs: Object.freeze({ ...(state.customDataDirs || {}) }),
    });
  }

  function settingsUpdate({ autoRefreshMinutes, customDataDir = null } = {}) {
    ensureLoaded();
    if (autoRefreshMinutes !== undefined) {
      const mins = Number(autoRefreshMinutes);
      state.autoRefreshMinutes = [0, 2, 5, 10, 15, 30, 60].includes(mins) ? mins : 0;
    }
    if (customDataDir && typeof customDataDir === 'object') {
      const normApp = assertAppId(customDataDir.appId);
      if (customDataDir.dirPath) {
        state.customDataDirs[normApp] = String(customDataDir.dirPath).slice(0, 512);
      } else {
        delete state.customDataDirs[normApp];
      }
    }
    saveVault();
    return settingsGet();
  }

  function totpList() {
    ensureLoaded();
    const nowMs = currentMs();
    return Object.freeze({
      saved: Object.freeze(state.totpEntries.map(e => projectTotpItem(e, nowMs))),
      history: Object.freeze(state.totpHistory.map(e => projectTotpItem(e, nowMs))),
    });
  }

  function totpCompute({ input } = {}) {
    ensureLoaded();
    const parsed = parseTotpInput(input);
    const ts = currentIso();
    const entry = {
      id: `hist-${crypto.createHash('sha256').update(`${parsed.secret}:${parsed.digits}:${parsed.period}`).digest('hex').slice(0, 12)}`,
      ...parsed,
      createdAt: ts,
      lastUsedAt: ts,
    };
    state.totpHistory = [entry, ...state.totpHistory.filter(item => item.id !== entry.id)].slice(0, MAX_TOTP_HISTORY);
    saveVault();
    return Object.freeze({
      result: projectTotpItem(entry, currentMs()),
      ...totpList(),
    });
  }

  function totpSave({ input, name = '' } = {}) {
    ensureLoaded();
    const parsed = parseTotpInput(input, name);
    const ts = currentIso();
    const id = `totp-${crypto.createHash('sha256').update(`${parsed.secret}:${parsed.name}`).digest('hex').slice(0, 12)}`;
    const idx = state.totpEntries.findIndex(item => item.id === id || item.secret === parsed.secret);
    const record = {
      id: idx >= 0 ? state.totpEntries[idx].id : id,
      ...parsed,
      createdAt: idx >= 0 ? state.totpEntries[idx].createdAt : ts,
      lastUsedAt: ts,
    };
    if (idx >= 0) {
      state.totpEntries[idx] = record;
    } else {
      if (state.totpEntries.length >= MAX_TOTP_ENTRIES) {
        throw fail('ACCOUNT_LIMIT_REACHED', `最多可保存 ${MAX_TOTP_ENTRIES} 条 2FA 秘钥。`);
      }
      state.totpEntries.unshift(record);
    }
    saveVault();
    return Object.freeze({
      entry: projectTotpItem(record, currentMs()),
      ...totpList(),
    });
  }

  function totpRemove({ ids = [], target = 'saved' } = {}) {
    ensureLoaded();
    const removeSet = new Set((Array.isArray(ids) ? ids : []).filter(x => typeof x === 'string' && x));
    let removedCount = 0;
    if (target === 'history') {
      const before = state.totpHistory.length;
      state.totpHistory = state.totpHistory.filter(item => !removeSet.has(item.id));
      removedCount = before - state.totpHistory.length;
    } else {
      const before = state.totpEntries.length;
      state.totpEntries = state.totpEntries.filter(item => !removeSet.has(item.id));
      removedCount = before - state.totpEntries.length;
    }
    if (removedCount > 0) saveVault();
    return Object.freeze({ removedCount, ...totpList() });
  }

  function totpExport() {
    ensureLoaded();
    const nowMs = currentMs();
    const entries = state.totpEntries.map(entry => ({
      id: entry.id,
      name: entry.name,
      issuer: entry.issuer || '',
      maskedSecret: maskSecretPreview(entry.secret),
      digits: entry.digits || 6,
      period: entry.period || 30,
      createdAt: entry.createdAt || null,
    }));
    const jsonText = JSON.stringify({
      version: 1,
      kind: 'dingtu-2fa-sanitized',
      exportedAt: new Date(nowMs).toISOString(),
      entries,
    }, null, 2);
    return Object.freeze({ count: entries.length, jsonText });
  }

  function totpImport({ jsonText } = {}) {
    ensureLoaded();
    if (typeof jsonText !== 'string' || !jsonText.trim() || jsonText.length > 256 * 1024) {
      throw fail('JSON_IMPORT_INVALID', '2FA 备份 JSON 内容无效或超出大小限制。');
    }
    let parsed;
    try { parsed = JSON.parse(jsonText); } catch {
      throw fail('JSON_IMPORT_INVALID', '2FA JSON 格式解析失败。');
    }
    const rawList = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.entries) ? parsed.entries : []);
    if (!rawList.length) throw fail('JSON_IMPORT_INVALID', '未找到可导入的 2FA 条目（仅支持含原始秘钥或 otpauth 链接的备份）。');
    let importedCount = 0;
    for (const item of rawList) {
      const rawSecret = item?.otpauthUri || item?.uri || item?.secret || '';
      if (!rawSecret || typeof rawSecret !== 'string') continue;
      totpSave({ input: rawSecret, name: cleanText(item?.name || '', 80) });
      importedCount += 1;
    }
    if (!importedCount) throw fail('JSON_IMPORT_INVALID', '备份文件为脱敏清单（不含原始秘钥），无法恢复；请提供含 secret 的 2FA 备份。');
    return Object.freeze({ importedCount, ...totpList() });
  }

  function totpMigrationPayload({ ids = [] } = {}) {
    ensureLoaded();
    const idSet = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null;
    const picked = (idSet
      ? state.totpEntries.filter(e => idSet.has(e.id))
      : state.totpEntries).slice(0, 5);
    if (!picked.length) {
      throw fail('ACCOUNT_NOT_FOUND', '当前没有可导出的已保存 2FA 条目。');
    }
    const listItems = Object.freeze(picked.map(e => ({
      name: e.name,
      issuer: e.issuer || '',
      secret: e.secret,
      algorithm: e.algorithm || 'SHA1',
      digits: e.digits || 6,
    })));
    return Object.freeze({
      count: picked.length,
      items: listItems,
      entries: listItems,
    });
  }

  return Object.freeze({
    list,
    add,
    upsertAuthorizedAccount,
    importLocal,
    importToken,
    importJson,
    exportJson,
    updateMeta,
    batchRemove,
    switchAccount,
    refreshQuota,
    detectAll,
    remove,
    groupsList,
    groupsSave,
    groupsRemove,
    groupsAssign,
    settingsGet,
    settingsUpdate,
    totpList,
    totpCompute,
    totpSave,
    totpRemove,
    totpExport,
    totpImport,
    totpMigrationPayload,
  });
}
