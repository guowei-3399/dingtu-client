import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createLinuxSecretStore } from './platform-secret-store.mjs';

const scope = { customerId: 'customer-1', userId: 'user-1', customerType: 'enterprise', memberRole: 'owner' };
const context = { ...scope, provider: 'anthropic', slotId: 'slot-1' };

test('Linux Secret Service adapter sends secrets through stdin and scopes attributes', async () => {
  const { calls, spawn } = processResult();
  const store = createLinuxSecretStore({ scope, platform: 'linux', spawn });
  assert.equal(await store.set('credential', 'secret-value', context), true);
  assert.equal(calls[0].command, 'secret-tool');
  assert.equal(calls[0].args[0], 'store');
  assert.equal(calls[0].input, 'secret-value');
  const targetIndex = calls[0].args.indexOf('target');
  assert.equal(calls[0].args[targetIndex + 1], 'noya/customer-1/user-1/anthropic/slot-1/credential');
  assert.equal(calls[0].args.includes('secret-value'), false);
});

function processResult({ code = 0, output = '', stdinError = false, spawnError = false } = {}) {
  const calls = [];
  const spawn = (command, args, options) => {
    if (spawnError) throw new Error('private spawn reason');
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => { calls.push({ killed: true }); return true; };
    let input = '';
    child.stdin.on('data', chunk => { input += chunk.toString(); });
    child.stdin.on('finish', () => {
      calls.push({ command, args, options, input });
      if (stdinError) child.stdin.emit('error', new Error('private pipe reason'));
      else { child.stdout.end(output); child.emit('close', code); }
    });
    return child;
  };
  return { spawn, calls };
}

test('Linux secret input and output preserve exact content, including newlines, over a pipe', async () => {
  const secret = 'first\nsecond\r\n';
  const process = processResult({ output: secret });
  const store = createLinuxSecretStore({ scope, platform: 'linux', spawn: process.spawn });
  assert.equal(await store.set('credential', secret, context), true);
  assert.equal(process.calls[0].input, secret, 'stdin must not append data to the credential');
  assert.equal(await store.get('credential', context), secret, 'pipe output must not strip credential data');
});

test('Linux write and read failures reject with sanitized codes instead of reporting success or missing credentials', async () => {
  for (const operation of ['set', 'get', 'remove']) {
    const process = processResult({ code: 1, output: 'PRIVATE SECRET failure' });
    const store = createLinuxSecretStore({ scope, platform: 'linux', spawn: process.spawn });
    const pending = operation === 'set' ? store.set('credential', 'raw-value', context) : store[operation]('credential', context);
    await assert.rejects(pending, error => error.code === 'SECURE_STORE_OPERATION_FAILED' && !/PRIVATE|SECRET|raw-value/.test(error.message));
  }
});

test('Linux process and stdin errors fail closed without reflecting native error details', async () => {
  for (const options of [{ stdinError: true }, { spawnError: true }]) {
    const process = processResult(options);
    const store = createLinuxSecretStore({ scope, platform: 'linux', spawn: process.spawn });
    await assert.rejects(store.set('credential', 'raw-value', context), error => /^SECURE_STORE_(?:UNAVAILABLE|OPERATION_FAILED)$/.test(error.code) && !/private|raw-value/.test(error.message));
  }
});

test('Linux provider metadata supports operator-defined slugs and rejects target-path injection before spawning', async () => {
  const process = processResult();
  const store = createLinuxSecretStore({ scope, platform: 'linux', spawn: process.spawn });
  await store.set('credential', 'raw-value', { ...context, provider: 'new-vendor.agent_v2' });
  assert.equal(process.calls[0].args.at(-1), 'noya/customer-1/user-1/new-vendor.agent_v2/slot-1/credential');
  const before = process.calls.length;
  for (const provider of ['', '../anthropic', 'a/b', 'a\\b', 'a\n', 'a\0', 'A', 'a'.repeat(65), undefined, {}]) {
    await assert.rejects(store.get('credential', { ...context, provider }), { code: 'SECURE_STORE_CONTEXT_INVALID' });
  }
  assert.equal(process.calls.length, before);
});

test('Linux stores constructed with invalid bound scopes never become available through a valid-looking caller', async () => {
  for (const invalid of [{ ...scope, customerType: 'personal' }, { ...scope, memberRole: 'member' }, { ...scope, userId: '' }]) {
    const store = createLinuxSecretStore({ scope: invalid, platform: 'linux', spawn: () => { throw new Error('must not spawn'); } });
    assert.equal(store.available(context), false);
    await assert.rejects(store.get('credential', context), { code: 'SECURE_STORE_UNAVAILABLE' });
  }
});

test('unsupported platform and cross-scope access fail closed', async () => {
  const store = createLinuxSecretStore({ scope, platform: 'darwin', spawn: () => { throw new Error('must not spawn'); } });
  assert.equal(store.available(scope), false);
  await assert.rejects(store.get('credential', context), { code: 'SECURE_STORE_UNAVAILABLE' });
  const linux = createLinuxSecretStore({ scope, spawn: () => { throw new Error('must not spawn'); } });
  await assert.rejects(linux.get('credential', { ...context, userId: 'other' }), { code: 'SECURE_STORE_UNAVAILABLE' });
});

