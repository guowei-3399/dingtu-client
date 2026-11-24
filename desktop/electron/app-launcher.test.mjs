import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppLauncher, pickBestWindowsExecutable, resolveEnvironment } from './app-launcher.mjs';

const app = ({ platformStatus = 'verified', template = {} } = {}) => ({ id: 'codex', platformStatus, template: { status: platformStatus, adapter: 'env-launch', detect: { kind: 'executable', names: ['codex'] }, launch: { kind: 'exec', argv: ['codex', '--proxy'], env: { HTTP_PROXY: '{{local.http}}', ALL_PROXY: '{{local.socks5}}' } }, ...template } });

test('launcher resolves only the local proxy placeholders', () => {
  assert.deepEqual(resolveEnvironment({ HTTP_PROXY: '{{local.http}}', HTTPS_PROXY: '{{local.https}}', WS_PROXY: '{{local.http}}', WSS_PROXY: '{{local.https}}', NO_PROXY: '{{local.host}}' }, {}), { HTTP_PROXY: 'http://127.0.0.1:17899', HTTPS_PROXY: 'http://127.0.0.1:17899', WS_PROXY: 'http://127.0.0.1:17899', WSS_PROXY: 'http://127.0.0.1:17899', NO_PROXY: '127.0.0.1' });
  assert.throws(() => resolveEnvironment({ HTTP_PROXY: '{{local.secret}}' }, {}), error => error.code === 'TEMPLATE_INVALID');
});

test('launcher never invokes a shell and only passes allowlisted proxy environment', () => {
  let received;
  const launcher = createAppLauncher({ platform: 'linux', env: { PATH: '/bin', HOME: '/home/test', OPENAI_API_KEY: 'raw-secret', ANTHROPIC_API_KEY: 'raw-secret', NOYA_INTERNAL_TOKEN: 'raw-secret' }, spawn: (command, args, options) => { received = { command, args, options }; return { once() {} }; } });
  launcher.launch(app());
  assert.equal(received.command, 'codex');
  assert.deepEqual(received.args, ['--proxy']);
  assert.equal(received.options.shell, false);
  assert.equal(received.options.env.HTTP_PROXY, 'http://127.0.0.1:17899');
  assert.equal(received.options.env.ALL_PROXY, 'socks5://127.0.0.1:17899');
  assert.equal(received.options.env.HOME, '/home/test');
  assert.equal(received.options.env.OPENAI_API_KEY, undefined);
  assert.equal(received.options.env.ANTHROPIC_API_KEY, undefined);
  assert.equal(received.options.env.NOYA_INTERNAL_TOKEN, undefined);
});

test('electron launch templates receive local proxy flags with loopback bypass, desktop env vars, and detached unref', () => {
  let received;
  let unrefCalled = false;
  const launcher = createAppLauncher({
    platform: 'win32',
    env: {
      PATH: 'C:\\Windows\\System32',
      USERNAME: 'DemoUser',
      COMPUTERNAME: 'DEMO-PC',
      SYSTEMDRIVE: 'C:',
      ALLUSERSPROFILE: 'C:\\ProgramData',
      PUBLIC: 'C:\\Users\\Public',
      SESSIONNAME: 'Console',
      SECRET_TOKEN: 'must-not-leak',
    },
    spawn: (command, args, options) => {
      received = { command, args, options };
      return { once() {}, unref() { unrefCalled = true; } };
    },
  });
  launcher.launch(app({ template: {
    adapter: 'electron-launch',
    launch: {
      kind: 'exec',
      argv: ['C:\\Apps\\Antigravity.exe', '--proxy-server={{local.http}}', '--proxy-bypass-list=localhost;127.0.0.1;[::1];<local>'],
      env: { HTTP_PROXY: '{{local.http}}', HTTPS_PROXY: '{{local.https}}', NO_PROXY: '{{local.host}}' },
    },
  } }));
  assert.equal(received.command, 'C:\\Apps\\Antigravity.exe');
  assert.deepEqual(received.args, ['--proxy-server=http://127.0.0.1:17899', '--proxy-bypass-list=localhost;127.0.0.1;[::1];<local>']);
  assert.equal(received.options.env.HTTPS_PROXY, 'http://127.0.0.1:17899');
  assert.equal(received.options.env.USERNAME, 'DemoUser');
  assert.equal(received.options.env.COMPUTERNAME, 'DEMO-PC');
  assert.equal(received.options.env.SYSTEMDRIVE, 'C:');
  assert.equal(received.options.env.ALLUSERSPROFILE, 'C:\\ProgramData');
  assert.equal(received.options.env.PUBLIC, 'C:\\Users\\Public');
  assert.equal(received.options.env.SESSIONNAME, 'Console');
  assert.equal(received.options.env.SECRET_TOKEN, undefined);
  assert.equal(received.options.shell, false);
  assert.equal(received.options.detached, true);
  assert.equal(unrefCalled, true);
});

test('launcher refuses unverified, non-exec, malformed and shell-like templates', () => {
  const launcher = createAppLauncher({ spawn: () => ({ once() {} }) });
  for (const candidate of [app({ platformStatus: 'unverified' }), app({ template: { adapter: 'system-proxy' } }), app({ template: { launch: { kind: 'exec', argv: ['sh -c evil'], env: {} } } })]) assert.throws(() => launcher.launch(candidate), error => ['APP_NOT_READY', 'TEMPLATE_INVALID'].includes(error.code));
});

test('launcher keeps future app-server and profile adapters fail-closed until their supervisor exists', () => {
  const launcher = createAppLauncher({ spawn: () => ({ once() {} }) });
  for (const adapter of ['app-server', 'electron-profile']) {
    const candidate = app({ template: { adapter, launch: { kind: 'exec', argv: ['codex'], env: { HTTP_PROXY: '{{local.http}}' } } } });
    assert.throws(() => launcher.plan(candidate), error => error.code === 'APP_ADAPTER_UNSUPPORTED');
  }
});

test('detection returns installed, not-installed and unknown without launching the application', async () => {
  const launcher = createAppLauncher({ platform: 'linux', execFile: (_command, args, _options, callback) => callback(args[0] === 'codex' ? null : new Error('missing'), args[0] === 'codex' ? '/usr/bin/codex\n' : '') });
  assert.deepEqual(await launcher.detect(app()), { status: 'installed', path: '/usr/bin/codex', command: 'codex' });
  assert.deepEqual(await launcher.detect(app({ template: { ...app().template, detect: { kind: 'executable', names: ['missing'] } } })), { status: 'not-installed' });
  assert.deepEqual(await launcher.detect(app({ template: { ...app().template, detect: null } })), { status: 'unknown', reason: 'NO_EXECUTABLE_DETECTOR' });
});

test('desktop plans support absolute paths with spaces and expose restart semantics without launching', async () => {
  const launcher = createAppLauncher({ platform: 'win32', exists: path => path === 'C:\\Program Files\\Codex\\Codex.exe', execFile: () => { throw new Error('must not execute where for absolute paths'); } });
  const candidate = app({ template: {
    adapter: 'electron-launch',
    detect: { kind: 'executable', names: ['C:\\Program Files\\Codex\\Codex.exe'] },
    launch: { kind: 'exec', argv: ['C:\\Program Files\\Codex\\Codex.exe', '--proxy-server={{local.http}}'], env: { HTTP_PROXY: '{{local.http}}' } },
  } });
  assert.deepEqual(launcher.plan(candidate), { appId: 'codex', adapter: 'electron-launch', activation: 'restart-required', command: 'C:\\Program Files\\Codex\\Codex.exe', args: ['--proxy-server=http://127.0.0.1:17899'], envKeys: ['HTTP_PROXY'], injection: { args: ['--proxy-server=http://127.0.0.1:17899'], env: { HTTP_PROXY: 'http://127.0.0.1:17899' } } });
  assert.deepEqual(await launcher.detect(candidate), { status: 'installed', path: 'C:\\Program Files\\Codex\\Codex.exe', command: 'C:\\Program Files\\Codex\\Codex.exe' });
});

test('launcher plan generates a declarative injection payload without secrets', () => {
  const launcher = createAppLauncher({ platform: 'linux' });
  const planned = launcher.plan(app({ template: { adapter: 'env-launch', launch: { kind: 'exec', argv: ['codex', '--version'], env: { HTTP_PROXY: '{{local.http}}', WS_PROXY: '{{local.http}}' } } } }));
  assert.deepEqual(planned.injection, { args: ['--version'], env: { HTTP_PROXY: 'http://127.0.0.1:17899', WS_PROXY: 'http://127.0.0.1:17899' } });
  assert.equal(JSON.stringify(planned).includes('secret'), false);
});

test('win32 detection resolves OpenAI.Codex MSIX via Shell AUMID (no WindowsApps EPERM), prefers .cmd, and launches visible CLI terminal', async () => {
  const best = pickBestWindowsExecutable('C:\\npm\\codex\nC:\\npm\\codex.cmd\nC:\\npm\\codex.bat');
  assert.equal(best, 'C:\\npm\\codex.cmd');

  const msixInstall = 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1111_x64__2p2nqsd0c76g0';
  const expectedAumid = 'OpenAI.Codex_2p2nqsd0c76g0!App';
  const wtExe = 'C:\\Users\\Demo\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe';
  const spawns = [];
  const agyExe = 'C:\\Users\\Demo\\AppData\\Local\\agy\\bin\\agy.exe';
  const launcher = createAppLauncher({
    platform: 'win32',
    env: {
      LOCALAPPDATA: 'C:\\Users\\Demo\\AppData\\Local',
      APPDATA: 'C:\\Users\\Demo\\AppData\\Roaming',
      PATH: 'C:\\Windows\\System32',
    },
    exists: p => p === `${msixInstall}\\app\\ChatGPT.exe` || p === wtExe || p === 'C:\\Users\\Demo\\AppData\\Roaming\\npm\\codex.cmd' || p === agyExe,
    execFile: (cmd, args, _opts, cb) => {
      if (cmd === 'powershell.exe' && args.join(' ').includes('OpenAI.Codex')) {
        cb(null, JSON.stringify({
          packageFamilyName: 'OpenAI.Codex_2p2nqsd0c76g0',
          installLocation: msixInstall,
          appId: 'App',
        }) + '\n');
      } else {
        cb(new Error('not found'), '');
      }
    },
    spawn: (cmd, args, opts) => {
      spawns.push({ cmd, args, opts });
      return { once() {}, unref() {} };
    },
  });

  const codexDesktop = app({
    id: 'codex-desktop',
    template: {
      adapter: 'electron-launch',
      detect: { kind: 'executable', names: ['Codex.exe'] },
      launch: { kind: 'exec', argv: ['Codex', '--proxy-server={{local.http}}'], env: { HTTP_PROXY: '{{local.http}}' } },
    },
  });
  codexDesktop.id = 'codex-desktop';
  const deskDet = await launcher.detect(codexDesktop);
  assert.equal(deskDet.status, 'installed');
  assert.equal(deskDet.path, `${msixInstall}\\app\\ChatGPT.exe`);
  assert.equal(deskDet.command, expectedAumid);
  assert.equal(deskDet.kind, 'appx');
  assert.equal(deskDet.aumid, expectedAumid);
  const appxChild = launcher.launchWithSafeContext(codexDesktop, { mode: 'safe_tunnel' });
  assert.equal(appxChild.dingtuShellActivated, true);
  assert.equal(spawns[0].cmd, 'explorer.exe');
  assert.deepEqual(spawns[0].args, [`shell:AppsFolder\\${expectedAumid}`]);
  assert.equal(spawns[0].opts.detached, true);
  assert.equal(spawns[0].opts.shell, false);

  const codexCli = app({
    id: 'codex-cli',
    template: {
      adapter: 'env-launch',
      detect: { kind: 'executable', names: ['codex.cmd', 'codex'] },
      launch: { kind: 'exec', argv: ['codex'], env: { HTTP_PROXY: '{{local.http}}', ALL_PROXY: '{{local.socks5}}' } },
    },
  });
  codexCli.id = 'codex-cli';
  await launcher.detect(codexCli);
  launcher.launchWithSafeContext(codexCli, { mode: 'safe_tunnel', envPatch: { HTTPS_PROXY: 'http://127.0.0.1:17899' } });
  assert.equal(spawns[1].cmd, wtExe);
  assert.equal(spawns[1].opts.windowsHide, false);
  assert.equal(spawns[1].opts.detached, true);
  assert.equal(spawns[1].opts.shell, false);
  const encIdx = spawns[1].args.indexOf('-EncodedCommand');
  assert.ok(encIdx > 0);
  const decodedPs = Buffer.from(spawns[1].args[encIdx + 1], 'base64').toString('utf16le');
  assert.match(decodedPs, /\$env:ALL_PROXY = 'socks5h:\/\/127\.0\.0\.1:17899'|socks5:\/\/127\.0\.0\.1:17899/);
  assert.match(decodedPs, /C:\\Users\\Demo\\AppData\\Roaming\\npm\\codex\.cmd/);

  // Non-MSIX standalone Codex.exe launches directly with detached: true
  const standaloneSpawner = createAppLauncher({
    platform: 'win32',
    env: { LOCALAPPDATA: 'C:\\Users\\Demo\\AppData\\Local' },
    exists: p => p === 'C:\\Users\\Demo\\AppData\\Local\\Programs\\Codex\\Codex.exe',
    spawn: (cmd, args, opts) => { spawns.push({ cmd, args, opts }); return { once() {}, unref() {} }; },
  });
  standaloneSpawner.launch(codexDesktop);
  assert.equal(spawns.at(-1).cmd, 'C:\\Users\\Demo\\AppData\\Local\\Programs\\Codex\\Codex.exe');
  assert.equal(spawns.at(-1).opts.detached, true);

  const agCli = app({
    id: 'antigravity-cli',
    template: {
      adapter: 'env-launch',
      detect: { kind: 'executable', names: ['agy.exe', 'agy.cmd', 'agy'] },
      launch: { kind: 'exec', argv: ['agy'], env: { HTTP_PROXY: '{{local.http}}' } },
    },
  });
  agCli.id = 'antigravity-cli';
  const agCliDet = await launcher.detect(agCli);
  assert.equal(agCliDet.status, 'installed');
  assert.equal(agCliDet.path, agyExe);
});

