import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ANTIGRAVITY_WINDOWS_TARGET = 'gemini:antigravity';
export const ANTIGRAVITY_WINDOWS_USERNAME = 'antigravity';
const MAX_WINDOWS_CREDENTIAL_BYTES = 5 * 512; // 2560 UTF-8 bytes
const isWindowsPlatform = value => value === 'win32' || value === 'windows';

const fail = (code, message = code) => Object.assign(new Error(message), { code });

function cleanText(value, maxLen = 160) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLen);
}

const sleepBuf = new Int32Array(new SharedArrayBuffer(4));
function pauseSyncMs(ms) {
  try { Atomics.wait(sleepBuf, 0, 0, ms); } catch {}
}

function atomicWriteText(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, content, { encoding: 'utf8', mode: 0o600 });
  const lockCodes = new Set(['EBUSY', 'EPERM', 'EACCES']);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      renameSync(tmp, filePath);
      return;
    } catch (err) {
      if (!lockCodes.has(err?.code) || attempt === 4) {
        if (lockCodes.has(err?.code)) {
          try {
            writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
            try { unlinkSync(tmp); } catch {}
            return;
          } catch {}
        }
        try { unlinkSync(tmp); } catch {}
        throw err;
      }
      pauseSyncMs(40 * (attempt + 1));
    }
  }
}

function formatExpiryIso(expiry) {
  if (typeof expiry === 'string' && expiry.trim() && Number.isFinite(Date.parse(expiry))) {
    return new Date(Date.parse(expiry)).toISOString();
  }
  if (typeof expiry === 'number' && Number.isFinite(expiry)) {
    const ms = expiry > 1e12 ? expiry : expiry * 1000;
    return new Date(ms).toISOString();
  }
  return new Date(Date.now() + 3600_000).toISOString();
}

export function buildAntigravityCredentialJson({
  accessToken = '',
  refreshToken = '',
  idToken = null,
  expiry = null,
  email = null,
} = {}) {
  const cleanRefresh = typeof refreshToken === 'string' ? refreshToken.trim() : '';
  if (!cleanRefresh) {
    throw fail('CREDENTIAL_WRITE_FAILED', 'Antigravity 凭据缺少 refresh_token，无法写入本机。');
  }
  const cleanAccess = typeof accessToken === 'string' ? accessToken.trim() : '';
  const payload = {
    token: {
      access_token: cleanAccess,
      token_type: 'Bearer',
      refresh_token: cleanRefresh,
      expiry: formatExpiryIso(expiry),
    },
    auth_method: 'consumer',
  };
  const cleanEmail = cleanText(email || '', 160);
  if (cleanEmail && cleanEmail.includes('@')) {
    payload.id_token_email = cleanEmail;
  }
  if (typeof idToken === 'string' && idToken.trim()) {
    payload.id_token = idToken.trim();
  }
  let serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_WINDOWS_CREDENTIAL_BYTES && payload.id_token_email && !payload.id_token) {
    // Keep below 2560B cap if needed; normally id_token_email is tiny (<64B).
    delete payload.id_token_email;
    serialized = JSON.stringify(payload);
  }
  return serialized;
}

export function parseAntigravityCredentialJson(rawSecret) {
  if (typeof rawSecret !== 'string') return null;
  let trimmed = rawSecret.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('go-keyring-base64:')) {
    try {
      trimmed = Buffer.from(trimmed.slice('go-keyring-base64:'.length), 'base64').toString('utf8').trim();
    } catch {
      return null;
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const tok = parsed?.token;
  if (!tok || typeof tok !== 'object') return null;
  const refreshToken = typeof tok.refresh_token === 'string' && tok.refresh_token.trim() ? tok.refresh_token.trim() : null;
  const accessToken = typeof tok.access_token === 'string' && tok.access_token.trim() ? tok.access_token.trim() : null;
  if (!refreshToken && !accessToken) return null;
  const rawEmail = cleanText(parsed?.id_token_email || parsed?.email || '', 160);
  const idTokenEmail = rawEmail && rawEmail.includes('@') ? rawEmail : null;
  return {
    accessToken,
    refreshToken,
    tokenType: typeof tok.token_type === 'string' ? tok.token_type : 'Bearer',
    expiry: typeof tok.expiry === 'string' ? tok.expiry : null,
    idToken: typeof parsed?.id_token === 'string' && parsed.id_token.trim() ? parsed.id_token.trim() : null,
    idTokenEmail,
    authMethod: typeof parsed?.auth_method === 'string' ? parsed.auth_method : 'consumer',
  };
}

export function buildWindowsPowerShellScript() {
  return `$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$nativeCode = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class DingtuAgCred {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);

    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CredWrite(ref CREDENTIAL credential, uint flags);

    [DllImport("advapi32.dll", EntryPoint = "CredFree")]
    private static extern void CredFree(IntPtr credential);

    public static string ReadUtf8(string target) {
        IntPtr ptr;
        if (!CredRead(target, 1, 0, out ptr)) {
            int err = Marshal.GetLastWin32Error();
            if (err == 1168) return null;
            throw new Win32Exception(err);
        }
        try {
            CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
            if (cred.CredentialBlobSize == 0 || cred.CredentialBlob == IntPtr.Zero) return null;
            byte[] buf = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, buf, 0, buf.Length);
            string result = Encoding.UTF8.GetString(buf);
            Array.Clear(buf, 0, buf.Length);
            return result;
        } finally {
            CredFree(ptr);
        }
    }

    public static void WriteUtf8(string target, string userName, string value) {
        byte[] bytes = Encoding.UTF8.GetBytes(value);
        if (bytes.Length < 1 || bytes.Length > 2560) {
            Array.Clear(bytes, 0, bytes.Length);
            throw new InvalidOperationException("ANTIGRAVITY_CREDENTIAL_TOO_LARGE");
        }
        IntPtr blob = Marshal.AllocHGlobal(bytes.Length);
        try {
            Marshal.Copy(bytes, 0, blob, bytes.Length);
            CREDENTIAL cred = new CREDENTIAL {
                Flags = 0,
                Type = 1,
                TargetName = target,
                Comment = "Antigravity OAuth credential",
                CredentialBlobSize = (uint)bytes.Length,
                CredentialBlob = blob,
                Persist = 2,
                AttributeCount = 0,
                Attributes = IntPtr.Zero,
                TargetAlias = null,
                UserName = userName
            };
            if (!CredWrite(ref cred, 0)) {
                int err = Marshal.GetLastWin32Error();
                if (err == 8) throw new InvalidOperationException("ANTIGRAVITY_WINDOWS_CREDENTIAL_STORE_CAPACITY");
                throw new Win32Exception(err);
            }
        } finally {
            Marshal.Copy(new byte[bytes.Length], 0, blob, bytes.Length);
            Marshal.FreeHGlobal(blob);
            Array.Clear(bytes, 0, bytes.Length);
        }
    }
}
'@
Add-Type -TypeDefinition $nativeCode -Language CSharp -ErrorAction Stop
$rawReq = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($rawReq)) { throw 'EMPTY_REQUEST' }
$req = $rawReq | ConvertFrom-Json
if ($req.target -ne '${ANTIGRAVITY_WINDOWS_TARGET}') { throw 'INVALID_TARGET' }
if ($req.operation -eq 'read') {
  $val = [DingtuAgCred]::ReadUtf8($req.target)
  @{ ok = $true; found = ($null -ne $val); valueB64 = $(if ($null -ne $val) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($val)) } else { $null }) } | ConvertTo-Json -Compress
} elseif ($req.operation -eq 'write') {
  $val = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($req.valueB64))
  [DingtuAgCred]::WriteUtf8($req.target, $req.userName, $val)
  @{ ok = $true } | ConvertTo-Json -Compress
} else {
  throw 'INVALID_OP'
}
`;
}

export async function defaultExecWindowsCredential(requestObj, timeoutMs = 12_000) {
  if (!requestObj || requestObj.target !== ANTIGRAVITY_WINDOWS_TARGET) {
    throw fail('CREDENTIAL_WRITE_FAILED', 'Windows 凭据目标名称不在允许范围内。');
  }
  const script = buildWindowsPowerShellScript();
  const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');
  const requestPayload = JSON.stringify(requestObj);
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand], {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      reject(fail('CREDENTIAL_WRITE_FAILED', '读取或写入 Windows 凭据管理器超时。'));
    }, timeoutMs);

    child.stdout.on('data', c => stdoutChunks.push(c));
    child.stderr.on('data', c => stderrChunks.push(c));
    child.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(fail('CREDENTIAL_WRITE_FAILED', '无法启动 Windows 凭据辅助进程。'));
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = Buffer.concat(stdoutChunks).toString('utf8').trim();
      const errOut = Buffer.concat(stderrChunks).toString('utf8').trim();
      if (code !== 0 || !out) {
        if (/ANTIGRAVITY_CREDENTIAL_TOO_LARGE/.test(errOut)) {
          reject(fail('ANTIGRAVITY_CREDENTIAL_TOO_LARGE', 'Antigravity 凭据体积超出 Windows 凭据管理器上限（2560 字节）。'));
          return;
        }
        reject(fail('CREDENTIAL_WRITE_FAILED', 'Windows 凭据管理器操作未完成。'));
        return;
      }
      const lines = out.split(/\r?\n/).filter(Boolean);
      const lastLine = lines[lines.length - 1];
      try {
        const parsed = JSON.parse(lastLine);
        resolve(parsed);
      } catch {
        reject(fail('CREDENTIAL_WRITE_FAILED', 'Windows 凭据辅助返回格式无效。'));
      }
    });
    child.stdin.write(requestPayload, 'utf8');
    child.stdin.end();
  });
}

function decodeJwtEmailHint(idToken) {
  if (typeof idToken !== 'string') return null;
  const parts = idToken.split('.');
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (normalized.length % 4)) % 4;
    const payload = JSON.parse(Buffer.from(normalized + '='.repeat(pad), 'base64').toString('utf8'));
    return cleanText(payload?.email || '', 160) || null;
  } catch {
    return null;
  }
}

export function readAntigravityActiveHints({
  platform = process.platform,
  homeDir = os.homedir(),
  appDataDir = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
} = {}) {
  const geminiDir = path.join(homeDir, '.gemini');
  const activePath = path.join(geminiDir, 'antigravity', 'active-account.json');
  const activeHint = { accountId: null, email: null, appStorageEmail: null };

  if (existsSync(activePath)) {
    try {
      const activeObj = JSON.parse(readFileSync(activePath, 'utf8'));
      const em = cleanText(activeObj?.email || '', 160);
      activeHint.accountId = cleanText(activeObj?.accountId || '', 64) || null;
      if (em && em.includes('@')) activeHint.email = em;
    } catch {}
  }

  const appStorageCandidates = isWindowsPlatform(platform)
    ? [path.join(appDataDir, 'Antigravity', 'app_storage.json')]
    : platform === 'darwin'
      ? [path.join(homeDir, 'Library', 'Application Support', 'Antigravity', 'app_storage.json')]
      : [path.join(homeDir, '.config', 'Antigravity', 'app_storage.json')];

  for (const appStoragePath of appStorageCandidates) {
    if (!existsSync(appStoragePath)) continue;
    try {
      const appStorage = JSON.parse(readFileSync(appStoragePath, 'utf8'));
      const em = cleanText(appStorage?.['agy.onboarding.lastLoginUsername'] || '', 160);
      if (em && em.includes('@')) {
        activeHint.appStorageEmail = em;
        break;
      }
    } catch {}
  }

  const googleAccountsPath = path.join(geminiDir, 'google_accounts.json');
  if (!activeHint.email && existsSync(googleAccountsPath)) {
    try {
      const gaObj = JSON.parse(readFileSync(googleAccountsPath, 'utf8'));
      const activeEmail = cleanText(gaObj?.active || '', 160);
      if (activeEmail && activeEmail.includes('@')) activeHint.email = activeEmail;
    } catch {}
  }

  return {
    accountId: activeHint.accountId,
    email: activeHint.email,
    appStorageEmail: activeHint.appStorageEmail,
    activeHintEmail: activeHint.appStorageEmail || activeHint.email || null,
  };
}

export async function readAntigravityCredential({
  platform = process.platform,
  homeDir = os.homedir(),
  appDataDir = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
  execWindowsCred = defaultExecWindowsCredential,
} = {}) {
  const geminiDir = path.join(homeDir, '.gemini');
  const fallbackPath = path.join(geminiDir, 'jetski-standalone-oauth-token');
  const cliPath = path.join(geminiDir, 'antigravity-cli', 'antigravity-oauth-token');
  const activeHint = readAntigravityActiveHints({ platform, homeDir, appDataDir });

  let parsed = null;
  let source = null;

  if (isWindowsPlatform(platform)) {
    try {
      const res = await execWindowsCred({ operation: 'read', target: ANTIGRAVITY_WINDOWS_TARGET });
      if (res?.ok && res.found && typeof res.valueB64 === 'string') {
        const secret = Buffer.from(res.valueB64, 'base64').toString('utf8');
        parsed = parseAntigravityCredentialJson(secret);
        if (parsed) source = 'windows-credential';
      }
    } catch {
      // Fall through to standalone fallback file.
    }
  }

  if (!parsed && existsSync(fallbackPath)) {
    try {
      parsed = parseAntigravityCredentialJson(readFileSync(fallbackPath, 'utf8'));
      if (parsed) source = 'fallback-file';
    } catch {}
  }

  if (!parsed && existsSync(cliPath)) {
    try {
      parsed = parseAntigravityCredentialJson(readFileSync(cliPath, 'utf8'));
      if (parsed) source = 'cli-file';
    } catch {}
  }

  if (!parsed) {
    return {
      found: false,
      source: null,
      accountId: activeHint.accountId,
      email: activeHint.email || activeHint.appStorageEmail || null,
      activeHintEmail: activeHint.activeHintEmail,
    };
  }

  return {
    found: true,
    source,
    ...parsed,
    email: parsed.idTokenEmail || decodeJwtEmailHint(parsed.idToken) || activeHint.email || activeHint.appStorageEmail || null,
    activeHintEmail: activeHint.activeHintEmail,
    accountId: activeHint.accountId || null,
  };
}

function resolveAppDataDir(homeDir, appDataDir) {
  if (typeof appDataDir === 'string' && appDataDir) return appDataDir;
  if (homeDir === os.homedir() && process.env.APPDATA) return process.env.APPDATA;
  return path.join(homeDir, 'AppData', 'Roaming');
}

function resolveAppStoragePath({ platform = process.platform, homeDir = os.homedir(), appDataDir = null } = {}) {
  if (isWindowsPlatform(platform)) {
    return path.join(resolveAppDataDir(homeDir, appDataDir), 'Antigravity', 'app_storage.json');
  }
  if (platform === 'darwin' || platform === 'macos') {
    return path.join(homeDir, 'Library', 'Application Support', 'Antigravity', 'app_storage.json');
  }
  return path.join(homeDir, '.config', 'Antigravity', 'app_storage.json');
}

export async function writeAntigravityCredential({
  accessToken = '',
  refreshToken = '',
  idToken = null,
  expiry = null,
  email = null,
  accountId = null,
  syncCli = false,
} = {}, {
  platform = process.platform,
  homeDir = os.homedir(),
  appDataDir = null,
  execWindowsCred = defaultExecWindowsCredential,
  now = Date.now,
} = {}) {
  const payloadJson = buildAntigravityCredentialJson({ accessToken, refreshToken, idToken, expiry, email });
  const byteLength = Buffer.byteLength(payloadJson, 'utf8');
  if (byteLength > MAX_WINDOWS_CREDENTIAL_BYTES) {
    throw fail('ANTIGRAVITY_CREDENTIAL_TOO_LARGE', `Antigravity 凭据体积 (${byteLength} 字节) 超出 Windows 凭据管理器上限 (2560 字节)。`);
  }

  const writtenTargets = [];
  if (isWindowsPlatform(platform)) {
    const res = await execWindowsCred({
      operation: 'write',
      target: ANTIGRAVITY_WINDOWS_TARGET,
      userName: ANTIGRAVITY_WINDOWS_USERNAME,
      valueB64: Buffer.from(payloadJson, 'utf8').toString('base64'),
    });
    if (!res?.ok) {
      throw fail('CREDENTIAL_WRITE_FAILED', '写入 Antigravity 系统凭据失败，请重试。');
    }
    writtenTargets.push('windows-credential');
  }

  const geminiDir = path.join(homeDir, '.gemini');
  const fallbackPath = path.join(geminiDir, 'jetski-standalone-oauth-token');
  atomicWriteText(fallbackPath, payloadJson);
  writtenTargets.push('fallback-file');

  const cliDir = path.join(geminiDir, 'antigravity-cli');
  if (syncCli || existsSync(cliDir)) {
    atomicWriteText(path.join(cliDir, 'antigravity-oauth-token'), payloadJson);
    writtenTargets.push('cli-file');
  }

  const cleanEmail = cleanText(email || '', 160);
  const activeAccount = {
    version: 1,
    accountId: cleanText(accountId || '', 64) || 'main',
    email: cleanEmail || '',
    source: 'dingtu',
    switchedAt: typeof now === 'function' ? now() : now,
  };
  atomicWriteText(path.join(geminiDir, 'antigravity', 'active-account.json'), JSON.stringify(activeAccount, null, 2));
  writtenTargets.push('active-account');

  if (cleanEmail && cleanEmail.includes('@')) {
    const appStoragePath = resolveAppStoragePath({ platform, homeDir, appDataDir });
    if (existsSync(appStoragePath)) {
      try {
        const parsed = JSON.parse(readFileSync(appStoragePath, 'utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsed['agy.onboarding.lastLoginUsername'] = cleanEmail;
          atomicWriteText(appStoragePath, JSON.stringify(parsed, null, 2));
          writtenTargets.push('app-storage');
        }
      } catch {
        // Ignore malformed external app_storage.json without breaking credential switch.
      }
    }
  }

  return Object.freeze({
    ok: true,
    writtenTargets: Object.freeze(writtenTargets),
  });
}
