import * as defaultFs from 'node:fs/promises';

const fail = (code, message = code) => Object.assign(new Error(message), { code });
const SUPPORTED = new Set(['win32', 'darwin', 'linux']);
const MAX_ENCRYPTED_BYTES = 16384;

function unavailable() {
  return Object.freeze({
    available: () => false,
    async get() { throw fail('SECURE_STORE_UNAVAILABLE'); },
    async set() { throw fail('SECURE_STORE_UNAVAILABLE'); },
    async remove() { throw fail('SECURE_STORE_UNAVAILABLE'); },
  });
}

/**
 * Electron main-process adapter for the device-session record. Electron's
 * safeStorage delegates to DPAPI, Keychain, or Secret Service. The file only
 * contains safeStorage ciphertext; this adapter never writes a raw token.
 */
export function createElectronDeviceSessionBackend({ platform, safeStorage, fs = defaultFs, filePath } = {}) {
  if (!SUPPORTED.has(platform) || !safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function'
    || typeof safeStorage.encryptString !== 'function' || typeof safeStorage.decryptString !== 'function'
    || typeof filePath !== 'string' || !filePath || typeof fs.readFile !== 'function' || typeof fs.writeFile !== 'function'
    || typeof fs.rename !== 'function' || typeof fs.unlink !== 'function') return unavailable();
  let available = false;
  try {
    available = safeStorage.isEncryptionAvailable() === true
      && !(platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function' && safeStorage.getSelectedStorageBackend() === 'basic_text');
  } catch { available = false; }
  if (!available) return unavailable();
  const tmpPath = `${filePath}.tmp`;
  const isAvailable = () => available;
  async function get() {
    if (!isAvailable()) throw fail('SECURE_STORE_UNAVAILABLE');
    let encrypted;
    try { encrypted = await fs.readFile(filePath); }
    catch (error) { if (error?.code === 'ENOENT') return null; throw fail('SECURE_STORE_OPERATION_FAILED'); }
    if (!Buffer.isBuffer(encrypted) || encrypted.length < 1 || encrypted.length > MAX_ENCRYPTED_BYTES) throw fail('SECURE_STORE_OPERATION_FAILED');
    try {
      const result = safeStorage.decryptString(encrypted);
      if (typeof result !== 'string' || !result.length || Buffer.byteLength(result, 'utf8') > 2400) throw new Error('invalid');
      return result;
    } catch { throw fail('SECURE_STORE_OPERATION_FAILED'); }
  }
  async function set(value) {
    if (!isAvailable()) throw fail('SECURE_STORE_UNAVAILABLE');
    if (typeof value !== 'string' || !value.length || Buffer.byteLength(value, 'utf8') > 2400) throw fail('SECURE_CREDENTIAL_INVALID');
    let encrypted;
    try { encrypted = safeStorage.encryptString(value); }
    catch { throw fail('SECURE_STORE_OPERATION_FAILED'); }
    if (!Buffer.isBuffer(encrypted) || encrypted.length < 1 || encrypted.length > MAX_ENCRYPTED_BYTES) throw fail('SECURE_STORE_OPERATION_FAILED');
    try {
      await fs.writeFile(tmpPath, encrypted, { mode: 0o600 });
      await fs.rename(tmpPath, filePath);
      return true;
    } catch { try { await fs.unlink(tmpPath); } catch {} throw fail('SECURE_STORE_OPERATION_FAILED'); }
  }
  async function remove() {
    if (!isAvailable()) throw fail('SECURE_STORE_UNAVAILABLE');
    try { await fs.unlink(filePath); return true; }
    catch (error) { if (error?.code === 'ENOENT') return false; throw fail('SECURE_STORE_OPERATION_FAILED'); }
  }
  return Object.freeze({ available: isAvailable, get, set, remove });
}
