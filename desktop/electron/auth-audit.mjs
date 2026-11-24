import fs from 'node:fs/promises';
import path from 'node:path';

export const AUTH_AUDIT_EVENTS = Object.freeze([
  'session_restored', 'session_restore_failed', 'secure_store_unavailable',
  'session_invalidated', 'refresh_started', 'refresh_failed', 'refresh_succeeded',
  'login_started', 'callback_received', 'session_exchange_succeeded', 'session_persisted',
  'login_failed', 'logout_started', 'logout_completed', 'account_read_started',
  'account_read_succeeded', 'account_read_failed',
  'tunnel_authorization_received', 'proxy_start_requested', 'production_config_verified', 'proxy_start_failed',
  'proxy_renewal_started', 'proxy_renewal_succeeded', 'proxy_renewal_retry_scheduled', 'proxy_renewal_failed',
  'proxy_process_exited', 'proxy_resume_renewal', 'proxy_lease_expired',
  'environment_mode_changed', 'ipc_operation_failed',
  'device_session_response', 'account_response',
]);
const events = new Set(AUTH_AUDIT_EVENTS);
const codes = new Set([
  'AUTH_REQUIRED', 'SESSION_INVALID', 'REFRESH_REPLAY', 'AUTH_IN_PROGRESS',
  'ACCOUNT_DISABLED', 'AUTHORIZATION_CODE_INVALID', 'DEVICE_LIMIT_NOT_CONFIGURED', 'REFRESH_INVALID',
  'AUTH_BROWSER_OPEN_FAILED', 'AUTHORIZATION_CANCELLED', 'AUTH_FAILED',
  'AUTHORIZATION_TIMEOUT', 'AUTHORIZATION_DENIED', 'CALLBACK_INVALID',
  'SECURE_STORE_UNAVAILABLE', 'SECURE_STORE_OPERATION_FAILED', 'DEVICE_SESSION_INVALID',
  'INVALID_RESPONSE', 'REQUEST_TIMEOUT', 'NETWORK_ERROR', 'REQUEST_FAILED',
  'DEVICE_LIMIT_REACHED', 'IDENTITY_UNAVAILABLE', 'INSUFFICIENT_SCOPE',
  'VALIDATION_ERROR', 'RATE_LIMITED', 'INTERNAL_ERROR', 'AUTH_UNAVAILABLE',
  'CONFIG_AUTHORIZATION_INVALID', 'SUBSCRIPTION_DISABLED', 'PRODUCTION_MAPPING_NOT_READY',
  'BRIDGE_UNAVAILABLE', 'PRODUCTION_LEASE_UNAVAILABLE', 'PROXY_CONFIG_INVALID',
  'PROXY_CONFIG_UNAVAILABLE', 'PROXY_CONFIG_WRITE_FAILED', 'PROXY_START_CANCELLED',
  'PROXY_PORT_IN_USE', 'PROXY_BINARY_UNAVAILABLE', 'PROXY_START_FAILED', 'PROXY_CONTROL_FAILED',
  'PROXY_START_PENDING', 'PROXY_LEASE_EXPIRED', 'PROXY_FRONTEND_EXITED', 'PROXY_BACKEND_EXITED',
  'PROXY_WINTUN_ERROR', 'PROXY_ACCESS_DENIED', 'PROXY_DNS_ERROR', 'PROXY_ROUTE_ERROR',
  'PROXY_SPAWN_ERROR', 'PROXY_LISTEN_TIMEOUT',
  'TUN_ELEVATION_REQUIRED', 'TUN_RELAUNCH_FAILED',
  'DESKTOP_OPERATION_FAILED', 'AGENT_STOP_FAILED', 'AGENT_STOP_UNAVAILABLE',
  'JS_TYPE_ERROR', 'JS_RANGE_ERROR', 'JS_REFERENCE_ERROR', 'JS_SYNTAX_ERROR',
  'IPC_UNCAUGHT', 'IPC_MESSAGE_INVALID', 'AGENT_ADAPTER_UNKNOWN',
  'PROFILE_INVALID', 'PROFILE_TEMPLATE_INVALID', 'SAFE_ENV_INVALID',
]);

export function sanitizeAuthAudit(event, details = {}) {
  if (!events.has(event)) return null;
  const record = { event };
  if (Number.isSafeInteger(details.status) && details.status >= 100 && details.status <= 599) record.status = details.status;
  if (codes.has(details.code)) record.code = details.code;
  const requestId = details.request_id ?? details.requestId;
  if (typeof requestId === 'string' && /^req_[A-Za-z0-9._:-]{1,120}$/.test(requestId)) record.request_id = requestId;
  if (event === 'production_config_verified' || event === 'proxy_renewal_succeeded') {
    if (typeof details.configRevision === 'string' && /^cfg-[0-9a-f]{64}$/.test(details.configRevision)) record.config_revision = details.configRevision;
    if (typeof details.bindingRevision === 'string' && /^binding-[1-9][0-9]{0,15}$/.test(details.bindingRevision)) record.binding_revision = details.bindingRevision;
  }
  return record;
}

/** Bounded main-process diagnostics. No URL, message, account id or secret is accepted. */
export function createAuthAuditLogger({ directory, maxBytes = 128 * 1024, now = Date.now } = {}) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || !Number.isSafeInteger(maxBytes) || maxBytes < 512 || maxBytes > 1024 * 1024) throw new Error('AUTH_AUDIT_CONFIGURATION_INVALID');
  const filename = path.join(directory, 'noya-auth.log');
  let pending = Promise.resolve();
  function write(event, details = {}) {
    const record = sanitizeAuthAudit(event, details);
    if (!record) return;
    const line = JSON.stringify({ at: new Date(now()).toISOString(), ...record }) + '\n';
    pending = pending.then(async () => {
      await fs.mkdir(directory, { recursive: true });
      const size = await fs.stat(filename).then(value => value.size, error => { if (error.code === 'ENOENT') return 0; throw error; });
      if (size + Buffer.byteLength(line) > maxBytes) {
        await fs.rm(filename + '.1', { force: true });
        await fs.rename(filename, filename + '.1');
      }
      await fs.appendFile(filename, line, { encoding: 'utf8', mode: 0o600 });
    }).catch(() => {});
  }
  return Object.freeze({ write, flush: () => pending });
}
