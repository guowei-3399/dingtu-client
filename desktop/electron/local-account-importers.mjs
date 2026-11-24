import crypto from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {
  parseAntigravityCredentialJson,
  readAntigravityActiveHints,
  readAntigravityCredential,
} from './antigravity-credential-helper.mjs';
import { normalizeCloudCodeQuotas } from './oauth-account-flow.mjs';

const requireFromHere = createRequire(import.meta.url);

function loadSqliteModule() {
  try {
    const mod = requireFromHere('node:sqlite');
    return typeof mod?.DatabaseSync === 'function' ? mod : null;
  } catch {
    return null;
  }
}

function cleanText(value, maxLen = 120) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLen);
}

function cleanEmail(value) {
  const text = cleanText(value || '', 160);
  if (!text || !text.includes('@') || /\s/.test(text)) return null;
  return text;
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

function readJsonSafe(filePath) {
  if (!filePath || !existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
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

function epochToIso(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'bigint') {
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) return null;
    const ms = num > 1e15 ? Math.floor(num / 1000) : num > 1e12 ? num : num * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || val <= 0) return null;
    const ms = val > 1e15 ? Math.floor(val / 1000) : val > 1e12 ? val : val * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return epochToIso(Number(trimmed));
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  return null;
}

export function normalizePlanTier(rawTier) {
  const text = cleanText(typeof rawTier === 'string' ? rawTier : (rawTier?.id || rawTier?.name || ''), 64);
  if (!text) return null;
  const upper = text.toUpperCase();
  if (upper.includes('ULTRA')) return 'ULTRA';
  if (upper.includes('MAX')) return 'MAX';
  if (upper.includes('PRO') || upper.includes('ENTERPRISE')) return upper.includes('ENTERPRISE') ? 'ENTERPRISE' : 'PRO';
  if (upper.includes('PLUS')) return 'PLUS';
  if (upper.includes('TEAM')) return 'TEAM';
  if (upper.includes('FREE') || upper.includes('STANDARD') || upper.includes('LEGACY')) return 'FREE';
  return upper.slice(0, 24);
}

function isInternalAgModel(modelId, displayName = '') {
  const txt = `${modelId || ''} ${displayName || ''}`.toLowerCase();
  return /^(?:tab_|chat_|model_placeholder|rev\d+)/i.test(modelId || '')
    || txt.includes('tab_flash')
    || txt.includes('tab_jump')
    || txt.includes('autocomplete');
}

function buildModelsMapForCloudCode(models, referenceNowMs) {
  const modelsMap = {};
  for (const item of Array.isArray(models) ? models : []) {
    if (!item || typeof item !== 'object') continue;
    const modelId = String(item.name || item.id || item.runtimeModelId || '').trim();
    const displayName = String(item.display_name || item.displayName || modelId).trim();
    if (!modelId || isInternalAgModel(modelId, displayName)) continue;

    let pct = typeof item.percentage === 'number'
      ? item.percentage
      : (typeof item.remainingFraction === 'number' ? item.remainingFraction * 100 : null);
    if (!Number.isFinite(pct) && item.isExhausted === true) pct = 0;
    if (!Number.isFinite(pct)) continue;

    let resetTime = epochToIso(item.reset_time || item.resetTimeIso || item.resetTimeEpochSeconds);
    if (!resetTime && item.window) {
      const wLower = String(item.window).toLowerCase();
      resetTime = new Date(referenceNowMs + (wLower.includes('5h') ? 4 : 72) * 3600_000).toISOString();
    } else if (resetTime && item.window) {
      const resetMs = Date.parse(resetTime);
      const wLower = String(item.window).toLowerCase();
      if (Number.isFinite(resetMs) && resetMs <= referenceNowMs && !wLower.includes('5h')) {
        // Preserve weekly bucket classification if cached reset timestamp already elapsed.
        const adjustedRefMs = Math.min(referenceNowMs, resetMs - 24 * 3600_000);
        if (Number.isFinite(adjustedRefMs)) {
          modelsMap[modelId] = {
            displayName,
            quotaInfo: { remainingFraction: Math.max(0, Math.min(1, pct / 100)), resetTime },
            _refNow: adjustedRefMs,
          };
          continue;
        }
      }
    }

    modelsMap[modelId] = {
      displayName,
      quotaInfo: {
        remainingFraction: Math.max(0, Math.min(1, pct / 100)),
        ...(resetTime ? { resetTime } : {}),
      },
    };
  }
  return modelsMap;
}

/**
 * Normalizes Cockpit Tools cached Antigravity quota objects using Dingtu's grouped model rules.
 */
export function normalizeCockpitQuotas(quotaObj, nowMs = Date.now()) {
  if (!quotaObj || typeof quotaObj !== 'object' || !Array.isArray(quotaObj.models)) return [];
  const lastUpdatedIso = epochToIso(quotaObj.quota_summary_updated_at || quotaObj.last_updated);
  const lastUpdatedMs = lastUpdatedIso ? Date.parse(lastUpdatedIso) : NaN;
  const refNowMs = Number.isFinite(lastUpdatedMs) ? Math.min(nowMs, lastUpdatedMs) : nowMs;
  const modelsMap = buildModelsMapForCloudCode(quotaObj.models, refNowMs);
  return normalizeCloudCodeQuotas(modelsMap, refNowMs).slice(0, 6);
}

/**
 * Normalizes Antigravity Studio cached snapshot quotas (including authoritative groups[].buckets[] 5h + weekly windows).
 */
export function normalizeStudioQuotas(snapObj, nowMs = Date.now()) {
  if (!snapObj || typeof snapObj !== 'object') return [];
  const fetchedIso = epochToIso(snapObj.fetchedAt);
  const fetchedMs = fetchedIso ? Date.parse(fetchedIso) : NaN;
  if (Number.isFinite(fetchedMs) && nowMs - fetchedMs > 7 * 86400_000) return [];
  const refNowMs = Number.isFinite(fetchedMs) ? Math.min(nowMs, fetchedMs) : nowMs;
  const hasModels = Array.isArray(snapObj.models) && snapObj.models.length > 0;
  const hasGroups = Array.isArray(snapObj.groups) && snapObj.groups.length > 0;
  if (!hasModels && !hasGroups) return [];

  const modelsMap = hasModels ? buildModelsMapForCloudCode(snapObj.models, refNowMs) : {};
  if (hasGroups) {
    // When authoritative groups[].buckets[] exist, remove Gemini/Claude model guesses so exact 5h + Weekly group buckets win cleanly.
    for (const key of Object.keys(modelsMap)) {
      const low = `${key} ${modelsMap[key]?.displayName || ''}`.toLowerCase();
      if ((low.includes('gemini') || low.includes('claude')) && !low.includes('argon')) {
        delete modelsMap[key];
      }
    }
    let idx = 0;
    for (const grp of snapObj.groups) {
      if (!grp || !Array.isArray(grp.buckets)) continue;
      const fam = String(grp.family || grp.id || '').toLowerCase().includes('claude') ? 'claude' : 'gemini';
      for (const b of grp.buckets) {
        if (!b || typeof b !== 'object') continue;
        let pct = typeof b.percentage === 'number'
          ? b.percentage
          : (typeof b.remainingFraction === 'number' ? b.remainingFraction * 100 : null);
        if (!Number.isFinite(pct) && b.isExhausted === true) pct = 0;
        if (!Number.isFinite(pct)) continue;
        const winLower = String(b.window || b.id || '').toLowerCase();
        const explicitWin = winLower.includes('5h') ? '5h' : (winLower.includes('week') ? 'Weekly' : null);
        if (!explicitWin) continue;
        const resetTime = epochToIso(b.resetTimeIso || b.reset_time || b.resetTimeEpochSeconds);
        modelsMap[`ep${idx}::${fam}-${explicitWin.toLowerCase()}`] = {
          displayName: fam === 'claude' ? 'Claude' : 'Gemini',
          quotaInfo: {
            remainingFraction: Math.max(0, Math.min(1, pct / 100)),
            ...(resetTime ? { resetTime } : {}),
          },
          _explicitWindow: explicitWin,
          _refNow: refNowMs,
        };
        idx += 1;
      }
    }
  }
  return normalizeCloudCodeQuotas(modelsMap, refNowMs).slice(0, 6);
}

/**
 * Normalizes Sub2API Codex usage fields (5h / 7d windows), discarding stale historical snapshots.
 */
export function normalizeSub2ApiQuotas(extraObj, nowMs = Date.now(), exportedAt = null) {
  if (!extraObj || typeof extraObj !== 'object') return [];
  const updatedIso = epochToIso(extraObj.codex_usage_updated_at || exportedAt);
  const updatedMs = updatedIso ? Date.parse(updatedIso) : NaN;
  if (Number.isFinite(updatedMs) && nowMs - updatedMs > 7 * 86400_000) {
    return [];
  }
  const refMs = Number.isFinite(updatedMs) ? updatedMs : nowMs;
  const explicitResets = [
    epochToIso(extraObj.codex_5h_reset_at),
    epochToIso(extraObj.codex_7d_reset_at),
  ].filter(Boolean);
  if (explicitResets.length > 0 && explicitResets.every(iso => Date.parse(iso) <= nowMs)) {
    return [];
  }

  const quotas = [];
  const used5h = extraObj.codex_5h_used_percent ?? extraObj.codex_primary_used_percent;
  if (typeof used5h === 'number' && Number.isFinite(used5h)) {
    const remainingPct = clampPct(100 - used5h);
    let resetAt = epochToIso(extraObj.codex_5h_reset_at);
    const resetAfter = Number(extraObj.codex_5h_reset_after_seconds ?? extraObj.codex_primary_reset_after_seconds);
    if (!resetAt && Number.isFinite(resetAfter) && resetAfter > 0) {
      resetAt = new Date(refMs + resetAfter * 1000).toISOString();
    }
    quotas.push({
      id: 'primary_window',
      label: '5h 限额',
      remainingPct,
      usedText: `${remainingPct}% 剩余`,
      resetAt,
      tone: toneForPct(remainingPct),
    });
  }
  const used7d = extraObj.codex_7d_used_percent ?? extraObj.codex_secondary_used_percent;
  if (typeof used7d === 'number' && Number.isFinite(used7d)) {
    const remainingPct = clampPct(100 - used7d);
    let resetAt = epochToIso(extraObj.codex_7d_reset_at);
    const resetAfter = Number(extraObj.codex_7d_reset_after_seconds ?? extraObj.codex_secondary_reset_after_seconds);
    if (!resetAt && Number.isFinite(resetAfter) && resetAfter > 0) {
      resetAt = new Date(refMs + resetAfter * 1000).toISOString();
    }
    quotas.push({
      id: 'secondary_window',
      label: '周限额',
      remainingPct,
      usedText: `${remainingPct}% 剩余`,
      resetAt,
      tone: toneForPct(remainingPct),
    });
  }
  return quotas;
}

function loadCockpitStorageKey(dirPath) {
  for (const name of ['secure-account-storage.key', 'account-token.key']) {
    const p = path.join(dirPath, name);
    if (!existsSync(p)) continue;
    try {
      const rawBuf = readFileSync(p);
      if (rawBuf.length === 32) return rawBuf;
      const text = rawBuf.toString('utf8').trim();
      const b64 = Buffer.from(text, 'base64');
      if (b64.length === 32) return b64;
      if (/^[0-9a-f]{64}$/i.test(text)) {
        const hex = Buffer.from(text, 'hex');
        if (hex.length === 32) return hex;
      }
    } catch {}
  }
  return null;
}

function decryptCockpitAccountFile(filePath, keyBuf) {
  const parsed = readJsonSafe(filePath);
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.algorithm === 'AES-256-GCM' && parsed.nonce && parsed.ciphertext) {
    if (!keyBuf || keyBuf.length !== 32) return null;
    try {
      const nonce = Buffer.from(parsed.nonce, 'base64');
      const ctFull = Buffer.from(parsed.ciphertext, 'base64');
      if (ctFull.length < 17) return null;
      const ct = ctFull.subarray(0, ctFull.length - 16);
      const tag = ctFull.subarray(ctFull.length - 16);
      const dec = crypto.createDecipheriv('aes-256-gcm', keyBuf, nonce);
      dec.setAuthTag(tag);
      const plain = Buffer.concat([dec.update(ct), dec.final()]).toString('utf8');
      return JSON.parse(plain);
    } catch {
      return null;
    }
  }
  return parsed;
}

/**
 * Discovers candidate CC-Switch installation/data directories without walking whole filesystems.
 */
export function discoverCcSwitchDirs({
  platform = ({ win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform] || 'windows'),
  homeDir = os.homedir(),
  appDataDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  localAppDataDir = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  extraCcSwitchDirs = [],
  scanPortableDrives = true,
} = {}) {
  const raw = [
    ...(Array.isArray(extraCcSwitchDirs) ? extraCcSwitchDirs : []),
    process.env.CC_SWITCH_DIR || '',
    path.join(homeDir, '.cc-switch'),
    path.join(appDataDir, 'cc-switch'),
    path.join(appDataDir, 'com.ccswitch.desktop'),
    path.join(localAppDataDir, 'cc-switch'),
  ];

  // Check optional desktop app_paths.json overrides when present.
  const appPathsFile = path.join(appDataDir, 'com.ccswitch.desktop', 'app_paths.json');
  const appPathsObj = readJsonSafe(appPathsFile);
  if (appPathsObj && typeof appPathsObj === 'object') {
    for (const val of Object.values(appPathsObj)) {
      if (typeof val === 'string' && val.trim()) raw.push(val.trim());
    }
  }

  if (scanPortableDrives && (platform === 'windows' || platform === 'win32')) {
    for (const drive of ['C', 'D', 'E', 'F', 'G']) {
      raw.push(`${drive}:\\CC-Switch`, `${drive}:\\cc-switch`);
    }
  }

  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim()) continue;
    const resolved = path.resolve(item.trim());
    const key = (platform === 'windows' || platform === 'win32') ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    if (existsSync(resolved)) out.push(resolved);
  }
  return out;
}

function hashTokenFingerprint(tok) {
  if (typeof tok !== 'string') return null;
  const clean = tok.trim();
  if (!clean) return null;
  return crypto.createHash('sha256').update(clean).digest('hex');
}

function scanAntigravityNative({ platform, homeDir, appDataDir, execWindowsCred, readAgCred }) {
  const results = [];
  const geminiDir = path.join(homeDir, '.gemini');
  const hints = readAntigravityActiveHints({
    platform: platform === 'windows' ? 'win32' : platform,
    homeDir,
    appDataDir,
  });
  const activeHintEmail = hints.activeHintEmail ? hints.activeHintEmail.toLowerCase() : null;

  if (readAgCred?.found) {
    const email = cleanEmail(readAgCred.email);
    const isActiveHint = Boolean(email && activeHintEmail && email.toLowerCase() === activeHintEmail)
      || readAgCred.source === 'windows-credential';
    results.push({
      appId: 'antigravity',
      email,
      label: email || 'Antigravity 本机账号',
      plan: null,
      source: 'local-import',
      quotaState: 'local_detected',
      oauthToken: readAgCred.accessToken || null,
      refreshToken: readAgCred.refreshToken || null,
      idToken: readAgCred.idToken || null,
      tokenExpiry: readAgCred.expiry || null,
      quotas: [],
      credits: [],
      tags: [],
      note: '',
      snapshot: {
        kind: 'antigravity-oauth',
        accessToken: readAgCred.accessToken || null,
        refreshToken: readAgCred.refreshToken || null,
        idToken: readAgCred.idToken || null,
        expiry: readAgCred.expiry || null,
      },
      extraMeta: {},
      isActiveHint,
      priority: readAgCred.source === 'windows-credential' ? 98 : 88,
      _activeRank: isActiveHint ? 2 : 0,
    });
  }

  for (const [srcLabel, filePath, prio] of [
    ['fallback-file', path.join(geminiDir, 'jetski-standalone-oauth-token'), 84],
    ['cli-file', path.join(geminiDir, 'antigravity-cli', 'antigravity-oauth-token'), 82],
  ]) {
    if (!existsSync(filePath)) continue;
    try {
      const parsed = parseAntigravityCredentialJson(readFileSync(filePath, 'utf8'));
      if (!parsed) continue;
      const claims = decodeJwtPayload(parsed.idToken);
      const email = cleanEmail(parsed.idTokenEmail || claims?.email);
      const activeMatch = Boolean(email && activeHintEmail && email.toLowerCase() === activeHintEmail);
      results.push({
        appId: 'antigravity',
        email,
        label: email || 'Antigravity 本机账号',
        plan: null,
        source: 'local-import',
        quotaState: 'local_detected',
        oauthToken: parsed.accessToken || null,
        refreshToken: parsed.refreshToken || null,
        idToken: parsed.idToken || null,
        tokenExpiry: parsed.expiry || null,
        quotas: [],
        credits: [],
        tags: [],
        note: '',
        snapshot: {
          kind: 'antigravity-oauth',
          accessToken: parsed.accessToken || null,
          refreshToken: parsed.refreshToken || null,
          idToken: parsed.idToken || null,
          expiry: parsed.expiry || null,
        },
        extraMeta: { nativeFileSource: srcLabel },
        isActiveHint: activeMatch,
        priority: prio,
        _activeRank: activeMatch ? 2 : 0,
      });
    } catch {}
  }

  return results;
}

function scanAntigravityStudio({ platform, homeDir, appDataDir, nowMs }) {
  const results = [];
  const studioDirs = platform === 'windows'
    ? [path.join(appDataDir, 'Antigravity Studio')]
    : platform === 'macos'
      ? [path.join(homeDir, 'Library', 'Application Support', 'Antigravity Studio')]
      : [path.join(homeDir, '.config', 'Antigravity Studio')];

  for (const studioDir of studioDirs) {
    const accountsObj = readJsonSafe(path.join(studioDir, 'accounts.v1.json'));
    if (!accountsObj || !Array.isArray(accountsObj.accounts)) continue;
    const quotasObj = readJsonSafe(path.join(studioDir, 'quotas.v1.json'));
    const snaps = quotasObj?.snapshots && typeof quotasObj.snapshots === 'object' ? quotasObj.snapshots : {};

    for (const acc of accountsObj.accounts) {
      if (!acc || typeof acc !== 'object') continue;
      const accessToken = typeof acc.tokens?.access_token === 'string' && acc.tokens.access_token.trim() ? acc.tokens.access_token.trim() : null;
      const refreshToken = typeof acc.tokens?.refresh_token === 'string' && acc.tokens.refresh_token.trim() ? acc.tokens.refresh_token.trim() : null;
      const email = cleanEmail(acc.profile?.email);
      if (!refreshToken && !accessToken) continue;
      if (String(acc.status || '').toUpperCase() === 'EXPIRED' && !refreshToken) continue;

      const snap = snaps[acc.id]
        || Object.values(snaps).find(s => (acc.id && s?.accountId === acc.id) || (email && typeof s?.email === 'string' && s.email.toLowerCase() === email.toLowerCase()))
        || null;
      const quotas = snap ? normalizeStudioQuotas(snap, nowMs) : [];
      const plan = normalizePlanTier(snap?.paidTierName || snap?.tier || acc.profile?.tier);
      const tokenExpiry = epochToIso(acc.tokens?.expiry_timestamp);
      const idToken = typeof acc.tokens?.id_token === 'string' && acc.tokens.id_token.trim() ? acc.tokens.id_token.trim() : null;

      results.push({
        appId: 'antigravity',
        email,
        label: email || cleanText(acc.profile?.name || '', 80) || 'Antigravity Studio 账号',
        plan: plan || 'FREE',
        source: 'antigravity-studio',
        quotaState: quotas.length ? 'synced' : 'local_detected',
        oauthToken: accessToken,
        refreshToken,
        idToken,
        tokenExpiry,
        quotas,
        credits: [],
        tags: sanitizeTags(acc.tags),
        note: cleanText(acc.custom_note || '', 240),
        snapshot: {
          kind: 'antigravity-oauth',
          accessToken,
          refreshToken,
          idToken,
          expiry: tokenExpiry,
        },
        extraMeta: {},
        isActiveHint: Boolean(acc.is_active || (accountsObj.activeAccountId && acc.id === accountsObj.activeAccountId)),
        priority: 92,
      });
    }
  }
  return results;
}

function scanAntigravityTools({ homeDir, nowMs }) {
  const results = [];
  const accDir = path.join(homeDir, '.antigravity_tools', 'accounts');
  if (!existsSync(accDir)) return results;

  const idxObj = readJsonSafe(path.join(homeDir, '.antigravity_tools', 'accounts.json'));
  const currentId = idxObj?.current_account_id || null;

  let files = [];
  try {
    files = readdirSync(accDir).filter(f => f.endsWith('.json') && !f.endsWith('.bak'));
  } catch {
    return results;
  }

  for (const file of files) {
    const obj = readJsonSafe(path.join(accDir, file));
    if (!obj || typeof obj !== 'object') continue;
    const accessToken = typeof obj.token?.access_token === 'string' && obj.token.access_token.trim() ? obj.token.access_token.trim() : null;
    const refreshToken = typeof obj.token?.refresh_token === 'string' && obj.token.refresh_token.trim() ? obj.token.refresh_token.trim() : null;
    if (!accessToken && !refreshToken) continue;
    if (obj.disabled === true && !refreshToken) continue;

    const claims = decodeJwtPayload(obj.token?.id_token);
    const email = cleanEmail(obj.email || claims?.email);
    const quotas = normalizeCockpitQuotas(obj.quota, nowMs);
    const plan = normalizePlanTier(obj.quota?.subscription_tier || obj.quota?.tier_id) || 'FREE';
    const tokenExpiry = epochToIso(obj.token?.expiry_timestamp);
    const idToken = typeof obj.token?.id_token === 'string' && obj.token.id_token.trim() ? obj.token.id_token.trim() : null;

    results.push({
      appId: 'antigravity',
      email,
      label: email || cleanText(obj.name || '', 80) || 'Antigravity Tools 账号',
      plan,
      source: 'antigravity-tools',
      quotaState: quotas.length ? 'synced' : 'local_detected',
      oauthToken: accessToken,
      refreshToken,
      idToken,
      tokenExpiry,
      projectId: typeof obj.token?.project_id === 'string' ? obj.token.project_id : (typeof obj.quota?.project_id === 'string' ? obj.quota.project_id : null),
      quotas,
      credits: Array.isArray(obj.quota?.credits)
        ? obj.quota.credits.filter(c => c?.creditType || c?.type).map(c => ({ type: String(c.creditType || c.type), amount: String(c.creditAmount ?? c.amount ?? '') }))
        : [],
      tags: [],
      note: '',
      snapshot: {
        kind: 'antigravity-oauth',
        accessToken,
        refreshToken,
        idToken,
        expiry: tokenExpiry,
      },
      extraMeta: {},
      isActiveHint: Boolean(currentId && obj.id === currentId),
      priority: 82,
    });
  }
  return results;
}

const COCKPIT_FOLDER_MAP = Object.freeze([
  ['accounts', 'antigravity'],
  ['codex_accounts', 'codex'],
  ['cursor_accounts', 'cursor'],
  ['github_copilot_accounts', 'copilot'],
  ['kiro_accounts', 'kiro'],
  ['windsurf_accounts', 'windsurf'],
]);

function extractCockpitGenericCandidate(obj, mappedApp, activeEmailHint, currentAccountId) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.disabled === true && !obj.refresh_token && !obj.token?.refresh_token) return null;

  const idToken = obj.token?.id_token || obj.id_token || obj.auth_json?.tokens?.id_token || null;
  const claims = decodeJwtPayload(idToken);
  const authMeta = claims?.['https://api.openai.com/auth'];
  const email = cleanEmail(obj.email || obj.token?.email || claims?.email || obj.user || obj.login);
  const oauthToken = cleanText(
    obj.token?.access_token || obj.access_token || obj.accessToken || obj.oauth_token || obj.apiKey || obj.auth_json?.tokens?.access_token || '',
    4096,
  ) || null;
  const refreshToken = cleanText(
    obj.token?.refresh_token || obj.refresh_token || obj.refreshToken || obj.auth_json?.tokens?.refresh_token || '',
    2048,
  ) || null;
  if (!oauthToken && !refreshToken) return null;

  const accountId = cleanText(
    obj.account_id || obj.token?.account_id || authMeta?.chatgpt_account_id || obj.auth_json?.tokens?.account_id || '',
    96,
  ) || null;
  const plan = normalizePlanTier(
    obj.plan_type || obj.plan || authMeta?.chatgpt_plan_type || obj.subscription_tier || obj.quota?.subscription_tier || '',
  );
  const tokenExpiry = epochToIso(obj.token?.expiry_timestamp || obj.expiry_timestamp || obj.expires_at || obj.expiresAt);
  const isActiveHint = Boolean(
    (currentAccountId && obj.id === currentAccountId)
    || (email && activeEmailHint && email.toLowerCase() === activeEmailHint),
  );

  return {
    appId: mappedApp,
    email,
    label: email || cleanText(obj.name || obj.login || '', 80) || `${mappedApp} Cockpit 账号`,
    plan,
    source: 'cockpit',
    quotaState: 'local_detected',
    oauthToken,
    refreshToken,
    idToken,
    tokenExpiry,
    quotas: [],
    credits: [],
    tags: [],
    note: cleanText(obj.notes || obj.note || '', 240),
    snapshot: null,
    extraMeta: accountId ? { accountId } : {},
    isActiveHint,
    priority: 86,
  };
}

function scanCockpitDirs({ homeDir, nowMs }) {
  const results = [];
  for (const dirName of ['.cockpit_tools', '.antigravity_cockpit']) {
    const baseDir = path.join(homeDir, dirName);
    if (!existsSync(baseDir)) continue;
    const keyBuf = loadCockpitStorageKey(baseDir);
    const curObj = readJsonSafe(path.join(baseDir, 'current_account.json'));
    const idxObj = readJsonSafe(path.join(baseDir, 'accounts.json'));
    const activeEmailHint = cleanEmail(curObj?.email)?.toLowerCase() || null;
    const currentAccountId = idxObj?.current_account_id || null;

    for (const [folder, mappedApp] of COCKPIT_FOLDER_MAP) {
      const folderPath = path.join(baseDir, folder);
      if (!existsSync(folderPath)) continue;
      let files = [];
      try {
        files = readdirSync(folderPath).filter(f => f.endsWith('.json') && !f.endsWith('.bak'));
      } catch {
        continue;
      }

      for (const file of files) {
        const obj = decryptCockpitAccountFile(path.join(folderPath, file), keyBuf);
        if (!obj) continue;

        if (mappedApp === 'antigravity') {
          const accessToken = typeof obj.token?.access_token === 'string' && obj.token.access_token.trim()
            ? obj.token.access_token.trim()
            : (typeof obj.access_token === 'string' && obj.access_token.trim() ? obj.access_token.trim() : null);
          const refreshToken = typeof obj.token?.refresh_token === 'string' && obj.token.refresh_token.trim()
            ? obj.token.refresh_token.trim()
            : (typeof obj.refresh_token === 'string' && obj.refresh_token.trim() ? obj.refresh_token.trim() : null);
          if (!accessToken && !refreshToken) continue;
          if (obj.disabled === true && !refreshToken) continue;

          const idToken = obj.token?.id_token || obj.id_token || null;
          const claims = decodeJwtPayload(idToken);
          const email = cleanEmail(obj.email || obj.token?.email || claims?.email);
          const quotas = normalizeCockpitQuotas(obj.quota, nowMs);
          const plan = normalizePlanTier(obj.quota?.subscription_tier || obj.quota?.tier_id) || 'FREE';
          const tokenExpiry = epochToIso(obj.token?.expiry_timestamp || obj.expiry_timestamp);
          const credits = Array.isArray(obj.quota?.credits)
            ? obj.quota.credits.filter(c => c?.creditType || c?.type).map(c => ({ type: String(c.creditType || c.type), amount: String(c.creditAmount ?? c.amount ?? '') }))
            : [];
          results.push({
            appId: 'antigravity',
            email,
            label: email || cleanText(obj.name || '', 80) || 'Cockpit Antigravity 账号',
            plan,
            source: 'cockpit',
            quotaState: quotas.length ? 'synced' : 'local_detected',
            oauthToken: accessToken,
            refreshToken,
            idToken,
            tokenExpiry,
            projectId: typeof obj.quota?.project_id === 'string' ? obj.quota.project_id : null,
            quotas,
            credits,
            tags: sanitizeTags(obj.tags),
            note: cleanText(obj.note || obj.notes || '', 240),
            snapshot: {
              kind: 'antigravity-oauth',
              accessToken,
              refreshToken,
              idToken,
              expiry: tokenExpiry,
            },
            extraMeta: {},
            isActiveHint: Boolean(
              (currentAccountId && obj.id === currentAccountId)
              || (email && activeEmailHint && email.toLowerCase() === activeEmailHint),
            ),
            priority: 87,
          });
        } else {
          const cand = extractCockpitGenericCandidate(obj, mappedApp, activeEmailHint, currentAccountId);
          if (cand) results.push(cand);
        }
      }
    }
  }
  return results;
}

function scanCodexNativeAndSwitcher({ homeDir }) {
  const results = [];

  for (const [filePath, isActiveHint, priority] of [
    [path.join(homeDir, '.codex', 'auth.json'), true, 100],
    [path.join(homeDir, '.codex-cli', 'auth.json'), false, 94],
  ]) {
    if (!existsSync(filePath)) continue;
    try {
      const rawBuf = readFileSync(filePath);
      const parsed = JSON.parse(rawBuf.toString('utf8'));
      const idToken = parsed?.tokens?.id_token || null;
      const claims = decodeJwtPayload(idToken);
      const authMeta = claims?.['https://api.openai.com/auth'];
      const email = cleanEmail(claims?.email || parsed?.email);
      const plan = cleanText(authMeta?.chatgpt_plan_type || claims?.chatgpt_plan_type || '', 48) || null;
      const accountId = cleanText(parsed?.tokens?.account_id || authMeta?.chatgpt_account_id || '', 96) || null;
      const oauthToken = parsed?.tokens?.access_token || null;
      const refreshToken = parsed?.tokens?.refresh_token || null;
      if (!oauthToken && !refreshToken && !email) continue;

      results.push({
        appId: 'codex',
        email,
        label: email || 'Codex 本机账号',
        plan,
        source: 'local-import',
        quotaState: oauthToken ? 'local_detected' : 'session_only',
        oauthToken,
        refreshToken,
        idToken,
        tokenExpiry: null,
        quotas: [],
        credits: [],
        tags: [],
        note: '',
        extraMeta: accountId ? { accountId } : {},
        snapshot: { kind: 'file', targetPath: filePath, payloadBase64: rawBuf.toString('base64') },
        isActiveHint,
        priority,
        _activeRank: isActiveHint ? 2 : 0,
      });
    } catch {}
  }

  // Codex Switcher: official/OAuth entries only (skip third-party relays, banned, logged-out, or invalid).
  const switcherObj = readJsonSafe(path.join(homeDir, '.codex-switcher', 'accounts.json'));
  const accMap = switcherObj?.accounts && typeof switcherObj.accounts === 'object' ? Object.values(switcherObj.accounts) : [];
  for (const acc of accMap) {
    if (!acc || typeof acc !== 'object') continue;
    if (acc.kind === 'relay' || acc.is_banned || acc.is_logged_out || acc.is_token_invalid) continue;
    const tokens = acc.auth_json?.tokens || {};
    const refreshToken = acc.refresh_token || tokens.refresh_token || null;
    const oauthToken = tokens.access_token || null;
    const idToken = tokens.id_token || null;
    if (!refreshToken && !oauthToken) continue;
    const claims = decodeJwtPayload(idToken);
    const authMeta = claims?.['https://api.openai.com/auth'];
    const email = cleanEmail(acc.email || claims?.email);
    results.push({
      appId: 'codex',
      email,
      label: email || 'Codex Switcher 账号',
      plan: cleanText(authMeta?.chatgpt_plan_type || acc.plan_type || '', 48) || null,
      source: 'codex-switcher',
      quotaState: 'local_detected',
      oauthToken,
      refreshToken,
      idToken,
      tokenExpiry: null,
      quotas: [],
      credits: [],
      tags: [],
      note: cleanText(acc.notes || '', 240),
      extraMeta: tokens.account_id ? { accountId: tokens.account_id } : {},
      snapshot: null,
      isActiveHint: false,
      priority: 72,
    });
  }

  return results;
}

function mapSub2ApiPlatform(rawPlatform) {
  const p = String(rawPlatform || '').trim().toLowerCase();
  if (p === 'openai' || p === 'codex') return 'codex';
  if (p === 'antigravity') return 'antigravity';
  if (p === 'gemini' || p === 'gemini-cli') return 'gemini-cli';
  if (p === 'anthropic' || p === 'claude' || p === 'claude-code') return 'claude-code';
  return null;
}

function scanCcSwitchDirs({ dirs, nowMs }) {
  const results = [];
  const sqliteMod = loadSqliteModule();

  for (const dir of dirs) {
    // 1. CC-Switch dedicated Codex OAuth vault
    const codexOauth = readJsonSafe(path.join(dir, 'codex_oauth_auth.json'));
    if (codexOauth?.accounts && typeof codexOauth.accounts === 'object') {
      for (const acc of Object.values(codexOauth.accounts)) {
        if (!acc || typeof acc !== 'object') continue;
        const refreshToken = typeof acc.refresh_token === 'string' && acc.refresh_token.trim() ? acc.refresh_token.trim() : null;
        const oauthToken = typeof acc.access_token === 'string' && acc.access_token.trim() ? acc.access_token.trim() : null;
        if (!refreshToken && !oauthToken) continue;
        const email = cleanEmail(acc.email);
        const accountId = cleanText(acc.account_id || '', 96) || null;
        results.push({
          appId: 'codex',
          email,
          label: email || 'CC-Switch Codex 账号',
          plan: cleanText(acc.plan_type || '', 48) || null,
          source: 'cc-switch',
          quotaState: 'local_detected',
          oauthToken,
          refreshToken,
          idToken: acc.id_token || null,
          tokenExpiry: epochToIso(acc.expires_at),
          quotas: [],
          credits: [],
          tags: [],
          note: '',
          extraMeta: accountId ? { accountId } : {},
          snapshot: null,
          isActiveHint: Boolean(codexOauth.default_account_id && accountId && acc.account_id === codexOauth.default_account_id),
          priority: 80,
        });
      }
    }

    // 2. CC-Switch SQLite DB (OAuth / Official providers ONLY — never custom API-key relay configs)
    for (const dbCandidate of [path.join(dir, 'cc-switch.db'), path.join(dir, 'data', 'cc-switch.db')]) {
      if (!sqliteMod || !existsSync(dbCandidate)) continue;
      let db = null;
      try {
        db = new sqliteMod.DatabaseSync(dbCandidate, { open: true, readOnly: true });
        const stmt = db.prepare('SELECT id, app_type, name, category, is_current, settings_config FROM providers');
        stmt.setReadBigInts(true);
        const rows = stmt.all();
        for (const row of rows) {
          let cfg = null;
          try { cfg = JSON.parse(String(row.settings_config || '')); } catch { continue; }
          if (!cfg || typeof cfg !== 'object') continue;

          const appType = String(row.app_type || '').toLowerCase();
          if (appType === 'codex') {
            const tokens = cfg.auth?.tokens;
            const refreshToken = typeof tokens?.refresh_token === 'string' && tokens.refresh_token.trim() ? tokens.refresh_token.trim() : null;
            const accessToken = typeof tokens?.access_token === 'string' && tokens.access_token.trim() ? tokens.access_token.trim() : null;
            if (!refreshToken && !accessToken) continue; // Skips API-key-only relay providers (e.g. 4allapi)
            const idToken = tokens?.id_token || null;
            const claims = decodeJwtPayload(idToken);
            const authMeta = claims?.['https://api.openai.com/auth'];
            const email = cleanEmail(claims?.email || cfg.auth?.email);
            const plan = cleanText(authMeta?.chatgpt_plan_type || claims?.chatgpt_plan_type || '', 48) || null;
            const accountId = cleanText(tokens?.account_id || authMeta?.chatgpt_account_id || '', 96) || null;
            results.push({
              appId: 'codex',
              email,
              label: email || cleanText(row.name || '', 80) || 'CC-Switch OpenAI Official',
              plan,
              source: 'cc-switch',
              quotaState: 'local_detected',
              oauthToken: accessToken,
              refreshToken,
              idToken,
              tokenExpiry: null,
              quotas: [],
              credits: [],
              tags: [],
              note: '',
              extraMeta: accountId ? { accountId } : {},
              snapshot: null,
              isActiveHint: Number(row.is_current) === 1,
              priority: 78,
            });
          } else if (appType === 'claude' || appType === 'claude-code') {
            const oauth = cfg.claudeAiOauth;
            if (!oauth || (!oauth.accessToken && !oauth.refreshToken)) continue;
            results.push({
              appId: 'claude-code',
              email: cleanEmail(oauth.email || cfg.oauthAccount?.emailAddress),
              label: cleanEmail(oauth.email || cfg.oauthAccount?.emailAddress) || cleanText(row.name || '', 80) || 'CC-Switch Claude 账号',
              plan: cleanText(oauth.subscriptionType || '', 48) || null,
              source: 'cc-switch',
              quotaState: 'local_detected',
              oauthToken: oauth.accessToken || null,
              refreshToken: oauth.refreshToken || null,
              idToken: null,
              tokenExpiry: epochToIso(oauth.expiresAt),
              quotas: [],
              credits: [],
              tags: [],
              note: '',
              extraMeta: cfg.oauthAccount ? { claudeOauthAccount: cfg.oauthAccount } : {},
              snapshot: null,
              isActiveHint: Number(row.is_current) === 1,
              priority: 78,
            });
          } else if (appType === 'gemini' || appType === 'gemini-cli') {
            const oauth = cfg.oauth || cfg;
            const refreshToken = typeof oauth?.refresh_token === 'string' && oauth.refresh_token.trim() ? oauth.refresh_token.trim() : null;
            const accessToken = typeof oauth?.access_token === 'string' && oauth.access_token.trim() ? oauth.access_token.trim() : null;
            if (!refreshToken && !accessToken) continue;
            const claims = decodeJwtPayload(oauth?.id_token);
            const email = cleanEmail(oauth?.email || claims?.email);
            results.push({
              appId: 'gemini-cli',
              email,
              label: email || cleanText(row.name || '', 80) || 'CC-Switch Gemini 账号',
              plan: null,
              source: 'cc-switch',
              quotaState: 'local_detected',
              oauthToken: accessToken,
              refreshToken,
              idToken: oauth?.id_token || null,
              tokenExpiry: epochToIso(oauth?.expiry_date || oauth?.expiry),
              quotas: [],
              credits: [],
              tags: [],
              note: '',
              extraMeta: {},
              snapshot: null,
              isActiveHint: Number(row.is_current) === 1,
              priority: 78,
            });
          }
        }
      } catch {
        // Ignore locked/corrupt CC-Switch SQLite DB cleanly
      } finally {
        try { db?.close(); } catch {}
      }
    }

    // 3. CC-Switch / Sub2API exported account JSON bundles (e.g. E:\CC-Switch\sub2api-account-*.json)
    let entries = [];
    try {
      entries = readdirSync(dir).filter(f => /^sub2api-account-.*\.json$/i.test(f));
    } catch {
      entries = [];
    }
    for (const file of entries) {
      const bundle = readJsonSafe(path.join(dir, file));
      const accounts = Array.isArray(bundle?.accounts) ? bundle.accounts : [];
      for (const acc of accounts) {
        if (!acc || typeof acc !== 'object') continue;
        if (String(acc.type || '').toLowerCase() !== 'oauth') continue;
        const mappedApp = mapSub2ApiPlatform(acc.platform);
        if (!mappedApp) continue;

        const cred = acc.credentials && typeof acc.credentials === 'object' ? acc.credentials : {};
        const accessToken = typeof cred.access_token === 'string' && cred.access_token.trim() ? cred.access_token.trim() : null;
        const refreshToken = typeof cred.refresh_token === 'string' && cred.refresh_token.trim() ? cred.refresh_token.trim() : null;
        if (!accessToken && !refreshToken) continue;

        const idToken = typeof cred.id_token === 'string' && cred.id_token.trim() ? cred.id_token.trim() : null;
        const claims = decodeJwtPayload(idToken);
        const authMeta = claims?.['https://api.openai.com/auth'];
        const email = cleanEmail(cred.email || acc.extra?.email || acc.name || claims?.email);
        const accountId = cleanText(cred.chatgpt_account_id || authMeta?.chatgpt_account_id || '', 96) || null;
        const plan = cleanText(cred.plan_type || authMeta?.chatgpt_plan_type || '', 48) || null;
        const quotas = mappedApp === 'codex' ? normalizeSub2ApiQuotas(acc.extra, nowMs, bundle?.exported_at) : [];

        results.push({
          appId: mappedApp,
          email,
          label: email || cleanText(acc.name || '', 80) || 'Sub2API OAuth 账号',
          plan,
          source: 'cc-switch',
          quotaState: quotas.length ? 'synced' : 'local_detected',
          oauthToken: accessToken,
          refreshToken,
          idToken,
          tokenExpiry: epochToIso(cred.expires_at),
          quotas,
          credits: [],
          tags: [],
          note: '',
          extraMeta: accountId ? { accountId } : {},
          snapshot: null,
          isActiveHint: false,
          priority: 76,
        });
      }
    }
  }
  return results;
}

function mergeTwoCandidates(a, b) {
  const primary = (a.priority || 0) >= (b.priority || 0) ? a : b;
  const secondary = primary === a ? b : a;

  const primaryPlan = primary.plan || '';
  const secondaryPlan = secondary.plan || '';
  const mergedPlan = (primaryPlan && primaryPlan !== 'FREE') ? primaryPlan : (secondaryPlan || primaryPlan || null);
  const mergedQuotas = Array.isArray(primary.quotas) && primary.quotas.length
    ? primary.quotas
    : (Array.isArray(secondary.quotas) ? secondary.quotas : []);

  const mergedRefresh = primary.refreshToken || secondary.refreshToken || null;
  const mergedAccess = (primary.priority >= secondary.priority && primary.oauthToken)
    ? primary.oauthToken
    : (secondary.oauthToken || primary.oauthToken || null);
  const mergedExpiry = primary.tokenExpiry || secondary.tokenExpiry || null;
  const mergedIdTok = primary.idToken || secondary.idToken || null;

  return {
    ...secondary,
    ...primary,
    email: primary.email || secondary.email || null,
    label: primary.email || secondary.email || primary.label || secondary.label,
    plan: mergedPlan,
    oauthToken: mergedAccess,
    refreshToken: mergedRefresh,
    idToken: mergedIdTok,
    tokenExpiry: mergedExpiry,
    projectId: primary.projectId || secondary.projectId || null,
    quotas: mergedQuotas,
    credits: Array.isArray(primary.credits) && primary.credits.length ? primary.credits : (secondary.credits || []),
    quotaState: mergedQuotas.length ? 'synced' : (primary.quotaState || secondary.quotaState || 'local_detected'),
    tags: [...new Set([...(primary.tags || []), ...(secondary.tags || [])])].slice(0, 10),
    note: primary.note || secondary.note || '',
    snapshot: primary.snapshot || secondary.snapshot || null,
    extraMeta: { ...(secondary.extraMeta || {}), ...(primary.extraMeta || {}) },
    isActiveHint: Boolean(primary.isActiveHint || secondary.isActiveHint),
    priority: Math.max(primary.priority || 0, secondary.priority || 0),
    _activeRank: Math.max(
      primary._activeRank ?? (primary.isActiveHint ? 1 : 0),
      secondary._activeRank ?? (secondary.isActiveHint ? 1 : 0),
    ),
  };
}

function candidatesMatch(a, b) {
  if (a.appId !== b.appId) return false;
  if (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()) return true;
  const aRt = hashTokenFingerprint(a.refreshToken);
  const bRt = hashTokenFingerprint(b.refreshToken);
  if (aRt && bRt && aRt === bRt) return true;
  if (!a.email && !b.email && !aRt && !bRt) {
    const aAt = hashTokenFingerprint(a.oauthToken);
    const bAt = hashTokenFingerprint(b.oauthToken);
    if (aAt && bAt && aAt === bAt) return true;
  }
  return false;
}

function deduplicateCandidates(candidates) {
  const deduped = [];
  for (const cand of candidates) {
    if (!cand || !cand.appId) continue;
    let merged = false;
    for (let i = 0; i < deduped.length; i += 1) {
      if (candidatesMatch(deduped[i], cand)) {
        deduped[i] = mergeTwoCandidates(deduped[i], cand);
        merged = true;
        break;
      }
    }
    if (!merged) deduped.push(cand);
  }
  deduped.sort((a, b) => {
    const ar = a._activeRank ?? (a.isActiveHint ? 1 : 0);
    const br = b._activeRank ?? (b.isActiveHint ? 1 : 0);
    if (ar !== br) return br - ar;
    if ((a.priority || 0) !== (b.priority || 0)) return (b.priority || 0) - (a.priority || 0);
    return String(a.email || a.label || '').localeCompare(String(b.email || b.label || ''));
  });
  return deduped.map(({ _activeRank, ...rest }) => rest);
}

/**
 * Discovers and deduplicates saved local accounts across native apps, Antigravity Studio,
 * Antigravity Tools, Cockpit Tools, Codex Switcher, and CC-Switch (OAuth/official only).
 */
export async function discoverLocalAccounts({
  appId = null,
  platform = ({ win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform] || 'windows'),
  homeDir = os.homedir(),
  appDataDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  localAppDataDir = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  extraCcSwitchDirs = [],
  scanPortableDrives = true,
  execWindowsCred = null,
  now = Date.now,
} = {}) {
  const nowMs = typeof now === 'function' ? now() : (Number(now) || Date.now());
  const targetApp = appId === 'codex-cli' ? 'codex' : appId;
  const want = candidateApp => !targetApp || targetApp === candidateApp;

  const rawCandidates = [];

  if (want('antigravity')) {
    const readAgOpts = {
      platform: platform === 'windows' ? 'win32' : platform,
      homeDir,
      appDataDir,
      ...(execWindowsCred ? { execWindowsCred } : {}),
    };
    const readAgCred = await readAntigravityCredential(readAgOpts).catch(() => null);
    rawCandidates.push(...scanAntigravityNative({ platform, homeDir, appDataDir, execWindowsCred, readAgCred }));
    rawCandidates.push(...scanAntigravityStudio({ platform, homeDir, appDataDir, nowMs }));
    rawCandidates.push(...scanAntigravityTools({ homeDir, nowMs }));
  }

  rawCandidates.push(...scanCockpitDirs({ homeDir, nowMs }).filter(c => want(c.appId)));

  if (want('codex') || want('codex-desktop')) {
    rawCandidates.push(...scanCodexNativeAndSwitcher({ homeDir }));
  }

  const ccDirs = discoverCcSwitchDirs({
    platform,
    homeDir,
    appDataDir,
    localAppDataDir,
    extraCcSwitchDirs,
    scanPortableDrives,
  });
  rawCandidates.push(...scanCcSwitchDirs({ dirs: ccDirs, nowMs }).filter(c => want(c.appId)));

  return deduplicateCandidates(rawCandidates);
}
