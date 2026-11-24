import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createAuthAuditLogger, sanitizeAuthAudit } from './auth-audit.mjs';

test('auth diagnostics accept only fixed events, known codes, statuses and request ids', () => {
  assert.deepEqual(sanitizeAuthAudit('login_failed', { status: 401, code: 'SESSION_INVALID', requestId: 'req_abc', token: 'RAW_SECRET', cookie: 'RAW_COOKIE', message: 'RAW_MESSAGE', url: 'https://example.test/?code=RAW_CODE' }), { event: 'login_failed', status: 401, code: 'SESSION_INVALID', request_id: 'req_abc' });
  assert.equal(sanitizeAuthAudit('RAW_SECRET'), null);
  assert.deepEqual(sanitizeAuthAudit('login_failed', { status: 0, code: 'RAW_SECRET', requestId: 'nda_RAW_SECRET' }), { event: 'login_failed' });
  assert.deepEqual(sanitizeAuthAudit('login_failed', { requestId: 'req_abc\nRAW_SECRET' }), { event: 'login_failed' });
});

test('auth log writes in order and rotates within the configured bound', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dingtu-audit-'));
  try {
    const logger = createAuthAuditLogger({ directory, maxBytes: 512, now: () => Date.parse('2026-11-05T00:00:00Z') });
    for (let i = 0; i < 30; i++) logger.write('login_failed', { code: 'NETWORK_ERROR', requestId: 'req_' + i, token: 'RAW_SECRET' });
    await logger.flush();
    for (const name of ['noya-auth.log', 'noya-auth.log.1']) {
      const body = await fs.readFile(path.join(directory, name), 'utf8');
      assert.ok(Buffer.byteLength(body) <= 512);
      assert.doesNotMatch(body, /RAW_SECRET/);
      for (const line of body.trim().split('\n')) assert.equal(JSON.parse(line).event, 'login_failed');
    }
    assert.deepEqual((await fs.readdir(directory)).sort(), ['noya-auth.log', 'noya-auth.log.1']);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('v1.12 audit correlates verified configuration without copying handles or device credentials', () => {
  const value = sanitizeAuthAudit('production_config_verified', { requestId: 'req_production',
    bindingRevision: 'binding-3', configRevision: 'cfg-' + 'a'.repeat(64),
    authorizationHandle: 'pah_private', privateKeyJwk: { d: 'private' }, config: { uuid: 'private' } });
  assert.deepEqual(value, { event: 'production_config_verified', request_id: 'req_production',
    binding_revision: 'binding-3', config_revision: 'cfg-' + 'a'.repeat(64) });
  assert.doesNotMatch(JSON.stringify(value), /private|pah_|uuid|Jwk/);
  assert.deepEqual(sanitizeAuthAudit('device_session_response', { status: 201, requestId: 'req_exchange',
    path: '/api/v1/client/device/sessions', body: 'private' }), {
    event: 'device_session_response', status: 201, request_id: 'req_exchange',
  });
});
