import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { APP_PROCESS_ALLOWLIST, createAppProcessRestarter } from './app-process-restarter.mjs';
import { getBuiltInAgentAdapter } from './builtin-agent-adapters.mjs';
import { WEB_LOGIN_TARGETS, buildWebSessionProfileScript } from './oauth-account-flow.mjs';
import { createWorkbenchAccountManager } from './workbench-accounts.mjs';

function makeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: plain => Buffer.from(plain, 'utf8'),
    decryptString: buf => Buffer.from(buf).toString('utf8'),
  };
}

function fakeJwt(payload) {
  const b64 = obj => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.sig`;
}

function initVscdb(dbPath, initialEntries = {}) {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)');
    const stmt = db.prepare('INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(initialEntries)) {
      stmt.run(k, String(v));
    }
  } finally {
    db.close();
  }
}

function readVscdb(dbPath) {
  const db = new DatabaseSync(dbPath, { open: true, readOnly: true });
  try {
    const rows = db.prepare('SELECT key, value FROM ItemTable').all();
    const out = {};
    for (const r of rows) out[r.key] = String(r.value);
    return out;
  } finally {
    db.close();
  }
}

test('all 17 apps matrix: adapter/restarter/container coverage has zero missing launch or close targets', async () => {
  const ALL_17_APPS = [
    'antigravity',
    'codex',
    'codex-desktop',
    'copilot',
    'windsurf',
    'kiro',
    'cursor',
    'grok-cli',
    'claude-code',
    'gemini-cli',
    'claude-desktop',
    'metamuse',
    'manus',
    'chatgpt',
    'claude',
    'gemini-web',
    'grok',
  ];
  assert.equal(ALL_17_APPS.length, 17);

  const webContainers = new Set(['metamuse', 'manus', 'chatgpt', 'claude', 'gemini-web', 'grok']);
  const terminalOnlyClis = new Set(['claude-code', 'gemini-cli', 'grok-cli']);
  const restarter = createAppProcessRestarter({ platform: 'windows' });

  for (const appId of ALL_17_APPS) {
    if (webContainers.has(appId)) {
      if (appId === 'metamuse') {
        assert.ok(Object.prototype.hasOwnProperty.call(APP_PROCESS_ALLOWLIST, 'muse-desktop'));
        assert.equal(getBuiltInAgentAdapter('muse-desktop', 'macos')?.id, 'muse-desktop');
      }
      continue;
    }
    const adapterId = appId === 'codex' ? 'codex-cli' : appId;
    const adapter = getBuiltInAgentAdapter(adapterId, 'windows');
    assert.ok(adapter, `missing Windows adapter for ${appId} (${adapterId})`);
    if (terminalOnlyClis.has(appId)) {
      const cliRes = await restarter.closeAppProcesses(adapterId);
      assert.equal(cliRes.supported, false);
      assert.equal(cliRes.remainingCount, 0);
      assert.equal(cliRes.timedOut, false);
    } else {
      assert.ok(
        Object.prototype.hasOwnProperty.call(APP_PROCESS_ALLOWLIST, appId)
          || Object.prototype.hasOwnProperty.call(APP_PROCESS_ALLOWLIST, adapterId),
        `missing closeable process rule for ${appId} (${adapterId})`,
      );
    }
  }
  const agCli = getBuiltInAgentAdapter('antigravity-cli', 'windows');
  assert.equal(agCli?.template?.launch?.argv?.[0], 'agy');
  assert.ok(agCli?.template?.detect?.names?.includes('agy.exe'));
});

test('all 17 apps matrix: anti-contamination, real disk writes (including OAuth-only Copilot/Kiro), honest claude-desktop note, and 6 web containers', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dingtu-17apps-'));
  try {
    const homeDir = path.join(root, 'home');
    const appDataDir = path.join(root, 'appdata');
    const localAppDataDir = path.join(root, 'localappdata');
    const vaultPath = path.join(root, 'vault.enc');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(appDataDir, { recursive: true });
    mkdirSync(localAppDataDir, { recursive: true });

    // Prepare local credential targets seeded with a THIRD-PARTY "stranger@other.test" so prevAccount must NOT absorb it!
    const codexPath = path.join(homeDir, '.codex', 'auth.json');
    mkdirSync(path.dirname(codexPath), { recursive: true });
    writeFileSync(codexPath, JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: { access_token: 'stranger-tok', refresh_token: 'stranger-ref', id_token: fakeJwt({ email: 'stranger@other.test' }), account_id: 'stranger' },
    }));

    const agAppStoragePath = path.join(appDataDir, 'Antigravity', 'app_storage.json');
    mkdirSync(path.dirname(agAppStoragePath), { recursive: true });
    writeFileSync(agAppStoragePath, JSON.stringify({ 'agy.onboarding.lastLoginUsername': 'stranger@other.test' }, null, 2));

    let winCredPayload = JSON.stringify({
      token: { access_token: 'stranger-ag', refresh_token: '1//0stranger-ag', token_type: 'Bearer', expiry: '2026-12-30T00:00:00Z' },
      id_token_email: 'stranger@other.test',
    });
    const mockWinCred = async req => {
      if (req.operation === 'write') {
        winCredPayload = Buffer.from(req.valueB64, 'base64').toString('utf8');
        return { ok: true };
      }
      return { ok: true, found: true, valueB64: Buffer.from(winCredPayload, 'utf8').toString('base64') };
    };

    const cursorDbPath = path.join(appDataDir, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
    initVscdb(cursorDbPath, {
      'cursorAuth/cachedEmail': 'stranger@other.test',
      'cursorAuth/accessToken': 'stranger-cursor-tok',
      'cursorAuth/refreshToken': 'stranger-cursor-ref',
    });

    const windsurfDbPath = path.join(appDataDir, 'Windsurf', 'User', 'globalStorage', 'state.vscdb');
    initVscdb(windsurfDbPath, {
      windsurfAuthStatus: JSON.stringify({ apiKey: 'stranger-ws-key', email: 'stranger@other.test', name: 'stranger' }),
    });

    const claudeCredsPath = path.join(homeDir, '.claude', '.credentials.json');
    const claudeCfgPath = path.join(homeDir, '.claude.json');
    mkdirSync(path.dirname(claudeCredsPath), { recursive: true });
    writeFileSync(claudeCredsPath, JSON.stringify({ claudeAiOauth: { accessToken: 'stranger-cc-tok', refreshToken: 'stranger-cc-ref' } }));
    writeFileSync(claudeCfgPath, JSON.stringify({ oauthAccount: { emailAddress: 'stranger@other.test' } }));

    const geminiOauthPath = path.join(homeDir, '.gemini', 'oauth_creds.json');
    const geminiAcctPath = path.join(homeDir, '.gemini', 'google_accounts.json');
    mkdirSync(path.dirname(geminiOauthPath), { recursive: true });
    writeFileSync(geminiOauthPath, JSON.stringify({ access_token: 'stranger-gem', refresh_token: '1//0stranger-gem', id_token: fakeJwt({ email: 'stranger@other.test' }) }));
    writeFileSync(geminiAcctPath, JSON.stringify({ active: 'stranger@other.test', old: [] }));

    const grokPath = path.join(homeDir, '.grok', 'auth.json');
    mkdirSync(path.dirname(grokPath), { recursive: true });
    writeFileSync(grokPath, JSON.stringify({ access_token: 'stranger-grok', email: 'stranger@other.test' }));

    const copilotHostsPath = path.join(localAppDataDir, 'github-copilot', 'hosts.json');
    const copilotAppsPath = path.join(localAppDataDir, 'github-copilot', 'apps.json');
    mkdirSync(path.dirname(copilotHostsPath), { recursive: true });
    writeFileSync(copilotHostsPath, JSON.stringify({ 'github.com': { user: 'stranger-gh', oauth_token: 'ghu_stranger' } }));

    const kiroTokenPath = path.join(homeDir, '.aws', 'sso', 'cache', 'kiro-auth-token.json');
    mkdirSync(path.dirname(kiroTokenPath), { recursive: true });
    writeFileSync(kiroTokenPath, JSON.stringify({ accessToken: 'stranger-kiro', email: 'stranger@other.test' }));

    const accounts = [
      // 1 & 2: codex & codex-desktop
      {
        id: 'acct-a', appId: 'codex', email: 'a@dingtu.test', label: 'a@dingtu.test',
        oauthToken: 'codex-a', refreshToken: 'ref-codex-a', idToken: fakeJwt({ email: 'a@dingtu.test' }),
        snapshot: { kind: 'file', targetPath: codexPath, payloadBase64: Buffer.from(JSON.stringify({ tokens: { access_token: 'codex-a', refresh_token: 'ref-codex-a', id_token: fakeJwt({ email: 'a@dingtu.test' }) } })).toString('base64') },
      },
      {
        id: 'acct-b', appId: 'codex', email: 'b@dingtu.test', label: 'b@dingtu.test',
        oauthToken: 'codex-b', refreshToken: 'ref-codex-b', idToken: fakeJwt({ email: 'b@dingtu.test' }),
        // Poisoned snapshot with A's email -> should self-heal from B's clean tokens
        snapshot: { kind: 'file', targetPath: codexPath, payloadBase64: Buffer.from(JSON.stringify({ tokens: { access_token: 'codex-a', refresh_token: 'ref-codex-a', id_token: fakeJwt({ email: 'a@dingtu.test' }) } })).toString('base64') },
      },
      {
        id: 'desk-a', appId: 'codex-desktop', email: 'deska@dingtu.test', label: 'deska@dingtu.test',
        oauthToken: 'desk-tok-a', refreshToken: 'desk-ref-a', idToken: fakeJwt({ email: 'deska@dingtu.test' }),
      },
      {
        id: 'desk-b', appId: 'codex-desktop', email: 'deskb@dingtu.test', label: 'deskb@dingtu.test',
        oauthToken: 'desk-tok-b', refreshToken: 'desk-ref-b', idToken: fakeJwt({ email: 'deskb@dingtu.test' }),
      },
      // 3: antigravity
      { id: 'ag-a', appId: 'antigravity', email: 'aga@dingtu.test', label: 'aga@dingtu.test', refreshToken: '1//0ag-a', oauthToken: 'ag-tok-a', tokenExpiry: '2026-12-30T00:00:00Z' },
      { id: 'ag-b', appId: 'antigravity', email: 'agb@dingtu.test', label: 'agb@dingtu.test', refreshToken: '1//0ag-b', oauthToken: 'ag-tok-b', tokenExpiry: '2026-12-30T00:00:00Z' },
      { id: 'ag-bad', appId: 'antigravity', email: 'agbad@dingtu.test', label: 'agbad@dingtu.test', refreshToken: '1//0ag-bad', idToken: fakeJwt({ email: 'wrong@dingtu.test' }) },
      // 4: cursor
      { id: 'cur-a', appId: 'cursor', email: 'cura@dingtu.test', label: 'cura@dingtu.test', snapshot: { kind: 'cursor-vscdb', keys: { 'cursorAuth/cachedEmail': 'cura@dingtu.test', 'cursorAuth/accessToken': 'cur-tok-a' } } },
      { id: 'cur-b', appId: 'cursor', email: 'curb@dingtu.test', label: 'curb@dingtu.test', oauthToken: 'cur-tok-b', snapshot: { kind: 'cursor-vscdb', keys: { 'cursorAuth/cachedEmail': 'cura@dingtu.test', 'cursorAuth/accessToken': 'cur-tok-a' } } },
      { id: 'cur-bad', appId: 'cursor', email: 'curbad@dingtu.test', label: 'curbad@dingtu.test', snapshot: { kind: 'cursor-vscdb', keys: { 'cursorAuth/cachedEmail': 'wrong@dingtu.test', 'cursorAuth/accessToken': 'bad' } } },
      // 5: windsurf
      { id: 'ws-a', appId: 'windsurf', email: 'wsa@dingtu.test', label: 'wsa@dingtu.test', snapshot: { kind: 'windsurf-vscdb', keys: { windsurfAuthStatus: JSON.stringify({ apiKey: 'ws-key-a', email: 'wsa@dingtu.test' }) } } },
      { id: 'ws-b', appId: 'windsurf', email: 'wsb@dingtu.test', label: 'wsb@dingtu.test', oauthToken: 'ws-key-b', snapshot: { kind: 'windsurf-vscdb', keys: { windsurfAuthStatus: JSON.stringify({ apiKey: 'ws-key-a', email: 'wsa@dingtu.test' }) } } },
      // 6: claude-code
      {
        id: 'cc-a', appId: 'claude-code', email: 'cca@dingtu.test', label: 'cca@dingtu.test',
        snapshot: { kind: 'claude-code-dual', targetPath: claudeCredsPath, claudeAiOauth: { accessToken: 'cc-tok-a' }, oauthAccount: { emailAddress: 'cca@dingtu.test' } },
      },
      {
        id: 'cc-b', appId: 'claude-code', email: 'ccb@dingtu.test', label: 'ccb@dingtu.test', oauthToken: 'cc-tok-b', refreshToken: 'cc-ref-b',
        snapshot: { kind: 'claude-code-dual', targetPath: claudeCredsPath, claudeAiOauth: { accessToken: 'cc-tok-a' }, oauthAccount: { emailAddress: 'cca@dingtu.test' } },
      },
      // 7: gemini-cli
      {
        id: 'gem-a', appId: 'gemini-cli', email: 'gema@dingtu.test', label: 'gema@dingtu.test',
        snapshot: {
          kind: 'gemini-cli-dual',
          oauthBase64: Buffer.from(JSON.stringify({ access_token: 'gem-a', refresh_token: '1//0gem-a' })).toString('base64'),
          accountsBase64: Buffer.from(JSON.stringify({ active: 'gema@dingtu.test', old: [] })).toString('base64'),
          email: 'gema@dingtu.test',
        },
      },
      {
        id: 'gem-b', appId: 'gemini-cli', email: 'gemb@dingtu.test', label: 'gemb@dingtu.test', oauthToken: 'gem-b', refreshToken: '1//0gem-b',
        snapshot: {
          kind: 'gemini-cli-dual',
          oauthBase64: Buffer.from(JSON.stringify({ access_token: 'gem-a' })).toString('base64'),
          accountsBase64: Buffer.from(JSON.stringify({ active: 'gema@dingtu.test', old: [] })).toString('base64'),
          email: 'gema@dingtu.test',
        },
      },
      // 8: grok-cli
      {
        id: 'grok-a', appId: 'grok-cli', email: 'groka@dingtu.test', label: 'groka@dingtu.test',
        snapshot: { kind: 'file', targetPath: grokPath, payloadBase64: Buffer.from(JSON.stringify({ access_token: 'grok-a', email: 'groka@dingtu.test' })).toString('base64') },
      },
      {
        id: 'grok-b', appId: 'grok-cli', email: 'grokb@dingtu.test', label: 'grokb@dingtu.test', oauthToken: 'xai-grok-b',
        snapshot: { kind: 'file', targetPath: grokPath, payloadBase64: Buffer.from(JSON.stringify({ access_token: 'grok-a', email: 'groka@dingtu.test' })).toString('base64') },
      },
      // 9: copilot (OAuth/Token-only account WITHOUT snapshot!)
      {
        id: 'cop-a', appId: 'copilot', label: 'octo-alpha',
        snapshot: { kind: 'copilot-files', targetPath: copilotHostsPath, payloadBase64: Buffer.from(JSON.stringify({ 'github.com': { user: 'octo-alpha', oauth_token: 'ghu_alpha' } })).toString('base64') },
      },
      {
        id: 'cop-b', appId: 'copilot', label: 'octo-beta', oauthToken: 'ghu_beta_oauth_only', snapshot: null,
      },
      {
        id: 'cop-bad', appId: 'copilot', label: 'octo-gamma',
        snapshot: { kind: 'copilot-files', targetPath: copilotHostsPath, payloadBase64: Buffer.from(JSON.stringify({ 'github.com': { user: 'octo-alpha', oauth_token: 'ghu_alpha' } })).toString('base64') },
      },
      // 10: kiro (OAuth/Token-only account WITHOUT snapshot!)
      {
        id: 'kiro-a', appId: 'kiro', email: 'kiroa@dingtu.test', label: 'kiroa@dingtu.test',
        snapshot: { kind: 'file', targetPath: kiroTokenPath, payloadBase64: Buffer.from(JSON.stringify({ accessToken: 'kiro-tok-a', email: 'kiroa@dingtu.test' })).toString('base64') },
      },
      {
        id: 'kiro-b', appId: 'kiro', email: 'kirob@dingtu.test', label: 'kirob@dingtu.test',
        oauthToken: 'kiro-tok-b-oauth', refreshToken: 'kiro-ref-b', extraMeta: { authMethod: 'Builder ID', region: 'us-east-1' }, snapshot: null,
      },
      // 11: claude-desktop
      { id: 'cdesk-a', appId: 'claude-desktop', email: 'cdeska@dingtu.test', label: 'cdeska@dingtu.test' },
      { id: 'cdesk-b', appId: 'claude-desktop', email: 'cdeskb@dingtu.test', label: 'cdeskb@dingtu.test' },
      // 12-17: 6 web container apps
      { id: 'web-b', appId: 'chatgpt', email: 'gpt@dingtu.test', label: 'gpt@dingtu.test' },
      { id: 'web-b', appId: 'claude', email: 'clweb@dingtu.test', label: 'clweb@dingtu.test' },
      { id: 'web-b', appId: 'gemini-web', email: 'gemweb@dingtu.test', label: 'gemweb@dingtu.test' },
      { id: 'web-b', appId: 'grok', email: 'grokweb@dingtu.test', label: 'grokweb@dingtu.test' },
      { id: 'web-b', appId: 'manus', email: 'manus@dingtu.test', label: 'manus@dingtu.test' },
      { id: 'web-b', appId: 'metamuse', email: 'muse@dingtu.test', label: 'muse@dingtu.test' },
    ];

    const ss = makeSafeStorage();
    writeFileSync(vaultPath, ss.encryptString(JSON.stringify({
      version: 1,
      accounts,
      activeByApp: {
        codex: 'acct-a',
        'codex-desktop': 'desk-a',
        antigravity: 'ag-a',
        cursor: 'cur-a',
        windsurf: 'ws-a',
        'claude-code': 'cc-a',
        'gemini-cli': 'gem-a',
        'grok-cli': 'grok-a',
        copilot: 'cop-a',
        kiro: 'kiro-a',
        'claude-desktop': 'cdesk-a',
      },
    })));

    const mgr = createWorkbenchAccountManager({
      platform: 'windows',
      filePath: vaultPath,
      safeStorage: ss,
      homeDir,
      appDataDir,
      localAppDataDir,
      scanPortableDrives: false,
      execWindowsCred: mockWinCred,
      now: () => Date.parse('2026-11-23T00:00:00Z'),
    });

    // Codex & Codex Desktop: switch to B self-heals poisoned snapshot & does NOT contaminate A with stranger
    const codexSw = await mgr.switchAccount({ appId: 'codex', accountId: 'acct-b' });
    assert.equal(codexSw.switchedLocalFile, true);
    assert.equal(JSON.parse(readFileSync(codexPath, 'utf8')).tokens.refresh_token, 'ref-codex-b');
    await mgr.switchAccount({ appId: 'codex', accountId: 'acct-a' });
    assert.equal(JSON.parse(readFileSync(codexPath, 'utf8')).tokens.refresh_token, 'ref-codex-a');

    const codexDeskSw = await mgr.switchAccount({ appId: 'codex-desktop', accountId: 'desk-b' });
    assert.equal(codexDeskSw.switchedLocalFile, true);
    assert.equal(JSON.parse(readFileSync(codexPath, 'utf8')).tokens.refresh_token, 'desk-ref-b');

    // Antigravity: switch writes cred + app_storage.json, rejects mismatched idToken
    const agSw = await mgr.switchAccount({ appId: 'antigravity', accountId: 'ag-b' });
    assert.equal(agSw.switchedLocalFile, true);
    const agAppStorage = JSON.parse(readFileSync(path.join(appDataDir, 'Antigravity', 'app_storage.json'), 'utf8'));
    assert.equal(agAppStorage['agy.onboarding.lastLoginUsername'], 'agb@dingtu.test');
    await assert.rejects(() => mgr.switchAccount({ appId: 'antigravity', accountId: 'ag-bad' }), /ACCOUNT_SWITCH_FAILED|不一致/);

    // Cursor: self-heal B, preserve A (not overwritten with stranger), reject cur-bad
    const curSw = await mgr.switchAccount({ appId: 'cursor', accountId: 'cur-b' });
    assert.equal(curSw.switchedLocalFile, true);
    assert.equal(readVscdb(cursorDbPath)['cursorAuth/cachedEmail'], 'curb@dingtu.test');
    assert.equal(readVscdb(cursorDbPath)['cursorAuth/accessToken'], 'cur-tok-b');
    await mgr.switchAccount({ appId: 'cursor', accountId: 'cur-a' });
    assert.equal(readVscdb(cursorDbPath)['cursorAuth/cachedEmail'], 'cura@dingtu.test');
    assert.throws(() => mgr.switchAccount({ appId: 'cursor', accountId: 'cur-bad' }), err => err.code === 'ACCOUNT_SWITCH_FAILED');

    // Windsurf: self-heal B, preserve A
    const wsSw = await mgr.switchAccount({ appId: 'windsurf', accountId: 'ws-b' });
    assert.equal(wsSw.switchedLocalFile, true);
    assert.equal(JSON.parse(readVscdb(windsurfDbPath).windsurfAuthStatus).email, 'wsb@dingtu.test');
    await mgr.switchAccount({ appId: 'windsurf', accountId: 'ws-a' });
    assert.equal(JSON.parse(readVscdb(windsurfDbPath).windsurfAuthStatus).email, 'wsa@dingtu.test');

    // Claude Code: self-heal B, preserve A
    const ccSw = await mgr.switchAccount({ appId: 'claude-code', accountId: 'cc-b' });
    assert.equal(ccSw.switchedLocalFile, true);
    assert.equal(JSON.parse(readFileSync(claudeCredsPath, 'utf8')).claudeAiOauth.accessToken, 'cc-tok-b');
    assert.equal(JSON.parse(readFileSync(claudeCfgPath, 'utf8')).oauthAccount.emailAddress, 'ccb@dingtu.test');
    await mgr.switchAccount({ appId: 'claude-code', accountId: 'cc-a' });
    assert.equal(JSON.parse(readFileSync(claudeCfgPath, 'utf8')).oauthAccount.emailAddress, 'cca@dingtu.test');

    // Gemini CLI: self-heal B, preserve A
    const gemSw = await mgr.switchAccount({ appId: 'gemini-cli', accountId: 'gem-b' });
    assert.equal(gemSw.switchedLocalFile, true);
    assert.equal(JSON.parse(readFileSync(geminiAcctPath, 'utf8')).active, 'gemb@dingtu.test');
    await mgr.switchAccount({ appId: 'gemini-cli', accountId: 'gem-a' });
    assert.equal(JSON.parse(readFileSync(geminiAcctPath, 'utf8')).active, 'gema@dingtu.test');

    // Grok CLI: self-heal B, preserve A
    const grokSw = await mgr.switchAccount({ appId: 'grok-cli', accountId: 'grok-b' });
    assert.equal(grokSw.switchedLocalFile, true);
    assert.equal(JSON.parse(readFileSync(grokPath, 'utf8')).email, 'grokb@dingtu.test');
    await mgr.switchAccount({ appId: 'grok-cli', accountId: 'grok-a' });
    assert.equal(JSON.parse(readFileSync(grokPath, 'utf8')).email, 'groka@dingtu.test');

    // Copilot: OAuth/Token-only account (snapshot: null) writes BOTH hosts.json and apps.json, preserves A, rejects poisoned cop-bad
    const copSw = await mgr.switchAccount({ appId: 'copilot', accountId: 'cop-b' });
    assert.equal(copSw.switchedLocalFile, true);
    assert.equal(JSON.parse(readFileSync(copilotHostsPath, 'utf8'))['github.com'].oauth_token, 'ghu_beta_oauth_only');
    assert.equal(JSON.parse(readFileSync(copilotHostsPath, 'utf8'))['github.com'].user, 'octo-beta');
    assert.equal(existsSync(copilotAppsPath), true);
    assert.equal(Object.values(JSON.parse(readFileSync(copilotAppsPath, 'utf8')))[0].oauth_token, 'ghu_beta_oauth_only');
    await mgr.switchAccount({ appId: 'copilot', accountId: 'cop-a' });
    assert.equal(JSON.parse(readFileSync(copilotHostsPath, 'utf8'))['github.com'].user, 'octo-alpha');
    assert.throws(() => mgr.switchAccount({ appId: 'copilot', accountId: 'cop-bad' }), err => err.code === 'ACCOUNT_SWITCH_FAILED');

    // Kiro: OAuth/Token-only account (snapshot: null) writes kiro-auth-token.json, preserves A
    const kiroSw = await mgr.switchAccount({ appId: 'kiro', accountId: 'kiro-b' });
    assert.equal(kiroSw.switchedLocalFile, true);
    const kiroDisk = JSON.parse(readFileSync(kiroTokenPath, 'utf8'));
    assert.equal(kiroDisk.accessToken, 'kiro-tok-b-oauth');
    assert.equal(kiroDisk.email, 'kirob@dingtu.test');
    await mgr.switchAccount({ appId: 'kiro', accountId: 'kiro-a' });
    assert.equal(JSON.parse(readFileSync(kiroTokenPath, 'utf8')).email, 'kiroa@dingtu.test');

    // Claude Desktop: honest switchNote (never fakes silent encrypted cookie injection)
    const cdeskSw = await mgr.switchAccount({ appId: 'claude-desktop', accountId: 'cdesk-b' });
    assert.equal(cdeskSw.switchedLocalFile, false);
    assert.match(String(cdeskSw.switchNote || ''), /系统加密|安全容器|Claude Code/);

    // 6 Web Containers: isolated partition switching
    for (const webAppId of ['chatgpt', 'claude', 'gemini-web', 'grok', 'manus', 'metamuse']) {
      const webSw = await mgr.switchAccount({ appId: webAppId, accountId: 'web-b' });
      assert.equal(webSw.partitionIsolated, true);
      assert.equal(webSw.activeAccountId, 'web-b');
    }
  } finally {
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

test('5h and Weekly quota bars align side-by-side with zero fabricated percentages across Codex, ChatGPT, Claude family, Antigravity, and Gemini CLI', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dingtu-quotas-'));
  try {
    const vaultPath = path.join(root, 'vault.enc');
    const ss = makeSafeStorage();
    writeFileSync(vaultPath, ss.encryptString(JSON.stringify({
      version: 1,
      accounts: [
        { id: 'codex-weekly-only', appId: 'codex', email: 'c1@dingtu.test', label: 'c1@dingtu.test', oauthToken: 'tok-c1' },
        { id: 'codex-dual', appId: 'codex-desktop', email: 'c2@dingtu.test', label: 'c2@dingtu.test', oauthToken: 'tok-c2' },
        { id: 'gpt-dual', appId: 'chatgpt', email: 'gpt@dingtu.test', label: 'gpt@dingtu.test', oauthToken: 'tok-gpt' },
        { id: 'cc-5h-only', appId: 'claude-code', email: 'cc@dingtu.test', label: 'cc@dingtu.test', oauthToken: 'tok-cc' },
        { id: 'cl-weekly-zero', appId: 'claude', email: 'cl@dingtu.test', label: 'cl@dingtu.test', oauthToken: 'tok-cl' },
        { id: 'cdesk-dual', appId: 'claude-desktop', email: 'cd@dingtu.test', label: 'cd@dingtu.test', oauthToken: 'tok-cd' },
        { id: 'ag-acct', appId: 'antigravity', email: 'ag@dingtu.test', label: 'ag@dingtu.test', oauthToken: 'tok-ag', tokenExpiry: '2026-12-30T00:00:00Z' },
        { id: 'gem-acct', appId: 'gemini-cli', email: 'gem@dingtu.test', label: 'gem@dingtu.test', oauthToken: 'tok-gem', tokenExpiry: '2026-12-30T00:00:00Z' },
      ],
      activeByApp: {},
    })));

    const mockFetch = async (url, init = {}) => {
      const auth = String(init.headers?.Authorization || '');
      if (url.includes('wham/usage')) {
        if (auth.includes('tok-c1')) {
          // Single-window weekly plan returned in primary_window with limit_window_seconds = 604800!
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              plan_type: 'plus',
              rate_limit: {
                primary_window: { used_percent: 28, limit_window_seconds: 604800, reset_at: 1795500000 },
                secondary_window: null,
              },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            plan_type: 'pro',
            rate_limit: {
              primary_window: { used_percent: 15, limit_window_seconds: 18000, reset_at: 1795400000 },
              secondary_window: { used_percent: 40, limit_window_seconds: 604800, reset_at: 1795800000 },
            },
          }),
        };
      }
      if (url.includes('api.anthropic.com/api/oauth/usage')) {
        if (auth.includes('tok-cc')) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              five_hour: { utilization: 22, resets_at: '2026-11-23T05:00:00Z' },
            }),
          };
        }
        if (auth.includes('tok-cl')) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              seven_day: { utilization: 100, resets_at: '2026-11-28T00:00:00Z' },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            five_hour: { utilization: 10, resets_at: '2026-11-23T05:00:00Z' },
            seven_day: { utilization: 35, resets_at: '2026-11-28T00:00:00Z' },
          }),
        };
      }
      if (url.includes('loadCodeAssist')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ cloudaicompanionProject: 'proj-1', currentTier: { id: 'g1-pro-tier' } }),
        };
      }
      if (url.includes('fetchAvailableModels')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            models: {
              'gemini-2.5-pro': { displayName: 'Gemini 2.5 Pro', quotaInfo: { remainingFraction: 0.88, resetTime: '2026-11-26T00:00:00Z' } },
              'claude-sonnet-4-5': { displayName: 'Claude Sonnet 4.5', quotaInfo: { remainingFraction: 0.65, resetTime: '2026-11-23T04:00:00Z' } },
            },
          }),
        };
      }
      return { ok: false, status: 404, text: async () => '{}' };
    };

    const mgr = createWorkbenchAccountManager({
      platform: 'windows',
      filePath: vaultPath,
      safeStorage: ss,
      homeDir: path.join(root, 'home'),
      appDataDir: path.join(root, 'appdata'),
      localAppDataDir: path.join(root, 'localappdata'),
      scanPortableDrives: false,
      environmentModeProvider: () => 'own_network',
      fetchImpl: mockFetch,
      now: () => Date.parse('2026-11-23T00:00:00Z'),
    });

    await mgr.refreshQuota({});
    const byKey = new Map(mgr.list().accounts.map(a => [`${a.appId}:${a.id}`, a]));

    // 1) Single-window Codex with limit_window_seconds=604800 in primary_window -> classified as 周限额 (72%), 5h 限额 paired as null (never fake!)
    const c1 = byKey.get('codex:codex-weekly-only');
    assert.equal(c1.quotas[0].label, '5h 限额');
    assert.equal(c1.quotas[0].remainingPct, null);
    assert.equal(c1.quotas[1].label, '周限额');
    assert.equal(c1.quotas[1].remainingPct, 72);

    // 2) Dual-window Codex Desktop & ChatGPT -> [5h 限额 85%, 周限额 60%]
    for (const k of ['codex-desktop:codex-dual', 'chatgpt:gpt-dual']) {
      const acc = byKey.get(k);
      assert.equal(acc.quotas[0].label, '5h 限额');
      assert.equal(acc.quotas[0].remainingPct, 85);
      assert.equal(acc.quotas[1].label, '周限额');
      assert.equal(acc.quotas[1].remainingPct, 60);
    }

    // 3) Claude Code (5h only -> pairs 7d as null) & Claude Web (7d 0% -> pairs 5h as null '周额度已用尽') & Claude Desktop (both 90% / 65%)
    const cc = byKey.get('claude-code:cc-5h-only');
    assert.equal(cc.quotas[0].label, '5h 限额');
    assert.equal(cc.quotas[0].remainingPct, 78);
    assert.equal(cc.quotas[1].label, '7d 限额');
    assert.equal(cc.quotas[1].remainingPct, null);

    const cl = byKey.get('claude:cl-weekly-zero');
    assert.equal(cl.quotas[0].label, '5h 限额');
    assert.equal(cl.quotas[0].remainingPct, null);
    assert.equal(cl.quotas[0].statusHint, '周额度已用尽');
    assert.equal(cl.quotas[1].label, '7d 限额');
    assert.equal(cl.quotas[1].remainingPct, 0);

    const cd = byKey.get('claude-desktop:cdesk-dual');
    assert.equal(cd.quotas[0].remainingPct, 90);
    assert.equal(cd.quotas[1].remainingPct, 65);

    // 4) Antigravity & Gemini CLI -> emit ONLY real observed windows from daily-cloudcode-pa (no fabricated empty-bar partner cards!)
    for (const k of ['antigravity:ag-acct', 'gemini-cli:gem-acct']) {
      const ag = byKey.get(k);
      assert.equal(ag.quotas.length, 2);
      assert.equal(ag.quotas[0].label, 'Gemini · Weekly');
      assert.equal(ag.quotas[0].remainingPct, 88);
      assert.equal(ag.quotas[1].label, 'Claude · 5h');
      assert.equal(ag.quotas[1].remainingPct, 65);
    }
  } finally {
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

test('Antigravity merges daily-cloudcode-pa (Weekly) + cloudcode-pa (5h 100%) + Studio groups, and banned/revoked GPT accounts clear stale quotas', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dingtu-ag-ban-'));
  try {
    const homeDir = path.join(root, 'home');
    const appDataDir = path.join(root, 'appdata');
    const localAppDataDir = path.join(root, 'localappdata');
    const ccDir = path.join(root, 'cc-switch');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(appDataDir, { recursive: true });
    mkdirSync(localAppDataDir, { recursive: true });
    mkdirSync(ccDir, { recursive: true });

    const nowMs = Date.parse('2026-11-23T02:30:00Z');

    // 1. Seed Antigravity Studio with authoritative groups[].buckets[] (matching real quotas.v1.json)
    const studioDir = path.join(appDataDir, 'Antigravity Studio');
    mkdirSync(studioDir, { recursive: true });
    writeFileSync(path.join(studioDir, 'accounts.v1.json'), JSON.stringify({
      version: 1,
      accounts: [{
        id: 'stu-ultra',
        profile: { email: 'ultra@dingtu.test', tier: 'ULTRA' },
        tokens: { access_token: 'ya29.ultra', refresh_token: '1//0ultra', expiry_timestamp: nowMs + 3600_000 },
        status: 'ACTIVE',
      }],
    }));
    writeFileSync(path.join(studioDir, 'quotas.v1.json'), JSON.stringify({
      version: 1,
      snapshots: {
        'stu-ultra': {
          accountId: 'stu-ultra',
          email: 'ultra@dingtu.test',
          fetchedAt: nowMs - 30_000,
          tier: 'ULTRA',
          groups: [
            {
              id: 'gemini-argon',
              family: 'gemini',
              buckets: [
                { id: 'gemini-5h', window: '5h', percentage: 100, resetTimeIso: '2026-11-23T06:55:05Z' },
                { id: 'gemini-weekly', window: 'weekly', percentage: 17, resetTimeIso: '2026-11-28T09:41:05Z' },
              ],
            },
            {
              id: 'claude',
              family: 'claude',
              buckets: [
                { id: '3p-5h', window: '5h', percentage: 100, resetTimeIso: '2026-11-23T07:09:34Z' },
                { id: '3p-weekly', window: 'weekly', percentage: 0, resetTimeIso: '2026-11-25T11:16:44Z', isExhausted: true },
              ],
            },
          ],
          models: [
            { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', percentage: 17, window: '5h', resetTimeIso: '2026-11-28T09:41:05Z' },
            { id: 'gpt-oss-120b-medium', displayName: 'GPT-OSS 120B (Medium)', percentage: 0, isExhausted: true, window: '5h', resetTimeIso: '2026-11-25T11:16:44Z' },
          ],
        },
      },
    }));

    // 2. Seed 4-month-old Sub2API export (2026-07-21) for banned/revoked GPT account
    writeFileSync(path.join(ccDir, 'sub2api-account-20260721160409.json'), JSON.stringify({
      exported_at: '2026-07-21T16:04:09+08:00',
      accounts: [
        {
          name: 'revoked-gpt@dingtu.test',
          platform: 'openai',
          type: 'oauth',
          credentials: {
            access_token: 'dead-at',
            refresh_token: 'dead-rt',
            email: 'revoked-gpt@dingtu.test',
            plan_type: 'plus',
          },
          extra: {
            codex_usage_updated_at: '2026-07-21T16:02:17+08:00',
            codex_5h_used_percent: 0,
            codex_5h_reset_at: '2026-07-21T16:02:17+08:00',
            codex_7d_used_percent: 4,
            codex_7d_reset_at: '2026-07-26T13:41:46+08:00',
          },
        },
        {
          name: 'deactivated-gpt@dingtu.test',
          platform: 'openai',
          type: 'oauth',
          credentials: {
            access_token: 'ban-at',
            refresh_token: 'ban-rt',
            email: 'deactivated-gpt@dingtu.test',
            plan_type: 'plus',
          },
          extra: {},
        },
      ],
    }));

    const mockFetch = async (url, init = {}) => {
      const auth = String(init.headers?.Authorization || '');
      const bodyStr = String(init.body || '');
      // Live dual Cloud Code endpoints: daily-cloudcode-pa returns Weekly (17% / 0%), cloudcode-pa returns 5h (100% / 100%)
      if (url.startsWith('https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ cloudaicompanionProject: 'proj-daily', paidTier: { id: 'google-one-ultra' } }) };
      }
      if (url.startsWith('https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ cloudaicompanionProject: 'proj-5h', paidTier: { id: 'google-one-ultra' } }) };
      }
      if (url.startsWith('https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels')) {
        if (auth.includes('ya29.pro100')) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              models: {
                'gemini-2.5-pro': { displayName: 'Gemini 2.5 Pro', quotaInfo: { remainingFraction: 1, resetTime: '2026-11-23T06:00:00Z' } },
                'claude-sonnet-4-6': { displayName: 'Claude Sonnet 4.6', quotaInfo: { remainingFraction: 1, resetTime: '2026-11-23T07:00:00Z' } },
              },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            models: {
              'gemini-2.5-pro': { displayName: 'Gemini 2.5 Pro', quotaInfo: { remainingFraction: 0.17, resetTime: '2026-11-28T09:41:05Z' } },
              'claude-opus-5-5-high': { displayName: 'Claude Opus 5.5 (High)', quotaInfo: { resetTime: '2026-11-25T11:16:44Z' } },
              'gpt-oss-120b-medium': { displayName: 'GPT-OSS 120B (Medium)', quotaInfo: { resetTime: '2026-11-25T11:16:44Z' } },
            },
          }),
        };
      }
      if (url.startsWith('https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            models: {
              'gemini-2.5-pro': { displayName: 'Gemini 2.5 Pro', quotaInfo: { remainingFraction: 1, resetTime: '2026-11-23T07:25:00Z' } },
              'claude-opus-5-5-high': { displayName: 'Claude Opus 5.5 (High)', quotaInfo: { remainingFraction: 1, resetTime: '2026-11-23T07:25:00Z' } },
              'gpt-oss-120b-medium': { displayName: 'GPT-OSS 120B (Medium)', quotaInfo: { remainingFraction: 1, resetTime: '2026-11-23T07:25:00Z' } },
              'chat_20706': { quotaInfo: { remainingFraction: 1 } },
            },
          }),
        };
      }
      if (url.includes('auth.openai.com/oauth/token')) {
        if (bodyStr.includes('ban-rt')) {
          return { ok: false, status: 403, text: async () => JSON.stringify({ error: { code: 'account_deactivated', message: 'Your OpenAI account has been deactivated.' } }) };
        }
        return { ok: false, status: 401, text: async () => JSON.stringify({ error: { code: 'invalid_refresh_token', message: 'Could not validate your refresh token.' } }) };
      }
      if (url.includes('wham/usage')) {
        if (auth.includes('ban-at')) {
          return { ok: false, status: 403, text: async () => JSON.stringify({ detail: { code: 'deactivated_workspace', message: 'Account deactivated' } }) };
        }
        return { ok: false, status: 401, text: async () => JSON.stringify({ error: { code: 'invalid_jwt', message: 'Invalid token' } }) };
      }
      return { ok: false, status: 404, text: async () => '{}' };
    };

    const vaultPath = path.join(root, 'vault.enc');
    const ss = makeSafeStorage();
    const mgr = createWorkbenchAccountManager({
      platform: 'windows',
      filePath: vaultPath,
      safeStorage: ss,
      homeDir,
      appDataDir,
      localAppDataDir,
      extraCcSwitchDirs: [ccDir],
      scanPortableDrives: false,
      environmentModeProvider: () => 'own_network',
      fetchImpl: mockFetch,
      now: () => nowMs,
    });

    await mgr.importLocal({ all: true, silent: true });
    mgr.upsertAuthorizedAccount({
      appId: 'antigravity',
      alias: 'pro-full',
      email: 'pro100@dingtu.test',
      plan: 'PRO',
      oauthToken: 'ya29.pro100',
      tokenExpiry: '2026-12-01T00:00:00Z',
    });

    // Verify Studio import immediately got 5h=100%, Weekly=17%, Claude 5h=100%, Claude Weekly=0%, GPT-OSS=0%
    const importedUltra = mgr.list('antigravity').accounts.find(a => a.email === 'ultra@dingtu.test');
    assert.equal(importedUltra.quotas[0].label, 'Gemini · 5h');
    assert.equal(importedUltra.quotas[0].remainingPct, 100);
    assert.equal(importedUltra.quotas[1].label, 'Gemini · Weekly');
    assert.equal(importedUltra.quotas[1].remainingPct, 17);
    assert.equal(importedUltra.quotas[2].label, 'Claude · 5h');
    assert.equal(importedUltra.quotas[2].remainingPct, 100);
    assert.equal(importedUltra.quotas[3].label, 'Claude · Weekly');
    assert.equal(importedUltra.quotas[3].remainingPct, 0);
    assert.equal(importedUltra.quotas[4].label, 'GPT-OSS 120B (Medium)');
    assert.equal(importedUltra.quotas[4].remainingPct, 0);

    // Verify 4-month-old Sub2API export was NOT imported with fake 100%/96% synced quotas
    const importedRevoked = mgr.list('codex').accounts.find(a => a.email === 'revoked-gpt@dingtu.test');
    assert.deepEqual(importedRevoked.quotas, []);
    assert.equal(importedRevoked.quotaState, 'local_detected');

    // Now run live refreshQuota across all accounts
    await mgr.refreshQuota({});

    // 1) Live primary daily-cloudcode-pa refresh returns exact real Weekly quotas (17% / 0% / GPT-OSS 0%)
    // without legacy cloudcode-pa 100%/5h pollution!
    const liveUltra = mgr.list('antigravity').accounts.find(a => a.email === 'ultra@dingtu.test');
    assert.equal(liveUltra.quotas.length, 3);
    assert.equal(liveUltra.quotas[0].label, 'Gemini · Weekly');
    assert.equal(liveUltra.quotas[0].remainingPct, 17);
    assert.equal(liveUltra.quotas[1].label, 'Claude · Weekly');
    assert.equal(liveUltra.quotas[1].remainingPct, 0);
    assert.equal(liveUltra.quotas[2].label, 'GPT-OSS 120B (Medium)');
    assert.equal(liveUltra.quotas[2].remainingPct, 0);

    // 2) PRO account with 5h=100% reports exact 5h bars without fabricating synthetic Weekly partner tiles
    const livePro = mgr.list('antigravity').accounts.find(a => a.email === 'pro100@dingtu.test');
    assert.equal(livePro.quotas.length, 2);
    assert.equal(livePro.quotas[0].label, 'Gemini · 5h');
    assert.equal(livePro.quotas[0].remainingPct, 100);
    assert.equal(livePro.quotas[1].label, 'Claude · 5h');
    assert.equal(livePro.quotas[1].remainingPct, 100);

    // 3) Revoked GPT account (401 invalid_refresh_token + 401 invalid_jwt) is marked status='invalid' with empty quotas
    const afterRevoked = mgr.list('codex').accounts.find(a => a.email === 'revoked-gpt@dingtu.test');
    assert.equal(afterRevoked.status, 'invalid');
    assert.equal(afterRevoked.quotaState, 'refresh_failed');
    assert.deepEqual(afterRevoked.quotas, []);
    assert.match(afterRevoked.lastError, /失效|封号|注销/);

    // 4) Deactivated GPT account (403 account_deactivated) is marked status='banned' with empty quotas
    const afterBanned = mgr.list('codex').accounts.find(a => a.email === 'deactivated-gpt@dingtu.test');
    assert.equal(afterBanned.status, 'banned');
    assert.equal(afterBanned.quotaState, 'refresh_failed');
    assert.deepEqual(afterBanned.quotas, []);
    assert.match(afterBanned.lastError, /封禁|停用|注销/);
  } finally {
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

test('Claude Web (claude) hydrates real email + 5h/7d quotas over placeholder session titles via prober and /api/bootstrap fallback', async () => {
  assert.equal(WEB_LOGIN_TARGETS.claude.labelPrefix, 'Claude Web');
  const claudeScript = buildWebSessionProfileScript('claude');
  const gptScript = buildWebSessionProfileScript('chatgpt');
  assert.match(claudeScript, /\/api\/bootstrap/);
  assert.match(claudeScript, /__next_f/);
  assert.match(gptScript, /\/backend-api\/wham\/usage/);

  const root = mkdtempSync(path.join(os.tmpdir(), 'dingtu-claude-web-hydrate-'));
  try {
    const vaultPath = path.join(root, 'vault.enc');
    const ss = makeSafeStorage();
    const seenCookieHeaders = [];

    const mockFetch = async (url, init = {}) => {
      const u = String(url);
      const cookieHdr = init?.headers?.Cookie || init?.headers?.cookie || '';
      seenCookieHeaders.push({ url: u, cookie: cookieHdr, ua: init?.headers?.['User-Agent'] || '' });
      if (u === 'https://claude.ai/api/bootstrap') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            account: { email_address: 'http-fallback@dingtu.test', memberships: [{ organization: { rate_limit_tier: 'default_claude_max_5x' } }] },
          }),
        };
      }
      if (u === 'https://claude.ai/api/organizations') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify([
            { uuid: 'org-http-1', capabilities: ['chat', 'claude_max'], rate_limit_tier: 'default_claude_max_5x' },
          ]),
        };
      }
      if (u === 'https://claude.ai/api/organizations/org-http-1/usage') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            five_hour: { utilization: 35, resets_at: '2026-11-23T08:00:00Z' },
            seven_day: { utilization: 18, resets_at: '2026-11-29T00:00:00Z' },
          }),
        };
      }
      return { ok: false, status: 404, text: async () => '{}' };
    };

    const mgr = createWorkbenchAccountManager({
      platform: 'windows',
      filePath: vaultPath,
      safeStorage: ss,
      homeDir: path.join(root, 'home'),
      appDataDir: path.join(root, 'appdata'),
      localAppDataDir: path.join(root, 'localappdata'),
      scanPortableDrives: false,
      environmentModeProvider: () => 'own_network',
      fetchImpl: mockFetch,
      webSessionProber: async ({ appId, instanceId }) => {
        if (appId === 'claude' && instanceId === 'main') {
          return {
            email: 'probed-claude@dingtu.test',
            plan: 'PRO',
            sessionVerified: true,
            usageData: {
              five_hour: { utilization: 26, resets_at: '2026-11-23T07:00:00Z' },
              seven_day: { utilization: 12, resets_at: '2026-11-28T00:00:00Z' },
            },
          };
        }
        if (appId === 'claude' && instanceId === 'free-slot') {
          // Simulates Free-tier account where /api/bootstrap succeeds inside Chromium, while /usage returns 403 (usageData: null)
          return {
            email: 'free-claude@dingtu.test',
            plan: 'FREE',
            sessionVerified: true,
            usageStatus: 403,
            usageData: null,
            cookieName: 'sessionKey',
            cookieValue: 'sk-ant-sid01-free-slot',
          };
        }
        if (appId === 'claude' && instanceId === 'unused-slot') {
          // Simulates 0-message active org where /usage returns {"five_hour": null, "seven_day": null}
          return {
            email: 'unused-claude@dingtu.test',
            plan: 'PRO',
            sessionVerified: true,
            usageStatus: 200,
            usageData: { five_hour: null, seven_day: null },
          };
        }
        return null;
      },
      now: () => Date.parse('2026-11-23T03:30:00Z'),
    });

    // Slot 'main': legacy placeholder without oauthToken (only Chromium partition cookies)
    mgr.upsertAuthorizedAccount({
      appId: 'claude',
      alias: 'main',
      label: 'Claude 已授权会话 #8f2a1c',
      email: null,
      plan: 'FREE',
      source: 'isolated-container',
    });

    // Slot 'http-slot': legacy placeholder with sessionKey + cf_clearance cookieHeader (prober returns null -> HTTP fallback)
    mgr.upsertAuthorizedAccount({
      appId: 'claude',
      alias: 'http-slot',
      label: 'Claude 已授权会话 #9b3c4d',
      email: null,
      oauthToken: 'sk-ant-sid01-live-cookie',
      extraMeta: { cookieHeader: 'sessionKey=sk-ant-sid01-live-cookie; cf_clearance=cf_ok_token' },
      source: 'web-login',
    });

    mgr.upsertAuthorizedAccount({
      appId: 'claude',
      alias: 'free-slot',
      label: 'Claude Web 已授权会话 #112233',
      email: null,
      oauthToken: 'sk-ant-sid01-free-slot',
      source: 'isolated-container',
    });

    mgr.upsertAuthorizedAccount({
      appId: 'claude',
      alias: 'unused-slot',
      label: 'Claude Web 已授权会话 #445566',
      email: null,
      source: 'isolated-container',
    });

    await mgr.refreshQuota({ appId: 'claude' });
    const list = mgr.list('claude').accounts;

    const probed = list.find(a => a.id === 'main');
    assert.equal(probed.email, 'probed-claude@dingtu.test');
    assert.equal(probed.label, 'probed-claude@dingtu.test');
    assert.equal(probed.plan, 'PRO');
    assert.equal(probed.quotaState, 'synced');
    assert.equal(probed.quotas[0].label, '5h 限额');
    assert.equal(probed.quotas[0].remainingPct, 74);
    assert.equal(probed.quotas[1].label, '7d 限额');
    assert.equal(probed.quotas[1].remainingPct, 88);

    const freeSlot = list.find(a => a.id === 'free-slot');
    assert.equal(freeSlot.email, 'free-claude@dingtu.test');
    assert.equal(freeSlot.plan, 'FREE');
    assert.equal(freeSlot.status, 'ready');
    assert.equal(freeSlot.lastError, null, 'Free Claude Web container must not fall through to Node Cloudflare 403');
    assert.equal(freeSlot.quotaState, 'synced');
    assert.match(freeSlot.quotas[0].statusHint, /免费版/);

    const unusedSlot = list.find(a => a.id === 'unused-slot');
    assert.equal(unusedSlot.email, 'unused-claude@dingtu.test');
    assert.equal(unusedSlot.quotas[0].remainingPct, 100);
    assert.equal(unusedSlot.quotas[1].remainingPct, 100);
    assert.equal(unusedSlot.lastError, null);

    const httpHydrated = list.find(a => a.id === 'http-slot');
    assert.equal(httpHydrated.email, 'http-fallback@dingtu.test');
    assert.equal(httpHydrated.label, 'http-fallback@dingtu.test');
    assert.equal(httpHydrated.plan, 'MAX');
    assert.equal(httpHydrated.quotaState, 'synced');
    assert.equal(httpHydrated.quotas[0].remainingPct, 65);
    assert.equal(httpHydrated.quotas[1].remainingPct, 82);
    assert.ok(seenCookieHeaders.some(c => c.cookie.includes('cf_clearance=cf_ok_token') && /Chrome\//.test(c.ua)));
  } finally {
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});
