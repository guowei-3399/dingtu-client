import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionProxyController } from './production-proxy.mjs';
import { sanitizeAuthAudit } from './auth-audit.mjs';

function fixture(overrides = {}) {
  const calls = [];
  const envelope = { data_source: 'production', config: { inbounds: [], outbounds: [] },
    expiresAt: '2026-11-11T14:00:30.000Z', bindingRevision: 'binding-3', configRevision: 'cfg-' + 'a'.repeat(64) };
  const proxy = { isRunning: () => false, status: () => ({ state: 'stopped' }),
    startConfig: async value => { calls.push(['start', value]); return { state: 'starting' }; },
    stop: () => { calls.push(['stop']); return { state: 'stopped' }; } };
  const controller = createProductionProxyController({
    auth: { productionConfig: async () => envelope }, proxy,
    binary: 'bundled-sing-box', configPath: 'runtime.json', hasBinary: () => true,
    loadTransport: () => ({ getConfig() {} }), closeBrowsers: () => calls.push(['close']), ...overrides,
  });
  return { controller, calls, proxy, envelope };
}

test('production controller starts only the checked configuration with its signed expiry', async () => {
  const { controller, calls, envelope } = fixture();
  assert.equal((await controller.start()).state, 'starting');
  assert.deepEqual(calls, [['start', {
    binary: 'bundled-sing-box', config: envelope.config, configPath: 'runtime.json', expiresAt: envelope.expiresAt,
  }]]);
});

test('missing production trust cannot fall back to the old subscription or start a process', async () => {
  const { controller, calls } = fixture({ loadTransport: () => { throw new Error('missing trust'); } });
  await assert.rejects(controller.start(), { code: 'PROXY_CONFIG_UNAVAILABLE' });
  assert.equal(calls.some(call => call[0] === 'start'), false);
  assert.equal(calls.some(call => call[0] === 'stop'), true);
});

test('cancelled configuration response cannot start a process and does not release the pending guard early', async () => {
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const { controller, calls, envelope } = fixture({ auth: { productionConfig: () => response } });
  const pending = controller.start();
  const rejection = assert.rejects(pending, { code: 'PROXY_START_CANCELLED' });
  await Promise.resolve();
  controller.stop();
  await assert.rejects(controller.start(), { code: 'PROXY_ALREADY_RUNNING' });
  release(envelope);
  await rejection;
  assert.equal(calls.some(call => call[0] === 'start'), false);
});

test('authorization and lease refusals preserve classified errors while stopping local forwarding', async () => {
  for (const [code, status] of [['CONFIG_AUTHORIZATION_INVALID', 401], ['SESSION_INVALID', 401],
    ['SUBSCRIPTION_DISABLED', 403], ['BRIDGE_UNAVAILABLE', 503]]) {
    const { controller, calls } = fixture({ auth: { productionConfig: async () => {
      throw Object.assign(new Error('private upstream data'), { code, status, requestId: 'req_fixture' });
    } } });
    await assert.rejects(controller.start(), error => error.code === code && error.status === status
      && error.requestId === 'req_fixture' && !error.message.includes('private upstream'));
    assert.equal(calls.some(call => call[0] === 'start'), false);
    assert.equal(calls.some(call => call[0] === 'stop'), true);
  }
});

test('missing non-Windows sing-box binary and local spawn failure preserve sanitized codes in audit and errors', async () => {
  const audited = [];
  const { controller: missingKernel } = fixture({
    binary: '/Applications/定途.app/Contents/Resources/sing-box/darwin-arm64/sing-box',
    hasBinary: () => false,
    auth: { productionConfig: async () => assert.fail('must not request config when binary is missing') },
    onAudit: (event, details) => audited.push(sanitizeAuthAudit(event, details)),
  });
  await assert.rejects(
    missingKernel.start(),
    error => error.code === 'PROXY_BINARY_UNAVAILABLE' && !/Applications|darwin-arm64/.test(error.message),
  );
  assert.deepEqual(audited, [{ event: 'proxy_start_failed', code: 'PROXY_BINARY_UNAVAILABLE' }]);

  const spawnAudited = [];
  const { controller: spawnFailed } = fixture({
    proxy: {
      isRunning: () => false,
      status: () => ({ state: 'stopped' }),
      startConfig: async () => { throw Object.assign(new Error('/opt/noya/sing-box EACCES'), { code: 'PROXY_START_FAILED' }); },
      stop: () => ({ state: 'stopped' }),
    },
    onAudit: (event, details) => spawnAudited.push(sanitizeAuthAudit(event, details)),
  });
  await assert.rejects(
    spawnFailed.start(),
    error => error.code === 'PROXY_START_FAILED' && !/\/opt\/noya|EACCES/.test(error.message),
  );
  assert.equal(spawnAudited.at(-1)?.code, 'PROXY_START_FAILED');
});

test('v1.17 controller auto-renews 90s before 10m expiry via reloadConfig without browser close and pre-refreshes access token', async () => {
  let currentTime = Date.parse('2026-11-21T12:00:00Z');
  let running = false;
  let state = 'stopped';
  let configCount = 0;
  const calls = [];
  const timers = new Map();
  let timerSeq = 0;

  const controller = createProductionProxyController({
    now: () => currentTime,
    schedule: (fn, delay) => { const id = ++timerSeq; timers.set(id, { fn, delay }); return id; },
    cancelSchedule: id => { timers.delete(id); },
    binary: 'bundled-sing-box',
    configPath: 'runtime.json',
    hasBinary: () => true,
    loadTransport: () => ({ getConfig() {} }),
    closeBrowsers: () => calls.push(['closeBrowsers']),
    auth: {
      refreshIfExpiringWithin: async windowMs => { calls.push(['preRefresh', windowMs]); },
      productionConfig: async () => {
        configCount += 1;
        return {
          data_source: 'production',
          config: { round: configCount },
          expiresAt: new Date(currentTime + 600_000).toISOString(),
          bindingRevision: 'binding-5',
          configRevision: 'cfg-' + String(configCount).padStart(64, '0'),
          requestId: 'req_round_' + configCount,
        };
      },
    },
    proxy: {
      isRunning: () => running,
      status: () => ({ state, host: '127.0.0.1', port: 17899, lastExit: null }),
      startConfig: async input => {
        running = true;
        state = 'running';
        calls.push(['startConfig', input.config.round, input.expiresAt]);
        return { state };
      },
      reloadConfig: async input => {
        assert.equal(state, 'running');
        calls.push(['reloadConfig', input.config.round, input.expiresAt]);
        return { state };
      },
      stop: () => {
        running = false;
        state = 'stopped';
        calls.push(['stop']);
        return { state };
      },
    },
  });

  await controller.start();
  assert.equal(controller.status().state, 'running');
  // 10m lease schedules renewal at 510_000ms (90s before 600_000ms hard deadline)
  const scheduledDelays = [...timers.values()].map(t => t.delay).sort((a, b) => a - b);
  assert.deepEqual(scheduledDelays, [510_000, 600_000]);

  // Fire scheduled renewal at t + 510s
  currentTime += 510_000;
  const renewEntry = [...timers.entries()].find(([, v]) => v.delay === 510_000);
  timers.delete(renewEntry[0]);
  await renewEntry[1].fn();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(controller.status().state, 'running');
  assert.equal(calls.some(c => c[0] === 'closeBrowsers'), false);
  assert.equal(calls.filter(c => c[0] === 'reloadConfig').length, 1);
  assert.equal(calls.filter(c => c[0] === 'preRefresh').length, 2);

  // External access-token rotation triggers immediate out-of-band hot reload
  currentTime += 30_000;
  controller.notifySessionRefreshed();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.filter(c => c[0] === 'reloadConfig').length, 2);
  assert.equal(calls.some(c => c[0] === 'closeBrowsers'), false);
});

test('v1.17 renewal retries transient network blips before expiry and fails closed on 403/401 or hard deadline', async () => {
  let currentTime = Date.parse('2026-11-21T12:00:00Z');
  let running = false;
  let mode = 'ok';
  const calls = [];
  const timers = new Map();
  let timerSeq = 0;

  const controller = createProductionProxyController({
    now: () => currentTime,
    schedule: (fn, delay) => { const id = ++timerSeq; timers.set(id, { fn, delay }); return id; },
    cancelSchedule: id => { timers.delete(id); },
    binary: 'bundled-sing-box',
    configPath: 'runtime.json',
    hasBinary: () => true,
    loadTransport: () => ({ getConfig() {} }),
    closeBrowsers: () => calls.push(['closeBrowsers']),
    auth: {
      productionConfig: async () => {
        if (mode === 'network_blip') throw Object.assign(new Error('blip'), { code: 'NETWORK_ERROR' });
        if (mode === 'disabled') throw Object.assign(new Error('disabled'), { code: 'SUBSCRIPTION_DISABLED', status: 403 });
        return {
          data_source: 'production',
          config: { ok: true },
          expiresAt: new Date(currentTime + 30_000).toISOString(),
          bindingRevision: 'binding-5',
          configRevision: 'cfg-' + 'b'.repeat(64),
        };
      },
    },
    proxy: {
      isRunning: () => running,
      status: () => ({ state: running ? 'running' : 'stopped' }),
      startConfig: async () => { running = true; return { state: 'running' }; },
      reloadConfig: async () => { calls.push(['reloadConfig']); return { state: 'running' }; },
      stop: () => { running = false; calls.push(['stop']); return { state: 'stopped' }; },
    },
  });

  await controller.start();
  // 30s short lease schedules renewal at 21_000ms (9s remaining > 5s retry floor)
  const firstRenew = [...timers.entries()].find(([, v]) => v.delay === 21_000);
  assert.ok(firstRenew);

  // 1) Transient network blip schedules 3000ms retry without stopping proxy
  currentTime += 21_000;
  mode = 'network_blip';
  timers.delete(firstRenew[0]);
  await firstRenew[1].fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(running, true);
  assert.equal(calls.some(c => c[0] === 'stop'), false);
  const retryEntry = [...timers.entries()].find(([, v]) => v.delay === 3_000);
  assert.ok(retryEntry);

  // Retry succeeds -> reloadConfig runs
  currentTime += 3_000;
  mode = 'ok';
  timers.delete(retryEntry[0]);
  await retryEntry[1].fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.filter(c => c[0] === 'reloadConfig').length, 1);

  // 2) Fatal 403 SUBSCRIPTION_DISABLED during renewal immediately fails closed (stop + closeBrowsers)
  const nextRenew = [...timers.entries()].find(([, v]) => v.delay === 21_000);
  currentTime += 21_000;
  mode = 'disabled';
  timers.delete(nextRenew[0]);
  await nextRenew[1].fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(running, false);
  assert.equal(calls.some(c => c[0] === 'stop'), true);
  assert.equal(calls.some(c => c[0] === 'closeBrowsers'), true);
});

test('v1.17 renewal fails closed on 401 SESSION_INVALID or when transient errors approach hard deadline', async () => {
  let currentTime = Date.parse('2026-11-21T12:00:00Z');
  let running = false;
  let errorToThrow = null;
  const calls = [];
  const timers = new Map();
  let timerSeq = 0;

  const controller = createProductionProxyController({
    now: () => currentTime,
    schedule: (fn, delay) => { const id = ++timerSeq; timers.set(id, { fn, delay }); return id; },
    cancelSchedule: id => { timers.delete(id); },
    binary: 'bundled-sing-box',
    configPath: 'runtime.json',
    hasBinary: () => true,
    loadTransport: () => ({ getConfig() {} }),
    closeBrowsers: () => calls.push(['closeBrowsers']),
    auth: {
      productionConfig: async () => {
        if (errorToThrow) throw errorToThrow;
        return {
          data_source: 'production',
          config: { ok: true },
          expiresAt: new Date(currentTime + 30_000).toISOString(),
          bindingRevision: 'binding-5',
          configRevision: 'cfg-' + 'c'.repeat(64),
        };
      },
    },
    proxy: {
      isRunning: () => running,
      status: () => ({ state: running ? 'running' : 'stopped' }),
      startConfig: async () => { running = true; return { state: 'running' }; },
      reloadConfig: async () => ({ state: 'running' }),
      stop: () => { running = false; calls.push(['stop']); return { state: 'stopped' }; },
    },
  });

  // Case A: transient error with <= 5s left before hard deadline fails closed instead of retrying past deadline
  await controller.start();
  currentTime += 27_000; // only 3s left (<= 5s floor)
  errorToThrow = Object.assign(new Error('timeout'), { code: 'REQUEST_TIMEOUT' });
  const renew1 = [...timers.entries()].find(([, v]) => v.delay === 21_000);
  timers.delete(renew1[0]);
  await renew1[1].fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(running, false);
  assert.equal(calls.filter(c => c[0] === 'stop').length, 1);

  // Case B: 401 SESSION_INVALID during renewal fails closed immediately even with ample time remaining
  errorToThrow = null;
  currentTime = Date.parse('2026-11-21T12:10:00Z');
  await controller.start();
  currentTime += 510_000 - 489_000; // 21s into 30s lease (9s left)
  errorToThrow = Object.assign(new Error('session invalid'), { code: 'SESSION_INVALID', status: 401 });
  const renew2 = [...timers.entries()].find(([, v]) => v.delay === 21_000);
  timers.delete(renew2[0]);
  await renew2[1].fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(running, false);
  assert.equal(calls.filter(c => c[0] === 'stop').length, 2);
});

test('safe_tunnel hardening: starting-state deferral, wall-clock watchdog/resume, and unexpected exit cleanup', async () => {
  let currentTime = Date.parse('2026-11-23T12:00:00Z');
  let running = false;
  let proxyState = 'stopped';
  let round = 0;
  const audited = [];
  const startedConfigs = [];
  const reloadedConfigs = [];
  const timers = new Map();
  const intervals = new Map();
  let timerSeq = 0;
  let intervalSeq = 0;

  const controller = createProductionProxyController({
    now: () => currentTime,
    schedule: (fn, delay) => { const id = ++timerSeq; timers.set(id, { fn, delay }); return id; },
    cancelSchedule: id => { timers.delete(id); },
    scheduleInterval: (fn, delay) => { const id = ++intervalSeq; intervals.set(id, { fn, delay }); return id; },
    cancelInterval: id => { intervals.delete(id); },
    watchdogIntervalMs: 15_000,
    binary: 'bundled-sing-box',
    configPath: 'runtime.json',
    hasBinary: () => true,
    loadTransport: () => ({ getConfig() {} }),
    environmentModeProvider: () => 'safe_tunnel',
    controlOrigin: 'https://dingtu.noyapi.cn',
    onAudit: (event, details) => audited.push(sanitizeAuthAudit(event, details)),
    auth: {
      productionConfig: async () => {
        round += 1;
        return {
          data_source: 'production',
          config: {
            inbounds: [{ type: 'mixed', listen: '127.0.0.1', listen_port: 17899 }],
            outbounds: [{
              type: 'vless',
              tag: 'noya-device',
              server: 'edge.noyapi.cn',
              server_port: 29000 + round,
              uuid: `00000000-0000-4000-8000-00000000001${round}`,
              flow: 'xtls-rprx-vision',
              tls: { enabled: true, server_name: 'edge.noyapi.cn' },
            }],
            route: { final: 'noya-device' },
          },
          expiresAt: new Date(currentTime + 600_000).toISOString(),
          bindingRevision: 'binding-5',
          configRevision: 'cfg-' + String(round).padStart(64, '0'),
        };
      },
    },
    proxy: {
      isRunning: () => running,
      status: () => ({ state: proxyState, host: '127.0.0.1', port: 17899, lastExit: null }),
      startConfig: async input => {
        running = true;
        proxyState = 'starting';
        startedConfigs.push(input.config);
        return { state: 'starting' };
      },
      reloadConfig: async input => {
        assert.equal(proxyState, 'running', 'must never call reloadConfig while state is starting');
        reloadedConfigs.push(input.config);
        return { state: 'running' };
      },
      stop: () => { running = false; proxyState = 'stopped'; return { state: 'stopped' }; },
      stopAndWait: async () => { running = false; proxyState = 'stopped'; return { state: 'stopped' }; },
    },
  });

  await controller.start();
  assert.equal(proxyState, 'starting');
  assert.equal(startedConfigs.length, 1);

  // 1. Triggering session refresh while still starting must defer cleanly (never fatal PROXY_CONTROL_FAILED).
  controller.notifySessionRefreshed();
  await new Promise(r => setImmediate(r));
  assert.equal(running, true);
  assert.equal(reloadedConfigs.length, 0);

  // Transition to running -> deferred renewal executes immediately
  proxyState = 'running';
  controller.notifyProxyStateChange({ state: 'running' });
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  assert.equal(reloadedConfigs.length, 1);

  // 2. Simulate sleep/throttle: wall clock jumps +520s while setTimeout did NOT fire; 15s watchdog catches it!
  currentTime += 520_000;
  const watchdog = [...intervals.values()][0];
  assert.ok(watchdog, 'wall-clock watchdog interval must be armed');
  watchdog.fn();
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  assert.equal(reloadedConfigs.length, 2);

  // 3. System resume before lease expires triggers proactive renewal.
  currentTime += 120_000;
  controller.notifySystemResume({ force: true });
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  assert.equal(reloadedConfigs.length, 3);
  assert.ok(audited.some(e => e?.event === 'proxy_resume_renewal'));

  // 4. Unexpected sing-box crash clears orphaned timers immediately and logs sanitized proxy_process_exited.
  running = false;
  proxyState = 'failed';
  controller.notifyProxyStateChange({ state: 'failed', lastExit: 'code:1', lastExitCategory: 'PROXY_PORT_IN_USE' });
  assert.equal(timers.size, 0, 'all orphaned lease timers must be cleared on unexpected process exit');
  assert.equal(intervals.size, 0, 'watchdog interval must be cleared on unexpected process exit');
  assert.ok(audited.some(e => e?.event === 'proxy_process_exited' && e?.code === 'PROXY_PORT_IN_USE'));
});
