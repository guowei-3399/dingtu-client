import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_PROXY, assertLocalProxyPort, resolveControlBase, resolvePortalUrl, resolveSingBoxBinary } from './runtime-contract.mjs';

test('Noya local data plane is fixed to loopback 17899 and never 7890 or legacy 7899', () => {
  assert.deepEqual(LOCAL_PROXY, { host: '127.0.0.1', port: 17899, http: 'http://127.0.0.1:17899', socks5: 'socks5://127.0.0.1:17899' });
  assert.equal(assertLocalProxyPort(), 17899);
  assert.throws(() => assertLocalProxyPort(7890), /17899/);
  assert.throws(() => assertLocalProxyPort(7899), /17899/);
});

test('control plane is separate from the local proxy and production requires HTTPS', () => {
  assert.equal(resolveControlBase('https://control.example.test/api/v1/'), 'https://control.example.test/api/v1');
  assert.equal(resolveControlBase('http://127.0.0.1:4174', { production: false }), 'http://127.0.0.1:4174');
  assert.throws(() => resolveControlBase('http://control.example.test', { production: true }), /HTTPS/);
  assert.equal(resolveControlBase('https://noyapi.cn/control', { production: true }), 'https://noyapi.cn/control');
  assert.equal(resolveControlBase('https://dingtu.noyapi.cn', { production: true }), 'https://dingtu.noyapi.cn');
  assert.throws(() => resolveControlBase('https://control.example.test', { production: true }), /trusted/);
  assert.throws(() => resolveControlBase('http://user:pass@control.example.test'), /allowed/);
});

test('portal URL is constrained to the assistant route and trusted origins', () => {
  assert.equal(resolvePortalUrl('http://127.0.0.1:4174/assistant/'), 'http://127.0.0.1:4174/assistant/');
  assert.equal(resolvePortalUrl('https://noyapi.cn/assistant/', { production: true }), 'https://noyapi.cn/assistant/');
  assert.equal(resolvePortalUrl('https://dingtu.noyapi.cn/assistant/', { production: true }), 'https://dingtu.noyapi.cn/assistant/');
  for (const value of ['https://evil.example/assistant/', 'https://noyapi.cn/other/', 'https://noyapi.cn/assistant/?token=secret', 'https://user:pass@noyapi.cn/assistant/', 'file:///C:/secret/assistant/']) {
    assert.throws(() => resolvePortalUrl(value, { production: true }));
  }
  assert.throws(() => resolvePortalUrl('https://noyapi.cn/assistant/', { production: false }));
});

test('sing-box binary resolver maps exact desktop targets and fails closed on missing non-Windows runtimes', () => {
  assert.equal(resolveSingBoxBinary({ runtimeDir: 'D:\\runtime\\sing-box', platform: 'win32', arch: 'x64' }), 'D:\\runtime\\sing-box\\win32-x64\\sing-box.exe');
  assert.equal(resolveSingBoxBinary({ runtimeDir: '/opt/noya/sing-box', platform: 'darwin', arch: 'arm64' }), '/opt/noya/sing-box/darwin-arm64/sing-box');
  assert.equal(resolveSingBoxBinary({ runtimeDir: '/opt/noya/sing-box', platform: 'darwin', arch: 'x64' }), '/opt/noya/sing-box/darwin-x64/sing-box');
  assert.equal(resolveSingBoxBinary({ runtimeDir: '/opt/noya/sing-box', platform: 'linux', arch: 'x64' }), '/opt/noya/sing-box/linux-x64/sing-box');
  assert.equal(resolveSingBoxBinary({ runtimeDir: '/opt/noya/sing-box', platform: 'linux', arch: 'arm64' }), '/opt/noya/sing-box/linux-arm64/sing-box');
  assert.equal(resolveSingBoxBinary({ runtimeDir: '/opt/noya/sing-box', platform: 'freebsd', arch: 'x64' }), '');
  assert.equal(resolveSingBoxBinary({ runtimeDir: 'D:\\runtime\\sing-box', platform: 'win32', arch: 'ia32' }), '');

  const repoRuntimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'runtime', 'sing-box');
  assert.equal(existsSync(resolveSingBoxBinary({ runtimeDir: repoRuntimeDir, platform: 'win32', arch: 'x64' })), true);
  assert.equal(existsSync(resolveSingBoxBinary({ runtimeDir: repoRuntimeDir, platform: 'darwin', arch: 'arm64' })), false);
  assert.equal(existsSync(resolveSingBoxBinary({ runtimeDir: repoRuntimeDir, platform: 'linux', arch: 'x64' })), false);
});
