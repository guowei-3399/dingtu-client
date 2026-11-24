import test from 'node:test';
import assert from 'node:assert/strict';
import { getBuiltInAgentAdapter, listBuiltInAgentAdapters, listWorkbenchAgentAdapters } from './builtin-agent-adapters.mjs';
import { buildAgentProfile, materializeAgentProfile } from './agent-profiles.mjs';

test('built-in adapters are client-owned metadata and contain only local proxy placeholders', () => {
  const adapters = listBuiltInAgentAdapters('linux');
  assert.deepEqual(adapters.map(item => item.id), ['claude-code', 'codex-cli', 'claude-desktop', 'claude-dot']);
  for (const item of adapters) {
    assert.equal(item.platform, 'linux');
    assert.equal(item.source, 'builtin');
    assert.ok(item.template);
    assert.doesNotMatch(JSON.stringify(item), /token|password|secret|credentialRef|api.?key/i);
    for (const value of Object.values(item.template.launch?.env || {})) assert.match(value, /^\{\{local\./);
  }
});

test('workbench adapters cover retained platforms and exclude dropped IDEs', () => {
  const requiredWinLinux = [
    'antigravity', 'antigravity-cli', 'codex-cli', 'codex-desktop', 'copilot', 'windsurf', 'kiro',
    'cursor', 'grok-cli', 'claude-code', 'claude-desktop', 'gemini-cli',
  ];
  const dropped = ['codebuddy', 'codebuddy-cn', 'qoder', 'trae', 'traework', 'trae-cn', 'traework-cn', 'zed', 'zcode'];
  for (const platform of ['windows', 'macos', 'linux']) {
    const list = listWorkbenchAgentAdapters(platform);
    const ids = new Set(list.map(item => item.id));
    for (const id of dropped) assert.equal(ids.has(id), false, `dropped adapter ${id} must not exist`);
    for (const id of requiredWinLinux) {
      assert.ok(ids.has(id), `missing workbench adapter ${id} on ${platform}`);
      const adapter = getBuiltInAgentAdapter(id, platform);
      const profile = buildAgentProfile({ alias: 'main', app: adapter });
      const plan = materializeAgentProfile(profile, adapter);
      assert.equal(plan.appId, id);
      assert.doesNotMatch(JSON.stringify(plan), /token|password|secret|credentialRef/i);
      if (adapter.template.adapter === 'electron-launch') {
        assert.ok(adapter.template.launch.argv.includes('--proxy-bypass-list=localhost;127.0.0.1;[::1];<local>'));
        assert.equal(adapter.template.launch.argv.some(arg => arg.includes('<-loopback>')), false);
      }
      if (id === 'antigravity-cli') {
        assert.equal(adapter.template.adapter, 'env-launch');
        assert.equal(adapter.template.launch.argv[0], 'agy');
      }
    }
    assert.equal(ids.has('muse-desktop'), platform === 'macos');
  }
});

test('unknown apps and unsupported platforms fail closed', () => {
  assert.throws(() => getBuiltInAgentAdapter('made-up', 'linux'), { code: 'AGENT_ADAPTER_UNKNOWN' });
  assert.throws(() => listBuiltInAgentAdapters('ios'), { code: 'AGENT_PLATFORM_UNSUPPORTED' });
});
