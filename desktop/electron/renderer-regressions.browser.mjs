import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Browser-only regression fixtures. No production account or credentials.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=await import(pathToFileURL('D:/singbox/ops-integration/node_modules/playwright-core/index.mjs'));
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/')){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'AUTH_REQUIRED'}}));return;}
  const rel=decodeURIComponent(pathname.replace(/^\/assistant\//,''))||'index.html';
  const file=path.resolve(root,rel);
  if(!file.startsWith(root+path.sep)){res.writeHead(404).end();return;}
  try{const data=await readFile(file);const ext=path.extname(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'})[ext]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}
});
server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}/assistant/`;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
let passed=0;
try{
  const context=await browser.newContext({reducedMotion:'reduce'});
  await context.addInitScript(()=>sessionStorage.setItem('dingtu-assistant-preview','1'));
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let releaseImage;
  const gate=new Promise(r=>releaseImage=r);
  await page.route('**/launch-promotion-v1.png',async route=>{await gate;await route.continue();});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(()=>AssistantData.mainSite),true);
  assert.equal(await page.locator('#launch-promotion-dialog').evaluate(el=>el.open),true,'splash must already be open while image load is pending');
  assert.equal(await page.locator('#dock-connect').isDisabled(),true,'web UI cannot start a mock production tunnel');
  releaseImage();await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);passed+=3;await context.close();

  const desktop=await browser.newContext({reducedMotion:'reduce'});
  await desktop.addInitScript(()=>{
    sessionStorage.setItem('dingtu-assistant-launch-seen-v3','1');
    window.testControl={signedIn:false,failProxy:true,proxyState:'running',revoked:false,holdLogin:true};
    const user={id:'fixture-user',email:'fixture@example.test',displayName:'授权回归用户',customerType:'personal',level:null,memberRole:'owner',role:'customer',emailVerified:true,status:'active'};
    const template={status:'verified',adapter:'env-launch',templateRevision:1,detect:null,launch:null,account:null,packageName:null,openUri:null,verifiedAt:'2026-11-05T00:00:00.000Z',verifiedClientVersion:'fixture',notes:'本地测试夹具'};
    const apps=['claude-code','codex'].map((appId,i)=>({appId,name:appId,category:'coding',featured:true,officialUrl:'https://claude.ai/',logo:{assetId:'claude',sha256:'a'.repeat(64),mime:'image/png'},platforms:{windows:{...template,status:i?'unverified':'verified'}}}));
    window.NoyaDesktop={platform:'windows',auth:{invoke:async operation=>{
      if(operation==='auth.login'){
        if(testControl.holdLogin) return new Promise(resolve=>{testControl.completeLogin=resolve;});
        testControl.signedIn=true;return {ok:true,value:{status:'authenticated'}};
      }
      if(operation==='auth.cancel'){
        testControl.holdLogin=false;
        testControl.completeLogin({ok:false,error:{code:'AUTHORIZATION_CANCELLED'}});
        return {ok:true,value:{status:'cancelled'}};
      }
      return {ok:true,value:{status:'signed_out'}};
    }},read:async kind=>{
      if(!testControl.signedIn||testControl.revoked)return {ok:false,error:{code:'AUTH_REQUIRED',status:401}};
      if(kind==='me')return {ok:true,value:{user,csrfToken:null,expiresAt:new Date(Date.now()+600000).toISOString()}};
      if(kind==='catalog')return {ok:true,value:{data_source:'real',catalogRevision:1,generatedAt:'2026-11-05T00:00:00.000Z',checksum:'b'.repeat(64),platform:'windows',apps}};
      return {ok:false,error:{code:'REQUEST_FAILED',status:503}};
    },proxy:{invoke:async()=>testControl.failProxy?{ok:false,error:{code:'PROXY_CONFIG_UNAVAILABLE',message:'服务端隧道配置暂不可用。'}}:{ok:true,value:{state:testControl.proxyState}}},browser:{open:async()=>({ok:true})},agent:{invoke:async()=>({ok:false})}};
  });
  const p=await desktop.newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(e.message));await p.goto(base+'#settings');
  await p.locator('[data-auth-action=desktop-login]').click();
  assert.equal(await p.getByRole('heading',{name:'请在内置授权窗口中完成登录'}).count(),1);
  await p.getByRole('button',{name:'取消授权'}).click();
  await p.locator('[data-auth-action=desktop-login]').waitFor({state:'visible'});
  assert.equal(await p.locator('.auth-error:visible').count(),0);passed++;
  await p.locator('[data-auth-action=desktop-login]').click();
  await p.waitForFunction(()=>document.getElementById('workspace-name').textContent==='授权回归用户');
  assert.equal(await p.locator('#workspace-plan').innerText(),'主站账号已登录');passed++;
  await p.evaluate(()=>go('connection'));
  await p.locator('[data-action=toggle-app-library]').first().click();
  assert.equal(await p.locator('.tool-tile[aria-pressed=true]').count(),1);passed++;
  await p.locator('.rail-navigation [data-page="connection"]').click();
  assert.equal(await p.locator('#app-library').isHidden(),true);
  assert.equal(await p.locator('.rail-navigation [data-page="connection"]').first().getAttribute('aria-current'),'page');passed++;
  await p.locator('.rail-navigation [data-page="settings"]').click();
  await p.locator('.rail-navigation [data-page="connection"]').click();
  assert.equal(await p.locator('.rail-navigation [data-page="connection"]').first().getAttribute('aria-current'),'page');passed++;
  await p.locator('[data-action=toggle-app-library]').first().click();
  await p.locator('#dock-connect').click();
  await p.locator('.connection-feedback').getByText('服务端隧道配置暂不可用。').waitFor();
  await p.evaluate(()=>go('notifications'));
  assert.match(await p.locator('.notification-list').innerText(),/本机代理启动失败/);
  assert.doesNotMatch(await p.locator('.notification-list').innerText(),/模拟连接失败/);passed++;
  await p.evaluate(()=>{testControl.failProxy=false;go('connection');});await p.locator('#dock-connect').click();
  await p.waitForFunction(()=>document.getElementById('dock-connect').dataset.status==='connected');
  assert.equal(await p.locator('.selected-footer-strip').count(),0);
  assert.equal(await p.locator('.prototype-bar').isHidden(),true);
  assert.equal(await p.locator('.selected-app-workbench [data-action=quick-launch-app]').isEnabled(),true);
  await p.locator('.common-tools-bar [data-overview-select-app=codex]').click();
  await p.locator('.selected-app-workbench [data-overview-active-card]').waitFor();passed++;
  await p.evaluate(()=>{testControl.proxyState='stopped';});
  await p.waitForFunction(()=>document.getElementById('dock-connect').dataset.status==='failed',{},{timeout:5000});
  assert.equal(await p.locator('[data-action=browser-test]').getAttribute('aria-disabled'),'true');
  assert.equal(await p.locator('.selected-app-workbench [data-action=quick-launch-app]').getAttribute('aria-disabled'),'true');
  assert.equal(await p.locator('.selected-app-workbench [data-action=quick-launch-app]').evaluate(el=>el.classList.contains('is-disabled')),true);
  await p.locator('.selected-app-workbench [data-action=quick-launch-app]').click({force:true});
  await p.waitForFunction(()=>document.body.innerText.includes('连接')||document.body.innerText.includes('自有网络'));
  assert.match(await p.locator('.connection-feedback').innerText(),/本机连接已停止/);passed++;
  await p.evaluate(()=>{testControl.revoked=true;return refreshAuth();});assert.equal(await p.locator('#workspace-name').innerText(),'访客');
  assert.deepEqual(pageErrors,[]);passed++;await desktop.close();
  console.log(JSON.stringify({passed,productionTraffic:false,fixture:'isolated browser UI regressions'}));
}finally{await browser.close();server.closeAllConnections();server.close();}
