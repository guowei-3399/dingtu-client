import { createHash, createPublicKey } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_PRODUCTION_TRUST_BYTES = 16 * 1024;

export const ALLOWED_PRODUCTION_ORIGINS = Object.freeze([
  'https://dingtu.noyapi.cn',
  'https://production.noyapi.cn',
  'https://noyapi.cn',
  'https://www.noyapi.cn',
]);

// Hardcoded public test / dummy Ed25519 keys that must NEVER enter packaged assets or production trust.
export const FORBIDDEN_PUBLIC_TEST_KEYS = Object.freeze([
  Object.freeze({
    source: 'v112-signature-vector:configPublicJwk(PUBLIC_TEST_ONLY_DO_NOT_DEPLOY)',
    x: 'O2onvM62pC1io6jQKm8Nc2UyFXcd4kOmOsBIoYtZ2ik',
    keyId: 'ed25519-139e3940e64b5491722088d9a0d741628fc826e09475d341a780acde3c4b8070',
  }),
  Object.freeze({
    source: 'v112-signature-vector:devicePublicJwk(PUBLIC_TEST_ONLY_DO_NOT_DEPLOY)',
    x: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ',
    keyId: 'ed25519-65b60673d6ed884bf01c2c222d82ada0740f29ac3355d6a925c81f17f47a27b8',
  }),
  Object.freeze({
    source: 'smoke-dummy-zero32-ed25519',
    x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    keyId: 'ed25519-66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925',
  }),
]);

const FORBIDDEN_TEST_MARKERS = Object.freeze([
  'PUBLIC_TEST_ONLY_DO_NOT_DEPLOY',
  'PUBLIC-TEST-ONLY-NOT-A-DEPLOYMENT-SECRET',
  'PUBLIC-LEASE-TEST-ONLY-NOT-A-DEPLOYMENT-SECRET',
  'not-for-deployment',
]);

const FORBIDDEN_BY_X = new Map(FORBIDDEN_PUBLIC_TEST_KEYS.map(entry => [entry.x, entry.source]));
const FORBIDDEN_BY_KEY_ID = new Map(FORBIDDEN_PUBLIC_TEST_KEYS.map(entry => [entry.keyId, entry.source]));
const ALLOWED_JWK_KEYS = new Set(['kty', 'crv', 'x', 'alg', 'use', 'key_ops']);
const FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const DISALLOWED_HOST_SUFFIX = /(?:^|\.)(?:invalid|test|example|localhost)$/i;
const IPV4_HOST = /^(?:\d{1,3}\.){3}\d{1,3}$/;

const sha256Hex = value => createHash('sha256').update(value).digest('hex');
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function trustFailure(code, reason, message) {
  return Object.assign(new Error(message), { code, reason });
}

function assertNoDuplicateJsonKeys(text) {
  const stack = [];
  let index = 0;
  const length = text.length;
  while (index < length) {
    const ch = text[index];
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      index += 1;
      continue;
    }
    if (ch === '{') {
      stack.push({ type: 'object', keys: new Set(), awaitingKey: true });
      index += 1;
      continue;
    }
    if (ch === '[') {
      stack.push({ type: 'array' });
      index += 1;
      continue;
    }
    if (ch === '}' || ch === ']') {
      stack.pop();
      index += 1;
      continue;
    }
    if (ch === ',') {
      const top = stack.at(-1);
      if (top?.type === 'object') top.awaitingKey = true;
      index += 1;
      continue;
    }
    if (ch === '"') {
      let end = index + 1;
      while (end < length) {
        if (text[end] === '\\') { end += 2; continue; }
        if (text[end] === '"') break;
        end += 1;
      }
      const literal = text.slice(index, end + 1);
      const top = stack.at(-1);
      if (top?.type === 'object' && top.awaitingKey) {
        const key = JSON.parse(literal);
        if (FORBIDDEN_JSON_KEYS.has(key) || top.keys.has(key)) {
          throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_JSON_INVALID', '生产信任锚 JSON 包含重复或非法对象键。');
        }
        top.keys.add(key);
        top.awaitingKey = false;
      }
      index = end + 1;
      continue;
    }
    index += 1;
  }
}

export function parseStrictTrustJson(raw) {
  let text;
  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw, 'utf8') > MAX_PRODUCTION_TRUST_BYTES) {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_JSON_INVALID', '生产信任锚文件体积超出上限。');
    }
    text = raw;
  } else if (raw instanceof Uint8Array) {
    if (raw.byteLength > MAX_PRODUCTION_TRUST_BYTES) {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_JSON_INVALID', '生产信任锚文件体积超出上限。');
    }
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    } catch {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_JSON_INVALID', '生产信任锚文件不是合法 UTF-8 编码。');
    }
  } else {
    throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_JSON_INVALID', '生产信任锚输入类型无效。');
  }
  if (!text.trim() || text.charCodeAt(0) === 0xFEFF) {
    throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_JSON_INVALID', '生产信任锚 JSON 不能为空或包含 BOM。');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_JSON_INVALID', '生产信任锚 JSON 解析失败。');
  }
  if (!isPlainObject(parsed)) {
    throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_SCHEMA_INVALID', '生产信任锚顶层必须为 JSON 对象。');
  }
  assertNoDuplicateJsonKeys(text);
  return parsed;
}

export function deriveEd25519KeyId(input) {
  let raw;
  if (input instanceof Uint8Array) {
    raw = Buffer.from(input);
  } else if (isPlainObject(input) && typeof input.x === 'string' && /^[A-Za-z0-9_-]{43}$/.test(input.x)) {
    raw = Buffer.from(input.x, 'base64url');
    if (raw.toString('base64url') !== input.x) {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_KEY_INVALID', 'Ed25519 公钥 x 字段不是规范 base64url 编码。');
    }
  } else {
    throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_KEY_INVALID', '无法推导 Ed25519 公钥 keyId。');
  }
  if (raw.length !== 32) {
    throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_KEY_INVALID', 'Ed25519 公钥原始字节长度必须为 32。');
  }
  return `ed25519-${sha256Hex(raw)}`;
}

function normalizeAllowedOrigins(allowedOrigins) {
  if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) {
    throw trustFailure('CONFIGURATION_INVALID', 'PRODUCTION_TRUST_ALLOWLIST_INVALID', '生产信任锚 origin 白名单配置无效。');
  }
  const normalized = new Set();
  for (const candidate of allowedOrigins) {
    if (typeof candidate !== 'string' || !candidate || candidate.length > 256 || /\s/.test(candidate)) {
      throw trustFailure('CONFIGURATION_INVALID', 'PRODUCTION_TRUST_ALLOWLIST_INVALID', '生产信任锚 origin 白名单包含非法项。');
    }
    let url;
    try { url = new URL(candidate); } catch {
      throw trustFailure('CONFIGURATION_INVALID', 'PRODUCTION_TRUST_ALLOWLIST_INVALID', '生产信任锚 origin 白名单包含非法 URL。');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
        || url.pathname !== '/' || candidate !== url.origin
        || DISALLOWED_HOST_SUFFIX.test(url.hostname) || IPV4_HOST.test(url.hostname) || url.hostname.startsWith('[')) {
      throw trustFailure('CONFIGURATION_INVALID', 'PRODUCTION_TRUST_ALLOWLIST_INVALID', '生产信任锚 origin 白名单只允许规范化正式 HTTPS 域名。');
    }
    normalized.add(url.origin);
  }
  return normalized;
}

export function validateProductionTrust(input, { allowedOrigins = ALLOWED_PRODUCTION_ORIGINS } = {}) {
  const allowedSet = normalizeAllowedOrigins(allowedOrigins);
  const doc = (typeof input === 'string' || input instanceof Uint8Array) ? parseStrictTrustJson(input) : input;
  if (!isPlainObject(doc)) {
    throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_SCHEMA_INVALID', '生产信任锚必须为对象。');
  }
  const topKeys = Object.keys(doc);
  if (topKeys.length !== 2 || !Object.hasOwn(doc, 'origin') || !Object.hasOwn(doc, 'keys')) {
    throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_SCHEMA_INVALID', '生产信任锚必须且仅能包含 {origin, keys} 两个字段。');
  }

  if (typeof doc.origin !== 'string' || !doc.origin || doc.origin.length > 256 || /\s/.test(doc.origin)) {
    throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_ORIGIN_NOT_ALLOWED', '生产信任锚 origin 字段格式无效。');
  }
  let parsedUrl;
  try { parsedUrl = new URL(doc.origin); } catch {
    throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_ORIGIN_NOT_ALLOWED', '生产信任锚 origin 不是合法 URL。');
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password
      || parsedUrl.search || parsedUrl.hash || parsedUrl.pathname !== '/'
      || doc.origin !== parsedUrl.origin || !allowedSet.has(doc.origin)) {
    throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_ORIGIN_NOT_ALLOWED', '生产信任锚 origin 不在允许的规范化 HTTPS 受众列表中。');
  }

  if (!isPlainObject(doc.keys)) {
    throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_SCHEMA_INVALID', '生产信任锚 keys 字段必须为对象映射。');
  }
  const entries = Object.entries(doc.keys);
  if (entries.length < 1 || entries.length > 4) {
    throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_KEY_COUNT_INVALID', '生产信任锚 keys 必须包含 1–4 把 Ed25519 公钥。');
  }

  const normalizedKeys = {};
  const seenPublicX = new Set();
  for (const [keyId, jwk] of entries) {
    if (FORBIDDEN_JSON_KEYS.has(keyId)) {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_KEY_INVALID', '生产信任锚包含非法 keyId。');
    }
    if (FORBIDDEN_BY_KEY_ID.has(keyId) || (isPlainObject(jwk) && typeof jwk.x === 'string' && FORBIDDEN_BY_X.has(jwk.x))) {
      const matched = FORBIDDEN_BY_KEY_ID.get(keyId) || FORBIDDEN_BY_X.get(jwk.x);
      throw trustFailure(
        'PROXY_CONFIG_INVALID',
        'PRODUCTION_TRUST_TEST_KEY_FORBIDDEN',
        `检测到被禁止打包/部署的公开测试公钥（${matched}），已阻断信任锚加载与构建。`,
      );
    }
    if (!isPlainObject(jwk)) {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_KEY_INVALID', '生产信任锚公钥条目必须为 JWK 对象。');
    }
    if (Object.hasOwn(jwk, 'd')) {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_PRIVATE_KEY_FORBIDDEN', '生产信任锚严禁包含私钥字段 d。');
    }
    const jwkKeys = Object.keys(jwk);
    if (jwkKeys.some(field => FORBIDDEN_JSON_KEYS.has(field) || !ALLOWED_JWK_KEYS.has(field))) {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_KEY_INVALID', '生产信任锚 JWK 含未知字段。');
    }
    if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || typeof jwk.x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(jwk.x)) {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_KEY_INVALID', '生产信任锚仅接受 OKP/Ed25519 公钥 JWK。');
    }
    if (jwk.alg !== undefined && jwk.alg !== 'EdDSA') {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_KEY_INVALID', '生产信任锚 JWK alg 仅允许 EdDSA。');
    }
    if (jwk.use !== undefined && jwk.use !== 'sig') {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_KEY_INVALID', '生产信任锚 JWK use 仅允许 sig。');
    }
    if (jwk.key_ops !== undefined && (!Array.isArray(jwk.key_ops) || jwk.key_ops.length !== 1 || jwk.key_ops[0] !== 'verify')) {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_KEY_INVALID', '生产信任锚 JWK key_ops 仅允许 ["verify"]。');
    }
    const raw = Buffer.from(jwk.x, 'base64url');
    if (raw.length !== 32 || raw.toString('base64url') !== jwk.x || raw.every(byte => byte === 0)) {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_KEY_INVALID', 'Ed25519 公钥原始字节或 base64url 编码无效。');
    }
    const expectedKeyId = `ed25519-${sha256Hex(raw)}`;
    if (FORBIDDEN_BY_KEY_ID.has(expectedKeyId)) {
      throw trustFailure(
        'PROXY_CONFIG_INVALID',
        'PRODUCTION_TRUST_TEST_KEY_FORBIDDEN',
        `检测到被禁止打包/部署的公开测试公钥（${FORBIDDEN_BY_KEY_ID.get(expectedKeyId)}），已阻断信任锚加载与构建。`,
      );
    }
    if (keyId !== expectedKeyId) {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_KEY_ID_MISMATCH', '生产信任锚 keyId 必须等于 ed25519-<sha256_hex(rawPublicKeyBytes)>。');
    }
    if (seenPublicX.has(jwk.x)) {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_KEY_INVALID', '生产信任锚存在重复公钥。');
    }
    seenPublicX.add(jwk.x);
    let imported;
    try {
      imported = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, format: 'jwk' });
    } catch {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_KEY_INVALID', '无法导入合法的 Ed25519 公钥。');
    }
    if (imported.asymmetricKeyType !== 'ed25519') {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_KEY_INVALID', '导入密钥类型不是 Ed25519。');
    }
    const cleanJwk = { kty: 'OKP', crv: 'Ed25519', x: jwk.x };
    if (jwk.alg !== undefined) cleanJwk.alg = jwk.alg;
    if (jwk.use !== undefined) cleanJwk.use = jwk.use;
    if (jwk.key_ops !== undefined) cleanJwk.key_ops = Object.freeze(['verify']);
    normalizedKeys[keyId] = Object.freeze(cleanJwk);
  }

  return Object.freeze({
    origin: doc.origin,
    keys: Object.freeze(normalizedKeys),
  });
}

export function loadProductionTrust(trustPath, {
  exists = existsSync,
  lstat = lstatSync,
  readFile = readFileSync,
  allowedOrigins = ALLOWED_PRODUCTION_ORIGINS,
} = {}) {
  if (typeof trustPath !== 'string' || !trustPath.trim()) {
    throw trustFailure('PROXY_CONFIG_UNAVAILABLE', 'PRODUCTION_TRUST_ABSENT', 'production trust not published');
  }
  if (!exists(trustPath)) {
    throw trustFailure('PROXY_CONFIG_UNAVAILABLE', 'PRODUCTION_TRUST_ABSENT', 'production trust not published');
  }
  let stat;
  try {
    stat = lstat(trustPath);
  } catch {
    throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_FILE_INVALID', 'production trust unreadable');
  }
  if (!stat?.isFile?.() || stat.isSymbolicLink?.() || stat.size > MAX_PRODUCTION_TRUST_BYTES) {
    throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_FILE_INVALID', 'production trust file invalid');
  }
  return validateProductionTrust(readFile(trustPath), { allowedOrigins });
}

async function scanPackagedAssetsForTestKeys(assetsDir) {
  let stat;
  try {
    stat = await fs.lstat(assetsDir);
  } catch (error) {
    if (error?.code === 'ENOENT') return 0;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_ASSET_INVALID', `打包资源目录无效：${assetsDir}`);
  }
  let scannedJsonFiles = 0;
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const entryStat = await fs.lstat(fullPath);
      if (entryStat.isSymbolicLink()) {
        throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_ASSET_INVALID', `打包资源目录禁止包含符号链接：${fullPath}`);
      }
      if (entryStat.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entryStat.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
      scannedJsonFiles += 1;
      const bytes = await fs.readFile(fullPath);
      const content = bytes.toString('utf8');
      for (const marker of FORBIDDEN_TEST_MARKERS) {
        if (content.includes(marker)) {
          throw trustFailure(
            'PROXY_CONFIG_INVALID',
            'PRODUCTION_TRUST_TEST_KEY_FORBIDDEN',
            `打包资产 ${entry.name} 检测到测试标记 ${marker}，已阻断构建。`,
          );
        }
      }
      for (const forbidden of FORBIDDEN_PUBLIC_TEST_KEYS) {
        if (content.includes(forbidden.x) || content.includes(forbidden.keyId)) {
          throw trustFailure(
            'PROXY_CONFIG_INVALID',
            'PRODUCTION_TRUST_TEST_KEY_FORBIDDEN',
            `打包资产 ${entry.name} 检测到黑名单公开测试公钥（${forbidden.source}），已阻断构建。`,
          );
        }
      }
    }
  }
  await walk(assetsDir);
  return scannedJsonFiles;
}

export async function preflightProductionTrustAssets({
  electronDir = path.dirname(fileURLToPath(import.meta.url)),
  rootAssetsDir = null,
  trustFile = null,
  allowedOrigins = ALLOWED_PRODUCTION_ORIGINS,
  requirePresent = false,
} = {}) {
  if (trustFile !== null && trustFile !== undefined) {
    const resolved = path.resolve(trustFile);
    let stat;
    try {
      stat = await fs.lstat(resolved);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw trustFailure('PROXY_CONFIG_UNAVAILABLE', 'PRODUCTION_TRUST_ABSENT', `指定的候选信任锚文件不存在：${resolved}`);
      }
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_FILE_INVALID', `无法读取候选信任锚文件：${resolved}`);
    }
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_PRODUCTION_TRUST_BYTES) {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_FILE_INVALID', `候选信任锚文件类型或大小无效：${resolved}`);
    }
    const validated = validateProductionTrust(await fs.readFile(resolved), { allowedOrigins });
    const keyIds = Object.keys(validated.keys);
    return Object.freeze({
      mode: 'pinned-production-trust',
      trustPresent: true,
      readyForProductionTraffic: false,
      trustPath: resolved,
      origin: validated.origin,
      keyIds: Object.freeze(keyIds),
      scannedJsonAssets: 1,
      notice: `[trust-guard] 候选信任锚校验通过：origin=${validated.origin}，keys=${keyIds.length}（${keyIds.join(', ')}）。`,
    });
  }

  let scannedJsonAssets = 0;
  const validatedCandidates = [];

  if (rootAssetsDir) {
    scannedJsonAssets += await scanPackagedAssetsForTestKeys(rootAssetsDir);
    const rootTrustPath = path.join(rootAssetsDir, 'production-trust.json');
    if (existsSync(rootTrustPath)) {
      const stat = await fs.lstat(rootTrustPath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_FILE_INVALID', '根目录 assets/production-trust.json 文件类型无效。');
      }
      const bytes = await fs.readFile(rootTrustPath);
      validatedCandidates.push({ path: rootTrustPath, trust: validateProductionTrust(bytes, { allowedOrigins }) });
    }
  }

  const electronAssetsDir = path.join(electronDir, 'assets');
  scannedJsonAssets += await scanPackagedAssetsForTestKeys(electronAssetsDir);
  const electronTrustPath = path.join(electronAssetsDir, 'production-trust.json');
  if (existsSync(electronTrustPath)) {
    const stat = await fs.lstat(electronTrustPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_FILE_INVALID', 'electron/assets/production-trust.json 文件类型无效。');
    }
    const bytes = await fs.readFile(electronTrustPath);
    validatedCandidates.push({ path: electronTrustPath, trust: validateProductionTrust(bytes, { allowedOrigins }) });
  }

  if (validatedCandidates.length === 0) {
    if (requirePresent) {
      throw trustFailure(
        'PROXY_CONFIG_UNAVAILABLE',
        'PRODUCTION_TRUST_ABSENT',
        '缺少 electron/assets/production-trust.json（当前要求显式提供正式信任锚）。',
      );
    }
    return Object.freeze({
      mode: 'fail-closed-candidate',
      trustPresent: false,
      readyForProductionTraffic: false,
      trustPath: electronTrustPath,
      origin: null,
      keyIds: Object.freeze([]),
      scannedJsonAssets,
      notice: '[trust-guard] 未放置 electron/assets/production-trust.json：当前构建处于“无信任锚 fail-closed 候选模式”（loadTransport 严格返回 PROXY_CONFIG_UNAVAILABLE）。',
    });
  }

  if (validatedCandidates.length === 2) {
    const [first, second] = validatedCandidates;
    if (JSON.stringify(first.trust) !== JSON.stringify(second.trust)) {
      throw trustFailure('PROXY_CONFIG_INVALID', 'PRODUCTION_TRUST_MISMATCH', 'assets/production-trust.json 与 electron/assets/production-trust.json 内容不一致。');
    }
  }

  const active = validatedCandidates.at(-1);
  const keyIds = Object.keys(active.trust.keys);
  return Object.freeze({
    mode: 'pinned-production-trust',
    trustPresent: true,
    readyForProductionTraffic: false,
    trustPath: active.path,
    origin: active.trust.origin,
    keyIds: Object.freeze(keyIds),
    scannedJsonAssets,
    notice: `[trust-guard] 生产信任锚离线预检通过：origin=${active.trust.origin}，keys=${keyIds.length}（${keyIds.join(', ')}）。`,
  });
}

async function runCli(argv = process.argv.slice(2)) {
  let trustFile = null;
  let requirePresent = false;
  let jsonOutput = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--require-present') requirePresent = true;
    else if (arg === '--json') jsonOutput = true;
    else if (arg === '--file') {
      if (i + 1 >= argv.length) throw trustFailure('CONFIGURATION_INVALID', 'CLI_ARGS_INVALID', '--file 需要提供候选信任锚路径。');
      trustFile = argv[++i];
    } else {
      throw trustFailure('CONFIGURATION_INVALID', 'CLI_ARGS_INVALID', `未知命令行参数：${arg}`);
    }
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const result = await preflightProductionTrustAssets({
    electronDir: here,
    rootAssetsDir: trustFile ? null : path.resolve(here, '..', 'assets'),
    trustFile,
    requirePresent,
  });
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(`${result.notice}\n`);
  }
}

if (!process.versions.electron && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch(error => {
    const reason = error?.reason || error?.code || 'PRODUCTION_TRUST_CHECK_FAILED';
    process.stderr.write(`[trust-guard] 校验失败 (${reason}): ${error?.message || '未知错误'}\n`);
    process.exitCode = 1;
  });
}
