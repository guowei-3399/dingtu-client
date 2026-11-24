import test from 'node:test';
import assert from 'node:assert/strict';
import { createConcurrencyPolicy, MAX_LOCAL_CONCURRENT_INSTANCES } from './concurrency-policy.mjs';
import { DESKTOP_CHANNEL, registerDesktopIpc } from './desktop-ipc.mjs';

test('personal tier permits local multi-app concurrency and isolated partitions while tracking server-side single-terminal mode', async () => {
  const policy = createConcurrencyPolicy({ resolveCustomerType: async () => 'personal' });
  assert.equal(await policy.resolveTier(), 'personal');
  const snap = policy.snapshot();
  assert.equal(snap.customerType, 'personal');
  assert.equal(snap.verified, true);
  assert.equal(snap.multiInstanceAllowed, true);
  assert.equal(snap.multiLoginAllowed, true);
  assert.equal(snap.singleTerminalEnforcedServerSide, true);
  assert.equal(snap.maxConcurrentInstances, MAX_LOCAL_CONCURRENT_INSTANCES);

  // Personal: multiple concurrent apps & isolated partitions allowed on the active terminal
  assert.doesNotThrow(() => policy.assertBrowserOpenAllowed({
    tier: 'personal',
    activeAgents: [],
    activeBrowsers: [{ appId: 'metamuse', instanceId: 'main' }],
    appId: 'metamuse',
    instanceId: 'muse-account-2',
  }));
  assert.doesNotThrow(() => policy.assertBrowserOpenAllowed({
    tier: 'personal',
    activeAgents: [{ id: 'codex-desktop-main', status: 'running' }],
    activeBrowsers: [{ appId: 'metamuse', instanceId: 'main' }],
    appId: 'claude',
    instanceId: 'main',
  }));
  assert.doesNotThrow(() => policy.assertAgentCreateAllowed({
    tier: 'personal',
    existingProfiles: [{ id: 'claude-code-main', appId: 'claude-code' }],
    appId: 'claude-code',
    alias: 'cc-account-2',
  }));
  assert.doesNotThrow(() => policy.assertAgentStartAllowed({
    tier: 'personal',
    activeAgents: [{ id: 'codex-desktop-main', status: 'running' }],
    activeBrowsers: [{ appId: 'metamuse', instanceId: 'main' }],
    instanceId: 'cursor-main',
    appId: 'cursor',
  }));

  // Local safety cap (16 concurrent instances) rejects additional opens with 429
  const fullBrowsers = Array.from({ length: MAX_LOCAL_CONCURRENT_INSTANCES }, (_, idx) => ({
    appId: 'claude',
    instanceId: `slot-${idx + 1}`,
  }));
  assert.throws(() => policy.assertBrowserOpenAllowed({
    tier: 'personal',
    activeAgents: [],
    activeBrowsers: fullBrowsers,
    appId: 'metamuse',
    instanceId: 'extra',
  }), { code: 'LOCAL_INSTANCE_LIMIT_REACHED', status: 429 });

  // Re-focusing an existing window succeeds even at capacity
  assert.doesNotThrow(() => policy.assertBrowserOpenAllowed({
    tier: 'personal',
    activeAgents: [],
    activeBrowsers: fullBrowsers,
    appId: 'claude',
    instanceId: 'slot-1',
  }));
});

test('both personal and enterprise tiers unlock concurrent multi-app and multi-partition launches over desktop IPC', async () => {
  let currentCustomerType = 'personal';
  const openWindows = [];
  const agentRecords = [];
  const handlers = new Map();
  const mainFrame = { url: 'https://dingtu.noyapi.cn/assistant/' };
  const webContents = { mainFrame, getURL: () => mainFrame.url, isDestroyed: () => false };
  const win = { webContents, isDestroyed: () => false };
  const event = () => ({ sender: webContents, senderFrame: mainFrame });

  const concurrency = createConcurrencyPolicy({
    resolveCustomerType: async () => currentCustomerType,
  });

  registerDesktopIpc({
    ipcMain: { handle: (ch, fn) => handlers.set(ch, fn), removeHandler: ch => handlers.delete(ch) },
    getWindow: () => win,
    portalUrl: 'https://dingtu.noyapi.cn/assistant/',
    host: {
      snapshot: () => ({ status: 'authenticated', platform: 'windows', device: { id: 'dev-1' } }),
      read: async () => ({
        user: {
          id: 'u1', email: 'u@example.com', displayName: 'User',
          customerType: currentCustomerType, level: 'gold', memberRole: currentCustomerType === 'enterprise' ? 'owner' : null,
          role: 'customer', emailVerified: true, status: 'active',
        },
        csrfToken: null,
        expiresAt: '2026-12-01T00:00:00.000Z',
      }),
    },
    browser: {
      open: async input => { openWindows.push({ appId: input.appId, name: input.appId, instanceId: input.instanceId, appShell: true, mode: 'safe_tunnel' }); },
      list: async () => openWindows,
      closeInstance: async ({ appId, instanceId }) => {
        const idx = openWindows.findIndex(w => w.appId === appId && w.instanceId === instanceId);
        if (idx >= 0) { openWindows.splice(idx, 1); return { status: 'closed' }; }
        return { status: 'not_found' };
      },
      closeAll: async () => { openWindows.length = 0; },
    },
    agents: {
      list: async () => agentRecords,
      create: async input => {
        const rec = { id: input.alias, profileId: input.alias, appId: input.appId, status: 'ready', pid: null, activation: 'immediate' };
        agentRecords.push(rec);
        return rec;
      },
      start: async id => {
        const rec = agentRecords.find(r => r.id === id);
        rec.status = 'running';
        rec.pid = 888;
        return rec;
      },
      stop: async id => {
        const rec = agentRecords.find(r => r.id === id);
        rec.status = 'stopped';
        rec.pid = null;
        return rec;
      },
    },
    concurrency,
  });

  const invoke = handlers.get(DESKTOP_CHANNEL);

  // 1. Personal tier: multi-login partitions + concurrent multi-app launches all succeed locally
  assert.equal((await invoke(event(), { operation: 'browser.open', appId: 'metamuse', instanceId: 'muse-1' })).ok, true);
  assert.equal((await invoke(event(), { operation: 'browser.open', appId: 'metamuse', instanceId: 'muse-2' })).ok, true);
  assert.equal((await invoke(event(), { operation: 'browser.open', appId: 'claude', instanceId: 'main' })).ok, true);
  assert.equal((await invoke(event(), { operation: 'agent.create', alias: 'codex-main', appId: 'codex-cli', credentialSlotIds: [] })).ok, true);
  assert.equal((await invoke(event(), { operation: 'agent.start', instanceId: 'codex-main' })).ok, true);
  assert.equal(openWindows.length, 3);

  // 2. Enterprise tier: observe 'me' read and verify concurrency continues to work seamlessly
  currentCustomerType = 'enterprise';
  concurrency.clear();
  await invoke(event(), { operation: 'read', kind: 'me', args: {} });
  assert.equal(concurrency.snapshot().singleTerminalEnforcedServerSide, false);
  assert.equal((await invoke(event(), { operation: 'agent.create', alias: 'cursor-pro-1', appId: 'cursor', credentialSlotIds: [] })).ok, true);
  assert.equal((await invoke(event(), { operation: 'agent.start', instanceId: 'cursor-pro-1' })).ok, true);
});
