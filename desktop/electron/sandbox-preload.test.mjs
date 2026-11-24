import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as contract from './runtime-contract.mjs';

const packageJson = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const preloads = packageJson.build.files.filter(file => /^preload\.(?:cjs|mjs)$/.test(file));
assert.equal(preloads.length, 1, 'the package must contain exactly one preload entry point');
const preloadSource = await readFile(new URL(preloads[0], import.meta.url), 'utf8');
const configPrefix = '--noya-desktop-config=';
const config = () => ({
  version: 1,
  platform: 'linux',
  apiBase: 'https://control.example.test/api/v1',
  localProxy: { host: '127.0.0.1', port: 17899, http: 'http://127.0.0.1:17899', socks5: 'socks5://127.0.0.1:17899' },
});
const argument = value => configPrefix + encodeURIComponent(JSON.stringify(value));

// Execute the packaged artifact as Electron does in a sandbox: plain JS, a
// restricted require, and no Node built-ins, Buffer, environment, or local imports.
function executePreload(argv) {
  const exposed = new Map();
  const sandboxProcess = Object.freeze(Object.defineProperty({ argv: Object.freeze([...argv]) }, 'env', {
    get() { throw new Error('preload must not read process.env'); },
  }));
  vm.runInNewContext(preloadSource, {
    URL,
    process: sandboxProcess,
    require(name) {
      assert.equal(name, 'electron', `sandbox cannot load ${name}`);
      return { contextBridge: { exposeInMainWorld(key, value) {
        assert.equal(exposed.has(key), false, 'a bridge may only be exposed once');
        exposed.set(key, value);
      } }, ipcRenderer: { invoke: async () => ({ ok: true }) } };
    },
  }, { filename: preloads[0], timeout: 1000 });
  return exposed;
}

test('packaged preload executes in the restricted sandbox and exposes only immutable public desktop data', async () => {
  const exposed = executePreload(['electron', '--unrelated=value', argument(config())]);
  assert.deepEqual([...exposed.keys()], ['NoyaDesktop']);
  const api = exposed.get('NoyaDesktop');
  assert.deepEqual(JSON.parse(JSON.stringify(api)), {
    isDesktop: true,
    platform: 'linux',
    apiBase: 'https://control.example.test/api/v1',
    localProxy: { host: '127.0.0.1', port: 17899, http: 'http://127.0.0.1:17899', socks5: 'socks5://127.0.0.1:17899' },
    auth: { mode: 'browser-pkce' },
    proxy: {},
    agent: {},
    accounts: {},
    telemetry: {},
    tickets: {},
    browser: {},
  });
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.localProxy), true);
  assert.equal(Object.isFrozen(api.auth), true);
  assert.equal(Object.isFrozen(api.accounts), true);
  assert.equal(Object.isFrozen(api.telemetry), true);
  assert.equal(Object.isFrozen(api.tickets), true);
  assert.equal(Object.isFrozen(api.browser), true);
  for (const op of [
    'accounts.list', 'accounts.importLocal', 'accounts.add', 'accounts.switch', 'accounts.refreshQuota', 'accounts.remove', 'accounts.detectAll',
    'accounts.oauthStart', 'accounts.oauthStatus', 'accounts.oauthSubmitCallback', 'accounts.oauthCancel',
    'accounts.importToken', 'accounts.importJson', 'accounts.exportJson', 'accounts.updateMeta', 'accounts.batchRemove',
    'accounts.totpCompute', 'accounts.totpList', 'accounts.totpSave', 'accounts.totpRemove', 'accounts.totpImport', 'accounts.totpExport',
  ]) {
    const res = await api.accounts.invoke(op, {});
    assert.equal(res.ok, true, `Expected ${op} to pass preload allowlist`);
  }
  assert.throws(() => api.accounts.invoke('accounts.exec'));
  assert.throws(()=>api.browser.open('https://evil.test','browser-1'));
  assert.throws(()=>api.browser.open('claude','../escape'));
  assert.throws(() => { api.localProxy.port = 7890; }, { name: 'TypeError' });
  assert.throws(() => { api.apiBase = 'https://evil.example.test'; }, { name: 'TypeError' });
});

test('preload rejects absent, duplicate, and malformed configuration rather than exposing a partial bridge', () => {
  const invalidArguments = [
    [],
    [argument(config()), argument(config())],
    [configPrefix + '%'],
    [configPrefix + encodeURIComponent('null')],
    [configPrefix + encodeURIComponent('[]')],
    [configPrefix + 'x'.repeat(16385)],
  ];
  for (const argv of invalidArguments) {
    assert.throws(() => executePreload(argv), /Invalid Noya desktop configuration/);
  }
});

test('preload rejects unexpected fields, unsafe API URLs, and inconsistent proxy endpoints', () => {
  const invalidConfigs = [
    { ...config(), accessToken: 'must-not-leak' },
    { ...config(), version: 2 },
    { ...config(), platform: 'android' },
    ...['javascript:alert(1)', 'https://user:password@control.example.test', 'https://control.example.test?token=secret', 'https://control.example.test/#token'].map(apiBase => ({ ...config(), apiBase })),
    { ...config(), localProxy: { ...config().localProxy, host: '0.0.0.0' } },
    { ...config(), localProxy: { ...config().localProxy, port: '17899' } },
    { ...config(), localProxy: { ...config().localProxy, http: 'http://evil.example.test:17899' } },
    { ...config(), localProxy: { ...config().localProxy, socks5: 'socks5://127.0.0.1:7890' } },
    { ...config(), localProxy: { ...config().localProxy, password: 'must-not-leak' } },
  ];
  for (const value of invalidConfigs) {
    assert.throws(() => executePreload([argument(value)]), /Invalid Noya desktop configuration/);
  }
});

test('main-owned preload arguments normalize configuration and discard unrelated secret input', () => {
  assert.equal(typeof contract.buildPreloadArguments, 'function');
  const args = contract.buildPreloadArguments({
    platform: 'win32', apiBase: '  https://NOYAPI.CN/api/v1/  ', production: true,
    localProxyPort: '17899', accessToken: 'secret-token', localProxy: { port: 7890 },
  });
  assert.equal(args.length, 1);
  const value = JSON.parse(decodeURIComponent(args[0].slice(configPrefix.length)));
  assert.deepEqual(value, {
    version: 1,
    platform: 'windows',
    apiBase: 'https://noyapi.cn/api/v1',
    localProxy: { host: '127.0.0.1', port: 17899, http: 'http://127.0.0.1:17899', socks5: 'socks5://127.0.0.1:17899' },
  });
  assert.equal(Object.isFrozen(args), true);
  const api = executePreload(args).get('NoyaDesktop');
  assert.equal(api.platform, 'windows');
  assert.equal(api.localProxy.port, 17899);
});

test('main rejects proxy overrides, unsupported platforms, insecure production, and credential-bearing API bases', () => {
  assert.equal(typeof contract.buildPreloadArguments, 'function');
  for (const options of [
    { localProxyPort: 7890 },
    { localProxyPort: 7899 },
    { platform: 'freebsd' },
    { platform: 'toString' },
    { platform: '__proto__' },
    { platform: 'constructor' },
    { apiBase: 'http://control.example.test', production: true },
    { apiBase: 'https://user:pass@control.example.test' },
    { apiBase: 'https://control.example.test?token=secret' },
    { apiBase: 'https://control.example.test/#token' },
    { apiBase: 'file:///etc/passwd' },
  ]) {
    assert.throws(() => contract.buildPreloadArguments({ platform: 'linux', ...options }));
  }
});

test('main configuration and the real preload support every desktop platform and a same-origin development API', () => {
  assert.equal(typeof contract.buildPreloadArguments, 'function');
  for (const [platform, expected] of [['win32', 'windows'], ['darwin', 'macos'], ['linux', 'linux']]) {
    const api = executePreload(contract.buildPreloadArguments({ platform })).get('NoyaDesktop');
    assert.equal(api.platform, expected);
    assert.equal(api.apiBase, '');
  }
  const api = executePreload(contract.buildPreloadArguments({ platform: 'linux', apiBase: 'http://127.0.0.1:4174/' })).get('NoyaDesktop');
  assert.equal(api.apiBase, 'http://127.0.0.1:4174');

  // New v2 accounts ops are all allowlisted in preload.cjs
  for (const op of ['accounts.usageScan', 'accounts.usageSetDir', 'accounts.groupsList', 'accounts.groupsSave', 'accounts.groupsAssign', 'accounts.wakeupList', 'accounts.wakeupSave', 'accounts.settingsUpdate', 'accounts.totpMigrationPayload', 'accounts.oauthCopyUrl']) {
    assert.doesNotThrow(() => api.accounts.invoke(op, { appId: 'antigravity', flowId: 'abcdef123456' }).catch(() => null));
  }
  for (const op of ['telemetry.status', 'telemetry.sync']) {
    assert.doesNotThrow(() => api.telemetry.invoke(op, {}).catch(() => null));
  }
  assert.throws(() => api.telemetry.invoke('telemetry.evil', {}));
  for (const op of ['tickets.list', 'tickets.create', 'tickets.detail', 'tickets.reply']) {
    assert.doesNotThrow(() => api.tickets.invoke(op, {}).catch(() => null));
  }
  assert.throws(() => api.tickets.invoke('tickets.delete', {}));
  assert.doesNotThrow(() => api.agent.invoke('agent.closeApp', { appId: 'codex' }).catch(() => null));
  assert.doesNotThrow(() => api.agent.invoke('agent.isRunning', { appId: 'antigravity' }).catch(() => null));
  assert.equal(api.browser.fingerprintCheck, undefined);
  for (const proxyOp of ['proxy.environment', 'proxy.mode.set']) {
    assert.doesNotThrow(() => api.proxy.invoke(proxyOp, {}).catch(() => null));
  }
  for (const removedOp of ['proxy.elevation.status', 'proxy.tun.relaunchElevated', 'proxy.exec']) {
    assert.throws(() => api.proxy.invoke(removedOp, {}));
  }
  assert.equal(typeof api.accounts.onUpdated, 'function');
  assert.equal(typeof api.accounts.onUpdated(() => {}), 'function');
});
