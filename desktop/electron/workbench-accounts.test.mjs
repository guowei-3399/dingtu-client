import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createWorkbenchAccountManager, generateTotpCode, SUPPORTED_WORKBENCH_APPS } from './workbench-accounts.mjs';
import './totp-qr.js';

const totpQrApi = globalThis.DingtuTotpQr;

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

function fakeSafeStorage(available = true) {
  const prefix = Buffer.from('ENCv1:');
  return {
    isEncryptionAvailable: () => available,
    encryptString: text => Buffer.concat([prefix, Buffer.from(text, 'utf8').map(b => b ^ 0x5a)]),
    decryptString: buf => Buffer.from(buf.subarray(prefix.length)).map(b => b ^ 0x5a).toString('utf8'),
  };
}

test('workbench-accounts covers exact 17 retained Dingtu + Cockpit apps, drops 9 excluded apps, and encrypts vault without plaintext secrets on disk', async () => {
  const expected17 = [
    'antigravity', 'codex', 'codex-desktop', 'claude-code', 'claude-desktop', 'claude',
    'cursor', 'copilot', 'windsurf', 'kiro', 'grok-cli', 'grok',
    'gemini-cli', 'metamuse', 'chatgpt', 'gemini-web', 'manus',
  ];
  assert.equal(SUPPORTED_WORKBENCH_APPS.length, 18); // 17 core apps + canonical codex-cli alias
  for (const required of expected17) {
    assert.ok(SUPPORTED_WORKBENCH_APPS.includes(required), `Missing ${required}`);
  }
  for (const dropped of ['trae', 'traework', 'trae-cn', 'traework-cn', 'codebuddy', 'codebuddy-cn', 'qoder', 'zed', 'zcode']) {
    assert.equal(SUPPORTED_WORKBENCH_APPS.includes(dropped), false, `Dropped app still present: ${dropped}`);
  }

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'dingtu-wb-acct-'));
  try {
    const homeDir = path.join(tmp, 'home');
    const vaultPath = path.join(tmp, 'vault.bin');
    mkdirSync(path.join(homeDir, '.codex'), { recursive: true });
    writeFileSync(path.join(homeDir, '.codex', 'auth.json'), JSON.stringify({
      tokens: {
        access_token: 'sk-secret-codex-token-123',
        id_token: makeJwt({ email: 'alpha@dingtu.test', 'https://api.openai.com/auth': { chatgpt_plan_type: 'pro' } }),
      },
    }));

    const mgr = createWorkbenchAccountManager({
      platform: 'windows',
      filePath: vaultPath,
      safeStorage: fakeSafeStorage(true),
      homeDir,
    });

    const imported = await mgr.importLocal({ appId: 'codex', alias: 'main' });
    assert.equal(imported.importedCount, 1);
    assert.equal(imported.account.appId, 'codex');
    assert.equal(imported.account.email, 'alpha@dingtu.test');
    assert.equal(imported.account.plan, 'pro');
    assert.equal(imported.account.isActive, true);
    assert.doesNotMatch(JSON.stringify(imported), /sk-secret-codex-token-123/);

    const diskText = readFileSync(vaultPath, 'utf8');
    assert.doesNotMatch(diskText, /alpha@dingtu\.test|sk-secret-codex-token-123/);

    // Unavailable encryption must fail closed without creating plaintext fallback
    const brokenMgr = createWorkbenchAccountManager({
      platform: 'windows',
      filePath: path.join(tmp, 'broken-vault.bin'),
      safeStorage: fakeSafeStorage(false),
      homeDir,
    });
    assert.throws(() => brokenMgr.add({ appId: 'cursor', alias: 'main', email: 'test@example.com' }), { code: 'SECURE_STORE_UNAVAILABLE' });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('importLocal handles claude-code, cursor, gemini-cli, and atomic file switch backs up previous credentials', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'dingtu-wb-switch-'));
  try {
    const homeDir = path.join(tmp, 'home');
    const appDataDir = path.join(tmp, 'appdata');
    const vaultPath = path.join(tmp, 'vault.bin');
    mkdirSync(path.join(homeDir, '.codex'), { recursive: true });
    mkdirSync(path.join(homeDir, '.claude'), { recursive: true });
    mkdirSync(path.join(homeDir, '.gemini'), { recursive: true });
    mkdirSync(path.join(appDataDir, 'Cursor', 'User', 'globalStorage'), { recursive: true });

    const codexAuthFile = path.join(homeDir, '.codex', 'auth.json');
    const accountAPayload = JSON.stringify({
      tokens: {
        access_token: 'token-account-a',
        id_token: makeJwt({ email: 'a@example.com', chatgpt_plan_type: 'plus' }),
      },
    });
    writeFileSync(codexAuthFile, accountAPayload);

    const mgr = createWorkbenchAccountManager({
      platform: 'windows',
      filePath: vaultPath,
      safeStorage: fakeSafeStorage(true),
      homeDir,
      appDataDir,
    });
    await mgr.importLocal({ appId: 'codex', alias: 'acct-a' });

    const accountBPayload = JSON.stringify({
      tokens: {
        access_token: 'token-account-b',
        id_token: makeJwt({ email: 'b@example.com', chatgpt_plan_type: 'team' }),
      },
    });
    writeFileSync(codexAuthFile, accountBPayload);
    await mgr.importLocal({ appId: 'codex', alias: 'acct-b' });

    // Switch back from acct-b to acct-a (note activeByApp started at acct-a, so first switch to acct-b then back to acct-a)
    const toB = mgr.switchAccount({ appId: 'codex', accountId: 'acct-b' });
    assert.equal(toB.activeAccountId, 'acct-b');
    assert.equal(toB.switchedLocalFile, true);
    assert.equal(JSON.parse(readFileSync(codexAuthFile, 'utf8')).tokens.access_token, 'token-account-b');

    // Simulate token rotation on disk while acct-b is active, then switch to acct-a
    writeFileSync(codexAuthFile, JSON.stringify({
      tokens: { access_token: 'token-account-b-refreshed', id_token: makeJwt({ email: 'b@example.com' }) },
    }));
    const toA = mgr.switchAccount({ appId: 'codex', accountId: 'acct-a' });
    assert.equal(toA.activeAccountId, 'acct-a');
    assert.equal(JSON.parse(readFileSync(codexAuthFile, 'utf8')).tokens.access_token, 'token-account-a');

    // Switching back to acct-b must restore its backed-up refreshed token!
    mgr.switchAccount({ appId: 'codex', accountId: 'acct-b' });
    assert.equal(JSON.parse(readFileSync(codexAuthFile, 'utf8')).tokens.access_token, 'token-account-b-refreshed');

    // Import Claude Code + Gemini CLI + Cursor fallback JSON
    writeFileSync(path.join(homeDir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'cc@example.com', billingType: 'max' } }));
    writeFileSync(path.join(homeDir, '.claude', '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'sk-ant-oauth-secret', subscriptionType: 'max' } }));
    writeFileSync(path.join(homeDir, '.gemini', 'google_accounts.json'), JSON.stringify({ active: 'gem@example.com' }));
    writeFileSync(path.join(appDataDir, 'Cursor', 'User', 'globalStorage', 'storage.json'), JSON.stringify({ 'cursorAuth/cachedEmail': 'cur@example.com', 'cursorAuth/stripeMembershipType': 'pro' }));

    const bulk = await mgr.importLocal({ all: true });
    assert.ok(bulk.importedCount >= 3);
    const listed = mgr.list().accounts;
    assert.ok(listed.some(a => a.appId === 'claude-code' && a.email === 'cc@example.com'));
    assert.ok(listed.some(a => a.appId === 'gemini-cli' && a.email === 'gem@example.com'));
    assert.ok(listed.some(a => a.appId === 'cursor' && a.email === 'cur@example.com' && a.plan === 'pro'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('refreshQuota fetches real Anthropic & Codex usage when OAuth exists and degrades honestly on failure without fake numbers', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'dingtu-wb-quota-'));
  try {
    const homeDir = path.join(tmp, 'home');
    mkdirSync(path.join(homeDir, '.codex'), { recursive: true });
    mkdirSync(path.join(homeDir, '.claude'), { recursive: true });
    writeFileSync(path.join(homeDir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'cc@example.com' } }));
    writeFileSync(path.join(homeDir, '.claude', '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'cc-tok-1' } }));
    writeFileSync(path.join(homeDir, '.codex', 'auth.json'), JSON.stringify({
      tokens: { access_token: 'cx-tok-1', id_token: makeJwt({ email: 'cx@example.com' }) },
    }));

    let failUpstream = false;
    const mgr = createWorkbenchAccountManager({
      platform: 'windows',
      filePath: path.join(tmp, 'vault.bin'),
      safeStorage: fakeSafeStorage(true),
      homeDir,
      environmentModeProvider: () => 'own_network',
      fetchImpl: async url => {
        if (failUpstream) return { ok: false, status: 503, json: async () => ({}) };
        if (url.includes('anthropic.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              five_hour: { utilization: 25, resets_at: '2026-11-22T15:00:00Z' },
              seven_day: { utilization: 85, resets_at: '2026-11-28T00:00:00Z' },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            plan_type: 'pro',
            rate_limit: {
              primary_window: { used_percent: 40, reset_after_seconds: 1800 },
              secondary_window: { used_percent: 10, reset_after_seconds: 86400 },
            },
          }),
        };
      },
    });

    await mgr.importLocal({ appId: 'claude-code', alias: 'main' });
    await mgr.importLocal({ appId: 'codex', alias: 'main' });
    mgr.add({ appId: 'metamuse', alias: 'main', label: 'Meta Muse 容器' });

    const synced = await mgr.refreshQuota();
    assert.equal(synced.refreshedCount, 2);
    const cc = synced.accounts.find(a => a.appId === 'claude-code');
    assert.equal(cc.quotaState, 'synced');
    assert.equal(cc.quotas[0].remainingPct, 75);
    assert.equal(cc.quotas[0].tone, 'high');
    assert.equal(cc.quotas[1].remainingPct, 15);
    assert.equal(cc.quotas[1].tone, 'low');

    const cx = synced.accounts.find(a => a.appId === 'codex');
    assert.equal(cx.quotaState, 'synced');
    assert.equal(cx.plan, 'pro');
    assert.equal(cx.quotas[0].remainingPct, 60);
    assert.equal(cx.quotas[1].remainingPct, 90);

    const muse = synced.accounts.find(a => a.appId === 'metamuse');
    assert.equal(muse.quotaState, 'container_ready');
    assert.deepEqual(muse.quotas, []);

    // Honest failure degradation
    failUpstream = true;
    const failedRefresh = await mgr.refreshQuota({ appId: 'claude-code' });
    assert.equal(failedRefresh.refreshedCount, 0);
    assert.equal(failedRefresh.accounts[0].quotaState, 'refresh_failed');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('antigravity switch writes Windows cred store, metadata/batchRemove/exportJson/importJson work, and RFC 6238 TOTP vault encrypts secrets', async () => {
  const rfc6238 = generateTotpCode({ secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', algorithm: 'SHA1', digits: 6, period: 30 }, 59_000);
  assert.equal(rfc6238.code, '287082');
  assert.equal(rfc6238.remainingSeconds, 1);

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'dingtu-wb-v2-'));
  try {
    const homeDir = path.join(tmp, 'home');
    const vaultPath = path.join(tmp, 'vault.bin');
    let credBlob = null;
    const execWindowsCred = async req => {
      if (req.operation === 'write') {
        credBlob = Buffer.from(req.valueB64, 'base64').toString('utf8');
        return { ok: true };
      }
      return credBlob
        ? { ok: true, found: true, valueB64: Buffer.from(credBlob, 'utf8').toString('base64') }
        : { ok: true, found: false, valueB64: null };
    };

    const mgr = createWorkbenchAccountManager({
      platform: 'windows',
      filePath: vaultPath,
      safeStorage: fakeSafeStorage(true),
      homeDir,
      appDataDir: path.join(tmp, 'appdata'),
      localAppDataDir: path.join(tmp, 'localappdata'),
      environmentModeProvider: () => 'own_network',
      execWindowsCred,
      now: () => 1795324000000,
      fetchImpl: async url => {
        if (url.includes('oauth2.googleapis.com/token')) {
          return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'ag-tok-fresh', expires_in: 3600 }) };
        }
        if (url.includes('userinfo')) {
          return { ok: true, status: 200, text: async () => JSON.stringify({ email: 'ag-main@example.com' }) };
        }
        if (url.includes('loadCodeAssist')) {
          return { ok: true, status: 200, text: async () => JSON.stringify({ paidTier: { id: 'ultra' } }) };
        }
        if (url.includes('fetchAvailableModels')) {
          return { ok: true, status: 200, text: async () => JSON.stringify({ models: { p: { displayName: 'Gemini Pro', quotaInfo: { remainingFraction: 0.95 } } } }) };
        }
        return { ok: false, status: 404, text: async () => '{}' };
      },
    });

    await mgr.importToken({
      appId: 'antigravity',
      alias: 'ag-1',
      refreshToken: '1//0refresh-one',
      email: 'one@example.com',
      plan: 'ULTRA',
      tags: ['主力', '团队A'],
      note: '主用账号',
    });
    const importedJson = mgr.importJson({
      appId: 'antigravity',
      jsonText: JSON.stringify([{
        alias: 'ag-2',
        email: 'two@example.com',
        refresh_token: '1//0refresh-two',
        plan: 'PRO',
        tags: ['备用'],
      }]),
    });
    assert.equal(importedJson.importedCount, 1);

    const switched = await mgr.switchAccount({ appId: 'antigravity', accountId: 'ag-2' });
    assert.equal(switched.switchedLocalFile, true);
    assert.equal(switched.activeAccountId, 'ag-2');
    assert.match(credBlob || '', /1\/\/0refresh-two/);

    const updatedMeta = mgr.updateMeta({
      appId: 'antigravity',
      accountId: 'ag-1',
      tags: ['高配额', '高配额', 'VIP'],
      note: '已更新备注',
    });
    assert.deepEqual(updatedMeta.account.tags, ['高配额', 'VIP']);
    assert.equal(updatedMeta.account.note, '已更新备注');

    const exported = mgr.exportJson({ appId: 'antigravity' });
    assert.equal(exported.count, 2);
    assert.doesNotMatch(exported.jsonText, /1\/\/0refresh-one|1\/\/0refresh-two|ag-tok-fresh/);

    const computed = mgr.totpCompute({ input: 'JBSWY3DPEHPK3PXP' });
    assert.match(computed.result.code, /^\d{6}$/);
    const savedTotp = mgr.totpSave({ input: 'otpauth://totp/Dingtu:dev@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Dingtu', name: 'Dev 2FA' });
    assert.equal(savedTotp.saved.length, 1);
    assert.equal(savedTotp.saved[0].name, 'Dev 2FA');

    const vaultDisk = readFileSync(vaultPath, 'utf8');
    assert.doesNotMatch(vaultDisk, /JBSWY3DPEHPK3PXP|1\/\/0refresh-two/);

    const exportedTotp = mgr.totpExport();
    assert.equal(exportedTotp.count, 1);
    assert.doesNotMatch(exportedTotp.jsonText, /JBSWY3DPEHPK3PXP/);

    const removedBatch = mgr.batchRemove({ appId: 'antigravity', accountIds: ['ag-2'] });
    assert.equal(removedBatch.removedCount, 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('workbench-accounts supports auto-reprobe, multi-app quota APIs, SQLite/dual-file switches, groups, settings, and totp migration QR', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'dingtu-wb-parity-'));
  try {
    const homeDir = path.join(tmp, 'home');
    const appDataDir = path.join(tmp, 'appdata');
    const vaultPath = path.join(tmp, 'vault.bin');

    // Windsurf state.vscdb
    const wsStorage = path.join(appDataDir, 'Windsurf', 'User', 'globalStorage');
    mkdirSync(wsStorage, { recursive: true });
    const wsDb = new DatabaseSync(path.join(wsStorage, 'state.vscdb'));
    wsDb.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)');
    wsDb.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run('windsurfAuthStatus', JSON.stringify({
      email: 'ws@example.com',
      apiKey: 'ws-key-1',
      name: 'WS User',
      planName: 'Pro',
    }));
    wsDb.close();

    // Claude Code dual-file with mcpOAuth preserved
    mkdirSync(path.join(homeDir, '.claude'), { recursive: true });
    writeFileSync(path.join(homeDir, '.claude', '.credentials.json'), JSON.stringify({
      claudeAiOauth: { accessToken: 'cc-tok-1', refreshToken: 'cc-ref-1', expiresAt: Date.now() + 3600_000, subscriptionType: 'max' },
      mcpOAuth: { serverA: { token: 'preserve-me' } },
    }));
    writeFileSync(path.join(homeDir, '.claude.json'), JSON.stringify({
      numStartups: 5,
      oauthAccount: { emailAddress: 'cc-old@example.com', organizationName: 'OrgA' },
    }));

    // Gemini CLI dual-file (object-style active field)
    mkdirSync(path.join(homeDir, '.gemini'), { recursive: true });
    writeFileSync(path.join(homeDir, '.gemini', 'google_accounts.json'), JSON.stringify({ active: { email: 'gem@example.com' }, old: [] }));
    writeFileSync(path.join(homeDir, '.gemini', 'oauth_creds.json'), JSON.stringify({ access_token: 'gem-tok-1', refresh_token: '1//0gem' }));

    // Grok CLI auth preserving apiKey/baseUrl
    mkdirSync(path.join(homeDir, '.grok'), { recursive: true });
    writeFileSync(path.join(homeDir, '.grok', 'auth.json'), JSON.stringify({ email: 'grok@example.com', accessToken: 'gk-tok-1', apiKey: 'xai-user-key', baseUrl: 'https://api.x.ai/v1' }));

    // Kiro AWS SSO cache
    mkdirSync(path.join(homeDir, '.aws', 'sso', 'cache'), { recursive: true });
    writeFileSync(path.join(homeDir, '.aws', 'sso', 'cache', 'kiro-auth-token.json'), JSON.stringify({
      accessToken: 'kiro-tok-1',
      refreshToken: 'kiro-ref-1',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      region: 'us-east-1',
      authMethod: 'IdC',
    }));

    let sawCodexAcctHeader = null;
    const mgr = createWorkbenchAccountManager({
      platform: 'windows',
      filePath: vaultPath,
      safeStorage: fakeSafeStorage(true),
      homeDir,
      appDataDir,
      environmentModeProvider: () => 'own_network',
      fetchImpl: async (url, init = {}) => {
        if (url.includes('cursor.com/api/usage-summary')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              membershipType: 'pro',
              individualUsage: {
                plan: { enabled: true, used: 120, limit: 500, remaining: 380, totalPercentUsed: 24, apiPercentUsed: 10, autoPercentUsed: 30 },
                onDemand: { enabled: true, used: 5, limit: 100, remaining: 95 },
              },
              billingCycleEnd: '2026-12-01T00:00:00Z',
            }),
          };
        }
        if (url.includes('GetUserStatus')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              userStatus: {
                email: 'ws@example.com',
                planStatus: {
                  planInfo: { planName: 'Pro', monthlyPromptCredits: 500, monthlyFlowCredit: 1000 },
                  availablePromptCredits: 400,
                  availableFlowCredits: 750,
                  planEnd: '2026-12-01T00:00:00Z',
                },
              },
            }),
          };
        }
        if (url.includes('GetUsageLimits') || url.includes('codewhisperer')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              subscriptionInfo: { subscriptionTitle: 'KIRO PRO' },
              nextDateReset: Math.floor(Date.now() / 1000) + 86400,
              usageBreakdownList: [
                { displayName: 'Vibe', usageLimit: 100, currentUsage: 20 },
              ],
            }),
          };
        }
        if (url.includes('claude.ai/api/organizations') && !url.includes('/usage')) {
          return { ok: true, status: 200, json: async () => ([{ uuid: 'org-1', name: 'Personal', capabilities: ['pro'] }]) };
        }
        if (url.includes('claude.ai/api/organizations/org-1/usage')) {
          return { ok: true, status: 200, json: async () => ({ five_hour: { utilization: 15, resets_at: '2026-11-22T15:00:00Z' }, seven_day: { utilization: 40, resets_at: '2026-11-29T00:00:00Z' } }) };
        }
        if (url.includes('chatgpt.com/backend-api/wham/usage')) {
          sawCodexAcctHeader = init.headers?.['ChatGPT-Account-Id'] || null;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              plan_type: 'pro',
              rate_limit: { primary_window: { used_percent: 10, reset_after_seconds: 1200 }, secondary_window: { used_percent: 5, reset_after_seconds: 86400 } },
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      },
    });

    // Stale placeholder slot auto-reprobes Windsurf DB & fetches GetUserStatus
    mgr.add({ appId: 'windsurf', alias: 'main', label: '本机已登录会话' });
    const wsRefresh = await mgr.refreshQuota({ appId: 'windsurf', accountId: 'main' });
    const wsAcct = wsRefresh.accounts.find(a => a.appId === 'windsurf');
    assert.equal(wsAcct.email, 'ws@example.com');
    assert.equal(wsAcct.quotaState, 'synced');
    assert.equal(wsAcct.quotas.length >= 2, true);

    // Cursor 4-metric cookie summary
    mgr.upsertAuthorizedAccount({ appId: 'cursor', alias: 'cur-1', label: 'cur@example.com', email: 'cur@example.com', plan: 'PRO', source: 'manual', extraMeta: { sessionCookie: 'user_1::jwt_cur' } });
    const curRef = await mgr.refreshQuota({ appId: 'cursor', accountId: 'cur-1' });
    const curAcct = curRef.accounts.find(a => a.appId === 'cursor');
    assert.equal(curAcct.quotaState, 'synced');
    assert.equal(curAcct.quotas.length, 4);

    // Claude Desktop web usage via sessionKey cookie
    mgr.upsertAuthorizedAccount({ appId: 'claude-desktop', alias: 'cd-1', label: 'cd@example.com', email: 'cd@example.com', plan: 'PRO', extraMeta: { sessionCookie: 'sk-ant-sid01-test' } });
    const cdRef = await mgr.refreshQuota({ appId: 'claude-desktop', accountId: 'cd-1' });
    assert.equal(cdRef.accounts.find(a => a.appId === 'claude-desktop').quotas[0].remainingPct, 85);

    // Codex with ChatGPT-Account-Id
    mgr.upsertAuthorizedAccount({ appId: 'codex', alias: 'cx-1', label: 'cx@example.com', email: 'cx@example.com', oauthToken: 'tok-cx', extraMeta: { accountId: 'org-cx-777' } });
    await mgr.refreshQuota({ appId: 'codex', accountId: 'cx-1' });
    assert.equal(sawCodexAcctHeader, 'org-cx-777');

    // Kiro GetUsageLimits
    await mgr.importLocal({ appId: 'kiro', alias: 'main' });
    const kiroRef = await mgr.refreshQuota({ appId: 'kiro', accountId: 'main' });
    assert.equal(kiroRef.accounts.find(a => a.appId === 'kiro').quotas[0].remainingPct, 80);

    // Claude Code switch preserves mcpOAuth and other keys in .claude.json
    await mgr.importLocal({ appId: 'claude-code', alias: 'cc-1' });
    mgr.upsertAuthorizedAccount({ appId: 'claude-code', alias: 'cc-2', email: 'cc-new@example.com', label: 'cc-new@example.com', oauthToken: 'cc-tok-2', refreshToken: 'cc-ref-2' });
    await mgr.switchAccount({ appId: 'claude-code', accountId: 'cc-2' });
    const afterCc = JSON.parse(readFileSync(path.join(homeDir, '.claude', '.credentials.json'), 'utf8'));
    assert.equal(afterCc.mcpOAuth.serverA.token, 'preserve-me');
    assert.equal(afterCc.claudeAiOauth.accessToken, 'cc-tok-2');
    const afterClaudeJson = JSON.parse(readFileSync(path.join(homeDir, '.claude.json'), 'utf8'));
    assert.equal(afterClaudeJson.numStartups, 5);
    assert.equal(afterClaudeJson.oauthAccount.emailAddress, 'cc-new@example.com');

    // Gemini CLI dual-file switch preserves object-shaped active cleanly
    await mgr.importLocal({ appId: 'gemini-cli', alias: 'gem-1' });
    mgr.upsertAuthorizedAccount({ appId: 'gemini-cli', alias: 'gem-2', email: 'gem2@example.com', label: 'gem2@example.com', oauthToken: 'gem-tok-2', refreshToken: '1//0gem2' });
    await mgr.switchAccount({ appId: 'gemini-cli', accountId: 'gem-2' });
    const afterGemAcc = JSON.parse(readFileSync(path.join(homeDir, '.gemini', 'google_accounts.json'), 'utf8'));
    assert.equal(afterGemAcc.active.email, 'gem2@example.com');

    // Grok CLI switch preserves apiKey & baseUrl
    await mgr.importLocal({ appId: 'grok-cli', alias: 'gk-1' });
    mgr.upsertAuthorizedAccount({ appId: 'grok-cli', alias: 'gk-2', email: 'gk2@example.com', label: 'gk2@example.com', oauthToken: 'gk-tok-2' });
    await mgr.switchAccount({ appId: 'grok-cli', accountId: 'gk-2' });
    const afterGk = JSON.parse(readFileSync(path.join(homeDir, '.grok', 'auth.json'), 'utf8'));
    assert.equal(afterGk.apiKey, 'xai-user-key');
    assert.equal(afterGk.accessToken, 'gk-tok-2');

    // Groups CRUD + Assign + Settings + TOTP migration payload + QR roundtrip
    const gSave = mgr.groupsSave({ name: '主力池', color: '#2563eb' });
    const gid = gSave.groups[0].id;
    mgr.groupsAssign({ groupId: gid, appId: 'cursor', accountId: 'cur-1', member: true });
    assert.ok(mgr.list('cursor').accounts[0].groups.includes(gid));
    const sett = mgr.settingsUpdate({ autoRefreshMinutes: 30, customDataDir: { appId: 'antigravity', dirPath: 'D:\\ag-custom' } });
    assert.equal(sett.autoRefreshMinutes, 30);
    assert.equal(sett.customDataDirs.antigravity, 'D:\\ag-custom');

    const tSave = mgr.totpSave({ input: 'otpauth://totp/Dingtu:mig@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Dingtu', name: 'Mig' });
    const tid = tSave.saved[0].id;
    const migPayload = mgr.totpMigrationPayload({ ids: [tid] });
    const migUri = totpQrApi.encodeOtpAuthMigration(migPayload.entries);
    assert.match(migUri, /^otpauth-migration:\/\/offline\?data=/);
    const decodedMig = totpQrApi.decodeOtpAuthMigration(migUri);
    assert.equal(decodedMig.length, 1);
    assert.equal(decodedMig[0].secret, 'JBSWY3DPEHPK3PXP');

    // Persisted legacy placeholder '本机已登录会话' hydrates to real email on load/list
    const hydHome = path.join(tmp, 'hydrate-home');
    mkdirSync(path.join(hydHome, '.gemini', 'antigravity'), { recursive: true });
    writeFileSync(
      path.join(hydHome, '.gemini', 'antigravity', 'active-account.json'),
      JSON.stringify({ email: 'hydrated@example.com', accountId: 'main' }),
      'utf8',
    );
    const ss = fakeSafeStorage();
    const hydVault = path.join(tmp, 'hydrate-vault.bin');
    writeFileSync(
      hydVault,
      ss.encryptString(JSON.stringify({
        version: 1,
        accounts: [{
          id: 'main',
          appId: 'antigravity',
          label: '本机已登录会话',
          email: null,
          plan: 'FREE',
          source: 'local-import',
          quotas: [],
        }],
        activeByApp: { antigravity: 'main' },
      })),
    );
    const hydMgr = createWorkbenchAccountManager({
      platform: 'windows',
      homeDir: hydHome,
      appDataDir: hydHome,
      filePath: hydVault,
      safeStorage: ss,
      execWindowsCred: async () => ({ ok: true, found: false }),
      launcher: { inspect: async () => ({ status: 'installed', path: 'C:\\Antigravity.exe' }) },
    });
    const hydList = hydMgr.list('antigravity');
    assert.equal(hydList.accounts[0].email, 'hydrated@example.com');
    assert.equal(hydList.accounts[0].label, 'hydrated@example.com');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('switchAccount blocks Codex & Antigravity cross-account snapshot contamination, self-heals mismatched snapshot, verifies read-back, and syncs app_storage.json', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'dingtu-accts-guard-'));
  try {
    const homeDir = path.join(tmp, 'home');
    const appDataDir = path.join(tmp, 'appdata');
    const codexDir = path.join(homeDir, '.codex');
    const codexAuthPath = path.join(codexDir, 'auth.json');
    const agAppStoragePath = path.join(appDataDir, 'Antigravity', 'app_storage.json');
    mkdirSync(codexDir, { recursive: true });
    mkdirSync(path.dirname(agAppStoragePath), { recursive: true });
    writeFileSync(agAppStoragePath, JSON.stringify({
      hubSurfaceBackgroundColor: '#FFFFFF',
      'agy.onboarding.lastLoginUsername': 'stale-ag@example.com',
    }, null, 2), 'utf8');

    let storedAgCred = null;
    const mockWinCred = async req => {
      if (req.operation === 'write') {
        storedAgCred = Buffer.from(req.valueB64, 'base64').toString('utf8');
        return { ok: true };
      }
      if (!storedAgCred) return { ok: true, found: false, valueB64: null };
      return { ok: true, found: true, valueB64: Buffer.from(storedAgCred, 'utf8').toString('base64') };
    };

    const jwtAlpha = makeJwt({ email: 'alpha@dingtu.test', sub: 'user-alpha', 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-alpha' } });
    const jwtBeta = makeJwt({ email: 'beta@dingtu.test', sub: 'user-beta', 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-beta' } });
    const jwtGamma = makeJwt({ email: 'gamma@dingtu.test', sub: 'user-gamma', 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-gamma' } });

    const bufAlpha = Buffer.from(JSON.stringify({ auth_mode: 'chatgpt', OPENAI_API_KEY: null, tokens: { id_token: jwtAlpha, access_token: 'tok-alpha', refresh_token: 'ref-alpha', account_id: 'acct-alpha' } }), 'utf8');
    const bufBeta = Buffer.from(JSON.stringify({ auth_mode: 'chatgpt', OPENAI_API_KEY: null, tokens: { id_token: jwtBeta, access_token: 'tok-beta', refresh_token: 'ref-beta', account_id: 'acct-beta' } }), 'utf8');

    // Disk currently holds BETA even though activeByApp points to ALPHA (external switch / interrupted switch scenario)
    writeFileSync(codexAuthPath, bufBeta);

    const vaultPath = path.join(tmp, 'vault.bin');
    const ss = fakeSafeStorage();
    writeFileSync(vaultPath, ss.encryptString(JSON.stringify({
      version: 1,
      accounts: [
        {
          id: 'acct-alpha',
          appId: 'codex',
          email: 'alpha@dingtu.test',
          label: 'alpha@dingtu.test',
          oauthToken: 'tok-alpha',
          refreshToken: 'ref-alpha',
          idToken: jwtAlpha,
          extraMeta: { accountId: 'acct-alpha' },
          snapshot: { kind: 'file', targetPath: codexAuthPath, payloadBase64: bufAlpha.toString('base64') },
          quotas: [],
        },
        {
          id: 'acct-beta',
          appId: 'codex',
          email: 'beta@dingtu.test',
          label: 'beta@dingtu.test',
          oauthToken: 'tok-beta',
          refreshToken: 'ref-beta',
          idToken: jwtBeta,
          extraMeta: { accountId: 'acct-beta' },
          // Historically poisoned snapshot holding ALPHA's payload while oauthToken/idToken belong to BETA
          snapshot: { kind: 'file', targetPath: codexAuthPath, payloadBase64: bufAlpha.toString('base64') },
          quotas: [],
        },
        {
          id: 'acct-poisoned',
          appId: 'codex',
          email: 'gamma@dingtu.test',
          label: 'gamma@dingtu.test',
          oauthToken: 'tok-poison',
          refreshToken: 'ref-poison',
          idToken: jwtAlpha, // Contradicts target email gamma@dingtu.test
          extraMeta: { accountId: 'acct-alpha' },
          snapshot: { kind: 'file', targetPath: codexAuthPath, payloadBase64: bufAlpha.toString('base64') },
          quotas: [],
        },
        {
          id: 'acct-gamma',
          appId: 'codex',
          email: 'gamma@dingtu.test',
          label: 'gamma@dingtu.test',
          oauthToken: 'tok-gamma',
          refreshToken: 'ref-gamma',
          idToken: jwtGamma,
          extraMeta: { accountId: 'acct-gamma' },
          quotas: [],
        },
        {
          id: 'ag-prev',
          appId: 'antigravity',
          email: 'ag-prev@dingtu.test',
          label: 'ag-prev@dingtu.test',
          quotas: [],
        },
        {
          id: 'ag-next',
          appId: 'antigravity',
          email: 'ag-next@dingtu.test',
          label: 'ag-next@dingtu.test',
          oauthToken: 'ag-tok-next',
          refreshToken: '1//0ag-next',
          quotas: [],
        },
      ],
      activeByApp: { codex: 'acct-alpha', antigravity: 'ag-prev' },
    })));

    const mgr = createWorkbenchAccountManager({
      platform: 'windows',
      homeDir,
      appDataDir,
      filePath: vaultPath,
      safeStorage: ss,
      execWindowsCred: mockWinCred,
      launcher: { inspect: async () => ({ status: 'installed', path: 'C:\\Codex.exe' }) },
    });

    // 1) Switching ALPHA -> BETA: must NOT overwrite ALPHA snapshot with BETA from disk, AND must self-heal BETA's poisoned snapshot using BETA's clean tokens
    await mgr.switchAccount({ appId: 'codex', accountId: 'acct-beta' });
    const afterBeta = JSON.parse(readFileSync(codexAuthPath, 'utf8'));
    assert.equal(afterBeta.tokens.refresh_token, 'ref-beta');
    assert.equal(afterBeta.tokens.account_id, 'acct-beta');
    // Verify ALPHA was NOT contaminated: switch back BETA -> ALPHA restores ref-alpha
    await mgr.switchAccount({ appId: 'codex', accountId: 'acct-alpha' });
    const afterAlpha = JSON.parse(readFileSync(codexAuthPath, 'utf8'));
    assert.equal(afterAlpha.tokens.refresh_token, 'ref-alpha');
    assert.equal(afterAlpha.tokens.account_id, 'acct-alpha');

    // 2) Irreconcilable poisoned slot must reject with ACCOUNT_SWITCH_FAILED without overwriting ~/.codex/auth.json
    assert.throws(
      () => mgr.switchAccount({ appId: 'codex', accountId: 'acct-poisoned' }),
      err => err.code === 'ACCOUNT_SWITCH_FAILED' && /不一致/.test(err.message),
    );
    const stillAlpha = JSON.parse(readFileSync(codexAuthPath, 'utf8'));
    assert.equal(stillAlpha.tokens.refresh_token, 'ref-alpha');

    // 3) Valid slot GAMMA writes cleanly and verifies read-back
    await mgr.switchAccount({ appId: 'codex', accountId: 'acct-gamma' });
    const afterGamma = JSON.parse(readFileSync(codexAuthPath, 'utf8'));
    assert.equal(afterGamma.tokens.refresh_token, 'ref-gamma');

    // 4) Antigravity switch must NOT backfill ag-prev with mismatched disk credential AND must sync app_storage.json
    storedAgCred = JSON.stringify({
      token: { access_token: 'wrong-access', refresh_token: '1//0wrong-owner', token_type: 'Bearer', expiry: '2026-12-01T00:00:00.000Z' },
      id_token_email: 'someone-else@dingtu.test',
    });
    await mgr.switchAccount({ appId: 'antigravity', accountId: 'ag-next' });
    const syncedAppStorage = JSON.parse(readFileSync(agAppStoragePath, 'utf8'));
    assert.equal(syncedAppStorage['agy.onboarding.lastLoginUsername'], 'ag-next@dingtu.test');
    assert.equal(syncedAppStorage.hubSurfaceBackgroundColor, '#FFFFFF');
    // Switching back to ag-prev (which had no refreshToken) must NOT carry 1//0wrong-owner over
    storedAgCred = null;
    await mgr.switchAccount({ appId: 'antigravity', accountId: 'ag-prev' });
    assert.equal(storedAgCred, null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
