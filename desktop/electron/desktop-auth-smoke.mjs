import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,mkdtemp,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Local fixture through the real Electron main/preload/loopback/secure store.
// Never logs in a real customer or connects an agent or production tunnel.
const dir=path.dirname(fileURLToPath(import.meta.url));
const {_electron}=await import(pathToFileURL('D:/singbox/ops-integration/node_modules/playwright-core/index.mjs'));
let redirectUri,exchanges=0;
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');res.setHeader('Content-Type','application/json');
  const send=(code,data)=>{res.writeHead(code);res.end(JSON.stringify(data));};
  if(url.pathname==='/api/v1/client/authorize'){
    redirectUri=url.searchParams.get('redirect_uri');const callback=new URL(redirectUri);callback.searchParams.set('state',url.searchParams.get('state'));callback.searchParams.set('code','local-smoke-code');
    await fetch(callback);send(200,{ok:true});return;
  }
  if(url.pathname==='/api/v1/client/device/sessions'&&req.method==='POST'){
    let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);
    assert.equal(body.redirectUri,redirectUri);assert.equal(body.authorizationCode,'local-smoke-code');assert.ok(body.codeVerifier.length>=43);exchanges++;
    send(201,{device:{id:'11111111-1111-4111-8111-111111111111',platform:'windows',appVersion:'0.2.0',status:'active',createdAt:new Date().toISOString()},session:{accessToken:'nda_local-smoke-fixture-only',refreshToken:'ndr_local-smoke-fixture-only',expiresIn:600,refreshExpiresAt:new Date(Date.now()+86400000).toISOString(),scope:['customer.read','catalog.read','identity.read','tunnel.read','tunnel.heartbeat']}});return;
  }
  if(url.pathname==='/api/v1/me'){
    assert.equal(req.headers.authorization,'Bearer nda_local-smoke-fixture-only');
    send(200,{user:{id:'local-smoke-user',email:'fixture@example.test',displayName:'Electron 授权回归',customerType:'personal',level:null,memberRole:'owner',role:'customer',emailVerified:true,status:'active'},csrfToken:null,expiresAt:new Date(Date.now()+600000).toISOString()});return;
  }
  send(503,{error:{code:'CATALOG_UNAVAILABLE',request_id:'req_local_fixture'}});
});
server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
await mkdir(path.join(dir,'../.runtime'),{recursive:true});
const tmp=await mkdtemp(path.join(dir,'../.runtime/electron-auth-smoke-'));
let electron;
try{
  const env={...process.env,NOYA_PORTAL_URL:'http://127.0.0.1:4174/assistant/',NOYA_API_BASE:`http://127.0.0.1:${server.address().port}`,NODE_ENV:'test'};
  delete env.ELECTRON_RUN_AS_NODE;
  electron=await _electron.launch({executablePath:process.env.DT_ELECTRON_EXECUTABLE||path.join(dir,'../.runtime/electron-37.10.3/electron.exe'),args:['--disable-gpu','--user-data-dir='+tmp,dir],env});
  await electron.evaluate(({shell})=>{shell.openExternal=async url=>{await fetch(url);};});
  const page=await electron.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(()=>!!window.NoyaDesktop&&document.documentElement.dataset.appReady==='true');
  assert.match(page.url(),/^file:/);
  await page.evaluate(()=>{dismissLaunchPromotion();go('settings');});
  await page.locator('#launch-promotion-dialog').waitFor({state:'hidden'});
  await page.locator('[data-auth-action=desktop-login]').click();
  await page.waitForFunction(()=>document.getElementById('workspace-name').textContent==='Electron 授权回归');
  assert.equal(exchanges,1);
  const userdata=await electron.evaluate(({app})=>app.getPath('userData'));
  assert.equal(path.resolve(userdata),path.resolve(tmp));
  assert.ok((await stat(path.join(userdata,'noya-device-session-v1.bin'))).size>0);
  const status=await page.evaluate(()=>NoyaDesktop.auth.invoke('auth.status'));
  assert.equal(status.value.status,'authenticated');assert.doesNotMatch(JSON.stringify(status),/nda_|ndr_|accessToken|refreshToken/);
  const diagnostics=await electron.evaluate(({app})=>app.getPath('logs'));
  const audit=await readFile(path.join(diagnostics,'noya-auth.log'),'utf8');
  assert.match(audit,/session_persisted/);assert.doesNotMatch(audit,/nda_|ndr_|fixture@example|Cookie|code_verifier/);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'passed',exchangeCount:exchanges,secureStore:true,renderer:'local packaged source',productionTraffic:false}));
}finally{if(electron)await electron.close();server.closeAllConnections();server.close();}
