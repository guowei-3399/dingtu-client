import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { startPkceLoopback } from './pkce-loopback.mjs';

function send(callback, { path, headers = {}, method = 'GET' } = {}) {
  const url = new URL(callback);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: url.port, method,
      path: path ?? `${url.pathname}${url.search}`, headers: { Connection: 'close', ...headers } }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

const callbackFor = flow => `${flow.request.redirectUri}?code=one-time-code&state=${flow.request.state}`;

test('loopback receives one valid code and serves only fixed secret-free completion content', async t => {
  const flow = await startPkceLoopback();
  t.after(() => flow.cancel());
  const result = flow.waitForCode();
  assert.equal(result, flow.waitForCode());
  assert.equal(new URL(flow.request.redirectUri).hostname, '127.0.0.1');
  assert.notEqual(new URL(flow.request.redirectUri).port, '17899');
  assert.notEqual(new URL(flow.request.redirectUri).port, '7890');
  const response = await send(callbackFor(flow));
  assert.equal(response.status, 200);
  assert.deepEqual(await result, { code: 'one-time-code', state: flow.request.state });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['access-control-allow-origin'], undefined);
  for (const secret of ['one-time-code', flow.request.state, flow.request.codeVerifier]) assert.ok(!response.body.includes(secret));
  await assert.rejects(send(callbackFor(flow)));
});

test('invalid callbacks and cross-origin probes never consume the pending authorization', async t => {
  const flow = await startPkceLoopback();
  t.after(() => flow.cancel());
  const good = callbackFor(flow);
  const probes = [
    { headers: { Host: 'evil.example' } },
    { headers: { Origin: 'https://evil.example' } },
    { headers: { Host: new URL(good).host, ...Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`X-Probe-${i}`, 'a'])), Origin: 'https://evil.example' } },
    { path: '/other/../callback?code=one-time-code&state=' + flow.request.state },
    { path: good },
    { method: 'POST' },
    { path: '/callback?code=one-time-code&state=wrong' },
    { path: `/callback?code=first&code=second&state=${flow.request.state}` },
  ];
  for (const probe of probes) assert.ok((await send(good, probe)).status >= 400);
  assert.equal((await send(good)).status, 200);
  assert.equal((await flow.waitForCode()).code, 'one-time-code');
});

test('parallel callback replay completes the authorization exactly once', async t => {
  const flow = await startPkceLoopback();
  t.after(() => flow.cancel());
  const responses = await Promise.allSettled([send(callbackFor(flow)), send(callbackFor(flow))]);
  assert.equal(responses.filter(result => result.status === 'fulfilled' && result.value.status === 200).length, 1);
  assert.deepEqual(await flow.waitForCode(), { code: 'one-time-code', state: flow.request.state });
});

test('matching authorization denial closes the listener and keeps provider details out of errors', async t => {
  const flow = await startPkceLoopback();
  t.after(() => flow.cancel());
  const wait = assert.rejects(flow.waitForCode(), error => error.code === 'AUTHORIZATION_DENIED'
    && !error.message.includes(flow.request.state) && !error.message.includes('private-detail'));
  const denied = `${flow.request.redirectUri}?error=access_denied&error_description=private-detail&state=${flow.request.state}`;
  const response = await send(denied);
  assert.equal(response.status, 200);
  assert.ok(!response.body.includes('private-detail'));
  await wait;
  await assert.rejects(send(callbackFor(flow)));
});

test('cancellation closes the listener even if the caller has not begun waiting', async () => {
  const flow = await startPkceLoopback();
  flow.cancel();
  flow.cancel();
  await assert.rejects(flow.waitForCode(), error => error.code === 'AUTHORIZATION_CANCELLED');
  await assert.rejects(send(callbackFor(flow)));
});

test('timeout destroys incomplete local HTTP connections and releases the listener', async t => {
  const flow = await startPkceLoopback({ timeoutMs: 50 });
  const url = new URL(flow.request.redirectUri);
  const socket = net.createConnection({ host: '127.0.0.1', port: Number(url.port) });
  t.after(() => socket.destroy());
  const closed = new Promise(resolve => { socket.on('error', () => {}); socket.on('close', resolve); });
  await new Promise(resolve => socket.once('connect', resolve));
  socket.write('GET /callback HTTP/1.1\r\n');
  await assert.rejects(flow.waitForCode(), error => error.code === 'AUTHORIZATION_TIMEOUT');
  await closed;
  await assert.rejects(send(callbackFor(flow)));
});

test('invalid authorization timeouts fail before creating a listener', async () => {
  for (const timeoutMs of [0, -1, 120001, NaN, '100']) await assert.rejects(startPkceLoopback({ timeoutMs }), error => error.code === 'VALIDATION_ERROR');
});
