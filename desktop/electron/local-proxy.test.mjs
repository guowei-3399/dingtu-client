import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalProxySupervisor,
  validateLaunchOptions,
  validateTunnelConfig,
  classifySingBoxStderr,
} from './local-proxy.mjs';

function fakeChild() {
  const listeners = new Map();
  const emit = (event, ...args) => {
    const set = listeners.get(event);
    if (!set || set.size === 0) return;
    const handlers = [...set];
    set.clear();
    for (const handler of handlers) handler(...args);
  };
  return {
    once(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
    },
    kill() { emit('exit', 0, null); },
    emit,
  };
}

test('local proxy launch waits for loopback 17899 and never uses a shell', async () => {
  let received;
  const child = fakeChild();
  let markListening;
  const readiness = new Promise(resolve => { markListening = resolve; });
  const supervisor = createLocalProxySupervisor({
    probePort: () => readiness,
    spawn: (binary, args, options) => { received = { binary, args, options }; return child; },
  });
  const status = supervisor.start({ binary: 'sing-box', args: ['run', '-c', 'config.json'], host: '127.0.0.1', port: 17899 });
  assert.equal(status.port, 17899);
  assert.equal(received.options.shell, false);
  assert.deepEqual(received.args, ['run', '-c', 'config.json']);
  child.emit('spawn');
  assert.equal(supervisor.status().state, 'starting');
  markListening(true);
  await readiness;
  assert.equal(supervisor.status().state, 'running');
  supervisor.stop();
  assert.equal(supervisor.status().state, 'stopped');
});

test('proxy refuses 7890, legacy 7899, external bind and malformed process input', () => {
  for (const options of [
    { binary: 'sing-box', args: [], host: '127.0.0.1', port: 7890 },
    { binary: 'sing-box', args: [], host: '127.0.0.1', port: 7899 },
    { binary: 'sing-box', args: [], host: '0.0.0.0', port: 17899 },
    { binary: 'sing-box', args: ['run\n'], host: '127.0.0.1', port: 17899 },
  ]) assert.throws(() => validateLaunchOptions(options), error => ['PROXY_PORT_LOCKED', 'PROXY_CONFIG_INVALID'].includes(error.code));
});

test('supervisor does not start two processes or expose a fake running state after spawn failure', () => {
  const supervisor = createLocalProxySupervisor({ spawn: () => { throw new Error('missing binary'); } });
  assert.throws(() => supervisor.start({ binary: 'missing', args: [], host: '127.0.0.1', port: 17899 }));
  assert.equal(supervisor.status().state, 'stopped');
});

test('server config is restricted to the fixed local inbound and is never returned through the supervisor', async () => {
  const writes = []; const child = fakeChild();
  const supervisor = createLocalProxySupervisor({ spawn: () => child, checkPort: async () => {}, fs: { writeFile: async (...args) => writes.push(args), unlink: async () => {} } });
  const config = { inbounds: [{ type: 'mixed', listen: '127.0.0.1', listen_port: 17899 }], outbounds: [{ type: 'direct' }] };
  const result = await supervisor.startConfig({ binary: 'sing-box', config, configPath: 'runtime.json' });
  assert.equal(result.port, 17899); assert.equal(writes.length, 1); assert.equal(JSON.parse(writes[0][1]).inbounds[0].listen_port, 17899);
  assert.throws(() => validateTunnelConfig({ inbounds: [{ listen: '0.0.0.0', listen_port: 17899 }], outbounds: [{}] }), error => error.code === 'PROXY_PORT_LOCKED');
  assert.throws(() => validateTunnelConfig({ inbounds: [{ listen: '127.0.0.1', listen_port: 7899 }], outbounds: [{}] }), error => error.code === 'PROXY_PORT_LOCKED');
  supervisor.stop();
});


test('signed configuration expiry stops local forwarding',async()=>{
  const child=fakeChild();
  let expire;
  const supervisor=createLocalProxySupervisor({spawn:()=>child,checkPort:async()=>{},probePort:async()=>true,now:()=>1000,
    schedule:callback=>{expire=callback;return 1;},cancelSchedule:()=>{},
    fs:{writeFile:async()=>{},unlink:async()=>{}}});
  const config={inbounds:[{type:'mixed',listen:'127.0.0.1',listen_port:17899}],outbounds:[{type:'block'}]};
  await supervisor.startConfig({binary:'sing-box',config,configPath:'runtime.json',expiresAt:new Date(2000).toISOString()});
  child.emit('spawn');
  await Promise.resolve();
  assert.equal(supervisor.status().state,'running');
  assert.equal(typeof expire,'function');
  expire();
  assert.equal(supervisor.status().state,'stopped');
});

test('stop during configuration write prevents a delayed process start',async()=>{
  let release;
  let entered;
  const gate=new Promise(resolve=>{release=resolve});
  const writing=new Promise(resolve=>{entered=resolve});
  let spawned=0;
  const supervisor=createLocalProxySupervisor({spawn:()=>{spawned++;return fakeChild()},checkPort:async()=>{},
    fs:{writeFile:async()=>{entered();await gate;},unlink:async()=>{}}});
  const config={inbounds:[{type:'mixed',listen:'127.0.0.1',listen_port:17899}],outbounds:[{type:'block'}]};
  const pending=supervisor.startConfig({binary:'sing-box',config,configPath:'runtime.json'});
  const rejected=assert.rejects(pending,{code:'PROXY_START_CANCELLED'});
  await writing;
  supervisor.stop();
  release();
  await rejected;
  assert.equal(spawned,0);
});

test('port conflict is reported before writing configuration or spawning a child', async () => {
  const supervisor = createLocalProxySupervisor({
    checkPort: async () => { throw Object.assign(new Error('busy'), { code: 'PROXY_PORT_IN_USE' }); },
    spawn: () => assert.fail('started with an occupied port'),
    fs: { writeFile: async () => assert.fail('wrote configuration with an occupied port') },
  });
  const config = { inbounds: [{ type: 'mixed', listen: '127.0.0.1', listen_port: 17899 }], outbounds: [{ type: 'block' }] };
  await assert.rejects(supervisor.startConfig({ binary: 'sing-box', config, configPath: 'runtime.json' }), { code: 'PROXY_PORT_IN_USE' });
  assert.equal(supervisor.status().state, 'stopped');
});

test('cancelling startup prevents a late readiness result from re-enabling the proxy', async () => {
  const child = fakeChild();
  let markListening;
  const readiness = new Promise(resolve => { markListening = resolve; });
  const supervisor = createLocalProxySupervisor({ spawn: () => child, probePort: () => readiness });
  supervisor.start({ binary: 'sing-box', args: [], host: '127.0.0.1', port: 17899 });
  child.emit('spawn');
  supervisor.stop();
  markListening(true);
  await readiness;
  assert.equal(supervisor.status().state, 'stopped');
});

test('v1.17 startConfig and reloadConfig accept 10m expiry, hot-swap without state flicker, and fail closed on reload failure', async () => {
  const children = [];
  const stateTransitions = [];
  const writes = [];
  const unlinks = [];
  const scheduled = [];
  const cancelled = [];
  let currentTime = 10_000;
  let probeReady = true;
  let failSpawn = false;
  let timerSeq = 0;

  const supervisor = createLocalProxySupervisor({
    now: () => currentTime,
    checkPort: async () => {},
    probePort: async () => probeReady,
    onStateChange: snap => stateTransitions.push(snap.state),
    schedule: (fn, delay) => { const id = ++timerSeq; scheduled.push({ id, fn, delay }); return id; },
    cancelSchedule: id => cancelled.push(id),
    fs: {
      writeFile: async (...args) => writes.push(args),
      unlink: async target => unlinks.push(target),
    },
    spawn: () => {
      if (failSpawn) throw new Error('spawn failed');
      const c = fakeChild();
      children.push(c);
      return c;
    },
  });

  const cfg1 = { inbounds: [{ type: 'mixed', listen: '127.0.0.1', listen_port: 17899 }], outbounds: [{ type: 'block', tag: 'b1' }] };
  const cfg2 = { inbounds: [{ type: 'mixed', listen: '127.0.0.1', listen_port: 17899 }], outbounds: [{ type: 'block', tag: 'b2' }] };

  // > 11 minutes rejected
  await assert.rejects(
    supervisor.startConfig({ binary: 'sing-box', config: cfg1, configPath: 'runtime.json', expiresAt: new Date(currentTime + 660_001).toISOString() }),
    { code: 'PROXY_CONFIG_INVALID' },
  );

  // 10-minute initial start accepted
  await supervisor.startConfig({ binary: 'sing-box', config: cfg1, configPath: 'runtime.json', expiresAt: new Date(currentTime + 600_000).toISOString() });
  children[0].emit('spawn');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(supervisor.status().state, 'running');
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 600_000);
  stateTransitions.length = 0;

  // Advance 510s and hot-reload with a new 10m config: status().state stays 'running' with zero non-running transitions
  currentTime += 510_000;
  let observedDuringWrite = null;
  writes.length = 0;
  const origWrite = supervisor;
  assert.ok(origWrite);
  const reloadResult = await supervisor.reloadConfig({
    binary: 'sing-box',
    config: cfg2,
    configPath: 'runtime.json',
    expiresAt: new Date(currentTime + 600_000).toISOString(),
  });
  observedDuringWrite = supervisor.status().state;
  assert.equal(observedDuringWrite, 'running');
  assert.equal(reloadResult.state, 'running');
  assert.equal(supervisor.isRunning(), true);
  assert.deepEqual(stateTransitions, []);
  assert.equal(cancelled.includes(1), true);
  assert.equal(scheduled.at(-1).delay, 600_000);
  assert.equal(unlinks.length, 0);
  assert.equal(JSON.parse(writes[0][1]).outbounds[0].tag, 'b2');

  // Reload failure (replacement process fails to listen) transitions immediately to failed and cleans up config
  probeReady = false;
  await assert.rejects(
    supervisor.reloadConfig({
      binary: 'sing-box',
      config: cfg2,
      configPath: 'runtime.json',
      expiresAt: new Date(currentTime + 600_000).toISOString(),
      listenTimeoutMs: 80,
    }),
    { code: 'PROXY_START_FAILED' },
  );
  assert.equal(supervisor.status().state, 'failed');
  assert.equal(supervisor.status().lastExit, 'listen_timeout');
  assert.equal(supervisor.isRunning(), false);
  assert.equal(stateTransitions.includes('failed'), true);
  assert.equal(unlinks.includes('runtime.json'), true);
});

test('validateTunnelConfig unconditionally rejects tun/redirect/tproxy and stopAndWait awaits exit', async () => {
  const safeCfg = {
    inbounds: [{ type: 'mixed', listen: '127.0.0.1', listen_port: 17899 }],
    outbounds: [{
      type: 'vless',
      tag: 'noya-device',
      server: '203.0.113.10',
      server_port: 28443,
      uuid: '11111111-1111-4111-8111-111111111111',
      tls: { enabled: true, server_name: 'edge.noyapi.cn' },
    }],
    route: { final: 'noya-device' },
  };
  const tunCfg = {
    inbounds: [{ type: 'tun', interface_name: 'dingtu-tun0' }],
    outbounds: safeCfg.outbounds,
    route: safeCfg.route,
  };

  assert.throws(() => validateTunnelConfig(tunCfg), { code: 'PROXY_CONFIG_INVALID' });
  assert.throws(() => validateTunnelConfig(tunCfg, { allowControlledTun: true }), { code: 'PROXY_CONFIG_INVALID' });
  assert.throws(() => validateTunnelConfig({ inbounds: [{ type: 'redirect' }], outbounds: safeCfg.outbounds }), { code: 'PROXY_CONFIG_INVALID' });
  assert.throws(() => validateTunnelConfig({ inbounds: [{ type: 'tproxy' }], outbounds: safeCfg.outbounds }), { code: 'PROXY_CONFIG_INVALID' });

  const checked = validateTunnelConfig(safeCfg);
  assert.equal(checked.inbounds[0].listen_port, 17899);

  // stopAndWait resolves cleanly after async exit
  const listeners = new Map();
  let delayedChildKilled = false;
  const asyncChild = {
    once(event, handler) { listeners.set(event, handler); },
    kill() {
      delayedChildKilled = true;
      setTimeout(() => listeners.get('exit')?.(0, null), 30);
    },
  };
  const supervisor = createLocalProxySupervisor({
    spawn: () => {
      queueMicrotask(() => listeners.get('spawn')?.());
      return asyncChild;
    },
    checkPort: async () => {},
    probePort: async () => true,
    fs: { writeFile: async () => {}, unlink: async () => {} },
  });
  const started = await supervisor.startConfig({ binary: 'sing-box', config: safeCfg, configPath: 'safe.json' });
  assert.ok(['starting', 'running'].includes(started.state));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(supervisor.status().state, 'running');

  const stopped = await supervisor.stopAndWait(1000);
  assert.equal(delayedChildKilled, true);
  assert.equal(stopped.state, 'stopped');
  assert.equal(supervisor.isRunning(), false);
});

test('classifySingBoxStderr maps crash diagnostics to allowlisted enums cleanly', () => {
  assert.equal(classifySingBoxStderr('listen tcp 127.0.0.1:17899: bind: Only one usage of each socket address'), 'PROXY_PORT_IN_USE');
  assert.equal(classifySingBoxStderr('start dns/udp[noya-local-dns]: failed'), 'PROXY_DNS_ERROR');
  assert.equal(classifySingBoxStderr('bind socket: Access is denied.'), 'PROXY_ACCESS_DENIED');
  assert.equal(classifySingBoxStderr('unknown opaque crash text 1.2.3.4'), 'PROXY_FRONTEND_EXITED');
});
