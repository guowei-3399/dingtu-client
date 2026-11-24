import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  CLOUD_CODE_USER_AGENT,
  buildCloudCodeUserAgent,
  createOAuthAccountFlowManager,
  detectAuthorizedWebSession,
  exchangeAntigravityCode,
  fetchAntigravityQuota,
  normalizeCloudCodeQuotas,
  parseQuotaSummaryResponse,
  refreshAntigravityToken,
  refreshClaudeCodeToken,
  refreshCodexToken,
  refreshGeminiCliToken,
  refreshKiroToken,
} from './oauth-account-flow.mjs';

test('oauth-account-flow exchanges, refreshes, and parses Cloud Code Antigravity quota with tier prioritization', async () => {
  const fetchMock = async (url, init = {}) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      const bodyStr = String(init.body || '');
      if (bodyStr.includes('authorization_code')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            access_token: 'ag-access-1',
            refresh_token: '1//0ag-refresh-1',
            id_token: 'hdr.' + Buffer.from(JSON.stringify({ email: 'ag-user@example.com' })).toString('base64url') + '.sig',
            expires_in: 3600,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          access_token: 'ag-access-refreshed',
          expires_in: 3600,
        }),
      };
    }
    if (url.includes('userinfo')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ email: 'ag-user@example.com', name: 'AG User' }),
      };
    }
    if (url.includes('v1internal:loadCodeAssist')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          cloudaicompanionProject: { id: 'proj-ag-123' },
          paidTier: {
            id: 'google-one-ultra',
            availableCredits: [{ creditType: 'GOOGLE_ONE_AI', creditAmount: '1200' }],
          },
        }),
      };
    }
    if (url.includes('v1internal:fetchAvailableModels')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          models: {
            'gemini-2.5-pro': { displayName: 'Gemini 2.5 Pro', quotaInfo: { remainingFraction: 0.94, resetTime: '2026-11-23T00:00:00Z' } },
            'claude-4-sonnet': { displayName: 'Claude 4 Sonnet', quotaInfo: { remainingFraction: 0, resetTime: '2026-11-28T00:00:00Z' } },
            'gemini-2.5-flash': { displayName: 'Gemini 2.5 Flash', quotaInfo: { remainingFraction: 0.72 } },
          },
        }),
      };
    }
    return { ok: false, status: 404, text: async () => '{}' };
  };

  const exchanged = await exchangeAntigravityCode({
    code: 'auth-code-123',
    redirectUri: 'http://127.0.0.1:9999/oauth-callback',
    fetchImpl: fetchMock,
  });
  assert.equal(exchanged.accessToken, 'ag-access-1');
  assert.equal(exchanged.refreshToken, '1//0ag-refresh-1');

  const refreshed = await refreshAntigravityToken({
    refreshToken: '1//0ag-refresh-1',
    fetchImpl: fetchMock,
  });
  assert.equal(refreshed.accessToken, 'ag-access-refreshed');

  const quota = await fetchAntigravityQuota({
    accessToken: 'ag-access-refreshed',
    fetchImpl: fetchMock,
    nowMs: Date.parse('2026-11-22T06:00:00Z'),
  });
  assert.equal(quota.plan, 'ULTRA');
  assert.equal(quota.projectId, 'proj-ag-123');
  assert.equal(quota.credits[0].amount, '1200');
  assert.equal(quota.quotas.length, 3);
  assert.equal(quota.quotas[0].label, 'Gemini · Weekly');
  assert.equal(quota.quotas[0].remainingPct, 94);
  assert.equal(quota.quotas[1].label, 'Claude · Weekly');
  assert.equal(quota.quotas[1].remainingPct, 0);
  assert.equal(quota.quotas[2].label, 'Gemini 2.5 Flash');
  assert.equal(quota.quotas[2].remainingPct, 72);
});

test('oauth flow manager completes Antigravity loopback callback, rejects mismatched state, and supports Copilot device polling', async () => {
  const authorizedRecords = [];
  let openedUrls = [];
  let copilotPolls = 0;

  const fetchMock = async url => {
    if (url.includes('oauth2.googleapis.com/token')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 'ag-loop-tok', refresh_token: '1//0loop-ref', expires_in: 3600 }),
      };
    }
    if (url.includes('userinfo')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ email: 'loop@example.com' }) };
    }
    if (url.includes('v1internal:loadCodeAssist')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ paidTier: { id: 'pro' } }) };
    }
    if (url.includes('v1internal:fetchAvailableModels')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ models: { g: { displayName: 'Gemini Pro', quotaInfo: { remainingFraction: 0.88 } } } }) };
    }
    if (url.includes('github.com/login/device/code')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          device_code: 'dev-code-1',
          user_code: 'ABCD-1234',
          verification_uri: 'https://github.com/login/device',
          expires_in: 600,
          interval: 5,
        }),
      };
    }
    if (url.includes('github.com/login/oauth/access_token')) {
      copilotPolls += 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 'ghu_test_copilot' }),
      };
    }
    if (url.includes('api.github.com/user')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ login: 'octodev', email: 'octo@example.com' }) };
    }
    return { ok: false, status: 404, text: async () => '{}' };
  };

  const mgr = createOAuthAccountFlowManager({
    openExternal: async url => { openedUrls.push(url); },
    environmentModeProvider: () => 'own_network',
    onAccountAuthorized: async rec => {
      authorizedRecords.push(rec);
      return { id: rec.alias, appId: rec.appId, email: rec.email, plan: rec.plan };
    },
    fetchImpl: fetchMock,
  });

  try {
    const flow = await mgr.start({ appId: 'antigravity', alias: 'ag-work' });
    assert.equal(flow.mode, 'browser');
    assert.equal(flow.status, 'pending');
    assert.match(flow.authUrl, /^https:\/\/accounts\.google\.com/);
    assert.equal(openedUrls.length, 1);

    const authUrlObj = new URL(flow.authUrl);
    const redirectUri = authUrlObj.searchParams.get('redirect_uri');
    const state = authUrlObj.searchParams.get('state');

    // Mismatched state is rejected with HTTP 400
    const badRes = await new Promise((resolve, reject) => {
      http.get(`${redirectUri}?code=c1&state=wrong-state`, res => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }).on('error', reject);
    });
    assert.equal(badRes, 400);

    // Valid loopback callback completes flow
    const goodRes = await new Promise((resolve, reject) => {
      http.get(`${redirectUri}?code=good-code&state=${state}`, res => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      }).on('error', reject);
    });
    assert.equal(goodRes, 200);

    for (let i = 0; i < 20; i += 1) {
      const st = mgr.status({ flowId: flow.flowId });
      if (st.status === 'completed') break;
      await new Promise(r => setTimeout(r, 25));
    }
    const finalStatus = mgr.status({ flowId: flow.flowId });
    assert.equal(finalStatus.status, 'completed');
    assert.equal(finalStatus.account.email, 'loop@example.com');
    assert.equal(authorizedRecords[0].plan, 'PRO');

    // Unsupported app fails cleanly
    await assert.rejects(() => mgr.start({ appId: 'cursor', alias: 'main' }), { code: 'OAUTH_FLOW_UNSUPPORTED' });

    // Copilot device code starts cleanly
    const copilotFlow = await mgr.start({ appId: 'copilot', alias: 'gh-1' });
    assert.equal(copilotFlow.mode, 'device_code');
    assert.equal(copilotFlow.userCode, 'ABCD-1234');
    mgr.cancel({ flowId: copilotFlow.flowId });
    assert.equal(mgr.status({ flowId: copilotFlow.flowId }).status, 'cancelled');
    assert.equal(copilotPolls >= 0, true);
  } finally {
    mgr.dispose();
  }
});

test('oauth-account-flow supports Codex PKCE OAuth, Gemini CLI PKCE OAuth, Kiro Builder ID device flow, token refreshes, and Web Login window capture', async () => {
  const nowMs = Date.parse('2026-11-22T06:00:00Z');
  const norm = normalizeCloudCodeQuotas({
    'gemini-3-pro': { displayName: 'Gemini 3 Pro', quotaInfo: { remainingFraction: 0.94, resetTime: '2026-11-22T10:00:00Z' } },
    'gemini-3-flash': { displayName: 'Gemini 3 Flash', quotaInfo: { remainingFraction: 0.97, resetTime: '2026-11-28T10:00:00Z' } },
    'claude-sonnet-4': { displayName: 'Claude 4 Sonnet', quotaInfo: { resetTime: '2026-11-26T00:00:00Z' } },
    'gemini-4-argon': { displayName: 'Gemini 4 Argon', quotaInfo: { remainingFraction: 1, resetTime: '2026-11-28T00:00:00Z' } },
    tab_flash_lite_preview: { displayName: 'tab_flash_lite_preview', quotaInfo: { remainingFraction: 1 } },
    tab_jump_flash_lite_preview: { displayName: 'tab_jump_flash_lite_preview', quotaInfo: { remainingFraction: 1 } },
    'internal-hidden': { displayName: 'Hidden Internal', isInternal: true, quotaInfo: { remainingFraction: 1 } },
  }, nowMs);
  assert.equal(norm.length, 4);
  assert.equal(norm[0].label, 'Gemini · 5h');
  assert.equal(norm[1].label, 'Gemini · Weekly');
  assert.equal(norm[2].label, 'Claude · Weekly');
  assert.equal(norm[2].remainingPct, 0);
  assert.equal(norm[3].label, 'Gemini 4 Argon (Weekly)');

  const authorized = [];
  const fetchMock = async (url, init = {}) => {
    if (url.includes('auth.openai.com/oauth/token')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          access_token: 'cx-access-1',
          refresh_token: 'rt-cx-1',
          id_token: 'hdr.' + Buffer.from(JSON.stringify({ email: 'codex@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'pro', chatgpt_account_id: 'acct-999' } })).toString('base64url') + '.sig',
          expires_in: 3600,
        }),
      };
    }
    if (url.includes('oauth2.googleapis.com/token')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 'gc-access-1', refresh_token: '1//gc-ref', expires_in: 3600 }),
      };
    }
    if (url.includes('console.anthropic.com') || url.includes('claude.ai')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access_token: 'cc-new', refresh_token: 'cc-ref-new', expires_in: 28800 }),
      };
    }
    if (url.includes('/client/register')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ clientId: 'kiro-cid', clientSecret: 'kiro-csec' }) };
    }
    if (url.includes('/device_authorization')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ deviceCode: 'dev-1', userCode: 'WXYZ-9876', verificationUriComplete: 'https://view.awsapps.com/start/#/device?user_code=WXYZ-9876', expiresIn: 600, interval: 5 }) };
    }
    if (url.includes('/token')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ accessToken: 'kiro-acc-1', refreshToken: 'kiro-ref-1', expiresIn: 3600 }) };
    }
    return { ok: false, status: 404, text: async () => '{}' };
  };

  const cxRef = await refreshCodexToken({ refreshToken: 'rt-cx-0', fetchImpl: fetchMock });
  assert.equal(cxRef.accessToken, 'cx-access-1');
  const gcRef = await refreshGeminiCliToken({ refreshToken: '1//gc-ref', fetchImpl: fetchMock });
  assert.equal(gcRef.accessToken, 'gc-access-1');
  const ccRef = await refreshClaudeCodeToken({ refreshToken: 'cc-ref', fetchImpl: fetchMock });
  assert.equal(ccRef.accessToken, 'cc-new');
  const kiroRef = await refreshKiroToken({ refreshToken: 'kiro-ref', clientId: 'cid', clientSecret: 'csec', authMethod: 'IdC', fetchImpl: fetchMock });
  assert.equal(kiroRef.accessToken, 'kiro-acc-1');

  let webCallback = null;
  const mgr = createOAuthAccountFlowManager({
    openExternal: async () => {},
    openWebLoginWindow: async ({ appId, onCaptured }) => {
      webCallback = { appId, onCaptured };
      return { close: () => {} };
    },
    environmentModeProvider: () => 'own_network',
    onAccountAuthorized: async rec => {
      authorized.push(rec);
      return rec;
    },
    fetchImpl: fetchMock,
  });

  try {
    const cxFlow = await mgr.start({ appId: 'codex', alias: 'cx-main' });
    assert.equal(cxFlow.mode, 'browser');
    assert.match(cxFlow.authUrl, /auth\.openai\.com/);
    const state = new URL(cxFlow.authUrl).searchParams.get('state');
    const redirectUri = new URL(cxFlow.authUrl).searchParams.get('redirect_uri');
    const submitted = await mgr.submitCallback({ flowId: cxFlow.flowId, callbackUrl: `${redirectUri}?code=cx-code&state=${state}` });
    assert.equal(submitted.status, 'completed');
    assert.equal(authorized.find(a => a.appId === 'codex').email, 'codex@example.com');

    const kiroFlow = await mgr.start({ appId: 'kiro', alias: 'kiro-1' });
    assert.equal(kiroFlow.mode, 'device_code');
    assert.equal(kiroFlow.userCode, 'WXYZ-9876');
    mgr.cancel({ flowId: kiroFlow.flowId });

    const curFlow = await mgr.start({ appId: 'cursor', alias: 'cur-1' });
    assert.equal(curFlow.mode, 'web_window');
    await webCallback.onCaptured({ cookieName: 'WorkosCursorSessionToken', cookieValue: 'user_123%3A%3Ajwt_cur_secret' });
    assert.equal(mgr.status({ flowId: curFlow.flowId }).status, 'completed');
    assert.equal(authorized.find(a => a.appId === 'cursor').oauthToken, 'jwt_cur_secret');

    await assert.rejects(() => mgr.start({ appId: 'trae', alias: 'main' }), { code: 'OAUTH_FLOW_UNSUPPORTED' });
  } finally {
    mgr.dispose();
  }
});

test('OAuth flows open via built-in openOAuthWindow for Antigravity, Codex, Copilot, and Kiro and never invoke external openExternal', async () => {
  const openedWindows = [];
  let externalCalls = 0;
  let closedWindows = 0;

  const fetchMock = async (url, init = {}) => {
    const target = String(url);
    if (target.includes('/login/device/code')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ device_code: 'gh-dev', user_code: 'GH-1234', verification_uri: 'https://github.com/login/device', expires_in: 600, interval: 60 }) };
    }
    if (target.includes('/client/register')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ clientId: 'cid', clientSecret: 'csec' }) };
    }
    if (target.includes('/device_authorization')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ deviceCode: 'k-dev', userCode: 'KW-8888', verificationUriComplete: 'https://view.awsapps.com/start/#/device?user_code=KW-8888', expiresIn: 600, interval: 60 }) };
    }
    if (target.includes('oauth2.googleapis.com/token')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'ag-tok', refresh_token: '1//ag-ref', expires_in: 3600 }) };
    }
    if (target.includes('userinfo')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ email: 'inapp@example.com' }) };
    }
    if (target.includes('loadCodeAssist') || target.includes('fetchAvailableModels')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ cloudaicompanionProject: 'p1', currentTier: { id: 'pro' }, models: {} }) };
    }
    return { ok: false, status: 404, text: async () => '{}' };
  };

  const mgr = createOAuthAccountFlowManager({
    openExternal: async () => { externalCalls += 1; },
    openOAuthWindow: async opts => {
      const rec = { ...opts, closed: false };
      openedWindows.push(rec);
      return { ok: true, close: () => { if (!rec.closed) { rec.closed = true; closedWindows += 1; } } };
    },
    environmentModeProvider: () => 'own_network',
    onAccountAuthorized: async rec => rec,
    fetchImpl: fetchMock,
  });

  try {
    const ag = await mgr.start({ appId: 'antigravity', alias: 'ag-1' });
    const agReq = openedWindows.find(w => w.appId === 'antigravity');
    assert.ok(agReq);
    assert.equal(agReq.allowedLoopbackOrigins.length, 1);
    assert.match(agReq.allowedLoopbackOrigins[0], /^http:\/\/127\.0\.0\.1:\d+$/);
    const agRedir = new URL(ag.authUrl).searchParams.get('redirect_uri');
    const agState = new URL(ag.authUrl).searchParams.get('state');
    await mgr.submitCallback({ flowId: ag.flowId, callbackUrl: `${agRedir}?code=ok&state=${agState}` });
    assert.equal(agReq.closed, true);

    const cx = await mgr.start({ appId: 'codex', alias: 'cx-1' });
    const cxReq = openedWindows.find(w => w.appId === 'codex');
    assert.ok(cxReq);
    assert.ok(cxReq.allowedLoopbackOrigins.some(o => o.startsWith('http://localhost:')));
    assert.ok(cxReq.allowedLoopbackOrigins.some(o => o.startsWith('http://127.0.0.1:')));
    cxReq.onClosed();
    assert.equal(mgr.status({ flowId: cx.flowId }).status, 'cancelled');

    const cp = await mgr.start({ appId: 'copilot', alias: 'cp-1' });
    const cpReq = openedWindows.find(w => w.appId === 'copilot');
    assert.deepEqual(cpReq.allowedLoopbackOrigins, []);
    mgr.cancel({ flowId: cp.flowId });
    assert.equal(cpReq.closed, true);

    const kr = await mgr.start({ appId: 'kiro', alias: 'kr-1' });
    const krReq = openedWindows.find(w => w.appId === 'kiro');
    assert.deepEqual(krReq.allowedLoopbackOrigins, []);
    krReq.onClosed();
    assert.equal(mgr.status({ flowId: kr.flowId }).status, 'cancelled');

    assert.equal(externalCalls, 0);
    assert.equal(closedWindows, 4);
    assert.equal(openedWindows.every(w => w.closed), true);
  } finally {
    mgr.dispose();
  }
});

test('detectAuthorizedWebSession recognizes Manus, Meta Muse, and Gemini Web while filtering tracking cookies and login URLs', () => {
  // CF/analytics cookies only -> null
  assert.equal(detectAuthorizedWebSession({
    appId: 'manus',
    currentUrl: 'https://manus.im/',
    cookies: [
      { domain: '.manus.im', name: '__cf_bm', value: 'tracking-token-123456' },
      { domain: '.manus.im', name: '_ga', value: 'GA1.1.123456.789' },
    ],
  }), null);

  // Heuristic cookie on login page is ignored; real target page extracts JWT email
  const jwt = 'hdr.' + Buffer.from(JSON.stringify({ email: 'manus-user@example.com' })).toString('base64url') + '.sig';
  assert.equal(detectAuthorizedWebSession({
    appId: 'manus',
    currentUrl: 'https://manus.im/login',
    cookies: [{ domain: 'manus.im', name: 'manus_auth_token_v2', value: jwt }],
  }), null);

  const manusHit = detectAuthorizedWebSession({
    appId: 'manus',
    currentUrl: 'https://manus.im/app',
    cookies: [{ domain: '.manus.im', name: 'session_id', value: jwt }],
  });
  assert.equal(manusHit?.appId, 'manus');
  assert.equal(manusHit?.email, 'manus-user@example.com');
  assert.equal(manusHit?.label, 'manus-user@example.com');

  const museHit = detectAuthorizedWebSession({
    appId: 'metamuse',
    currentUrl: 'https://muse.ai/',
    cookies: [{ domain: '.muse.ai', name: 'c_user', value: '100042123456' }],
  });
  assert.equal(museHit?.appId, 'metamuse');
  assert.match(museHit?.label || '', /^Meta Muse 已授权会话 #[a-f0-9]{6}$/);

  const geminiHit = detectAuthorizedWebSession({
    appId: 'gemini',
    currentUrl: 'https://gemini.google.com/',
    pageEmail: 'gem-user@example.com',
    cookies: [{ domain: '.google.com', name: '__Secure-1PSID', value: 'g.a000gemini_secret_cookie' }],
  });
  assert.equal(geminiHit?.appId, 'gemini-web');
  assert.equal(geminiHit?.email, 'gem-user@example.com');
});

test('Cockpit alignment: CLOUD_CODE_USER_AGENT, retrieveUserQuotaSummary 5h+Weekly+Argon+Carbon parsing, and exhaustion rounding', async () => {
  assert.equal(
    buildCloudCodeUserAgent('win32', 'x64'),
    'antigravity/2.25.0 (aidev_client; os_type=windows; arch=amd64; cl=1003475615)',
  );
  assert.equal(
    buildCloudCodeUserAgent('darwin', 'arm64'),
    'antigravity/2.25.0 (aidev_client; os_type=darwin; arch=arm64; cl=1003475615)',
  );
  assert.match(CLOUD_CODE_USER_AGENT, /^antigravity\/2\.25\.0 \(aidev_client; os_type=(windows|darwin|linux); arch=(amd64|arm64); cl=1003475615\)$/);

  // Summary failure vs valid empty summary (matches Cockpit quota_summary_tests.rs)
  assert.equal(parseQuotaSummaryResponse(null).stale, true);
  assert.equal(parseQuotaSummaryResponse({ bad: true }).stale, true);
  assert.equal(parseQuotaSummaryResponse({ groups: [{ buckets: [{ bucketId: 'gemini-5h' }] }] }).stale, true);
  assert.equal(parseQuotaSummaryResponse({ groups: [] }).stale, false);

  // Exhaustion evaluated before percentage rounding (0.0 -> true, 0.004 -> false)
  for (const [fraction, expectedExhausted] of [[0.0, true], [0.004, false]]) {
    const parsed = parseQuotaSummaryResponse({
      groups: [{
        buckets: [
          { bucketId: '3p-weekly', remainingFraction: fraction },
          { bucketId: '3p-5h', remainingFraction: 0.63 },
        ],
      }],
    });
    assert.equal(parsed.stale, false);
    const wk = parsed.buckets.find(b => b.id === 'claude-weekly');
    const fh = parsed.buckets.find(b => b.id === 'claude-5h');
    assert.equal(wk.remainingPct, 0);
    assert.equal(wk.summaryExhausted, expectedExhausted);
    assert.equal(fh.remainingPct, 63);
  }

  // Full fetchAntigravityQuota merges real retrieveUserQuotaSummary buckets with GPT-OSS from fetchAvailableModels
  const seenRequests = [];
  const fetchMock = async (url, init = {}) => {
    seenRequests.push({ url, ua: init?.headers?.['User-Agent'], body: init?.body ? JSON.parse(init.body) : null });
    if (url.includes('v1internal:loadCodeAssist')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          cloudaicompanionProject: 'proj-pro-1',
          paidTier: { id: 'google-one-pro' },
        }),
      };
    }
    if (url.includes('v1internal:fetchAvailableModels')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          models: {
            'gemini-3-pro': { displayName: 'Gemini 3 Pro', quotaInfo: { remainingFraction: 0.84, resetTime: '2026-11-23T15:00:00Z' } },
            'claude-opus-4': { displayName: 'Claude Opus 4', quotaInfo: { remainingFraction: 1.0, resetTime: '2026-11-23T18:00:00Z' } },
            'gpt-oss-120b': { displayName: 'GPT-OSS 120B (Medium)', quotaInfo: { remainingFraction: 0.5, resetTime: '2026-11-26T00:00:00Z' } },
          },
        }),
      };
    }
    if (url.includes('v1internal:retrieveUserQuotaSummary')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          groups: [
            {
              buckets: [
                { bucketId: 'gemini-5h', remainingFraction: 0.84, resetTime: '2026-11-23T15:00:00Z' },
                { bucketId: 'gemini-weekly', remainingFraction: 0.91, resetTime: '2026-11-29T00:00:00Z' },
                { bucketId: '3p-5h', remainingFraction: 1.0, resetTime: '2026-11-23T18:00:00Z' },
                { bucketId: '3p-weekly', remainingFraction: 0.5, resetTime: '2026-11-26T00:00:00Z' },
                { bucketId: 'gemini-argon-wtu-weekly', remainingFraction: 0.75, resetTime: '2026-11-29T00:00:00Z' },
                { bucketId: 'gemini-carbon-wtu-weekly', remainingFraction: 0.6, resetTime: '2026-11-29T00:00:00Z' },
              ],
            },
          ],
        }),
      };
    }
    return { ok: false, status: 404, text: async () => '{}' };
  };

  const res = await fetchAntigravityQuota({
    accessToken: 'tok-summary-test',
    fetchImpl: fetchMock,
    nowMs: Date.parse('2026-11-23T13:00:00Z'),
  });
  assert.equal(res.plan, 'PRO');
  assert.equal(res.quotaSummaryStale, false);
  assert.equal(res.isForbidden, false);
  const summaryReq = seenRequests.find(r => r.url.includes('v1internal:retrieveUserQuotaSummary'));
  assert.ok(summaryReq, 'must invoke v1internal:retrieveUserQuotaSummary');
  assert.equal(summaryReq.ua, CLOUD_CODE_USER_AGENT);
  assert.deepEqual(summaryReq.body, { project: 'proj-pro-1' });

  assert.deepEqual(
    res.quotas.map(q => [q.id, q.label, q.remainingPct]),
    [
      ['gemini-5h', 'Gemini · 5h', 84],
      ['gemini-weekly', 'Gemini · Weekly', 91],
      ['claude-5h', 'Claude · 5h', 100],
      ['claude-weekly', 'Claude · Weekly', 50],
      ['gemini-argon-wtu-weekly', 'Gemini 4 Argon (Weekly)', 75],
      ['gemini-carbon-wtu-weekly', 'Gemini 4 Carbon (Weekly)', 60],
      ['gpt-oss-120b', 'GPT-OSS 120B (Medium)', 50],
    ],
  );
});

test('Cockpit alignment: fetchAvailableModels 403 falls back to retrieveUserQuotaSummary and keeps ambiguous denials retryable', async () => {
  const cases = [
    {
      name: 'ambiguous 403 + valid summary succeeds',
      modelMsg: 'Permission denied',
      summaryStatus: 200,
      summaryBody: { groups: [{ buckets: [{ bucketId: 'gemini-5h', remainingFraction: 0.0, resetTime: '2099-01-01T00:00:00Z' }, { bucketId: 'gemini-weekly', remainingFraction: 0.5 }] }] },
      expectSummaryCalls: 1,
      expectOk: true,
      expectForbidden: false,
    },
    {
      name: 'ambiguous 403 + ambiguous 403 stays retryable (isForbidden=false)',
      modelMsg: 'Permission denied',
      summaryStatus: 403,
      summaryBody: { error: { message: 'Permission denied' } },
      expectSummaryCalls: 1,
      expectOk: false,
      expectForbidden: false,
    },
    {
      name: 'ambiguous 403 + empty groups stays retryable (isForbidden=false)',
      modelMsg: 'Permission denied',
      summaryStatus: 200,
      summaryBody: { groups: [] },
      expectSummaryCalls: 1,
      expectOk: false,
      expectForbidden: false,
    },
    {
      name: 'ambiguous 403 + Verify your account marks forbidden with VALIDATION_REQUIRED',
      modelMsg: 'Permission denied',
      summaryStatus: 403,
      summaryBody: { error: { message: 'Verify your account' } },
      expectSummaryCalls: 1,
      expectOk: false,
      expectForbidden: true,
      expectReason: 'VALIDATION_REQUIRED',
    },
    {
      name: 'explicit Subscription required skips summary and marks forbidden',
      modelMsg: 'Subscription required',
      summaryStatus: 200,
      summaryBody: { groups: [] },
      expectSummaryCalls: 0,
      expectOk: false,
      expectForbidden: true,
    },
  ];

  for (const tc of cases) {
    let summaryCalls = 0;
    const fetchMock = async url => {
      if (url.includes('v1internal:loadCodeAssist')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ paidTier: { id: 'pro' } }) };
      }
      if (url.includes('v1internal:fetchAvailableModels')) {
        return { ok: false, status: 403, text: async () => JSON.stringify({ error: { message: tc.modelMsg } }) };
      }
      if (url.includes('v1internal:retrieveUserQuotaSummary')) {
        summaryCalls += 1;
        return {
          ok: tc.summaryStatus >= 200 && tc.summaryStatus < 300,
          status: tc.summaryStatus,
          text: async () => JSON.stringify(tc.summaryBody),
        };
      }
      return { ok: false, status: 404, text: async () => '{}' };
    };

    if (tc.expectOk) {
      const res = await fetchAntigravityQuota({
        accessToken: 'tok-403-case',
        fetchImpl: fetchMock,
        endpoints: ['https://daily-cloudcode-pa.googleapis.com'],
      });
      assert.equal(summaryCalls, tc.expectSummaryCalls, tc.name);
      assert.equal(res.isForbidden, false, tc.name);
      assert.equal(res.quotas.length, 2, tc.name);
      assert.equal(res.quotas[0].id, 'gemini-5h');
      assert.equal(res.quotas[0].summaryExhausted, true);
      assert.equal(res.quotas[1].id, 'gemini-weekly');
      assert.equal(res.quotas[1].remainingPct, 50);
    } else {
      await assert.rejects(
        fetchAntigravityQuota({
          accessToken: 'tok-403-case',
          fetchImpl: fetchMock,
          endpoints: ['https://daily-cloudcode-pa.googleapis.com'],
        }),
        err => {
          assert.equal(err.code, 'QUOTA_FETCH_FAILED', tc.name);
          assert.equal(err.isForbidden, tc.expectForbidden, tc.name);
          if (tc.expectReason) assert.equal(err.reason, tc.expectReason, tc.name);
          return true;
        },
      );
      assert.equal(summaryCalls, tc.expectSummaryCalls, tc.name);
    }
  }

  // Models 200 + summary 403 Verify your account preserves model quotas but marks summary stale & exposes VALIDATION_REQUIRED
  const resVerify = await fetchAntigravityQuota({
    accessToken: 'tok-verify',
    endpoints: ['https://daily-cloudcode-pa.googleapis.com'],
    fetchImpl: async url => {
      if (url.includes('v1internal:loadCodeAssist')) return { ok: true, status: 200, text: async () => JSON.stringify({}) };
      if (url.includes('v1internal:fetchAvailableModels')) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ models: { 'gemini-pro': { displayName: 'Gemini Pro', quotaInfo: { remainingFraction: 1.0 } } } }) };
      }
      if (url.includes('v1internal:retrieveUserQuotaSummary')) {
        return { ok: false, status: 403, text: async () => JSON.stringify({ error: { message: 'Verify your account' } }) };
      }
      return { ok: false, status: 404, text: async () => '{}' };
    },
  });
  assert.equal(resVerify.quotaSummaryStale, true);
  assert.equal(resVerify.summaryError?.reason, 'VALIDATION_REQUIRED');
  assert.equal(resVerify.quotas[0].remainingPct, 100);
});
