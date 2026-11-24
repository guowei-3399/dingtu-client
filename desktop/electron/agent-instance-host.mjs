import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAgentProfile, createAgentProfileStore, materializeAgentProfile } from './agent-profiles.mjs';
import { getBuiltInAgentAdapter, listWorkbenchAgentAdapters } from './builtin-agent-adapters.mjs';
import { isTunnelEnvironmentMode } from './environment-mode.mjs';
import { buildSafeLaunchAugmentation, resolveInstanceProfileDir } from './safe-environment.mjs';

const fail = (code, message = code) => Object.assign(new Error(message), { code });
const clone = value => structuredClone(value);
const allowedCreateKeys = new Set(['alias', 'appId', 'credentialSlotIds', 'relayId']);

const DEFAULT_IDE_DIR_CANDIDATES = Object.freeze({
  antigravity: ['Antigravity IDE', 'Antigravity'],
  cursor: ['Cursor'],
  windsurf: ['Windsurf'],
  kiro: ['Kiro'],
});

function seedSecondaryIdeStateDb(appId, profileDir, platform, appDataDir) {
  if (!profileDir || !DEFAULT_IDE_DIR_CANDIDATES[appId]) return;
  try {
    const targetDb = path.join(profileDir, 'User', 'globalStorage', 'state.vscdb');
    if (existsSync(targetDb)) return;
    const baseDir = appDataDir || (
      platform === 'windows' ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
        : platform === 'macos' ? path.join(os.homedir(), 'Library', 'Application Support')
        : path.join(os.homedir(), '.config')
    );
    for (const folder of DEFAULT_IDE_DIR_CANDIDATES[appId]) {
      const sourceDb = path.join(baseDir, folder, 'User', 'globalStorage', 'state.vscdb');
      if (existsSync(sourceDb)) {
        mkdirSync(path.dirname(targetDb), { recursive: true });
        copyFileSync(sourceDb, targetDb);
        return;
      }
    }
  } catch {
    // Best-effort warmup only; never block secondary launch.
  }
}

export function createAgentInstanceHost({
  platform,
  launcher,
  isAuthenticated = () => false,
  isProxyReady = () => false,
  environmentModeProvider = () => 'safe_tunnel',
  relayResolver = () => null,
  scopeProvider = () => null,
  profileRootDir = null,
  now = Date.now,
} = {}) {
  if (!platform || !launcher || typeof launcher.plan !== 'function' || typeof launcher.launch !== 'function') throw fail('AGENT_INSTANCE_CONFIGURATION_INVALID');
  const profiles = createAgentProfileStore();
  const records = new Map();
  const children = new Map();
  const shellActivatedIds = new Set();

  function adapters() {
    return listWorkbenchAgentAdapters(platform).map(item => ({
      id: item.id,
      name: item.name,
      category: item.category || 'coding',
      adapter: item.template.adapter,
      relayProtocol: item.relayProtocol ?? null,
    }));
  }

  function create(input = {}) {
    if (!input || typeof input !== 'object' || Object.keys(input).some(key => !allowedCreateKeys.has(key))) throw fail('PROFILE_INPUT_NOT_ALLOWED');
    const adapter = getBuiltInAgentAdapter(input.appId, platform);
    const args = { alias: input.alias, app: adapter, credentialSlotIds: input.credentialSlotIds, now };
    if (input.relayId !== undefined) args.relayId = input.relayId;
    return profiles.create(buildAgentProfile(args));
  }

  function list() {
    return profiles.list().map(profile => {
      const runtime = records.get(profile.id) ? clone(records.get(profile.id)) : null;
      return {
        ...profile,
        status: runtime ? runtime.status : profile.status,
        pid: runtime ? runtime.pid : null,
        activation: runtime ? runtime.activation : (profile.adapter === 'electron-launch' ? 'restart-required' : 'immediate'),
        error: runtime ? runtime.error : null,
        runtime,
      };
    });
  }

  function status(id) { return records.has(id) ? clone(records.get(id)) : null; }

  async function inspect(appId) {
    const adapter = getBuiltInAgentAdapter(appId, platform);
    const plan = launcher.plan(adapter);
    const detected = typeof launcher.detect === 'function' ? await launcher.detect(adapter) : { status: 'unknown' };
    return Object.freeze({ appId: plan.appId, status: detected.status, activation: plan.activation, path: detected.path ?? null, command: detected.command ?? plan.command });
  }

  function start(id) {
    if (typeof id !== 'string' || !id) throw fail('AGENT_INSTANCE_NOT_FOUND');
    const profile = profiles.get(id); if (!profile) throw fail('AGENT_INSTANCE_NOT_FOUND', '应用实例不存在。');
    const current = records.get(id);
    if (current && ['starting', 'running', 'stopping'].includes(current.status) && !shellActivatedIds.has(id)) {
      throw fail('AGENT_ALREADY_RUNNING', '应用实例已经在运行。');
    }
    if (isAuthenticated() !== true) throw fail('AUTH_REQUIRED', '请先完成桌面登录。');
    const rawMode = environmentModeProvider();
    const mode = rawMode === 'own_network' ? 'own_network' : 'safe_tunnel';
    const tunnelMode = isTunnelEnvironmentMode(mode);
    if (tunnelMode && isProxyReady() !== true) throw fail('LOCAL_PROXY_NOT_READY', '本机 17899 代理尚未就绪。');

    const adapter = getBuiltInAgentAdapter(profile.appId, platform);
    const plan = materializeAgentProfile(profile, adapter);

    let child;
    const scope = scopeProvider();
    let relayEndpoint = null;
    if (profile.relayId) {
      relayEndpoint = relayResolver(profile.relayId);
      if (!relayEndpoint) throw fail('RELAY_NOT_AVAILABLE', '所选定途自有中转站暂不可用，请在设置中刷新中转站目录。');
    }

    const useSafeAugmentation = typeof launcher.launchWithSafeContext === 'function';
    if (useSafeAugmentation) {
      const isDefaultInstance = profile.id === 'main'
        || profile.id === 'default'
        || profile.id === `${profile.appId}-main`
        || profile.id === `${profile.appId}-default`;
      const profileDir = !isDefaultInstance && profileRootDir && scope
        ? resolveInstanceProfileDir({ rootDir: profileRootDir, scope, appId: profile.appId, instanceId: profile.id })
        : null;
      if (profileDir && adapter.template.adapter === 'electron-launch') {
        seedSecondaryIdeStateDb(profile.appId, profileDir, platform);
      }
      const augmentation = buildSafeLaunchAugmentation({
        mode,
        adapter: adapter.template.adapter,
        appId: profile.appId,
        profileDir,
        relayEndpoint,
      });
      child = launcher.launchWithSafeContext(adapter, augmentation);
    } else {
      child = launcher.launch(adapter);
    }

    if (!child || typeof child.once !== 'function') throw fail('AGENT_START_FAILED', '应用实例未能启动。');
    const isShellActivated = Boolean(child.dingtuShellActivated);
    const record = { id, appId: profile.appId, status: 'starting', activation: plan.activation, pid: Number.isSafeInteger(child.pid) ? child.pid : null, error: null };
    records.set(id, record);
    children.set(id, child);
    if (isShellActivated) shellActivatedIds.add(id);
    else shellActivatedIds.delete(id);
    child.once('spawn', () => { if (records.get(id) === record) record.status = 'running'; });
    child.once('error', () => { if (records.get(id) === record) { children.delete(id); shellActivatedIds.delete(id); record.status = 'failed'; record.error = 'spawn_error'; } });
    child.once('exit', (code, signal) => { if (records.get(id) !== record) return; children.delete(id); shellActivatedIds.delete(id); record.status = code === 0 ? 'stopped' : 'failed'; record.error = code === 0 ? null : (signal ? `signal:${signal}` : `code:${code ?? 'unknown'}`); });
    return clone(record);
  }

  function stop(id) {
    const profile = profiles.get(id); if (!profile) throw fail('AGENT_INSTANCE_NOT_FOUND', '应用实例不存在。');
    const record = records.get(id); if (!record || !['starting', 'running'].includes(record.status)) return clone(record || { id, appId: profile.appId, status: 'stopped', activation: profile.adapter === 'electron-launch' ? 'restart-required' : 'immediate', pid: null, error: null });
    if (shellActivatedIds.has(id)) {
      shellActivatedIds.delete(id);
      children.delete(id);
      record.status = 'stopped';
      record.error = null;
      return clone(record);
    }
    record.status = 'stopping';
    const child = children.get(id);
    if (!child || typeof child.kill !== 'function') throw fail('AGENT_STOP_UNAVAILABLE', '应用实例无法停止。');
    try { child.kill(); } catch { record.status = 'failed'; record.error = 'stop_error'; throw fail('AGENT_STOP_FAILED', '应用实例停止失败。'); }
    return clone(record);
  }

  function stopAllForApp(appId) {
    if (typeof appId !== 'string' || !appId) return [];
    const targetIds = appId === 'codex' || appId === 'codex-desktop' || appId === 'codex-cli'
      ? new Set(['codex', 'codex-desktop', 'codex-cli'])
      : new Set([appId]);
    const stopped = [];
    for (const [id, record] of records.entries()) {
      if (!targetIds.has(record.appId)) continue;
      if (['starting', 'running'].includes(record.status)) {
        try { stopped.push(stop(id)); } catch {}
      } else if (record.status === 'stopping') {
        stopped.push(clone(record));
      }
    }
    return stopped;
  }

  function forceClearApp(appId) {
    if (typeof appId !== 'string' || !appId) return 0;
    const targetIds = appId === 'codex' || appId === 'codex-desktop' || appId === 'codex-cli'
      ? new Set(['codex', 'codex-desktop', 'codex-cli'])
      : new Set([appId]);
    let cleared = 0;
    for (const [id, record] of records.entries()) {
      if (!targetIds.has(record.appId)) continue;
      if (['starting', 'running', 'stopping'].includes(record.status)) {
        children.delete(id);
        shellActivatedIds.delete(id);
        record.status = 'stopped';
        record.error = null;
        cleared += 1;
      }
    }
    return cleared;
  }

  function remove(id) {
    const current = records.get(id); if (current && ['starting', 'running', 'stopping'].includes(current.status)) throw fail('AGENT_ACTIVE', '应用实例仍在运行。');
    records.delete(id);
    return profiles.remove(id);
  }

  return Object.freeze({ adapters, create, list, status, inspect, start, stop, stopAllForApp, forceClearApp, remove });
}
