// Main-process-only storage for the Noya device session. The backend must be
// an OS secure store; this module never falls back to a file or process memory.
// The serialized record contains access/refresh tokens, so it must never cross
// the renderer boundary.
const fail = (code, message = code) => Object.assign(new Error(message), { code });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const token = (value, prefix) => typeof value === 'string' && value.startsWith(prefix)
  && value.length >= 16 && value.length <= 4096 && /^[A-Za-z0-9._~-]+$/.test(value);
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const appVersion = value => typeof value === 'string' && /^[0-9A-Za-z.+_-]{1,64}$/.test(value);
const platform = value => ['windows', 'macos', 'linux', 'ios', 'android'].includes(value);
const scopes = new Set(['customer.read', 'catalog.read', 'member.read', 'identity.read', 'tunnel.read', 'tunnel.heartbeat', 'device.revoke']);
const jwk = value => object(value) && value.kty === 'OKP' && value.crv === 'Ed25519'
  && typeof value.x === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value.x)
  && typeof value.d === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value.d)
  && Object.keys(value).every(key => ['kty', 'crv', 'x', 'd', 'alg', 'use', 'key_ops'].includes(key));

function validate(input) {
  if (!object(input) || Object.keys(input).some(key => !['version', 'device', 'session', 'privateKeyJwk', 'accessExpiresAt'].includes(key)) || input.version !== 1 || !object(input.device) || !object(input.session) || !jwk(input.privateKeyJwk)) throw fail('DEVICE_SESSION_INVALID');
  const deviceKeys = ['id', 'platform', 'appVersion', 'status', 'createdAt'];
  const sessionKeys = ['accessToken', 'expiresIn', 'refreshToken', 'refreshExpiresAt', 'scope'];
  if (Object.keys(input.device).some(key => !deviceKeys.includes(key)) || Object.keys(input.session).some(key => !sessionKeys.includes(key))) throw fail('DEVICE_SESSION_INVALID');
  const device = input.device, session = input.session;
  if (!uuid(device.id) || !platform(device.platform) || !appVersion(device.appVersion) || device.status !== 'active' || !iso(device.createdAt)) throw fail('DEVICE_SESSION_INVALID');
  if (!token(session.accessToken, 'nda_') || !token(session.refreshToken, 'ndr_') || !Number.isSafeInteger(session.expiresIn) || session.expiresIn < 1 || session.expiresIn > 900 || !iso(session.refreshExpiresAt)
    || !Array.isArray(session.scope) || session.scope.length === 0 || new Set(session.scope).size !== session.scope.length || session.scope.some(value => !scopes.has(value)) || !iso(input.accessExpiresAt)) throw fail('DEVICE_SESSION_INVALID');
  const out = { version: 1, device: { ...device, createdAt: new Date(device.createdAt).toISOString() }, session: { ...session, refreshExpiresAt: new Date(session.refreshExpiresAt).toISOString(), scope: [...session.scope] }, privateKeyJwk: { ...input.privateKeyJwk }, accessExpiresAt: new Date(input.accessExpiresAt).toISOString() };
  const encoded = JSON.stringify(out);
  if (Buffer.byteLength(encoded, 'utf8') > 2400) throw fail('DEVICE_SESSION_INVALID');
  return { out, encoded };
}

export function validateDeviceSessionRecord(value) {
  return structuredClone(validate(value).out);
}

/**
 * `backend` is deliberately injected so platform implementations can use
 * Windows Credential Manager, macOS Keychain, Linux Secret Service, or an
 * equivalent OS-backed store without exposing their protocol here. Its API is
 * get(): Promise<string|null>, set(serialized): Promise<boolean>,
 * remove(): Promise<boolean>, available(): boolean. The backend owns the
 * fixed Noya device-session key; callers cannot select a target.
 */
export function createDeviceSessionStore({ platform: hostPlatform, backend, key = 'Noya/DeviceSession/v1' } = {}) {
  if (!['win32', 'darwin', 'linux'].includes(hostPlatform)) return Object.freeze({ available: () => false, async load() { throw fail('SECURE_STORE_UNAVAILABLE'); }, async save() { throw fail('SECURE_STORE_UNAVAILABLE'); }, async clear() { throw fail('SECURE_STORE_UNAVAILABLE'); } });
  if (!backend) return Object.freeze({ available: () => false, async load() { throw fail('SECURE_STORE_UNAVAILABLE'); }, async save() { throw fail('SECURE_STORE_UNAVAILABLE'); }, async clear() { throw fail('SECURE_STORE_UNAVAILABLE'); } });
  if (!backend || typeof backend.available !== 'function' || typeof backend.get !== 'function' || typeof backend.set !== 'function' || typeof backend.remove !== 'function' || typeof key !== 'string' || !/^Noya\/[A-Za-z0-9._:-]{1,100}(?:\/[A-Za-z0-9._:-]{1,100})?$/.test(key)) throw fail('SECURE_STORE_CONFIGURATION_INVALID');
  const available = () => backend.available() === true;
  async function load() {
    if (!available()) throw fail('SECURE_STORE_UNAVAILABLE');
    let raw;
    try { raw = await backend.get(); } catch { throw fail('SECURE_STORE_OPERATION_FAILED'); }
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 2400) throw fail('DEVICE_SESSION_INVALID');
    let parsed; try { parsed = JSON.parse(raw); } catch { throw fail('DEVICE_SESSION_INVALID'); }
    try { return structuredClone(validate(parsed).out); } catch (error) { if (error?.code === 'DEVICE_SESSION_INVALID') throw error; throw fail('DEVICE_SESSION_INVALID'); }
  }
  async function save(value) {
    if (!available()) throw fail('SECURE_STORE_UNAVAILABLE');
    const { out, encoded } = validate(value);
    let result; try { result = await backend.set(encoded); } catch { throw fail('SECURE_STORE_OPERATION_FAILED'); }
    if (result !== true) throw fail('SECURE_STORE_OPERATION_FAILED');
    return true;
  }
  async function clear() {
    if (!available()) throw fail('SECURE_STORE_UNAVAILABLE');
    try { return (await backend.remove()) === true; } catch { throw fail('SECURE_STORE_OPERATION_FAILED'); }
  }
  return Object.freeze({ available, load, save, clear });
}
