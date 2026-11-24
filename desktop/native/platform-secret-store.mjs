import { spawn as defaultSpawn } from 'node:child_process';

// Provider slugs are operator-managed metadata, never a client-side vendor
// allowlist. The grammar keeps the secret-store target path bounded.
const provider = value => typeof value === 'string' && /^[a-z][a-z0-9._-]{0,63}$/.test(value);
const opaque = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
const fail = code => Object.assign(new Error(code), { code });

function scopeKey(scope) {
  if (!scope || scope.customerType !== 'enterprise' || !['owner', 'admin'].includes(scope.memberRole) || !opaque(scope.customerId) || !opaque(scope.userId)) throw fail('SECURE_STORE_UNAVAILABLE');
  return `${scope.customerId}/${scope.userId}`;
}

function targetFor(scope, context, ref) {
  if (!opaque(ref) || !opaque(context?.slotId) || !provider(context?.provider)) throw fail('SECURE_STORE_CONTEXT_INVALID');
  return `noya/${scopeKey(scope)}/${context.provider}/${context.slotId}/${ref}`;
}

function command(spawn, args, input, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    let output = '', settled = false, timer, child;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(value); };
    const stop = error => { try { child?.kill(); } catch {} finish(error); };
    try {
      child = spawn('secret-tool', args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      timer = setTimeout(() => stop(fail('SECURE_STORE_TIMEOUT')), Math.max(500, Math.min(30000, timeoutMs)));
      child.on('error', () => stop(fail('SECURE_STORE_UNAVAILABLE')));
      child.stdin.on('error', () => stop(fail('SECURE_STORE_OPERATION_FAILED')));
      child.stdout.on('error', () => stop(fail('SECURE_STORE_OPERATION_FAILED')));
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => { output += chunk; if (output.length > 8192) stop(fail('SECURE_STORE_PROTOCOL_INVALID')); });
      // Nonzero can mean an unavailable/locked service as well as no match.
      // Never claim a successful write or turn an infrastructure error into a
      // missing credential. Keep native output out of every error.
      child.on('close', code => { if (code === 0) finish(null, output); else finish(fail('SECURE_STORE_OPERATION_FAILED')); });
      // secret-tool stores stdin through EOF verbatim and only appends a
      // display newline when stdout is a TTY. Both streams here are pipes.
      child.stdin.end(input == null ? undefined : input);
    } catch { stop(fail('SECURE_STORE_UNAVAILABLE')); }
  });
}

export function createLinuxSecretStore({ scope, spawn = defaultSpawn, platform = process.platform } = {}) {
  let bound = null;
  try { scopeKey(scope); bound = Object.freeze({ customerId: scope.customerId, userId: scope.userId, customerType: scope.customerType, memberRole: scope.memberRole }); } catch { /* invalid scopes never acquire a store namespace */ }
  const supported = platform === 'linux';
  const available = context => supported && Boolean(bound) && (() => { try { scopeKey(context); return context.customerId === bound.customerId && context.userId === bound.userId && context.memberRole === bound.memberRole; } catch { return false; } })();
  const args = (operation, target) => operation === 'get' ? ['lookup', 'application', 'noya', 'target', target] : operation === 'remove' ? ['clear', 'application', 'noya', 'target', target] : ['store', '--label=Noya desktop credential', 'application', 'noya', 'target', target];
  async function run(operation, ref, context, secret) {
    if (!available(context)) throw fail('SECURE_STORE_UNAVAILABLE');
    const target = targetFor(bound, context, ref);
    if (operation === 'set' && (typeof secret !== 'string' || !secret.length || Buffer.byteLength(secret, 'utf8') > 4096)) throw fail('SECURE_CREDENTIAL_INVALID');
    const result = await command(spawn, args(operation, target), operation === 'set' ? secret : undefined);
    if (operation === 'set') return true;
    if (operation === 'remove') return result !== null;
    return result;
  }
  return Object.freeze({ available, get: (ref, context) => run('get', ref, context), set: (ref, secret, context) => run('set', ref, context, secret), remove: (ref, context) => run('remove', ref, context) });
}

