import test from 'node:test';
import assert from 'node:assert/strict';
import { createPkceRequest, consumePkceCallback } from './pkce.mjs';

test('PKCE request uses a local callback and S256 challenge', () => {
  const request = createPkceRequest({ redirectUri: 'http://127.0.0.1:43123/callback' });
  assert.equal(new URL(request.redirectUri).pathname, '/callback');
  assert.match(request.codeVerifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.match(request.codeChallenge, /^[A-Za-z0-9_-]{43,128}$/);
  assert.match(request.state, /^[A-Za-z0-9_-]{32,}$/);
});

test('callback consumes only the matching state and code', () => {
  const request = createPkceRequest({ redirectUri: 'http://127.0.0.1:43123/callback' });
  const callback = `${request.redirectUri}?code=auth-code&state=${encodeURIComponent(request.state)}`;
  assert.deepEqual(consumePkceCallback(callback, request), { code: 'auth-code', state: request.state });
  assert.throws(() => consumePkceCallback(`${request.redirectUri}?code=auth-code&state=wrong`, request), error => error.code === 'STATE_INVALID');
  assert.throws(() => consumePkceCallback('https://evil.example/callback?code=auth-code&state=' + request.state, request), error => error.code === 'CALLBACK_INVALID');
});

test('callback errors and unsafe redirect URIs fail closed', () => {
  assert.throws(() => createPkceRequest({ redirectUri: 'https://noyapi.cn/callback' }), error => error.code === 'CALLBACK_INVALID');
  assert.throws(() => createPkceRequest({ redirectUri: 'http://127.0.0.1:43123/callback?next=https://evil.example' }), error => error.code === 'CALLBACK_INVALID');
  const request = createPkceRequest({ redirectUri: 'http://127.0.0.1:43123/callback' });
  assert.throws(() => consumePkceCallback(`${request.redirectUri}?error=access_denied&state=${request.state}`, request), error => error.code === 'AUTHORIZATION_DENIED');
});

test('callback rejects ambiguous parameters and malformed expected redirects', () => {
  const request = createPkceRequest({ redirectUri: 'http://127.0.0.1:43123/callback' });
  const cases = [
    `code=first&code=second&state=${request.state}`,
    `code=first&state=${request.state}&state=${request.state}`,
    `error=access_denied&error=other&state=${request.state}`,
    `code=first&error=access_denied&state=${request.state}`,
  ];
  for (const query of cases) assert.throws(() => consumePkceCallback(`${request.redirectUri}?${query}`, request), error => error.code === 'CALLBACK_INVALID');
  assert.throws(() => consumePkceCallback(`${request.redirectUri}?code=first&state=${request.state}`, { ...request, redirectUri: `${request.redirectUri}?unexpected=true` }), error => error.code === 'CALLBACK_INVALID');
});

test('callback rejects URL normalization tricks and authorization code control characters', () => {
  const request = createPkceRequest({ redirectUri: 'http://127.0.0.1:43123/callback' });
  for (const redirectUri of ['http://127.1:43123/callback', ' http://127.0.0.1:43123/callback', 'http://127.0.0.1:43123/other/../callback', 'http://127.0.0.1:43123/\\callback']) {
    assert.throws(() => createPkceRequest({ redirectUri }), error => error.code === 'CALLBACK_INVALID');
  }
  assert.throws(() => consumePkceCallback(`${request.redirectUri}?code=first%0Asecond&state=${request.state}`, request), error => error.code === 'CODE_INVALID');
});

