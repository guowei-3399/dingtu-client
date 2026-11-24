import test from 'node:test';
import assert from 'node:assert/strict';
import { createControlClient, CLIENT_PATHS, ControlClientError, normalizeTunnelStatus } from './control-client.mjs';
import { createPkceRequest } from './pkce.mjs';

const token = 'device-token-1234567890';
const devicePublicKey = { kty: 'OKP', crv: 'Ed25519', x: 'A'.repeat(43) };
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('control client only calls the fixed HTTPS facade and never sends customer or egress selectors', async () => {
  const calls = [];
  const client = createControlClient({ baseUrl: 'https://control.example.test/api', production: false, tokenProvider: async () => token, fetch: async (url, init) => { calls.push({ url, init }); return response(200, { ok: true }); } });
  await client.heartbeat({ deviceId: 'device-1', clientVersion: '0.1.0', configRevision: 7, localProxyState: 'running', errorCode: null });
  assert.equal(calls[0].url, 'https://control.example.test/api/v1/client/tunnel/heartbeat');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.headers['X-Noya-Client'], 'electron-v2');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    deviceId: 'device-1', clientVersion: '0.1.0', configRevision: 7,
    localProxy: { host: '127.0.0.1', port: 17899, state: 'running' }, errorCode: null,
  });
  assert.doesNotMatch(calls[0].init.body, /customer|exit|line|ip|upstream/i);
});

test('heartbeat sends only the device health contract fields', async () => {
  const calls = [];
  const client = createControlClient({ baseUrl: 'https://control.example.test', production: false, tokenProvider: async () => token, fetch: async (url, init) => { calls.push({ url, init }); return response(204, null); } });
  await client.heartbeat({ deviceId: 'device-1', clientVersion: '0.1.0', configRevision: 7, localProxyState: 'running', errorCode: null });
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    deviceId: 'device-1', clientVersion: '0.1.0', configRevision: 7,
    localProxy: { host: '127.0.0.1', port: 17899, state: 'running' }, errorCode: null,
  });
});

test('heartbeat rejects unsafe or incomplete local status fields', async () => {
  const client = createControlClient({ baseUrl: 'https://control.example.test', production: false, tokenProvider: async () => token, fetch: async () => response(204, null) });
  await assert.rejects(client.heartbeat({ deviceId: 'device-1', clientVersion: '0.1.0', localProxyState: 'running', errorCode: 'x'.repeat(121) }), error => error.code === 'VALIDATION_ERROR');
  await assert.rejects(client.heartbeat({ deviceId: 'device-1', clientVersion: '0.1.0', localProxyState: 'running', errorCode: 'bad code' }), error => error.code === 'VALIDATION_ERROR');
});

test('authorization URL is built from fixed PKCE parameters and the device list is scoped to the session', async () => {
  const calls = [];
  const client = createControlClient({ baseUrl: 'https://control.example.test', production: false, tokenProvider: async () => token, fetch: async (url, init) => { calls.push({ url, init }); return response(200, { devices: [] }); } });
  const pkce = createPkceRequest({ redirectUri: 'http://127.0.0.1:43123/callback' });
  const authorization = new URL(client.authorizationUrl(pkce));
  assert.equal(authorization.pathname, CLIENT_PATHS.authorize);
  assert.equal(authorization.searchParams.get('client_id'), 'noya-desktop');
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorization.searchParams.get('redirect_uri'), pkce.redirectUri);
  assert.equal(authorization.searchParams.get('state'), pkce.state);
  await client.listDevices();
  assert.equal(calls[0].url, 'https://control.example.test/api/v1/client/devices');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${token}`);
});

test('missing facade auth and insecure production configuration fail closed', async () => {
  assert.throws(() => createControlClient({ baseUrl: 'http://control.example.test', tokenProvider: async () => token, fetch: async () => response(200, {}) }), error => /HTTPS/.test(error.message));
  const client = createControlClient({ baseUrl: 'https://control.example.test', production: false, tokenProvider: async () => null, fetch: async () => response(200, {}) });
  await assert.rejects(client.getTunnelStatus(), error => error.code === 'AUTH_REQUIRED');
});

test('request errors retain request_id without exposing response secrets', async () => {
  const client = createControlClient({ baseUrl: 'https://control.example.test', production: false, tokenProvider: async () => token, fetch: async () => response(503, { error: { code: 'TUNNEL_UNAVAILABLE', message: '暂不可用', request_id: 'req_abc' }, accessToken: 'secret' }) });
  await assert.rejects(client.getTunnelConfig(), error => error instanceof ControlClientError && error.code === 'TUNNEL_UNAVAILABLE' && error.requestId === 'req_abc' && !error.message.includes('secret'));
});

test('device exchange explains an entitlement rejection without replaying the authorization code', async () => {
  let calls = 0;
  const client = createControlClient({ baseUrl: 'https://dingtu.noyapi.cn', fetch: async () => { calls++; return response(401, { error: { code: 'ACCOUNT_DISABLED', message: 'RAW_SERVER_SECRET', request_id: 'req_entitlement' } }); } });
  await assert.rejects(client.createDeviceSession({ authorizationCode: 'one-time-code', codeVerifier: 'v'.repeat(43), redirectUri: 'http://127.0.0.1:43123/callback', deviceName: 'Noya Desktop', platform: 'linux', appVersion: '1.0.0', devicePublicKey }), error => error.code === 'ACCOUNT_DISABLED' && /权益/.test(error.message) && error.requestId === 'req_entitlement' && !error.message.includes('RAW_SERVER_SECRET'));
  assert.equal(calls, 1);
});

test('control errors fall back to the bounded X-Request-Id response header', async () => {
  const client = createControlClient({ baseUrl: 'https://dingtu.noyapi.cn', tokenProvider: async () => token, fetch: async () => ({ ...response(503, { error: { code: 'REQUEST_FAILED' } }), headers: new Headers({ 'X-Request-Id': 'req_header' }) }) });
  await assert.rejects(client.getMe(), error => error.requestId === 'req_header');
});

test('device session input is constrained to PKCE and platform fields', async () => {
  const calls = [];
  const client = createControlClient({ baseUrl: 'https://control.example.test', production: false, fetch: async (_url, init) => { calls.push(init); return response(201, { deviceId: 'dev-1' }); } });
  await client.createDeviceSession({ authorizationCode: 'code', codeVerifier: 'v'.repeat(43), redirectUri: 'http://127.0.0.1:43123/callback', deviceName: 'Noya Desktop', platform: 'linux', appVersion: '1.0.0', devicePublicKey });
  assert.deepEqual(JSON.parse(calls[0].body), { authorizationCode: 'code', codeVerifier: 'v'.repeat(43), redirectUri: 'http://127.0.0.1:43123/callback', deviceName: 'Noya Desktop', platform: 'linux', appVersion: '1.0.0', devicePublicKey });
  assert.equal(calls[0].headers.Authorization, undefined);
  await assert.rejects(client.createDeviceSession({ authorizationCode: 'code', codeVerifier: 'v'.repeat(42), redirectUri: 'http://127.0.0.1:43123/callback', deviceName: 'Noya', platform: 'linux' }), error => error.code === 'VALIDATION_ERROR');
});

test('tunnel status normalization keeps unknown values explicit', () => {
  assert.deepEqual(normalizeTunnelStatus({ status: 'running', desired: 'running', applied: 'running', observed: 'running', bindingRevision: 'binding-7', configRevision: 2, observedAt: '2026-10-25T00:00:00Z', expiresAt: '2026-10-25T01:00:00Z', revoked: false, health: 'known' }), {
    status: 'running', desired: 'running', applied: 'running', observed: 'running', bindingRevision: 'binding-7', configRevision: 2,
    observedAt: '2026-10-25T00:00:00.000Z', expiresAt: '2026-10-25T01:00:00.000Z', revoked: false, health: 'known',
  });
  const unknown = normalizeTunnelStatus({ status: 'unknown', desired: 'future', health: 'surprise' });
  assert.equal(unknown.desired, 'unknown');
  assert.equal(unknown.health, 'unknown');
  assert.throws(() => normalizeTunnelStatus({ status: 'connected' }), error => error.code === 'INVALID_RESPONSE');
});

test('control requests prohibit redirects and reject malformed bearer tokens before fetching', async () => {
  let called = 0;
  const fetch = async (_url, init) => { called++; assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal); return response(200, {}); };
  await createControlClient({ baseUrl: 'https://control.example.test', production: false, tokenProvider: async () => token, fetch }).getTunnelStatus();
  assert.equal(called, 1);
  for (const unsafe of [token + '\n', ' '.repeat(16), token + '\tsecret', token + '\u0000', token + ' secret']) {
    const client = createControlClient({ baseUrl: 'https://control.example.test', production: false, tokenProvider: async () => unsafe, fetch });
    await assert.rejects(client.getTunnelStatus(), error => error.code === 'AUTH_REQUIRED');
  }
  assert.equal(called, 1);
});

test('device exchange validates the exact callback and PKCE alphabet before sending any code', async () => {
  let calls = 0;
  const client = createControlClient({ baseUrl: 'https://control.example.test', production: false, fetch: async () => { calls++; return response(201, {}); } });
  const input = { authorizationCode: 'code', codeVerifier: 'v'.repeat(43), redirectUri: 'http://127.0.0.1:43123/callback', deviceName: 'Noya Desktop', platform: 'linux', appVersion: '1.0.0', devicePublicKey };
  for (const redirectUri of ['http://127.0.0.1:43123/not-callback', 'http://127.0.0.1:43123@evil.example/callback', input.redirectUri + '?secret=code', input.redirectUri + '#fragment']) {
    await assert.rejects(client.createDeviceSession({ ...input, redirectUri }), error => ['VALIDATION_ERROR', 'CALLBACK_INVALID'].includes(error.code));
  }
  for (const codeVerifier of [' '.repeat(43), 'v'.repeat(42) + '\n', 'v'.repeat(42) + '/']) {
    await assert.rejects(client.createDeviceSession({ ...input, codeVerifier }), error => error.code === 'VALIDATION_ERROR');
  }
  assert.equal(calls, 0);
});

test('control errors retain bounded identifiers but never reflect upstream secret-bearing text', async () => {
  const client = createControlClient({ baseUrl: 'https://control.example.test', production: false, tokenProvider: async () => token, fetch: async () => response(503, { error: { code: 'TUNNEL_UNAVAILABLE', message: 'accessToken=RAW-SECRET', request_id: 'req_good' } }) });
  await assert.rejects(client.getTunnelConfig(), error => error.code === 'TUNNEL_UNAVAILABLE' && error.requestId === 'req_good' && !error.message.includes('RAW-SECRET'));
  const poisoned = createControlClient({ baseUrl: 'https://control.example.test', production: false, tokenProvider: async () => token, fetch: async () => response(401, { error: { code: 'RAW-SECRET'.repeat(100), message: 'RAW-SECRET', request_id: 'req_good\nRAW-SECRET' } }) });
  await assert.rejects(poisoned.getTunnelConfig(), error => error.code === 'AUTH_REQUIRED' && error.requestId === null && !JSON.stringify(error).includes('RAW-SECRET'));
});

test('control deadline bounds adapters that ignore AbortSignal and includes body decoding', async () => {
  for (const fetch of [async () => new Promise(() => {}), async () => ({ ...response(200, {}), json: () => new Promise(() => {}) })]) {
    const client = createControlClient({ baseUrl: 'https://control.example.test', production: false, tokenProvider: async () => token, fetch, timeoutMs: 30 });
    await assert.rejects(client.getTunnelStatus(), error => error.code === 'REQUEST_TIMEOUT');
  }
});

test('heartbeat matches contract 1.9 machine-code, version and revision grammars before network dispatch', async () => {
  const calls = [];
  const client = createControlClient({ baseUrl: 'https://control.example.test', production: false, tokenProvider: async () => token,
    fetch: async (_url, init) => { calls.push(init); return response(204, null); } });
  const input = { deviceId: 'device-1', clientVersion: '1.0.0-beta_1+desktop', configRevision: 'config:7.a_1-2', localProxyState: 'error', errorCode: 'UPSTREAM_TIMEOUT' };
  await client.heartbeat(input);
  assert.deepEqual(JSON.parse(calls[0].body), { deviceId: input.deviceId, clientVersion: input.clientVersion, configRevision: input.configRevision,
    localProxy: { host: '127.0.0.1', port: 17899, state: 'error' }, errorCode: 'UPSTREAM_TIMEOUT' });
  for (const patch of [
    { errorCode: 'upstream_timeout' }, { errorCode: 'A'.repeat(65) }, { errorCode: 'TIMEOUT:PRIVATE' }, { errorCode: '' },
    { clientVersion: 'x'.repeat(65) }, { clientVersion: '1.0 secret' }, { clientVersion: ' 1.0.0 ' },
    { configRevision: 'x'.repeat(65) }, { configRevision: 'revision bad' }, { configRevision: '' }, { configRevision: -1 },
  ]) await assert.rejects(client.heartbeat({ ...input, ...patch }), error => error.code === 'VALIDATION_ERROR');
  assert.equal(calls.length, 1, 'invalid health metadata never reaches the server');
});

test('named desktop reads use only contract routes with a device bearer and omit browser cookies', async () => {
  const calls = [];
  const client = createControlClient({ baseUrl: 'https://control.example.test', production: false, tokenProvider: async () => token,
    fetch: async (url, init) => { calls.push({ url, init }); return response(200, {}); } });
  await client.getMe(); await client.getEntitlements(); await client.getMembers(); await client.getOverview();
  await client.getIdentities({ limit: 25, cursor: 'page/+?&=#' }); await client.getCatalog('linux');
  assert.deepEqual(calls.map(call => new URL(call.url).pathname), [
    '/api/v1/me', '/api/v1/tenants/me', '/api/v1/tenants/me/members', '/api/v1/assistant/overview',
    '/api/v1/tenants/me/identities', '/api/v1/client/catalog',
  ]);
  assert.equal(new URL(calls[4].url).searchParams.get('cursor'), 'page/+?&=#');
  assert.equal(new URL(calls[4].url).searchParams.get('limit'), '25');
  assert.equal(new URL(calls[5].url).search, '?platform=linux');
  for (const { init } of calls) {
    assert.equal(init.method, 'GET'); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${token}`); assert.equal(init.headers['X-Requested-With'], 'Dingtu-Portal');
    assert.equal(init.body, undefined);
  }
  assert.equal(client.request, undefined, 'renderer cannot get a generic request capability');
});

test('named reads refuse unknown selectors, malformed pagination and unsupported platforms without dispatch', async () => {
  let calls = 0;
  const client = createControlClient({ baseUrl: 'https://control.example.test', production: false, tokenProvider: async () => token,
    fetch: async () => { calls++; return response(200, {}); } });
  for (const input of [null, [], { customerId: 'foreign' }, { identityId: 'foreign' }, { limit: 0 }, { limit: 201 }, { limit: '20' }, { cursor: '' }, { cursor: 'x'.repeat(2049) }]) {
    await assert.rejects(client.getIdentities(input), error => error.code === 'VALIDATION_ERROR');
  }
  for (const platform of ['windows&customerId=foreign', 'unknown', '', null, {}]) {
    await assert.rejects(client.getCatalog(platform), error => error.code === 'VALIDATION_ERROR');
  }
  assert.equal(calls, 0);
});

test('authorization URL uses an exact S256 digest and validates the optional platform', () => {
  const client = createControlClient({ baseUrl: 'https://control.example.test', production: false, fetch: async () => response(200, {}) });
  const pkce = createPkceRequest({ redirectUri: 'http://127.0.0.1:43123/callback' });
  assert.equal(new URL(client.authorizationUrl({ ...pkce, platform: 'linux' })).searchParams.get('platform'), 'linux');
  assert.equal(new URL(client.authorizationUrl(pkce)).searchParams.has('platform'), false);
  for (const codeChallenge of ['x'.repeat(42), 'x'.repeat(44), 'x'.repeat(128)]) assert.throws(() => client.authorizationUrl({ ...pkce, codeChallenge }), error => error.code === 'VALIDATION_ERROR');
  for (const platform of ['win32', 'unknown', '', null]) assert.throws(() => client.authorizationUrl({ ...pkce, platform }), error => error.code === 'VALIDATION_ERROR');
});

test('device refresh sends a rotating body token without an expired access bearer or browser cookie', async () => {
  const calls = [];
  const refresh = 'refresh-token-1234567890';
  const client = createControlClient({ baseUrl: 'https://control.example.test', production: false,
    tokenProvider: async () => { throw new Error('expired access must not be consulted'); }, refreshTokenProvider: async () => refresh,
    fetch: async (url, init) => { calls.push({ url, init }); return response(200, {}); } });
  await client.refreshDeviceSession('device-1');
  assert.equal(calls[0].url, 'https://control.example.test/api/v1/client/device/sessions/device-1/refresh');
  assert.deepEqual(JSON.parse(calls[0].init.body), { refreshToken: refresh });
  assert.equal(calls[0].init.headers.Authorization, undefined); assert.equal(calls[0].init.credentials, 'omit');
});


test('configuration handle requests use the operator device session and an empty body',async()=>{
  const calls=[];
  const client=createControlClient({baseUrl:'https://dingtu.noyapi.cn',tokenProvider:async()=>token,fetch:async(url,init)=>{
    calls.push({url,init});return response(201,{authorizationHandle:'pah_'+'A'.repeat(43),expiresAt:'2026-11-09T00:01:00.000Z'});
  }});
  await client.createTunnelAuthorization();
  assert.equal(calls[0].url,'https://dingtu.noyapi.cn/api/v1/client/tunnel/authorizations');
  assert.equal(calls[0].init.method,'POST');
  assert.equal(calls[0].init.headers.Authorization,'Bearer '+token);
  assert.equal(calls[0].init.body,'{}');
});

test('configuration authorizations reject injected fields and expose only safe response metadata to audit', async () => {
  let payload = { authorizationHandle: 'pah_' + 'A'.repeat(43), expiresAt: '2026-11-11T14:01:00.000Z' };
  const observed = [];
  const client = createControlClient({ baseUrl: 'https://control.example.test', production: false,
    tokenProvider: async () => token, onResponse: info => observed.push(info),
    fetch: async () => new Response(JSON.stringify(payload), { status: 201,
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req_authorization_fixture' } }) });
  assert.equal((await client.createTunnelAuthorization()).authorizationHandle, payload.authorizationHandle);
  assert.deepEqual(observed, [{ path: '/api/v1/client/tunnel/authorizations', method: 'POST', status: 201,
    requestId: 'req_authorization_fixture' }]);
  assert.doesNotMatch(JSON.stringify(observed), /pah_|Bearer|nda_/);
  payload = { ...payload, identityId: 'foreign' };
  await assert.rejects(client.createTunnelAuthorization(), { code: 'INVALID_RESPONSE' });
});

test('configuration authorizations require the operator 201 contract status', async () => {
  const client = createControlClient({ baseUrl: 'https://control.example.test', production: false,
    tokenProvider: async () => token, fetch: async () => response(200, {
      authorizationHandle: 'pah_' + 'A'.repeat(43), expiresAt: '2026-11-11T14:01:00.000Z',
    }) });
  await assert.rejects(client.createTunnelAuthorization(), { code: 'INVALID_RESPONSE' });
});

test('v1.19 §16/§17 telemetrySync & tickets endpoints enforce allowlists and block privacy leaks before network fetch', async () => {
  let fetchCalled = false;
  const calls = [];
  const tktId = 'tkt_' + 'a1b2c3d4'.repeat(4);
  const client = createControlClient({
    baseUrl: 'https://control.example.test',
    production: false,
    tokenProvider: async () => token,
    fetch: async (url, init) => {
      fetchCalled = true;
      calls.push({ url, init });
      if (url.endsWith('/telemetry/sync')) return response(200, { acceptedBuckets: 1, acceptedEvents: 1, syncedAt: '2026-11-22T07:00:00.000Z' });
      if (url.endsWith('/tickets') && init.method === 'POST') return response(201, { ticket: { ticketId: tktId, status: 'submitted' }, message: { messageId: 'm1' } });
      if (url.includes('/tickets?')) return response(200, { data_source: 'real', tickets: [] });
      if (url.endsWith(`/tickets/${tktId}/messages`)) return response(200, { ticket: { ticketId: tktId, status: 'awaiting_ops' }, message: { messageId: 'm2' } });
      return response(200, { data_source: 'real', ticket: { ticketId: tktId }, messages: [] });
    },
  });

  // Forbidden privacy keys fail BEFORE hitting fetch
  await assert.rejects(client.syncTelemetry({
    reportedAt: '2026-11-22T07:00:00.000Z',
    usageBuckets: [{
      bucketDate: '2026-11-22', appId: 'codex', model: 'gpt-5', sessionType: 'main',
      sessions: 1, turns: 1, inputTokens: 1, thinkingTokens: 0, outputTokens: 1, cacheTokens: 0, totalTokens: 2,
      workspacePath: 'C:\\secret\\proj',
    }],
    events: [],
  }), { code: 'TELEMETRY_PRIVACY_VIOLATION' });
  assert.equal(fetchCalled, false);

  const okSync = await client.syncTelemetry({
    reportedAt: '2026-11-22T07:00:00.000Z',
    usageBuckets: [{
      bucketDate: '2026-11-22', appId: 'codex', model: 'gpt-5', sessionType: 'main',
      sessions: 1, turns: 2, inputTokens: 100, thinkingTokens: 0, outputTokens: 50, cacheTokens: 0, totalTokens: 150,
    }],
    events: [
      {
        eventId: 'evt_1', occurredAt: '2026-11-22T06:55:00.000Z', category: 'tunnel',
        action: 'tunnel_started', appId: null, environmentMode: 'safe_tunnel', status: 'ok', errorCode: null, requestId: null,
      },
      {
        eventId: 'evt_2', occurredAt: '2026-11-22T06:56:00.000Z', category: 'tunnel',
        action: 'env_mode_own_network', appId: null, environmentMode: 'own_network', status: 'ok', errorCode: null, requestId: null,
      },
    ],
  });
  assert.equal(okSync.acceptedBuckets, 1);

  await assert.rejects(client.createTicket({
    subject: 'Bug', category: 'connection', body: 'Details',
    diagnosticSnapshot: { appVersion: '0.2.0', platform: 'windows', environmentMode: 'safe_tunnel', proxyState: 'running', recentErrorCodes: [], recentRequestIds: [], secretCookie: 'bad' },
  }), { code: 'VALIDATION_ERROR' });

  const created = await client.createTicket({
    subject: 'Cannot connect', category: 'connection', body: 'Timed out',
    diagnosticSnapshot: { appVersion: '0.2.0', platform: 'windows', environmentMode: 'safe_tunnel', proxyState: 'stopped', recentErrorCodes: ['PROXY_TIMEOUT'], recentRequestIds: ['req_1'] },
  });
  assert.equal(created.ticket.ticketId, tktId);

  await client.listTickets({ status: 'waiting_user', limit: 20 });
  assert.match(calls.at(-1).url, /\/api\/v1\/client\/tickets\?status=waiting_user&limit=20$/);

  await assert.rejects(client.getTicket('tkt_invalid'), { code: 'VALIDATION_ERROR' });
  await client.getTicket(tktId);
  await client.replyTicket(tktId, { action: 'reply', body: 'More info' });
});

test('v1.26 syncTelemetry validates extended event fields, latencySamples, backward compatibility, and privacy boundaries', async () => {
  const token = 't'.repeat(32);
  const postedBodies = [];
  const client = createControlClient({
    baseUrl: 'https://control.example.test',
    production: false,
    tokenProvider: async () => token,
    fetch: async (_url, init) => {
      const parsed = JSON.parse(init.body);
      postedBodies.push(parsed);
      return response(200, Object.hasOwn(parsed, 'latencySamples')
        ? { acceptedBuckets: parsed.usageBuckets.length, acceptedEvents: parsed.events.length, acceptedLatencySamples: parsed.latencySamples.length, syncedAt: '2026-11-24T05:10:00.000Z' }
        : { acceptedBuckets: parsed.usageBuckets.length, acceptedEvents: parsed.events.length, syncedAt: '2026-11-24T05:10:00.000Z' });
    },
  });

  // Backward-compatible call without latencySamples omits the key on the wire
  const resLegacy = await client.syncTelemetry({
    reportedAt: '2026-11-24T05:10:00.000Z',
    usageBuckets: [],
    events: [{
      eventId: 'evt_legacy_1', occurredAt: '2026-11-24T05:09:00.000Z', category: 'tunnel',
      action: 'tunnel_started', appId: null, environmentMode: 'safe_tunnel', status: 'ok', errorCode: null, requestId: null,
    }],
  });
  assert.equal(Object.hasOwn(postedBodies[0], 'latencySamples'), false);
  assert.equal(Object.hasOwn(resLegacy, 'acceptedLatencySamples'), false);

  // Extended v1.26 payload with all optional event fields + latencySamples
  const fp = 'a'.repeat(64);
  const resV126 = await client.syncTelemetry({
    reportedAt: '2026-11-24T05:10:05.000Z',
    usageBuckets: [],
    events: [{
      eventId: 'evt_v126_1', occurredAt: '2026-11-24T05:10:01.000Z', category: 'tunnel',
      action: 'proxy_start_failed', appId: null, environmentMode: 'safe_tunnel', status: 'error',
      errorCode: 'PROXY_TIMEOUT', requestId: 'req_123',
      severity: 'fatal', fingerprint: fp, platform: 'windows', appVersion: '0.2.0',
      stage: 'tun_setup', durationMs: 3120, httpStatus: 503, retryable: true,
    }],
    latencySamples: [{
      sampleId: 'smp_1234567890ab', sampledAt: '2026-11-24T05:10:02.000Z', trigger: 'connect',
      platform: 'windows', appVersion: '0.2.0', environmentMode: 'safe_tunnel',
      clientToOriginMs: 42, dnsMs: 18, e2eTtfbMs: 310, totalMs: 420,
      status: 'ok', errorCode: null, requestId: null,
    }],
  });
  assert.equal(resV126.acceptedEvents, 1);
  assert.equal(resV126.acceptedLatencySamples, 1);
  assert.equal(postedBodies[1].events[0].stage, 'tun_setup');
  assert.equal(postedBodies[1].events[0].fingerprint, fp);
  assert.equal(postedBodies[1].latencySamples[0].clientToOriginMs, 42);

  // Privacy violations in events & latencySamples are blocked BEFORE fetch
  const countBefore = postedBodies.length;
  await assert.rejects(client.syncTelemetry({
    reportedAt: '2026-11-24T05:10:05.000Z',
    events: [{
      eventId: 'evt_bad_1', occurredAt: '2026-11-24T05:10:01.000Z', category: 'auth',
      action: 'pkce_login_failed', appId: null, environmentMode: 'safe_tunnel', status: 'error',
      errorCode: 'AUTH_FAILED', requestId: null, accessToken: 'secret-bearer',
    }],
  }), { code: 'TELEMETRY_PRIVACY_VIOLATION' });

  await assert.rejects(client.syncTelemetry({
    reportedAt: '2026-11-24T05:10:05.000Z',
    events: [],
    latencySamples: [{
      sampleId: 'smp_bad_privacy1', sampledAt: '2026-11-24T05:10:02.000Z', trigger: 'periodic',
      status: 'ok', vlessUuid: '00000000-0000-4000-8000-000000000001',
    }],
  }), { code: 'TELEMETRY_PRIVACY_VIOLATION' });

  // Server-derived identity overrides in latencySamples rejected
  await assert.rejects(client.syncTelemetry({
    reportedAt: '2026-11-24T05:10:05.000Z',
    events: [],
    latencySamples: [{
      sampleId: 'smp_bad_override', sampledAt: '2026-11-24T05:10:02.000Z', trigger: 'periodic',
      status: 'ok', customerId: 'cust_spoof',
    }],
  }), { code: 'VALIDATION_ERROR' });

  // Invalid stage, fingerprint, and > 60 latencySamples rejected
  await assert.rejects(client.syncTelemetry({
    reportedAt: '2026-11-24T05:10:05.000Z',
    events: [{
      eventId: 'evt_bad_stage', occurredAt: '2026-11-24T05:10:01.000Z', category: 'tunnel',
      action: 'x', appId: null, environmentMode: 'safe_tunnel', status: 'error',
      errorCode: 'E', requestId: null, stage: 'not_a_stage',
    }],
  }), { code: 'VALIDATION_ERROR' });

  await assert.rejects(client.syncTelemetry({
    reportedAt: '2026-11-24T05:10:05.000Z',
    events: [],
    latencySamples: Array.from({ length: 61 }, (_, i) => ({
      sampleId: `smp_overflow_${String(i).padStart(2, '0')}`,
      sampledAt: '2026-11-24T05:10:02.000Z',
      trigger: 'periodic',
      status: 'ok',
    })),
  }), { code: 'VALIDATION_ERROR' });

  assert.equal(postedBodies.length, countBefore);
});
