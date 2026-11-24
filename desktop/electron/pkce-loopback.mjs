// Main-process-only authorization receiver. This does not open a browser,
// exchange a code, persist credentials, or expose an IPC surface.
import http from 'node:http';
import { createPkceRequest, consumePkceCallback } from './pkce.mjs';

const fail = (code, message) => Object.assign(new Error(message), { code });
const completed = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>定途</title><p>授权处理完成，请返回定途。</p></html>';
const invalid = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>定途</title><p>回调无效，请返回定途继续。</p></html>';

export async function startPkceLoopback({ timeoutMs = 120000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw fail('VALIDATION_ERROR', '授权等待时间无效。');
  const sockets = new Set();
  let request, timer, settled = false, resolveCode, rejectCode;
  const result = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  // Cancellation can happen before waitForCode(); keep that path handled while
  // returning the original promise so callers still observe the rejection.
  void result.catch(() => {});

  function shutdown(keepSocket) {
    clearTimeout(timer);
    server.close();
    for (const socket of sockets) if (socket !== keepSocket) socket.destroy();
  }

  function finish(error, value, keepSocket) {
    if (settled) return false;
    settled = true;
    shutdown(keepSocket);
    if (error) rejectCode(error); else resolveCode(value);
    return true;
  }

  function respond(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff', Connection: 'close' });
    res.end(body);
  }

  const server = http.createServer({ maxHeaderSize: 8192 }, (req, res) => {
    if (settled) { respond(res, 410, invalid); return; }
    const headerNames = req.rawHeaders.filter((_, index) => index % 2 === 0).map(value => value.toLowerCase());
    const hostCount = headerNames.filter(value => value === 'host').length;
    if (req.method !== 'GET' || !request || hostCount !== 1 || headerNames.length > 16
        || req.headers.host !== new URL(request.redirectUri).host
        || headerNames.includes('origin') || req.socket.remoteAddress !== '127.0.0.1'
        || typeof req.url !== 'string' || !req.url.startsWith('/callback?')
        || req.url.length > 8192) {
      respond(res, 400, invalid); return;
    }
    let value, denial;
    try { value = consumePkceCallback(`${new URL(request.redirectUri).origin}${req.url}`, request); }
    catch (error) {
      if (error?.code === 'AUTHORIZATION_DENIED') denial = fail('AUTHORIZATION_DENIED', '授权未完成。');
      else { respond(res, 400, invalid); return; }
    }
    // Stop accepting connections immediately. Preserve only this socket until
    // its fixed completion response has been flushed to the browser.
    res.once('finish', () => req.socket.destroySoon());
    finish(denial, value, req.socket);
    respond(res, 200, completed);
  });
  server.maxHeadersCount = 16;
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.on('connection', socket => {
    sockets.add(socket);
    socket.setTimeout(5000, () => socket.destroy());
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('clientError', (_error, socket) => socket.destroy());

  try {
    await new Promise((resolve, reject) => {
      const onError = () => reject(fail('CALLBACK_LISTEN_FAILED', '本机授权接收器不可用。'));
      server.once('error', onError);
      server.listen(0, '127.0.0.1', () => { server.removeListener('error', onError); resolve(); });
    });
    const port = server.address().port;
    if (port === 17899 || port === 7890) throw fail('CALLBACK_LISTEN_FAILED', '本机授权接收器不可用。');
    request = createPkceRequest({ redirectUri: `http://127.0.0.1:${port}/callback` });
  } catch {
    settled = true;
    shutdown();
    throw fail('CALLBACK_LISTEN_FAILED', '本机授权接收器不可用。');
  }
  server.on('error', () => finish(fail('CALLBACK_LISTEN_FAILED', '本机授权接收器不可用。')));
  timer = setTimeout(() => finish(fail('AUTHORIZATION_TIMEOUT', '授权等待已超时。')), timeoutMs);

  return Object.freeze({ request, waitForCode: () => result,
    cancel: () => { finish(fail('AUTHORIZATION_CANCELLED', '授权已取消。')); } });
}
