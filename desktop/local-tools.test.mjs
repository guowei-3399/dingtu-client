import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

const source = await readFile(new URL('./local-tools.js', import.meta.url), 'utf8');
const context = createContext({ AbortController });
runInContext(source, context);
const api = context.AssistantLocal;
api.configureAppDirectory(['claude-code','codex','cursor','gemini-cli','copilot',{id:'chatgpt',mobile:true},{id:'claude',mobile:true},{id:'gemini-web',mobile:true},{id:'grok',mobile:true},{id:'metamuse',mobile:true},{id:'manus',mobile:true}]);
const plain = value => JSON.parse(JSON.stringify(value));

test('real proxy failures and auth sync events never carry mock connection text', () => {
  const log=api.createEventLog();
  const failed=log.add('connection_failed',{simulated:false});
  assert.doesNotMatch(failed.message,/模拟|演示/);
  assert.equal(failed.simulated,false);
  assert.match(log.add('connection_failed').message,/模拟/);
  assert.ok(log.add('account_sync_failed',{simulated:false}));
  assert.ok(log.add('browser_started',{simulated:false}));
});
function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values };
}
const key = 'dingtu-assistant-local-v1';
const poolKey = 'dingtu-assistant-credential-pool-v2:tenant-1/owner-1';
const ownerScope = { customerId: 'tenant-1', userId: 'owner-1', customerType: 'enterprise', memberRole: 'owner' };
const relayPolicy = overrides => ({ enabled: true, maxSlots: 32, allowedProviders: ['anthropic', 'openai', 'google', 'xai'], maxAttempts: 4,
  threshold5hPercent: null, threshold7dPercent: null, cooldownSeconds: null, allowTaskContinue: false, ...overrides });
function scopedPool(storage = memoryStorage(), options = {}) {
  const pool = api.createCredentialPool(storage, options);
  pool.bindScope(ownerScope);
  pool.configurePolicy(relayPolicy());
  return pool;
}
function addSlot(pool, id, { provider = 'anthropic', priority = 1, ...rest } = {}) {
  return pool.add({ id, provider, label: id, credentialRef: 'keychain:' + id, priority, ...rest });
}
const rejection = (provider = 'anthropic', reason = 'quota_exhausted', extra = {}) => ({ status: 429, providerRejection: { provider, reason, requestAccepted: false }, ...extra });
const requestOptions = { provider: 'anthropic', sessionKey: 'session-1', method: 'POST', sideEffects: false, replayPolicy: 'inference-only' };
const secretStore = { available: async () => true, get: async ref => 'raw-secret-' + ref };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('device preferences survive reload while arbitrary credentials and runtime state never persist', () => {
  const storage = memoryStorage({ 'main-site-account': 'untouched' });
  const preferences = api.createPreferences(storage);
  assert.equal(preferences.load().value.settings.notify, true);
  assert.equal(preferences.save({ version: 1, themes: { windows: 'dark' }, selectedApps: { windows: 'codex', ios: 'codex', android: 'claude' }, categories: { ios: '编程' }, settings: { notify: false, startup: true }, email: 'private@example.test', csrfToken: 'SECRET', state: 'connected', ip: '198.51.100.2', user: { id: 'PRIVATE' } }).ok, true);
  const saved = api.createPreferences(storage).load().value;
  assert.deepEqual(plain(saved.themes), { windows: 'dark' });
  assert.deepEqual(plain(saved.selectedApps), { windows: 'codex', android: 'claude' });
  assert.equal(saved.categories.ios, '全部');
  assert.equal(saved.settings.notify, false);
  assert.equal(saved.settings.startup, true);
  assert.equal(saved.settings.autoConnect, true);
  assert.doesNotMatch(storage.getItem(key), /SECRET|private|198\.51|connected/);
  preferences.clear();
  assert.equal(storage.getItem(key), null);
  assert.equal(storage.getItem('main-site-account'), 'untouched');
});

test('malformed, oversized, obsolete and prototype-shaped saved data fall back without polluting objects', () => {
  for (const text of ['{broken', 'x'.repeat(16385), JSON.stringify({ version: 99 }), '{"version":1,"themes":{"__proto__":{"polluted":true},"windows":"banana"},"settings":{"notify":"yes"}}']) {
    const storage = memoryStorage({ [key]: text });
    const result = api.createPreferences(storage).load();
    assert.deepEqual(plain(result.value), { version: 1, themes: {}, selectedApps: {}, categories: {}, settings: { startup: false, autoConnect: true, notify: true } });
    assert.equal({}.polluted, undefined);
    assert.equal(storage.getItem(key), text);
  }
});

test('storage denial and quota failure are recoverable, with validated preferences usable in memory', () => {
  const storage = { getItem() { throw new Error('SECRET denied'); }, setItem() { throw new Error('SECRET quota'); }, removeItem() { throw new Error('SECRET denied'); } };
  const preferences = api.createPreferences(storage);
  assert.equal(preferences.load().ok, false);
  const saved = preferences.save({ version: 1, themes: { ios: 'dark' }, settings: { notify: false } });
  assert.equal(saved.ok, false);
  assert.equal(saved.value.themes.ios, 'dark');
  assert.equal(saved.value.settings.notify, false);
  assert.doesNotMatch(saved.error, /SECRET/);
  assert.equal(preferences.clear().ok, false);
  assert.equal(api.createPreferences(undefined).load().ok, false);
});

test('credential pools require an authenticated enterprise owner/admin scope and isolate customers, users and providers', () => {
  const storage = memoryStorage();
  const pool = api.createCredentialPool(storage, { now: () => Date.parse('2026-10-24T00:00:00Z') });
  assert.deepEqual(plain(pool.snapshot().slots), []);
  assert.throws(() => addSlot(pool, 'a'), /CREDENTIAL_SCOPE_REQUIRED/);
  assert.throws(() => pool.bindScope({ ...ownerScope, memberRole: 'member' }), /CREDENTIAL_SCOPE_FORBIDDEN/);
  assert.throws(() => pool.bindScope({ ...ownerScope, customerType: 'personal' }), /CREDENTIAL_SCOPE_FORBIDDEN/);
  pool.bindScope(ownerScope);
  pool.configurePolicy(relayPolicy());
  addSlot(pool, 'claude-a'); addSlot(pool, 'codex-a', { provider: 'openai', priority: 0 });
  assert.equal(pool.select({ sessionKey: 'session', provider: 'anthropic' }).id, 'claude-a');
  assert.equal(pool.select({ sessionKey: 'session', provider: 'openai' }).id, 'codex-a');
  assert.throws(() => pool.select('session'), /CREDENTIAL_REQUEST_CONTEXT_REQUIRED/);
  for (const scope of [{ ...ownerScope, userId: 'other-owner' }, { ...ownerScope, customerId: 'other-tenant' }]) {
    pool.bindScope(scope);
    pool.configurePolicy(relayPolicy());
    assert.equal(pool.snapshot().slots.length, 0);
    assert.equal(pool.select({ sessionKey: 'session', provider: 'anthropic' }), null);
    assert.throws(() => pool.update('claude-a', { label: 'x' }), /CREDENTIAL_SLOT_NOT_FOUND/);
  }
  pool.bindScope(ownerScope);
  assert.equal(pool.snapshot().slots.length, 2);
  pool.bindScope(null);
  assert.equal(pool.snapshot().slots.length, 0);
  assert.notEqual(storage.getItem(poolKey), null, 'logout preserves the local pool for the same authenticated account');
  assert.equal(pool.scope(), null);
});

test('metadata accepts only a strict schema, ignores obsolete unscoped pools, and treats revocation as terminal', () => {
  const storage = memoryStorage({ 'dingtu-assistant-credential-pool-v1': JSON.stringify({ version: 1, slots: [{ id: 'legacy' }] }) });
  const pool = scopedPool(storage);
  assert.equal(pool.snapshot().slots.length, 0);
  for (const field of ['apiKey', 'secret', 'accessToken', 'cookie', 'authorization', 'password']) {
    assert.throws(() => addSlot(pool, 'a', { [field]: 'RAW-SECRET' }), /RAW_CREDENTIALS_NOT_ALLOWED/);
  }
  assert.throws(() => addSlot(pool, 'a', { metadata: { token: 'RAW-SECRET' } }), /CREDENTIAL_SLOT_FIELD_NOT_ALLOWED/);
  assert.throws(() => addSlot(pool, 'a', { credentialRef: 'sk-ant-secret' }), /CREDENTIAL_SLOT_INVALID/);
  addSlot(pool, 'a');
  assert.throws(() => pool.update('a', { provider: 'openai' }), /CREDENTIAL_SLOT_FIELD_NOT_ALLOWED/);
  assert.throws(() => pool.update('a', { credentialRef: 'keychain:b' }), /CREDENTIAL_SLOT_FIELD_NOT_ALLOWED/);
  assert.equal(pool.revoke('a').ok, true);
  assert.throws(() => pool.markHealthy('a'), /CREDENTIAL_SLOT_REVOKED/);
  assert.equal(pool.select({ sessionKey: 'session', provider: 'anthropic' }), null);
  assert.doesNotMatch(storage.getItem(poolKey), /RAW-SECRET|sk-ant/);
  const restored = scopedPool(storage);
  assert.equal(restored.snapshot().slots[0].status, 'revoked');
});

test('a bound enterprise is not a relay grant; missing, removed and malformed policies fail closed', async () => {
  const pool = api.createCredentialPool(memoryStorage());
  pool.bindScope(ownerScope);
  assert.equal(pool.policy().configured, false);
  assert.equal(pool.policy().enabled, false);
  assert.throws(() => addSlot(pool, 'a'), /CREDENTIAL_POOL_NOT_ENTITLED/);
  assert.throws(() => pool.select({ provider: 'anthropic', sessionKey: 's' }), /CREDENTIAL_POOL_NOT_ENTITLED/);
  const router = api.createCredentialRouter(pool, { secretStore });
  await assert.rejects(router.request({ ...requestOptions, execute: async () => assert.fail('must not dispatch') }), /CREDENTIAL_POOL_NOT_ENTITLED/);
  pool.configurePolicy(relayPolicy()); addSlot(pool, 'a');
  for (const policy of [null, relayPolicy({ maxAttempts: 0 }), relayPolicy({ allowedProviders: null }), relayPolicy({ enabled: false, maxSlots: 1 })]) {
    if (policy === null) pool.configurePolicy(null);
    else assert.throws(() => pool.configurePolicy(policy), /CREDENTIAL_POLICY_INVALID/);
    assert.equal(pool.policy().enabled, false);
    assert.throws(() => pool.select({ provider: 'anthropic', sessionKey: 's' }), /CREDENTIAL_POOL_NOT_ENTITLED/);
    assert.equal(pool.snapshot().slots.length, 1, 'entitlement changes preserve local metadata');
    pool.configurePolicy(relayPolicy());
  }
  pool.bindScope({ ...ownerScope, userId: 'new-owner' });
  assert.equal(pool.policy().enabled, false, 'policy cannot cross account boundaries');
  pool.configurePolicy(relayPolicy({ enabled: false, maxSlots: 0, allowedProviders: [] }));
  assert.equal(pool.policy().configured, true);
  assert.throws(() => addSlot(pool, 'b'), /CREDENTIAL_POOL_NOT_ENTITLED/);
});

test('operator provider slugs are extensible and bounded by the relay grant', async () => {
  const pool = scopedPool();
  pool.configurePolicy(relayPolicy({ allowedProviders: ['new-agent.vendor-v2'] }));
  addSlot(pool, 'a', { provider: 'new-agent.vendor-v2' });
  assert.equal(pool.select({ provider: 'new-agent.vendor-v2', sessionKey: 's' }).id, 'a');
  assert.throws(() => addSlot(pool, 'b', { provider: 'anthropic' }), /CREDENTIAL_PROVIDER_NOT_ALLOWED/);
  assert.throws(() => pool.select({ provider: 'anthropic', sessionKey: 's' }), /CREDENTIAL_PROVIDER_NOT_ALLOWED/);
  for (const provider of ['../provider', 'Provider', 'a'.repeat(65), 'x/y', undefined]) {
    assert.throws(() => pool.configurePolicy(relayPolicy({ allowedProviders: [provider] })), /CREDENTIAL_POLICY_INVALID/);
  }
});

test('reduced slot grants constrain existing dispatch without deleting metadata or treating exhausted slots as free', () => {
  const pool = scopedPool();
  addSlot(pool, 'a'); addSlot(pool, 'b', { priority: 2 }); addSlot(pool, 'c', { provider: 'openai', priority: 3 });
  assert.equal(pool.select({ provider: 'anthropic', sessionKey: 'sticky', exclude: ['a'] }).id, 'b');
  pool.configurePolicy(relayPolicy({ maxSlots: 1 }));
  assert.equal(pool.select({ provider: 'anthropic', sessionKey: 'sticky' }).id, 'a');
  pool.markExhausted('a');
  assert.equal(pool.select({ provider: 'anthropic', sessionKey: 's' }), null);
  assert.equal(pool.select({ provider: 'openai', sessionKey: 's' }), null);
  assert.throws(() => addSlot(pool, 'd'), /CREDENTIAL_POOL_FULL/);
  assert.equal(pool.snapshot().slots.length, 3);
  pool.revoke('a');
  assert.equal(pool.select({ provider: 'anthropic', sessionKey: 's' }).id, 'b', 'revocation releases a slot, quota exhaustion does not');
  const replacement = scopedPool();
  replacement.configurePolicy(relayPolicy({ maxSlots: 1 }));
  addSlot(replacement, 'old'); replacement.revoke('old');
  assert.equal(addSlot(replacement, 'new').ok, true, 'a revoked slot can be replaced without deleting its audit metadata');
});

test('re-reading the same grant does not cancel work and callers cannot mutate the stored grant', async () => {
  const pool = scopedPool(); addSlot(pool, 'a');
  const copy = pool.policy(); copy.allowedProviders.push('other'); copy.maxAttempts = 999;
  assert.equal(pool.policy().maxAttempts, 4);
  assert.equal(pool.policy().allowedProviders.includes('other'), false);
  const entered = deferred(), finish = deferred(); let signal;
  const active = api.createCredentialRouter(pool, { secretStore }).request({ ...requestOptions, execute: async input => { signal = input.signal; entered.resolve(); return finish.promise; } });
  await entered.promise;
  pool.configurePolicy(relayPolicy({ allowedProviders: ['xai', 'google', 'openai', 'anthropic'] }));
  assert.equal(signal.aborted, false);
  finish.resolve({ status: 200 });
  assert.equal((await active).status, 200);
});

test('server retry ceilings cannot be raised by a caller', async () => {
  const pool = scopedPool();
  addSlot(pool, 'a'); addSlot(pool, 'b', { priority: 2 });
  pool.configurePolicy(relayPolicy({ maxAttempts: 1 }));
  const router = api.createCredentialRouter(pool, { secretStore, maxAttempts: 999 });
  const calls = [];
  assert.equal((await router.request({ ...requestOptions, maxAttempts: 999, execute: async ({ slot }) => { calls.push(slot.id); return rejection(); } })).status, 429);
  assert.deepEqual(calls, ['a']);
});

test('policy changes abort active requests, reject queued work and prevent a delayed secret from dispatching', async () => {
  for (const change of [pool => pool.configurePolicy(relayPolicy({ maxSlots: 1 })), pool => pool.configurePolicy(null), pool => assert.throws(() => pool.configurePolicy({}), /CREDENTIAL_POLICY_INVALID/)]) {
    const pool = scopedPool(); addSlot(pool, 'a');
    const entered = deferred(), finish = deferred(); let signal, calls = 0;
    const router = api.createCredentialRouter(pool, { secretStore });
    const active = router.request({ ...requestOptions, execute: async input => { calls++; signal = input.signal; entered.resolve(); return finish.promise; } });
    await entered.promise;
    const queued = router.request({ ...requestOptions, execute: async () => { calls++; return { status: 200 }; } });
    change(pool);
    assert.equal(signal.aborted, true);
    finish.resolve({ status: 200 });
    await assert.rejects(active, /CREDENTIAL_POLICY_CHANGED/);
    await assert.rejects(queued, /CREDENTIAL_POLICY_CHANGED/);
    assert.equal(calls, 1);
  }
  const pool = scopedPool(); addSlot(pool, 'a');
  const entered = deferred(), finish = deferred(); let calls = 0;
  const pending = api.createCredentialRouter(pool, { secretStore: { ...secretStore, get: async () => { entered.resolve(); return finish.promise; } } })
    .request({ ...requestOptions, execute: async () => { calls++; return { status: 200 }; } });
  await entered.promise;
  pool.configurePolicy(null); finish.resolve('raw-secret');
  await assert.rejects(pending, /CREDENTIAL_POLICY_CHANGED/);
  assert.equal(calls, 0);
});

test('corrupted/cross-scope persisted metadata and storage failures fail closed without reading another namespace', () => {
  const wrong = { version: 2, scope: { ...ownerScope, userId: 'other-user' }, slots: [] };
  for (const text of ['{broken', JSON.stringify(wrong), JSON.stringify({ version: 2, scope: ownerScope, slots: [{ id: 'a', token: 'RAW-SECRET' }] }), 'x'.repeat(65537)]) {
    const pool = api.createCredentialPool(memoryStorage({ [poolKey]: text }));
    assert.equal(pool.bindScope(ownerScope).ok, false);
    assert.throws(() => pool.select({ sessionKey: 'session', provider: 'anthropic' }), /CREDENTIAL_POOL_STORAGE_UNAVAILABLE/);
    assert.deepEqual(plain(pool.snapshot().slots), []);
  }
  const denied = api.createCredentialPool({ getItem() { throw new Error('private reason'); } });
  assert.doesNotMatch(denied.bindScope(ownerScope).error, /private/);
  const storage = memoryStorage();
  const pool = scopedPool({ ...storage, setItem() { throw new Error('private reason'); } });
  assert.equal(addSlot(pool, 'a').ok, false);
  assert.throws(() => pool.select({ sessionKey: 'session', provider: 'anthropic' }), /CREDENTIAL_POOL_STORAGE_UNAVAILABLE/);
});

test('sticky leases survive preferred-account cooldown recovery and never cross provider boundaries', () => {
  let at = Date.parse('2026-10-24T00:00:00Z');
  const pool = scopedPool(memoryStorage(), { now: () => at });
  addSlot(pool, 'a'); addSlot(pool, 'b', { priority: 2 }); addSlot(pool, 'openai', { provider: 'openai', priority: 0 });
  const select = () => pool.select({ sessionKey: 'session', provider: 'anthropic' });
  assert.equal(select().id, 'a');
  pool.markRateLimited('a', '5');
  assert.equal(select().id, 'b');
  at += 6000;
  assert.equal(select().id, 'b', 'a recovered, but the existing session remains sticky to b');
  assert.equal(pool.select({ sessionKey: 'new-session', provider: 'anthropic' }).id, 'a');
  pool.markExhausted('b');
  pool.revoke('a');
  assert.equal(select(), null, 'an OpenAI slot is not a Claude fallback');
});

test('Retry-After seconds and HTTP dates honor server skew, monotonic time and process-restart clock recovery', () => {
  let wall = Date.parse('2026-10-24T00:00:00Z'), tick = 1000;
  const storage = memoryStorage();
  const pool = scopedPool(storage, { now: () => wall, monotonicNow: () => tick });
  addSlot(pool, 'a');
  pool.markRateLimited('a', { headers: { 'Retry-After': '10' } });
  assert.equal(pool.snapshot().slots[0].cooldownUntil, '2026-10-24T00:00:10.000Z');
  wall -= 3600000; tick += 10001;
  assert.equal(pool.select({ provider: 'anthropic', sessionKey: 's' }).id, 'a');
  pool.markRateLimited('a', { headers: { 'Retry-After': 'Sat, 24 Oct 2026 02:00:20 GMT', Date: 'Sat, 24 Oct 2026 02:00:00 GMT' } });
  assert.equal(pool.snapshot().slots[0].cooldownDurationMs, 20000);
  tick += 19000;
  assert.equal(pool.select({ provider: 'anthropic', sessionKey: 's' }), null);
  tick += 1001;
  assert.equal(pool.select({ provider: 'anthropic', sessionKey: 's' }).id, 'a');
  pool.markRateLimited('a', { headers: { 'retry-after': 'nonsense' } });
  assert.equal(pool.snapshot().slots[0].cooldownDurationMs, 60000);
  const restarted = scopedPool(storage, { now: () => wall, monotonicNow: () => tick });
  assert.equal(Date.parse(restarted.snapshot().slots[0].cooldownUntil) - wall, 60000, 'backwards restart clock clamps to the recorded delay');
  tick += 60001;
  assert.equal(restarted.select({ provider: 'anthropic', sessionKey: 's' }).id, 'a');
});

test('router uses scoped native secret references and switches only after an explicit pre-acceptance quota rejection', async () => {
  const storage = memoryStorage();
  const pool = scopedPool(storage);
  addSlot(pool, 'a'); addSlot(pool, 'b', { priority: 2 }); addSlot(pool, 'c', { provider: 'openai' });
  const calls = [];
  const secretContexts = [];
  const router = api.createCredentialRouter(pool, { secretStore: { ...secretStore, get: async (ref, context) => { secretContexts.push(plain(context)); return 'raw-secret-' + ref; } } });
  const result = await router.request({ ...requestOptions, execute: async ({ slot, secret }) => {
    calls.push({ id: slot.id, secret });
    return slot.id === 'a' ? rejection() : { status: 200, body: 'ok' };
  } });
  assert.equal(result.status, 200);
  assert.deepEqual(calls.map(call => call.id), ['a', 'b']);
  assert.deepEqual(calls.map(call => call.secret), ['raw-secret-keychain:a', 'raw-secret-keychain:b']);
  assert.deepEqual(secretContexts, ['a', 'b'].map(slotId => ({ ...ownerScope, provider: 'anthropic', slotId })));
  assert.equal(pool.select({ provider: 'anthropic', sessionKey: 'session-1' }).id, 'b');
  assert.equal(pool.snapshot().slots[0].status, 'exhausted');
  assert.doesNotMatch(storage.getItem(poolKey), /raw-secret|password|token/);
});

test('plain 429, mismatched provider, authentication, region, policy and network failures never trigger automatic rotation', async () => {
  const failures = [
    { status: 429 },
    { ...rejection(), providerRejection: { provider: 'anthropic', reason: 'quota_exhausted', requestAccepted: true } },
    rejection('openai'),
    rejection('anthropic', 'quota_exhausted', { status: 401 }),
    rejection('anthropic', 'quota_exhausted', { status: 403 }),
    rejection('anthropic', 'rate_limited', { code: 'unsupported_country_region_territory' }),
    rejection('anthropic', 'rate_limited', { error: { code: 'policy_violation' } }),
    { code: 'ETIMEDOUT' },
  ];
  for (const failure of failures) {
    for (const throws of [false, true]) {
      const pool = scopedPool(); addSlot(pool, 'a'); addSlot(pool, 'b', { priority: 2 });
      const router = api.createCredentialRouter(pool, { secretStore });
      let calls = 0;
      const pending = router.request({ ...requestOptions, execute: async () => { calls++; if (throws) throw failure; return failure; } });
      if (throws) await assert.rejects(pending, error => error === failure);
      else assert.equal(await pending, failure);
      assert.equal(calls, 1);
      assert.equal(pool.snapshot().slots[0].status, 'active');
    }
  }
});

test('unsafe requests, unspecified replay policy and started streams are never replayed', async () => {
  for (const options of [
    { replayPolicy: 'never' },
    { sideEffects: true },
    { method: 'DELETE', replayPolicy: 'safe-read' },
    { method: 'POST', replayPolicy: 'safe-read' },
    { started: true },
  ]) {
    const pool = scopedPool(); addSlot(pool, 'a'); addSlot(pool, 'b', { priority: 2 });
    const router = api.createCredentialRouter(pool, { secretStore });
    let calls = 0;
    const result = await router.request({ ...requestOptions, ...options, execute: async ({ onStreamStart }) => { calls++; if (options.started) onStreamStart(); return rejection(); } });
    assert.equal(result.status, 429);
    assert.equal(calls, 1);
    if (options.started) assert.equal(pool.snapshot().slots[0].status, 'active');
  }
});

test('stream requests can fail over before stream start, but serial queue remains locked until stream completion', async () => {
  const pool = scopedPool(); addSlot(pool, 'a'); addSlot(pool, 'b', { priority: 2 });
  const router = api.createCredentialRouter(pool, { secretStore });
  const completed = deferred(), entered = deferred(), calls = [];
  const first = router.request({ ...requestOptions, streaming: true, execute: async ({ slot, onStreamStart }) => {
    calls.push(slot.id);
    if (slot.id === 'a') return rejection();
    onStreamStart(); entered.resolve(); return { status: 200, streamCompletion: completed.promise };
  } });
  await entered.promise;
  const second = router.request({ ...requestOptions, execute: async () => { calls.push('second'); return { status: 200 }; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['a', 'b']);
  completed.resolve();
  await first; await second;
  assert.deepEqual(calls, ['a', 'b', 'second']);
});

test('retry count is bounded, no slot is retried in one request, and final provider rejection remains visible', async () => {
  const pool = scopedPool(); for (let n = 0; n < 6; n++) addSlot(pool, 'slot-' + n, { priority: n });
  const router = api.createCredentialRouter(pool, { secretStore, maxAttempts: 999 });
  const calls = [];
  const last = await router.request({ ...requestOptions, execute: async ({ slot }) => { calls.push(slot.id); return rejection(); } });
  assert.equal(last.status, 429);
  assert.deepEqual(calls, ['slot-0', 'slot-1', 'slot-2', 'slot-3']);
  const single = scopedPool(); addSlot(single, 'a');
  const terminal = rejection();
  assert.equal(await api.createCredentialRouter(single, { secretStore }).request({ ...requestOptions, execute: async () => terminal }), terminal);
});

test('missing/unavailable secure stores stop immediately rather than skipping to another account', async () => {
  for (const store of [null, { get: async () => 'secret' }, { ...secretStore, available: async () => false }, { ...secretStore, get: async () => null }, { ...secretStore, get: async () => { throw new Error('RAW-SECRET'); } }]) {
    const pool = scopedPool(); addSlot(pool, 'a'); addSlot(pool, 'b', { priority: 2 });
    let calls = 0;
    await assert.rejects(api.createCredentialRouter(pool, { secretStore: store }).request({ ...requestOptions, execute: async () => { calls++; return { status: 200 }; } }), /SECURE_(STORE|CREDENTIAL)_UNAVAILABLE/);
    assert.equal(calls, 0);
    assert.equal(pool.snapshot().slots[0].status, 'active');
  }
});

test('revocation while loading a secret prevents dispatch; scope changes reject queued work and abort active requests', async () => {
  const pool = scopedPool(); addSlot(pool, 'a');
  const secret = deferred(), entered = deferred();
  const router = api.createCredentialRouter(pool, { secretStore: { ...secretStore, get: async () => { entered.resolve(); return secret.promise; } } });
  let calls = 0;
  const pending = router.request({ ...requestOptions, execute: async () => { calls++; return { status: 200 }; } });
  await entered.promise;
  pool.revoke('a'); secret.resolve('secret');
  await assert.rejects(pending, /CREDENTIAL_SLOT_UNAVAILABLE/);
  assert.equal(calls, 0);

  const otherPool = scopedPool(); addSlot(otherPool, 'a');
  const running = deferred(), finish = deferred(); let signal;
  const otherRouter = api.createCredentialRouter(otherPool, { secretStore });
  const first = otherRouter.request({ ...requestOptions, execute: async input => { signal = input.signal; running.resolve(); return finish.promise; } });
  await running.promise;
  const queued = otherRouter.request({ ...requestOptions, execute: async () => { calls++; return { status: 200 }; } });
  otherPool.bindScope({ ...ownerScope, userId: 'new-owner' });
  assert.equal(signal.aborted, true);
  finish.resolve({ status: 200 });
  await assert.rejects(first, /CREDENTIAL_SCOPE_CHANGED/);
  await assert.rejects(queued, /CREDENTIAL_SCOPE_CHANGED/);
  assert.equal(calls, 0);
});

test('all routers sharing a pool use one queue and a failing request does not wedge later work', async () => {
  const pool = scopedPool(); addSlot(pool, 'a');
  const routerA = api.createCredentialRouter(pool, { secretStore }), routerB = api.createCredentialRouter(pool, { secretStore });
  const entered = deferred(), finish = deferred(); const calls = [];
  const first = routerA.request({ ...requestOptions, execute: async () => { calls.push('first'); entered.resolve(); await finish.promise; throw new Error('network'); } });
  await entered.promise;
  const second = routerB.request({ ...requestOptions, execute: async () => { calls.push('second'); return { status: 200 }; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['first']);
  finish.resolve();
  await assert.rejects(first, /network/);
  assert.equal((await second).status, 200);
  assert.deepEqual(calls, ['first', 'second']);
});

test('local event history is bounded, copied on read, and tracks read state without accepting caller messages', () => {
  const log = api.createEventLog({ limit: 2, now: () => Date.UTC(2026, 9, 22) });
  assert.equal(log.add('unknown', { message: 'SECRET' }), null);
  log.add('connection_started', { platform: 'ios', appId: 'claude', message: 'SECRET', email: 'private@example.test' });
  log.add('connection_failed', { simulated: true });
  assert.equal(log.unreadCount(), 2);
  log.markAllRead();
  assert.equal(log.unreadCount(), 0);
  log.add('preferences_saved', { read: true, simulated: false });
  assert.equal(log.list().length, 2);
  assert.equal(log.unreadCount(), 0);
  const copy = log.list(); copy[0].message = 'SECRET';
  assert.doesNotMatch(JSON.stringify(log.list()), /SECRET|private/);
  log.clear();
  assert.equal(log.list().length, 0);
});

test('diagnostic export rejects injected account, session, URLs, IP addresses and arbitrary log text', () => {
  const event = { code: 'connection_failed', at: '2026-10-22T00:00:00Z', id: 'TOKEN', message: 'TOKEN', email: 'private@example.test', url: 'https://private.test/', ip: '198.51.100.2', platform: 'ios', appId: 'claude' };
  const report = api.buildDiagnostic({ platform: 'ios', theme: 'dark', selectedApp: 'claude-code', status: 'connected', online: false, storageAvailable: true, viewport: { width: 375, height: 812, user: 'TOKEN' }, events: [event, { ...event, code: 'private-token' }, { ...event, at: 'invalid' }], email: 'private@example.test', csrfToken: 'TOKEN', session: 'TOKEN', ip: '198.51.100.2', userAgent: 'TOKEN' });
  assert.equal(report.mode, 'browser-preview'); assert.equal(report.realTunnel, false);
  assert.equal(report.connection.simulated, true); assert.equal(report.connection.selectedApp, null);
  assert.equal(report.environment.online, false);
  assert.deepEqual(plain(report.environment.viewport), { width: 375, height: 812 });
  assert.equal(report.events.length, 1);
  assert.doesNotMatch(JSON.stringify(report), /TOKEN|private|198\.51|csrfToken|userAgent/);
});
