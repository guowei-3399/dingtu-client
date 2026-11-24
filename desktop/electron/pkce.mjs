import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const base64url = value => value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };

function callbackOrigin(raw) {
  if (typeof raw !== 'string' || raw.length > 8192 || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}\/callback(?:\?[^#\s]*)?$/.test(raw)) fail('CALLBACK_INVALID', '授权回调地址无效。');
  let url;
  try { url = new URL(raw); } catch { fail('CALLBACK_INVALID', '授权回调地址无效。'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !Number.isInteger(Number(url.port)) || Number(url.port) < 1024 || Number(url.port) > 65535 || url.pathname !== '/callback' || url.username || url.password || url.hash) fail('CALLBACK_INVALID', '授权回调地址不符合本地回调合同。');
  return url;
}

export function validateRedirectUri(raw) {
  const callback = callbackOrigin(raw);
  if (callback.search) fail('CALLBACK_INVALID', '回调地址不能包含查询参数。');
  return callback.toString();
}

export function createPkceRequest({ redirectUri } = {}) {
  const callback = callbackOrigin(redirectUri);
  if (callback.search) fail('CALLBACK_INVALID', '回调地址不能包含查询参数。');
  const verifier = base64url(randomBytes(64));
  const state = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return Object.freeze({ redirectUri: callback.toString(), codeVerifier: verifier, codeChallenge: challenge, state });
}

export function consumePkceCallback(rawUrl, { redirectUri, state } = {}) {
  const expected = new URL(validateRedirectUri(redirectUri));
  const callback = callbackOrigin(rawUrl);
  if (callback.origin !== expected.origin) fail('CALLBACK_INVALID', '授权回调来源不匹配。');
  const count = key => callback.searchParams.getAll(key).length;
  if (count('state') > 1 || count('code') > 1 || count('error') > 1 || (count('code') && count('error'))) fail('CALLBACK_INVALID', '授权回调参数有歧义。');
  if (typeof state !== 'string' || !state || state.length > 512 || count('state') !== 1) fail('STATE_INVALID', '授权状态无效。');
  const actualState = Buffer.from(callback.searchParams.get('state'));
  const expectedState = Buffer.from(state);
  if (actualState.length !== expectedState.length || !timingSafeEqual(actualState, expectedState)) fail('STATE_INVALID', '授权状态不匹配。');
  const providerError = callback.searchParams.get('error');
  if (count('error') && !providerError) fail('CALLBACK_INVALID', '授权回调参数无效。');
  if (providerError) fail('AUTHORIZATION_DENIED', '授权未完成。');
  const code = callback.searchParams.get('code');
  if (typeof code !== 'string' || !/^[\x21-\x7e]{1,2048}$/.test(code)) fail('CODE_INVALID', '授权码无效。');
  return Object.freeze({ code, state });
}

