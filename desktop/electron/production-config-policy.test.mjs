import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionConfigPolicy } from './production-config-policy.mjs';

const tunnel = () => ({ type: 'vless', tag: 'authorized', server: 'egress.example.invalid',
  server_port: 443, uuid: '11111111-1111-4111-8111-111111111111' });
const config = () => ({ outbounds: [tunnel()], route: { final: 'authorized' } });

test('the production outbound graph accepts authorized proxies, rejection and nested proxy selection', () => {
  const value = config();
  value.outbounds.push({ type: 'block', tag: 'deny' },
    { type: 'urltest', tag: 'auto', outbounds: ['authorized'] },
    { type: 'selector', tag: 'proxy', outbounds: ['auto', 'deny'], default: 'auto' });
  value.route = { final: 'proxy', rules: [{ type: 'logical', mode: 'or', rules: [{ domain: ['internal.invalid'] }],
    action: 'reject' }] };
  assert.equal(validateProductionConfigPolicy(value), value);
});

test('direct outbounds and implicit bypass references are refused even when unreachable or nested', () => {
  const directOnly = { outbounds: [{ type: 'direct', tag: 'direct' }], route: { final: 'direct' } };
  const selector = config();
  selector.outbounds.push({ type: 'selector', tag: 'proxy', outbounds: ['direct'] });
  const urltest = config();
  urltest.outbounds.push({ type: 'urltest', tag: 'auto', outbounds: ['direct'] });
  const rules = config();
  rules.route.rules = [{ type: 'logical', rules: [{ action: 'route', outbound: 'direct' }] }];
  const bypass = config();
  bypass.route.rules = [{ action: 'bypass' }];
  const final = config();
  final.route.final = 'direct';
  const detour = config();
  detour.outbounds[0].detour = 'direct';
  const download = config();
  download.route.rule_set = [{ type: 'remote', download_detour: 'direct' }];
  const defaultSelection = config();
  defaultSelection.outbounds.push({ type: 'selector', tag: 'proxy', outbounds: ['authorized'], default: 'direct' });
  for (const value of [directOnly, selector, urltest, rules, bypass, final, detour, download, defaultSelection]) {
    assert.throws(() => validateProductionConfigPolicy(value), { code: 'PROXY_CONFIG_INVALID' });
  }
});

test('cyclic or duplicate groups and endpoint routing cannot escape the proxy graph', () => {
  const cycle = config();
  cycle.outbounds.push({ type: 'selector', tag: 'loop', outbounds: ['loop'] });
  const duplicate = config();
  duplicate.outbounds.push(tunnel());
  const endpoint = config();
  endpoint.endpoints = [{ type: 'wireguard', tag: 'direct-endpoint' }];
  const service = config();
  service.services = [{ type: 'ssm-api', listen: '0.0.0.0', listen_port: 9090 }];
  const missingFinal = config();
  delete missingFinal.route.final;
  for (const value of [cycle, duplicate, endpoint, service, missingFinal]) {
    assert.throws(() => validateProductionConfigPolicy(value), { code: 'PROXY_CONFIG_INVALID' });
  }
});

test('network DNS transports must explicitly use the authorized proxy graph', () => {
  for (const type of ['udp', 'tcp', 'tls', 'quic', 'https', 'h3', 'local', 'dhcp', 'mdns', 'unknown', undefined]) {
    const value = config();
    value.dns = { servers: [{ type, tag: 'resolver', server: '198.51.100.53' }] };
    value.route.rules = [{ protocol: 'dns', action: 'hijack-dns' }];
    assert.throws(() => validateProductionConfigPolicy(value), { code: 'PROXY_CONFIG_INVALID' }, type);
  }
  const safe = config();
  safe.dns = { servers: [{ type: 'https', tag: 'resolver', server: '198.51.100.53', detour: 'authorized' }] };
  assert.equal(validateProductionConfigPolicy(safe), safe);
});

test('remote rule downloads require an explicit controlled HTTP client or download detour', () => {
  const remote = { type: 'remote', tag: 'rules', url: 'https://rules.example.invalid/rules.srs' };
  for (const patch of [{}, { http_client: {} }, { http_client: 'missing' }, { download_detour: 'direct' }]) {
    const value = config();
    value.route.rule_set = [{ ...remote, ...patch }];
    assert.throws(() => validateProductionConfigPolicy(value), { code: 'PROXY_CONFIG_INVALID' });
  }
  for (const patch of [{ download_detour: 'authorized' }, { http_client: { detour: 'authorized' } }, { http_client: 'controlled' }]) {
    const value = config();
    value.http_clients = [{ tag: 'controlled', detour: 'authorized' }];
    value.route.rule_set = [{ ...remote, ...patch }];
    assert.equal(validateProductionConfigPolicy(value), value);
  }
});

test('uncontrolled HTTP clients, NTP and unsupported network services are refused', () => {
  for (const change of [
    { http_clients: [{ tag: 'default' }] },
    { http_clients: [{ tag: 'default', engine: 'apple', detour: 'authorized' }] },
    { ntp: { enabled: true, server: '198.51.100.123' } },
    { certificate_providers: [{ type: 'acme' }] },
    { network_namespaces: [{ type: 'default' }] },
    { experimental: { clash_api: { external_ui_download_url: 'https://download.example.invalid' } } },
  ]) {
    assert.throws(() => validateProductionConfigPolicy({ ...config(), ...change }), { code: 'PROXY_CONFIG_INVALID' });
  }
  const safe = config();
  safe.ntp = { enabled: true, server: '198.51.100.123', detour: 'authorized' };
  assert.equal(validateProductionConfigPolicy(safe), safe);
});

test('nested HTTP references, certificate providers and implicit DNS resolution are refused', () => {
  for (const patch of [
    { tls: { certificate_provider: { type: 'acme' } } },
    { tls: { acme: { domain: ['example.invalid'] } } },
    { tls: { ech: { http_client: {} } } },
    { http_client: 'missing' },
  ]) {
    const value = config();
    Object.assign(value.outbounds[0], patch);
    assert.throws(() => validateProductionConfigPolicy(value), { code: 'PROXY_CONFIG_INVALID' });
  }
  for (const action of ['resolve', 'hijack-dns']) {
    const value = config();
    value.route.rules = [{ action }];
    assert.throws(() => validateProductionConfigPolicy(value), { code: 'PROXY_CONFIG_INVALID' });
  }
  const duplicate = config();
  duplicate.http_clients = [{ tag: 'same', detour: 'authorized' }, { tag: 'same', detour: 'authorized' }];
  assert.throws(() => validateProductionConfigPolicy(duplicate), { code: 'PROXY_CONFIG_INVALID' });
});

test('automatic ECH lookup cannot fall back to implicit local DNS', () => {
  for (const ech of [{ enabled: true }, { enabled: true, config: [] }, { enabled: true, config_path: 'local-ech.pem' }]) {
    const value = config();
    value.outbounds[0].tls = { enabled: true, ech };
    assert.throws(() => validateProductionConfigPolicy(value), { code: 'PROXY_CONFIG_INVALID' });
  }
  const safe = config();
  safe.dns = { servers: [{ type: 'https', tag: 'resolver', server: '198.51.100.53', detour: 'authorized' }] };
  safe.outbounds[0].tls = { enabled: true, ech: { enabled: true } };
  assert.equal(validateProductionConfigPolicy(safe), safe);
  const pinned = config();
  pinned.outbounds[0].tls = { enabled: true, ech: { enabled: true, config: ['pinned-ech-pem-checked-by-sing-box'] } };
  assert.equal(validateProductionConfigPolicy(pinned), pinned);
});

test('legacy database downloads and unknown default HTTP references are refused', () => {
  for (const patch of [{ geoip: { download_url: 'https://download.example.invalid' } },
    { geosite: { download_url: 'https://download.example.invalid' } }, { default_http_client: 'missing' }]) {
    const value = config();
    Object.assign(value.route, patch);
    assert.throws(() => validateProductionConfigPolicy(value), { code: 'PROXY_CONFIG_INVALID' });
  }
});

test('SOCKS4 target resolution requires controlled DNS while SOCKS5 and SOCKS4a may defer to the proxy', () => {
  const value = config();
  value.outbounds[0] = { type: 'socks', tag: 'authorized', server: '198.51.100.10', server_port: 1080, version: '4' };
  assert.throws(() => validateProductionConfigPolicy(value), { code: 'PROXY_CONFIG_INVALID' });
  const withDns = structuredClone(value);
  withDns.dns = { servers: [{ type: 'https', tag: 'resolver', server: '198.51.100.53', detour: 'authorized' }] };
  assert.equal(validateProductionConfigPolicy(withDns), withDns);
  for (const version of [undefined, '', '5', '4a']) {
    value.outbounds[0].version = version;
    assert.equal(validateProductionConfigPolicy(value), value);
  }
});

test('Hysteria2 realm cannot introduce independent discovery, STUN or port mapping connections', () => {
  const value = config();
  value.outbounds[0] = { type: 'hysteria2', tag: 'authorized', tls: { enabled: true },
    realm: { server_url: 'https://realm.example.invalid', token: 'fixture',
      stun_servers: ['stun.example.invalid:3478'], port_mapping: { enabled: true } } };
  assert.throws(() => validateProductionConfigPolicy(value), { code: 'PROXY_CONFIG_INVALID' });
});
