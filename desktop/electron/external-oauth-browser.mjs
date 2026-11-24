import { spawn as defaultSpawn } from 'node:child_process';
import fsSync from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isTunnelEnvironmentMode } from './environment-mode.mjs';
import { isAllowedAuthNavigation } from './oauth-browser-window.mjs';

const fail = (code, message) => Object.assign(new Error(message), { code });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function dedupePaths(candidates) {
  const seen = new Set();
  const out = [];
  for (const item of candidates) {
    if (!item || typeof item.executablePath !== 'string' || !item.executablePath.trim()) continue;
    const key = process.platform === 'win32' ? item.executablePath.toLowerCase() : item.executablePath;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Locate a system Chromium browser (Chrome first, then Edge) for RFC 8252 OAuth.
 */
export function findSystemChromiumBrowser({
  platform = process.platform,
  existsSync = fsSync.existsSync,
  env = process.env,
  homedir = os.homedir(),
} = {}) {
  const candidates = [];
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
    for (const root of roots) {
      candidates.push({
        browser: 'chrome',
        executablePath: path.win32.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      });
    }
    const edgeRoots = [env['PROGRAMFILES(X86)'], env.PROGRAMFILES, env.LOCALAPPDATA].filter(Boolean);
    for (const root of edgeRoots) {
      candidates.push({
        browser: 'edge',
        executablePath: path.win32.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      });
    }
  } else if (platform === 'darwin') {
    candidates.push(
      { browser: 'chrome', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
      ...(homedir ? [{ browser: 'chrome', executablePath: path.posix.join(homedir, 'Applications', 'Google Chrome.app', 'Contents/MacOS/Google Chrome') }] : []),
      { browser: 'edge', executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
      ...(homedir ? [{ browser: 'edge', executablePath: path.posix.join(homedir, 'Applications', 'Microsoft Edge.app', 'Contents/MacOS/Microsoft Edge') }] : []),
    );
  } else {
    candidates.push(
      { browser: 'chrome', executablePath: '/usr/bin/google-chrome' },
      { browser: 'chrome', executablePath: '/usr/bin/google-chrome-stable' },
      { browser: 'edge', executablePath: '/usr/bin/microsoft-edge' },
      { browser: 'edge', executablePath: '/usr/bin/microsoft-edge-stable' },
      { browser: 'chromium', executablePath: '/usr/bin/chromium' },
      { browser: 'chromium', executablePath: '/usr/bin/chromium-browser' },
    );
  }

  for (const candidate of dedupePaths(candidates)) {
    try {
      if (existsSync(candidate.executablePath)) {
        return Object.freeze({ ...candidate });
      }
    } catch {}
  }
  return null;
}

/**
 * Build basic external Chrome/Edge launch arguments for RFC 8252 OAuth connectivity.
 */
export function buildExternalOAuthLaunchSpec({
  url,
  userDataDir,
  environmentMode = 'safe_tunnel',
  proxyReady = false,
  baseEnv = process.env,
} = {}) {
  if (!isAllowedAuthNavigation(url, [])) {
    throw fail('BROWSER_URL_NOT_ALLOWED', '该外部授权地址不被允许。');
  }
  if (typeof userDataDir !== 'string' || !userDataDir.trim() || /[\u0000\r\n]/.test(userDataDir)) {
    throw fail('BROWSER_OPEN_FAILED', '外部授权隔离目录无效。');
  }

  const proxied = isTunnelEnvironmentMode(environmentMode) && proxyReady === true;
  const args = [
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-extensions',
    '--new-window',
  ];

  if (proxied) {
    args.push(
      '--proxy-server=http://127.0.0.1:17899',
      '--proxy-bypass-list=127.0.0.1;localhost;[::1]',
    );
  }

  args.push(url.trim());

  const env = { ...(baseEnv || {}) };
  delete env.ELECTRON_RUN_AS_NODE;

  return Object.freeze({
    args: Object.freeze(args),
    env,
    proxied,
  });
}

async function removeTempDirWithRetry(fsApi, dirPath, { attempts = 5, retryDelayMs = 250 } = {}) {
  if (!dirPath || typeof fsApi?.rm !== 'function') return;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await fsApi.rm(dirPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error?.code === 'ENOENT' || i === attempts - 1) return;
      await wait(retryDelayMs);
    }
  }
}

export function createExternalOAuthBrowser({
  environmentModeProvider = () => 'safe_tunnel',
  proxyReadyProvider = () => false,
  openExternalFallback = null,
  spawn = defaultSpawn,
  fs = fsPromises,
  existsSync = fsSync.existsSync,
  tmpdir = () => os.tmpdir(),
  platform = process.platform,
  env = process.env,
  homedir = () => os.homedir(),
  cleanupRetryDelayMs = 250,
  closeCallbackDelayMs = 600,
} = {}) {
  const activeSessions = new Set();

  async function openOAuthWindow({
    url,
    onClosed = null,
  } = {}) {
    if (!isAllowedAuthNavigation(url, [])) {
      throw fail('BROWSER_URL_NOT_ALLOWED', '该外部授权地址不被允许。');
    }

    const detected = findSystemChromiumBrowser({
      platform,
      existsSync,
      env,
      homedir: typeof homedir === 'function' ? homedir() : homedir,
    });

    if (!detected) {
      if (typeof openExternalFallback === 'function') {
        await openExternalFallback(url.trim());
        return {
          browser: 'system',
          fallback: true,
          proxied: false,
          close() {},
        };
      }
      throw fail('AUTH_BROWSER_OPEN_FAILED', '未检测到 Chrome 或 Edge 浏览器，请复制授权链接在外部浏览器中完成登录。');
    }

    const baseTemp = typeof tmpdir === 'function' ? tmpdir() : tmpdir;
    const userDataDir = await fs.mkdtemp(path.join(baseTemp, 'dingtu-oauth-'));
    let launchSpec;
    try {
      launchSpec = buildExternalOAuthLaunchSpec({
        url,
        userDataDir,
        environmentMode: environmentModeProvider(),
        proxyReady: proxyReadyProvider() === true,
        baseEnv: env,
      });
    } catch (error) {
      await removeTempDirWithRetry(fs, userDataDir, { attempts: 2, retryDelayMs: cleanupRetryDelayMs });
      throw error;
    }

    let child;
    try {
      child = spawn(detected.executablePath, [...launchSpec.args], {
        shell: false,
        windowsHide: false,
        stdio: 'ignore',
        env: launchSpec.env,
      });
    } catch {
      await removeTempDirWithRetry(fs, userDataDir, { attempts: 2, retryDelayMs: cleanupRetryDelayMs });
      throw fail('AUTH_BROWSER_OPEN_FAILED', '无法启动外部授权浏览器，请复制授权链接手动打开。');
    }

    let closedByCaller = false;
    let exited = false;
    let cleanupStarted = false;
    let closeNotifyTimer = null;

    const cleanupTempAndTracking = () => {
      if (cleanupStarted) return;
      cleanupStarted = true;
      activeSessions.delete(sessionRecord);
      void removeTempDirWithRetry(fs, userDataDir, { attempts: 5, retryDelayMs: cleanupRetryDelayMs });
    };

    const close = () => {
      closedByCaller = true;
      if (closeNotifyTimer) {
        clearTimeout(closeNotifyTimer);
        closeNotifyTimer = null;
      }
      if (!exited && child) {
        try { child.kill(); } catch {}
      }
      cleanupTempAndTracking();
    };

    const sessionRecord = {
      browser: detected.browser,
      executablePath: detected.executablePath,
      userDataDir,
      child,
      close,
    };
    activeSessions.add(sessionRecord);

    const startedAt = Date.now();
    child?.once?.('error', () => {
      exited = true;
      cleanupTempAndTracking();
    });
    child?.once?.('exit', () => {
      exited = true;
      const aliveMs = Date.now() - startedAt;
      if (!closedByCaller && aliveMs >= 400 && typeof onClosed === 'function') {
        closeNotifyTimer = setTimeout(() => {
          closeNotifyTimer = null;
          if (!closedByCaller) {
            try { onClosed(); } catch {}
          }
        }, closeCallbackDelayMs);
        closeNotifyTimer?.unref?.();
      }
      cleanupTempAndTracking();
    });

    return {
      browser: detected.browser,
      executablePath: detected.executablePath,
      userDataDir,
      fallback: false,
      proxied: launchSpec.proxied,
      close,
    };
  }

  function dispose() {
    for (const sessionRecord of [...activeSessions]) {
      try { sessionRecord.close(); } catch {}
    }
    activeSessions.clear();
  }

  return Object.freeze({
    openOAuthWindow,
    dispose,
    activeCount: () => activeSessions.size,
  });
}
