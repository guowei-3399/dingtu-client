// Renderer-safe projection for responses returned by the fixed-path control client.
// This module deliberately copies a small contract allowlist. It must never be
// replaced with a generic JSON clone: catalogue templates are operator input.
import { projectRelayDirectory } from './relay-directory.mjs';
import { normalizeExitGeoContext } from './safe-environment.mjs';

const fail = (code, message = code) => Object.assign(new Error(message), { code });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 512, allowEmpty = false) => typeof value === 'string' && value.length <= max && (allowEmpty || value.length > 0) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const integer = value => Number.isSafeInteger(value);
const platformSet = new Set(['windows', 'macos', 'linux', 'ios', 'android']);
const statusSet = new Set(['verified', 'beta', 'unverified', 'hidden']);
const adapterSet = new Set(['env-launch', 'electron-launch', 'app-server', 'electron-profile', 'system-proxy', 'tun', 'pac', 'mobile-vpn-app-rule', 'https-web']);
const envKeys = new Set(['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'WS_PROXY', 'WSS_PROXY']);
const localPlaceholder = /^\{\{local\.(http|https|socks5|host|port|httpProxy|httpsProxy|socks5Proxy|noProxy)\}\}$/;
const accountModes = new Set(['none', 'config-dir', 'app-server-external-token', 'electron-profile']);
const rotations = new Set(['disabled', 'request-boundary']);
const restarts = new Set(['none', 'new-session', 'required']);
const categories = new Set(['coding', 'general', 'task']);
const logoMimes = new Set(['image/png', 'image/svg+xml']);

function ownKeys(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) throw fail('INVALID_RESPONSE', '服务返回的数据格式无效。');
}
function nullableText(value, max = 512) { return value === null || text(value, max); }
function projectionError() { throw fail('INVALID_RESPONSE', '服务返回的数据格式无效。'); }

function projectUser(user) {
  const allowed = ['id', 'email', 'displayName', 'customerType', 'level', 'memberRole', 'role', 'emailVerified', 'status'];
  ownKeys(user, [...allowed, 'accessToken', 'refreshToken', 'cookie', 'token']);
  if (!text(user.id, 200) || !text(user.email, 254) || !text(user.displayName, 120)
    || !['personal', 'enterprise'].includes(user.customerType) || ![null, 'silver', 'gold'].includes(user.level)
    || user.role !== 'customer' || !['owner', 'admin', 'member', null].includes(user.memberRole)
    || typeof user.emailVerified !== 'boolean' || user.status !== 'active') projectionError();
  return { id: user.id, email: user.email, displayName: user.displayName, customerType: user.customerType,
    level: user.level, memberRole: user.memberRole ?? null, role: 'customer', emailVerified: user.emailVerified, status: 'active' };
}

function projectMe(payload) {
  // A defensive server may accidentally include legacy sensitive keys. They
  // are accepted only so the projection can discard them; arbitrary keys are
  // still rejected before anything reaches renderer.
  ownKeys(payload, ['user', 'csrfToken', 'expiresAt', 'accessToken', 'cookie', 'refreshToken']);
  if (payload.csrfToken !== null && !text(payload.csrfToken, 4096)) projectionError();
  if (!date(payload.expiresAt)) projectionError();
  return { user: projectUser(payload.user), csrfToken: payload.csrfToken, expiresAt: new Date(payload.expiresAt).toISOString() };
}

function projectAccountRelay(value) {
  if (value === null || value === undefined) return undefined;
  const allowed = ['enabled', 'threshold5hPercent', 'threshold7dPercent', 'cooldownSeconds', 'maxAttemptsPerRequest', 'allowedProviders', 'allowTaskContinue'];
  ownKeys(value, allowed);
  if (typeof value.enabled !== 'boolean' || !integer(value.threshold5hPercent) || value.threshold5hPercent < 1 || value.threshold5hPercent > 100
    || !integer(value.threshold7dPercent) || value.threshold7dPercent < 1 || value.threshold7dPercent > 100
    || !integer(value.cooldownSeconds) || value.cooldownSeconds < 0 || value.cooldownSeconds > 86400
    || !integer(value.maxAttemptsPerRequest) || value.maxAttemptsPerRequest < 1 || value.maxAttemptsPerRequest > 10
    || !Array.isArray(value.allowedProviders) || value.allowedProviders.length > 32
    || !value.allowedProviders.every(provider => text(provider, 64) && /^[a-z][a-z0-9._-]*$/.test(provider))
    || typeof value.allowTaskContinue !== 'boolean') projectionError();
  return { enabled: value.enabled, threshold5hPercent: value.threshold5hPercent, threshold7dPercent: value.threshold7dPercent,
    cooldownSeconds: value.cooldownSeconds, maxAttemptsPerRequest: value.maxAttemptsPerRequest,
    allowedProviders: [...new Set(value.allowedProviders)], allowTaskContinue: value.allowTaskContinue };
}

function projectEntitlements(payload) {
  ownKeys(payload, ['data_source', 'customer', 'entitlement', 'applicationAccountSlotLimit', 'accountRelay']);
  if (payload.data_source !== undefined && payload.data_source !== 'real') projectionError();
  const customer = payload.customer;
  ownKeys(customer, ['id', 'type', 'level', 'memberRole']);
  if (!text(customer.id, 200) || !['personal', 'enterprise'].includes(customer.type) || ![null, 'silver', 'gold'].includes(customer.level ?? null)
    || !['owner', 'admin', 'member', null].includes(customer.memberRole)) projectionError();
  const entitlement = payload.entitlement;
  if (entitlement !== null) {
    ownKeys(entitlement, ['trafficQuotaBytes', 'trafficResetPeriod', 'effectiveTrafficQuotaBytes', 'expiresAt']);
    if (!(entitlement.trafficQuotaBytes === null || (integer(entitlement.trafficQuotaBytes) && entitlement.trafficQuotaBytes >= 0)) || !['monthly', null].includes(entitlement.trafficResetPeriod)
      || !(entitlement.effectiveTrafficQuotaBytes === null || (integer(entitlement.effectiveTrafficQuotaBytes) && entitlement.effectiveTrafficQuotaBytes >= 0))
      || !nullableText(entitlement.expiresAt, 100) || (entitlement.expiresAt !== null && !date(entitlement.expiresAt))) projectionError();
  }
  if (customer.memberRole === 'member' && entitlement !== null) projectionError();
  const output = { data_source: 'real', customer: { id: customer.id, type: customer.type, level: customer.level ?? null, memberRole: customer.memberRole ?? null },
    entitlement: entitlement === null ? null : { trafficQuotaBytes: entitlement.trafficQuotaBytes, trafficResetPeriod: entitlement.trafficResetPeriod,
      effectiveTrafficQuotaBytes: entitlement.effectiveTrafficQuotaBytes, expiresAt: entitlement.expiresAt } };
  if (payload.applicationAccountSlotLimit !== undefined) {
    if (!integer(payload.applicationAccountSlotLimit) || payload.applicationAccountSlotLimit < 0 || payload.applicationAccountSlotLimit > 1000) projectionError();
    output.applicationAccountSlotLimit = payload.applicationAccountSlotLimit;
  }
  const relay = projectAccountRelay(payload.accountRelay); if (relay !== undefined) output.accountRelay = relay;
  return output;
}

function projectMembers(payload) {
  ownKeys(payload, ['data_source', 'members']);
  if (payload.data_source !== undefined && payload.data_source !== 'real') projectionError();
  if (!Array.isArray(payload.members) || payload.members.length > 200) projectionError();
  const members = payload.members.map(member => {
    ownKeys(member, ['userId', 'email', 'displayName', 'role', 'status', 'revision', 'joinedAt']);
    if (!text(member.userId, 200) || !nullableText(member.email, 254) || !nullableText(member.displayName, 120) || !['owner', 'admin', 'member'].includes(member.role)
      || !['active', 'disabled'].includes(member.status) || !integer(member.revision) || member.revision < 0 || !date(member.joinedAt)) projectionError();
    return { userId: member.userId, email: member.email, displayName: member.displayName, role: member.role, status: member.status,
      revision: member.revision, joinedAt: new Date(member.joinedAt).toISOString() };
  });
  return { data_source: 'real', members };
}

function projectIdentities(payload) {
  ownKeys(payload, ['data_source', 'identities', 'nextCursor']);
  if (payload.data_source !== undefined && payload.data_source !== 'real') projectionError();
  if (!Array.isArray(payload.identities) || payload.identities.length > 200 || !(payload.nextCursor === null || text(payload.nextCursor, 2048))) projectionError();
  const identities = payload.identities.map(item => {
    ownKeys(item, [
      'id', 'userId', 'displayName', 'desiredStatus',
      'appliedStatus', 'observedStatus', 'bindingRevision', 'configRevision',
      'lastObservedAt', 'health', 'createdAt',
      'revision', 'credential', 'subscription', 'updatedAt',
    ]);
    if (!text(item.id, 200) || !text(item.userId, 200) || !text(item.displayName, 200) || !['active', 'provision_pending', 'suspended'].includes(item.desiredStatus)
      || !['active', 'provision_pending', 'suspended', 'unknown'].includes(item.appliedStatus ?? 'unknown')
      || !['active', 'provision_pending', 'suspended', 'unknown'].includes(item.observedStatus ?? 'unknown')
      || !['known', 'unknown'].includes(item.health ?? 'unknown') || !date(item.createdAt)
      || !(item.bindingRevision === undefined || item.bindingRevision === null || text(item.bindingRevision, 128))
      || !(item.configRevision === undefined || item.configRevision === null || integer(item.configRevision) || text(item.configRevision, 128))
      || !(item.lastObservedAt === undefined || item.lastObservedAt === null || date(item.lastObservedAt))
      || !(item.revision === undefined || (integer(item.revision) && item.revision >= 0))
      || !(item.updatedAt === undefined || item.updatedAt === null || date(item.updatedAt))) projectionError();
    if (item.credential !== undefined && item.credential !== null) {
      ownKeys(item.credential, ['version', 'protocol', 'status', 'fingerprint', 'delivered']);
      if (!integer(item.credential.version) || item.credential.version < 1
        || !text(item.credential.protocol, 64)
        || !text(item.credential.status, 64)
        || !nullableText(item.credential.fingerprint, 256)
        || typeof item.credential.delivered !== 'boolean') projectionError();
    }
    if (item.subscription !== undefined && item.subscription !== null) {
      ownKeys(item.subscription, ['active', 'expiresAt']);
      if (typeof item.subscription.active !== 'boolean'
        || !(item.subscription.expiresAt === null || date(item.subscription.expiresAt))) projectionError();
    }
    return { id: item.id, userId: item.userId, displayName: item.displayName, desiredStatus: item.desiredStatus,
      appliedStatus: item.appliedStatus ?? 'unknown', observedStatus: item.observedStatus ?? 'unknown', bindingRevision: item.bindingRevision ?? null,
      configRevision: item.configRevision ?? (integer(item.revision) ? item.revision : null), lastObservedAt: item.lastObservedAt ? new Date(item.lastObservedAt).toISOString() : null,
      health: item.health ?? 'unknown', createdAt: new Date(item.createdAt).toISOString() };
  });
  if (new Set(identities.map(item => item.id)).size !== identities.length) projectionError();
  return { data_source: 'real', identities, nextCursor: payload.nextCursor ?? null };
}

function projectTemplate(template) {
  if (template === null) return null;
  const allowed = ['status', 'adapter', 'templateRevision', 'detect', 'launch', 'account', 'packageName', 'openUri', 'verifiedAt', 'verifiedClientVersion', 'notes'];
  ownKeys(template, [...allowed, 'secret', 'password', 'token', 'credentials']);
  if (!statusSet.has(template.status) || !adapterSet.has(template.adapter) || !integer(template.templateRevision) || template.templateRevision < 1 || !text(template.notes, 6000, true)) projectionError();
  let detect = null;
  if (template.detect !== null && template.detect !== undefined) {
    ownKeys(template.detect, ['kind', 'names']);
    if (!['executable', 'bundle', 'package'].includes(template.detect.kind) || !Array.isArray(template.detect.names) || template.detect.names.length > 32
      || !template.detect.names.every(value => text(value, 160) && !/[\r\n]/.test(value))) projectionError();
    detect = { kind: template.detect.kind, names: [...template.detect.names] };
  }
  let launch = null;
  if (template.launch !== null && template.launch !== undefined) {
    ownKeys(template.launch, ['kind', 'argv', 'env']);
    if (template.launch.kind !== 'exec' || !Array.isArray(template.launch.argv) || template.launch.argv.length < 1 || template.launch.argv.length > 64
      || !template.launch.argv.every(value => text(value, 200) && !/[\s\r\n]/.test(value))) projectionError();
    if (!object(template.launch.env)) projectionError();
    const safeEnv = {};
    for (const [key, value] of Object.entries(template.launch.env)) {
      if (!envKeys.has(key)) continue;
      if (!localPlaceholder.test(value)) projectionError();
      safeEnv[key] = value;
    }
    launch = { kind: 'exec', argv: [...template.launch.argv], env: safeEnv };
  }
  let account = null;
  if (template.account !== null && template.account !== undefined) {
    ownKeys(template.account, ['provider', 'mode', 'rotation', 'restart']);
    if (!text(template.account.provider, 64) || !/^[a-z][a-z0-9._-]*$/.test(template.account.provider) || !accountModes.has(template.account.mode)
      || !rotations.has(template.account.rotation) || !restarts.has(template.account.restart)) projectionError();
    if (template.account.mode === 'none' && (template.account.rotation !== 'disabled' || template.account.restart !== 'none')) projectionError();
    account = { provider: template.account.provider, mode: template.account.mode, rotation: template.account.rotation, restart: template.account.restart };
  }
  if (template.packageName !== null && template.packageName !== undefined && (!text(template.packageName, 200) || /[\s/\\]/.test(template.packageName))) projectionError();
  if (template.openUri !== null && template.openUri !== undefined) { try { const uri = new URL(template.openUri); if (uri.protocol !== 'https:' || uri.username || uri.password || uri.search || uri.hash) projectionError(); } catch { projectionError(); } }
  if (template.verifiedAt !== null && template.verifiedAt !== undefined && !date(template.verifiedAt)) projectionError();
  if (template.verifiedClientVersion !== null && template.verifiedClientVersion !== undefined && !text(template.verifiedClientVersion, 80)) projectionError();
  if (template.status === 'verified' && (!template.verifiedAt || !template.verifiedClientVersion)) projectionError();
  return { status: template.status, adapter: template.adapter, templateRevision: template.templateRevision, detect, launch, account,
    packageName: template.packageName ?? null, openUri: template.openUri ?? null, verifiedAt: template.verifiedAt ? new Date(template.verifiedAt).toISOString() : null,
    verifiedClientVersion: template.verifiedClientVersion ?? null, notes: template.notes };
}

function safeDownloadHref(raw) {
  if (raw === null || raw === undefined) return null;
  if (!text(raw, 1024)) projectionError();
  if (raw.startsWith('/downloads/')) {
    if (/[?#\s\\]|\.\./.test(raw)) projectionError();
    return raw;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) projectionError();
    return parsed.toString();
  } catch {
    projectionError();
  }
}

function projectClientRelease(raw) {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (!object(raw)) projectionError();
  for (const key of Object.keys(raw)) {
    if (/secret|token|password|api.?key|cookie|credential/i.test(key) || !['minimumVersion', 'updateUrl', 'latest'].includes(key)) {
      projectionError();
    }
  }
  const minimumVersion = raw.minimumVersion === null || raw.minimumVersion === undefined
    ? null
    : (text(raw.minimumVersion, 64) ? raw.minimumVersion : projectionError());
  const updateUrl = safeDownloadHref(raw.updateUrl);
  let latest = null;
  if (raw.latest !== null && raw.latest !== undefined) {
    if (!object(raw.latest)) projectionError();
    const allowedLatest = ['href', 'filename', 'version', 'channel', 'arch', 'commit', 'buttonLabel', 'bytes', 'sizeLabel', 'sha256', 'publishedAt'];
    for (const key of Object.keys(raw.latest)) {
      if (/secret|token|password|api.?key|cookie|credential/i.test(key) || !allowedLatest.includes(key)) {
        projectionError();
      }
    }
    const item = raw.latest;
    latest = {
      href: safeDownloadHref(item.href),
      filename: nullableText(item.filename ?? null, 256) ? (item.filename ?? null) : projectionError(),
      version: nullableText(item.version ?? null, 64) ? (item.version ?? null) : projectionError(),
      channel: nullableText(item.channel ?? null, 32) ? (item.channel ?? null) : projectionError(),
      arch: nullableText(item.arch ?? null, 32) ? (item.arch ?? null) : projectionError(),
      commit: nullableText(item.commit ?? null, 64) ? (item.commit ?? null) : projectionError(),
      buttonLabel: nullableText(item.buttonLabel ?? null, 64) ? (item.buttonLabel ?? null) : projectionError(),
      bytes: item.bytes === null || item.bytes === undefined ? null : (integer(item.bytes) && item.bytes >= 0 ? item.bytes : projectionError()),
      sizeLabel: nullableText(item.sizeLabel ?? null, 64) ? (item.sizeLabel ?? null) : projectionError(),
      sha256: item.sha256 === null || item.sha256 === undefined ? null : (/^[0-9a-f]{64}$/i.test(item.sha256) ? item.sha256.toLowerCase() : projectionError()),
      publishedAt: item.publishedAt === null || item.publishedAt === undefined ? null : (date(item.publishedAt) ? new Date(item.publishedAt).toISOString() : projectionError()),
    };
  }
  return { minimumVersion, updateUrl, latest };
}

function projectCatalog(payload) {
  ownKeys(payload, ['data_source', 'catalogRevision', 'generatedAt', 'checksum', 'platform', 'apps', 'clientRelease']);
  const rawRevision = payload.catalogRevision;
  const catalogRevision = typeof rawRevision === 'string' && /^[1-9][0-9]{0,15}$/.test(rawRevision)
    ? Number(rawRevision)
    : rawRevision;
  if (payload.data_source !== 'real' || !integer(catalogRevision) || catalogRevision < 1 || !date(payload.generatedAt)
    || typeof payload.checksum !== 'string' || !/^[0-9a-f]{64}$/.test(payload.checksum) || !platformSet.has(payload.platform)
    || !Array.isArray(payload.apps) || payload.apps.length > 200) projectionError();
  const apps = payload.apps.map(item => {
    ownKeys(item, ['appId', 'name', 'category', 'featured', 'officialUrl', 'logo', 'platforms']);
    if (!text(item.appId, 64) || !/^[a-z0-9-]+$/.test(item.appId) || !text(item.name, 160) || !categories.has(item.category) || typeof item.featured !== 'boolean'
      || !object(item.logo) || !text(item.logo.assetId, 64) || !/^[a-z0-9-]+$/.test(item.logo.assetId) || !/^[0-9a-f]{64}$/.test(item.logo.sha256) || !logoMimes.has(item.logo.mime)
      || !object(item.platforms)) projectionError();
    try { const uri = new URL(item.officialUrl); if (uri.protocol !== 'https:' || uri.username || uri.password || uri.search || uri.hash) projectionError(); } catch { projectionError(); }
    const template = projectTemplate(item.platforms[payload.platform]);
    if (template === undefined) projectionError();
    return { appId: item.appId, name: item.name, category: item.category, featured: item.featured, officialUrl: item.officialUrl,
      logo: { assetId: item.logo.assetId, sha256: item.logo.sha256, mime: item.logo.mime }, platforms: { [payload.platform]: template } };
  });
  if (new Set(apps.map(item => item.id ?? item.appId)).size !== apps.length) projectionError();
  const clientRelease = projectClientRelease(payload.clientRelease);
  const output = { data_source: 'real', catalogRevision, generatedAt: new Date(payload.generatedAt).toISOString(), checksum: payload.checksum,
    platform: payload.platform, apps };
  if (clientRelease !== undefined) output.clientRelease = clientRelease;
  return output;
}

function projectExitContext(raw) {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  try {
    const normalized = normalizeExitGeoContext(raw);
    return {
      countryCode: normalized.countryCode,
      timezone: normalized.timezone,
      locale: normalized.locale,
      regionLabel: normalized.regionLabel,
    };
  } catch {
    projectionError();
  }
}

function projectOverview(payload) {
  const allowed = ['data_source', 'generatedAt', 'customer', 'subscription', 'devices', 'egress', 'identities', 'identitiesTotal', 'identitiesTruncated', 'exitContext'];
  ownKeys(payload, allowed);
  if (payload.data_source !== 'real' || !date(payload.generatedAt) || !object(payload.customer) || !text(payload.customer.id, 200)
    || !['personal', 'enterprise'].includes(payload.customer.type) || !['owner', 'admin', 'member'].includes(payload.customer.role)) projectionError();
  for (const key of ['subscription', 'devices', 'egress']) {
    if (!object(payload[key])) projectionError();
  }
  const status = new Set(['known', 'unknown', 'stale', 'unavailable']);
  if (!status.has(payload.subscription.status) || !status.has(payload.devices.status) || !status.has(payload.egress.status) || payload.egress.binding !== 'server') projectionError();
  const count = value => value === null || (integer(value) && value >= 0);
  const sub = payload.subscription, devices = payload.devices, egress = payload.egress;
  if (![sub.primaryIpQuota, sub.standbyIpQuota, devices.authorized, devices.online, devices.limit, egress.primaryAllocated, egress.standbyAllocated].every(count)
    || !(sub.expiresAt === null || date(sub.expiresAt)) || !integer(payload.identitiesTotal) || payload.identitiesTotal < 0
    || typeof payload.identitiesTruncated !== 'boolean' || !Array.isArray(payload.identities) || payload.identities.length > 64) projectionError();
  const identities = projectOverviewIdentities(payload.identities);
  if (identities.length > payload.identitiesTotal || payload.identitiesTruncated !== (payload.identitiesTotal > identities.length)) projectionError();
  const exitContext = projectExitContext(payload.exitContext);
  const output = { data_source: 'real', generatedAt: new Date(payload.generatedAt).toISOString(), customer: { id: payload.customer.id, type: payload.customer.type, role: payload.customer.role },
    subscription: { status: sub.status, primaryIpQuota: sub.primaryIpQuota, standbyIpQuota: sub.standbyIpQuota, expiresAt: sub.expiresAt },
    devices: { status: devices.status, authorized: devices.authorized, online: devices.online, limit: devices.limit },
    egress: { status: egress.status, binding: 'server', primaryAllocated: egress.primaryAllocated, standbyAllocated: egress.standbyAllocated },
    identities, identitiesTotal: payload.identitiesTotal, identitiesTruncated: payload.identitiesTruncated };
  if (exitContext !== undefined) output.exitContext = exitContext;
  return output;
}
function projectOverviewIdentities(list) {
  return list.map(item => {
    ownKeys(item, ['id', 'assignedUserId', 'displayName', 'status', 'createdAt']);
    if (!text(item.id, 200) || !text(item.assignedUserId, 200) || !text(item.displayName, 200) || !['active', 'provision_pending', 'suspended'].includes(item.status) || !date(item.createdAt)) projectionError();
    return { id: item.id, assignedUserId: item.assignedUserId, displayName: item.displayName, status: item.status, createdAt: new Date(item.createdAt).toISOString() };
  });
}

export function projectClientRead(kind, payload) {
  switch (kind) {
    case 'me': return projectMe(payload);
    case 'entitlements': return projectEntitlements(payload);
    case 'members': return projectMembers(payload);
    case 'identities': return projectIdentities(payload);
    case 'catalog': return projectCatalog(payload);
    case 'relays': return projectRelayDirectory(payload);
    case 'overview': return projectOverview(payload);
    case 'devices':
      ownKeys(payload, ['devices']); if (!Array.isArray(payload.devices) || payload.devices.length > 200) projectionError();
      return { devices: payload.devices.map(device => {
        ownKeys(device, ['id', 'deviceName', 'platform', 'appVersion', 'createdAt', 'lastSeenAt', 'revokedAt', 'identityId', 'proxyState']);
        if (!text(device.id, 200) || !platformSet.has(device.platform) || !text(device.appVersion, 64) || !date(device.createdAt)
          || !(device.lastSeenAt === null || date(device.lastSeenAt)) || !(device.revokedAt === null || date(device.revokedAt))) projectionError();
        return { id: device.id, platform: device.platform, appVersion: device.appVersion, status: device.revokedAt === null ? 'active' : 'revoked',
          createdAt: new Date(device.createdAt).toISOString(), lastHeartbeatAt: device.lastSeenAt ? new Date(device.lastSeenAt).toISOString() : null };
      }) };
    case 'tunnelStatus': {
      ownKeys(payload, ['status', 'desired', 'applied', 'observed', 'observedAt', 'configRevision', 'bindingRevision', 'health', 'revoked', 'device', 'exitContext']);
      const health = payload.health ?? 'unknown';
      const revoked = payload.revoked ?? false;
      if (!['unknown', 'stopped', 'starting', 'running', 'degraded', 'revoked'].includes(payload.status) || !['unknown', 'active', 'stopped', 'degraded'].includes(payload.desired) || !['unknown', 'active', 'stopped', 'degraded'].includes(payload.applied) || !['unknown', 'active', 'stopped', 'degraded'].includes(payload.observed) || !['known', 'unknown', 'degraded'].includes(health) || !(payload.observedAt === null || payload.observedAt === undefined || date(payload.observedAt)) || !(payload.configRevision === null || payload.configRevision === undefined || integer(payload.configRevision) || text(payload.configRevision, 128)) || !(payload.bindingRevision === null || payload.bindingRevision === undefined || text(payload.bindingRevision, 128)) || typeof revoked !== 'boolean') projectionError();
      const exitContext = projectExitContext(payload.exitContext);
      const output = { status: payload.status, desired: payload.desired, applied: payload.applied, observed: payload.observed, observedAt: payload.observedAt ? new Date(payload.observedAt).toISOString() : null, configRevision: payload.configRevision ?? null, bindingRevision: payload.bindingRevision ?? null, health, revoked, device: null };
      if (exitContext !== undefined) output.exitContext = exitContext;
      return output;
    }
    default: throw fail('INVALID_RESPONSE', '服务返回的数据格式无效。');
  }
}

export function projectAuthSnapshot(value) {
  if (!object(value) || !['authenticated', 'signed_out'].includes(value.status) || !platformSet.has(value.platform)) projectionError();
  const output = { status: value.status, platform: value.platform, device: null };
  if (value.device !== null) {
    ownKeys(value.device, ['id', 'platform', 'appVersion', 'status', 'createdAt']);
    if (!text(value.device.id, 200) || !platformSet.has(value.device.platform) || !text(value.device.appVersion, 64) || value.device.status !== 'active' || !date(value.device.createdAt)) projectionError();
    output.device = { id: value.device.id, platform: value.device.platform, appVersion: value.device.appVersion, status: value.device.status, createdAt: new Date(value.device.createdAt).toISOString() };
  }
  if (value.status === 'authenticated' && value.accessExpiresAt !== undefined && !date(value.accessExpiresAt)) projectionError();
  if (value.status === 'authenticated' && value.accessExpiresAt !== undefined) output.accessExpiresAt = new Date(value.accessExpiresAt).toISOString();
  return output;
}

const ticketStatuses = new Set(['submitted', 'acknowledged', 'investigating', 'waiting_user', 'awaiting_ops', 'awaiting_production', 'resolved', 'closed', 'reopened']);
const ticketCategories = new Set(['connection', 'exit_ip', 'workbench_app', 'account_billing', 'other']);
const ticketPriorities = new Set(['normal', 'high', 'urgent']);
const ticketAuthorRoles = new Set(['customer', 'ops', 'system']);

export function projectTelemetrySyncResult(payload) {
  ownKeys(payload, ['acceptedBuckets', 'acceptedEvents', 'acceptedLatencySamples', 'syncedAt']);
  const acceptedLatencySamples = payload.acceptedLatencySamples === undefined ? 0 : payload.acceptedLatencySamples;
  if (!integer(payload.acceptedBuckets) || payload.acceptedBuckets < 0
    || !integer(payload.acceptedEvents) || payload.acceptedEvents < 0
    || !integer(acceptedLatencySamples) || acceptedLatencySamples < 0
    || !date(payload.syncedAt)) {
    projectionError();
  }
  return {
    acceptedBuckets: payload.acceptedBuckets,
    acceptedEvents: payload.acceptedEvents,
    acceptedLatencySamples,
    syncedAt: new Date(payload.syncedAt).toISOString(),
  };
}

function projectTicketRow(item) {
  ownKeys(item, ['ticketId', 'subject', 'category', 'priority', 'status', 'incidentId', 'deviceId', 'userReportId', 'unreadByCustomer', 'lastMessageAt', 'createdAt', 'updatedAt']);
  if (!text(item.ticketId, 64) || !text(item.subject, 200)
    || !ticketCategories.has(item.category)
    || !(item.priority === undefined || ticketPriorities.has(item.priority))
    || !ticketStatuses.has(item.status)
    || !(item.incidentId === undefined || item.incidentId === null || text(item.incidentId, 128))
    || !(item.deviceId === undefined || item.deviceId === null || text(item.deviceId, 200))
    || !(item.userReportId === undefined || item.userReportId === null || text(item.userReportId, 128))
    || !(item.unreadByCustomer === undefined || typeof item.unreadByCustomer === 'boolean')
    || !(item.lastMessageAt === undefined || item.lastMessageAt === null || date(item.lastMessageAt))
    || !date(item.createdAt) || !date(item.updatedAt)) {
    projectionError();
  }
  return {
    ticketId: item.ticketId,
    subject: item.subject,
    category: item.category,
    priority: item.priority ?? 'normal',
    status: item.status,
    incidentId: item.incidentId ?? null,
    deviceId: item.deviceId ?? null,
    userReportId: item.userReportId ?? null,
    unreadByCustomer: Boolean(item.unreadByCustomer),
    lastMessageAt: item.lastMessageAt ? new Date(item.lastMessageAt).toISOString() : null,
    createdAt: new Date(item.createdAt).toISOString(),
    updatedAt: new Date(item.updatedAt).toISOString(),
  };
}

function projectTicketMessage(msg) {
  ownKeys(msg, ['messageId', 'authorRole', 'authorName', 'body', 'createdAt']);
  if (!text(msg.messageId, 128) || !ticketAuthorRoles.has(msg.authorRole)
    || !(msg.authorName === undefined || msg.authorName === null || text(msg.authorName, 120, true))
    || !text(msg.body, 8000, true) || !date(msg.createdAt)) {
    projectionError();
  }
  return {
    messageId: msg.messageId,
    authorRole: msg.authorRole,
    authorName: msg.authorName ?? null,
    body: msg.body,
    createdAt: new Date(msg.createdAt).toISOString(),
  };
}

export function projectTicketList(payload) {
  ownKeys(payload, ['data_source', 'tickets']);
  if ((payload.data_source !== undefined && payload.data_source !== 'real')
    || !Array.isArray(payload.tickets) || payload.tickets.length > 100) {
    projectionError();
  }
  return {
    data_source: 'real',
    tickets: payload.tickets.map(projectTicketRow),
  };
}

export function projectTicketDetail(payload) {
  ownKeys(payload, ['data_source', 'ticket', 'diagnosticSnapshot', 'messages']);
  if ((payload.data_source !== undefined && payload.data_source !== 'real')
    || !Array.isArray(payload.messages) || payload.messages.length > 500) {
    projectionError();
  }
  let diagnosticSnapshot = null;
  if (payload.diagnosticSnapshot !== null && payload.diagnosticSnapshot !== undefined) {
    const snap = payload.diagnosticSnapshot;
    ownKeys(snap, ['appVersion', 'platform', 'environmentMode', 'proxyState', 'recentErrorCodes', 'recentRequestIds']);
    if (!nullableText(snap.appVersion ?? null, 64)
      || (snap.platform !== undefined && snap.platform !== null && !platformSet.has(snap.platform))
      || (snap.environmentMode !== undefined && snap.environmentMode !== null && !['safe_tunnel', 'own_network'].includes(snap.environmentMode))
      || (snap.proxyState !== undefined && snap.proxyState !== null && !text(snap.proxyState, 32))
      || (snap.recentErrorCodes !== undefined && (!Array.isArray(snap.recentErrorCodes) || snap.recentErrorCodes.some(c => !text(c, 64))))
      || (snap.recentRequestIds !== undefined && (!Array.isArray(snap.recentRequestIds) || snap.recentRequestIds.some(r => !text(r, 128))))) {
      projectionError();
    }
    diagnosticSnapshot = {
      appVersion: snap.appVersion ?? null,
      platform: snap.platform ?? null,
      environmentMode: snap.environmentMode ?? null,
      proxyState: snap.proxyState ?? null,
      recentErrorCodes: Array.isArray(snap.recentErrorCodes) ? [...snap.recentErrorCodes] : [],
      recentRequestIds: Array.isArray(snap.recentRequestIds) ? [...snap.recentRequestIds] : [],
    };
  }
  return {
    data_source: 'real',
    ticket: projectTicketRow(payload.ticket),
    diagnosticSnapshot,
    messages: payload.messages.map(projectTicketMessage),
  };
}

export function projectTicketMutation(payload) {
  ownKeys(payload, ['ticket', 'message']);
  return {
    ticket: projectTicketRow(payload.ticket),
    message: payload.message ? projectTicketMessage(payload.message) : null,
  };
}
