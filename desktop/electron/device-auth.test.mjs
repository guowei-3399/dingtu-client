import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceAuthHost } from './device-auth.mjs';

test('logout during a pending secure-store write cannot restore a late session', async () => {
  const saved = store(); let release, entered;
  const writing = new Promise(resolve => { entered = resolve; });
  const originalSave = saved.save;
  saved.save = async value => { entered(); await new Promise(resolve => { release = resolve; }); return originalSave(value); };
  const host = createDeviceAuthHost({ platform: 'linux', store: saved, startLoopback: async () => loopback(), createClient: clientFactory([]), openExternal: async () => true });
  await host.ready;
  const pending = host.login(); const rejected = assert.rejects(pending, { code: 'AUTHORIZATION_CANCELLED' });
  await writing; await host.logout(); release(); await rejected;
  assert.equal(host.snapshot().status, 'signed_out'); assert.equal(await saved.load(), null);
});

test('concurrent refresh calls rotate a single-use refresh token once', async () => {
  const saved = store(), calls = []; let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const factory = clientFactory(calls);
  const host = createDeviceAuthHost({ platform: 'linux', store: saved, startLoopback: async () => loopback(), createClient: options => {
    const client = factory(options), refresh = client.refreshDeviceSession;
    client.refreshDeviceSession = async (...args) => { entered(); await new Promise(resolve => { release = resolve; }); return refresh(...args); };
    return client;
  }, openExternal: async () => true });
  await host.login(); const first = host.refresh(); await started; const second = host.refresh(); release();
  await Promise.all([first, second]); assert.equal(calls.filter(row => row[0] === 'refresh').length, 1);
});

const key = { kty: 'OKP', crv: 'Ed25519', x: 'A'.repeat(43), d: 'B'.repeat(43) };
const session = (overrides = {}) => ({ device: { id: '9d8dbf5b-fbc4-4454-a73a-f727409566c0', platform: 'linux', appVersion: '1.0.0', status: 'active', createdAt: '2026-10-28T00:00:00.000Z' }, session: { accessToken: 'nda_' + 'a'.repeat(43), expiresIn: 600, refreshToken: 'ndr_' + 'b'.repeat(43), refreshExpiresAt: '2026-11-27T00:00:00.000Z', scope: ['customer.read', 'catalog.read', 'member.read', 'identity.read', 'tunnel.read', 'tunnel.heartbeat', 'device.revoke'] }, ...overrides });
function store() { let value = null; return { available: () => true, async load() { return value ? structuredClone(value) : null; }, async save(next) { value = structuredClone(next); return true; }, async clear() { const had = value !== null; value = null; return had; }, raw() { return value; } }; }
function loopback() { let cancelled = false; return { request: { redirectUri: 'http://127.0.0.1:43123/callback', codeVerifier: 'v'.repeat(86), codeChallenge: 'c'.repeat(43), state: 's'.repeat(43) }, async waitForCode() { while (!cancelled) { await new Promise(resolve => setImmediate(resolve)); return { code: 'authorization-code', state: 's'.repeat(43) }; } throw Object.assign(new Error('cancelled'), { code: 'AUTHORIZATION_CANCELLED' }); }, cancel() { cancelled = true; } }; }
function clientFactory(calls) { return ({ tokenProvider, refreshTokenProvider } = {}) => ({ authorizationUrl(input) { calls.push(['url', input]); return 'https://noyapi.cn/api/v1/client/authorize?state=' + input.state; }, async createDeviceSession(input) { calls.push(['exchange', input]); return session(); }, async refreshDeviceSession(id, refresh) { calls.push(['refresh', id, refresh]); return session({ device: { ...session().device, id }, session: { ...session().session, accessToken: 'nda_' + 'c'.repeat(43), refreshToken: 'ndr_' + 'd'.repeat(43) } }); }, async revokeDeviceSession(id) { calls.push(['revoke', id]); return null; }, async getMe() { return { user: { id: 'u1' }, csrfToken: null, expiresAt: '2026-10-28T00:10:00.000Z' }; }, async getCatalog(platform) { return { data_source: 'real', platform, apps: [] }; }, async getOverview() { return { data_source: 'real' }; }, async getEntitlements() { return { customer: { id: 'c1' }, entitlement: null }; }, async getMembers() { return { members: [] }; }, async getIdentities() { return { identities: [], nextCursor: null }; }, async listDevices() { return { devices: [] }; }, async getTunnelStatus() { return { status: 'unknown' }; } }); }

test('a transient refresh failure preserves the secure session for a later retry', async () => {
  const saved = store(); let currentTime = Date.parse('2026-11-05T00:00:00Z'); let unavailable = true;
  const host = createDeviceAuthHost({ platform: 'linux', store: saved, now: () => currentTime, startLoopback: async () => loopback(), createClient: options => {
    const client = clientFactory([])(options), refresh = client.refreshDeviceSession;
    client.refreshDeviceSession = async (...args) => { if (unavailable) throw Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' }); return refresh(...args); };
    return client;
  }, openExternal: async () => true });
  await host.login(); currentTime += 600_000;
  await assert.rejects(host.read('me'), { code: 'NETWORK_ERROR' });
  assert.equal(host.snapshot().status, 'authenticated');
  assert.ok(await saved.load());
  unavailable = false;
  assert.equal((await host.read('me')).user.id, 'u1');
});

test('login audit captures failures before a loopback receiver exists without leaking input', async () => {
  const captured = [], saved = store(); saved.available = () => false;
  const host = createDeviceAuthHost({ platform: 'linux', store: saved, createClient: clientFactory([]), openExternal: async () => true, onAudit: (event, record) => captured.push({ event, record }) });
  await assert.rejects(host.login(), { code: 'SECURE_STORE_UNAVAILABLE' });
  assert.equal(captured.at(-1).event, 'login_failed');
  assert.equal(captured.at(-1).record.code, 'SECURE_STORE_UNAVAILABLE');
});

test('account read audit retains only safe failure metadata', async () => {
  const captured = [], saved = store();
  const host = createDeviceAuthHost({ platform: 'linux', store: saved, startLoopback: async () => loopback(), createClient: options => {
    const client = clientFactory([])(options);
    client.getMe = async () => { throw Object.assign(new Error('cookie=RAW_SECRET'), { status: 503, code: 'AUTH_UNAVAILABLE', requestId: 'req_account' }); };
    return client;
  }, openExternal: async () => true, onAudit: (event, record) => captured.push({ event, record }) });
  await host.login();
  await assert.rejects(host.read('me'), { code: 'AUTH_UNAVAILABLE' });
  assert.deepEqual(captured.at(-1), { event: 'account_read_failed', record: { event: 'account_read_failed', status: 503, code: 'AUTH_UNAVAILABLE', request_id: 'req_account' } });
  assert.doesNotMatch(JSON.stringify(captured), /RAW_SECRET|nda_|ndr_|authorization-code/);
});

test('device auth opens browser PKCE, exchanges once, and stores all session secrets only through the store', async () => {
  const calls = [], saved = store(), urls = [];
  const host = createDeviceAuthHost({ platform: 'linux', appVersion: '1.0.0', deviceName: 'Noya test', store: saved, startLoopback: async () => loopback(), createClient: clientFactory(calls), openExternal: async url => { urls.push(url); return true; }, now: () => Date.parse('2026-10-28T00:00:00Z'), keyPair: { privateKeyJwk: key, publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'A'.repeat(43) } } });
  await host.ready;
  assert.equal(host.snapshot().status, 'signed_out');
  const result = await host.login();
  assert.equal(result.status, 'authenticated'); assert.equal(urls.length, 1); assert.equal(calls[1][0], 'exchange');
  assert.equal(calls[1][1].authorizationCode, 'authorization-code'); assert.equal(calls[1][1].devicePublicKey.d, undefined);
  assert.equal(host.snapshot().accessToken, undefined); assert.equal(saved.raw().session.accessToken.startsWith('nda_'), true);
  assert.deepEqual(await host.read('catalog', { platform: 'linux' }), { data_source: 'real', platform: 'linux', apps: [] });
});

test('desktop reads are allowlisted and logout clears the device session even when revoke fails', async () => {
  const calls = [], saved = store(); const host = createDeviceAuthHost({ platform: 'linux', store: saved, startLoopback: async () => loopback(), createClient: clientFactory(calls), openExternal: async () => true, keyPair: { privateKeyJwk: key, publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'A'.repeat(43) } } });
  await host.ready; await host.login();
  await assert.rejects(host.read('tunnelConfig'), error => error.code === 'READ_NOT_ALLOWED');
  await assert.rejects(host.read('../me'), error => error.code === 'READ_NOT_ALLOWED');
  const before = host.snapshot(); assert.equal(before.status, 'authenticated');
  const after = await host.logout(); assert.equal(after.status, 'signed_out'); assert.equal(await saved.load(), null);
});

test('a failed browser open cancels the loopback and never writes a session', async () => {
  const saved = store(); let cancelled = false;
  const receiver = loopback(); receiver.cancel = () => { cancelled = true; };
  const host = createDeviceAuthHost({ platform: 'linux', store: saved, startLoopback: async () => receiver, createClient: clientFactory([]), openExternal: async () => false, keyPair: { privateKeyJwk: key, publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'A'.repeat(43) } } });
  await host.ready; await assert.rejects(host.login(), error => error.code === 'AUTH_BROWSER_OPEN_FAILED'); assert.equal(cancelled, true); assert.equal(await saved.load(), null);
});

test('a read that finishes after logout cannot return the previous device data', async () => {
  const saved = store(); let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const host = createDeviceAuthHost({ platform: 'linux', store: saved, startLoopback: async () => loopback(), createClient: options => {
    const client = clientFactory([])(options);
    client.getCatalog = async platform => { entered(); await gate; return { data_source: 'real', platform, apps: [] }; };
    return client;
  }, openExternal: async () => true, keyPair: { privateKeyJwk: key, publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'A'.repeat(43) } } });
  await host.login(); const pending = host.read('catalog', { platform: 'linux' }); await started;
  await host.logout(); release(); await assert.rejects(pending, { code: 'AUTH_REQUIRED' });
});

test('refresh refuses a server response for another device and preserves the stored session', async () => {
  const saved = store(), other = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const host = createDeviceAuthHost({ platform: 'linux', store: saved, startLoopback: async () => loopback(), createClient: options => {
    const client = clientFactory([])(options);
    client.refreshDeviceSession = async () => ({ ...session(), device: { ...session().device, id: other } });
    return client;
  }, openExternal: async () => true, keyPair: { privateKeyJwk: key, publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'A'.repeat(43) } } });
  await host.login(); const before = (await saved.load()).session.refreshToken;
  await assert.rejects(host.refresh(), { code: 'AUTH_REQUIRED' });
  assert.equal((await saved.load()).session.refreshToken, before);
});

test('a revoked device 401 clears the session and notifies the local proxy owner', async () => {
  const saved = store(), invalidations = [];
  const host = createDeviceAuthHost({ platform: 'linux', store: saved, startLoopback: async () => loopback(), createClient: options => {
    const client = clientFactory([])(options);
    client.getCatalog = async () => { throw Object.assign(new Error('revoked'), { status: 401, code: 'INVALID_SUBSCRIPTION_TOKEN' }); };
    return client;
  }, onSessionInvalid: event => { invalidations.push(event); }, openExternal: async () => true,
    keyPair: { privateKeyJwk: key, publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'A'.repeat(43) } } });
  await host.login();
  await assert.rejects(host.read('catalog', { platform: 'linux' }), { status: 401 });
  assert.equal(host.snapshot().status, 'signed_out');
  assert.equal(await saved.load(), null);
  assert.deepEqual(invalidations, [{ status: 401, code: 'INVALID_SUBSCRIPTION_TOKEN' }]);
});

test('a refresh 401 clears the session and notifies the local proxy owner', async () => {
  const saved = store(), invalidations = [];
  const host = createDeviceAuthHost({ platform: 'linux', store: saved, startLoopback: async () => loopback(), createClient: options => {
    const client = clientFactory([])(options);
    client.refreshDeviceSession = async () => { throw Object.assign(new Error('revoked'), { status: 401, code: 'SESSION_INVALID' }); };
    return client;
  }, onSessionInvalid: event => { invalidations.push(event); }, openExternal: async () => true,
    keyPair: { privateKeyJwk: key, publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'A'.repeat(43) } } });
  await host.login();
  await assert.rejects(host.refresh(), { status: 401 });
  assert.equal(host.snapshot().status, 'signed_out');
  assert.equal(await saved.load(), null);
  assert.deepEqual(invalidations, [{ status: 401, code: 'SESSION_INVALID' }]);
});

test('cancelling while the loopback receiver is starting never opens a stale browser request', async () => {
  let receiverStarting;
  let finishReceiver;
  const starting = new Promise(resolve => { receiverStarting = resolve; });
  const receiverReady = new Promise(resolve => { finishReceiver = resolve; });
  const saved = store();
  const calls = [];
  let browserOpenCount = 0;
  const host = createDeviceAuthHost({
    platform: 'linux',
    store: saved,
    createClient: clientFactory(calls),
    startLoopback() { receiverStarting(); return receiverReady; },
    openExternal: async () => { browserOpenCount++; return true; },
  });
  const pending = assert.rejects(host.login(), { code: 'AUTHORIZATION_CANCELLED' });
  await starting;
  host.cancelLogin();
  finishReceiver(loopback());
  await pending;
  assert.equal(browserOpenCount, 0);
  assert.equal(calls.length, 0);
  assert.equal(await saved.load(), null);
});

test('cancelling after callback cannot interrupt a device session commit', async () => {
  const saved = store();
  let startedSave;
  let finishSave;
  const saving = new Promise(resolve => { startedSave = resolve; });
  const saveMayFinish = new Promise(resolve => { finishSave = resolve; });
  const save = saved.save;
  saved.save = async next => { startedSave(); await saveMayFinish; return save(next); };
  const host = createDeviceAuthHost({
    platform: 'linux',
    store: saved,
    createClient: clientFactory([]),
    startLoopback: async () => loopback(),
    openExternal: async () => true,
  });
  const loginOutcome = host.login().then(value => ({ value }), error => ({ error }));
  await saving;
  const accepted = host.cancelLogin();
  finishSave();
  const outcome = await loginOutcome;
  assert.equal(accepted, false);
  assert.equal(outcome.value?.status, 'authenticated');
  assert.equal(host.snapshot().status, 'authenticated');
  assert.ok(await saved.load());
});

test('a production handle rejection preserves the operator device session',async()=>{
  const saved=store();
  const factory=clientFactory([]);
  const host=createDeviceAuthHost({platform:'linux',store:saved,startLoopback:async()=>loopback(),openExternal:async()=>true,
    createClient:options=>({...factory(options),createTunnelAuthorization:async()=>({authorizationHandle:'pah_'+'A'.repeat(43),expiresAt:new Date(Date.now()+60000).toISOString()})})});
  await host.login();
  let received;
  await assert.rejects(host.productionConfig({getConfig:async input=>{
    received=input;
    throw Object.assign(Error('expired handle'),{code:'CONFIG_AUTHORIZATION_INVALID',status:401});
  }}),{code:'CONFIG_AUTHORIZATION_INVALID'});
  assert.equal(received.deviceId,session().device.id);
  assert.equal(received.privateKeyJwk.kty,'OKP');
  assert.equal(host.snapshot().status,'authenticated');
  assert.ok(await saved.load());
  host.close();
});

test('production SESSION_INVALID clears the operator session and stops forwarding before store cleanup', async () => {
  const saved = store();
  const events = [];
  const factory = clientFactory([]);
  const clear = saved.clear;
  saved.clear = async () => { events.push('clear'); return clear(); };
  const host = createDeviceAuthHost({ platform: 'linux', store: saved, startLoopback: async () => loopback(),
    openExternal: async () => true, onSessionInvalid: () => events.push('stop'),
    createClient: options => ({ ...factory(options), createTunnelAuthorization: async () => ({}) }) });
  await host.login();
  await assert.rejects(host.productionConfig({ getConfig: async () => {
    throw Object.assign(new Error('revoked'), { code: 'SESSION_INVALID', status: 401 });
  } }), { code: 'SESSION_INVALID' });
  assert.equal(host.snapshot().status, 'signed_out');
  assert.deepEqual(events, ['stop', 'clear']);
  assert.equal(await saved.load(), null);
});

test('a delayed 401 from an old login cannot clear a newer device session', async () => {
  const saved = store();
  let rejectRead;
  let enteredRead;
  const entered = new Promise(resolve => { enteredRead = resolve; });
  const factory = clientFactory([]);
  const host = createDeviceAuthHost({ platform: 'linux', store: saved, startLoopback: async () => loopback(),
    openExternal: async () => true, createClient: options => ({ ...factory(options), getCatalog: () => {
      enteredRead();
      return new Promise((resolve, reject) => { rejectRead = reject; });
    } }) });
  await host.login();
  const pending = host.read('catalog', { platform: 'linux' });
  const rejected = assert.rejects(pending, { code: 'SESSION_INVALID' });
  await entered;
  await host.logout();
  await host.login();
  rejectRead(Object.assign(new Error('old session revoked'), { code: 'SESSION_INVALID', status: 401 }));
  await rejected;
  assert.equal(host.snapshot().status, 'authenticated');
  assert.ok(await saved.load());
});

test('production proofs continue using the key registered before a client restart', async () => {
  const saved = store();
  const factory = clientFactory([]);
  const options = { platform: 'linux', store: saved, startLoopback: async () => loopback(), openExternal: async () => true,
    createClient: value => ({ ...factory(value), createTunnelAuthorization: async () => ({}) }) };
  const first = createDeviceAuthHost(options);
  await first.login();
  const registered = (await saved.load()).privateKeyJwk;
  first.close();
  const restored = createDeviceAuthHost(options);
  let proofKey;
  await restored.productionConfig({ getConfig: async input => { proofKey = input.privateKeyJwk; return {}; } });
  assert.deepEqual(proofKey, registered);
  restored.close();
});

test('logout revokes the captured session while refusing new production requests immediately', async () => {
  const saved = store();
  const factory = clientFactory([]);
  let releaseRevoke;
  let enteredRevoke;
  const entered = new Promise(resolve => { enteredRevoke = resolve; });
  const revokeMayFinish = new Promise(resolve => { releaseRevoke = resolve; });
  const events = [];
  let revokedToken;
  const host = createDeviceAuthHost({ platform: 'linux', store: saved, startLoopback: async () => loopback(),
    openExternal: async () => true, onSessionInvalid: () => events.push('stop'),
    createClient: options => ({ ...factory(options), revokeDeviceSession: async () => {
      revokedToken = await options.tokenProvider();
      enteredRevoke();
      await revokeMayFinish;
    } }) });
  await host.login();
  const logout = host.logout();
  await entered;
  assert.equal(host.snapshot().status, 'signed_out');
  assert.deepEqual(events, ['stop']);
  await assert.rejects(host.productionConfig({ getConfig: async () => assert.fail('connected during logout') }), { code: 'AUTH_REQUIRED' });
  assert.equal(await saved.load(), null);
  assert.equal(revokedToken, session().session.accessToken);
  releaseRevoke();
  await logout;
});

test('v1.17 productionConfig pre-refreshes expiring access tokens before handle request and external refresh notifies tunnel', async () => {
  const saved = store();
  const calls = [];
  const refreshedEvents = [];
  let currentTime = Date.parse('2026-11-21T12:00:00Z');
  const factory = clientFactory(calls);
  const host = createDeviceAuthHost({
    platform: 'linux',
    store: saved,
    now: () => currentTime,
    startLoopback: async () => loopback(),
    openExternal: async () => true,
    onSessionRefreshed: info => refreshedEvents.push(info),
    createClient: options => ({
      ...factory(options),
      createTunnelAuthorization: async () => {
        const bearer = await options.tokenProvider();
        calls.push(['tunnelAuth', bearer]);
        return { authorizationHandle: 'pah_' + 'A'.repeat(43), expiresAt: new Date(currentTime + 60_000).toISOString() };
      },
    }),
  });

  await host.login();
  // Advance 8 minutes: remaining access TTL is 120s (<= 180s threshold), so productionConfig refreshes FIRST without firing external onSessionRefreshed
  currentTime += 480_000;
  await host.productionConfig({ getConfig: async () => ({ ok: true }) });
  const actionOrder = calls.map(row => row[0]);
  const refreshIdx = actionOrder.indexOf('refresh');
  const tunnelIdx = actionOrder.indexOf('tunnelAuth');
  assert.ok(refreshIdx >= 0 && refreshIdx < tunnelIdx, `Expected refresh before tunnelAuth, got ${actionOrder.join(',')}`);
  assert.equal(calls[tunnelIdx][1], 'nda_' + 'c'.repeat(43));
  assert.equal(refreshedEvents.length, 0);

  // External host.refresh() notifies the active tunnel controller so it can immediately rotate the lease
  await host.refresh();
  assert.equal(refreshedEvents.length, 1);
  assert.equal(refreshedEvents[0].deviceId, session().device.id);
  host.close();
});

test('built-in OAuth window handle { ok: true, close } auto-closes on login completion and cancelLogin', async () => {
  const saved = store();
  const calls = [];
  const factory = clientFactory(calls);
  let closeCalls = 0;
  let cancelCalled = false;
  let releaseWait;
  const host = createDeviceAuthHost({
    platform: 'linux',
    store: saved,
    startLoopback: async () => loopback(),
    createClient: factory,
    openExternal: async () => ({
      ok: true,
      close: () => { closeCalls += 1; },
    }),
  });
  await host.login();
  assert.equal(closeCalls, 1);
  host.close();

  const saved2 = store();
  const host2 = createDeviceAuthHost({
    platform: 'linux',
    store: saved2,
    startLoopback: async () => ({
      request: { redirectUri: 'http://127.0.0.1:41999/callback', state: 'st', codeChallenge: 'A'.repeat(43), codeVerifier: 'B'.repeat(43) },
      waitForCode: () => new Promise((_, reject) => { releaseWait = () => reject(Object.assign(new Error('cancelled'), { code: 'AUTHORIZATION_CANCELLED' })); }),
      cancel: () => { cancelCalled = true; releaseWait?.(); },
    }),
    createClient: factory,
    openExternal: async () => ({
      ok: true,
      close: () => { closeCalls += 1; },
    }),
  });
  const loginPromise = host2.login();
  await new Promise(r => setTimeout(r, 15));
  assert.equal(host2.cancelLogin(), true);
  await assert.rejects(loginPromise, { code: 'AUTHORIZATION_CANCELLED' });
  assert.equal(cancelCalled, true);
  assert.equal(closeCalls, 2);
  host2.close();
});

test('an in-flight read returning 401 on a pre-refresh access token retries with the rotated token without invalidating the refreshed session', async () => {
  const saved = store();
  const invalidations = [];
  let enteredFirstRead;
  let releaseFirstRead;
  const firstReadStarted = new Promise(resolve => { enteredFirstRead = resolve; });
  const factory = clientFactory([]);
  const seenTokens = [];

  const host = createDeviceAuthHost({
    platform: 'linux',
    store: saved,
    startLoopback: async () => loopback(),
    openExternal: async () => true,
    onSessionInvalid: ev => invalidations.push(ev),
    createClient: options => {
      const base = factory(options);
      return {
        ...base,
        async getMe() {
          const tok = await options.tokenProvider();
          seenTokens.push(tok);
          if (tok === 'nda_' + 'a'.repeat(43)) {
            enteredFirstRead();
            await new Promise(resolve => { releaseFirstRead = resolve; });
            throw Object.assign(new Error('old token rotated'), { status: 401, code: 'SESSION_INVALID', requestId: 'req_stale_tok' });
          }
          return { user: { id: 'u1' }, csrfToken: null, expiresAt: '2026-10-28T00:10:00.000Z' };
        },
      };
    },
  });

  await host.login();
  const pendingRead = host.read('me');
  await firstReadStarted;
  // Rotate accessToken from nda_aaaa... -> nda_cccc... while getMe() is still in flight
  await host.refresh();
  // Now the server rejects the old pre-refresh token with 401 SESSION_INVALID
  releaseFirstRead();
  const meResult = await pendingRead;
  assert.equal(meResult.user.id, 'u1');
  assert.equal(host.snapshot().status, 'authenticated');
  assert.equal(invalidations.length, 0);
  assert.equal(seenTokens.length, 2);
  assert.equal(seenTokens[0], 'nda_' + 'a'.repeat(43));
  assert.equal(seenTokens[1], 'nda_' + 'c'.repeat(43));
  host.close();
});
