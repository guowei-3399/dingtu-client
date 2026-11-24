import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createControlClient, normalizeTunnelStatus } from './control-client.mjs';

const devicePublicKey = { kty: 'OKP', crv: 'Ed25519', x: 'A'.repeat(43) };

function startServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => { try { resolve(body ? JSON.parse(body) : null); } catch (error) { reject(error); } });
    request.on('error', reject);
  });
}

test('contract smoke exercises device session, heartbeat, status and request_id over loopback HTTP', async () => {
  const seen = [];
  const server = await startServer(async (request, response) => {
    const body = await readJson(request);
    seen.push({ method: request.method, url: request.url, authorization: request.headers.authorization, body });
    if (request.method === 'POST' && request.url === '/api/v1/client/device/sessions') {
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ device: { id: 'device-1' }, session: { accessToken: 'access-token-1234567890', refreshToken: 'refresh-token-1234567890' } }));
      return;
    }
    if (request.method === 'POST' && request.url === '/api/v1/client/tunnel/heartbeat') {
      response.writeHead(204); response.end(); return;
    }
    if (request.method === 'GET' && request.url === '/api/v1/client/tunnel/status') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'unknown', desired: 'unknown', applied: 'unknown', observed: 'unknown', health: 'unknown', bindingRevision: null, configRevision: null, observedAt: null }));
      return;
    }
    response.writeHead(503, { 'content-type': 'application/json', 'x-request-id': 'req_smoke' });
    response.end(JSON.stringify({ error: { code: 'FACADE_UNAVAILABLE', message: '暂不可用', request_id: 'req_smoke' } }));
  });
  try {
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const client = createControlClient({ baseUrl, production: false, tokenProvider: async () => 'access-token-1234567890', fetch: globalThis.fetch });
    await client.createDeviceSession({ authorizationCode: 'code', codeVerifier: 'v'.repeat(43), redirectUri: 'http://127.0.0.1:43123/callback', deviceName: 'Noya test', platform: 'linux', appVersion: '1.0.0', devicePublicKey });
    await client.heartbeat({ deviceId: 'device-1', clientVersion: '0.1.0', configRevision: 3, localProxyState: 'running', errorCode: null });
    const status = normalizeTunnelStatus(await client.getTunnelStatus());
    assert.equal(status.health, 'unknown');
    assert.equal(seen[0].authorization, undefined);
    assert.equal(seen[1].authorization, 'Bearer access-token-1234567890');
    assert.deepEqual(seen[1].body.localProxy, { host: '127.0.0.1', port: 17899, state: 'running' });
    await assert.rejects(client.getTunnelConfig(), error => error.code === 'FACADE_UNAVAILABLE' && error.requestId === 'req_smoke');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

const stopServer = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });

test('real HTTP redirect never forwards a device exchange code or verifier to another origin', async () => {
  let destinationHits = 0;
  const destination = await startServer((_request, response) => { destinationHits++; response.end('{}'); });
  const origin = await startServer((_request, response) => {
    response.writeHead(307, { location: `http://127.0.0.1:${destination.address().port}/capture` });
    response.end();
  });
  try {
    const client = createControlClient({ baseUrl: `http://127.0.0.1:${origin.address().port}`, production: false });
    await assert.rejects(client.createDeviceSession({ authorizationCode: 'local-test-code', codeVerifier: 'v'.repeat(43), redirectUri: 'http://127.0.0.1:43123/callback', deviceName: 'Noya test', platform: 'linux', appVersion: '1.0.0', devicePublicKey }), error => error.code === 'NETWORK_ERROR');
    assert.equal(destinationHits, 0);
  } finally { await Promise.all([stopServer(origin), stopServer(destination)]); }
});

test('real HTTP deadlines abort stalled headers and stalled JSON bodies', async () => {
  for (const sendHeaders of [false, true]) {
    const server = await startServer((_request, response) => {
      if (sendHeaders) { response.writeHead(200, { 'content-type': 'application/json' }); response.flushHeaders(); response.write('{'); }
      // Intentionally leave the response unfinished. The client must abort it.
    });
    try {
      const client = createControlClient({ baseUrl: `http://127.0.0.1:${server.address().port}`, production: false, tokenProvider: async () => 'access-token-1234567890', timeoutMs: 80 });
      await assert.rejects(client.getTunnelStatus(), error => error.code === 'REQUEST_TIMEOUT');
    } finally { await stopServer(server); }
  }
});
