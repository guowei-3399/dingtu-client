import {
  projectAuthSnapshot,
  projectClientRead,
  projectTelemetrySyncResult,
  projectTicketList,
  projectTicketDetail,
  projectTicketMutation,
} from './client-projection.mjs';
import { ALLOWED_BROWSER_APP_IDS } from './isolated-browser.mjs';
import { ENVIRONMENT_MODES } from './environment-mode.mjs';

export const DESKTOP_CHANNEL = 'noya:desktop';
const operations = new Set([
  'auth.status', 'auth.login', 'auth.cancel', 'auth.logout',
  'read',
  'proxy.status', 'proxy.start', 'proxy.stop', 'proxy.environment', 'proxy.mode.set',
  'agent.adapters', 'agent.list', 'agent.inspect', 'agent.create', 'agent.start', 'agent.stop', 'agent.remove', 'agent.closeApp', 'agent.isRunning',
  'accounts.list', 'accounts.importLocal', 'accounts.add', 'accounts.switch', 'accounts.refreshQuota', 'accounts.remove', 'accounts.detectAll',
  'accounts.oauthStart', 'accounts.oauthStatus', 'accounts.oauthCopyUrl', 'accounts.oauthSubmitCallback', 'accounts.oauthCancel',
  'accounts.importToken', 'accounts.importJson', 'accounts.exportJson',
  'accounts.updateMeta', 'accounts.batchRemove',
  'accounts.groupsList', 'accounts.groupsSave', 'accounts.groupsRemove', 'accounts.groupsAssign',
  'accounts.usageScan', 'accounts.usageSetDir',
  'accounts.wakeupList', 'accounts.wakeupSave', 'accounts.wakeupToggle', 'accounts.wakeupRemove', 'accounts.wakeupRunNow',
  'accounts.settingsGet', 'accounts.settingsUpdate',
  'accounts.totpCompute', 'accounts.totpList', 'accounts.totpSave', 'accounts.totpRemove', 'accounts.totpImport', 'accounts.totpExport', 'accounts.totpMigrationPayload',
  'telemetry.status', 'telemetry.sync',
  'tickets.list', 'tickets.create', 'tickets.detail', 'tickets.reply',
  'browser.open', 'browser.list', 'browser.close',
]);
const kinds = new Set(['me', 'entitlements', 'members', 'identities', 'overview', 'catalog', 'relays', 'devices', 'tunnelStatus']);
const browserAppSet = new Set(ALLOWED_BROWSER_APP_IDS);
const droppedWorkbenchAppIds = new Set(['trae', 'traework', 'trae-cn', 'traework-cn', 'codebuddy', 'codebuddy-cn', 'qoder', 'zed', 'zcode']);
const safeAppId = value => typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value) && !droppedWorkbenchAppIds.has(value);
const safeRequestId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : null;
const safeError = (code, message, status = 0, requestId = null) => ({ ok: false, error: { code, message, ...(status ? { status } : {}), request_id: safeRequestId(requestId) } });
const fail = (code, message, status = 0) => Object.assign(new Error(message), { code, ...(status ? { status } : {}) });
function desktopDocumentUrl(url) {
  url.hash = '';
  // Chromium uppercases the drive letter when the portable launcher extracts to Windows TEMP.
  return process.platform === 'win32'
    ? url.href.replace(/^file:\/\/\/([a-z]):\//, (_prefix, drive) => `file:///${drive.toUpperCase()}:/`)
    : url.href;
}

export function matchesDesktopUrl(raw, expected) {
  try {
    const actual = new URL(raw), target = new URL(expected);
    if (!['file:', 'https:', 'http:'].includes(actual.protocol) || actual.username || actual.password) return false;
    const documentUrl = desktopDocumentUrl(actual);
    return !documentUrl.includes('?') && documentUrl === desktopDocumentUrl(target);
  } catch { return false; }
}
const senderMatches = (raw, expected) => Array.isArray(expected) ? expected.some(item => matchesDesktopUrl(raw, item)) : matchesDesktopUrl(raw, expected);
function validRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.operation !== 'string' || !operations.has(value.operation)) throw fail('IPC_MESSAGE_INVALID', '桌面请求无效。');
  const allowed = value.operation === 'read' ? ['operation', 'kind', 'args']
    : value.operation === 'proxy.mode.set' ? ['operation', 'mode']
    : value.operation === 'agent.inspect' || value.operation === 'agent.closeApp' || value.operation === 'agent.isRunning' ? ['operation', 'appId']
    : value.operation === 'agent.start' || value.operation === 'agent.stop' || value.operation === 'agent.remove' ? ['operation', 'instanceId']
    : value.operation === 'agent.create' ? ['operation', 'alias', 'appId', 'credentialSlotIds', 'relayId']
    : value.operation === 'accounts.list' ? ['operation', 'appId']
    : value.operation === 'accounts.importLocal' ? ['operation', 'appId', 'alias', 'all', 'silent']
    : value.operation === 'accounts.add' ? ['operation', 'appId', 'alias', 'label', 'email', 'plan', 'source']
    : value.operation === 'accounts.switch' || value.operation === 'accounts.remove' ? ['operation', 'appId', 'accountId']
    : value.operation === 'accounts.refreshQuota' ? ['operation', 'appId', 'accountId']
    : value.operation === 'accounts.detectAll' || value.operation === 'accounts.totpList' || value.operation === 'accounts.totpExport' || value.operation === 'accounts.groupsList' || value.operation === 'accounts.settingsGet' ? ['operation']
    : value.operation === 'accounts.groupsSave' ? ['operation', 'id', 'name', 'color']
    : value.operation === 'accounts.groupsRemove' || value.operation === 'accounts.wakeupToggle' || value.operation === 'accounts.wakeupRemove' || value.operation === 'accounts.wakeupRunNow' ? (value.operation === 'accounts.wakeupToggle' ? ['operation', 'id', 'enabled'] : ['operation', 'id'])
    : value.operation === 'accounts.groupsAssign' ? ['operation', 'groupId', 'appId', 'accountId', 'member']
    : value.operation === 'accounts.usageScan' ? ['operation', 'appId', 'range', 'granularity', 'sessionType', 'model', 'workspace', 'forceRescan']
    : value.operation === 'accounts.usageSetDir' ? ['operation', 'appId', 'pick', 'reset', 'dirPath']
    : value.operation === 'accounts.wakeupList' ? ['operation', 'appId']
    : value.operation === 'accounts.wakeupSave' ? ['operation', 'id', 'appId', 'accountId', 'name', 'enabled', 'scheduleType', 'intervalMinutes', 'dailyTime', 'action']
    : value.operation === 'accounts.settingsUpdate' ? ['operation', 'autoRefreshMinutes']
    : value.operation === 'accounts.totpMigrationPayload' ? ['operation', 'ids']
    : value.operation === 'accounts.oauthStart' ? ['operation', 'appId', 'alias']
    : value.operation === 'accounts.oauthStatus' || value.operation === 'accounts.oauthCopyUrl' || value.operation === 'accounts.oauthCancel' ? ['operation', 'flowId']
    : value.operation === 'accounts.oauthSubmitCallback' ? ['operation', 'flowId', 'callbackUrl']
    : value.operation === 'accounts.importToken' ? ['operation', 'appId', 'alias', 'token', 'refreshToken', 'email', 'plan', 'label', 'tags', 'note']
    : value.operation === 'accounts.importJson' ? ['operation', 'appId', 'jsonText']
    : value.operation === 'accounts.exportJson' ? ['operation', 'appId', 'accountIds']
    : value.operation === 'accounts.updateMeta' ? ['operation', 'appId', 'accountId', 'label', 'plan', 'tags', 'note']
    : value.operation === 'accounts.batchRemove' ? ['operation', 'appId', 'accountIds']
    : value.operation === 'accounts.totpCompute' ? ['operation', 'input']
    : value.operation === 'accounts.totpSave' ? ['operation', 'input', 'name']
    : value.operation === 'accounts.totpRemove' ? ['operation', 'ids', 'target']
    : value.operation === 'accounts.totpImport' ? ['operation', 'jsonText']
    : value.operation === 'browser.open' ? ['operation', 'appId', 'instanceId', 'appShell']
    : value.operation === 'browser.close' ? ['operation', 'appId', 'instanceId']
    : value.operation === 'telemetry.sync' ? ['operation', 'appIds', 'days']
    : value.operation === 'tickets.list' ? ['operation', 'status', 'limit']
    : value.operation === 'tickets.create' ? ['operation', 'subject', 'category', 'body', 'includeDiagnostics']
    : value.operation === 'tickets.detail' ? ['operation', 'ticketId']
    : value.operation === 'tickets.reply' ? ['operation', 'ticketId', 'body', 'action']
    : ['operation'];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw fail('IPC_MESSAGE_INVALID', '桌面请求无效。');
  if (value.operation === 'proxy.mode.set') {
    if (!ENVIRONMENT_MODES.includes(value.mode)) throw fail('IPC_MESSAGE_INVALID', '网络环境模式参数无效。');
    return { operation: value.operation, mode: value.mode };
  }
  if (value.operation === 'browser.open') {
    if (!browserAppSet.has(value.appId) || typeof value.instanceId !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value.instanceId)
        || (value.appShell !== undefined && typeof value.appShell !== 'boolean')) throw fail('IPC_MESSAGE_INVALID', '浏览器实例参数无效。');
    const out = { operation: value.operation, appId: value.appId, instanceId: value.instanceId };
    if (value.appShell !== undefined) out.appShell = value.appShell;
    return out;
  }
  if (value.operation === 'browser.close') {
    if (!browserAppSet.has(value.appId) || typeof value.instanceId !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value.instanceId)) throw fail('IPC_MESSAGE_INVALID', '浏览器实例参数无效。');
    return { operation: value.operation, appId: value.appId, instanceId: value.instanceId };
  }
  if (value.operation === 'read') {
    if (!kinds.has(value.kind)) throw fail(value.kind === 'tunnelConfig' ? 'READ_NOT_ALLOWED' : 'IPC_MESSAGE_INVALID', '读取类型不在允许范围内。');
    const args = value.args;
    if (args === undefined || (args && typeof args === 'object' && !Array.isArray(args))) return { operation: 'read', kind: value.kind, args: args ?? {} };
    throw fail('READ_NOT_ALLOWED', '读取参数无效。');
  }
  if (value.operation === 'agent.inspect' || value.operation === 'agent.closeApp' || value.operation === 'agent.isRunning') {
    if (typeof value.appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.appId) || droppedWorkbenchAppIds.has(value.appId)) {
      throw fail('IPC_MESSAGE_INVALID', '应用参数无效。');
    }
    return { operation: value.operation, appId: value.appId };
  }
  if (value.operation === 'agent.start' || value.operation === 'agent.stop' || value.operation === 'agent.remove') {
    if (typeof value.instanceId !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value.instanceId)) throw fail('IPC_MESSAGE_INVALID', '应用实例名称无效。');
    return { operation: value.operation, instanceId: value.instanceId };
  }
  if (value.operation === 'agent.create') {
    if (typeof value.alias !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value.alias) || typeof value.appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.appId)
      || (value.credentialSlotIds !== undefined && (!Array.isArray(value.credentialSlotIds) || value.credentialSlotIds.length > 32 || !value.credentialSlotIds.every(item => typeof item === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(item))))
      || (value.relayId !== undefined && value.relayId !== null && (typeof value.relayId !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value.relayId)))) throw fail('IPC_MESSAGE_INVALID', '应用实例参数无效。');
    const out = { operation: value.operation, alias: value.alias, appId: value.appId, credentialSlotIds: value.credentialSlotIds ?? [] };
    if (value.relayId !== undefined) out.relayId = value.relayId;
    return out;
  }
  if (value.operation === 'accounts.list') {
    if (value.appId !== undefined && value.appId !== null && (typeof value.appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.appId))) throw fail('IPC_MESSAGE_INVALID', '应用参数无效。');
    return { operation: value.operation, appId: value.appId || null };
  }
  if (value.operation === 'accounts.importLocal') {
    if ((value.appId !== undefined && value.appId !== null && (typeof value.appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.appId)))
      || (value.alias !== undefined && value.alias !== null && (typeof value.alias !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value.alias)))
      || (value.all !== undefined && typeof value.all !== 'boolean')
      || (value.silent !== undefined && typeof value.silent !== 'boolean')) throw fail('IPC_MESSAGE_INVALID', '账号导入参数无效。');
    return {
      operation: value.operation,
      appId: value.appId || null,
      alias: value.alias || null,
      all: Boolean(value.all),
      silent: Boolean(value.silent),
    };
  }
  if (value.operation === 'accounts.add') {
    if (typeof value.appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.appId)
      || (value.alias !== undefined && (typeof value.alias !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value.alias)))
      || (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > 80))
      || (value.email !== undefined && (typeof value.email !== 'string' || value.email.length > 160))
      || (value.plan !== undefined && (typeof value.plan !== 'string' || value.plan.length > 48))
      || (value.source !== undefined && !['manual', 'local-import', 'isolated-container'].includes(value.source))) {
      throw fail('IPC_MESSAGE_INVALID', '账号参数无效。');
    }
    return {
      operation: value.operation,
      appId: value.appId,
      alias: value.alias || 'main',
      label: value.label || '',
      email: value.email || '',
      plan: value.plan || '',
      source: value.source || 'manual',
    };
  }
  if (value.operation === 'accounts.switch' || value.operation === 'accounts.remove') {
    if (typeof value.appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.appId)
      || typeof value.accountId !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value.accountId)) {
      throw fail('IPC_MESSAGE_INVALID', '账号切换参数无效。');
    }
    return { operation: value.operation, appId: value.appId, accountId: value.accountId };
  }
  if (value.operation === 'accounts.refreshQuota') {
    if ((value.appId !== undefined && value.appId !== null && (typeof value.appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.appId)))
      || (value.accountId !== undefined && value.accountId !== null && (typeof value.accountId !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value.accountId)))) {
      throw fail('IPC_MESSAGE_INVALID', '额度刷新参数无效。');
    }
    return { operation: value.operation, appId: value.appId || null, accountId: value.accountId || null };
  }
  if (value.operation === 'accounts.oauthStart') {
    if (typeof value.appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.appId)
      || (value.alias !== undefined && (typeof value.alias !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value.alias)))) {
      throw fail('IPC_MESSAGE_INVALID', 'OAuth 启动参数无效。');
    }
    return { operation: value.operation, appId: value.appId, alias: value.alias || 'main' };
  }
  if (value.operation === 'accounts.oauthStatus' || value.operation === 'accounts.oauthCopyUrl' || value.operation === 'accounts.oauthCancel') {
    if (typeof value.flowId !== 'string' || !/^[a-f0-9]{8,64}$/.test(value.flowId)) {
      throw fail('IPC_MESSAGE_INVALID', 'OAuth 流程标识无效。');
    }
    return { operation: value.operation, flowId: value.flowId };
  }
  if (value.operation === 'accounts.oauthSubmitCallback') {
    if (typeof value.flowId !== 'string' || !/^[a-f0-9]{8,64}$/.test(value.flowId)
      || typeof value.callbackUrl !== 'string' || !value.callbackUrl.trim() || value.callbackUrl.length > 4096) {
      throw fail('IPC_MESSAGE_INVALID', 'OAuth 回调参数无效。');
    }
    return { operation: value.operation, flowId: value.flowId, callbackUrl: value.callbackUrl.trim() };
  }
  if (value.operation === 'accounts.importToken') {
    if (typeof value.appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.appId)
      || (value.alias !== undefined && (typeof value.alias !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value.alias)))
      || (value.token !== undefined && (typeof value.token !== 'string' || value.token.length > 4096))
      || (value.refreshToken !== undefined && (typeof value.refreshToken !== 'string' || value.refreshToken.length > 2048))
      || (value.email !== undefined && (typeof value.email !== 'string' || value.email.length > 160))
      || (value.plan !== undefined && (typeof value.plan !== 'string' || value.plan.length > 48))
      || (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > 80))
      || (value.note !== undefined && (typeof value.note !== 'string' || value.note.length > 240))
      || (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.length > 10 || !value.tags.every(t => typeof t === 'string' && t.length <= 24)))) {
      throw fail('IPC_MESSAGE_INVALID', 'Token 导入参数无效。');
    }
    return {
      operation: value.operation,
      appId: value.appId,
      alias: value.alias || 'main',
      token: value.token || '',
      refreshToken: value.refreshToken || '',
      email: value.email || '',
      plan: value.plan || '',
      label: value.label || '',
      tags: value.tags || [],
      note: value.note || '',
    };
  }
  if (value.operation === 'accounts.importJson') {
    if (typeof value.appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.appId)
      || typeof value.jsonText !== 'string' || !value.jsonText.trim() || value.jsonText.length > 512 * 1024) {
      throw fail('IPC_MESSAGE_INVALID', 'JSON 导入参数无效。');
    }
    return { operation: value.operation, appId: value.appId, jsonText: value.jsonText };
  }
  if (value.operation === 'accounts.exportJson') {
    if ((value.appId !== undefined && value.appId !== null && (typeof value.appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.appId)))
      || (value.accountIds !== undefined && value.accountIds !== null && (!Array.isArray(value.accountIds) || value.accountIds.length > 32 || !value.accountIds.every(id => typeof id === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(id))))) {
      throw fail('IPC_MESSAGE_INVALID', 'JSON 导出参数无效。');
    }
    return { operation: value.operation, appId: value.appId || null, accountIds: value.accountIds || null };
  }
  if (value.operation === 'accounts.updateMeta') {
    if (typeof value.appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.appId)
      || typeof value.accountId !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value.accountId)
      || (value.label !== undefined && (typeof value.label !== 'string' || value.label.length > 80))
      || (value.plan !== undefined && (typeof value.plan !== 'string' || value.plan.length > 48))
      || (value.note !== undefined && (typeof value.note !== 'string' || value.note.length > 240))
      || (value.tags !== undefined && (!Array.isArray(value.tags) || value.tags.length > 10 || !value.tags.every(t => typeof t === 'string' && t.length <= 24)))) {
      throw fail('IPC_MESSAGE_INVALID', '账号标签或备注参数无效。');
    }
    return {
      operation: value.operation,
      appId: value.appId,
      accountId: value.accountId,
      label: value.label || '',
      plan: value.plan || '',
      tags: value.tags || [],
      note: value.note || '',
    };
  }
  if (value.operation === 'accounts.batchRemove') {
    if (typeof value.appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.appId)
      || !Array.isArray(value.accountIds) || value.accountIds.length === 0 || value.accountIds.length > 64
      || !value.accountIds.every(id => typeof id === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(id))) {
      throw fail('IPC_MESSAGE_INVALID', '批量删除参数无效。');
    }
    return { operation: value.operation, appId: value.appId, accountIds: value.accountIds };
  }
  if (value.operation === 'accounts.totpCompute') {
    if (typeof value.input !== 'string' || !value.input.trim() || value.input.length > 1024) {
      throw fail('IPC_MESSAGE_INVALID', '2FA 秘钥参数无效。');
    }
    return { operation: value.operation, input: value.input.trim() };
  }
  if (value.operation === 'accounts.totpSave') {
    if (typeof value.input !== 'string' || !value.input.trim() || value.input.length > 1024
      || (value.name !== undefined && (typeof value.name !== 'string' || value.name.length > 80))) {
      throw fail('IPC_MESSAGE_INVALID', '2FA 保存参数无效。');
    }
    return { operation: value.operation, input: value.input.trim(), name: value.name || '' };
  }
  if (value.operation === 'accounts.totpRemove') {
    if (!Array.isArray(value.ids) || value.ids.length === 0 || value.ids.length > 100
      || !value.ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 64)
      || (value.target !== undefined && !['saved', 'history'].includes(value.target))) {
      throw fail('IPC_MESSAGE_INVALID', '2FA 删除参数无效。');
    }
    return { operation: value.operation, ids: value.ids, target: value.target || 'saved' };
  }
  if (value.operation === 'accounts.totpImport') {
    if (typeof value.jsonText !== 'string' || !value.jsonText.trim() || value.jsonText.length > 256 * 1024) {
      throw fail('IPC_MESSAGE_INVALID', '2FA 备份导入参数无效。');
    }
    return { operation: value.operation, jsonText: value.jsonText };
  }
  if (value.operation === 'accounts.totpMigrationPayload') {
    if (value.ids !== undefined && (!Array.isArray(value.ids) || value.ids.length > 20 || !value.ids.every(x => typeof x === 'string' && x.length <= 64))) {
      throw fail('IPC_MESSAGE_INVALID', '2FA 迁移二维码参数无效。');
    }
    return { operation: value.operation, ids: value.ids || [] };
  }
  if (value.operation === 'accounts.groupsSave') {
    const validColor = ['blue', 'green', 'purple', 'orange', 'pink', 'cyan'].includes(value.color)
      || (typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color));
    if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 36
      || (value.id !== undefined && (typeof value.id !== 'string' || value.id.length > 32))
      || (value.color !== undefined && !validColor)) {
      throw fail('IPC_MESSAGE_INVALID', '分组参数无效。');
    }
    return { operation: value.operation, id: value.id || '', name: value.name.trim(), color: value.color || 'blue' };
  }
  if (value.operation === 'accounts.groupsRemove') {
    if (typeof value.id !== 'string' || !value.id.trim() || value.id.length > 32) {
      throw fail('IPC_MESSAGE_INVALID', '分组标识无效。');
    }
    return { operation: value.operation, id: value.id.trim() };
  }
  if (value.operation === 'accounts.groupsAssign') {
    if (typeof value.groupId !== 'string' || !value.groupId.trim() || value.groupId.length > 32
      || !safeAppId(value.appId)
      || typeof value.accountId !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value.accountId)
      || (value.member !== undefined && typeof value.member !== 'boolean')) {
      throw fail('IPC_MESSAGE_INVALID', '分组分配参数无效。');
    }
    return { operation: value.operation, groupId: value.groupId.trim(), appId: value.appId, accountId: value.accountId, member: value.member !== false };
  }
  if (value.operation === 'accounts.usageScan') {
    if ((value.appId !== undefined && !safeAppId(value.appId))
      || (value.range !== undefined && !['1d', 'today', '7d', '30d', 'month', 'all'].includes(value.range))
      || (value.granularity !== undefined && !['hour', 'day', 'week', 'month'].includes(value.granularity))
      || (value.sessionType !== undefined && !['all', 'main', 'swarm', 'subagent'].includes(value.sessionType))
      || (value.model !== undefined && (typeof value.model !== 'string' || value.model.length > 80))
      || (value.workspace !== undefined && (typeof value.workspace !== 'string' || value.workspace.length > 160))
      || (value.forceRescan !== undefined && typeof value.forceRescan !== 'boolean')) {
      throw fail('IPC_MESSAGE_INVALID', '会话用量扫描参数无效。');
    }
    return {
      operation: value.operation,
      appId: value.appId || 'antigravity',
      range: value.range || '30d',
      granularity: value.granularity || 'day',
      sessionType: value.sessionType || 'all',
      model: value.model || 'all',
      workspace: value.workspace || 'all',
      forceRescan: Boolean(value.forceRescan),
    };
  }
  if (value.operation === 'accounts.usageSetDir') {
    if (!safeAppId(value.appId)
      || (value.pick !== undefined && typeof value.pick !== 'boolean')
      || (value.reset !== undefined && typeof value.reset !== 'boolean')
      || (value.dirPath !== undefined && (typeof value.dirPath !== 'string' || value.dirPath.length > 512 || /[\u0000\r\n]/.test(value.dirPath)))) {
      throw fail('IPC_MESSAGE_INVALID', '数据目录参数无效。');
    }
    return {
      operation: value.operation,
      appId: value.appId,
      pick: Boolean(value.pick),
      reset: Boolean(value.reset),
      dirPath: value.dirPath || '',
    };
  }
  if (value.operation === 'accounts.wakeupList') {
    if (value.appId !== undefined && value.appId !== null && (typeof value.appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.appId))) {
      throw fail('IPC_MESSAGE_INVALID', '唤醒任务应用标识无效。');
    }
    return { operation: value.operation, appId: value.appId || null };
  }
  if (value.operation === 'accounts.wakeupSave') {
    if (!safeAppId(value.appId)
      || (value.id !== undefined && (typeof value.id !== 'string' || value.id.length > 48))
      || (value.accountId !== undefined && (typeof value.accountId !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value.accountId)))
      || (value.name !== undefined && (typeof value.name !== 'string' || value.name.length > 80))
      || (value.enabled !== undefined && typeof value.enabled !== 'boolean')
      || (value.scheduleType !== undefined && !['interval', 'daily'].includes(value.scheduleType))
      || (value.intervalMinutes !== undefined && !Number.isFinite(Number(value.intervalMinutes)))
      || (value.dailyTime !== undefined && (typeof value.dailyTime !== 'string' || value.dailyTime.length > 8))
      || (value.action !== undefined && !['quota_refresh', 'lightweight_ping', 'refresh_quota', 'probe_local'].includes(value.action))) {
      throw fail('IPC_MESSAGE_INVALID', '唤醒任务参数无效。');
    }
    return {
      operation: value.operation,
      id: value.id || '',
      appId: value.appId,
      accountId: value.accountId || 'main',
      name: value.name || '',
      enabled: value.enabled !== false,
      scheduleType: value.scheduleType || 'interval',
      intervalMinutes: Number(value.intervalMinutes || 240),
      dailyTime: value.dailyTime || '08:30',
      action: value.action || 'refresh_quota',
    };
  }
  if (value.operation === 'accounts.wakeupToggle' || value.operation === 'accounts.wakeupRemove' || value.operation === 'accounts.wakeupRunNow') {
    if (typeof value.id !== 'string' || !value.id.trim() || value.id.length > 48
      || (value.enabled !== undefined && typeof value.enabled !== 'boolean')) {
      throw fail('IPC_MESSAGE_INVALID', '唤醒任务标识无效。');
    }
    return {
      operation: value.operation,
      id: value.id.trim(),
      ...(value.enabled !== undefined ? { enabled: value.enabled } : {}),
    };
  }
  if (value.operation === 'accounts.settingsUpdate') {
    if (value.autoRefreshMinutes !== undefined && ![0, 2, 5, 10, 15, 30, 60].includes(Number(value.autoRefreshMinutes))) {
      throw fail('IPC_MESSAGE_INVALID', '自动刷新间隔仅支持关闭、2、5、10、15、30 或 60 分钟。');
    }
    return { operation: value.operation, autoRefreshMinutes: Number(value.autoRefreshMinutes ?? 0) };
  }
  if (value.operation === 'telemetry.sync') {
    if ((value.appIds !== undefined && (!Array.isArray(value.appIds) || value.appIds.length > 20 || !value.appIds.every(id => safeAppId(id))))
      || (value.days !== undefined && (!Number.isSafeInteger(value.days) || value.days < 1 || value.days > 90))) {
      throw fail('IPC_MESSAGE_INVALID', '遥测同步参数无效。');
    }
    return {
      operation: value.operation,
      ...(value.appIds !== undefined ? { appIds: value.appIds } : {}),
      ...(value.days !== undefined ? { days: value.days } : {}),
    };
  }
  if (value.operation === 'tickets.list') {
    const validTicketStatuses = new Set(['all', 'submitted', 'acknowledged', 'investigating', 'waiting_user', 'awaiting_ops', 'awaiting_production', 'resolved', 'closed', 'reopened']);
    if ((value.status !== undefined && !validTicketStatuses.has(value.status))
      || (value.limit !== undefined && (!Number.isSafeInteger(value.limit) || value.limit < 1 || value.limit > 100))) {
      throw fail('IPC_MESSAGE_INVALID', '工单列表筛选参数无效。');
    }
    return { operation: value.operation, status: value.status || 'all', limit: value.limit ?? 50 };
  }
  if (value.operation === 'tickets.create') {
    if (typeof value.subject !== 'string' || value.subject.trim().length < 2 || value.subject.trim().length > 160 || /[\r\n]/.test(value.subject)
      || !['connection', 'exit_ip', 'workbench_app', 'account_billing', 'other'].includes(value.category)
      || typeof value.body !== 'string' || !value.body.trim() || value.body.length > 8000
      || (value.includeDiagnostics !== undefined && typeof value.includeDiagnostics !== 'boolean')) {
      throw fail('IPC_MESSAGE_INVALID', '工单提交参数无效。');
    }
    return {
      operation: value.operation,
      subject: value.subject.trim(),
      category: value.category,
      body: value.body.trim(),
      includeDiagnostics: value.includeDiagnostics !== false,
    };
  }
  if (value.operation === 'tickets.detail') {
    if (typeof value.ticketId !== 'string' || !/^tkt_[0-9a-f]{32}$/.test(value.ticketId)) {
      throw fail('IPC_MESSAGE_INVALID', '工单编号无效。');
    }
    return { operation: value.operation, ticketId: value.ticketId };
  }
  if (value.operation === 'tickets.reply') {
    const act = value.action ?? 'reply';
    if (typeof value.ticketId !== 'string' || !/^tkt_[0-9a-f]{32}$/.test(value.ticketId)
      || !['reply', 'reopen', 'close'].includes(act)
      || (value.body !== undefined && typeof value.body !== 'string')
      || (typeof value.body === 'string' && value.body.length > 8000)
      || (act === 'reply' && !String(value.body || '').trim())) {
      throw fail('IPC_MESSAGE_INVALID', '工单回复参数无效。');
    }
    return { operation: value.operation, ticketId: value.ticketId, action: act, body: String(value.body || '').trim() };
  }
  return { operation: value.operation };
}

const ALLOWED_PROXY_EXIT_CATEGORIES = new Set([
  'PROXY_DNS_ERROR', 'PROXY_ACCESS_DENIED', 'PROXY_ROUTE_ERROR',
  'PROXY_PORT_IN_USE', 'PROXY_CONFIG_INVALID', 'PROXY_SPAWN_ERROR', 'PROXY_LISTEN_TIMEOUT',
  'PROXY_FRONTEND_EXITED',
]);

function projectProxyStatus(value) {
  if (!value || typeof value !== 'object' || !['stopped', 'starting', 'running', 'stopping', 'failed'].includes(value.state)) throw fail('PROXY_CONTROL_FAILED', '本地代理状态无效。');
  const lastExitCategory = typeof value.lastExitCategory === 'string' && ALLOWED_PROXY_EXIT_CATEGORIES.has(value.lastExitCategory) ? value.lastExitCategory : null;
  return {
    state: value.state,
    host: value.host === '127.0.0.1' ? value.host : '127.0.0.1',
    port: value.port === 17899 ? 17899 : 17899,
    lastExit: typeof value.lastExit === 'string' && /^[a-z0-9:_-]{1,64}$/i.test(value.lastExit) ? value.lastExit : null,
    ...(lastExitCategory ? { lastExitCategory } : {}),
  };
}
function projectEnvironmentSnapshot(value) {
  if (!value || typeof value !== 'object' || !ENVIRONMENT_MODES.includes(value.mode)) throw fail('PROXY_CONTROL_FAILED', '网络环境状态无效。');
  const exitGeo = value.exitGeo && typeof value.exitGeo === 'object'
    && typeof value.exitGeo.countryCode === 'string' && typeof value.exitGeo.timezone === 'string' && typeof value.exitGeo.locale === 'string'
    ? {
        countryCode: value.exitGeo.countryCode,
        timezone: value.exitGeo.timezone,
        locale: value.exitGeo.locale,
        regionLabel: typeof value.exitGeo.regionLabel === 'string' ? value.exitGeo.regionLabel : null,
      }
    : null;
  return {
    mode: value.mode,
    requiresTunnel: Boolean(value.requiresTunnel),
    dnsProtection: typeof value.dnsProtection === 'string' ? value.dnsProtection : 'basic_proxy',
    webrtcProtection: typeof value.webrtcProtection === 'string' ? value.webrtcProtection : 'browser_default',
    processSandbox: typeof value.processSandbox === 'string' ? value.processSandbox : 'proxy_17899_basic',
    tunInterface: null,
    exitGeo,
    ...(value.concurrency && typeof value.concurrency === 'object' ? {
      concurrency: {
        customerType: value.concurrency.customerType === 'enterprise' ? 'enterprise' : 'personal',
        multiInstanceAllowed: Boolean(value.concurrency.multiInstanceAllowed),
        multiLoginAllowed: Boolean(value.concurrency.multiLoginAllowed),
        maxConcurrentInstances: Number.isSafeInteger(value.concurrency.maxConcurrentInstances) ? value.concurrency.maxConcurrentInstances : 1,
        canonicalPersonalInstanceId: typeof value.concurrency.canonicalPersonalInstanceId === 'string' ? value.concurrency.canonicalPersonalInstanceId : 'main',
      },
    } : {}),
  };
}
function projectAgentRecord(value) {
  if (!value || typeof value !== 'object') throw fail('AGENT_CONTROL_FAILED', '应用实例状态无效。');
  const profileId = typeof value.profileId === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(value.profileId) ? value.profileId : typeof value.id === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(value.id) ? value.id : null;
  const status = ['ready', 'starting', 'running', 'stopping', 'stopped', 'failed', 'template-update-required'].includes(value.status) ? value.status : 'unknown';
  if (!profileId) throw fail('AGENT_CONTROL_FAILED', '应用实例状态无效。');
  const record = {
    profileId,
    status,
    pid: Number.isSafeInteger(value.pid) ? value.pid : null,
    activation: value.activation === 'restart-required' ? 'restart-required' : 'immediate',
    error: typeof value.error === 'string' && /^[a-z0-9_:-]{1,64}$/.test(value.error) ? value.error : null,
  };
  if (typeof value.appId === 'string' && /^[a-z0-9-]{1,64}$/.test(value.appId)) record.appId = value.appId;
  if (typeof value.appName === 'string' && value.appName.length <= 160) record.appName = value.appName;
  if (value.relayId === null || (typeof value.relayId === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value.relayId))) record.relayId = value.relayId;
  return record;
}
function projectAgentInspection(value) {
  if (!value || typeof value !== 'object' || typeof value.appId !== 'string') throw fail('AGENT_CONTROL_FAILED', '应用检测结果无效。');
  const status = ['installed', 'not-installed', 'unknown'].includes(value.status) ? value.status : 'unknown';
  const activation = value.activation === 'restart-required' ? 'restart-required' : 'immediate';
  const command = typeof value.command === 'string' && value.command.length <= 1024 ? value.command : null;
  const path = typeof value.path === 'string' && value.path.length <= 2048 ? value.path : null;
  return { appId: value.appId, status, activation, command, path };
}
function projectWorkbenchAdapter(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value.id)) throw fail('AGENT_CONTROL_FAILED', '适配器元数据无效。');
  return {
    id: value.id,
    name: typeof value.name === 'string' && value.name.length <= 160 ? value.name : value.id,
    category: ['coding', 'general', 'task'].includes(value.category) ? value.category : 'coding',
    adapter: ['env-launch', 'electron-launch'].includes(value.adapter) ? value.adapter : 'env-launch',
    relayProtocol: ['anthropic', 'openai', 'openai-responses', 'gemini', 'xai'].includes(value.relayProtocol) ? value.relayProtocol : null,
  };
}
function projectBrowserRecord(value) {
  if (!value || typeof value !== 'object' || !browserAppSet.has(value.appId) || typeof value.instanceId !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value.instanceId)) {
    throw fail('BROWSER_UNAVAILABLE', '隔离容器列表无效。');
  }
  return {
    appId: value.appId,
    name: typeof value.name === 'string' && value.name.length <= 80 ? value.name : value.appId,
    instanceId: value.instanceId,
    appShell: Boolean(value.appShell),
    mode: value.mode === 'own_network' ? 'own_network' : 'safe_tunnel',
    status: 'opened',
  };
}
function senderAllowed(event, win, portalUrl) {
  const frame = event?.senderFrame;
  const contents = win?.webContents;
  const sameContents = !!event?.sender && !!contents
    && (event.sender === contents
      || (Number.isInteger(event.sender.id) && Number.isInteger(contents.id) && event.sender.id === contents.id));
  const mainFrame = !!frame && (frame === contents?.mainFrame || frame.parent == null);
  const frameUrl = frame?.url || '';
  const currentUrl = typeof contents?.getURL === 'function' ? contents.getURL() : '';
  const allowedUrl = senderMatches(frameUrl, portalUrl)
    || (frameUrl === 'about:blank' && currentUrl && senderMatches(currentUrl, portalUrl));
  return sameContents && mainFrame && allowedUrl
    && !win.isDestroyed?.() && !event.sender.isDestroyed?.();
}

export function registerDesktopIpc({ ipcMain, getWindow, portalUrl, host, agents, proxy, browser, environment, relayCache, concurrency, accounts, oauth, usageScanner, wakeup, pickDirectory, telemetry, processRestarter = null, writeClipboardText = null, onAudit = null } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function' || typeof ipcMain.removeHandler !== 'function' || typeof getWindow !== 'function' || !(typeof portalUrl === 'string' || (Array.isArray(portalUrl) && portalUrl.every(item => typeof item === 'string'))) || !host) throw fail('IPC_CONFIGURATION_INVALID', '桌面桥接配置无效。');
  async function ensureExitGeoHydrated() {
    if (!environment || typeof environment.getMode !== 'function' || environment.getMode() === 'own_network') return;
    if (typeof environment.getExitGeo === 'function' && environment.getExitGeo()) return;
    if (typeof host.read !== 'function') return;
    try {
      const st = projectClientRead('tunnelStatus', await host.read('tunnelStatus', {}));
      if (st?.exitContext !== undefined) environment.updateExitGeo?.(st.exitContext);
    } catch {}
    if (typeof environment.getExitGeo === 'function' && !environment.getExitGeo()) {
      try {
        const ov = projectClientRead('overview', await host.read('overview', {}));
        if (ov?.exitContext !== undefined) environment.updateExitGeo?.(ov.exitContext);
      } catch {}
    }
  }
  const handler = async (event, message) => {
    const win = getWindow();
    if (!senderAllowed(event, win, portalUrl)) return safeError('IPC_SENDER_INVALID', '桌面请求来源无效。');
    let request; try { request = validRequest(message); } catch (error) { return safeError(error.code || 'IPC_MESSAGE_INVALID', error.code === 'READ_NOT_ALLOWED' ? '读取类型不在允许范围内。' : '桌面请求无效。'); }
    const opStartedAt = Date.now();
    try {
      let value;
      const localUnauthAccountsOps = new Set([
        'accounts.detectAll', 'accounts.usageScan', 'accounts.usageSetDir', 'accounts.groupsList', 'accounts.settingsGet', 'accounts.wakeupList',
      ]);
      const requiresSession = (request.operation.startsWith('agent.') && request.operation !== 'agent.inspect' && request.operation !== 'agent.adapters')
        || (request.operation.startsWith('accounts.') && !localUnauthAccountsOps.has(request.operation) && !request.operation.startsWith('accounts.totp'))
        || request.operation === 'telemetry.sync'
        || request.operation.startsWith('tickets.')
        || request.operation === 'proxy.start'
        || request.operation === 'browser.open'
        || request.operation === 'browser.close';
      if (requiresSession && host.snapshot?.().status !== 'authenticated') return safeError('AUTH_REQUIRED', '请先完成桌面登录。', 401);
      if (request.operation === 'auth.status') value = projectAuthSnapshot(host.snapshot());
      else if (request.operation === 'auth.login') {
        void Promise.resolve(browser?.closeAll()).catch(() => {});
        proxy?.stop();
        relayCache?.clear?.();
        concurrency?.clear?.();
        value = projectAuthSnapshot(await host.login());
        if (value?.status === 'authenticated') {
          telemetry?.recordEvent?.({ category: 'auth', action: 'desktop_login', stage: 'pkce_login', status: 'ok', severity: 'info', durationMs: Date.now() - opStartedAt });
          telemetry?.notifySessionReady?.();
        }
      }
      else if (request.operation === 'auth.cancel') {
        value = { status: host.cancelLogin() === false ? 'finishing' : 'cancelled' };
      }
      else if (request.operation === 'auth.logout') {
        telemetry?.recordEvent?.({ category: 'auth', action: 'desktop_logout', stage: 'logout', status: 'ok', severity: 'info' });
        await Promise.resolve(telemetry?.flushFast?.()).catch(() => {});
        browser?.closeAll();
        proxy?.stop();
        relayCache?.clear?.();
        concurrency?.clear?.();
        environment?.updateExitGeo?.(null);
        value = projectAuthSnapshot(await host.logout());
      }
      else if (request.operation === 'telemetry.status') {
        value = telemetry ? telemetry.status() : { lastSyncedAt: null, lastSyncStatus: 'offline', lastAcceptedBuckets: 0, lastAcceptedEvents: 0, lastAcceptedLatencySamples: 0, pendingEventsCount: 0, pendingLatencySamplesCount: 0, lastError: null };
      }
      else if (request.operation === 'telemetry.sync') {
        if (!telemetry || typeof telemetry.syncNow !== 'function') return safeError('ACCOUNTS_UNAVAILABLE', '云端遥测同步尚未初始化。');
        value = await telemetry.syncNow({
          ...(request.appIds ? { appIds: request.appIds } : {}),
          ...(request.days !== undefined ? { days: request.days } : {}),
        });
      }
      else if (request.operation === 'tickets.list') {
        if (typeof host.listTickets !== 'function') return safeError('REQUEST_FAILED', '工单服务暂不可用。');
        value = projectTicketList(await host.listTickets({ status: request.status, limit: request.limit }));
      }
      else if (request.operation === 'tickets.create') {
        if (typeof host.createTicket !== 'function') return safeError('REQUEST_FAILED', '工单服务暂不可用。');
        const diagnosticSnapshot = request.includeDiagnostics && telemetry?.buildDiagnosticSnapshot
          ? telemetry.buildDiagnosticSnapshot()
          : undefined;
        value = projectTicketMutation(await host.createTicket({
          subject: request.subject,
          category: request.category,
          body: request.body,
          ...(diagnosticSnapshot ? { diagnosticSnapshot } : {}),
        }));
      }
      else if (request.operation === 'tickets.detail') {
        if (typeof host.getTicket !== 'function') return safeError('REQUEST_FAILED', '工单服务暂不可用。');
        value = projectTicketDetail(await host.getTicket(request.ticketId));
      }
      else if (request.operation === 'tickets.reply') {
        if (typeof host.replyTicket !== 'function') return safeError('REQUEST_FAILED', '工单服务暂不可用。');
        value = projectTicketMutation(await host.replyTicket(request.ticketId, { body: request.body, action: request.action }));
      }
      else if (request.operation === 'browser.open') {
        if (!browser || typeof browser.open !== 'function') return safeError('BROWSER_UNAVAILABLE', '隔离浏览器暂不可用。');
        if (concurrency) {
          const tier = await concurrency.resolveTier();
          const agent = agents || host.agent;
          const activeAgents = agent && typeof agent.list === 'function' ? await agent.list() : [];
          const activeBrowsers = typeof browser.list === 'function' ? await browser.list() : [];
          concurrency.assertBrowserOpenAllowed({
            tier,
            activeAgents: Array.isArray(activeAgents) ? activeAgents : [],
            activeBrowsers: Array.isArray(activeBrowsers) ? activeBrowsers : [],
            appId: request.appId,
            instanceId: request.instanceId,
          });
        }
        await ensureExitGeoHydrated();
        const openInput = { appId: request.appId, instanceId: request.instanceId };
        if (request.appShell !== undefined) openInput.appShell = request.appShell;
        await browser.open(openInput);
        telemetry?.recordEvent?.({ category: 'workbench', action: 'browser_opened', appId: request.appId, stage: 'workbench_launch', status: 'ok', severity: 'info', durationMs: Date.now() - opStartedAt });
        value = request.appShell !== undefined
          ? { appId: request.appId, instanceId: request.instanceId, appShell: request.appShell, status: 'opened' }
          : { appId: request.appId, instanceId: request.instanceId, status: 'opened' };
      }
      else if (request.operation === 'browser.list') {
        if (!browser || typeof browser.list !== 'function') value = { instances: [] };
        else {
          const list = await browser.list();
          if (!Array.isArray(list) || list.length > 32) throw fail('BROWSER_UNAVAILABLE', '隔离浏览器列表无效。');
          value = { instances: list.map(projectBrowserRecord) };
        }
      }
      else if (request.operation === 'browser.close') {
        if (!browser || typeof browser.closeInstance !== 'function') return safeError('BROWSER_UNAVAILABLE', '隔离浏览器暂不可用。');
        const closed = await browser.closeInstance({ appId: request.appId, instanceId: request.instanceId });
        value = { appId: request.appId, instanceId: request.instanceId, status: closed?.status === 'closed' ? 'closed' : 'not_found' };
      }
      else if (request.operation === 'proxy.environment') {
        const baseEnv = environment && typeof environment.snapshot === 'function'
          ? environment.snapshot()
          : { mode: 'safe_tunnel', requiresTunnel: true, dnsProtection: 'basic_proxy', webrtcProtection: 'browser_default', processSandbox: 'proxy_17899_basic', tunInterface: null, exitGeo: null };
        value = projectEnvironmentSnapshot({
          ...baseEnv,
          ...(concurrency && typeof concurrency.snapshot === 'function' ? { concurrency: concurrency.snapshot() } : {}),
        });
      }
      else if (request.operation === 'proxy.mode.set') {
        if (!environment || typeof environment.setMode !== 'function') return safeError('PROXY_CONTROL_UNAVAILABLE', '环境模式切换暂不可用。');
        const nextEnv = await environment.setMode(request.mode);
        telemetry?.recordEvent?.({ category: 'tunnel', action: `env_mode_${nextEnv.mode}`, status: 'ok' });
        value = projectEnvironmentSnapshot({
          ...nextEnv,
          ...(concurrency && typeof concurrency.snapshot === 'function' ? { concurrency: concurrency.snapshot() } : {}),
        });
      }
      else if (request.operation === 'proxy.status') {
        if (!proxy || typeof proxy.status !== 'function') return safeError('PROXY_CONTROL_UNAVAILABLE', '本地代理控制暂不可用。');
        value = projectProxyStatus(proxy.status());
      } else if (request.operation === 'proxy.start') {
        if (!proxy || typeof proxy.start !== 'function') return safeError('PROXY_CONTROL_UNAVAILABLE', '本地代理控制暂不可用。');
        if (environment && typeof environment.getMode === 'function' && environment.getMode() === 'own_network') {
          await environment.setMode('safe_tunnel');
        }
        await ensureExitGeoHydrated();
        value = projectProxyStatus(await proxy.start());
        telemetry?.recordEvent?.({ category: 'tunnel', action: 'tunnel_started', stage: 'core_start', status: 'ok', severity: 'info', durationMs: Date.now() - opStartedAt });
      } else if (request.operation === 'proxy.stop') {
        if (!proxy || typeof proxy.stop !== 'function') return safeError('PROXY_CONTROL_UNAVAILABLE', '本地代理控制暂不可用。');
        const stopped = typeof proxy.stopAndWait === 'function' ? await proxy.stopAndWait() : await proxy.stop();
        value = projectProxyStatus(stopped);
        telemetry?.recordEvent?.({ category: 'tunnel', action: 'tunnel_stopped', status: 'ok' });
      }
      else if (request.operation === 'agent.adapters') {
        const agent = agents || host.agent;
        if (!agent || typeof agent.adapters !== 'function') return safeError('AGENT_CONTROL_UNAVAILABLE', '应用实例控制暂不可用。');
        const list = await agent.adapters();
        if (!Array.isArray(list) || list.length > 64) throw fail('AGENT_CONTROL_FAILED', '适配器列表无效。');
        value = { adapters: list.map(projectWorkbenchAdapter) };
      }
      else if (request.operation === 'agent.list') {
        const agent = agents || host.agent;
        if (!agent || typeof agent.list !== 'function') return safeError('AGENT_CONTROL_UNAVAILABLE', '应用实例控制暂不可用。');
        const profiles = await agent.list(); if (!Array.isArray(profiles) || profiles.length > 64) throw fail('AGENT_CONTROL_FAILED', '应用实例列表无效。');
        value = { profiles: profiles.map(projectAgentRecord) };
      } else if (request.operation === 'agent.inspect') {
        const agent = agents || host.agent;
        if (!agent || typeof agent.inspect !== 'function') return safeError('AGENT_CONTROL_UNAVAILABLE', '应用环境检查暂不可用。');
        value = projectAgentInspection(await agent.inspect(request.appId));
      } else if (request.operation === 'agent.create') {
        const agent = agents || host.agent;
        if (!agent || typeof agent.create !== 'function') return safeError('AGENT_CONTROL_UNAVAILABLE', '应用实例控制暂不可用。');
        if (concurrency) {
          const tier = await concurrency.resolveTier();
          const existingProfiles = typeof agent.list === 'function' ? await agent.list() : [];
          concurrency.assertAgentCreateAllowed({
            tier,
            existingProfiles: Array.isArray(existingProfiles) ? existingProfiles : [],
            appId: request.appId,
            alias: request.alias,
          });
        }
        const createInput = { alias: request.alias, appId: request.appId, credentialSlotIds: request.credentialSlotIds };
        if (request.relayId !== undefined) createInput.relayId = request.relayId;
        value = projectAgentRecord(await agent.create(createInput));
      } else if (request.operation === 'agent.start') {
        const agent = agents || host.agent;
        if (!agent || typeof agent.start !== 'function') return safeError('AGENT_CONTROL_UNAVAILABLE', '应用实例控制暂不可用。');
        if (concurrency) {
          const tier = await concurrency.resolveTier();
          const allProfiles = typeof agent.list === 'function' ? await agent.list() : [];
          const matchedProfile = Array.isArray(allProfiles) ? allProfiles.find(item => (item.id || item.profileId) === request.instanceId) : null;
          const activeBrowsers = browser && typeof browser.list === 'function' ? await browser.list() : [];
          concurrency.assertAgentStartAllowed({
            tier,
            activeAgents: Array.isArray(allProfiles)
              ? allProfiles.map(item => ({ id: item.id || item.profileId, status: item.status }))
              : [],
            activeBrowsers: Array.isArray(activeBrowsers) ? activeBrowsers : [],
            instanceId: request.instanceId,
            appId: matchedProfile?.appId || '',
          });
        }
        await ensureExitGeoHydrated();
        value = projectAgentRecord(await agent.start(request.instanceId));
        telemetry?.recordEvent?.({ category: 'workbench', action: 'agent_started', appId: value?.appId || null, stage: 'workbench_launch', status: 'ok', severity: 'info', durationMs: Date.now() - opStartedAt });
      } else if (request.operation === 'agent.stop') {
        const agent = agents || host.agent;
        if (!agent || typeof agent.stop !== 'function') return safeError('AGENT_CONTROL_UNAVAILABLE', '应用实例控制暂不可用。');
        value = projectAgentRecord(await agent.stop(request.instanceId));
        telemetry?.recordEvent?.({ category: 'workbench', action: 'agent_stopped', appId: value?.appId || null, status: 'ok' });
      } else if (request.operation === 'agent.remove') {
        const agent = agents || host.agent;
        if (!agent || typeof agent.remove !== 'function') return safeError('AGENT_CONTROL_UNAVAILABLE', '应用实例控制暂不可用。');
        const removed = await agent.remove(request.instanceId);
        value = { profileId: request.instanceId, removed: Boolean(removed) };
      } else if (request.operation === 'agent.closeApp') {
        const agent = agents || host.agent;
        const stoppedProfiles = agent && typeof agent.stopAllForApp === 'function' ? await agent.stopAllForApp(request.appId) : [];
        const processResult = processRestarter && typeof processRestarter.closeAppProcesses === 'function'
          ? await processRestarter.closeAppProcesses(request.appId)
          : { appId: request.appId, supported: false, closedCount: 0, forcedCount: 0, remainingCount: 0, timedOut: false };
        if (agent && typeof agent.list === 'function' && Array.isArray(stoppedProfiles) && stoppedProfiles.length > 0) {
          const targetSet = new Set(stoppedProfiles.map(item => item.id).filter(Boolean));
          for (let i = 0; i < 15; i += 1) {
            const cur = await Promise.resolve(agent.list()).catch(() => []);
            const stillStopping = Array.isArray(cur) && cur.some(item => targetSet.has(item.profileId || item.id) && item.status === 'stopping');
            if (!stillStopping) break;
            await new Promise(r => setTimeout(r, 100));
          }
        }
        const remainingCount = typeof processResult.remainingCount === 'number' && Number.isFinite(processResult.remainingCount)
          ? processResult.remainingCount
          : 0;
        if (remainingCount === 0 && agent && typeof agent.forceClearApp === 'function') {
          agent.forceClearApp(request.appId);
        } else if (remainingCount !== 0 || processResult.timedOut) {
          telemetry?.recordEvent?.({
            category: 'workbench',
            action: 'agent_close_incomplete',
            appId: request.appId,
            stage: 'workbench_launch',
            status: 'error',
            errorCode: processResult.timedOut ? 'REQUEST_TIMEOUT' : 'AGENT_STOP_FAILED',
            durationMs: Date.now() - opStartedAt,
            retryable: true,
          });
        }
        value = {
          appId: request.appId,
          supported: Boolean(processResult.supported),
          stoppedProfiles: Array.isArray(stoppedProfiles) ? stoppedProfiles.length : 0,
          closedCount: Number(processResult.closedCount) || 0,
          forcedCount: Number(processResult.forcedCount) || 0,
          remainingCount,
          timedOut: Boolean(processResult.timedOut),
          ...(processResult.error ? { error: String(processResult.error) } : {}),
        };
      } else if (request.operation === 'agent.isRunning') {
        const agent = agents || host.agent;
        const profiles = agent && typeof agent.list === 'function'
          ? await Promise.resolve(agent.list()).catch(() => [])
          : [];
        const managedRunning = Array.isArray(profiles) && profiles.some(
          item => item?.appId === request.appId && ['starting', 'running', 'stopping'].includes(item.status),
        );
        const procProbe = processRestarter && typeof processRestarter.isAppRunning === 'function'
          ? await Promise.resolve(processRestarter.isAppRunning(request.appId)).catch(() => ({ running: false, count: 0 }))
          : { running: false, count: 0 };
        const processCount = Math.max(0, Number(procProbe?.count) || 0);
        value = {
          appId: request.appId,
          running: Boolean(managedRunning || procProbe?.running),
          managedRunning: Boolean(managedRunning),
          processCount,
        };
      }
      else if (request.operation.startsWith('accounts.')) {
        if (!accounts) return safeError('ACCOUNTS_UNAVAILABLE', '账号工作台管理暂不可用。');

        if (request.operation === 'accounts.detectAll') {
          value = await accounts.detectAll();
        } else if (request.operation === 'accounts.totpList') {
          value = await accounts.totpList();
        } else if (request.operation === 'accounts.totpCompute') {
          value = await accounts.totpCompute({ input: request.input });
        } else if (request.operation === 'accounts.totpSave') {
          value = await accounts.totpSave({ input: request.input, name: request.name });
        } else if (request.operation === 'accounts.totpRemove') {
          value = await accounts.totpRemove({ ids: request.ids, target: request.target });
        } else if (request.operation === 'accounts.totpExport') {
          value = await accounts.totpExport();
        } else if (request.operation === 'accounts.totpImport') {
          value = await accounts.totpImport({ jsonText: request.jsonText });
        } else if (request.operation === 'accounts.totpMigrationPayload') {
          value = await accounts.totpMigrationPayload({ ids: request.ids });
        } else if (request.operation === 'accounts.groupsList') {
          value = await accounts.groupsList();
        } else if (request.operation === 'accounts.groupsSave') {
          value = await accounts.groupsSave({ id: request.id, name: request.name, color: request.color });
        } else if (request.operation === 'accounts.groupsRemove') {
          value = await accounts.groupsRemove({ id: request.id });
        } else if (request.operation === 'accounts.groupsAssign') {
          value = await accounts.groupsAssign({ groupId: request.groupId, appId: request.appId, accountId: request.accountId, member: request.member });
        } else if (request.operation === 'accounts.settingsGet') {
          value = await accounts.settingsGet();
        } else if (request.operation === 'accounts.settingsUpdate') {
          value = await accounts.settingsUpdate({ autoRefreshMinutes: request.autoRefreshMinutes });
        } else if (request.operation === 'accounts.usageScan') {
          if (!usageScanner || typeof usageScanner.scanLocalUsage !== 'function') {
            return safeError('ACCOUNTS_UNAVAILABLE', '本地会话用量扫描尚未初始化。');
          }
          const curSettings = typeof accounts.settingsGet === 'function' ? await accounts.settingsGet() : { customDataDirs: {} };
          const customDir = curSettings?.customDataDirs?.[request.appId] || '';
          value = await usageScanner.scanLocalUsage({
            appId: request.appId,
            customDir,
            range: request.range,
            granularity: request.granularity,
            sessionType: request.sessionType,
            model: request.model,
            workspace: request.workspace,
            forceRescan: request.forceRescan,
          });
        } else if (request.operation === 'accounts.usageSetDir') {
          if (request.reset) {
            value = { reset: true, ...(await accounts.settingsUpdate({ customDataDir: { appId: request.appId, dirPath: '' } })) };
          } else if (request.pick) {
            const pickedPath = typeof pickDirectory === 'function' ? await pickDirectory({ appId: request.appId }) : null;
            if (!pickedPath) {
              value = { cancelled: true, ...(await accounts.settingsGet()) };
            } else {
              value = { cancelled: false, dirPath: pickedPath, ...(await accounts.settingsUpdate({ customDataDir: { appId: request.appId, dirPath: pickedPath } })) };
            }
          } else {
            value = { dirPath: request.dirPath, ...(await accounts.settingsUpdate({ customDataDir: { appId: request.appId, dirPath: request.dirPath } })) };
          }
        } else if (request.operation === 'accounts.wakeupList') {
          value = wakeup ? await wakeup.list({ appId: request.appId }) : { tasks: [], history: [] };
        } else if (request.operation === 'accounts.wakeupSave') {
          if (!wakeup) return safeError('ACCOUNTS_UNAVAILABLE', '唤醒任务调度器未就绪。');
          value = await wakeup.save(request);
        } else if (request.operation === 'accounts.wakeupToggle') {
          if (!wakeup) return safeError('ACCOUNTS_UNAVAILABLE', '唤醒任务调度器未就绪。');
          value = await wakeup.toggle({ id: request.id, ...(request.enabled !== undefined ? { enabled: request.enabled } : {}) });
        } else if (request.operation === 'accounts.wakeupRemove') {
          if (!wakeup) return safeError('ACCOUNTS_UNAVAILABLE', '唤醒任务调度器未就绪。');
          value = await wakeup.remove({ id: request.id });
        } else if (request.operation === 'accounts.wakeupRunNow') {
          if (!wakeup) return safeError('ACCOUNTS_UNAVAILABLE', '唤醒任务调度器未就绪。');
          value = await wakeup.runNow({ id: request.id });
        } else if (request.operation === 'accounts.list') {
          value = await accounts.list(request.appId);
        } else if (request.operation === 'accounts.importLocal') {
          value = await accounts.importLocal({
            appId: request.appId,
            alias: request.alias,
            all: request.all,
            silent: request.silent,
          });
        } else if (request.operation === 'accounts.add') {
          value = { account: await accounts.add(request) };
        } else if (request.operation === 'accounts.oauthStart') {
          if (!oauth) return safeError('OAUTH_FLOW_UNSUPPORTED', 'OAuth 授权通道尚未就绪。');
          value = await oauth.start({ appId: request.appId, alias: request.alias });
        } else if (request.operation === 'accounts.oauthStatus') {
          if (!oauth) return safeError('OAUTH_FLOW_UNSUPPORTED', 'OAuth 授权通道尚未就绪。');
          value = await oauth.status({ flowId: request.flowId });
        } else if (request.operation === 'accounts.oauthCopyUrl') {
          if (!oauth) return safeError('OAUTH_FLOW_UNSUPPORTED', 'OAuth 授权通道尚未就绪。');
          const flow = await oauth.status({ flowId: request.flowId });
          const rawUrl = typeof flow?.authUrl === 'string' && flow.authUrl.trim()
            ? flow.authUrl.trim()
            : (typeof flow?.verificationUri === 'string' && flow.verificationUri.trim() ? flow.verificationUri.trim() : '');
          let safeAuthUrl = '';
          try {
            const parsed = new URL(rawUrl);
            if (parsed.protocol === 'https:') safeAuthUrl = parsed.toString();
          } catch {}
          if (!safeAuthUrl) return safeError('OAUTH_FLOW_NOT_FOUND', '当前授权流程暂无可复制的授权链接。');
          let copied = false;
          if (typeof writeClipboardText === 'function') {
            try {
              writeClipboardText(safeAuthUrl);
              copied = true;
            } catch {
              copied = false;
            }
          }
          value = { copied, url: safeAuthUrl };
        } else if (request.operation === 'accounts.oauthSubmitCallback') {
          if (!oauth) return safeError('OAUTH_FLOW_UNSUPPORTED', 'OAuth 授权通道尚未就绪。');
          value = await oauth.submitCallback({ flowId: request.flowId, callbackUrl: request.callbackUrl });
        } else if (request.operation === 'accounts.oauthCancel') {
          if (!oauth) return safeError('OAUTH_FLOW_UNSUPPORTED', 'OAuth 授权通道尚未就绪。');
          value = await oauth.cancel({ flowId: request.flowId });
        } else if (request.operation === 'accounts.importToken') {
          value = await accounts.importToken(request);
        } else if (request.operation === 'accounts.importJson') {
          value = await accounts.importJson({ appId: request.appId, jsonText: request.jsonText, maxAllowed: 64 });
        } else if (request.operation === 'accounts.exportJson') {
          value = await accounts.exportJson({ appId: request.appId, accountIds: request.accountIds });
        } else if (request.operation === 'accounts.updateMeta') {
          value = await accounts.updateMeta(request);
        } else if (request.operation === 'accounts.batchRemove') {
          value = await accounts.batchRemove(request);
        } else if (request.operation === 'accounts.switch') {
          value = await accounts.switchAccount({ appId: request.appId, accountId: request.accountId });
          telemetry?.recordEvent?.({ category: 'account_switch', action: 'account_switched', appId: request.appId, stage: 'account_switch', status: 'ok', severity: 'info', durationMs: Date.now() - opStartedAt });
        } else if (request.operation === 'accounts.refreshQuota') {
          value = await accounts.refreshQuota({ appId: request.appId, accountId: request.accountId });
        } else if (request.operation === 'accounts.remove') {
          value = await accounts.remove({ appId: request.appId, accountId: request.accountId });
        }
      }
      else {
        value = projectClientRead(request.kind, await host.read(request.kind, request.args));
        concurrency?.observeProjectedRead?.(request.kind, value);
        if (request.kind === 'relays') relayCache?.update?.(value);
        if ((request.kind === 'overview' || request.kind === 'tunnelStatus') && value?.exitContext !== undefined) {
          environment?.updateExitGeo?.(value.exitContext);
        }
      }
      if (!senderAllowed(event, getWindow(), portalUrl)) return safeError('IPC_SENDER_INVALID', '桌面请求来源无效。');
      return { ok: true, value };
    } catch (error) {
      const exposedCode = ['ACCOUNT_DISABLED','DEVICE_LIMIT_REACHED','DEVICE_LIMIT_NOT_CONFIGURED','IDENTITY_UNAVAILABLE','SESSION_INVALID','REFRESH_REPLAY','AUTHORIZATION_CODE_INVALID','AUTHORIZATION_TIMEOUT','AUTHORIZATION_DENIED','BROWSER_UNAVAILABLE','BROWSER_OPEN_FAILED','BROWSER_LOAD_FAILED','BROWSER_PROXY_FAILED','BROWSER_URL_NOT_ALLOWED','RELAY_NOT_AVAILABLE','PERSONAL_MULTI_LOGIN_FORBIDDEN','PERSONAL_SINGLE_OPEN_LIMIT','LOCAL_INSTANCE_LIMIT_REACHED','AGENT_ACTIVE','ACCOUNT_NOT_FOUND','LOCAL_ACCOUNT_NOT_FOUND','ACCOUNT_LIMIT_REACHED','ACCOUNT_SWITCH_FAILED','ACCOUNT_APP_UNSUPPORTED','ACCOUNT_ALIAS_INVALID','OAUTH_FLOW_UNSUPPORTED','OAUTH_FLOW_NOT_FOUND','OAUTH_TOKEN_EXCHANGE_FAILED','TOKEN_INVALID','JSON_IMPORT_INVALID','CREDENTIAL_WRITE_FAILED','ANTIGRAVITY_CREDENTIAL_TOO_LARGE','TOTP_SECRET_INVALID','PROXY_CONNECT_FAILED','QUOTA_FETCH_FAILED','AUTH_FAILED','CALLBACK_LISTEN_FAILED','TELEMETRY_PRIVACY_VIOLATION','TICKET_NOT_FOUND','TICKET_STATE_CONFLICT','REQUEST_FAILED','FORBIDDEN','INSUFFICIENT_SCOPE','RATE_LIMITED','INTERNAL_ERROR','VALIDATION_ERROR','AUTH_UNAVAILABLE','UPSTREAM_UNAVAILABLE','CONTRACT_MISMATCH','PRODUCTION_MAPPING_NOT_READY','BRIDGE_UNAVAILABLE','CONFIG_AUTHORIZATION_INVALID','SUBSCRIPTION_DISABLED','PRODUCTION_LEASE_UNAVAILABLE','PROXY_DNS_ERROR','PROXY_ACCESS_DENIED','PROXY_ROUTE_ERROR','PROXY_SPAWN_ERROR','PROXY_LISTEN_TIMEOUT','PROXY_FRONTEND_EXITED','PROXY_START_PENDING','LAUNCH_FAILED','AGENT_START_FAILED','EPERM','EACCES','ENOENT','TEMPLATE_INVALID'].includes(error?.code);
      const code = exposedCode ? error.code : error?.status === 401 ? 'AUTH_REQUIRED' : ['AUTH_REQUIRED', 'AUTH_IN_PROGRESS', 'AUTH_BROWSER_OPEN_FAILED', 'AUTHORIZATION_CANCELLED', 'SECURE_STORE_UNAVAILABLE', 'SECURE_STORE_OPERATION_FAILED', 'READ_NOT_ALLOWED', 'INVALID_RESPONSE', 'REQUEST_TIMEOUT', 'NETWORK_ERROR', 'PROXY_CONTROL_UNAVAILABLE', 'PROXY_CONTROL_FAILED', 'PROXY_CONFIG_UNAVAILABLE', 'PROXY_CONFIG_INVALID', 'PROXY_CONFIG_WRITE_FAILED', 'PROXY_BINARY_UNAVAILABLE', 'PROXY_PORT_IN_USE', 'PROXY_START_CANCELLED', 'PROXY_START_FAILED', 'PROXY_ALREADY_RUNNING', 'AGENT_CONTROL_FAILED', 'AGENT_ALREADY_RUNNING', 'AGENT_INSTANCE_NOT_FOUND', 'AGENT_STOP_FAILED', 'AGENT_STOP_UNAVAILABLE', 'LOCAL_PROXY_NOT_READY', 'PROFILE_ALIAS_CONFLICT', 'PROFILE_INPUT_NOT_ALLOWED'].includes(error?.code) ? error.code : 'DESKTOP_OPERATION_FAILED';
      let auditCode = null;
      if (code === 'DESKTOP_OPERATION_FAILED') {
        const rawCode = typeof error?.code === 'string' ? error.code : '';
        const errName = typeof error?.name === 'string' ? error.name : '';
        auditCode = ['AGENT_ADAPTER_UNKNOWN', 'PROFILE_INVALID', 'PROFILE_TEMPLATE_INVALID', 'IPC_MESSAGE_INVALID'].includes(rawCode)
          ? rawCode
          : rawCode.startsWith('SAFE_ENV_')
            ? 'SAFE_ENV_INVALID'
            : errName === 'TypeError'
              ? 'JS_TYPE_ERROR'
              : errName === 'RangeError'
                ? 'JS_RANGE_ERROR'
                : errName === 'ReferenceError'
                  ? 'JS_REFERENCE_ERROR'
                  : errName === 'SyntaxError'
                    ? 'JS_SYNTAX_ERROR'
                    : 'IPC_UNCAUGHT';
        if (typeof onAudit === 'function') {
          try { onAudit('ipc_operation_failed', { code: auditCode }); } catch {}
        }
      }
      const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 0;
      if (telemetry && typeof telemetry.recordEvent === 'function' && !error?._telemetryRecorded) {
        const op = request.operation;
        let mapped = null;
        if (op === 'auth.login') mapped = { category: 'auth', stage: 'pkce_login' };
        else if (op === 'auth.logout') mapped = { category: 'auth', stage: 'logout' };
        else if (op === 'proxy.mode.set') mapped = { category: 'tunnel', stage: 'core_start' };
        else if (op === 'proxy.start') mapped = { category: 'tunnel', stage: 'core_start' };
        else if (op === 'browser.open' || op === 'agent.create' || op === 'agent.start' || op === 'agent.stop' || op === 'agent.closeApp') {
          mapped = { category: 'workbench', stage: 'workbench_launch' };
        } else if (op === 'accounts.switch' || op === 'accounts.oauthStart' || op === 'accounts.oauthSubmitCallback' || op === 'accounts.importToken' || op === 'accounts.refreshQuota') {
          mapped = { category: 'account_switch', stage: 'account_switch' };
        }
        if (mapped) {
          const isWarn = ['AUTHORIZATION_CANCELLED', 'PROXY_START_CANCELLED', 'PERSONAL_SINGLE_OPEN_LIMIT', 'LOCAL_INSTANCE_LIMIT_REACHED', 'PERSONAL_MULTI_LOGIN_FORBIDDEN'].includes(code);
          try {
            telemetry.recordEvent({
              category: mapped.category,
              action: `${op.replace(/\./g, '_')}_failed`,
              appId: typeof request.appId === 'string' ? request.appId : null,
              stage: mapped.stage,
              status: isWarn ? 'warn' : 'error',
              errorCode: code === 'DESKTOP_OPERATION_FAILED' ? (auditCode || 'IPC_UNCAUGHT') : code,
              httpStatus: status || null,
              durationMs: Math.max(0, Date.now() - opStartedAt),
              requestId: error?.requestId || null,
            });
          } catch {}
        }
      }
      const messages = { LAUNCH_FAILED:'应用进程未能启动，请确认客户端已正确安装。', AGENT_START_FAILED:'应用实例未能启动，请检查客户端安装状态后重试。', AGENT_STOP_FAILED:'应用旧进程停止未完成，请稍后重试。', AGENT_STOP_UNAVAILABLE:'应用旧进程句柄已失效，请稍后重试。', EPERM:'系统权限阻止了直接启动该应用（如商店版受保护目录），请重新检测后通过受控方式启动。', EACCES:'当前权限不足，无法访问目标应用可执行文件。', ENOENT:'未在本机找到目标应用可执行文件，请检查安装路径。', TEMPLATE_INVALID:'应用启动模板无效，请刷新应用目录后重试。', PROXY_DNS_ERROR:'sing-box DNS 初始化失败，请检查网络设置后重试。', PROXY_ACCESS_DENIED:'本地代理启动权限不足，请检查系统权限后重试。', PROXY_ROUTE_ERROR:'本地代理路由初始化失败，请检查本机网络后重试。', PROXY_SPAWN_ERROR:'无法拉起内置 sing-box 内核进程，请检查安全软件拦截或重新下载安装。', PROXY_LISTEN_TIMEOUT:'sing-box 启动超时，未能监听 127.0.0.1:17899，请重试。', PROXY_FRONTEND_EXITED:'本机代理内核意外退出，请重新连接或查看连接诊断。', PROXY_START_PENDING:'本机代理正在初始化，请稍候。', INTERNAL_ERROR:'运营端服务暂遇内部错误，请稍后重试。', VALIDATION_ERROR:'请求参数不符合服务契约，请刷新后重试。', AUTH_UNAVAILABLE:'主站认证服务暂时不可用，请稍后重试。', TELEMETRY_PRIVACY_VIOLATION:'遥测上报包含敏感字段，已被拒绝。', TICKET_NOT_FOUND:'工单不存在或无权查看。', TICKET_STATE_CONFLICT:'当前工单状态不允许执行该操作。', CONFIG_AUTHORIZATION_INVALID:'本次连接授权已失效，请重新连接。', SUBSCRIPTION_DISABLED:'当前权益暂不可用，请联系运营。', PRODUCTION_LEASE_UNAVAILABLE:'生产连接暂未就绪，请稍后重试。', PROXY_START_CANCELLED:'已取消本地连接。', REQUEST_FAILED:'主站暂时无法完成请求，请检查运营端接口和 request_id。', FORBIDDEN:'当前设备没有执行此操作的权限。', INSUFFICIENT_SCOPE:'当前设备授权范围不足，请重新授权。', RATE_LIMITED:'请求过于频繁，请稍后重试。', UPSTREAM_UNAVAILABLE:'生产端服务暂时不可用，请稍后重试。', CONTRACT_MISMATCH:'生产端返回格式与契约不一致。', PRODUCTION_MAPPING_NOT_READY:'生产绑定尚未准备完成，请联系运营确认。', BRIDGE_UNAVAILABLE:'生产端连接桥暂时不可用，请稍后重试。', ACCOUNT_DISABLED:'账号尚未开通、已到期或已停用，请联系运营确认权益。', DEVICE_LIMIT_REACHED:'已达到套餐设备上限，请先管理已有设备。', DEVICE_LIMIT_NOT_CONFIGURED:'账号设备额度尚未配置，请联系运营确认。', IDENTITY_UNAVAILABLE:'当前没有可用连接身份，请联系运营确认。', SESSION_INVALID:'设备会话已失效，请重新授权。', REFRESH_REPLAY:'设备会话已撤销，请重新授权。', AUTHORIZATION_CODE_INVALID:'授权码无效或已过期，请重新发起授权。', AUTHORIZATION_TIMEOUT:'等待浏览器授权超时，请重新发起。', AUTHORIZATION_DENIED:'已取消浏览器授权。', BROWSER_UNAVAILABLE:'隔离浏览器暂不可用。', BROWSER_OPEN_FAILED:'隔离浏览器打开失败，请检查连接。', BROWSER_LOAD_FAILED:'容器加载失败，请检查网络环境或目标站点。', BROWSER_PROXY_FAILED:'容器代理准备失败，请先重新连接定途。', RELAY_NOT_AVAILABLE:'所选定途自有中转站暂不可用，请先同步运营端中转站目录。', PERSONAL_MULTI_LOGIN_FORBIDDEN:'个人版限制为单终端唯一连接，本机已开放多账号分区。', PERSONAL_SINGLE_OPEN_LIMIT:'个人版限制为单终端唯一连接，本机已开放多应用并行。', LOCAL_INSTANCE_LIMIT_REACHED:'本机同时运行的应用与容器已达上限（16 个），请先关闭部分实例后重试。', AGENT_ACTIVE:'应用实例仍在运行，请先停止后再移除。', ACCOUNT_NOT_FOUND:'目标应用账号不存在。', LOCAL_ACCOUNT_NOT_FOUND:'未在本机检测到该应用的已登录配置，可先打开应用登录或添加账号槽位。', ACCOUNT_LIMIT_REACHED:'单个应用最多支持 64 个托管账号。', ACCOUNT_SWITCH_FAILED:'切换本机应用凭据失败，请确认目标应用已关闭且该账号凭据与目标邮箱一致（如异常请重新导入或重新授权）。', ACCOUNT_APP_UNSUPPORTED:'暂不支持该应用标识。', ACCOUNT_ALIAS_INVALID:'账号标识只能使用小写字母、数字、下划线或短横线。', OAUTH_FLOW_UNSUPPORTED:'该应用暂不支持网页 OAuth，请使用 Token 或本机导入。', OAUTH_FLOW_NOT_FOUND:'授权会话不存在或已结束。', OAUTH_TOKEN_EXCHANGE_FAILED:'OAuth 授权兑换或 Refresh Token 刷新失败，请检查网络与令牌有效性。', TOKEN_INVALID:'请输入有效的账号 Token 或 Refresh Token。', JSON_IMPORT_INVALID:'JSON 导入数据无效或格式不受支持。', CREDENTIAL_WRITE_FAILED:'写入系统凭据管理器失败，请确认权限后重试。', ANTIGRAVITY_CREDENTIAL_TOO_LARGE:'Antigravity 凭据体积超出 Windows 凭据管理器上限（2560 字节）。', TOTP_SECRET_INVALID:'2FA 秘钥无效，请输入 Base32 秘钥或 otpauth:// 链接。', PROXY_CONNECT_FAILED:'安全通道上游握手未完成，请确认连接已开启。', QUOTA_FETCH_FAILED:'上游配额查询未成功，请稍后刷新重试。', AUTH_FAILED:'桌面登录未完成，请重新点击浏览器登录。', CALLBACK_LISTEN_FAILED:'本机授权接收器无法启动，请关闭重复运行的定途后重试。', BROWSER_URL_NOT_ALLOWED:'该浏览器地址不被允许。', AUTH_REQUIRED: '请先完成桌面登录。', AUTH_IN_PROGRESS: '登录已经在进行中。', AUTH_BROWSER_OPEN_FAILED: '无法打开内置授权浏览器。', AUTHORIZATION_CANCELLED: '已取消登录。', SECURE_STORE_UNAVAILABLE: '本机安全存储不可用。', SECURE_STORE_OPERATION_FAILED: '本机安全存储读写失败，请检查系统密钥库状态后重试。', READ_NOT_ALLOWED: '读取类型不在允许范围内。', INVALID_RESPONSE: '服务返回的数据格式无效。', REQUEST_TIMEOUT: '服务响应超时。', NETWORK_ERROR: '暂时无法连接主站。', PROXY_CONTROL_UNAVAILABLE: '本地代理控制暂不可用。', PROXY_CONTROL_FAILED: '本地代理状态无效。', PROXY_CONFIG_UNAVAILABLE: '服务端隧道配置暂不可用。', PROXY_CONFIG_INVALID: '服务端隧道配置无效。', PROXY_CONFIG_WRITE_FAILED: '本地隧道配置无法安全写入。', PROXY_BINARY_UNAVAILABLE: '缺少定途内置的 sing-box 内核，请重新检查运行环境。', PROXY_PORT_IN_USE: '本机 17899 端口已被占用，请关闭占用端口的应用后重试。', PROXY_START_FAILED: '本机代理启动失败。', PROXY_ALREADY_RUNNING: '本机代理已经在运行。', AGENT_CONTROL_FAILED: '应用实例状态无效。', AGENT_ALREADY_RUNNING: '应用实例已经在运行。', AGENT_INSTANCE_NOT_FOUND: '应用实例不存在。', LOCAL_PROXY_NOT_READY: '本机 17899 代理尚未就绪。', PROFILE_ALIAS_CONFLICT: '应用实例名称已经存在。', PROFILE_INPUT_NOT_ALLOWED: '应用实例参数无效。', DESKTOP_OPERATION_FAILED: '桌面操作未完成。' };
      return safeError(code, messages[code], status, error?.requestId);
    }
  };
  ipcMain.handle(DESKTOP_CHANNEL, handler);
  return () => ipcMain.removeHandler(DESKTOP_CHANNEL);
}
