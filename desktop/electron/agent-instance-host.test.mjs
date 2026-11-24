import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentInstanceHost } from './agent-instance-host.mjs';

function child() { const listeners = {}; return { pid: 77, once(event, fn) { listeners[event] = fn; }, emit(event, ...args) { listeners[event]?.(...args); } }; }

test('a stopping instance cannot be restarted or removed before its process exits', () => {
  const process = child(); process.kill = () => true;
  let launches = 0;
  const host = createAgentInstanceHost({ platform: 'linux', launcher: { plan: () => ({}), launch: () => { launches++; return process; } }, isAuthenticated: () => true, isProxyReady: () => true });
  host.create({ alias: 'cc1', appId: 'claude-code' });
  host.start('cc1'); process.emit('spawn');
  assert.equal(host.stop('cc1').status, 'stopping');
  assert.throws(() => host.start('cc1'), { code: 'AGENT_ALREADY_RUNNING' });
  assert.throws(() => host.remove('cc1'), { code: 'AGENT_ACTIVE' });
  assert.equal(launches, 1);
  process.emit('exit', 0, null);
  assert.equal(host.remove('cc1'), true);
});

test('instance host creates named profiles and starts only by alias after auth and proxy checks', () => {
  const processes = []; const launcher = { plan: app => ({ appId: app.id, adapter: app.template.adapter, activation: 'immediate', command: app.template.launch.argv[0], args: [], envKeys: ['HTTP_PROXY'] }), launch: app => { const p = child(); processes.push({ app, p }); return p; } };
  const host = createAgentInstanceHost({ platform: 'linux', launcher, isAuthenticated: () => true, isProxyReady: () => true });
  assert.deepEqual(host.list(), []);
  const profile = host.create({ alias: 'cc1', appId: 'claude-code', credentialSlotIds: [] });
  assert.equal(profile.id, 'cc1');
  assert.throws(() => host.start('unknown'), { code: 'AGENT_INSTANCE_NOT_FOUND' });
  const started = host.start('cc1');
  assert.deepEqual(started, { id: 'cc1', appId: 'claude-code', status: 'starting', activation: 'immediate', pid: 77, error: null });
  assert.equal(processes.length, 1);
  processes[0].p.emit('spawn'); assert.equal(host.status('cc1').status, 'running');
  assert.throws(() => host.start('cc1'), { code: 'AGENT_ALREADY_RUNNING' });
});

test('instance host inspects the selected app before creating an instance', async () => {
  const launcher = {
    plan: app => ({ appId: app.id, adapter: app.template.adapter, activation: 'immediate', command: app.template.launch.argv[0] }),
    detect: async () => ({ status: 'installed', path: 'C:\\Apps\\Claude\\claude.exe', command: 'claude' }),
    launch: () => child(),
  };
  const host = createAgentInstanceHost({ platform: 'windows', launcher, isAuthenticated: () => false, isProxyReady: () => false });
  const result = await host.inspect('claude-code');
  assert.deepEqual(result, { appId: 'claude-code', status: 'installed', activation: 'immediate', path: 'C:\\Apps\\Claude\\claude.exe', command: 'claude' });
});

test('instance host refuses launch without auth or local proxy and never accepts caller command data', () => {
  const launcher = { plan: () => ({}), launch: () => { throw new Error('must not launch'); } };
  const unauthenticated = createAgentInstanceHost({ platform: 'linux', launcher, isAuthenticated: () => false, isProxyReady: () => true });
  unauthenticated.create({ alias: 'cc1', appId: 'claude-code' });
  assert.throws(() => unauthenticated.start('cc1'), { code: 'AUTH_REQUIRED' });
  const noProxy = createAgentInstanceHost({ platform: 'linux', launcher, isAuthenticated: () => true, isProxyReady: () => false });
  noProxy.create({ alias: 'cc1', appId: 'claude-code' });
  assert.throws(() => noProxy.start('cc1'), { code: 'LOCAL_PROXY_NOT_READY' });
  assert.throws(() => noProxy.create({ alias: 'cc2', appId: 'claude-code', command: 'powershell', path: 'C:\\evil' }), { code: 'PROFILE_INPUT_NOT_ALLOWED' });
});

test('default main instance launches with native profile while secondary enterprise instances isolate user-data-dir', () => {
  const launched = [];
  const launcher = {
    plan: app => ({ appId: app.id, adapter: app.template.adapter, activation: 'restart-required', command: app.template.launch.argv[0], args: [], envKeys: ['HTTP_PROXY'] }),
    launch: () => { throw new Error('expected launchWithSafeContext'); },
    launchWithSafeContext: (app, augmentation) => {
      launched.push({ appId: app.id, augmentation });
      const p = child();
      p.kill = () => true;
      return p;
    },
  };
  const host = createAgentInstanceHost({
    platform: 'windows',
    launcher,
    isAuthenticated: () => true,
    isProxyReady: () => true,
    scopeProvider: () => 'device-scope-abc',
    profileRootDir: 'C:\\Users\\Demo\\AppData\\Roaming\\dingtu',
  });
  host.create({ alias: 'main', appId: 'antigravity', credentialSlotIds: [] });
  host.start('main');
  host.create({ alias: 'cursor-2', appId: 'cursor', credentialSlotIds: [] });
  host.start('cursor-2');

  assert.equal(launched.length, 2);
  assert.equal(launched[0].appId, 'antigravity');
  assert.equal(launched[0].augmentation.envPatch.NO_PROXY, '127.0.0.1,localhost,::1');
  assert.equal(launched[0].augmentation.envPatch.no_proxy, '127.0.0.1,localhost,::1');
  assert.equal(launched[0].augmentation.extraArgs.some(a => a.startsWith('--user-data-dir=')), false);
  assert.equal(launched[0].augmentation.extraArgs.includes('--proxy-server=http://127.0.0.1:17899'), true);

  assert.equal(launched[1].appId, 'cursor');
  assert.equal(launched[1].augmentation.extraArgs.some(a => a.startsWith('--user-data-dir=') && a.includes('workbench-profiles')), true);

  host.create({ alias: 'codex-desktop-main', appId: 'codex-desktop', credentialSlotIds: [] });
  host.start('codex-desktop-main');
  assert.equal(launched[2].appId, 'codex-desktop');
  assert.equal(launched[2].augmentation.extraArgs.some(a => a.startsWith('--user-data-dir=')), false);
  const stopped = host.stopAllForApp('codex');
  assert.equal(stopped.length, 1);
  assert.equal(stopped[0].status, 'stopping');
});

test('shellActivated MSIX launches allow re-activation cleanly without spurious AGENT_ALREADY_RUNNING', () => {
  let launchCount = 0;
  const host = createAgentInstanceHost({
    platform: 'windows',
    isAuthenticated: () => true,
    isProxyReady: () => true,
    launcher: {
      plan: app => ({ appId: app.id, adapter: app.template.adapter, activation: 'restart-required', command: app.template.launch.argv[0] }),
      launch: () => child(),
      launchWithSafeContext: () => {
        launchCount += 1;
        const p = child();
        p.spawnfile = 'explorer.exe';
        p.dingtuShellActivated = true;
        return p;
      },
    },
  });
  host.create({ alias: 'codex-desktop-main', appId: 'codex-desktop', credentialSlotIds: [] });
  const first = host.start('codex-desktop-main');
  assert.equal(first.status, 'starting');
  const second = host.start('codex-desktop-main');
  assert.equal(second.status, 'starting');
  assert.equal(launchCount, 2);
  const stopped = host.stop('codex-desktop-main');
  assert.equal(stopped.status, 'stopped');
});

test('forceClearApp resets stuck stopping records after OS process termination so relaunch succeeds on first click', () => {
  const proc = child();
  proc.kill = () => true;
  let launches = 0;
  const host = createAgentInstanceHost({
    platform: 'windows',
    isAuthenticated: () => true,
    isProxyReady: () => true,
    launcher: {
      plan: app => ({ appId: app.id, adapter: app.template.adapter, activation: 'restart-required', command: app.template.launch.argv[0] }),
      launch: () => { launches += 1; return proc; },
    },
  });
  host.create({ alias: 'antigravity-main', appId: 'antigravity' });
  host.start('antigravity-main');
  proc.emit('spawn');
  assert.equal(host.stopAllForApp('antigravity')[0].status, 'stopping');
  assert.throws(() => host.start('antigravity-main'), { code: 'AGENT_ALREADY_RUNNING' });
  assert.equal(host.forceClearApp('antigravity'), 1);
  assert.equal(host.start('antigravity-main').status, 'starting');
  assert.equal(launches, 2);
});
