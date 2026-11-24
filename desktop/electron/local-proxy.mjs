import { spawn as defaultSpawn } from 'node:child_process';
import { createServer, createConnection } from 'node:net';
import { setTimeout as wait } from 'node:timers/promises';
import { writeFile, unlink } from 'node:fs/promises';
import { LOCAL_PROXY } from './runtime-contract.mjs';

const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };

const MAX_STDERR_CHARS = 4096;
function classifySingBoxStderr(raw, fallbackCode = 'PROXY_FRONTEND_EXITED') {
  const text = typeof raw === 'string' ? raw : '';
  if (/(?:access is denied|permission denied|requires elevation|operation not permitted|administrator)/i.test(text)) {
    return 'PROXY_ACCESS_DENIED';
  }
  if (/(?:address already in use|only one usage of each socket address|bind:.*in use)/i.test(text)) {
    return 'PROXY_PORT_IN_USE';
  }
  if (/(?:decode config|parse config|invalid config|unknown field|missing .*outbound|missing .*inbound)/i.test(text)) {
    return 'PROXY_CONFIG_INVALID';
  }
  if (/(?:dns|resolver|lookup failed)/i.test(text)) {
    return 'PROXY_DNS_ERROR';
  }
  if (/(?:route|routing table|iphlpapi|netlink)/i.test(text)) {
    return 'PROXY_ROUTE_ERROR';
  }
  return fallbackCode;
}

function attachSanitizedStderr(proc) {
  let tail = '';
  if (proc?.stderr && typeof proc.stderr.on === 'function') {
    proc.stderr.on('data', chunk => {
      try {
        const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        tail = (tail + text).slice(-MAX_STDERR_CHARS);
      } catch {}
    });
    proc.stderr.on('error', () => {});
  }
  return fallbackCode => classifySingBoxStderr(tail, fallbackCode);
}

function validateLaunchOptions(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('PROXY_CONFIG_INVALID', '本地代理启动参数无效。');
  if (options.host !== LOCAL_PROXY.host || options.port !== LOCAL_PROXY.port) fail('PROXY_PORT_LOCKED', '定途本地代理必须监听 127.0.0.1:17899。');
  if (typeof options.binary !== 'string' || !options.binary.trim() || options.binary.length > 1024) fail('PROXY_CONFIG_INVALID', '本地内核路径无效。');
  if (!Array.isArray(options.args) || options.args.some(value => typeof value !== 'string' || value.length > 4096 || /[\r\n]/.test(value))) fail('PROXY_CONFIG_INVALID', '本地内核参数无效。');
  return { binary: options.binary, args: [...options.args], host: LOCAL_PROXY.host, port: LOCAL_PROXY.port };
}

const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_CONFIG_TTL_MS = 660_000;
function validateTunnelConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) fail('PROXY_CONFIG_INVALID', '服务端配置格式无效。');
  const serialized = JSON.stringify(config);
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > MAX_CONFIG_BYTES) fail('PROXY_CONFIG_INVALID', '服务端配置过大。');
  if (!Array.isArray(config.inbounds) || !config.inbounds.length || !Array.isArray(config.outbounds) || !config.outbounds.length) fail('PROXY_CONFIG_INVALID', '服务端配置缺少入站或出站。');
  if (config.inbounds.some(item => item?.type === 'tun' || item?.type === 'redirect' || item?.type === 'tproxy')) {
    fail('PROXY_CONFIG_INVALID', '服务端配置包含未允许的系统入口。');
  }
  if (!config.inbounds.every(item => item && typeof item === 'object' && item.listen === LOCAL_PROXY.host && item.listen_port === LOCAL_PROXY.port)) fail('PROXY_PORT_LOCKED', '服务端配置必须只监听 127.0.0.1:17899。');
  return JSON.parse(serialized);
}

function ensurePortAvailable() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', error => reject(Object.assign(
      new Error(error.code === 'EADDRINUSE' ? '本机 17899 已被其他进程占用。' : '无法监听本机 17899。'),
      { code: error.code === 'EADDRINUSE' ? 'PROXY_PORT_IN_USE' : 'PROXY_START_FAILED' },
    )));
    server.listen({ host: LOCAL_PROXY.host, port: LOCAL_PROXY.port, exclusive: true }, () => server.close(resolve));
  });
}

function isPortListening() {
  return new Promise(resolve => {
    const socket = createConnection({ host: LOCAL_PROXY.host, port: LOCAL_PROXY.port });
    const finish = ready => { socket.destroy(); resolve(ready); };
    socket.setTimeout(200, () => finish(false));
    socket.once('error', () => finish(false));
    socket.once('connect', () => finish(true));
  });
}

export function createLocalProxySupervisor({
  spawn = defaultSpawn, fs = { writeFile, unlink }, onStateChange = () => {},
  now = Date.now, schedule = setTimeout, cancelSchedule = clearTimeout,
  checkPort = ensurePortAvailable, probePort = isPortListening,
} = {}) {
  let child = null;
  let state = 'stopped';
  let lastExit = null;
  let lastExitCategory = null;
  let activeConfigPath = null;
  let expiryTimer = null;
  let configEpoch = 0;
  let configPending = false;
  let reloading = false;
  const exitWaiters = new Set();
  const readyWaiters = new Set();
  const notifyExitWaiters = () => {
    for (const resolve of [...exitWaiters]) {
      exitWaiters.delete(resolve);
      try { resolve(); } catch {}
    }
  };
  const notifyReadyWaiters = () => {
    for (const notify of [...readyWaiters]) {
      try { notify(); } catch {}
    }
  };
  const clearExpiry = () => { if (expiryTimer !== null) cancelSchedule(expiryTimer); expiryTimer = null; };
  const unlinkQuiet = target => { if (target) void fs.unlink(target).catch(() => {}); };
  const removeConfig = () => { clearExpiry(); const target = activeConfigPath; activeConfigPath = null; unlinkQuiet(target); };

  function snapshot() { return Object.freeze({ state, host: LOCAL_PROXY.host, port: LOCAL_PROXY.port, lastExit, lastExitCategory }); }
  function changed() { notifyReadyWaiters(); try { onStateChange(snapshot()); } catch {} }

  async function waitForListener(process, listenTimeoutMs = 4000) {
    const boundedMs = Number.isFinite(listenTimeoutMs) && listenTimeoutMs >= 200 ? listenTimeoutMs : 4000;
    const deadline = Date.now() + boundedMs;
    while (child === process && state === 'starting') {
      const portReady = await probePort();
      if (child !== process || state !== 'starting') return;
      if (portReady) { state = 'running'; changed(); return; }
      if (Date.now() >= deadline) {
        state = 'failed'; lastExit = 'listen_timeout'; lastExitCategory = 'PROXY_LISTEN_TIMEOUT';
        removeConfig();
        changed();
        try { process.kill(); } catch {}
        return;
      }
      await wait(75);
    }
  }

  function waitForStartupReady(targetProcess, startedEpoch) {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (startedEpoch !== configEpoch) {
          readyWaiters.delete(check);
          reject(Object.assign(new Error('已取消本地连接。'), { code: 'PROXY_START_CANCELLED' }));
          return;
        }
        if (state === 'running' && child === targetProcess) {
          readyWaiters.delete(check);
          resolve(snapshot());
          return;
        }
        if (state !== 'starting' || child !== targetProcess) {
          readyWaiters.delete(check);
          const errCode = lastExitCategory || (lastExit === 'listen_timeout' ? 'PROXY_LISTEN_TIMEOUT' : 'PROXY_START_FAILED');
          reject(Object.assign(new Error('本机代理进程启动失败。'), {
            code: errCode,
            lastExit,
            lastExitCategory: errCode,
          }));
        }
      };
      readyWaiters.add(check);
      check();
    });
  }

  function start(options) {
    if (child || reloading) fail('PROXY_ALREADY_RUNNING', '本地代理已经在运行。');
    const config = validateLaunchOptions(options);
    const listenTimeoutMs = Number.isFinite(options?.listenTimeoutMs) ? options.listenTimeoutMs : 4000;
    child = spawn(config.binary, config.args, { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], detached: false });
    if (!child || typeof child.once !== 'function') { child = null; state = 'stopped'; fail('PROXY_START_FAILED', '本地代理进程未能启动。'); }
    const classifyStderr = attachSanitizedStderr(child);
    state = 'starting'; lastExit = null; lastExitCategory = null;
    changed();
    const spawnedProc = child;
    spawnedProc.once('spawn', () => { void waitForListener(spawnedProc, listenTimeoutMs); });
    spawnedProc.once('error', () => {
      if (child !== spawnedProc) return;
      child = null; state = 'failed'; lastExit = 'spawn_error'; lastExitCategory = 'PROXY_SPAWN_ERROR'; removeConfig(); changed(); notifyExitWaiters();
    });
    spawnedProc.once('exit', (code, signal) => {
      if (child !== spawnedProc) return;
      child = null;
      if (lastExit !== 'listen_timeout') {
        const expectedStop = state === 'stopping' || code === 0;
        state = expectedStop ? 'stopped' : 'failed';
        lastExit = signal ? `signal:${signal}` : `code:${code ?? 'unknown'}`;
        lastExitCategory = expectedStop ? null : classifyStderr('PROXY_FRONTEND_EXITED');
      }
      removeConfig(); changed(); notifyExitWaiters();
    });
    return snapshot();
  }

  function stop() {
    configEpoch++;
    clearExpiry();
    const wasReloading = reloading;
    reloading = false;
    if (!child) {
      removeConfig();
      if (wasReloading) { state = 'stopped'; lastExit = null; lastExitCategory = null; changed(); }
      else notifyReadyWaiters();
      notifyExitWaiters();
      return snapshot();
    }
    const targetChild = child;
    state = 'stopping';
    lastExitCategory = null;
    changed();
    try { targetChild.kill(); } catch {
      if (child === targetChild) {
        state = 'failed'; lastExit = 'stop_error'; lastExitCategory = 'PROXY_FRONTEND_EXITED';
        child = null; removeConfig(); changed(); notifyExitWaiters();
      }
    }
    return snapshot();
  }

  async function stopAndWait(timeoutMs = 3500) {
    if (!child) return stop();
    const boundedMs = Math.max(200, Math.min(10_000, Number(timeoutMs) || 3500));
    let timer = null;
    let resolver = null;
    const waitExited = new Promise(resolve => {
      resolver = () => {
        exitWaiters.delete(resolver);
        if (timer !== null) { cancelSchedule(timer); timer = null; }
        resolve();
      };
      exitWaiters.add(resolver);
      timer = schedule(resolver, boundedMs);
      timer?.unref?.();
    });
    stop();
    await waitExited;
    return snapshot();
  }

  async function startConfig({ binary, config, configPath, expiresAt, listenTimeoutMs, waitForReady = false } = {}) {
    if (child || configPending || reloading) fail('PROXY_ALREADY_RUNNING', '定途本地代理已经在运行。');
    if (typeof configPath !== 'string' || !configPath.trim() || configPath.length > 1024) fail('PROXY_CONFIG_INVALID', '本地配置路径无效。');
    const until = expiresAt === undefined ? null : Date.parse(expiresAt);
    if (until !== null && (!Number.isFinite(until) || until <= now() || until > now() + MAX_CONFIG_TTL_MS)) fail('PROXY_CONFIG_INVALID', '服务端配置已过期。');
    const checked = validateTunnelConfig(config);
    const serialized = JSON.stringify(checked);
    const startedEpoch = configEpoch;
    configPending = true;
    try {
      await checkPort();
      if (startedEpoch !== configEpoch) fail('PROXY_START_CANCELLED', '已取消本地连接。');
      try { await fs.writeFile(configPath, serialized, { encoding: 'utf8', mode: 0o600 }); }
      catch { fail('PROXY_CONFIG_WRITE_FAILED', '本地配置无法安全写入。'); }
      if (startedEpoch !== configEpoch) {
        await fs.unlink(configPath).catch(() => {});
        fail('PROXY_START_CANCELLED', '已取消本地连接。');
      }
      if (until !== null && until <= now()) {
        await fs.unlink(configPath).catch(() => {});
        fail('PROXY_CONFIG_INVALID', '服务端配置已过期。');
      }
      activeConfigPath = configPath;
      try {
        const result = start({
          binary,
          args: ['run', '-c', configPath],
          host: LOCAL_PROXY.host,
          port: LOCAL_PROXY.port,
          listenTimeoutMs: Number.isFinite(listenTimeoutMs) ? listenTimeoutMs : 4000,
        });
        const spawnedChild = child;
        const finalResult = waitForReady ? await waitForStartupReady(spawnedChild, startedEpoch) : result;
        if (until !== null) {
          expiryTimer = schedule(() => { expiryTimer = null; stop(); }, until - now());
          expiryTimer?.unref?.();
        }
        return finalResult;
      } catch (error) {
        removeConfig();
        throw error;
      }
    } finally {
      configPending = false;
    }
  }

  async function waitForPortRelease() {
    let lastError = null;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      try {
        await checkPort();
        return;
      } catch (error) {
        lastError = error;
        if (error?.code !== 'PROXY_PORT_IN_USE' || attempt === 24) throw error;
        await wait(60);
      }
    }
    throw lastError;
  }

  async function reloadConfig({ binary, config, configPath, expiresAt, listenTimeoutMs } = {}) {
    if (child && state === 'starting' && !configPending && !reloading) {
      fail('PROXY_START_PENDING', '本地代理正在初始化，稍后自动续期。');
    }
    if (!child || state !== 'running' || configPending || reloading) {
      fail('PROXY_CONTROL_FAILED', '本地代理当前无法热切换。');
    }
    if (typeof configPath !== 'string' || !configPath.trim() || configPath.length > 1024) {
      fail('PROXY_CONFIG_INVALID', '本地配置路径无效。');
    }
    const until = expiresAt === undefined ? null : Date.parse(expiresAt);
    if (until !== null && (!Number.isFinite(until) || until <= now() || until > now() + MAX_CONFIG_TTL_MS)) {
      fail('PROXY_CONFIG_INVALID', '服务端配置已过期。');
    }
    const launch = validateLaunchOptions({ binary, args: ['run', '-c', configPath], host: LOCAL_PROXY.host, port: LOCAL_PROXY.port });
    const checked = validateTunnelConfig(config);
    const serialized = JSON.stringify(checked);

    const reloadEpoch = ++configEpoch;
    clearExpiry();
    reloading = true;
    const previousChild = child;
    child = null;

    try {
      await new Promise(resolve => {
        let settled = false;
        let timer = null;
        const done = () => {
          if (settled) return;
          settled = true;
          if (timer !== null) clearTimeout(timer);
          resolve();
        };
        previousChild.once('exit', done);
        previousChild.once('error', done);
        timer = setTimeout(done, 1500);
        try { previousChild.kill(); } catch { done(); }
      });
      if (reloadEpoch !== configEpoch) fail('PROXY_START_CANCELLED', '已取消本地连接。');
      await waitForPortRelease();
      if (reloadEpoch !== configEpoch) fail('PROXY_START_CANCELLED', '已取消本地连接。');
      if (until !== null && until <= now()) fail('PROXY_CONFIG_INVALID', '服务端配置已过期。');
      try {
        await fs.writeFile(configPath, serialized, { encoding: 'utf8', mode: 0o600 });
      } catch {
        fail('PROXY_CONFIG_WRITE_FAILED', '本地配置无法安全写入。');
      }
      activeConfigPath = configPath;
      if (reloadEpoch !== configEpoch) {
        removeConfig();
        fail('PROXY_START_CANCELLED', '已取消本地连接。');
      }

      const nextChild = spawn(launch.binary, launch.args, { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], detached: false });
      if (!nextChild || typeof nextChild.once !== 'function') {
        fail('PROXY_START_FAILED', '本地代理进程未能启动。');
      }
      const classifyNextStderr = attachSanitizedStderr(nextChild);
      child = nextChild;
      let prematureExit = null;
      let wakeProbe = null;
      nextChild.once('error', () => {
        if (child !== nextChild) return;
        if (reloading) {
          prematureExit = 'spawn_error';
          wakeProbe?.();
          return;
        }
        child = null; state = 'failed'; lastExit = 'spawn_error'; lastExitCategory = 'PROXY_SPAWN_ERROR'; removeConfig(); changed();
      });
      nextChild.once('exit', (code, signal) => {
        if (child !== nextChild) return;
        if (reloading) {
          prematureExit = signal ? `signal:${signal}` : `code:${code ?? 'unknown'}`;
          wakeProbe?.();
          return;
        }
        child = null;
        if (lastExit !== 'listen_timeout') {
          const expectedStop = state === 'stopping' || code === 0;
          state = expectedStop ? 'stopped' : 'failed';
          lastExit = signal ? `signal:${signal}` : `code:${code ?? 'unknown'}`;
          lastExitCategory = expectedStop ? null : classifyNextStderr('PROXY_FRONTEND_EXITED');
        }
        removeConfig(); changed(); notifyExitWaiters();
      });

      const boundedTimeout = Number.isFinite(listenTimeoutMs) && listenTimeoutMs >= 50 ? listenTimeoutMs : 4000;
      const deadline = Date.now() + boundedTimeout;
      let listening = false;
      while (reloadEpoch === configEpoch && child === nextChild && !prematureExit) {
        const ready = await probePort();
        if (reloadEpoch !== configEpoch || prematureExit || child !== nextChild) break;
        if (ready) {
          listening = true;
          break;
        }
        if (Date.now() >= deadline) {
          prematureExit = 'listen_timeout';
          break;
        }
        await new Promise(resolve => {
          let timer = null;
          const finish = () => {
            if (timer !== null) clearTimeout(timer);
            resolve();
          };
          wakeProbe = finish;
          timer = setTimeout(finish, 50);
        });
        wakeProbe = null;
      }

      if (reloadEpoch !== configEpoch) fail('PROXY_START_CANCELLED', '已取消本地连接。');
      if (!listening) {
        lastExit = prematureExit || 'listen_timeout';
        lastExitCategory = lastExit === 'listen_timeout'
          ? 'PROXY_LISTEN_TIMEOUT'
          : lastExit === 'spawn_error'
            ? 'PROXY_SPAWN_ERROR'
            : classifyNextStderr('PROXY_FRONTEND_EXITED');
        fail('PROXY_START_FAILED', lastExit === 'listen_timeout' ? 'sing-box 热切换后未能监听本机 17899。' : '本地代理热切换失败。');
      }

      state = 'running';
      lastExit = null;
      lastExitCategory = null;
      reloading = false;
      if (until !== null) {
        expiryTimer = schedule(() => { expiryTimer = null; stop(); }, until - now());
        expiryTimer?.unref?.();
      }
      return snapshot();
    } catch (error) {
      const cancelled = error?.code === 'PROXY_START_CANCELLED' || reloadEpoch !== configEpoch;
      reloading = false;
      if (child) {
        const lingering = child;
        child = null;
        try { lingering.kill(); } catch {}
      }
      removeConfig();
      if (!cancelled) {
        state = 'failed';
        if (!lastExit) lastExit = error?.code === 'PROXY_PORT_IN_USE' ? 'port_in_use' : 'reload_failed';
        changed();
      } else if (state !== 'stopped') {
        state = 'stopped';
        lastExit = null;
        changed();
      }
      throw error;
    }
  }

  return Object.freeze({
    start,
    startConfig,
    reloadConfig,
    stop,
    stopAndWait,
    status: snapshot,
    isRunning: () => child !== null || reloading,
  });
}

export { validateLaunchOptions, validateTunnelConfig, classifySingBoxStderr };
