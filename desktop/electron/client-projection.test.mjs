import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectClientRead,
  projectTelemetrySyncResult,
  projectTicketDetail,
  projectTicketList,
  projectTicketMutation,
} from './client-projection.mjs';

test('projection keeps only contract fields and removes tokens, secrets, IP and arbitrary nested data', () => {
  const value = projectClientRead('me', { user: { id: 'u1', email: 'a@example.test', displayName: 'A', customerType: 'enterprise', level: null, memberRole: 'owner', role: 'customer', emailVerified: true, status: 'active', accessToken: 'secret' }, csrfToken: null, expiresAt: '2026-10-28T00:10:00.000Z', cookie: 'secret' });
  assert.deepEqual(value, { user: { id: 'u1', email: 'a@example.test', displayName: 'A', customerType: 'enterprise', level: null, memberRole: 'owner', role: 'customer', emailVerified: true, status: 'active' }, csrfToken: null, expiresAt: '2026-10-28T00:10:00.000Z' });
  const catalog = projectClientRead('catalog', { data_source: 'real', catalogRevision: 2, generatedAt: '2026-10-28T00:00:00.000Z', checksum: 'a'.repeat(64), platform: 'linux', apps: [{ appId: 'codex', name: 'Codex', category: 'coding', featured: true, officialUrl: 'https://example.com', logo: { assetId: 'openai', sha256: 'b'.repeat(64), mime: 'image/png' }, platforms: { linux: { status: 'beta', adapter: 'app-server', templateRevision: 2, notes: 'ok', account: { provider: 'openai-codex', mode: 'app-server-external-token', rotation: 'request-boundary', restart: 'required' }, launch: { kind: 'exec', argv: ['codex', 'app-server'], env: { HTTP_PROXY: '{{local.http}}', WSS_PROXY: '{{local.https}}', SECRET: 'must-drop' } }, secret: 'must-drop', password: 'must-drop' } } }] });
  assert.equal(catalog.apps[0].platforms.linux.launch.env.SECRET, undefined); assert.equal(catalog.apps[0].platforms.linux.secret, undefined); assert.equal(JSON.stringify(catalog).includes('must-drop'), false);
});

test('projection rejects unsupported reads and malformed response shapes', () => {
  assert.throws(() => projectClientRead('tunnelConfig', {}), error => error.code === 'INVALID_RESPONSE');
  assert.throws(() => projectClientRead('me', null), error => error.code === 'INVALID_RESPONSE');
});

test('projection accepts the operations device record and removes internal metadata', () => {
  const result = projectClientRead('devices', { devices: [{ id: 'device-1', deviceName: 'Personal machine', platform: 'linux', appVersion: '1.0.0', createdAt: '2026-10-28T00:00:00Z', lastSeenAt: null, revokedAt: null, identityId: 'internal-identity', proxyState: 'running' }] });
  assert.deepEqual(result.devices[0], { id: 'device-1', platform: 'linux', appVersion: '1.0.0', status: 'active', createdAt: '2026-10-28T00:00:00.000Z', lastHeartbeatAt: null });
  assert.doesNotMatch(JSON.stringify(result), /Personal machine|internal-identity|running/);
});

test('catalog accepts the canonical decimal revision returned by the operator database', () => {
  const catalog = { data_source: 'real', generatedAt: '2026-11-09T00:00:00.000Z',
    checksum: 'a'.repeat(64), platform: 'windows', apps: [] };
  assert.equal(projectClientRead('catalog', { ...catalog, catalogRevision: '1' }).catalogRevision, 1);
  for (const catalogRevision of ['01', '0', '1e1', '9007199254740992']) {
    assert.throws(() => projectClientRead('catalog', { ...catalog, catalogRevision }), { code: 'INVALID_RESPONSE' });
  }
});

test('operator proxy placeholder aliases cross the desktop boundary without arbitrary proxy values', () => {
  const base = { data_source: 'real', catalogRevision: '1', generatedAt: '2026-11-09T00:00:00.000Z',
    checksum: 'a'.repeat(64), platform: 'windows', apps: [{
      appId: 'claude-code', name: 'Claude Code', category: 'coding', featured: true,
      officialUrl: 'https://claude.com/', logo: { assetId: 'claude', sha256: 'b'.repeat(64), mime: 'image/png' },
      platforms: { windows: { status: 'unverified', adapter: 'env-launch', templateRevision: 1, notes: '',
        launch: { kind: 'exec', argv: ['claude'], env: { HTTPS_PROXY: '{{local.httpProxy}}', NO_PROXY: '{{local.noProxy}}' } } } }
    }] };
  assert.equal(projectClientRead('catalog', base).apps[0].platforms.windows.launch.env.HTTPS_PROXY, '{{local.httpProxy}}');
  base.apps[0].platforms.windows.launch.env.HTTPS_PROXY = 'http://arbitrary.example';
  assert.throws(() => projectClientRead('catalog', base), { code: 'INVALID_RESPONSE' });
});

test('v1.18 §15.1 catalog projection accepts optional clientRelease for electron-v2 and rejects secrets', () => {
  const base = {
    data_source: 'real',
    catalogRevision: 3,
    generatedAt: '2026-11-21T13:30:00.000Z',
    checksum: 'c'.repeat(64),
    platform: 'windows',
    apps: [],
    clientRelease: {
      minimumVersion: '0.1.0',
      updateUrl: '/downloads/dingtu-desktop-0.1.0-8b8717b9-win-x64-portable.exe',
      latest: {
        href: '/downloads/dingtu-desktop-0.1.0-8b8717b9-win-x64-portable.exe',
        filename: 'dingtu-desktop-0.1.0-8b8717b9-win-x64-portable.exe',
        version: '0.1.0',
        channel: 'portable',
        arch: 'x64',
        commit: '8b8717b9',
        buttonLabel: '下载便携测试版',
        bytes: 118006271,
        sizeLabel: '112.5 MB',
        sha256: '1aa0ae772e480fc40018f1e5f8d2369a94e7dc795bd7f7d84d9dd01c1ba516b7',
        publishedAt: '2026-11-21T12:00:00.000Z',
      },
    },
  };
  const projected = projectClientRead('catalog', base);
  assert.equal(projected.clientRelease.minimumVersion, '0.1.0');
  assert.equal(projected.clientRelease.latest.commit, '8b8717b9');
  assert.equal(projected.clientRelease.updateUrl, '/downloads/dingtu-desktop-0.1.0-8b8717b9-win-x64-portable.exe');

  assert.throws(() => projectClientRead('catalog', {
    ...base,
    clientRelease: { ...base.clientRelease, token: 'secret' },
  }), { code: 'INVALID_RESPONSE' });
});

test('identities projection accepts real ops-integration app.identity_json metadata and rejects secret keys', () => {
  const projected = projectClientRead('identities', {
    identities: [{
      id: 'id-1',
      userId: 'user-1',
      displayName: '默认连接身份',
      desiredStatus: 'active',
      revision: 3,
      credential: {
        version: 1,
        protocol: 'vless',
        status: 'active',
        fingerprint: '0123456789abcdef',
        delivered: true,
      },
      subscription: {
        active: true,
        expiresAt: '2026-12-31T00:00:00.000Z',
      },
      createdAt: '2026-11-21T00:00:00.000Z',
      updatedAt: '2026-11-22T00:00:00.000Z',
    }],
    nextCursor: null,
  });
  assert.equal(projected.data_source, 'real');
  assert.equal(projected.identities.length, 1);
  assert.equal(projected.identities[0].id, 'id-1');
  assert.equal(projected.identities[0].configRevision, 3);
  assert.equal(projected.identities[0].bindingRevision, null);
  assert.equal(projected.identities[0].lastObservedAt, null);
  assert.equal(projected.identities[0].credential, undefined);
  assert.equal(projected.identities[0].subscription, undefined);

  assert.throws(() => projectClientRead('identities', {
    identities: [{
      id: 'id-2',
      userId: 'user-1',
      displayName: 'Injected',
      desiredStatus: 'active',
      createdAt: '2026-11-21T00:00:00.000Z',
      secret: 'must-reject',
    }],
    nextCursor: null,
  }), { code: 'INVALID_RESPONSE' });

  assert.throws(() => projectClientRead('identities', {
    identities: [{
      id: 'id-3',
      userId: 'user-1',
      displayName: 'Injected Cred',
      desiredStatus: 'active',
      credential: { version: 1, protocol: 'vless', status: 'active', fingerprint: '0123456789abcdef', delivered: true, secretRef: 'leak' },
      createdAt: '2026-11-21T00:00:00.000Z',
    }],
    nextCursor: null,
  }), { code: 'INVALID_RESPONSE' });
});

test('v1.19 telemetry and ticket projections validate allowed fields strictly', () => {
  const syncOut = projectTelemetrySyncResult({ acceptedBuckets: 4, acceptedEvents: 2, syncedAt: '2026-11-22T07:00:00Z' });
  assert.equal(syncOut.acceptedBuckets, 4);
  assert.throws(() => projectTelemetrySyncResult({ acceptedBuckets: -1, acceptedEvents: 0, syncedAt: '2026-11-22T07:00:00Z' }), { code: 'INVALID_RESPONSE' });

  const tktId = 'tkt_' + 'ab12'.repeat(8);
  const baseTicket = {
    ticketId: tktId, subject: '连接失败', category: 'connection', priority: 'high', status: 'waiting_user',
    incidentId: null, deviceId: 'dev-1', userReportId: 'urp_' + 'cd34'.repeat(8),
    unreadByCustomer: true, lastMessageAt: '2026-11-22T07:00:00Z',
    createdAt: '2026-11-22T06:00:00Z', updatedAt: '2026-11-22T07:00:00Z',
  };
  const listed = projectTicketList({ data_source: 'real', tickets: [baseTicket] });
  assert.equal(listed.tickets[0].unreadByCustomer, true);

  const detail = projectTicketDetail({
    data_source: 'real',
    ticket: baseTicket,
    diagnosticSnapshot: { appVersion: '0.2.0', platform: 'windows', environmentMode: 'safe_tunnel', proxyState: 'stopped', recentErrorCodes: ['PROXY_START_FAILED'], recentRequestIds: ['req_1'] },
    messages: [{ messageId: 'm1', authorRole: 'ops', authorName: 'Ops', body: 'Checking', createdAt: '2026-11-22T07:00:00Z' }],
  });
  assert.equal(detail.messages[0].authorRole, 'ops');

  const mut = projectTicketMutation({ ticket: baseTicket, message: { messageId: 'm2', authorRole: 'customer', authorName: 'Me', body: 'Updated', createdAt: '2026-11-22T07:05:00Z' } });
  assert.equal(mut.message.messageId, 'm2');

  assert.throws(() => projectTicketList({ data_source: 'real', tickets: [{ ...baseTicket, secret: 'bad' }] }), { code: 'INVALID_RESPONSE' });
});

test('v1.26 projectTelemetrySyncResult accepts both 3-key and 4-key responses and projectTicketDetail validates environmentMode', () => {
  const legacy3 = projectTelemetrySyncResult({ acceptedBuckets: 2, acceptedEvents: 5, syncedAt: '2026-11-24T05:00:00Z' });
  assert.deepEqual(legacy3, {
    acceptedBuckets: 2,
    acceptedEvents: 5,
    acceptedLatencySamples: 0,
    syncedAt: '2026-11-24T05:01:00.000Z'.replace('01:', '00:'),
  });

  const v126 = projectTelemetrySyncResult({
    acceptedBuckets: 0,
    acceptedEvents: 3,
    acceptedLatencySamples: 7,
    syncedAt: '2026-11-24T05:01:00Z',
  });
  assert.deepEqual(v126, {
    acceptedBuckets: 0,
    acceptedEvents: 3,
    acceptedLatencySamples: 7,
    syncedAt: '2026-11-24T05:01:00.000Z',
  });

  assert.throws(() => projectTelemetrySyncResult({
    acceptedBuckets: 0, acceptedEvents: 0, acceptedLatencySamples: -1, syncedAt: '2026-11-24T05:01:00Z',
  }), { code: 'INVALID_RESPONSE' });
  assert.throws(() => projectTelemetrySyncResult({
    acceptedBuckets: 0, acceptedEvents: 0, acceptedLatencySamples: 0, syncedAt: '2026-11-24T05:01:00Z', extraKey: true,
  }), { code: 'INVALID_RESPONSE' });

  const tktId = 'tkt_' + 'ef56'.repeat(8);
  const detail = projectTicketDetail({
    data_source: 'real',
    ticket: {
      ticketId: tktId, subject: '代理联通异常', category: 'connection', priority: 'high', status: 'submitted',
      incidentId: null, deviceId: 'dev-1', userReportId: null, unreadByCustomer: false,
      lastMessageAt: null, createdAt: '2026-11-24T05:00:00Z', updatedAt: '2026-11-24T05:00:00Z',
    },
    diagnosticSnapshot: {
      appVersion: '0.2.0', platform: 'windows', environmentMode: 'safe_tunnel',
      proxyState: 'failed', recentErrorCodes: ['PROXY_TIMEOUT'], recentRequestIds: ['req_proxy_1'],
    },
    messages: [],
  });
  assert.equal(detail.diagnosticSnapshot.environmentMode, 'safe_tunnel');

  assert.throws(() => projectTicketDetail({
    data_source: 'real',
    ticket: {
      ticketId: tktId, subject: '代理联通异常', category: 'connection', priority: 'high', status: 'submitted',
      incidentId: null, deviceId: 'dev-1', userReportId: null, unreadByCustomer: false,
      lastMessageAt: null, createdAt: '2026-11-24T05:00:00Z', updatedAt: '2026-11-24T05:00:00Z',
    },
    diagnosticSnapshot: {
      appVersion: '0.2.0', platform: 'windows', environmentMode: 'strong_tun',
      proxyState: 'failed', recentErrorCodes: ['PROXY_TIMEOUT'], recentRequestIds: ['req_proxy_1'],
    },
    messages: [],
  }), { code: 'INVALID_RESPONSE' });
});
