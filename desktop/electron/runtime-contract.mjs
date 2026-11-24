import path from 'node:path';

export const LOCAL_PROXY = Object.freeze({
  host: '127.0.0.1',
  port: 17899,
  http: 'http://127.0.0.1:17899',
  socks5: 'socks5://127.0.0.1:17899',
});

export function assertLocalProxyPort(value) {
  const port = Number(value ?? LOCAL_PROXY.port);
  if (port !== LOCAL_PROXY.port) throw new Error('NOYA_LOCAL_PROXY_PORT must remain 17899');
  return LOCAL_PROXY.port;
}

export function resolveControlBase(value, { production = false } = {}) {
  if (typeof value !== 'string') throw new Error('NOYA_API_BASE must be a URL string');
  const raw = value.trim();
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { throw new Error('NOYA_API_BASE must be an absolute URL'); }
  const trustedHosts = ['dingtu.noyapi.cn', 'noyapi.cn', 'www.noyapi.cn'];
  if (production && url.protocol !== 'https:') throw new Error('NOYA_API_BASE must use HTTPS in production');
  if (production && !trustedHosts.includes(url.hostname)) throw new Error('NOYA_API_BASE host is not trusted in production');
  if (raw.length > 2048 || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error('NOYA_API_BASE is not allowed');
  return url.toString().replace(/\/$/, '');
}

export function resolvePortalUrl(value, { production = false } = {}) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('NOYA_PORTAL_URL is not allowed');
  let url;
  try { url = new URL(value); } catch { throw new Error('NOYA_PORTAL_URL must be an absolute URL'); }
  const localHosts = ['127.0.0.1', 'localhost'];
  const productionHosts = ['dingtu.noyapi.cn', 'noyapi.cn', 'www.noyapi.cn'];
  const hostAllowed = production ? productionHosts.includes(url.hostname) : localHosts.includes(url.hostname);
  if (!hostAllowed || (production && url.protocol !== 'https:') || (!production && !['http:', 'https:'].includes(url.protocol))
      || url.username || url.password || url.search || url.hash || url.pathname !== '/assistant/') {
    throw new Error('NOYA_PORTAL_URL is not allowed');
  }
  return url.toString();
}

// Only public, validated metadata is passed through Electron's renderer argv.
// Credentials and user-supplied proxy objects never enter this allowlisted payload.
export function buildPreloadArguments({ platform, apiBase = '', localProxyPort, production = false } = {}) {
  const platforms = { win32: 'windows', darwin: 'macos', linux: 'linux' };
  if (typeof platform !== 'string' || !Object.hasOwn(platforms, platform)) throw new Error('Unsupported Noya desktop platform');
  const desktopPlatform = platforms[platform];
  assertLocalProxyPort(localProxyPort);
  const config = {
    version: 1,
    platform: desktopPlatform,
    apiBase: resolveControlBase(apiBase, { production }),
    localProxy: LOCAL_PROXY,
  };
  return Object.freeze(['--noya-desktop-config=' + encodeURIComponent(JSON.stringify(config))]);
}

export function resolveSingBoxBinary({ runtimeDir, platform = process.platform, arch = process.arch } = {}) {
  if (typeof runtimeDir !== 'string' || !runtimeDir.trim()) return '';
  const targets = {
    'win32:x64': ['win32-x64', 'sing-box.exe'],
    'darwin:arm64': ['darwin-arm64', 'sing-box'],
    'darwin:x64': ['darwin-x64', 'sing-box'],
    'linux:x64': ['linux-x64', 'sing-box'],
    'linux:arm64': ['linux-arm64', 'sing-box'],
  };
  const key = `${platform}:${arch}`;
  if (!Object.hasOwn(targets, key)) return '';
  const [subdir, executable] = targets[key];
  const pathImpl = platform === 'win32' ? path.win32 : path.posix;
  return pathImpl.join(runtimeDir, subdir, executable);
}
