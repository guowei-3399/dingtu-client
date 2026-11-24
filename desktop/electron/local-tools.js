(function (root) {
  'use strict';
  const STORAGE_KEY = 'dingtu-assistant-local-v1';
  const CREDENTIAL_POOL_KEY = 'dingtu-assistant-credential-pool-v2';
  const PLATFORMS = ['windows', 'macos', 'linux', 'ios', 'android'];
  let appDirectory = new Map();
  const appAllowed = (platform, appId) => appDirectory.get(appId)?.has(platform) === true;
  const STATES = ['disconnected', 'connecting', 'connected', 'failed', 'expired', 'no-spare'];
  const own = (object, key) => object !== null && typeof object === 'object' && Object.hasOwn(object, key);
  const get = (object, key) => own(object, key) ? object[key] : undefined;
  const clone = value => JSON.parse(JSON.stringify(value));
  const defaults = () => ({ version: 1, themes: {}, selectedApps: {}, categories: {}, settings: { startup: false, autoConnect: true, notify: true } });
  const member = (value, allowed) => typeof value === 'string' && allowed.includes(value);

  function normalizePreferences(input) {
    const output = defaults();
    if (get(input, 'version') !== 1) return output;
    for (const platform of PLATFORMS) {
      const theme = get(get(input, 'themes'), platform);
      if (member(theme, ['light', 'dark'])) output.themes[platform] = theme;
      const app = get(get(input, 'selectedApps'), platform);
      const mobile = platform === 'ios' || platform === 'android';
      if (typeof app === 'string' && appAllowed(platform, app)) output.selectedApps[platform] = app;
      const category = get(get(input, 'categories'), platform);
      if (member(category, ['全部', '编程', '通用', '任务'])) output.categories[platform] = mobile && category === '编程' ? '全部' : category;
    }
    for (const key of ['startup', 'autoConnect', 'notify']) {
      const value = get(get(input, 'settings'), key);
      if (typeof value === 'boolean') output.settings[key] = value;
    }
    return output;
  }

  function createPreferences(storage) {
    let memory = defaults();
    const unavailable = '浏览器暂时无法保存偏好，本次仍可使用。';
    return {
      load() {
        try {
          const text = storage.getItem(STORAGE_KEY);
          if (text === null) memory = defaults();
          else {
            if (typeof text !== 'string' || text.length > 16384) throw new Error('invalid');
            memory = normalizePreferences(JSON.parse(text));
          }
          return { value: clone(memory), ok: true, error: '' };
        } catch {
          memory = defaults();
          return { value: clone(memory), ok: false, error: unavailable };
        }
      },
      save(value) {
        memory = normalizePreferences(value);
        try {
          storage.setItem(STORAGE_KEY, JSON.stringify(memory));
          return { value: clone(memory), ok: true, error: '' };
        } catch {
          return { value: clone(memory), ok: false, error: unavailable };
        }
      },
      clear() {
        memory = defaults();
        try {
          storage.removeItem(STORAGE_KEY);
          return { value: clone(memory), ok: true, error: '' };
        } catch {
          return { value: clone(memory), ok: false, error: unavailable };
        }
      },
    };
  }

  // Only metadata belongs in browser storage. The native secure-store namespace
  // must independently enforce this same customer/user/provider/slot context.
  // Provider slugs are declared by the operator catalog. Keep the client
  // extensible instead of baking a finite vendor list into the data layer.
  // The slug is only metadata; the native secret store still owns the raw
  // credential and the server owns the network egress.
  const PROVIDER = /^[a-z][a-z0-9._-]{0,63}$/;
  const providerSlug = value => typeof value === 'string' && PROVIDER.test(value);
  const POOL_STATES = ['active', 'cooldown', 'exhausted', 'revoked'];
  const SLOT_FIELDS = ['id', 'provider', 'label', 'credentialRef', 'status', 'priority', 'remaining', 'quotaResetAt', 'cooldownUntil', 'cooldownDurationMs', 'lastErrorCode', 'createdAt', 'updatedAt'];
  const MAX_COOLDOWN = 30 * 24 * 60 * 60 * 1000;
  const poolDefaults = scope => ({ version: 2, scope: scope ? clone(scope) : null, slots: [] });
  const dateOrNull = value => typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
  const intOrNull = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const opaqueId = (value, limit = 100) => typeof value === 'string' && value.length <= limit && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value);
  function normalizeScope(input) {
    if (!input || input.customerType !== 'enterprise' || !['owner', 'admin'].includes(input.memberRole) || !opaqueId(input.customerId) || !opaqueId(input.userId)) throw new Error('CREDENTIAL_SCOPE_FORBIDDEN');
    return { customerId: input.customerId, userId: input.userId, customerType: 'enterprise', memberRole: input.memberRole };
  }
  function scopeKey(scope) { return scope ? [scope.customerId, scope.userId].map(encodeURIComponent).join('/') : ''; }
  function validateSlotFields(input, allowed = SLOT_FIELDS) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('CREDENTIAL_SLOT_INVALID');
    for (const key of Object.keys(input)) {
      if (/password|secret|token|api.?key|cookie|authorization|credential(?!Ref)/i.test(key)) throw new Error('RAW_CREDENTIALS_NOT_ALLOWED');
      if (!allowed.includes(key)) throw new Error('CREDENTIAL_SLOT_FIELD_NOT_ALLOWED');
    }
  }
  function normalizeSlot(input, at) {
    validateSlotFields(input);
    if (!opaqueId(input.id) || !providerSlug(input.provider) || typeof input.label !== 'string' || !input.label.trim() || input.label.length > 80 || !opaqueId(input.credentialRef, 200) || /^(sk-|eyJ)/i.test(input.credentialRef)) throw new Error('CREDENTIAL_SLOT_INVALID');
    if (!POOL_STATES.includes(input.status)) throw new Error('CREDENTIAL_SLOT_INVALID');
    return {
      id: input.id, provider: input.provider, label: input.label.trim(), credentialRef: input.credentialRef,
      status: input.status, priority: Number.isSafeInteger(input.priority) && input.priority >= 0 && input.priority <= 10000 ? input.priority : 100,
      remaining: intOrNull(input.remaining), quotaResetAt: dateOrNull(input.quotaResetAt), cooldownUntil: dateOrNull(input.cooldownUntil),
      cooldownDurationMs: Number.isSafeInteger(input.cooldownDurationMs) && input.cooldownDurationMs >= 0 ? Math.min(input.cooldownDurationMs, MAX_COOLDOWN) : null,
      lastErrorCode: ['RATE_LIMITED', 'QUOTA_EXHAUSTED', 'REVOKED'].includes(input.lastErrorCode) ? input.lastErrorCode : null,
      createdAt: dateOrNull(input.createdAt) || new Date(at).toISOString(), updatedAt: dateOrNull(input.updatedAt) || new Date(at).toISOString(),
    };
  }
  function headerValue(value, name) {
    const headers = value?.headers || value?.response?.headers;
    if (typeof headers?.get === 'function') return headers.get(name);
    if (!headers || typeof headers !== 'object') return null;
    const key = Object.keys(headers).find(key => key.toLowerCase() === name);
    return key ? headers[key] : null;
  }
  function retryDelay(value, at) {
    const raw = value && typeof value === 'object' ? headerValue(value, 'retry-after') ?? value.retryAfter ?? value.retryAt : value;
    const text = typeof raw === 'number' || typeof raw === 'string' ? String(raw).trim() : '';
    let delay = null;
    if (/^\d+(\.\d+)?$/.test(text)) delay = Number(text) * 1000;
    else if (dateOrNull(text)) {
      const serverDate = value && typeof value === 'object' ? dateOrNull(headerValue(value, 'date')) : null;
      delay = Date.parse(text) - (serverDate ? Date.parse(serverDate) : at);
    }
    return Number.isFinite(delay) && delay >= 0 ? Math.min(Math.max(1000, Math.ceil(delay)), MAX_COOLDOWN) : 60000;
  }
  const defaultPolicy = () => ({ configured: false, enabled: false, maxSlots: 0, allowedProviders: [], maxAttempts: 1, threshold5hPercent: null, threshold7dPercent: null, cooldownSeconds: null, allowTaskContinue: false });
  function normalizePolicy(input) {
    if (input == null) return defaultPolicy();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('CREDENTIAL_POLICY_INVALID');
    const keys = Object.keys(input);
    const allowed = ['enabled', 'maxSlots', 'allowedProviders', 'maxAttempts', 'threshold5hPercent', 'threshold7dPercent', 'cooldownSeconds', 'allowTaskContinue'];
    if (keys.some(key => !allowed.includes(key))) throw new Error('CREDENTIAL_POLICY_INVALID');
    if (typeof input.enabled !== 'boolean' || !Number.isSafeInteger(input.maxSlots) || input.maxSlots < 0 || input.maxSlots > 32
      || !Number.isSafeInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 4
      || typeof input.allowTaskContinue !== 'boolean') throw new Error('CREDENTIAL_POLICY_INVALID');
    const providers = input.allowedProviders;
    if (!Array.isArray(providers) || providers.length > 64 || new Set(providers).size !== providers.length || !providers.every(providerSlug)) throw new Error('CREDENTIAL_POLICY_INVALID');
    if (input.enabled && (input.maxSlots === 0 || providers.length === 0)) throw new Error('CREDENTIAL_POLICY_INVALID');
    for (const key of ['threshold5hPercent', 'threshold7dPercent']) if (input[key] !== null && (!Number.isSafeInteger(input[key]) || input[key] < 0 || input[key] > 100)) throw new Error('CREDENTIAL_POLICY_INVALID');
    if (input.cooldownSeconds !== null && (!Number.isSafeInteger(input.cooldownSeconds) || input.cooldownSeconds < 1 || input.cooldownSeconds > 86400)) throw new Error('CREDENTIAL_POLICY_INVALID');
    if (!input.enabled && input.maxSlots !== 0) throw new Error('CREDENTIAL_POLICY_INVALID');
    return { configured: true, enabled: input.enabled, maxSlots: input.maxSlots, allowedProviders: [...providers].sort(), maxAttempts: input.maxAttempts, threshold5hPercent: input.threshold5hPercent, threshold7dPercent: input.threshold7dPercent, cooldownSeconds: input.cooldownSeconds, allowTaskContinue: input.allowTaskContinue };
  }
  function createCredentialPool(storage, { now = Date.now, monotonicNow = typeof root.performance?.now === 'function' ? () => root.performance.now() : now } = {}) {
    let scope = null, state = poolDefaults(null), policy = defaultPolicy(), revision = 0, policyRevision = 0, healthy = true, queue = Promise.resolve();
    const leases = new Map(), listeners = new Set();
    let logicalTime = Number(now()), lastTick = Number(monotonicNow());
    const time = () => { const tick = Number(monotonicNow()); if (Number.isFinite(tick)) { logicalTime += Math.max(0, tick - lastTick); lastTick = tick; } if (!Number.isFinite(logicalTime)) throw new Error('CREDENTIAL_CLOCK_UNAVAILABLE'); return logicalTime; };
    const storageKey = () => CREDENTIAL_POOL_KEY + ':' + scopeKey(scope);
    const requireScope = () => { if (!scope) throw new Error('CREDENTIAL_SCOPE_REQUIRED'); };
    const requireHealthy = () => { requireScope(); if (!healthy) throw new Error('CREDENTIAL_POOL_STORAGE_UNAVAILABLE'); };
    const requirePolicy = provider => {
      if (!policy.configured || !policy.enabled) throw new Error('CREDENTIAL_POOL_NOT_ENTITLED');
      if (provider !== undefined && !policy.allowedProviders.includes(provider)) throw new Error('CREDENTIAL_PROVIDER_NOT_ALLOWED');
    };
    const emit = event => { for (const listener of listeners) listener(event); };
    const replacePolicy = next => {
      if (JSON.stringify(policy) !== JSON.stringify(next)) { policy = next; policyRevision++; leases.clear(); emit({ type: 'policy' }); }
      return clone(policy);
    };
    const write = next => {
      state = next;
      try { storage.setItem(storageKey(), JSON.stringify(state)); healthy = true; return { ok: true, error: '' }; }
      catch { healthy = false; return { ok: false, error: 'CREDENTIAL_POOL_STORAGE_UNAVAILABLE' }; }
    };
    const load = () => {
      if (!scope) return { value: clone(state), ok: true, error: '' };
      try {
        const text = storage.getItem(storageKey());
        if (text === null) state = poolDefaults(scope);
        else {
          if (typeof text !== 'string' || text.length > 65536) throw new Error('invalid');
          const input = JSON.parse(text);
          if (input.version !== 2 || scopeKey(normalizeScope(input.scope)) !== scopeKey(scope) || !Array.isArray(input.slots) || input.slots.length > 32 || Object.keys(input).some(key => !['version', 'scope', 'slots'].includes(key))) throw new Error('invalid');
          const slots = input.slots.map(slot => normalizeSlot(slot, time()));
          if (new Set(slots.map(slot => slot.id)).size !== slots.length) throw new Error('invalid');
          state = { version: 2, scope: clone(scope), slots };
          // A backwards clock across process restarts must not create an infinite cooldown.
          for (const slot of slots) if (slot.status === 'cooldown' && slot.cooldownDurationMs != null && Date.parse(slot.cooldownUntil) - time() > slot.cooldownDurationMs) slot.cooldownUntil = new Date(time() + slot.cooldownDurationMs).toISOString();
        }
        healthy = true;
        return { value: clone(state), ok: true, error: '' };
      } catch { state = poolDefaults(scope); healthy = false; leases.clear(); return { value: clone(state), ok: false, error: 'CREDENTIAL_POOL_STORAGE_UNAVAILABLE' }; }
    };
    const eligible = slot => slot.status === 'active' && slot.remaining !== 0;
    const compareSlots = (a, b) => a.priority - b.priority || Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);
    // The grant counts accounts, not currently healthy accounts. An exhausted
    // or cooling slot still consumes its place and cannot unlock extra accounts.
    const grantedSlots = () => new Set(state.slots.filter(slot => slot.status !== 'revoked' && policy.allowedProviders.includes(slot.provider)).sort(compareSlots).slice(0, policy.maxSlots).map(slot => slot.id));
    const refresh = () => {
      if (!scope || !healthy) return;
      const at = time(); let changed = false;
      const slots = state.slots.map(slot => {
        const due = slot.status === 'cooldown' ? slot.cooldownUntil : slot.status === 'exhausted' ? slot.quotaResetAt : null;
        if (due && Date.parse(due) <= at) { changed = true; return { ...slot, status: 'active', remaining: null, cooldownUntil: null, cooldownDurationMs: null, quotaResetAt: null, lastErrorCode: null, updatedAt: new Date(at).toISOString() }; }
        return slot;
      });
      if (changed) write({ ...state, slots });
    };
    const mutate = (id, patch) => {
      requireHealthy(); const index = state.slots.findIndex(slot => slot.id === id);
      if (index < 0) throw new Error('CREDENTIAL_SLOT_NOT_FOUND');
      if (state.slots[index].status === 'revoked') throw new Error('CREDENTIAL_SLOT_REVOKED');
      const slot = normalizeSlot({ ...state.slots[index], ...patch, updatedAt: new Date(time()).toISOString() }, time());
      const slots = state.slots.slice(); slots[index] = slot;
      return { slot: clone(slot), ...write({ ...state, slots }) };
    };
    const api = {
      bindScope(input) {
        let next;
        try { next = input == null ? null : normalizeScope(input); }
        catch (error) { scope = null; state = poolDefaults(null); policy = defaultPolicy(); revision++; leases.clear(); emit({ type: 'scope' }); throw error; }
        if (scopeKey(scope) === scopeKey(next) && scope?.memberRole === next?.memberRole) return { value: clone(state), ok: healthy, error: healthy ? '' : 'CREDENTIAL_POOL_STORAGE_UNAVAILABLE' };
        scope = next; state = poolDefaults(scope); policy = defaultPolicy(); revision++; leases.clear(); emit({ type: 'scope' }); return load();
      },
      configurePolicy(input) {
        requireScope();
        // A server policy can reduce the number of usable slots while the
        // local metadata remains intact for audit/recovery. Never delete or
        // rewrite a credential merely because an entitlement changed.
        let next;
        try { next = normalizePolicy(input); }
        catch (error) { replacePolicy(defaultPolicy()); throw error; }
        return replacePolicy(next);
      },
      policy() { return clone(policy); },
      load, scope() { return scope ? clone(scope) : null; },
      snapshot() { refresh(); return clone(state); },
      add(input) {
        requireHealthy(); validateSlotFields(input, ['id', 'provider', 'label', 'credentialRef', 'priority', 'remaining']);
        requirePolicy(input.provider);
        if (state.slots.length >= 32 || state.slots.filter(slot => slot.status !== 'revoked').length >= policy.maxSlots) throw new Error('CREDENTIAL_POOL_FULL');
        const slot = normalizeSlot({ ...input, status: 'active' }, time());
        if (state.slots.some(item => item.id === slot.id)) throw new Error('CREDENTIAL_SLOT_EXISTS');
        return { slot: clone(slot), ...write({ ...state, slots: [...state.slots, slot] }) };
      },
      update(id, patch) { validateSlotFields(patch, ['label', 'priority']); return mutate(id, patch); },
      revoke(id) { const result = mutate(id, { status: 'revoked', cooldownUntil: null, lastErrorCode: 'REVOKED' }); emit({ type: 'revoke', slotId: id }); return result; },
      select({ sessionKey, provider, exclude = [] } = {}) {
        requireHealthy(); refresh(); requireHealthy();
        if (!providerSlug(provider) || typeof sessionKey !== 'string' || !sessionKey || sessionKey.length > 160 || !Array.isArray(exclude)) throw new Error('CREDENTIAL_REQUEST_CONTEXT_REQUIRED');
        requirePolicy(provider);
        const leaseKey = provider + ':' + sessionKey;
        const granted = grantedSlots();
        const allowed = slot => granted.has(slot.id) && slot.provider === provider && eligible(slot) && !exclude.includes(slot.id);
        const current = state.slots.find(slot => slot.id === leases.get(leaseKey) && allowed(slot));
        const next = current || state.slots.filter(allowed).sort(compareSlots)[0] || null;
        if (next) leases.set(leaseKey, next.id); else leases.delete(leaseKey);
        return clone(next);
      },
      markRateLimited(id, retryAfter) { const delay = retryDelay(retryAfter, time()); return mutate(id, { status: 'cooldown', cooldownUntil: new Date(time() + delay).toISOString(), cooldownDurationMs: delay, lastErrorCode: 'RATE_LIMITED' }); },
      markExhausted(id, resetAt = null) { const reset = dateOrNull(resetAt); return mutate(id, { status: 'exhausted', remaining: 0, quotaResetAt: reset && Date.parse(reset) > time() ? reset : null, lastErrorCode: 'QUOTA_EXHAUSTED' }); },
      markHealthy(id, remaining = null) { return mutate(id, { status: 'active', remaining: intOrNull(remaining), cooldownUntil: null, cooldownDurationMs: null, quotaResetAt: null, lastErrorCode: null }); },
      clear() {
        requireScope(); state = poolDefaults(scope); revision++; leases.clear(); emit({ type: 'clear' });
        try { storage.removeItem(storageKey()); healthy = true; return { ok: true, error: '' }; }
        catch { healthy = false; return { ok: false, error: 'CREDENTIAL_POOL_STORAGE_UNAVAILABLE' }; }
      },
      requestContext() { requireHealthy(); requirePolicy(); return { scope: clone(scope), revision, policyRevision }; },
      assertRequestContext(context, slotId, provider) {
        requireHealthy();
        if (context.revision !== revision || scopeKey(context.scope) !== scopeKey(scope)) throw new Error('CREDENTIAL_SCOPE_CHANGED');
        if (context.policyRevision !== policyRevision) throw new Error('CREDENTIAL_POLICY_CHANGED');
        requirePolicy(provider);
        if (slotId) { const slot = state.slots.find(slot => slot.id === slotId && slot.provider === provider); if (!slot || !eligible(slot) || !grantedSlots().has(slot.id)) throw new Error('CREDENTIAL_SLOT_UNAVAILABLE'); }
      },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      enqueue(task) { const result = queue.then(task); queue = result.catch(() => {}); return result; },
    };
    return Object.freeze(api);
  }

  // The executor is a trusted local provider adapter. It must report an explicit
  // provider rejection before acceptance; an HTTP 429 or a network error alone
  // never proves a request can be replayed. No agent/tool operation is replayable.
  function createCredentialRouter(pool, { secretStore, maxAttempts = 2 } = {}) {
    if (!pool || typeof pool.enqueue !== 'function') throw new Error('CREDENTIAL_POOL_REQUIRED');
    const attemptLimit = Number.isSafeInteger(maxAttempts) ? Math.min(4, Math.max(1, maxAttempts)) : 2;
    const rejection = (value, provider, streamStarted) => {
      const status = value?.status ?? value?.response?.status;
      const record = value?.providerRejection ?? value?.response?.providerRejection;
      const codes = [value?.code, value?.error?.code, value?.error?.type, value?.response?.code, record?.code].filter(value => typeof value === 'string').join(' ');
      if (streamStarted || value?.streamStarted === true || value?.response?.streamStarted === true || status !== 429 || /auth|credential|permission|forbidden|country|region|territor|security|policy|abuse|block|disabled|suspend/i.test(codes)) return null;
      return record?.provider === provider && record.requestAccepted === false && ['rate_limited', 'quota_exhausted'].includes(record.reason) ? record.reason : null;
    };
    return Object.freeze({
      request({ provider, sessionKey, method = 'POST', replayPolicy = 'never', sideEffects = true, streaming = false, execute } = {}) {
        let context;
        try {
          context = pool.requestContext();
          if (!providerSlug(provider) || typeof sessionKey !== 'string' || !sessionKey || sessionKey.length > 160) throw new Error('CREDENTIAL_REQUEST_CONTEXT_REQUIRED');
          if (typeof execute !== 'function') throw new Error('CREDENTIAL_EXECUTOR_REQUIRED');
          if (!secretStore || typeof secretStore.available !== 'function' || typeof secretStore.get !== 'function') throw new Error('SECURE_STORE_UNAVAILABLE');
        } catch (error) { return Promise.reject(error); }
        const canReplay = sideEffects === false && ((replayPolicy === 'safe-read' && ['GET', 'HEAD', 'OPTIONS'].includes(method)) || (replayPolicy === 'inference-only' && method === 'POST'));
        return pool.enqueue(async () => {
          const policyAttempts = typeof pool.policy === 'function' ? pool.policy().maxAttempts : attemptLimit;
          const requestAttempts = Math.min(attemptLimit, policyAttempts);
          pool.assertRequestContext(context);
          let available = false;
          try { available = await secretStore.available(context.scope); } catch { /* unavailable fails closed */ }
          pool.assertRequestContext(context);
          if (available !== true) throw new Error('SECURE_STORE_UNAVAILABLE');
          const tried = [];
          let lastValue, lastWasError = false;
          for (let attempt = 0; attempt < requestAttempts; attempt++) {
            pool.assertRequestContext(context);
            const slot = pool.select({ provider, sessionKey, exclude: tried });
            if (!slot) { if (tried.length) { if (lastWasError) throw lastValue; return lastValue; } throw new Error('CREDENTIAL_POOL_EXHAUSTED'); }
            tried.push(slot.id);
            const controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
            const unsubscribe = pool.subscribe(event => { if (event.type !== 'revoke' || event.slotId === slot.id) controller?.abort(); });
            let secret, streamStarted = false;
            try {
              try { secret = await secretStore.get(slot.credentialRef, { ...context.scope, provider, slotId: slot.id }); }
              catch { throw new Error('SECURE_CREDENTIAL_UNAVAILABLE'); }
              pool.assertRequestContext(context, slot.id, provider);
              if (typeof secret !== 'string' || !secret) throw new Error('SECURE_CREDENTIAL_UNAVAILABLE');
              const onStreamStart = () => { pool.assertRequestContext(context, slot.id, provider); streamStarted = true; };
              let value, wasError = false;
              try { value = await execute({ slot: clone(slot), secret, signal: controller?.signal, onStreamStart }); }
              catch (error) { value = error; wasError = true; }
              pool.assertRequestContext(context, slot.id, provider);
              const reason = rejection(value, provider, streamStarted);
              if (reason) {
                const changed = reason === 'quota_exhausted' ? pool.markExhausted(slot.id, value?.quotaResetAt) : pool.markRateLimited(slot.id, value);
                if (!changed.ok) throw new Error('CREDENTIAL_POOL_STORAGE_UNAVAILABLE');
                if (canReplay && attempt + 1 < requestAttempts) { lastValue = value; lastWasError = wasError; continue; }
              }
              if (wasError) throw value;
              if (streaming && !reason) {
                if (value?.streamCompletion && typeof value.streamCompletion.then === 'function') await value.streamCompletion;
                else if (value?.streamCompleted !== true) throw new Error('CREDENTIAL_STREAM_COMPLETION_REQUIRED');
                pool.assertRequestContext(context, slot.id, provider);
              }
              return value;
            } finally { secret = null; unsubscribe(); }
          }
          throw new Error('CREDENTIAL_POOL_EXHAUSTED');
        });
      },
    });
  }

  const EVENTS = Object.freeze({
    connection_started: ['info', '开始模拟连接'],
    connection_connected: ['success', '模拟连接已建立'],
    connection_cancelled: ['info', '已取消模拟连接'],
    connection_disconnected: ['info', '模拟连接已断开'],
    connection_failed: ['error', '模拟连接失败，请检查网络后重试'],
    connection_expired: ['warning', '演示套餐已到期'],
    no_spare: ['error', '演示出口不可用，暂无备用'],
    failover: ['warning', '模拟专属备用已接管'],
    permission_cancelled: ['info', '已取消模拟权限授权'],
    account_sync_failed: ['error', '账号授权同步未完成，请查看授权提示后重试'],
    agent_instance_started: ['success', '应用实例已提交启动'],
    browser_started: ['success', '隔离浏览器已启动，授权页面沿用同一代理链路'],
    app_opened: ['info', '已选择应用官方入口'],
    app_demo: ['info', '已演示应用接入与启动'],
    preferences_saved: ['info', '已更新本机偏好'],
    storage_unavailable: ['warning', '浏览器偏好存储不可用'],
    copy_failed: ['warning', '自动复制未完成，可手动复制'],
  });

  function safeEvent(code, details, id, at) {
    if (!own(EVENTS, code) || typeof code !== 'string') return null;
    const [level, previewMessage] = EVENTS[code];
    const realMessages={connection_started:'正在启动本机代理',connection_connected:'本机代理已启动',connection_cancelled:'已取消连接',connection_disconnected:'本机代理已停止',connection_failed:'本机代理启动失败，请查看连接提示后重试',connection_expired:'连接权限已到期',no_spare:'服务端没有可用备用出口',failover:'服务端备用出口已接管'};
    const message=get(details,'simulated')===false?(realMessages[code]||previewMessage):previewMessage;
    const output = { id, at, code, level, message, simulated: get(details, 'simulated') !== false, read: get(details, 'read') === true };
    if (member(get(details, 'platform'), PLATFORMS)) output.platform = details.platform;
    if (typeof get(details, 'appId') === 'string' && appAllowed(get(details, 'platform'), get(details, 'appId'))) output.appId = details.appId;
    return output;
  }

  function createEventLog({ limit = 80, now = Date.now } = {}) {
    const capacity = Number.isFinite(limit) ? Math.min(200, Math.max(1, Math.trunc(limit))) : 80;
    let rows = [], sequence = 0;
    return {
      add(code, details = {}) {
        const timestamp = new Date(now());
        const at = Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : new Date().toISOString();
        const event = safeEvent(code, details, 'local-' + (++sequence), at);
        if (!event) return null;
        rows.unshift(event);
        rows = rows.slice(0, capacity);
        return clone(event);
      },
      list() { return clone(rows); },
      markAllRead() { rows.forEach(row => { row.read = true; }); },
      clear() { rows = []; },
      unreadCount() { return rows.filter(row => !row.read).length; },
    };
  }

  function buildDiagnostic(input = {}) {
    const platform = member(get(input, 'platform'), PLATFORMS) ? input.platform : 'windows';
    const theme = member(get(input, 'theme'), ['light', 'dark']) ? input.theme : 'light';
    const mobile = platform === 'ios' || platform === 'android';
    const selectedApp = typeof get(input, 'selectedApp') === 'string' && appAllowed(platform, get(input, 'selectedApp')) ? input.selectedApp : null;
    const status = member(get(input, 'status'), STATES) ? input.status : 'disconnected';
    const dimension = value => Number.isFinite(value) ? Math.max(0, Math.min(20000, Math.round(value))) : 0;
    const events = Array.isArray(get(input, 'events')) ? input.events.slice(0, 80).map((event, index) => {
      const at = get(event, 'at');
      if (typeof at !== 'string' || at.length > 40 || !Number.isFinite(Date.parse(at))) return null;
      return safeEvent(get(event, 'code'), event, 'local-' + (index + 1), new Date(at).toISOString());
    }).filter(Boolean) : [];
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      mode: 'browser-preview',
      realTunnel: false,
      environment: {
        platform, theme,
        online: typeof get(input, 'online') === 'boolean' ? input.online : null,
        storageAvailable: get(input, 'storageAvailable') === true,
        viewport: { width: dimension(get(get(input, 'viewport'), 'width')), height: dimension(get(get(input, 'viewport'), 'height')) },
      },
      connection: { state: status, simulated: true, selectedApp },
      events,
    };
  }

  function configureAppDirectory(apps) {
    if (!Array.isArray(apps)) throw new Error('APP_DIRECTORY_INVALID');
    const next = new Map();
    for (const app of apps) {
      const id = typeof app === 'string' ? app : app?.id;
      if (!opaqueId(id, 64)) continue;
      const platforms = typeof app === 'object' && app?.platforms && typeof app.platforms === 'object'
        ? Object.entries(app.platforms).filter(([, template]) => template?.status !== 'hidden').map(([platform]) => platform)
        : typeof app === 'object' && app?.mobile ? ['ios', 'android'] : ['windows', 'macos', 'linux'];
      next.set(id, new Set(platforms));
    }
    appDirectory = next;
    return { count: appDirectory.size };
  }
  root.AssistantLocal = Object.freeze({ configureAppDirectory, createPreferences, createCredentialPool, createCredentialRouter, createEventLog, buildDiagnostic });
})(globalThis);
