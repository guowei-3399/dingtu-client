import {createHash,createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
import {validateTunnelConfig} from './local-proxy.mjs';
import {validateProductionConfigPolicy} from './production-config-policy.mjs';

const CONFIG_PATH='/api/v1/client/tunnel/config';
const MAX_BYTES=1024*1024;
const MAX_RESPONSE_BYTES=MAX_BYTES*6+4096;
const MAX_CONFIG_TTL_MS=660_000;
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const SHA=/^[0-9a-f]{64}$/;
const digest=value=>createHash('sha256').update(value).digest('hex');
const failure=(code,message,status=0,requestId=null)=>Object.assign(new Error(message),{code,status,requestId});
const invalid=()=>failure('PROXY_CONFIG_INVALID','生产端配置校验失败。');
const verifyInvalid=()=>Object.assign(invalid(),{stage:'config_verify'});
const invalidAuthorization=()=>failure('CONFIG_AUTHORIZATION_INVALID','本次连接授权已失效，请重新连接。',401);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const encodedBytes=(value,length)=>typeof value==='string'&&/^[A-Za-z0-9_-]+$/.test(value)
  &&Buffer.from(value,'base64url').length===length&&Buffer.from(value,'base64url').toString('base64url')===value;
const requestId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)?value:null;

async function readResponse(response,signal) {
  if(signal.aborted)throw failure('REQUEST_TIMEOUT','生产配置请求超时。');
  const declared=response.headers?.get?.('Content-Length');
  if(declared!==null&&declared!==undefined&&(!/^[0-9]+$/.test(declared)||Number(declared)>MAX_RESPONSE_BYTES))throw invalid();
  const media=response.headers?.get?.('Content-Type');
  if(media&&!/^application\/json(?:\s*;|$)/i.test(media))throw invalid();
  if(typeof response.body?.getReader!=='function')throw invalid();
  const reader=response.body.getReader();
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  const chunks=[];
  let total=0;
  try {
    for(;;) {
      const {value,done}=await reader.read();
      if(done)break;
      if(!(value instanceof Uint8Array)||(total+=value.byteLength)>MAX_RESPONSE_BYTES)throw invalid();
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,total)));
  } catch(error) {
    cancel();
    throw error?.code?error:invalid();
  } finally {
    signal.removeEventListener('abort',cancel);
    reader.releaseLock();
  }
}

export function productionConfigSigningInput(value) {
  return Buffer.from([
    'dingtu-production-config-v1',value.data_source,value.deviceId,
    value.authorizationHandleDigest,value.bindingRevision,value.configRevision,
    value.expiresAt,value.signature.keyId,digest(value.config),
  ].join('\n'),'utf8');
}

export function createProductionTunnelClient({origin,trustedKeys,fetch:fetchImpl=globalThis.fetch,now=Date.now,timeoutMs=15000}={}) {
  let base;
  try {
    const url=new URL(origin);
    if(url.protocol!=='https:'||origin!==url.origin||url.username||url.password)throw Error();
    base=url.origin;
  } catch {
    throw failure('CONFIGURATION_INVALID','生产配置入口无效。');
  }
  if(!trustedKeys||typeof trustedKeys!=='object'||Array.isArray(trustedKeys)
      ||Object.keys(trustedKeys).length<1||Object.keys(trustedKeys).length>4
      ||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000
      ||typeof fetchImpl!=='function'||typeof now!=='function') {
    throw failure('CONFIGURATION_INVALID','生产配置验签设置无效。');
  }
  const pins=new Map();
  for(const [keyId,jwk] of Object.entries(trustedKeys)) {
    if(!object(jwk)||Object.keys(jwk).some(key=>!['kty','crv','x','alg','use','key_ops'].includes(key))
        ||jwk.kty!=='OKP'||jwk.crv!=='Ed25519'||!encodedBytes(jwk.x,32))throw invalid();
    const raw=Buffer.from(jwk.x,'base64url');
    if(raw.length!==32||raw.toString('base64url')!==jwk.x||keyId!=='ed25519-'+digest(raw))throw invalid();
    pins.set(keyId,createPublicKey({key:jwk,format:'jwk'}));
  }

  function checkedEnvelope(envelope,{deviceId,authorizationHandle}) {
    const fields=['data_source','deviceId','authorizationHandleDigest','bindingRevision','configRevision','expiresAt','config','signature'];
    if(!object(envelope)||Object.keys(envelope).length!==fields.length||fields.some(key=>!Object.hasOwn(envelope,key))
        ||envelope.data_source!=='production'||envelope.deviceId!==deviceId
        ||envelope.authorizationHandleDigest!==digest(authorizationHandle)||!SHA.test(envelope.authorizationHandleDigest)
        ||typeof envelope.bindingRevision!=='string'||!/^binding-[1-9][0-9]{0,15}$/.test(envelope.bindingRevision)
        ||typeof envelope.config!=='string'||Buffer.byteLength(envelope.config)>MAX_BYTES
        ||envelope.configRevision!=='cfg-'+digest(envelope.config)
        ||!object(envelope.signature)||Object.keys(envelope.signature).length!==2
        ||typeof envelope.signature.keyId!=='string'
        ||typeof envelope.signature.value!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(envelope.signature.value))throw verifyInvalid();
    if(typeof envelope.expiresAt!=='string')throw verifyInvalid();
    const until=Date.parse(envelope.expiresAt);
    if(!Number.isFinite(until)||envelope.expiresAt!==new Date(until).toISOString()||until<=now()||until>now()+MAX_CONFIG_TTL_MS)throw verifyInvalid();
    const key=pins.get(envelope.signature.keyId);
    const signature=Buffer.from(envelope.signature.value,'base64url');
    if(!key||signature.length!==64||signature.toString('base64url')!==envelope.signature.value
        ||!verify(null,productionConfigSigningInput(envelope),key,signature))throw verifyInvalid();
    let config;
    try { config=validateTunnelConfig(JSON.parse(envelope.config)); } catch { throw verifyInvalid(); }
    if(config.inbounds.length!==1||config.inbounds[0].type!=='mixed'
        ||config.experimental?.clash_api?.external_controller||config.experimental?.v2ray_api?.listen)throw verifyInvalid();
    try { validateProductionConfigPolicy(config); }
    catch(err) { if(err && typeof err==='object') err.stage='config_verify'; throw err; }
    return {
      data_source:'production',deviceId,config,expiresAt:envelope.expiresAt,
      configRevision:envelope.configRevision,bindingRevision:envelope.bindingRevision,
    };
  }

  async function getConfig({authorizationHandle,expiresAt,deviceId,privateKeyJwk}={}) {
    const at=now();
    if(typeof authorizationHandle!=='string'||!authorizationHandle.startsWith('pah_')||!encodedBytes(authorizationHandle.slice(4),32)
        ||typeof deviceId!=='string'||!UUID.test(deviceId)
        ||!Number.isSafeInteger(at)||!/^[0-9]{13}$/.test(String(at))
        ||typeof expiresAt!=='string'||!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=at||Date.parse(expiresAt)>at+65_000)throw invalidAuthorization();
    const issuedAt=String(at);
    let deviceProof;
    try {
      const message=['dingtu-tunnel-config-v1','POST',base,CONFIG_PATH,digest(authorizationHandle),issuedAt].join('\n');
      deviceProof=sign(null,Buffer.from(message),createPrivateKey({key:privateKeyJwk,format:'jwk'})).toString('base64url');
    } catch {
      throw invalidAuthorization();
    }
    const controller=new AbortController();
    let timer;
    const deadline=new Promise((_,reject)=>{
      timer=setTimeout(()=>{
        reject(failure('REQUEST_TIMEOUT','生产配置请求超时。'));
        controller.abort();
      },timeoutMs);
    });
    const operation=async()=>{
      let response;
      try {
        response=await fetchImpl(base+CONFIG_PATH,{
          method:'POST',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal,
          headers:{Accept:'application/json','Content-Type':'application/json'},
          body:JSON.stringify({authorizationHandle,issuedAt,deviceProof}),
        });
      } catch {
        throw failure('NETWORK_ERROR','暂时无法连接生产配置入口。');
      }
      if(response.redirected||response.status>=300&&response.status<400)throw invalid();
      if(response.ok&&response.status!==200)throw invalid();
      const preRequestId=requestId(response.headers?.get?.('X-Request-Id'));
      if(!response.ok){
        const media=response.headers?.get?.('Content-Type');
        if(media&&!/^application\/json(?:\s*;|$)/i.test(media)){
          throw failure('PROXY_CONFIG_UNAVAILABLE','生产端暂时无法提供连接配置。',response.status>=500?response.status:503,preRequestId);
        }
      }
      let payload;
      try { payload=await readResponse(response,controller.signal); }
      catch(err){
        if(!response.ok&&response.status>=500)throw failure('PROXY_CONFIG_UNAVAILABLE','生产端暂时无法提供连接配置。',response.status,preRequestId);
        throw err;
      }
      const responseRequestId=preRequestId;
      if(!response.ok) {
        const allowed={CONFIG_AUTHORIZATION_INVALID:401,SESSION_INVALID:401,SUBSCRIPTION_DISABLED:403,INSUFFICIENT_SCOPE:403,
          BRIDGE_UNAVAILABLE:503,PRODUCTION_MAPPING_NOT_READY:503,PRODUCTION_LEASE_UNAVAILABLE:503};
        const code=payload?.error?.code;
        const safeId=requestId(payload?.error?.request_id)||responseRequestId;
        if(allowed[code]===response.status) {
          throw failure(code,code==='CONFIG_AUTHORIZATION_INVALID'?'本次连接授权已失效，请重新连接。':'生产端暂时无法提供连接配置。',response.status,safeId);
        }
        throw failure('PROXY_CONFIG_UNAVAILABLE','生产端暂时无法提供连接配置。',503,safeId);
      }
      return {...checkedEnvelope(payload,{deviceId,authorizationHandle}),requestId:responseRequestId};
    };
    try { return await Promise.race([operation(),deadline]); }
    finally { clearTimeout(timer);controller.abort(); }
  }
  return Object.freeze({getConfig});
}
