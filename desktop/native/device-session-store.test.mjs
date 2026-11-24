import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createDeviceSessionStore } from './device-session-store.mjs';

const value = () => ({ version: 1, device: { id: '9d8dbf5b-fbc4-4454-a73a-f727409566c0', platform: 'windows', appVersion: '1.0.0', status: 'active', createdAt: '2026-10-28T00:00:00.000Z' }, session: {
  accessToken: 'nda_' + 'a'.repeat(43), expiresIn: 600, refreshToken: 'ndr_' + 'b'.repeat(43), refreshExpiresAt: '2026-11-27T00:00:00.000Z', scope: ['customer.read', 'tunnel.read'],
}, privateKeyJwk: generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' }), accessExpiresAt: '2026-10-28T00:10:00.000Z' });
function osBackend() {
  let record = null;
  const calls = [];
  return { available: () => true, calls, get: async () => record, set: async raw => { calls.push(raw); record = raw; return true; }, remove: async () => { const had = record !== null; record = null; return had; } };
}

test('device session uses one OS record without a customer or enterprise scope and returns independent copies', async () => {
  const backend = osBackend(), store = createDeviceSessionStore({ platform: 'win32', backend });
  assert.equal(store.available(), true);
  assert.equal(await store.load(), null);
  const input = value();
  assert.equal(await store.save(input), true);
  assert.equal(backend.calls.length, 1);
  assert.equal(typeof backend.calls[0], 'string');
  const loaded = await store.load(); assert.deepEqual(loaded, input);
  loaded.session.accessToken = 'changed';
  assert.equal((await store.load()).session.accessToken, input.session.accessToken);
  assert.equal(await store.clear(), true); assert.equal(await store.load(), null); assert.equal(await store.clear(), false);
});

test('device session rejects unknown fields, invalid keys/tokens/scopes and oversize values before OS writes', async () => {
  const backend = osBackend(), store = createDeviceSessionStore({ platform: 'linux', backend });
  for (const mutate of [x => { x.egressId = 'client-choice'; }, x => { x.session.cookie = 'secret'; }, x => { x.device.customerId = 'fake'; },
    x => { x.privateKeyJwk.d = 'invalid'; }, x => { x.privateKeyJwk.kty = 'RSA'; }, x => { x.session.accessToken = 'bad\nvalue'; },
    x => { x.session.scope = ['ops.write']; }, x => { x.accessExpiresAt = 'invalid'; }, x => { x.session.expiresIn = 3600; },
    x => { x.session.accessToken = 'a'.repeat(1600); x.session.refreshToken = 'b'.repeat(1600); }]) {
    const input = value(); mutate(input);
    await assert.rejects(store.save(input), { code: 'DEVICE_SESSION_INVALID' });
  }
  assert.deepEqual(backend.calls, []);
});

test('unavailable or failed OS storage never falls back to plaintext or an in-memory saved session', async () => {
  const unavailable = createDeviceSessionStore({ platform: 'darwin' });
  assert.equal(unavailable.available(), false);
  await assert.rejects(unavailable.save(value()), { code: 'SECURE_STORE_UNAVAILABLE' });
  await assert.rejects(unavailable.load(), { code: 'SECURE_STORE_UNAVAILABLE' });
  const backend = osBackend(); backend.set = async () => false;
  const failed = createDeviceSessionStore({ platform: 'linux', backend });
  await assert.rejects(failed.save(value()), { code: 'SECURE_STORE_OPERATION_FAILED' });
  assert.equal(await failed.load(), null);
  backend.get = async () => { throw new Error('PRIVATE TOKEN'); };
  await assert.rejects(failed.load(), error => error.code === 'SECURE_STORE_OPERATION_FAILED' && !/PRIVATE|TOKEN/.test(error.message));
});

test('malformed OS records fail closed and are never returned as a partial session', async () => {
  const backend = osBackend(), store = createDeviceSessionStore({ platform: 'linux', backend });
  for (const raw of ['{bad', '{}', 'x'.repeat(2401), JSON.stringify({ ...value(), privateKeyJwk: null })]) {
    backend.get = async () => raw;
    await assert.rejects(store.load(), { code: 'DEVICE_SESSION_INVALID' });
  }
});
