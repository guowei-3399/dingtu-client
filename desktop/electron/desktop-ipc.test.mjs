import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { DESKTOP_CHANNEL, registerDesktopIpc } from './desktop-ipc.mjs';
import { createEnvironmentModeController } from './environment-mode.mjs';
import { createAgentInstanceHost } from './agent-instance-host.mjs';
import { sanitizeAuthAudit } from './auth-audit.mjs';

function harness() {
  const handlers = new Map(); const mainFrame = { url: 'https://noyapi.cn/assistant/' }; const webContents = { mainFrame, getURL: () => mainFrame.url, isDestroyed: () => false }; const win = { webContents, isDestroyed: () => false }; const calls = [];
  const ipcMain = { handle(channel, fn) { handlers.set(channel, fn); }, removeHandler(channel) { handlers.delete(channel); } };
  const host = { async login() { calls.push('login'); return { status: 'authenticated', platform: 'linux', device: null }; }, cancelLogin() { calls.push('cancel'); }, async logout() { calls.push('logout'); return { status: 'signed_out', platform: 'linux', device: null }; }, snapshot() { return { status: 'authenticated', platform: 'linux', device: null }; }, async read(kind, args) { calls.push(['read', kind, args]); return kind === 'catalog' ? { data_source: 'real', catalogRevision: 1, generatedAt: '2026-10-28T00:00:00.000Z', checksum: 'a'.repeat(64), platform: args.platform, apps: [] } : { data_source: 'real', kind }; } };
  return { handlers, ipcMain, getWindow: () => win, webContents, host, calls, event: () => ({ sender: webContents, senderFrame: mainFrame }) };
}

test('IPC preserves entitlement rejection without exposing its raw server message', async () => {
  const h=harness();h.host.login=async()=>{throw Object.assign(new Error('Cookie secret'),{status:401,code:'ACCOUNT_DISABLED',requestId:'req_fixture'});};
  registerDesktopIpc({...h,portalUrl:'https://noyapi.cn/assistant/'});
  const result=await h.handlers.get(DESKTOP_CHANNEL)(h.event(),{operation:'auth.login'});
  assert.equal(result.error.code,'ACCOUNT_DISABLED');
  assert.equal(result.error.request_id,'req_fixture');
  assert.match(result.error.message,/未开通|尚未开通/);
  assert.doesNotMatch(JSON.stringify(result),/Cookie|secret/);
});

test('reauthorization closes old browser connections and stops the proxy before login', async () => {
  const h=harness(),order=[];
  h.host.login=async()=>{order.push('login');return{status:'authenticated',platform:'linux',device:null};};
  registerDesktopIpc({...h,portalUrl:'https://noyapi.cn/assistant/',browser:{closeAll:async()=>order.push('browser-close')},proxy:{stop:()=>order.push('proxy-stop')}});
  assert.equal((await h.handlers.get(DESKTOP_CHANNEL)(h.event(),{operation:'auth.login'})).ok,true);
  assert.deepEqual(order,['browser-close','proxy-stop','login']);
});

test('only authenticated fixed browser app ids can reach the main-owned browser host', async () => {
  const h=harness(),calls=[];let authenticated=true;
  h.host.snapshot=()=>({status:authenticated?'authenticated':'signed_out',platform:'linux',device:null});
  const browser={open:async args=>{calls.push(args);},closeAll:()=>calls.push('close')};
  registerDesktopIpc({...h,portalUrl:'https://noyapi.cn/assistant/',browser});
  const invoke=h.handlers.get(DESKTOP_CHANNEL);
  assert.equal((await invoke(h.event(),{operation:'browser.open',appId:'claude',instanceId:'cc1'})).ok,true);
  assert.deepEqual(calls,[{appId:'claude',instanceId:'cc1'}]);
  assert.equal((await invoke(h.event(),{operation:'browser.open',appId:'claude',instanceId:'cc1',url:'https://evil.test'})).ok,false);
  authenticated=false;
  assert.equal((await invoke(h.event(),{operation:'browser.open',appId:'claude',instanceId:'cc2'})).error.code,'AUTH_REQUIRED');
  assert.equal(calls.length,1);
  await invoke(h.event(),{operation:'auth.logout'});
  assert.ok(calls.includes('close'));
});

test('desktop IPC exposes only fixed auth/read operations and validates the sender after await', async () => {
  const h = harness(), dispose = registerDesktopIpc({ ipcMain: h.ipcMain, getWindow: h.getWindow, portalUrl: 'https://noyapi.cn/assistant/', host: h.host });
  assert.equal(typeof dispose, 'function'); assert.equal(h.handlers.has(DESKTOP_CHANNEL), true);
  const invoke = h.handlers.get(DESKTOP_CHANNEL);
  h.event().senderFrame.url = 'https://noyapi.cn/assistant/#connection';
  assert.deepEqual(await invoke(h.event(), { operation: 'auth.status' }), { ok: true, value: { status: 'authenticated', platform: 'linux', device: null } });
  assert.deepEqual(await invoke(h.event(), { operation: 'read', kind: 'catalog', args: { platform: 'linux' } }), { ok: true, value: { data_source: 'real', catalogRevision: 1, generatedAt: '2026-10-28T00:00:00.000Z', checksum: 'a'.repeat(64), platform: 'linux', apps: [] } });
  assert.deepEqual(h.calls.at(-1), ['read', 'catalog', { platform: 'linux' }]);
  const bad = await invoke(h.event(), { operation: 'read', kind: 'tunnelConfig', args: { token: 'secret' } }); assert.equal(bad.ok, false); assert.equal(bad.error.code, 'READ_NOT_ALLOWED'); assert.doesNotMatch(JSON.stringify(bad), /secret/);
  const foreign = { ...h.event(), sender: {}, senderFrame: h.event().senderFrame }; const denied = await invoke(foreign, { operation: 'auth.status' }); assert.equal(denied.ok, false); assert.equal(denied.error.code, 'IPC_SENDER_INVALID');
  dispose(); assert.equal(h.handlers.has(DESKTOP_CHANNEL), false);
});

test('desktop IPC refuses navigation/query frames and never forwards unknown messages', async () => {
  const h = harness(); registerDesktopIpc({ ipcMain: h.ipcMain, getWindow: h.getWindow, portalUrl: 'https://noyapi.cn/assistant/', host: h.host }); const invoke = h.handlers.get(DESKTOP_CHANNEL);
  for (const frame of [{ url: 'https://evil.example/assistant/' }, { url: 'https://noyapi.cn/assistant/?token=secret' }]) { const result = await invoke({ ...h.event(), senderFrame: frame }, { operation: 'auth.status' }); assert.equal(result.ok, false); assert.equal(result.error.code, 'IPC_SENDER_INVALID'); assert.doesNotMatch(JSON.stringify(result), /secret/); }
  const unknown = await invoke(h.event(), { operation: 'shell', args: { command: 'powershell', token: 'secret' } }); assert.equal(unknown.ok, false); assert.equal(unknown.error.code, 'IPC_MESSAGE_INVALID'); assert.doesNotMatch(JSON.stringify(unknown), /secret|powershell/);
});

test('desktop IPC accepts the packaged file renderer and a configured hosted assistant frame', async () => {
  const h = harness();
  const dispose = registerDesktopIpc({ ipcMain: h.ipcMain, getWindow: h.getWindow, portalUrl: ['file:///D:/apps/定途/resources/app.asar/index.html', 'https://dingtu.noyapi.cn/assistant/'], host: h.host });
  const invoke = h.handlers.get(DESKTOP_CHANNEL);
  const hostedEvent = h.event();
  hostedEvent.senderFrame = { url: 'https://dingtu.noyapi.cn/assistant/#settings', parent: null };
  const hosted = await invoke(hostedEvent, { operation: 'auth.status' });
  assert.equal(hosted.ok, true);
  const fileEvent = h.event();
  fileEvent.senderFrame = { url: 'file:///D:/apps/定途/resources/app.asar/index.html#connection', parent: null };
  const file = await invoke(fileEvent, { operation: 'auth.status' });
  assert.equal(file.ok, true);
  const foreignContents = { ...h.event(), sender: { id: 20 }, senderFrame: { url: 'https://dingtu.noyapi.cn/assistant/', parent: null } };
  const denied = await invoke(foreignContents, { operation: 'auth.status' });
  assert.equal(denied.error.code, 'IPC_SENDER_INVALID');
  dispose();
});

test('desktop IPC accepts Chromium uppercasing the drive letter in Windows portable builds', async () => {
  const h = harness();
  h.event().senderFrame.url = 'file:///D:/Users/Administrator/AppData/Local/Temp/portable/resources/app.asar/index.html#settings';
  registerDesktopIpc({ ...h, portalUrl: ['file:///d:/Users/Administrator/AppData/Local/Temp/portable/resources/app.asar/index.html', 'https://dingtu.noyapi.cn/assistant/'] });
  const result = await h.handlers.get(DESKTOP_CHANNEL)(h.event(), { operation: 'auth.status' });
  assert.equal(result.ok, process.platform === 'win32');
});

test('desktop IPC rejects alternate file hosts, schemes and empty query strings', async () => {
  const h = harness();
  const renderer = 'file:///D:/apps/portable/resources/app.asar/index.html';
  registerDesktopIpc({ ...h, portalUrl: [renderer] });
  const invoke = h.handlers.get(DESKTOP_CHANNEL);
  for (const url of [renderer.replace('file:///', 'file://foreign/'), renderer.replace('file://', 'data:'), `${renderer}?#settings`]) {
    h.event().senderFrame.url = url;
    assert.equal((await invoke(h.event(), { operation: 'auth.status' })).error?.code, 'IPC_SENDER_INVALID', url);
  }
});

test('desktop IPC accepts the current main-frame URL during a local renderer navigation', async () => {
  const h = harness();
  const localUrl = 'file:///D:/apps/定途/resources/app.asar/index.html';
  h.webContents.mainFrame = { url: 'about:blank' };
  h.webContents.getURL = () => `${localUrl}#connection`;
  const dispose = registerDesktopIpc({ ipcMain: h.ipcMain, getWindow: h.getWindow, portalUrl: [localUrl, 'https://dingtu.noyapi.cn/assistant/'], host: h.host });
  const result = await h.handlers.get(DESKTOP_CHANNEL)({ ...h.event(), senderFrame: h.webContents.mainFrame }, { operation: 'auth.status' });
  assert.deepEqual(result, { ok: true, value: { status: 'authenticated', platform: 'linux', device: null } });
  dispose();
});

test('desktop IPC still rejects a child frame even when the main page is allowed', async () => {
  const h = harness();
  const localUrl = 'file:///D:/apps/定途/resources/app.asar/index.html';
  h.webContents.mainFrame = { url: `${localUrl}#connection` };
  h.webContents.getURL = () => `${localUrl}#connection`;
  const child = { url: `${localUrl}#connection`, parent: h.webContents.mainFrame };
  const dispose = registerDesktopIpc({ ipcMain: h.ipcMain, getWindow: h.getWindow, portalUrl: [localUrl, 'https://dingtu.noyapi.cn/assistant/'], host: h.host });
  const result = await h.handlers.get(DESKTOP_CHANNEL)({ ...h.event(), senderFrame: child }, { operation: 'auth.status' });
  assert.equal(result.error.code, 'IPC_SENDER_INVALID');
  dispose();
});

test('desktop IPC preserves only a bounded 401 marker for an expired device session', async () => {
  const h = harness();
  h.host.read = async () => { const error = Object.assign(new Error('Bearer secret should not escape'), { code: 'AUTH_REQUIRED', status: 401, requestId: 'req-123' }); throw error; };
  registerDesktopIpc({ ipcMain: h.ipcMain, getWindow: h.getWindow, portalUrl: 'https://noyapi.cn/assistant/', host: h.host });
  const result = await h.handlers.get(DESKTOP_CHANNEL)(h.event(), { operation: 'read', kind: 'me', args: {} });
  assert.deepEqual(result, { ok: false, error: { code: 'AUTH_REQUIRED', message: '请先完成桌面登录。', status: 401, request_id: 'req-123' } });
  assert.doesNotMatch(JSON.stringify(result), /Bearer|secret/);
});

test('desktop IPC preserves actionable contract errors instead of collapsing them into a generic desktop failure', async () => {
  const h = harness();
  h.host.read = async () => { throw Object.assign(new Error('upstream details'), { code: 'PRODUCTION_MAPPING_NOT_READY', requestId: 'req_mapping' }); };
  registerDesktopIpc({ ipcMain: h.ipcMain, getWindow: h.getWindow, portalUrl: 'https://noyapi.cn/assistant/', host: h.host });
  const result = await h.handlers.get(DESKTOP_CHANNEL)(h.event(), { operation: 'read', kind: 'overview', args: {} });
  assert.deepEqual(result, { ok: false, error: { code: 'PRODUCTION_MAPPING_NOT_READY', message: '生产绑定尚未准备完成，请联系运营确认。', request_id: 'req_mapping' } });
  assert.doesNotMatch(JSON.stringify(result), /upstream details/);
});

test('desktop IPC controls only named instances and projects agent state without command or credential fields', async () => {
  const h = harness();
  const calls = [];
  h.host.agent = {
    list: async () => [{ profileId: 'cc1', status: 'stopped', pid: null, activation: 'immediate', command: 'secret', credentialRef: 'secret' }],
    start: async id => { calls.push(['start', id]); return { profileId: id, status: 'running', pid: 42, activation: 'immediate', command: 'claude', token: 'secret' }; },
    stop: async id => { calls.push(['stop', id]); return { profileId: id, status: 'stopped', pid: null, activation: 'immediate' }; },
  };
  registerDesktopIpc({ ipcMain: h.ipcMain, getWindow: h.getWindow, portalUrl: 'https://noyapi.cn/assistant/', host: h.host });
  const invoke = h.handlers.get(DESKTOP_CHANNEL);
  assert.deepEqual(await invoke(h.event(), { operation: 'agent.list' }), { ok: true, value: { profiles: [{ profileId: 'cc1', status: 'stopped', pid: null, activation: 'immediate', error: null }] } });
  assert.deepEqual(await invoke(h.event(), { operation: 'agent.start', instanceId: 'cc1' }), { ok: true, value: { profileId: 'cc1', status: 'running', pid: 42, activation: 'immediate', error: null } });
  assert.deepEqual(await invoke(h.event(), { operation: 'agent.stop', instanceId: 'cc1' }), { ok: true, value: { profileId: 'cc1', status: 'stopped', pid: null, activation: 'immediate', error: null } });
  assert.deepEqual(calls, [['start', 'cc1'], ['stop', 'cc1']]);
  for (const message of [
    { operation: 'agent.start', instanceId: 'cc 1' },
    { operation: 'agent.start', instanceId: 'cc1', command: 'powershell' },
    { operation: 'agent.start', instanceId: 'cc1', proxy: 'http://evil.example' },
    { operation: 'agent.start', instanceId: 'cc1', token: 'secret' },
  ]) {
    const result = await invoke(h.event(), message);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'IPC_MESSAGE_INVALID');
    assert.doesNotMatch(JSON.stringify(result), /powershell|evil|secret/);
  }
});

test('desktop IPC exposes a redacted local environment inspection before app launch', async () => {
  const h = harness();
  h.host.snapshot = () => ({ status: 'signed_out', platform: 'windows', device: null });
  registerDesktopIpc({ ...h, portalUrl: 'https://noyapi.cn/assistant/', agents: {
    inspect: async appId => ({ appId, status: 'installed', activation: 'restart-required', path: 'C:\\Apps\\Claude\\Claude.exe', command: 'Claude.exe', env: { ANTHROPIC_API_KEY: 'secret' } }),
  } });
  const result = await h.handlers.get(DESKTOP_CHANNEL)(h.event(), { operation: 'agent.inspect', appId: 'claude-desktop' });
  assert.deepEqual(result, { ok: true, value: { appId: 'claude-desktop', status: 'installed', activation: 'restart-required', path: 'C:\\Apps\\Claude\\Claude.exe', command: 'Claude.exe' } });
  assert.doesNotMatch(JSON.stringify(result), /secret|ANTHROPIC/);
});

test('desktop IPC rejects agent control when the host has no agent supervisor', async () => {
  const h = harness(); registerDesktopIpc({ ipcMain: h.ipcMain, getWindow: h.getWindow, portalUrl: 'https://noyapi.cn/assistant/', host: h.host });
  const result = await h.handlers.get(DESKTOP_CHANNEL)(h.event(), { operation: 'agent.start', instanceId: 'cc1' });
  assert.deepEqual(result, { ok: false, error: { code: 'AGENT_CONTROL_UNAVAILABLE', message: '应用实例控制暂不可用。', request_id: null } });
});

test('desktop IPC exposes only projected local proxy lifecycle state and requires auth to start', async () => {
  const h = harness(); const calls = [];
  const proxy = { status: () => ({ state: 'stopped', host: '127.0.0.1', port: 17899, lastExit: null }), async start() { calls.push('start'); return { state: 'running', host: '127.0.0.1', port: 17899, lastExit: null, config: 'secret' }; }, stop() { calls.push('stop'); return { state: 'stopped', host: '127.0.0.1', port: 17899, lastExit: null }; } };
  registerDesktopIpc({ ipcMain: h.ipcMain, getWindow: h.getWindow, portalUrl: 'https://noyapi.cn/assistant/', host: h.host, proxy });
  const invoke = h.handlers.get(DESKTOP_CHANNEL);
  assert.deepEqual(await invoke(h.event(), { operation: 'proxy.status' }), { ok: true, value: { state: 'stopped', host: '127.0.0.1', port: 17899, lastExit: null } });
  assert.deepEqual(await invoke(h.event(), { operation: 'proxy.start' }), { ok: true, value: { state: 'running', host: '127.0.0.1', port: 17899, lastExit: null } });
  assert.deepEqual(await invoke(h.event(), { operation: 'proxy.stop' }), { ok: true, value: { state: 'stopped', host: '127.0.0.1', port: 17899, lastExit: null } });
  assert.deepEqual(calls, ['start', 'stop']);
});

test('desktop IPC sanitizes missing kernel and OS secure store failures across non-Windows platforms', async () => {
  const h = harness();
  h.host.login = async () => {
    throw Object.assign(new Error('/home/user/.local/share/keyrings/login.keyring locked'), { code: 'SECURE_STORE_OPERATION_FAILED' });
  };
  const proxy = {
    status: () => ({ state: 'stopped', host: '127.0.0.1', port: 17899, lastExit: null }),
    async start() {
      throw Object.assign(new Error('/opt/dingtu/resources/sing-box/linux-x64/sing-box ENOENT'), { code: 'PROXY_BINARY_UNAVAILABLE' });
    },
    stop: () => ({ state: 'stopped', host: '127.0.0.1', port: 17899, lastExit: null }),
  };
  registerDesktopIpc({ ...h, portalUrl: 'https://noyapi.cn/assistant/', proxy });
  const invoke = h.handlers.get(DESKTOP_CHANNEL);
  const loginRes = await invoke(h.event(), { operation: 'auth.login' });
  assert.equal(loginRes.ok, false);
  assert.equal(loginRes.error.code, 'SECURE_STORE_OPERATION_FAILED');
  assert.doesNotMatch(JSON.stringify(loginRes), /keyring|\.local/);

  const proxyRes = await invoke(h.event(), { operation: 'proxy.start' });
  assert.equal(proxyRes.ok, false);
  assert.equal(proxyRes.error.code, 'PROXY_BINARY_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(proxyRes), /\/opt\/dingtu|linux-x64|ENOENT/);
});

test('desktop IPC accounts bridge allows personal multi-account import/switch while maintaining auth gate', async () => {
  const h = harness();
  let tier = 'personal';
  const calls = [];
  const stored = [{ id: 'main', appId: 'codex', label: 'a@example.com' }];
  const accounts = {
    list: async appId => ({ accounts: stored.filter(a => !appId || a.appId === appId), activeByApp: { codex: 'main' } }),
    importLocal: async input => {
      calls.push(['importLocal', input.all, input.silent, input.alias]);
      return { importedCount: 1, addedCount: 1, updatedCount: 0, skippedCount: 0, accounts: stored, activeByApp: { codex: 'main' } };
    },
    add: async input => {
      calls.push(['add', input.alias]);
      const item = { id: input.alias, appId: input.appId, label: input.label || input.alias };
      stored.push(item);
      return item;
    },
    switchAccount: async input => {
      calls.push(['switch', input.accountId]);
      return { appId: input.appId, activeAccountId: input.accountId, switchedLocalFile: true };
    },
    refreshQuota: async () => ({ accounts: stored, refreshedCount: 1 }),
    detectAll: async () => ({ apps: { codex: { status: 'installed', kind: 'env-launch', path: 'codex' } } }),
  };
  const concurrency = {
    resolveTier: async () => tier,
  };
  registerDesktopIpc({ ...h, portalUrl: 'https://noyapi.cn/assistant/', accounts, concurrency });
  const invoke = h.handlers.get(DESKTOP_CHANNEL);

  // Personal tier: unlocks local multi-account silent import, adding slots, and switching accounts
  const silentImp = await invoke(h.event(), { operation: 'accounts.importLocal', all: true, silent: true });
  assert.equal(silentImp.ok, true);
  assert.equal(silentImp.value.addedCount, 1);

  const personalAdd = await invoke(h.event(), { operation: 'accounts.add', appId: 'codex', alias: 'work-2', email: 'b@example.com' });
  assert.equal(personalAdd.ok, true);
  assert.equal(personalAdd.value.account.id, 'work-2');

  const personalSwitch = await invoke(h.event(), { operation: 'accounts.switch', appId: 'codex', accountId: 'work-2' });
  assert.equal(personalSwitch.ok, true);
  assert.equal(personalSwitch.value.activeAccountId, 'work-2');

  // Enterprise tier also works seamlessly
  tier = 'enterprise';
  const entAdd = await invoke(h.event(), { operation: 'accounts.add', appId: 'codex', alias: 'work-3', email: 'c@example.com' });
  assert.equal(entAdd.ok, true);
  assert.equal(entAdd.value.account.id, 'work-3');
  assert.deepEqual(calls, [['importLocal', true, true, null], ['add', 'work-2'], ['switch', 'work-2'], ['add', 'work-3']]);
});

test('desktop-ipc allows OAuth/importToken for authenticated users while keeping 2FA TOTP & detectAll accessible locally', async () => {
  const h = harness();
  let authStatus = 'anonymous';
  let tier = 'personal';
  const storedAccounts = [{ id: 'main', appId: 'antigravity', email: 'one@example.com' }];

  registerDesktopIpc({
    ipcMain: h.ipcMain,
    getWindow: h.getWindow,
    portalUrl: 'https://noyapi.cn/assistant/',
    host: { snapshot: () => ({ status: authStatus }), read: async () => ({}), login: async () => ({}), logout: async () => ({}) },
    concurrency: { resolveTier: async () => tier },
    accounts: {
      list: async appId => ({ accounts: storedAccounts.filter(a => !appId || a.appId === appId), activeByApp: { antigravity: 'main' } }),
      detectAll: async () => ({ apps: { antigravity: { status: 'installed', kind: 'electron-launch', path: 'Antigravity.exe' } } }),
      totpList: async () => ({ saved: [], history: [] }),
      totpCompute: async ({ input }) => ({ result: { id: 'h1', name: 'Test', maskedSecret: 'JBSW••••3PXP', code: '123456', remainingSeconds: 20, period: 30, digits: 6 }, saved: [], history: [] }),
      totpSave: async ({ input, name }) => ({ entry: { id: 's1', name: name || 'Saved', code: '123456', remainingSeconds: 20 }, saved: [{ id: 's1', name: name || 'Saved' }], history: [] }),
      totpRemove: async () => ({ removedCount: 1, saved: [], history: [] }),
      totpExport: async () => ({ count: 0, jsonText: '{"entries":[]}' }),
      totpImport: async () => ({ importedCount: 1, saved: [], history: [] }),
      importToken: async args => ({ account: { id: args.alias, appId: args.appId }, accounts: storedAccounts }),
      importJson: async () => ({ importedCount: 1, accounts: storedAccounts }),
      exportJson: async () => ({ count: 1, jsonText: '{}' }),
      updateMeta: async args => ({ account: { id: args.accountId, tags: args.tags, note: args.note }, accounts: storedAccounts }),
      batchRemove: async () => ({ removedCount: 1, accounts: [] }),
    },
    oauth: {
      start: async args => ({ flowId: 'abcdef123456', appId: args.appId, alias: args.alias, mode: 'browser', status: 'pending', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth' }),
      status: async ({ flowId }) => ({ flowId, status: 'pending' }),
      submitCallback: async ({ flowId }) => ({ flowId, status: 'completed' }),
      cancel: async () => ({ cancelled: true }),
    },
  });

  const invoke = h.handlers.get(DESKTOP_CHANNEL);
  // TOTP & detectAll work locally before portal sign-in
  const unauthTotp = await invoke(h.event(), { operation: 'accounts.totpCompute', input: 'JBSWY3DPEHPK3PXP' });
  assert.equal(unauthTotp.ok, true);
  assert.equal(unauthTotp.value.result.code, '123456');

  const unauthDetect = await invoke(h.event(), { operation: 'accounts.detectAll' });
  assert.equal(unauthDetect.ok, true);
  assert.equal(unauthDetect.value.apps.antigravity.status, 'installed');

  // OAuth start still requires authenticated portal session
  const unauthOAuth = await invoke(h.event(), { operation: 'accounts.oauthStart', appId: 'antigravity', alias: 'main' });
  assert.equal(unauthOAuth.ok, false);
  assert.equal(unauthOAuth.error.code, 'AUTH_REQUIRED');

  authStatus = 'authenticated';
  const personalMultiToken = await invoke(h.event(), { operation: 'accounts.importToken', appId: 'antigravity', alias: 'ag-2', token: '1//0ref' });
  assert.equal(personalMultiToken.ok, true);
  assert.equal(personalMultiToken.value.account.id, 'ag-2');

  const personalOAuth = await invoke(h.event(), { operation: 'accounts.oauthStart', appId: 'antigravity', alias: 'ag-3' });
  assert.equal(personalOAuth.ok, true);
  assert.equal(personalOAuth.value.flowId, 'abcdef123456');

  const invalidTotp = await invoke(h.event(), { operation: 'accounts.totpCompute', input: '' });
  assert.equal(invalidTotp.ok, false);
  assert.equal(invalidTotp.error.code, 'IPC_MESSAGE_INVALID');
});

test('desktop-ipc routes local usage scan, wakeup scheduler, groups, settings, and totp migration ops', async () => {
  const h = harness();
  let authStatus = 'anonymous';
  let scannedArgs = null;
  let customDirs = {};
  const wakeups = [{ id: 'w1', appId: 'antigravity', name: 'Hourly', enabled: true }];
  const groups = [{ id: 'g1', name: '主力', color: '#2563eb' }];

  registerDesktopIpc({
    ipcMain: h.ipcMain,
    getWindow: h.getWindow,
    portalUrl: 'https://noyapi.cn/assistant/',
    host: { snapshot: () => ({ status: authStatus }), read: async () => ({}), login: async () => ({}), logout: async () => ({}) },
    usageScanner: {
      scanLocalUsage: async args => {
        scannedArgs = args;
        return {
          appId: args.appId,
          dataDir: args.customDir || 'C:\\default',
          totals: { totalTokens: 1200, inputTokens: 800, thinkingTokens: 100, outputTokens: 200, cacheTokens: 100, turns: 4, sessions: 1 },
          trend: [], byModel: [], byWorkspace: [], bySessionType: [], sessions: [], filters: { models: [], workspaces: [] },
        };
      },
    },
    pickDirectory: async () => 'D:\\custom-ag',
    wakeup: {
      list: async ({ appId }) => ({ tasks: wakeups.filter(w => !appId || w.appId === appId), history: [] }),
      save: async input => ({ tasks: [...wakeups, { id: 'w2', ...input }], history: [] }),
      toggle: async ({ id, enabled }) => ({ tasks: wakeups.map(w => w.id === id ? { ...w, enabled } : w), history: [] }),
      remove: async () => ({ tasks: [], history: [] }),
      runNow: async ({ id }) => ({ result: { ok: true, id }, tasks: wakeups, history: [{ taskId: id, status: 'ok' }] }),
    },
    accounts: {
      groupsList: async () => ({ groups }),
      groupsSave: async g => ({ groups: [...groups, { id: 'g2', ...g }] }),
      groupsRemove: async () => ({ groups: [] }),
      groupsAssign: async () => ({ ok: true }),
      settingsGet: async () => ({ autoRefreshMinutes: 15, customDataDirs: customDirs }),
      settingsUpdate: async patch => {
        if (patch.customDataDir) customDirs = { ...customDirs, [patch.customDataDir.appId]: patch.customDataDir.dirPath };
        return { autoRefreshMinutes: patch.autoRefreshMinutes ?? 15, customDataDirs: customDirs };
      },
      totpMigrationPayload: async () => ({
        items: [{ name: 'GitHub', issuer: 'GitHub', secret: 'JBSWY3DPEHPK3PXP', period: 30, digits: 6 }],
      }),
    },
  });

  const invoke = h.handlers.get(DESKTOP_CHANNEL);
  const pickRes = await invoke(h.event(), { operation: 'accounts.usageSetDir', appId: 'antigravity', pick: true });
  assert.equal(pickRes.ok, true);
  assert.equal(pickRes.value.dirPath, 'D:\\custom-ag');

  const scanRes = await invoke(h.event(), { operation: 'accounts.usageScan', appId: 'antigravity', range: '7d', granularity: 'day' });
  assert.equal(scanRes.ok, true);
  assert.equal(scannedArgs.customDir, 'D:\\custom-ag');
  assert.equal(scanRes.value.totals.totalTokens, 1200);

  const wakeList = await invoke(h.event(), { operation: 'accounts.wakeupList', appId: 'antigravity' });
  assert.equal(wakeList.ok, true);
  assert.equal(wakeList.value.tasks.length, 1);

  authStatus = 'authenticated';
  const grpSave = await invoke(h.event(), { operation: 'accounts.groupsSave', name: 'VIP', color: '#10b981' });
  assert.equal(grpSave.ok, true);
  assert.equal(grpSave.value.groups.length, 2);

  const migRes = await invoke(h.event(), { operation: 'accounts.totpMigrationPayload', ids: ['t1'] });
  assert.equal(migRes.ok, true);
  assert.equal(migRes.value.items[0].issuer, 'GitHub');

  // Dropped apps must be rejected
  const droppedScan = await invoke(h.event(), { operation: 'accounts.usageScan', appId: 'trae' });
  assert.equal(droppedScan.ok, false);
  assert.equal(droppedScan.error.code, 'IPC_MESSAGE_INVALID');
});

test('desktop-ipc v1.19 gates telemetry.sync & tickets.* by session and builds diagnostics strictly in main process', async () => {
  const h = harness();
  let authStatus = 'anonymous';
  const recordedEvents = [];
  const createdTickets = [];
  const tktId = 'tkt_' + 'ef012345'.repeat(4);

  registerDesktopIpc({
    ipcMain: h.ipcMain,
    getWindow: h.getWindow,
    portalUrl: 'https://noyapi.cn/assistant/',
    proxy: { start: async () => ({ state: 'running', host: '127.0.0.1', port: 17899, lastExit: null }), stop: async () => ({ state: 'stopped', host: '127.0.0.1', port: 17899, lastExit: null }) },
    telemetry: {
      recordEvent: ev => recordedEvents.push(ev),
      status: () => ({ lastSyncedAt: null, lastSyncStatus: 'idle', lastAcceptedBuckets: 0, lastAcceptedEvents: 0, pendingEventsCount: recordedEvents.length, lastError: null }),
      syncNow: async () => ({ lastSyncedAt: '2026-11-22T07:10:00.000Z', lastSyncStatus: 'synced', lastAcceptedBuckets: 2, lastAcceptedEvents: recordedEvents.length, pendingEventsCount: 0, lastError: null }),
      buildDiagnosticSnapshot: () => ({ appVersion: '0.2.0', platform: 'windows', environmentMode: 'safe_tunnel', proxyState: 'running', recentErrorCodes: [], recentRequestIds: [] }),
    },
    host: {
      snapshot: () => ({ status: authStatus }),
      read: async () => ({}),
      login: async () => ({}),
      logout: async () => ({}),
      createTicket: async args => {
        createdTickets.push(args);
        const ts = '2026-11-22T07:10:00.000Z';
        return {
          ticket: { ticketId: tktId, subject: args.subject, category: args.category, priority: 'normal', status: 'submitted', unreadByCustomer: false, createdAt: ts, updatedAt: ts },
          message: { messageId: 'm1', authorRole: 'customer', authorName: 'U', body: args.body, createdAt: ts },
        };
      },
      listTickets: async () => ({ data_source: 'real', tickets: [] }),
      getTicket: async id => ({
        data_source: 'real',
        ticket: { ticketId: id, subject: 'Test', category: 'connection', priority: 'normal', status: 'submitted', createdAt: '2026-11-22T07:10:00.000Z', updatedAt: '2026-11-22T07:10:00.000Z' },
        diagnosticSnapshot: null,
        messages: [],
      }),
      replyTicket: async (id, args) => ({
        ticket: { ticketId: id, subject: 'Test', category: 'connection', priority: 'normal', status: 'closed', createdAt: '2026-11-22T07:10:00.000Z', updatedAt: '2026-11-22T07:12:00.000Z' },
        message: null,
      }),
    },
  });

  const invoke = h.handlers.get(DESKTOP_CHANNEL);
  const telStatusAnon = await invoke(h.event(), { operation: 'telemetry.status' });
  assert.equal(telStatusAnon.ok, true);

  const telSyncAnon = await invoke(h.event(), { operation: 'telemetry.sync' });
  assert.equal(telSyncAnon.ok, false);
  assert.equal(telSyncAnon.error.code, 'AUTH_REQUIRED');

  const ticketAnon = await invoke(h.event(), { operation: 'tickets.list', status: 'all' });
  assert.equal(ticketAnon.ok, false);
  assert.equal(ticketAnon.error.code, 'AUTH_REQUIRED');

  authStatus = 'authenticated';
  await invoke(h.event(), { operation: 'proxy.start' });
  assert.equal(recordedEvents.some(e => e.category === 'tunnel' && e.action === 'tunnel_started'), true);

  const telSyncAuth = await invoke(h.event(), { operation: 'telemetry.sync' });
  assert.equal(telSyncAuth.ok, true);
  assert.equal(telSyncAuth.value.lastSyncStatus, 'synced');

  const ticketRes = await invoke(h.event(), {
    operation: 'tickets.create',
    subject: '连不上节点',
    category: 'connection',
    body: '提示超时',
    includeDiagnostics: true,
  });
  assert.equal(ticketRes.ok, true);
  assert.equal(createdTickets[0].diagnosticSnapshot.appVersion, '0.2.0');

  const detRes = await invoke(h.event(), { operation: 'tickets.detail', ticketId: tktId });
  assert.equal(detRes.ok, true);

  const closeRes = await invoke(h.event(), { operation: 'tickets.reply', ticketId: tktId, action: 'close', body: '' });
  assert.equal(closeRes.ok, true);
  assert.equal(closeRes.value.ticket.status, 'closed');
});

test('desktop-ipc routes agent.closeApp, rejects removed browser.fingerprintCheck, and hydrates exitGeo from tunnelStatus', async () => {
  const h = harness();
  const calls = [];
  let hydratedGeo = null;
  const environment = {
    getMode: () => 'safe_tunnel',
    getExitGeo: () => hydratedGeo,
    updateExitGeo: ctx => { hydratedGeo = ctx; },
  };
  h.host.read = async kind => {
    calls.push(['read', kind]);
    if (kind === 'tunnelStatus') {
      return {
        status: 'running',
        desired: 'active',
        applied: 'active',
        observed: 'active',
        health: 'known',
        revoked: false,
        exitContext: { countryCode: 'US', timezone: 'America/Los_Angeles', locale: 'en-US' },
      };
    }
    return {};
  };

  registerDesktopIpc({
    ipcMain: h.ipcMain,
    getWindow: h.getWindow,
    portalUrl: 'https://noyapi.cn/assistant/',
    host: h.host,
    environment,
    agents: {
      list: async () => [{ profileId: 'codex-desktop-main', appId: 'codex-desktop', status: 'stopped' }],
      stopAllForApp: async appId => { calls.push(['stopAllForApp', appId]); return [{ id: 'codex-desktop-main' }]; },
    },
    processRestarter: {
      closeAppProcesses: async appId => {
        calls.push(['closeAppProcesses', appId]);
        return { appId, supported: true, closedCount: 1, forcedCount: 0, remainingCount: 0 };
      },
    },
    browser: {},
  });

  const invoke = h.handlers.get(DESKTOP_CHANNEL);
  const closeRes = await invoke(h.event(), { operation: 'agent.closeApp', appId: 'codex-desktop' });
  assert.equal(closeRes.ok, true);
  assert.equal(closeRes.value.closedCount, 1);

  const fpRes = await invoke(h.event(), { operation: 'browser.fingerprintCheck', appId: 'metamuse', instanceId: 'muse-2' });
  assert.equal(fpRes.ok, false);
  assert.equal(fpRes.error.code, 'IPC_MESSAGE_INVALID');

  const readRes = await invoke(h.event(), { operation: 'read', kind: 'tunnelStatus' });
  assert.equal(readRes.ok, true);
  assert.equal(calls.some(c => c[0] === 'read' && c[1] === 'tunnelStatus'), true);
  assert.equal(hydratedGeo?.countryCode, 'US');

  const envRes = await invoke(h.event(), { operation: 'proxy.environment' });
  assert.equal(envRes.ok, true);

  const badClose = await invoke(h.event(), { operation: 'agent.closeApp', appId: 'trae' });
  assert.equal(badClose.ok, false);
  assert.equal(badClose.error.code, 'IPC_MESSAGE_INVALID');
});

test('desktop-ipc supports safe_tunnel <-> own_network and rejects strong_tun and elevation operations', async () => {
  const h = harness();
  const env = createEnvironmentModeController({ initialMode: 'safe_tunnel' });

  registerDesktopIpc({
    ipcMain: h.ipcMain,
    getWindow: h.getWindow,
    portalUrl: 'https://noyapi.cn/assistant/',
    host: h.host,
    environment: env,
  });

  const invoke = h.handlers.get(DESKTOP_CHANNEL);
  const env0 = await invoke(h.event(), { operation: 'proxy.environment' });
  assert.equal(env0.ok, true);
  assert.equal(env0.value.mode, 'safe_tunnel');
  assert.equal(env0.value.requiresTunnel, true);

  for (const removedOp of ['proxy.elevation.status', 'proxy.tun.relaunchElevated']) {
    const removedRes = await invoke(h.event(), { operation: removedOp });
    assert.equal(removedRes.ok, false);
    assert.equal(removedRes.error.code, 'IPC_MESSAGE_INVALID');
  }

  const denied = await invoke(h.event(), { operation: 'proxy.mode.set', mode: 'strong_tun' });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'IPC_MESSAGE_INVALID');
  assert.equal(env.getMode(), 'safe_tunnel');

  const okOwn = await invoke(h.event(), { operation: 'proxy.mode.set', mode: 'own_network' });
  assert.equal(okOwn.ok, true);
  assert.equal(okOwn.value.mode, 'own_network');
  assert.equal(okOwn.value.requiresTunnel, false);

  const okSafe = await invoke(h.event(), { operation: 'proxy.mode.set', mode: 'safe_tunnel' });
  assert.equal(okSafe.ok, true);
  assert.equal(okSafe.value.mode, 'safe_tunnel');
});

test('desktop-ipc exposes actionable launch/permission error codes instead of swallowing as DESKTOP_OPERATION_FAILED', async () => {
  for (const [code, pattern] of [
    ['EPERM', /系统权限/],
    ['EACCES', /权限不足/],
    ['ENOENT', /可执行文件/],
    ['LAUNCH_FAILED', /未能启动/],
    ['AGENT_START_FAILED', /未能启动/],
    ['TEMPLATE_INVALID', /启动模板无效/],
  ]) {
    const h = harness();
    h.host.agent = {
      start: async () => { throw Object.assign(new Error('raw detail'), { code }); },
    };
    registerDesktopIpc({ ...h, portalUrl: 'https://noyapi.cn/assistant/' });
    const res = await h.handlers.get(DESKTOP_CHANNEL)(h.event(), { operation: 'agent.start', instanceId: 'codex-desktop-main' });
    assert.equal(res.ok, false);
    assert.equal(res.error.code, code);
    assert.match(res.error.message, pattern);
    assert.notEqual(res.error.message, '桌面操作未完成。');
  }
});

test('desktop-ipc agent.closeApp preserves honest timedOut and negative/positive remainingCount', async () => {
  for (const mockRes of [
    { appId: 'codex-desktop', supported: true, closedCount: 1, forcedCount: 0, remainingCount: 2, timedOut: false },
    { appId: 'antigravity', supported: true, closedCount: 0, forcedCount: 0, remainingCount: -1, timedOut: true, error: 'PROCESS_CLOSE_TIMEOUT' },
  ]) {
    const h = harness();
    registerDesktopIpc({
      ...h,
      portalUrl: 'https://noyapi.cn/assistant/',
      processRestarter: { closeAppProcesses: async () => mockRes },
    });
    const res = await h.handlers.get(DESKTOP_CHANNEL)(h.event(), { operation: 'agent.closeApp', appId: mockRes.appId });
    assert.equal(res.ok, true);
    assert.equal(res.value.remainingCount, mockRes.remainingCount);
    assert.equal(res.value.timedOut, mockRes.timedOut);
    if (mockRes.error) assert.equal(res.value.error, mockRes.error);
  }
});

test('v1.24 desktop-ipc projects allowlisted lastExitCategory, exposes PROXY_* diagnostics, and does not audit upstream INTERNAL_ERROR as ipc_operation_failed', async () => {
  const audited = [];
  const h = harness();
  let nextStatus = { state: 'failed', host: '127.0.0.1', port: 17899, lastExit: 'code:1', lastExitCategory: 'PROXY_DNS_ERROR' };
  registerDesktopIpc({
    ipcMain: h.ipcMain,
    getWindow: h.getWindow,
    portalUrl: 'https://noyapi.cn/assistant/',
    host: {
      snapshot: () => ({ status: 'authenticated', device: { id: 'dev_1' } }),
      read: async () => { throw Object.assign(new Error('upstream 500'), { code: 'INTERNAL_ERROR', status: 500 }); },
      login: async () => ({}),
      logout: async () => ({}),
    },
    proxy: {
      status: () => nextStatus,
      start: async () => { throw Object.assign(new Error('dns failed'), { code: 'PROXY_DNS_ERROR' }); },
      stop: () => ({ state: 'stopped', host: '127.0.0.1', port: 17899, lastExit: null, lastExitCategory: null }),
    },
    onAudit: (ev, details) => audited.push({ ev, details }),
  });
  const invoke = h.handlers.get(DESKTOP_CHANNEL);

  const st1 = await invoke(h.event(), { operation: 'proxy.status' });
  assert.equal(st1.ok, true);
  assert.equal(st1.value.lastExitCategory, 'PROXY_DNS_ERROR');

  nextStatus = { state: 'failed', host: '127.0.0.1', port: 17899, lastExit: 'code:1', lastExitCategory: 'RAW_UNSAFE_LEAK' };
  const st2 = await invoke(h.event(), { operation: 'proxy.status' });
  assert.equal(st2.ok, true);
  assert.equal(st2.value.lastExitCategory, undefined);

  const startFail = await invoke(h.event(), { operation: 'proxy.start' });
  assert.equal(startFail.ok, false);
  assert.equal(startFail.error.code, 'PROXY_DNS_ERROR');
  assert.match(startFail.error.message, /DNS/);

  const readFail = await invoke(h.event(), { operation: 'read', kind: 'relays' });
  assert.equal(readFail.ok, false);
  assert.equal(readFail.error.code, 'INTERNAL_ERROR');
  assert.equal(audited.some(e => e.ev === 'ipc_operation_failed'), false);
});

test('agent.closeApp works on first click with real synchronous createAgentInstanceHost and preserves allowlisted audit codes on uncaught TypeError', async () => {
  const h = harness();
  const audited = [];
  const children = [];
  const fakeLauncher = {
    plan: app => ({ appId: app.id, adapter: app.template.adapter, activation: 'restart-required', command: 'Antigravity', args: [], envKeys: [], injection: { args: [], env: {} } }),
    detect: async () => ({ status: 'installed', path: 'C:\\Antigravity\\Antigravity.exe', command: 'Antigravity' }),
    launch: () => {
      const proc = new EventEmitter();
      proc.pid = 40000 + children.length;
      proc.kill = () => { queueMicrotask(() => proc.emit('exit', 0, null)); };
      children.push(proc);
      queueMicrotask(() => proc.emit('spawn'));
      return proc;
    },
    launchWithSafeContext() { return this.launch(); },
  };
  const realAgentHost = createAgentInstanceHost({
    platform: 'windows',
    launcher: fakeLauncher,
    isAuthenticated: () => true,
    isProxyReady: () => true,
    environmentModeProvider: () => 'safe_tunnel',
    scopeProvider: () => 'dev-real-sync',
  });
  assert.equal(Array.isArray(realAgentHost.list()), true, 'real createAgentInstanceHost.list() must be synchronous');

  let osProcessRunning = false;
  registerDesktopIpc({
    ipcMain: h.ipcMain,
    getWindow: h.getWindow,
    portalUrl: 'https://noyapi.cn/assistant/',
    host: {
      snapshot: () => ({ status: 'authenticated', device: { id: 'dev-real-sync' } }),
      read: async () => { throw new TypeError('cannot read property secretPath of undefined'); },
      login: async () => ({}),
      logout: async () => ({}),
    },
    agents: realAgentHost,
    processRestarter: {
      isAppRunning: async () => ({ appId: 'antigravity', supported: true, running: osProcessRunning, count: osProcessRunning ? 2 : 0 }),
      closeAppProcesses: async appId => {
        osProcessRunning = false;
        return { appId, supported: true, closedCount: 1, forcedCount: 0, remainingCount: 0, timedOut: false };
      },
    },
    onAudit: (ev, details) => audited.push(sanitizeAuthAudit(ev, details)),
  });

  const invoke = h.handlers.get(DESKTOP_CHANNEL);
  const created = await invoke(h.event(), { operation: 'agent.create', alias: 'antigravity-main', appId: 'antigravity', credentialSlotIds: [] });
  assert.equal(created.ok, true);
  const started1 = await invoke(h.event(), { operation: 'agent.start', instanceId: 'antigravity-main' });
  assert.equal(started1.ok, true);
  await new Promise(r => setTimeout(r, 10));

  const running1 = await invoke(h.event(), { operation: 'agent.isRunning', appId: 'antigravity' });
  assert.equal(running1.ok, true);
  assert.equal(running1.value.running, true);
  assert.equal(running1.value.managedRunning, true);

  // First click closeApp while antigravity-main is running must NOT throw TypeError on synchronous agent.list()
  const close1 = await invoke(h.event(), { operation: 'agent.closeApp', appId: 'antigravity' });
  assert.equal(close1.ok, true);
  assert.equal(close1.value.stoppedProfiles, 1);
  assert.equal(close1.value.remainingCount, 0);

  // Immediately restarting antigravity-main succeeds on first try
  const started2 = await invoke(h.event(), { operation: 'agent.start', instanceId: 'antigravity-main' });
  assert.equal(started2.ok, true);

  // External OS-only process probe also reports running: true
  await invoke(h.event(), { operation: 'agent.closeApp', appId: 'antigravity' });
  osProcessRunning = true;
  const runningExt = await invoke(h.event(), { operation: 'agent.isRunning', appId: 'antigravity' });
  assert.equal(runningExt.ok, true);
  assert.equal(runningExt.value.running, true);
  assert.equal(runningExt.value.managedRunning, false);
  assert.equal(runningExt.value.processCount, 2);

  // Uncaught TypeError maps to DESKTOP_OPERATION_FAILED and preserves sanitized JS_TYPE_ERROR in auth audit
  const uncaught = await invoke(h.event(), { operation: 'read', kind: 'relays' });
  assert.equal(uncaught.ok, false);
  assert.equal(uncaught.error.code, 'DESKTOP_OPERATION_FAILED');
  assert.deepEqual(audited, [{ event: 'ipc_operation_failed', code: 'JS_TYPE_ERROR' }]);
});

test('accounts.oauthCopyUrl copies trusted HTTPS OAuth URL in main process without accepting arbitrary renderer text', async () => {
  const h = harness();
  const clipboardWrites = [];
  const flows = new Map([
    ['abcdef012345', { flowId: 'abcdef012345', appId: 'antigravity', status: 'pending', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test&state=xyz' }],
    ['fedcba543210', { flowId: 'fedcba543210', appId: 'copilot', status: 'pending', authUrl: null, verificationUri: 'https://github.com/login/device' }],
    ['112233445566', { flowId: '112233445566', appId: 'antigravity', status: 'pending', authUrl: 'javascript:alert(1)' }],
  ]);
  registerDesktopIpc({
    ...h,
    portalUrl: 'https://noyapi.cn/assistant/',
    accounts: { list: async () => ({ accounts: [], activeByApp: {} }) },
    oauth: {
      status: async ({ flowId }) => {
        const f = flows.get(flowId);
        if (!f) throw Object.assign(new Error('not found'), { code: 'OAUTH_FLOW_NOT_FOUND' });
        return f;
      },
    },
    writeClipboardText: text => { clipboardWrites.push(text); },
  });
  const invoke = h.handlers.get(DESKTOP_CHANNEL);

  // Antigravity PKCE URL
  const res1 = await invoke(h.event(), { operation: 'accounts.oauthCopyUrl', flowId: 'abcdef012345' });
  assert.equal(res1.ok, true);
  assert.equal(res1.value.copied, true);
  assert.equal(res1.value.url, 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test&state=xyz');
  assert.deepEqual(clipboardWrites, ['https://accounts.google.com/o/oauth2/v2/auth?client_id=test&state=xyz']);

  // Device code verificationUri fallback
  const res2 = await invoke(h.event(), { operation: 'accounts.oauthCopyUrl', flowId: 'fedcba543210' });
  assert.equal(res2.ok, true);
  assert.equal(res2.value.copied, true);
  assert.equal(res2.value.url, 'https://github.com/login/device');

  // Non-HTTPS URL rejected
  const resBadScheme = await invoke(h.event(), { operation: 'accounts.oauthCopyUrl', flowId: '112233445566' });
  assert.equal(resBadScheme.ok, false);
  assert.equal(resBadScheme.error.code, 'OAUTH_FLOW_NOT_FOUND');

  // Extra fields / arbitrary text injection rejected by validRequest
  const resInject = await invoke(h.event(), { operation: 'accounts.oauthCopyUrl', flowId: 'abcdef012345', text: 'evil' });
  assert.equal(resInject.ok, false);
  assert.equal(resInject.error.code, 'IPC_MESSAGE_INVALID');
});
