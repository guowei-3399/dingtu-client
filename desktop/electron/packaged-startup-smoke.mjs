import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const {_electron}=await import(pathToFileURL('D:/singbox/ops-integration/node_modules/playwright-core/index.mjs'));
await mkdir(path.join(dir,'../.runtime'),{recursive:true});
const tmp=await mkdtemp(path.join(dir,'../.runtime/packaged-startup-'));
const env={...process.env};
for(const key of ['ELECTRON_RUN_AS_NODE','NOYA_API_BASE','NOYA_PORTAL_URL','NOYA_LOCAL_PROXY_PORT'])delete env[key];
const electron=await _electron.launch({executablePath:path.join(dir,'dist/win-unpacked/定途.exe'),args:['--disable-gpu','--user-data-dir='+tmp],env});
try{
  const page=await electron.firstWindow();
  await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true'&&!!window.NoyaDesktop);
  assert.match(page.url(),/^file:.*app\.asar\/index\.html/);
  assert.equal(await page.locator('#launch-promotion-dialog').evaluate(el=>el.open),true);
  const status=await page.evaluate(()=>NoyaDesktop.auth.invoke('auth.status'));
  assert.equal(status.ok,true);assert.equal(status.value.status,'signed_out');
  assert.equal(await page.locator('#workspace-name').innerText(),'访客');
  await page.screenshot({path:path.join(tmp,'packaged-first-frame.png')});
  console.log(JSON.stringify({result:'passed',renderer:'app.asar/index.html',preload:true,firstFrame:'splash',isolatedUserData:true,productionLogin:false}));
}finally{await electron.close();}
