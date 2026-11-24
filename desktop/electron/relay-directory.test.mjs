import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelayDirectoryCache, projectRelayDirectory } from './relay-directory.mjs';

test('projectRelayDirectory accepts operator-maintained HTTPS Dingtu relays and strips/rejects raw credentials', () => {
  const valid = {
    data_source: 'real',
    generatedAt: '2026-11-21T12:00:00.000Z',
    relays: [
      {
        relayId: 'dingtu-claude-main',
        name: '定途官方 Claude 专享中转',
        protocol: 'anthropic',
        baseUrl: 'https://claude-relay.noyapi.cn/',
        models: ['claude-sonnet-4-5', 'claude-opus-4-1'],
        eligibleLevels: ['silver', 'gold', 'enterprise'],
        status: 'active',
        notes: '运营端统一维护 · 零第三方赞助商注入',
        updatedAt: '2026-11-21T11:30:00.000Z',
      },
      {
        relayId: 'dingtu-openai-main',
        name: '定途官方 Codex 中转',
        protocol: 'openai',
        baseUrl: 'https://openai-relay.noyapi.cn/v1',
        models: ['gpt-5', 'codex-mini'],
        status: 'maintenance',
      },
    ],
  };

  const cache = createRelayDirectoryCache();
  const projected = cache.update(valid);
  assert.equal(projected.relays.length, 2);
  assert.equal(projected.relays[0].baseUrl, 'https://claude-relay.noyapi.cn');
  assert.equal(cache.resolveActiveRelay('dingtu-claude-main')?.protocol, 'anthropic');
  // Maintenance relay must not resolve as active
  assert.equal(cache.resolveActiveRelay('dingtu-openai-main'), null);

  for (const bad of [
    { ...valid, data_source: 'mock' },
    { ...valid, relays: [{ ...valid.relays[0], baseUrl: 'http://insecure.example.com' }] },
    { ...valid, relays: [{ ...valid.relays[0], baseUrl: 'https://user:pass@claude-relay.noyapi.cn' }] },
    { ...valid, relays: [{ ...valid.relays[0], apiKey: 'sk-secret' }] },
    { ...valid, relays: [{ ...valid.relays[0], token: 'secret' }] },
  ]) {
    assert.throws(() => projectRelayDirectory(bad), { code: 'INVALID_RESPONSE' });
  }
});
