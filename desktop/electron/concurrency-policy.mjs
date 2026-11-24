const fail = (code, message, status = 403) => Object.assign(new Error(message), { code, status });

export const CANONICAL_PERSONAL_INSTANCE_ID = 'main';
export const MAX_LOCAL_CONCURRENT_INSTANCES = 16;

export function isCanonicalPersonalAlias(alias, appId = '') {
  if (typeof alias !== 'string') return false;
  return alias === 'main'
    || alias === 'default'
    || (Boolean(appId) && (alias === `${appId}-main` || alias === `${appId}-default`));
}

/**
 * Enforces the Dingtu 2.0 customer tier concurrency & terminal boundary:
 * - Single-terminal online uniqueness for 'personal' accounts is enforced server-side
 *   across Operator & Production; within the active terminal itself, both 'personal'
 *   and 'enterprise' allow concurrent multi-app execution and isolated multi-account
 *   partitions up to the local safety cap (MAX_LOCAL_CONCURRENT_INSTANCES = 16).
 */
export function createConcurrencyPolicy({
  resolveCustomerType = null,
} = {}) {
  let cachedTier = null; // 'personal' | 'enterprise' | null
  let pendingLookup = null;

  function observeCustomerType(rawType) {
    if (rawType === 'enterprise' || rawType === 'personal') {
      cachedTier = rawType;
    }
    return cachedTier;
  }

  function observeProjectedRead(kind, value) {
    if (!value || typeof value !== 'object') return;
    if (kind === 'me' && value.user?.customerType) {
      observeCustomerType(value.user.customerType);
    } else if ((kind === 'overview' || kind === 'entitlements') && value.customer?.type) {
      observeCustomerType(value.customer.type);
    }
  }

  function clear() {
    cachedTier = null;
    pendingLookup = null;
  }

  function getCachedTier() {
    return cachedTier || 'personal';
  }

  async function resolveTier() {
    if (cachedTier === 'enterprise' || cachedTier === 'personal') return cachedTier;
    if (typeof resolveCustomerType !== 'function') return 'personal';
    if (!pendingLookup) {
      pendingLookup = Promise.resolve()
        .then(() => resolveCustomerType())
        .then(type => observeCustomerType(type) || 'personal')
        .catch(() => 'personal')
        .finally(() => { pendingLookup = null; });
    }
    return pendingLookup;
  }

  function assertAgentCreateAllowed() {
    // Multi-app and multi-account local partitions are permitted on the active terminal for all tiers.
  }

  function assertAgentStartAllowed({ activeAgents = [], activeBrowsers = [], instanceId } = {}) {
    const runningAgents = activeAgents.filter(
      item => item.id !== instanceId && ['starting', 'running', 'stopping'].includes(item.status),
    ).length;
    if (runningAgents + activeBrowsers.length >= MAX_LOCAL_CONCURRENT_INSTANCES) {
      throw fail(
        'LOCAL_INSTANCE_LIMIT_REACHED',
        `本机同时运行的应用与容器已达上限（${MAX_LOCAL_CONCURRENT_INSTANCES} 个），请先关闭部分实例后重试。`,
        429,
      );
    }
  }

  function assertBrowserOpenAllowed({ activeAgents = [], activeBrowsers = [], appId, instanceId } = {}) {
    const alreadyOpen = activeBrowsers.some(item => item.appId === appId && item.instanceId === instanceId);
    if (alreadyOpen) return;
    const runningAgents = activeAgents.filter(item => ['starting', 'running', 'stopping'].includes(item.status)).length;
    if (runningAgents + activeBrowsers.length >= MAX_LOCAL_CONCURRENT_INSTANCES) {
      throw fail(
        'LOCAL_INSTANCE_LIMIT_REACHED',
        `本机同时运行的应用与容器已达上限（${MAX_LOCAL_CONCURRENT_INSTANCES} 个），请先关闭部分实例后重试。`,
        429,
      );
    }
  }

  function snapshot() {
    const tier = getCachedTier();
    return Object.freeze({
      customerType: tier,
      verified: cachedTier !== null,
      multiInstanceAllowed: true,
      multiLoginAllowed: true,
      maxConcurrentInstances: MAX_LOCAL_CONCURRENT_INSTANCES,
      singleTerminalEnforcedServerSide: tier !== 'enterprise',
      canonicalPersonalInstanceId: CANONICAL_PERSONAL_INSTANCE_ID,
    });
  }

  return Object.freeze({
    observeCustomerType,
    observeProjectedRead,
    clear,
    getCachedTier,
    resolveTier,
    assertAgentCreateAllowed,
    assertAgentStartAllowed,
    assertBrowserOpenAllowed,
    snapshot,
  });
}
