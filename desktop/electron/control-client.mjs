// Main-process-only client for the future customer device/tunnel facade.
// This module deliberately does not persist credentials, choose an egress, or
// expose a renderer IPC surface. It is safe to ship before the operator facade
// exists because every call fails closed on missing auth or a non-contract
// response.
import { LOCAL_PROXY, resolveControlBase } from './runtime-contract.mjs';
import { validateRedirectUri } from './pkce.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const ISO = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const publicKey = value => object(value) && value.kty === 'OKP' && value.crv === 'Ed25519' && typeof value.x === 'string'
  && /^[A-Za-z0-9_-]{43}$/.test(value.x) && value.d === undefined
  && Object.keys(value).every(key => ['kty', 'crv', 'x', 'alg', 'use', 'key_ops'].includes(key));
const safeCode = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value);
const safeRequestId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);

export const CLIENT_PATHS = Object.freeze({
  me: '/api/v1/me',
  entitlements: '/api/v1/tenants/me',
  members: '/api/v1/tenants/me/members',
  identities: '/api/v1/tenants/me/identities',
  overview: '/api/v1/assistant/overview',
  catalog: '/api/v1/client/catalog',
  relays: '/api/v1/client/relays',
  authorize: '/api/v1/client/authorize',
  deviceSession: '/api/v1/client/device/sessions',
  devices: '/api/v1/client/devices',
  tunnelConfig: '/api/v1/client/tunnel/config',
  tunnelAuthorization: '/api/v1/client/tunnel/authorizations',
  tunnelHeartbeat: '/api/v1/client/tunnel/heartbeat',
  tunnelStatus: '/api/v1/client/tunnel/status',
  telemetrySync: '/api/v1/client/telemetry/sync',
  tickets: '/api/v1/client/tickets',
});

const TICKET_ID_RE = /^tkt_[0-9a-f]{32}$/;
const TICKET_STATUSES = new Set(['submitted', 'acknowledged', 'investigating', 'waiting_user', 'awaiting_ops', 'awaiting_production', 'resolved', 'closed', 'reopened']);
const TICKET_CATEGORIES = new Set(['connection', 'exit_ip', 'workbench_app', 'account_billing', 'other']);
const TICKET_ACTIONS = new Set(['reply', 'reopen', 'close']);
const TELEMETRY_CATEGORIES = new Set(['tunnel', 'workbench', 'account_switch', 'auth', 'diagnostic']);
const TELEMETRY_STATUSES = new Set(['ok', 'warn', 'error']);
const TELEMETRY_SEVERITIES = new Set(['info', 'warn', 'error', 'fatal']);
const TELEMETRY_STAGES = new Set([
  'pkce_login', 'session_refresh', 'tunnel_authorize', 'tunnel_config_fetch',
  'config_verify', 'core_start', 'tun_setup', 'dns_probe', 'exit_probe',
  'lease_renew', 'core_crash', 'workbench_launch', 'account_switch', 'logout',
]);
const LATENCY_TRIGGERS = new Set(['connect', 'periodic', 'self_check', 'error_slow']);
const LATENCY_STATUSES = new Set(['ok', 'degraded', 'timeout', 'error']);
const SESSION_TYPES = new Set(['main', 'swarm', 'subagent']);
const TELEMETRY_FORBIDDEN_KEYS = new Set([
  'workspacePath', 'workspaceName', 'title', 'prompt', 'content',
  'token', 'secret', 'cookie', 'password',
  'accessToken', 'refreshToken', 'privateKey', 'privateKeyJwk',
  'vlessUuid', 'proxyPassword', 'authorizationHandle', 'deviceProof',
  'cookieHeader', 'sessionCookie', 'filePath', 'cwd',
]);
const BUCKET_ALLOWED_KEYS = ['bucketDate', 'appId', 'model', 'sessionType', 'sessions', 'turns', 'inputTokens', 'thinkingTokens', 'outputTokens', 'cacheTokens', 'totalTokens'];
const EVENT_REQUIRED_KEYS = ['eventId', 'occurredAt', 'category', 'action', 'appId', 'environmentMode', 'status', 'errorCode', 'requestId'];
const EVENT_OPTIONAL_KEYS = ['severity', 'fingerprint', 'platform', 'appVersion', 'stage', 'durationMs', 'httpStatus', 'retryable'];
const EVENT_ALLOWED_KEY_SET = new Set([...EVENT_REQUIRED_KEYS, ...EVENT_OPTIONAL_KEYS]);
const LATENCY_ALLOWED_KEY_SET = new Set([
  'sampleId', 'sampledAt', 'trigger', 'platform', 'appVersion', 'environmentMode',
  'clientToOriginMs', 'dnsMs', 'e2eTtfbMs', 'totalMs', 'status', 'errorCode', 'requestId',
]);
const SAMPLE_ID_RE = /^[A-Za-z0-9_.-]{8,64}$/;
const FINGERPRINT_RE = /^[a-f0-9]{16,64}$/;
const safeAppVersion = value => typeof value === 'string' && value.trim().length >= 1 && value.length <= 32 && !/[\x00-\x1f\x7f]/.test(value);
const safeDurationMs = value => Number.isSafeInteger(value) && value >= 0 && value <= 600_000;
const safeHttpStatus = value => Number.isSafeInteger(value) && value >= 100 && value <= 599;
const SNAPSHOT_ALLOWED_KEYS = ['appVersion', 'platform', 'environmentMode', 'proxyState', 'recentErrorCodes', 'recentRequestIds'];

export class ControlClientError extends Error {
  constructor(code, message, { status = 0, requestId = null } = {}) {
    super(message); this.name = 'ControlClientError'; this.code = code;
    this.status = status; this.requestId = safeRequestId(requestId) ? requestId : null;
  }
}

const fail = (code, message, options) => { throw new ControlClientError(code, message, options); };
const id = (value, label) => { if (typeof value !== 'string' || !ID.test(value)) fail('VALIDATION_ERROR', `${label}无效。`); return value; };
const platforms = new Set(['windows', 'macos', 'linux', 'ios', 'android']);
const heartbeatStates = new Set(['unknown', 'stopped', 'starting', 'running', 'degraded', 'failed', 'error']);
const heartbeatError = value => value === null || (typeof value === 'string' && /^[A-Z0-9_]{1,64}$/.test(value));
const validConfigRevision = value => value === null || (Number.isSafeInteger(value) && value >= 0)
  || (typeof value === 'string' && /^[A-Za-z0-9._:-]{1,64}$/.test(value));
const observedStates = new Set(['unknown', 'stopped', 'starting', 'running', 'degraded', 'failed', 'revoked', 'expired', 'blocked']);
const observedState = value => typeof value === 'string' && observedStates.has(value) ? value : 'unknown';
const revision = value => typeof value === 'string' && /^binding-[A-Za-z0-9._:-]{1,190}$/.test(value) ? value : null;
const dateOrNull = value => typeof value === 'string' && ISO(value) ? new Date(value).toISOString() : null;
const allowedPath = path => {
  const [pathname, query] = path.split('?');
  if (query !== undefined) {
    const params = new URLSearchParams(query);
    if (pathname === CLIENT_PATHS.catalog) return [...params.keys()].length === 1 && params.getAll('platform').length === 1 && platforms.has(params.get('platform'));
    if (pathname === CLIENT_PATHS.identities) return [...params.keys()].every(key => ['limit', 'cursor'].includes(key) && params.getAll(key).length === 1);
    if (pathname === CLIENT_PATHS.tickets) {
      return [...params.keys()].every(key => ['status', 'limit'].includes(key) && params.getAll(key).length === 1)
        && (!params.has('status') || TICKET_STATUSES.has(params.get('status')))
        && (!params.has('limit') || (/^[1-9][0-9]{0,2}$/.test(params.get('limit')) && Number(params.get('limit')) <= 100));
    }
    return false;
  }
  return Object.values(CLIENT_PATHS).includes(pathname)
    || /^\/api\/v1\/client\/device\/sessions\/[A-Za-z0-9][A-Za-z0-9._:-]{0,199}(?:\/refresh)?$/.test(pathname)
    || /^\/api\/v1\/client\/tickets\/tkt_[0-9a-f]{32}(?:\/messages)?$/.test(pathname);
};

function readProblem(payload, status, headerRequestId) {
  const problem = object(payload?.error) ? payload.error : object(payload) ? payload : {};
  const code = safeCode(problem.code) ? problem.code : status === 401 ? 'AUTH_REQUIRED' : 'REQUEST_FAILED';
  const messages = {
    ACCOUNT_DISABLED: '账号尚未开通或当前权益不可用，请联系运营确认。',
    AUTHORIZATION_CODE_INVALID: '本次授权已失效，请重新发起浏览器授权。',
    DEVICE_LIMIT_REACHED: '授权设备数量已达到套餐上限，请先管理已有设备。',
    DEVICE_LIMIT_NOT_CONFIGURED: '账号尚未配置设备权益，请联系运营确认。',
    IDENTITY_UNAVAILABLE: '当前账号没有可用的连接身份，请联系运营确认。',
    TELEMETRY_PRIVACY_VIOLATION: '遥测上报包含敏感工作区或会话字段，已被安全拦截。',
    TICKET_NOT_FOUND: '工单不存在或无权访问。',
    TICKET_STATE_CONFLICT: '当前工单状态不允许执行此操作。',
  };
  return {
    code,
    // Server error text can contain reflected credentials or private upstreams.
    message: messages[code] || (status === 401 ? '设备会话已失效，请重新登录。' : '服务暂时不可用。'),
    requestId: safeRequestId(problem.request_id) ? problem.request_id : safeRequestId(headerRequestId) ? headerRequestId : null,
  };
}

function safeResponse(payload, status) {
  if (!object(payload)) fail('INVALID_RESPONSE', '服务返回格式无效。', { status });
  return payload;
}

export function createControlClient({ baseUrl, fetch: fetchImpl = globalThis.fetch, tokenProvider, refreshTokenProvider, production = true, timeoutMs = 15000, onResponse } = {}) {
  const base = resolveControlBase(baseUrl, { production });
  if (!base) fail('CONFIGURATION_INVALID', '生产控制面必须配置 HTTPS 地址。');
  if (typeof fetchImpl !== 'function') fail('CONFIGURATION_INVALID', '控制面请求能力不可用。');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) fail('CONFIGURATION_INVALID', '控制面超时设置无效。');
  if (onResponse !== undefined && typeof onResponse !== 'function') fail('CONFIGURATION_INVALID', '请求记录回调无效。');

  async function request(path, { method = 'GET', body, authenticated = true, expectedStatus } = {}) {
    if (!allowedPath(path)) fail('PATH_NOT_ALLOWED', '客户端路径不在合同内。');
    const headers = { Accept: 'application/json', 'X-Noya-Client': 'electron-v2', 'X-Requested-With': 'Dingtu-Portal' };
    if (authenticated) {
      if (typeof tokenProvider !== 'function') fail('AUTH_REQUIRED', '设备会话尚未就绪。');
      let token;
      try { token = await tokenProvider(); } catch { fail('AUTH_REQUIRED', '设备会话尚未就绪。'); }
      if (typeof token !== 'string' || token.length < 16 || token.length > 4096 || /[\s\x00-\x1f\x7f]/.test(token)) fail('AUTH_REQUIRED', '设备会话尚未就绪。');
      headers.Authorization = `Bearer ${token}`;
    }
    const controller = new AbortController();
    const init = { method, headers, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal };
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new ControlClientError('REQUEST_TIMEOUT', '控制面请求超时，请稍后重试。'));
        controller.abort();
      }, timeoutMs);
    });
    const operation = async () => {
      let response;
      try { response = await fetchImpl(new URL(path, `${base}/`).toString(), init); }
      catch { fail('NETWORK_ERROR', '暂时无法连接控制面。'); }
      const requestId = response.headers?.get?.('X-Request-Id');
      try { onResponse?.({ path, method, status: response.status, requestId: safeRequestId(requestId) ? requestId : null }); } catch {}
      if (response.redirected || response.status >= 300 && response.status < 400) fail('INVALID_RESPONSE', '控制面重定向已被拒绝。');
      let payload = null;
      try { payload = response.status === 204 ? null : await response.json(); } catch { fail('INVALID_RESPONSE', '服务返回格式无效。', { status: response.status }); }
      if (!response.ok) { const problem = readProblem(payload, response.status, response.headers?.get?.('X-Request-Id')); fail(problem.code, problem.message, { status: response.status, requestId: problem.requestId }); }
      if (expectedStatus !== undefined && response.status !== expectedStatus) fail('INVALID_RESPONSE', '服务响应状态无效。', { status: response.status });
      return payload === null ? null : safeResponse(payload, response.status);
    };
    try { return await Promise.race([operation(), deadline]); }
    finally { clearTimeout(timer); controller.abort(); }
  }

  return Object.freeze({
    authorizationUrl({ redirectUri, codeChallenge, state, platform } = {}) {
      const callback = validateRedirectUri(redirectUri);
      if (typeof codeChallenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) fail('VALIDATION_ERROR', 'PKCE challenge 无效。');
      if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(state)) fail('VALIDATION_ERROR', '授权状态无效。');
      if (platform !== undefined && !platforms.has(platform)) fail('VALIDATION_ERROR', '客户端平台无效。');
      const url = new URL(CLIENT_PATHS.authorize, `${base}/`);
      url.search = new URLSearchParams({ client_id: 'noya-desktop', redirect_uri: callback, response_type: 'code', code_challenge: codeChallenge, code_challenge_method: 'S256', state }).toString();
      if (platform !== undefined) url.searchParams.set('platform', platform);
      return url.toString();
    },
    async createDeviceSession({ authorizationCode, codeVerifier, redirectUri, deviceName, platform, appVersion, devicePublicKey } = {}) {
      if (typeof authorizationCode !== 'string' || !authorizationCode || authorizationCode.length > 2048) fail('VALIDATION_ERROR', '授权码无效。');
      if (typeof codeVerifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) fail('VALIDATION_ERROR', 'PKCE 校验值无效。');
      const callback = validateRedirectUri(redirectUri);
      if (typeof deviceName !== 'string' || !deviceName.trim() || deviceName.length > 100) fail('VALIDATION_ERROR', '设备名称无效。');
      if (!['windows', 'macos', 'linux', 'ios', 'android'].includes(platform)) fail('VALIDATION_ERROR', '客户端平台无效。');
      if (typeof appVersion !== 'string' || !appVersion.trim() || appVersion.length > 64 || /[\r\n]/.test(appVersion)) fail('VALIDATION_ERROR', '客户端版本无效。');
      if (!publicKey(devicePublicKey)) fail('VALIDATION_ERROR', '设备公钥无效。');
      return request(CLIENT_PATHS.deviceSession, { method: 'POST', authenticated: false, body: { authorizationCode, codeVerifier, redirectUri: callback, deviceName: deviceName.trim(), platform, appVersion: appVersion.trim(), devicePublicKey } });
    },
    async refreshDeviceSession(deviceId, refreshToken) {
      if (refreshToken === undefined) {
        if (typeof refreshTokenProvider !== 'function') fail('AUTH_REQUIRED', '设备刷新凭据尚未就绪。');
        try { refreshToken = await refreshTokenProvider(); } catch { fail('AUTH_REQUIRED', '设备刷新凭据尚未就绪。'); }
      }
      if (typeof refreshToken !== 'string' || refreshToken.length < 16 || refreshToken.length > 4096 || /[\s\x00-\x1f\x7f]/.test(refreshToken)) fail('AUTH_REQUIRED', '设备刷新凭据尚未就绪。');
      return request(`${CLIENT_PATHS.deviceSession}/${id(deviceId, '设备编号')}/refresh`, { method: 'POST', authenticated: false, body: { refreshToken } });
    },
    async revokeDeviceSession(deviceId) { return request(`${CLIENT_PATHS.deviceSession}/${id(deviceId, '设备编号')}`, { method: 'DELETE' }); },
    async getMe() { return request(CLIENT_PATHS.me); },
    async getEntitlements() { return request(CLIENT_PATHS.entitlements); },
    async getMembers() { return request(CLIENT_PATHS.members); },
    async getOverview() { return request(CLIENT_PATHS.overview); },
    async getIdentities(options = {}) {
      if (!object(options) || Object.keys(options).some(key => !['limit', 'cursor'].includes(key))) fail('VALIDATION_ERROR', '身份目录参数无效。');
      const query = new URLSearchParams();
      if (options.limit !== undefined) {
        if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 200) fail('VALIDATION_ERROR', '身份目录数量无效。');
        query.set('limit', String(options.limit));
      }
      if (options.cursor !== undefined) {
        if (typeof options.cursor !== 'string' || !options.cursor || options.cursor.length > 2048) fail('VALIDATION_ERROR', '身份目录游标无效。');
        query.set('cursor', options.cursor);
      }
      return request(CLIENT_PATHS.identities + (query.size ? '?' + query : ''));
    },
    async getCatalog(platform) {
      if (!platforms.has(platform)) fail('VALIDATION_ERROR', '客户端平台无效。');
      return request(CLIENT_PATHS.catalog + '?platform=' + platform);
    },
    async getRelays() { return request(CLIENT_PATHS.relays); },
    async listDevices() { return request(CLIENT_PATHS.devices); },
    async createTunnelAuthorization() {
      const result = await request(CLIENT_PATHS.tunnelAuthorization, { method: 'POST', body: {}, expectedStatus: 201 });
      if (!object(result) || Object.keys(result).length !== 2
          || typeof result.authorizationHandle !== 'string' || !/^pah_[A-Za-z0-9_-]{43}$/.test(result.authorizationHandle)
          || !ISO(result.expiresAt) || result.expiresAt !== new Date(result.expiresAt).toISOString()) {
        fail('INVALID_RESPONSE', '连接授权格式无效。');
      }
      const raw = Buffer.from(result.authorizationHandle.slice(4), 'base64url');
      if (raw.length !== 32 || raw.toString('base64url') !== result.authorizationHandle.slice(4)) {
        fail('INVALID_RESPONSE', '连接授权格式无效。');
      }
      return result;
    },
    async getTunnelConfig() { return request(CLIENT_PATHS.tunnelConfig); },
    async heartbeat({ deviceId, clientVersion, configRevision = null, localProxyState = 'unknown', errorCode = null } = {}) {
      id(deviceId, '设备编号');
      if (typeof clientVersion !== 'string' || !/^[0-9A-Za-z.+_-]{1,64}$/.test(clientVersion)) fail('VALIDATION_ERROR', '客户端版本无效。');
      if (!validConfigRevision(configRevision)) fail('VALIDATION_ERROR', '配置版本无效。');
      if (!heartbeatStates.has(localProxyState) || !heartbeatError(errorCode)) fail('VALIDATION_ERROR', '本地代理状态无效。');
      return request(CLIENT_PATHS.tunnelHeartbeat, { method: 'POST', body: {
        deviceId, clientVersion: clientVersion.trim(), configRevision,
        localProxy: { host: LOCAL_PROXY.host, port: LOCAL_PROXY.port, state: localProxyState },
        errorCode: errorCode ?? null,
      } });
    },
    async getTunnelStatus() { return request(CLIENT_PATHS.tunnelStatus); },
    async syncTelemetry({ reportedAt, usageBuckets = [], events = [], latencySamples } = {}) {
      if (!ISO(reportedAt)) fail('VALIDATION_ERROR', '上报时间无效。');
      if (!Array.isArray(usageBuckets) || usageBuckets.length > 200 || !Array.isArray(events) || events.length > 100) {
        fail('VALIDATION_ERROR', '遥测批次数量超出限制。');
      }
      if (latencySamples !== undefined && (!Array.isArray(latencySamples) || latencySamples.length > 60)) {
        fail('VALIDATION_ERROR', '耗时采样批次数量超出限制。');
      }
      const cleanBuckets = usageBuckets.map(b => {
        if (!object(b)) fail('VALIDATION_ERROR', '用量桶格式无效。');
        const keys = Object.keys(b);
        if (keys.some(k => TELEMETRY_FORBIDDEN_KEYS.has(k))) fail('TELEMETRY_PRIVACY_VIOLATION', '遥测载荷包含禁止上传的本地隐私字段。');
        if (keys.length !== BUCKET_ALLOWED_KEYS.length || keys.some(k => !BUCKET_ALLOWED_KEYS.includes(k))) fail('VALIDATION_ERROR', '用量桶字段不在契约内。');
        if (typeof b.bucketDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.bucketDate)
          || typeof b.appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(b.appId)
          || typeof b.model !== 'string' || !b.model.trim() || b.model.length > 120 || /[\r\n]/.test(b.model)
          || !SESSION_TYPES.has(b.sessionType)) {
          fail('VALIDATION_ERROR', '用量桶维度无效。');
        }
        for (const numKey of ['sessions', 'turns', 'inputTokens', 'thinkingTokens', 'outputTokens', 'cacheTokens', 'totalTokens']) {
          if (!Number.isSafeInteger(b[numKey]) || b[numKey] < 0) fail('VALIDATION_ERROR', '用量桶计数无效。');
        }
        return {
          bucketDate: b.bucketDate, appId: b.appId, model: b.model.trim(), sessionType: b.sessionType,
          sessions: b.sessions, turns: b.turns, inputTokens: b.inputTokens,
          thinkingTokens: b.thinkingTokens, outputTokens: b.outputTokens, cacheTokens: b.cacheTokens, totalTokens: b.totalTokens,
        };
      });
      const cleanEvents = events.map(ev => {
        if (!object(ev)) fail('VALIDATION_ERROR', '运行事件格式无效。');
        const keys = Object.keys(ev);
        if (keys.some(k => TELEMETRY_FORBIDDEN_KEYS.has(k))) fail('TELEMETRY_PRIVACY_VIOLATION', '运行事件包含禁止上传的隐私字段。');
        if (EVENT_REQUIRED_KEYS.some(k => !Object.hasOwn(ev, k)) || keys.some(k => !EVENT_ALLOWED_KEY_SET.has(k))) fail('VALIDATION_ERROR', '运行事件字段不在契约内。');
        if (typeof ev.eventId !== 'string' || !ID.test(ev.eventId)
          || !ISO(ev.occurredAt)
          || !TELEMETRY_CATEGORIES.has(ev.category)
          || typeof ev.action !== 'string' || !/^[a-z0-9_.-]{1,64}$/i.test(ev.action)
          || (ev.appId !== null && (typeof ev.appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(ev.appId)))
          || (ev.environmentMode !== null && !['safe_tunnel', 'own_network'].includes(ev.environmentMode))
          || !TELEMETRY_STATUSES.has(ev.status)
          || !heartbeatError(ev.errorCode)
          || (ev.requestId !== null && !safeRequestId(ev.requestId))) {
          fail('VALIDATION_ERROR', '运行事件内容无效。');
        }
        const out = {
          eventId: ev.eventId, occurredAt: new Date(ev.occurredAt).toISOString(),
          category: ev.category, action: ev.action, appId: ev.appId,
          environmentMode: ev.environmentMode, status: ev.status,
          errorCode: ev.errorCode, requestId: ev.requestId,
        };
        if (ev.severity !== undefined && ev.severity !== null) {
          if (!TELEMETRY_SEVERITIES.has(ev.severity)) fail('VALIDATION_ERROR', '事件级别无效。');
          out.severity = ev.severity;
        }
        if (ev.fingerprint !== undefined && ev.fingerprint !== null) {
          if (typeof ev.fingerprint !== 'string' || !FINGERPRINT_RE.test(ev.fingerprint)) fail('VALIDATION_ERROR', '错误指纹无效。');
          out.fingerprint = ev.fingerprint;
        }
        if (ev.platform !== undefined && ev.platform !== null) {
          if (!platforms.has(ev.platform)) fail('VALIDATION_ERROR', '事件平台无效。');
          out.platform = ev.platform;
        }
        if (ev.appVersion !== undefined && ev.appVersion !== null) {
          if (!safeAppVersion(ev.appVersion)) fail('VALIDATION_ERROR', '事件版本无效。');
          out.appVersion = ev.appVersion.trim();
        }
        if (ev.stage !== undefined && ev.stage !== null) {
          if (!TELEMETRY_STAGES.has(ev.stage)) fail('VALIDATION_ERROR', '事件阶段无效。');
          out.stage = ev.stage;
        }
        if (ev.durationMs !== undefined && ev.durationMs !== null) {
          if (!safeDurationMs(ev.durationMs)) fail('VALIDATION_ERROR', '事件耗时无效。');
          out.durationMs = ev.durationMs;
        }
        if (ev.httpStatus !== undefined && ev.httpStatus !== null) {
          if (!safeHttpStatus(ev.httpStatus)) fail('VALIDATION_ERROR', '事件状态码无效。');
          out.httpStatus = ev.httpStatus;
        }
        if (ev.retryable !== undefined && ev.retryable !== null) {
          if (typeof ev.retryable !== 'boolean') fail('VALIDATION_ERROR', '事件重试标记无效。');
          out.retryable = ev.retryable;
        }
        return out;
      });
      const body = { reportedAt: new Date(reportedAt).toISOString(), usageBuckets: cleanBuckets, events: cleanEvents };
      if (latencySamples !== undefined) {
        body.latencySamples = latencySamples.map(sample => {
          if (!object(sample)) fail('VALIDATION_ERROR', '耗时采样格式无效。');
          const keys = Object.keys(sample);
          if (keys.some(k => TELEMETRY_FORBIDDEN_KEYS.has(k))) fail('TELEMETRY_PRIVACY_VIOLATION', '耗时采样包含禁止上传的隐私字段。');
          if (keys.some(k => !LATENCY_ALLOWED_KEY_SET.has(k))) fail('VALIDATION_ERROR', '耗时采样字段不在契约内。');
          if (typeof sample.sampleId !== 'string' || !SAMPLE_ID_RE.test(sample.sampleId)
            || !ISO(sample.sampledAt)
            || !LATENCY_TRIGGERS.has(sample.trigger)
            || !LATENCY_STATUSES.has(sample.status)) {
            fail('VALIDATION_ERROR', '耗时采样内容无效。');
          }
          const out = {
            sampleId: sample.sampleId,
            sampledAt: new Date(sample.sampledAt).toISOString(),
            trigger: sample.trigger,
            status: sample.status,
          };
          if (sample.platform !== undefined && sample.platform !== null) {
            if (!platforms.has(sample.platform)) fail('VALIDATION_ERROR', '耗时采样平台无效。');
            out.platform = sample.platform;
          }
          if (sample.appVersion !== undefined && sample.appVersion !== null) {
            if (!safeAppVersion(sample.appVersion)) fail('VALIDATION_ERROR', '耗时采样版本无效。');
            out.appVersion = sample.appVersion.trim();
          }
          if (sample.environmentMode !== undefined && sample.environmentMode !== null) {
            if (!['safe_tunnel', 'own_network'].includes(sample.environmentMode)) fail('VALIDATION_ERROR', '耗时采样模式无效。');
            out.environmentMode = sample.environmentMode;
          }
          for (const metricKey of ['clientToOriginMs', 'dnsMs', 'e2eTtfbMs', 'totalMs']) {
            const val = sample[metricKey];
            if (val !== undefined && val !== null) {
              if (!safeDurationMs(val)) fail('VALIDATION_ERROR', '耗时采样数值无效。');
              out[metricKey] = val;
            }
          }
          if (sample.errorCode !== undefined && sample.errorCode !== null) {
            if (!heartbeatError(sample.errorCode)) fail('VALIDATION_ERROR', '耗时采样错误码无效。');
            out.errorCode = sample.errorCode;
          }
          if (sample.requestId !== undefined && sample.requestId !== null) {
            if (!safeRequestId(sample.requestId)) fail('VALIDATION_ERROR', '耗时采样请求编号无效。');
            out.requestId = sample.requestId;
          }
          return out;
        });
      }
      return request(CLIENT_PATHS.telemetrySync, {
        method: 'POST',
        body,
      });
    },
    async listTickets({ status, limit } = {}) {
      const query = new URLSearchParams();
      if (status !== undefined && status !== null && status !== '' && status !== 'all') {
        if (!TICKET_STATUSES.has(status)) fail('VALIDATION_ERROR', '工单状态筛选无效。');
        query.set('status', status);
      }
      if (limit !== undefined) {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('VALIDATION_ERROR', '工单条数参数无效。');
        query.set('limit', String(limit));
      }
      return request(CLIENT_PATHS.tickets + (query.size ? `?${query}` : ''));
    },
    async createTicket({ subject, category, body, diagnosticSnapshot } = {}) {
      if (typeof subject !== 'string' || subject.trim().length < 2 || subject.trim().length > 160 || /[\r\n]/.test(subject)) {
        fail('VALIDATION_ERROR', '工单标题需为 2–160 个字符。');
      }
      if (!TICKET_CATEGORIES.has(category)) fail('VALIDATION_ERROR', '工单分类无效。');
      if (typeof body !== 'string' || body.trim().length < 1 || body.length > 8000) fail('VALIDATION_ERROR', '工单描述不能为空且不超过 8000 字符。');
      const payload = { subject: subject.trim(), category, body: body.trim() };
      if (diagnosticSnapshot !== undefined && diagnosticSnapshot !== null) {
        if (!object(diagnosticSnapshot) || Object.keys(diagnosticSnapshot).some(k => !SNAPSHOT_ALLOWED_KEYS.includes(k))) {
          fail('VALIDATION_ERROR', '诊断快照包含允许范围外字段。');
        }
        const snap = diagnosticSnapshot;
        if (typeof snap.appVersion !== 'string' || !snap.appVersion.trim() || snap.appVersion.length > 64
          || !platforms.has(snap.platform)
          || !['safe_tunnel', 'own_network'].includes(snap.environmentMode)
          || !['unknown', 'stopped', 'starting', 'running', 'degraded', 'failed', 'error', 'stopping'].includes(snap.proxyState)
          || !Array.isArray(snap.recentErrorCodes) || snap.recentErrorCodes.length > 20 || !snap.recentErrorCodes.every(c => typeof c === 'string' && /^[A-Z0-9_]{1,64}$/.test(c))
          || !Array.isArray(snap.recentRequestIds) || snap.recentRequestIds.length > 20 || !snap.recentRequestIds.every(r => safeRequestId(r))) {
          fail('VALIDATION_ERROR', '诊断快照内容格式无效。');
        }
        payload.diagnosticSnapshot = {
          appVersion: snap.appVersion.trim(),
          platform: snap.platform,
          environmentMode: snap.environmentMode,
          proxyState: snap.proxyState,
          recentErrorCodes: [...snap.recentErrorCodes],
          recentRequestIds: [...snap.recentRequestIds],
        };
      }
      return request(CLIENT_PATHS.tickets, { method: 'POST', body: payload, expectedStatus: 201 });
    },
    async getTicket(ticketId) {
      if (typeof ticketId !== 'string' || !TICKET_ID_RE.test(ticketId)) fail('VALIDATION_ERROR', '工单编号无效。');
      return request(`${CLIENT_PATHS.tickets}/${ticketId}`);
    },
    async replyTicket(ticketId, { body = '', action = 'reply' } = {}) {
      if (typeof ticketId !== 'string' || !TICKET_ID_RE.test(ticketId)) fail('VALIDATION_ERROR', '工单编号无效。');
      if (!TICKET_ACTIONS.has(action)) fail('VALIDATION_ERROR', '工单操作无效。');
      if (typeof body !== 'string' || body.length > 8000 || (action === 'reply' && !body.trim())) {
        fail('VALIDATION_ERROR', '回复内容不能为空。');
      }
      return request(`${CLIENT_PATHS.tickets}/${ticketId}/messages`, {
        method: 'POST',
        body: { body: body.trim(), action },
      });
    },
  });
}

export function normalizeTunnelStatus(payload) {
  if (!object(payload) || !['unknown', 'stopped', 'starting', 'running', 'degraded', 'revoked'].includes(payload.status)) fail('INVALID_RESPONSE', '隧道状态无效。');
  return Object.freeze({
    status: payload.status,
    desired: observedState(payload.desired),
    applied: observedState(payload.applied),
    observed: observedState(payload.observed),
    bindingRevision: revision(payload.bindingRevision),
    configRevision: Number.isSafeInteger(payload.configRevision) ? payload.configRevision : null,
    observedAt: dateOrNull(payload.observedAt),
    expiresAt: dateOrNull(payload.expiresAt),
    revoked: payload.revoked === true,
    health: ['known', 'unknown', 'degraded'].includes(payload.health) ? payload.health : 'unknown',
  });
}

