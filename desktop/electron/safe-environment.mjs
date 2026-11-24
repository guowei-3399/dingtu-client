import { createHash } from 'node:crypto';
import path from 'node:path';
import { LOCAL_PROXY } from './runtime-contract.mjs';

const fail = (code, message) => Object.assign(new Error(message), { code });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const TIMEZONE_PATTERN = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){1,2}$|^UTC$/;
const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-[0-9]{3})?$/;

const DEFAULT_LOCALE_BY_COUNTRY = Object.freeze({
  US: 'en-US',
  GB: 'en-GB',
  CA: 'en-CA',
  AU: 'en-AU',
  NZ: 'en-NZ',
  SG: 'en-SG',
  IE: 'en-IE',
  JP: 'ja-JP',
  KR: 'ko-KR',
  DE: 'de-DE',
  FR: 'fr-FR',
  NL: 'nl-NL',
  CH: 'de-CH',
  SE: 'sv-SE',
  TW: 'zh-TW',
  HK: 'zh-HK',
});

export const LOCAL_HTTP_PROXY = LOCAL_PROXY.http;
export const REMOTE_SOCKS5H_PROXY = `socks5h://${LOCAL_PROXY.host}:${LOCAL_PROXY.port}`;

export function isValidIanaTimezone(value) {
  if (typeof value !== 'string' || value.length < 3 || value.length > 64 || !TIMEZONE_PATTERN.test(value)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function normalizeLocaleTag(raw, countryCode = null) {
  const candidate = typeof raw === 'string' && raw.trim()
    ? raw.trim()
    : (countryCode && DEFAULT_LOCALE_BY_COUNTRY[countryCode]) || 'en-US';
  if (!LOCALE_PATTERN.test(candidate)) {
    throw fail('SAFE_ENV_LOCALE_INVALID', '出口语言区域标识格式无效。');
  }
  let canonical;
  try {
    [canonical] = Intl.getCanonicalLocales(candidate);
  } catch {
    throw fail('SAFE_ENV_LOCALE_INVALID', '出口语言区域标识不受支持。');
  }
  if (!canonical || !LOCALE_PATTERN.test(canonical)) {
    throw fail('SAFE_ENV_LOCALE_INVALID', '出口语言区域标识不受支持。');
  }
  return canonical;
}

export function normalizeExitGeoContext(input) {
  if (input === null || input === undefined) return null;
  if (!object(input)) throw fail('SAFE_ENV_GEO_INVALID', '出口地理环境元数据无效。');
  const allowed = ['countryCode', 'timezone', 'locale', 'regionLabel', 'posixLang', 'acceptLanguage'];
  if (Object.keys(input).some(key => !allowed.includes(key))) {
    throw fail('SAFE_ENV_GEO_INVALID', '出口地理环境包含未知字段。');
  }
  const rawCountry = typeof input.countryCode === 'string' ? input.countryCode.trim().toUpperCase() : '';
  if (!COUNTRY_CODE_PATTERN.test(rawCountry)) {
    throw fail('SAFE_ENV_GEO_INVALID', '出口国家代码无效。');
  }
  if (!isValidIanaTimezone(input.timezone)) {
    throw fail('SAFE_ENV_TIMEZONE_INVALID', '出口时区标识无效。');
  }
  const locale = normalizeLocaleTag(input.locale, rawCountry);
  const primaryLang = locale.split('-')[0];
  const posixBase = locale.includes('-') ? locale.replace('-', '_') : `${primaryLang}_${rawCountry}`;
  const posixLang = `${posixBase}.UTF-8`;
  const acceptLanguage = primaryLang === locale ? locale : `${locale},${primaryLang};q=0.9`;
  const regionLabel = typeof input.regionLabel === 'string' && input.regionLabel.trim().length > 0 && input.regionLabel.trim().length <= 64
    && !/[\u0000-\u001f\u007f]/.test(input.regionLabel)
    ? input.regionLabel.trim()
    : null;

  return Object.freeze({
    countryCode: rawCountry,
    timezone: input.timezone,
    locale,
    posixLang,
    acceptLanguage,
    regionLabel,
  });
}

export function resolveInstanceProfileDir({ rootDir, scope, appId, instanceId }) {
  if (typeof rootDir !== 'string' || !rootDir.trim()) {
    throw fail('SAFE_ENV_PROFILE_DIR_INVALID', '实例隔离根目录无效。');
  }
  if (typeof scope !== 'string' || !scope || scope.length > 512 || /[\u0000-\u001f\u007f]/.test(scope)) {
    throw fail('SAFE_ENV_SCOPE_INVALID', '账号隔离范围无效。');
  }
  if (typeof appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(appId)
      || typeof instanceId !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(instanceId)) {
    throw fail('SAFE_ENV_INSTANCE_INVALID', '应用实例标识无效。');
  }
  const scopeDigest = createHash('sha256').update(scope).digest('hex').slice(0, 24);
  return path.join(rootDir, 'workbench-profiles', scopeDigest, appId, instanceId);
}

/**
 * Basic connectivity launch augmentation for the open-source edition:
 * injects 127.0.0.1:17899 proxy env/flags in 'safe_tunnel' mode, or clears
 * proxy env vars in 'own_network' mode, without OS/browser fingerprint spoofing.
 */
export function buildSafeLaunchAugmentation({
  mode = 'safe_tunnel',
  adapter = 'env-launch',
  appId = '',
  profileDir = null,
  relayEndpoint = null,
} = {}) {
  if (!['safe_tunnel', 'own_network'].includes(mode)) {
    throw fail('SAFE_ENV_MODE_INVALID', '网络环境模式无效。');
  }
  const extraArgs = [];
  const envPatch = {};
  const stripEnvKeys = [];

  if (mode === 'safe_tunnel') {
    envPatch.HTTP_PROXY = LOCAL_PROXY.http;
    envPatch.HTTPS_PROXY = LOCAL_PROXY.http;
    envPatch.ALL_PROXY = REMOTE_SOCKS5H_PROXY;
    envPatch.NO_PROXY = `${LOCAL_PROXY.host},localhost,::1`;
    envPatch.no_proxy = `${LOCAL_PROXY.host},localhost,::1`;
    envPatch.NODE_USE_ENV_PROXY = '1';
    if (adapter === 'electron-launch') {
      extraArgs.push(`--proxy-server=${LOCAL_PROXY.http}`);
      extraArgs.push(`--proxy-bypass-list=${LOCAL_PROXY.host};localhost;[::1]`);
    }
  } else {
    stripEnvKeys.push('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'no_proxy', 'WS_PROXY', 'WSS_PROXY', 'NODE_USE_ENV_PROXY');
  }

  if (profileDir) {
    if (typeof profileDir !== 'string' || /[\u0000\r\n]/.test(profileDir)) {
      throw fail('SAFE_ENV_PROFILE_DIR_INVALID', '实例隔离目录无效。');
    }
    if (adapter === 'electron-launch') {
      extraArgs.push(`--user-data-dir=${profileDir}`);
    } else if (appId === 'codex-cli' || appId === 'codex') {
      envPatch.CODEX_HOME = profileDir;
    } else if (appId === 'claude-code') {
      envPatch.CLAUDE_CONFIG_DIR = profileDir;
    } else if (appId === 'grok-cli') {
      envPatch.GROK_HOME = profileDir;
    } else if (appId === 'gemini-cli') {
      envPatch.GEMINI_CLI_HOME = profileDir;
    }
  }

  if (relayEndpoint) {
    if (!object(relayEndpoint) || typeof relayEndpoint.baseUrl !== 'string' || typeof relayEndpoint.protocol !== 'string') {
      throw fail('SAFE_ENV_RELAY_INVALID', '中转站注入参数无效。');
    }
    let parsed;
    try { parsed = new URL(relayEndpoint.baseUrl); } catch { throw fail('SAFE_ENV_RELAY_INVALID', '中转站地址无效。'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw fail('SAFE_ENV_RELAY_INVALID', '中转站必须使用受控 HTTPS 地址。');
    }
    const cleanBaseUrl = parsed.toString().replace(/\/$/, '');
    if (relayEndpoint.protocol === 'anthropic') {
      envPatch.ANTHROPIC_BASE_URL = cleanBaseUrl;
    } else if (relayEndpoint.protocol === 'openai' || relayEndpoint.protocol === 'openai-responses') {
      envPatch.OPENAI_BASE_URL = cleanBaseUrl;
    } else if (relayEndpoint.protocol === 'gemini') {
      envPatch.GOOGLE_GEMINI_BASE_URL = cleanBaseUrl;
    } else if (relayEndpoint.protocol === 'xai') {
      envPatch.XAI_BASE_URL = cleanBaseUrl;
      envPatch.OPENAI_BASE_URL = cleanBaseUrl;
    } else {
      throw fail('SAFE_ENV_RELAY_INVALID', '不支持的中转站协议类型。');
    }
  }

  return Object.freeze({
    mode,
    extraArgs: Object.freeze(extraArgs),
    envPatch: Object.freeze(envPatch),
    stripEnvKeys: Object.freeze(stripEnvKeys),
    exitGeo: null,
  });
}
