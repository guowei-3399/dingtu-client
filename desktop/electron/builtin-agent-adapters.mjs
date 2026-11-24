const platforms = new Set(['windows', 'macos', 'linux']);
const fail = (code, message = code) => Object.assign(new Error(message), { code });
const env = Object.freeze({ HTTP_PROXY: '{{local.http}}', HTTPS_PROXY: '{{local.https}}', ALL_PROXY: '{{local.socks5}}', NO_PROXY: '{{local.host}}' });
const electronProxyArgs = Object.freeze(['--proxy-server={{local.http}}', '--proxy-bypass-list=localhost;127.0.0.1;[::1];<local>']);

// Core baseline specs kept in exact legacy order for v1 contract tests.
const coreSpecs = Object.freeze([
  { id: 'claude-code', name: 'Claude Code', category: 'coding', relayProtocol: 'anthropic', adapter: 'env-launch', command: 'claude', names: { default: ['claude', 'claude.exe', 'claude.cmd'] } },
  { id: 'codex-cli', name: 'Codex', category: 'coding', relayProtocol: 'openai', adapter: 'env-launch', command: 'codex', names: { default: ['codex', 'codex.exe', 'codex.cmd'] } },
  { id: 'claude-desktop', name: 'Claude Desktop', category: 'general', relayProtocol: 'anthropic', adapter: 'electron-launch', command: 'claude', names: { windows: ['Claude.exe', 'claude'], macos: ['/Applications/Claude.app/Contents/MacOS/Claude', 'claude'], linux: ['claude', 'Claude.exe'] }, args: electronProxyArgs },
  { id: 'claude-dot', name: 'Claude Dot', category: 'coding', relayProtocol: 'anthropic', adapter: 'electron-launch', command: 'claude-dot', names: { default: ['claude-dot', 'claude-dot.exe'] }, args: electronProxyArgs },
]);

// Complete Dingtu 2.0 Workbench adapters (100% clean-room self-developed):
// Covers retained core Cockpit platforms + Gemini CLI + Meta Muse (macOS native).
const extendedSpecs = Object.freeze([
  { id: 'antigravity', name: 'Antigravity', category: 'coding', relayProtocol: 'gemini', adapter: 'electron-launch', command: 'Antigravity', names: { windows: ['Antigravity.exe', 'agy.cmd', 'agy'], macos: ['/Applications/Antigravity.app/Contents/MacOS/Antigravity', 'agy'], linux: ['antigravity', 'agy'] }, args: electronProxyArgs },
  { id: 'antigravity-cli', name: 'Antigravity CLI', category: 'coding', relayProtocol: 'gemini', adapter: 'env-launch', command: 'agy', names: { windows: ['agy.exe', 'agy.cmd', 'agy'], macos: ['agy'], linux: ['agy'] } },
  { id: 'codex-desktop', name: 'Codex Desktop', category: 'coding', relayProtocol: 'openai', adapter: 'electron-launch', command: 'Codex', names: { windows: ['Codex.exe', 'codex-desktop.exe'], macos: ['/Applications/Codex.app/Contents/MacOS/Codex', 'Codex'], linux: ['codex-desktop', 'Codex'] }, args: electronProxyArgs },
  { id: 'copilot', name: 'GitHub Copilot', category: 'coding', relayProtocol: 'openai', adapter: 'electron-launch', command: 'code', names: { windows: ['Code.exe', 'code.cmd', 'code'], macos: ['/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code', 'code'], linux: ['code'] }, args: electronProxyArgs },
  { id: 'windsurf', name: 'Windsurf', category: 'coding', relayProtocol: 'openai', adapter: 'electron-launch', command: 'Windsurf', names: { windows: ['Windsurf.exe', 'windsurf.cmd', 'windsurf'], macos: ['/Applications/Windsurf.app/Contents/MacOS/Electron', 'windsurf'], linux: ['windsurf', 'Windsurf'] }, args: electronProxyArgs },
  { id: 'kiro', name: 'Kiro', category: 'coding', relayProtocol: 'anthropic', adapter: 'electron-launch', command: 'Kiro', names: { windows: ['Kiro.exe', 'kiro.cmd', 'kiro'], macos: ['/Applications/Kiro.app/Contents/MacOS/Electron', 'kiro'], linux: ['kiro', 'Kiro'] }, args: electronProxyArgs },
  { id: 'cursor', name: 'Cursor', category: 'coding', relayProtocol: 'openai', adapter: 'electron-launch', command: 'Cursor', names: { windows: ['Cursor.exe', 'cursor.cmd', 'cursor'], macos: ['/Applications/Cursor.app/Contents/MacOS/Cursor', 'cursor'], linux: ['cursor', 'Cursor'] }, args: electronProxyArgs },
  { id: 'grok-cli', name: 'Grok CLI', category: 'coding', relayProtocol: 'xai', adapter: 'env-launch', command: 'grok', names: { default: ['grok', 'grok.cmd', 'grok.exe'] } },
  { id: 'gemini-cli', name: 'Gemini CLI', category: 'coding', relayProtocol: 'gemini', adapter: 'env-launch', command: 'gemini', names: { default: ['gemini', 'gemini.cmd', 'gemini.exe'] } },
  { id: 'muse-desktop', name: 'Meta Muse (macOS)', category: 'task', relayProtocol: null, adapter: 'electron-launch', supportedPlatforms: ['macos'], command: '/Applications/Muse.app/Contents/MacOS/Muse', names: { macos: ['/Applications/Muse.app/Contents/MacOS/Muse', 'Muse'] }, args: electronProxyArgs },
]);

const allSpecs = Object.freeze([...coreSpecs, ...extendedSpecs]);

function resolveNames(spec, platform) {
  if (Array.isArray(spec.names)) return [...spec.names];
  return [...(spec.names[platform] || spec.names.default || [spec.command])];
}

function build(spec, platform) {
  const names = resolveNames(spec, platform);
  const command = spec.id === 'claude-desktop' && platform === 'linux'
    ? 'claude'
    : (spec.command || names[0]);
  return Object.freeze({
    id: spec.id,
    appId: spec.id,
    name: spec.name,
    category: spec.category || 'coding',
    relayProtocol: spec.relayProtocol ?? null,
    platform,
    source: 'builtin',
    platformStatus: 'beta',
    template: Object.freeze({
      status: 'beta',
      adapter: spec.adapter,
      templateRevision: 1,
      detect: Object.freeze({ kind: 'executable', names }),
      launch: Object.freeze({ kind: 'exec', argv: [command, ...(spec.args || [])], env }),
      account: Object.freeze({ provider: 'none', mode: 'none', rotation: 'disabled', restart: 'none' }),
      packageName: null,
      openUri: null,
      verifiedAt: null,
      verifiedClientVersion: null,
      notes: '客户端内置安全工作台适配器 · 本机检测后隔离启动',
    }),
  });
}

export function listBuiltInAgentAdapters(platform) {
  if (!platforms.has(platform)) throw fail('AGENT_PLATFORM_UNSUPPORTED', '当前平台暂不支持桌面 Agent。');
  return coreSpecs.map(spec => build(spec, platform));
}

export function listWorkbenchAgentAdapters(platform) {
  if (!platforms.has(platform)) throw fail('AGENT_PLATFORM_UNSUPPORTED', '当前平台暂不支持桌面 Agent。');
  return allSpecs
    .filter(spec => !spec.supportedPlatforms || spec.supportedPlatforms.includes(platform))
    .map(spec => build(spec, platform));
}

export function getBuiltInAgentAdapter(id, platform) {
  if (!platforms.has(platform)) throw fail('AGENT_PLATFORM_UNSUPPORTED', '当前平台暂不支持桌面 Agent。');
  const spec = allSpecs.find(item => item.id === id && (!item.supportedPlatforms || item.supportedPlatforms.includes(platform)));
  if (!spec) throw fail('AGENT_ADAPTER_UNKNOWN', '应用适配器不存在。');
  return build(spec, platform);
}
