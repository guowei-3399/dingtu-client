import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_PRODUCTION_ORIGINS,
  FORBIDDEN_PUBLIC_TEST_KEYS,
  deriveEd25519KeyId,
  loadProductionTrust,
  parseStrictTrustJson,
  preflightProductionTrustAssets,
  validateProductionTrust,
} from './production-trust.mjs';
import { createProductionTunnelClient } from './production-tunnel.mjs';
import { createProductionProxyController } from './production-proxy.mjs';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const require = createRequire(import.meta.url);
const syncRenderer = require('./sync-renderer.cjs');

function freshKeyEntry() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({ format: 'jwk' });
  const privateJwk = privateKey.export({ format: 'jwk' });
  const keyId = deriveEd25519KeyId(publicJwk);
  return { keyId, publicJwk: { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x }, privateJwk };
}

test('repository pins the formal production trust anchor and passes offline preflight', async () => {
  const rootTrust = path.join(repoRoot, 'assets', 'production-trust.json');
  const electronTrust = path.join(here, 'assets', 'production-trust.json');
  assert.equal(existsSync(rootTrust), true);
  assert.equal(existsSync(electronTrust), true);
  assert.equal(Buffer.compare(await fs.readFile(rootTrust), await fs.readFile(electronTrust)), 0);

  const preflight = await preflightProductionTrustAssets({
    electronDir: here,
    rootAssetsDir: path.join(repoRoot, 'assets'),
    requirePresent: true,
  });
  assert.equal(preflight.mode, 'pinned-production-trust');
  assert.equal(preflight.trustPresent, true);
  assert.equal(preflight.readyForProductionTraffic, false);
  assert.equal(preflight.origin, 'https://dingtu.noyapi.cn');
  assert.deepEqual(preflight.keyIds, ['ed25519-56e1402e0b411015a6bebb50c7f79ae1910ee473f34200eba35eb95698798dc2']);
  assert.match(preflight.notice, /生产信任锚离线预检通过/);

  const trust = loadProductionTrust(electronTrust);
  assert.equal(trust.origin, 'https://dingtu.noyapi.cn');
  const tunnelClient = createProductionTunnelClient({
    origin: trust.origin,
    trustedKeys: trust.keys,
    fetch: async () => assert.fail('must not dispatch network call during offline check'),
  });
  assert.equal(typeof tunnelClient.getConfig, 'function');
});

test('missing production-trust.json in an isolated workspace reports fail-closed candidate mode', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dingtu-absent-trust-'));
  try {
    const tempRootAssets = path.join(tempRoot, 'assets');
    const tempElectronDir = path.join(tempRoot, 'electron');
    const tempElectronAssets = path.join(tempElectronDir, 'assets');
    await fs.mkdir(tempRootAssets, { recursive: true });
    await fs.mkdir(tempElectronAssets, { recursive: true });
    const missingTrust = path.join(tempElectronAssets, 'production-trust.json');

    const preflight = await preflightProductionTrustAssets({
      electronDir: tempElectronDir,
      rootAssetsDir: tempRootAssets,
    });
    assert.equal(preflight.mode, 'fail-closed-candidate');
    assert.equal(preflight.trustPresent, false);
    assert.equal(preflight.readyForProductionTraffic, false);
    assert.match(preflight.notice, /无信任锚 fail-closed 候选模式/);

    await assert.rejects(
      preflightProductionTrustAssets({
        electronDir: tempElectronDir,
        rootAssetsDir: tempRootAssets,
        requirePresent: true,
      }),
      { code: 'PROXY_CONFIG_UNAVAILABLE', reason: 'PRODUCTION_TRUST_ABSENT' },
    );

    assert.throws(
      () => loadProductionTrust(missingTrust),
      { code: 'PROXY_CONFIG_UNAVAILABLE', reason: 'PRODUCTION_TRUST_ABSENT' },
    );

    const calls = [];
    const controller = createProductionProxyController({
      auth: { productionConfig: async () => assert.fail('must not request config without trust') },
      proxy: {
        isRunning: () => false,
        status: () => ({ state: 'stopped' }),
        startConfig: async () => { calls.push('start'); return { state: 'starting' }; },
        stop: () => { calls.push('stop'); return { state: 'stopped' }; },
      },
      binary: 'bundled-sing-box',
      configPath: 'runtime.json',
      hasBinary: () => true,
      loadTransport: () => {
        const trust = loadProductionTrust(missingTrust);
        return createProductionTunnelClient({ origin: trust.origin, trustedKeys: trust.keys });
      },
    });
    await assert.rejects(controller.start(), { code: 'PROXY_CONFIG_UNAVAILABLE' });
    assert.deepEqual(calls, ['stop']);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('validateProductionTrust accepts 1 to 4 canonical Ed25519 JWKs on allowlisted normalized HTTPS origins', () => {
  const generated = Array.from({ length: 4 }, () => freshKeyEntry());
  for (const origin of ALLOWED_PRODUCTION_ORIGINS) {
    const single = validateProductionTrust(JSON.stringify({
      origin,
      keys: {
        [generated[0].keyId]: {
          ...generated[0].publicJwk,
          alg: 'EdDSA',
          use: 'sig',
          key_ops: ['verify'],
        },
      },
    }));
    assert.equal(single.origin, origin);
    assert.deepEqual(Object.keys(single.keys), [generated[0].keyId]);
    assert.equal(Object.isFrozen(single), true);
    assert.equal(Object.isFrozen(single.keys), true);
  }

  const fourKeys = Object.fromEntries(generated.map(item => [item.keyId, item.publicJwk]));
  const result = validateProductionTrust(Buffer.from(JSON.stringify({
    origin: 'https://dingtu.noyapi.cn',
    keys: fourKeys,
  }), 'utf8'));
  assert.equal(Object.keys(result.keys).length, 4);
});

test('validateProductionTrust rejects schema drift, duplicate JSON keys, invalid origins, and malformed or private keys', () => {
  const k1 = freshKeyEntry();
  const fiveKeys = Object.fromEntries(Array.from({ length: 5 }, () => {
    const k = freshKeyEntry();
    return [k.keyId, k.publicJwk];
  }));

  // Duplicate JSON keys (including unicode-escaped duplicates) and BOM
  assert.throws(
    () => parseStrictTrustJson(`{"origin":"https://evil.example","origin":"https://dingtu.noyapi.cn","keys":{}}`),
    { code: 'PROXY_CONFIG_INVALID', reason: 'PRODUCTION_TRUST_JSON_INVALID' },
  );
  assert.throws(
    () => parseStrictTrustJson(`{"origin":"https://dingtu.noyapi.cn","orig\\u0069n":"https://dingtu.noyapi.cn","keys":{}}`),
    { code: 'PROXY_CONFIG_INVALID', reason: 'PRODUCTION_TRUST_JSON_INVALID' },
  );
  assert.throws(
    () => parseStrictTrustJson(`\uFEFF{"origin":"https://dingtu.noyapi.cn","keys":{}}`),
    { code: 'PROXY_CONFIG_INVALID', reason: 'PRODUCTION_TRUST_JSON_INVALID' },
  );

  // Exact {origin, keys} field check
  for (const badDoc of [
    null,
    [],
    { origin: 'https://dingtu.noyapi.cn' },
    { keys: { [k1.keyId]: k1.publicJwk } },
    { origin: 'https://dingtu.noyapi.cn', keys: { [k1.keyId]: k1.publicJwk }, extra: true },
  ]) {
    assert.throws(
      () => validateProductionTrust(badDoc),
      { code: 'PROXY_CONFIG_INVALID', reason: 'PRODUCTION_TRUST_SCHEMA_INVALID' },
    );
  }

  // Origin normalization and allowlist checks
  for (const badOrigin of [
    'http://dingtu.noyapi.cn',
    'https://dingtu.noyapi.cn/',
    'https://dingtu.noyapi.cn:443',
    'https://Dingtu.Noyapi.cn',
    'https://dingtu.noyapi.cn/api',
    'https://dingtu.noyapi.cn?x=1',
    'https://user:pass@dingtu.noyapi.cn',
    'https://production.example.invalid',
    'https://origin-staging.noyapi.cn:18443',
    'https://127.0.0.1',
    'https://evil.example.com',
  ]) {
    assert.throws(
      () => validateProductionTrust({ origin: badOrigin, keys: { [k1.keyId]: k1.publicJwk } }),
      { code: 'PROXY_CONFIG_INVALID', reason: 'PRODUCTION_TRUST_ORIGIN_NOT_ALLOWED' },
      badOrigin,
    );
  }

  // Key count bounds (0 and 5)
  assert.throws(
    () => validateProductionTrust({ origin: 'https://dingtu.noyapi.cn', keys: {} }),
    { code: 'PROXY_CONFIG_INVALID', reason: 'PRODUCTION_TRUST_KEY_COUNT_INVALID' },
  );
  assert.throws(
    () => validateProductionTrust({ origin: 'https://dingtu.noyapi.cn', keys: fiveKeys }),
    { code: 'PROXY_CONFIG_INVALID', reason: 'PRODUCTION_TRUST_KEY_COUNT_INVALID' },
  );

  // Private key material 'd' must never pass
  assert.throws(
    () => validateProductionTrust({ origin: 'https://dingtu.noyapi.cn', keys: { [k1.keyId]: k1.privateJwk } }),
    { code: 'PROXY_CONFIG_INVALID', reason: 'PRODUCTION_TRUST_PRIVATE_KEY_FORBIDDEN' },
  );

  // Mismatched keyId
  const k2 = freshKeyEntry();
  assert.throws(
    () => validateProductionTrust({ origin: 'https://dingtu.noyapi.cn', keys: { [k2.keyId]: k1.publicJwk } }),
    { code: 'PROXY_CONFIG_INVALID', reason: 'PRODUCTION_TRUST_KEY_ID_MISMATCH' },
  );

  // Wrong curve / kty / extra JWK fields / bad alg / bad key_ops
  for (const badJwk of [
    { kty: 'EC', crv: 'P-256', x: k1.publicJwk.x },
    { kty: 'OKP', crv: 'X25519', x: k1.publicJwk.x },
    { ...k1.publicJwk, kid: k1.keyId },
    { ...k1.publicJwk, alg: 'RS256' },
    { ...k1.publicJwk, use: 'enc' },
    { ...k1.publicJwk, key_ops: ['sign'] },
    { kty: 'OKP', crv: 'Ed25519', x: `${k1.publicJwk.x}=` },
  ]) {
    assert.throws(
      () => validateProductionTrust({ origin: 'https://dingtu.noyapi.cn', keys: { [k1.keyId]: badJwk } }),
      { code: 'PROXY_CONFIG_INVALID', reason: 'PRODUCTION_TRUST_KEY_INVALID' },
    );
  }
});

test('hardcoded blacklist blocks PUBLIC_TEST_ONLY_DO_NOT_DEPLOY vector keys and dummy keys in trust and packaged assets', async () => {
  const vectorRaw = await fs.readFile(path.join(here, 'fixtures', 'v112-signature-vector.json'), 'utf8');
  const vector = JSON.parse(vectorRaw);
  assert.equal(vector.scope, 'PUBLIC_TEST_ONLY_DO_NOT_DEPLOY');

  const configKeyId = deriveEd25519KeyId(vector.configPublicJwk);
  const deviceKeyId = deriveEd25519KeyId(vector.devicePublicJwk);
  assert.equal(configKeyId, vector.envelope.signature.keyId);
  assert.equal(FORBIDDEN_PUBLIC_TEST_KEYS.some(entry => entry.keyId === configKeyId && entry.x === vector.configPublicJwk.x), true);
  assert.equal(FORBIDDEN_PUBLIC_TEST_KEYS.some(entry => entry.keyId === deviceKeyId && entry.x === vector.devicePublicJwk.x), true);

  // Direct trust validation blocks both test vector keys and forged-keyId variants
  const validExtra = freshKeyEntry();
  for (const forbiddenKeys of [
    { [configKeyId]: vector.configPublicJwk },
    { [deviceKeyId]: vector.devicePublicJwk },
    { [validExtra.keyId]: vector.configPublicJwk },
    { [configKeyId]: validExtra.publicJwk },
    { [validExtra.keyId]: validExtra.publicJwk, [configKeyId]: vector.configPublicJwk },
    { ['ed25519-66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925']: { kty: 'OKP', crv: 'Ed25519', x: 'A'.repeat(43) } },
  ]) {
    assert.throws(
      () => validateProductionTrust({ origin: 'https://dingtu.noyapi.cn', keys: forbiddenKeys }),
      { code: 'PROXY_CONFIG_INVALID', reason: 'PRODUCTION_TRUST_TEST_KEY_FORBIDDEN' },
    );
  }

  // Test sync-renderer preflight hook in an isolated temporary workspace
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dingtu-trust-guard-'));
  try {
    const sourceDir = path.join(tempRoot, 'workspace');
    const electronDir = path.join(sourceDir, 'electron');
    await fs.mkdir(path.join(sourceDir, 'assets'), { recursive: true });
    await fs.mkdir(path.join(electronDir, 'assets'), { recursive: true });
    for (const file of ['index.html', 'styles.css', 'app.js', 'assistant-data.js', 'assistant-catalog.js', 'local-tools.js', 'totp-qr.js']) {
      await fs.writeFile(path.join(sourceDir, file), `/* ${file} */\n`, 'utf8');
    }

    // 1. Absent trust -> succeeds in fail-closed-candidate mode
    const absentResult = await syncRenderer({ sourceDir, electronDir, silent: true });
    assert.equal(absentResult.mode, 'fail-closed-candidate');
    assert.equal(absentResult.trustPresent, false);

    // 2. Test vector key in source/assets/production-trust.json -> blocks BEFORE copying into electron/assets
    const sourceTrustPath = path.join(sourceDir, 'assets', 'production-trust.json');
    const electronTrustPath = path.join(electronDir, 'assets', 'production-trust.json');
    await fs.writeFile(sourceTrustPath, JSON.stringify({
      origin: 'https://dingtu.noyapi.cn',
      keys: { [configKeyId]: vector.configPublicJwk },
    }), 'utf8');
    await assert.rejects(
      syncRenderer({ sourceDir, electronDir, silent: true }),
      { code: 'PROXY_CONFIG_INVALID', reason: 'PRODUCTION_TRUST_TEST_KEY_FORBIDDEN' },
    );
    assert.equal(existsSync(electronTrustPath), false, 'forbidden trust must not be copied into electron/assets');
    await fs.unlink(sourceTrustPath);

    // 3. Smuggled vector JSON under another filename inside electron/assets -> also blocked
    const smuggledPath = path.join(electronDir, 'assets', 'stray-fixture.json');
    await fs.writeFile(smuggledPath, vectorRaw, 'utf8');
    await assert.rejects(
      syncRenderer({ sourceDir, electronDir, silent: true }),
      { code: 'PROXY_CONFIG_INVALID', reason: 'PRODUCTION_TRUST_TEST_KEY_FORBIDDEN' },
    );
    await fs.unlink(smuggledPath);

    // 4. Valid fresh non-test trust anchor -> passes preflight and sync
    const validKey = freshKeyEntry();
    const validTrustJson = JSON.stringify({
      origin: 'https://dingtu.noyapi.cn',
      keys: { [validKey.keyId]: validKey.publicJwk },
    });
    await fs.writeFile(sourceTrustPath, validTrustJson, 'utf8');
    const pinnedResult = await syncRenderer({ sourceDir, electronDir, silent: true });
    assert.equal(pinnedResult.mode, 'pinned-production-trust');
    assert.equal(pinnedResult.trustPresent, true);
    assert.equal(pinnedResult.origin, 'https://dingtu.noyapi.cn');
    assert.deepEqual(pinnedResult.keyIds, [validKey.keyId]);

    // CLI check (--file and default repo mode)
    const cliValid = await execFileAsync(process.execPath, [path.join(here, 'production-trust.mjs'), '--file', electronTrustPath, '--json']);
    const parsedCli = JSON.parse(cliValid.stdout.trim());
    assert.equal(parsedCli.mode, 'pinned-production-trust');
    assert.equal(parsedCli.origin, 'https://dingtu.noyapi.cn');

    const badCandidatePath = path.join(tempRoot, 'bad-test-trust.json');
    await fs.writeFile(badCandidatePath, JSON.stringify({
      origin: 'https://dingtu.noyapi.cn',
      keys: { [configKeyId]: vector.configPublicJwk },
    }), 'utf8');
    await assert.rejects(
      execFileAsync(process.execPath, [path.join(here, 'production-trust.mjs'), '--file', badCandidatePath]),
      error => error.code === 1 && /PRODUCTION_TRUST_TEST_KEY_FORBIDDEN/.test(error.stderr),
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('jy canary public signing key handoff JSON is format-compatible when wrapped with an allowed origin and remains unpacked', async () => {
  const candidates = [
    path.resolve(repoRoot, '..', 'docs', 'reviews', '2026-11-14-jy-canary配置签名公钥.json'),
    path.resolve(repoRoot, '..', '..', 'docs', 'reviews', '2026-11-14-jy-canary配置签名公钥.json'),
  ];
  let rawBytes = null;
  for (const candidatePath of candidates) {
    try {
      rawBytes = await fs.readFile(candidatePath);
      break;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  if (!rawBytes) {
    rawBytes = Buffer.from(JSON.stringify({
      scope: 'jy_canary_public_signing_key',
      originConfirmed: false,
      keyId: 'ed25519-56e1402e0b411015a6bebb50c7f79ae1910ee473f34200eba35eb95698798dc2',
      jwk: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: 'r96s9mS11s6eZ3K6jX-lA4uW7I8R9T0Y1U2I3O4P5A6',
      },
    }), 'utf8');
  }
  const receipt = JSON.parse(rawBytes.toString('utf8'));

  assert.equal(receipt.scope, 'jy_canary_public_signing_key');
  assert.equal(receipt.originConfirmed, false);
  assert.equal(deriveEd25519KeyId(receipt.jwk), receipt.keyId);

  // Raw handoff receipt itself must NOT be accepted directly as production-trust.json
  assert.throws(
    () => validateProductionTrust(rawBytes),
    { code: 'PROXY_CONFIG_INVALID', reason: 'PRODUCTION_TRUST_SCHEMA_INVALID' },
  );

  // Wrapped into a candidate {origin, keys} object in memory, JWK + keyId pass both offline guard and tunnel client
  const candidate = validateProductionTrust(JSON.stringify({
    origin: 'https://dingtu.noyapi.cn',
    keys: { [receipt.keyId]: receipt.jwk },
  }));
  assert.equal(candidate.origin, 'https://dingtu.noyapi.cn');
  assert.deepEqual(candidate.keys[receipt.keyId], {
    kty: 'OKP',
    crv: 'Ed25519',
    x: receipt.jwk.x,
  });
  const tunnelClient = createProductionTunnelClient({
    origin: candidate.origin,
    trustedKeys: candidate.keys,
    fetch: async () => assert.fail('must not dispatch network call during offline check'),
  });
  assert.equal(typeof tunnelClient.getConfig, 'function');

  // Ensure the canary handoff key is NOT mixed into the formal pinned production trust assets
  const pinnedElectronTrust = loadProductionTrust(path.join(here, 'assets', 'production-trust.json'));
  const pinnedRootTrust = loadProductionTrust(path.join(repoRoot, 'assets', 'production-trust.json'));
  assert.equal(Object.hasOwn(pinnedElectronTrust.keys, receipt.keyId), false);
  assert.equal(Object.hasOwn(pinnedRootTrust.keys, receipt.keyId), false);
});
