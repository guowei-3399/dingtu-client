import dns from 'node:dns/promises';
import net from 'node:net';
import { LOCAL_PROXY } from './runtime-contract.mjs';

const allowedStates = new Set(['stopped', 'starting', 'running', 'stopping', 'failed', 'unknown']);
const status = value => allowedStates.has(value) ? value : 'unknown';

export function probeLocalPort({ connect = net.createConnection, timeoutMs = 800 } = {}) {
  return new Promise(resolve => {
    let settled = false;
    const finish = result => { if (!settled) { settled = true; resolve(result); } };
    let socket;
    try { socket = connect({ host: LOCAL_PROXY.host, port: LOCAL_PROXY.port }); }
    catch { finish('closed'); return; }
    const timer = setTimeout(() => { socket.destroy(); finish('timeout'); }, Math.max(100, Math.min(5000, timeoutMs)));
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); finish('open'); });
    socket.once('error', () => { clearTimeout(timer); finish('closed'); });
  });
}

export async function collectLocalDiagnostics({ platform = process.platform, proxyState = 'unknown', probePort = probeLocalPort, lookup = dns.lookup, now = () => new Date() } = {}) {
  const port = await probePort();
  let dnsStatus = 'unknown';
  try { const result = await lookup('localhost'); dnsStatus = result?.address ? 'pass' : 'unknown'; } catch { dnsStatus = 'failed'; }
  const platformName = { win32: 'windows', darwin: 'macos', linux: 'linux' }[platform] || 'unknown';
  return Object.freeze({ version: 1, dataSource: 'local', generatedAt: new Date(now()).toISOString(), platform: platformName, localProxy: Object.freeze({ host: LOCAL_PROXY.host, port: LOCAL_PROXY.port, state: status(proxyState) }), checks: Object.freeze({ loopback: 'pass', port17899: port, localhostDns: dnsStatus }) });
}

