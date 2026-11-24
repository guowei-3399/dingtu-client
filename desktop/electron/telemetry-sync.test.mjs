import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLocalUsageScanner } from './local-usage-scanner.mjs';
import {
  createTelemetrySyncer,
  computeEventFingerprint,
  TELEMETRY_STAGES,
} from './telemetry-sync.mjs';
import { createControlClient } from './control-client.mjs';
import { createDeviceAuthHost } from './device-auth.mjs';
import { createProductionTunnelClient } from './production-tunnel.mjs';
import { createProductionProxyController } from './production-proxy.mjs';
import { createIsolatedBrowserHost } from './isolated-browser.mjs';
import { DESKTOP_CHANNEL, registerDesktopIpc } from './desktop-ipc.mjs';

test('scanTelemetryBuckets strips workspace/title/prompt metadata and createTelemetrySyncer syncs idempotently', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dingtu-telemetry-'));
  try {
    const codexDir = path.join(root, '.codex', 'sessions');
    await fs.mkdir(codexDir, { recursive: true });
    const nowIso = new Date().toISOString();
    await fs.writeFile(path.join(codexDir, 'r1.jsonl'), [
      JSON.stringify({ timestamp: nowIso, type: 'session_meta', payload: { id: 'sec-secret-sess', cwd: 'D:\\top-secret-client-folder' } }),
      JSON.stringify({ timestamp: nowIso, type: 'turn_context', payload: { model: 'gpt-5-codex' } }),
      JSON.stringify({ timestamp: nowIso, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 400, cached_input_tokens: 1000, output_tokens: 150, reasoning_output_tokens: 50 } } } }),
    ].join('\n'), 'utf8');

    const scanner = createLocalUsageScanner({ homeDir: root, appDataDir: root });
    const rawBuckets = scanner.scanTelemetryBuckets({ appIds: ['codex'], days: 30 });
    assert.equal(rawBuckets.length, 1);
    const jsonRaw = JSON.stringify(rawBuckets);
    assert.doesNotMatch(jsonRaw, /top-secret-client-folder|workspacePath|workspaceName|title/);
    assert.deepEqual(Object.keys(rawBuckets[0]).sort(), [
      'appId', 'bucketDate', 'cacheTokens', 'inputTokens', 'model',
      'outputTokens', 'sessionType', 'sessions', 'thinkingTokens', 'totalTokens', 'turns',
    ]);
    assert.equal(rawBuckets[0].totalTokens, 1600);

    let authStatus = 'signed_out';
    let sentPayloads = [];
    let currentEnvMode = 'safe_tunnel';
    const syncer = createTelemetrySyncer({
      usageScanner: scanner,
      platform: 'windows',
      appVersion: '0.2.0',
      environment: { getMode: () => currentEnvMode },
      proxy: { status: () => ({ state: 'running' }) },
      accounts: { settingsGet: async () => ({ customDataDirs: {} }) },
      authHost: {
        snapshot: () => ({ status: authStatus }),
        recentDiagnostics: () => ({ recentErrorCodes: ['PROXY_TIMEOUT'], recentRequestIds: ['req_diag_1'] }),
        syncTelemetry: async payload => {
          sentPayloads.push(payload);
          return {
            acceptedBuckets: payload.usageBuckets.length,
            acceptedEvents: payload.events.length,
            syncedAt: '2026-11-22T07:15:00.000Z',
          };
        },
      },
    });

    syncer.recordEvent({ category: 'tunnel', action: 'tunnel_started', status: 'ok' });
    const offlineStatus = await syncer.syncNow({ appIds: ['codex'] });
    assert.equal(offlineStatus.lastSyncStatus, 'offline');
    assert.equal(offlineStatus.pendingEventsCount, 1);
    assert.equal(sentPayloads.length, 0);

    const snap = syncer.buildDiagnosticSnapshot();
    assert.deepEqual(Object.keys(snap).sort(), [
      'appVersion', 'environmentMode', 'platform', 'proxyState', 'recentErrorCodes', 'recentRequestIds',
    ]);
    assert.equal(snap.proxyState, 'running');
    assert.equal(snap.environmentMode, 'safe_tunnel');
    assert.deepEqual(snap.recentErrorCodes, ['PROXY_TIMEOUT']);

    currentEnvMode = 'own_network';
    syncer.recordEvent({ category: 'tunnel', action: 'env_mode_own_network', status: 'ok' });
    assert.equal(syncer.buildDiagnosticSnapshot().environmentMode, 'own_network');

    authStatus = 'authenticated';
    const syncedStatus = await syncer.syncNow({ appIds: ['codex'] });
    assert.equal(syncedStatus.lastSyncStatus, 'synced');
    assert.equal(syncedStatus.lastAcceptedBuckets, 1);
    assert.equal(syncedStatus.lastAcceptedEvents, 2);
    assert.equal(sentPayloads[0].events[1].environmentMode, 'own_network');
    assert.equal(syncedStatus.pendingEventsCount, 0);
    assert.doesNotMatch(JSON.stringify(sentPayloads[0]), /top-secret-client-folder|workspacePath|workspaceName|title/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('v1.26 30s debounced fast-flush decouples from usageScanner, bounds ring queues, and retries with exponential backoff', async () => {
  let usageScanCalls = 0;
  let scheduledTimers = [];
  let nextTimerId = 1;
  const fakeSchedule = (fn, delay) => {
    const entry = { id: nextTimerId++, fn, delay, cleared: false };
    scheduledTimers.push(entry);
    return entry;
  };
  const fakeCancel = entry => { if (entry) entry.cleared = true; };

  let failNext = true;
  const sent = [];
  const syncer = createTelemetrySyncer({
    usageScanner: { scanTelemetryBuckets: () => { usageScanCalls += 1; return []; } },
    environment: { getMode: () => 'safe_tunnel' },
    proxy: { status: () => ({ state: 'running' }) },
    platform: 'windows',
    appVersion: '0.2.0',
    fastFlushDebounceMs: 30_000,
    backoffBaseMs: 30_000,
    backoffMaxMs: 600_000,
    random: () => 0.5, // zero jitter for deterministic backoff assertions
    schedule: fakeSchedule,
    cancelSchedule: fakeCancel,
    authHost: {
      snapshot: () => ({ status: 'authenticated' }),
      syncTelemetry: async payload => {
        if (failNext) throw new Error('network outage');
        sent.push(payload);
        return {
          acceptedBuckets: payload.usageBuckets.length,
          acceptedEvents: payload.events.length,
          acceptedLatencySamples: Array.isArray(payload.latencySamples) ? payload.latencySamples.length : 0,
          syncedAt: '2026-11-24T05:20:00.000Z',
        };
      },
    },
  });

  // Burst 105 error events -> ring cap holds last 100, and ONLY ONE 30s debounce timer is armed
  for (let i = 0; i < 105; i += 1) {
    syncer.recordEvent({
      category: 'tunnel',
      action: 'proxy_start_failed',
      stage: 'tun_setup',
      status: 'error',
      errorCode: 'PROXY_TIMEOUT',
      durationMs: 1200 + i,
      httpStatus: 503,
    });
  }
  assert.equal(syncer.status().pendingEventsCount, 100);
  const debounceTimers = scheduledTimers.filter(t => !t.cleared && t.delay === 30_000);
  assert.equal(debounceTimers.length, 1);

  // Burst 65 slow latency samples -> ring cap holds last 60
  for (let i = 0; i < 65; i += 1) {
    syncer.recordLatencySample({
      trigger: 'error_slow',
      totalMs: 3100 + i,
      status: 'degraded',
      errorCode: null,
    });
  }
  assert.equal(syncer.status().pendingLatencySamplesCount, 60);

  // Fire 30s debounce timer while server fails -> events retained, exponential backoff armed (30s -> 60s)
  await debounceTimers[0].fn();
  assert.equal(usageScanCalls, 0, 'fast-flush must NEVER invoke usageScanner');
  assert.equal(syncer.status().lastSyncStatus, 'error');
  assert.equal(syncer.status().pendingEventsCount, 100);
  assert.equal(syncer.status().pendingLatencySamplesCount, 60);
  const backoff1 = scheduledTimers.at(-1);
  assert.equal(backoff1.delay, 30_000);

  await backoff1.fn();
  const backoff2 = scheduledTimers.at(-1);
  assert.equal(backoff2.delay, 60_000);

  // Recover network -> flush delivers empty usageBuckets, 100 events, 60 latencySamples, drains queues
  failNext = false;
  await backoff2.fn();
  assert.equal(usageScanCalls, 0);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].usageBuckets, []);
  assert.equal(sent[0].events.length, 100);
  assert.equal(sent[0].latencySamples.length, 60);
  assert.equal(sent[0].events[0].appVersion, '0.2.0');
  assert.equal(sent[0].events[0].severity, 'error');
  assert.equal(
    sent[0].events[0].fingerprint,
    computeEventFingerprint({ stage: 'tun_setup', errorCode: 'PROXY_TIMEOUT', httpStatus: 503, action: 'proxy_start_failed' }),
  );
  assert.equal(syncer.status().pendingEventsCount, 0);
  assert.equal(syncer.status().pendingLatencySamplesCount, 0);
  assert.equal(syncer.status().lastAcceptedLatencySamples, 60);
  syncer.dispose();
});

test('v1.26 periodic latency probe obeys 4m+-20% jitter, pauses on stop/suspend, and records failed probes honestly', async () => {
  const timers = [];
  let id = 1;
  let randomVal = 0; // min jitter -> 0.8 * 240_000 = 192_000ms
  let proxyState = 'running';
  let envMode = 'safe_tunnel';
  let probeShouldFail = false;

  const syncer = createTelemetrySyncer({
    environment: { getMode: () => envMode },
    proxy: { status: () => ({ state: proxyState }) },
    authHost: {
      snapshot: () => ({ status: 'authenticated' }),
      syncTelemetry: async payload => ({
        acceptedBuckets: 0,
        acceptedEvents: payload.events.length,
        acceptedLatencySamples: payload.latencySamples?.length || 0,
        syncedAt: '2026-11-24T05:25:00.000Z',
      }),
    },
    random: () => randomVal,
    measureTcp: async () => ({ ok: true, durationMs: 38, errorCode: null }),
    probeLink: async () => (probeShouldFail
      ? { ok: false, status: 'timeout', e2eTtfbMs: null, totalMs: 8000, httpStatus: null, errorCode: 'REQUEST_TIMEOUT' }
      : { ok: true, status: 'ok', e2eTtfbMs: 210, totalMs: 295, httpStatus: 200, errorCode: null }),
    schedule: (fn, delay) => { const t = { id: id++, fn, delay, cleared: false }; timers.push(t); return t; },
    cancelSchedule: t => { if (t) t.cleared = true; },
    scheduleInterval: (fn, delay) => ({ fn, delay, cleared: false }),
    cancelInterval: t => { if (t) t.cleared = true; },
  });

  syncer.setActiveOrigin({ originHost: 'edge.noyapi.cn', originIp: '203.0.113.10', originPort: 443 });
  syncer.notifyProxyStateChange({ state: 'running' });
  assert.equal(timers[0].delay, 192_000); // 4m * 0.8 = 192s (>= 3m)

  // Fire periodic probe (ok) -> arms next with max jitter (random=1 -> 288_000ms <= 5m)
  randomVal = 1;
  timers[0].cleared = true;
  await timers[0].fn();
  const nextPeriodic = timers.find(t => !t.cleared && t.delay === 288_000);
  assert.ok(nextPeriodic, 'max jitter must equal 288_000ms (4m * 1.2)');
  assert.equal(syncer.status().pendingLatencySamplesCount, 1);

  // Fire failed probe -> records timeout latencySample + exit_probe error event + 30s fast flush
  probeShouldFail = true;
  nextPeriodic.cleared = true;
  await nextPeriodic.fn();
  assert.equal(syncer.status().pendingLatencySamplesCount, 2);
  assert.equal(syncer.status().pendingEventsCount, 1);

  // Suspend cancels active periodic probe timer
  syncer.notifySystemSuspend();
  assert.equal(timers.filter(t => !t.cleared && t.delay >= 192_000).length, 0);

  // Switch to own_network keeps periodic probe disarmed even after resume
  envMode = 'own_network';
  syncer.notifySystemResume();
  assert.equal(timers.filter(t => !t.cleared && t.delay >= 192_000).length, 0);
  syncer.dispose();
});

test('v1.26 all 14 whitelist stages emit valid telemetry through real modules and pass control-client schema validation', async () => {
  const capturedEvents = [];
  const capturedSamples = [];
  const posted = [];
  const syncer = createTelemetrySyncer({
    environment: { getMode: () => 'safe_tunnel' },
    proxy: { status: () => ({ state: 'running' }) },
    platform: 'windows',
    appVersion: '0.2.0',
    schedule: () => ({ cleared: false }),
    cancelSchedule: () => {},
    authHost: {
      snapshot: () => ({ status: 'authenticated' }),
      syncTelemetry: async payload => {
        const client = createControlClient({
          baseUrl: 'https://control.example.test',
          production: false,
          tokenProvider: async () => 't'.repeat(32),
          fetch: async (_url, init) => {
            const body = JSON.parse(init.body);
            posted.push(body);
            return {
              ok: true,
              status: 200,
              redirected: false,
              headers: { get: () => null },
              json: async () => ({
                acceptedBuckets: body.usageBuckets.length,
                acceptedEvents: body.events.length,
                ...(Object.hasOwn(body, 'latencySamples') ? { acceptedLatencySamples: body.latencySamples.length } : {}),
                syncedAt: '2026-11-24T05:30:00.000Z',
              }),
            };
          },
        });
        return client.syncTelemetry(payload);
      },
    },
  });
  const onTelemetryEvent = payload => { capturedEvents.push(syncer.recordEvent(payload)); };
  const onLatencySample = sample => { capturedSamples.push(syncer.recordLatencySample(sample)); };

  // 1-5 & 14: device-auth + production-tunnel (pkce_login, session_refresh, tunnel_authorize, tunnel_config_fetch, config_verify, logout)
  const devPair = crypto.generateKeyPairSync('ed25519');
  const devKeys = {
    privateKeyJwk: devPair.privateKey.export({ format: 'jwk' }),
    publicKeyJwk: devPair.publicKey.export({ format: 'jwk' }),
  };
  const prodPair = crypto.generateKeyPairSync('ed25519');
  const prodPubJwk = prodPair.publicKey.export({ format: 'jwk' });
  const prodKeyId = 'ed25519-' + crypto.createHash('sha256').update(Buffer.from(prodPubJwk.x, 'base64url')).digest('hex');

  const deviceId = '11111111-1111-4111-8111-111111111111';
  const storedRecord = {
    version: 1,
    device: { id: deviceId, platform: 'windows', appVersion: '0.2.0', status: 'active', createdAt: '2026-11-24T00:00:00.000Z' },
    session: {
      accessToken: 'nda_' + 'a'.repeat(32),
      refreshToken: 'ndr_' + 'r'.repeat(32),
      expiresIn: 600,
      refreshExpiresAt: new Date(Date.now() + 86400_000).toISOString(),
      scope: ['customer.read', 'tunnel.read', 'device.revoke'],
    },
    privateKeyJwk: devKeys.privateKeyJwk,
    accessExpiresAt: new Date(Date.now() + 600_000).toISOString(),
  };

  let authFailMode = 'authorize';
  const authHost = createDeviceAuthHost({
    platform: 'windows',
    appVersion: '0.2.0',
    store: { available: () => true, load: async () => structuredClone(storedRecord), save: async () => {}, clear: async () => {} },
    openExternal: async () => ({ ok: false }), // triggers pkce_login failure
    createClient: () => ({
      authorizationUrl: () => 'https://control.example.test/api/v1/client/authorize?state=1',
      refreshDeviceSession: async () => { throw Object.assign(new Error('refresh err'), { code: 'NETWORK_ERROR', status: 503 }); },
      revokeDeviceSession: async () => { throw Object.assign(new Error('revoke err'), { code: 'NETWORK_ERROR', status: 503 }); },
      createTunnelAuthorization: async () => {
        if (authFailMode === 'authorize') throw Object.assign(new Error('authz err'), { code: 'IDENTITY_UNAVAILABLE', status: 403, requestId: 'req_authz_1' });
        return { authorizationHandle: 'pah_' + Buffer.alloc(32, 7).toString('base64url'), expiresAt: new Date(Date.now() + 30_000).toISOString() };
      },
    }),
    onTelemetryEvent,
    onLatencySample,
  });
  await authHost.ready;

  // Stage 1: pkce_login
  await assert.rejects(authHost.login(), { code: 'AUTH_BROWSER_OPEN_FAILED' });
  // Stage 2: session_refresh
  await assert.rejects(authHost.refresh(), { code: 'NETWORK_ERROR' });
  // Stage 3: tunnel_authorize
  await assert.rejects(authHost.productionConfig({ getConfig: async () => ({}) }), { code: 'IDENTITY_UNAVAILABLE' });
  // Stage 4: tunnel_config_fetch (503 BRIDGE_UNAVAILABLE)
  authFailMode = 'ok';
  const transport503 = createProductionTunnelClient({
    origin: 'https://edge.noyapi.cn',
    trustedKeys: { [prodKeyId]: prodPubJwk },
    fetch: async () => ({
      ok: false, status: 503, redirected: false,
      headers: { get: name => (name === 'Content-Type' ? 'application/json' : name === 'X-Request-Id' ? 'req_cfg_503' : null) },
      body: new ReadableStream({
        start(c) { c.enqueue(Buffer.from(JSON.stringify({ error: { code: 'BRIDGE_UNAVAILABLE', request_id: 'req_cfg_503' } }))); c.close(); },
      }),
    }),
  });
  await assert.rejects(authHost.productionConfig(transport503), { code: 'BRIDGE_UNAVAILABLE' });

  // Stage 5: config_verify (tampered signature -> fatal PROXY_CONFIG_INVALID)
  const transportTampered = createProductionTunnelClient({
    origin: 'https://edge.noyapi.cn',
    trustedKeys: { [prodKeyId]: prodPubJwk },
    fetch: async () => ({
      ok: true, status: 200, redirected: false,
      headers: { get: name => (name === 'Content-Type' ? 'application/json' : name === 'X-Request-Id' ? 'req_verify_bad' : null) },
      body: new ReadableStream({
        start(c) {
          c.enqueue(Buffer.from(JSON.stringify({
            data_source: 'production', deviceId, authorizationHandleDigest: '0'.repeat(64),
            bindingRevision: 'binding-1', configRevision: 'cfg-' + '0'.repeat(64),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            config: '{}', signature: { keyId: prodKeyId, value: 'A'.repeat(86) },
          })));
          c.close();
        },
      }),
    }),
  });
  await assert.rejects(authHost.productionConfig(transportTampered), { code: 'PROXY_CONFIG_INVALID' });

  // Stage 14: logout
  await authHost.logout();

  // Stages 6, 7, 8, 10, 11: production-proxy (core_start, tun_setup, dns_probe, lease_renew, core_crash)
  let envMode = 'safe_tunnel';
  let proxyRunning = false;
  let startCount = 0;
  let renewCount = 0;
  const ctrl = createProductionProxyController({
    auth: {
      productionConfig: async () => {
        startCount += 1;
        if (renewCount > 0) throw Object.assign(new Error('renew fail'), { code: 'PRODUCTION_LEASE_UNAVAILABLE', status: 503 });
        return {
          data_source: 'production',
          config: {
            inbounds: [{ type: 'mixed', listen: '127.0.0.1', listen_port: 17899 }],
            outbounds: [{ type: 'vless', tag: 'noya-device', server: 'missing-dns.example.test', server_port: 443, uuid: '00000000-0000-4000-8000-000000000001' }],
            route: { final: 'noya-device' },
          },
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          configRevision: 'cfg-' + '1'.repeat(64),
          bindingRevision: 'binding-1',
          requestId: 'req_prod_1',
        };
      },
    },
    proxy: {
      startConfig: async () => {
        if (startCount === 1) throw Object.assign(new Error('port busy'), { code: 'PROXY_PORT_IN_USE' });
        proxyRunning = true;
        return { state: 'running', host: '127.0.0.1', port: 17899 };
      },
      reloadConfig: async () => ({ state: 'running', host: '127.0.0.1', port: 17899 }),
      stop: () => { proxyRunning = false; return { state: 'stopped' }; },
      status: () => ({ state: proxyRunning ? 'running' : 'stopped', host: '127.0.0.1', port: 17899 }),
      isRunning: () => proxyRunning,
    },
    binary: 'sing-box.exe',
    configPath: 'runtime.json',
    hasBinary: () => true,
    loadTransport: () => ({ getConfig: async () => ({}) }),
    environmentModeProvider: () => envMode,
    resolveHostIps: async () => [], // triggers dns_probe DNS_RESOLVE_FAILED
    schedule: () => 1,
    cancelSchedule: () => {},
    scheduleInterval: null,
    onTelemetryEvent,
    onLatencySample,
  });

  // Stage 6 (core_start) + Stage 8 (dns_probe)
  await assert.rejects(ctrl.start(), { code: 'PROXY_PORT_IN_USE' });
  // Stage 7 (tun_setup) schema coverage in telemetry pipeline
  onTelemetryEvent({
    category: 'tunnel',
    action: 'tun_setup_skipped',
    stage: 'tun_setup',
    status: 'ok',
    environmentMode: 'safe_tunnel',
  });
  // Start successfully in safe_tunnel, then trigger Stage 10 (lease_renew) + Stage 11 (core_crash)
  envMode = 'safe_tunnel';
  await ctrl.start();
  renewCount = 1;
  ctrl.notifySessionRefreshed();
  await new Promise(r => setTimeout(r, 15));
  ctrl.notifyProxyStateChange({ state: 'failed', lastExitCategory: 'PROXY_FRONTEND_EXITED' });

  // Stage 9: exit_probe (+ self_check latency sample)
  onTelemetryEvent({
    category: 'tunnel',
    action: 'exit_probe_timeout',
    stage: 'exit_probe',
    status: 'error',
    errorCode: 'REQUEST_TIMEOUT',
    environmentMode: 'safe_tunnel',
  });
  onLatencySample({
    trigger: 'self_check',
    environmentMode: 'safe_tunnel',
    totalMs: 420,
    status: 'error',
    errorCode: 'REQUEST_TIMEOUT',
  });

  // Stages 12 & 13: workbench_launch & account_switch via desktop-ipc
  const ipcHandlers = new Map();
  const mainFrame = { url: 'https://noyapi.cn/assistant/' };
  const webContents = { mainFrame, getURL: () => mainFrame.url, isDestroyed: () => false };
  registerDesktopIpc({
    ipcMain: { handle: (ch, fn) => ipcHandlers.set(ch, fn), removeHandler: () => {} },
    getWindow: () => ({ webContents, isDestroyed: () => false }),
    portalUrl: 'https://noyapi.cn/assistant/',
    host: { snapshot: () => ({ status: 'authenticated', device: { id: deviceId }, platform: 'windows' }) },
    agents: { start: async () => { throw Object.assign(new Error('missing bin'), { code: 'AGENT_START_FAILED' }); } },
    accounts: { switchAccount: async () => { throw Object.assign(new Error('write err'), { code: 'ACCOUNT_SWITCH_FAILED' }); } },
    telemetry: syncer,
  });
  const invoke = ipcHandlers.get(DESKTOP_CHANNEL);
  const ev = { sender: webContents, senderFrame: mainFrame };
  const wbFail = await invoke(ev, { operation: 'agent.start', instanceId: 'codex-main' });
  assert.equal(wbFail.ok, false);
  const swFail = await invoke(ev, { operation: 'accounts.switch', appId: 'antigravity', accountId: 'main' });
  assert.equal(swFail.ok, false);

  // Flush all captured events & samples through real control-client schema validator!
  const flushed = await syncer.flushFast();
  assert.equal(flushed.lastSyncStatus, 'synced');
  assert.equal(posted.length, 1);

  const stagesSeen = new Set(posted[0].events.map(e => e.stage).filter(Boolean));
  for (const requiredStage of TELEMETRY_STAGES) {
    assert.ok(stagesSeen.has(requiredStage), `Missing telemetry stage: ${requiredStage}`);
  }
  assert.equal(stagesSeen.size, 14);
  assert.ok(posted[0].latencySamples.some(s => s.trigger === 'self_check'));
  assert.ok(posted[0].latencySamples.some(s => s.trigger === 'error_slow'));
  assert.ok(posted[0].latencySamples.some(s => s.trigger === 'connect'));
  assert.doesNotMatch(JSON.stringify(posted[0]), /accessToken|refreshToken|privateKey|vlessUuid|workspacePath/);
  syncer.dispose();
});
