import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { APP_PROCESS_ALLOWLIST, WIN_RESTARTER_SCRIPT, createAppProcessRestarter } from './app-process-restarter.mjs';

test('APP_PROCESS_ALLOWLIST covers all 7 native desktop apps including full OpenAI.Codex MSIX rules and fast Win32 script', () => {
  for (const appId of ['codex', 'codex-desktop', 'antigravity', 'cursor', 'windsurf', 'kiro', 'claude-desktop', 'copilot']) {
    assert.ok(APP_PROCESS_ALLOWLIST[appId], `Expected allowlist entry for ${appId}`);
  }
  const codexWin = APP_PROCESS_ALLOWLIST.codex.win32;
  assert.ok(codexWin.some(r => r.image === 'Codex.exe'));
  assert.ok(codexWin.some(r => r.image === 'ChatGPT.exe' && /OpenAI/.test(r.pathPattern)));
  assert.ok(codexWin.some(r => r.image === 'codex.exe' && /OpenAI/.test(r.pathPattern)));
  assert.ok(codexWin.some(r => r.image === 'codex-computer-use-swift.exe' && /OpenAI/.test(r.pathPattern)));
  assert.ok(codexWin.some(r => r.image === 'codex-windows-sandbox-service.exe' && /OpenAI/.test(r.pathPattern)));

  assert.match(WIN_RESTARTER_SCRIPT, /GetProcesses\(\)/);
  assert.match(WIN_RESTARTER_SCRIPT, /taskkill\.exe/);
  assert.doesNotMatch(WIN_RESTARTER_SCRIPT, /Get-CimInstance|Win32_Process/);
});

test('non-native web container or unknown apps are no-ops without spawning external processes', async () => {
  let spawned = false;
  const restarter = createAppProcessRestarter({
    platform: 'win32',
    spawn: () => { spawned = true; return new EventEmitter(); },
    execFile: () => { spawned = true; },
  });
  for (const appId of ['manus', 'metamuse', 'chatgpt', 'unknown-app', 'powershell.exe']) {
    const res = await restarter.closeAppProcesses(appId);
    assert.deepEqual(res, { appId, supported: false, closedCount: 0, forcedCount: 0, remainingCount: 0, timedOut: false });
  }
  assert.equal(spawned, false);
});

test('win32 restarter invokes PowerShell via -EncodedCommand and passes rules & excludePids via stdin JSON', async () => {
  const recorded = [];
  const restarter = createAppProcessRestarter({
    platform: 'win32',
    spawn: (cmd, args, opts) => {
      const child = new EventEmitter();
      let stdinData = '';
      child.stdin = {
        write: chunk => { stdinData += String(chunk); },
        end: () => {},
      };
      child.stdout = new EventEmitter();
      child.stdout.setEncoding = () => {};
      recorded.push({ cmd, args, opts, getStdin: () => stdinData });
      queueMicrotask(() => {
        child.stdout.emit('data', '{"closedCount":2,"forcedCount":1,"remainingCount":0,"timedOut":false}\n');
        child.emit('close', 0);
      });
      return child;
    },
  });

  const res = await restarter.closeAppProcesses('codex-desktop');
  assert.deepEqual(res, { appId: 'codex-desktop', supported: true, closedCount: 2, forcedCount: 1, remainingCount: 0, timedOut: false });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].cmd, 'powershell.exe');
  assert.ok(recorded[0].args.includes('-EncodedCommand'));
  assert.equal(recorded[0].opts.shell, false);
  assert.equal(recorded[0].opts.windowsHide, true);

  const payload = JSON.parse(recorded[0].getStdin());
  assert.ok(payload.excludePids.includes(process.pid));
  assert.equal(payload.rules.some(r => r.image === 'ChatGPT.exe'), true);
});

test('win32 restarter reports honest timedOut and remainingCount=-1 on timeout/error instead of faking 0', async () => {
  let killed = false;
  const restarter = createAppProcessRestarter({
    platform: 'win32',
    timeoutMs: 500,
    spawn: () => {
      const child = new EventEmitter();
      child.stdin = { write: () => {}, end: () => {} };
      child.stdout = new EventEmitter();
      child.stdout.setEncoding = () => {};
      child.kill = () => { killed = true; };
      return child;
    },
  });

  const res = await restarter.closeAppProcesses('antigravity');
  assert.equal(killed, true);
  assert.equal(res.supported, true);
  assert.equal(res.timedOut, true);
  assert.equal(res.remainingCount, -1);
  assert.equal(res.error, 'PROCESS_CLOSE_TIMEOUT');
});

test('darwin restarter sends TERM then KILL via pkill when processes linger', async () => {
  const calls = [];
  let pollStep = 0;
  const restarter = createAppProcessRestarter({
    platform: 'darwin',
    pause: async () => {},
    execFile: (cmd, args, _opts, cb) => {
      calls.push([cmd, ...args]);
      if (cmd === 'pgrep') {
        pollStep += 1;
        if (pollStep === 1 || pollStep === 2) cb(null, '101\n102\n');
        else cb(new Error('none'), '');
      } else {
        cb(null, '');
      }
    },
  });

  const res = await restarter.closeAppProcesses('cursor', { gracefulTimeoutMs: 200, settleMs: 10 });
  assert.equal(res.supported, true);
  assert.ok(calls.some(c => c[0] === 'pkill' && c[1] === '-TERM' && c[3] === 'Cursor'));
});
