import { spawn } from 'node:child_process';
import { createHash, createHmac, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Provider slugs come from the operator-managed catalog. Keep only a strict
// metadata grammar here; adding a provider must never require shipping a new
// client or accepting arbitrary path/control characters.
const provider = value => typeof value === 'string' && /^[a-z][a-z0-9._-]{0,63}$/.test(value);
const opaque = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(value);
const helper = fileURLToPath(new URL('./windows-credential-helper.ps1', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = code => Object.assign(new Error(code), { code });
const identity = scope => JSON.stringify([scope.customerId, scope.userId]);
const validScope = scope => scope && opaque(scope.customerId) && opaque(scope.userId)
  && scope.customerType === 'enterprise' && ['owner', 'admin'].includes(scope.memberRole);

/**
 * Native-process-only OS secret adapter. Construct from the authenticated user
 * scope in the trusted host; never expose this object or get() to a WebView.
 * Windows Credential Manager is the only implemented backend. Other platforms
 * return unavailable and never fall back to plaintext storage.
 */
export function createNativeSecretStore({ scope, timeoutMs = 15000, platform = process.platform } = {}) {
  const bound = validScope(scope) ? Object.freeze({ customerId: scope.customerId, userId: scope.userId,
    customerType: scope.customerType, memberRole: scope.memberRole }) : null;
  const executable = platform === 'win32' && process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : null;
  const supported = Boolean(executable && existsSync(executable) && existsSync(helper));
  let sessionUnavailable = false;
  const sameScope = candidate => validScope(candidate) && bound && identity(candidate) === identity(bound)
    && candidate.memberRole === bound.memberRole;
  const available = candidate => Boolean(supported && !sessionUnavailable && sameScope(candidate));

  function targetFor(ref, context) {
    if (!available(context)) throw fail('SECURE_STORE_UNAVAILABLE');
    if (!opaque(ref) || !opaque(context.slotId) || !provider(context.provider)) throw fail('SECURE_STORE_CONTEXT_INVALID');
    return `Noya/Assistant/v1/${hash(identity(bound))}/${context.provider}/${hash(JSON.stringify([context.slotId, ref]))}`;
  }

  async function invoke(operation, ref, context, secret) {
    const target = targetFor(ref, context);
    if (operation === 'set' && (typeof secret !== 'string' || !secret.length || Buffer.byteLength(secret, 'utf8') > 2560)) {
      throw fail('SECURE_CREDENTIAL_INVALID');
    }
    const encryptionKey = randomBytes(32);
    const authenticationKey = randomBytes(32);
    const nonce = randomBytes(16).toString('hex');
    const request = { version: 1, operation, target, nonce,
      encryptionKey: encryptionKey.toString('base64'), authenticationKey: authenticationKey.toString('base64') };
    let value;
    if (operation === 'set') { value = Buffer.from(secret, 'utf8'); request.value = value.toString('base64'); }
    let input = Buffer.from(JSON.stringify(request));
    request.value = null; secret = null;
    try {
      let response;
      try { response = await new Promise((resolve, reject) => {
        const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper],
          { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
        let output = ''; let settled = false;
        const timer = setTimeout(() => { child.kill(); finish(fail('SECURE_STORE_TIMEOUT')); }, Math.max(1000, Math.min(60000, timeoutMs)));
        function finish(error, result) {
          if (settled) return;
          settled = true; clearTimeout(timer); input.fill(0);
          if (error) reject(error); else resolve(result);
        }
        child.on('error', () => finish(fail('SECURE_STORE_UNAVAILABLE')));
        child.stdin.on('error', () => finish(fail('SECURE_STORE_OPERATION_FAILED')));
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', chunk => {
          output += chunk;
          if (output.length > 16384) { child.kill(); finish(fail('SECURE_STORE_PROTOCOL_INVALID')); }
        });
        // Drain, discard, and never forward native stderr or command details.
        child.stderr.resume();
        child.on('close', code => {
          if (settled) return;
          let result;
          try { result = JSON.parse(output); } catch { finish(fail('SECURE_STORE_PROTOCOL_INVALID')); return; }
          if (code !== 0 || result.version !== 1 || result.ok !== true || result.nonce !== nonce) {
            const error = fail('SECURE_STORE_OPERATION_FAILED');
            if (['request', 'compile', 'write', 'read', 'delete'].includes(result.stage)) error.stage = result.stage;
            if (Number.isSafeInteger(result.nativeCode)) error.nativeCode = result.nativeCode;
            finish(error); return;
          }
          finish(null, result);
        });
        child.stdin.end(input);
        });
      } catch (error) {
        // Windows returns ERROR_NO_SUCH_LOGON_SESSION/ERROR_NOT_SUPPORTED in
        // services, CI sandboxes, and non-interactive hosts. Disable this
        // adapter for the process instead of falling back to disk or memory.
        if ([1312, 50, 1244].includes(error?.nativeCode)) sessionUnavailable = true;
        throw error;
      }
      if (operation === 'remove') return response.removed === true;
      if (operation === 'set') return true;
      if (response.found === false) return null;
      if (response.found !== true || typeof response.iv !== 'string' || typeof response.ciphertext !== 'string' || typeof response.tag !== 'string') {
        throw fail('SECURE_STORE_PROTOCOL_INVALID');
      }
      const iv = Buffer.from(response.iv, 'base64');
      const ciphertext = Buffer.from(response.ciphertext, 'base64');
      const tag = Buffer.from(response.tag, 'base64');
      const expected = createHmac('sha256', authenticationKey).update(Buffer.from(`Noya.SecretStore/v1\0${nonce}\0`)).update(iv).update(ciphertext).digest();
      if (iv.length !== 16 || !ciphertext.length || ciphertext.length > 2576 || tag.length !== expected.length || !timingSafeEqual(tag, expected)) {
        throw fail('SECURE_STORE_PROTOCOL_INVALID');
      }
      let plaintext;
      try {
        const decipher = createDecipheriv('aes-256-cbc', encryptionKey, iv);
        plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return plaintext.toString('utf8');
      } catch { throw fail('SECURE_STORE_PROTOCOL_INVALID'); }
      finally { plaintext?.fill(0); }
    } finally { value?.fill(0); input.fill(0); encryptionKey.fill(0); authenticationKey.fill(0); }
  }

  return Object.freeze({ available, get: (ref, context) => invoke('get', ref, context),
    set: (ref, secret, context) => invoke('set', ref, context, secret), remove: (ref, context) => invoke('remove', ref, context) });
}
