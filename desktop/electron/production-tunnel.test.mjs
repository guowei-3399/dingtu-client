import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createPrivateKey,generateKeyPairSync,sign,verify} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createProductionTunnelClient,productionConfigSigningInput} from './production-tunnel.mjs';

test('production config exchanges a one-time device proof and validates exact signed bytes',async()=>{
  const device=generateKeyPairSync('ed25519');
  const production=generateKeyPairSync('ed25519');
  const publicJwk=production.publicKey.export({format:'jwk'});
  const keyId='ed25519-'+createHash('sha256').update(Buffer.from(publicJwk.x,'base64url')).digest('hex');
  const origin='https://production.noyapi.cn';
  const now=Date.parse('2026-11-09T00:00:00Z');
  const handle='pah_'+'A'.repeat(43);
  const deviceId='11111111-1111-4111-8111-111111111111';
  const config=JSON.stringify({inbounds:[{type:'mixed',listen:'127.0.0.1',listen_port:17899}],outbounds:[{type:'block',tag:'block'}],route:{final:'block'}});
  let tamper=false;
  let direct=false;
  let dnsDirect=false;
  let legacy7899=false;
  let seen=0;
  const client=createProductionTunnelClient({origin,trustedKeys:{[keyId]:publicJwk},now:()=>now,fetch:async(url,init)=>{
    seen++;
    assert.equal(url,origin+'/api/v1/client/tunnel/config');
    assert.equal(init.method,'POST');
    assert.equal(init.headers.Authorization,undefined);
    assert.equal(init.credentials,'omit');
    assert.equal(init.redirect,'error');
    const request=JSON.parse(init.body);
    assert.deepEqual(Object.keys(request).sort(),['authorizationHandle','deviceProof','issuedAt']);
    const digest=createHash('sha256').update(handle).digest('hex');
    const proof=['dingtu-tunnel-config-v1','POST',origin,'/api/v1/client/tunnel/config',digest,String(now)].join('\n');
    assert.equal(verify(null,Buffer.from(proof),device.publicKey,Buffer.from(request.deviceProof,'base64url')),true);
    const envelope={data_source:'production',deviceId,authorizationHandleDigest:digest,
      bindingRevision:'binding-1',configRevision:'cfg-'+createHash('sha256').update(config).digest('hex'),
      expiresAt:new Date(now+30_000).toISOString(),config,signature:{keyId,value:''}};
    if(direct) {
      envelope.config=JSON.stringify({inbounds:[{type:'mixed',listen:'127.0.0.1',listen_port:17899}],
        outbounds:[{type:'direct',tag:'direct'}],route:{final:'direct'}});
      envelope.configRevision='cfg-'+createHash('sha256').update(envelope.config).digest('hex');
    }
    if(legacy7899) {
      envelope.config=JSON.stringify({inbounds:[{type:'mixed',listen:'127.0.0.1',listen_port:7899}],
        outbounds:[{type:'block',tag:'block'}],route:{final:'block'}});
      envelope.configRevision='cfg-'+createHash('sha256').update(envelope.config).digest('hex');
    }
    if(dnsDirect) {
      const value=JSON.parse(envelope.config);
      value.dns={servers:[{type:'udp',tag:'resolver',server:'198.51.100.53'}]};
      value.route.rules=[{protocol:'dns',action:'hijack-dns'}];
      envelope.config=JSON.stringify(value);
      envelope.configRevision='cfg-'+createHash('sha256').update(envelope.config).digest('hex');
    }
    envelope.signature.value=sign(null,productionConfigSigningInput(envelope),production.privateKey).toString('base64url');
    if(tamper)envelope.config=envelope.config.replace('17899','17898');
    return new Response(JSON.stringify(envelope),{status:200,headers:{'Content-Type':'application/json'}});
  }});
  const request={authorizationHandle:handle,expiresAt:new Date(now+60_000).toISOString(),deviceId,privateKeyJwk:device.privateKey.export({format:'jwk'})};
  const checked=await client.getConfig(request);
  assert.equal(checked.config.inbounds[0].listen_port,17899);
  assert.equal(checked.expiresAt,new Date(now+30_000).toISOString());
  assert.equal(JSON.stringify(checked).includes(handle),false);
  tamper=true;
  await assert.rejects(client.getConfig(request),{code:'PROXY_CONFIG_INVALID'});
  assert.equal(seen,2);
  tamper=false;
  direct=true;
  await assert.rejects(client.getConfig(request),{code:'PROXY_CONFIG_INVALID'});
  direct=false;
  legacy7899=true;
  await assert.rejects(client.getConfig(request),{code:'PROXY_CONFIG_INVALID'});
  legacy7899=false;
  dnsDirect=true;
  await assert.rejects(client.getConfig(request),{code:'PROXY_CONFIG_INVALID'});
});

test('production refusal preserves its error boundary and sends no request for expired handles',async()=>{
  let sent=0;
  const key=generateKeyPairSync('ed25519');
  const publicJwk=key.publicKey.export({format:'jwk'});
  const keyId='ed25519-'+createHash('sha256').update(Buffer.from(publicJwk.x,'base64url')).digest('hex');
  const now=Date.parse('2026-11-09T00:00:00Z');
  const client=createProductionTunnelClient({origin:'https://production.noyapi.cn',trustedKeys:{[keyId]:publicJwk},now:()=>now,fetch:async()=>{
    sent++;
    return new Response(JSON.stringify({error:{code:'CONFIG_AUTHORIZATION_INVALID',message:'RAW_SECRET',request_id:'req_test'}}),{status:401,headers:{'Content-Type':'application/json'}});
  }});
  const request={authorizationHandle:'pah_'+'A'.repeat(43),expiresAt:new Date(now+60000).toISOString(),
    deviceId:'11111111-1111-4111-8111-111111111111',privateKeyJwk:key.privateKey.export({format:'jwk'})};
  await assert.rejects(client.getConfig(request),e=>e.status===401&&e.code==='CONFIG_AUTHORIZATION_INVALID'&&!e.message.includes('RAW_SECRET'));
  await assert.rejects(client.getConfig({...request,expiresAt:new Date(now).toISOString()}),{code:'CONFIG_AUTHORIZATION_INVALID'});
  assert.equal(sent,1);
});

function productionFixture({ fetch, timeoutMs = 15000 } = {}) {
  const key = generateKeyPairSync('ed25519');
  const publicJwk = key.publicKey.export({ format: 'jwk' });
  const keyId = 'ed25519-' + createHash('sha256').update(Buffer.from(publicJwk.x, 'base64url')).digest('hex');
  const now = Date.parse('2026-11-11T14:00:00Z');
  const client = createProductionTunnelClient({ origin: 'https://production.example.invalid',
    trustedKeys: { [keyId]: publicJwk }, now: () => now, fetch, timeoutMs });
  return { client, request: { authorizationHandle: 'pah_' + 'A'.repeat(43),
    expiresAt: new Date(now + 60000).toISOString(), deviceId: '11111111-1111-4111-8111-111111111111',
    privateKeyJwk: key.privateKey.export({ format: 'jwk' }) } };
}

test('production failure status and code must agree and server text cannot escape the main process', async () => {
  for (const [code, status] of [['SESSION_INVALID', 401], ['CONFIG_AUTHORIZATION_INVALID', 401],
    ['SUBSCRIPTION_DISABLED', 403], ['INSUFFICIENT_SCOPE', 403], ['BRIDGE_UNAVAILABLE', 503],
    ['PRODUCTION_MAPPING_NOT_READY', 503], ['PRODUCTION_LEASE_UNAVAILABLE', 503]]) {
    const { client, request } = productionFixture({ fetch: async () => new Response(JSON.stringify({
      error: { code, message: 'provider-secret', request_id: 'req_production_fixture' },
    }), { status, headers: { 'Content-Type': 'application/json' } }) });
    await assert.rejects(client.getConfig(request), error => error.code === code && error.status === status
      && error.requestId === 'req_production_fixture' && !error.message.includes('provider-secret'));
  }
  const { client, request } = productionFixture({ fetch: async () => new Response(JSON.stringify({
    error: { code: 'SESSION_INVALID', request_id: 'req_bad_status' },
  }), { status: 503, headers: { 'Content-Type': 'application/json' } }) });
  await assert.rejects(client.getConfig(request), { code: 'PROXY_CONFIG_UNAVAILABLE', status: 503 });
});

test('oversized production streams stop reading before unbounded data is buffered', async () => {
  let reads = 0;
  let cancelled = false;
  const { client, request } = productionFixture({ fetch: async () => new Response(new ReadableStream({
    pull(controller) { reads++; controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; },
  }), { headers: { 'Content-Type': 'application/json' } }) });
  await assert.rejects(client.getConfig(request), { code: 'PROXY_CONFIG_INVALID' });
  assert.equal(cancelled, true);
  assert.ok(reads <= 9);
});

test('response body timeout cancels the stream and does not leave a pending connection read', async () => {
  let cancelled = false;
  const { client, request } = productionFixture({ timeoutMs: 15, fetch: async () => new Response(new ReadableStream({
    pull() { return new Promise(() => {}); },
    cancel() { cancelled = true; },
  }), { headers: { 'Content-Type': 'application/json' } }) });
  await assert.rejects(client.getConfig(request), { code: 'REQUEST_TIMEOUT' });
  assert.equal(cancelled, true);
});

test('noncanonical handles and malformed device identifiers never reach the production endpoint', async () => {
  let sent = 0;
  const { client, request } = productionFixture({ fetch: async () => { sent++; assert.fail('unexpected dispatch'); } });
  for (const change of [{ authorizationHandle: 'pah_' + 'B'.repeat(43) }, { authorizationHandle: [] },
    { deviceId: 1 }, { expiresAt: {} }, { privateKeyJwk: {} }]) {
    await assert.rejects(client.getConfig({ ...request, ...change }), { code: 'CONFIG_AUTHORIZATION_INVALID' });
  }
  assert.equal(sent, 0);
});

test('non-JSON and declared oversize responses are rejected before reading their body', async () => {
  for (const headers of [{ 'Content-Type': 'text/html' },
    { 'Content-Type': 'application/json', 'Content-Length': String(7 * 1024 * 1024) }]) {
    const { client, request } = productionFixture({ fetch: async () => new Response('{}', { headers }) });
    await assert.rejects(client.getConfig(request), { code: 'PROXY_CONFIG_INVALID' });
  }
});

test('the client consumes the exact shared v1.12 device proof and configuration signature vector', async () => {
  const bytes = await readFile(new URL('./fixtures/v112-signature-vector.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '0c91b49e51ac557f610649675d4aabdf0d2214fc32dd91edbb9c62360e41c009');
  const vector = JSON.parse(bytes);
  assert.equal(vector.scope, 'PUBLIC_TEST_ONLY_DO_NOT_DEPLOY');
  const deviceKey = createPrivateKey({ key: Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(vector.devicePublicSeedHex, 'hex'),
  ]), format: 'der', type: 'pkcs8' });
  const client = createProductionTunnelClient({ origin: vector.origin,
    trustedKeys: { [vector.envelope.signature.keyId]: vector.configPublicJwk }, now: () => vector.nowMillis,
    fetch: async (url, options) => {
      assert.equal(url, vector.origin + '/api/v1/client/tunnel/config');
      assert.deepEqual(JSON.parse(options.body), { authorizationHandle: vector.request.authorizationHandle,
        deviceProof: vector.request.deviceProof, issuedAt: vector.request.issuedAt });
      assert.equal(productionConfigSigningInput(vector.envelope).toString('utf8'), vector.configSigningInput);
      return new Response(JSON.stringify(vector.envelope), { headers: { 'Content-Type': 'application/json' } });
    } });
  const result = await client.getConfig({ authorizationHandle: vector.request.authorizationHandle,
    expiresAt: new Date(vector.nowMillis + 60000).toISOString(), deviceId: vector.envelope.deviceId,
    privateKeyJwk: deviceKey.export({ format: 'jwk' }) });
  assert.equal(result.configRevision, vector.envelope.configRevision);
  assert.equal(result.config.inbounds[0].listen_port, 17899);
});

test('v1.17 accepts 10-minute signed configuration leases up to 11m skew bound and rejects longer horizons', async () => {
  const device = generateKeyPairSync('ed25519');
  const production = generateKeyPairSync('ed25519');
  const publicJwk = production.publicKey.export({ format: 'jwk' });
  const keyId = 'ed25519-' + createHash('sha256').update(Buffer.from(publicJwk.x, 'base64url')).digest('hex');
  const origin = 'https://dingtu.noyapi.cn';
  const now = Date.parse('2026-11-21T12:00:00Z');
  const handle = 'pah_' + 'A'.repeat(43);
  const deviceId = '22222222-2222-4222-8222-222222222222';
  const config = JSON.stringify({
    inbounds: [{ type: 'mixed', listen: '127.0.0.1', listen_port: 17899 }],
    outbounds: [{ type: 'block', tag: 'block' }],
    route: { final: 'block' },
  });
  let ttlMs = 600_000;
  const client = createProductionTunnelClient({
    origin,
    trustedKeys: { [keyId]: publicJwk },
    now: () => now,
    fetch: async () => {
      const envelope = {
        data_source: 'production',
        deviceId,
        authorizationHandleDigest: createHash('sha256').update(handle).digest('hex'),
        bindingRevision: 'binding-5',
        configRevision: 'cfg-' + createHash('sha256').update(config).digest('hex'),
        expiresAt: new Date(now + ttlMs).toISOString(),
        config,
        signature: { keyId, value: '' },
      };
      envelope.signature.value = sign(null, productionConfigSigningInput(envelope), production.privateKey).toString('base64url');
      return new Response(JSON.stringify(envelope), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  const req = {
    authorizationHandle: handle,
    expiresAt: new Date(now + 60_000).toISOString(),
    deviceId,
    privateKeyJwk: device.privateKey.export({ format: 'jwk' }),
  };
  const accepted10m = await client.getConfig(req);
  assert.equal(accepted10m.expiresAt, new Date(now + 600_000).toISOString());

  ttlMs = 660_000;
  const accepted11m = await client.getConfig(req);
  assert.equal(accepted11m.expiresAt, new Date(now + 660_000).toISOString());

  ttlMs = 660_001;
  await assert.rejects(client.getConfig(req), { code: 'PROXY_CONFIG_INVALID' });
});

test('HTTP 502/503 gateway HTML responses map to retryable PROXY_CONFIG_UNAVAILABLE while 200 HTML stays PROXY_CONFIG_INVALID', async () => {
  const { client: client502, request: req502 } = productionFixture({
    fetch: async () => new Response('<html>502 Bad Gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }),
  });
  await assert.rejects(client502.getConfig(req502), err => err.code === 'PROXY_CONFIG_UNAVAILABLE' && err.status === 502);

  const { client: clientEmpty502, request: reqEmpty } = productionFixture({
    fetch: async () => new Response('', { status: 502 }),
  });
  await assert.rejects(clientEmpty502.getConfig(reqEmpty), err => err.code === 'PROXY_CONFIG_UNAVAILABLE' && err.status === 502);

  const { client: client200Html, request: req200 } = productionFixture({
    fetch: async () => new Response('<html>surprise</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
  });
  await assert.rejects(client200Html.getConfig(req200), { code: 'PROXY_CONFIG_INVALID' });
});
