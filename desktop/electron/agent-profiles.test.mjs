import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentProfileStore, buildAgentProfile, materializeAgentProfile } from './agent-profiles.mjs';

const template = (overrides = {}) => ({
  status: 'verified', adapter: 'env-launch', templateRevision: 3,
  detect: { kind: 'executable', names: ['claude'] },
  launch: { kind: 'exec', argv: ['claude', '--resume'], env: { HTTP_PROXY: '{{local.http}}', ALL_PROXY: '{{local.socks5}}' } },
  account: { provider: 'anthropic-claude', mode: 'config-dir', rotation: 'request-boundary', restart: 'new-session' },
  packageName: null, openUri: null, verifiedAt: '2026-10-28T00:00:00.000Z', verifiedClientVersion: '1.0.0', notes: 'verified', ...overrides,
});
const app = (overrides = {}) => ({ appId: 'claude-code', name: 'Claude Code', platform: 'linux', platformStatus: 'verified', template: template(), ...overrides });

test('profile creation separates a user alias from the operator app and stores no executable override or raw credential', () => {
  const profile = buildAgentProfile({ alias: 'cc1', app: app(), credentialSlotIds: ['slot-1', 'slot-2'], now: () => 1730000000000 });
  assert.deepEqual(profile, {
    version: 1, id: 'cc1', alias: 'cc1', appId: 'claude-code', appName: 'Claude Code', platform: 'linux',
    templateRevision: 3, adapter: 'env-launch', account: { provider: 'anthropic-claude', mode: 'config-dir', rotation: 'request-boundary', restart: 'new-session' },
    credentialSlotIds: ['slot-1', 'slot-2'], status: 'ready', createdAt: '2024-10-27T03:33:20.000Z', updatedAt: '2024-10-27T03:33:20.000Z',
  });
  assert.doesNotMatch(JSON.stringify(profile), /token|password|secret|command|argv|credentialRef/i);
});

test('profile materialization resolves only local proxy placeholders and keeps credential references out of launch env', () => {
  const profile = buildAgentProfile({ alias: 'cc1', app: app(), credentialSlotIds: ['slot-1'] });
  const launch = materializeAgentProfile(profile, app());
  assert.deepEqual(launch, { appId: 'claude-code', profileId: 'cc1', adapter: 'env-launch', activation: 'immediate', command: 'claude', args: ['--resume'], env: { HTTP_PROXY: 'http://127.0.0.1:17899', ALL_PROXY: 'socks5://127.0.0.1:17899' }, credentialSlotIds: ['slot-1'] });
  assert.doesNotMatch(JSON.stringify(launch), /token|password|secret|credentialRef/i);
});

test('profile rejects aliases, app mismatches, unsafe templates and duplicate aliases', () => {
  assert.throws(() => buildAgentProfile({ alias: 'cc 1', app: app() }), { code: 'PROFILE_ALIAS_INVALID' });
  assert.throws(() => buildAgentProfile({ alias: 'cc1', app: app({ platformStatus: 'beta' }) }), { code: 'PROFILE_APP_NOT_READY' });
  assert.throws(() => buildAgentProfile({ alias: 'cc1', app: app({ template: template({ account: { provider: 'none', mode: 'none', rotation: 'disabled', restart: 'none' }, launch: { kind: 'exec', argv: ['sh', '-c', 'evil'], env: {} } }) }) }), { code: 'PROFILE_TEMPLATE_INVALID' });
  const store = createAgentProfileStore(); store.create(buildAgentProfile({ alias: 'cc1', app: app(), credentialSlotIds: ['slot-1'] }));
  assert.throws(() => store.create(buildAgentProfile({ alias: 'cc1', app: app(), credentialSlotIds: ['slot-1'] })), { code: 'PROFILE_ALIAS_CONFLICT' });
});

test('profile store marks an instance for update when the operator template revision changes', () => {
  const store = createAgentProfileStore();
  store.create(buildAgentProfile({ alias: 'cc1', app: app(), credentialSlotIds: ['slot-1'], now: () => 1730000000000 }));
  const current = store.reconcile(app({ template: template({ templateRevision: 4 }) }));
  assert.deepEqual(current, [{ id: 'cc1', status: 'template-update-required', templateRevision: 3, availableTemplateRevision: 4 }]);
  assert.equal(store.get('cc1').status, 'template-update-required');
});
