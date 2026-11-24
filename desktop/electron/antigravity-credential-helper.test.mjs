import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ANTIGRAVITY_WINDOWS_TARGET,
  ANTIGRAVITY_WINDOWS_USERNAME,
  buildAntigravityCredentialJson,
  buildWindowsPowerShellScript,
  parseAntigravityCredentialJson,
  readAntigravityCredential,
  writeAntigravityCredential,
} from './antigravity-credential-helper.mjs';

test('antigravity credential helper enforces allowlist target and 2560-byte cap and syncs Windows cred + fallback files', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'dingtu-ag-cred-'));
  try {
    const homeDir = path.join(tmp, 'home');
    const appDataDir = path.join(tmp, 'appdata');
    mkdirSync(path.join(homeDir, '.gemini'), { recursive: true });

    let storedCred = null;
    const mockExec = async req => {
      assert.equal(req.target, ANTIGRAVITY_WINDOWS_TARGET);
      if (req.operation === 'write') {
        assert.equal(req.userName, ANTIGRAVITY_WINDOWS_USERNAME);
        const decoded = Buffer.from(req.valueB64, 'base64').toString('utf8');
        assert.ok(Buffer.byteLength(decoded, 'utf8') <= 2560);
        storedCred = decoded;
        return { ok: true };
      }
      if (req.operation === 'read') {
        if (!storedCred) return { ok: true, found: false, valueB64: null };
        return { ok: true, found: true, valueB64: Buffer.from(storedCred, 'utf8').toString('base64') };
      }
      throw new Error('Unexpected op');
    };

    const writeRes = await writeAntigravityCredential({
      accessToken: 'ya29.test-access-token',
      refreshToken: '1//0test-refresh-token',
      idToken: `hdr.${Buffer.from(JSON.stringify({ email: 'ag@example.com' })).toString('base64url')}.sig`,
      expiry: '2026-12-01T00:00:00.000Z',
      email: 'ag@example.com',
      accountId: 'ag-1',
      syncCli: true,
    }, {
      platform: 'win32',
      homeDir,
      execWindowsCred: mockExec,
      now: () => 1795324000000,
    });

    assert.equal(writeRes.ok, true);
    assert.deepEqual(writeRes.writtenTargets, ['windows-credential', 'fallback-file', 'cli-file', 'active-account']);
    assert.equal(JSON.parse(storedCred).id_token_email, 'ag@example.com');

    const fallbackPath = path.join(homeDir, '.gemini', 'jetski-standalone-oauth-token');
    const cliPath = path.join(homeDir, '.gemini', 'antigravity-cli', 'antigravity-oauth-token');
    const activePath = path.join(homeDir, '.gemini', 'antigravity', 'active-account.json');
    assert.equal(existsSync(fallbackPath), true);
    assert.equal(existsSync(cliPath), true);
    assert.equal(existsSync(activePath), true);
    assert.equal(JSON.parse(readFileSync(activePath, 'utf8')).accountId, 'ag-1');
    assert.equal(JSON.parse(readFileSync(activePath, 'utf8')).email, 'ag@example.com');

    const readBack = await readAntigravityCredential({
      platform: 'win32',
      homeDir,
      appDataDir,
      execWindowsCred: mockExec,
    });
    assert.equal(readBack.found, true);
    assert.equal(readBack.source, 'windows-credential');
    assert.equal(readBack.refreshToken, '1//0test-refresh-token');
    assert.equal(readBack.email, 'ag@example.com');

    // Credential-embedded id_token_email overrides mismatched active-account.json hint
    storedCred = JSON.stringify({
      token: {
        access_token: 'ya29.wincred',
        refresh_token: '1//0wincred-refresh',
        token_type: 'Bearer',
        expiry: '2026-12-01T00:00:00.000Z',
      },
      id_token_email: 'real-cred@example.com',
    });
    writeFileSync(activePath, JSON.stringify({ accountId: 'other', email: 'stale-hint@example.com' }), 'utf8');
    const overrideRead = await readAntigravityCredential({ platform: 'win32', homeDir, appDataDir, execWindowsCred: mockExec });
    assert.equal(overrideRead.email, 'real-cred@example.com');
    assert.equal(overrideRead.activeHintEmail, 'stale-hint@example.com');

    // app_storage.json provides fallback hint when active-account.json & id_token_email are absent
    storedCred = buildAntigravityCredentialJson({ accessToken: 'tok-app', refreshToken: '1//0app' });
    rmSync(activePath, { force: true });
    mkdirSync(path.join(appDataDir, 'Antigravity'), { recursive: true });
    writeFileSync(path.join(appDataDir, 'Antigravity', 'app_storage.json'), JSON.stringify({
      'agy.onboarding.lastLoginUsername': 'app-storage@example.com',
    }), 'utf8');
    const storageHintRead = await readAntigravityCredential({ platform: 'win32', homeDir, appDataDir, execWindowsCred: mockExec });
    assert.equal(storageHintRead.email, 'app-storage@example.com');
    assert.equal(storageHintRead.activeHintEmail, 'app-storage@example.com');

    // writeAntigravityCredential updates only agy.onboarding.lastLoginUsername in existing app_storage.json
    const appStoragePath = path.join(appDataDir, 'Antigravity', 'app_storage.json');
    writeFileSync(appStoragePath, JSON.stringify({
      hubSurfaceBackgroundColor: '#FFFFFF',
      'agy.onboarding.lastLoginUsername': 'old-stale@example.com',
      projectsOrder: '["p1"]',
    }, null, 2), 'utf8');
    const syncStorageWrite = await writeAntigravityCredential({
      accessToken: 'ya29.next-token',
      refreshToken: '1//0next-refresh',
      email: 'next-ag@example.com',
      accountId: 'ag-2',
    }, {
      platform: 'win32',
      homeDir,
      appDataDir,
      execWindowsCred: mockExec,
      now: () => 1795325000000,
    });
    assert.equal(syncStorageWrite.ok, true);
    assert.ok(syncStorageWrite.writtenTargets.includes('app-storage'));
    const syncedStorage = JSON.parse(readFileSync(appStoragePath, 'utf8'));
    assert.equal(syncedStorage['agy.onboarding.lastLoginUsername'], 'next-ag@example.com');
    assert.equal(syncedStorage.hubSurfaceBackgroundColor, '#FFFFFF');
    assert.equal(syncedStorage.projectsOrder, '["p1"]');

    // Static PowerShell script uses stdin JSON rather than embedded secret interpolation
    const psScript = buildWindowsPowerShellScript();
    assert.match(psScript, /\[Console\]::In\.ReadToEnd\(\)/);
    assert.doesNotMatch(psScript, /valueB64'\s*\)/);

    // Enforce 2560-byte cap
    await assert.rejects(
      () => writeAntigravityCredential({
        accessToken: 'a'.repeat(2600),
        refreshToken: '1//0test-refresh',
      }, { platform: 'win32', homeDir, execWindowsCred: mockExec }),
      { code: 'ANTIGRAVITY_CREDENTIAL_TOO_LARGE' },
    );

    // Parses go-keyring-base64 wrapped secret cleanly
    const rawJson = buildAntigravityCredentialJson({ accessToken: 'tok', refreshToken: '1//0ref', email: 'wrapped@example.com' });
    const wrapped = `go-keyring-base64:${Buffer.from(rawJson, 'utf8').toString('base64')}`;
    const parsedWrapped = parseAntigravityCredentialJson(wrapped);
    assert.equal(parsedWrapped.refreshToken, '1//0ref');
    assert.equal(parsedWrapped.idTokenEmail, 'wrapped@example.com');

    // Falls back cleanly when Windows cred store is empty
    storedCred = null;
    writeFileSync(fallbackPath, rawJson, 'utf8');
    const fallbackRead = await readAntigravityCredential({ platform: 'win32', homeDir, appDataDir, execWindowsCred: mockExec });
    assert.equal(fallbackRead.found, true);
    assert.equal(fallbackRead.source, 'fallback-file');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
