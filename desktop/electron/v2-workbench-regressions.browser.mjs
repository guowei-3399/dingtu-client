import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Browser E2E regression for Dingtu 2.0 Cockpit-Style Workbench:
// Left sidebar (接入 + 常用接入 + 应用广场 + 我的), Cockpit overview cards & quota bars,
// single-app 账号与额度 + 一键切换, hidden background relay injection,
// dual network mode in 我的, Personal single-open/no-multi-login gate vs Enterprise multi-open/switch.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(pathToFileURL('D:/singbox/ops-integration/node_modules/playwright-core/index.mjs'));

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/api/')) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'AUTH_REQUIRED' } }));
    return;
  }
  const rel = decodeURIComponent(pathname.replace(/^\/assistant\//, '')) || 'index.html';
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
  try {
    const data = await readFile(file);
    const ext = path.extname(file);
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' })[ext] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});

server.listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/assistant/`;
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
let assertionsPassed = 0;

try {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1360, height: 920 } });
  await ctx.addInitScript(() => {
    sessionStorage.setItem('dingtu-assistant-launch-seen-v3', '1');
    window.v2Control = {
      signedIn: true,
      customerType: 'personal',
      envMode: 'safe_tunnel',
      isElevated: false,
      uacAction: 'cancel',
      proxyState: 'stopped',
      exitGeo: { countryCode: 'US', timezone: 'America/Los_Angeles', locale: 'en-US', regionLabel: 'US · Los Angeles' },
      openBrowsers: [],
      agentProfiles: [],
      lastCreatedRelayIds: [],
      groups: [],
      wakeupTasks: [],
      wakeupHistory: [],
      autoRefreshMinutes: 15,
      telemetryState: {
        lastSyncedAt: null,
        lastSyncStatus: 'idle',
        lastAcceptedBuckets: 0,
        lastAcceptedEvents: 0,
        pendingEventsCount: 2,
        lastError: null,
      },
      tickets: [],
      ticketMessages: {},
      lastTicketSnapshot: null,
      accounts: [
        {
          id: 'main',
          appId: 'claude-code',
          label: 'dev@dingtu.test',
          email: 'dev@dingtu.test',
          plan: 'Max',
          source: 'local-import',
          isActive: true,
          status: 'ready',
          quotaState: 'synced',
          quotas: [
            { id: 'five_hour', label: '5h 限额', remainingPct: 76, usedText: '76% 剩余', resetAt: new Date(Date.now() + 7200_000).toISOString(), tone: 'high' },
          ],
        },
        {
          id: 'main',
          appId: 'codex',
          label: 'codex@dingtu.test',
          email: 'codex@dingtu.test',
          plan: 'Pro',
          source: 'local-import',
          isActive: true,
          status: 'ready',
          quotaState: 'local_detected',
          quotas: [],
        },
        {
          id: 'main',
          appId: 'antigravity',
          label: 'ag-primary@dingtu.test',
          email: 'ag-primary@dingtu.test',
          plan: 'ULTRA',
          source: 'oauth',
          isActive: true,
          status: 'ready',
          quotaState: 'synced',
          quotas: [
            { id: 'gemini-pro', label: 'Gemini Pro', remainingPct: 94, usedText: '94%', resetAt: new Date(Date.now() + 3600_000).toISOString(), tone: 'high' },
            { id: 'claude-sonnet', label: 'Claude 4 Sonnet', remainingPct: 0, usedText: '0%', resetAt: new Date(Date.now() + 86400_000).toISOString(), tone: 'low' },
          ],
        },
      ],
      activeByApp: { 'claude-code': 'main', codex: 'main', antigravity: 'main' },
      closedApps: [],
      inspectedApps: [],
      startedProfiles: [],
      closeAppOverride: null,
      importLocalCalls: [],
      totpSaved: [],
      totpHistory: [],
    };
    const template = {
      status: 'verified', adapter: 'env-launch', templateRevision: 1,
      detect: { kind: 'executable', names: ['claude'] },
      launch: { kind: 'exec', argv: ['claude'], env: { HTTP_PROXY: '{{local.http}}' } },
      account: null, packageName: null, openUri: null,
      verifiedAt: '2026-11-21T00:00:00.000Z', verifiedClientVersion: '0.2.0', notes: '已验证工作台模板',
    };
    const apps = [
      { appId: 'antigravity', name: 'Antigravity', category: 'coding', featured: true, officialUrl: 'https://antigravity.google/', logo: { assetId: 'gemini', sha256: 'e'.repeat(64), mime: 'image/png' }, platforms: { windows: { ...template, adapter: 'electron-launch' } } },
      { appId: 'codex', name: 'Codex', category: 'coding', featured: true, officialUrl: 'https://github.com/openai/codex', logo: { assetId: 'openai', sha256: 'f'.repeat(64), mime: 'image/png' }, platforms: { windows: { ...template, notes: '支持独立实例隔离与自有中转站；桌面适配待验证' } } },
      { appId: 'claude-code', name: 'Claude Code', category: 'coding', featured: true, officialUrl: 'https://claude.ai/', logo: { assetId: 'claude', sha256: 'b'.repeat(64), mime: 'image/png' }, platforms: { windows: template } },
      { appId: 'cursor', name: 'Cursor', category: 'coding', featured: true, officialUrl: 'https://cursor.com/', logo: { assetId: 'cursor', sha256: 'c'.repeat(64), mime: 'image/svg+xml' }, platforms: { windows: { ...template, adapter: 'electron-launch' } } },
      { appId: 'windsurf', name: 'Windsurf', category: 'coding', featured: false, officialUrl: 'https://windsurf.com/', logo: { assetId: 'cursor', sha256: 'c'.repeat(64), mime: 'image/svg+xml' }, platforms: { windows: { ...template, adapter: 'electron-launch' } } },
      { appId: 'metamuse', name: 'Meta Muse', category: 'task', featured: true, officialUrl: 'https://muse.ai/', logo: { assetId: 'meta', sha256: 'a'.repeat(64), mime: 'image/svg+xml' }, platforms: { windows: { ...template, adapter: 'https-web', detect: null, launch: null } } },
    ];
    window.NoyaDesktop = {
      isDesktop: true,
      platform: 'windows',
      auth: {
        invoke: async op => ({ ok: true, value: { status: op === 'auth.logout' ? 'signed_out' : 'authenticated' } }),
      },
      read: async kind => {
        if (kind === 'me') {
          return {
            ok: true,
            value: {
              user: {
                id: v2Control.customerType === 'enterprise' ? 'ent-1' : 'per-1',
                email: `${v2Control.customerType}@example.com`,
                displayName: v2Control.customerType === 'enterprise' ? '定途企业管理员' : '定途个人用户',
                customerType: v2Control.customerType,
                level: 'gold',
                memberRole: v2Control.customerType === 'enterprise' ? 'owner' : null,
                role: 'customer',
                emailVerified: true,
                status: 'active',
              },
              csrfToken: null,
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
          };
        }
        if (kind === 'catalog') {
          return { ok: true, value: { data_source: 'real', catalogRevision: 8, generatedAt: '2026-11-21T00:00:00.000Z', checksum: 'd'.repeat(64), platform: 'windows', apps } };
        }
        if (kind === 'relays') {
          return {
            ok: true,
            value: {
              data_source: 'real',
              generatedAt: '2026-11-21T00:00:00.000Z',
              relays: [
                { relayId: 'dingtu-claude-cn', name: '定途自建 Anthropic 专线中转', protocol: 'anthropic', baseUrl: 'https://claude-relay.noyapi.cn', models: ['claude-sonnet-4-5'], status: 'active', notes: '' },
              ],
            },
          };
        }
        return { ok: false, error: { code: 'REQUEST_FAILED', status: 503 } };
      },
      proxy: {
        invoke: async (op, args = {}) => {
          if (op === 'proxy.environment') {
            return {
              ok: true,
              value: {
                mode: v2Control.envMode,
                tunInterface: v2Control.envMode === 'strong_tun' ? 'dingtu-tun0' : null,
                isElevated: v2Control.isElevated,
                canRelaunchElevated: !v2Control.isElevated,
                exitGeo: v2Control.envMode === 'own_network' ? null : v2Control.exitGeo,
              },
            };
          }
          if (op === 'proxy.mode.set') {
            if (args.mode === 'strong_tun' && !v2Control.isElevated) {
              return { ok: false, error: { code: 'TUN_ELEVATION_REQUIRED', message: '开启强代理 TUN 需要管理员权限，请以管理员身份重启定途。' } };
            }
            v2Control.envMode = args.mode;
            v2Control.openBrowsers = [];
            v2Control.proxyState = 'stopped';
            return {
              ok: true,
              value: {
                mode: v2Control.envMode,
                tunInterface: v2Control.envMode === 'strong_tun' ? 'dingtu-tun0' : null,
                isElevated: v2Control.isElevated,
                canRelaunchElevated: !v2Control.isElevated,
                exitGeo: v2Control.envMode === 'own_network' ? null : v2Control.exitGeo,
              },
            };
          }
          if (op === 'proxy.elevation.status') {
            return {
              ok: true,
              value: {
                isElevated: v2Control.isElevated,
                platform: 'windows',
                method: 'fltmc',
                tunInterface: 'dingtu-tun0',
                canRelaunchElevated: !v2Control.isElevated,
              },
            };
          }
          if (op === 'proxy.tun.relaunchElevated') {
            if (v2Control.uacAction === 'cancel') {
              v2Control.envMode = 'safe_tunnel';
              return { ok: true, value: { relaunching: false, cancelled: true, fallbackMode: 'safe_tunnel' } };
            }
            return { ok: true, value: { relaunching: true, cancelled: false } };
          }
          if (op === 'proxy.start') {
            if (v2Control.envMode === 'own_network') v2Control.envMode = 'safe_tunnel';
            v2Control.proxyState = 'running';
            return { ok: true, value: { state: 'running', host: '127.0.0.1', port: 17899, lastExit: null } };
          }
          if (op === 'proxy.stop') {
            v2Control.proxyState = 'stopped';
            v2Control.openBrowsers = [];
            return { ok: true, value: { state: 'stopped', host: '127.0.0.1', port: 17899, lastExit: null } };
          }
          return { ok: true, value: { state: v2Control.proxyState, host: '127.0.0.1', port: 17899, lastExit: null } };
        },
      },
      browser: {
        fingerprintCheck: async (appId, instanceId) => ({
          ok: true,
          value: {
            checkedAt: '2026-11-22T00:00:00.000Z',
            mode: v2Control.envMode,
            tunInterface: v2Control.envMode === 'strong_tun' ? 'dingtu-tun0' : null,
            tunInterfaceActive: v2Control.envMode === 'strong_tun',
            proxyReady: true,
            networkIsolationMode: v2Control.envMode === 'strong_tun'
              ? 'dingtu-tun0 内核级按进程接管 + 127.0.0.1:17899 代理 + 远端 DoH + QUIC 阻断'
              : (v2Control.envMode === 'own_network'
                ? '自有网络（系统直连）'
                : '127.0.0.1:17899 专属代理沙箱 + 远端 DNS 锁定（应用层）'),
            remoteDnsLocked: true,
            localPortScanGuard: true,
            chineseFontGuard: true,
            chineseFontMaskedVerified: true,
            geolocation: { latitude: 34.052211, longitude: -118.243705, accuracy: 35, cityLabel: 'Los Angeles' },
            exitIp: '203.0.113.88',
            countryCode: 'US',
            colo: 'LAX',
            expectedGeo: { countryCode: 'US', timezone: 'America/Los_Angeles', locale: 'en-US' },
            observedTimezone: 'America/Los_Angeles',
            observedLocale: 'en-US',
            observedLanguages: ['en-US', 'en'],
            webrtcPolicy: 'disable_non_proxied_udp',
            clientHints: {
              secChUa: '"Not/A)Brand";v="24", "Chromium";v="137", "Google Chrome";v="137"',
              platform: 'Windows',
              mobile: '?0',
              fullVersion: '137.0.0.0',
            },
            hardwareFingerprint: {
              slotKey: `${appId || 'metamuse'}:${instanceId || 'main'}`,
              slotSeedId: 'a1b2c3d4e5f6',
              gpuSummary: 'NVIDIA RTX 4060',
              hardwareConcurrency: 12,
              deviceMemory: 16,
              canvasSeed: 'c1d2e3f4',
              audioSeed: 'a9b8c7d6',
              webdriver: false,
            },
            userAgent: 'Mozilla/5.0 Chromium',
            cleanChromeUa: true,
            allGreen: true
          }
        }),
        open: async (appId, instanceId) => {
          if (!v2Control.openBrowsers.some(b => b.appId === appId && b.instanceId === instanceId)) {
            v2Control.openBrowsers.push({ appId, name: appId === 'metamuse' ? 'Meta Muse' : appId, instanceId, appShell: true, mode: v2Control.envMode, status: 'opened' });
          }
          return { ok: true, value: { appId, instanceId, status: 'opened' } };
        },
        list: async () => ({ ok: true, value: { instances: [...v2Control.openBrowsers] } }),
        close: async (appId, instanceId) => {
          v2Control.openBrowsers = v2Control.openBrowsers.filter(b => !(b.appId === appId && b.instanceId === instanceId));
          return { ok: true, value: { appId, instanceId, status: 'closed' } };
        },
      },
      agent: {
        invoke: async (op, args = {}) => {
          if (op === 'agent.list') return { ok: true, value: { profiles: [...v2Control.agentProfiles] } };
          if (op === 'agent.inspect') {
            v2Control.inspectedApps.push(args.appId || 'claude-code');
            return { ok: true, value: { appId: args.appId || 'claude-code', status: 'installed', activation: 'immediate' } };
          }
          if (op === 'agent.create') {
            v2Control.lastCreatedRelayIds.push(args.relayId || null);
            if (!v2Control.agentProfiles.some(p => p.profileId === args.alias)) {
              v2Control.agentProfiles.push({ profileId: args.alias, appId: args.appId, appName: args.appId, status: 'stopped', pid: null, activation: 'immediate', relayId: args.relayId || null });
            }
            return { ok: true, value: { profileId: args.alias, status: 'ready' } };
          }
          if (op === 'agent.start') {
            v2Control.startedProfiles.push(args.instanceId);
            const p = v2Control.agentProfiles.find(item => item.profileId === args.instanceId);
            if (p) { p.status = 'running'; p.pid = 4321; }
            return { ok: true, value: { profileId: args.instanceId, status: 'running', pid: 4321 } };
          }
          if (op === 'agent.closeApp') {
            v2Control.closedApps.push(args.appId);
            if (v2Control.closeAppOverride) {
              return { ok: true, value: { appId: args.appId, ...v2Control.closeAppOverride } };
            }
            return { ok: true, value: { appId: args.appId, closedCount: 1, forcedCount: 0, remainingCount: 0, timedOut: false } };
          }
          if (op === 'agent.isRunning') {
            const running = Boolean(v2Control.externalRunningApps?.[args.appId])
              || v2Control.agentProfiles.some(p => p.appId === args.appId && ['starting', 'running', 'stopping'].includes(p.status));
            return { ok: true, value: { appId: args.appId, running, managedRunning: false, processCount: running ? 1 : 0 } };
          }
          return { ok: true, value: {} };
        },
      },
      accounts: {
        invoke: async (op, args = {}) => {
          if (op === 'accounts.detectAll') {
            return { ok: true, value: { apps: { 'claude-code': { status: 'installed', kind: 'env-launch' }, codex: { status: 'installed', kind: 'env-launch' }, cursor: { status: 'installed', kind: 'electron-launch' }, metamuse: { status: 'container', kind: 'app-shell' } } } };
          }
          if (op === 'accounts.list') {
            const list = v2Control.accounts
              .filter(a => !args.appId || a.appId === args.appId)
              .map(a => ({ ...a, isActive: v2Control.activeByApp[a.appId] === a.id }));
            return { ok: true, value: { accounts: list, activeByApp: { ...v2Control.activeByApp } } };
          }
          if (op === 'accounts.importLocal') {
            v2Control.importLocalCalls.push({ all: Boolean(args.all), silent: Boolean(args.silent), appId: args.appId || null });
            const list = v2Control.accounts
              .filter(a => !args.appId || a.appId === args.appId)
              .map(a => ({ ...a, isActive: v2Control.activeByApp[a.appId] === a.id }));
            return {
              ok: true,
              value: {
                importedCount: 0,
                addedCount: 0,
                updatedCount: 0,
                skippedCount: list.length,
                accounts: list,
                activeByApp: { ...v2Control.activeByApp },
              },
            };
          }
          if (op === 'accounts.add') {
            const next = { id: args.alias, appId: args.appId, label: args.label || args.email || args.alias, email: args.email || null, plan: args.plan || null, source: 'manual', isActive: false, status: 'ready', quotaState: 'session_only', quotas: [] };
            v2Control.accounts.push(next);
            return { ok: true, value: { account: next } };
          }
          if (op === 'accounts.switch') {
            v2Control.activeByApp[args.appId] = args.accountId;
            const found = v2Control.accounts.find(a => a.appId === args.appId && a.id === args.accountId);
            return { ok: true, value: { appId: args.appId, activeAccountId: args.accountId, switchedLocalFile: true, account: { ...found, isActive: true } } };
          }
          if (op === 'accounts.refreshQuota') {
            const cx = v2Control.accounts.find(a => a.appId === 'codex');
            if (cx) {
              cx.quotaState = 'synced';
              cx.quotas = [{ id: 'primary_window', label: '5h 限额', remainingPct: 68, usedText: '68% 剩余', resetAt: new Date(Date.now() + 3600_000).toISOString(), tone: 'high' }];
            }
            return { ok: true, value: { refreshedCount: 1, accounts: v2Control.accounts } };
          }
          if (op === 'accounts.totpList') {
            return { ok: true, value: { saved: [...v2Control.totpSaved], history: [...v2Control.totpHistory] } };
          }
          if (op === 'accounts.totpCompute') {
            const entry = { id: 'hist-1', name: 'Test 2FA', issuer: 'Dingtu', maskedSecret: 'JBSW••••3PXP', code: '482910', remainingSeconds: 22, period: 30, digits: 6, lastUsedAt: new Date().toISOString() };
            v2Control.totpHistory = [entry];
            return { ok: true, value: { result: entry, saved: [...v2Control.totpSaved], history: [...v2Control.totpHistory] } };
          }
          if (op === 'accounts.totpSave') {
            const entry = { id: 'totp-1', name: args.name || 'Saved 2FA', issuer: 'Dingtu', maskedSecret: 'JBSW••••3PXP', code: '482910', remainingSeconds: 22, period: 30, digits: 6, createdAt: new Date().toISOString() };
            v2Control.totpSaved = [entry];
            return { ok: true, value: { entry, saved: [...v2Control.totpSaved], history: [...v2Control.totpHistory] } };
          }
          if (op === 'accounts.totpRemove') {
            v2Control.totpSaved = v2Control.totpSaved.filter(x => !args.ids?.includes(x.id));
            return { ok: true, value: { removedCount: args.ids?.length || 0, saved: [...v2Control.totpSaved], history: [...v2Control.totpHistory] } };
          }
          if (op === 'accounts.totpExport') {
            return { ok: true, value: { count: v2Control.totpSaved.length, jsonText: JSON.stringify({ version: 1, entries: v2Control.totpSaved }) } };
          }
          if (op === 'accounts.updateMeta') {
            const acct = v2Control.accounts.find(a => a.appId === args.appId && a.id === args.accountId);
            if (acct) { acct.tags = args.tags || []; acct.note = args.note || ''; acct.plan = args.plan || acct.plan; }
            return { ok: true, value: { account: acct, accounts: v2Control.accounts } };
          }
          if (op === 'accounts.exportJson') {
            return { ok: true, value: { count: 1, jsonText: JSON.stringify({ accounts: [] }) } };
          }
          if (op === 'accounts.batchRemove') {
            return { ok: true, value: { removedCount: 0, accounts: v2Control.accounts } };
          }
          if (op === 'accounts.oauthStart') {
            v2Control.oauthCopiedFlows = v2Control.oauthCopiedFlows || [];
            return { ok: true, value: { flowId: 'abcdef123456', appId: args.appId, alias: args.alias || 'main', mode: 'browser', status: 'pending', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=ag-test&state=ok' } };
          }
          if (op === 'accounts.oauthStatus') {
            return { ok: true, value: { flowId: args.flowId, status: 'pending' } };
          }
          if (op === 'accounts.oauthCopyUrl') {
            v2Control.oauthCopiedFlows = v2Control.oauthCopiedFlows || [];
            v2Control.oauthCopiedFlows.push(args.flowId);
            return { ok: true, value: { copied: true, url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=ag-test&state=ok' } };
          }
          if (op === 'accounts.oauthCancel') {
            return { ok: true, value: { cancelled: true } };
          }
          if (op === 'accounts.usageScan') {
            const aid = args.appId || 'antigravity';
            return {
              ok: true,
              value: {
                appId: aid,
                dataDir: 'C:\\mock\\usage\\' + aid,
                scannedDbCount: 2,
                totalSessions: 2,
                totalTurns: 12,
                cacheHits: 1,
                cacheMisses: 1,
                scanMs: 12,
                totals: {
                  inputTokens: 120000,
                  thinkingTokens: 45000,
                  outputTokens: 25000,
                  cacheReadTokens: 300000,
                  cacheWriteTokens: 0,
                  totalTokens: 490000,
                  coveragePct: 100,
                  activeDaysAvg: 245000,
                  estimatedTurns: 0,
                  estimatedTokens: 0,
                },
                trend: [
                  { bucketKey: '2026-11-21', label: '11-21', totalTokens: 200000, inputTokens: 50000, thinkingTokens: 20000, outputTokens: 10000, cacheTokens: 120000, turns: 5 },
                  { bucketKey: '2026-11-22', label: '11-22', totalTokens: 290000, inputTokens: 70000, thinkingTokens: 25000, outputTokens: 15000, cacheTokens: 180000, turns: 7 },
                ],
                byModel: [
                  { name: 'Gemini 4 Carbon', family: 'Google Gemini', sessions: 1, turns: 7, inputTokens: 70000, thinkingTokens: 25000, outputTokens: 15000, cacheTokens: 180000, totalTokens: 290000 },
                  { name: 'Claude Opus 4.5', family: 'Anthropic', sessions: 1, turns: 5, inputTokens: 50000, thinkingTokens: 20000, outputTokens: 10000, cacheTokens: 120000, totalTokens: 200000 },
                ],
                byWorkspace: [
                  { name: 'singbox', path: 'D:\\singbox', sessions: 2, turns: 12, inputTokens: 120000, thinkingTokens: 45000, outputTokens: 25000, cacheTokens: 300000, totalTokens: 490000 },
                ],
                bySessionType: [
                  { type: 'main', label: '主会话', sessions: 1, turns: 8, inputTokens: 80000, thinkingTokens: 30000, outputTokens: 18000, cacheTokens: 210000, totalTokens: 338000, sharePct: 69 },
                  { type: 'swarm', label: 'Swarm 协作', sessions: 1, turns: 4, inputTokens: 40000, thinkingTokens: 15000, outputTokens: 7000, cacheTokens: 90000, totalTokens: 152000, sharePct: 31 },
                ],
                sessions: [
                  { id: 'sess-1', shortId: 'sess-1', title: 'Mock Session 1', workspaceName: 'singbox', workspacePath: 'D:\\singbox', sessionType: 'main', model: 'Gemini 4 Carbon', turns: 8, totalTokens: 338000, lastTime: new Date().toISOString() },
                ],
                models: ['Gemini 4 Carbon', 'Claude Opus 4.5'],
                workspaces: ['singbox'],
              },
            };
          }
          if (op === 'accounts.usageSetDir') {
            return { ok: true, value: { cancelled: false, dirPath: args.dirPath || 'C:\\mock\\usage' } };
          }
          if (op === 'accounts.groupsList') {
            return { ok: true, value: { groups: [...v2Control.groups], accounts: v2Control.accounts } };
          }
          if (op === 'accounts.groupsSave') {
            const g = { id: args.id || `grp-${v2Control.groups.length + 1}`, name: args.name, color: args.color || '#2563eb' };
            v2Control.groups = [...v2Control.groups.filter(x => x.id !== g.id), g];
            return { ok: true, value: { group: g, groups: [...v2Control.groups], accounts: v2Control.accounts } };
          }
          if (op === 'accounts.groupsRemove') {
            v2Control.groups = v2Control.groups.filter(x => x.id !== args.id);
            return { ok: true, value: { groups: [...v2Control.groups], accounts: v2Control.accounts } };
          }
          if (op === 'accounts.groupsAssign') {
            const acct = v2Control.accounts.find(a => a.appId === args.appId && a.id === args.accountId);
            if (acct) { acct.groups = [...(args.groupIds || [])]; acct.groupIds = [...(args.groupIds || [])]; }
            return { ok: true, value: { accounts: v2Control.accounts } };
          }
          if (op === 'accounts.wakeupList') {
            return { ok: true, value: { tasks: [...v2Control.wakeupTasks], history: [...v2Control.wakeupHistory] } };
          }
          if (op === 'accounts.wakeupSave') {
            const task = {
              id: args.id || `wake-${v2Control.wakeupTasks.length + 1}`,
              appId: args.appId || 'antigravity',
              accountId: args.accountId || '',
              name: args.name || '定时唤醒任务',
              scheduleType: args.scheduleType || 'interval',
              intervalMinutes: Number(args.intervalMinutes) || 60,
              dailyTime: args.dailyTime || '09:00',
              action: args.action || 'refresh_quota',
              enabled: args.enabled !== false,
              lastRunAt: null,
              lastStatus: null,
            };
            v2Control.wakeupTasks = [...v2Control.wakeupTasks.filter(t => t.id !== task.id), task];
            return { ok: true, value: { task, tasks: [...v2Control.wakeupTasks], history: [...v2Control.wakeupHistory] } };
          }
          if (op === 'accounts.wakeupToggle') {
            v2Control.wakeupTasks = v2Control.wakeupTasks.map(t => t.id === args.id ? { ...t, enabled: Boolean(args.enabled) } : t);
            return { ok: true, value: { tasks: [...v2Control.wakeupTasks], history: [...v2Control.wakeupHistory] } };
          }
          if (op === 'accounts.wakeupRemove') {
            v2Control.wakeupTasks = v2Control.wakeupTasks.filter(t => t.id !== args.id);
            return { ok: true, value: { tasks: [...v2Control.wakeupTasks], history: [...v2Control.wakeupHistory] } };
          }
          if (op === 'accounts.wakeupRunNow') {
            const t = v2Control.wakeupTasks.find(x => x.id === args.id);
            if (t) {
              t.lastRunAt = new Date().toISOString();
              t.lastStatus = 'ok';
              v2Control.wakeupHistory.unshift({ taskId: t.id, appId: t.appId, name: t.name, status: 'ok', message: '完成唤醒检查', ranAt: t.lastRunAt });
            }
            return { ok: true, value: { tasks: [...v2Control.wakeupTasks], history: [...v2Control.wakeupHistory] } };
          }
          if (op === 'accounts.settingsGet') {
            return { ok: true, value: { autoRefreshMinutes: v2Control.autoRefreshMinutes } };
          }
          if (op === 'accounts.settingsUpdate') {
            if (Number.isFinite(args.autoRefreshMinutes)) v2Control.autoRefreshMinutes = Number(args.autoRefreshMinutes);
            return { ok: true, value: { autoRefreshMinutes: v2Control.autoRefreshMinutes } };
          }
          if (op === 'accounts.totpMigrationPayload') {
            const entries = (v2Control.totpSaved || []).map(x => ({ name: x.name || 'Saved 2FA', issuer: x.issuer || 'Dingtu', secret: 'JBSWY3DPEHPK3PXP', digits: 6, period: 30 }));
            return { ok: true, value: { items: entries, entries } };
          }
          return { ok: true, value: {} };
        },
      },
      telemetry: {
        invoke: async (op) => {
          if (op === 'telemetry.status') {
            return { ok: true, value: { ...v2Control.telemetryState } };
          }
          if (op === 'telemetry.sync') {
            v2Control.telemetryState = {
              lastSyncedAt: new Date().toISOString(),
              lastSyncStatus: 'synced',
              lastAcceptedBuckets: 2,
              lastAcceptedEvents: 2,
              pendingEventsCount: 0,
              lastError: null,
            };
            return { ok: true, value: { ...v2Control.telemetryState } };
          }
          return { ok: false, error: { code: 'IPC_UNKNOWN', status: 400 } };
        },
      },
      tickets: {
        invoke: async (op, args = {}) => {
          if (op === 'tickets.list') {
            const st = args.status && args.status !== 'all' ? args.status : null;
            const list = st ? v2Control.tickets.filter(t => t.status === st) : v2Control.tickets;
            return { ok: true, value: { data_source: 'real', tickets: [...list] } };
          }
          if (op === 'tickets.create') {
            const nowIso = new Date().toISOString();
            const ticketId = `tkt_${String(v2Control.tickets.length + 1).padStart(32, '0')}`;
            const ticket = {
              ticketId,
              subject: args.subject,
              category: args.category || 'other',
              priority: 'normal',
              status: 'submitted',
              incidentId: null,
              deviceId: 'dev_mock',
              userReportId: null,
              unreadByCustomer: false,
              lastMessageAt: nowIso,
              createdAt: nowIso,
              updatedAt: nowIso,
            };
            const msg = { messageId: `msg_${Date.now()}`, authorRole: 'customer', authorName: '当前用户', body: args.body, createdAt: nowIso };
            const snap = args.includeDiagnostics !== false
              ? { appVersion: '0.2.0', platform: 'windows', environmentMode: v2Control.envMode, proxyState: v2Control.proxyState, recentErrorCodes: [], recentRequestIds: [] }
              : null;
            v2Control.lastTicketSnapshot = snap;
            v2Control.tickets.unshift(ticket);
            v2Control.ticketMessages[ticketId] = { diagnosticSnapshot: snap, messages: [msg] };
            return { ok: true, value: { ticket, message: msg } };
          }
          if (op === 'tickets.detail') {
            const ticket = v2Control.tickets.find(t => t.ticketId === args.ticketId);
            if (!ticket) return { ok: false, error: { code: 'TICKET_NOT_FOUND', status: 404 } };
            const rec = v2Control.ticketMessages[ticket.ticketId] || { diagnosticSnapshot: null, messages: [] };
            return { ok: true, value: { data_source: 'real', ticket: { ...ticket }, diagnosticSnapshot: rec.diagnosticSnapshot, messages: [...rec.messages] } };
          }
          if (op === 'tickets.reply') {
            const ticket = v2Control.tickets.find(t => t.ticketId === args.ticketId);
            if (!ticket) return { ok: false, error: { code: 'TICKET_NOT_FOUND', status: 404 } };
            const nowIso = new Date().toISOString();
            ticket.updatedAt = nowIso;
            if (args.action === 'close') ticket.status = 'closed';
            else if (args.action === 'reopen') ticket.status = 'reopened';
            let msg = null;
            if (args.body) {
              msg = { messageId: `msg_${Date.now()}_r`, authorRole: 'customer', authorName: '当前用户', body: args.body, createdAt: nowIso };
              v2Control.ticketMessages[ticket.ticketId].messages.push(msg);
              ticket.lastMessageAt = nowIso;
            }
            return { ok: true, value: { ticket: { ...ticket }, message: msg } };
          }
          return { ok: false, error: { code: 'IPC_UNKNOWN', status: 400 } };
        },
      },
    };
  });

  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  await page.goto(base + '#connection');
  await page.waitForFunction(() => document.getElementById('workspace-name')?.textContent === '定途个人用户');

  // 1. Verify Cockpit Sidebar (接入, 应用广场, 我的, 常用接入 pinned rail) & zero explicit relay copy
  const sidebarText = await page.locator('.sidebar').innerText();
  assert.match(sidebarText, /接入/);
  assert.match(sidebarText, /应用广场/);
  assert.match(sidebarText, /我的/);
  assert.match(sidebarText, /常用接入/);
  assert.match(sidebarText, /2FA 管理/);
  assert.match(await page.locator('#pinned-app-rail').innerText(), /Meta Muse/);
  const mainHomeText = await page.locator('#main-content').innerText();
  assert.equal(/中转站|模型接入源/.test(mainHomeText), false, 'Relay jargon must remain hidden from primary workspace');
  assert.match(await page.locator('.cockpit-kpi-strip').innerText(), /已托管账号槽位/);
  assert.equal(await page.locator('[data-kpi-running-quota="idle"]').count(), 1);
  assert.match(await page.locator('[data-kpi-running-quota="idle"]').innerText(), /运行实例额度[\s\S]*暂未运行/);
  assert.doesNotMatch(await page.locator('.cockpit-kpi-strip').innerText(), /额度健康度|所有已同步账号最低剩余比例/);
  assert.match(await page.locator('[data-platform-card="claude-code"]').innerText(), /dev@dingtu\.test/);
  assert.match(await page.locator('[data-platform-card="claude-code"]').innerText(), /76%/);

  // 1b. Verify interactive 常用工具 switching updates .selected-app-workbench live!
  const commonBarText = await page.locator('.common-tools-bar').innerText();
  for (const requiredTool of ['Codex', 'Claude Code', 'Antigravity', 'Grok', 'Meta Muse']) {
    assert.ok(commonBarText.includes(requiredTool), `Expected ${requiredTool} in 常用工具`);
  }
  assert.equal(await page.locator('.selected-footer-strip').count(), 0, 'Legacy v1 footer strip must be removed');
  assert.equal(await page.locator('.prototype-bar').isHidden(), true, 'Prototype footer bar must be hidden in desktop mode');
  const autoImports = await page.evaluate(() => window.v2Control.importLocalCalls);
  assert.ok(autoImports.some(c => c.all === true && c.silent === true), 'Expected silent multi-source local import on boot');

  await page.locator('.common-tools-bar [data-overview-select-app="antigravity"]').click();
  await page.waitForFunction(() => document.querySelector('[data-overview-active-card]')?.innerText.includes('ag-primary@dingtu.test'));
  assert.ok((await page.locator('[data-overview-active-card] .account-quota-panel').innerText()).includes('模型与用量配额'));
  assert.equal(await page.locator('[data-overview-spare-empty="true"]').count(), 1);
  assert.equal(await page.locator('[data-action="overview-spare-prev"]').isDisabled(), true);
  assert.equal(await page.locator('[data-action="overview-spare-next"]').isDisabled(), true);
  assert.equal((await page.locator('.overview-spare-counter').innerText()).trim(), '备用账号 0 / 0');

  // Personal tier unlocks adding and switching spare accounts locally (while keeping single-open limit)
  await page.locator('.common-tools-bar [data-overview-select-app="codex"]').click();
  await page.waitForFunction(() => document.querySelector('[data-overview-active-card]')?.innerText.includes('codex@dingtu.test'));
  await page.locator('.selected-app-workbench-actions [data-action="open-add-account-dialog"]').click();
  await page.locator('#add-account-dialog [data-add-tab="json"]').click();
  await page.locator('#add-account-dialog [data-action="open-add-account-modal"]').click();
  assert.equal(await page.locator('#workbench-instance-alias').evaluate(el => el.readOnly), false);
  await page.locator('#workbench-instance-alias').fill('codex-2');
  await page.locator('#workbench-account-email').fill('codex-spare@dingtu.test');
  await page.locator('#workbench-submit-btn').click();
  await page.waitForFunction(() => document.querySelector('[data-overview-spare-card]')?.innerText.includes('codex-spare@dingtu.test'));
  await page.locator('[data-overview-spare-card] .overview-switch-btn').click();
  await page.waitForFunction(() => document.querySelector('[data-overview-active-card]')?.innerText.includes('codex-spare@dingtu.test'));
  await page.locator('[data-overview-spare-card] .overview-switch-btn').click();
  await page.waitForFunction(() => document.querySelector('[data-overview-active-card]')?.innerText.includes('codex@dingtu.test'));

  await page.locator('.common-tools-bar [data-overview-select-app="metamuse"]').click();
  await page.waitForFunction(() => document.querySelector('.selected-app-workbench')?.innerText.includes('Meta Muse'));
  assertionsPassed += 16;

  // 2. Connect 17899 tunnel via dock button & refresh quota in Overview
  await page.locator('#dock-connect').click();
  await page.waitForFunction(() => document.getElementById('dock-connect').dataset.status === 'connected');
  await page.locator('[data-action="refresh-all-quotas"]').click();
  await page.waitForFunction(() => document.querySelector('[data-platform-card="codex"]')?.innerText.includes('68%'));
  assertionsPassed += 2;

  // 3. Click pinned app in left rail to open Cockpit single-app workspace (账号与额度 + 多开与实例)
  await page.locator('#pinned-app-rail [data-open-workspace="metamuse"]').click();
  await page.waitForFunction(() => document.querySelector('.app-workspace-header h1')?.textContent === 'Meta Muse');
  await page.locator('[data-action="launch-workspace-app"]').click();
  await page.waitForFunction(() => document.body.innerText.includes('运行中'));
  // Personal user CAN open multiple isolated containers & custom aliases locally (single-terminal uniqueness is enforced server-side)
  await page.locator('[data-workspace-tab="instances"]').click();
  await page.locator('[data-action="browser-test"]').click();
  assert.equal(await page.locator('#browser-instance-id-input').evaluate(el => el.readOnly), false);
  await page.locator('#browser-instance-form [name="appId"]').selectOption('claude');
  await page.locator('#browser-instance-id-input').fill('claude-work');
  await page.locator('#browser-instance-form [type="submit"]').click();
  await page.waitForFunction(() => !document.getElementById('browser-instance-dialog')?.open);
  assert.ok(await page.evaluate(() => window.v2Control.openBrowsers.some(b => b.appId === 'claude' && b.instanceId === 'claude-work')));
  await page.locator('[data-action="fingerprint-check"]').first().click();
  await page.waitForFunction(() => document.body.innerText.includes('203.0.113.88')
    && document.body.innerText.includes('America/Los_Angeles')
    && document.body.innerText.includes('指纹自检通过')
    && document.body.innerText.includes('Seed #a1b2c3d4e5f6')
    && document.body.innerText.includes('Google Chrome')
    && document.body.innerText.includes('已拦截本机/内网端口扫描')
    && document.body.innerText.includes('已掩蔽中文 Windows 系统字体')
    && document.body.innerText.includes('127.0.0.1:17899 专属代理沙箱 + 远端 DNS 锁定（应用层）'));
  assert.doesNotMatch(await page.locator('#main-content').innerText(), /防风控沙箱|socks5h|按进程 TUN|与 7890|中转站/);
  assert.equal(await page.locator('.safe-env-card').count(), 0);
  assertionsPassed += 4;

  // 4. Go to 我的 -> verify .safe-env-card is REMOVED and no internal sandbox/relay jargon leaks, verify 3-state strong_tun UAC fallback + elevated strong_tun + own_network
  await page.locator('.rail-navigation [data-page="settings"]').click();
  assert.equal(await page.locator('.safe-env-card').count(), 0, 'Internal safe-env sandbox card must be hidden from settings UI');
  assert.doesNotMatch(await page.locator('#main-content').innerText(), /防风控沙箱|socks5h|按进程 TUN|与 7890|中转站/);
  assert.equal(await page.locator('[data-env-mode]').count(), 3);

  // Non-elevated strong_tun attempt shows UAC banner and UAC cancel cleanly keeps safe_tunnel
  await page.locator('[data-env-mode="strong_tun"]').click();
  await page.waitForSelector('[data-action="relaunch-elevated-tun"]', { timeout: 3000 });
  assert.doesNotMatch(await page.locator('#main-content').innerText(), /防风控沙箱|socks5h|按进程 TUN|与 7890|中转站/);
  await page.locator('[data-action="relaunch-elevated-tun"]').click();
  await page.waitForFunction(() => document.querySelector('[data-env-mode="safe_tunnel"]')?.getAttribute('aria-pressed') === 'true'
    && !document.querySelector('[data-action="relaunch-elevated-tun"]'));

  // Elevated strong_tun switch + reconnect + fingerprint verification shows dingtu-tun0
  await page.evaluate(() => { window.v2Control.isElevated = true; });
  await page.locator('[data-env-mode="strong_tun"]').click();
  await page.waitForFunction(() => document.querySelector('[data-env-mode="strong_tun"]')?.getAttribute('aria-pressed') === 'true');
  assert.doesNotMatch(await page.locator('#main-content').innerText(), /防风控沙箱|socks5h|按进程 TUN|与 7890|中转站/);
  await page.locator('#dock-connect').click();
  await page.waitForFunction(() => document.getElementById('dock-connect').dataset.status === 'connected');
  await page.locator('[data-action="fingerprint-check"]').first().click();
  await page.waitForFunction(() => document.body.innerText.includes('dingtu-tun0 内核级按进程接管 + 127.0.0.1:17899 代理 + 远端 DoH + QUIC 阻断'));

  // Clicking 自有网络 must open risk confirmation dialog first; cancelling preserves current mode & connection!
  await page.locator('[data-env-mode="own_network"]').click();
  await page.waitForSelector('#own-network-confirm-dialog[open]', { timeout: 3000 });
  const ownModalText = await page.locator('#own-network-confirm-dialog').innerText();
  assert.match(ownModalText, /确认切换至「自有网络」？/);
  assert.match(ownModalText, /断开专属安全线路并停止网络隔离保护/);
  assert.match(ownModalText, /增加 AI 账号触发风控或封号的风险/);
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset?.action),
    'cancel-own-network-switch',
    'Default focus in own_network confirmation dialog must stay on the safe cancel button',
  );
  await page.locator('#own-network-confirm-dialog [data-action="cancel-own-network-switch"]').click();
  await page.waitForFunction(() => !document.getElementById('own-network-confirm-dialog')?.open);
  assert.equal(await page.locator('[data-env-mode="strong_tun"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#dock-connect').getAttribute('data-status'), 'connected');

  // Clicking 自有网络 again and explicitly confirming switches mode & disconnects tunnel
  await page.locator('[data-env-mode="own_network"]').click();
  await page.waitForSelector('#own-network-confirm-dialog[open]', { timeout: 3000 });
  await page.locator('#own-network-confirm-dialog [data-action="confirm-own-network-switch"]').click();
  await page.waitForFunction(() => !document.getElementById('own-network-confirm-dialog')?.open
    && document.getElementById('dock-connect').dataset.status === 'disconnected'
    && document.querySelector('[data-env-mode="own_network"]')?.getAttribute('aria-pressed') === 'true');
  assert.equal(await page.locator('[data-toggle-acceleration]').getAttribute('aria-checked'), 'true');
  assertionsPassed += 13;

  // 5. Upgrade to Enterprise -> adds 2nd Claude Code account & executes one-click account switch + silent background relay + multi-open Meta Muse!
  await page.evaluate(async () => {
    window.v2Control.customerType = 'enterprise';
    await refreshAuth();
  });
  await page.waitForFunction(() => document.getElementById('workspace-name')?.textContent === '定途企业管理员');
  await page.locator('#pinned-app-rail [data-open-workspace="claude-code"]').click();
  await page.waitForFunction(() => document.querySelector('.app-workspace-header h1')?.textContent === 'Claude Code');
  assert.equal(await page.locator('.app-workspace-identity > h1').count(), 1);
  assert.equal(await page.locator('.app-workspace-identity > .app-workspace-meta').count(), 1);
  assert.equal(await page.locator('.cockpit-toolbar-right [data-action="open-add-account-modal"]').count(), 0);

  await page.locator('.cockpit-toolbar-right [data-action="open-add-account-dialog"]').click();
  await page.locator('#add-account-dialog [data-add-tab="json"]').click();
  await page.locator('#add-account-dialog [data-action="open-add-account-modal"]').click();
  assert.equal(await page.locator('#workbench-instance-alias').evaluate(el => el.readOnly), false);
  await page.locator('#workbench-instance-alias').fill('work-2');
  await page.locator('#workbench-account-email').fill('team2@dingtu.test');
  await page.locator('#workbench-account-plan').fill('Team');
  await page.locator('#workbench-submit-btn').click();
  await page.waitForFunction(() => document.querySelector('[data-account-card="work-2"]'));

  await page.locator('.cockpit-toolbar-right [data-action="open-add-account-dialog"]').click();
  await page.locator('#add-account-dialog [data-add-tab="json"]').click();
  await page.locator('#add-account-dialog [data-action="open-add-account-modal"]').click();
  await page.locator('#workbench-instance-alias').fill('work-3');
  await page.locator('#workbench-account-email').fill('team3@dingtu.test');
  await page.locator('#workbench-account-plan').fill('Max');
  await page.locator('#workbench-submit-btn').click();
  await page.waitForFunction(() => document.querySelector('[data-account-card="work-3"]'));

  // Verify all workspace cards strictly have 7 compact icon buttons in dock (zero overflowing text buttons!)
  const dockCounts = await page.locator('.account-card .card-icon-dock').evaluateAll(docks => docks.map(d => ({
    iconBtns: d.querySelectorAll('.dock-action-btn').length,
    textBtns: d.querySelectorAll('.button').length,
  })));
  assert.ok(dockCounts.length >= 3 && dockCounts.every(c => c.iconBtns === 7 && c.textBtns === 0), `Expected exact 7 icon buttons and 0 text buttons per card dock, got: ${JSON.stringify(dockCounts)}`);

  // Click work-2 ▶ play button -> Cockpit switch-and-launch passes silent relayId 'dingtu-claude-cn'
  await page.locator('[data-account-card="work-2"] .dock-action-btn.primary-play[data-action="switch-and-launch-account"]').click();
  await page.waitForFunction(() => document.querySelector('[data-account-card="work-2"]')?.classList.contains('active-account')
    && window.v2Control.lastCreatedRelayIds.includes('dingtu-claude-cn'));

  // Test Cockpit-style「切换并启动」via work-3 ▶ play button: graceful closeApp -> accounts.switch -> quickLaunch claude-code-main, then click work-2 ▶ back to active
  await page.locator('[data-account-card="work-3"] .dock-action-btn.primary-play[data-action="switch-and-launch-account"]').click();
  await page.waitForFunction(() => window.v2Control.closedApps.includes('claude-code')
    && window.v2Control.activeByApp['claude-code'] === 'work-3'
    && window.v2Control.agentProfiles.some(p => p.profileId === 'claude-code-main' && p.status === 'running'));
  await page.locator('[data-account-card="work-2"] .dock-action-btn.primary-play[data-action="switch-and-launch-account"]').click();
  await page.waitForFunction(() => document.querySelector('[data-account-card="work-2"]')?.classList.contains('active-account'));

  // Return to Overview and verify side-by-side active quotas + spare account carousel + arrow cycling + compact switch button (no overflowing 切换并启动 text button)
  await page.locator('.rail-navigation [data-page="connection"]').click();
  await page.locator('.common-tools-bar [data-overview-select-app="claude-code"]').click();
  await page.waitForFunction(() => document.querySelector('[data-overview-active-card]')?.innerText.includes('team2@dingtu.test'));
  assert.equal(await page.locator('.overview-switch-launch-btn').count(), 0);
  const overviewSpareDockIcons = await page.locator('[data-overview-spare-card] .card-icon-dock .dock-action-btn').count();
  assert.equal(overviewSpareDockIcons, 7);
  assert.ok((await page.locator('[data-overview-active-card] .account-quota-panel').innerText()).includes('模型与用量配额'));
  assert.equal((await page.locator('.overview-spare-counter').innerText()).trim(), '备用账号 1 / 2');
  assert.match(await page.locator('[data-overview-spare-card]').innerText(), /dev@dingtu\.test/);
  assert.equal(await page.locator('[data-overview-spare-card] .card-icon-dock').count(), 1);
  await page.locator('[data-action="overview-spare-next"]').click();
  await page.waitForFunction(() => document.querySelector('.overview-spare-counter')?.textContent.trim() === '备用账号 2 / 2');
  assert.match(await page.locator('[data-overview-spare-card]').innerText(), /team3@dingtu\.test/);
  await page.locator('[data-action="overview-spare-prev"]').click();
  await page.waitForFunction(() => document.querySelector('.overview-spare-counter')?.textContent.trim() === '备用账号 1 / 2');
  await page.locator('[data-action="overview-spare-next"]').click();
  await page.locator('[data-overview-spare-card] .overview-switch-btn').click();
  await page.waitForFunction(() => document.querySelector('[data-overview-active-card]')?.innerText.includes('team3@dingtu.test'));
  // Switch back to main (dev@dingtu.test with 5h=76%, then add 7d=82%) and verify 4th KPI card distinguishes 5h apps vs pure web container vs monthly/cycle apps!
  await page.evaluate(async () => {
    await window.NoyaDesktop.accounts.invoke('accounts.switch', { appId: 'claude-code', accountId: 'main' });
    const ccMain = window.v2Control.accounts.find(a => a.appId === 'claude-code' && a.id === 'main');
    if (ccMain && !ccMain.quotas.some(q => q.id === 'seven_day')) {
      ccMain.quotas.push({ id: 'seven_day', label: '7d 限额', remainingPct: 82, usedText: '82% 剩余', resetAt: new Date(Date.now() + 86400_000).toISOString(), tone: 'high' });
    }
    window.v2Control.openBrowsers.push({ appId: 'metamuse', name: 'Meta Muse', instanceId: 'muse-kpi-probe', appShell: true, mode: 'own_network', status: 'opened' });
    window.v2Control.agentProfiles.push({ profileId: 'cursor-main', appId: 'cursor', appName: 'Cursor', status: 'running', pid: 5511 });
    window.v2Control.accounts.push({
      id: 'main', appId: 'cursor', label: 'cursor-pro@dingtu.test', email: 'cursor-pro@dingtu.test',
      plan: 'PRO', source: 'local-import', isActive: true, status: 'ready', quotaState: 'synced',
      quotas: [{ id: 'monthly', label: '月度请求额度', remainingPct: 84, usedText: '84% 剩余', resetAt: null, tone: 'high' }],
    });
    window.v2Control.activeByApp.cursor = 'main';
    await syncDesktopWorkbench();
  });
  await page.waitForFunction(() => document.querySelector('[data-kpi-running-quota="five-hour"]')?.innerText.includes('5h 76% · 周 82%'));
  await page.locator('.common-tools-bar [data-overview-select-app="metamuse"]').click();
  await page.waitForFunction(() => document.querySelector('[data-kpi-running-quota="web-session"]')?.innerText.includes('会话在线')
    && document.querySelector('[data-kpi-running-quota="web-session"]')?.innerText.includes('无 5h 窗口'));
  await page.locator('.common-tools-bar [data-overview-select-app="cursor"]').click();
  await page.waitForFunction(() => document.querySelector('[data-kpi-running-quota="cycle"]')?.innerText.includes('84%')
    && document.querySelector('[data-kpi-running-quota="cycle"]')?.innerText.includes('无 5h 窗口'));
  await page.evaluate(async () => {
    window.v2Control.openBrowsers = window.v2Control.openBrowsers.filter(b => b.instanceId !== 'muse-kpi-probe');
    window.v2Control.agentProfiles = window.v2Control.agentProfiles.filter(p => p.profileId !== 'cursor-main');
    await window.NoyaDesktop.accounts.invoke('accounts.switch', { appId: 'claude-code', accountId: 'team3' }).catch(() => null);
    window.v2Control.activeByApp['claude-code'] = 'work-3';
    await syncDesktopWorkbench();
  });
  assertionsPassed += 14;

  // Switch to 多开与实例 tab on Meta Muse and launch two concurrent containers (muse-us-1 & muse-us-2)
  await page.locator('#pinned-app-rail [data-open-workspace="metamuse"]').click();
  await page.locator('[data-workspace-tab="instances"]').click();
  await page.locator('[data-action="open-workbench-modal"]').click();
  await page.locator('#workbench-instance-alias').fill('muse-us-1');
  await page.locator('#workbench-submit-btn').click();
  await page.waitForFunction(() => document.querySelector('.workbench-instance-list')?.innerText.includes('muse-us-1'));

  await page.locator('[data-action="open-workbench-modal"]').click();
  await page.locator('#workbench-instance-alias').fill('muse-us-2');
  await page.locator('#workbench-submit-btn').click();
  await page.waitForFunction(() => document.querySelector('.workbench-instance-list')?.innerText.includes('muse-us-2'));
  assert.equal(await page.locator('.workbench-instance-list .workbench-instance-row').count(), 2);

  // Toggle pin for Windsurf (unpinned by default in 17-app config) & Cursor (pinned by default), assert 17 plaza cards + zero dropped apps
  await page.locator('[data-action="toggle-app-library"]').first().click();
  await page.waitForSelector('#app-library .plaza-card', { timeout: 5000 });
  assert.equal(await page.locator('#app-library .plaza-card').count(), 17);
  const authPlazaText = await page.locator('#app-library').innerText();
  for (const dropped of ['Trae', 'TraeWork', 'CodeBuddy', 'Qoder', 'Zed', 'ZCode']) {
    assert.equal(authPlazaText.includes(dropped), false, `Dropped app ${dropped} must not appear in plaza`);
  }
  await page.locator('[data-toggle-pin="windsurf"]').click();
  await page.waitForFunction(() => document.getElementById('pinned-app-rail')?.innerText.includes('Windsurf'));
  await page.locator('[data-toggle-pin="windsurf"]').click();
  await page.waitForFunction(() => !document.getElementById('pinned-app-rail')?.innerText.includes('Windsurf'));
  await page.locator('[data-toggle-pin="cursor"]').click();
  await page.waitForFunction(() => !document.getElementById('pinned-app-rail')?.innerText.includes('Cursor'));
  await page.locator('[data-toggle-pin="cursor"]').click();
  await page.waitForFunction(() => document.getElementById('pinned-app-rail')?.innerText.includes('Cursor'));
  assertionsPassed += 9;

  // Verify Screenshot 1-4 Workspace controls (3-column card grid, privacy eye, 账户检测 tab, add-account-dialog)
  await page.locator('#pinned-app-rail [data-open-workspace="antigravity"]').click();
  await page.waitForFunction(() => document.querySelector('.app-workspace-header h1')?.textContent === 'Antigravity');
  await page.locator('.cockpit-toolbar-right [data-action="toggle-privacy-mask"]').click();
  await page.waitForFunction(() => document.querySelector('[data-account-card="main"]')?.innerText.includes('ag***@dingtu.test'));
  await page.locator('.cockpit-toolbar-right [data-action="toggle-privacy-mask"]').click();
  await page.locator('[data-workspace-tab="health"]').click();
  await page.waitForFunction(() => document.body.innerText.includes('gemini:antigravity'));
  await page.locator('[data-workspace-tab="accounts"]').click();
  await page.locator('.cockpit-toolbar-right [data-action="open-add-account-dialog"]').click();
  assert.equal(await page.locator('#add-account-dialog').evaluate(el => el.open), true);
  assert.match(await page.locator('#add-account-dialog').innerText(), /独立隔离的外部 Chrome \/ Edge 浏览器窗口/);
  await page.locator('#add-account-dialog [data-action="start-oauth-flow"]').click();
  await page.waitForSelector('#add-account-dialog [data-action="copy-oauth-url"]', { timeout: 3000 });
  assert.equal(await page.locator('#add-account-dialog [data-action="copy-oauth-url"]').innerText(), '复制授权链接');
  await page.locator('#add-account-dialog [data-action="cancel-oauth-flow"]').click();
  await page.locator('[data-action="close-add-account-dialog"]').click();

  // 5b. Verify 100% Cockpit Parity: Screenshot-1 cards, platform dropdown, 5 unified tabs across major apps, Claude sub-switcher, groups, auto-refresh, usage, wakeup
  await page.locator('#workspace-platform-dropdown-btn').click();
  await page.waitForSelector('.platform-dropdown-menu [data-select-workspace-platform="claude-code"]', { timeout: 3000 });
  await page.locator('.platform-dropdown-menu [data-select-workspace-platform="claude-code"]').click();
  await page.waitForSelector('.account-card[data-account-card="main"]', { timeout: 5000 });
  assert.ok(await page.locator('.account-card .account-quota-panel').count() >= 1);
  const ccMainQuotaText = await page.locator('.account-card[data-account-card="main"] .account-quota-panel').innerText();
  assert.match(ccMainQuotaText, /5h 限额/);
  assert.match(ccMainQuotaText, /7d 限额/);
  assert.match(ccMainQuotaText, /76%/);
  assert.doesNotMatch(ccMainQuotaText, /7d 限额\s*0%/);
  assert.ok(await page.locator('.account-header-badges .badge-current').count() >= 1);
  assert.ok(await page.locator('.tier-badge').count() >= 1);
  assert.ok(await page.locator('.card-icon-dock [data-action="refresh-single-quota"]').count() >= 1);
  assert.equal(await page.locator('.local-token-bar').count(), 1);
  assert.equal(await page.locator('.app-workspace-top [data-action="launch-workspace-app"]').count(), 1);
  assert.equal(await page.locator('.cockpit-top-navrow [data-action="launch-workspace-app"]').count(), 0);
  assert.equal(await page.locator('.subapp-switcher .subapp-btn').count(), 3);
  await page.locator('.subapp-switcher [data-select-workspace-platform="claude"]').click();
  await page.waitForFunction(() => document.querySelector('.app-workspace-header h1')?.textContent === 'Claude Web');
  await page.locator('.app-workspace-header-actions [data-action="fingerprint-check"]').click();
  await page.waitForSelector('.fingerprint-mini-strip [data-action="toggle-fingerprint-collapse"]', { timeout: 5000 });
  assert.equal(await page.locator('.fingerprint-mini-strip .fingerprint-grid').count(), 1);
  await page.locator('.fingerprint-mini-strip [data-action="toggle-fingerprint-collapse"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.fingerprint-mini-strip .fingerprint-grid').length === 0);
  await page.locator('.fingerprint-mini-strip [data-action="toggle-fingerprint-collapse"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.fingerprint-mini-strip .fingerprint-grid').length === 1);
  await page.locator('.subapp-switcher [data-select-workspace-platform="claude-desktop"]').click();
  await page.waitForFunction(() => document.querySelector('.app-workspace-header h1')?.textContent === 'Claude Desktop');
  assert.equal(await page.locator('.fingerprint-mini-strip').count(), 0, 'Claude Web fingerprint strip must not remain stuck under Claude Desktop');
  await page.locator('.subapp-switcher [data-select-workspace-platform="claude"]').click();
  await page.waitForSelector('.fingerprint-mini-strip [data-action="dismiss-fingerprint-report"]', { timeout: 3000 });
  await page.locator('.fingerprint-mini-strip [data-action="dismiss-fingerprint-report"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.fingerprint-mini-strip').length === 0);
  await page.locator('.subapp-switcher [data-select-workspace-platform="claude-code"]').click();
  await page.waitForFunction(() => document.querySelector('.app-workspace-header h1')?.textContent === 'Claude Code');

  for (const appId of ['antigravity', 'codex', 'claude-desktop', 'cursor', 'windsurf', 'kiro', 'grok-cli']) {
    await page.locator('#workspace-platform-dropdown-btn').click();
    await page.waitForSelector(`.platform-dropdown-menu [data-select-workspace-platform="${appId}"]`, { timeout: 3000 });
    await page.locator(`.platform-dropdown-menu [data-select-workspace-platform="${appId}"]`).click();
    for (const tabId of ['accounts', 'usage', 'instances', 'wakeup', 'health']) {
      assert.equal(await page.locator(`.workspace-tab-btn[data-workspace-tab="${tabId}"]`).count(), 1, `Missing ${tabId} tab on ${appId}`);
    }
  }

  // 分组管理 & 自动刷新 modals
  await page.locator('[data-action="open-group-manage-dialog"]').first().click();
  await page.locator('#group-create-form input[name="name"]').fill('主力组');
  await page.locator('#group-create-form button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('.cockpit-group-pills')?.innerText.includes('主力组'));
  await page.locator('#group-manage-dialog [data-action="close-group-dialog"]').click();

  await page.locator('[data-action="open-auto-refresh-dialog"]').click();
  await page.locator('#auto-refresh-form select[name="autoRefreshMinutes"]').selectOption('30');
  await page.locator('#auto-refresh-form button[type="submit"]').click();
  await page.waitForFunction(() => window.v2Control.autoRefreshMinutes === 30);

  // 会话用量 + SVG chart + §16 Cloud Telemetry Sync
  await page.locator('#workspace-platform-dropdown-btn').click();
  await page.locator('.platform-dropdown-menu [data-select-workspace-platform="antigravity"]').click();
  await page.locator('.workspace-tab-btn[data-workspace-tab="usage"]').click();
  await page.waitForSelector('.usage-hero-card', { timeout: 5000 });
  assert.ok(await page.locator('.usage-chart-card svg').count() >= 1);
  assert.ok(await page.locator('.session-type-pill').count() >= 2);
  assert.equal(await page.locator('.telemetry-sync-bar').count(), 1);
  await page.locator('[data-action="telemetry-sync-now"]').click();
  await page.waitForFunction(() => window.v2Control.telemetryState.lastSyncStatus === 'synced' && window.v2Control.telemetryState.pendingEventsCount === 0);

  // 唤醒任务 tab
  await page.locator('.workspace-tab-btn[data-workspace-tab="wakeup"]').click();
  await page.locator('[data-action="open-wakeup-dialog"]').click();
  await page.locator('#wakeup-task-form input[name="name"]').fill('hourly-quota-check');
  await page.locator('#wakeup-task-form button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('.wakeup-task-row')?.innerText.includes('hourly-quota-check'));
  assertionsPassed += 12;

  // Verify TOTP offline utility + QR migration export + pure-JS QR roundtrip
  await page.locator('.sidebar-utility-nav [data-page="totp"]').click();
  await page.waitForSelector('#totp-secret-input');
  await page.locator('#totp-secret-input').fill('JBSWY3DPEHPK3PXP');
  await page.locator('[data-action="totp-query"]').click();
  await page.waitForFunction(() => document.getElementById('totp-live-code')?.textContent === '482910');
  await page.locator('[data-action="totp-save"]').click();
  await page.waitForFunction(() => document.querySelector('.totp-list-card')?.innerText.includes('Saved 2FA'));
  await page.locator('[data-action="totp-qr-export"]').click();
  await page.waitForSelector('#totp-qr-body svg[role="img"]', { timeout: 5000 });
  assert.equal(await page.locator('#totp-qr-body svg[role="img"]').getAttribute('width'), '220');
  await page.locator('#totp-qr-body [data-action="close-totp-qr-dialog"]').click();
  const qrRoundtrip = await page.evaluate(() => {
    const mod = globalThis.DingtuTotpQr;
    const uri = mod.encodeOtpAuthMigration([{ name: 'Smoke2FA', issuer: 'Dingtu', secret: 'JBSWY3DPEHPK3PXP', digits: 6, period: 30 }]);
    const { size, grid } = mod.encodeQrMatrix(uri);
    const scale = 6;
    const margin = 4;
    const dim = (size + margin * 2) * scale;
    const canvas = document.createElement('canvas');
    canvas.width = dim;
    canvas.height = dim;
    const g2d = canvas.getContext('2d');
    g2d.fillStyle = '#ffffff';
    g2d.fillRect(0, 0, dim, dim);
    g2d.fillStyle = '#000000';
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (grid[r][c]) g2d.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
      }
    }
    const imgData = g2d.getImageData(0, 0, dim, dim);
    const decodedText = mod.decodeQrFromImageData(imgData);
    const entries = mod.decodeOtpAuthMigration(decodedText);
    return { uri, decodedText, entries };
  });
  assert.equal(qrRoundtrip.decodedText, qrRoundtrip.uri);
  assert.equal(qrRoundtrip.entries.length, 1);
  assert.equal(qrRoundtrip.entries[0].secret, 'JBSWY3DPEHPK3PXP');
  assertionsPassed += 9;

  // 5c. Verify §17 Closed-loop 工单支持 (create w/ diagnostics default-checked -> reply -> close -> reopen)
  await page.locator('.sidebar-utility-nav [data-page="tickets"]').click();
  await page.locator('[data-action="open-new-ticket-dialog"]').click();
  assert.equal(await page.locator('#new-ticket-form input[name="includeDiagnostics"]').isChecked(), true);
  await page.locator('#new-ticket-form input[name="subject"]').fill('出口节点延迟波动排查');
  await page.locator('#new-ticket-form textarea[name="body"]').fill('验证工单提交、客服对话、关闭与重开闭环。');
  await page.locator('#new-ticket-form button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('.ticket-detail-card')?.innerText.includes('出口节点延迟波动排查'));
  const diagSnap = await page.evaluate(() => window.v2Control.lastTicketSnapshot);
  assert.equal(diagSnap.appVersion, '0.2.0');
  assert.equal(Object.prototype.hasOwnProperty.call(diagSnap, 'workspacePath'), false);

  await page.locator('#ticket-reply-form [name="body"]').fill('补充复现节点信息');
  await page.locator('#ticket-reply-form button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('.ticket-detail-card')?.innerText.includes('补充复现节点信息'));

  await page.locator('[data-action="ticket-close"]').click();
  await page.waitForSelector('[data-action="ticket-reopen"]', { timeout: 5000 });
  await page.locator('[data-action="ticket-reopen"]').click();
  await page.waitForSelector('[data-action="ticket-close"]', { timeout: 5000 });

  // Verify Antigravity Plan B modal (default primary focus + running notice when active), CLI launch without closing GUI, and closeApp failure aborts switch+launch
  await page.evaluate(() => {
    window.v2Control.closedApps = [];
    window.v2Control.inspectedApps = [];
    window.v2Control.startedProfiles = [];
    window.v2Control.closeAppOverride = null;
    window.v2Control.externalRunningApps = { antigravity: false };
  });
  await page.locator('#pinned-app-rail [data-open-workspace="antigravity"]').click();
  await page.waitForFunction(() => document.querySelector('.app-workspace-header h1')?.textContent === 'Antigravity');
  await page.locator('[data-account-card="main"] [data-action="open-ag-launch-dialog"]').click();
  await page.waitForSelector('#antigravity-launch-dialog[open]', { timeout: 3000 });
  assert.equal(await page.locator('#antigravity-launch-running-notice').isHidden(), true);
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset?.action),
    'confirm-ag-switch-and-launch',
    'Antigravity launch modal must auto-focus primary desktop launch button for Enter confirmation',
  );
  await page.locator('[data-action="close-ag-launch-dialog"]').click();

  // When Antigravity is detected running, Plan B modal displays graceful-close restart notice & still focuses primary button
  await page.evaluate(() => { window.v2Control.externalRunningApps = { antigravity: true }; });
  await page.locator('[data-account-card="main"] [data-action="open-ag-launch-dialog"]').click();
  await page.waitForSelector('#antigravity-launch-dialog[open]', { timeout: 3000 });
  await page.waitForFunction(() => !document.getElementById('antigravity-launch-running-notice')?.hidden);
  assert.match(
    await page.locator('#antigravity-launch-running-notice').innerText(),
    /检测到 Antigravity 正在运行，确认后将自动优雅关闭旧窗口并切换至目标账号重启/,
  );
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.action), 'confirm-ag-switch-and-launch');
  await page.locator('[data-action="confirm-ag-switch-and-launch-cli"]').click();
  await page.waitForFunction(() => window.v2Control.inspectedApps.includes('antigravity-cli')
    && window.v2Control.startedProfiles.includes('antigravity-cli-main'));
  const agCliCheck = await page.evaluate(() => ({
    closedAntigravityGui: window.v2Control.closedApps.includes('antigravity'),
    inspected: [...window.v2Control.inspectedApps],
  }));
  assert.equal(agCliCheck.closedAntigravityGui, false);
  assert.ok(agCliCheck.inspected.includes('antigravity-cli'));
  await page.evaluate(() => { window.v2Control.externalRunningApps = {}; });
  assertionsPassed += 4;

  // Verify Antigravity OAuth copy link renders visible URL preview, invokes accounts.oauthCopyUrl, and displays inline modal confirmation
  await page.evaluate(() => { openAddAccountDialog('antigravity', 'oauth'); });
  await page.waitForSelector('#add-account-dialog[open] [data-action="start-oauth-flow"]', { timeout: 5000 });
  await page.locator('#add-account-dialog [data-action="start-oauth-flow"]').click();
  await page.waitForSelector('#oauth-auth-url-preview', { timeout: 5000 });
  const oauthPreviewVal = await page.locator('#oauth-auth-url-preview').inputValue();
  assert.ok(oauthPreviewVal.startsWith('https://accounts.google.com/o/oauth2/v2/auth'));
  await page.locator('#add-account-dialog [data-action="copy-oauth-url"]').click();
  await page.waitForFunction(() => document.getElementById('oauth-copy-feedback')?.textContent.includes('已复制授权链接'));
  const copiedFlowIds = await page.evaluate(() => [...(window.v2Control.oauthCopiedFlows || [])]);
  assert.deepEqual(copiedFlowIds, ['abcdef123456']);
  await page.locator('#add-account-dialog [data-action="close-add-account-dialog"]').click();
  assertionsPassed += 3;

  // Simulate remainingCount > 0 on closeApp when switching claude-code account (work-3 is currently active, so work-2 ▶ switches): must abort switch & launch and alert user
  await page.locator('#pinned-app-rail [data-open-workspace="claude-code"]').click();
  await page.waitForSelector('[data-account-card="work-2"] .dock-action-btn.primary-play[data-action="switch-and-launch-account"]', { timeout: 5000 });
  await page.evaluate(() => {
    window.v2Control.closeAppOverride = { closedCount: 0, forcedCount: 0, remainingCount: 2, timedOut: false };
    window.v2Control.startedProfiles = [];
  });
  await page.locator('[data-account-card="work-2"] .dock-action-btn.primary-play[data-action="switch-and-launch-account"]').click();
  await page.waitForFunction(() => document.getElementById('toast')?.textContent.includes('剩余 2 个进程'));
  assert.equal(await page.evaluate(() => window.v2Control.activeByApp['claude-code']), 'work-3');
  assert.equal(await page.evaluate(() => window.v2Control.startedProfiles.length), 0);

  // Simulate timedOut: true on closeApp: must abort switch & launch and show timeout error
  await page.evaluate(() => {
    window.v2Control.closeAppOverride = { closedCount: 0, forcedCount: 0, remainingCount: -1, timedOut: true };
  });
  await page.locator('[data-account-card="work-2"] .dock-action-btn.primary-play[data-action="switch-and-launch-account"]').click();
  await page.waitForFunction(() => document.getElementById('toast')?.textContent.includes('超时'));
  assert.equal(await page.evaluate(() => window.v2Control.activeByApp['claude-code']), 'work-3');
  await page.evaluate(() => { window.v2Control.closeAppOverride = null; });
  assertionsPassed += 4;

  // Verify light-orange toast (#fff7ed), invalid badge on right of 加备注 row, dock auto-hide only when connected, & splash scrollbar lock
  const uiPolishCheck = await page.evaluate(async () => {
    notify('颜色对比测试提示');
    const toastEl = document.getElementById('toast');
    const cs = getComputedStyle(toastEl);
    const dockBefore = document.getElementById('navigation')?.dataset.autohide;
    window.v2Control.accounts.push({
      id: 'dead-slot', appId: 'claude-code', label: 'dead@dingtu.test', email: 'dead@dingtu.test',
      plan: 'PLUS', source: 'local-import', isActive: false, status: 'invalid', quotaState: 'refresh_failed',
      lastError: '凭据已失效 (401)', quotas: [],
    });
    await syncDesktopWorkbench();
    const deadCard = document.querySelector('[data-account-card="dead-slot"]');
    const inHeader = deadCard?.querySelector('.account-header-badges')?.innerText || '';
    const inNoteRowRight = deadCard?.querySelector('.note-chip-row .note-row-status-right')?.innerText || '';
    const symBefore = document.getElementById('dock-connect-symbol')?.innerHTML || '';
    const symBgBefore = getComputedStyle(document.getElementById('dock-connect-symbol')).backgroundImage;
    await window.NoyaDesktop.proxy.invoke('proxy.start');
    state.status = 'connected';
    render();
    const dockConnected = document.getElementById('navigation')?.dataset.autohide;
    const symConnected = document.getElementById('dock-connect-symbol')?.innerHTML || '';
    const symBgConnected = getComputedStyle(document.getElementById('dock-connect-symbol')).backgroundImage;
    const btnColorConnected = getComputedStyle(document.getElementById('dock-connect')).color;
    // Verify legacy synthetic Antigravity empty-bar / stale 100% weekly cards are filtered out
    const cleanedAgQuotas = alignDisplayQuotas('antigravity', [
      { id: 'gemini-5h', label: 'Gemini · 5h', remainingPct: 0, usedText: '0%', resetAt: '2026-11-23T12:00:00Z', tone: 'low' },
      { id: 'gemini-weekly', label: 'Gemini · Weekly', remainingPct: 100, usedText: '100%', statusHint: '周配额充足', resetAt: null, tone: 'high' },
      { id: 'claude-5h', label: 'Claude · 5h', remainingPct: 84, usedText: '84%', resetAt: '2026-11-23T12:00:00Z', tone: 'high' },
      { id: 'claude-weekly', label: 'Claude · Weekly', remainingPct: null, usedText: '≥84%', statusHint: '周窗口未触发上限', resetAt: null, tone: 'neutral' },
    ]);
    state.status = 'disconnected';
    render();
    const dockAfterDisconnect = document.getElementById('navigation')?.dataset.autohide;
    return {
      hidden: toastEl.hidden,
      color: cs.color,
      bg: cs.backgroundColor,
      inHeader,
      inNoteRowRight,
      dockBefore,
      dockConnected,
      dockAfterDisconnect,
      symBefore,
      symConnected,
      symBgBefore,
      symBgConnected,
      btnColorConnected,
      cleanedAgQuotas,
    };
  });
  assert.equal(uiPolishCheck.hidden, false);
  assert.equal(uiPolishCheck.bg, 'rgb(255, 247, 237)');
  assert.notEqual(uiPolishCheck.color, uiPolishCheck.bg);
  assert.doesNotMatch(uiPolishCheck.inHeader, /异常\/已失效/);
  assert.match(uiPolishCheck.inNoteRowRight, /异常\/已失效/);
  assert.equal(uiPolishCheck.dockBefore, 'false');
  assert.equal(uiPolishCheck.dockConnected, 'true');
  assert.equal(uiPolishCheck.dockAfterDisconnect, 'false');
  assert.notEqual(uiPolishCheck.symBefore, uiPolishCheck.symConnected);
  assert.match(uiPolishCheck.symConnected, /m12 3 8 3v6/);
  assert.match(uiPolishCheck.symBgConnected, /rgb\(34, 197, 94\)/);
  assert.match(uiPolishCheck.btnColorConnected, /rgb\(22, 163, 74\)/);
  assert.equal(uiPolishCheck.cleanedAgQuotas.length, 2);
  assert.deepEqual(uiPolishCheck.cleanedAgQuotas.map(q => q.id), ['gemini-5h', 'claude-5h']);

  await page.evaluate(() => showLaunchPromotion({ force: true }));
  await page.waitForSelector('#launch-promotion-dialog[open]', { timeout: 3000 });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden');
  await page.evaluate(() => dismissLaunchPromotion());
  await page.waitForFunction(() => !document.getElementById('launch-promotion-dialog')?.open && !document.documentElement.classList.contains('splash-active'));
  assertionsPassed += 17;

  assert.deepEqual(pageErrors, []);
  await ctx.close();

  // 6. Unauthenticated desktop boot must still populate the 17-app Cockpit overview & plaza without dropped apps or relay clutter
  const guestCtx = await browser.newContext({ reducedMotion: 'reduce' });
  await guestCtx.addInitScript(() => {
    sessionStorage.setItem('dingtu-assistant-launch-seen-v3', '1');
    window.NoyaDesktop = {
      platform: 'windows',
      auth: { invoke: async () => ({ ok: false, error: { code: 'AUTH_REQUIRED', status: 401 } }) },
      read: async () => ({ ok: false, error: { code: 'AUTH_REQUIRED', status: 401 } }),
      proxy: { invoke: async () => ({ ok: false, error: { code: 'AUTH_REQUIRED', status: 401 } }) },
      agent: { invoke: async () => ({ ok: false, error: { code: 'AUTH_REQUIRED', status: 401 } }) },
      telemetry: { invoke: async () => ({ ok: false, error: { code: 'AUTH_REQUIRED', status: 401 } }) },
      tickets: { invoke: async () => ({ ok: false, error: { code: 'AUTH_REQUIRED', status: 401 } }) },
      browser: {
        open: async () => ({ ok: false, error: { code: 'AUTH_REQUIRED', status: 401 } }),
        list: async () => ({ ok: false, error: { code: 'AUTH_REQUIRED', status: 401 } }),
        close: async () => ({ ok: false, error: { code: 'AUTH_REQUIRED', status: 401 } }),
      },
      accounts: {
        invoke: async (op) => {
          if (op === 'accounts.detectAll') {
            return { ok: true, value: { apps: { codex: { status: 'installed' }, metamuse: { status: 'web' } } } };
          }
          return { ok: false, error: { code: 'AUTH_REQUIRED', status: 401 } };
        },
      },
    };
  });
  const guestPage = await guestCtx.newPage();
  const guestErrors = [];
  guestPage.on('pageerror', e => guestErrors.push(e.message));
  await guestPage.goto(base, { waitUntil: 'domcontentloaded' });
  await guestPage.waitForSelector('#pinned-app-rail .pinned-rail-item', { timeout: 5000 });
  assert.ok((await guestPage.locator('#pinned-app-rail .pinned-rail-item').count()) >= 6);
  assert.ok((await guestPage.locator('.cockpit-overview-grid .platform-card').count()) >= 6);
  assert.doesNotMatch(await guestPage.locator('#main-content').innerText(), /中转站|模型接入源/);
  const launchStates = await guestPage.locator('[data-action="quick-launch-app"]').evaluateAll(els => els.map(e => e.getAttribute('aria-disabled') === 'true' && e.classList.contains('is-disabled')));
  assert.ok(launchStates.length >= 6 && launchStates.every(Boolean));
  await guestPage.locator('.rail-navigation [data-action="toggle-app-library"]').click();
  await guestPage.waitForSelector('#app-library .plaza-card', { timeout: 5000 });
  assert.equal(await guestPage.locator('#app-library .plaza-card').count(), 17);
  const guestPlazaText = await guestPage.locator('#app-library').innerText();
  for (const dropped of ['Trae', 'TraeWork', 'CodeBuddy', 'Qoder', 'Zed', 'ZCode']) {
    assert.equal(guestPlazaText.includes(dropped), false, `Dropped app ${dropped} must not appear in guest plaza`);
  }
  assert.doesNotMatch(await guestPage.locator('#main-content').innerText(), /中转站|模型接入源/);
  assert.deepEqual(guestErrors, []);
  assertionsPassed += 7;
  await guestCtx.close();

  console.log(JSON.stringify({ assertionsPassed, fixture: 'dingtu-v2-cockpit-e2e', ok: true }));
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
}
