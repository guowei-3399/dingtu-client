import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { discoverCcSwitchDirs, discoverLocalAccounts } from './local-account-importers.mjs';
import { createWorkbenchAccountManager } from './workbench-accounts.mjs';

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

function fakeSafeStorage() {
  const prefix = Buffer.from('ENCv1:');
  return {
    isEncryptionAvailable: () => true,
    encryptString: text => Buffer.concat([prefix, Buffer.from(text, 'utf8').map(b => b ^ 0x5a)]),
    decryptString: buf => Buffer.from(buf.subarray(prefix.length)).map(b => b ^ 0x5a).toString('utf8'),
  };
}

function encryptCockpitPayload(obj, keyBuf, nowMs = Date.now()) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, nonce);
  const pt = Buffer.from(JSON.stringify(obj), 'utf8');
  const ct = Buffer.concat([cipher.update(pt), cipher.final(), cipher.getAuthTag()]);
  return {
    version: 1,
    kind: 'antigravity',
    algorithm: 'AES-256-GCM',
    key_id: 'local-secure-account-storage-v1',
    nonce: nonce.toString('base64'),
    ciphertext: ct.toString('base64'),
    encrypted_at: nowMs,
  };
}

test('local-account-importers discovers and deduplicates across native, Studio, Cockpit, Antigravity Tools, Codex Switcher, and CC-Switch (OAuth only)', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'dingtu-local-imp-'));
  try {
    const homeDir = path.join(tmp, 'home');
    const appDataDir = path.join(tmp, 'appdata');
    const localAppDataDir = path.join(tmp, 'localappdata');
    const portableCcDir = path.join(tmp, 'portable-cc-switch');
    const nowMs = 1795350000000;

    // 1. Native Antigravity: WinCred (active email via id_token_email) + mismatched active-account.json + app_storage + cli-file duplicate
    mkdirSync(path.join(homeDir, '.gemini', 'antigravity'), { recursive: true });
    mkdirSync(path.join(homeDir, '.gemini', 'antigravity-cli'), { recursive: true });
    mkdirSync(path.join(appDataDir, 'Antigravity'), { recursive: true });
    writeFileSync(path.join(homeDir, '.gemini', 'antigravity', 'active-account.json'), JSON.stringify({
      email: 'ag-studio@example.com',
      accountId: 'main',
    }));
    writeFileSync(path.join(appDataDir, 'Antigravity', 'app_storage.json'), JSON.stringify({
      'agy.onboarding.lastLoginUsername': 'ag-wincred@example.com',
    }));
    const winCredPayload = JSON.stringify({
      token: {
        access_token: 'ya29.wincred',
        refresh_token: '1//0wincred-rt',
        token_type: 'Bearer',
        expiry: new Date(nowMs + 3600_000).toISOString(),
      },
      id_token_email: 'ag-wincred@example.com',
    });
    // cli-file holds same refresh_token (should deduplicate cleanly!)
    writeFileSync(path.join(homeDir, '.gemini', 'antigravity-cli', 'antigravity-oauth-token'), winCredPayload);
    const execWindowsCred = async req => req.operation === 'read'
      ? { ok: true, found: true, valueB64: Buffer.from(winCredPayload, 'utf8').toString('base64') }
      : { ok: true };

    // 2. Antigravity Studio (active valid + PRO + expired placeholder skipped)
    const studioDir = path.join(appDataDir, 'Antigravity Studio');
    mkdirSync(studioDir, { recursive: true });
    writeFileSync(path.join(studioDir, 'accounts.v1.json'), JSON.stringify({
      version: 1,
      activeAccountId: 'stu-1',
      accounts: [
        {
          id: 'stu-1',
          profile: { email: 'ag-studio@example.com', tier: 'PRO' },
          tokens: { access_token: 'ya29.studio', refresh_token: '1//0studio-rt', expiry_timestamp: nowMs + 1800_000 },
          is_active: true,
          status: 'ACTIVE',
          custom_note: 'Studio 主力',
          tags: ['studio'],
        },
        {
          id: 'stu-expired',
          profile: { email: 'expired-no-token@example.com', tier: 'PRO' },
          tokens: { access_token: '', refresh_token: '' },
          is_active: false,
          status: 'EXPIRED',
        },
      ],
    }));
    writeFileSync(path.join(studioDir, 'quotas.v1.json'), JSON.stringify({
      version: 1,
      snapshots: {
        'stu-1': {
          accountId: 'stu-1',
          email: 'ag-studio@example.com',
          fetchedAt: new Date(nowMs - 60_000).toISOString(),
          tier: 'ULTRA',
          paidTierName: 'Google AI Ultra',
          models: [
            { id: 'tab_flash_lite_preview', displayName: 'tab_flash_lite_preview', percentage: 100 },
            { id: 'gemini-3-pro', displayName: 'Gemini 3 Pro', window: '5h', percentage: 80, resetTimeIso: new Date(nowMs + 4 * 3600_000).toISOString() },
            { id: 'claude-opus-4-6', displayName: 'Claude Opus 4.6', window: 'weekly', percentage: 60, resetTimeIso: new Date(nowMs + 72 * 3600_000).toISOString() },
          ],
        },
      },
    }));

    // 3. Cockpit Tools (~/.cockpit_tools): AES-256-GCM encrypted account sharing WinCred email (enrich with quotas!) + second unique account + codex account
    const cockpitDir = path.join(homeDir, '.cockpit_tools');
    mkdirSync(path.join(cockpitDir, 'accounts'), { recursive: true });
    mkdirSync(path.join(cockpitDir, 'codex_accounts'), { recursive: true });
    const cockpitKey = crypto.randomBytes(32);
    writeFileSync(path.join(cockpitDir, 'secure-account-storage.key'), cockpitKey.toString('base64'));
    writeFileSync(path.join(cockpitDir, 'accounts', 'acc-dup.json'), JSON.stringify(encryptCockpitPayload({
      id: 'acc-dup',
      email: 'ag-wincred@example.com',
      token: { access_token: 'ya29.cockpit-dup', refresh_token: '1//0wincred-rt', expiry_timestamp: Math.floor(nowMs / 1000) + 1800 },
      quota: {
        subscription_tier: 'g1-ultra-lite-tier',
        last_updated: Math.floor(nowMs / 1000),
        models: [
          { name: 'tab_jump_flash_lite_preview', display_name: 'tab_jump_flash_lite_preview', percentage: 100 },
          { name: 'gemini-4-argon', display_name: 'Gemini 4 Argon', percentage: 55, reset_time: new Date(nowMs + 72 * 3600_000).toISOString() },
          { name: 'claude-4-5-sonnet', display_name: 'Claude 4.5 Sonnet', percentage: 40, reset_time: new Date(nowMs + 3 * 3600_000).toISOString() },
        ],
      },
    }, cockpitKey, nowMs)));
    writeFileSync(path.join(cockpitDir, 'accounts', 'acc-cockpit-2.json'), JSON.stringify(encryptCockpitPayload({
      id: 'acc-cockpit-2',
      email: 'ag-cockpit-only@example.com',
      token: { access_token: 'ya29.cp2', refresh_token: '1//0cp2-rt' },
      quota: { subscription_tier: 'free-tier', models: [] },
    }, cockpitKey, nowMs)));
    writeFileSync(path.join(cockpitDir, 'accounts', 'ignored.json.bak'), '{"corrupt":true}');
    writeFileSync(path.join(cockpitDir, 'codex_accounts', 'cx-cp.json'), JSON.stringify({
      id: 'cx-cp',
      email: 'cx-cockpit@example.com',
      plan_type: 'pro',
      access_token: 'cx-cp-at',
      refresh_token: 'cx-cp-rt',
    }));

    // 4. Antigravity Tools (~/.antigravity_tools/accounts/*.json)
    const agToolsAccDir = path.join(homeDir, '.antigravity_tools', 'accounts');
    mkdirSync(agToolsAccDir, { recursive: true });
    writeFileSync(path.join(agToolsAccDir, 'tool-1.json'), JSON.stringify({
      id: 'tool-1',
      email: 'ag-tools@example.com',
      token: { access_token: 'ya29.tools', refresh_token: '1//0tools-rt' },
      quota: { subscription_tier: 'Google AI Pro', models: [] },
    }));

    // 5. Codex native (~/.codex/auth.json & ~/.codex-cli/auth.json) + Codex Switcher (1 OAuth + 1 skipped relay)
    mkdirSync(path.join(homeDir, '.codex'), { recursive: true });
    mkdirSync(path.join(homeDir, '.codex-cli'), { recursive: true });
    mkdirSync(path.join(homeDir, '.codex-switcher'), { recursive: true });
    writeFileSync(path.join(homeDir, '.codex', 'auth.json'), JSON.stringify({
      tokens: { access_token: 'cx-native-at', refresh_token: 'cx-native-rt', id_token: makeJwt({ email: 'cx-native@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' } }) },
    }));
    writeFileSync(path.join(homeDir, '.codex-cli', 'auth.json'), JSON.stringify({
      tokens: { access_token: 'cx-cli-at', refresh_token: 'cx-cli-rt', id_token: makeJwt({ email: '80cx-cli@icloud.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' } }) },
    }));
    writeFileSync(path.join(homeDir, '.codex-switcher', 'accounts.json'), JSON.stringify({
      accounts: {
        relaySkip: { id: 'relaySkip', kind: 'relay', auth_json: { tokens: { access_token: 'relay-tok' } }, is_banned: false },
        bannedSkip: { id: 'bannedSkip', kind: 'oauth', refresh_token: 'cx-ban-rt', is_banned: true },
        oauthKeep: { id: 'oauthKeep', kind: 'oauth', email: 'cx-switcher@example.com', refresh_token: 'cx-sw-rt', auth_json: { tokens: { access_token: 'cx-sw-at' } } },
      },
    }));

    // 6. CC-Switch: ~/.cc-switch (codex_oauth_auth.json + cc-switch.db with BigInt ns timestamps & relay exclusion) + portable sub2api JSON
    const ccSwitchHome = path.join(homeDir, '.cc-switch');
    mkdirSync(ccSwitchHome, { recursive: true });
    mkdirSync(portableCcDir, { recursive: true });
    writeFileSync(path.join(ccSwitchHome, 'codex_oauth_auth.json'), JSON.stringify({
      version: 1,
      default_account_id: 'org-cc-1',
      accounts: {
        'org-cc-1': { account_id: 'org-cc-1', email: 'cx-ccoauth@example.com', refresh_token: 'cx-ccoauth-rt' },
      },
    }));
    const ccDb = new DatabaseSync(path.join(ccSwitchHome, 'cc-switch.db'));
    ccDb.exec('CREATE TABLE providers (id TEXT PRIMARY KEY, app_type TEXT, name TEXT, category TEXT, is_current INTEGER, settings_config TEXT, created_at INTEGER)');
    // Simulate nanosecond-scale 64-bit integer > Number.MAX_SAFE_INTEGER to exercise setReadBigInts(true)
    const bigTs = 9007199254740999n;
    const ins = ccDb.prepare('INSERT INTO providers (id, app_type, name, category, is_current, settings_config, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    ins.run('p-official', 'codex', 'OpenAI Official', 'official', 0, JSON.stringify({
      auth: {
        auth_mode: 'chatgpt',
        OPENAI_API_KEY: null,
        tokens: {
          access_token: 'cx-db-at',
          refresh_token: 'cx-db-rt',
          account_id: 'acct-db-1',
          id_token: makeJwt({ email: 'cx-db@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'free' } }),
        },
      },
    }), bigTs);
    ins.run('p-relay-skip', 'codex', '4allapi VIP', null, 1, JSON.stringify({
      auth: { OPENAI_API_KEY: 'sk-third-party-relay-key' },
    }), bigTs);
    ins.run('p-claude-relay-skip', 'claude', 'default', 'custom', 1, JSON.stringify({
      env: { ANTHROPIC_AUTH_TOKEN: 'sk-ant-relay', ANTHROPIC_BASE_URL: 'https://relay.example.com' },
    }), bigTs);
    ccDb.close();

    writeFileSync(path.join(portableCcDir, 'sub2api-account-20260721160409.json'), JSON.stringify({
      exported_at: new Date(nowMs).toISOString(),
      proxies: [],
      accounts: [
        {
          name: 'cx-sub2@icloud.com',
          platform: 'openai',
          type: 'oauth',
          credentials: {
            access_token: 'cx-sub2-at',
            refresh_token: 'cx-sub2-rt',
            email: 'cx-sub2@icloud.com',
            plan_type: 'plus',
            chatgpt_account_id: 'acct-sub2-1',
            expires_at: Math.floor(nowMs / 1000) + 3600,
          },
          extra: {
            codex_5h_used_percent: 25,
            codex_5h_reset_after_seconds: 3600,
            codex_7d_used_percent: 40,
            codex_7d_reset_after_seconds: 86400,
          },
        },
        {
          name: 'api-key-skip',
          platform: 'openai',
          type: 'apikey',
          credentials: { api_key: 'sk-should-skip' },
        },
      ],
    }));

    const dirs = discoverCcSwitchDirs({
      platform: 'windows',
      homeDir,
      appDataDir,
      localAppDataDir,
      extraCcSwitchDirs: [portableCcDir],
      scanPortableDrives: false,
    });
    assert.ok(dirs.includes(path.resolve(ccSwitchHome)));
    assert.ok(dirs.includes(path.resolve(portableCcDir)));

    const discovered = await discoverLocalAccounts({
      platform: 'windows',
      homeDir,
      appDataDir,
      localAppDataDir,
      extraCcSwitchDirs: [portableCcDir],
      scanPortableDrives: false,
      execWindowsCred,
      now: () => nowMs,
    });

    const agAccounts = discovered.filter(a => a.appId === 'antigravity');
    const cxAccounts = discovered.filter(a => a.appId === 'codex');

    // Antigravity: WinCred+Cockpit+cli-file merged to 1 (ag-wincred, ULTRA, active first!) + Studio (ag-studio, ULTRA) + Cockpit2 (ag-cockpit-only) + Tools (ag-tools) = 4
    assert.equal(agAccounts.length, 4);
    assert.equal(agAccounts[0].email, 'ag-wincred@example.com');
    assert.equal(agAccounts[0].plan, 'ULTRA');
    assert.ok(agAccounts[0].quotas.length >= 2);
    assert.equal(agAccounts[0].quotas.some(q => q.id.includes('tab_')), false);
    const stuAcc = agAccounts.find(a => a.email === 'ag-studio@example.com');
    assert.equal(stuAcc.plan, 'ULTRA');
    assert.equal(stuAcc.note, 'Studio 主力');
    assert.deepEqual(stuAcc.tags, ['studio']);
    assert.equal(stuAcc.quotas.some(q => q.id.includes('tab_')), false);
    assert.equal(agAccounts.some(a => a.email === 'expired-no-token@example.com'), false);

    // Codex: native + codex-cli + cockpit + switcher(oauth) + cc-switch codex_oauth + cc-switch DB official + sub2api oauth = 7 (no 4allapi/relay/apikey)
    assert.equal(cxAccounts.length, 7);
    assert.equal(cxAccounts[0].email, 'cx-native@example.com');
    assert.equal(cxAccounts.some(a => a.email === 'cx-db@example.com'), true);
    const sub2Acc = cxAccounts.find(a => a.email === 'cx-sub2@icloud.com');
    assert.equal(sub2Acc.plan, 'plus');
    assert.equal(sub2Acc.quotas[0].remainingPct, 75);
    assert.equal(sub2Acc.quotas[1].remainingPct, 60);

    // End-to-end workbench-accounts deduplication + alias for digit-starting email + Codex file switch without snapshot
    const mgr = createWorkbenchAccountManager({
      platform: 'windows',
      filePath: path.join(tmp, 'vault.bin'),
      safeStorage: fakeSafeStorage(),
      homeDir,
      appDataDir,
      localAppDataDir,
      extraCcSwitchDirs: [portableCcDir],
      scanPortableDrives: false,
      execWindowsCred,
      now: () => nowMs,
    });

    const firstImport = await mgr.importLocal({ all: true, silent: true });
    assert.equal(firstImport.addedCount, 12); // 4 AG + 7 Codex + 1 Codex Desktop (.codex/auth.json)
    assert.equal(firstImport.skippedCount, 0);
    assert.equal(firstImport.activeByApp.antigravity, 'main');
    assert.equal(firstImport.activeByApp.codex, 'main');

    const digitCodex = firstImport.accounts.find(a => a.appId === 'codex' && a.email === '80cx-cli@icloud.com');
    assert.match(digitCodex.id, /^[a-z][a-z0-9_-]{0,31}$/);

    // Preserve user's metadata across subsequent silent imports & guarantee zero duplicates
    const winAgSlot = firstImport.accounts.find(a => a.appId === 'antigravity' && a.email === 'ag-wincred@example.com');
    mgr.updateMeta({ appId: 'antigravity', accountId: winAgSlot.id, tags: ['常用'], note: '我的主力号' });
    const secondImport = await mgr.importLocal({ all: true, silent: true });
    assert.equal(secondImport.addedCount, 0);
    assert.equal(secondImport.updatedCount, 0);
    assert.equal(secondImport.skippedCount, 12);
    const afterWinAg = secondImport.accounts.find(a => a.appId === 'antigravity' && a.id === winAgSlot.id);
    assert.equal(afterWinAg.note, '我的主力号');
    assert.deepEqual(afterWinAg.tags, ['常用']);

    // Switch Codex to Sub2API OAuth account (which had snapshot: null) -> must synthesize valid ~/.codex/auth.json!
    const sub2Slot = secondImport.accounts.find(a => a.appId === 'codex' && a.email === 'cx-sub2@icloud.com');
    const switchedCx = mgr.switchAccount({ appId: 'codex', accountId: sub2Slot.id });
    assert.equal(switchedCx.switchedLocalFile, true);
    const writtenCodexAuth = JSON.parse(readFileSync(path.join(homeDir, '.codex', 'auth.json'), 'utf8'));
    assert.equal(writtenCodexAuth.auth_mode, 'chatgpt');
    assert.equal(writtenCodexAuth.tokens.refresh_token, 'cx-sub2-rt');
    assert.equal(writtenCodexAuth.tokens.account_id, 'acct-sub2-1');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('silent importLocal self-heals legacy crossed Antigravity email/refreshToken slots without swallowing WinCred account', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'dingtu-crossed-ag-'));
  try {
    const homeDir = path.join(tmp, 'home');
    const appDataDir = path.join(tmp, 'appdata');
    const vaultPath = path.join(tmp, 'vault.bin');
    const ss = fakeSafeStorage();

    // Seed legacy crossed vault record: email=studio@example.com, refreshToken=1//0wincred-rt
    writeFileSync(vaultPath, ss.encryptString(JSON.stringify({
      version: 1,
      accounts: [{
        id: 'main',
        appId: 'antigravity',
        label: 'studio@example.com',
        email: 'studio@example.com',
        plan: 'ULTRA',
        source: 'local-import',
        status: 'ready',
        quotaState: 'local_detected',
        quotas: [],
        credits: [],
        tags: [],
        note: '',
        oauthToken: 'ya29.stale',
        refreshToken: '1//0wincred-rt',
        snapshot: null,
        extraMeta: {},
      }],
      activeByApp: { antigravity: 'main' },
      totpEntries: [],
      totpHistory: [],
      groups: [],
      autoRefreshMinutes: 0,
      customDataDirs: {},
    })));

    // Studio owns studio@example.com with 1//0studio-rt; WinCred owns wincred@example.com with 1//0wincred-rt
    const studioDir = path.join(appDataDir, 'Antigravity Studio');
    mkdirSync(studioDir, { recursive: true });
    writeFileSync(path.join(studioDir, 'accounts.v1.json'), JSON.stringify({
      version: 1,
      accounts: [{
        id: 'stu-1',
        profile: { email: 'studio@example.com', tier: 'ULTRA' },
        tokens: { access_token: 'ya29.studio-real', refresh_token: '1//0studio-rt' },
        is_active: false,
        status: 'ACTIVE',
      }],
    }));
    const winCredPayload = JSON.stringify({
      token: { access_token: 'ya29.wincred-real', refresh_token: '1//0wincred-rt', expiry: '2026-12-01T00:00:00Z' },
      id_token_email: 'wincred@example.com',
    });
    const execWindowsCred = async req => req.operation === 'read'
      ? { ok: true, found: true, valueB64: Buffer.from(winCredPayload, 'utf8').toString('base64') }
      : { ok: true };

    const mgr = createWorkbenchAccountManager({
      platform: 'windows',
      filePath: vaultPath,
      safeStorage: ss,
      homeDir,
      appDataDir,
      localAppDataDir: path.join(tmp, 'localappdata'),
      scanPortableDrives: false,
      execWindowsCred,
    });

    const synced = await mgr.importLocal({ all: true, silent: true });
    assert.equal(synced.accounts.filter(a => a.appId === 'antigravity').length, 2);
    assert.ok(synced.accounts.some(a => a.email === 'wincred@example.com'));
    assert.ok(synced.accounts.some(a => a.email === 'studio@example.com'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
