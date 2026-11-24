import { generateKeyPairSync } from 'node:crypto';
import { startPkceLoopback } from './pkce-loopback.mjs';
import { validateDeviceSessionRecord } from './device-session-store.mjs';
import { sanitizeAuthAudit } from './auth-audit.mjs';

const fail = (code, message = code) => Object.assign(new Error(message), { code });
const platforms = new Set(['windows', 'macos', 'linux', 'ios', 'android']);
const clone = value => value == null ? value : structuredClone(value);
const clock = now => { const value = typeof now === 'function' ? now() : Date.now(); return value instanceof Date ? value.getTime() : Number(value); };
const readArgs = (kind, args) => {
  if (args === undefined) return {};
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw fail('READ_NOT_ALLOWED', '读取参数无效。');
  const keys = Object.keys(args);
  if (kind === 'identities' && keys.every(key => ['limit', 'cursor'].includes(key))) {
    if (args.limit !== undefined && (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 200)) throw fail('READ_NOT_ALLOWED', '身份目录参数无效。');
    if (args.cursor !== undefined && (typeof args.cursor !== 'string' || !args.cursor || args.cursor.length > 2048)) throw fail('READ_NOT_ALLOWED', '身份目录游标无效。');
    return { ...(args.limit === undefined ? {} : { limit: args.limit }), ...(args.cursor === undefined ? {} : { cursor: args.cursor }) };
  }
  if (kind === 'catalog' && keys.length === 1 && keys[0] === 'platform' && platforms.has(args.platform)) return { platform: args.platform };
  if (kind === 'tunnelConfig' && keys.length === 0) return {};
  if (keys.length === 0) return {};
  throw fail('READ_NOT_ALLOWED', '读取参数不在允许范围内。');
};

/**
 * Main-process owner of the browser PKCE/device session. The supplied client
 * factory must be the fixed-path control client; no renderer object is passed
 * into this module. The store is an OS-backed device-session store.
 */
export function createDeviceAuthHost({ platform, appVersion = '0.2.0', deviceName = '定途桌面端', store, createClient, openExternal, onSessionInvalid, onSessionRefreshed, onAudit, onTelemetryEvent = null, onLatencySample = null, startLoopback = startPkceLoopback, now = Date.now, keyPair, callbackTimeoutMs, tunnelMinAccessTtlMs = 180_000 } = {}) {
  if (!platforms.has(platform) || typeof appVersion !== 'string' || !appVersion || typeof deviceName !== 'string' || !deviceName.trim() || !store || typeof store.load !== 'function' || typeof store.save !== 'function' || typeof store.clear !== 'function' || typeof store.available !== 'function' || typeof createClient !== 'function' || typeof openExternal !== 'function') throw fail('DEVICE_AUTH_CONFIGURATION_INVALID');
  if ((onSessionInvalid !== undefined && typeof onSessionInvalid !== 'function')
      || (onSessionRefreshed !== undefined && typeof onSessionRefreshed !== 'function')
      || (onAudit !== undefined && typeof onAudit !== 'function')) throw fail('DEVICE_AUTH_CONFIGURATION_INVALID');
  const audit = (event, details = {}) => {
    const safe = sanitizeAuthAudit(event, details);
    if (safe) { try { onAudit?.(event, safe); } catch {} }
  };
  const emitTelemetry = payload => { try { onTelemetryEvent?.(payload); } catch {} };
  const emitLatency = sample => { try { onLatencySample?.(sample); } catch {} };
  const diagEntries = [];
  const pushDiag = ({ code = null, requestId = null } = {}) => {
    const cleanCode = typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code) ? code : null;
    const cleanReq = typeof requestId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId) ? requestId : null;
    if (!cleanCode && !cleanReq) return;
    diagEntries.unshift({ code: cleanCode, requestId: cleanReq });
    if (diagEntries.length > 20) diagEntries.length = 20;
  };
  const observeResponse = result => {
    pushDiag({ requestId: result?.requestId || null });
    const events = {
      '/api/v1/client/device/sessions': 'device_session_response',
      '/api/v1/me': 'account_response',
      '/api/v1/client/tunnel/authorizations': 'tunnel_authorization_received',
    };
    if (events[result.path]) audit(events[result.path], result);
  };
  const recentDiagnostics = () => {
    const codes = [];
    const reqIds = [];
    for (const item of diagEntries) {
      if (item.code && !codes.includes(item.code) && codes.length < 10) codes.push(item.code);
      if (item.requestId && !reqIds.includes(item.requestId) && reqIds.length < 10) reqIds.push(item.requestId);
    }
    return { recentErrorCodes: codes, recentRequestIds: reqIds };
  };
  const pair = keyPair || (() => { const generated = generateKeyPairSync('ed25519'); return { privateKeyJwk: generated.privateKey.export({ format: 'jwk' }), publicKeyJwk: generated.publicKey.export({ format: 'jwk' }) }; })();
  let record = null, loginPromise = null, refreshPromise = null, refreshShouldNotifyTunnel = false, closed = false, epoch = 0;
  let storeChain = Promise.resolve(), storePending = 0, pendingLogoutClear = false;
  const storeOp = task => {
    storePending += 1;
    const run = storeChain.then(task, task);
    const settled = run.finally(() => { storePending -= 1; });
    storeChain = settled.catch(() => {});
    return settled;
  };
  const receiverRef = { value: null };
  let committingLogin = false;
  const ready = (async () => {
    if (!store.available()) { audit('secure_store_unavailable'); return; }
    try { const loaded = await storeOp(() => store.load()); record = loaded ? validateDeviceSessionRecord(loaded) : null; if (record) audit('session_restored'); }
    catch (error) { record = null; audit('session_restore_failed', { code: error?.code }); }
  })();
  const status = () => record ? { status: 'authenticated', device: clone(record.device), accessExpiresAt: record.accessExpiresAt, platform } : { status: 'signed_out', device: null, platform };
  const client = (pinnedAccessToken = undefined) => createClient({
    tokenProvider: async () => {
      const tok = pinnedAccessToken !== undefined ? pinnedAccessToken : record?.session?.accessToken;
      if (!tok) throw fail('AUTH_REQUIRED', '设备会话尚未就绪。');
      return tok;
    },
    refreshTokenProvider: async () => { if (!record?.session?.refreshToken) throw fail('AUTH_REQUIRED', '设备刷新凭据尚未就绪。'); return record.session.refreshToken; },
    onResponse: observeResponse,
  });
  async function invalidateSession(error, expectedEpoch = epoch, expectedDeviceId = record?.device?.id, expectedAccessToken = undefined) {
    if (!record || expectedEpoch !== epoch || record.device.id !== expectedDeviceId) return;
    if (expectedAccessToken !== undefined && record.session?.accessToken !== expectedAccessToken) return;
    audit('session_invalidated', { status: error?.status, code: error?.code, requestId: error?.requestId });
    const failedEpoch = ++epoch;
    record = null;
    try { await onSessionInvalid?.({ status: error?.status ?? 401, code: error?.code ?? 'AUTH_REQUIRED' }); } catch {}
    try { await storeOp(async () => { if (failedEpoch !== epoch || record) return; await store.clear(); }); } catch {}
  }
  async function persist(next, expectedEpoch = epoch) {
    const validated = validateDeviceSessionRecord(next);
    if (closed || expectedEpoch !== epoch) throw fail('AUTHORIZATION_CANCELLED');
    await storeOp(async () => {
      if (closed || expectedEpoch !== epoch) throw fail('AUTHORIZATION_CANCELLED');
      await store.save(validated);
      // A later login/logout owns the next queued store operation. Do not
      // clear here: doing so could erase that newer session after this write.
      if (closed || expectedEpoch !== epoch) {
        if (pendingLogoutClear) { try { await store.clear(); } catch {} }
        throw fail('AUTHORIZATION_CANCELLED');
      }
      record = clone(validated);
    });
  }
  async function refreshSession({ notifyTunnel = true } = {}) {
    await ready;
    if (closed) throw fail('AUTH_REQUIRED', '设备会话已结束。');
    if (!record) throw fail('AUTH_REQUIRED', '设备会话尚未就绪。');
    if (refreshPromise) {
      if (!notifyTunnel) refreshShouldNotifyTunnel = false;
      return refreshPromise;
    }
    refreshShouldNotifyTunnel = notifyTunnel !== false;
    const startedEpoch = epoch, current = clone(record);
    const refreshT0 = clock(now);
    audit('refresh_started');
    refreshPromise = (async () => {
      let result;
      try { result = await client().refreshDeviceSession(current.device.id, current.session.refreshToken); }
      catch (error) {
        audit('refresh_failed', { status: error?.status, code: error?.code, requestId: error?.requestId });
        emitTelemetry({
          category: 'auth',
          action: 'session_refresh_failed',
          stage: 'session_refresh',
          status: 'error',
          errorCode: error?.code || 'AUTH_REQUIRED',
          httpStatus: error?.status ?? null,
          durationMs: Math.max(0, clock(now) - refreshT0),
          requestId: error?.requestId || null,
          retryable: error?.status !== 401,
        });
        if (error && typeof error === 'object') error._telemetryRecorded = true;
        if (error?.status === 401) await invalidateSession(error, startedEpoch, current.device.id);
        throw error;
      }
      if (closed || startedEpoch !== epoch || !record || record.device.id !== current.device.id || result?.device?.id !== current.device.id || result?.device?.platform !== current.device.platform) throw fail('AUTH_REQUIRED', '设备会话已结束。');
      const next = { version: 1, device: result.device, session: result.session, privateKeyJwk: current.privateKeyJwk, accessExpiresAt: new Date(clock(now) + result.session.expiresIn * 1000).toISOString() };
      await persist(next, startedEpoch);
      audit('refresh_succeeded');
      if (refreshShouldNotifyTunnel) {
        try { onSessionRefreshed?.({ deviceId: next.device.id, accessExpiresAt: next.accessExpiresAt }); } catch {}
      }
      return status();
    })();
    try { return await refreshPromise; } finally { refreshPromise = null; refreshShouldNotifyTunnel = false; }
  }
  async function ensureSession() {
    await ready;
    if (closed || !record) throw fail('AUTH_REQUIRED', '请先在浏览器完成登录。');
    if (refreshPromise) {
      try { await refreshPromise; } catch (error) {
        throw error?.code ? error : fail('AUTH_REQUIRED', '设备会话已失效，请重新登录。');
      }
      if (closed || !record) throw fail('AUTH_REQUIRED', '请先在浏览器完成登录。');
    }
    const expires = Date.parse(record.accessExpiresAt);
    if (!Number.isFinite(expires) || expires <= clock(now) + 30_000) {
      try { await refreshSession({ notifyTunnel: true }); } catch (error) {
        // A timeout or service outage is not revocation. Preserve the secure
        // refresh credential for a later retry, while refusing this read.
        throw error?.code ? error : fail('AUTH_REQUIRED', '设备会话已失效，请重新登录。');
      }
    }
    return record;
  }
  async function refreshIfExpiringWithin(windowMs = tunnelMinAccessTtlMs) {
    await ready;
    if (closed || !record) throw fail('AUTH_REQUIRED', '请先在浏览器完成登录。');
    const threshold = Number.isFinite(windowMs) && windowMs >= 0 ? windowMs : tunnelMinAccessTtlMs;
    const expires = Date.parse(record.accessExpiresAt);
    if (!Number.isFinite(expires) || expires <= clock(now) + threshold) {
      try { await refreshSession({ notifyTunnel: false }); } catch (error) {
        throw error?.code ? error : fail('AUTH_REQUIRED', '设备会话已失效，请重新登录。');
      }
    }
    return status();
  }
  async function login() {
    const startedEpoch = epoch;
    await ready;
    if (startedEpoch !== epoch) throw fail('AUTHORIZATION_CANCELLED', '已取消登录。');
    if (closed) throw fail('AUTH_REQUIRED', '桌面客户端已关闭。');
    if (loginPromise) throw fail('AUTH_IN_PROGRESS', '登录已经在进行中。');
    audit('login_started');
    const loginT0 = clock(now);
    loginPromise = (async () => {
      let receiver;
      let closeAuthWindow = null;
      try {
        if (store.available() !== true) throw fail('SECURE_STORE_UNAVAILABLE', '本机安全存储不可用。');
        const bootstrap = createClient({ onResponse: observeResponse });
        receiver = await startLoopback({ timeoutMs: callbackTimeoutMs });
        if (closed || startedEpoch !== epoch) throw fail('AUTHORIZATION_CANCELLED', '已取消登录。');
        receiverRef.value = receiver;
        const request = receiver.request;
        const url = bootstrap.authorizationUrl({ redirectUri: request.redirectUri, codeChallenge: request.codeChallenge, state: request.state, platform });
        const opened = await openExternal(url);
        closeAuthWindow = typeof opened?.close === 'function' ? opened.close : null;
        if (opened !== true && opened?.ok !== true) throw fail('AUTH_BROWSER_OPEN_FAILED', '无法打开内置授权浏览器。');
        const callback = await receiver.waitForCode(); audit('callback_received');
        if (closed || startedEpoch !== epoch) throw fail('AUTHORIZATION_CANCELLED', '已取消登录。');
        committingLogin = true;
        const result = await bootstrap.createDeviceSession({ authorizationCode: callback.code, codeVerifier: request.codeVerifier, redirectUri: request.redirectUri, deviceName: deviceName.trim(), platform, appVersion: appVersion.trim(), devicePublicKey: pair.publicKeyJwk }); audit('session_exchange_succeeded');
        const next = { version: 1, device: result.device, session: result.session, privateKeyJwk: pair.privateKeyJwk, accessExpiresAt: new Date(clock(now) + result.session.expiresIn * 1000).toISOString() };
        if (closed || startedEpoch !== epoch) throw fail('AUTHORIZATION_CANCELLED', '已取消登录。');
        await persist(next, startedEpoch); audit('session_persisted'); return status();
      } catch (error) {
        try { receiver?.cancel?.(); } catch {}
        audit('login_failed', { status: error?.status, code: error?.code, requestId: error?.requestId });
        const wrapped = error?.code ? error : fail('AUTH_FAILED', '桌面登录未完成。');
        emitTelemetry({
          category: 'auth',
          action: wrapped.code === 'AUTHORIZATION_CANCELLED' ? 'pkce_login_cancelled' : 'pkce_login_failed',
          stage: 'pkce_login',
          status: wrapped.code === 'AUTHORIZATION_CANCELLED' ? 'warn' : 'error',
          errorCode: wrapped.code,
          httpStatus: wrapped.status ?? null,
          durationMs: Math.max(0, clock(now) - loginT0),
          requestId: wrapped.requestId || null,
        });
        if (wrapped && typeof wrapped === 'object') wrapped._telemetryRecorded = true;
        throw wrapped;
      } finally { try { closeAuthWindow?.(); } catch {} receiverRef.value = null; committingLogin = false; }
    })();
    try { return await loginPromise; } finally { loginPromise = null; }
  }
  async function logout() {
    await ready;
    interruptLogin(); audit('logout_started');
    const current = record;
    record = null;
    let stopped;
    try { stopped = Promise.resolve(onSessionInvalid?.({ status: 401, code: 'AUTH_REQUIRED' })).catch(() => {}); } catch {}
    const hadPendingStoreWork = storePending > 0;
    pendingLogoutClear = hadPendingStoreWork;
    const clear = storeOp(async () => { pendingLogoutClear = false; return store.clear(); });
    await stopped;
    if (hadPendingStoreWork) void clear.catch(() => {});
    else { try { await clear; } catch {} }
    if (current) {
      const revokeT0 = clock(now);
      try {
        const previousClient = createClient({ tokenProvider: async () => current.session.accessToken });
        await previousClient.revokeDeviceSession(current.device.id);
      } catch (err) {
        emitTelemetry({
          category: 'auth',
          action: 'logout_revoke_failed',
          stage: 'logout',
          status: 'warn',
          severity: 'warn',
          errorCode: err?.code || 'REQUEST_FAILED',
          httpStatus: err?.status ?? null,
          durationMs: Math.max(0, clock(now) - revokeT0),
          requestId: err?.requestId || null,
          retryable: false,
        });
      }
    }
    audit('logout_completed');
    return status();
  }
  async function read(kind, args) {
    if (kind === 'me') audit('account_read_started');
    try { await ensureSession(); } catch (error) { if (kind === 'me') audit('account_read_failed', { status: error?.status, code: error?.code, requestId: error?.requestId }); throw error; }
    const readEpoch = epoch, deviceId = record?.device?.id, usedToken = record?.session?.accessToken;
    const options = readArgs(kind, args);
    const methods = { me: 'getMe', entitlements: 'getEntitlements', members: 'getMembers', identities: 'getIdentities', overview: 'getOverview', catalog: 'getCatalog', relays: 'getRelays', devices: 'listDevices', tunnelStatus: 'getTunnelStatus', tunnelConfig: 'getTunnelConfig' };
    const method = methods[kind]; if (!method || typeof client()[method] !== 'function') throw fail('READ_NOT_ALLOWED', '读取类型不在允许范围内。');
    const execRead = tok => {
      const api = client(tok);
      return kind === 'catalog' ? api[method](options.platform) : Object.keys(options).length ? api[method](options) : api[method]();
    };
    let value;
    try { value = await execRead(usedToken); }
    catch (error) {
      if (error?.status === 401 && refreshPromise) {
        try { await refreshPromise; } catch {}
      }
      if (error?.status === 401 && !closed && readEpoch === epoch && record?.device?.id === deviceId
          && record?.session?.accessToken && record.session.accessToken !== usedToken) {
        const rotatedToken = record.session.accessToken;
        try {
          value = await execRead(rotatedToken);
        } catch (retryError) {
          pushDiag({ code: retryError?.code || null, requestId: retryError?.requestId || null });
          if (retryError?.status === 401) await invalidateSession(retryError, readEpoch, deviceId, rotatedToken);
          if (kind === 'me') audit('account_read_failed', { status: retryError?.status, code: retryError?.code, requestId: retryError?.requestId });
          throw retryError;
        }
      } else {
        pushDiag({ code: error?.code || null, requestId: error?.requestId || null });
        if (error?.status === 401) await invalidateSession(error, readEpoch, deviceId, usedToken);
        if (kind === 'me') audit('account_read_failed', { status: error?.status, code: error?.code, requestId: error?.requestId });
        throw error;
      }
    }
    if (closed || readEpoch !== epoch || !record || record.device.id !== deviceId) throw fail('AUTH_REQUIRED', '设备会话已结束。');
    if (kind === 'me') audit('account_read_succeeded');
    return clone(value);
  }
  async function productionConfig(transport, { stageOverride = null } = {}) {
    if(!transport||typeof transport.getConfig!=='function')throw fail('PROXY_CONFIG_UNAVAILABLE','生产配置入口尚未就绪。');
    await refreshIfExpiringWithin(tunnelMinAccessTtlMs);
    const startedEpoch=epoch;
    const current=clone(record);
    const usedToken=current?.session?.accessToken;
    let grant;
    const authT0 = clock(now);
    try { grant=await client(usedToken).createTunnelAuthorization(); }
    catch(error) {
      if (error?.status===401 && refreshPromise) { try { await refreshPromise; } catch {} }
      if (error?.status===401 && !closed && startedEpoch===epoch && record?.device?.id===current.device.id
          && record?.session?.accessToken && record.session.accessToken!==usedToken) {
        const rotatedToken = record.session.accessToken;
        try {
          grant = await client(rotatedToken).createTunnelAuthorization();
        } catch (retryError) {
          pushDiag({ code: retryError?.code || null, requestId: retryError?.requestId || null });
          const authMs = Math.max(0, clock(now) - authT0);
          if (!stageOverride) {
            emitTelemetry({
              category: 'tunnel', action: 'tunnel_authorize_failed', stage: 'tunnel_authorize',
              status: 'error', errorCode: retryError?.code || 'REQUEST_FAILED',
              httpStatus: retryError?.status ?? null, durationMs: authMs,
              requestId: retryError?.requestId || null,
            });
            emitLatency({
              trigger: 'error_slow', totalMs: authMs,
              status: retryError?.code === 'REQUEST_TIMEOUT' ? 'timeout' : 'error',
              errorCode: retryError?.code || 'REQUEST_FAILED',
              requestId: retryError?.requestId || null,
            });
            if (retryError && typeof retryError === 'object') retryError._telemetryRecorded = true;
          }
          if (retryError?.status===401) await invalidateSession(retryError, startedEpoch, current.device.id, rotatedToken);
          throw retryError;
        }
      } else {
        pushDiag({ code: error?.code || null, requestId: error?.requestId || null });
        const authMs = Math.max(0, clock(now) - authT0);
        if (!stageOverride) {
          emitTelemetry({
            category: 'tunnel', action: 'tunnel_authorize_failed', stage: 'tunnel_authorize',
            status: 'error', errorCode: error?.code || 'REQUEST_FAILED',
            httpStatus: error?.status ?? null, durationMs: authMs,
            requestId: error?.requestId || null,
          });
          emitLatency({
            trigger: 'error_slow', totalMs: authMs,
            status: error?.code === 'REQUEST_TIMEOUT' ? 'timeout' : 'error',
            errorCode: error?.code || 'REQUEST_FAILED',
            requestId: error?.requestId || null,
          });
          if (error && typeof error === 'object') error._telemetryRecorded = true;
        }
        if(error?.status===401&&startedEpoch===epoch&&record?.device?.id===current.device.id)await invalidateSession(error, startedEpoch, current.device.id, usedToken);
        throw error;
      }
    }
    const authOkMs = Math.max(0, clock(now) - authT0);
    if (authOkMs > 2500) {
      emitLatency({ trigger: 'error_slow', totalMs: authOkMs, status: 'degraded' });
    }
    if(closed||startedEpoch!==epoch||record?.device?.id!==current.device.id)throw fail('AUTH_REQUIRED','设备会话已结束。');
    let result;
    const cfgT0 = clock(now);
    try {
      result=await transport.getConfig({
        authorizationHandle:grant?.authorizationHandle,expiresAt:grant?.expiresAt,
        deviceId:current.device.id,privateKeyJwk:current.privateKeyJwk,
      });
    } catch (error) {
      const cfgMs = Math.max(0, clock(now) - cfgT0);
      if (error?.stage === 'config_verify') {
        emitTelemetry({
          category: 'tunnel', action: 'config_verify_failed', stage: 'config_verify',
          status: 'error', severity: 'fatal', retryable: false,
          errorCode: error?.code || 'PROXY_CONFIG_INVALID',
          httpStatus: error?.status ?? null, durationMs: cfgMs,
          requestId: error?.requestId || null,
        });
        if (error && typeof error === 'object') error._telemetryRecorded = true;
      } else if (!stageOverride) {
        emitTelemetry({
          category: 'tunnel', action: 'tunnel_config_fetch_failed', stage: 'tunnel_config_fetch',
          status: 'error', errorCode: error?.code || 'PROXY_CONFIG_UNAVAILABLE',
          httpStatus: error?.status ?? null, durationMs: cfgMs,
          requestId: error?.requestId || null,
        });
        emitLatency({
          trigger: 'error_slow', totalMs: cfgMs,
          status: error?.code === 'REQUEST_TIMEOUT' ? 'timeout' : 'error',
          errorCode: error?.code || 'PROXY_CONFIG_UNAVAILABLE',
          requestId: error?.requestId || null,
        });
        if (error && typeof error === 'object') error._telemetryRecorded = true;
      }
      if (error?.status===401 && error?.code==='SESSION_INVALID') {
        await invalidateSession(error, startedEpoch, current.device.id);
      }
      throw error;
    }
    const cfgOkMs = Math.max(0, clock(now) - cfgT0);
    if (cfgOkMs > 2500) {
      emitLatency({ trigger: 'error_slow', totalMs: cfgOkMs, status: 'degraded', requestId: result?.requestId || null });
    }
    if(closed||startedEpoch!==epoch||record?.device?.id!==current.device.id)throw fail('AUTH_REQUIRED','设备会话已结束。');
    return result;
  }
  async function callAuthenticatedClient(invokeFn) {
    await ensureSession();
    const callEpoch = epoch;
    const deviceId = record?.device?.id;
    const usedToken = record?.session?.accessToken;
    let value;
    try {
      value = await invokeFn(client(usedToken), deviceId);
    } catch (error) {
      if (error?.status === 401 && refreshPromise) {
        try { await refreshPromise; } catch {}
      }
      if (error?.status === 401 && !closed && callEpoch === epoch && record?.device?.id === deviceId
          && record?.session?.accessToken && record.session.accessToken !== usedToken) {
        const rotatedToken = record.session.accessToken;
        try {
          value = await invokeFn(client(rotatedToken), deviceId);
        } catch (retryError) {
          pushDiag({ code: retryError?.code || null, requestId: retryError?.requestId || null });
          if (retryError?.status === 401) await invalidateSession(retryError, callEpoch, deviceId, rotatedToken);
          throw retryError;
        }
      } else {
        pushDiag({ code: error?.code || null, requestId: error?.requestId || null });
        if (error?.status === 401) await invalidateSession(error, callEpoch, deviceId, usedToken);
        throw error;
      }
    }
    if (closed || callEpoch !== epoch || !record || record.device.id !== deviceId) throw fail('AUTH_REQUIRED', '设备会话已结束。');
    return clone(value);
  }
  function interruptLogin() { ++epoch; try { receiverRef.value?.cancel?.(); } catch {} }
  function cancelLogin() {
    if (committingLogin) return false;
    interruptLogin();
    return true;
  }
  function close() { closed = true; interruptLogin(); }
  return Object.freeze({
    ready, login, logout, cancelLogin, read,
    refresh: () => refreshSession({ notifyTunnel: true }),
    refreshIfExpiringWithin,
    snapshot: status, productionConfig, close,
    recentDiagnostics,
    syncTelemetry: payload => callAuthenticatedClient(api => api.syncTelemetry(payload)),
    listTickets: options => callAuthenticatedClient(api => api.listTickets(options)),
    createTicket: payload => callAuthenticatedClient(api => api.createTicket(payload)),
    getTicket: ticketId => callAuthenticatedClient(api => api.getTicket(ticketId)),
    replyTicket: (ticketId, payload) => callAuthenticatedClient(api => api.replyTicket(ticketId, payload)),
  });
}
