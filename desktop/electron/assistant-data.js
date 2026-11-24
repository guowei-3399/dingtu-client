// Data adapter for the connection assistant. Every view reads an envelope
// {data_source, data, error}; 'real' kinds come from the main-site API on the same origin,
// 'mock' kinds come from the deterministic demo world below. Real mode never falls back to mock.
// To move a kind to real: add its path to REAL_PATHS and set SOURCES[kind] = 'real'.
(function (root) {
  'use strict';
  const SOURCES = Object.freeze({ account: 'real', tenant: 'real', identity: 'mock', egress: 'mock', standby: 'mock', events: 'mock', subscription: 'mock', entitlement: 'mock' });
  const LOCAL_PROXY = Object.freeze({ host: '127.0.0.1', port: 17899, http: 'http://127.0.0.1:17899', socks5: 'socks5://127.0.0.1:17899' });
  // CC's operator worktree must merge the overview/catalog facade before the
  // desktop client is allowed to call them. Keep this explicit gate so a
  // deployed client cannot turn a 404 into a fake connected state.
  // The user portal now ships the assistant overview and catalog facade in
  // its tracked server baseline. Keep the browser adapter on real reads; a
  // missing/invalid response still fails closed inside api/read.
  const CLIENT_API_READY = true;
  const REAL_PATHS = Object.freeze({ account: '/api/v1/me', tenant: '/api/v1/tenants/me/members', identities: '/api/v1/tenants/me/identities', entitlements: '/api/v1/tenants/me', assistantOverview: '/api/v1/assistant/overview', clientCatalog: '/api/v1/client/catalog', clientRelays: '/api/v1/client/relays' });
  const MESSAGES = Object.freeze({
    NETWORK_ERROR: '暂时无法连接主站，请检查网络后重试。',
    INVALID_RESPONSE: '服务暂时不可用，请稍后重试。',
    REQUEST_FAILED: '操作未完成，请重试。',
    SOURCE_MISMATCH: '数据来源与预期不符，已停止显示。',
    NOT_INTEGRATED: '该数据尚未接入主站接口。',
    PREVIEW_ONLY: '独立预览不读取主站账号。',
    DESKTOP_AUTH_PENDING: '桌面登录准备中，将通过浏览器授权登录。',
    DESKTOP_OPERATION_UNAVAILABLE: '桌面端功能尚未就绪。',
    DESKTOP_OPERATION_FAILED: '桌面端操作未完成。',
  });

  class ApiError extends Error {
    constructor(status, code, message, requestId = null) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.requestId = typeof requestId === 'string' ? requestId : null; }
  }
  const fail = (status, code) => new ApiError(status, code, MESSAGES[code]);
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const freezeDeep = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freezeDeep); Object.freeze(value); } return value; };

  // Demo world: deterministic ids, RFC 5737 documentation addresses only, doc-03 field names.
  const EXITS = { exit_demo_primary: { exit_id: 'exit_demo_primary', ip: '203.0.113.42', region: '美国', role: 'primary' }, exit_demo_standby_a: { exit_id: 'exit_demo_standby_a', ip: '198.51.100.28', region: '美国', role: 'standby', label: '备用出口 A' } };
  function seedWorld() {
    return {
      scenario: 'normal',
      identity: { identity_id: 'idn_demo_0001', display_name: '示例连接身份', desired_status: 'active', runtime_status: 'idle', control_epoch: 1, controller_term: 1, revision: 1, applied_revision: 1, binding_revision: 1, current_exit_summary: clone(EXITS.exit_demo_primary), pending_exit_summary: null, operation_id: null },
      standby: [clone(EXITS.exit_demo_standby_a)],
      events: [],
      entitlement: { plan_code: 'demo', plan_name: '网络交互演示', status: 'active', expires_at: '2026-12-31T16:00:00.000Z', standby_count: 1 },
      subscription: { format: 'sing-box', available: false, entry_profile_id: 'entry_demo_auto' },
      sequence: 0,
    };
  }
  function mockData(world, kind) {
    const expired = world.scenario === 'expired';
    const standby = world.scenario === 'no-spare' ? [] : world.standby;
    switch (kind) {
      case 'identity': return world.identity;
      case 'egress': return { identity_id: world.identity.identity_id, current_exit_summary: world.identity.current_exit_summary, binding: world.identity.current_exit_summary.role === 'primary' ? 'fixed_primary' : 'sticky_standby', binding_revision: world.identity.binding_revision };
      case 'standby': return standby;
      case 'events': return world.events;
      case 'subscription': return world.subscription;
      case 'entitlement': return { ...world.entitlement, status: expired ? 'expired' : world.entitlement.status, standby_count: standby.length };
      default: return undefined;
    }
  }

  function createAssistantData({ fetch = root.fetch && root.fetch.bind(root), mainSite = false, sources = {}, clientApiReady = CLIENT_API_READY } = {}) {
    const kinds = { ...SOURCES, ...sources };
    let world = seedWorld();
    let cache = {};
    let epoch = 0; // bumped by reset(); reads started under an older epoch are not cached
    let unauthorized = null;

    async function api(path, { method = 'GET', body, csrf, idempotencyKey, notifyUnauthorized = true } = {}) {
      // Desktop credentials are owned by the main process. Until its narrow
      // device-session bridge is delivered, no renderer Cookie fallback exists.
      if (root.NoyaDesktop) {
        if (method !== 'GET' || typeof root.NoyaDesktop.read !== 'function') throw fail(0, 'DESKTOP_OPERATION_UNAVAILABLE');
        let url; try { url = new URL(path, 'https://noya.desktop'); } catch { throw fail(0, 'DESKTOP_OPERATION_UNAVAILABLE'); }
        const desktop = { '/api/v1/me': ['me', {}], '/api/v1/tenants/me': ['entitlements', {}], '/api/v1/tenants/me/members': ['members', {}], '/api/v1/assistant/overview': ['overview', {}], '/api/v1/client/relays': ['relays', {}] };
        let kindArgs = desktop[url.pathname];
        if (url.pathname === '/api/v1/tenants/me/identities') {
          const args = {}; for (const key of ['limit', 'cursor']) if (url.searchParams.has(key)) args[key] = key === 'limit' ? Number(url.searchParams.get(key)) : url.searchParams.get(key);
          kindArgs = ['identities', args];
        } else if (url.pathname === '/api/v1/client/catalog') {
          const platform = url.searchParams.get('platform'); kindArgs = platform ? ['catalog', { platform }] : null;
        }
        if (!kindArgs) throw fail(0, 'DESKTOP_OPERATION_UNAVAILABLE');
        try {
          const result = await root.NoyaDesktop.read(kindArgs[0], kindArgs[1]);
          if (!result?.ok) {
            const status = Number.isSafeInteger(result?.error?.status) ? result.error.status : (result?.error?.code === 'AUTH_REQUIRED' ? 401 : 0);
            const code = typeof result?.error?.code === 'string' ? result.error.code : 'DESKTOP_OPERATION_FAILED';
            const error = new ApiError(status, code, MESSAGES[code] || MESSAGES.DESKTOP_OPERATION_FAILED);
            if (status === 401 && notifyUnauthorized && unauthorized) unauthorized(error, url.pathname);
            throw error;
          }
          return result.value;
        } catch (error) { throw error instanceof ApiError ? error : fail(0, 'NETWORK_ERROR'); }
      }
      if (!mainSite) throw fail(0, 'PREVIEW_ONLY');
      const started = epoch;
      const headers = { Accept: 'application/json', 'X-Requested-With': 'Dingtu-Portal' };
      if (typeof idempotencyKey === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(idempotencyKey)) headers['Idempotency-Key'] = idempotencyKey;
      const write = method !== 'GET' && method !== 'HEAD';
      if (write) { headers['Content-Type'] = 'application/json'; if (csrf) headers['X-CSRF-Token'] = csrf; }
      let response;
      try { response = await fetch(path, { method, credentials: 'same-origin', redirect: 'error', cache: 'no-store', headers, ...(write ? { body: JSON.stringify(body ?? {}) } : {}) }); }
      catch { throw fail(0, 'NETWORK_ERROR'); }
      if (response.status === 204) return null;
      let data;
      try { data = await response.json(); } catch { data = undefined; }
      if (!response.ok) {
        const problem = data && typeof data === 'object' && data.error && typeof data.error === 'object' ? data.error : null;
        const error = problem && typeof problem.code === 'string'
          ? new ApiError(response.status, problem.code, typeof problem.message === 'string' && problem.message ? problem.message : MESSAGES.REQUEST_FAILED, problem.request_id)
          : fail(response.status, data === undefined ? 'INVALID_RESPONSE' : 'REQUEST_FAILED');
        if (started === epoch && response.status === 401 && notifyUnauthorized && unauthorized && !['/api/v1/auth/login', '/api/v1/auth/register'].includes(path)) unauthorized(error, path);
        throw error;
      }
      if (data === undefined || data === null || typeof data !== 'object') throw fail(response.status, 'INVALID_RESPONSE');
      return data;
    }

    async function read(kind) {
      if (!Object.hasOwn(kinds, kind)) throw new Error('unknown data kind: ' + kind);
      if (kinds[kind] !== 'real') return snapshot(kind);
      const started = epoch;
      let envelope;
      try {
        if (!Object.hasOwn(REAL_PATHS, kind)) throw fail(0, 'NOT_INTEGRATED');
        const data = await api(REAL_PATHS[kind]);
        if (data && Object.hasOwn(data, 'data_source') && data.data_source !== 'real') throw fail(200, 'SOURCE_MISMATCH');
        envelope = { data_source: 'real', data, error: null };
      } catch (error) {
        envelope = { data_source: 'real', data: null, error: error instanceof ApiError ? error : fail(0, 'REQUEST_FAILED') };
      }
      // A reset() while this read was in flight means the account changed: never cache the old result.
      if (started === epoch) cache[kind] = envelope;
      return envelope;
    }

    /** Synchronous view for render: last real envelope (or not-loaded), or the current mock world. */
    function snapshot(kind) {
      if (kinds[kind] === 'real') return cache[kind] || { data_source: 'real', data: null, error: null };
      if (mainSite) return { data_source: 'mock', data: null, error: fail(0, 'NOT_INTEGRATED') };
      return { data_source: 'mock', data: freezeDeep(clone(mockData(world, kind))), error: null };
    }

    function validateCredentials(input, registration = false) {
      if (!input || typeof input !== 'object') throw fail(400, 'VALIDATION_ERROR');
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      const password = input.password;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string') throw fail(400, 'VALIDATION_ERROR');
      const length = Array.from(password).length;
      if (length < (registration ? 15 : 1) || length > 128) throw fail(400, 'VALIDATION_ERROR');
      const result = { email, password };
      if (registration) {
        const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
        if (!displayName || Array.from(displayName).length > 60) throw fail(400, 'VALIDATION_ERROR');
        result.displayName = displayName;
        if (input.invitationId !== undefined) {
          if (typeof input.invitationId !== 'string' || !input.invitationId || input.invitationId.length > 200) throw fail(400, 'VALIDATION_ERROR');
          result.invitationId = input.invitationId;
        }
      }
      return result;
    }
    function validatePasswordChange(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail(400, 'VALIDATION_ERROR');
      const currentPassword = input.currentPassword, newPassword = input.newPassword;
      if (typeof currentPassword !== 'string' || Array.from(currentPassword).length < 1 || Array.from(currentPassword).length > 128 || typeof newPassword !== 'string' || Array.from(newPassword).length < 15 || Array.from(newPassword).length > 128) throw fail(400, 'VALIDATION_ERROR');
      return { currentPassword, newPassword };
    }
    function normalizeSession(payload) {
      const user = payload?.user;
      const allowedTypes = ['personal', 'enterprise'];
      const allowedLevels = [null, 'silver', 'gold'];
      const allowedRoles = ['owner', 'admin', 'member'];
      const desktopSession = !!root.NoyaDesktop;
      if (!user || typeof user.id !== 'string' || !user.id || typeof user.email !== 'string' || !user.email || typeof user.displayName !== 'string' || !allowedTypes.includes(user.customerType) || !allowedLevels.includes(user.level) || user.role !== 'customer' || user.status !== 'active' || typeof user.emailVerified !== 'boolean' || (user.memberRole != null && !allowedRoles.includes(user.memberRole)) || (desktopSession ? (payload.csrfToken !== null && (typeof payload.csrfToken !== 'string' || !payload.csrfToken)) : (typeof payload.csrfToken !== 'string' || !payload.csrfToken)) || typeof payload.expiresAt !== 'string' || Number.isNaN(Date.parse(payload.expiresAt))) throw fail(200, 'INVALID_RESPONSE');
      return { user: { id: user.id, email: user.email, displayName: user.displayName, customerType: user.customerType, level: user.level, role: 'customer', emailVerified: user.emailVerified, status: 'active', memberRole: user.memberRole ?? null }, csrfToken: payload.csrfToken, expiresAt: payload.expiresAt };
    }
    const sessionPayload = normalizeSession;
    async function me(){return sessionPayload(await api(REAL_PATHS.account))}
    function overviewPayload(payload){
      const text=value=>typeof value==='string'&&value.length>0&&value.length<=200;
      const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
      const count=value=>value===null||(Number.isSafeInteger(value)&&value>=0);
      const states=['known','unknown','stale','unavailable'];
      if(!payload||payload.data_source!=='real'||!date(payload.generatedAt)||!text(payload.customer?.id)||!['personal','enterprise'].includes(payload.customer?.type)||!['owner','admin','member'].includes(payload.customer?.role)||!Array.isArray(payload.identities)||payload.identities.length>64||!Number.isSafeInteger(payload.identitiesTotal)||payload.identitiesTotal<payload.identities.length||typeof payload.identitiesTruncated!=='boolean'||payload.identitiesTruncated!==(payload.identitiesTotal>payload.identities.length)||!states.includes(payload.subscription?.status)||!states.includes(payload.devices?.status)||!states.includes(payload.egress?.status)||payload.egress.binding!=='server')throw fail(200,'INVALID_RESPONSE');
      const {subscription,devices,egress}=payload;
      if(![subscription.primaryIpQuota,subscription.standbyIpQuota,devices.authorized,devices.online,devices.limit,egress.primaryAllocated,egress.standbyAllocated].every(count)||(subscription.expiresAt!==null&&!date(subscription.expiresAt)))throw fail(200,'INVALID_RESPONSE');
      const identities=payload.identities.map(item=>{if(!text(item?.id)||typeof item.displayName!=='string'||item.displayName.length>200||!text(item.assignedUserId)||!['active','provision_pending','suspended'].includes(item.status)||!date(item.createdAt))throw fail(200,'INVALID_RESPONSE');return {id:item.id,displayName:item.displayName,assignedUserId:item.assignedUserId,status:item.status,createdAt:item.createdAt};});
      if(new Set(identities.map(item=>item.id)).size!==identities.length)throw fail(200,'INVALID_RESPONSE');
      const output={data_source:'real',generatedAt:payload.generatedAt,customer:{id:payload.customer.id,type:payload.customer.type,role:payload.customer.role},subscription:{status:subscription.status,primaryIpQuota:subscription.primaryIpQuota,standbyIpQuota:subscription.standbyIpQuota,expiresAt:subscription.expiresAt},devices:{status:devices.status,authorized:devices.authorized,online:devices.online,limit:devices.limit},egress:{status:egress.status,binding:'server',primaryAllocated:egress.primaryAllocated,standbyAllocated:egress.standbyAllocated},identities,identitiesTotal:payload.identitiesTotal,identitiesTruncated:payload.identitiesTruncated};
      if(payload.exitContext&&typeof payload.exitContext==='object'&&typeof payload.exitContext.countryCode==='string'&&typeof payload.exitContext.timezone==='string'){
        output.exitContext={countryCode:payload.exitContext.countryCode,timezone:payload.exitContext.timezone,locale:typeof payload.exitContext.locale==='string'?payload.exitContext.locale:'en-US',regionLabel:typeof payload.exitContext.regionLabel==='string'?payload.exitContext.regionLabel:null};
      }
      return output;
    }
    async function overview(){if(!clientApiReady)throw fail(0,'NOT_INTEGRATED');return overviewPayload(await api(REAL_PATHS.assistantOverview));}
    function identitiesPayload(payload){
      const text=value=>typeof value==='string'&&value.length>0&&value.length<=200;
      const statuses=['provision_pending','active','suspended'];
      if(!payload||(payload.data_source!==undefined&&payload.data_source!=='real')||!Array.isArray(payload.identities)||payload.identities.length>200||!(payload.nextCursor===null||(typeof payload.nextCursor==='string'&&payload.nextCursor.length>0&&payload.nextCursor.length<=2048)))throw fail(200,'INVALID_RESPONSE');
      const identities=payload.identities.map(item=>{
        if(!text(item?.id)||!text(item.userId)||typeof item.displayName!=='string'||!item.displayName.trim()||item.displayName.length>200||!statuses.includes(item.desiredStatus)||typeof item.createdAt!=='string'||!Number.isFinite(Date.parse(item.createdAt)))throw fail(200,'INVALID_RESPONSE');
        const appliedStatus=item.appliedStatus??'unknown', observedStatus=item.observedStatus??'unknown', health=item.health??'unknown';
        if(!['active','provision_pending','suspended','unknown'].includes(appliedStatus)||!['active','provision_pending','suspended','unknown'].includes(observedStatus)||!['known','unknown'].includes(health))throw fail(200,'INVALID_RESPONSE');
        return {id:item.id,assignedUserId:item.userId,displayName:item.displayName,status:item.desiredStatus,desiredStatus:item.desiredStatus,appliedStatus,observedStatus,bindingRevision:item.bindingRevision??null,configRevision:item.configRevision??null,lastObservedAt:item.lastObservedAt??null,health,createdAt:new Date(item.createdAt).toISOString()};
      });
      if(new Set(identities.map(item=>item.id)).size!==identities.length)throw fail(200,'INVALID_RESPONSE');
      return {data_source:'real',identities,nextCursor:payload.nextCursor};
    }
    async function identities(options={}){
      if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!['limit','cursor'].includes(key)))throw fail(400,'VALIDATION_ERROR');
      const query=[];
      if(options.limit!==undefined){if(!Number.isSafeInteger(options.limit)||options.limit<1||options.limit>200)throw fail(400,'VALIDATION_ERROR');query.push('limit='+options.limit);}
      if(options.cursor!==undefined){if(typeof options.cursor!=='string'||!options.cursor||options.cursor.length>2048)throw fail(400,'VALIDATION_ERROR');query.push('cursor='+encodeURIComponent(options.cursor));}
      return identitiesPayload(await api(REAL_PATHS.identities+(query.length?'?'+query.join('&'):'')));
    }
    function entitlementPayload(payload){
      const text=value=>typeof value==='string'&&value.length>0&&value.length<=200;
      const dateOrNull=value=>value===null|| (typeof value==='string'&&Number.isFinite(Date.parse(value)));
      const bytes=value=>value===null|| (Number.isSafeInteger(value)&&value>=0);
      const customer=payload?.customer, ent=payload?.entitlement;
      if(payload?.data_source!==undefined&&payload.data_source!=='real')throw fail(200,'INVALID_RESPONSE');
      if(!customer||!text(customer.id)||!['personal','enterprise'].includes(customer.type)||![null,'silver','gold'].includes(customer.level??null)||!['owner','admin','member'].includes(customer.memberRole)&&customer.memberRole!==null)throw fail(200,'INVALID_RESPONSE');
      if(ent!==null&&(!ent||!bytes(ent.trafficQuotaBytes)||!['monthly',null].includes(ent.trafficResetPeriod)||!bytes(ent.effectiveTrafficQuotaBytes)||!dateOrNull(ent.expiresAt)))throw fail(200,'INVALID_RESPONSE');
      if(customer.memberRole==='member'&&ent!==null)throw fail(200,'INVALID_RESPONSE');
      return {data_source:'real',customer:{id:customer.id,type:customer.type,level:customer.level??null,memberRole:customer.memberRole??null},entitlement:ent===null?null:{trafficQuotaBytes:ent.trafficQuotaBytes,trafficResetPeriod:ent.trafficResetPeriod,effectiveTrafficQuotaBytes:ent.effectiveTrafficQuotaBytes,expiresAt:ent.expiresAt}};
    }
    async function entitlements(){return entitlementPayload(await api(REAL_PATHS.entitlements));}
    async function catalog(platform){
      if(!mainSite)throw fail(0,'PREVIEW_ONLY');
      if(!clientApiReady)throw fail(0,'NOT_INTEGRATED');
      if(!['windows','macos','linux','ios','android'].includes(platform))throw fail(400,'VALIDATION_ERROR');
      const payload=await api(REAL_PATHS.clientCatalog+'?platform='+encodeURIComponent(platform));
      if(root.AssistantCatalog?.normalize)return root.AssistantCatalog.normalize(payload,platform);
      throw fail(200,'INVALID_RESPONSE');
    }
    async function relays(){
      if(!mainSite)throw fail(0,'PREVIEW_ONLY');
      if(!clientApiReady)throw fail(0,'NOT_INTEGRATED');
      const payload=await api(REAL_PATHS.clientRelays);
      if(!payload||payload.data_source!=='real'||!Array.isArray(payload.relays))throw fail(200,'INVALID_RESPONSE');
      return {
        data_source:'real',
        generatedAt:payload.generatedAt,
        relays:payload.relays.map(item=>({
          relayId:String(item.relayId||''),
          name:String(item.name||''),
          protocol:String(item.protocol||''),
          baseUrl:String(item.baseUrl||''),
          models:Array.isArray(item.models)?[...item.models]:[],
          status:String(item.status||'disabled'),
          notes:typeof item.notes==='string'?item.notes:'',
        })),
      };
    }
    async function credentials(input,register){if(!mainSite)throw fail(0,'PREVIEW_ONLY');let body;try{body=validateCredentials(input,register)}catch{throw new ApiError(400,'VALIDATION_ERROR','请检查邮箱、昵称和密码。')}return sessionPayload(await api('/api/v1/auth/'+(register?'register':'login'),{method:'POST',body,notifyUnauthorized:false}))}
    async function changePassword(input, csrf) { if (!mainSite) throw fail(0, 'PREVIEW_ONLY'); let body; try { body = validatePasswordChange(input); } catch { throw new ApiError(400, 'VALIDATION_ERROR', '新密码需为15–128个字符，当前密码不能为空。'); } return api('/api/v1/auth/password', { method: 'POST', body, csrf }); }
    async function logout(csrf) {
      if (root.NoyaDesktop) {
        if (!root.NoyaDesktop.auth || typeof root.NoyaDesktop.auth.invoke !== 'function') throw fail(0, 'DESKTOP_OPERATION_UNAVAILABLE');
        const result = await root.NoyaDesktop.auth.invoke('auth.logout');
        if (!result?.ok) throw new ApiError(result?.error?.status === 401 ? 401 : 0, result?.error?.code || 'DESKTOP_OPERATION_FAILED', MESSAGES[result?.error?.code] || MESSAGES.DESKTOP_OPERATION_FAILED);
        return null;
      }
      try { return await api('/api/v1/auth/logout', { method: 'POST', body: {}, csrf }); }
      catch (error) {
        if (!(error instanceof ApiError) || error.status !== 403 || error.code !== 'CSRF_INVALID') throw error;
        const fresh = await me();
        return api('/api/v1/auth/logout', { method: 'POST', body: {}, csrf: fresh.csrfToken });
      }
    }

    const mock = {
      setScenario(scenario) { world.scenario = scenario; },
      /** Restores the demo world (exits, events) but keeps the selected prototype scenario. */
      reset() { const scenario = world.scenario; world = seedWorld(); world.scenario = scenario; },
      setRuntime(status) { world.identity.runtime_status = status; },
      /** Server-side style failover inside the demo world; returns the event or null when no spare. */
      failover(at = Date.now()) {
        const spare = world.scenario === 'no-spare' ? null : world.standby[0];
        if (!spare) return null;
        const identity = world.identity, old = identity.current_exit_summary;
        world.sequence += 1;
        const n = String(world.sequence).padStart(4, '0');
        identity.binding_revision += 1; identity.revision += 1; identity.applied_revision = identity.revision;
        identity.operation_id = 'op_demo_' + n;
        identity.current_exit_summary = { ...spare, role: 'standby' };
        world.standby = world.standby.slice(1);
        const event = { event_id: 'evt_demo_' + n, event_type: 'exit_failover', reason_code: 'exit_unhealthy', identity_id: identity.identity_id, control_epoch: identity.control_epoch, controller_term: identity.controller_term, binding_revision: identity.binding_revision, operation_id: identity.operation_id, old_exit_id: old.exit_id, new_exit_id: spare.exit_id, old_exit_ip: old.ip, new_exit_ip: spare.ip, occurred_at: new Date(at).toISOString() };
        world.events.push(event);
        return clone(event);
      },
    };

    return Object.freeze({
      sources: Object.freeze({ ...kinds }), mainSite, api, read, snapshot, me, overview, identities, entitlements, catalog, relays, login: input => credentials(input,false), register: input => credentials(input,true), changePassword, logout,
      members: () => read('tenant'),
      onUnauthorized(handler) { unauthorized = handler; },
      reset() { epoch += 1; cache = {}; world = seedWorld(); },
      mock: Object.freeze(mock),
    });
  }

  const ROLES = { owner: '所有者', admin: '管理员', member: '成员' };
  const STATUSES = { active: '正常', disabled: '已停用' };
  const labels = Object.freeze({
    role: value => value == null ? '未提供' : ROLES[value] || '未知角色',
    status: value => value == null ? '未提供' : STATUSES[value] || '未知状态',
    account(user) {
      const enterprise = user.customerType === 'enterprise', personal = user.customerType === 'personal';
      return {
        type: enterprise ? '企业账号' : personal ? '个人账号' : '账号类型待配置',
        level: personal ? (user.level === null ? '待配置' : user.level === 'gold' ? '金牌' : user.level === 'silver' ? '银牌' : '待配置') : null,
        entitlement: enterprise ? '见账号资源' : null,
        role: user.memberRole ? labels.role(user.memberRole) : null,
        status: labels.status(user.status),
      };
    },
  });

  const location = root.location;
  let previewFlag = !!location && new URLSearchParams(location.search || '').get('preview') === '1';
  try {
    // Preview is an explicit URL mode. Do not persist it across a later
    // production /assistant/ visit, otherwise real pages keep reading mock data.
    if (previewFlag) root.sessionStorage?.setItem('dingtu-assistant-preview', '1');
    else root.sessionStorage?.removeItem('dingtu-assistant-preview');
  } catch { /* preview marker is only a convenience; storage denial stays usable */ }
  const mainSite = !!root.NoyaDesktop || (!previewFlag && !!location && location.pathname.startsWith('/assistant/') && location.port !== '4177');
  // The page instance (api, read, snapshot, me, logout, login: input => credentials(input,false), register: input => credentials(input,true), members, reset, mock) plus the factory for tests.
  root.AssistantData = Object.freeze({ ...createAssistantData({ mainSite }), SOURCES, REAL_PATHS, LOCAL_PROXY, CLIENT_API_READY, ApiError, labels, createAssistantData });
})(globalThis);
