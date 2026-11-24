import { execFile as defaultExecFile, spawn as defaultSpawn } from 'node:child_process';
import { setTimeout as defaultPause } from 'node:timers/promises';

const CODEX_ENTRY = Object.freeze({
  win32: Object.freeze([
    Object.freeze({ image: 'Codex.exe' }),
    Object.freeze({ image: 'ChatGPT.exe', pathPattern: 'OpenAI\\.Codex' }),
    Object.freeze({ image: 'codex-command-runner.exe', pathPattern: 'OpenAI\\.Codex' }),
    Object.freeze({ image: 'codex-computer-use-swift.exe', pathPattern: 'OpenAI[\\\\/]Codex|OpenAI\\.Codex' }),
    Object.freeze({ image: 'codex-windows-sandbox-service.exe', pathPattern: 'OpenAI\\.Codex' }),
    Object.freeze({ image: 'codex.exe', pathPattern: 'OpenAI[\\\\/]Codex|OpenAI\\.Codex' }),
  ]),
  darwin: Object.freeze(['Codex']),
  linux: Object.freeze(['codex-desktop']),
});

export const APP_PROCESS_ALLOWLIST = Object.freeze({
  codex: CODEX_ENTRY,
  'codex-desktop': CODEX_ENTRY,
  'codex-cli': CODEX_ENTRY,
  antigravity: Object.freeze({
    win32: Object.freeze([
      Object.freeze({ image: 'Antigravity.exe' }),
      Object.freeze({ image: 'Antigravity IDE.exe' }),
      Object.freeze({ image: 'language_server_windows_x64.exe', pathPattern: 'antigravity' }),
      Object.freeze({ image: 'language_server.exe', pathPattern: 'antigravity' }),
    ]),
    darwin: Object.freeze(['Antigravity']),
    linux: Object.freeze(['antigravity']),
  }),
  cursor: Object.freeze({
    win32: Object.freeze([Object.freeze({ image: 'Cursor.exe' })]),
    darwin: Object.freeze(['Cursor']),
    linux: Object.freeze(['cursor']),
  }),
  windsurf: Object.freeze({
    win32: Object.freeze([Object.freeze({ image: 'Windsurf.exe' })]),
    darwin: Object.freeze(['Windsurf']),
    linux: Object.freeze(['windsurf']),
  }),
  kiro: Object.freeze({
    win32: Object.freeze([Object.freeze({ image: 'Kiro.exe' })]),
    darwin: Object.freeze(['Kiro']),
    linux: Object.freeze(['kiro']),
  }),
  'claude-desktop': Object.freeze({
    win32: Object.freeze([Object.freeze({ image: 'Claude.exe' })]),
    darwin: Object.freeze(['Claude']),
    linux: Object.freeze(['claude']),
  }),
  copilot: Object.freeze({
    win32: Object.freeze([Object.freeze({ image: 'Code.exe' })]),
    darwin: Object.freeze(['Code']),
    linux: Object.freeze(['code']),
  }),
  'muse-desktop': Object.freeze({
    win32: Object.freeze([]),
    darwin: Object.freeze(['Muse']),
    linux: Object.freeze([]),
  }),
});

// Static PowerShell script encoded as UTF-16LE base64; dynamic rules arrive via stdin JSON only.
export const WIN_RESTARTER_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "[Console]::InputEncoding = [System.Text.Encoding]::UTF8",
  "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
  "$raw = [Console]::In.ReadToEnd()",
  "if (-not $raw -or -not $raw.Trim()) { [Console]::WriteLine('{\"closedCount\":0,\"forcedCount\":0,\"remainingCount\":0,\"timedOut\":false}'); exit 0 }",
  "$excludeSet = New-Object 'System.Collections.Generic.HashSet[int]'",
  "if ($raw -match '\"excludePids\"\\s*:\\s*\\[([^\\]]*)\\]') { foreach ($m in [regex]::Matches($Matches[1], '\\d+')) { try { $null = $excludeSet.Add([int]$m.Value) } catch {} } }",
  "$graceMs = 1800",
  "if ($raw -match '\"gracefulTimeoutMs\"\\s*:\\s*(\\d+)') { $graceMs = [Math]::Max(200, [Math]::Min(5000, [int]$Matches[1])) }",
  "$settleMs = 400",
  "if ($raw -match '\"settleMs\"\\s*:\\s*(\\d+)') { $settleMs = [Math]::Max(0, [Math]::Min(2000, [int]$Matches[1])) }",
  "$baseSet = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)",
  "$ruleList = @()",
  "foreach ($rm in [regex]::Matches($raw, '\\{[^{}]*\"image\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])+)\"[^{}]*\\}')) {",
  "  $obj = $rm.Value",
  "  $img = [regex]::Unescape($rm.Groups[1].Value)",
  "  $pat = ''",
  "  if ($obj -match '\"pathPattern\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"') { $pat = [regex]::Unescape($Matches[1]) }",
  "  $rBase = $img -replace '\\.exe$',''",
  "  if ($rBase) { $null = $baseSet.Add($rBase); $ruleList += ,@($rBase, $pat) }",
  "}",
  "if ($baseSet.Count -eq 0) { [Console]::WriteLine('{\"closedCount\":0,\"forcedCount\":0,\"remainingCount\":0,\"timedOut\":false}'); exit 0 }",
  "function Get-TargetProcs {",
  "  $matched = @()",
  "  $seenIds = New-Object 'System.Collections.Generic.HashSet[int]'",
  "  $pool = if ($baseSet.Count -le 3) { foreach ($bn in $baseSet) { [System.Diagnostics.Process]::GetProcessesByName($bn) } } else { [System.Diagnostics.Process]::GetProcesses() }",
  "  foreach ($p in $pool) {",
  "    if ($null -eq $p) { continue }",
  "    $pname = [string]$p.ProcessName",
  "    if (-not $baseSet.Contains($pname)) { continue }",
  "    $procId = [int]$p.Id",
  "    if ($procId -le 0 -or $excludeSet.Contains($procId) -or -not $seenIds.Add($procId)) { continue }",
  "    if ($pname -imatch 'dingtu|定途') { continue }",
  "    $needsPath = $false",
  "    foreach ($pair in $ruleList) {",
  "      if ($pname -ieq $pair[0] -and $pair[1]) { $needsPath = $true; break }",
  "    }",
  "    $exePath = ''",
  "    if ($needsPath) {",
  "      try { $exePath = [string]$p.MainModule.FileName } catch {}",
  "      if ($exePath -and $exePath -imatch 'dingtu|定途') { continue }",
  "    }",
  "    foreach ($pair in $ruleList) {",
  "      if ($pname -ieq $pair[0]) {",
  "        $pat = $pair[1]",
  "        if (-not $pat -or ($exePath -and ($exePath -imatch $pat))) { $matched += $p; break }",
  "      }",
  "    }",
  "  }",
  "  return $matched",
  "}",
  "$initial = @(Get-TargetProcs)",
  "if ($initial.Count -eq 0) { [Console]::WriteLine('{\"closedCount\":0,\"forcedCount\":0,\"remainingCount\":0,\"timedOut\":false}'); exit 0 }",
  "$initialIds = @()",
  "$withWindow = @()",
  "foreach ($p in $initial) {",
  "  $id = [int]$p.Id",
  "  if ($id -gt 0) { $initialIds += $id }",
  "  if ($p.MainWindowHandle -ne [IntPtr]::Zero) { $withWindow += $p }",
  "}",
  "$closedCount = 0",
  "$aliveIds = $initialIds",
  "if ($withWindow.Count -gt 0) {",
  "  foreach ($wp in $withWindow) { try { $null = $wp.CloseMainWindow() } catch {} }",
  "  $deadline = [DateTime]::UtcNow.AddMilliseconds($graceMs)",
  "  while ([DateTime]::UtcNow -lt $deadline) {",
  "    [System.Threading.Thread]::Sleep(80)",
  "    $stillWindowed = 0",
  "    foreach ($wp in $withWindow) {",
  "      try { if ($null -ne $wp -and -not $wp.HasExited) { $stillWindowed++ } } catch {}",
  "    }",
  "    if ($stillWindowed -eq 0) { [System.Threading.Thread]::Sleep(60); break }",
  "  }",
  "  foreach ($p in $initial) {",
  "    try { if ($null -eq $p -or $p.HasExited) { $closedCount++ } } catch { $closedCount++ }",
  "  }",
  "}",
  "$forcedCount = 0",
  "foreach ($tp in $initial) {",
  "  try {",
  "    if ($null -ne $tp -and -not $tp.HasExited) {",
  "      $tp.Kill()",
  "      $forcedCount++",
  "    }",
  "  } catch {}",
  "}",
  "foreach ($tp in $initial) { try { if ($null -ne $tp) { $null = $tp.WaitForExit(150) } } catch {} }",
  "if ($settleMs -gt 0 -and ($closedCount -gt 0 -or $forcedCount -gt 0)) { [System.Threading.Thread]::Sleep($settleMs) }",
  "$stragglers = @(Get-TargetProcs)",
  "$remaining = $stragglers.Count",
  "if ($remaining -gt 0) {",
  "  $tkArgs = @('/F', '/T')",
  "  foreach ($sp in $stragglers) {",
  "    $spId = [int]$sp.Id",
  "    if ($spId -gt 0) { $tkArgs += @('/PID', [string]$spId) }",
  "    try { if (-not $sp.HasExited) { $sp.Kill() } } catch {}",
  "    $forcedCount++",
  "  }",
  "  if ($tkArgs.Count -gt 2) { $null = & taskkill.exe @tkArgs 2>$null; [System.Threading.Thread]::Sleep(250) }",
  "  $remaining = @(Get-TargetProcs).Count",
  "}",
  "[Console]::WriteLine(('{\"closedCount\":' + $closedCount + ',\"forcedCount\":' + $forcedCount + ',\"remainingCount\":' + $remaining + ',\"timedOut\":false}'))",
].join('\n');

const WIN_RESTARTER_ENCODED = Buffer.from(WIN_RESTARTER_SCRIPT, 'utf16le').toString('base64');

function runPowerShellJson(spawnFn, payload, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const child = spawnFn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-EncodedCommand', WIN_RESTARTER_ENCODED,
    ], {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let settled = false;
    const boundedTimeout = Math.max(500, Math.min(60_000, Number(timeoutMs) || 20_000));
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      reject(Object.assign(new Error('Process restarter timed out'), { code: 'PROCESS_CLOSE_TIMEOUT', timedOut: true }));
    }, boundedTimeout);

    child.stdout?.setEncoding?.('utf8');
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.once('error', err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.once('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(Object.assign(new Error(`PowerShell exited with code ${code}`), { code: 'CLOSE_FAILED' }));
        return;
      }
      const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
      if (!line) {
        reject(Object.assign(new Error('Process restarter returned empty output'), { code: 'CLOSE_FAILED' }));
        return;
      }
      try {
        resolve(JSON.parse(line));
      } catch {
        reject(Object.assign(new Error('Process restarter returned invalid JSON'), { code: 'CLOSE_FAILED' }));
      }
    });
    try {
      child.stdin?.write(JSON.stringify(payload), 'utf8');
      child.stdin?.end();
    } catch {}
  });
}

function execFileAsync(execFileFn, file, args) {
  return new Promise(resolve => {
    execFileFn(file, args, { windowsHide: true, timeout: 2500 }, (error, stdout = '') => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout: String(stdout || '') });
    });
  });
}

export function createAppProcessRestarter({
  platform = process.platform,
  execFile = defaultExecFile,
  spawn = defaultSpawn,
  pause = defaultPause,
  allowlist = APP_PROCESS_ALLOWLIST,
  timeoutMs = 20_000,
} = {}) {
  const normalizedPlatform = platform === 'windows' ? 'win32' : platform === 'macos' ? 'darwin' : platform;

  async function closeAppProcesses(appId, { gracefulTimeoutMs = 1800, settleMs = 400 } = {}) {
    if (typeof appId !== 'string' || !Object.prototype.hasOwnProperty.call(allowlist, appId)) {
      return Object.freeze({ appId: appId || null, supported: false, closedCount: 0, forcedCount: 0, remainingCount: 0, timedOut: false });
    }
    const spec = allowlist[appId];
    if (normalizedPlatform === 'win32') {
      const rules = spec.win32 || [];
      if (!rules.length) {
        return Object.freeze({ appId, supported: false, closedCount: 0, forcedCount: 0, remainingCount: 0, timedOut: false });
      }
      try {
        const res = await runPowerShellJson(spawn, {
          rules,
          excludePids: [process.pid, process.ppid].filter(Number.isSafeInteger),
          gracefulTimeoutMs,
          settleMs,
        }, timeoutMs);
        return Object.freeze({
          appId,
          supported: true,
          closedCount: Math.max(0, Number(res?.closedCount) || 0),
          forcedCount: Math.max(0, Number(res?.forcedCount) || 0),
          remainingCount: res && typeof res.remainingCount === 'number' ? Math.max(-1, res.remainingCount) : -1,
          timedOut: Boolean(res?.timedOut),
        });
      } catch (err) {
        return Object.freeze({
          appId,
          supported: true,
          closedCount: 0,
          forcedCount: 0,
          remainingCount: -1,
          timedOut: Boolean(err?.timedOut || err?.code === 'PROCESS_CLOSE_TIMEOUT'),
          error: err?.code || 'CLOSE_FAILED',
        });
      }
    }

    const names = spec[normalizedPlatform] || [];
    if (!names.length) {
      return Object.freeze({ appId, supported: false, closedCount: 0, forcedCount: 0, remainingCount: 0, timedOut: false });
    }

    let closedCount = 0;
    let forcedCount = 0;
    for (const procName of names) {
      const pg = await execFileAsync(execFile, 'pgrep', ['-x', procName]);
      const pids = pg.stdout.trim().split(/\s+/).filter(Boolean);
      if (!pids.length) continue;
      await execFileAsync(execFile, 'pkill', ['-TERM', '-x', procName]);
      const deadline = Date.now() + Math.min(2500, Math.max(200, gracefulTimeoutMs));
      let stillAlive = pids;
      while (Date.now() < deadline) {
        await pause(150);
        const check = await execFileAsync(execFile, 'pgrep', ['-x', procName]);
        stillAlive = check.stdout.trim().split(/\s+/).filter(Boolean);
        if (!stillAlive.length) break;
      }
      closedCount += Math.max(0, pids.length - stillAlive.length);
      if (stillAlive.length) {
        await execFileAsync(execFile, 'pkill', ['-KILL', '-x', procName]);
        forcedCount += stillAlive.length;
      }
    }
    if ((closedCount > 0 || forcedCount > 0) && settleMs > 0) {
      await pause(Math.min(1000, settleMs));
    }
    let remainingCount = 0;
    for (const procName of names) {
      const finalCheck = await execFileAsync(execFile, 'pgrep', ['-x', procName]);
      remainingCount += finalCheck.stdout.trim().split(/\s+/).filter(Boolean).length;
    }
    return Object.freeze({ appId, supported: true, closedCount, forcedCount, remainingCount, timedOut: false });
  }

  async function isAppRunning(appId) {
    if (typeof appId !== 'string' || !Object.prototype.hasOwnProperty.call(allowlist, appId)) {
      return Object.freeze({ appId: appId || null, supported: false, running: false, count: 0 });
    }
    const spec = allowlist[appId];
    if (normalizedPlatform === 'win32') {
      const rules = spec.win32 || [];
      if (!rules.length) {
        return Object.freeze({ appId, supported: false, running: false, count: 0 });
      }
      const probeScript = [
        "$ProgressPreference = 'SilentlyContinue'",
        "$ErrorActionPreference = 'SilentlyContinue'",
        "[Console]::InputEncoding = [System.Text.Encoding]::UTF8",
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
        "$raw = [Console]::In.ReadToEnd()",
        "$excludeSet = New-Object 'System.Collections.Generic.HashSet[int]'",
        "if ($raw -match '\"excludePids\"\\s*:\\s*\\[([^\\]]*)\\]') { foreach ($m in [regex]::Matches($Matches[1], '\\d+')) { try { $null = $excludeSet.Add([int]$m.Value) } catch {} } }",
        "$baseSet = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)",
        "$ruleList = @()",
        "foreach ($rm in [regex]::Matches($raw, '\\{[^{}]*\"image\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])+)\"[^{}]*\\}')) {",
        "  $obj = $rm.Value",
        "  $img = [regex]::Unescape($rm.Groups[1].Value)",
        "  $pat = ''",
        "  if ($obj -match '\"pathPattern\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"') { $pat = [regex]::Unescape($Matches[1]) }",
        "  $rBase = $img -replace '\\.exe$',''",
        "  if ($rBase) { $null = $baseSet.Add($rBase); $ruleList += ,@($rBase, $pat) }",
        "}",
        "$count = 0",
        "$seenIds = New-Object 'System.Collections.Generic.HashSet[int]'",
        "foreach ($bn in $baseSet) {",
        "  foreach ($p in [System.Diagnostics.Process]::GetProcessesByName($bn)) {",
        "    if ($null -eq $p) { continue }",
        "    $procId = [int]$p.Id",
        "    if ($procId -le 0 -or $excludeSet.Contains($procId) -or -not $seenIds.Add($procId)) { continue }",
        "    $pname = [string]$p.ProcessName",
        "    if ($pname -imatch 'dingtu|定途') { continue }",
        "    $exePath = ''",
        "    $needsPath = $false",
        "    foreach ($pair in $ruleList) { if ($pname -ieq $pair[0] -and $pair[1]) { $needsPath = $true; break } }",
        "    if ($needsPath) { try { $exePath = [string]$p.MainModule.FileName } catch {} }",
        "    foreach ($pair in $ruleList) {",
        "      if ($pname -ieq $pair[0]) {",
        "        $pat = $pair[1]",
        "        if (-not $pat -or ($exePath -and ($exePath -imatch $pat))) { $count++; break }",
        "      }",
        "    }",
        "  }",
        "}",
        "[Console]::WriteLine(('{\"count\":' + $count + '}'))",
      ].join('\n');
      const encoded = Buffer.from(probeScript, 'utf16le').toString('base64');
      try {
        const res = await new Promise((resolve, reject) => {
          const child = spawn('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded,
          ], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
          let stdout = '';
          let settled = false;
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try { child.kill(); } catch {}
            resolve({ count: 0 });
          }, 3000);
          child.stdout?.setEncoding?.('utf8');
          child.stdout?.on('data', chunk => { stdout += chunk; });
          child.once('error', err => { if (!settled) { settled = true; clearTimeout(timer); reject(err); } });
          child.once('close', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop() || '';
            try { resolve(JSON.parse(line)); } catch { resolve({ count: 0 }); }
          });
          try {
            child.stdin?.write(JSON.stringify({ rules, excludePids: [process.pid, process.ppid].filter(Number.isSafeInteger) }), 'utf8');
            child.stdin?.end();
          } catch {}
        });
        const count = Math.max(0, Number(res?.count) || 0);
        return Object.freeze({ appId, supported: true, running: count > 0, count });
      } catch {
        return Object.freeze({ appId, supported: true, running: false, count: 0 });
      }
    }

    const names = spec[normalizedPlatform] || [];
    if (!names.length) {
      return Object.freeze({ appId, supported: false, running: false, count: 0 });
    }
    let count = 0;
    for (const procName of names) {
      const pg = await execFileAsync(execFile, 'pgrep', ['-x', procName]);
      count += pg.stdout.trim().split(/\s+/).filter(Boolean).length;
    }
    return Object.freeze({ appId, supported: true, running: count > 0, count });
  }

  return Object.freeze({ closeAppProcesses, isAppRunning });
}
