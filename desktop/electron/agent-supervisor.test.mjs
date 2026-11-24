import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentSupervisor } from './agent-supervisor.mjs';

const app = { id: 'codex', platformStatus: 'verified', template: { adapter: 'electron-launch' } };

test('supervisor inspects a catalog app without starting it', async () => {
  let launched = false;
  const launcher = {
    plan: () => ({ appId: 'codex', adapter: 'electron-launch', activation: 'restart-required', command: 'Codex.exe', args: [], envKeys: ['HTTP_PROXY'] }),
    detect: async () => ({ status: 'installed', path: 'Codex.exe', command: 'Codex.exe' }),
    launch: () => { launched = true; throw new Error('must not launch'); },
  };
  const supervisor = createAgentSupervisor({ launcher });
  assert.deepEqual(await supervisor.inspect(app), { appId: 'codex', status: 'installed', activation: 'restart-required', path: 'Codex.exe', command: 'Codex.exe' });
  assert.equal(launched, false);
});

test('supervisor tracks one started app and reports process lifecycle', () => {
  const listeners = {};
  const child = { pid: 42, once: (event, callback) => { listeners[event] = callback; } };
  const launcher = {
    plan: () => ({ appId: 'codex', adapter: 'electron-launch', activation: 'restart-required', command: 'Codex.exe', args: [], envKeys: [] }),
    launch: () => child,
  };
  const supervisor = createAgentSupervisor({ launcher });
  assert.deepEqual(supervisor.start(app), { appId: 'codex', status: 'starting', activation: 'restart-required', pid: 42, exit: null });
  listeners.spawn();
  assert.equal(supervisor.status('codex').status, 'running');
  listeners.exit(1, null);
  assert.deepEqual(supervisor.status('codex'), { appId: 'codex', status: 'failed', activation: 'restart-required', pid: 42, exit: 'code:1' });
});

test('supervisor refuses duplicate starts and keeps app records isolated', () => {
  const child = { pid: 7, once() {} };
  const launcher = { plan: () => ({ appId: 'codex', adapter: 'env-launch', activation: 'immediate', command: 'codex', args: [], envKeys: [] }), launch: () => child };
  const supervisor = createAgentSupervisor({ launcher });
  supervisor.start(app);
  assert.throws(() => supervisor.start(app), error => error.code === 'AGENT_ALREADY_RUNNING');
  assert.equal(supervisor.status('other'), null);
});

test('supervisor cannot clear an active process record and re-enable duplicate starts', () => {
  const listeners = {};
  const child = { pid: 8, once: (event, callback) => { listeners[event] = callback; } };
  const launcher = { plan: () => ({ appId: 'codex', adapter: 'env-launch', activation: 'immediate', command: 'codex', args: [], envKeys: [] }), launch: () => child };
  const supervisor = createAgentSupervisor({ launcher });
  supervisor.start(app);
  assert.throws(() => supervisor.clear('codex'), error => error.code === 'AGENT_ACTIVE');
  assert.throws(() => supervisor.start(app), error => error.code === 'AGENT_ALREADY_RUNNING');
  listeners.exit(0, null);
  supervisor.clear('codex');
  assert.equal(supervisor.status('codex'), null);
});
