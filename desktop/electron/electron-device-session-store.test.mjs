import test from 'node:test';
import assert from 'node:assert/strict';
import { createElectronDeviceSessionBackend } from './electron-device-session-store.mjs';

function fakeFs() {
  const files = new Map();
  const calls = [];
  return {
    calls,
    files,
    async readFile(path) { calls.push(['read', path]); if (!files.has(path)) { const e = new Error('missing'); e.code = 'ENOENT'; throw e; } return files.get(path); },
    async writeFile(path, value, options) { calls.push(['write', path, options]); files.set(path, Buffer.from(value)); },
    async rename(from, to) { calls.push(['rename', from, to]); files.set(to, files.get(from)); files.delete(from); },
    async unlink(path) { calls.push(['unlink', path]); if (!files.delete(path)) { const e = new Error('missing'); e.code = 'ENOENT'; throw e; } },
  };
}

function fakeSafeStorage({ backend = 'gnome_libsecret' } = {}) {
  return {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => backend,
    encryptString: value => Buffer.from(`enc:${Buffer.from(value, 'utf8').toString('base64')}`, 'utf8'),
    decryptString: value => {
      const decoded = Buffer.from(value).toString('utf8');
      if (!decoded.startsWith('enc:')) throw new Error('bad encrypted value');
      return Buffer.from(decoded.slice(4), 'base64').toString('utf8');
    },
  };
}

test('Electron device backend encrypts before atomic write and decrypts only its fixed file', async () => {
  const fs = fakeFs();
  const backend = createElectronDeviceSessionBackend({ platform: 'linux', safeStorage: fakeSafeStorage(), fs, filePath: 'user-data/device-session.bin' });
  assert.equal(backend.available(), true);
  assert.equal(await backend.get(), null);
  assert.equal(await backend.set('{"accessToken":"secret"}'), true);
  assert.equal(fs.calls.some(call => call[0] === 'write' && call[1].endsWith('.tmp')), true);
  const stored = fs.files.get('user-data/device-session.bin').toString('utf8');
  assert.match(stored, /^enc:/);
  assert.doesNotMatch(stored, /secret/);
  assert.equal(await backend.get(), '{"accessToken":"secret"}');
  assert.equal(await backend.remove(), true);
  assert.equal(await backend.get(), null);
  assert.equal(await backend.remove(), false);
});

test('Electron device backend refuses Linux basic_text and unavailable encryption', async () => {
  const fs = fakeFs();
  const weak = createElectronDeviceSessionBackend({ platform: 'linux', safeStorage: fakeSafeStorage({ backend: 'basic_text' }), fs, filePath: 'x' });
  assert.equal(weak.available(), false);
  await assert.rejects(weak.get(), { code: 'SECURE_STORE_UNAVAILABLE' });
  const unavailable = createElectronDeviceSessionBackend({ platform: 'win32', safeStorage: { isEncryptionAvailable: () => false }, fs, filePath: 'x' });
  assert.equal(unavailable.available(), false);
  await assert.rejects(unavailable.set('secret'), { code: 'SECURE_STORE_UNAVAILABLE' });
});

test('Electron device backend sanitizes decrypt and filesystem failures', async () => {
  const fs = fakeFs();
  const backend = createElectronDeviceSessionBackend({ platform: 'darwin', safeStorage: fakeSafeStorage(), fs, filePath: 'x' });
  fs.files.set('x', Buffer.from('plaintext-secret'));
  await assert.rejects(backend.get(), error => error.code === 'SECURE_STORE_OPERATION_FAILED' && !/plaintext-secret/.test(error.message));
  fs.readFile = async () => { throw new Error('private path and secret'); };
  await assert.rejects(backend.get(), error => error.code === 'SECURE_STORE_OPERATION_FAILED' && !/private|secret/i.test(error.message));
});
