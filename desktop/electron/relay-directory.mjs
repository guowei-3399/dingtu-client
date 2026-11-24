const fail = (code, message) => Object.assign(new Error(message), { code });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 256) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const RELAY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MODEL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
export const RELAY_PROTOCOLS = Object.freeze(['anthropic', 'openai', 'openai-responses', 'gemini', 'xai']);
export const RELAY_STATUSES = Object.freeze(['active', 'maintenance', 'disabled']);

function validateHttpsBaseUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 512) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    return null;
  }
  return parsed.toString().replace(/\/$/, '');
}

/**
 * Validates and projects Operator-managed Dingtu Self-Hosted Relay Directory responses.
 * Never accepts raw API keys, tokens, or third-party credentials in directory payloads.
 */
export function projectRelayDirectory(payload) {
  if (!object(payload)) throw fail('INVALID_RESPONSE', '中转站目录返回格式无效。');
  const allowedTop = ['data_source', 'generatedAt', 'relays'];
  if (Object.keys(payload).some(key => !allowedTop.includes(key))) {
    throw fail('INVALID_RESPONSE', '中转站目录包含未知字段。');
  }
  if (payload.data_source !== 'real'
      || typeof payload.generatedAt !== 'string' || !Number.isFinite(Date.parse(payload.generatedAt))
      || !Array.isArray(payload.relays) || payload.relays.length > 64) {
    throw fail('INVALID_RESPONSE', '中转站目录数据无效。');
  }

  const seen = new Set();
  const relays = payload.relays.map(item => {
    if (!object(item)) throw fail('INVALID_RESPONSE', '中转站条目无效。');
    const allowedKeys = ['relayId', 'name', 'protocol', 'baseUrl', 'models', 'eligibleLevels', 'status', 'notes', 'updatedAt'];
    for (const key of Object.keys(item)) {
      if (/secret|token|password|api.?key|cookie|credential/i.test(key) || !allowedKeys.includes(key)) {
        throw fail('INVALID_RESPONSE', '中转站条目包含未授权字段。');
      }
    }
    if (!RELAY_ID_PATTERN.test(item.relayId || '') || seen.has(item.relayId)) {
      throw fail('INVALID_RESPONSE', '中转站标识无效或重复。');
    }
    seen.add(item.relayId);
    const baseUrl = validateHttpsBaseUrl(item.baseUrl);
    if (!text(item.name, 120) || !RELAY_PROTOCOLS.includes(item.protocol) || !baseUrl || !RELAY_STATUSES.includes(item.status)) {
      throw fail('INVALID_RESPONSE', '中转站基础配置无效。');
    }
    const models = item.models === undefined ? [] : item.models;
    if (!Array.isArray(models) || models.length > 128 || !models.every(model => typeof model === 'string' && MODEL_NAME_PATTERN.test(model))) {
      throw fail('INVALID_RESPONSE', '中转站模型清单无效。');
    }
    const eligibleLevels = item.eligibleLevels === undefined ? [] : item.eligibleLevels;
    if (!Array.isArray(eligibleLevels) || eligibleLevels.length > 16
        || !eligibleLevels.every(level => ['personal', 'silver', 'gold', 'enterprise'].includes(level))) {
      throw fail('INVALID_RESPONSE', '中转站套餐范围无效。');
    }
    const notes = item.notes === undefined || item.notes === null ? '' : item.notes;
    if (typeof notes !== 'string' || notes.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(notes)) {
      throw fail('INVALID_RESPONSE', '中转站说明文本无效。');
    }
    const updatedAt = item.updatedAt === undefined || item.updatedAt === null
      ? null
      : (typeof item.updatedAt === 'string' && Number.isFinite(Date.parse(item.updatedAt)) ? new Date(item.updatedAt).toISOString() : undefined);
    if (updatedAt === undefined) {
      throw fail('INVALID_RESPONSE', '中转站更新时间无效。');
    }
    return Object.freeze({
      relayId: item.relayId,
      name: item.name.trim(),
      protocol: item.protocol,
      baseUrl,
      models: Object.freeze([...new Set(models)]),
      eligibleLevels: Object.freeze([...new Set(eligibleLevels)]),
      status: item.status,
      notes,
      updatedAt,
    });
  });

  return Object.freeze({
    data_source: 'real',
    generatedAt: new Date(payload.generatedAt).toISOString(),
    relays: Object.freeze(relays),
  });
}

export function createRelayDirectoryCache() {
  let latest = null;
  function update(payload) {
    latest = projectRelayDirectory(payload);
    return latest;
  }
  function clear() {
    latest = null;
  }
  function resolveActiveRelay(relayId) {
    if (!latest || typeof relayId !== 'string') return null;
    const found = latest.relays.find(item => item.relayId === relayId && item.status === 'active');
    return found || null;
  }
  function snapshot() {
    return latest;
  }
  return Object.freeze({ update, clear, resolveActiveRelay, snapshot });
}
