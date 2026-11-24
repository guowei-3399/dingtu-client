import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildExternalOAuthLaunchSpec,
  createExternalOAuthBrowser,
  findSystemChromiumBrowser,
} from './external-oauth-browser.mjs';

test('findSystemChromiumBrowser prefers Chrome over Edge on Windows, macOS, and Linux', () => {
  const winChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const winEdge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const env = {
    PROGRAMFILES: 'C:\\Program Files',
    'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local',
  };

  assert.deepEqual(
    findSystemChromiumBrowser({ platform: 'win32', env, existsSync: p => p === winChrome || p === winEdge }),
    { browser: 'chrome', executablePath: winChrome },
  );
  assert.deepEqual(
    findSystemChromiumBrowser({ platform: 'win32', env, existsSync: p => p === winEdge }),
    { browser: 'edge', executablePath: winEdge },
  );
  assert.equal(
    findSystemChromiumBrowser({ platform: 'win32', env, existsSync: () => false }),
    null,
  );

  assert.deepEqual(
    findSystemChromiumBrowser({
      platform: 'darwin',
      homedir: '/Users/dev',
      existsSync: p => p === '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    }),
    { browser: 'edge', executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
  );
  assert.deepEqual(
    findSystemChromiumBrowser({
      platform: 'linux',
      existsSync: p => p === '/usr/bin/google-chrome-stable',
    }),
    { browser: 'chrome', executablePath: '/usr/bin/google-chrome-stable' },
  );
});

test('buildExternalOAuthLaunchSpec injects 17899 proxy in safe_tunnel mode without CDP or fingerprint spoofing flags', () => {
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test&redirect_uri=http%3A%2F%2F127.0.0.1%3A54321%2Foauth-callback';
  const spec = buildExternalOAuthLaunchSpec({
    url,
    userDataDir: 'C:\\Temp\\dingtu-oauth-test',
    environmentMode: 'safe_tunnel',
    proxyReady: true,
    baseEnv: { PATH: 'C:\\Windows', ELECTRON_RUN_AS_NODE: '1' },
  });
  assert.equal(spec.proxied, true);
  assert.ok(spec.args.includes('--user-data-dir=C:\\Temp\\dingtu-oauth-test'));
  assert.ok(spec.args.includes('--no-first-run'));
  assert.ok(spec.args.includes('--no-default-browser-check'));
  assert.ok(spec.args.includes('--disable-sync'));
  assert.ok(spec.args.includes('--disable-extensions'));
  assert.ok(spec.args.includes('--new-window'));
  assert.ok(spec.args.includes('--proxy-server=http://127.0.0.1:17899'));
  assert.ok(spec.args.includes('--proxy-bypass-list=127.0.0.1;localhost;[::1]'));
  assert.ok(!spec.args.some(arg => arg.startsWith('--host-resolver-rules=')));
  assert.ok(!spec.args.some(arg => arg.startsWith('--lang=')));
  assert.equal(spec.args[spec.args.length - 1], url);
  assert.equal(spec.env.TZ, undefined);
  assert.equal(spec.env.ELECTRON_RUN_AS_NODE, undefined);
  // Strictly never attach remote debugging or automation markers
  assert.ok(!spec.args.some(arg => /remote-debugging|enable-automation|headless/i.test(arg)));

  // own_network never injects 17899 proxy
  const ownSpec = buildExternalOAuthLaunchSpec({
    url,
    userDataDir: 'C:\\Temp\\dingtu-oauth-own',
    environmentMode: 'own_network',
    proxyReady: true,
    baseEnv: { PATH: 'C:\\Windows' },
  });
  assert.equal(ownSpec.proxied, false);
  assert.ok(!ownSpec.args.some(arg => arg.startsWith('--proxy-server=')));
  assert.ok(!ownSpec.args.some(arg => arg.startsWith('--host-resolver-rules=')));
  assert.ok(!ownSpec.args.some(arg => arg.startsWith('--lang=')));
  assert.equal(ownSpec.env.TZ, undefined);
});

test('buildExternalOAuthLaunchSpec rejects non-HTTPS, credentialed, and local/LAN URLs', () => {
  for (const badUrl of [
    'http://accounts.google.com/o/oauth2/v2/auth',
    'file:///C:/Windows/win.ini',
    'javascript:alert(1)',
    'https://user:secret@accounts.google.com/o/oauth2/v2/auth',
    'https://127.0.0.1:17899/test',
    'https://192.168.1.1/login',
    '',
  ]) {
    assert.throws(
      () => buildExternalOAuthLaunchSpec({ url: badUrl, userDataDir: 'C:\\Temp\\x' }),
      { code: 'BROWSER_URL_NOT_ALLOWED' },
      `Expected rejection for ${badUrl}`,
    );
  }
});

test('createExternalOAuthBrowser spawns isolated profile with shell:false and cleans up temp dir on close/dispose', async () => {
  const sandboxRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'dingtu-oauth-unit-'));
  const spawned = [];
  const fakeChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

  class FakeChild extends EventEmitter {
    constructor(cmd, args, opts) {
      super();
      this.cmd = cmd;
      this.args = args;
      this.opts = opts;
      this.killed = false;
    }
    kill() {
      this.killed = true;
      this.emit('exit', 0, null);
    }
  }

  try {
    const ext = createExternalOAuthBrowser({
      platform: 'win32',
      env: { PROGRAMFILES: 'C:\\Program Files' },
      existsSync: p => p === fakeChrome,
      tmpdir: () => sandboxRoot,
      environmentModeProvider: () => 'safe_tunnel',
      proxyReadyProvider: () => true,
      exitGeoProvider: () => ({ countryCode: 'JP', timezone: 'Asia/Tokyo', locale: 'ja-JP' }),
      cleanupRetryDelayMs: 10,
      closeCallbackDelayMs: 20,
      spawn: (cmd, args, opts) => {
        const child = new FakeChild(cmd, args, opts);
        spawned.push(child);
        return child;
      },
    });

    let closedCalled = 0;
    const handle = await ext.openOAuthWindow({
      url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc',
      onClosed: () => { closedCalled += 1; },
    });

    assert.equal(handle.browser, 'chrome');
    assert.equal(handle.fallback, false);
    assert.equal(handle.proxied, true);
    assert.equal(ext.activeCount(), 1);
    assert.equal(spawned.length, 1);
    assert.equal(spawned[0].cmd, fakeChrome);
    assert.equal(spawned[0].opts.shell, false);
    assert.ok(spawned[0].args.includes('--proxy-server=http://127.0.0.1:17899'));
    assert.equal(spawned[0].opts.env.TZ, undefined);

    // Verify ephemeral profile dir was created on disk
    const stat = await fs.stat(handle.userDataDir);
    assert.equal(stat.isDirectory(), true);

    // Closing programmatically kills process, removes temp dir, and does NOT trigger onClosed cancellation
    handle.close();
    await new Promise(r => setTimeout(r, 80));
    assert.equal(spawned[0].killed, true);
    assert.equal(closedCalled, 0);
    assert.equal(ext.activeCount(), 0);
    await assert.rejects(() => fs.stat(handle.userDataDir), { code: 'ENOENT' });

    // Natural user exit after alive window triggers onClosed and cleans up temp dir
    let userClosed = 0;
    const handle2 = await ext.openOAuthWindow({
      url: 'https://auth.openai.com/oauth/authorize?client_id=codex',
      onClosed: () => { userClosed += 1; },
    });
    await new Promise(r => setTimeout(r, 430));
    spawned[1].emit('exit', 0, null);
    await new Promise(r => setTimeout(r, 80));
    assert.equal(userClosed, 1);
    assert.equal(ext.activeCount(), 0);
    await assert.rejects(() => fs.stat(handle2.userDataDir), { code: 'ENOENT' });
  } finally {
    await fs.rm(sandboxRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test('createExternalOAuthBrowser falls back cleanly to openExternal when neither Chrome nor Edge is installed', async () => {
  const openedUrls = [];
  const ext = createExternalOAuthBrowser({
    platform: 'win32',
    env: { PROGRAMFILES: 'C:\\Program Files' },
    existsSync: () => false,
    openExternalFallback: async url => { openedUrls.push(url); },
  });

  const handle = await ext.openOAuthWindow({
    url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=fallback',
  });
  assert.equal(handle.browser, 'system');
  assert.equal(handle.fallback, true);
  assert.equal(handle.proxied, false);
  assert.deepEqual(openedUrls, ['https://accounts.google.com/o/oauth2/v2/auth?client_id=fallback']);

  const noFallback = createExternalOAuthBrowser({
    platform: 'win32',
    existsSync: () => false,
    openExternalFallback: null,
  });
  await assert.rejects(
    () => noFallback.openOAuthWindow({ url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=none' }),
    { code: 'AUTH_BROWSER_OPEN_FAILED' },
  );
});
