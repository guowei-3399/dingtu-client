import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

const source = await readFile(new URL('./assistant-data.js', import.meta.url), 'utf8');
const context = createContext({});
runInContext(source, context);
const { createAssistantData, labels, SOURCES } = context.AssistantData;
const plain = value => JSON.parse(JSON.stringify(value));

function response(status, body) {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return { status, ok: status >= 200 && status < 300, json: async () => JSON.parse(text) };
}
function fakeFetch(handlers) {
  const calls = [];
  const fetch = async (path, init) => {
    calls.push({ path, init });
    const handler = handlers[`${init.method} ${path}`];
    if (!handler) throw new Error('unexpected request ' + init.method + ' ' + path);
    const next = typeof handler === 'function' ? handler(calls.length, init) : handler;
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetch, calls };
}
const me = (overrides = {}) => ({ user: { id: 'u1', email: 'a@example.test', displayName: 'A', customerType: 'personal', level: null, role: 'customer', emailVerified: true, status: 'active', memberRole: 'owner', ...overrides }, csrfToken: 'csrf-1', expiresAt: '2026-10-23T00:00:00.000Z' });

test('a previous preview session cannot turn the normal assistant into mock mode', () => {
  const stored = new Map([['dingtu-assistant-preview','1']]);
  const page = createContext({ URLSearchParams, location:{ pathname:'/assistant/',port:'',search:'' },sessionStorage:{getItem:k=>stored.get(k),removeItem:k=>stored.delete(k),setItem:(k,v)=>stored.set(k,v)} });
  runInContext(source,page);
  assert.equal(page.AssistantData.mainSite,true);
  assert.equal(stored.has('dingtu-assistant-preview'),false);
  assert.equal(page.AssistantData.snapshot('identity').data,null);
});

test('explicit preview remains confined to its URL and desktop always uses the main-process bridge', () => {
  for(const desktop of [false,true]){
    const page=createContext({URLSearchParams,location:{pathname:'/assistant/',port:'4174',search:'?preview=1'},...(desktop?{NoyaDesktop:{}}:{})});
    runInContext(source,page);
    assert.equal(page.AssistantData.mainSite,desktop);
  }
});

test('default sources: account and tenant are real, network resources are mock', () => {
  assert.deepEqual(plain(SOURCES), { account: 'real', tenant: 'real', identity: 'mock', egress: 'mock', standby: 'mock', events: 'mock', subscription: 'mock', entitlement: 'mock' });
});

test('mock envelopes carry data_source mock, doc-03 identity fields and RFC 5737 example IPs only', async () => {
  const data = createAssistantData({ fetch: async () => { throw new Error('mock must not fetch'); }, mainSite: false });
  const identity = await data.read('identity');
  assert.equal(identity.data_source, 'mock'); assert.equal(identity.error, null);
  for (const key of ['identity_id', 'desired_status', 'runtime_status', 'revision', 'current_exit_summary', 'operation_id']) assert.ok(Object.hasOwn(identity.data, key), key);
  const all = JSON.stringify(await Promise.all(['identity', 'egress', 'standby', 'events', 'subscription', 'entitlement'].map(kind => data.read(kind))));
  for (const ip of all.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g)) assert.match(ip, /^(192\.0\.2|198\.51\.100|203\.0\.113)\./, ip);
  const entitlement = (await data.read('entitlement')).data;
  for (const key of ['plan_name', 'expires_at', 'standby_count']) assert.ok(Object.hasOwn(entitlement, key), key);
  assert.deepEqual(plain(await data.read('identity')), plain(identity), 'deterministic');
});

test('mock failover records an exit-change event with old/new exit and bumps binding_revision', async () => {
  const data = createAssistantData({ fetch: async () => { throw new Error('no fetch'); }, mainSite: false });
  const before = data.snapshot('identity').data;
  const event = data.mock.failover(Date.UTC(2026, 9, 22));
  const after = data.snapshot('identity').data;
  assert.equal(after.binding_revision, before.binding_revision + 1);
  assert.notEqual(after.current_exit_summary.exit_id, before.current_exit_summary.exit_id);
  for (const key of ['event_type', 'reason_code', 'identity_id', 'binding_revision', 'operation_id', 'old_exit_id', 'new_exit_id']) assert.ok(Object.hasOwn(event, key), key);
  assert.equal(data.snapshot('events').data.length, 1);
  assert.equal(data.mock.failover(Date.now()), null, 'no second spare to adopt');
  data.reset();
  assert.equal(data.snapshot('events').data.length, 0);
  assert.equal(data.snapshot('identity').data.current_exit_summary.exit_id, before.current_exit_summary.exit_id);
});

test('real mode never falls back to mock and a non-real data_source is SOURCE_MISMATCH', async () => {
  const { fetch } = fakeFetch({ 'GET /api/v1/tenants/me/members': response(200, { data_source: 'mock', members: [] }) });
  const data = createAssistantData({ fetch, mainSite: true });
  const tenant = await data.read('tenant');
  assert.equal(tenant.data_source, 'real'); assert.equal(tenant.data, null); assert.equal(tenant.error.code, 'SOURCE_MISMATCH');
  const failing = createAssistantData({ fetch: fakeFetch({ 'GET /api/v1/tenants/me/members': new TypeError('Failed to fetch') }).fetch, mainSite: true });
  const failed = await failing.read('tenant');
  assert.equal(failed.data_source, 'real'); assert.equal(failed.data, null); assert.equal(failed.error.code, 'NETWORK_ERROR');
  const flipped = createAssistantData({ fetch, mainSite: true, sources: { identity: 'real' } });
  const identity = await flipped.read('identity');
  assert.equal(identity.data_source, 'real'); assert.equal(identity.data, null); assert.equal(identity.error.code, 'NOT_INTEGRATED');
  assert.equal(flipped.snapshot('identity').data, null, 'snapshot never shows mock in real mode');
});

test('standalone preview never calls the main site for account or tenant', async () => {
  const data = createAssistantData({ fetch: async () => { throw new Error('cross-origin call'); }, mainSite: false });
  const tenant = await data.read('tenant');
  assert.equal(tenant.error.code, 'PREVIEW_ONLY');
  await assert.rejects(data.me(), error => error.code === 'PREVIEW_ONLY');
});

test('Electron renderer never falls back to website cookies or forwards account secrets', async () => {
  let calls = 0;
  const desktop = createContext({ NoyaDesktop: { apiBase: 'https://evil.example', auth: { mode: 'browser-pkce-pending' } }, URL, URLSearchParams, fetch: async () => { calls++; return response(200, me()); } });
  runInContext(source, desktop);
  const data = desktop.AssistantData;
  for (const request of [() => data.me(), () => data.login({ email: 'a@example.test', password: 'synthetic-password' }), () => data.register({ email: 'a@example.test', password: 'synthetic-password', displayName: 'Test' }), () => data.logout('test-csrf'), () => data.changePassword({ currentPassword: 'old', newPassword: 'synthetic-password' }, 'test-csrf')]) {
    await assert.rejects(request(), error => error.code === 'DESKTOP_OPERATION_UNAVAILABLE');
  }
  assert.equal((await data.members()).error.code, 'DESKTOP_OPERATION_UNAVAILABLE');
  assert.equal(data.snapshot('identity').data, null);
  assert.equal(calls, 0);
});

test('Electron reads use the narrow bridge with query arguments and logout never sends a website cookie request', async () => {
  const calls = [];
  const desktopMe = { ...me(), csrfToken: null };
  const bridge = {
    read: async (kind, args) => {
      calls.push(['read', kind, args]);
      if (kind === 'me') return { ok: true, value: desktopMe };
      if (kind === 'identities') return { ok: true, value: { data_source: 'real', identities: [], nextCursor: null } };
      if (kind === 'catalog') return { ok: true, value: { data_source: 'real', catalogRevision: 1, generatedAt: '2026-10-28T00:00:00.000Z', checksum: 'a'.repeat(64), platform: args.platform, apps: [] } };
      return { ok: true, value: { data_source: 'real', members: [] } };
    },
    auth: { invoke: async operation => { calls.push(['auth', operation]); return { ok: true, value: { status: 'signed_out' } }; } },
  };
  const desktop = createContext({ NoyaDesktop: bridge, AssistantCatalog: { normalize: value => value }, URL, URLSearchParams, fetch: async () => { throw new Error('website fallback'); } });
  runInContext(source, desktop);
  const data = desktop.AssistantData.createAssistantData({ mainSite: true, clientApiReady: true });
  assert.equal((await data.me()).csrfToken, null);
  await data.identities({ limit: 20, cursor: 'next+/=' });
  await data.catalog('linux');
  await data.logout(null);
  assert.deepEqual(plain(calls), [['read', 'me', {}], ['read', 'identities', { limit: 20, cursor: 'next+/=' }], ['read', 'catalog', { platform: 'linux' }], ['auth', 'auth.logout']]);
});

test('website sessions still require a non-empty CSRF token', async () => {
  const data = createAssistantData({ mainSite: true, fetch: fakeFetch({ 'GET /api/v1/me': response(200, { ...me(), csrfToken: null }) }).fetch });
  await assert.rejects(data.me(), error => error.code === 'INVALID_RESPONSE');
});

test('api sends same-origin JSON headers, CSRF only on writes, and maps errors to ApiError', async () => {
  const { fetch, calls } = fakeFetch({
    'GET /api/v1/me': response(200, me()),
    'POST /api/v1/auth/logout': response(204),
    'GET /api/v1/tenants/me/members': (n) => n === 3 ? response(403, { error: { code: 'ENTERPRISE_ONLY', message: '仅企业客户可用。' } }) : response(502, '<html>bad gateway</html>'),
  });
  const data = createAssistantData({ fetch, mainSite: true });
  assert.equal((await data.me()).user.id, 'u1');
  assert.equal(await data.logout('csrf-1'), null);
  const tenant = await data.members();
  assert.equal(tenant.error.status, 403); assert.equal(tenant.error.code, 'ENTERPRISE_ONLY'); assert.equal(tenant.error.message, '仅企业客户可用。');
  const broken = await data.members();
  assert.equal(broken.error.code, 'INVALID_RESPONSE'); assert.equal(broken.error.status, 502);
  assert.doesNotMatch(broken.error.message, /JSON|Unexpected|html/);
  assert.equal(calls[0].init.cache, 'no-store'); assert.equal(calls[0].init.credentials, 'same-origin');
  assert.equal(calls[0].init.headers['X-Requested-With'], 'Dingtu-Portal');
  assert.equal(calls[0].init.headers['X-CSRF-Token'], undefined);
  assert.equal(calls[1].init.headers['X-CSRF-Token'], 'csrf-1');
  assert.equal(calls[1].init.headers['Content-Type'], 'application/json');
  assert.equal(calls[1].init.body, '{}');
  assert.ok(broken.error instanceof context.AssistantData.ApiError);
});

test('api forwards only a bounded idempotency key without accepting malformed values', async () => {
  const { fetch, calls } = fakeFetch({ 'GET /api/v1/me': response(200, me()) });
  const data = createAssistantData({ fetch, mainSite: true });
  await data.api('/api/v1/me', { idempotencyKey: 'assistant.req-01' });
  await data.api('/api/v1/me', { idempotencyKey: 'bad key' });
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'assistant.req-01');
  assert.equal(calls[1].init.headers['Idempotency-Key'], undefined);
});

test('protected-read 401 goes to the single unauthorized handler and is propagated', async () => {
  const { fetch } = fakeFetch({ 'GET /api/v1/me': response(401, { error: { code: 'AUTH_REQUIRED', message: '请先登录。' } }), 'GET /api/v1/tenants/me/members': response(401, { error: { code: 'AUTH_REQUIRED', message: '请先登录。' } }) });
  const seen = [];
  const data = createAssistantData({ fetch, mainSite: true });
  data.onUnauthorized(error => seen.push(error.code));
  await assert.rejects(data.me(), error => error.status === 401 && error.code === 'AUTH_REQUIRED');
  const tenant = await data.members();
  assert.equal(tenant.error.status, 401);
  assert.deepEqual(seen, ['AUTH_REQUIRED', 'AUTH_REQUIRED']);
});

test('login and registration use the real same-origin contract without accepting client privileges or retaining credentials', async () => {
  const { fetch, calls } = fakeFetch({ 'POST /api/v1/auth/login': response(200, me()), 'POST /api/v1/auth/register': response(201, me({ emailVerified: false })) });
  const data = createAssistantData({ fetch, mainSite: true });
  const password = '  long password 🔒  ';
  assert.equal((await data.login({ email: ' A@Example.Test ', password, role: 'platform_admin', csrfToken: 'injected' })).user.id, 'u1');
  assert.equal((await data.register({ displayName: ' A ', email: ' A@Example.Test ', password, invitationId: 'invite-1', level: 'gold', customerType: 'enterprise', confirmPassword: password })).user.emailVerified, false);
  assert.deepEqual(JSON.parse(calls[0].init.body), { email: 'a@example.test', password });
  assert.deepEqual(JSON.parse(calls[1].init.body), { displayName: 'A', email: 'a@example.test', password, invitationId: 'invite-1' });
  for (const call of calls) {
    assert.equal(call.init.method, 'POST'); assert.equal(call.init.credentials, 'same-origin'); assert.equal(call.init.cache, 'no-store');
    assert.equal(call.init.headers['Content-Type'], 'application/json'); assert.equal(call.init.headers['X-Requested-With'], 'Dingtu-Portal');
    assert.equal(call.init.headers['X-CSRF-Token'], undefined);
  }
  assert.equal(data.snapshot('account').data, null, 'credential requests do not cache an account or password');
  assert.doesNotMatch(JSON.stringify(data), /long password|invite-1|injected/);
});

test('credential failures do not expire an existing account, but retain actionable server errors', async () => {
  const { fetch } = fakeFetch({
    'POST /api/v1/auth/login': response(401, { error: { code: 'AUTH_INVALID_CREDENTIALS', message: '邮箱或密码不正确。' } }),
    'POST /api/v1/auth/register': response(409, { error: { code: 'INVITATION_PENDING', message: '该邮箱有待接受的企业邀请，请通过邀请链接注册。' } }),
    'GET /api/v1/me': response(401, { error: { code: 'AUTH_REQUIRED', message: '请先登录。' } }),
  });
  const data = createAssistantData({ fetch, mainSite: true }); const seen = [];
  data.onUnauthorized(error => seen.push(error.code));
  await assert.rejects(data.login({ email: 'a@example.test', password: 'old' }), error => error.status === 401 && error.code === 'AUTH_INVALID_CREDENTIALS');
  await assert.rejects(data.register({ displayName: 'A', email: 'a@example.test', password: 'long valid password' }), error => error.status === 409 && error.code === 'INVITATION_PENDING');
  assert.deepEqual(seen, []);
  await assert.rejects(data.me(), error => error.status === 401);
  assert.deepEqual(seen, ['AUTH_REQUIRED']);
});

test('password change uses the existing session CSRF contract and never caches credentials', async () => {
  const { fetch, calls } = fakeFetch({ 'POST /api/v1/auth/password': response(204) });
  const data = createAssistantData({ fetch, mainSite: true });
  await data.changePassword({ currentPassword: 'current password', newPassword: 'new secure password 123' }, 'csrf-1');
  assert.equal(calls[0].init.headers['X-CSRF-Token'], 'csrf-1');
  assert.deepEqual(JSON.parse(calls[0].init.body), { currentPassword: 'current password', newPassword: 'new secure password 123' });
  assert.doesNotMatch(JSON.stringify(data), /current password|new secure password/);
  for (const input of [{ currentPassword: '', newPassword: 'new secure password 123' }, { currentPassword: 'old', newPassword: 'short' }, { currentPassword: 'old', newPassword: 'x'.repeat(129) }]) await assert.rejects(data.changePassword(input, 'csrf-1'), error => error.code === 'VALIDATION_ERROR');
});

test('credential validation matches Unicode password boundaries without trimming passwords or permitting empty invitations', async () => {
  let requests = 0;
  const data = createAssistantData({ mainSite: true, fetch: async () => { requests += 1; return response(200, me()); } });
  const valid = { displayName: 'A', email: 'a@example.test', password: '🔒'.repeat(15) };
  await data.register(valid);
  await data.login({ email: valid.email, password: ' ' });
  for (const input of [{ ...valid, password: '🔒'.repeat(14) }, { ...valid, password: '🔒'.repeat(129) }, { ...valid, displayName: ' ' }, { ...valid, displayName: '界'.repeat(61) }, { ...valid, email: 'bad' }, { ...valid, invitationId: '' }, { ...valid, invitationId: 'x'.repeat(201) }]) {
    await assert.rejects(data.register(input), error => error.code === 'VALIDATION_ERROR');
  }
  for (const password of ['', 'x'.repeat(129), null]) await assert.rejects(data.login({ email: valid.email, password }), error => error.code === 'VALIDATION_ERROR');
  assert.equal(requests, 2, 'invalid fields never leave the browser');
});

test('all session entry points reject malformed or privileged payloads and return only contract fields', async () => {
  const payload = { ...me(), password: 'must-drop', token: 'must-drop', user: { ...me().user, secret: 'must-drop' } };
  let current = payload;
  const data = createAssistantData({ mainSite: true, fetch: async () => response(200, current) });
  assert.deepEqual(plain(await data.login({ email: 'a@example.test', password: 'old' })), me());
  assert.doesNotMatch(JSON.stringify(await data.me()), /must-drop|secret|password/);
  for (const bad of [{ ...me(), csrfToken: '' }, { ...me(), expiresAt: 'bad-date' }, me({ role: 'platform_admin' }), me({ status: 'disabled' }), me({ customerType: 'unknown' }), me({ memberRole: 'unknown' }), me({ emailVerified: 'true' }), { user: { id: 'u1' }, csrfToken: 'csrf' }]) {
    current = bad;
    await assert.rejects(data.login({ email: 'a@example.test', password: 'old' }), error => error.code === 'INVALID_RESPONSE');
    await assert.rejects(data.register({ displayName: 'A', email: 'a@example.test', password: 'valid long password' }), error => error.code === 'INVALID_RESPONSE');
    await assert.rejects(data.me(), error => error.code === 'INVALID_RESPONSE');
  }
});

test('standalone auth refuses fake login and registration, network and HTML failures never become a session', async () => {
  let calls = 0;
  const preview = createAssistantData({ mainSite: false, fetch: async () => { calls += 1; return response(200, me()); } });
  const registration = { displayName: 'A', email: 'a@example.test', password: 'valid long password' };
  await assert.rejects(preview.login(registration), error => error.code === 'PREVIEW_ONLY');
  await assert.rejects(preview.register(registration), error => error.code === 'PREVIEW_ONLY');
  assert.equal(calls, 0);
  for (const failed of [new TypeError('secret-network-detail'), response(502, '<html>secret-network-detail</html>'), response(204)]) {
    const data = createAssistantData({ mainSite: true, fetch: async () => { if (failed instanceof Error) throw failed; return failed; } });
    await assert.rejects(data.login(registration), error => ['NETWORK_ERROR', 'INVALID_RESPONSE'].includes(error.code) && !error.message.includes('secret-network-detail'));
  }
});

test('incomplete /me payload is an INVALID_RESPONSE, not a login', async () => {
  const data = createAssistantData({ fetch: fakeFetch({ 'GET /api/v1/me': response(200, { user: { email: 'x' } }) }).fetch, mainSite: true });
  await assert.rejects(data.me(), error => error.code === 'INVALID_RESPONSE');
});

test('assistant overview is a scoped real read and rejects mock or malformed operator data', async () => {
  const good={data_source:'real',generatedAt:'2026-10-24T00:00:00.000Z',customer:{id:'customer-1',type:'enterprise',role:'owner'},subscription:{status:'known',primaryIpQuota:2,standbyIpQuota:1,expiresAt:null},devices:{status:'unknown',authorized:null,online:null,limit:null},egress:{status:'known',binding:'server',primaryAllocated:1,standbyAllocated:1},identitiesTotal:1,identitiesTruncated:false,identities:[{id:'id-1',displayName:'成员出口',assignedUserId:'u1',status:'active',createdAt:'2026-10-23T00:00:00.000Z'}]};
  const data=createAssistantData({mainSite:true,clientApiReady:true,fetch:fakeFetch({'GET /api/v1/assistant/overview':response(200,good)}).fetch});
  assert.deepEqual(plain(await data.overview()),good);
  for(const bad of [{...good,data_source:'mock'},{...good,customer:null},{...good,identities:[{id:'x'}]}]){
    const failing=createAssistantData({mainSite:true,clientApiReady:true,fetch:fakeFetch({'GET /api/v1/assistant/overview':response(200,bad)}).fetch});
    await assert.rejects(failing.overview(),error=>error.code==='INVALID_RESPONSE');
  }
});

test('production overview and catalog use the operator facade, while an explicit disabled gate remains fail-closed', async () => {
  const {fetch,calls}=fakeFetch({});
  const data=createAssistantData({mainSite:true,clientApiReady:false,fetch});
  await assert.rejects(data.overview(),error=>error.code==='NOT_INTEGRATED');
  await assert.rejects(data.catalog('windows'),error=>error.code==='NOT_INTEGRATED');
  assert.equal(calls.length,0,'disabled production facade must not issue requests');
});

test('identity list is a paged real customer read with only safe summary fields', async () => {
  const good={identities:[{id:'identity-1',userId:'user-1',displayName:'出口一',desiredStatus:'active',revision:1,credential:{fingerprint:'omit-me'},subscription:{active:true,expiresAt:null},createdAt:'2026-10-24T00:00:00.000Z'}],nextCursor:'cursor-1'};
  const data=createAssistantData({mainSite:true,fetch:fakeFetch({'GET /api/v1/tenants/me/identities':response(200,good)}).fetch});
  const summary={id:'identity-1',assignedUserId:'user-1',displayName:'出口一',status:'active',desiredStatus:'active',appliedStatus:'unknown',observedStatus:'unknown',bindingRevision:null,configRevision:null,lastObservedAt:null,health:'unknown',createdAt:'2026-10-24T00:00:00.000Z'};
  assert.deepEqual(plain(await data.identities()),{data_source:'real',identities:[summary],nextCursor:good.nextCursor});
  for(const bad of [
    {...good,data_source:'mock'},
    {...good,identities:[{...good.identities[0],desiredStatus:'unknown'}]},
    {...good,identities:[{...good.identities[0],createdAt:'bad-date'}]},
    {...good,identities:[good.identities[0],good.identities[0]]},
    {...good,nextCursor:42},
  ]){
    const failing=createAssistantData({mainSite:true,clientApiReady:true,fetch:fakeFetch({'GET /api/v1/tenants/me/identities':response(200,bad)}).fetch});
    await assert.rejects(failing.identities(),error=>error.code==='INVALID_RESPONSE');
  }
});

test('identity pages forward only bounded pagination options and never a customer or egress selector', async () => {
  const {fetch,calls}=fakeFetch({'GET /api/v1/tenants/me/identities?limit=20&cursor=page%2B%2F%3D':response(200,{identities:[],nextCursor:null})});
  const data=createAssistantData({mainSite:true,fetch});
  await data.identities({limit:20,cursor:'page+/='});
  assert.equal(calls.length,1);
  for(const options of [{limit:0},{limit:201},{cursor:'x'.repeat(2049)},{customerId:'foreign'},{exitId:'foreign'}])await assert.rejects(data.identities(options),error=>error.code==='VALIDATION_ERROR');
  assert.equal(calls.length,1,'invalid selectors must not reach the server');
});

test('customer entitlement is read from the customer API in bytes and keeps member privacy', async () => {
  const good={customer:{id:'customer-1',type:'enterprise',level:null,memberRole:'owner'},entitlement:{trafficQuotaBytes:107374182400,trafficResetPeriod:'monthly',effectiveTrafficQuotaBytes:118111600640,expiresAt:'2030-01-01T00:00:00.000Z'}};
  const data=createAssistantData({mainSite:true,fetch:fakeFetch({'GET /api/v1/tenants/me':response(200,good)}).fetch});
  assert.deepEqual(plain(await data.entitlements()),{data_source:'real',...good});
  const member=createAssistantData({mainSite:true,fetch:fakeFetch({'GET /api/v1/tenants/me':response(200,{customer:{id:'customer-1',type:'enterprise',level:null,memberRole:'member'},entitlement:null})}).fetch});
  assert.equal((await member.entitlements()).entitlement,null);
  for(const bad of [
    {...good,data_source:'mock'},
    {...good,customer:{...good.customer,memberRole:'member'}},
    {...good,customer:{...good.customer,id:''}},
    {...good,customer:{...good.customer,level:'platinum'}},
    {...good,entitlement:{...good.entitlement,trafficQuotaBytes:-1}},
    {...good,entitlement:{...good.entitlement,trafficResetPeriod:'weekly'}},
    {...good,entitlement:{...good.entitlement,expiresAt:'bad-date'}},
  ]){
    const failing=createAssistantData({mainSite:true,fetch:fakeFetch({'GET /api/v1/tenants/me':response(200,bad)}).fetch});
    await assert.rejects(failing.entitlements(),error=>error.code==='INVALID_RESPONSE');
  }
});

test('logout 403 CSRF_INVALID refreshes /me and retries once with the new token', async () => {
  const { fetch, calls } = fakeFetch({
    'POST /api/v1/auth/logout': n => n === 1 ? response(403, { error: { code: 'CSRF_INVALID', message: '会话校验失败' } }) : response(204),
    'GET /api/v1/me': response(200, { ...me(), csrfToken: 'csrf-2' }),
  });
  const data = createAssistantData({ fetch, mainSite: true });
  assert.equal(await data.logout('stale'), null);
  assert.deepEqual(calls.map(call => call.init.method + ' ' + call.path), ['POST /api/v1/auth/logout', 'GET /api/v1/me', 'POST /api/v1/auth/logout']);
  assert.equal(calls[2].init.headers['X-CSRF-Token'], 'csrf-2');
  const twice = createAssistantData({ fetch: fakeFetch({ 'POST /api/v1/auth/logout': response(403, { error: { code: 'CSRF_INVALID', message: 'x' } }), 'GET /api/v1/me': response(200, me()) }).fetch, mainSite: true });
  await assert.rejects(twice.logout('stale'), error => error.code === 'CSRF_INVALID');
});

test('reset drops cached real envelopes', async () => {
  const data = createAssistantData({ fetch: fakeFetch({ 'GET /api/v1/tenants/me/members': response(200, { members: [{ userId: 'u1', role: 'owner', status: 'active' }] }) }).fetch, mainSite: true });
  await data.members();
  assert.equal(data.snapshot('tenant').data.members.length, 1);
  data.reset();
  assert.equal(data.snapshot('tenant').data, null);
  assert.equal(data.snapshot('tenant').data_source, 'real');
});

test('labels: level only for personal, enterprise shows 企业账号 and unintegrated entitlement, roles and status in Chinese', () => {
  assert.equal(labels.account({ customerType: 'personal', level: null }).level, '待配置');
  assert.equal(labels.account({ customerType: 'personal', level: 'gold' }).level, '金牌');
  assert.equal(labels.account({ customerType: 'personal', level: 'silver' }).level, '银牌');
  const ent = labels.account({ customerType: 'enterprise', level: null, memberRole: 'admin', status: 'active' });
  assert.equal(ent.type, '企业账号'); assert.equal(ent.level, null); assert.equal(ent.entitlement, '见账号资源');
  assert.equal(ent.role, '管理员'); assert.equal(ent.status, '正常');
  assert.equal(labels.account({ customerType: 'personal', level: 'gold' }).entitlement, null);
  assert.equal(labels.role('owner'), '所有者'); assert.equal(labels.role('member'), '成员'); assert.equal(labels.role('weird'), '未知角色');
  assert.equal(labels.status('disabled'), '已停用'); assert.equal(labels.status(undefined), '未提供');
  assert.equal(labels.account({ customerType: 'personal', level: 'platinum' }).level, '待配置');
});

test('a real read that resolves after reset() never lands in the new account cache', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let n = 0;
  const fetch = async () => { n += 1; if (n === 1) { await gate; return response(200, { members: [{ userId: 'user-a', role: 'owner', status: 'active' }] }); } return response(200, { members: [{ userId: 'user-b', role: 'owner', status: 'active' }] }); };
  const data = createAssistantData({ fetch, mainSite: true });
  const stale = data.members();
  data.reset();
  await data.members();
  release();
  await stale;
  assert.equal(data.snapshot('tenant').data.members[0].userId, 'user-b');
  data.reset();
  const pending = data.members();
  data.reset();
  await pending;
  assert.equal(data.snapshot('tenant').data, null, 'stale result dropped after reset');
});
