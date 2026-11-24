const invalid = () => Object.assign(new Error('生产配置包含未授权的出口路径。'), { code: 'PROXY_CONFIG_INVALID' });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const groups = new Set(['selector', 'urltest']);
const leafTypes = new Set(['vless', 'vmess', 'trojan', 'shadowsocks', 'socks', 'http',
  'hysteria', 'hysteria2', 'tuic', 'anytls', 'naive', 'shadowtls', 'block']);
const topLevelFields = new Set(['$schema', 'log', 'dns', 'ntp', 'http_clients',
  'inbounds', 'outbounds', 'route', 'experimental']);
const networkDnsTypes = new Set(['udp', 'tcp', 'tls', 'quic', 'https', 'h3']);
const staticDnsTypes = new Set(['hosts', 'fakeip']);

// The signature authenticates the producer. This policy additionally limits
// what the client can execute to a closed graph of proxy or rejection outbounds.
export function validateProductionConfigPolicy(config) {
  if (!object(config) || !Array.isArray(config.outbounds) || !config.outbounds.length
      || Object.keys(config).some(key => !topLevelFields.has(key))) throw invalid();
  if (config.experimental !== undefined && (!object(config.experimental)
      || Object.keys(config.experimental).some(key => key !== 'cache_file'))) throw invalid();
  const outboundByTag = new Map();
  for (const outbound of config.outbounds) {
    if (!object(outbound) || typeof outbound.tag !== 'string' || !outbound.tag
        || outboundByTag.has(outbound.tag)
        || !groups.has(outbound.type) && !leafTypes.has(outbound.type)) throw invalid();
    if (outbound.realm !== undefined) throw invalid();
    if (outbound.type === 'socks' && outbound.version === '4' && config.dns === undefined) throw invalid();
    outboundByTag.set(outbound.tag, outbound);
  }
  const reference = tag => {
    if (typeof tag !== 'string' || !outboundByTag.has(tag)) throw invalid();
  };
  const visiting = new Set();
  const visited = new Set();
  function checkOutbound(tag) {
    reference(tag);
    if (visiting.has(tag)) throw invalid();
    if (visited.has(tag)) return;
    visiting.add(tag);
    const outbound = outboundByTag.get(tag);
    if (groups.has(outbound.type)) {
      if (!Array.isArray(outbound.outbounds) || !outbound.outbounds.length) throw invalid();
      for (const child of outbound.outbounds) checkOutbound(child);
      if (outbound.default !== undefined && !outbound.outbounds.includes(outbound.default)) throw invalid();
    }
    if (outbound.detour !== undefined) checkOutbound(outbound.detour);
    visiting.delete(tag);
    visited.add(tag);
  }
  for (const tag of outboundByTag.keys()) checkOutbound(tag);
  const httpClients = new Map();
  function checkHttpClient(client) {
    if (typeof client === 'string') {
      if (!httpClients.has(client)) throw invalid();
      return;
    }
    if (!object(client) || client.engine !== undefined && !['', 'go'].includes(client.engine)) throw invalid();
    reference(client.detour);
  }
  if (config.http_clients !== undefined) {
    if (!Array.isArray(config.http_clients)) throw invalid();
    for (const client of config.http_clients) {
      if (!object(client) || typeof client.tag !== 'string' || !client.tag || httpClients.has(client.tag)) throw invalid();
      checkHttpClient(client);
      httpClients.set(client.tag, client);
    }
  }
  if (config.dns !== undefined) {
    if (!object(config.dns) || !Array.isArray(config.dns.servers) || !config.dns.servers.length) throw invalid();
    for (const server of config.dns.servers) {
      if (!object(server)) throw invalid();
      if (networkDnsTypes.has(server.type)) reference(server.detour);
      else if (!staticDnsTypes.has(server.type)) throw invalid();
    }
  }
  if (config.ntp !== undefined) {
    if (!object(config.ntp) || config.ntp.enabled !== undefined && typeof config.ntp.enabled !== 'boolean') throw invalid();
    if (config.ntp.enabled) reference(config.ntp.detour);
  }
  if (!object(config.route)) throw invalid();
  if (config.route.geoip !== undefined || config.route.geosite !== undefined) throw invalid();
  reference(config.route.final);
  if (config.route.rule_set !== undefined) {
    if (!Array.isArray(config.route.rule_set)) throw invalid();
    for (const ruleSet of config.route.rule_set) {
      if (!object(ruleSet)) throw invalid();
      if (ruleSet.type === 'remote') {
        if (ruleSet.http_client !== undefined) checkHttpClient(ruleSet.http_client);
        else reference(ruleSet.download_detour);
      } else if (ruleSet.type !== 'inline' && ruleSet.type !== 'local') throw invalid();
    }
  }
  const actions = new Set(['route', 'reject', 'resolve', 'sniff', 'hijack-dns', 'route-options']);
  function checkRules(rules) {
    if (rules === undefined) return;
    if (!Array.isArray(rules)) throw invalid();
    for (const rule of rules) {
      if (!object(rule) || rule.action !== undefined && !actions.has(rule.action)) throw invalid();
      if (['resolve', 'hijack-dns'].includes(rule.action) && config.dns === undefined) throw invalid();
      if (rule.outbound !== undefined) reference(rule.outbound);
      checkRules(rule.rules);
    }
  }
  checkRules(config.route?.rules);
  function checkDetours(value) {
    if (Array.isArray(value)) { for (const item of value) checkDetours(item); return; }
    if (!object(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'detour' || key === 'download_detour') reference(child);
      else if (key === 'http_client' || key === 'default_http_client') checkHttpClient(child);
      else if (key === 'certificate_provider' || key === 'acme') throw invalid();
      else if (key === 'ech' && object(child) && child.enabled && config.dns === undefined) {
        const pinned = typeof child.config === 'string' ? [child.config] : child.config;
        if (!Array.isArray(pinned) || !pinned.length || pinned.some(line => typeof line !== 'string' || !line.trim())) throw invalid();
        checkDetours(child);
      }
      else checkDetours(child);
    }
  }
  checkDetours(config);
  return config;
}
