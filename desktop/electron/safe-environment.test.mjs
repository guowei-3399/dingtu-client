import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCAL_HTTP_PROXY,
  REMOTE_SOCKS5H_PROXY,
  isValidIanaTimezone,
  normalizeLocaleTag,
  normalizeExitGeoContext,
  resolveInstanceProfileDir,
  buildSafeLaunchAugmentation,
} from './safe-environment.mjs';

test('normalizeExitGeoContext validates IANA timezones, derives canonical locales, and rejects injection', () => {
  const us = normalizeExitGeoContext({ countryCode: 'us', timezone: 'America/Los_Angeles' });
  assert.deepEqual(us, {
    countryCode: 'US',
    timezone: 'America/Los_Angeles',
    locale: 'en-US',
    posixLang: 'en_US.UTF-8',
    acceptLanguage: 'en-US,en;q=0.9',
    regionLabel: null,
  });

  const jp = normalizeExitGeoContext({
    countryCode: 'JP',
    timezone: 'Asia/Tokyo',
    locale: 'ja-JP',
    regionLabel: '日本 · 东京',
  });
  assert.equal(jp.locale, 'ja-JP');
  assert.equal(jp.posixLang, 'ja_JP.UTF-8');
  assert.equal(jp.regionLabel, '日本 · 东京');
  assert.equal(isValidIanaTimezone('America/Los_Angeles'), true);
  assert.equal(normalizeLocaleTag('en-US'), 'en-US');

  assert.throws(() => normalizeExitGeoContext({ countryCode: 'US', timezone: 'Mars/Olympus_Mons' }), { code: 'SAFE_ENV_TIMEZONE_INVALID' });
  assert.throws(() => normalizeExitGeoContext({ countryCode: 'US', timezone: 'America/New_York; evil' }), { code: 'SAFE_ENV_TIMEZONE_INVALID' });
  assert.throws(() => normalizeExitGeoContext({ countryCode: 'USA', timezone: 'America/New_York' }), { code: 'SAFE_ENV_GEO_INVALID' });
  assert.throws(() => normalizeExitGeoContext({ countryCode: 'US', timezone: 'America/New_York', secret: 'leak' }), { code: 'SAFE_ENV_GEO_INVALID' });
});

test('buildSafeLaunchAugmentation injects basic 17899 proxy and isolated profile dir without fingerprint spoofing', () => {
  const profileDir = resolveInstanceProfileDir({
    rootDir: 'C:\\Users\\Demo\\AppData\\Roaming\\dingtu',
    scope: 'device-uuid-1',
    appId: 'cursor',
    instanceId: 'cursor-1',
  });
  const aug = buildSafeLaunchAugmentation({
    mode: 'safe_tunnel',
    adapter: 'electron-launch',
    appId: 'cursor',
    profileDir,
    relayEndpoint: { protocol: 'openai', baseUrl: 'https://relay.noyapi.cn/v1/' },
  });
  assert.equal(LOCAL_HTTP_PROXY, 'http://127.0.0.1:17899');
  assert.equal(aug.envPatch.ALL_PROXY, REMOTE_SOCKS5H_PROXY);
  assert.equal(aug.envPatch.HTTP_PROXY, 'http://127.0.0.1:17899');
  assert.equal(aug.envPatch.NO_PROXY, '127.0.0.1,localhost,::1');
  assert.equal(aug.envPatch.no_proxy, '127.0.0.1,localhost,::1');
  assert.equal(aug.envPatch.TZ, undefined);
  assert.equal(aug.envPatch.LANG, undefined);
  assert.equal(aug.envPatch.LC_ALL, undefined);
  assert.equal(aug.envPatch.OPENAI_BASE_URL, 'https://relay.noyapi.cn/v1');
  assert.ok(aug.extraArgs.includes('--proxy-server=http://127.0.0.1:17899'));
  assert.ok(!aug.extraArgs.some(arg => arg.startsWith('--host-resolver-rules=')));
  assert.ok(!aug.extraArgs.some(arg => arg.startsWith('--lang=')));
  assert.ok(aug.extraArgs.some(arg => arg.startsWith('--user-data-dir=') && arg.includes('workbench-profiles')));

  const ownMode = buildSafeLaunchAugmentation({
    mode: 'own_network',
    adapter: 'env-launch',
    appId: 'claude-code',
    profileDir: '/tmp/claude-1',
    relayEndpoint: { protocol: 'anthropic', baseUrl: 'https://relay.noyapi.cn/anthropic' },
  });
  assert.equal(ownMode.envPatch.HTTP_PROXY, undefined);
  assert.equal(ownMode.envPatch.TZ, undefined);
  assert.equal(ownMode.envPatch.CLAUDE_CONFIG_DIR, '/tmp/claude-1');
  assert.equal(ownMode.envPatch.ANTHROPIC_BASE_URL, 'https://relay.noyapi.cn/anthropic');
  assert.ok(ownMode.stripEnvKeys.includes('HTTP_PROXY'));
  assert.ok(ownMode.stripEnvKeys.includes('ALL_PROXY'));
  assert.ok(ownMode.stripEnvKeys.includes('NO_PROXY'));
  assert.ok(ownMode.stripEnvKeys.includes('no_proxy'));

  assert.throws(
    () => buildSafeLaunchAugmentation({ mode: 'strong_tun', adapter: 'electron-launch', appId: 'cursor', profileDir }),
    { code: 'SAFE_ENV_MODE_INVALID' },
  );
});
