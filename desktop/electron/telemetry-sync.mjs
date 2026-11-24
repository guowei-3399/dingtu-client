import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import { projectTelemetrySyncResult } from './client-projection.mjs';
import { ENVIRONMENT_MODES, isTunnelEnvironmentMode } from './environment-mode.mjs';

export const TELEMETRY_STAGES = Object.freeze([
  'pkce_login', 'session_refresh', 'tunnel_authorize', 'tunnel_config_fetch',
  'config_verify', 'core_start', 'tun_setup', 'dns_probe', 'exit_probe',
  'lease_renew', 'core_crash', 'workbench_launch', 'account_switch', 'logout',
]);
export const TELEMETRY_SEVERITIES = Object.freeze(['info', 'warn', 'error', 'fatal']);
export const LATENCY_TRIGGERS = Object.freeze(['connect', 'periodic', 'self_check', 'error_slow']);
export const LATENCY_STATUSES = Object.freeze(['ok', 'degraded', 'timeout', 'error']);
export const SLOW_LATENCY_THRESHOLD_MS = 2500;
export const FAST_FLUSH_DEBOUNCE_MS = 30_000;
export const PERIODIC_PROBE_BASE_MS = 4 * 60_000;
export const PERIODIC_PROBE_JITTER_RATIO = 0.2;

const ALLOWED_CATEGORIES = new Set(['tunnel', 'workbench', 'account_switch', 'auth', 'diagnostic']);
const ALLOWED_STATUSES = new Set(['ok', 'warn', 'error']);
const STAGE_SET = new Set(TELEMETRY_STAGES);
const SEVERITY_SET = new Set(TELEMETRY_SEVERITIES);
const TRIGGER_SET = new Set(LATENCY_TRIGGERS);
const LATENCY_STATUS_SET = new Set(LATENCY_STATUSES);
const PLATFORM_SET = new Set(['windows', 'macos', 'linux', 'ios', 'android']);
const MAX_EVENTS = 100;
const MAX_LATENCY_SAMPLES = 60;
const MAX_DURATION_MS = 600_000;

const FATAL_ERROR_CODES = new Set([
  'PROXY_CONFIG_INVALID', 'PROXY_BINARY_UNAVAILABLE', 'PROXY_SPAWN_ERROR',
  'PROXY_FRONTEND_EXITED',
  'SECURE_STORE_UNAVAILABLE', 'JS_TYPE_ERROR', 'JS_RANGE_ERROR',
  'JS_REFERENCE_ERROR', 'JS_SYNTAX_ERROR', 'IPC_UNCAUGHT',
]);
const WARN_ERROR_CODES = new Set([
  'AUTHORIZATION_CANCELLED', 'PROXY_START_CANCELLED',
  'PROXY_START_PENDING', 'PERSONAL_SINGLE_OPEN_LIMIT', 'LOCAL_INSTANCE_LIMIT_REACHED',
  'PERSONAL_MULTI_LOGIN_FORBIDDEN',
]);
const NON_RETRYABLE_CODES = new Set([
  'ACCOUNT_DISABLED', 'SUBSCRIPTION_DISABLED', 'INSUFFICIENT_SCOPE',
  'DEVICE_LIMIT_REACHED', 'DEVICE_LIMIT_NOT_CONFIGURED', 'IDENTITY_UNAVAILABLE',
  'SESSION_INVALID', 'REFRESH_REPLAY', 'REFRESH_INVALID', 'AUTH_REQUIRED',
  'PROXY_CONFIG_INVALID', 'PROXY_BINARY_UNAVAILABLE', 'SECURE_STORE_UNAVAILABLE',
  'TELEMETRY_PRIVACY_VIOLATION', 'VALIDATION_ERROR', 'TOKEN_INVALID',
  'ANTIGRAVITY_CREDENTIAL_TOO_LARGE',
]);

const normalizeEnvMode = raw => (ENVIRONMENT_MODES.includes(raw) ? raw : 'safe_tunnel');
const clampDurationMs = value => {
  if (value === null || value === undefined) return null;
  const num = Math.round(Number(value));
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.min(MAX_DURATION_MS, num);
};
const sanitizeHttpStatus = value => (Number.isSafeInteger(value) && value >= 100 && value <= 599 ? value : null);
const sanitizeCode = value => (typeof value === 'string' && /^[A-Z0-9_]{1,64}$/.test(value) ? value : null);
const sanitizeRequestId = value => (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : null);
const sanitizeAction = value => (typeof value === 'string' && /^[a-z0-9_.-]{1,64}$/i.test(value) ? value : 'event');

export function computeEventFingerprint({ stage = null, errorCode = null, httpStatus = null, action = 'event' } = {}) {
  const cleanStage = STAGE_SET.has(stage) ? stage : 'unknown';
  const cleanErr = sanitizeCode(errorCode) || 'NONE';
  const cleanHttp = sanitizeHttpStatus(httpStatus) ?? 0;
  const cleanAct = sanitizeAction(action).toLowerCase();
  return crypto.createHash('sha256')
    .update(`${cleanStage}|${cleanErr}|${cleanHttp}|${cleanAct}`, 'utf8')
    .digest('hex');
}

export function deriveEventSeverity({ status = 'ok', errorCode = null, stage = null } = {}) {
  const cleanErr = sanitizeCode(errorCode);
  if (status === 'ok') return 'info';
  if (stage === 'config_verify' || stage === 'core_crash') return 'fatal';
  if (cleanErr && FATAL_ERROR_CODES.has(cleanErr)) return 'fatal';
  if (status === 'warn' || (cleanErr && WARN_ERROR_CODES.has(cleanErr))) return 'warn';
  return 'error';
}

export function deriveEventRetryable({ errorCode = null, httpStatus = null, stage = null } = {}) {
  const cleanErr = sanitizeCode(errorCode);
  if (stage === 'config_verify') return false;
  if (cleanErr && NON_RETRYABLE_CODES.has(cleanErr)) return false;
  if (Number.isSafeInteger(httpStatus)) {
    if (httpStatus === 401 || httpStatus === 403 || httpStatus === 400 || httpStatus === 404 || httpStatus === 422) return false;
    if (httpStatus === 408 || httpStatus === 429 || httpStatus >= 500) return true;
  }
  return true;
}

export function measureTcpConnectMs(host, port, timeoutMs = 4000) {
  if (typeof host !== 'string' || !host.trim() || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
    return Promise.resolve({ ok: false, durationMs: null, errorCode: 'INVALID_TARGET' });
  }
  const boundedMs = Math.max(300, Math.min(15_000, Number(timeoutMs) || 4000));
  const startedAt = Date.now();
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve(result);
    };
    const socket = net.createConnection({ host: host.trim(), port });
    socket.setTimeout(boundedMs, () => {
      finish({ ok: false, durationMs: clampDurationMs(Date.now() - startedAt), errorCode: 'REQUEST_TIMEOUT' });
    });
    socket.once('connect', () => {
      finish({ ok: true, durationMs: clampDurationMs(Date.now() - startedAt), errorCode: null });
    });
    socket.once('error', () => {
      finish({ ok: false, durationMs: clampDurationMs(Date.now() - startedAt), errorCode: 'NETWORK_ERROR' });
    });
  });
}

export function measureProxyHttpLatency({
  proxyHost = '127.0.0.1',
  proxyPort = 17899,
  targetHost = 'www.cloudflare.com',
  targetPort = 443,
  targetPath = '/cdn-cgi/trace',
  timeoutMs = 8000,
} = {}) {
  const boundedMs = Math.max(500, Math.min(20_000, Number(timeoutMs) || 8000));
  const startedAt = Date.now();
  return new Promise(resolve => {
    let settled = false;
    let tlsSocket = null;
    let connectReq = null;
    let timer = null;
    const finish = result => {
      if (settled) return;
      settled = true;
      if (timer !== null) { clearTimeout(timer); timer = null; }
      try { tlsSocket?.destroy(); } catch {}
      try { connectReq?.destroy(); } catch {}
      resolve(result);
    };
    timer = setTimeout(() => {
      finish({
        ok: false,
        status: 'timeout',
        e2eTtfbMs: null,
        totalMs: clampDurationMs(Date.now() - startedAt),
        httpStatus: null,
        errorCode: 'REQUEST_TIMEOUT',
      });
    }, boundedMs);
    timer?.unref?.();

    try {
      connectReq = http.request({
        host: proxyHost,
        port: proxyPort,
        method: 'CONNECT',
        path: `${targetHost}:${targetPort}`,
        headers: { Host: `${targetHost}:${targetPort}` },
      });
    } catch {
      finish({
        ok: false,
        status: 'error',
        e2eTtfbMs: null,
        totalMs: clampDurationMs(Date.now() - startedAt),
        httpStatus: null,
        errorCode: 'PROXY_CONNECT_FAILED',
      });
      return;
    }

    connectReq.once('error', () => {
      finish({
        ok: false,
        status: 'error',
        e2eTtfbMs: null,
        totalMs: clampDurationMs(Date.now() - startedAt),
        httpStatus: null,
        errorCode: 'PROXY_CONNECT_FAILED',
      });
    });

    connectReq.once('connect', (res, socket) => {
      if (settled) { try { socket.destroy(); } catch {} return; }
      if (res.statusCode !== 200) {
        try { socket.destroy(); } catch {}
        finish({
          ok: false,
          status: 'error',
          e2eTtfbMs: null,
          totalMs: clampDurationMs(Date.now() - startedAt),
          httpStatus: sanitizeHttpStatus(res.statusCode),
          errorCode: 'PROXY_CONNECT_FAILED',
        });
        return;
      }
      tlsSocket = tls.connect({ socket, servername: targetHost, rejectUnauthorized: true }, () => {
        if (settled) return;
        tlsSocket.write(
          `GET ${targetPath} HTTP/1.1\r\nHost: ${targetHost}\r\nUser-Agent: DingtuDesktop/0.2.0\r\nConnection: close\r\n\r\n`,
        );
      });
      let ttfbMs = null;
      let headerBuf = '';
      let parsedStatus = null;
      tlsSocket.on('data', chunk => {
        if (ttfbMs === null) {
          ttfbMs = clampDurationMs(Date.now() - startedAt);
        }
        if (parsedStatus === null && headerBuf.length < 512) {
          headerBuf += chunk.toString('latin1');
          const m = headerBuf.match(/^HTTP\/\d\.\d\s+(\d{3})/);
          if (m) parsedStatus = Number(m[1]);
        }
      });
      tlsSocket.once('end', () => {
        const totalMs = clampDurationMs(Date.now() - startedAt);
        const ok = parsedStatus !== null && parsedStatus >= 200 && parsedStatus < 400;
        const status = !ok
          ? 'error'
          : (totalMs !== null && totalMs > SLOW_LATENCY_THRESHOLD_MS ? 'degraded' : 'ok');
        finish({
          ok,
          status,
          e2eTtfbMs: ttfbMs ?? totalMs,
          totalMs,
          httpStatus: sanitizeHttpStatus(parsedStatus),
          errorCode: ok ? null : 'EXIT_PROBE_FAILED',
        });
      });
      tlsSocket.once('error', () => {
        finish({
          ok: false,
          status: 'error',
          e2eTtfbMs: ttfbMs,
          totalMs: clampDurationMs(Date.now() - startedAt),
          httpStatus: sanitizeHttpStatus(parsedStatus),
          errorCode: 'EXIT_PROBE_FAILED',
        });
      });
    });
    connectReq.end();
  });
}

export function createTelemetrySyncer({
  usageScanner,
  authHost,
  environment,
  proxy,
  accounts,
  platform = ({ win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform] || 'windows'),
  appVersion = '0.2.0',
  now = Date.now,
  fastFlushDebounceMs = FAST_FLUSH_DEBOUNCE_MS,
  backoffBaseMs = FAST_FLUSH_DEBOUNCE_MS,
  backoffMaxMs = 600_000,
  periodicBaseMs = PERIODIC_PROBE_BASE_MS,
  periodicJitterRatio = PERIODIC_PROBE_JITTER_RATIO,
  random = Math.random,
  measureTcp = measureTcpConnectMs,
  probeLink = measureProxyHttpLatency,
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
  scheduleInterval = setInterval,
  cancelInterval = clearInterval,
} = {}) {
  const safePlatform = PLATFORM_SET.has(platform) ? platform : 'windows';
  const safeVersion = typeof appVersion === 'string' && appVersion.trim()
    ? appVersion.trim().slice(0, 32)
    : '0.2.0';
  const pendingEvents = [];
  const pendingLatencySamples = [];
  let timer = null;
  let fastFlushTimer = null;
  let backoffTimer = null;
  let periodicProbeTimer = null;
  let syncing = false;
  let queuedFastFlush = false;
  let probing = false;
  let suspended = false;
  let backoffFailures = 0;
  let activeOrigin = null;
  let lastSyncedAt = null;
  let lastSyncStatus = 'idle';
  let lastAcceptedBuckets = 0;
  let lastAcceptedEvents = 0;
  let lastAcceptedLatencySamples = 0;
  let lastError = null;

  const nowMs = () => (typeof now === 'function' ? Number(now()) : Number(now)) || Date.now();
  const currentIso = () => new Date(nowMs()).toISOString();
  const currentEnvMode = () => (typeof environment?.getMode === 'function' ? normalizeEnvMode(environment.getMode()) : null);

  function clearFastFlushTimer() {
    if (fastFlushTimer !== null) {
      cancelSchedule(fastFlushTimer);
      fastFlushTimer = null;
    }
  }
  function clearBackoffTimer() {
    if (backoffTimer !== null) {
      cancelSchedule(backoffTimer);
      backoffTimer = null;
    }
  }
  function clearPeriodicProbeTimer() {
    if (periodicProbeTimer !== null) {
      cancelSchedule(periodicProbeTimer);
      periodicProbeTimer = null;
    }
  }

  function hasUrgentPending() {
    return pendingEvents.some(e => e.status === 'error' || e.severity === 'error' || e.severity === 'fatal')
      || pendingLatencySamples.some(s => s.trigger === 'error_slow' || s.status !== 'ok' || (s.totalMs !== null && s.totalMs !== undefined && s.totalMs > SLOW_LATENCY_THRESHOLD_MS));
  }

  function scheduleFastFlush(delayMs = fastFlushDebounceMs) {
    if (fastFlushTimer !== null) return;
    const boundedDelay = Math.max(0, Math.min(backoffMaxMs, Number(delayMs) || 0));
    fastFlushTimer = schedule(() => {
      fastFlushTimer = null;
      void flushFast().catch(() => {});
    }, boundedDelay);
    fastFlushTimer?.unref?.();
  }

  function scheduleBackoffRetry() {
    if (!hasUrgentPending() || backoffTimer !== null) return;
    backoffFailures += 1;
    const base = Math.max(50, Number(backoffBaseMs) || FAST_FLUSH_DEBOUNCE_MS);
    const maxCap = Math.max(base, Number(backoffMaxMs) || 600_000);
    const exp = Math.min(maxCap, base * (2 ** Math.min(backoffFailures - 1, 6)));
    const jitterFactor = 1 + (((typeof random === 'function' ? random() : Math.random()) * 2 - 1) * 0.15);
    const delayMs = Math.max(50, Math.round(exp * jitterFactor));
    backoffTimer = schedule(() => {
      backoffTimer = null;
      void flushFast().catch(() => {});
    }, delayMs);
    backoffTimer?.unref?.();
  }

  function recordEvent({
    category = 'diagnostic',
    action = 'unknown',
    appId = null,
    status = 'ok',
    errorCode = null,
    requestId = null,
    severity = null,
    stage = null,
    durationMs = null,
    httpStatus = null,
    retryable = null,
    fingerprint = null,
  } = {}) {
    const cleanCat = ALLOWED_CATEGORIES.has(category) ? category : 'diagnostic';
    const cleanStatus = ALLOWED_STATUSES.has(status) ? status : 'ok';
    const cleanAction = sanitizeAction(action);
    const cleanApp = typeof appId === 'string' && /^[a-z0-9-]{1,64}$/.test(appId) ? appId : null;
    const cleanErr = sanitizeCode(errorCode);
    const cleanReq = sanitizeRequestId(requestId);
    const envMode = currentEnvMode();
    const cleanStage = STAGE_SET.has(stage) ? stage : null;
    const cleanHttp = sanitizeHttpStatus(httpStatus);
    const cleanDuration = clampDurationMs(durationMs);
    const cleanSeverity = SEVERITY_SET.has(severity)
      ? severity
      : deriveEventSeverity({ status: cleanStatus, errorCode: cleanErr, stage: cleanStage });
    const cleanRetryable = typeof retryable === 'boolean'
      ? retryable
      : (cleanStatus === 'ok' ? null : deriveEventRetryable({ errorCode: cleanErr, httpStatus: cleanHttp, stage: cleanStage }));
    const cleanFingerprint = typeof fingerprint === 'string' && /^[a-f0-9]{16,64}$/.test(fingerprint)
      ? fingerprint
      : (cleanStage || cleanStatus === 'error' || cleanSeverity === 'error' || cleanSeverity === 'fatal'
        ? computeEventFingerprint({ stage: cleanStage, errorCode: cleanErr, httpStatus: cleanHttp, action: cleanAction })
        : null);

    const entry = {
      eventId: `evt_${crypto.randomBytes(12).toString('hex')}`,
      occurredAt: currentIso(),
      category: cleanCat,
      action: cleanAction,
      appId: cleanApp,
      environmentMode: envMode,
      status: cleanStatus,
      errorCode: cleanErr,
      requestId: cleanReq,
      severity: cleanSeverity,
      platform: safePlatform,
      appVersion: safeVersion,
      ...(cleanFingerprint ? { fingerprint: cleanFingerprint } : {}),
      ...(cleanStage ? { stage: cleanStage } : {}),
      ...(cleanDuration !== null ? { durationMs: cleanDuration } : {}),
      ...(cleanHttp !== null ? { httpStatus: cleanHttp } : {}),
      ...(cleanRetryable !== null ? { retryable: cleanRetryable } : {}),
    };

    pendingEvents.push(entry);
    if (pendingEvents.length > MAX_EVENTS) {
      pendingEvents.splice(0, pendingEvents.length - MAX_EVENTS);
    }
    if (cleanStatus === 'error' || cleanSeverity === 'error' || cleanSeverity === 'fatal') {
      scheduleFastFlush(fastFlushDebounceMs);
    }
    return entry;
  }

  function recordLatencySample({
    sampleId = null,
    sampledAt = null,
    trigger = 'periodic',
    environmentMode = undefined,
    clientToOriginMs = null,
    dnsMs = null,
    e2eTtfbMs = null,
    totalMs = null,
    status = 'ok',
    errorCode = null,
    requestId = null,
  } = {}) {
    const cleanTrigger = TRIGGER_SET.has(trigger) ? trigger : 'periodic';
    const cleanStatus = LATENCY_STATUS_SET.has(status) ? status : 'ok';
    const cleanId = typeof sampleId === 'string' && /^[A-Za-z0-9_.-]{8,64}$/.test(sampleId)
      ? sampleId
      : `smp_${crypto.randomBytes(12).toString('hex')}`;
    const cleanAt = typeof sampledAt === 'string' && Number.isFinite(Date.parse(sampledAt))
      ? new Date(sampledAt).toISOString()
      : currentIso();
    const cleanEnv = environmentMode === undefined
      ? currentEnvMode()
      : (environmentMode === null ? null : normalizeEnvMode(environmentMode));
    const cleanOriginMs = clampDurationMs(clientToOriginMs);
    const cleanDnsMs = clampDurationMs(dnsMs);
    const cleanTtfbMs = clampDurationMs(e2eTtfbMs);
    const cleanTotalMs = clampDurationMs(totalMs);
    const cleanErr = sanitizeCode(errorCode);
    const cleanReq = sanitizeRequestId(requestId);

    const sample = {
      sampleId: cleanId,
      sampledAt: cleanAt,
      trigger: cleanTrigger,
      platform: safePlatform,
      appVersion: safeVersion,
      ...(cleanEnv !== null ? { environmentMode: cleanEnv } : {}),
      ...(cleanOriginMs !== null ? { clientToOriginMs: cleanOriginMs } : {}),
      ...(cleanDnsMs !== null ? { dnsMs: cleanDnsMs } : {}),
      ...(cleanTtfbMs !== null ? { e2eTtfbMs: cleanTtfbMs } : {}),
      ...(cleanTotalMs !== null ? { totalMs: cleanTotalMs } : {}),
      status: cleanStatus,
      ...(cleanErr ? { errorCode: cleanErr } : {}),
      ...(cleanReq ? { requestId: cleanReq } : {}),
    };

    pendingLatencySamples.push(sample);
    if (pendingLatencySamples.length > MAX_LATENCY_SAMPLES) {
      pendingLatencySamples.splice(0, pendingLatencySamples.length - MAX_LATENCY_SAMPLES);
    }
    if (cleanTrigger === 'error_slow' || cleanStatus !== 'ok' || (cleanTotalMs !== null && cleanTotalMs > SLOW_LATENCY_THRESHOLD_MS)) {
      scheduleFastFlush(fastFlushDebounceMs);
    }
    return sample;
  }

  function buildDiagnosticSnapshot() {
    const diag = typeof authHost?.recentDiagnostics === 'function'
      ? authHost.recentDiagnostics()
      : { recentErrorCodes: [], recentRequestIds: [] };
    const envMode = typeof environment?.getMode === 'function'
      ? normalizeEnvMode(environment.getMode())
      : 'safe_tunnel';
    const proxyStatus = typeof proxy?.status === 'function' ? proxy.status()?.state : 'unknown';
    const safeProxy = ['unknown', 'stopped', 'starting', 'running', 'degraded', 'failed', 'error', 'stopping'].includes(proxyStatus)
      ? proxyStatus
      : 'unknown';
    return {
      appVersion: safeVersion,
      platform: safePlatform,
      environmentMode: envMode,
      proxyState: safeProxy,
      recentErrorCodes: Array.isArray(diag.recentErrorCodes) ? diag.recentErrorCodes.slice(0, 10) : [],
      recentRequestIds: Array.isArray(diag.recentRequestIds) ? diag.recentRequestIds.slice(0, 10) : [],
    };
  }

  function status() {
    return Object.freeze({
      lastSyncedAt,
      lastSyncStatus,
      lastAcceptedBuckets,
      lastAcceptedEvents,
      lastAcceptedLatencySamples,
      pendingEventsCount: pendingEvents.length,
      pendingLatencySamplesCount: pendingLatencySamples.length,
      lastError,
    });
  }

  async function syncInternal({ includeUsage = true, appIds = ['antigravity', 'codex', 'claude-code', 'gemini-cli'], days = 30 } = {}) {
    if (syncing) {
      if (!includeUsage) queuedFastFlush = true;
      return status();
    }
    if (!includeUsage && pendingEvents.length === 0 && pendingLatencySamples.length === 0) {
      return status();
    }
    if (!authHost || authHost.snapshot?.().status !== 'authenticated' || typeof authHost.syncTelemetry !== 'function') {
      lastSyncStatus = 'offline';
      lastError = '未登录或离线，已暂存本机队列';
      if (!includeUsage) scheduleBackoffRetry();
      return status();
    }
    syncing = true;
    clearFastFlushTimer();
    clearBackoffTimer();
    try {
      let usageBuckets = [];
      if (includeUsage) {
        const settings = typeof accounts?.settingsGet === 'function' ? await accounts.settingsGet() : { customDataDirs: {} };
        usageBuckets = usageScanner && typeof usageScanner.scanTelemetryBuckets === 'function'
          ? usageScanner.scanTelemetryBuckets({
            appIds,
            customDataDirs: settings?.customDataDirs || {},
            days,
          })
          : [];
      }
      const batchEvents = pendingEvents.slice(0, MAX_EVENTS);
      const batchSamples = pendingLatencySamples.slice(0, MAX_LATENCY_SAMPLES);
      if (!includeUsage && batchEvents.length === 0 && batchSamples.length === 0) {
        return status();
      }
      const sentEventIds = new Set(batchEvents.map(e => e.eventId));
      const sentSampleIds = new Set(batchSamples.map(s => s.sampleId));
      const payload = {
        reportedAt: currentIso(),
        usageBuckets,
        events: batchEvents,
        ...(batchSamples.length > 0 ? { latencySamples: batchSamples } : {}),
      };
      const rawRes = await authHost.syncTelemetry(payload);
      const projected = projectTelemetrySyncResult(rawRes);
      for (let i = pendingEvents.length - 1; i >= 0; i -= 1) {
        if (sentEventIds.has(pendingEvents[i].eventId)) pendingEvents.splice(i, 1);
      }
      for (let i = pendingLatencySamples.length - 1; i >= 0; i -= 1) {
        if (sentSampleIds.has(pendingLatencySamples[i].sampleId)) pendingLatencySamples.splice(i, 1);
      }
      backoffFailures = 0;
      lastSyncedAt = projected.syncedAt;
      if (includeUsage) lastAcceptedBuckets = projected.acceptedBuckets;
      lastAcceptedEvents = projected.acceptedEvents;
      lastAcceptedLatencySamples = projected.acceptedLatencySamples;
      lastSyncStatus = 'synced';
      lastError = null;
      return status();
    } catch (err) {
      lastSyncStatus = 'error';
      lastError = typeof err?.message === 'string' && err.message ? err.message.slice(0, 120) : '云端同步暂不可用，稍后重试';
      scheduleBackoffRetry();
      return status();
    } finally {
      syncing = false;
      if (queuedFastFlush) {
        queuedFastFlush = false;
        if (hasUrgentPending()) {
          scheduleFastFlush(0);
        }
      }
    }
  }

  async function syncNow({ appIds = ['antigravity', 'codex', 'claude-code', 'gemini-cli'], days = 30 } = {}) {
    return syncInternal({ includeUsage: true, appIds, days });
  }

  async function flushFast() {
    return syncInternal({ includeUsage: false });
  }

  function isPeriodicProbeEligible() {
    if (suspended) return false;
    if (authHost?.snapshot?.().status !== 'authenticated') return false;
    const mode = currentEnvMode();
    if (!isTunnelEnvironmentMode(mode)) return false;
    const proxyState = typeof proxy?.status === 'function' ? proxy.status()?.state : 'stopped';
    return proxyState === 'running';
  }

  function computeNextPeriodicDelayMs() {
    const base = Math.max(1000, Number(periodicBaseMs) || PERIODIC_PROBE_BASE_MS);
    const ratio = Math.max(0, Math.min(0.5, Number(periodicJitterRatio) || PERIODIC_PROBE_JITTER_RATIO));
    const r = typeof random === 'function' ? random() : Math.random();
    const factor = 1 + ((r * 2 - 1) * ratio);
    return Math.max(1000, Math.round(base * factor));
  }

  function armPeriodicProbe() {
    clearPeriodicProbeTimer();
    if (!isPeriodicProbeEligible()) return;
    const delayMs = computeNextPeriodicDelayMs();
    periodicProbeTimer = schedule(async () => {
      periodicProbeTimer = null;
      if (!isPeriodicProbeEligible()) return;
      await runLatencyProbe({ trigger: 'periodic' }).catch(() => {});
      if (isPeriodicProbeEligible()) armPeriodicProbe();
    }, delayMs);
    periodicProbeTimer?.unref?.();
  }

  async function runLatencyProbe({
    trigger = 'periodic',
    originHost = activeOrigin?.originHost || null,
    originIp = activeOrigin?.originIp || null,
    originPort = activeOrigin?.originPort || null,
    dnsMs = null,
  } = {}) {
    if (probing) return null;
    const mode = currentEnvMode();
    if (!isTunnelEnvironmentMode(mode)) return null;
    probing = true;
    try {
      const targetHost = originIp || originHost;
      let clientToOriginMs = null;
      if (targetHost && Number.isSafeInteger(originPort) && originPort > 0 && typeof measureTcp === 'function') {
        const tcp = await Promise.resolve(measureTcp(targetHost, originPort, 4000)).catch(() => null);
        if (tcp?.ok && tcp.durationMs !== null) {
          clientToOriginMs = tcp.durationMs;
        }
      }
      const httpProbe = typeof probeLink === 'function'
        ? await Promise.resolve(probeLink({ timeoutMs: 8000 })).catch(() => ({
          ok: false, status: 'error', e2eTtfbMs: null, totalMs: null, httpStatus: null, errorCode: 'EXIT_PROBE_FAILED',
        }))
        : { ok: true, status: 'ok', e2eTtfbMs: null, totalMs: clientToOriginMs, httpStatus: 200, errorCode: null };

      const finalStatus = LATENCY_STATUS_SET.has(httpProbe?.status)
        ? httpProbe.status
        : (httpProbe?.ok ? 'ok' : 'error');
      const sample = recordLatencySample({
        trigger,
        environmentMode: mode,
        clientToOriginMs,
        dnsMs,
        e2eTtfbMs: httpProbe?.e2eTtfbMs ?? null,
        totalMs: httpProbe?.totalMs ?? clientToOriginMs,
        status: finalStatus,
        errorCode: httpProbe?.ok ? null : (httpProbe?.errorCode || 'EXIT_PROBE_FAILED'),
      });
      if (!httpProbe?.ok) {
        recordEvent({
          category: 'tunnel',
          action: `${trigger}_exit_probe_failed`,
          stage: 'exit_probe',
          status: 'error',
          errorCode: httpProbe?.errorCode || 'EXIT_PROBE_FAILED',
          durationMs: httpProbe?.totalMs ?? null,
          httpStatus: httpProbe?.httpStatus ?? null,
          retryable: true,
        });
      }
      return sample;
    } finally {
      probing = false;
    }
  }

  function setActiveOrigin(info) {
    if (!info || typeof info !== 'object') {
      activeOrigin = null;
      return;
    }
    const port = Number(info.originPort);
    activeOrigin = {
      originHost: typeof info.originHost === 'string' && info.originHost.trim() ? info.originHost.trim() : null,
      originIp: typeof info.originIp === 'string' && info.originIp.trim() ? info.originIp.trim() : null,
      originPort: Number.isSafeInteger(port) && port >= 1 && port <= 65535 ? port : 443,
    };
  }

  function notifyProxyStateChange(nextStatus) {
    const state = nextStatus?.state;
    if (state === 'running') {
      armPeriodicProbe();
    } else if (state === 'stopped' || state === 'failed' || state === 'stopping') {
      clearPeriodicProbeTimer();
      if (state === 'stopped' || state === 'failed') activeOrigin = null;
    }
  }

  function notifySessionReady() {
    backoffFailures = 0;
    clearBackoffTimer();
    if (hasUrgentPending()) {
      scheduleFastFlush(Math.min(2000, fastFlushDebounceMs));
    }
    if (isPeriodicProbeEligible()) {
      armPeriodicProbe();
    }
  }

  function notifySystemSuspend() {
    suspended = true;
    clearPeriodicProbeTimer();
  }

  function notifySystemResume() {
    suspended = false;
    if (isPeriodicProbeEligible()) {
      armPeriodicProbe();
    }
  }

  function start(intervalMs = 15 * 60_000) {
    dispose();
    const safeMs = Math.max(60_000, Number(intervalMs) || 15 * 60_000);
    timer = scheduleInterval(() => {
      if (authHost?.snapshot?.().status === 'authenticated') {
        void syncNow().catch(() => {});
      }
    }, safeMs);
    timer?.unref?.();
    if (isPeriodicProbeEligible()) {
      armPeriodicProbe();
    }
  }

  function dispose() {
    if (timer !== null) {
      cancelInterval(timer);
      timer = null;
    }
    clearFastFlushTimer();
    clearBackoffTimer();
    clearPeriodicProbeTimer();
    queuedFastFlush = false;
  }

  return Object.freeze({
    recordEvent,
    recordLatencySample,
    buildDiagnosticSnapshot,
    status,
    syncNow,
    flushFast,
    runLatencyProbe,
    setActiveOrigin,
    notifyProxyStateChange,
    notifySessionReady,
    notifySystemSuspend,
    notifySystemResume,
    start,
    dispose,
  });
}
