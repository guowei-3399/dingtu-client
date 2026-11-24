import { LOCAL_PROXY } from './runtime-contract.mjs';

const fail = (code, message = code) => Object.assign(new Error(message), { code });
const aliasPattern = /^[a-z][a-z0-9_-]{0,31}$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const relayIdPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const adapters = new Set(['env-launch', 'electron-launch']);
const statuses = new Set(['verified', 'beta']);
const accountModes = new Set(['none', 'config-dir', 'app-server-external-token', 'electron-profile']);
const rotations = new Set(['disabled', 'request-boundary']);
const restarts = new Set(['none', 'new-session', 'required']);
const proxyPlaceholders = /^\{\{local\.(http|https|socks5|host|port)\}\}$/;
const shellLike = value => /^(?:sh|bash|zsh|fish|cmd|cmd\.exe|powershell|pwsh)(?:\s|$)/i.test(value);
const clone = value => structuredClone(value);
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\0\r\n]/.test(value);

function validateAccount(account) {
  if (account == null) return null;
  if (!account || typeof account !== 'object' || Array.isArray(account) || !text(account.provider, 64) || !/^[a-z][a-z0-9._-]*$/.test(account.provider)
    || !accountModes.has(account.mode) || !rotations.has(account.rotation) || !restarts.has(account.restart)) throw fail('PROFILE_TEMPLATE_INVALID');
  if (account.mode === 'none' && (account.rotation !== 'disabled' || account.restart !== 'none')) throw fail('PROFILE_TEMPLATE_INVALID');
  return { provider: account.provider, mode: account.mode, rotation: account.rotation, restart: account.restart };
}

function validateApp(app) {
  if (!app || typeof app !== 'object' || Array.isArray(app) || !idPattern.test(app.appId) || !text(app.name, 160)
    || !text(app.platform, 16) || !statuses.has(app.platformStatus) || !adapters.has(app.template?.adapter) || app.template.status !== app.platformStatus
    || !Number.isSafeInteger(app.template.templateRevision) || app.template.templateRevision < 1) throw fail('PROFILE_APP_NOT_READY');
  const template = app.template;
  if (!template.launch || template.launch.kind !== 'exec' || !Array.isArray(template.launch.argv) || !template.launch.argv.length
    || shellLike(template.launch.argv[0]) || !template.launch.argv.every(value => text(value, 200) && !/[\s\0]/.test(value))) throw fail('PROFILE_TEMPLATE_INVALID');
  const env = template.launch.env;
  if (!env || typeof env !== 'object' || Array.isArray(env) || Object.keys(env).some(key => !['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'WS_PROXY', 'WSS_PROXY'].includes(key)
    || typeof env[key] !== 'string' || !proxyPlaceholders.test(env[key]))) throw fail('PROFILE_TEMPLATE_INVALID');
  const account = validateAccount(template.account);
  return { appId: app.appId, name: app.name, platform: app.platform, status: app.platformStatus, templateRevision: template.templateRevision, adapter: template.adapter, argv: [...template.launch.argv], env: { ...env }, account };
}

function validateSlots(values) {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.length > 32 || new Set(values).size !== values.length || !values.every(value => idPattern.test(value))) throw fail('PROFILE_SLOT_REFERENCE_INVALID');
  return [...values];
}

function validateRelayId(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string' || !relayIdPattern.test(value)) throw fail('PROFILE_RELAY_INVALID', '所选中转站标识无效。');
  return value;
}

export function buildAgentProfile({ alias, app, credentialSlotIds, relayId, now = Date.now } = {}) {
  if (typeof alias !== 'string' || !aliasPattern.test(alias)) throw fail('PROFILE_ALIAS_INVALID', '应用名称只能使用小写字母、数字、下划线或短横线。');
  const source = validateApp(app);
  const slots = validateSlots(credentialSlotIds);
  const checkedRelay = validateRelayId(relayId);
  const account = source.account;
  if (account && account.mode !== 'none' && slots.length === 0) throw fail('PROFILE_SLOT_REQUIRED');
  const timestamp = new Date(typeof now === 'function' ? now() : now).toISOString();
  const profile = {
    version: 1, id: alias, alias, appId: source.appId, appName: source.name, platform: source.platform,
    templateRevision: source.templateRevision, adapter: source.adapter, account: account ? clone(account) : null, credentialSlotIds: slots,
    status: 'ready', createdAt: timestamp, updatedAt: timestamp,
  };
  if (checkedRelay !== undefined) profile.relayId = checkedRelay;
  return Object.freeze(profile);
}

function localValue(name) {
  return { http: LOCAL_PROXY.http, https: LOCAL_PROXY.http, socks5: LOCAL_PROXY.socks5, host: LOCAL_PROXY.host, port: String(LOCAL_PROXY.port) }[name];
}

export function materializeAgentProfile(profile, app) {
  if (!profile || typeof profile !== 'object' || !aliasPattern.test(profile.id) || profile.alias !== profile.id || profile.appId !== app?.appId) throw fail('PROFILE_INVALID');
  const source = validateApp(app);
  if (profile.templateRevision !== source.templateRevision || profile.adapter !== source.adapter) throw fail('PROFILE_TEMPLATE_UPDATE_REQUIRED');
  const args = source.argv.slice(1).map(value => value.replace(/\{\{local\.([a-z]+)\}\}/g, (_match, name) => localValue(name) ?? fail('PROFILE_TEMPLATE_INVALID')));
  const env = Object.fromEntries(Object.entries(source.env).map(([key, value]) => [key, localValue(value.match(proxyPlaceholders)[1])]));
  return Object.freeze({ appId: source.appId, profileId: profile.id, adapter: source.adapter, activation: source.adapter === 'electron-launch' ? 'restart-required' : 'immediate', command: source.argv[0], args, env, credentialSlotIds: [...profile.credentialSlotIds] });
}

export function createAgentProfileStore() {
  const profiles = new Map();
  function create(profile) {
    if (!profile || !aliasPattern.test(profile.id)) throw fail('PROFILE_INVALID');
    if (profiles.has(profile.id)) throw fail('PROFILE_ALIAS_CONFLICT', '应用名称已经存在。');
    profiles.set(profile.id, clone(profile));
    return clone(profile);
  }
  function get(id) { return profiles.has(id) ? clone(profiles.get(id)) : null; }
  function list() { return [...profiles.values()].map(clone); }
  function remove(id) { return profiles.delete(id); }
  function reconcile(app) {
    const source = validateApp(app);
    const changed = [];
    for (const profile of profiles.values()) if (profile.appId === source.appId && profile.platform === source.platform && profile.templateRevision !== source.templateRevision) {
      profile.status = 'template-update-required'; profile.updatedAt = new Date().toISOString();
      changed.push({ id: profile.id, status: profile.status, templateRevision: profile.templateRevision, availableTemplateRevision: source.templateRevision });
    }
    return changed;
  }
  return Object.freeze({ create, get, list, remove, reconcile });
}
