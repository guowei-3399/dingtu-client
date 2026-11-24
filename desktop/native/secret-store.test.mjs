import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createNativeSecretStore } from './secret-store.mjs';

const scope = Object.freeze({ customerId: `native-test-${randomUUID()}`, userId: `user-${randomUUID()}`,
  customerType: 'enterprise', memberRole: 'owner' });
const context = { ...scope, provider: 'anthropic', slotId: `test-${randomUUID()}` };
const ref = `test-${randomUUID()}`;

test('native store fails closed for unbound, personal, member and foreign contexts', async () => {
  const store = createNativeSecretStore({ scope });
  assert.equal(createNativeSecretStore().available(scope), false);
  assert.equal(store.available({ ...scope, customerType: 'personal' }), false);
  assert.equal(store.available({ ...scope, memberRole: 'member' }), false);
  assert.equal(store.available({ ...scope, userId: 'another-user' }), false);
  await assert.rejects(store.get(ref, { ...context, customerId: 'another-customer' }), { code: 'SECURE_STORE_UNAVAILABLE' });
  await assert.rejects(store.set(ref, 'unused-test-value', { ...context, memberRole: 'member' }), { code: 'SECURE_STORE_UNAVAILABLE' });
  if (process.platform !== 'win32') {
    assert.equal(store.available(scope), false);
    await assert.rejects(store.get(ref, context), { code: 'SECURE_STORE_UNAVAILABLE' });
  }
  for (const nonWinPlatform of ['darwin', 'linux']) {
    const crossStore = createNativeSecretStore({ scope, platform: nonWinPlatform });
    assert.equal(crossStore.available(scope), false);
    await assert.rejects(
      crossStore.get(ref, context),
      error => error.code === 'SECURE_STORE_UNAVAILABLE' && error.message === 'SECURE_STORE_UNAVAILABLE',
    );
    await assert.rejects(
      crossStore.set(ref, 'raw-secret-value', context),
      error => error.code === 'SECURE_STORE_UNAVAILABLE' && !/raw-secret-value/.test(error.message),
    );
  }
});

test('Windows Credential Manager performs a real isolated roundtrip, update, scope separation and cleanup', async t => {
  const store = createNativeSecretStore({ scope });
  if (process.platform !== 'win32') {
    // Unsupported platforms are an explicit test assertion, never a mock store.
    assert.equal(store.available(scope), false);
    return;
  }
  assert.equal(store.available(scope), true);
  const secret = `noya-temporary-test-${randomBytes(32).toString('hex')}-测试`;
  const second = `noya-updated-test-${randomBytes(32).toString('hex')}`;
  let created = false, unavailable = false;
  try {
    assert.equal(await store.get(ref, context), null);
    assert.equal(await store.set(ref, secret, context), true); created = true;
    // A new adapter instance must read the OS store, rather than process memory.
    assert.equal(await createNativeSecretStore({ scope }).get(ref, context), secret);
    assert.equal(await store.get(ref, { ...context, provider: 'openai' }), null);
    assert.equal(await store.get(`${ref}-other`, context), null);
    assert.equal(await store.get(ref, { ...context, slotId: `${context.slotId}-other` }), null);
    const otherUser = { ...scope, userId: `other-${randomUUID()}` };
    assert.equal(await createNativeSecretStore({ scope: otherUser }).get(ref, { ...context, ...otherUser }), null);
    await assert.rejects(store.set(ref, 'x'.repeat(2561), context), { code: 'SECURE_CREDENTIAL_INVALID' });
    assert.equal(await store.set(ref, second, context), true);
    assert.equal(await store.get(ref, context), second);
  } catch (error) {
    if (![1312, 50, 1244].includes(error?.nativeCode)) throw error;
    unavailable = true;
    assert.equal(store.available(scope), false);
    t.diagnostic(`Windows Credential Manager unavailable in this host (${error.nativeCode}); adapter failed closed.`);
  } finally {
    if (created) assert.equal(await store.remove(ref, context), true);
    if (!unavailable) assert.equal(await store.get(ref, context), null);
  }
  if (unavailable) return;
  assert.equal(await store.remove(ref, context), false);
  t.diagnostic('Native roundtrip used only a new random Noya test record; the record was removed.');
});
