import { spawn as defaultSpawn, execFile as defaultExecFile } from 'node:child_process';
import { existsSync as defaultExists, mkdirSync as defaultMkdir } from 'node:fs';
import path from 'node:path';
import { LOCAL_PROXY } from './runtime-contract.mjs';

const allowedEnv = new Set(['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'WS_PROXY', 'WSS_PROXY']);
// Keep the child usable on all three desktop platforms without inheriting
// arbitrary application credentials or code-injection variables from Noya.
const safeBaseEnv = new Set([
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOME', 'HOMEDRIVE', 'HOMEPATH',
  'PROGRAMDATA', 'ProgramFiles', 'ProgramFiles(x86)', 'CommonProgramFiles',
  'CommonProgramFiles(x86)', 'ComSpec', 'OS', 'PROCESSOR_ARCHITECTURE',
  'PROCESSOR_ARCHITEW6432', 'NUMBER_OF_PROCESSORS', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'TERM', 'SHELL', 'USER', 'USERNAME', 'COMPUTERNAME', 'SYSTEMDRIVE', 'SystemDrive',
  'ALLUSERSPROFILE', 'PUBLIC', 'SESSIONNAME',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_RUNTIME_DIR',
  'CODEX_HOME', 'NO_COLOR', 'CI', 'TERM_PROGRAM',
]);
const safeAugmentationEnvKeys = new Set([
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'no_proxy', 'WS_PROXY', 'WSS_PROXY', 'NODE_USE_ENV_PROXY',
  'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'GROK_HOME', 'GEMINI_CLI_HOME', 'XDG_CONFIG_HOME',
  'ANTHROPIC_BASE_URL', 'OPENAI_BASE_URL', 'GOOGLE_GEMINI_BASE_URL', 'XAI_BASE_URL',
]);
const token = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };

function placeholder(value) {
  const match = /^\{\{local\.([A-Za-z][A-Za-z0-9]*)\}\}$/.exec(value);
  if (!match) fail('TEMPLATE_INVALID', '应用环境变量模板无效。');
  const locals = { http: LOCAL_PROXY.http, https: LOCAL_PROXY.http, socks5: LOCAL_PROXY.socks5, host: LOCAL_PROXY.host, port: String(LOCAL_PROXY.port) };
  if (!(match[1] in locals)) fail('TEMPLATE_INVALID', '应用环境变量引用了未知本地值。');
  return locals[match[1]];
}

function resolveArg(value) {
  if (typeof value !== 'string') fail('TEMPLATE_INVALID', '应用启动参数无效。');
  const resolved = value.replace(/\{\{local\.([A-Za-z][A-Za-z0-9]*)\}\}/g, (_match, name) => placeholder(`{{local.${name}}}`));
  if (/[{}]/.test(resolved)) fail('TEMPLATE_INVALID', '应用启动参数包含未允许的占位符。');
  return resolved;
}

function validArg(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200 || /[\r\n\u0000]/.test(value)) return false;
  try { resolveArg(value); return true; } catch { return false; }
}

function pathLike(value) { return /^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(value); }
function shellLike(value) { return /^(?:sh|bash|zsh|fish|cmd|cmd\.exe|powershell|pwsh)(?:\s|$)/i.test(value); }

function validateApp(app) {
  if (!app || typeof app !== 'object' || Array.isArray(app) || !token.test(app.id) || !['verified', 'beta'].includes(app.platformStatus)) fail('APP_NOT_READY', '应用尚未验证，不能启动。');
  const template = app.template;
  if (!template || typeof template !== 'object') fail('TEMPLATE_INVALID', '应用启动模板无效。');
  if (['app-server', 'electron-profile'].includes(template.adapter)) fail('APP_ADAPTER_UNSUPPORTED', '该应用适配器尚未交付。');
  if (!['env-launch', 'electron-launch'].includes(template.adapter) || template.status !== app.platformStatus || !template.launch || template.launch.kind !== 'exec' || !Array.isArray(template.launch.argv) || !template.launch.argv.length) fail('TEMPLATE_INVALID', '应用启动模板无效。');
  if (!template.launch.argv.every(validArg) || shellLike(template.launch.argv[0])) fail('TEMPLATE_INVALID', '应用启动参数无效。');
  const env = template.launch.env;
  if (!env || typeof env !== 'object' || Array.isArray(env) || Object.keys(env).some(key => !allowedEnv.has(key))) fail('TEMPLATE_INVALID', '应用环境变量白名单无效。');
  return { template, argv: template.launch.argv.map(resolveArg), env };
}

function resolveEnvironment(templateEnv, base = {}) {
  const output = {};
  for (const [key, value] of Object.entries(base || {})) {
    if (safeBaseEnv.has(key) && typeof value === 'string' && !/[\r\n\u0000]/.test(value)) output[key] = value;
  }
  for (const [key, value] of Object.entries(templateEnv)) output[key] = placeholder(value);
  return output;
}

function windowsStandardPaths(name, baseEnv = {}) {
  const localAppData = baseEnv.LOCALAPPDATA;
  const programFiles = baseEnv.ProgramFiles;
  const appData = baseEnv.APPDATA;
  const candidates = [];
  const pushLocal = (...segments) => {
    if (localAppData && typeof localAppData === 'string') {
      candidates.push(path.win32.join(localAppData, ...segments));
      if (/^[D-Zd-z]:[\\/]Users[\\/]/i.test(localAppData)) {
        candidates.push(path.win32.join(`C:${localAppData.slice(2)}`, ...segments));
      }
    }
  };
  const pushProg = (...segments) => {
    if (programFiles && typeof programFiles === 'string') candidates.push(path.win32.join(programFiles, ...segments));
  };
  const pushRoaming = (...segments) => {
    if (appData && typeof appData === 'string') candidates.push(path.win32.join(appData, ...segments));
  };
  const lower = name.toLowerCase();
  if (lower === 'cursor.exe' || lower === 'cursor') {
    pushLocal('Programs', 'cursor', 'Cursor.exe');
    pushProg('cursor', 'Cursor.exe');
  }
  else if (lower === 'antigravity.exe' || lower === 'antigravity') {
    pushLocal('Programs', 'Antigravity', 'Antigravity.exe');
    pushLocal('Programs', 'Antigravity IDE', 'Antigravity IDE.exe');
    pushLocal('Programs', 'Antigravity IDE', 'Antigravity.exe');
  }
  else if (lower === 'agy.exe' || lower === 'agy.cmd' || lower === 'agy') {
    pushLocal('agy', 'bin', 'agy.exe');
  }
  else if (lower === 'windsurf.exe' || lower === 'windsurf') {
    pushLocal('Programs', 'Windsurf', 'Windsurf.exe');
    pushProg('Windsurf', 'Windsurf.exe');
  }
  else if (lower === 'kiro.exe' || lower === 'kiro') pushLocal('Programs', 'Kiro', 'Kiro.exe');
  else if (lower === 'code.exe' || lower === 'code') {
    pushLocal('Programs', 'Microsoft VS Code', 'Code.exe');
    pushProg('Microsoft VS Code', 'Code.exe');
  }
  else if (lower === 'codex.exe' || lower === 'codex-desktop.exe') pushLocal('Programs', 'Codex', 'Codex.exe');
  else if (lower === 'codex.cmd' || lower === 'codex') pushRoaming('npm', 'codex.cmd');
  else if (lower === 'gemini.cmd' || lower === 'gemini' || lower === 'gemini.exe') pushRoaming('npm', 'gemini.cmd');
  else if (lower === 'grok.cmd' || lower === 'grok' || lower === 'grok.exe') pushRoaming('npm', 'grok.cmd');
  else if (lower === 'claude.exe') {
    if (baseEnv.USERPROFILE && typeof baseEnv.USERPROFILE === 'string') candidates.push(path.win32.join(baseEnv.USERPROFILE, '.local', 'bin', 'claude.exe'));
    pushLocal('AnthropicClaude', 'Claude.exe');
  }
  return candidates;
}

export function pickBestWindowsExecutable(stdout) {
  if (typeof stdout !== 'string' || !stdout.trim()) return null;
  const lines = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const rank = p => {
    const lower = p.toLowerCase();
    if (lower.endsWith('.exe')) return 0;
    if (lower.endsWith('.cmd')) return 1;
    if (lower.endsWith('.bat')) return 2;
    return 3;
  };
  lines.sort((a, b) => rank(a) - rank(b));
  return lines[0];
}

function psSingleQuote(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

const AUMID_PATTERN = /^[A-Za-z0-9._-]+![A-Za-z0-9._-]+$/;
const DEFAULT_CODEX_AUMID = 'OpenAI.Codex_2p2nqsd0c76g0!App';

function deriveAumidFromWindowsAppsPath(exePath) {
  if (typeof exePath !== 'string' || !/[\\/]Program Files[\\/]WindowsApps[\\/]/i.test(exePath)) return null;
  const match = /[\\/]WindowsApps[\\/]([^\\/]+)[\\/]/i.exec(exePath);
  if (!match?.[1]) return null;
  const pkgFullName = match[1];
  const famMatch = /^([^_]+)_.+__([A-Za-z0-9]+)$/.exec(pkgFullName);
  if (famMatch) {
    const candidate = `${famMatch[1]}_${famMatch[2]}!App`;
    if (AUMID_PATTERN.test(candidate)) return candidate;
  }
  if (/^OpenAI\.Codex/i.test(pkgFullName)) return DEFAULT_CODEX_AUMID;
  return null;
}

export function createAppLauncher({ spawn = defaultSpawn, execFile = defaultExecFile, exists = defaultExists, mkdir = defaultMkdir, platform: rawPlatform = process.platform, env = process.env } = {}) {
  const platform = rawPlatform === 'windows' ? 'win32' : rawPlatform === 'macos' ? 'darwin' : rawPlatform;
  const commandForPlatform = platform === 'win32' ? 'where.exe' : 'which';
  const detectedPaths = new Map();
  const detectedMeta = new Map();
  let appxCodexCache = { checkedAt: 0, meta: null };

  async function detectWindowsAppxCodex() {
    if (platform !== 'win32') return null;
    const nowMs = Date.now();
    const cacheTtlMs = appxCodexCache.meta ? 60_000 : 5_000;
    if (appxCodexCache.checkedAt > 0 && nowMs - appxCodexCache.checkedAt < cacheTtlMs) {
      return appxCodexCache.meta;
    }
    const psCmd = "$p = Get-AppxPackage -Name 'OpenAI.Codex' | Select-Object -First 1; if ($p) { $id = 'App'; $m = Join-Path $p.InstallLocation 'AppxManifest.xml'; if (Test-Path $m) { try { [xml]$x = Get-Content $m -Raw; $a = $x.Package.Applications.Application | Select-Object -First 1; if ($a -and $a.Id) { $id = [string]$a.Id } } catch {} }; @{ packageFamilyName = [string]$p.PackageFamilyName; installLocation = [string]$p.InstallLocation; appId = $id } | ConvertTo-Json -Compress }";
    const rawOut = await new Promise(resolve => execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psCmd],
      { windowsHide: true, timeout: 8000 },
      (error, stdout) => resolve(!error && typeof stdout === 'string' && stdout.trim() ? stdout.trim() : null),
    ));
    let meta = null;
    if (rawOut) {
      let packageFamilyName = '';
      let installDir = '';
      let appId = 'App';
      try {
        const parsed = JSON.parse(rawOut.split(/\r?\n/).filter(Boolean).pop() || '');
        if (parsed && typeof parsed === 'object') {
          packageFamilyName = typeof parsed.packageFamilyName === 'string' ? parsed.packageFamilyName.trim() : '';
          installDir = typeof parsed.installLocation === 'string' ? parsed.installLocation.trim() : '';
          if (typeof parsed.appId === 'string' && parsed.appId.trim()) appId = parsed.appId.trim();
        }
      } catch {
        installDir = rawOut.split(/\r?\n/)[0].trim();
        const derived = deriveAumidFromWindowsAppsPath(`${installDir}\\app\\ChatGPT.exe`);
        if (derived) packageFamilyName = derived.split('!')[0];
      }
      if (!packageFamilyName && installDir) {
        const derived = deriveAumidFromWindowsAppsPath(`${installDir}\\app\\ChatGPT.exe`);
        packageFamilyName = derived ? derived.split('!')[0] : 'OpenAI.Codex_2p2nqsd0c76g0';
      }
      if (installDir || packageFamilyName) {
        let executablePath = null;
        if (installDir) {
          for (const rel of [['app', 'ChatGPT.exe'], ['app', 'Codex.exe'], ['Codex.exe']]) {
            const candidate = path.win32.join(installDir, ...rel);
            if (exists(candidate)) {
              executablePath = candidate;
              break;
            }
          }
          if (!executablePath) {
            executablePath = path.win32.join(installDir, 'app', 'ChatGPT.exe');
          }
        }
        const aumid = packageFamilyName && AUMID_PATTERN.test(`${packageFamilyName}!${appId}`)
          ? `${packageFamilyName}!${appId}`
          : DEFAULT_CODEX_AUMID;
        meta = Object.freeze({
          kind: 'appx',
          aumid,
          installDir: installDir || null,
          executablePath: executablePath || aumid,
        });
      }
    }
    appxCodexCache = { checkedAt: Date.now(), meta };
    return meta;
  }

  function resolveAppxAumid(appId, executable) {
    if (platform !== 'win32') return null;
    const cached = detectedMeta.get(appId);
    if (cached?.kind === 'appx' && typeof cached.aumid === 'string' && AUMID_PATTERN.test(cached.aumid)) {
      return cached.aumid;
    }
    if (typeof executable === 'string' && /[\\/]Program Files[\\/]WindowsApps[\\/]/i.test(executable)) {
      if (appxCodexCache.meta?.aumid && AUMID_PATTERN.test(appxCodexCache.meta.aumid)) {
        return appxCodexCache.meta.aumid;
      }
      return deriveAumidFromWindowsAppsPath(executable);
    }
    return null;
  }

  function spawnSafe(command, args, options) {
    let child;
    try {
      child = spawn(command, args, options);
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOENT'].includes(error?.code)) throw error;
      fail('LAUNCH_FAILED', '应用进程未能启动。');
    }
    if (!child || typeof child.once !== 'function') fail('LAUNCH_FAILED', '应用进程未能启动。');
    return child;
  }

  function spawnAppXViaShell(aumid) {
    if (typeof aumid !== 'string' || !AUMID_PATTERN.test(aumid)) {
      fail('TEMPLATE_INVALID', 'Windows 应用激活标识无效。');
    }
    const child = spawnSafe('explorer.exe', [`shell:AppsFolder\\${aumid}`], {
      shell: false,
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
    });
    try { child.unref?.(); } catch {}
    try { child.dingtuShellActivated = true; } catch {}
    return child;
  }

  async function detect(app) {
    const { template, argv } = validateApp(app);
    if (!template.detect || template.detect.kind !== 'executable' || !Array.isArray(template.detect.names) || !template.detect.names.length) return { status: 'unknown', reason: 'NO_EXECUTABLE_DETECTOR' };
    for (const name of template.detect.names) {
      if (typeof name !== 'string' || name.length === 0 || name.length > 1024 || /[\r\n\u0000]/.test(name) || (!pathLike(name) && !token.test(name))) fail('TEMPLATE_INVALID', '应用检测名称无效。');
      if (pathLike(name)) {
        if (exists(name)) {
          detectedPaths.set(app.id, name);
          detectedMeta.delete(app.id);
          return { status: 'installed', path: name, command: argv[0] };
        }
        continue;
      }
      if (platform === 'win32') {
        for (const candidatePath of windowsStandardPaths(name, env)) {
          if (exists(candidatePath)) {
            detectedPaths.set(app.id, candidatePath);
            detectedMeta.delete(app.id);
            return { status: 'installed', path: candidatePath, command: candidatePath };
          }
        }
        const lowerName = name.toLowerCase();
        if (lowerName === 'codex.exe' || lowerName === 'codex-desktop.exe') {
          const appxMeta = await detectWindowsAppxCodex();
          if (appxMeta) {
            detectedMeta.set(app.id, appxMeta);
            detectedPaths.set(app.id, appxMeta.executablePath);
            return { status: 'installed', path: appxMeta.executablePath, command: appxMeta.aumid, kind: 'appx', aumid: appxMeta.aumid };
          }
        }
      }
      const found = await new Promise(resolve => execFile(commandForPlatform, [name], { windowsHide: true, timeout: 3000 }, (error, stdout) => {
        if (error || typeof stdout !== 'string' || !stdout.trim()) return resolve(null);
        return resolve(platform === 'win32' ? pickBestWindowsExecutable(stdout) : stdout.trim().split(/\r?\n/)[0]);
      }));
      if (found) {
        detectedPaths.set(app.id, found);
        detectedMeta.delete(app.id);
        return { status: 'installed', path: found, command: argv[0] };
      }
    }
    return { status: 'not-installed' };
  }
  function plan(app) {
    const { template, argv, env: templateEnv } = validateApp(app);
    const args = Object.freeze(argv.slice(1));
    const injection = Object.freeze({ args: Object.freeze([...args]), env: Object.freeze(resolveEnvironment(templateEnv)) });
    return Object.freeze({ appId: app.id, adapter: template.adapter, activation: template.adapter === 'electron-launch' ? 'restart-required' : 'immediate', command: argv[0], args, envKeys: Object.freeze(Object.keys(templateEnv)), injection });
  }
  function resolveExecutableCommand(rawCommand, detectNames = []) {
    if (platform !== 'win32' || pathLike(rawCommand)) return rawCommand;
    const namesToProbe = [rawCommand, ...(Array.isArray(detectNames) ? detectNames : [])];
    for (const candidateName of namesToProbe) {
      for (const fullPath of windowsStandardPaths(candidateName, env)) {
        if (exists(fullPath)) return fullPath;
      }
    }
    return rawCommand;
  }
  function launch(app) {
    const { template, argv, env: templateEnv } = validateApp(app);
    const exe = detectedPaths.get(app.id) || resolveExecutableCommand(argv[0], template.detect?.names);
    const appxAumid = resolveAppxAumid(app.id, exe);
    if (appxAumid) return spawnAppXViaShell(appxAumid);
    const isElectronGui = template.adapter === 'electron-launch';
    const child = spawnSafe(exe, argv.slice(1), {
      shell: false,
      windowsHide: !isElectronGui,
      env: resolveEnvironment(templateEnv, env),
      stdio: 'ignore',
      detached: isElectronGui,
    });
    if (isElectronGui) { try { child.unref?.(); } catch {} }
    return child;
  }
  function launchWithSafeContext(app, augmentation = {}) {
    const { template, argv, env: templateEnv } = validateApp(app);
    const mode = augmentation?.mode === 'own_network' ? 'own_network' : 'safe_tunnel';
    const baseArgs = mode === 'own_network'
      ? argv.slice(1).filter(arg => !arg.startsWith('--proxy-server=') && !arg.startsWith('--proxy-bypass-list='))
      : argv.slice(1);
    const extraArgs = Array.isArray(augmentation?.extraArgs) ? augmentation.extraArgs : [];
    for (const arg of extraArgs) {
      if (typeof arg !== 'string' || arg.length === 0 || arg.length > 512 || /[\r\n\u0000]/.test(arg)) {
        fail('TEMPLATE_INVALID', '安全沙箱附加参数无效。');
      }
    }
    const mergedEnv = resolveEnvironment(templateEnv, env);
    if (Array.isArray(augmentation?.stripEnvKeys)) {
      for (const key of augmentation.stripEnvKeys) delete mergedEnv[key];
    }
    if (augmentation?.envPatch && typeof augmentation.envPatch === 'object') {
      for (const [key, value] of Object.entries(augmentation.envPatch)) {
        if (!safeAugmentationEnvKeys.has(key) || typeof value !== 'string' || /[\r\n\u0000]/.test(value)) {
          fail('TEMPLATE_INVALID', '安全沙箱环境变量不在允许范围内。');
        }
        mergedEnv[key] = value;
      }
    }
    for (const dirCandidate of [mergedEnv.CODEX_HOME, mergedEnv.CLAUDE_CONFIG_DIR]) {
      if (dirCandidate) { try { mkdir(dirCandidate, { recursive: true }); } catch {} }
    }
    for (const arg of extraArgs) {
      if (arg.startsWith('--user-data-dir=')) {
        const dirPath = arg.slice('--user-data-dir='.length);
        if (dirPath) { try { mkdir(dirPath, { recursive: true }); } catch {} }
      }
    }
    const executable = typeof augmentation?.resolvedCommand === 'string' && augmentation.resolvedCommand.trim()
      ? augmentation.resolvedCommand
      : (detectedPaths.get(app.id) || resolveExecutableCommand(argv[0], template.detect?.names));

    const appxAumid = resolveAppxAumid(app.id, executable);
    if (appxAumid) return spawnAppXViaShell(appxAumid);

    if (platform === 'win32' && template.adapter === 'env-launch' && augmentation?.interactiveTerminal !== false) {
      const safeTitle = `定途 · ${String(app.name || app.id).replace(/[\r\n\u0000]/g, '').slice(0, 48)}`;
      const allArgs = [...baseArgs, ...extraArgs];
      const envStatements = Object.keys(mergedEnv)
        .filter(key => safeAugmentationEnvKeys.has(key))
        .map(key => `$env:${key} = ${psSingleQuote(mergedEnv[key])}`);
      const statusHint = mode === 'safe_tunnel'
        ? `[定途] 已接入安全代理 127.0.0.1:${LOCAL_PROXY.port} · ${app.name || app.id}`
        : `[定途] 自有网络模式 · ${app.name || app.id}`;
      const invokeLine = allArgs.length
        ? `& ${psSingleQuote(executable)} ${allArgs.map(psSingleQuote).join(' ')}`
        : `& ${psSingleQuote(executable)}`;
      const script = [
        `$Host.UI.RawUI.WindowTitle = ${psSingleQuote(safeTitle)}`,
        ...envStatements,
        `Write-Host ${psSingleQuote(statusHint)} -ForegroundColor Cyan`,
        invokeLine,
      ].join('\n');
      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      const wtCandidate = env.LOCALAPPDATA ? path.win32.join(env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'wt.exe') : '';
      const useWt = Boolean(wtCandidate && exists(wtCandidate));
      const termCmd = useWt ? wtCandidate : 'powershell.exe';
      const termArgs = useWt
        ? ['-w', 'new', 'new-tab', '--title', safeTitle, 'powershell.exe', '-NoLogo', '-NoExit', '-EncodedCommand', encoded]
        : ['-NoLogo', '-NoExit', '-EncodedCommand', encoded];
      const child = spawnSafe(termCmd, termArgs, {
        shell: false,
        windowsHide: false,
        detached: true,
        env: mergedEnv,
        stdio: 'ignore',
      });
      try { child.unref?.(); } catch {}
      return child;
    }

    const isElectronGui = template.adapter === 'electron-launch';
    const child = spawnSafe(executable, [...baseArgs, ...extraArgs], {
      shell: false,
      windowsHide: !isElectronGui,
      env: mergedEnv,
      stdio: 'ignore',
      detached: isElectronGui,
    });
    if (isElectronGui) { try { child.unref?.(); } catch {} }
    return child;
  }
  return Object.freeze({ detect, plan, launch, launchWithSafeContext });
}

export { resolveEnvironment };
