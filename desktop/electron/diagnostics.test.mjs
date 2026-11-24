import test from 'node:test';
import assert from 'node:assert/strict';
import { collectLocalDiagnostics } from './diagnostics.mjs';

test('local diagnostics only reports fixed loopback facts and bounded status values', async () => {
  const report = await collectLocalDiagnostics({ platform: 'linux', proxyState: 'running', probePort: async () => 'open', lookup: async () => ({ address: '127.0.0.1' }), now: () => new Date('2026-10-25T00:00:00Z') });
  assert.deepEqual(report, { version: 1, dataSource: 'local', generatedAt: '2026-10-25T00:00:00.000Z', platform: 'linux', localProxy: { host: '127.0.0.1', port: 17899, state: 'running' }, checks: { loopback: 'pass', port17899: 'open', localhostDns: 'pass' } });
  assert.doesNotMatch(JSON.stringify(report), /account|token|cookie|public|upstream|ip/i);
});

test('diagnostics degrade safely when local checks fail and never accept a caller port', async () => {
  let called = 0;
  const report = await collectLocalDiagnostics({ platform: 'freebsd', proxyState: 'not-a-state', probePort: async () => { called += 1; return 'closed'; }, lookup: async () => { throw new Error('dns'); } });
  assert.equal(called, 1);
  assert.equal(report.platform, 'unknown');
  assert.equal(report.localProxy.port, 17899);
  assert.equal(report.localProxy.state, 'unknown');
  assert.deepEqual(report.checks, { loopback: 'pass', port17899: 'closed', localhostDns: 'failed' });
});

