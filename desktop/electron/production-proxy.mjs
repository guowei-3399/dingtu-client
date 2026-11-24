import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const fail = (code, message) => Object.assign(new Error(message), { code });
const allowedErrors = new Set([
  'ACCOUNT_DISABLED', 'DEVICE_LIMIT_REACHED', 'DEVICE_LIMIT_NOT_CONFIGURED',
  'IDENTITY_UNAVAILABLE', 'SESSION_INVALID', 'REFRESH_REPLAY', 'AUTH_REQUIRED',
  'CONFIG_AUTHORIZATION_INVALID', 'SUBSCRIPTION_DISABLED', 'INSUFFICIENT_SCOPE',
  'PRODUCTION_MAPPING_NOT_READY', 'BRIDGE_UNAVAILABLE', 'PRODUCTION_LEASE_UNAVAILABLE',
  'PROXY_CONFIG_INVALID', 'PROXY_CONFIG_UNAVAILABLE', 'PROXY_CONFIG_WRITE_FAILED',
  'PROXY_START_CANCELLED', 'PROXY_PORT_IN_USE', 'PROXY_START_FAILED', 'PROXY_START_PENDING',
  'PROXY_DNS_ERROR', 'PROXY_ACCESS_DENIED', 'PROXY_ROUTE_ERROR',
  'PROXY_SPAWN_ERROR', 'PROXY_LISTEN_TIMEOUT', 'PROXY_FRONTEND_EXITED',
  'NETWORK_ERROR', 'REQUEST_TIMEOUT',
]);
const fatalRenewalErrors = new Set([
  'ACCOUNT_DISABLED', 'DEVICE_LIMIT_REACHED', 'DEVICE_LIMIT_NOT_CONFIGURED',
  'IDENTITY_UNAVAILABLE', 'SESSION_INVALID', 'REFRESH_REPLAY', 'REFRESH_INVALID', 'AUTH_REQUIRED',
  'SUBSCRIPTION_DISABLED', 'INSUFFICIENT_SCOPE',
  'PROXY_BINARY_UNAVAILABLE', 'PROXY_CONFIG_INVALID', 'PROXY_CONFIG_WRITE_FAILED',
  'PROXY_CONTROL_FAILED',
]);

async function defaultResolveHostIps(host) {
  if (typeof host !== 'string' || !host.trim()) return [];
  const clean = host.trim().replace(/^\[|\]$/g, '');
  if (isIP(clean) !== 0) return [clean];
  try {
    const v4 = await lookup(clean, { family: 4, all: true });
    const addrs = v4.map(item => item?.address).filter(Boolean);
    if (addrs.length > 0) return [...new Set(addrs)].sort();
  } catch {}
  try {
    const all = await lookup(clean, { all: true });
    const addrs = all.map(item => item?.address).filter(Boolean);
    if (addrs.length > 0) return [...new Set(addrs)].sort();
  } catch {}
  return [];
}

export function computeRenewalDelayMs(ttlMs) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 1_500) return 500;
  const leadMs = Math.min(90_000, Math.floor(ttlMs * 0.3));
  const candidate = Math.max(ttlMs - leadMs, 3_000);
  return Math.min(candidate, Math.max(500, ttlMs - 1_000));
}

// This controller lives in the main process. It never accepts renderer options
// or chooses an exit. loadTransport reads the reviewed release trust asset.
export function createProductionProxyController({
  auth, proxy, binary, configPath, hasBinary, loadTransport,
  closeBrowsers = () => {}, onAudit = () => {},
  onTelemetryEvent = null,
  onLatencySample = null,
  onOriginResolved = null,
  resolveHostIps = defaultResolveHostIps,
  now = Date.now, schedule = setTimeout, cancelSchedule = clearTimeout,
  scheduleInterval = setInterval, cancelInterval = clearInterval, watchdogIntervalMs = 15_000,
  preRefreshAccessMs = 180_000, retryDelayMs = 3_000, minRetryRemainingMs = 5_000,
} = {}) {
  if (typeof auth?.productionConfig !== 'function' || typeof proxy?.startConfig !== 'function'
      || typeof proxy?.stop !== 'function' || typeof proxy?.status !== 'function'
      || typeof proxy?.isRunning !== 'function' || typeof hasBinary !== 'function'
      || typeof loadTransport !== 'function' || typeof binary !== 'string' || typeof configPath !== 'string') {
    throw fail('CONFIGURATION_INVALID', '连接控制配置无效。');
  }
  let epoch = 0;
  let pending = false;
  let renewing = false;
  let queuedImmediateRenew = false;
  let renewTimer = null;
  let hardDeadlineTimer = null;
  let watchdogTimer = null;
  let currentExpiresAtMs = null;
  let renewAtMs = null;
  const cachedHostIps = new Map();
  const audit = (event, details) => { try { onAudit(event, details); } catch {} };
  const emitTelemetry = payload => { try { onTelemetryEvent?.(payload); } catch {} };
  const emitLatency = sample => { try { onLatencySample?.(sample); } catch {} };
  const emitOrigin = info => { try { onOriginResolved?.(info); } catch {} };

  async function resolveHostIpsWithCache(host) {
    const clean = typeof host === 'string' ? host.trim().toLowerCase() : '';
    if (!clean) return [];
    if (isIP(clean) !== 0) return [clean];
    try {
      const resolved = await resolveHostIps(clean);
      if (Array.isArray(resolved) && resolved.length > 0) {
        const canonical = [...new Set(resolved.filter(item => typeof item === 'string' && item.trim()))].sort();
        if (canonical.length > 0) {
          cachedHostIps.set(clean, canonical);
          return canonical;
        }
      }
    } catch {}
    return cachedHostIps.get(clean) || [];
  }

  async function inspectOriginMetadata(signedConfig) {
    const originHost = typeof signedConfig?.outbounds?.[0]?.server === 'string'
      ? signedConfig.outbounds[0].server.trim()
      : '';
    const rawPort = Number(signedConfig?.outbounds?.[0]?.server_port);
    const originPort = Number.isSafeInteger(rawPort) && rawPort >= 1 && rawPort <= 65535 ? rawPort : 443;
    const originNeedsDns = Boolean(originHost) && isIP(originHost) === 0;
    const dnsT0 = now();
    const originIps = originHost ? await resolveHostIpsWithCache(originHost) : [];
    const dnsMs = originNeedsDns ? Math.max(0, now() - dnsT0) : null;
    if (originNeedsDns && originIps.length === 0) {
      emitTelemetry({
        category: 'tunnel', action: 'origin_dns_resolve_failed', stage: 'dns_probe',
        status: 'error', errorCode: 'DNS_RESOLVE_FAILED', durationMs: dnsMs, retryable: true,
      });
    }
    return {
      originHost,
      originIp: originIps[0] || (isIP(originHost) !== 0 ? originHost : null),
      originPort,
      dnsMs,
    };
  }

  function clearTimers() {
    if (renewTimer !== null) { cancelSchedule(renewTimer); renewTimer = null; }
    if (hardDeadlineTimer !== null) { cancelSchedule(hardDeadlineTimer); hardDeadlineTimer = null; }
    if (watchdogTimer !== null) { cancelInterval(watchdogTimer); watchdogTimer = null; }
  }

  function stop() {
    epoch++;
    clearTimers();
    renewing = false;
    queuedImmediateRenew = false;
    currentExpiresAtMs = null;
    renewAtMs = null;
    try { Promise.resolve(closeBrowsers()).catch(() => {}); } catch {}
    return proxy.stop();
  }

  async function stopAndWait(timeoutMs = 2500) {
    epoch++;
    clearTimers();
    renewing = false;
    queuedImmediateRenew = false;
    currentExpiresAtMs = null;
    renewAtMs = null;
    try { await Promise.resolve(closeBrowsers()).catch(() => {}); } catch {}
    if (typeof proxy.stopAndWait === 'function') {
      return proxy.stopAndWait(timeoutMs);
    }
    return proxy.stop();
  }

  function armLeaseTimers(expiresAtIso, activeEpoch) {
    clearTimers();
    const until = Date.parse(expiresAtIso);
    if (!Number.isFinite(until)) return;
    currentExpiresAtMs = until;
    if (typeof proxy.reloadConfig !== 'function') return;
    const ttl = until - now();
    if (ttl <= 0) {
      audit('proxy_renewal_failed', { code: 'PROXY_CONFIG_UNAVAILABLE' });
      stop();
      return;
    }

    const delay = computeRenewalDelayMs(ttl);
    renewAtMs = now() + delay;
    renewTimer = schedule(() => {
      renewTimer = null;
      void renew(activeEpoch);
    }, delay);
    renewTimer?.unref?.();

    hardDeadlineTimer = schedule(() => {
      hardDeadlineTimer = null;
      if (activeEpoch !== epoch || !proxy.isRunning()) return;
      if (currentExpiresAtMs !== null && now() >= currentExpiresAtMs) {
        audit('proxy_renewal_failed', { code: 'PROXY_CONFIG_UNAVAILABLE' });
        stop();
      }
    }, ttl);
    hardDeadlineTimer?.unref?.();

    if (Number.isFinite(watchdogIntervalMs) && watchdogIntervalMs >= 1000 && typeof scheduleInterval === 'function') {
      watchdogTimer = scheduleInterval(() => {
        if (activeEpoch !== epoch) {
          clearTimers();
          return;
        }
        if (!proxy.isRunning()) {
          clearTimers();
          currentExpiresAtMs = null;
          renewAtMs = null;
          return;
        }
        const t = now();
        if (currentExpiresAtMs !== null && t >= currentExpiresAtMs) {
          audit('proxy_lease_expired', { code: 'PROXY_LEASE_EXPIRED' });
          emitTelemetry({
            category: 'tunnel', action: 'lease_expired', stage: 'lease_renew',
            status: 'error', errorCode: 'PROXY_LEASE_EXPIRED', retryable: false,
          });
          stop();
          return;
        }
        if (renewAtMs !== null && t >= renewAtMs && !renewing && !pending) {
          if (renewTimer !== null) { cancelSchedule(renewTimer); renewTimer = null; }
          void renew(activeEpoch);
        }
      }, watchdogIntervalMs);
      watchdogTimer?.unref?.();
    }
  }

  async function renew(activeEpoch) {
    if (activeEpoch !== epoch || pending || !proxy.isRunning()) return;
    if (typeof proxy.reloadConfig !== 'function') return;
    if (proxy.status?.()?.state === 'starting') {
      queuedImmediateRenew = true;
      const remaining = currentExpiresAtMs !== null ? currentExpiresAtMs - now() : 0;
      if (remaining > minRetryRemainingMs) {
        if (renewTimer !== null) { cancelSchedule(renewTimer); renewTimer = null; }
        const waitMs = Math.min(500, Math.max(100, remaining - 2_000));
        renewAtMs = now() + waitMs;
        renewTimer = schedule(() => {
          renewTimer = null;
          void renew(activeEpoch);
        }, waitMs);
        renewTimer?.unref?.();
      }
      return;
    }
    if (renewing) {
      queuedImmediateRenew = true;
      return;
    }
    renewing = true;
    const renewT0 = now();
    audit('proxy_renewal_started', {});
    try {
      if (!binary || !hasBinary(binary)) {
        throw fail('PROXY_BINARY_UNAVAILABLE', '本机内核不可用。');
      }
      if (currentExpiresAtMs !== null && now() >= currentExpiresAtMs) {
        throw fail('PROXY_CONFIG_UNAVAILABLE', '连接租约已到期。');
      }
      if (typeof auth.refreshIfExpiringWithin === 'function') {
        await auth.refreshIfExpiringWithin(preRefreshAccessMs);
      }
      if (activeEpoch !== epoch) return;
      const transport = await loadTransport();
      if (activeEpoch !== epoch) return;
      const envelope = await auth.productionConfig(transport, { stageOverride: 'lease_renew' });
      if (activeEpoch !== epoch) return;
      if (envelope?.data_source !== 'production' || !envelope.config
          || typeof envelope.expiresAt !== 'string') {
        throw fail('PROXY_CONFIG_INVALID', '生产配置校验失败。');
      }
      audit('production_config_verified', {
        requestId: envelope.requestId, configRevision: envelope.configRevision,
        bindingRevision: envelope.bindingRevision,
      });
      await proxy.reloadConfig({
        binary,
        config: envelope.config,
        configPath,
        expiresAt: envelope.expiresAt,
      });
      if (activeEpoch !== epoch) {
        stop();
        return;
      }
      audit('proxy_renewal_succeeded', {
        requestId: envelope.requestId, configRevision: envelope.configRevision,
        bindingRevision: envelope.bindingRevision,
      });
      const renewOkMs = Math.max(0, now() - renewT0);
      if (renewOkMs > 2500) {
        emitLatency({ trigger: 'error_slow', totalMs: renewOkMs, status: 'degraded', requestId: envelope.requestId || null });
      }
      armLeaseTimers(envelope.expiresAt, activeEpoch);
    } catch (error) {
      if (activeEpoch !== epoch) return;
      const code = error?.code || 'PROXY_CONFIG_UNAVAILABLE';
      const renewMs = Math.max(0, now() - renewT0);
      const remaining = currentExpiresAtMs !== null ? currentExpiresAtMs - now() : 0;
      const canRetry = !fatalRenewalErrors.has(code) && proxy.isRunning() && remaining > minRetryRemainingMs;
      if (canRetry) {
        audit('proxy_renewal_retry_scheduled', { code, status: error?.status, requestId: error?.requestId });
        if (!error?._telemetryRecorded) {
          emitTelemetry({
            category: 'tunnel', action: 'lease_renew_retry', stage: 'lease_renew',
            status: 'warn', severity: 'warn', errorCode: code,
            httpStatus: error?.status ?? null, durationMs: renewMs,
            requestId: error?.requestId || null, retryable: true,
          });
        }
        if (renewTimer !== null) { cancelSchedule(renewTimer); renewTimer = null; }
        const baseDelay = code === 'PROXY_START_PENDING' ? 500 : retryDelayMs;
        const nextDelay = Math.min(baseDelay, Math.max(200, remaining - 2_000));
        renewAtMs = now() + nextDelay;
        renewTimer = schedule(() => {
          renewTimer = null;
          void renew(activeEpoch);
        }, nextDelay);
        renewTimer?.unref?.();
        return;
      }
      audit('proxy_renewal_failed', { code, status: error?.status, requestId: error?.requestId });
      if (!error?._telemetryRecorded) {
        emitTelemetry({
          category: 'tunnel', action: 'lease_renew_failed', stage: 'lease_renew',
          status: 'error', errorCode: code,
          httpStatus: error?.status ?? null, durationMs: renewMs,
          requestId: error?.requestId || null, retryable: false,
        });
        emitLatency({
          trigger: 'error_slow', totalMs: renewMs,
          status: code === 'REQUEST_TIMEOUT' ? 'timeout' : 'error',
          errorCode: code, requestId: error?.requestId || null,
        });
      }
      stop();
    } finally {
      renewing = false;
      if (queuedImmediateRenew && activeEpoch === epoch && proxy.isRunning() && proxy.status?.()?.state !== 'starting') {
        queuedImmediateRenew = false;
        if (renewTimer !== null) { cancelSchedule(renewTimer); renewTimer = null; }
        void renew(activeEpoch);
      } else if (activeEpoch !== epoch || !proxy.isRunning()) {
        queuedImmediateRenew = false;
      }
    }
  }

  function notifySessionRefreshed() {
    if (pending || proxy.status?.()?.state === 'starting') {
      queuedImmediateRenew = true;
      return;
    }
    if (!proxy.isRunning() || typeof proxy.reloadConfig !== 'function') return;
    if (renewTimer !== null) { cancelSchedule(renewTimer); renewTimer = null; }
    void renew(epoch);
  }

  function notifySystemResume({ force = true } = {}) {
    if (pending || !proxy.isRunning()) return;
    if (typeof proxy.reloadConfig !== 'function') return;
    const t = now();
    if (currentExpiresAtMs !== null && t >= currentExpiresAtMs) {
      audit('proxy_lease_expired', { code: 'PROXY_LEASE_EXPIRED' });
      emitTelemetry({
        category: 'tunnel', action: 'lease_expired_on_resume', stage: 'lease_renew',
        status: 'error', errorCode: 'PROXY_LEASE_EXPIRED', retryable: false,
      });
      stop();
      return;
    }
    if (!force && renewAtMs !== null && t < renewAtMs) return;
    audit('proxy_resume_renewal', {});
    if (renewTimer !== null) { cancelSchedule(renewTimer); renewTimer = null; }
    void renew(epoch);
  }

  function notifyProxyStateChange(nextStatus) {
    const nextState = nextStatus?.state;
    if (nextState === 'running' && queuedImmediateRenew && !pending && !renewing && proxy.isRunning()) {
      queuedImmediateRenew = false;
      if (renewTimer !== null) { cancelSchedule(renewTimer); renewTimer = null; }
      void renew(epoch);
      return;
    }
    if ((nextState === 'failed' || nextState === 'stopped') && currentExpiresAtMs !== null && !pending && !renewing) {
      clearTimers();
      currentExpiresAtMs = null;
      renewAtMs = null;
      queuedImmediateRenew = false;
      if (nextState === 'failed') {
        const crashCode = nextStatus?.lastExitCategory || 'PROXY_FRONTEND_EXITED';
        audit('proxy_process_exited', { code: crashCode });
        emitTelemetry({
          category: 'tunnel',
          action: 'core_process_crashed',
          stage: 'core_crash',
          status: 'error',
          severity: 'fatal',
          errorCode: crashCode,
          retryable: true,
        });
      }
    }
  }

  async function start() {
    if (pending || proxy.isRunning()) throw fail('PROXY_ALREADY_RUNNING', '连接已在进行中。');
    if (!binary || !hasBinary(binary)) {
      const unavailable = fail('PROXY_BINARY_UNAVAILABLE', '本机内核不可用。');
      audit('proxy_start_failed', unavailable);
      emitTelemetry({
        category: 'tunnel', action: 'core_start_failed', stage: 'core_start',
        status: 'error', severity: 'fatal', errorCode: 'PROXY_BINARY_UNAVAILABLE', retryable: false,
      });
      unavailable._telemetryRecorded = true;
      throw unavailable;
    }
    const startedEpoch = epoch;
    const startT0 = now();
    let preparedDnsMs = null;
    pending = true;
    queuedImmediateRenew = false;
    audit('proxy_start_requested', {});
    try {
      if (typeof auth.refreshIfExpiringWithin === 'function') {
        await auth.refreshIfExpiringWithin(preRefreshAccessMs);
      }
      if (startedEpoch !== epoch) throw fail('PROXY_START_CANCELLED', '已取消本地连接。');
      const transport = await loadTransport();
      if (startedEpoch !== epoch) throw fail('PROXY_START_CANCELLED', '已取消本地连接。');
      const envelope = await auth.productionConfig(transport);
      if (startedEpoch !== epoch) throw fail('PROXY_START_CANCELLED', '已取消本地连接。');
      if (envelope?.data_source !== 'production' || !envelope.config
          || typeof envelope.expiresAt !== 'string') {
        throw fail('PROXY_CONFIG_INVALID', '生产配置校验失败。');
      }
      audit('production_config_verified', {
        requestId: envelope.requestId, configRevision: envelope.configRevision,
        bindingRevision: envelope.bindingRevision,
      });
      const originMeta = await inspectOriginMetadata(envelope.config);
      preparedDnsMs = originMeta.dnsMs ?? null;
      if (startedEpoch !== epoch) throw fail('PROXY_START_CANCELLED', '已取消本地连接。');
      const started = await proxy.startConfig({
        binary,
        config: envelope.config,
        configPath,
        expiresAt: envelope.expiresAt,
      });
      armLeaseTimers(envelope.expiresAt, startedEpoch);
      emitOrigin({
        originHost: originMeta.originHost || null,
        originIp: originMeta.originIp || null,
        originPort: originMeta.originPort || 443,
        dnsMs: preparedDnsMs,
        connectDurationMs: Math.max(0, now() - startT0),
      });
      return started;
    } catch (error) {
      stop();
      const code = allowedErrors.has(error?.code) ? error.code : 'PROXY_CONFIG_UNAVAILABLE';
      const durationMs = Math.max(0, now() - startT0);
      const wrapped = fail(code, '连接配置暂不可用。');
      wrapped.status = error?.status;
      wrapped.requestId = error?.requestId;
      audit('proxy_start_failed', wrapped);
      if (!error?._telemetryRecorded) {
        const failStage = code === 'PROXY_DNS_ERROR' ? 'dns_probe' : 'core_start';
        const isWarn = code === 'PROXY_START_CANCELLED';
        emitTelemetry({
          category: 'tunnel',
          action: `${failStage}_failed`,
          stage: failStage,
          status: isWarn ? 'warn' : 'error',
          errorCode: code,
          httpStatus: error?.status ?? null,
          durationMs,
          requestId: error?.requestId || null,
        });
        if (!isWarn) {
          emitLatency({
            trigger: 'connect',
            dnsMs: preparedDnsMs,
            totalMs: durationMs,
            status: code === 'PROXY_LISTEN_TIMEOUT' || code === 'REQUEST_TIMEOUT' ? 'timeout' : 'error',
            errorCode: code,
            requestId: error?.requestId || null,
          });
        }
      }
      wrapped._telemetryRecorded = true;
      throw wrapped;
    } finally {
      pending = false;
      if (queuedImmediateRenew && startedEpoch === epoch && proxy.isRunning() && proxy.status?.()?.state !== 'starting') {
        queuedImmediateRenew = false;
        if (renewTimer !== null) { cancelSchedule(renewTimer); renewTimer = null; }
        void renew(startedEpoch);
      }
    }
  }

  return Object.freeze({
    start,
    stop,
    stopAndWait,
    status: () => proxy.status(),
    notifySessionRefreshed,
    notifySystemResume,
    notifyProxyStateChange,
  });
}
