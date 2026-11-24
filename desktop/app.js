const icons={wave:'<path d="M2 10v4m4-9v14m4-16v18m4-15v12m4-9v6m4-5v4"/>',network:'<rect x="8" y="3" width="8" height="6" rx="1.5"/><path d="M12 9v5m-7 0h14M5 14v3m14-3v3"/><rect x="2" y="17" width="6" height="4" rx="1"/><rect x="16" y="17" width="6" height="4" rx="1"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',settings:'<path d="m9 3-.5 3-2 .9-2.5-1.2-2 3.5L4.2 11v2L2 14.8l2 3.5 2.5-1.2 2 .9L9 21h4l.5-3 2-.9 2.5 1.2 2-3.5-2.2-1.8v-2L20 9.2l-2-3.5-2.5 1.2-2-.9L13 3z"/><circle cx="11" cy="12" r="3"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2m0 3h.01"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>','arrow-up-right':'<path d="M6 18 18 6M6 6h12v12"/>',moon:'<path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',chevron:'<path d="m8 10 4 4 4-4"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',plug:'<path d="m7 7 10 10M6 12l6-6m-3 9-3 3m9-9 3-3M5 9l4-4m6 14 4-4M9 21l3-3m6-6 3-3"/>',power:'<path d="M12 3v9m-6.4-6.4a9 9 0 1 0 12.8 0"/>',check:'<path d="m5 12 4 4L19 6"/>',arrow:'<path d="M3 12h18m-6-6 6 6-6 6"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',terminal:'<path d="m5 7 5 5-5 5m8 0h6"/>',spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',command:'<path d="M9 7V5a2 2 0 1 0-2 2h10a2 2 0 1 0-2-2v14a2 2 0 1 0 2-2H7a2 2 0 1 0 2 2z"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 13 2m-1 10A8 8 0 0 1 5 16"/>',alert:'<path d="M10.3 3.8 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',loader:'<path d="M21 12a9 9 0 1 1-6-8.5"/>',external:'<path d="M14 3h7v7m0-7L10 14"/><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'};
Object.assign(icons,{bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-9 13h6"/>',home:'<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>',cursor:'<path d="m4 3 15 9-7 2-3 7z"/>',layers:'<path d="m12 3 10 5-10 5L2 8zm-9 10 9 5 9-5m-18 5 9 5 9-5"/>',eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>','eye-off':'<path d="M3 3l18 18"/><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2"/><path d="M9.9 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.3 4.3"/><path d="M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/>',tag:'<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8Z"/><circle cx="7" cy="7" r="1"/>',note:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',play:'<polygon points="6 4 20 12 6 20 6 4"/>',upload:'<path d="M12 15V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',trash:'<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-9 0v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6"/>',folder:'<path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3"/>',search:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',plus:'<path d="M12 5v14M5 12h14"/>',monitor:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>','shield-check':'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',chart:'<path d="M4 20V10m6 10V4m6 16v-8m4 8H2"/>',qr:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zm4 4h3v3h-3zm-4 3h3m4-7v3"/>','chevron-left':'<path d="m15 18-6-6 6-6"/>','chevron-right':'<path d="m9 18 6-6-6-6"/>'});
const svg=(name,cls='')=>name==='wave'?`<img class="dingtu-brand-mark${cls?' '+cls:''}" src="./assets/branding/dingtu-logo.jpg" alt="" aria-hidden="true">`:`<svg aria-hidden="true" viewBox="0 0 24 24"${cls?` class="${cls}"`:''}>${icons[name]||icons.info}</svg>`;
const iconize=()=>document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=svg(el.dataset.icon));
let apps=[];
const platforms={windows:{label:'Windows',mobile:false,desktop:true},macos:{label:'macOS',mobile:false,desktop:true},linux:{label:'Linux',mobile:false,desktop:true},ios:{label:'iPhone · iPad',mobile:true,desktop:false},android:{label:'Android',mobile:true,desktop:false}};
const catalogApi=globalThis.AssistantCatalog;
const localTools=globalThis.AssistantLocal;
const data=globalThis.AssistantData;
// Electron owns the authenticated device API in the main process. The
// browser build remains gated until the customer facade is deployed, while a
// desktop build may use the already-authenticated IPC bridge immediately.
const clientApiAvailable=()=>data.CLIENT_API_READY===true||!!globalThis.NoyaDesktop;
const catalogState={phase:data.mainSite?'idle':'preview',data:null,error:''};


const DEFAULT_PINNED_APPS=['codex','claude-code','claude-desktop','antigravity','grok','metamuse','cursor','copilot'];
const DROPPED_APP_IDS=new Set(['trae','traework','trae-cn','traework-cn','codebuddy','codebuddy-cn','qoder','zed','zcode']);
const PURE_WEB_CONTAINER_APPS=new Set(['gemini-web','grok','metamuse','manus']);
const FIVE_HOUR_WINDOW_APPS=new Set(['antigravity','gemini-cli','codex','codex-desktop','codex-cli','chatgpt','claude-code','claude','claude-desktop']);
const PINNED_STORAGE_KEY='dingtu-workbench-pinned-v2';
let localStorageHandle;
try{localStorageHandle=window.localStorage}catch{}
function loadPinnedApps(){
  try{
    const raw=localStorageHandle?.getItem(PINNED_STORAGE_KEY);
    if(raw){
      const parsed=JSON.parse(raw);
      if(Array.isArray(parsed)&&parsed.every(x=>typeof x==='string'&&/^[a-z0-9-]{1,64}$/.test(x)&&!DROPPED_APP_IDS.has(x)))return [...new Set(parsed)].slice(0,26);
    }
  }catch{}
  return [...DEFAULT_PINNED_APPS];
}
function savePinnedApps(list){
  state.pinnedApps=[...new Set(list.filter(x=>!DROPPED_APP_IDS.has(x)))].slice(0,26);
  try{localStorageHandle?.setItem(PINNED_STORAGE_KEY,JSON.stringify(state.pinnedApps));}catch{}
}
let state={page:'connection',platform:'windows',permissionGranted:false,selectedApp:'codex',scenario:'normal',status:'disconnected',hasConnectionAction:false,step:0,adopted:false,connectedAt:null,settings:{startup:false,autoConnect:true,notify:true},theme:'light',appCategory:'全部',appSearch:'',libraryExpanded:false,activeWorkspaceApp:null,workspaceTab:'accounts',accountViewMode:'cards',accountSearch:'',accountFilter:'all',accountTierFilter:'all',accountTagFilter:'all',accountGroupFilter:'all',accountSort:'quota',accountSortDir:'desc',selectedAccountIds:[],accountPage:1,accountPageSize:20,infoCalloutCollapsed:false,privacyMask:false,platformDropdownOpen:false,expandedSwitchHistory:{},overviewSpareIndexByApp:{},usageRange:'30d',usageGranularity:'day',usageType:'all',usageModel:'all',usageWorkspace:'all',usageTrendMetric:'totalTokens',usageSearch:'',autoRefreshMinutes:0,ticketStatusFilter:'all',selectedTicketId:null,totpTab:'saved',totpSearch:'',totpInputDraft:'',totpNameDraft:'',totpSelectedIds:[],oauthFlow:null,addModalAppId:null,addModalTab:'oauth',pinnedApps:loadPinnedApps()};
let connectionToken=0,toastTimer;
if(!data.mainSite&&catalogApi?.previewApps)localTools.configureAppDirectory(catalogApi.previewApps());
const preferenceStore=localTools.createPreferences(localStorageHandle);
const loadedPreferences=preferenceStore.load();
let devicePreferences=loadedPreferences.value;
let storageAvailable=loadedPreferences.ok;
const credentialPool=localTools.createCredentialPool(localStorageHandle);
let credentialPoolAvailable=false;
const localEvents=localTools.createEventLog({limit:80});
let pendingLocalAction=null;
let diagnosticFallback='';
const routes=new Set(['connection','egress','settings','notifications','help','diagnostics','totp','tickets']);
const view=kind=>data.snapshot(kind);
const identity=()=>view('identity').data||{};
const platform=()=>platforms[state.platform];
const availableApps=()=>apps.filter(app=>app.platformStatus!=='hidden'&&!DROPPED_APP_IDS.has(app.id)&&(!platform().mobile||app.mobile));
const favoriteApps=()=>availableApps().filter(app=>app.featured&&(!data.mainSite||app.platformStatus==='verified'));
const escapeHTML=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const isConnected=()=>state.status==='connected';
const spareAvailable=()=>(view('standby').data||[]).length>0;
const adopted=()=>identity().current_exit_summary?.role==='standby';
const ip=()=>identity().current_exit_summary?.ip||'';
const formatTraffic=value=>Number.isSafeInteger(value)&&value>=0?`${Math.floor(value/1073741824*100)/100} GiB`:'待接入';
// One chip for every adapter envelope that is not real data; demo values also carry 示例.
function sourceBadge(envelope){return !data.mainSite&&envelope&&envelope.data_source!=='real'?'<span class="source-chip" title="演示数据，不代表真实资源或权益">演示</span>':''}
function sampleText(envelope,value){return (envelope&&envelope.data_source!=='real'?'示例 ':'')+escapeHTML(value)}
function notify(message){const box=document.getElementById('toast');box.textContent=message;box.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.hidden=true,4200)}
function explain(title,copy){document.getElementById('dialog-heading').textContent=title;document.getElementById('dialog-copy').textContent=copy;document.getElementById('info-dialog').showModal()}
function platformDefaultTheme(){return platform().mobile?'dark':'light'}
function recordLocalEvent(code,details={}){localEvents.add(code,{platform:state.platform,simulated:!data.mainSite&&details.simulated!==false,...(details.appId?{appId:details.appId}:{}),read:!state.settings.notify});if(state.page==='notifications')localEvents.markAllRead()}
function saveDevicePreferences(message='偏好已保存在此浏览器，刷新后仍保留。'){devicePreferences.settings={...state.settings};const result=preferenceStore.save(devicePreferences);devicePreferences=result.value;storageAvailable=result.ok;if(!result.ok){recordLocalEvent('storage_unavailable',{simulated:false});notify('浏览器存储不可用，本次选择仅临时生效。')}else{recordLocalEvent('preferences_saved',{simulated:false});if(message)notify(message)}render()}
function applyPlatformPreferences(){const selected=devicePreferences.selectedApps[state.platform];const fallback=favoriteApps()[0]||availableApps()[0]||null;state.selectedApp=availableApps().some(app=>app.id===selected)?selected:fallback?.id||null;const category=devicePreferences.categories[state.platform];state.appCategory=(platform().mobile?['全部','通用','任务']:['全部','编程','通用','任务']).includes(category)?category:'全部';state.settings={...devicePreferences.settings};setTheme(devicePreferences.themes[state.platform]||platformDefaultTheme(),false)}
function loadDesktopBuiltinCatalog(currentPlatform,applyPrefs=true){
  if(!globalThis.NoyaDesktop||!catalogApi?.previewApps)return false;
  apps=catalogApi.previewApps();
  catalogState.phase='builtin';
  catalogState.data={data_source:'builtin',platform:currentPlatform,apps};
  catalogState.error='';
  localTools.configureAppDirectory(apps);
  if(applyPrefs)applyPlatformPreferences();
  return true;
}
async function loadCatalog(){
  const currentPlatform=state.platform;
  if(!data.mainSite){apps=catalogApi?.previewApps?.()||[];catalogState.phase='preview';catalogState.data={data_source:'mock',platform:currentPlatform,apps};applyPlatformPreferences();return;}
  if(!clientApiAvailable()){
    if(loadDesktopBuiltinCatalog(currentPlatform)){render();return;}
    apps=[];catalogState.phase='blocked';catalogState.error='运营端应用目录尚未归位，暂不读取目录。';applyPlatformPreferences();render();return;
  }
  catalogState.phase='loading';catalogState.error='';render();
  try{
    const result=await data.catalog(currentPlatform);
    if(currentPlatform!==state.platform)return;
    catalogState.data=result;catalogState.phase='ready';catalogState.error='';
    const normalizeAppDisplay=a=>a&&a.id==='claude'&&(a.name==='Claude'||!a.name)?{...a,name:'Claude Web',short:'Claude Web'}:a;
    const remoteApps=[...result.apps].filter(a=>!DROPPED_APP_IDS.has(a.id)).map(normalizeAppDisplay);
    if(globalThis.NoyaDesktop&&catalogApi?.previewApps){
      const existingIds=new Set(remoteApps.map(a=>a.id));
      const extras=catalogApi.previewApps().filter(a=>!existingIds.has(a.id)&&!DROPPED_APP_IDS.has(a.id)).map(normalizeAppDisplay);
      apps=[...remoteApps,...extras];
    }else{
      apps=remoteApps;
    }
    localTools.configureAppDirectory(apps);devicePreferences=preferenceStore.load().value;applyPlatformPreferences();
  }
  catch(error){
    if(currentPlatform!==state.platform)return;
    if(!(globalThis.NoyaDesktop&&(!authState.user||error?.code==='AUTH_REQUIRED'||error?.status===401)&&loadDesktopBuiltinCatalog(currentPlatform))){
      apps=[];catalogState.data=null;catalogState.phase='error';catalogState.error=error instanceof data.ApiError?error.message:'应用目录暂时不可用。';applyPlatformPreferences();
    }
  }
  render();
}
function setTheme(theme,persist=true){state.theme=theme;document.documentElement.dataset.theme=theme;document.getElementById('theme-toggle').innerHTML=svg(theme==='light'?'moon':'sun');document.getElementById('theme-toggle').setAttribute('aria-label',theme==='light'?'切换到深色主题':'切换到浅色主题');if(persist){devicePreferences.themes[state.platform]=theme;saveDevicePreferences()}else render()}
function routeFromHash(){const hash=window.location.hash.slice(1);if(hash==='applications'){state.libraryExpanded=true;window.history.replaceState({...window.history.state,assistantLibrary:true},'','#connection');return 'connection'}const page=routes.has(hash)?hash:'connection';if(page==='connection')state.libraryExpanded=window.history.state?.assistantLibrary===true;return page}
function requestLocalConfirmation(action){pendingLocalAction=action;document.getElementById('local-confirm-title').textContent=action==='reset-preferences'?'恢复本助手默认偏好？':'清空本机通知记录？';document.getElementById('local-confirm-copy').textContent=action==='reset-preferences'?'只清除此浏览器中定途助手的主题、应用选择和连接偏好。主站登录信息与其他站点数据不会被清除。':'仅删除本次页面会话中的本机事件，不影响主站账号或服务记录。';document.getElementById('local-confirm-dialog').showModal()}
function confirmLocalAction(){const action=pendingLocalAction;pendingLocalAction=null;document.getElementById('local-confirm-dialog').close();if(action==='clear-events'){localEvents.clear();render();notify('本次本机事件已清空。')}if(action==='reset-preferences'){const result=preferenceStore.clear();devicePreferences=result.value;storageAvailable=result.ok;applyPlatformPreferences();notify(result.ok?'已恢复本助手默认偏好，主站登录未受影响。':'浏览器存储不可用，已临时恢复默认偏好。')}}
function diagnosticJSON(){const report=localTools.buildDiagnostic({platform:state.platform,theme:state.theme,status:state.status,selectedApp:state.selectedApp,online:navigator.onLine,storageAvailable,viewport:{width:window.innerWidth,height:window.innerHeight},events:localEvents.list()});return typeof report==='string'?report:JSON.stringify(report,null,2)}
async function copyDiagnostic(){const generation=authGeneration;const json=diagnosticJSON();try{if(!navigator.clipboard?.writeText)throw new Error('unavailable');await navigator.clipboard.writeText(json);if(generation!==authGeneration)return;diagnosticFallback='';render();notify('脱敏诊断已复制，未上传任何数据。')}catch{if(generation!==authGeneration)return;recordLocalEvent('copy_failed',{simulated:false});diagnosticFallback=json;render();const field=document.getElementById('diagnostic-text');if(field){field.focus({preventScroll:true});field.select()}notify('自动复制不可用，请从下方文本框手动复制。')}}
function downloadDiagnostic(){const blob=new Blob([diagnosticJSON()],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download='dingtu-assistant-diagnostic.json';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('已生成本地诊断文件，未上传数据。')}

let desktopAuthBusy=false;
const isMainSite=data.mainSite;const allowSettingsAuthPrompt=isMainSite&&(['','4174'].includes(location.port));
const authState={phase:isMainSite?'loading':'preview',user:null,csrfToken:null,expiresAt:null,error:'',syncError:'',logoutBusy:false};
const accountOverview={phase:'idle',data:null,error:'',entitlement:null,entitlementError:'',identityDirectory:null,identityDirectoryError:'',identityDirectoryLoading:false};
const workbench={envMode:'safe_tunnel',exitGeo:null,switchingMode:false,launchingApp:null,switchingAndLaunching:null,agentProfiles:[],browserInstances:[],relays:[],relaysPhase:'idle',relaysError:'',accounts:[],activeByApp:{},detectedApps:{},groups:[],refreshingQuota:false,refreshingAccountKey:null,importingApp:null,switchingAccount:null,useManagedAcceleration:true,usageByApp:{},usageLoading:false,wakeupTasks:[],wakeupHistory:[],telemetryStatus:null,telemetrySyncing:false,tickets:[],ticketsLoading:false,activeTicketDetail:null,totpSaved:[],totpHistory:[],totpLiveResult:null};
const isEnterpriseUser=()=>authState.user?.customerType==='enterprise';
const isTunnelMode=(mode=workbench.envMode)=>mode==='safe_tunnel';
const isSafeEnvReady=()=>workbench.envMode==='own_network'||isConnected();
let authGeneration=0,lastUserId=null,lastAccountKey=null,accountBoundary=0,overviewRequest=0,expiryTimer=null,settingsAuthPromptPending=false,oauthPollTimer=null,totpTickTimer=null,autoRefreshTimer=null,autoQuotaRefreshAttempted=false,autoLocalImportAttempted=false;
function resetAccountOverview(){++accountBoundary;++overviewRequest;Object.assign(accountOverview,{phase:'idle',data:null,error:'',entitlement:null,entitlementError:'',identityDirectory:null,identityDirectoryError:'',identityDirectoryLoading:false});Object.assign(workbench,{exitGeo:null,launchingApp:null,switchingAndLaunching:null,agentProfiles:[],browserInstances:[],relays:[],relaysPhase:'idle',relaysError:'',accounts:[],activeByApp:{},groups:[],refreshingQuota:false,refreshingAccountKey:null,importingApp:null,switchingAccount:null,usageByApp:{},usageLoading:false,wakeupTasks:[],wakeupHistory:[],telemetryStatus:null,telemetrySyncing:false,tickets:[],ticketsLoading:false,activeTicketDetail:null});credentialPool.bindScope(null);credentialPoolAvailable=false;}
function mainSiteURL(path){return isMainSite?path:'http://127.0.0.1:4174'+path}
function accountName(){return authState.user?.displayName||authState.user?.email||'访客'}
function initialOf(value){return Array.from(String(value))[0]||'访'}
function accountInitial(){return initialOf(accountName())}
function accountCaption(){return {loading:'正在同步账号',authorizing:'等待浏览器授权',preview:'独立预览',anonymous:'未登录',error:'账号同步失败',expired:'会话已过期',authenticated:authState.syncError?'同步失败 · 显示上次资料':'主站账号已登录'}[authState.phase]}
function accountGreeting(){return authState.user?'你好，'+accountName():authState.phase==='loading'?'正在同步账号':'欢迎使用定途'}
function clearAccountSimulation(){connectionToken++;state.status='disconnected';state.hasConnectionAction=false;state.permissionGranted=false;state.connectedAt=null;autoQuotaRefreshAttempted=false;autoLocalImportAttempted=false;resetAccountOverview();data.reset();localEvents.clear();diagnosticFallback='';state.scenario='normal';document.getElementById('scenario-select').value='normal';clearInterval(oauthPollTimer);oauthPollTimer=null;state.oauthFlow=null;for(const id of ['permission-dialog','info-dialog','password-dialog','browser-instance-dialog','workbench-instance-dialog','add-account-dialog','account-meta-dialog','antigravity-launch-dialog','own-network-confirm-dialog'])document.getElementById(id)?.close()}
function scheduleExpiry(){clearTimeout(expiryTimer);expiryTimer=null;const at=Date.parse(authState.expiresAt||'');if(!authState.user||!Number.isFinite(at))return;expiryTimer=setTimeout(()=>refreshAuth(),Math.min(Math.max(at-Date.now(),0)+1000,2147483647))}
function signedOut(phase){clearTimeout(expiryTimer);expiryTimer=null;if(lastUserId!==null||authState.user)clearAccountSimulation();else resetAccountOverview();lastUserId=null;lastAccountKey=null;Object.assign(authState,{phase,user:null,csrfToken:null,expiresAt:null,syncError:'',error:''});if(globalThis.NoyaDesktop&&catalogApi?.previewApps)loadDesktopBuiltinCatalog(state.platform);}
function commitAccount(payload){const accountKey=[payload.user.id,payload.user.customerType,payload.user.memberRole].join(':');const changed=lastAccountKey!==accountKey;if(changed&&lastAccountKey!==null)clearAccountSimulation();const unchanged=!changed&&authState.phase==='authenticated'&&!authState.syncError&&JSON.stringify(authState.user)===JSON.stringify(payload.user);lastUserId=payload.user.id;lastAccountKey=accountKey;Object.assign(authState,{phase:'authenticated',user:payload.user,csrfToken:payload.csrfToken,expiresAt:payload.expiresAt||null,syncError:'',error:''});scheduleExpiry();if(unchanged){const members=view('tenant');if(members.error&&members.error.code!=='ENTERPRISE_ONLY')loadMembers();if(catalogState.phase!=='ready')loadCatalog();if(globalThis.NoyaDesktop)void syncDesktopWorkbench();if((globalThis.NoyaDesktop||state.page==='settings'||state.page==='egress')&&accountOverview.phase==='idle')void loadOverview().then(()=>syncDesktopWorkbench());return}render();loadMembers();loadCatalog();if(globalThis.NoyaDesktop){void syncDesktopWorkbench();void loadRelays();}if((globalThis.NoyaDesktop||state.page==='settings'||state.page==='egress')&&accountOverview.phase==='idle')void loadOverview().then(()=>syncDesktopWorkbench())}
// Every adapter 401 lands here: a previously signed-in user sees the expiry message, never a silent login prompt.
function handleUnauthorized(){if(authState.logoutBusy)return;const wasAuthenticated=!!authState.user||authState.phase==='expired';signedOut(wasAuthenticated?'expired':'anonymous');render()}
data.onUnauthorized(handleUnauthorized);
async function loadMembers(){const user=authState.user;if(user?.customerType!=='enterprise')return;await data.members();if(authState.user?.id===user.id)render()}
async function refreshAuth(){if(!isMainSite||authState.logoutBusy||authFormBusy||desktopAuthBusy)return;const generation=++authGeneration;if(authState.phase==='error'){authState.phase='loading';authState.error='';render()}try{const payload=await data.me();if(generation===authGeneration){commitAccount(payload);maybePromptSettingsAuth()}}catch(error){if(generation!==authGeneration)return;if(error?.status===401){const expired=!!authState.user||authState.phase==='expired';signedOut(expired?'expired':'anonymous');if(expired)recordLocalEvent('account_sync_failed',{simulated:false});render();maybePromptSettingsAuth();return}const message=error instanceof data.ApiError?error.message:'暂时无法同步账号，请重试。';if(authState.user){authState.syncError='同步失败，显示上次资料';render();return}authState.phase='error';authState.error=message;render();maybePromptSettingsAuth()}}
async function logoutAccount(){if(!isMainSite||authState.logoutBusy||!authState.user)return;if(!authState.csrfToken&&!globalThis.NoyaDesktop){authState.error='退出凭据尚未就绪，请刷新账号后重试。';render();return}++authGeneration;authState.logoutBusy=true;authState.error='';render();let done=false;try{await data.logout(authState.csrfToken);done=true}catch(error){if(error?.status===401||error?.code==='AUTH_REQUIRED')done=true;else if(error?.code==='CSRF_INVALID'){authState.logoutBusy=false;await refreshAuth();authState.logoutBusy=true;authState.error='退出凭据已更新，请刷新账号后重试。'}else authState.error=error?.code==='NETWORK_ERROR'?'网络异常，退出未完成，请重试。':'退出失败，请稍后重试。'}authState.logoutBusy=false;if(done){signedOut('anonymous');settingsAuthPromptPending=state.page==='settings';notify('已退出主站账号。')}render();maybePromptSettingsAuth()}
function openPasswordChange(){if(!isMainSite||!authState.user)return;const dialog=document.getElementById('password-dialog');const form=document.getElementById('password-change-form');form?.reset();const message=document.getElementById('password-change-message');if(message)message.textContent='';dialog?.showModal();dialog?.querySelector('input')?.focus({preventScroll:true})}
function closePasswordChange(){const dialog=document.getElementById('password-dialog');dialog?.close();const form=document.getElementById('password-change-form');form?.reset()}
async function submitPasswordChange(event){event.preventDefault();if(!isMainSite||!authState.user||!authState.csrfToken)return;const form=event.target;if(!form.reportValidity())return;const currentPassword=form.elements.currentPassword.value,newPassword=form.elements.newPassword.value,confirmPassword=form.elements.confirmPassword.value,message=document.getElementById('password-change-message'),submit=form.querySelector('button[type="submit"]');if(newPassword!==confirmPassword){message.textContent='两次输入的新密码不一致。';message.classList.add('error');return}submit.disabled=true;message.className='auth-form-message';message.textContent='正在修改密码…';try{await data.changePassword({currentPassword,newPassword},authState.csrfToken);closePasswordChange();signedOut('expired');settingsAuthPromptPending=state.page==='settings';render();notify('密码已修改，请使用新密码重新登录。')}catch(error){message.textContent=error?.message||'密码修改未完成，请稍后重试。';message.classList.add('error')}finally{submit.disabled=false;currentPassword.value='';newPassword.value='';confirmPassword.value=''} }
let authFormMode='login',authFormBusy=false,authFormGeneration=0,authReturnFocus=null;
function authMessage(message,error=false){const el=document.getElementById('auth-form-message');el.textContent=message;el.classList.toggle('error',error)}
function clearAuthPasswords(){for(const id of ['auth-password','auth-confirm-password']){const input=document.getElementById(id);if(input){input.value='';input.type='password'}}const toggle=document.querySelector('[data-auth-action="toggle-password"]');if(!toggle)return;toggle.textContent='显示';toggle.setAttribute('aria-label','显示密码');toggle.setAttribute('aria-pressed','false')}
function setAuthFormBusy(busy){authFormBusy=busy;const form=document.getElementById('assistant-auth-form');if(!form)return;form.setAttribute('aria-busy',String(busy));document.querySelectorAll('#assistant-auth-form input,#assistant-auth-form button,.auth-mode-options button').forEach(input=>input.disabled=busy||(!isMainSite&&input.matches('input,[type="submit"]')));document.getElementById('auth-form-submit').textContent=busy?(authFormMode==='register'?'正在创建账号…':'正在登录…'):(authFormMode==='register'?'创建账号':'登录')}
function setAuthMode(mode){if(authFormBusy)return;authFormMode=mode==='register'?'register':'login';clearAuthPasswords();authMessage('');const register=authFormMode==='register';document.getElementById('auth-name-label').hidden=!register;document.getElementById('auth-display-name').required=register;document.getElementById('auth-confirm-label').hidden=!register;document.getElementById('auth-confirm-password').required=register;document.getElementById('auth-password').autocomplete=register?'new-password':'current-password';document.getElementById('auth-password-rule').textContent=register?'密码为15–128个字符，空格不会被删除。':'输入你的账号密码（最多128个字符）。';document.querySelectorAll('[data-auth-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.authMode===authFormMode)));document.getElementById('auth-preview-note').hidden=isMainSite;setAuthFormBusy(false)}
function maybePromptSettingsAuth(){return}
function openAssistantAuth(){dismissLaunchPromotion();if(state.page!=='settings')go('settings');document.getElementById('auth-email')?.focus({preventScroll:true})}
function closeAssistantAuth(){return}
async function submitAssistantAuth(event){event.preventDefault();if(authFormBusy)return;if(!isMainSite){authMessage('独立预览不提交口令，请在同源助手中登录。',true);return}const form=event.target;if(!form.reportValidity())return;const email=document.getElementById('auth-email').value.trim().toLowerCase();const password=document.getElementById('auth-password').value;const displayName=document.getElementById('auth-display-name').value.trim();const register=authFormMode==='register';const passwordLength=Array.from(password).length;if(passwordLength<(register?15:1)||passwordLength>128){authMessage(register?'注册密码需15–128个字符。':'密码需1–128个字符。',true);document.getElementById('auth-password').focus();return}if(register&&(!displayName||Array.from(displayName).length>60)){authMessage('昵称需1–60个字符。',true);document.getElementById('auth-display-name').focus();return}if(register&&password!==document.getElementById('auth-confirm-password').value){authMessage('两次输入的密码不一致。',true);document.getElementById('auth-confirm-password').focus();return}if(email.length>254){authMessage('邮箱不能超过254个字符。',true);return}const generation=++authFormGeneration;const accountGeneration=++authGeneration;setAuthFormBusy(true);clearAuthPasswords();authMessage(register?'正在创建账号，请稍候。':'正在安全登录，请稍候。');try{const result=register?await data.register({displayName,email,password}):await data.login({email,password});if(generation!==authFormGeneration||accountGeneration!==authGeneration)return;commitAccount(result);form.reset();clearAuthPasswords();go('settings');notify(register?'账号已创建，套餐和出口尚未开通。':'已登录，继续使用连接助手。')}catch(error){if(generation!==authFormGeneration)return;const message=typeof error?.message==='string'&&error.message?error.message:'账号服务暂时不可用，请稍后重试。';authMessage(error?.status===429?message+' 请稍后重试，不要连续提交。':message,true);document.getElementById('auth-form-message').focus({preventScroll:true})}finally{if(generation===authFormGeneration){setAuthFormBusy(false);clearAuthPasswords()}}}
document.addEventListener('submit',event=>{const formId=event.target?.getAttribute?.('id')||'';if(formId==='assistant-auth-form')submitAssistantAuth(event);if(formId==='password-change-form')submitPasswordChange(event)});

async function desktopLogin(){
  if(!globalThis.NoyaDesktop?.auth?.invoke||desktopAuthBusy)return;
  desktopAuthBusy=true;
  ++authGeneration;
  authState.phase='authorizing';
  authState.error='';
  render();
  try{
    const result=await globalThis.NoyaDesktop.auth.invoke('auth.login');
    if(result?.error?.code==='AUTHORIZATION_CANCELLED'){
      signedOut('anonymous');
      render();
      return;
    }
    if(!result?.ok||result.value?.status!=='authenticated')throw new Error(result?.error?.message||'桌面授权尚未完成。');
    authState.phase='loading';
    desktopAuthBusy=false;
    render();
    await refreshAuth();
  }catch(error){
    authState.phase='error';
    authState.error=error?.message||'桌面授权未完成，请重试。';
    recordLocalEvent('account_sync_failed',{simulated:false});
    render();
  }finally{
    desktopAuthBusy=false;
  }
}
async function cancelDesktopLogin(button){
  if(!desktopAuthBusy||authState.phase!=='authorizing')return;
  button.disabled=true;
  try{
    const result=await globalThis.NoyaDesktop.auth.invoke('auth.cancel');
    if(result?.ok){
      if(result.value?.status==='finishing'&&authState.phase==='authorizing'){
        authState.phase='loading';
        render();
      }
      return;
    }
  }catch{}
  button.disabled=false;
}

document.addEventListener('click',event=>{const mode=event.target.closest('[data-auth-mode]');if(mode){setAuthMode(mode.dataset.authMode);return}const action=event.target.closest('[data-auth-action]')?.dataset.authAction;if(action==='desktop-login'){desktopLogin();return}if(action==='cancel-desktop-login'){void cancelDesktopLogin(event.target.closest('button'));return}if(action==='close')closeAssistantAuth();if(action==='toggle-password'&&!authFormBusy){const input=document.getElementById('auth-password');const visible=input.type==='password';input.type=visible?'text':'password';const button=event.target.closest('button');button.textContent=visible?'隐藏':'显示';button.setAttribute('aria-label',visible?'隐藏密码':'显示密码');button.setAttribute('aria-pressed',String(visible))}});
let launchTimer=null,launchExitTimer=null,launchReturnFocus=null,launchGeneration=0;
const launchSeenKey='dingtu-assistant-launch-seen-v3';
function dismissLaunchPromotion(){const dialog=document.getElementById('launch-promotion-dialog');if(dialog?.classList.contains('is-closing'))return;++launchGeneration;clearInterval(launchTimer);clearTimeout(launchExitTimer);launchTimer=null;if(!dialog?.open){document.documentElement.classList.remove('splash-active');return;}go('connection');dialog.classList.add('is-closing');const finish=()=>{dialog.close();dialog.classList.remove('is-closing');document.documentElement.classList.remove('splash-active');document.getElementById('main-content').focus({preventScroll:true})};if(matchMedia('(prefers-reduced-motion: reduce)').matches)finish();else{const duration=parseFloat(getComputedStyle(dialog).getPropertyValue('--launch-exit-duration'))||1100;launchExitTimer=setTimeout(finish,duration)}}
function showLaunchPromotion({force=false}={}){if(document.querySelector('dialog[open]'))return;try{if(!force&&sessionStorage.getItem(launchSeenKey)==='1')return}catch{}const generation=++launchGeneration;const dialog=document.getElementById('launch-promotion-dialog');const artwork=document.getElementById('launch-promotion-image');const slogan=document.getElementById('launch-slogan-image');try{sessionStorage.setItem(launchSeenKey,'1')}catch{}launchReturnFocus=document.activeElement;dialog.classList.remove('is-closing');dialog.dataset.paused=String(document.hidden);document.getElementById('launch-promotion-countdown').textContent='4';document.documentElement.classList.add('splash-active');dialog.showModal();document.getElementById('launch-promotion-skip').focus({preventScroll:true});let seconds=4;launchTimer=setInterval(()=>{if(document.hidden)return;seconds--;document.getElementById('launch-promotion-countdown').textContent=String(Math.max(0,seconds));if(seconds<=0)dismissLaunchPromotion()},1000);Promise.all(Array.from(dialog.querySelectorAll('img'),image=>image.decode().catch(()=>{}))).then(()=>{if(generation!==launchGeneration)return;if(artwork.complete&&!artwork.naturalWidth){artwork.hidden=true;return}document.getElementById('launch-promotion-title').classList.toggle('artwork-unavailable',!slogan.naturalWidth)});}
document.getElementById('launch-promotion-skip').addEventListener('click',dismissLaunchPromotion);
document.getElementById('launch-promotion-dialog').addEventListener('cancel',event=>{event.preventDefault();dismissLaunchPromotion()});
document.getElementById('launch-promotion-image').addEventListener('error',()=>{document.getElementById('launch-promotion-image').hidden=true;dismissLaunchPromotion()});
document.getElementById('launch-slogan-image').addEventListener('error',()=>document.getElementById('launch-promotion-title').classList.add('artwork-unavailable'));
document.getElementById('launch-slogan-image').addEventListener('load',()=>document.getElementById('launch-promotion-title').classList.remove('artwork-unavailable'));
document.addEventListener('visibilitychange',()=>{document.getElementById('launch-promotion-dialog').dataset.paused=String(document.hidden)});
document.addEventListener('click',event=>{if(event.target.closest('[data-action="replay-launch"]'))showLaunchPromotion({force:true})});
function authFormPanel(preview,expired){if(globalThis.NoyaDesktop)return (authState.error?'<p class="auth-error" role="alert">'+escapeHTML(authState.error)+'</p>':'')+'<section class="auth-panel auth-inline" aria-label="桌面账号授权"><span class="auth-avatar">'+svg('lock')+'</span><h2>登录定途桌面端</h2><p>内置浏览器完成主站授权后，账号权限会回到本机桌面端。</p><button class="button primary" type="button" data-auth-action="desktop-login">在内置浏览器中登录</button><p class="auth-form-note">账号权限与主站一致，授权信息仅由本机安全存储保管。</p></section>';const title=preview?'登录你的定途账号':expired?'会话已过期，请重新登录':'登录你的定途账号';const copy=preview?'这是独立助手预览；真实登录只在同源助手内提交。':expired?'主站会话已结束，请重新登录后继续使用助手。':'登录后在连接助手内管理账号、套餐与本机偏好。';return '<section class="auth-panel auth-inline" aria-label="账号登录"><span class="auth-avatar">'+svg(expired?'lock':'user')+'</span><h2 '+(expired?'role="alert"':'')+'>'+title+'</h2><p>'+escapeHTML(copy)+'</p><div class="auth-mode-options" role="group" aria-label="账号操作"><button type="button" data-auth-mode="login" aria-pressed="true">登录</button><button type="button" data-auth-mode="register" aria-pressed="false">注册</button></div><form id="assistant-auth-form"><label id="auth-name-label" hidden>昵称<input id="auth-display-name" name="displayName" autocomplete="nickname" maxlength="120" placeholder="你的昵称"></label><label>邮箱<input id="auth-email" name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com"></label><label>密码<span class="auth-password-field"><input id="auth-password" name="password" type="password" autocomplete="current-password" maxlength="256" required aria-describedby="auth-password-rule"><button type="button" data-auth-action="toggle-password" aria-label="显示密码" aria-pressed="false">显示</button></span></label><p id="auth-password-rule" class="auth-form-note">输入你的账号密码。</p><label id="auth-confirm-label" hidden>确认密码<input id="auth-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" maxlength="256" placeholder="再次输入密码"></label><p id="auth-form-message" class="auth-form-message" role="status" aria-live="polite" tabindex="-1"></p><button id="auth-form-submit" class="button primary" type="submit">登录</button></form><p id="auth-preview-note" class="auth-form-note" hidden>独立预览不接收口令；当前不会跳转或跨站提交。</p><p class="auth-dialog-footnote">注册为个人账号，套餐与出口需另行开通；企业成员使用已有邀请。</p></section>'}
function membersCard(){const user=authState.user;if(!user||user.customerType!=='enterprise')return '';const envelope=view('tenant');if(envelope.error?.code==='ENTERPRISE_ONLY')return '';const manager=['owner','admin'].includes(user.memberRole);let body,count='';if(envelope.error)body=`<p class="auth-error" role="alert">${escapeHTML(envelope.error.message)}</p>`;else if(!envelope.data)body='<p class="members-empty" aria-busy="true">正在读取企业成员…</p>';else{const all=Array.isArray(envelope.data.members)?envelope.data.members:[];const list=manager?all:all.filter(member=>member.userId===user.id);count=manager?list.length+' 人':'仅显示本人';body=list.length?`<ul class="member-list">${list.map(member=>{const name=member.displayName||member.email||'未命名成员';return `<li class="member-row" data-member-id="${escapeHTML(member.userId)}"><span class="member-avatar" aria-hidden="true">${escapeHTML(initialOf(name))}</span><div><strong>${escapeHTML(name)}${member.userId===user.id?' <small>（我）</small>':''}</strong><p>${escapeHTML(member.email||'')}</p></div><span class="badge neutral">${escapeHTML(data.labels.role(member.role))}</span><span class="badge ${member.status==='active'?'':'warning'}">${escapeHTML(data.labels.status(member.status))}</span></li>`}).join('')}</ul>`:'<p class="members-empty">暂无可显示的成员。</p>'}return `<section class="settings-section members-card" aria-label="企业成员"><div class="members-heading">${groupHeading('企业成员','user','green')}${count?`<span class="setting-value">${count}</span>`:''}</div>${body}<div class="members-footer"><p>成员邀请与停用在网站完成，助手内只读。</p><a class="button secondary" href="${mainSiteURL('/console')}" data-manage-members>在网站管理成员 ${svg('arrow-up-right')}</a></div></section>`}
function accountPanel(){if(authState.phase==='authorizing')return '<section class="auth-panel auth-inline" aria-label="等待桌面授权"><span class="auth-avatar">'+svg('lock')+'</span><h2>请在内置授权窗口中完成登录</h2><p role="status">在内置授权窗口完成定途主站登录并点击允许，授权完成后会自动同步账号。</p><button class="button secondary" type="button" data-auth-action="cancel-desktop-login">取消授权</button></section>';if(authState.phase==='loading')return `<section class="auth-panel" aria-busy="true"><h2>正在同步账号会话</h2><p>读取安全会话，请稍候。</p></section>`;if(!authState.user)return authFormPanel(authState.phase==='preview',authState.phase==='expired');const user=authState.user;const label=data.labels.account(user);return `<section class="auth-account">${authState.syncError?`<p class="sync-notice" role="status">${svg('alert')}<span>${escapeHTML(authState.syncError)}</span></p>`:''}<div class="settings-account-panel"><span class="profile-avatar" aria-hidden="true">${escapeHTML(accountInitial())}</span><div><strong>${escapeHTML(accountName())}</strong><p>${escapeHTML(user.email||'')}</p></div></div><details id="assistant-account-details" class="assistant-account-details" open><summary>账号详情 ${svg('chevron')}</summary><dl class="account-fields"><div><dt>账号类型</dt><dd>${label.type}</dd></div>${label.level?`<div><dt>订阅等级</dt><dd>${label.level}</dd></div>`:''}${label.entitlement?`<div><dt>企业权益</dt><dd>${label.entitlement}</dd></div>`:''}<div><dt>邮箱验证</dt><dd>${user.emailVerified?'已验证':'未验证'}</dd></div><div><dt>账号状态</dt><dd>${escapeHTML(label.status)}</dd></div>${label.role?`<div><dt>成员角色</dt><dd>${escapeHTML(label.role)}</dd></div>`:''}</dl></details><p class="account-resource-note">账号与资源摘要来自主站授权范围。${globalThis.NoyaDesktop?'设备已授权；本机代理和服务端出口观测分别显示。':isMainSite?'设备连接由桌面客户端执行，网页显示服务端资源。':'连接流程和出口详情仅为本地演示。'}</p>${authState.error?`<p class="auth-error" role="alert">${escapeHTML(authState.error)}</p>`:''}<div class="auth-actions"><button class="button secondary" data-action="account">账号详情 ${svg('chevron')}</button><button class="button secondary" data-action="change-password">修改密码</button><button class="button secondary" data-action="refresh-auth" ${authState.logoutBusy?'disabled':''}>刷新账号</button><button class="button logout-button" data-action="logout" ${authState.logoutBusy?'disabled':''}>${authState.logoutBusy?'正在退出…':'退出登录'}</button></div></section>`+membersCard()}
window.addEventListener('focus',()=>refreshAuth());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshAuth()});
const heading=(title,copy,action='')=>`<div class="page-heading"><div><h1>${title}</h1><p>${copy}</p></div>${action}</div>`;
const statusIcons={failed:'alert',expired:'lock','no-spare':'alert',unavailable:'lock'};

function route(){return `<div class="identity-heading"><h2>你的连接路径</h2><span>${svg('lock')}出口由服务端绑定</span></div><div class="route"><div class="route-node"><div class="route-node-label">${svg('user')}连接身份</div><strong>${sampleText(view('identity'),identity().display_name||'')}${sourceBadge(view('identity'))}</strong><small>${escapeHTML(view('entitlement').data?.plan_name||'')} · ${escapeHTML(identity().identity_id||'')}</small></div><div class="route-arrow">${svg('arrow')}</div><div class="route-node"><div class="route-node-label">${svg('network')}接入入口</div><strong>自动选择入口</strong><small>${isConnected()?'入口 A · 已连接':'按可用状态选择'}</small></div><div class="route-arrow">${svg('arrow')}</div><div class="route-node"><div class="route-node-label">${svg('shield')}专属出口</div><strong class="ip">${sampleText(view('egress'),ip())}${sourceBadge(view('egress'))}</strong><small>${escapeHTML(identity().current_exit_summary?.region||'')} · ${adopted()?'备用出口接管中':'固定主出口'}</small></div></div><p class="route-footnote">${svg('info')}入口可以变化；分配给你的出口保持粘性，应用不单独换 IP。</p>`}
const emptyApp={id:'',name:'应用目录未加载',short:'应用目录',category:'通用',brand:null,color:'blue',mode:'unverified',mobile:false,copy:'请先同步运营端应用目录。',featured:false,officialUrl:null,platformStatus:'unverified'};
function selectedApplication(){return availableApps().find(app=>app.id===state.selectedApp)||availableApps()[0]||emptyApp}
function dimensionalIcon(app,extra=''){const asset=catalogApi?.assetPath?.(app);if(app.brand&&asset)return `<span class="dimensional-icon app-brand brand-${escapeHTML(app.brand)} ${extra}" aria-hidden="true"><img class="app-brand-logo" src="${escapeHTML(asset)}" alt="" width="32" height="32" draggable="false"></span>`;return `<span class="dimensional-icon ${escapeHTML(app.color||'blue')} ${extra}"><span class="icon-inlay">${svg(app.icon||'grid')}</span></span>`}

function toolTile(app){return `<button class="tool-tile ${state.selectedApp===app.id?'selected':''}" data-select-app="${escapeHTML(app.id)}" aria-pressed="${state.selectedApp===app.id}" aria-label="选择 ${escapeHTML(app.name)}">${dimensionalIcon(app)}<strong>${escapeHTML(app.short)}</strong>${state.selectedApp===app.id?`<span class="tile-check">${svg('check')}</span>`:''}</button>`}
function selectedToolRow(){const app=selectedApplication();const desktopReady=!!globalThis.NoyaDesktop&&!!authState.user&&isConnected();const canLaunch=!!app.id&&isConnected()&&(!globalThis.NoyaDesktop||desktopReady)&&app.mode==='verified';return `<div class="selected-tool-row">${dimensionalIcon(app,'small')}<div class="selected-tool-copy"><strong>${escapeHTML(app.name)}</strong><span>${catalogState.phase==='error'?'应用目录暂不可用':isConnected()?(app.mode==='unverified'?'适配待验证':app.mode==='beta'?'适配测试中':'适配已验证')+sourceBadge(view('identity')):'连接后使用'}</span></div><button class="button ${canLaunch?'primary':'muted'} selected-open" data-action="launch-selected" ${canLaunch?'':'disabled'}>${canLaunch?'启动实例':svg('lock')+(isConnected()?'等待适配验证':'待连接')}</button></div>`}
function samplePreviewAccounts(){
  if(isMainSite||globalThis.NoyaDesktop)return [];
  return [
    {id:'main',appId:'codex',label:'dev-primary@example.com',email:'dev-primary@example.com',plan:'Pro',source:'local-import',isActive:true,status:'ready',quotaState:'synced',quotas:[{id:'5h',label:'5h 限额',remainingPct:82,usedText:'82% 剩余',resetAt:new Date(Date.now()+10800000).toISOString(),tone:'high'},{id:'7d',label:'周限额',remainingPct:64,usedText:'64% 剩余',resetAt:new Date(Date.now()+345600000).toISOString(),tone:'high'}]},
    {id:'main',appId:'claude-code',label:'claude-main@example.com',email:'claude-main@example.com',plan:'Max',source:'local-import',isActive:true,status:'ready',quotaState:'synced',quotas:[{id:'5h',label:'5h 限额',remainingPct:46,usedText:'46% 剩余',resetAt:new Date(Date.now()+5400000).toISOString(),tone:'mid'},{id:'7d',label:'7d 限额',remainingPct:78,usedText:'78% 剩余',resetAt:new Date(Date.now()+432000000).toISOString(),tone:'high'}]},
    {id:'main',appId:'cursor',label:'cursor-pro@example.com',email:'cursor-pro@example.com',plan:'Pro',source:'local-import',isActive:true,status:'ready',quotaState:'local_detected',quotas:[]},
  ];
}
function maskEmail(value){
  const text=String(value||'');
  if(!state.privacyMask||!text)return text;
  const at=text.indexOf('@');
  if(at>1)return `${text.slice(0,2)}***${text.slice(at)}`;
  if(text.length>4)return `${text.slice(0,2)}***${text.slice(-2)}`;
  return '***';
}
function accountDisplayName(acct){
  if(!acct)return '';
  return maskEmail(acct.email||acct.label||acct.id);
}
function normalizeTierInfo(plan){
  const raw=String(plan||'').trim().toUpperCase();
  if(!raw)return {label:'',cls:'tier-free'};
  if(raw.includes('ULTRA'))return {label:'ULTRA',cls:'tier-ultra'};
  if(raw.includes('MAX'))return {label:'MAX',cls:'tier-max'};
  if(raw.includes('PRO'))return {label:'PRO',cls:'tier-pro'};
  if(raw.includes('PLUS'))return {label:'PLUS',cls:'tier-plus'};
  if(raw.includes('TEAM')||raw.includes('ENTERPRISE'))return {label:raw.slice(0,12),cls:'tier-pro'};
  if(raw.includes('FREE'))return {label:'FREE',cls:'tier-free'};
  return {label:raw.slice(0,12),cls:'tier-free'};
}
function tierBadgeHtml(plan){
  const info=normalizeTierInfo(plan);
  return info.label?`<span class="tier-badge ${info.cls}">${escapeHTML(info.label)}</span>`:'';
}
function accountStatusBadgeHtml(acct){
  if(!acct)return '';
  if(acct.status==='banned')return '<span class="badge danger">已封号/停用</span>';
  if(acct.status==='invalid')return '<span class="badge danger">异常/已失效</span>';
  return '';
}
function formatShortTime(iso){
  if(!iso)return '';
  const ts=Date.parse(iso);
  if(!Number.isFinite(ts))return '';
  const d=new Date(ts);
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function allManagedAccounts(){
  return globalThis.NoyaDesktop||isMainSite?workbench.accounts:samplePreviewAccounts();
}
function accountsForApp(appId){
  const list=allManagedAccounts().filter(a=>a.appId===appId);
  const activeId=globalThis.NoyaDesktop?workbench.activeByApp[appId]:(list[0]?.id||null);
  return list.map(item=>({...item,isActive:activeId?item.id===activeId:Boolean(item.isActive)}));
}
function activeAccountForApp(appId){
  const list=accountsForApp(appId);
  return list.find(item=>item.isActive)||list[0]||null;
}
function formatResetCountdown(iso){
  if(!iso)return '';
  const diff=Date.parse(iso)-Date.now();
  if(!Number.isFinite(diff))return '';
  if(diff<=0)return '已重置';
  const totalMin=Math.ceil(diff/60000);
  const days=Math.floor(totalMin/1440);
  const hours=Math.floor((totalMin%1440)/60);
  const mins=totalMin%60;
  if(days>0)return `${days}d ${hours}h`;
  if(hours>0)return `${hours}h ${mins}m`;
  return `${mins}m`;
}
function resolvedPinnedApps(){
  const avail=availableApps();
  const byId=new Map(avail.map(a=>[a.id,a]));
  const matched=state.pinnedApps.map(id=>byId.get(id)).filter(Boolean);
  return matched.length?matched:avail.slice(0,8);
}
function isAppRunning(appId){
  const shellId=browserShellAppMap[appId];
  const adapterId=desktopAdapterIds[appId]||appId;
  const hasBrowser=workbench.browserInstances.some(item=>item.appId===appId||(shellId&&item.appId===shellId));
  const hasAgent=workbench.agentProfiles.some(item=>['starting','running'].includes(item.status)&&(item.appId===appId||item.appId===adapterId));
  return hasBrowser||hasAgent;
}
function appInstallMeta(app){
  if(isAppRunning(app.id))return {label:'运行中',tone:'',running:true};
  const preferShell=Boolean(browserShellAppMap[app.id])&&!(app.id==='metamuse'&&state.platform==='macos');
  if(preferShell)return {label:'独立容器',tone:'neutral',running:false};
  const detected=workbench.detectedApps[app.id]?.status;
  if(detected==='installed')return {label:'本机已安装',tone:'neutral',running:false};
  if(detected==='not-installed')return {label:'未检测到安装',tone:'neutral',running:false};
  return {label:app.mode==='verified'?'已就绪':'待确认',tone:'neutral',running:false};
}
function alignDisplayQuotas(appId,rawQuotas){
  const src=Array.isArray(rawQuotas)?rawQuotas.filter(Boolean):[];
  if(!src.length)return [];
  const normApp=String(appId||'').toLowerCase();
  const is5hItem=q=>/5h|five_hour|5\s*小时/i.test(`${q.id||''} ${q.label||''}`);
  const isWeeklyItem=q=>/weekly|seven_day|7d|周限额|周额度|7\s*天/i.test(`${q.id||''} ${q.label||''}`)&&!/opus|sonnet/i.test(`${q.id||''} ${q.label||''}`);
  if(normApp==='antigravity'||normApp==='gemini-cli'){
    // Filter out legacy cached synthetic partner tiles (e.g. empty-bar '周窗口未触发上限'
    // or stale synthetic 100% '周配额充足' without resetAt when a real 5h quota exists).
    const realHasLow5h={
      gemini:src.some(q=>/gemini/i.test(`${q.id||''} ${q.label||''}`)&&is5hItem(q)&&Number.isFinite(q.remainingPct)&&q.remainingPct<100),
      claude:src.some(q=>/claude/i.test(`${q.id||''} ${q.label||''}`)&&is5hItem(q)&&Number.isFinite(q.remainingPct)&&q.remainingPct<100),
    };
    const cleaned=src.filter(q=>{
      const hint=String(q.statusHint||'');
      if(q.remainingPct===null&&/周窗口未触发上限|按周窗口计费|周额度已用尽/.test(hint))return false;
      if(!q.resetAt&&hint==='周配额充足'&&q.remainingPct===100){
        if(/gemini/i.test(`${q.id||''} ${q.label||''}`)&&realHasLow5h.gemini)return false;
        if(/claude/i.test(`${q.id||''} ${q.label||''}`)&&realHasLow5h.claude)return false;
        if(isWeeklyItem(q))return false;
      }
      return true;
    });
    const out=[];
    const usedIdx=new Set();
    for(const fam of ['gemini','claude']){
      const isSpecialTier=q=>/argon|carbon/i.test(`${q.id||''} ${q.label||''}`);
      const fhIdx=cleaned.findIndex((q,i)=>!usedIdx.has(i)&&!isSpecialTier(q)&&new RegExp(fam,'i').test(`${q.id||''} ${q.label||''}`)&&is5hItem(q));
      const wkIdx=cleaned.findIndex((q,i)=>!usedIdx.has(i)&&!isSpecialTier(q)&&new RegExp(fam,'i').test(`${q.id||''} ${q.label||''}`)&&isWeeklyItem(q));
      if(fhIdx>=0){usedIdx.add(fhIdx);out.push(cleaned[fhIdx]);}
      if(wkIdx>=0){usedIdx.add(wkIdx);out.push(cleaned[wkIdx]);}
    }
    cleaned.forEach((q,i)=>{if(!usedIdx.has(i))out.push(q);});
    return out;
  }
  if(['codex','codex-desktop','codex-cli','chatgpt','claude-code','claude','claude-desktop'].includes(normApp)){
    const fhIdx=src.findIndex(is5hItem);
    const wkIdx=src.findIndex(isWeeklyItem);
    if(fhIdx>=0||wkIdx>=0){
      const isClaude=/claude/.test(normApp);
      const fh=fhIdx>=0?src[fhIdx]:{id:isClaude?'five_hour':'primary_window',label:'5h 限额',remainingPct:null,usedText:'—',statusHint:src[wkIdx]?.remainingPct===0?'周额度已用尽':'未返回 5h 窗口',resetAt:null,tone:'neutral'};
      const wk=wkIdx>=0?src[wkIdx]:{id:isClaude?'seven_day':'secondary_window',label:isClaude?'7d 限额':'周限额',remainingPct:null,usedText:'—',statusHint:'未返回周窗口',resetAt:null,tone:'neutral'};
      const rest=src.filter((_,i)=>i!==fhIdx&&i!==wkIdx);
      return [fh,wk,...rest];
    }
  }
  return src;
}
function renderQuotaBars(account,limit=2,fallbackAppId=null){
  if(!account)return '<p class="quota-empty-hint" style="margin:0;font-size:12px;color:var(--muted);">尚未导入或添加该应用账号</p>';
  if(account.status==='banned'||account.status==='invalid'){
    const deadMsg=account.lastError||(account.status==='banned'?'该账号已被封禁、停用或已注销':'该账号登录凭据已失效或已封号/注销');
    return `<p style="margin:0;font-size:11.5px;color:#dc2626;font-weight:600;">${escapeHTML(deadMsg)}</p>`;
  }
  const aligned=alignDisplayQuotas(account.appId||fallbackAppId,account.quotas);
  if(aligned.length){
    return `<div class="quota-bars">${aligned.slice(0,limit).map(q=>{
      const pct=Number.isFinite(q.remainingPct)?Math.max(0,Math.min(100,q.remainingPct)):null;
      const tone=pct===null?'neutral':(q.tone||(pct>=50?'high':pct>=20?'mid':'low'));
      const reset=formatResetCountdown(q.resetAt);
      const metaHtml=pct===null?escapeHTML(q.statusHint||q.usedText||'—'):`${pct}%${reset?`<span class="quota-row-reset">${escapeHTML(reset)}</span>`:''}`;
      return `<div class="quota-row"><div class="quota-row-head"><span class="quota-row-label">${escapeHTML(q.label||'剩余额度')}</span><span class="quota-row-meta">${metaHtml}</span></div><div class="quota-bar-track"><div class="quota-bar-fill ${tone}" style="width:${pct??0}%"></div></div></div>`;
    }).join('')}</div>`;
  }
  const msg=account.quotaState==='proxy_required'?'开启安全连接后可刷新实时额度':account.quotaState==='refresh_failed'?(account.lastError||'配额查询失败（点击刷新重试）'):account.source==='isolated-container'?'独立安全容器 · 原站独立保持登录会话':'已托管本机凭据 · 当前暂无配额明细';
  return `<p style="margin:0;font-size:11.5px;color:${account.quotaState==='refresh_failed'?'#dc2626':'var(--muted)'};">${escapeHTML(msg)}</p>`;
}
function formatTokenCompact(n){
  const v=Number(n)||0;
  if(v>=1e8)return `${(v/1e8).toFixed(2)} 亿`;
  if(v>=1e4)return `${(v/1e4).toFixed(1)} 万`;
  return Math.round(v).toLocaleString();
}
function renderUsageTrendSvg(trend=[],metric='totalTokens'){
  const pts=Array.isArray(trend)?trend:[];
  if(!pts.length){
    return `<div class="quota-empty-dashed">暂无时间序列用量样本，点击「重新扫描」读取本机会话历史。</div>`;
  }
  const w=720,h=190,padX=28,padY=26,innerW=w-padX*2,innerH=h-padY*2;
  const vals=pts.map(p=>Number(p?.[metric])||0);
  const maxVal=Math.max(1,...vals);
  const coords=pts.map((p,i)=>{
    const x=pts.length===1?padX+innerW/2:padX+(i/(pts.length-1))*innerW;
    const y=padY+innerH-(vals[i]/maxVal)*innerH;
    return {x:Number(x.toFixed(1)),y:Number(y.toFixed(1)),val:vals[i],label:p.label||p.bucketKey||''};
  });
  let linePath=`M ${coords[0].x} ${coords[0].y}`;
  for(let i=1;i<coords.length;i++){
    const prev=coords[i-1],cur=coords[i],cx=Number(((prev.x+cur.x)/2).toFixed(1));
    linePath+=` C ${cx} ${prev.y}, ${cx} ${cur.y}, ${cur.x} ${cur.y}`;
  }
  const areaPath=`${linePath} L ${coords[coords.length-1].x} ${padY+innerH} L ${coords[0].x} ${padY+innerH} Z`;
  let peakIdx=0;
  for(let i=1;i<coords.length;i++)if(coords[i].val>coords[peakIdx].val)peakIdx=i;
  const peak=coords[peakIdx];
  const peakText=metric==='turns'?`${peak.val.toLocaleString()} 轮`:formatTokenCompact(peak.val);
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:190px;display:block;overflow:visible;" role="img" aria-label="Token 用量趋势折线图">
    <defs><linearGradient id="dingtuUsageGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2563eb" stop-opacity="0.22"/><stop offset="100%" stop-color="#2563eb" stop-opacity="0.01"/></linearGradient></defs>
    <line x1="${padX}" y1="${padY+innerH}" x2="${w-padX}" y2="${padY+innerH}" stroke="#e2e8f0" stroke-width="1"/>
    <path d="${areaPath}" fill="url(#dingtuUsageGrad)"/>
    <path d="${linePath}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round"/>
    ${coords.map(c=>`<circle cx="${c.x}" cy="${c.y}" r="3.5" fill="#ffffff" stroke="#2563eb" stroke-width="2"><title>${escapeHTML(c.label)}: ${escapeHTML(String(c.val))}</title></circle>`).join('')}
    ${peak?`<g transform="translate(${Math.min(w-90,Math.max(40,peak.x))},${Math.max(16,peak.y-14)})"><rect x="-34" y="-12" width="68" height="20" rx="6" fill="#eff6ff" stroke="#93c5fd"/><text x="0" y="2" text-anchor="middle" font-size="10.5" font-weight="700" fill="#1d4ed8">${escapeHTML(peakText)}</text></g>`:''}
  </svg>`;
}
function renderQuotaMiniGrid(acct,fallbackAppId=null){
  if(acct&&(acct.status==='banned'||acct.status==='invalid')){
    const deadMsg=acct.lastError||(acct.status==='banned'?'该账号已被封禁、停用或已注销，不可继续使用':'该账号登录凭据已失效或已被封号/注销，请重新验证或移除');
    return `<div class="quota-error-dashed">${escapeHTML(deadMsg)}</div><div class="quota-empty-dashed">${acct.status==='banned'?'状态：已封禁 / 不可用':'状态：认证失效 / 不可用'}</div>`;
  }
  const list=alignDisplayQuotas(acct?.appId||fallbackAppId,acct?.quotas).slice(0,6);
  if(!list.length){
    if(acct?.quotaState==='refresh_failed'){
      return `<div class="quota-error-dashed">${escapeHTML(acct.lastError||'配额查询失败')}</div><div class="quota-empty-dashed">暂无配额数据</div>`;
    }
    if(acct?.quotaState==='proxy_required'){
      return `<div class="quota-empty-dashed">请先开启安全连接（或切换自有网络）</div>`;
    }
    return `<div class="quota-empty-dashed">暂无配额数据</div>`;
  }
  const errPrefix=acct?.quotaState==='refresh_failed'&&acct?.lastError?`<div class="quota-error-dashed" style="margin-bottom:8px;">${escapeHTML(acct.lastError)}</div>`:'';
  const oddLast=list.length%2===1;
  return `${errPrefix}<div class="quota-mini-grid">${list.map((q,idx)=>{
    const pct=Number.isFinite(q.remainingPct)?Math.max(0,Math.min(100,q.remainingPct)):null;
    const tone=pct===null?'neutral':pct===0?'low':pct>=50?'high':pct>=20?'mid':'low';
    const resetText=q.statusHint?q.statusHint:(q.resetAt?formatResetCountdown(q.resetAt):(pct===0?'周额度已用尽':'已同步'));
    const spanClass=oddLast&&idx===list.length-1?' span-2':'';
    return `<div class="quota-mini-card ${tone}${spanClass}"><div class="quota-mini-head"><span>${escapeHTML(q.label||'配额')}</span><strong>${pct===null?(escapeHTML(q.usedText||'—')):`${pct}%`}</strong></div><div class="quota-bar-track"><div class="quota-bar-fill ${tone}" style="width:${pct??0}%"></div></div><div class="quota-mini-reset">${escapeHTML(resetText)}</div></div>`;
  }).join('')}</div>`;
}
function openSourceNoticeBanner(){
  return `<div class="open-source-notice-banner" role="note" style="margin:12px 0;padding:12px 14px;border-radius:14px;border:1px solid var(--line-strong);background:var(--panel);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;"><div><strong style="font-size:13px;">开源学习交流版 · 基础联通环境</strong><p style="margin:4px 0 0;font-size:12px;color:var(--muted);">本版本仅供学习交流，已剥离强代理 TUN、提权与环境指纹/防风控模块，保留基础 127.0.0.1:17899 联通链路；完整版请前往官网下载。</p></div><a class="button secondary compact" href="https://dingtu.noyapi.cn/download" target="_blank" rel="noopener noreferrer">官网下载完整版</a></div>`;
}
function quietChannelStatusPill(){
  const geo=workbench.exitGeo||accountOverview.data?.exitContext||null;
  if(workbench.envMode==='own_network')return `<button type="button" class="quiet-channel-pill own" data-page="settings">${svg('globe')}自有网络</button>`;
  if(isConnected())return `<button type="button" class="quiet-channel-pill protected" data-page="settings">${svg('shield')}基础代理已联通${geo?.regionLabel?` · ${escapeHTML(geo.regionLabel)}`:''}</button>`;
  return `<button type="button" class="quiet-channel-pill" data-action="connect">${svg('lock')}${globalThis.NoyaDesktop&&!authState.user?'请先授权登录':'基础代理未连接 · 点击连接'}</button>`;
}
function activeCommonApp(pinned){
  const matchPinned=pinned.find(a=>a.id===state.selectedApp);
  if(matchPinned)return matchPinned;
  const matchAvail=availableApps().find(a=>a.id===state.selectedApp);
  return matchAvail||pinned[0]||availableApps()[0]||emptyApp;
}
function sanitizeAppCopy(raw,app){
  const text=String(raw||'').trim();
  if(!text||/中转站|模型接入源|适配待验证|待验证/.test(text)){
    return browserShellAppMap[app?.id]?'独立安全应用容器 · 支持多账号持久会话与一键切换':'独立目录隔离与多账号管理 · 支持一键切换并启动';
  }
  return text;
}
function resolveRunningInstanceEntries(){
  const availById=new Map(availableApps().map(a=>[a.id,a]));
  const entries=[];
  for(const b of workbench.browserInstances){
    const wbAppId=b.appId==='gemini'?'gemini-web':b.appId;
    const appMeta=availById.get(wbAppId)||{id:wbAppId,name:b.name||wbAppId,short:b.name||wbAppId};
    const slotId=b.instanceId||'main';
    const appAccts=accountsForApp(wbAppId);
    const acct=appAccts.find(a=>a.id===slotId||(slotId==='default'&&a.id==='main'))||activeAccountForApp(wbAppId);
    entries.push({kind:'browser',appId:wbAppId,appMeta,slotId,acct});
  }
  for(const p of workbench.agentProfiles){
    if(!['starting','running'].includes(p.status))continue;
    const wbAppId=p.appId==='codex-cli'?'codex':p.appId==='antigravity-cli'?'antigravity':p.appId==='muse-desktop'?'metamuse':p.appId;
    const appMeta=availById.get(wbAppId)||{id:wbAppId,name:p.appName||wbAppId,short:p.appName||wbAppId};
    const slotId=p.profileId||'main';
    const appAccts=accountsForApp(wbAppId);
    const isDefaultLauncherSlot=slotId==='main'||slotId===`${p.appId}-main`||slotId===`${wbAppId}-main`;
    const acct=(!isDefaultLauncherSlot&&appAccts.find(a=>a.id===slotId))||activeAccountForApp(wbAppId);
    entries.push({kind:'agent',appId:wbAppId,appMeta,slotId,acct});
  }
  return entries;
}
function renderRunningInstanceQuotaKpiCard(selectedCommon){
  const entries=resolveRunningInstanceEntries();
  if(!entries.length){
    return `<div class="cockpit-kpi-card" data-kpi-running-quota="idle"><span>${svg('spark')}运行实例额度</span><strong>暂未运行</strong><small>启动应用或安全容器后实时展示对应账号额度</small></div>`;
  }
  const primary=entries.find(e=>selectedCommon&&e.appId===selectedCommon.id)
    ||entries.find(e=>e.acct?.quotas?.some(q=>Number.isFinite(q.remainingPct)))
    ||entries[0];
  const extraCount=entries.length-1;
  const appTitle=primary.appMeta?.short||primary.appMeta?.name||primary.appId;
  const headHtml=`<span>${svg('spark')}运行实例额度 · ${escapeHTML(appTitle)}${extraCount>0?` (+${extraCount})`:''}</span>`;
  const acct=primary.acct;
  const acctName=acct?accountDisplayName(acct):(primary.slotId||'默认槽位');
  if(acct&&(acct.status==='banned'||acct.status==='invalid')){
    const sub=`${acctName} · 账号凭据已失效或已封禁`;
    return `<div class="cockpit-kpi-card" data-kpi-running-quota="invalid">${headHtml}<strong style="color:#dc2626;font-size:19px;">账号异常</strong><small style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHTML(sub)}">${escapeHTML(sub)}</small></div>`;
  }
  if(PURE_WEB_CONTAINER_APPS.has(primary.appId)){
    const sub=`${acctName} · 网页容器独立计费（无 5h 窗口）`;
    return `<div class="cockpit-kpi-card" data-kpi-running-quota="web-session">${headHtml}<strong style="font-size:19px;">会话在线</strong><small style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHTML(sub)}">${escapeHTML(sub)}</small></div>`;
  }
  if(FIVE_HOUR_WINDOW_APPS.has(primary.appId)){
    const aligned=alignDisplayQuotas(primary.appId,acct?.quotas);
    const is5h=q=>/5h|five_hour|5\s*小时/i.test(`${q?.id||''} ${q?.label||''}`);
    const isWk=q=>/weekly|seven_day|7d|周限额|周额度|7\s*天/i.test(`${q?.id||''} ${q?.label||''}`)&&!/opus|sonnet/i.test(`${q?.id||''} ${q?.label||''}`);
    const fh=aligned.find(is5h)||null;
    const wk=aligned.find(isWk)||null;
    const fhPct=Number.isFinite(fh?.remainingPct)?fh.remainingPct:null;
    const wkPct=Number.isFinite(wk?.remainingPct)?wk.remainingPct:null;
    let mainText='待刷新';
    let windowDesc='支持 5h + 周窗口（点击刷新同步）';
    let compactFont=false;
    if(fhPct!==null&&wkPct!==null){
      mainText=`5h ${fhPct}% · 周 ${wkPct}%`;
      compactFont=true;
      const claudeWk=(primary.appId==='antigravity'||primary.appId==='gemini-cli')?aligned.find(q=>/claude/i.test(q?.label||'')&&isWk(q)):null;
      windowDesc=Number.isFinite(claudeWk?.remainingPct)?`Gemini 双窗口（Claude 周 ${claudeWk.remainingPct}%）`:'5h + 周双窗口剩余';
    }else if(fhPct!==null){
      mainText=`5h ${fhPct}%`;
      windowDesc='5h 滚动窗口剩余';
    }else if(wkPct!==null){
      mainText=`周 ${wkPct}%`;
      windowDesc='按周窗口计费（当前无独立 5h 限额）';
    }
    const sub=`${acctName} · ${windowDesc}`;
    return `<div class="cockpit-kpi-card" data-kpi-running-quota="five-hour">${headHtml}<strong${compactFont?' style="font-size:18.5px;line-height:1.28;"':''}>${escapeHTML(mainText)}</strong><small style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHTML(sub)}">${escapeHTML(sub)}</small></div>`;
  }
  const quotas=Array.isArray(acct?.quotas)?acct.quotas:[];
  const q0=quotas.find(q=>Number.isFinite(q?.remainingPct))||quotas[0]||null;
  const mainText=q0&&Number.isFinite(q0.remainingPct)?`${q0.remainingPct}%`:(q0?.usedText||'按周期计费');
  const sub=`${acctName} · ${q0?.label||'月度/积分配额'}（无 5h 窗口）`;
  return `<div class="cockpit-kpi-card" data-kpi-running-quota="cycle">${headHtml}<strong${!Number.isFinite(q0?.remainingPct)?' style="font-size:19px;"':''}>${escapeHTML(mainText)}</strong><small style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHTML(sub)}">${escapeHTML(sub)}</small></div>`;
}
function cockpitOverviewPage(){
  const pinned=resolvedPinnedApps();
  const canOperate=globalThis.NoyaDesktop?Boolean(authState.user)&&isSafeEnvReady():!isMainSite&&(workbench.envMode==='own_network'||isConnected());
  const accts=allManagedAccounts();
  const runningCount=workbench.browserInstances.length+workbench.agentProfiles.filter(item=>['starting','running'].includes(item.status)).length;
  const tierSummary=!authState.user?'未登录':isEnterpriseUser()?'企业版 · 支持多开与切号':'个人版 · 支持多开与切号（单终端在线）';
  const selectedCommon=activeCommonApp(pinned);

  const kpiStrip=`<div class="cockpit-kpi-strip" aria-label="工作台概览指标">
    <div class="cockpit-kpi-card"><span>${svg('grid')}已接入常用应用</span><strong>${pinned.length}</strong><small>共支持 ${availableApps().length} 款 · 可在应用广场增删</small></div>
    <div class="cockpit-kpi-card"><span>${svg('user')}已托管账号槽位</span><strong>${accts.length}</strong><small>${escapeHTML(tierSummary)}</small></div>
    <div class="cockpit-kpi-card"><span>${svg('layers')}当前运行实例</span><strong>${runningCount}</strong><small>${workbench.envMode==='own_network'?'自有网络隔离运行':'专属安全容器 / 独立配置目录'}</small></div>
    ${renderRunningInstanceQuotaKpiCard(selectedCommon)}
  </div>`;
  const commonBarHtml=`<section class="common-tools-section" aria-label="常用工具快捷切换">
    <div class="section-heading"><h2>常用工具</h2><button type="button" class="text-button" data-action="toggle-app-library" style="min-height:28px;font-size:12.5px;">全部应用 →</button></div>
    <div class="common-tools-bar" role="listbox" aria-label="选择常用工具">
      ${pinned.map(app=>{
        const isSelected=selectedCommon.id===app.id;
        const appAccts=accountsForApp(app.id);
        const active=activeAccountForApp(app.id);
        const topPct=active?.quotas?.find(q=>Number.isFinite(q.remainingPct))?.remainingPct;
        const metaPill=isAppRunning(app.id)?'运行中':Number.isFinite(topPct)?`${topPct}%`:appAccts.length?`${appAccts.length}账号`:'未绑定';
        return `<button type="button" class="common-tool-pill ${isSelected?'selected':''}" data-overview-select-app="${escapeHTML(app.id)}" role="option" aria-selected="${isSelected}">${dimensionalIcon(app,'mini')}<span>${escapeHTML(app.short)}</span><span class="common-tool-pill-meta">${escapeHTML(metaPill)}</span></button>`;
      }).join('')}
    </div>
  </section>`;

  const selAccts=accountsForApp(selectedCommon.id);
  const selActive=activeAccountForApp(selectedCommon.id);
  const selMeta=appInstallMeta(selectedCommon);
  const selHasContainer=Boolean(browserShellAppMap[selectedCommon.id])&&!(selectedCommon.id==='metamuse'&&state.platform==='macos');
  const selAdapterId=desktopAdapterIds[selectedCommon.id]||selectedCommon.id;
  const selBrowsers=workbench.browserInstances.filter(item=>item.appId===selectedCommon.id||item.appId===browserShellAppMap[selectedCommon.id]);
  const selAgents=workbench.agentProfiles.filter(item=>item.appId===selectedCommon.id||item.appId===selAdapterId);
  const selRunningList=[
    ...selBrowsers.map(item=>`<span class="account-tag-pill">安全容器 · ${escapeHTML(item.instanceId)}</span>`),
    ...selAgents.filter(item=>['starting','running'].includes(item.status)).map(item=>`<span class="account-tag-pill">进程 · ${escapeHTML(item.profileId)}</span>`),
  ];

  const groupMap=new Map((workbench.groups||[]).map(g=>[g.id,g]));
  const renderOverviewChipRow=(acct,extraHtml='')=>{
    const groupPills=(acct.groups||acct.groupIds||[]).map(gid=>groupMap.get(gid)).filter(Boolean).map(g=>`<span class="account-tag-pill" style="border-color:${escapeHTML(g.color||'#3b82f6')};color:${escapeHTML(g.color||'#2563eb')};">${escapeHTML(g.name)}</span>`).join('');
    const tagPills=(acct.tags||[]).map(t=>`<span class="account-tag-pill">${escapeHTML(t)}</span>`).join('');
    const statusBadge=accountStatusBadgeHtml(acct);
    return `<div class="note-chip-row"><button type="button" class="note-chip-btn" data-action="open-account-meta" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(acct.id)}">${svg('note')}${acct.note?escapeHTML(acct.note.slice(0,22)):'加备注'}</button>${groupPills}${tagPills}${extraHtml}${statusBadge?`<span class="note-row-status-right">${statusBadge}</span>`:''}</div>`;
  };
  const renderOverviewHistoryPill=(acct,scopePrefix)=>{
    const histKey=`${scopePrefix}:${selectedCommon.id}:${acct.id}`;
    const timeLabel=acct.lastSwitchedAt?'切换时间':'刷新时间';
    const timeValue=formatShortTime(acct.lastSwitchedAt||acct.lastCheckedAt||acct.updatedAt);
    const histOpen=Boolean(state.expandedSwitchHistory?.[histKey]);
    const histItems=Array.isArray(acct.switchHistory)?acct.switchHistory.slice(0,5):[];
    if(!timeValue)return '';
    return `<button type="button" class="account-time-pill" data-action="toggle-switch-history" data-account-key="${escapeHTML(histKey)}" aria-expanded="${histOpen}">${svg('clock')}<span>${timeLabel}: ${escapeHTML(timeValue)}</span>${svg('chevron')}</button>${histOpen?`<div class="account-history-popover">${histItems.length?histItems.map(h=>`<div>${escapeHTML(formatShortTime(h.at))} · ${escapeHTML(h.action==='switch'?'切换激活':h.action||'操作')}</div>`).join(''):'<div>暂无历史切换记录</div>'}</div>`:''}`;
  };

  const activeRefreshKey=`${selectedCommon.id}:${selActive?.id||''}`;
  const isActiveRefreshing=Boolean(selActive)&&(workbench.refreshingAccountKey===activeRefreshKey||workbench.refreshingAccountKey===selectedCommon.id||workbench.refreshingAccountKey==='all');
  const leftCardHtml=`<article class="account-card active-account overview-account-card" data-overview-active-card="${escapeHTML(selActive?.id||'none')}">
    <div class="account-card-title-row">
      <strong title="${escapeHTML(selActive?accountDisplayName(selActive):'未绑定本机账号')}">当前连接账号：${selActive?escapeHTML(accountDisplayName(selActive)):'未绑定本机账号'}</strong>
      <span class="account-header-badges">${selActive?.isActive?'<span class="badge-current">当前使用</span>':'<span class="badge neutral">待绑定</span>'}${selActive?tierBadgeHtml(selActive.plan):''}</span>
    </div>
    ${selActive?renderOverviewChipRow(selActive,selRunningList.join('')):(selRunningList.length?`<div class="note-chip-row">${selRunningList.join('')}</div>`:'')}
    <div class="account-quota-panel">
      <div class="overview-quota-head">
        <span>模型与用量配额</span>
        <span style="display:inline-flex;align-items:center;gap:8px;">${selActive?.lastCheckedAt?`<span>更新：${escapeHTML(formatShortTime(selActive.lastCheckedAt))}</span>`:''}${selActive&&!PURE_WEB_CONTAINER_APPS.has(selectedCommon.id)?`<button type="button" class="text-button${isActiveRefreshing?' is-spinning':''}" style="min-height:22px;padding:0 4px;" data-action="refresh-single-quota" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(selActive.id)}" ${workbench.refreshingQuota?'disabled':''}>${svg('refresh')}刷新</button>`:''}</span>
      </div>
      ${renderQuotaMiniGrid(selActive,selectedCommon.id)}
      ${selActive?renderOverviewHistoryPill(selActive,'overview-active'):''}
    </div>
    ${selActive?`<div class="account-card-divider"></div>
    <div class="card-icon-dock">
      <button type="button" class="dock-action-btn" data-action="inspect-account-detail" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(selActive.id)}" title="账号详情" aria-label="账号详情">${svg('info')}</button>
      <button type="button" class="dock-action-btn" data-action="open-account-meta" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(selActive.id)}" title="编辑标签与分组" aria-label="编辑标签">${svg('tag')}</button>
      <button type="button" class="dock-action-btn" data-action="open-account-meta" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(selActive.id)}" title="添加备注" aria-label="添加备注">${svg('note')}</button>
      ${selectedCommon.id==='antigravity'
        ?`<button type="button" class="dock-action-btn primary-play" data-action="open-ag-launch-dialog" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(selActive.id)}" title="启动 Antigravity" aria-label="启动 Antigravity">${svg('play')}</button>`
        :`<button type="button" class="dock-action-btn primary-play${canOperate?'':' is-disabled'}${workbench.launchingApp===selectedCommon.id?' is-spinning':''}" data-action="quick-launch-app" data-app-id="${escapeHTML(selectedCommon.id)}" title="${canOperate?`启动 ${escapeHTML(selectedCommon.name)}`:'需先登录并确保网络环境就绪'}" aria-label="启动 ${escapeHTML(selectedCommon.name)}" aria-disabled="${!canOperate}">${svg(workbench.launchingApp===selectedCommon.id?'loader':'play')}</button>`}
      <button type="button" class="dock-action-btn${isActiveRefreshing?' is-spinning':''}" data-action="refresh-single-quota" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(selActive.id)}" title="刷新额度" aria-label="刷新额度">${svg('refresh')}</button>
      <button type="button" class="dock-action-btn" data-action="export-single-account" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(selActive.id)}" title="导出账号清单" aria-label="导出账号清单">${svg('upload')}</button>
      <button type="button" class="dock-action-btn danger" data-action="remove-app-account" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(selActive.id)}" title="删除账号" aria-label="删除账号">${svg('trash')}</button>
    </div>`:`<div class="note-chip-row" style="margin-top:auto;"><button type="button" class="button secondary compact" data-action="open-add-account-dialog" data-app-id="${escapeHTML(selectedCommon.id)}">+ 添加账号</button><button type="button" class="button secondary compact" data-action="import-local-account" data-app-id="${escapeHTML(selectedCommon.id)}">导入本机</button></div>`}
  </article>`;

  const spareAccounts=selAccts.filter(a=>!selActive||a.id!==selActive.id);
  const rawSpareIdx=Number(state.overviewSpareIndexByApp?.[selectedCommon.id])||0;
  const safeSpareIdx=spareAccounts.length?((rawSpareIdx%spareAccounts.length)+spareAccounts.length)%spareAccounts.length:0;
  const selSpare=spareAccounts[safeSpareIdx]||null;
  const spareRefreshKey=selSpare?`${selectedCommon.id}:${selSpare.id}`:'';
  const isSpareRefreshing=Boolean(selSpare)&&(workbench.refreshingAccountKey===spareRefreshKey||workbench.refreshingAccountKey===selectedCommon.id||workbench.refreshingAccountKey==='all');

  const isSpareSwitching=Boolean(selSpare)&&(workbench.switchingAccount===selSpare.id||workbench.switchingAndLaunching===`${selectedCommon.id}:${selSpare.id}`);
  const isSpareSwitchLaunching=Boolean(selSpare)&&workbench.switchingAndLaunching===`${selectedCommon.id}:${selSpare.id}`;
  const spareCardHtml=selSpare?`<article class="account-card overview-spare-card" data-overview-spare-card="${escapeHTML(selSpare.id)}">
    <div class="account-card-title-row">
      <span class="overview-spare-tag">备用</span>
      <strong title="${escapeHTML(accountDisplayName(selSpare))}">${escapeHTML(accountDisplayName(selSpare))}</strong>
      <span class="account-header-badges">${tierBadgeHtml(selSpare.plan)}</span>
      <button type="button" class="button primary compact overview-switch-btn" data-action="switch-app-account" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(selSpare.id)}" ${isSpareSwitching?'disabled':''}>${workbench.switchingAccount===selSpare.id?'切换中…':'切换'}</button>
    </div>
    ${renderOverviewChipRow(selSpare)}
    <div class="account-quota-panel">
      ${renderQuotaMiniGrid(selSpare,selectedCommon.id)}
      ${renderOverviewHistoryPill(selSpare,'overview-spare')}
    </div>
    <div class="account-card-divider"></div>
    <div class="card-icon-dock">
      <button type="button" class="dock-action-btn" data-action="inspect-account-detail" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(selSpare.id)}" title="账号详情" aria-label="账号详情">${svg('info')}</button>
      <button type="button" class="dock-action-btn" data-action="open-account-meta" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(selSpare.id)}" title="编辑标签与分组" aria-label="编辑标签">${svg('tag')}</button>
      <button type="button" class="dock-action-btn" data-action="open-account-meta" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(selSpare.id)}" title="添加备注" aria-label="添加备注">${svg('note')}</button>
      <button type="button" class="dock-action-btn primary-play${canOperate?'':' is-disabled'}${isSpareSwitchLaunching?' is-spinning':''}" data-action="${selectedCommon.id==='antigravity'?'open-ag-launch-dialog':'switch-and-launch-account'}" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(selSpare.id)}" title="切换并重启/启动 ${escapeHTML(selectedCommon.name)}" aria-label="切换并启动" aria-disabled="${!canOperate}">${svg(isSpareSwitchLaunching?'loader':'play')}</button>
      <button type="button" class="dock-action-btn${isSpareRefreshing?' is-spinning':''}" data-action="refresh-single-quota" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(selSpare.id)}" title="刷新额度" aria-label="刷新额度">${svg('refresh')}</button>
      <button type="button" class="dock-action-btn" data-action="export-single-account" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(selSpare.id)}" title="导出账号清单" aria-label="导出账号清单">${svg('upload')}</button>
      <button type="button" class="dock-action-btn danger" data-action="remove-app-account" data-app-id="${escapeHTML(selectedCommon.id)}" data-account-id="${escapeHTML(selSpare.id)}" title="删除账号" aria-label="删除账号">${svg('trash')}</button>
    </div>
  </article>`:`<article class="account-card overview-spare-card overview-spare-empty" data-overview-spare-empty="true">
    <div class="account-card-title-row">
      <span class="overview-spare-tag">备用账号</span>
      <strong>暂无可切换的备用账号</strong>
    </div>
    <div class="account-quota-panel">
      <div class="quota-empty-dashed">添加更多 ${escapeHTML(selectedCommon.short)} 账号后，可在此直接对比额度并一键切换</div>
    </div>
    <div class="note-chip-row" style="margin-top:auto;">
      <button type="button" class="button secondary compact" data-action="open-add-account-dialog" data-app-id="${escapeHTML(selectedCommon.id)}">+ 添加备用账号</button>
      <button type="button" class="button secondary compact" data-open-workspace="${escapeHTML(selectedCommon.id)}">账号工作台 →</button>
    </div>
  </article>`;

  const rightSpareColumnHtml=`<div class="overview-spare-column">
    ${spareCardHtml}
    <div class="overview-spare-nav" aria-label="切换浏览备用账号">
      <button type="button" class="overview-spare-arrow-btn" data-action="overview-spare-prev" data-app-id="${escapeHTML(selectedCommon.id)}" ${spareAccounts.length<=1?'disabled':''} aria-label="上一个备用账号" title="上一个备用账号">${svg('chevron-left')}</button>
      <span class="overview-spare-counter">${spareAccounts.length?`备用账号 ${safeSpareIdx+1} / ${spareAccounts.length}`:'备用账号 0 / 0'}</span>
      <button type="button" class="overview-spare-arrow-btn" data-action="overview-spare-next" data-app-id="${escapeHTML(selectedCommon.id)}" ${spareAccounts.length<=1?'disabled':''} aria-label="下一个备用账号" title="下一个备用账号">${svg('chevron-right')}</button>
    </div>
  </div>`;

  const selectedWorkbenchHtml=selectedCommon.id?`<section class="selected-app-workbench" aria-label="当前工具工作台详情">
    <div class="selected-app-workbench-head">
      <div class="selected-app-workbench-id">
        ${dimensionalIcon(selectedCommon)}
        <div>
          <h3>${escapeHTML(selectedCommon.name)} <span class="badge ${selMeta.tone}">${escapeHTML(selMeta.label)}</span>${selActive?tierBadgeHtml(selActive.plan):''}</h3>
          <p>${escapeHTML(sanitizeAppCopy(selectedCommon.copy,selectedCommon))}</p>
        </div>
      </div>
      <div class="selected-app-workbench-actions">
        <button type="button" class="button gradient-cta${canOperate?'':' is-disabled'}${workbench.launchingApp===selectedCommon.id?' is-spinning':''}" data-action="quick-launch-app" data-app-id="${escapeHTML(selectedCommon.id)}" aria-disabled="${!canOperate}">${svg(workbench.launchingApp===selectedCommon.id?'loader':'play')}${workbench.launchingApp===selectedCommon.id?(selHasContainer?'正在打开…':'正在启动…'):(selHasContainer?'打开容器':'启动 '+escapeHTML(selectedCommon.short))}</button>
        <button type="button" class="button secondary" data-action="open-add-account-dialog" data-app-id="${escapeHTML(selectedCommon.id)}">+ 添加账号</button>
        <button type="button" class="button secondary" data-action="import-local-account" data-app-id="${escapeHTML(selectedCommon.id)}">导入本机</button>
        <button type="button" class="button secondary" data-action="refresh-app-quotas" data-app-id="${escapeHTML(selectedCommon.id)}" ${workbench.refreshingQuota?'disabled':''}>${svg('refresh')}刷新额度</button>
        <button type="button" class="button secondary" data-open-workspace="${escapeHTML(selectedCommon.id)}">账号工作台 ${svg('arrow')}</button>
      </div>
    </div>
    <div class="selected-app-workbench-body">
      ${leftCardHtml}
      ${rightSpareColumnHtml}
    </div>
  </section>`:'';

  const cards=pinned.map(app=>{
    const appAccounts=accountsForApp(app.id);
    const active=activeAccountForApp(app.id);
    const meta=appInstallMeta(app);
    const hasContainer=Boolean(browserShellAppMap[app.id])&&!(app.id==='metamuse'&&state.platform==='macos');
    const launchText=meta.running?'聚焦 / 管理':hasContainer?'打开安全容器':'启动';
    return `<article class="platform-card" data-platform-card="${escapeHTML(app.id)}">
      <div class="platform-card-head" data-overview-select-app="${escapeHTML(app.id)}" style="cursor:pointer;">
        ${dimensionalIcon(app,'small')}
        <div class="platform-card-title">
          <strong>${escapeHTML(app.name)}</strong>
          <small>${escapeHTML(app.category)} · ${appAccounts.length?`已托管 ${appAccounts.length} 个账号`:'尚未导入账号'}</small>
        </div>
        <span class="badge ${meta.tone}">${escapeHTML(meta.label)}</span>
      </div>
      <div class="platform-card-account">
        <div class="platform-card-account-info">
          <strong>${active?escapeHTML(accountDisplayName(active)):'未绑定账号'}</strong>
          <span>${active?`${active.plan?escapeHTML(active.plan)+' · ':''}${active.isActive?'当前使用中':escapeHTML(active.id)}`:'点击下方切号或导入本机账号'}</span>
        </div>
        <div style="display:inline-flex;align-items:center;gap:4px;">${accountStatusBadgeHtml(active)}${active?.isActive?'<span class="badge-current">使用中</span>':''}</div>
      </div>
      ${renderQuotaBars(active,2,app.id)}
      <div class="platform-card-foot">
        <button type="button" class="button ${meta.running?'secondary':'primary'}${canOperate?'':' is-disabled'}${workbench.launchingApp===app.id?' is-spinning':''}" data-action="quick-launch-app" data-app-id="${escapeHTML(app.id)}" aria-disabled="${!canOperate}">${workbench.launchingApp===app.id?'正在启动…':launchText}</button>
        <button type="button" class="button secondary" data-action="quick-switch-app" data-app-id="${escapeHTML(app.id)}">切号${appAccounts.length>1?` (${appAccounts.length})`:''}</button>
        <button type="button" class="text-button" data-open-workspace="${escapeHTML(app.id)}">管理 ${svg('arrow')}</button>
      </div>
    </article>`;
  }).join('');

  const runningRows=[
    ...workbench.browserInstances.map(item=>`<li class="workbench-instance-row"><div class="workbench-instance-meta"><strong>${escapeHTML(item.name||item.appId)} · <code>${escapeHTML(item.instanceId)}</code><span class="badge">应用容器 · 运行中</span></strong><small>${item.mode==='own_network'?'自有网络环境':'127.0.0.1:17899 基础代理联通'}</small></div><div class="workbench-instance-actions"><button type="button" class="button secondary compact" data-action="focus-browser-instance" data-app-id="${escapeHTML(item.appId)}" data-instance-id="${escapeHTML(item.instanceId)}">聚焦窗口</button><button type="button" class="text-button" data-action="close-browser-instance" data-app-id="${escapeHTML(item.appId)}" data-instance-id="${escapeHTML(item.instanceId)}">关闭</button></div></li>`),
    ...workbench.agentProfiles.map(item=>{
      const running=['starting','running'].includes(item.status);
      const statusMap={ready:'已就绪',starting:'启动中',running:'运行中',stopping:'停止中',stopped:'已停止',failed:'异常退出','template-update-required':'需更新模板'};
      return `<li class="workbench-instance-row"><div class="workbench-instance-meta"><strong>${escapeHTML(item.appName||item.appId||'本地实例')} · <code>${escapeHTML(item.profileId)}</code><span class="badge ${running?'':item.status==='failed'?'danger':'neutral'}">${statusMap[item.status]||'未知'}</span></strong><small>独立隔离配置目录${item.pid?` · PID ${item.pid}`:''}</small></div><div class="workbench-instance-actions">${running?`<button type="button" class="button secondary compact" data-action="stop-agent-instance" data-instance-id="${escapeHTML(item.profileId)}">停止</button>`:`<button type="button" class="button secondary compact${canOperate?'':' is-disabled'}" data-action="start-agent-instance" data-instance-id="${escapeHTML(item.profileId)}" aria-disabled="${!canOperate}">启动</button><button type="button" class="text-button" data-action="remove-agent-instance" data-instance-id="${escapeHTML(item.profileId)}">移除</button>`}</div></li>`;
    }),
  ];

  return `<header class="cockpit-header-bar">
      <div class="cockpit-header-title">
        <button class="profile-avatar" data-action="account" aria-label="查看我的账号">${escapeHTML(accountInitial())}</button>
        <div>
          <h1>${escapeHTML(accountGreeting())}</h1>
          <div class="cockpit-subline">${quietChannelStatusPill()}<span>${escapeHTML(accountCaption())} · ${platform().label}</span>${!isMainSite?sourceBadge(view('identity')):''}</div>
        </div>
      </div>
      <div class="cockpit-header-actions">
        <button type="button" class="button secondary" data-action="refresh-all-quotas" ${workbench.refreshingQuota?'disabled':''}>${svg('refresh')}${workbench.refreshingQuota?'刷新中…':'刷新全部额度'}</button>
        <button type="button" class="button secondary" data-action="sync-local-accounts">同步本机账号</button>
        <button type="button" class="icon-pill-btn ${state.privacyMask?'active':''}" data-action="toggle-privacy-mask" title="隐私模式：隐藏邮箱">${svg(state.privacyMask?'eye-off':'eye')}</button>
        <button type="button" class="button secondary${globalThis.NoyaDesktop&&authState.user&&isSafeEnvReady()?'':' is-disabled'}" data-action="browser-test" aria-disabled="${!(globalThis.NoyaDesktop&&authState.user&&isSafeEnvReady())}">${svg('external')}应用容器</button>
        <button class="icon-button notification-button" data-action="notifications" aria-label="查看本机通知${localEvents.unreadCount()?'，'+localEvents.unreadCount()+'条未读':''}">${svg('bell')}${localEvents.unreadCount()?`<span class="notification-count">${localEvents.unreadCount()}</span>`:''}</button>
        <button class="icon-button home-theme" data-action="toggle-theme" aria-label="${state.theme==='dark'?'切换浅色主题':'切换深色主题'}">${svg(state.theme==='dark'?'sun':'moon')}</button>
      </div>
    </header>
    ${openSourceNoticeBanner()}
    ${kpiStrip}
    ${commonBarHtml}
    ${selectedWorkbenchHtml}
    <div class="section-heading"><h2>接入概览</h2><span>全部常用接入应用一览 · 点击上方工具切换详细状态或点击管理进入账号面板</span></div>
    <div class="cockpit-overview-grid">${cards}</div>
    ${runningRows.length?`<section class="workbench-panel" aria-label="运行中的实例"><div class="workbench-header"><div><h2>活动实例</h2><p>已打开的隔离应用容器与独立 CLI/IDE 进程。</p></div><span class="badge neutral">${runningRows.length} 个</span></div><ul class="workbench-instance-list">${runningRows.join('')}</ul></section>`:''}`;
}

function appCredentialSourceDesc(appId){
  const map={
    antigravity:'Windows Credential Manager (gemini:antigravity)、~/.gemini、Antigravity Studio、Cockpit Tools 与 Antigravity Tools',
    cursor:'Cursor Global Storage SQLite (state.vscdb)、Cockpit Tools 与官网 Cookie',
    codex:'~/.codex/auth.json、~/.codex-cli/auth.json、CC-Switch (OAuth)、Cockpit Tools 与 Codex Switcher',
    'codex-desktop':'~/.codex/auth.json 与 CC-Switch (OAuth)',
    'claude-code':'~/.claude/.credentials.json、~/.claude.json 与 CC-Switch (OAuth)',
    'claude-desktop':'Claude Desktop 本地 config.json 与官网 sessionKey',
    claude:'Claude Web 隔离容器会话 (sessionKey)',
    copilot:'GitHub Copilot hosts.json / apps.json 与 Cockpit Tools',
    windsurf:'Windsurf Global Storage SQLite (state.vscdb) 与 Cockpit Tools',
    kiro:'AWS SSO Cache kiro-auth-token.json 与 Cockpit Tools',
    'grok-cli':'~/.grok/auth.json',
    grok:'Grok Web 隔离容器会话 (sso)',
    'gemini-cli':'~/.gemini/google_accounts.json、oauth_creds.json 与 CC-Switch (OAuth)',
    chatgpt:'ChatGPT Web 隔离容器会话',
    'gemini-web':'Gemini Web 隔离容器会话',
    metamuse:'Meta Muse 隔离应用容器',
    manus:'Manus 隔离应用容器',
  };
  return map[appId]||'独立安全应用容器与加密槽位 Vault';
}

function renderLocalTokenBar(app){
  const u=workbench.usageByApp[app.id];
  const t=u?.totals||{inputTokens:0,thinkingTokens:0,outputTokens:0,cacheTokens:0,totalTokens:0,turns:0};
  const ranges=[['1d','今日'],['7d','近 7 天'],['30d','近 30 天'],['month','本月'],['all','全部']];
  return `<section class="local-token-bar" aria-label="本地 Token 用量摘要">
    <div class="local-token-left">
      <strong style="display:inline-flex;align-items:center;gap:6px;font-size:13px;">${svg('chart')}本地 Token</strong>
      <div class="local-token-ranges" role="group" aria-label="时间范围">${ranges.map(([k,lbl])=>`<button type="button" class="local-token-range-btn${(state.usageRange||'30d')===k?' active':''}" data-usage-range="${k}">${lbl}</button>`).join('')}</div>
    </div>
    <div class="local-token-metrics">
      <span>输入 <strong>${escapeHTML(formatTokenCompact(t.inputTokens))}</strong></span>
      <span>思考 <strong class="think">${escapeHTML(formatTokenCompact(t.thinkingTokens))}</strong></span>
      <span>输出 <strong>${escapeHTML(formatTokenCompact(t.outputTokens))}</strong></span>
      <span>缓存 <strong>${escapeHTML(formatTokenCompact(t.cacheTokens))}</strong></span>
      <span>合计 <strong class="total">${escapeHTML(formatTokenCompact(t.totalTokens))}</strong></span>
      <span>轮次 <strong>${Number(t.turns||0).toLocaleString()}</strong></span>
      <button type="button" class="icon-pill-btn${workbench.usageLoading?' is-spinning':''}" data-action="refresh-local-usage" title="刷新本地用量" aria-label="刷新本地用量">${svg('refresh')}</button>
      <button type="button" class="button secondary compact" data-workspace-tab="usage">详情</button>
    </div>
  </section>`;
}

function renderTelemetrySyncBar(){
  const ts=workbench.telemetryStatus;
  const statusCopy=!authState.user
    ?'未登录 · 仅本地统计与队列暂存'
    :ts?.lastSyncStatus==='synced'&&ts.lastSyncedAt
      ?`已同步至云端 (${formatShortTime(ts.lastSyncedAt)} · ${ts.lastAcceptedBuckets||0} 桶 / ${ts.lastAcceptedEvents||0} 事件)`
      :ts?.lastSyncStatus==='error'&&ts.lastError
        ?`上次同步未完成：${ts.lastError}`
        :`待同步事件 ${ts?.pendingEventsCount||0} 条`;
  return `<section class="telemetry-sync-bar" aria-label="云端脱敏同步">
    <div>
      <strong style="font-size:13px;">云端脱敏用量与日志同步</strong>
      <div style="font-size:12px;color:var(--muted);">${escapeHTML(statusCopy)} · 仅上报按日/模型聚合用量与脱敏错误码，绝不上传路径、工作区名或对话正文。</div>
    </div>
    <button type="button" class="button secondary compact${workbench.telemetrySyncing?' is-spinning':''}" data-action="telemetry-sync-now" ${!globalThis.NoyaDesktop?.telemetry||workbench.telemetrySyncing?'disabled':''}>${svg('refresh')}立即同步到云端</button>
  </section>`;
}

function renderUsageDashboard(app){
  const u=workbench.usageByApp[app.id]||{
    appId:app.id,
    dataDir:globalThis.NoyaDesktop?'正在扫描本机目录…':'桌面客户端可读取本机真实会话库',
    scannedAt:null,scanMs:0,scannedFiles:0,cacheHits:0,newlyScanned:0,
    totals:{totalTokens:0,inputTokens:0,thinkingTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,cacheTokens:0,sessions:0,turns:0,exactCoveragePct:100,activeDailyAvg:0,estimatedTurns:0,estimatedTokens:0},
    trend:[],byModel:[],byWorkspace:[],bySessionType:[],sessions:[],filters:{models:[],workspaces:[],sessionTypes:[]},
  };
  const t=u.totals||{};
  const f=u.filters||{models:[],workspaces:[]};
  const metricPills=[
    ['totalTokens','合计 Tokens'],
    ['inputTokens','输入 Tokens'],
    ['thinkingTokens','思考 Tokens'],
    ['outputTokens','输出 Tokens'],
    ['cacheTokens','缓存 Tokens'],
    ['turns','响应轮次'],
  ];
  const activeMetric=state.usageTrendMetric||'totalTokens';
  const totalMetricNum=activeMetric==='turns'?Number(t.turns||0).toLocaleString():formatTokenCompact(t[activeMetric]||0);
  const kw=(state.usageSearch||'').trim().toLowerCase();
  const filteredSessions=(Array.isArray(u.sessions)?u.sessions:[]).filter(s=>!kw||`${s.title||''} ${s.workspaceName||''} ${s.model||''} ${s.id||''}`.toLowerCase().includes(kw)).slice(0,80);

  return `<div class="usage-shell">
    <section class="usage-filter-card" aria-label="会话用量筛选与扫描">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div><strong>${escapeHTML(app.name)} 本地会话用量统计</strong><div style="font-size:12px;color:var(--muted);">从本机真实会话记录库汇总 Token 用量，严格区分 Thinking 与 Output。</div></div>
        <button type="button" class="button secondary compact" data-workspace-tab="accounts">返回账号总览</button>
      </div>
      <div class="usage-dir-row">
        <span>${svg('folder')} 数据目录：<code>${escapeHTML(u.dataDir||'自动探测')}</code></span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="button secondary compact" data-action="pick-usage-dir" data-app-id="${escapeHTML(app.id)}">切换目录</button>
          <button type="button" class="text-button" data-action="reset-usage-dir" data-app-id="${escapeHTML(app.id)}" style="min-height:28px;">恢复默认</button>
        </div>
      </div>
      <div class="usage-filters-row">
        <label class="usage-filter-field"><span>时间范围</span><select id="usage-range-select"><option value="1d"${state.usageRange==='1d'?' selected':''}>今日</option><option value="7d"${state.usageRange==='7d'?' selected':''}>近 7 天</option><option value="30d"${state.usageRange==='30d'?' selected':''}>近 30 天</option><option value="month"${state.usageRange==='month'?' selected':''}>本月</option><option value="all"${state.usageRange==='all'?' selected':''}>全部</option></select></label>
        <label class="usage-filter-field"><span>时间粒度</span><select id="usage-granularity-select"><option value="hour"${state.usageGranularity==='hour'?' selected':''}>按小时</option><option value="day"${state.usageGranularity==='day'?' selected':''}>按日</option><option value="week"${state.usageGranularity==='week'?' selected':''}>按周</option></select></label>
        <label class="usage-filter-field"><span>会话类型</span><select id="usage-type-select"><option value="all"${state.usageType==='all'?' selected':''}>全部类型</option><option value="main"${state.usageType==='main'?' selected':''}>主会话</option><option value="swarm"${state.usageType==='swarm'?' selected':''}>Swarm 协作</option><option value="subagent"${state.usageType==='subagent'?' selected':''}>子代理</option></select></label>
        <label class="usage-filter-field"><span>模型</span><select id="usage-model-select"><option value="all"${state.usageModel==='all'?' selected':''}>全部模型</option>${(f.models||[]).map(m=>`<option value="${escapeHTML(m)}"${state.usageModel===m?' selected':''}>${escapeHTML(m)}</option>`).join('')}</select></label>
        <label class="usage-filter-field"><span>工作区</span><select id="usage-workspace-select"><option value="all"${state.usageWorkspace==='all'?' selected':''}>全部工作区</option>${(f.workspaces||[]).map(w=>`<option value="${escapeHTML(w)}"${state.usageWorkspace===w?' selected':''}>${escapeHTML(w)}</option>`).join('')}</select></label>
        <div style="display:flex;gap:8px;margin-left:auto;">
          <button type="button" class="button secondary compact${workbench.usageLoading?' is-spinning':''}" data-action="refresh-local-usage">${svg('refresh')}刷新</button>
          <button type="button" class="button secondary compact" data-action="force-rescan-usage">${svg('refresh')}重新扫描</button>
        </div>
      </div>
      <div class="usage-meta-strip">
        <span>已扫描 ${u.scannedFiles||0} 个文件 · ${t.sessions||0} 个会话 · ${Number(t.turns||0).toLocaleString()} 次响应</span>
        <span>缓存命中 ${u.cacheHits||0} / 新增 ${u.newlyScanned||0} (${u.scanMs||0} ms)</span>
        <span>同步于 ${escapeHTML(formatShortTime(u.scannedAt)||'—')}</span>
      </div>
    </section>

    <section class="usage-hero-card" aria-label="精确合计统计">
      <div class="usage-hero-top">
        <div>
          <div style="font-size:13px;color:var(--muted);margin-bottom:4px;">⚡ 精确合计 Tokens</div>
          <div class="usage-hero-number">${escapeHTML(formatTokenCompact(t.totalTokens||0))}</div>
          <div style="font-size:12.5px;color:var(--muted);margin-top:2px;">${Number(t.totalTokens||0).toLocaleString()} tokens</div>
        </div>
        <div class="usage-hero-summary-box">
          <span>会话数</span><strong>${Number(t.sessions||0).toLocaleString()}</strong>
          <span>响应轮次</span><strong>${Number(t.turns||0).toLocaleString()}</strong>
          <span>精确覆盖率</span><strong>${Number.isFinite(t.exactCoveragePct)?`${t.exactCoveragePct.toFixed(1)}%`:'100.0%'}</strong>
          <span>活跃日均</span><strong>${escapeHTML(formatTokenCompact(t.activeDailyAvg||0))}</strong>
        </div>
      </div>
      <div class="usage-subcards-grid">
        <div class="usage-subcard"><span style="font-size:12px;color:var(--muted);">↓ 输入 Tokens</span><strong style="font-size:20px;color:#2563eb;">${escapeHTML(formatTokenCompact(t.inputTokens||0))}</strong><small style="color:var(--muted);">${t.totalTokens?((t.inputTokens/t.totalTokens)*100).toFixed(1):'0.0'}% · ${Number(t.inputTokens||0).toLocaleString()}</small></div>
        <div class="usage-subcard"><span style="font-size:12px;color:var(--muted);">◎ 思考 Tokens</span><strong style="font-size:20px;color:#0d9488;">${escapeHTML(formatTokenCompact(t.thinkingTokens||0))}</strong><small style="color:var(--muted);">${t.totalTokens?((t.thinkingTokens/t.totalTokens)*100).toFixed(2):'0.00'}% · ${Number(t.thinkingTokens||0).toLocaleString()}</small></div>
        <div class="usage-subcard"><span style="font-size:12px;color:var(--muted);">↑ 输出 Tokens</span><strong style="font-size:20px;color:#2563eb;">${escapeHTML(formatTokenCompact(t.outputTokens||0))}</strong><small style="color:var(--muted);">${t.totalTokens?((t.outputTokens/t.totalTokens)*100).toFixed(2):'0.00'}% · ${Number(t.outputTokens||0).toLocaleString()}</small></div>
        <div class="usage-subcard"><span style="font-size:12px;color:var(--muted);">▤ 缓存 Tokens</span><strong style="font-size:20px;color:#059669;">${escapeHTML(formatTokenCompact(t.cacheTokens||0))}</strong><small style="color:var(--muted);">R: ${escapeHTML(formatTokenCompact(t.cacheReadTokens||0))} · W: ${escapeHTML(formatTokenCompact(t.cacheWriteTokens||0))}</small></div>
      </div>
      ${(t.estimatedTurns||0)>0?`<div class="usage-estimated-banner"><span>另有 ${t.estimatedTurns} 轮缺少原始 API 用量，已单独估算（不计入精确合计）：</span><strong>~${Number(t.estimatedTokens||0).toLocaleString()} tokens</strong></div>`:''}
    </section>

    <section class="usage-chart-card" aria-label="Token 用量趋势">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:12px;"><strong>Token 用量趋势</strong><span style="font-size:18px;font-weight:700;color:#2563eb;">${escapeHTML(totalMetricNum)}</span></div>
        <div class="usage-trend-pills">${metricPills.map(([key,label])=>`<button type="button" class="usage-trend-btn${activeMetric===key?' active':''}" data-usage-metric="${key}">${label}</button>`).join('')}</div>
      </div>
      ${renderUsageTrendSvg(u.trend,activeMetric)}
    </section>

    <div class="usage-breakdown-grid">
      <section class="usage-table-card" aria-label="按模型分布">
        <table class="usage-table"><thead><tr><th>模型</th><th>轮次</th><th>Input</th><th>Thinking</th><th>Output</th></tr></thead><tbody>${(u.byModel||[]).length?u.byModel.map(m=>`<tr><td><strong>${escapeHTML(m.model)}</strong><div style="font-size:11px;color:var(--muted);">${escapeHTML(m.provider||'')} · ${m.sessions||0} 个会话</div></td><td>${Number(m.turns||0).toLocaleString()}</td><td>${escapeHTML(formatTokenCompact(m.inputTokens))}</td><td>${escapeHTML(formatTokenCompact(m.thinkingTokens))}</td><td>${escapeHTML(formatTokenCompact(m.outputTokens))}</td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;color:var(--muted);">暂无模型用量记录</td></tr>'}</tbody></table>
      </section>
      <section class="usage-table-card" aria-label="按工作区分布">
        <table class="usage-table"><thead><tr><th>工作区</th><th>会话</th><th>轮次</th><th>Input</th><th>Thinking</th></tr></thead><tbody>${(u.byWorkspace||[]).length?u.byWorkspace.map(w=>`<tr><td><strong>${escapeHTML(w.name)}</strong><div style="font-size:11px;color:var(--muted);">${escapeHTML(w.path||'')}</div></td><td>${w.sessions||0}</td><td>${Number(w.turns||0).toLocaleString()}</td><td>${escapeHTML(formatTokenCompact(w.inputTokens))}</td><td>${escapeHTML(formatTokenCompact(w.thinkingTokens))}</td></tr>`).join(''):'<tr><td colspan="5" style="text-align:center;color:var(--muted);">暂无工作区记录</td></tr>'}</tbody></table>
      </section>
    </div>

    <section class="usage-table-card" aria-label="按会话类型分布">
      <h3 style="margin:0 0 10px;font-size:14px;">按会话类型分布（主会话 / Swarm / 子代理）</h3>
      <table class="usage-table"><thead><tr><th>会话类型</th><th>会话</th><th>轮次</th><th>Input</th><th>Thinking</th><th>Output</th><th>Cache</th><th>合计</th><th>%</th></tr></thead><tbody>${(u.bySessionType||[]).length?u.bySessionType.map(row=>`<tr><td><span class="session-type-pill ${escapeHTML(row.type)}">${escapeHTML(row.label)}</span></td><td>${row.sessions}</td><td>${Number(row.turns).toLocaleString()}</td><td>${escapeHTML(formatTokenCompact(row.inputTokens))}</td><td>${escapeHTML(formatTokenCompact(row.thinkingTokens))}</td><td>${escapeHTML(formatTokenCompact(row.outputTokens))}</td><td>${escapeHTML(formatTokenCompact(row.cacheTokens))}</td><td><strong>${escapeHTML(formatTokenCompact(row.totalTokens))}</strong></td><td>${row.sharePct}%</td></tr>`).join(''):'<tr><td colspan="9" style="text-align:center;color:var(--muted);">暂无会话类型记录</td></tr>'}</tbody></table>
    </section>

    <section class="usage-table-card" aria-label="会话明细列表">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
        <h3 style="margin:0;font-size:14px;">会话明细列表 (${filteredSessions.length})</h3>
        <input type="search" class="usage-search-input" data-focus-key="usage-search" value="${escapeHTML(state.usageSearch||'')}" placeholder="搜索会话标题 / 工作区 / 模型...">
      </div>
      <table class="usage-table"><thead><tr><th>会话</th><th>工作区</th><th>类型</th><th>模型</th><th>轮次</th><th>合计 Tokens</th><th>最近活跃</th></tr></thead><tbody>${filteredSessions.length?filteredSessions.map(s=>`<tr><td><strong>${escapeHTML(s.title||s.shortId||s.id)}</strong><div style="font-size:11px;color:var(--muted);">${escapeHTML(s.shortId||s.id)}</div></td><td>${escapeHTML(s.workspaceName||'-')}</td><td><span class="session-type-pill ${escapeHTML(s.sessionType||'main')}">${s.sessionType==='swarm'?'Swarm':s.sessionType==='subagent'?'子代理':'主会话'}</span></td><td>${escapeHTML(s.model||'-')}</td><td>${s.turns||0}</td><td><strong>${escapeHTML(formatTokenCompact(s.totalTokens||0))}</strong></td><td style="font-size:11.5px;color:var(--muted);">${escapeHTML(formatShortTime(s.lastTime)||'—')}</td></tr>`).join(''):'<tr><td colspan="7" style="text-align:center;color:var(--muted);">暂无匹配会话明细</td></tr>'}</tbody></table>
    </section>
    ${renderTelemetrySyncBar()}
  </div>`;
}

function renderWakeupTab(app){
  const tasks=(workbench.wakeupTasks||[]).filter(t=>t.appId===app.id);
  const history=(workbench.wakeupHistory||[]).filter(h=>h.appId===app.id).slice(0,20);
  return `<section class="wakeup-panel" aria-label="定时唤醒与配额巡检">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div><h3 style="margin:0;font-size:15px;">${escapeHTML(app.name)} 唤醒任务</h3><p style="margin:4px 0 0;font-size:12.5px;color:var(--muted);">定时后台静默刷新配额、续签 OAuth Token 或探测本机客户端会话状态。</p></div>
      <button type="button" class="button gradient-cta compact" data-action="open-wakeup-dialog" data-app-id="${escapeHTML(app.id)}">+ 新建唤醒任务</button>
    </div>
    ${tasks.length?tasks.map(task=>{
      const sched=task.scheduleType==='daily'?`每日 ${task.dailyTime||'09:00'}`:`每 ${task.intervalMinutes||60} 分钟`;
      const actionText=task.action==='probe_local'?'检测本机登录状态':'唤醒并刷新配额';
      return `<div class="wakeup-task-row">
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><strong>${escapeHTML(task.name)}</strong><span class="badge ${task.enabled?'':'neutral'}">${task.enabled?'已启用':'已暂停'}</span><span class="badge neutral">${escapeHTML(sched)}</span></div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px;">动作：${escapeHTML(actionText)}${task.accountId?` · 指定账号：${escapeHTML(task.accountId)}`:' · 全部账号'}${task.lastRunAt?` · 上次：${escapeHTML(formatShortTime(task.lastRunAt))} (${escapeHTML(task.lastStatus||'ok')})`:''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <button type="button" class="button secondary compact" data-action="toggle-wakeup-task" data-task-id="${escapeHTML(task.id)}" data-enabled="${!task.enabled}">${task.enabled?'暂停':'启用'}</button>
          <button type="button" class="button primary compact" data-action="run-wakeup-task" data-task-id="${escapeHTML(task.id)}">立即执行</button>
          <button type="button" class="text-button" data-action="edit-wakeup-dialog" data-task-id="${escapeHTML(task.id)}">编辑</button>
          <button type="button" class="text-button" style="color:var(--danger);" data-action="delete-wakeup-task" data-task-id="${escapeHTML(task.id)}">删除</button>
        </div>
      </div>`;
    }).join(''):`<div class="cockpit-empty-state" style="padding:28px 16px;">${svg('clock')}<h3>暂无唤醒任务</h3><p>点击「+ 新建唤醒任务」配置定时配额刷新与活跃保活巡检。</p></div>`}
    ${history.length?`<div style="margin-top:8px;"><h4 style="margin:0 0 8px;font-size:13px;">近期执行记录</h4><ul class="workbench-instance-list">${history.map(h=>`<li class="workbench-instance-row"><div class="workbench-instance-meta"><strong>${escapeHTML(h.name||h.taskId)} <span class="badge ${h.status==='failed'?'danger':'neutral'}">${escapeHTML(h.status||'ok')}</span></strong><small>${escapeHTML(formatShortTime(h.ranAt)||'')} · ${escapeHTML(h.message||'')}</small></div></li>`).join('')}</ul></div>`:''}
  </section>`;
}

function appWorkspacePage(app){
  const canOperate=globalThis.NoyaDesktop?Boolean(authState.user)&&isSafeEnvReady():!isMainSite&&(workbench.envMode==='own_network'||isConnected());
  const meta=appInstallMeta(app);
  const accounts=accountsForApp(app.id);
  const active=activeAccountForApp(app.id);
  const isPinned=state.pinnedApps.includes(app.id);
  const hasContainer=Boolean(browserShellAppMap[app.id])&&!(app.id==='metamuse'&&state.platform==='macos');
  const adapterId=desktopAdapterIds[app.id]||app.id;
  const appBrowsers=workbench.browserInstances.filter(item=>item.appId===app.id||item.appId===browserShellAppMap[app.id]);
  const appAgents=workbench.agentProfiles.filter(item=>item.appId===app.id||item.appId===adapterId);
  const appWakeups=(workbench.wakeupTasks||[]).filter(t=>t.appId===app.id);
  const groupMap=new Map((workbench.groups||[]).map(g=>[g.id,g]));

  const distinctTiers=[...new Set(accounts.map(a=>normalizeTierInfo(a.plan).label).filter(Boolean))];
  const distinctTags=[...new Set(accounts.flatMap(a=>Array.isArray(a.tags)?a.tags:[]))].slice(0,8);

  const kw=(state.accountSearch||'').trim().toLowerCase();
  const minQuotaPct=acct=>{
    const vals=(acct.quotas||[]).map(q=>q.remainingPct).filter(Number.isFinite);
    return vals.length?Math.max(...vals):-1;
  };
  const filteredAccounts=accounts.filter(item=>{
    if(state.accountFilter==='active'&&!item.isActive)return false;
    if(state.accountFilter==='low'&&!(item.quotas||[]).some(q=>Number.isFinite(q.remainingPct)&&q.remainingPct<50))return false;
    if(state.accountGroupFilter!=='all'&&!(Array.isArray(item.groups||item.groupIds)&&(item.groups||item.groupIds).includes(state.accountGroupFilter)))return false;
    if(state.accountTierFilter!=='all'&&normalizeTierInfo(item.plan).label!==state.accountTierFilter)return false;
    if(state.accountTagFilter!=='all'&&!(Array.isArray(item.tags)&&item.tags.includes(state.accountTagFilter)))return false;
    if(kw&&!`${item.label} ${item.email||''} ${item.id} ${item.plan||''} ${(item.tags||[]).join(' ')} ${item.note||''}`.toLowerCase().includes(kw))return false;
    return true;
  }).sort((a,b)=>{
    if(a.isActive!==b.isActive&&state.accountSort==='quota')return a.isActive?-1:1;
    let cmp=0;
    if(state.accountSort==='email'){
      cmp=String(a.email||a.label||a.id).localeCompare(String(b.email||b.label||b.id));
    }else if(state.accountSort==='switched'){
      cmp=(Date.parse(a.lastSwitchedAt||a.updatedAt||0)||0)-(Date.parse(b.lastSwitchedAt||b.updatedAt||0)||0);
    }else{
      cmp=minQuotaPct(a)-minQuotaPct(b);
    }
    return state.accountSortDir==='asc'?cmp:-cmp;
  });

  const totalPages=Math.max(1,Math.ceil(filteredAccounts.length/(state.accountPageSize||20)));
  if(state.accountPage>totalPages)state.accountPage=totalPages;
  const pageStart=(state.accountPage-1)*(state.accountPageSize||20);
  const pagedAccounts=filteredAccounts.slice(pageStart,pageStart+(state.accountPageSize||20));
  const selectedIdsSet=new Set((state.selectedAccountIds||[]).filter(id=>accounts.some(a=>a.id===id)));
  const allPagedSelected=pagedAccounts.length>0&&pagedAccounts.every(a=>selectedIdsSet.has(a.id));

  let tabBody='';
  if(state.workspaceTab==='usage'){
    tabBody=renderUsageDashboard(app);
  }else if(state.workspaceTab==='wakeup'){
    tabBody=renderWakeupTab(app);
  }else if(state.workspaceTab==='instances'){
    const rows=[
      ...appBrowsers.map(item=>`<li class="workbench-instance-row"><div class="workbench-instance-meta"><strong>${escapeHTML(app.name)} · <code>${escapeHTML(item.instanceId)}</code><span class="badge">应用容器 · 已打开</span></strong><small>${item.mode==='own_network'?'自有网络环境':'127.0.0.1:17899 基础代理联通'}</small></div><div class="workbench-instance-actions"><button type="button" class="button secondary compact" data-action="focus-browser-instance" data-app-id="${escapeHTML(item.appId)}" data-instance-id="${escapeHTML(item.instanceId)}">聚焦窗口</button><button type="button" class="text-button" data-action="close-browser-instance" data-app-id="${escapeHTML(item.appId)}" data-instance-id="${escapeHTML(item.instanceId)}">关闭</button></div></li>`),
      ...appAgents.map(item=>{
        const running=['starting','running'].includes(item.status);
        return `<li class="workbench-instance-row"><div class="workbench-instance-meta"><strong>${escapeHTML(app.name)} · <code>${escapeHTML(item.profileId)}</code><span class="badge ${running?'':'neutral'}">${running?'运行中':'已停止'}</span></strong><small>独立实例配置目录${item.pid?` · PID ${item.pid}`:''}</small></div><div class="workbench-instance-actions">${running?`<button type="button" class="button secondary compact" data-action="stop-agent-instance" data-instance-id="${escapeHTML(item.profileId)}">停止</button>`:`<button type="button" class="button secondary compact ${canOperate?'':'is-disabled'}" data-action="start-agent-instance" data-instance-id="${escapeHTML(item.profileId)}" ${canOperate?'':'aria-disabled="true"'}>启动</button><button type="button" class="text-button" data-action="remove-agent-instance" data-instance-id="${escapeHTML(item.profileId)}">移除</button>`}</div></li>`;
      }),
    ];
    tabBody=`<div class="cockpit-toolbar-card"><span class="badge neutral">共 ${rows.length} 个独立实例</span><div class="cockpit-toolbar-right"><button type="button" class="button gradient-cta compact ${canOperate?'':'is-disabled'}" data-action="open-workbench-modal" data-app-id="${escapeHTML(app.id)}" ${canOperate?'':'aria-disabled="true"'}>+ 新建并行实例</button><button type="button" class="button secondary compact ${globalThis.NoyaDesktop&&authState.user&&isSafeEnvReady()?'':'is-disabled'}" data-action="browser-test" ${globalThis.NoyaDesktop&&authState.user&&isSafeEnvReady()?'':'aria-disabled="true"'}>打开应用容器</button></div></div>${rows.length?`<ul class="workbench-instance-list">${rows.join('')}</ul>`:`<div class="cockpit-empty-state">${svg('layers')}<h3>暂无 ${escapeHTML(app.name)} 运行实例</h3><p>支持新建多个独立隔离目录或应用容器实例并发运行；个人版仅限制单终端在线，不限制本机多开。</p></div>`}`;
  }else if(state.workspaceTab==='health'){
    const detected=workbench.detectedApps[app.id];
    tabBody=`<section class="settings-section" aria-label="账户与安装检测"><div class="members-heading">${groupHeading('账户与客户端状态检测','shield-check','blue')}<span class="badge ${meta.tone}">${escapeHTML(meta.label)}</span></div><dl class="overview-grid"><div><dt>安装 / 容器探测</dt><dd>${escapeHTML(meta.label)}<small>${escapeHTML(detected?.path||(hasContainer?'内置 Chromium 隔离容器':'标准系统安装目录'))}</small></dd></div><div><dt>凭据同步源</dt><dd>${escapeHTML(appCredentialSourceDesc(app.id))}</dd></div><div><dt>已托管账号数</dt><dd>${accounts.length} 个<small>${active?`当前活跃：${escapeHTML(accountDisplayName(active))}`:'尚未绑定活跃账号'}</small></dd></div><div><dt>配额同步状态</dt><dd>${active?.quotaState==='synced'?'已同步实时配额':active?.quotaState==='refresh_failed'?(active.lastError||'配额查询失败'):active?.quotaState==='proxy_required'?'需连接安全通道后查询':'待查询或容器就绪'}</dd></div></dl><div class="application-links" style="margin-top:14px;"><button type="button" class="button secondary" data-action="refresh-workbench">${svg('refresh')}重新检测本机客户端</button><button type="button" class="button secondary" data-action="import-local-account" data-app-id="${escapeHTML(app.id)}">扫描导入本机账号</button><button type="button" class="button gradient-cta${workbench.refreshingQuota?' is-spinning':''}" data-action="refresh-app-quotas" data-app-id="${escapeHTML(app.id)}" ${workbench.refreshingQuota?'disabled':''}>${svg('refresh')}立即核验配额</button></div></section>`;
  }else{
    const cardsHtml=pagedAccounts.length
      ?(state.accountViewMode==='list'
        ?`<div class="account-table-wrap"><table class="account-table"><thead><tr><th style="width:32px;"></th><th>账号标识</th><th>等级 / 标签</th><th>额度状态</th><th>最近操作</th><th>操作</th></tr></thead><tbody>${pagedAccounts.map(acct=>{
          const display=accountDisplayName(acct);
          const timeText=formatShortTime(acct.lastSwitchedAt||acct.lastCheckedAt||acct.updatedAt);
          return `<tr><td><input type="checkbox" data-account-select="${escapeHTML(acct.id)}" ${selectedIdsSet.has(acct.id)?'checked':''} aria-label="选择 ${escapeHTML(display)}"></td><td><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><strong>${escapeHTML(display)}</strong>${acct.isActive?'<span class="badge-current">当前</span>':''}${accountStatusBadgeHtml(acct)}</div><div style="font-size:11px;color:var(--muted);">槽位 ${escapeHTML(acct.id)}${acct.note?` · ${escapeHTML(acct.note)}`:''}</div></td><td><div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">${tierBadgeHtml(acct.plan)}${(acct.tags||[]).map(t=>`<span class="account-tag-pill">${escapeHTML(t)}</span>`).join('')}</div></td><td style="min-width:210px;">${renderQuotaBars(acct,2,app.id)}</td><td style="font-size:11.5px;color:var(--muted);">${escapeHTML(timeText||'—')}</td><td><div style="display:flex;gap:6px;flex-wrap:wrap;">${acct.isActive?`<button type="button" class="button primary compact ${canOperate?'':'is-disabled'} ${workbench.launchingApp===app.id?'is-loading':''}" data-action="${app.id==='antigravity'?'open-ag-launch-dialog':'launch-workspace-app'}" data-app-id="${escapeHTML(app.id)}" data-account-id="${escapeHTML(acct.id)}" ${canOperate?'':'aria-disabled="true"'}>${workbench.launchingApp===app.id?'启动中…':'启动'}</button>`:`<button type="button" class="button primary compact ${canOperate?'':'is-disabled'} ${workbench.switchingAndLaunching===`${app.id}:${acct.id}`?'is-loading':''}" data-action="${app.id==='antigravity'?'open-ag-launch-dialog':'switch-and-launch-account'}" data-app-id="${escapeHTML(app.id)}" data-account-id="${escapeHTML(acct.id)}" ${canOperate?'':'aria-disabled="true"'}>${workbench.switchingAndLaunching===`${app.id}:${acct.id}`?'切换启动中…':'切换并启动'}</button><button type="button" class="button secondary compact" data-action="switch-app-account" data-app-id="${escapeHTML(app.id)}" data-account-id="${escapeHTML(acct.id)}">切号</button>`}<button type="button" class="text-button" data-action="open-account-meta" data-app-id="${escapeHTML(app.id)}" data-account-id="${escapeHTML(acct.id)}">备注</button><button type="button" class="text-button" data-action="remove-app-account" data-app-id="${escapeHTML(app.id)}" data-account-id="${escapeHTML(acct.id)}">移除</button></div></td></tr>`;
        }).join('')}</tbody></table></div>`
        :`<div class="account-grid">${pagedAccounts.map(acct=>{
          const display=accountDisplayName(acct);
          const acctKey=`${app.id}:${acct.id}`;
          const timeLabel=acct.lastSwitchedAt?'切换时间':'刷新时间';
          const timeValue=formatShortTime(acct.lastSwitchedAt||acct.lastCheckedAt||acct.updatedAt);
          const groupPillsHtml=(acct.groups||acct.groupIds||[]).map(gid=>groupMap.get(gid)).filter(Boolean).map(g=>`<span class="account-tag-pill" style="border-color:${escapeHTML(g.color||'#3b82f6')};color:${escapeHTML(g.color||'#2563eb')};">${escapeHTML(g.name)}</span>`).join('');
          const tagsHtml=(acct.tags||[]).map(t=>`<span class="account-tag-pill">${escapeHTML(t)}</span>`).join('');
          const histOpen=Boolean(state.expandedSwitchHistory?.[acctKey]);
          const histItems=Array.isArray(acct.switchHistory)?acct.switchHistory.slice(0,5):[];
          const isCardRefreshing=workbench.refreshingAccountKey===acctKey||workbench.refreshingAccountKey===app.id||workbench.refreshingAccountKey==='all';
          return `<article class="account-card ${acct.isActive?'active-account':''}" data-account-card="${escapeHTML(acct.id)}">
            <div class="account-card-title-row">
              <input type="checkbox" data-account-select="${escapeHTML(acct.id)}" ${selectedIdsSet.has(acct.id)?'checked':''} aria-label="选择 ${escapeHTML(display)}">
              <strong title="${escapeHTML(display)}">${escapeHTML(display)}</strong>
              <span class="account-header-badges">${acct.isActive?'<span class="badge-current">当前</span>':''}${tierBadgeHtml(acct.plan)}</span>
            </div>
            <div class="note-chip-row">
              <button type="button" class="note-chip-btn" data-action="open-account-meta" data-app-id="${escapeHTML(app.id)}" data-account-id="${escapeHTML(acct.id)}">${svg('note')}${acct.note?escapeHTML(acct.note.slice(0,22)):'加备注'}</button>
              ${groupPillsHtml}${tagsHtml}${accountStatusBadgeHtml(acct)?`<span class="note-row-status-right">${accountStatusBadgeHtml(acct)}</span>`:''}
            </div>
            <div class="account-quota-panel">
              ${renderQuotaMiniGrid(acct,app.id)}
              ${timeValue?`<button type="button" class="account-time-pill" data-action="toggle-switch-history" data-account-key="${escapeHTML(acctKey)}" aria-expanded="${histOpen}">${svg('clock')}<span>${timeLabel}: ${escapeHTML(timeValue)}</span>${svg('chevron')}</button>`:''}
              ${histOpen?`<div class="account-history-popover">${histItems.length?histItems.map(h=>`<div>${escapeHTML(formatShortTime(h.at))} · ${escapeHTML(h.action==='switch'?'切换激活':h.action||'操作')}</div>`).join(''):'<div>暂无历史切换记录</div>'}</div>`:''}
            </div>
            <div class="account-card-divider"></div>
            <div class="card-icon-dock">
              <button type="button" class="dock-action-btn" data-action="inspect-account-detail" data-app-id="${escapeHTML(app.id)}" data-account-id="${escapeHTML(acct.id)}" title="账号详情" aria-label="账号详情">${svg('info')}</button>
              <button type="button" class="dock-action-btn" data-action="open-account-meta" data-app-id="${escapeHTML(app.id)}" data-account-id="${escapeHTML(acct.id)}" title="编辑标签与分组" aria-label="编辑标签">${svg('tag')}</button>
              <button type="button" class="dock-action-btn" data-action="open-account-meta" data-app-id="${escapeHTML(app.id)}" data-account-id="${escapeHTML(acct.id)}" title="添加备注" aria-label="添加备注">${svg('note')}</button>
              ${(()=>{const isPlayBusy=workbench.switchingAndLaunching===acctKey||(acct.isActive&&workbench.launchingApp===app.id);if(app.id==='antigravity')return `<button type="button" class="dock-action-btn primary-play${canOperate?'':' is-disabled'}${isPlayBusy?' is-spinning':''}" data-action="open-ag-launch-dialog" data-app-id="${escapeHTML(app.id)}" data-account-id="${escapeHTML(acct.id)}" title="${acct.isActive?'启动 Antigravity':'切换至该账号并启动 Antigravity'}" aria-label="${acct.isActive?'启动 Antigravity':'切换并启动 Antigravity'}" ${canOperate?'':'aria-disabled="true"'}>${svg(isPlayBusy?'loader':'play')}</button>`;if(acct.isActive)return `<button type="button" class="dock-action-btn primary-play${canOperate?'':' is-disabled'}${isPlayBusy?' is-spinning':''}" data-action="launch-workspace-app" data-app-id="${escapeHTML(app.id)}" title="启动 ${escapeHTML(app.name)}" aria-label="启动 ${escapeHTML(app.name)}" ${canOperate?'':'aria-disabled="true"'}>${svg(isPlayBusy?'loader':'play')}</button>`;return `<button type="button" class="dock-action-btn primary-play${canOperate?'':' is-disabled'}${isPlayBusy?' is-spinning':''}" data-action="switch-and-launch-account" data-app-id="${escapeHTML(app.id)}" data-account-id="${escapeHTML(acct.id)}" title="切换至该账号并启动 ${escapeHTML(app.name)}" aria-label="切换并启动 ${escapeHTML(app.name)}" ${canOperate?'':'aria-disabled="true"'}>${svg(isPlayBusy?'loader':'play')}</button>`;})()}
              <button type="button" class="dock-action-btn${isCardRefreshing?' is-spinning':''}" data-action="refresh-single-quota" data-app-id="${escapeHTML(app.id)}" data-account-id="${escapeHTML(acct.id)}" title="刷新额度" aria-label="刷新额度">${svg('refresh')}</button>
              <button type="button" class="dock-action-btn" data-action="export-single-account" data-app-id="${escapeHTML(app.id)}" data-account-id="${escapeHTML(acct.id)}" title="导出账号清单" aria-label="导出账号清单">${svg('upload')}</button>
              <button type="button" class="dock-action-btn danger" data-action="remove-app-account" data-app-id="${escapeHTML(app.id)}" data-account-id="${escapeHTML(acct.id)}" title="删除账号" aria-label="删除账号">${svg('trash')}</button>
            </div>
          </article>`;
        }).join('')}</div>`)
      :`<div class="cockpit-empty-state">${svg('monitor')}<h3>暂无账号</h3><p>暂无 ${escapeHTML(app.name)} 账号，点击下方按钮添加、OAuth 登录或从本机导入</p><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;"><button type="button" class="button gradient-cta" data-action="open-add-account-dialog" data-app-id="${escapeHTML(app.id)}">+ 添加账号</button><button type="button" class="button secondary" data-action="import-local-account" data-app-id="${escapeHTML(app.id)}">导入本机账号</button></div></div>`;

    const groupPills=`<div class="cockpit-group-pills">
      <button type="button" class="group-pill ${state.accountTierFilter==='all'&&state.accountTagFilter==='all'&&state.accountGroupFilter==='all'?'active':''}" data-tier-filter="all">全部 ${accounts.length}</button>
      ${(workbench.groups||[]).map(g=>`<button type="button" class="group-pill ${state.accountGroupFilter===g.id?'active':''}" data-group-filter="${escapeHTML(g.id)}">${escapeHTML(g.name)}</button>`).join('')}
      <button type="button" class="group-pill" data-action="open-group-manage-dialog" title="管理自定义分组">+</button>
      ${distinctTiers.map(t=>`<button type="button" class="group-pill ${state.accountTierFilter===t?'active':''}" data-tier-filter="${escapeHTML(t)}">${escapeHTML(t)}</button>`).join('')}
      ${distinctTags.map(tag=>`<button type="button" class="group-pill ${state.accountTagFilter===tag?'active':''}" data-tag-filter="${escapeHTML(tag)}">#${escapeHTML(tag)}</button>`).join('')}
    </div>`;

    const paginationFooter=`<div class="cockpit-pagination-footer"><span>显示 ${filteredAccounts.length?`${pageStart+1}-${Math.min(pageStart+pagedAccounts.length,filteredAccounts.length)} 条，共 ${filteredAccounts.length} 条`:'0 条'}</span><div class="cockpit-pagination-controls"><span class="badge neutral">${state.accountPageSize} 条/页</span><button type="button" class="button secondary compact" data-account-page="prev" ${state.accountPage<=1?'disabled':''}>上一页</button><span>第 ${state.accountPage} / ${totalPages} 页</span><button type="button" class="button secondary compact" data-account-page="next" ${state.accountPage>=totalPages?'disabled':''}>下一页</button></div></div>`;

    tabBody=`${renderLocalTokenBar(app)}
    <div class="tier-notice-bar"><span>${svg('shield')}支持本机多账号独立分区与一键「切换并启动」；${isEnterpriseUser()?'企业版支持多终端并发连接服务端。':'个人版仅限制同时 1 台终端在线连接服务端，本机应用与容器多开不受限制。'}</span></div>
    <div class="cockpit-toolbar-card">
      <div class="cockpit-toolbar-left">
        <input type="search" class="account-search" data-focus-key="account-search" value="${escapeHTML(state.accountSearch||'')}" placeholder="搜索 ${escapeHTML(app.short)} 账号...">
        <div class="view-toggle" role="group" aria-label="视图模式">
          <button type="button" data-account-view="list" aria-pressed="${state.accountViewMode==='list'}">列表</button>
          <button type="button" data-account-view="cards" aria-pressed="${state.accountViewMode==='cards'}">卡片</button>
        </div>
        <select id="account-filter-select" class="cockpit-toolbar-select" aria-label="账号筛选">
          <option value="all"${state.accountFilter==='all'?' selected':''}>全部 (${accounts.length})</option>
          <option value="active"${state.accountFilter==='active'?' selected':''}>当前使用</option>
          <option value="low"${state.accountFilter==='low'?' selected':''}>低额度预警</option>
        </select>
        <select id="account-sort-select" class="cockpit-toolbar-select" aria-label="排序方式">
          <option value="quota"${state.accountSort==='quota'?' selected':''}>按综合配额</option>
          <option value="switched"${state.accountSort==='switched'?' selected':''}>按切换时间</option>
          <option value="email"${state.accountSort==='email'?' selected':''}>按账号名称</option>
        </select>
        <button type="button" class="icon-pill-btn" data-action="toggle-sort-dir" title="切换升降序" aria-label="切换升降序">${state.accountSortDir==='asc'?'↑':'↓'}</button>
      </div>
      <div class="cockpit-toolbar-right">
        <button type="button" class="icon-pill-btn primary-add" data-action="open-add-account-dialog" data-app-id="${escapeHTML(app.id)}" title="添加账号 / OAuth 登录" aria-label="添加账号">+</button>
        <button type="button" class="icon-pill-btn${workbench.refreshingQuota?' is-spinning':''}" data-action="refresh-app-quotas" data-app-id="${escapeHTML(app.id)}" title="刷新配额" aria-label="刷新配额" ${workbench.refreshingQuota?'disabled':''}>${svg('refresh')}</button>
        <button type="button" class="icon-pill-btn ${state.privacyMask?'active':''}" data-action="toggle-privacy-mask" title="隐藏 / 显示邮箱" aria-label="隐私开关">${svg(state.privacyMask?'eye-off':'eye')}</button>
        <button type="button" class="icon-pill-btn" data-action="export-app-accounts" data-app-id="${escapeHTML(app.id)}" title="导出脱敏 JSON" aria-label="导出脱敏 JSON">${svg('upload')}</button>
        <button type="button" class="icon-pill-btn" data-action="import-local-account" data-app-id="${escapeHTML(app.id)}" title="扫描导入本机账号" aria-label="导入本机账号">${svg('folder')}</button>
        <button type="button" class="icon-pill-btn" data-action="open-auto-refresh-dialog" title="自动刷新间隔设置" aria-label="自动刷新设置">${svg('settings')}</button>
      </div>
    </div>
    <div class="cockpit-selection-bar">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <label class="cockpit-check-label"><input type="checkbox" data-action="toggle-select-all-accounts" ${allPagedSelected?'checked':''}>全选</label>
        ${selectedIdsSet.size?`<button type="button" class="button secondary compact" data-action="batch-remove-accounts" data-app-id="${escapeHTML(app.id)}">删除选中 (${selectedIdsSet.size})</button>`:''}
      </div>
      ${groupPills}
    </div>
    ${cardsHtml}
    ${paginationFooter}`;
  }

  const isClaudeFamily=['claude','claude-code','claude-desktop'].includes(app.id);
  return `<div class="cockpit-page-titlebar">
      <div style="display:flex;align-items:center;gap:10px;">
        <button type="button" class="text-button" data-action="back-overview" style="min-height:30px;">${svg('arrow')} 概览</button>
        <span class="cockpit-page-title">账号管理</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        ${quietChannelStatusPill()}
        <span class="cockpit-version-pill">桌面版 v0.2.0</span>
        <button type="button" class="plaza-pin-btn ${isPinned?'pinned':''}" data-toggle-pin="${escapeHTML(app.id)}">${isPinned?'✓ 已在常用':'+ 加入常用'}</button>
      </div>
    </div>
    <header class="app-workspace-header">
      <div class="cockpit-top-navrow">
        <div class="platform-dropdown-wrap">
          <button type="button" class="platform-dropdown-trigger" id="workspace-platform-dropdown-btn" data-action="toggle-platform-dropdown" aria-expanded="${Boolean(state.platformDropdownOpen)}" aria-haspopup="listbox">
            ${dimensionalIcon(app,'mini')}<span>${escapeHTML(app.short||app.name)}</span>${svg('chevron')}
          </button>
          ${state.platformDropdownOpen?`<div class="platform-dropdown-menu" role="listbox" aria-label="切换管理平台">
            ${availableApps().map(item=>`<button type="button" class="platform-dropdown-item${item.id===app.id?' active':''}" data-select-workspace-platform="${escapeHTML(item.id)}" role="option" aria-selected="${item.id===app.id}"><span>${escapeHTML(item.name)}</span>${item.id===app.id?'<span>✓</span>':''}</button>`).join('')}
            <div class="platform-dropdown-divider"></div>
            <button type="button" class="platform-dropdown-item" data-action="open-group-manage-dialog">✎ 分组管理</button>
          </div>`:''}
        </div>
        <div class="workspace-tabs-pill" role="tablist" aria-label="工作区子视图">
          <button type="button" class="workspace-tab-btn${state.workspaceTab==='accounts'?' active':''}" role="tab" data-workspace-tab="accounts" aria-selected="${state.workspaceTab==='accounts'}">${svg('user')}<span>账号总览 (${accounts.length})</span></button>
          <button type="button" class="workspace-tab-btn${state.workspaceTab==='usage'?' active':''}" role="tab" data-workspace-tab="usage" aria-selected="${state.workspaceTab==='usage'}">${svg('chart')}<span>会话用量</span></button>
          <button type="button" class="workspace-tab-btn${state.workspaceTab==='instances'?' active':''}" role="tab" data-workspace-tab="instances" aria-selected="${state.workspaceTab==='instances'}">${svg('layers')}<span>应用多开 (${appBrowsers.length+appAgents.length})</span></button>
          <button type="button" class="workspace-tab-btn${state.workspaceTab==='wakeup'?' active':''}" role="tab" data-workspace-tab="wakeup" aria-selected="${state.workspaceTab==='wakeup'}">${svg('clock')}<span>唤醒任务 (${appWakeups.length})</span></button>
          <button type="button" class="workspace-tab-btn${state.workspaceTab==='health'?' active':''}" role="tab" data-workspace-tab="health" aria-selected="${state.workspaceTab==='health'}">${svg('shield-check')}<span>账户检测</span></button>
        </div>
      </div>
      ${isClaudeFamily?`<div class="subapp-switcher" role="group" aria-label="Claude 子端切换">
        <button type="button" class="subapp-btn${app.id==='claude-desktop'?' active':''}" data-select-workspace-platform="claude-desktop">Claude Desktop</button>
        <button type="button" class="subapp-btn${app.id==='claude'?' active':''}" data-select-workspace-platform="claude">Claude Web</button>
        <button type="button" class="subapp-btn${app.id==='claude-code'?' active':''}" data-select-workspace-platform="claude-code">Claude CLI</button>
      </div>`:''}
      <div class="app-workspace-top">
        <div class="app-workspace-identity">
          ${dimensionalIcon(app,'small')}
          <h1>${escapeHTML(app.name)}</h1>
          <div class="app-workspace-meta"><span class="badge ${meta.tone}">${escapeHTML(meta.label)}</span><span>${active?`当前使用：${escapeHTML(accountDisplayName(active))}`:'尚未绑定活跃账号'}</span></div>
        </div>
        <div class="app-workspace-header-actions" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <button type="button" class="button gradient-cta compact ${canOperate?'':'is-disabled'} ${workbench.launchingApp===app.id?'is-loading':''}" data-action="launch-workspace-app" data-app-id="${escapeHTML(app.id)}" ${canOperate?'':'aria-disabled="true"'}>${svg('play')}${workbench.launchingApp===app.id?'正在打开…':(hasContainer?'打开应用容器':'启动应用')}</button>
        </div>
      </div>
    </header>
    <details class="app-info-callout"${state.infoCalloutCollapsed?'':' open'}>
      <summary>${svg('info')} ${escapeHTML(app.name)} 账号管理说明（点击展开/收起）${svg('chevron')}</summary>
      <div class="app-info-callout-body">
        <ul>
          <li>凭据存储：读取/同步 <code>${escapeHTML(appCredentialSourceDesc(app.id))}</code>；托管快照由系统 DPAPI 加密保管。</li>
          <li>网络保护：优先走本地安全通道 <code>127.0.0.1:17899</code> 或您选择的用户自有网络环境。</li>
        </ul>
      </div>
    </details>
    ${tabBody}`;
}

function connectionPage(){
  const copy={
    disconnected:workbench.envMode==='own_network'?'当前为自有网络环境：可直接使用下方应用。':globalThis.NoyaDesktop?'已退出或尚未开启安全连接。':isMainSite?'网页可管理账号，客户端连接请在桌面端完成。':'下方按钮仅模拟连接，不建立真实网络。',
    unavailable:globalThis.NoyaDesktop?'请先在浏览器完成定途设备授权。':'请在桌面端启动连接。',
    connecting:['检查授权状态…','选择可用入口…','准备专属通道…'][state.step],
    connected:globalThis.NoyaDesktop?'安全通道已就绪；出口核验以服务端观测结果为准。':adopted()?'示例专属备用已接管。':'示例连接已就绪，可选择应用继续。',
    failed:state.connectionError?escapeHTML(state.connectionError):'连接未成功，请点击重试。',
    expired:'当前订阅已到期，请前往我的查看方案。',
    'no-spare':'没有可用备用通道，请联系支持。',
  };
  const feedback=state.hasConnectionAction?`<div class="connection-feedback ${state.status}" role="status" aria-live="polite" style="margin-bottom:14px;">${svg(state.status==='connecting'?'loader':['failed','expired','no-spare','unavailable'].includes(state.status)?statusIcons[state.status]:isConnected()?'check':'info',state.status==='connecting'?'spinner':'')}<p>${sourceBadge(view('identity'))}${copy[state.status]||'当前未连接。'}</p></div>`:'';
  let body='';
  if(state.libraryExpanded){
    body=appLibrary();
  }else{
    const targetApp=state.activeWorkspaceApp?availableApps().find(a=>a.id===state.activeWorkspaceApp):null;
    body=`<div id="app-library" hidden></div>${targetApp?appWorkspacePage(targetApp):cockpitOverviewPage()}`;
  }
  return `<section class="connection-home" aria-label="应用接入工作台">${feedback}${body}</section>`;
}

function appLibrary(){
  const categories=platform().mobile?['全部','通用','任务']:['全部','编程','通用','任务'];
  if(!categories.includes(state.appCategory))state.appCategory='全部';
  const keyword=(state.appSearch||'').trim().toLowerCase();
  const matches=availableApps().filter(app=>(state.appCategory==='全部'||app.category===state.appCategory)&&(!keyword||app.name.toLowerCase().includes(keyword)||app.id.toLowerCase().includes(keyword)));
  const plazaCard=app=>{
    const pinned=state.pinnedApps.includes(app.id);
    const count=accountsForApp(app.id).length;
    return `<div class="plaza-card">${toolTile(app)}<p class="plaza-card-desc">${escapeHTML(sanitizeAppCopy(app.copy,app))}${count?` · 已托管 ${count} 个账号`:''}</p><div class="plaza-card-actions"><button type="button" class="plaza-pin-btn ${pinned?'pinned':''}" data-toggle-pin="${escapeHTML(app.id)}">${pinned?'✓ 已接入左侧栏':'+ 接入左侧栏'}</button><button type="button" class="text-button" data-open-workspace="${escapeHTML(app.id)}" style="min-height:30px;font-size:11.5px;">管理 ${svg('arrow')}</button></div></div>`;
  };
  return `<div id="app-library"${state.libraryExpanded?'':' hidden'}>
    <header class="cockpit-header-bar">
      <div class="cockpit-header-title"><div><h1>应用广场</h1><div class="cockpit-subline"><span>收录全部 ${availableApps().length} 款 AI 应用与安全容器 · 一键接入左侧导航并管理账号额度</span></div></div></div>
      <div class="cockpit-header-actions"><button type="button" class="button secondary" data-action="sync-local-accounts">扫描本机全部账号</button><button type="button" class="button primary" data-action="back-overview">返回接入概览</button></div>
    </header>
    <div class="library-toolbar"><div class="category-filters" role="group" aria-label="按工具类型筛选">${categories.map(category=>`<button class="category-filter ${state.appCategory===category?'active':''}" data-category="${category}" aria-pressed="${state.appCategory===category}">${category}</button>`).join('')}</div><input type="search" class="library-search" data-focus-key="app-search" value="${escapeHTML(state.appSearch||'')}" placeholder="搜索 Antigravity / Cursor / Codex / Muse…" aria-label="筛选应用名称"></div>
    ${matches.length?['编程','通用','任务'].map(category=>{
      const items=matches.filter(app=>app.category===category);
      return items.length?`<section class="app-category"><div class="section-heading"><h3>${category}</h3><span>${items.length} 个应用</span></div><div class="plaza-grid">${items.map(plazaCard).join('')}</div></section>`:'';
    }).join(''):`<div class="empty-state"><h3>未找到匹配的应用</h3><button class="button secondary" data-action="clear-library">重置筛选</button></div>`}
  </div>`;
}
function configureTierInput(inputEl,hintEl,suggestedPrefix='instance'){
  if(!inputEl)return;
  inputEl.readOnly=false;
  if(!inputEl.value||inputEl.value==='main')inputEl.value=`${suggestedPrefix}-${workbench.browserInstances.length+workbench.agentProfiles.length+1}`;
  if(hintEl)hintEl.textContent='可自定义实例或账号分区名（如 muse-1、muse-2 或 main）并行多开；个人版仅限制同时 1 台终端连接服务端。';
}
function openBrowserTest(preselectedAppId=null){if(!globalThis.NoyaDesktop?.browser){notify('网页端仅预览；请在桌面端打开安全容器或隔离浏览器。');return}if(!authState.user){go('settings');return}if(!isSafeEnvReady()){notify('纯净安全环境下请先连接服务端分配的出口（或切换至自有网络环境）。');return}const dialog=document.getElementById('browser-instance-dialog');const err=document.getElementById('browser-instance-error');if(err)err.textContent='';if(preselectedAppId){const sel=document.querySelector('#browser-instance-form [name=appId]');if(sel)sel.value=preselectedAppId;}configureTierInput(document.getElementById('browser-instance-id-input'),document.getElementById('browser-instance-tier-hint'),preselectedAppId||'browser');dialog.showModal()}
async function startBrowserTest(event){event.preventDefault();const form=event.target;if(!form.reportValidity())return;const button=form.querySelector('[type=submit]');const prevLabel=button.textContent;button.disabled=true;button.textContent='正在打开…';try{const appId=form.elements.appId.value;const instanceId=form.elements.instanceId.value.trim()||'main';const result=await globalThis.NoyaDesktop.browser.open(appId,instanceId);if(!result?.ok)throw new Error(result?.error?.message||'隔离浏览器未能打开。');document.getElementById('browser-instance-dialog').close();recordLocalEvent('browser_started',{simulated:false});await syncDesktopWorkbench();render();notify(workbench.envMode==='own_network'?'已在自有网络环境下打开独立应用容器。':'已打开应用容器，通过 127.0.0.1:17899 基础代理联通。')}catch(error){document.getElementById('browser-instance-error').textContent=error.message||'浏览器打开失败。'}finally{button.disabled=false;button.textContent=prevLabel}}
document.addEventListener('submit',event=>{const formId=event.target?.getAttribute?.('id')||'';if(formId==='browser-instance-form')startBrowserTest(event);if(formId==='workbench-instance-form')submitWorkbenchInstance(event)});
function openOwnNetworkConfirmDialog(){const dlg=document.getElementById('own-network-confirm-dialog');if(!dlg){void switchEnvironmentMode('own_network');return;}if(!dlg.open)dlg.showModal();dlg.querySelector('[data-action="cancel-own-network-switch"]')?.focus({preventScroll:true});}
document.addEventListener('click',event=>{const envBtn=event.target.closest('[data-env-mode]');if(envBtn){const targetMode=envBtn.dataset.envMode;if(targetMode==='own_network'&&workbench.envMode!=='own_network'&&!workbench.switchingMode){openOwnNetworkConfirmDialog();return;}void switchEnvironmentMode(targetMode);return;}const action=event.target.closest('[data-action]')?.dataset.action;if(action==='cancel-own-network-switch'){document.getElementById('own-network-confirm-dialog')?.close();return;}if(action==='confirm-own-network-switch'){document.getElementById('own-network-confirm-dialog')?.close();void switchEnvironmentMode('own_network');return;}if(action==='browser-test')openBrowserTest();if(action==='close-browser-dialog')document.getElementById('browser-instance-dialog').close();if(action==='close-workbench-dialog')document.getElementById('workbench-instance-dialog')?.close();});
function selectedToolDetails(){const selected=selectedApplication();if(!selected.id)return `${selectedToolRow()}<div class="empty-state catalog-empty"><h3>${catalogState.phase==='error'?'应用目录暂不可用':'正在同步应用目录'}</h3><p>${catalogState.error?escapeHTML(catalogState.error):catalogState.phase==='blocked'?'等待运营端第 0 步完成后再读取目录。':'登录后从运营端读取按平台发布的应用和模板。'}</p>${catalogState.phase==='error'?"<button class=\"button secondary compact\" data-action=\"reload-catalog\">重新加载应用目录</button>":''}</div>`;const localProxy=data.LOCAL_PROXY||{http:'http://127.0.0.1:17899'};return `${selectedToolRow()}<details class="selected-tool-details"><summary>使用说明与官方入口 ${svg('chevron')}</summary><dl class="tool-capabilities"><div><dt>工具类型</dt><dd>${escapeHTML(selected.category)} · ${escapeHTML(selected.platformStatus||'unverified')}</dd></div><div><dt>入口能力</dt><dd>${selected.mode==='verified'?'已验证':selected.mode==='beta'?'测试中':'适配待验证'}</dd></div><div><dt>本地接入</dt><dd>${escapeHTML(localProxy.http)} · 出口由服务端绑定</dd></div></dl>${selected.category==='任务'?`<p class="capability-footnote">${escapeHTML(selected.name)} 的任务在平台云端执行。我们只能控制你访问该平台时的网络出口，不能控制云端 Agent 调用第三方服务时的出口。</p>`:''}${applicationLinks(selected)}<p class="capability-footnote">当前仅展示运营端目录声明；未验证应用不会被当作已接入。17899 是定途本机代理入口，不是公网管理接口。</p></details>`}
function applicationLinks(app,includeGuide=true){const url=typeof app.officialUrl==='string'&&/^https:\/\//.test(app.officialUrl)?app.officialUrl:null;return `<div class="application-links">${includeGuide?`<button class="button secondary" data-action="app-guide">${svg('help')}使用指南</button>`:''}${url?`<a class="button secondary" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" data-official-app="${escapeHTML(app.id)}">官方入口 ${svg('arrow-up-right')}</a>`:'<span class="unverified-official">官方入口待确认</span>'}</div>`}
function subpageHeading(title,copy){return `<button class="text-button subpage-back" data-page="settings">${svg('arrow')}返回我的</button>`+heading(title,copy)}
function notificationsPage(){localEvents.markAllRead();const events=localEvents.list();return subpageHeading('本机通知','仅记录本页面发生的操作，不是服务器推送。')+`<div class="local-toolbar"><span>${events.length} 条本机事件</span><button class="text-button" data-action="clear-events" ${events.length?'':'disabled'}>清空记录</button></div>${events.length?`<div class="notification-list">${events.map(event=>`<article class="notification-row">${dimensionalIcon({icon:event.level==='error'?'alert':event.code==='preferences_saved'?'settings':'bell',color:event.level==='error'?'orange':'blue'},'small')}<div><strong>${escapeHTML(event.message)}</strong><p>${escapeHTML(event.platform?platforms[event.platform]?.label||event.platform:'本机')} · ${event.simulated?'演示事件':'本机操作'}</p><time datetime="${escapeHTML(event.at)}">${escapeHTML(new Date(event.at).toLocaleString('zh-CN',{hour12:false}))}</time></div></article>`).join('')}</div>`:`<div class="empty-state local-empty">${svg('bell')}<h3>还没有本机通知</h3><p>模拟连接与本地偏好操作会记录在这里。退出账号或关闭页面后清除。</p></div>`}<p class="local-footnote">${state.settings.notify?'本机通知提醒已开启。':'提醒已暂停；新事件仍可用于诊断，不计为未读。'}</p>`}
function helpPage(){const app=selectedApplication();return subpageHeading('帮助与故障排查','先完成本机操作，再按提示检查连接。')+`<section class="help-steps"><h2>开始使用 ${escapeHTML(app.name)}</h2><ol><li><strong>选择工具</strong><p>在应用库选择要使用的应用。${app.category==='编程'?'桌面工具的适配与启动能力以具体支持情况为准。':'使用官方应用或浏览器访问。'}</p></li><li><strong>体验连接</strong><p>点击下方蓝色按钮，并确认模拟权限。当前不会建立真实隧道。</p></li><li><strong>在官方应用登录</strong><p>使用你自己的官方账号；定途不会接管应用认证。${app.category==='任务'?'云端任务执行时的第三方出口由该平台决定。':''}</p></li></ol>${applicationLinks(app,false)}</section><section class="help-faq"><h2>常见问题</h2><details><summary>连接失败怎么办？${svg('chevron')}</summary><p>先检查本机是否能访问网络。这里的失败由原型场景模拟，可切回正常连接场景再重试；真实网络客户端尚未接入。</p></details><details><summary>为什么无法自动打开工具？${svg('chevron')}</summary><p>网页只提供官方链接、打开方式说明或启动演示；不会执行安装命令或未经验证的深链。移动设备不提供本机 CLI 启动。</p></details><details><summary>备用接管后会自动切回吗？${svg('chevron')}</summary><p>不会。演示保持服务端分配的备用出口粘性；断开与重新连接不回切。详情在出口与备用页查看。</p></details><details><summary>开机启动或自动连接已经生效了吗？${svg('chevron')}</summary><p>这里只保存偏好。系统开机启动、后台运行和真实自动连接需要原生客户端支持，当前不会执行。</p></details><details><summary>复制诊断失败怎么办？${svg('chevron')}</summary><p>可以下载 JSON 文件，或在复制失败后从只读文本框手动复制。诊断只在本机生成，不会上传。</p></details></section><div class="application-links"><button class="button secondary" data-action="permission-help">系统权限说明</button><button class="button secondary" data-page="diagnostics">本机诊断 ${svg('arrow')}</button></div>`}
function diagnosticsPage(){const count=localEvents.list().length;return subpageHeading('本机诊断','在浏览器内生成脱敏报告，不上传到服务器。')+`<section class="diagnostics-summary"><h2>可安全查看的本机状态</h2><dl><div><dt>当前平台</dt><dd>${platform().label}</dd></div><div><dt>网络可用提示</dt><dd>${navigator.onLine===false?'浏览器报告离线':'浏览器未报告离线'}</dd></div><div><dt>本地偏好存储</dt><dd>${storageAvailable?'可用':'不可用，仅临时保存'}</dd></div><div><dt>本机事件</dt><dd>${count} 条</dd></div></dl><p>报告只包含平台、界面偏好、演示连接状态和本机事件，不包含账号、邮箱、Cookie、令牌或分配的 IP。</p><div class="application-links"><button class="button primary" data-action="download-diagnostic">下载 JSON ${svg('download')}</button><button class="button secondary" data-action="copy-diagnostic">复制诊断</button></div></section>${diagnosticFallback?`<section class="diagnostic-manual"><label for="diagnostic-text">自动复制不可用，请选择以下文本手动复制</label><textarea id="diagnostic-text" readonly spellcheck="false">${escapeHTML(diagnosticFallback)}</textarea></section>`:''}<p class="local-footnote">浏览器的在线提示不能代替真实线路检测。本页不会测试第三方账号，也不会建立网络隧道。</p>`}
function groupHeading(title,icon,color){return `<h2 class="settings-group-title">${dimensionalIcon({icon,color},'small')}<span>${title}</span></h2>`}
function realIdentityStatus(status){return {provision_pending:'待开通出口',active:'已启用',suspended:'已暂停'}[status]||'状态未知'}
function identityDirectorySection(){
  const directory=accountOverview.identityDirectory;
  const acctLabel=authState.user?data.labels.account(authState.user):null;
  const tierText=acctLabel?(authState.user.customerType==='enterprise'?`企业账号${acctLabel.role?` · ${acctLabel.role}`:''}`:`个人账号${acctLabel.level?` · ${acctLabel.level}`:''}`):'';
  const appliedLabels={active:'已下发',provision_pending:'待开通',suspended:'已暂停',unknown:'待运营端同步'};
  const observedLabels={active:'已观测',provision_pending:'待开通',suspended:'已暂停',unknown:'待探针观测'};
  let body='<p class="overview-empty" aria-busy="true">正在读取身份目录…</p>';
  if(accountOverview.identityDirectoryError)body=`<p class="auth-error" role="alert">${escapeHTML(accountOverview.identityDirectoryError)}</p>`;
  else if(directory){
    const rows=Array.isArray(directory.identities)?directory.identities:[];
    body=rows.length?`<div class="identity-directory-list">${rows.map(item=>{
      const appliedLabel=appliedLabels[item.appliedStatus]||'待运营端同步';
      const observedLabel=observedLabels[item.observedStatus]||'待探针观测';
      const healthLabel=item.health==='known'?'探针正常':'待探针上报';
      return `<article class="identity-directory-row"><div class="identity-directory-mark" aria-hidden="true">${escapeHTML(initialOf(item.displayName))}</div><div class="identity-directory-copy"><strong>${escapeHTML(item.displayName)}</strong><small title="身份 ID: ${escapeHTML(item.id)}">身份编号 ${escapeHTML(String(item.id).slice(0,8))} · 下发 ${escapeHTML(appliedLabel)} · 观测 ${escapeHTML(observedLabel)} · 健康 ${escapeHTML(healthLabel)}</small></div><span class="badge ${item.status==='active'?'neutral':item.status==='suspended'?'danger':'warning'}">${realIdentityStatus(item.status)}</span></article>`;
    }).join('')}</div>`:'<p class="identity-directory-empty">当前账号暂无可显示的出口身份。</p>';
    if(directory.nextCursor)body+=`<button class="button secondary identity-directory-more" data-action="load-identities" ${accountOverview.identityDirectoryLoading?'disabled':''}>${accountOverview.identityDirectoryLoading?'读取中…':'加载下一页'} ${svg('arrow')}</button>`;
  }
  return `<section class="settings-section identity-directory" aria-label="连接身份目录"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">${groupHeading('服务端出口身份','user','green')}${tierText?`<span class="badge neutral">当前等级：${escapeHTML(tierText)}</span>`:''}</div><p class="identity-directory-note">出口身份由服务端统一分配，客户端只读展示；下发、观测与健康状态由运营端与探针同步。</p>${body}</section>`;
}
function realEgressPage(){
  if(!authState.user)return heading('出口与备用','请先登录后查看服务端分配的网络资源。')+accountPanel();
  if(data.CLIENT_API_READY!==true)return heading('出口与备用','服务端状态投影尚未接入，客户端不会显示演示出口。')+'<section class="settings-section real-egress"><div class="real-egress-status"><div><strong>未交付</strong><p>运营端尚未提供生产状态投影；当前不显示公网 IP、线路或备用数量。</p></div><span class="badge warning">unknown</span></div><p class="overview-note">出口绑定、配置版本、Agent 回报和独立探针状态将在设备会话与 tunnel/status 接口完成后显示。</p></section>';
  if(accountOverview.phase==='loading'||accountOverview.phase==='idle')return heading('出口与备用','服务端分配、绑定与切换，客户端只读。')+'<section class="settings-section real-egress" aria-busy="true"><p class="overview-empty">正在读取服务端资源…</p></section>';
  if(accountOverview.phase==='error')return heading('出口与备用','服务端分配、绑定与切换，客户端只读。')+`<section class="settings-section real-egress"><div class="resource-alert" role="alert">${svg('alert')}<p>${escapeHTML(accountOverview.error||'账号资源暂时不可用，请稍后重试。')}</p></div><button class="button secondary" data-action="refresh-overview">重新读取 ${svg('refresh')}</button></section>`;
  const summary=accountOverview.data,egress=summary?.egress||{},subscription=summary?.subscription||{};
  const status={known:'已同步',unknown:'未提供',stale:'已到期',unavailable:'暂不可用'}[egress.status]||'暂不可用';
  return heading('出口与备用','服务端分配、绑定与切换，客户端只读。')+`<section class="settings-section real-egress" aria-label="服务端出口绑定">${groupHeading('出口绑定','shield','blue')}<div class="real-egress-status"><div><strong>${egress.binding==='server'?'服务端管理':'待接入'}</strong><p>出口 IP、备用池和故障切换均由运营端控制。</p></div><span class="badge ${egress.status==='known'?'neutral':'warning'}">${status}</span></div><dl class="overview-grid real-egress-grid"><div><dt>主出口</dt><dd>${egress.primaryAllocated??'未提供'} 个</dd></div><div><dt>备用出口</dt><dd>${egress.standbyAllocated??'未提供'} 个</dd></div><div><dt>套餐主出口额度</dt><dd>${subscription.primaryIpQuota??'未提供'} 个</dd></div><div><dt>套餐备用额度</dt><dd>${subscription.standbyIpQuota??'未提供'} 个</dd></div></dl><p class="overview-note">${summary.customer.role==='member'?'当前只显示分配给本人的身份。':'当前显示本账号有权查看的连接身份。'}任何出口地址、线路和绑定版本均不会由客户端覆盖。</p></section>${identityDirectorySection()}`;
}
function loadMoreIdentities(){
  if(accountOverview.identityDirectoryLoading||accountOverview.phase!=='ready'||!accountOverview.identityDirectory?.nextCursor||!authState.user)return;
  const boundary=accountBoundary,userId=authState.user.id,cursor=accountOverview.identityDirectory.nextCursor;
  accountOverview.identityDirectoryLoading=true;render();
  data.identities({cursor}).then(result=>{
    if(boundary!==accountBoundary||authState.user?.id!==userId)return;
    const previous=accountOverview.identityDirectory||{data_source:'real',identities:[],nextCursor:null};
    const identities=[...(previous.identities||[]),...(result.identities||[])];
    if(new Set(identities.map(item=>item.id)).size!==identities.length)throw new data.ApiError(200,'INVALID_RESPONSE','身份目录返回了重复身份。');
    accountOverview.identityDirectory={data_source:'real',identities,nextCursor:result.nextCursor};
    accountOverview.identityDirectoryError='';
  }).catch(error=>{if(boundary===accountBoundary&&authState.user?.id===userId)accountOverview.identityDirectoryError=error instanceof data.ApiError?error.message:'身份目录暂未接入。';}).finally(()=>{if(boundary===accountBoundary&&authState.user?.id===userId){accountOverview.identityDirectoryLoading=false;render();}});
}
function egressPage(){if(isMainSite)return realEgressPage();const egressView=view('egress'),standbyView=view('standby'),eventsView=view('events'),entitlementView=view('entitlement');const entitlement=entitlementView.data||{};const current=identity().current_exit_summary||{};const spare=(standbyView.data||[])[0];const warn=state.status==='expired'?'示例连接权限已到期，当前分配仍只读保留；续费后可继续。':state.status==='no-spare'?'示例出口不可用且没有可接管备用。连接已停止，分配信息保留。':state.status==='failed'?'入口连接未成功，出口绑定保持不变。':'';const events=eventsView.data||[];const when=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'':date.toLocaleString('zh-CN',{hour12:false})};return heading('出口与备用','网络资源演示，不代表账号已购买或已分配。')+`${warn?`<div class="resource-alert" role="status">${svg('alert')}<p>${sourceBadge(entitlementView)}${warn}</p></div>`:''}<section class="egress-summary"><div class="egress-summary-top"><div class="resource-heading">${dimensionalIcon({icon:'shield',color:'blue'},'small')}<div><h2>${adopted()?'当前出口 · 备用已接管':'当前主出口'}${sourceBadge(egressView)}</h2><p>${sampleText(view('identity'),identity().display_name||'')}</p></div></div><span class="badge neutral">${svg('lock')}只读绑定</span></div><dl class="data-grid"><div><dt>分配的独立 IP</dt><dd class="large-ip">${sampleText(egressView,current.ip||'')}<small>${escapeHTML(current.region||'')} · 文档保留地址示例</small></dd></div><div><dt>资源归属</dt><dd>示例 · 当前身份独享<small>示例资源，非已购买权益</small></dd></div><div><dt>绑定状态</dt><dd>${adopted()?'备用粘性绑定':'固定主出口'}<small>绑定版本 ${escapeHTML(identity().binding_revision??'')} · 客户端不可更换</small></dd></div></dl></section><div class="section-heading"><h2>连接权益${sourceBadge(entitlementView)}</h2><span class="setting-value">${entitlement.status==='expired'?'已到期':'有效'}</span></div><dl class="data-grid entitlement-grid"><div><dt>套餐</dt><dd>${sampleText(entitlementView,entitlement.plan_name||'')}</dd></div><div><dt>到期时间</dt><dd>${entitlement.expires_at?sampleText(entitlementView,new Date(entitlement.expires_at).toLocaleDateString('zh-CN')):entitlementView.data_source!=='real'?'未提供（演示）':'未提供'}</dd></div><div><dt>专属备用</dt><dd>${sampleText(entitlementView,(entitlement.standby_count??0)+' 个')}</dd></div></dl><div class="section-heading"><h2>专属备用${sourceBadge(standbyView)}</h2><span class="setting-value">${adopted()?'已接管':spare?'1 个待命':'0 个可用'}</span></div>${adopted()||spare?`<div class="resource-row resource-panel">${dimensionalIcon({icon:'layers',color:adopted()?'green':'purple'},'small')}<div><strong>${escapeHTML((adopted()?current.label:spare.label)||'备用出口')}</strong><p>${sampleText(standbyView,(adopted()?current.ip:spare.ip)||'')} · ${adopted()?'保持接管，不自动回切':'故障确认后由服务端接管'}</p></div><span class="badge ${adopted()?'':'neutral'}">${adopted()?'接管中':'待命'}</span></div>`:`<div class="empty-state"><h3>没有可用的专属备用</h3><p>此处展示备用不足时的演示状态。</p><button class="button secondary compact" data-action="spare">了解备用</button></div>`}<div class="section-heading"><h2>本次会话的接管记录${sourceBadge(eventsView)}</h2><span>原型示例</span></div>${events.length?events.map(event=>`<div class="handover-record" data-event-id="${escapeHTML(event.event_id)}"><div class="record-heading"><strong>专属备用出口接管</strong><time datetime="${escapeHTML(event.occurred_at)}">${escapeHTML(when(event.occurred_at))}</time></div><p>原因：本次模拟连接确认主出口故障，专属备用接管（绑定版本 ${escapeHTML(event.binding_revision)}）。</p><div class="record-addresses"><code>${sampleText(eventsView,event.old_exit_ip||event.old_exit_id)}</code>${svg('arrow')}<code>${sampleText(eventsView,event.new_exit_ip||event.new_exit_id)}</code></div><p class="record-note">由本次交互生成，非真实服务记录。</p></div>`).join(''):`<div class="empty-state record-empty"><h3>本次会话暂无接管事件</h3><p>发生模拟接管后展示；断开连接不会清除记录。</p></div>`}<details class="path-details resource-disclosure"><summary><span>${svg('refresh')}故障切换规则</span>${svg('chevron')}</summary><ul class="policy-list"><li>${svg('shield')}绑定与备用切换完全由服务端执行。</li><li>${svg('refresh')}确认故障后从当前账号专属备用池接管，保持粘性，不自动回切。</li><li>${svg('lock')}无备用时停止连接并提示处理，不使用其他账号出口。</li></ul></details><details class="path-details resource-disclosure"><summary><span>${svg('network')}查看连接路径</span>${svg('chevron')}</summary>${route()}</details>`}
function switchRow(key,title,copy){return `<div class="setting-row"><div><strong>${title}</strong><p>${copy}</p></div><button class="switch" role="switch" aria-checked="${state.settings[key]}" aria-label="${title}" data-setting="${key}"></button></div>`}
function credentialPoolSection(){
  if(authState.user?.customerType!=='enterprise'||!['owner','admin'].includes(authState.user.memberRole))return '';
  if(accountOverview.phase!=='ready')return `<section class="settings-section credential-pool-section" aria-label="本地订阅池">${groupHeading('本地订阅池','lock','purple')}<p class="credential-empty">同步当前账号权限后，才能显示这台设备上的凭据槽位。</p></section>`;
  const slots=credentialPool.snapshot().slots,statusLabel={active:'可用',cooldown:'冷却中',exhausted:'额度用尽',revoked:'已停用'};
  const providers={anthropic:'Claude',openai:'OpenAI',google:'Google',xai:'xAI'};
  const rows=slots.length?slots.map(slot=>`<li class="credential-slot-row"><span class="credential-slot-mark" aria-hidden="true">${escapeHTML(initialOf(slot.label))}</span><div><strong>${escapeHTML(slot.label)}</strong><small>${escapeHTML(providers[slot.provider]||slot.provider)} · 当前企业账号 · 仅本机</small></div><div class="credential-slot-actions"><span class="badge ${slot.status==='active'?'neutral':slot.status==='cooldown'?'warning':'danger'}">${statusLabel[slot.status]}</span>${slot.status!=='revoked'?`<button class="text-button" data-action="credential-pool-revoke" data-slot-id="${escapeHTML(slot.id)}" aria-label="停用 ${escapeHTML(slot.label)}">停用</button>`:''}</div></li>`).join(''):'<li class="credential-empty">当前账号在这台设备上没有凭据槽位。安全添加需要原生客户端；网页不接收密钥。</li>';
  return `<section class="settings-section credential-pool-section" aria-label="本地订阅池">${groupHeading('本地订阅池','lock','purple')}<p class="credential-pool-note">只显示当前账号在本机的订阅槽位。原始凭据不上传，接力不改变服务端绑定的出口。</p><ul class="credential-slot-list">${rows}</ul><div class="application-links"><button class="button muted" disabled>安全添加待原生客户端</button><button class="button secondary" data-action="credential-pool-refresh">刷新本地状态</button></div><p class="settings-save-note">${credentialPoolAvailable?'此浏览器只保存槽位元数据；停用槽位会停止调度，不删除系统安全存储中的凭据。':'浏览器存储不可用，本机槽位状态无法持久保存。'}</p></section>`;
}
function overviewSection(){
  if(!authState.user)return '';
  const summary=accountOverview.data;
  const status={known:'已同步',unknown:'未提供',stale:'已到期',unavailable:'暂不可用'};
  let body='<p class="overview-empty">正在准备读取账号资源…</p>';
  if(data.CLIENT_API_READY!==true)body='<p class="overview-empty">运营端状态投影尚未归位，当前不读取演示资源。</p>';
  else if(accountOverview.phase==='loading')body='<p class="overview-empty" aria-busy="true">正在读取账号资源…</p>';
  else if(accountOverview.phase==='error')body=`<p class="auth-error" role="alert">${escapeHTML(accountOverview.error||'暂时无法读取账号资源。')}</p>`;
  else if(summary){const ent=accountOverview.entitlement?.entitlement;const traffic=ent?formatTraffic(ent.effectiveTrafficQuotaBytes):'待接入';const reset=ent?.trafficResetPeriod==='monthly'?'每月重置':ent?'待配置':'待接入';body=`<dl class="overview-grid"><div><dt>订阅额度 · ${status[summary.subscription.status]}</dt><dd>${summary.subscription.primaryIpQuota??'未提供'} 主出口 · ${summary.subscription.standbyIpQuota??'未提供'} 备用</dd></div><div><dt>流量权益</dt><dd>${traffic}<small>${reset} · 用量计量${accountOverview.entitlementError?'待接入':'待生产端接入'}</small></dd></div><div><dt>到期时间</dt><dd>${ent?.expiresAt?new Date(ent.expiresAt).toLocaleDateString('zh-CN'):summary.subscription.expiresAt?new Date(summary.subscription.expiresAt).toLocaleDateString('zh-CN'):'未提供'}</dd></div><div><dt>设备状态</dt><dd>${summary.devices.status==='unknown'?'待设备服务接入':`${summary.devices.authorized??'未提供'} 台已授权 · ${summary.devices.online??'未提供'} 台在线`}</dd></div><div><dt>出口分配 · ${status[summary.egress.status]}</dt><dd>${summary.egress.primaryAllocated??'未提供'} 主出口 · ${summary.egress.standbyAllocated??'未提供'} 备用<small>服务端控制绑定；不代表当前已连接</small></dd></div><div><dt>已分配身份</dt><dd>${summary.identitiesTotal} 个${summary.customer.role==='member'?'本人':'授权'}身份</dd></div><div><dt>数据时间</dt><dd>${new Date(summary.generatedAt).toLocaleString('zh-CN',{hour12:false})}</dd></div></dl>`;}
  return `<section class="settings-section assistant-overview-section" aria-label="账号资源">${groupHeading('账号资源','network','blue')}${body}<div class="application-links"><button class="button secondary" data-action="refresh-overview" ${accountOverview.phase==='loading'?'disabled':''}>${accountOverview.phase==='loading'?'读取中…':'刷新资源'} ${svg('refresh')}</button></div><p class="overview-note">按当前账号权限显示。出口绑定与备用切换由服务端管理。</p></section>`;
}
async function loadOverview(){
  if(!authState.user||(!isMainSite&&!globalThis.NoyaDesktop)||!clientApiAvailable()||authState.logoutBusy||accountOverview.phase==='loading')return;
  const boundary=accountBoundary,request=++overviewRequest,user=authState.user;
  Object.assign(accountOverview,{phase:'loading',data:null,error:'',entitlement:null,entitlementError:'',identityDirectory:null,identityDirectoryError:'',identityDirectoryLoading:false});render();
  try{
    const [summaryResult,entitlementResult,identityResult]=await Promise.allSettled([data.overview(),data.entitlements(),data.identities()]);
    if(summaryResult.status==='rejected')throw summaryResult.reason;
    const summary=summaryResult.value;
    if(boundary!==accountBoundary||request!==overviewRequest||authState.user?.id!==user.id)return;
    if(summary.customer.type!==user.customerType||summary.customer.role!==user.memberRole||(user.memberRole==='member'&&summary.identities.some(item=>item.assignedUserId!==user.id)))throw new data.ApiError(200,'INVALID_RESPONSE','账号资源权限与当前会话不一致，请刷新账号。');
    accountOverview.data=summary;accountOverview.phase='ready';
    if(entitlementResult.status==='fulfilled'){
      const entitlement=entitlementResult.value;
      if(entitlement.customer.id!==summary.customer.id||entitlement.customer.type!==user.customerType||entitlement.customer.memberRole!==user.memberRole)throw new data.ApiError(200,'INVALID_RESPONSE','流量权益权限与当前会话不一致，请刷新账号。');
      accountOverview.entitlement=entitlement;
    }else accountOverview.entitlementError=entitlementResult.reason instanceof data.ApiError?entitlementResult.reason.message:'流量权益暂未接入。';
    if(identityResult.status==='fulfilled')accountOverview.identityDirectory=identityResult.value;
    else accountOverview.identityDirectoryError=identityResult.reason instanceof data.ApiError?identityResult.reason.message:'身份目录暂未接入。';
    if(user.customerType==='enterprise'&&['owner','admin'].includes(user.memberRole)){
      credentialPool.bindScope({customerId:summary.customer.id,userId:user.id,customerType:'enterprise',memberRole:user.memberRole});
      credentialPoolAvailable=credentialPool.load().ok;
    }else{credentialPool.bindScope(null);credentialPoolAvailable=false;}
  }catch(error){
    if(boundary!==accountBoundary||request!==overviewRequest||authState.user?.id!==user.id)return;
    Object.assign(accountOverview,{phase:'error',data:null,error:error instanceof data.ApiError?error.message:'账号资源暂时不可用，请稍后重试。',entitlement:null,entitlementError:'',identityDirectory:null,identityDirectoryError:'',identityDirectoryLoading:false});
    credentialPool.bindScope(null);credentialPoolAvailable=false;
  }
  render();
}
function settingsInventory(){const row=(title,copy,value)=>'<div class="setting-row"><div><strong>'+title+'</strong><p>'+copy+'</p></div><span class="setting-value">'+value+'</span></div>';const summary=accountOverview.data;const ent=accountOverview.entitlement?.entitlement;const traffic=ent?formatTraffic(ent.effectiveTrafficQuotaBytes):'待接入';const quota=summary?`${traffic} · ${summary.subscription.primaryIpQuota??'未提供'} 主出口 · ${summary.subscription.standbyIpQuota??'未提供'} 备用`:'点击上方刷新';const devices=summary?.devices?.status==='unknown'?'待原生客户端接入':summary?.devices?`${summary.devices.authorized??'未提供'} 台已授权`:'待接入设备服务';const egress=summary?.egress?.binding==='server'?'服务端管理':'待接入';return '<section class="settings-section">'+groupHeading('套餐与设备','user','blue')+row('流量与到期','额度摘要、周期用量、重置日期与套餐到期时间',quota)+row('设备与客户端','已授权设备、在线客户端、套餐上限与撤销授权',devices)+'</section><section class="settings-section">'+groupHeading('网络与保护','shield','purple')+row('入口与重连','自动优选入口；网络恢复后重连，保持已绑定出口','已内置')+'<div class="setting-row"><div><strong>出口与备用策略</strong><p>独立 IP、备用池、故障切换与粘性由服务端统一控制</p></div><span class="setting-value">'+egress+'</span></div></section><section class="settings-section">'+groupHeading('应用与维护','grid','green')+row('应用接入','常用应用工作台与独立配置目录','连接页管理')+row('客户端版本','离线便携版本 · MIT 开源许可','v0.2.0')+row('日志与隐私','当前可导出本机脱敏诊断；不会上传账号凭据','本机诊断可用')+'</section>'}
function settingsPage(){
  if(!authState.user)return heading('我的','账号与设备设置。')+openSourceNoticeBanner()+accountPanel();
  const accelChecked=workbench.useManagedAcceleration!==false;
  const envHint=workbench.envMode==='own_network'
    ?'当前使用本机自有网络环境，不占用基础代理，仅保留本地应用多开与配置目录隔离。'
    :'默认使用基础代理模式（127.0.0.1:17899）；开源学习交流版已剥离强代理 TUN 与环境指纹隔离，完整版请前往官网下载。';
  const envRowHtml=platform().mobile?'':`<div class="setting-row env-mode-setting-row"><div><strong>网络接入方式</strong><p>${escapeHTML(envHint)}</p></div><div class="theme-options" role="group" aria-label="选择网络接入方式"><button type="button" class="theme-option ${workbench.envMode==='safe_tunnel'?'selected':''}" data-env-mode="safe_tunnel" aria-pressed="${workbench.envMode==='safe_tunnel'}" ${workbench.switchingMode?'disabled':''}>${svg('shield')}基础代理 (17899)</button><button type="button" class="theme-option ${workbench.envMode==='own_network'?'selected':''}" data-env-mode="own_network" aria-pressed="${workbench.envMode==='own_network'}" ${workbench.switchingMode?'disabled':''}>${svg('globe')}自有网络</button></div></div>`;
  return heading('我的','定途账号、网络接入方式与本机偏好设置。')+openSourceNoticeBanner()+accountPanel()+renderTelemetrySyncBar()+`<section class="settings-section" aria-label="连接与通道">${groupHeading('通道与出口','shield','purple')}${envRowHtml}<div class="setting-row"><div><strong>优先使用后台托管加速通道</strong><p>启用后，启动支持的 AI 工具时自动选择更稳定的连接路径，无需手动配置。</p></div><button class="switch" role="switch" aria-checked="${accelChecked}" aria-label="优先使用后台托管加速通道" data-toggle-acceleration></button></div><button class="setting-help-row" data-page="egress"><span><strong>出口与备用节点详情</strong><small>查看当前分配的专属出口、身份绑定与备用池状态</small></span>${svg('arrow')}</button></section>`+overviewSection()+credentialPoolSection()+settingsInventory()+`<section class="settings-section">${groupHeading('连接偏好','network','blue')}${platform().mobile?'':switchRow('startup','登录系统后启动','偏好可保存，原生客户端接入前不执行开机启动。')}${switchRow('autoConnect',platform().mobile?'打开助手后自动连接':'启动后自动连接',platform().mobile?'偏好可保存；原生权限与后台能力待接入。':'偏好可保存；当前不会自动建立真实连接。')}${switchRow('notify','连接异常时通知','暂停时仍记本机事件，但不新增未读提醒。')}</section><section class="settings-section">${groupHeading('外观','sun','purple')}<div class="setting-row"><div><strong>界面主题</strong><p>手机默认深色，Windows / Mac 默认浅色。</p></div><div class="theme-options" aria-label="界面主题"><button class="theme-option ${state.theme==='light'?'selected':''}" data-theme-choice="light" aria-pressed="${state.theme==='light'}">${svg('sun')}浅色</button><button class="theme-option ${state.theme==='dark'?'selected':''}" data-theme-choice="dark" aria-pressed="${state.theme==='dark'}">${svg('moon')}深色</button></div></div></section><section class="settings-section">${groupHeading('帮助与说明','help','green')}<button class="setting-help-row" data-page="tickets"><span><strong>工单支持</strong><small>提交故障工单（附带本机脱敏诊断）与查看运营回复</small></span>${svg('arrow')}</button><button class="setting-help-row" data-page="notifications"><span><strong>本机通知</strong><small>${localEvents.unreadCount()} 条未读，仅本页面的本地事件</small></span>${svg('arrow')}</button><button class="setting-help-row" data-page="help"><span><strong>帮助与故障排查</strong><small>开始使用、官方入口与常见问题</small></span>${svg('arrow')}</button><button class="setting-help-row" data-page="diagnostics"><span><strong>本机诊断</strong><small>脱敏 JSON 下载与复制，不上传</small></span>${svg('arrow')}</button><button class="setting-help-row" data-action="permission-help"><span><strong>系统网络权限</strong><small>${platform().label} 授权流程说明</small></span>${svg('arrow')}</button><button class="setting-help-row" data-action="replay-launch"><span><strong>重播开屏</strong><small>查看品牌字稿与开屏动画</small></span>${svg('arrow')}</button><div class="setting-row"><div><strong>关于定途客户端</strong><p>${globalThis.NoyaDesktop?'定途 AI 应用工作台 · MIT 开源学习交流版（本机入口 127.0.0.1:17899 · 完整版请前往官网下载）':'UI 交互原型，无真实网络客户端功能。'}</p></div><span class="setting-value">${globalThis.NoyaDesktop?'v0.2.0-oss':'UI 原型'}</span></div></section><button class="text-button restore-preferences" data-action="reset-preferences">恢复本助手默认偏好</button><p class="settings-save-note" role="status">${storageAvailable?'偏好保存在此浏览器，刷新后保留。不会执行系统开机启动或自动连接。':'浏览器存储不可用，偏好仅临时生效。'}</p>`;
}

const TICKET_STATUS_META={
  submitted:{label:'已提交',tone:'tone-blue'},
  acknowledged:{label:'已受理',tone:'tone-blue'},
  investigating:{label:'排查中',tone:'tone-purple'},
  waiting_user:{label:'待您补充',tone:'tone-amber'},
  awaiting_ops:{label:'待运营处理',tone:'tone-blue'},
  awaiting_production:{label:'待生产处理',tone:'tone-purple'},
  resolved:{label:'已解决',tone:'tone-green'},
  closed:{label:'已关闭',tone:'tone-muted'},
  reopened:{label:'已重开',tone:'tone-amber'},
};
const TICKET_CATEGORY_LABELS={
  connection:'隧道连接与掉线',
  exit_ip:'专属出口 IP 与地域异常',
  workbench_app:'工作台应用接入 / 切号 / 配额',
  account_billing:'账号与套餐权益',
  other:'其他建议与反馈',
};

async function syncTelemetryNow(){
  if(!globalThis.NoyaDesktop?.telemetry?.invoke){notify('请在桌面客户端中使用云端遥测同步。');return;}
  if(!authState.user){go('settings');return;}
  workbench.telemetrySyncing=true;render();
  try{
    const res=await globalThis.NoyaDesktop.telemetry.invoke('telemetry.sync');
    if(!res?.ok)throw new Error(res?.error?.message||'云端同步未完成。');
    workbench.telemetryStatus=res.value;
    notify(res.value.lastSyncStatus==='synced'?`云端同步完成：${res.value.lastAcceptedBuckets||0} 个用量桶、${res.value.lastAcceptedEvents||0} 条事件。`:(res.value.lastError||'同步状态已更新。'));
  }catch(err){
    notify(err?.message||'云端同步失败。');
  }finally{
    workbench.telemetrySyncing=false;render();
  }
}

async function loadTickets({silent=false}={}){
  if(!globalThis.NoyaDesktop?.tickets?.invoke||!authState.user)return;
  if(!silent){workbench.ticketsLoading=true;render();}
  try{
    const res=await globalThis.NoyaDesktop.tickets.invoke('tickets.list',{status:state.ticketStatusFilter||'all',limit:50});
    if(res?.ok&&Array.isArray(res.value?.tickets)){
      workbench.tickets=res.value.tickets;
      if(state.selectedTicketId){
        const stillThere=workbench.tickets.some(t=>t.ticketId===state.selectedTicketId);
        if(stillThere)void loadTicketDetail(state.selectedTicketId,{silent:true});
        else{state.selectedTicketId=null;workbench.activeTicketDetail=null;}
      }else if(workbench.tickets.length){
        state.selectedTicketId=workbench.tickets[0].ticketId;
        void loadTicketDetail(state.selectedTicketId,{silent:true});
      }
    }else if(res?.error&&!silent){
      notify(res.error.message||'读取工单列表失败。');
    }
  }catch{}finally{
    workbench.ticketsLoading=false;render();
  }
}

async function loadTicketDetail(ticketId,{silent=false}={}){
  if(!ticketId||!globalThis.NoyaDesktop?.tickets?.invoke||!authState.user)return;
  state.selectedTicketId=ticketId;
  if(!silent)render();
  try{
    const res=await globalThis.NoyaDesktop.tickets.invoke('tickets.detail',{ticketId});
    if(res?.ok&&res.value?.ticket){
      workbench.activeTicketDetail=res.value;
      workbench.tickets=(workbench.tickets||[]).map(t=>t.ticketId===ticketId?{...t,...res.value.ticket}:t);
    }else if(res?.error&&!silent){
      notify(res.error.message||'读取工单详情失败。');
    }
  }catch{}finally{
    render();
  }
}

function ticketsPage(){
  if(!globalThis.NoyaDesktop){
    return heading('工单支持','桌面端与运营/生产闭环工单支持。')+`<div class="cockpit-empty-state">${svg('help')}<h3>请在定途桌面客户端使用工单支持</h3><p>桌面端支持一键采集脱敏诊断快照并直连运营后台实时处理；网页用户亦可前往主站用户中心工单页提交。</p></div>`;
  }
  if(!authState.user){
    return heading('工单支持','请先授权登录后查看或提交支持工单。')+accountPanel();
  }
  const allStatuses=[['all','全部'],...Object.entries(TICKET_STATUS_META).map(([k,v])=>[k,v.label])];
  const list=workbench.tickets||[];
  const detail=workbench.activeTicketDetail?.ticket?.ticketId===state.selectedTicketId?workbench.activeTicketDetail:null;
  const detTicket=detail?.ticket||null;
  const detMeta=detTicket?(TICKET_STATUS_META[detTicket.status]||{label:detTicket.status,tone:'tone-muted'}):null;
  const canCustomerAction=detTicket&&detTicket.status!=='closed';
  const canReopen=detTicket&&(detTicket.status==='resolved'||detTicket.status==='closed');

  return `<div class="tickets-shell">
    <div class="tickets-toolbar">
      <div>
        <h1 style="margin:0;font-size:18px;">工单支持</h1>
        <p style="margin:2px 0 0;font-size:12.5px;color:var(--muted);">三端闭环工单支持（支持一键附带脱敏诊断与邮件通知）</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="button secondary compact${workbench.ticketsLoading?' is-spinning':''}" data-action="refresh-tickets">${svg('refresh')}刷新列表</button>
        <button type="button" class="button gradient-cta compact" data-action="open-new-ticket-dialog">+ 新建工单</button>
      </div>
    </div>
    <div class="cockpit-group-pills" role="group" aria-label="工单状态筛选">
      ${allStatuses.map(([k,lbl])=>`<button type="button" class="group-pill${(state.ticketStatusFilter||'all')===k?' active':''}" data-ticket-status-filter="${k}">${lbl}</button>`).join('')}
    </div>
    <div class="tickets-layout">
      <section class="ticket-list-card" aria-label="我的工单列表">
        ${workbench.ticketsLoading&&!list.length?'<p style="margin:8px 0;color:var(--muted);font-size:13px;">正在同步工单…</p>'
          :list.length?list.map(t=>{
            const m=TICKET_STATUS_META[t.status]||{label:t.status,tone:'tone-muted'};
            const sel=state.selectedTicketId===t.ticketId;
            return `<button type="button" class="ticket-row${sel?' selected':''}" data-action="select-ticket" data-ticket-id="${escapeHTML(t.ticketId)}">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <strong style="font-size:13.5px;display:inline-flex;align-items:center;gap:6px;">${t.unreadByCustomer?'<span class="ticket-unread-dot" title="有新回复"></span>':''}${escapeHTML(t.subject)}</strong>
                <span class="ticket-status-badge ${m.tone}">${escapeHTML(m.label)}</span>
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--muted);">
                <span>${escapeHTML(TICKET_CATEGORY_LABELS[t.category]||t.category)}${t.incidentId?` · Incident ${escapeHTML(t.incidentId)}`:''}</span>
                <span>${escapeHTML(formatShortTime(t.lastMessageAt||t.updatedAt)||'')}</span>
              </div>
            </button>`;
          }).join('')
          :`<div class="cockpit-empty-state" style="padding:26px 14px;">${svg('help')}<h3>暂无匹配工单</h3><p>点击右上角「+ 新建工单」向定途技术团队反馈连接或应用问题。</p></div>`}
      </section>
      <section class="ticket-detail-card" aria-label="工单对话详情">
        ${detTicket?`
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;border-bottom:1px solid var(--line);padding-bottom:10px;flex-wrap:wrap;">
            <div>
              <h2 style="margin:0;font-size:15px;">${escapeHTML(detTicket.subject)}</h2>
              <div style="font-size:12px;color:var(--muted);margin-top:4px;">编号：<code>${escapeHTML(detTicket.ticketId)}</code> · 分类：${escapeHTML(TICKET_CATEGORY_LABELS[detTicket.category]||detTicket.category)}${detTicket.userReportId?` · 诊断报告：<code>${escapeHTML(detTicket.userReportId)}</code>`:''}</div>
            </div>
            <span class="ticket-status-badge ${detMeta.tone}">${escapeHTML(detMeta.label)}</span>
          </div>
          ${detail.diagnosticSnapshot?`<details style="background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:12px;"><summary style="cursor:pointer;font-weight:600;">已附带脱敏诊断快照</summary><div style="margin-top:6px;color:var(--muted);">版本：<code>${escapeHTML(detail.diagnosticSnapshot.appVersion||'')}</code> · 系统：<code>${escapeHTML(detail.diagnosticSnapshot.platform||'')}</code> · 环境：<code>${escapeHTML(detail.diagnosticSnapshot.environmentMode||'')}</code> · 代理：<code>${escapeHTML(detail.diagnosticSnapshot.proxyState||'')}</code>${detail.diagnosticSnapshot.recentErrorCodes?.length?` · 错误码：<code>${escapeHTML(detail.diagnosticSnapshot.recentErrorCodes.join(', '))}</code>`:''}${detail.diagnosticSnapshot.recentRequestIds?.length?` · 请求号：<code>${escapeHTML(detail.diagnosticSnapshot.recentRequestIds.join(', '))}</code>`:''}</div></details>`:''}
          <div class="ticket-thread">
            ${(detail.messages||[]).map(msg=>`<div class="ticket-msg-bubble ${escapeHTML(msg.authorRole)}">
              <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);"><strong>${msg.authorRole==='ops'?'定途运营支持':msg.authorRole==='system'?'系统通知':(escapeHTML(msg.authorName||'我'))}</strong><span>${escapeHTML(formatShortTime(msg.createdAt)||'')}</span></div>
              <div style="white-space:pre-wrap;line-height:1.5;">${escapeHTML(msg.body)}</div>
            </div>`).join('')}
          </div>
          <form id="ticket-reply-form" class="modal-form-stack" style="border-top:1px solid var(--line);padding-top:10px;">
            <input type="hidden" name="ticketId" value="${escapeHTML(detTicket.ticketId)}">
            ${canCustomerAction?`<textarea name="body" rows="3" maxlength="8000" placeholder="补充更多现象或回复运营团队…" required></textarea>`:''}
            <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
              ${canReopen?`<button type="button" class="button secondary compact" data-action="ticket-reopen" data-ticket-id="${escapeHTML(detTicket.ticketId)}">重新打开工单</button>`:''}
              ${canCustomerAction?`<button type="button" class="button secondary compact" data-action="ticket-close" data-ticket-id="${escapeHTML(detTicket.ticketId)}">确认解决并关闭</button><button type="submit" class="button primary compact">发送回复</button>`:''}
            </div>
          </form>
        `:`<div class="cockpit-empty-state" style="padding:40px 16px;">${svg('info')}<h3>请选择左侧工单</h3><p>点击左侧工单查看运营排查进度、关联事件状态及回复对话。</p></div>`}
      </section>
    </div>
  </div>`;
}

function liveRemainingSec(period=30){
  const p=Math.max(15,Number(period)||30);
  return p-(Math.floor(Date.now()/1000)%p);
}

function totpPage(){
  const list=state.totpTab==='history'?(workbench.totpHistory||[]):(workbench.totpSaved||[]);
  const kw=(state.totpSearch||'').trim().toLowerCase();
  const filtered=list.filter(item=>!kw||`${item.name||''} ${item.issuer||''} ${item.maskedSecret||''}`.toLowerCase().includes(kw));
  const live=workbench.totpLiveResult;
  const liveRemain=live?liveRemainingSec(live.period):30;
  const livePct=live?Math.round((liveRemain/Math.max(15,live.period||30))*100):0;
  const selSet=new Set((state.totpSelectedIds||[]).filter(id=>filtered.some(e=>e.id===id)));
  const allChecked=filtered.length>0&&filtered.every(e=>selSet.has(e.id));

  return `<section class="totp-top-card" aria-label="2FA 动态码计算">
    <div class="totp-top-header">
      <h1>${svg('key')}2FA</h1>
      <span class="badge neutral">本地 DPAPI 加密存储 · RFC 6238</span>
    </div>
    <div class="totp-query-grid">
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <strong style="font-size:13px;">秘钥</strong>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <input id="totp-name-input" data-focus-key="totp-name" type="text" value="${escapeHTML(state.totpNameDraft||'')}" placeholder="可选备注名称" maxlength="80" style="min-height:32px;padding:0 10px;border:1px solid var(--line-strong);border-radius:9px;background:var(--canvas-solid);color:var(--ink);font-size:12px;width:150px;">
            <button type="button" class="button secondary compact" data-action="totp-save">${svg('plus')}保存到列表</button>
          </div>
        </div>
        <div class="totp-input-row">
          <input id="totp-secret-input" data-focus-key="totp-secret" type="text" value="${escapeHTML(state.totpInputDraft||'')}" placeholder="otpauth://totp/... 或 Base32 Secret" autocomplete="off">
          <button type="button" class="button gradient-cta" data-action="totp-query">${svg('search')}查询</button>
        </div>
      </div>
      <div class="totp-code-display" aria-live="polite">
        <span style="font-size:12px;color:var(--muted);">${live?escapeHTML(live.name||'动态码'):'动态码'}</span>
        ${live
          ?`<button type="button" id="totp-live-code" class="totp-code-digits" style="border:0;background:transparent;padding:0;" data-action="copy-totp-code" data-code="${escapeHTML(live.code)}" title="点击复制动态码">${escapeHTML(live.code)}</button>
            <div class="totp-countdown-track"><div class="totp-countdown-fill" data-totp-fill data-period="${live.period||30}" style="width:${livePct}%"></div></div>
            <small id="totp-live-remaining" class="totp-countdown-pill" data-totp-sec data-period="${live.period||30}">${liveRemain}s</small>`
          :`<strong style="font-size:16px;color:var(--muted);">暂无查询数据</strong><small style="font-size:11.5px;color:var(--subtle);">输入秘钥后点击查询或保存</small>`}
      </div>
    </div>
  </section>
  <section class="totp-list-card" aria-label="已保存 2FA 列表">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
      <div class="segmented-tabs" style="margin-top:0;" role="tablist" aria-label="2FA 分类">
        <button type="button" class="segmented-tab" role="tab" data-totp-tab="saved" aria-selected="${state.totpTab==='saved'}">★ 已保存 ${(workbench.totpSaved||[]).length}</button>
        <button type="button" class="segmented-tab" role="tab" data-totp-tab="history" aria-selected="${state.totpTab==='history'}">${svg('clock')}近期查询 ${(workbench.totpHistory||[]).length}</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <input type="search" class="account-search totp-search" data-focus-key="totp-search" value="${escapeHTML(state.totpSearch||'')}" placeholder="搜索账号名或类型...">
        <button type="button" class="button secondary compact" data-action="totp-qr-upload">${svg('qr')}上传二维码图片</button>
        <button type="button" class="button secondary compact" data-action="totp-qr-export">${svg('qr')}导出迁移二维码</button>
        <button type="button" class="button secondary compact" data-action="totp-export">${svg('download')}导出备份</button>
        <button type="button" class="button secondary compact" data-action="totp-import">${svg('upload')}导入备份</button>
        <button type="button" class="button secondary compact" data-action="totp-batch-delete" ${selSet.size?'':'disabled'}>${svg('trash')}批量删除${selSet.size?` (${selSet.size})`:''}</button>
      </div>
    </div>
    ${filtered.length
      ?`<div class="account-table-wrap"><table class="account-table"><thead><tr><th style="width:34px;"><input type="checkbox" data-action="totp-select-all" ${allChecked?'checked':''} aria-label="全选 2FA 条目"></th><th>账号名</th><th>秘钥</th><th>动态码 <span class="totp-countdown-pill" data-totp-sec data-period="30">${liveRemainingSec(30)}s</span></th><th>时间</th><th>操作</th></tr></thead><tbody>${filtered.map(item=>{
        const sec=liveRemainingSec(item.period||30);
        return `<tr><td><input type="checkbox" data-totp-select="${escapeHTML(item.id)}" ${selSet.has(item.id)?'checked':''} aria-label="选择 ${escapeHTML(item.name)}"></td><td><strong>${escapeHTML(item.name||'未命名')}</strong>${item.issuer?`<div style="font-size:11px;color:var(--muted);">${escapeHTML(item.issuer)}</div>`:''}</td><td><code>${escapeHTML(item.maskedSecret||'••••••••')}</code></td><td><button type="button" class="text-button" data-action="copy-totp-code" data-code="${escapeHTML(item.code)}" style="font-family:ui-monospace,Consolas,monospace;font-size:15px;font-weight:700;padding:0;min-height:24px;">${escapeHTML(item.code)}</button> <span class="totp-countdown-pill" data-totp-sec data-period="${item.period||30}">${sec}s</span></td><td style="font-size:11.5px;color:var(--muted);">${escapeHTML(formatShortTime(item.lastUsedAt||item.createdAt)||'—')}</td><td><div style="display:flex;gap:8px;"><button type="button" class="text-button" data-action="copy-totp-code" data-code="${escapeHTML(item.code)}" style="min-height:28px;">复制</button><button type="button" class="text-button" data-action="delete-totp-row" data-totp-id="${escapeHTML(item.id)}" style="min-height:28px;color:var(--danger);">删除</button></div></td></tr>`;
      }).join('')}</tbody></table></div>`
      :`<div class="cockpit-empty-state" style="padding:36px 20px;">${svg('shield')}<h3>暂无保存的凭证数据</h3><p>在上方输入 2FA Secret 或 otpauth:// 链接即可本地离线生成 6 位动态验证码</p></div>`}
  </section>`;
}

function renderPinnedRail(){
  const container=document.getElementById('pinned-app-rail');
  if(!container)return;
  const pinned=resolvedPinnedApps();
  if(!pinned.length){container.innerHTML='<p class="pinned-rail-empty">暂无常用接入，去应用广场添加</p>';return;}
  container.innerHTML=pinned.map(app=>{
    const active=state.page==='connection'&&!state.libraryExpanded&&state.activeWorkspaceApp===app.id;
    const acct=activeAccountForApp(app.id);
    const running=isAppRunning(app.id);
    const firstQ=acct?.quotas?.find(q=>Number.isFinite(q.remainingPct));
    let rightMeta='';
    if(running)rightMeta='<span class="dot" title="运行中"></span>';
    if(firstQ)rightMeta+=`<span class="pinned-rail-quota ${escapeHTML(firstQ.tone||'high')}">${firstQ.remainingPct}%</span>`;
    else if(!running&&acct)rightMeta='<span class="pinned-rail-meta">已接入</span>';
    return `<button type="button" class="pinned-rail-item ${active?'active':''}" data-open-workspace="${escapeHTML(app.id)}" role="listitem">${dimensionalIcon(app,'mini')}<span class="pinned-rail-name">${escapeHTML(app.short)}</span>${rightMeta}</button>`;
  }).join('');
}

let lastTotpEpoch=Math.floor(Date.now()/30000);
function ensureTotpTimer(){
  if(state.page!=='totp'){
    if(totpTickTimer){clearInterval(totpTickTimer);totpTickTimer=null;}
    return;
  }
  if(totpTickTimer)return;
  lastTotpEpoch=Math.floor(Date.now()/30000);
  totpTickTimer=setInterval(()=>{
    if(state.page!=='totp'){clearInterval(totpTickTimer);totpTickTimer=null;return;}
    document.querySelectorAll('[data-totp-sec]').forEach(el=>{
      const p=Number(el.dataset.period)||30;
      el.textContent=`${liveRemainingSec(p)}s`;
    });
    document.querySelectorAll('[data-totp-fill]').forEach(el=>{
      const p=Number(el.dataset.period)||30;
      el.style.width=`${Math.round((liveRemainingSec(p)/p)*100)}%`;
    });
    const epoch=Math.floor(Date.now()/30000);
    if(epoch!==lastTotpEpoch){
      lastTotpEpoch=epoch;
      void refreshTotpData();
    }
  },1000);
}

function render(){const main=document.getElementById('main-content');const focused=document.activeElement;let focusTarget=null;if(focused&&main.contains(focused)){for(const attr of ['data-focus-key','data-action','data-select-app','data-overview-select-app','data-setting','data-theme-choice','data-page','data-category','data-open-workspace','data-workspace-tab','data-account-filter','data-account-view','data-toggle-pin','data-totp-tab']){const value=focused.getAttribute(attr);if(value!==null){focusTarget={attr,value,start:focused.selectionStart,end:focused.selectionEnd};break}}}main.classList.toggle('connection-view',state.page==='connection');const pages={connection:connectionPage,egress:egressPage,settings:settingsPage,notifications:notificationsPage,help:helpPage,diagnostics:diagnosticsPage,totp:totpPage,tickets:ticketsPage};document.getElementById('main-content').innerHTML=pages[state.page]();const activeAppName=state.activeWorkspaceApp?availableApps().find(a=>a.id===state.activeWorkspaceApp)?.name:'';const titles={connection:state.libraryExpanded?'应用广场':(activeAppName||'接入概览'),egress:'出口与备用',settings:'我的',notifications:'本机通知',help:'帮助与故障排查',diagnostics:'本机诊断',totp:'2FA 管理',tickets:'工单支持'};document.getElementById('breadcrumb-current').textContent=titles[state.page];document.querySelectorAll('.nav-item').forEach(el=>{const pageTarget=['help','diagnostics'].includes(state.page)?'settings':state.page;const libraryActive=state.page==='connection'&&state.libraryExpanded;const active=el.dataset.action==='toggle-app-library'?libraryActive:(el.dataset.page===pageTarget&&!libraryActive);el.classList.toggle('active',active);el.setAttribute('aria-current',active?'page':'false');if(el.dataset.action==='toggle-app-library')el.setAttribute('aria-pressed',String(libraryActive));el.classList.toggle('library-open',el.dataset.action==='toggle-app-library'&&libraryActive)});renderPinnedRail();ensureTotpTimer();if(document.getElementById('assistant-auth-form'))setAuthMode(authFormMode);document.getElementById('workspace-name').textContent=accountName();document.getElementById('workspace-plan').textContent=accountCaption();document.getElementById('sidebar-account-name').textContent=accountName();document.getElementById('account-caption').textContent=accountCaption();document.querySelectorAll('[data-account-initial]').forEach(el=>el.textContent=accountInitial());document.getElementById('platform-label').textContent=platform().label+' · '+(globalThis.NoyaDesktop?'桌面客户端':isMainSite?'网页账号中心':'设计预览');document.querySelectorAll('[data-app-count]').forEach(el=>el.textContent=String(availableApps().length));document.documentElement.dataset.platform=state.platform;document.documentElement.dataset.page=state.page;const protoBar=document.querySelector('.prototype-bar');if(protoBar)protoBar.hidden=Boolean(globalThis.NoyaDesktop||isMainSite);updateConnectionControl();iconize();if(focusTarget){const replacement=Array.from(main.querySelectorAll('['+focusTarget.attr+']')).find(el=>el.getAttribute(focusTarget.attr)===focusTarget.value&&!el.disabled);if(replacement){replacement.focus({preventScroll:true});if(typeof replacement.setSelectionRange==='function'&&typeof focusTarget.start==='number'){try{replacement.setSelectionRange(focusTarget.start,focusTarget.end)}catch{}}}}}
function go(page,updateHistory=true){if(page==='applications'){page='connection';state.libraryExpanded=true;state.activeWorkspaceApp=null;}else if(page==='connection'){state.libraryExpanded=false;state.activeWorkspaceApp=null;}if(!routes.has(page))page='connection';state.page=page;settingsAuthPromptPending=page==='settings'&&!authState.user;if(page==='notifications')localEvents.markAllRead();if(updateHistory&&window.location.hash!=='#'+page)window.history.pushState({assistantLibrary:page==='connection'&&state.libraryExpanded},'','#'+page);render();if(page==='totp')void refreshTotpData();if(page==='tickets')void loadTickets();if((page==='settings'||page==='egress')&&authState.user&&accountOverview.phase==='idle')loadOverview();maybePromptSettingsAuth();document.getElementById('main-content').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'})}
window.addEventListener('hashchange',()=>go(routeFromHash(),false));
window.addEventListener('popstate',()=>go(routeFromHash(),false));

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function describeProxyExitFailure(runtime, fallback='本机代理未就绪，请查看连接诊断。'){
  const cat=runtime?.lastExitCategory;
  if(cat==='PROXY_DNS_ERROR')return 'sing-box DNS 初始化失败，请检查网络设置后重试。';
  if(cat==='PROXY_ACCESS_DENIED')return '本地代理权限不足，请检查系统权限后重试。';
  if(cat==='PROXY_ROUTE_ERROR')return '本地代理路由配置失败，请检查本机网络后重试。';
  if(cat==='PROXY_PORT_IN_USE')return '本机 17899 端口已被占用，请关闭占用端口的应用后重试。';
  if(cat==='PROXY_CONFIG_INVALID')return '隧道运行配置校验未通过，请重新连接。';
  if(cat==='PROXY_SPAWN_ERROR')return '无法拉起内置 sing-box 内核进程，请检查安全软件拦截或运行环境。';
  if(cat==='PROXY_LISTEN_TIMEOUT'||runtime?.lastExit==='listen_timeout')return 'sing-box 启动超时，未能监听 127.0.0.1:17899，请重试。';
  if(cat==='PROXY_FRONTEND_EXITED')return '本机代理内核意外退出，请重新连接或查看连接诊断。';
  return fallback;
}
async function watchDesktopConnection(attemptId){
  while(attemptId===connectionToken&&state.status==='connected'){
    await wait(2000);
    if(attemptId!==connectionToken||state.status!=='connected')return;
    const check=await globalThis.NoyaDesktop.proxy.invoke('proxy.status').catch(()=>null);
    if(attemptId!==connectionToken||state.status!=='connected')return;
    if(!check?.ok||check.value?.state==='running')continue;
    state.status='failed';
    state.connectedAt=null;
    state.connectionError=describeProxyExitFailure(check.value,'本机连接已停止，请重新连接。');
    workbench.browserInstances=[];
    recordLocalEvent('connection_disconnected',{simulated:false});
    render();
  }
}
async function connect(){
  if(globalThis.NoyaDesktop?.proxy&&!authState.user){go('settings');return}
  state.hasConnectionAction=true;
  if(globalThis.NoyaDesktop?.proxy){
    if(state.status==='connected'||state.status==='connecting'){
      ++connectionToken;
      try { await globalThis.NoyaDesktop.proxy.invoke('proxy.stop'); } catch {}
      state.status='disconnected'; state.connectedAt=null; workbench.browserInstances=[]; render(); notify('定途本机代理已停止。'); return;
    }
    const attemptId=++connectionToken;state.connectionError='';state.status='connecting'; render();
    try {
      const result=await globalThis.NoyaDesktop.proxy.invoke('proxy.start');
      if(attemptId!==connectionToken)return;
      if(!result?.ok) throw Object.assign(new Error(result?.error?.message||'本机代理启动失败。'),{code:result?.error?.code});
      let runtime=result.value;for(let attempt=0;runtime?.state==='starting'&&attempt<180;attempt++){await wait(125);const check=await globalThis.NoyaDesktop.proxy.invoke('proxy.status');if(!check?.ok)throw new Error('无法确认本机代理状态。');if(attemptId!==connectionToken)return;runtime=check.value;}if(runtime?.state!=='running')throw new Error(describeProxyExitFailure(runtime));
      state.status='connected'; state.connectedAt=Date.now(); autoQuotaRefreshAttempted=false; recordLocalEvent('connection_connected',{simulated:false}); void syncDesktopWorkbench().then(()=>render()); render(); notify('定途本机代理已连接（127.0.0.1:17899）。'); void watchDesktopConnection(attemptId);
    } catch(error) { if(attemptId!==connectionToken)return;state.status=error?.code==='AUTH_REQUIRED'?'unavailable':'failed'; state.connectionError=error?.message||'本机代理启动失败。'; recordLocalEvent('connection_failed',{simulated:false}); render(); notify(state.connectionError); }
    return;
  }
  if(isMainSite){state.status='unavailable';state.permissionGranted=false;render();return}render();if(state.status==='expired'){recordLocalEvent('connection_expired');explain('服务方案','正式产品会打开网页账号中心处理续费。当前仅为套餐到期的交互示例。');return}if(state.status==='no-spare'){recordLocalEvent('no_spare');explain('联系支持','正式产品会携带当前连接的诊断编号进入支持流程，不会上传 Agent 登录信息。当前仅展示支持入口。');return}if(state.status==='connecting'||isConnected()){const wasConnected=isConnected();connectionToken++;state.status='disconnected';state.connectedAt=null;recordLocalEvent(wasConnected?'connection_disconnected':'connection_cancelled');render();notify(wasConnected?'模拟连接已断开。':'模拟连接已取消。');return}if(!state.permissionGranted){showPermission();return}const token=++connectionToken;state.status='connecting';recordLocalEvent('connection_started');state.step=0;render();for(let i=0;i<3;i++){state.step=i;render();await wait(750);if(token!==connectionToken)return}if(state.scenario==='failed'){state.status='failed';recordLocalEvent('connection_failed')}else if(state.scenario==='expired'){state.status='expired';recordLocalEvent('connection_expired')}else if(state.scenario==='no-spare'){state.status='no-spare';recordLocalEvent('no_spare')}else if(state.scenario==='failover'&&!spareAvailable()){state.status='no-spare';recordLocalEvent('no_spare')}else{state.status='connected';recordLocalEvent('connection_connected');state.connectedAt=Date.now();if(state.scenario==='failover'&&!adopted()&&data.mock.failover(state.connectedAt))recordLocalEvent('failover')}data.mock.setRuntime(state.status);render()}
function resetConnection(clearIdentity=false){connectionToken++;state.status=state.scenario==='expired'?'expired':'disconnected';state.step=0;if(clearIdentity){data.mock.reset();state.hasConnectionAction=false}data.mock.setScenario(state.scenario);data.mock.setRuntime(state.status);state.connectedAt=null;render()}
let dockAutohideTimer=null,lastDockConnectedState=false;
function updateConnectionControl(){const button=document.getElementById('dock-connect');const dockNav=document.getElementById('navigation');const labels={disconnected:'一键连接',connecting:'取消连接',connected:'断开连接',failed:'重新连接',expired:'服务方案','no-spare':'联系支持',unavailable:globalThis.NoyaDesktop?'请先授权':'请使用桌面端'};const demo=!isMainSite;const blocked=isMainSite&&!globalThis.NoyaDesktop?.proxy;const desktopNeedsAuth=!!globalThis.NoyaDesktop&&!authState.user;const unavailable=blocked||desktopNeedsAuth;const effectiveStatus=unavailable?'unavailable':state.status;button.disabled=blocked;button.setAttribute('aria-label',labels[effectiveStatus]+(demo&&!blocked?'（演示）':''));document.getElementById('dock-connect-source').innerHTML=blocked?'<span class="source-chip">桌面端</span>':desktopNeedsAuth?'':sourceBadge(view('identity'));button.dataset.status=effectiveStatus;document.getElementById('dock-connect-symbol').innerHTML=svg(unavailable||state.status==='expired'?'lock':state.status==='connecting'?'close':state.status==='no-spare'?'help':effectiveStatus==='connected'?'shield-check':'power');document.getElementById('dock-connect-label').textContent=blocked?'请使用桌面端':desktopNeedsAuth?'请先授权':labels[state.status];if(dockNav){const isConn=effectiveStatus==='connected';dockNav.dataset.autohide=isConn?'true':'false';if(isConn&&!lastDockConnectedState){dockNav.dataset.justConnected='true';clearTimeout(dockAutohideTimer);dockAutohideTimer=setTimeout(()=>{delete dockNav.dataset.justConnected;},900);}else if(!isConn){clearTimeout(dockAutohideTimer);dockAutohideTimer=null;delete dockNav.dataset.justConnected;}lastDockConnectedState=isConn;}}
const desktopAdapterIds={
  'claude-code':'claude-code',
  codex:'codex-cli',
  'codex-cli':'codex-cli',
  'codex-desktop':'codex-desktop',
  claude:'claude-desktop',
  'claude-desktop':'claude-desktop',
  antigravity:'antigravity',
  copilot:'copilot',
  windsurf:'windsurf',
  kiro:'kiro',
  cursor:'cursor',
  'grok-cli':'grok-cli',
  'gemini-cli':'gemini-cli',
  metamuse:'muse-desktop',
};
const browserShellAppMap={ metamuse:'metamuse', manus:'manus', chatgpt:'chatgpt', claude:'claude', grok:'grok', 'gemini-web':'gemini' };
const officialPortalBrowserMap={
  metamuse:'metamuse', manus:'manus', claude:'claude', 'claude-code':'claude', 'claude-desktop':'claude',
  chatgpt:'chatgpt', codex:'codex', 'codex-cli':'codex', 'codex-desktop':'codex',
  grok:'grok', 'grok-cli':'grok', 'gemini-web':'gemini', 'gemini-cli':'gemini',
  antigravity:'antigravity', copilot:'copilot', windsurf:'windsurf', kiro:'kiro', cursor:'cursor',
};
const appRelayProtocolMap={
  'claude-code':'anthropic', 'claude-desktop':'anthropic', claude:'anthropic', kiro:'anthropic',
  codex:'openai', 'codex-cli':'openai', 'codex-desktop':'openai', copilot:'openai', windsurf:'openai', cursor:'openai', chatgpt:'openai',
  antigravity:'gemini', 'gemini-cli':'gemini', 'gemini-web':'gemini',
  'grok-cli':'xai', grok:'xai',
};

function silentMatchingRelayId(appId){
  if(workbench.useManagedAcceleration===false)return null;
  const protocol=appRelayProtocolMap[appId]||null;
  if(!protocol)return null;
  const match=workbench.relays.find(item=>item.status==='active'&&(item.protocol===protocol||(protocol==='openai'&&item.protocol==='openai-responses')));
  return match?.relayId||null;
}

async function loadUsageForApp(appId,{forceRescan=false}={}){
  if(!appId||!globalThis.NoyaDesktop?.accounts?.invoke)return null;
  workbench.usageLoading=true;
  render();
  try{
    const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.usageScan',{
      appId,
      range:state.usageRange||'30d',
      granularity:state.usageGranularity||'day',
      sessionType:state.usageType||'all',
      model:state.usageModel||'all',
      workspace:state.usageWorkspace||'all',
      forceRescan,
    });
    if(res?.ok&&res.value){
      workbench.usageByApp[appId]=res.value;
      return res.value;
    }
  }catch{}finally{
    workbench.usageLoading=false;
    render();
  }
  return null;
}

function scheduleAutoRefresh(){
  if(autoRefreshTimer){clearInterval(autoRefreshTimer);autoRefreshTimer=null;}
  const mins=Number(state.autoRefreshMinutes)||0;
  if(mins>0&&globalThis.NoyaDesktop?.accounts&&authState.user){
    autoRefreshTimer=setInterval(()=>{void refreshQuotas(null,null,{silent:true});},mins*60_000);
  }
}

async function syncDesktopWorkbench(){
  if(!globalThis.NoyaDesktop)return;
  try{
    if(globalThis.NoyaDesktop.proxy?.invoke){
      const envRes=await globalThis.NoyaDesktop.proxy.invoke('proxy.environment').catch(()=>null);
      if(envRes?.ok&&['safe_tunnel','own_network'].includes(envRes.value?.mode)){
        workbench.envMode=envRes.value.mode;
        workbench.exitGeo=envRes.value.exitGeo||null;
      }
    }
    if(globalThis.NoyaDesktop.accounts?.invoke){
      const detectRes=await globalThis.NoyaDesktop.accounts.invoke('accounts.detectAll').catch(()=>null);
      if(detectRes?.ok&&detectRes.value?.apps)workbench.detectedApps=detectRes.value.apps;
      const groupsRes=await globalThis.NoyaDesktop.accounts.invoke('accounts.groupsList').catch(()=>null);
      if(groupsRes?.ok&&Array.isArray(groupsRes.value?.groups))workbench.groups=groupsRes.value.groups;
      const settingsRes=await globalThis.NoyaDesktop.accounts.invoke('accounts.settingsGet').catch(()=>null);
      if(settingsRes?.ok&&Number.isFinite(settingsRes.value?.autoRefreshMinutes)){
        state.autoRefreshMinutes=settingsRes.value.autoRefreshMinutes;
      }
      const wakeRes=await globalThis.NoyaDesktop.accounts.invoke('accounts.wakeupList',state.activeWorkspaceApp?{appId:state.activeWorkspaceApp}:{}).catch(()=>null);
      if(wakeRes?.ok){
        workbench.wakeupTasks=Array.isArray(wakeRes.value?.tasks)?wakeRes.value.tasks:[];
        workbench.wakeupHistory=Array.isArray(wakeRes.value?.history)?wakeRes.value.history:[];
      }
      if(globalThis.NoyaDesktop.telemetry?.invoke){
        const telRes=await globalThis.NoyaDesktop.telemetry.invoke('telemetry.status').catch(()=>null);
        if(telRes?.ok&&telRes.value)workbench.telemetryStatus=telRes.value;
      }
      if(authState.user){
        const acctRes=await globalThis.NoyaDesktop.accounts.invoke('accounts.list').catch(()=>null);
        if(acctRes?.ok){
          workbench.accounts=Array.isArray(acctRes.value?.accounts)?acctRes.value.accounts:[];
          workbench.activeByApp=acctRes.value?.activeByApp||{};
        }
        if(!autoLocalImportAttempted){
          autoLocalImportAttempted=true;
          const autoRes=await globalThis.NoyaDesktop.accounts.invoke('accounts.importLocal',{all:true,silent:true}).catch(()=>null);
          if(autoRes?.ok&&autoRes.value){
            workbench.accounts=Array.isArray(autoRes.value.accounts)?autoRes.value.accounts:workbench.accounts;
            workbench.activeByApp=autoRes.value.activeByApp||workbench.activeByApp;
            if((autoRes.value.addedCount||0)>0){
              notify(`已静默同步 ${autoRes.value.addedCount} 个本机账号（已自动去重）。`);
            }
          }
        }
        scheduleAutoRefresh();
        if(isSafeEnvReady()&&!autoQuotaRefreshAttempted&&!workbench.refreshingQuota){
          const nowTs=Date.now();
          const needsQuota=workbench.accounts.some(a=>{
            if(!a.appId||PURE_WEB_CONTAINER_APPS.has(a.appId)||a.status==='banned'||a.status==='invalid')return false;
            if((a.appId==='claude'||a.appId==='chatgpt')&&(!a.email||/已授权会话/.test(a.label||'')))return true;
            if(a.quotaState==='container_ready')return false;
            if(!Array.isArray(a.quotas)||!a.quotas.length)return true;
            if(a.quotas.some(q=>q?.resetAt&&Date.parse(q.resetAt)<=nowTs))return true;
            if((a.appId==='antigravity'||a.appId==='gemini-cli')&&a.quotas.some(q=>q&&q.remainingPct===null))return true;
            return false;
          });
          if(needsQuota){
            autoQuotaRefreshAttempted=true;
            void refreshQuotas(null,null,{silent:true});
          }
        }
      }
    }
    if(authState.user&&globalThis.NoyaDesktop.agent?.invoke){
      const listRes=await globalThis.NoyaDesktop.agent.invoke('agent.list').catch(()=>null);
      if(listRes?.ok&&Array.isArray(listRes.value?.profiles))workbench.agentProfiles=listRes.value.profiles;
    }
    if(authState.user&&typeof globalThis.NoyaDesktop.browser?.list==='function'){
      const bRes=await globalThis.NoyaDesktop.browser.list().catch(()=>null);
      if(bRes?.ok&&Array.isArray(bRes.value?.instances))workbench.browserInstances=bRes.value.instances;
    }
    if(state.activeWorkspaceApp&&!workbench.usageByApp[state.activeWorkspaceApp]&&!workbench.usageLoading){
      void loadUsageForApp(state.activeWorkspaceApp);
    }
  }catch{}
  render();
}

async function loadRelays(){
  if(!authState.user||(!isMainSite&&!globalThis.NoyaDesktop)||!clientApiAvailable()||workbench.relaysPhase==='loading')return;
  workbench.relaysPhase='loading';workbench.relaysError='';
  try{
    const res=await data.relays();
    workbench.relays=Array.isArray(res?.relays)?res.relays:[];
    workbench.relaysPhase='ready';
  }catch{
    workbench.relays=[];
    workbench.relaysPhase='unconfigured';
  }
}

async function switchEnvironmentMode(nextMode){
  if(!['safe_tunnel','own_network'].includes(nextMode)||workbench.envMode===nextMode||workbench.switchingMode)return;
  if(!globalThis.NoyaDesktop?.proxy?.invoke){
    workbench.envMode=nextMode;
    if(nextMode==='own_network'&&isConnected()){connectionToken++;state.status='disconnected';state.connectedAt=null;}
    render();
    notify(nextMode==='own_network'?'已切换至自有网络环境（预览）。':'已切换至基础代理环境（预览）。');
    return;
  }
  workbench.switchingMode=true;render();
  try{
    const res=await globalThis.NoyaDesktop.proxy.invoke('proxy.mode.set',{mode:nextMode});
    if(!res?.ok){
      throw new Error(res?.error?.message||'网络环境切换未完成。');
    }
    if(['safe_tunnel','own_network'].includes(res.value?.mode)){
      workbench.envMode=res.value.mode;
      workbench.exitGeo=res.value.exitGeo||null;
    }else{
      workbench.envMode=nextMode;
    }
    if(state.status==='connected'||state.status==='connecting'){
      ++connectionToken;
      state.status='disconnected';
      state.connectedAt=null;
    }
    autoQuotaRefreshAttempted=false;
    await syncDesktopWorkbench();
    const modeMsg=nextMode==='own_network'
      ?'已切换至自有网络环境：不占用基础代理，可直接使用所有应用。'
      :'已切换至基础代理环境：开启连接后支持的应用将通过 127.0.0.1:17899 联通。';
    notify(modeMsg);
  }catch(error){
    notify(error?.message||'网络环境切换未完成。');
  }finally{
    workbench.switchingMode=false;
    render();
  }
}

async function quickLaunchApp(appId,overrideAlias=null,options={}){
  const app=availableApps().find(a=>a.id===appId)||selectedApplication();
  if(!app?.id)return;
  if(!globalThis.NoyaDesktop){
    if(!isMainSite){recordLocalEvent('app_demo',{appId:app.id});notify(`已在预览模式演示启动 ${app.name}。`);}
    else notify('请在定途桌面客户端中启动应用。');
    return;
  }
  if(!authState.user){notify('请先登录定途账号后再启动应用。');go('settings');return;}
  if(!isSafeEnvReady()){notify('纯净安全环境下请先点击底部按钮连接，或在我的设置切换自有网络环境。');return;}
  const activeAccountId=overrideAlias||activeAccountForApp(app.id)?.id||'main';
  const preferShell=Boolean(browserShellAppMap[app.id])&&!(app.id==='metamuse'&&state.platform==='macos');
  workbench.launchingApp=app.id;
  render();
  notify(preferShell?`正在打开 ${app.name} 安全容器…`:`正在启动 ${app.name}…`);
  try{
    if(preferShell){
      const containerAlias=overrideAlias||activeAccountId||'main';
      const res=await globalThis.NoyaDesktop.browser.open(browserShellAppMap[app.id],containerAlias,{appShell:true});
      if(!res?.ok)throw new Error(res?.error?.message||'应用安全容器未能打开。');
      recordLocalEvent('browser_started',{appId:app.id,simulated:false});
      await syncDesktopWorkbench();
      notify(`已打开 ${app.name} 独立安全容器 (${containerAlias})。`);
      return;
    }
    if(app.id==='antigravity'&&!options?.skipPreSwitch&&globalThis.NoyaDesktop.accounts&&activeAccountForApp('antigravity')){
      await globalThis.NoyaDesktop.accounts.invoke('accounts.switch',{appId:'antigravity',accountId:activeAccountId}).catch(()=>null);
    }
    const bridge=globalThis.NoyaDesktop?.agent;
    let adapterId=desktopAdapterIds[app.id]||app.id;
    if(app.id==='codex'&&!options?.forceCli&&!/mac|darwin|linux/i.test(state.platform||navigator.platform||'')){
      const desktopCheck=await bridge.invoke('agent.inspect',{appId:'codex-desktop'}).catch(()=>null);
      if(desktopCheck?.ok&&desktopCheck.value?.status==='installed')adapterId='codex-desktop';
    }
    if(app.id==='antigravity'&&options?.forceCli){
      adapterId='antigravity-cli';
    }
    const instanceAlias=options?.instanceAlias||`${adapterId}-main`;
    const inspection=await bridge.invoke('agent.inspect',{appId:adapterId});
    if(!inspection?.ok)throw new Error(inspection?.error?.message||'应用环境检测未完成。');
    if(inspection.value.status==='not-installed')throw new Error(`本机未检测到 ${app.name} 客户端，可先安装官方应用或进入官网管理。`);
    if(inspection.value.status==='unknown')throw new Error('暂时无法确认客户端安装路径。');
    const createPayload={alias:instanceAlias,appId:adapterId,credentialSlotIds:[]};
    const silentRelay=silentMatchingRelayId(app.id);
    if(silentRelay)createPayload.relayId=silentRelay;
    const created=await bridge.invoke('agent.create',createPayload);
    if(!created?.ok&&created?.error?.code!=='PROFILE_ALIAS_CONFLICT')throw new Error(created?.error?.message||'实例配置创建失败。');
    let started=await bridge.invoke('agent.start',{instanceId:instanceAlias});
    if(!started?.ok&&started?.error?.code==='AGENT_ALREADY_RUNNING'){
      if(options?.restartIfRunning){
        await bridge.invoke('agent.closeApp',{appId:adapterId}).catch(()=>null);
        started=await bridge.invoke('agent.start',{instanceId:instanceAlias});
      }else{
        await syncDesktopWorkbench();
        notify(`${app.name} 已在运行中。`);
        return;
      }
    }
    if(!started?.ok)throw new Error(started?.error?.message||'实例启动失败。');
    recordLocalEvent('agent_instance_started',{appId:app.id,simulated:false});
    await syncDesktopWorkbench();
    notify(`已受控启动 ${app.name} (${instanceAlias})。`);
  }catch(error){
    notify(error?.message||`${app.name} 启动未完成。`);
  }finally{
    if(workbench.launchingApp===app.id)workbench.launchingApp=null;
    render();
  }
}

async function importLocalAccount(appId){
  if(!globalThis.NoyaDesktop?.accounts){
    if(!isMainSite)notify('预览模式已展示示例本机账号；真实导入请在桌面客户端使用。');
    return;
  }
  if(!authState.user){go('settings');return;}
  workbench.importingApp=appId||'all';render();
  try{
    const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.importLocal',appId?{appId}:{all:true});
    if(!res?.ok)throw new Error(res?.error?.message||'未检测到可导入的本机账号。');
    await syncDesktopWorkbench();
    const added=Number(res.value?.addedCount??res.value?.importedCount??0);
    const updated=Number(res.value?.updatedCount??0);
    const skipped=Number(res.value?.skippedCount??0);
    const appLabel=appId?(availableApps().find(a=>a.id===appId)?.name||appId):'本机';
    let msg=`${appLabel}扫描完成，未发现新的本机账号。`;
    if(added>0&&skipped>0)msg=`已导入 ${added} 个新账号，跳过 ${skipped} 个重复账号。`;
    else if(added>0)msg=appId?`已从本机导入 ${added} 个 ${appLabel} 账号。`:`扫描完成，已导入 ${added} 个新账号。`;
    else if(updated>0)msg=`已刷新 ${updated} 个本机账号凭据${skipped>0?`，跳过 ${skipped} 个重复账号`:''}。`;
    else if(skipped>0)msg=`已检测到的 ${skipped} 个本机账号均已在列表中（已自动去重）。`;
    notify(msg);
  }catch(error){
    notify(error?.message||'导入本机账号未完成。');
  }finally{
    workbench.importingApp=null;
    render();
  }
}

async function refreshQuotas(appId=null,accountId=null,{silent=false}={}){
  if(!globalThis.NoyaDesktop?.accounts){
    if(!isMainSite&&!silent)notify('预览模式已刷新示例额度数据。');
    return;
  }
  if(!authState.user){if(!silent)go('settings');return;}
  workbench.refreshingQuota=true;
  workbench.refreshingAccountKey=accountId&&appId?`${appId}:${accountId}`:(appId||'all');
  render();
  try{
    const args={};
    if(appId)args.appId=appId;
    if(accountId)args.accountId=accountId;
    const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.refreshQuota',args);
    if(!res?.ok)throw new Error(res?.error?.message||'额度刷新未完成。');
    await syncDesktopWorkbench();
    if(silent)return;
    if(appId&&accountId){
      const target=accountsForApp(appId).find(a=>a.id===accountId);
      if(target?.quotaState==='synced')notify(`已更新 ${accountDisplayName(target)} 实时额度。`);
      else if(target?.quotaState==='container_ready')notify('已核验独立容器会话状态（该应用暂无公开线上配额接口）。');
      else if(target?.lastError)notify(target.lastError);
      else notify('已核对账号凭据状态。');
    }else{
      const count=res.value?.refreshedCount||0;
      notify(count>0?`已更新 ${count} 个账号的实时额度。`:'已核对本机账号状态（部分应用暂不公开线上额度接口或需开启安全连接）。');
    }
  }catch(error){
    if(!silent)notify(error?.message||'额度刷新失败。');
  }finally{
    workbench.refreshingQuota=false;
    workbench.refreshingAccountKey=null;
    render();
  }
}

async function switchAppAccount(appId,accountId,andLaunch=false,options={}){
  if(!globalThis.NoyaDesktop?.accounts){
    if(!isMainSite)notify(`预览模式：已演示切换至账号 ${accountId}。`);
    return;
  }
  if(!authState.user){notify('请先登录定途账号后再操作。');go('settings');return;}
  if(andLaunch&&!isSafeEnvReady()){notify('纯净安全环境下请先点击底部按钮连接，或在我的设置切换自有网络环境。');return;}
  workbench.switchingAccount=accountId;
  if(andLaunch)workbench.switchingAndLaunching=`${appId}:${accountId}`;
  render();
  const appName=availableApps().find(a=>a.id===appId)?.name||appId;
  const preferShell=Boolean(browserShellAppMap[appId])&&!(appId==='metamuse'&&state.platform==='macos');
  const isAntigravityCliLaunch=appId==='antigravity'&&Boolean(options?.forceCli);
  try{
    if(andLaunch&&!preferShell&&!isAntigravityCliLaunch&&globalThis.NoyaDesktop?.agent?.invoke){
      notify(`正在优雅关闭旧 ${appName} 进程并切换凭据…`);
      const closeRes=await globalThis.NoyaDesktop.agent.invoke('agent.closeApp',{appId:desktopAdapterIds[appId]||appId});
      if(!closeRes?.ok)throw new Error(closeRes?.error?.message||`旧 ${appName} 进程未能关闭，请先手动关闭或重试。`);
      const timedOut=closeRes.value?.timedOut===true;
      const remaining=Number(closeRes.value?.remainingCount??0);
      if(timedOut){
        throw new Error(`关闭旧 ${appName} 进程超时，请先手动关闭或重试。`);
      }
      if(remaining>0){
        throw new Error(`旧进程未能关闭，剩余 ${remaining} 个进程，请先手动关闭或重试。`);
      }
      if(remaining<0){
        throw new Error(`旧 ${appName} 进程未能确认关闭，请先手动关闭或重试。`);
      }
    }
    const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.switch',{appId,accountId});
    if(!res?.ok)throw new Error(res?.error?.message||'账号切换未完成。');
    await syncDesktopWorkbench();
    const acctName=res.value?.account?.email||res.value?.account?.label||accountId;
    const switchNote=typeof res.value?.switchNote==='string'&&res.value.switchNote.trim()?`（${res.value.switchNote.trim()}）`:'';
    notify(`已切换 ${appName} 当前使用账号：${acctName}${switchNote}`);
    if(andLaunch)await quickLaunchApp(appId,accountId,{...(options||{}),restartIfRunning:true,skipPreSwitch:true});
  }catch(error){
    notify(error?.message||'切换账号失败。');
  }finally{
    workbench.switchingAccount=null;
    workbench.switchingAndLaunching=null;
    render();
  }
}

async function removeAppAccount(appId,accountId){
  if(!globalThis.NoyaDesktop?.accounts||!authState.user)return;
  try{
    const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.remove',{appId,accountId});
    if(!res?.ok)throw new Error(res?.error?.message||'移除失败。');
    state.selectedAccountIds=state.selectedAccountIds.filter(id=>id!==accountId);
    await syncDesktopWorkbench();
    notify('已移除该账号槽位。');
  }catch(error){
    notify(error?.message||'移除账号未完成。');
  }
}

async function batchRemoveAppAccounts(appId){
  const ids=(state.selectedAccountIds||[]).filter(Boolean);
  if(!ids.length||!globalThis.NoyaDesktop?.accounts||!authState.user)return;
  try{
    const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.batchRemove',{appId,accountIds:ids});
    if(!res?.ok)throw new Error(res?.error?.message||'批量删除失败。');
    state.selectedAccountIds=[];
    await syncDesktopWorkbench();
    notify(`已批量删除 ${res.value?.removedCount||ids.length} 个账号槽位。`);
  }catch(error){
    notify(error?.message||'批量删除未完成。');
  }
}

function downloadJsonFile(filename,jsonText){
  const blob=new Blob([jsonText],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function exportAccountsJson(appId=null,accountIds=null){
  if(!globalThis.NoyaDesktop?.accounts){
    const payload=JSON.stringify({version:1,kind:'dingtu-accounts-preview',appId:appId||'all',accounts:accountsForApp(appId||'codex')},null,2);
    downloadJsonFile(`dingtu-${appId||'all'}-accounts.json`,payload);
    notify('已导出脱敏账号清单 JSON（预览）。');
    return;
  }
  if(!authState.user){go('settings');return;}
  try{
    const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.exportJson',{...(appId?{appId}:{}),...(accountIds?.length?{accountIds}:{})});
    if(!res?.ok)throw new Error(res?.error?.message||'导出失败。');
    downloadJsonFile(`dingtu-${appId||'all'}-accounts.json`,res.value.jsonText);
    notify(`已导出 ${res.value.count||0} 条脱敏账号清单（不含原始凭据）。`);
  }catch(error){
    notify(error?.message||'导出失败。');
  }
}

async function quickSwitchApp(appId){
  const list=accountsForApp(appId);
  if(list.length<2){
    state.page='connection';state.libraryExpanded=false;state.activeWorkspaceApp=appId;state.workspaceTab='accounts';render();
    notify(list.length===0?'尚未添加账号，请先导入或添加多个账号后即可一键切换。':'当前只有 1 个账号，点击「+ 添加账号」后即可一键切换。');
    return;
  }
  const idx=Math.max(0,list.findIndex(a=>a.isActive));
  const next=list[(idx+1)%list.length];
  await switchAppAccount(appId,next.id,false);
}

function renderAddAccountDialogBody(){
  const dialog=document.getElementById('add-account-dialog');
  if(!dialog)return;
  const appId=state.addModalAppId||state.activeWorkspaceApp||state.selectedApp||'antigravity';
  const app=availableApps().find(a=>a.id===appId)||{id:appId,name:appId};
  const errEl=document.getElementById('add-account-error');
  if(errEl)errEl.textContent='';
  document.getElementById('add-account-title').textContent=`添加 ${app.name} 账号`;
  dialog.querySelectorAll('[data-add-tab]').forEach(btn=>{
    const active=btn.dataset.addTab===state.addModalTab;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-selected',String(active));
  });
  const body=document.getElementById('add-account-tab-body');
  if(!body)return;
  const safePrefix=appId.replace(/[^a-z0-9_-]/g,'').slice(0,18)||'acct';
  const existingAppAccounts=accountsForApp(appId);
  const suggestedAlias=existingAppAccounts.length===0?'main':`${safePrefix}-${existingAppAccounts.length+1}`;
  const pkceOAuthApps=['antigravity','gemini-cli','codex','codex-desktop'];
  const deviceFlowApps=['copilot','kiro'];
  const webWindowApps=['claude-desktop','claude','cursor','windsurf','chatgpt','grok','grok-cli','manus','metamuse','gemini-web'];
  const supportsWebOAuth=[...pkceOAuthApps,...deviceFlowApps,...webWindowApps].includes(appId);

  if(state.addModalTab==='oauth'){
    const flow=state.oauthFlow&&state.oauthFlow.appId===appId?state.oauthFlow:null;
    if(!supportsWebOAuth){
      body.innerHTML=`<div class="modal-form-stack"><p style="margin:0;font-size:12.5px;color:var(--muted);line-height:1.6;"><strong>${escapeHTML(app.name)}</strong> 建议使用「Token / Refresh Token」或「本机导入」接入，也可点击下方按钮打开独立安全容器进行官方登录。</p><div class="dialog-actions"><button type="button" class="button secondary" data-add-tab="token">改用 Token 导入</button><button type="button" class="button primary" data-action="launch-workspace-app" data-app-id="${escapeHTML(appId)}">打开官网容器</button></div></div>`;
      return;
    }
    const isWebWin=webWindowApps.includes(appId);
    const isDevice=deviceFlowApps.includes(appId);
    const hintCopy=isWebWin
      ?'点击下方按钮将在定途内置隔离登录窗打开官方站点，登录后自动提取会话凭据并加密写入安全槽位。'
      :isDevice
        ?'点击下方按钮获取一次性设备授权码，并在独立隔离的外部 Chrome / Edge 浏览器窗口完成确认，自动绑定至桌面安全槽位。'
        :'点击下方按钮将在独立隔离的外部 Chrome / Edge 浏览器窗口中打开官方 OAuth 授权页面（不共享宿主登录态），完成后自动绑定至您的桌面安全槽位。';
    const ctaLabel=isWebWin?'打开内置官方登录窗口':isDevice?'获取设备码并打开外部浏览器':'在外部隔离浏览器中 OAuth 授权';
    let flowHtml='';
    if(flow){
      const isDone=flow.status==='completed'||flow.status==='authorized';
      const copyableUrl=flow.authUrl||flow.verificationUri||'';
      flowHtml=`<div class="oauth-code-box">
        <strong>授权状态：${isDone?'已成功完成授权':flow.status==='failed'?'授权未完成':flow.status==='cancelled'?'已取消':flow.status==='expired'?'授权已超时':'等待您完成登录授权…'}</strong>
        ${flow.userCode?`<div>验证码：<span class="oauth-device-code">${escapeHTML(flow.userCode)}</span> <small>(${escapeHTML(flow.verificationUri||'')})</small></div>`:''}
        ${flow.browserFallback&&flow.status==='pending'?`<p style="margin:4px 0 0;font-size:12px;color:var(--muted);">本机未检测到 Chrome / Edge，已改用系统默认浏览器打开；若未自动弹出，可点击「复制授权链接」手动访问。</p>`:''}
        ${flow.status==='pending'&&copyableUrl?`<label style="display:block;margin-top:6px;font-size:12px;color:var(--muted);">授权链接（可一键复制或选中手动复制）：<input id="oauth-auth-url-preview" type="text" readonly spellcheck="false" value="${escapeHTML(copyableUrl)}" style="width:100%;margin-top:4px;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;"></label>`:''}
        ${flow.error?`<p class="auth-error" role="alert">${escapeHTML(flow.error)}</p>`:''}
        ${flow.status==='pending'&&flow.mode!=='device_code'&&flow.mode!=='web_window'?`<form id="add-oauth-callback-form" class="modal-form-stack" style="margin-top:6px;"><label>若未自动跳转，可粘贴浏览器地址栏完整回调 URL：<input id="oauth-manual-callback" type="url" placeholder="http://127.0.0.1:.../oauth-callback?code=..." required></label><button type="submit" class="button secondary compact">提交回调地址完成绑定</button></form>`:''}
        <div class="dialog-actions">${flow.status==='pending'&&copyableUrl?`<button type="button" class="button secondary compact" data-action="copy-oauth-url">复制授权链接</button>`:''}<button type="button" class="button secondary compact" data-action="cancel-oauth-flow">取消本次授权</button></div>
        <div id="oauth-copy-feedback" class="oauth-copy-feedback" aria-live="polite" style="margin-top:4px;font-size:12px;color:var(--ok);min-height:16px;"></div>
      </div>`;
    }
    body.innerHTML=`<div class="modal-form-stack">
      <label>账号 / 槽位标识<input id="add-oauth-alias" type="text" value="${escapeHTML(suggestedAlias)}" pattern="[a-z][a-z0-9_-]{0,31}" maxlength="32"></label>
      <p style="margin:0;font-size:12px;color:var(--muted);">${hintCopy}</p>
      ${flowHtml}
      ${!flow||flow.status!=='pending'?`<div class="dialog-actions"><button type="button" class="button gradient-cta" data-action="start-oauth-flow" data-app-id="${escapeHTML(appId)}">${ctaLabel}</button></div>`:''}
    </div>`;
  }else if(state.addModalTab==='token'){
    body.innerHTML=`<form id="add-token-form" class="modal-form-stack">
      <label>账号 / 槽位标识<input name="alias" type="text" value="${escapeHTML(suggestedAlias)}" pattern="[a-z][a-z0-9_-]{0,31}" maxlength="32" required></label>
      <label>Access Token 或 Refresh Token（${appId==='antigravity'?'支持 1//0... Google Refresh Token':'填写官网 OAuth / Session Token'}）<textarea name="token" rows="3" maxlength="4096" placeholder="粘贴 Token 或以 1// 开头的 Refresh Token…" required></textarea></label>
      <label>备注邮箱（可选）<input name="email" type="text" maxlength="160" placeholder="user@example.com"></label>
      <label>套餐徽章（可选）<input name="plan" type="text" maxlength="32" placeholder="ULTRA / PRO / MAX / FREE"></label>
      <div class="dialog-actions"><button type="button" class="button secondary" data-action="close-add-account-dialog">取消</button><button type="submit" class="button gradient-cta">校验并保存账号</button></div>
    </form>`;
  }else if(state.addModalTab==='local'){
    body.innerHTML=`<div class="modal-form-stack">
      <p style="margin:0;font-size:12.5px;color:var(--muted);line-height:1.6;">自动扫描本机原生应用、Antigravity Studio、Cockpit Tools 与 CC-Switch 等已保存账号并静默去重（<code>${escapeHTML(appCredentialSourceDesc(appId))}</code>）。</p>
      <div class="dialog-actions"><button type="button" class="button secondary" data-action="close-add-account-dialog">取消</button><button type="button" class="button gradient-cta" data-action="confirm-local-import-modal" data-app-id="${escapeHTML(appId)}">立即扫描并导入本机账号</button></div>
    </div>`;
  }else{
    body.innerHTML=`<form id="add-json-form" class="modal-form-stack">
      <label>粘贴账号 JSON（兼容 Cockpit / 定途导出格式）<textarea id="add-json-textarea" name="jsonText" rows="5" maxlength="524288" placeholder='[{"email":"a@example.com","refresh_token":"1//...","plan":"ULTRA"}]' required></textarea></label>
      <div class="dialog-actions"><button type="button" class="button secondary" data-action="open-add-account-modal" data-app-id="${escapeHTML(appId)}">新建空白槽位</button><button type="submit" class="button gradient-cta">批量导入 JSON</button></div>
    </form>`;
  }
}

function openAddAccountDialog(appId,tab=null){
  if(!globalThis.NoyaDesktop?.accounts){
    notify('网页端仅预览，请在桌面客户端中添加或绑定账号。');
    return;
  }
  if(!authState.user){go('settings');return;}
  state.addModalAppId=appId||state.activeWorkspaceApp||state.selectedApp||'antigravity';
  const supportsWebOAuth=['antigravity','gemini-cli','codex','codex-desktop','copilot','kiro','claude-desktop','claude','cursor','windsurf','chatgpt','grok','grok-cli','manus','metamuse','gemini-web'].includes(state.addModalAppId);
  state.addModalTab=tab||(supportsWebOAuth?'oauth':'local');
  renderAddAccountDialogBody();
  document.getElementById('add-account-dialog')?.showModal();
}

function stopOAuthPolling(){
  if(oauthPollTimer){clearInterval(oauthPollTimer);oauthPollTimer=null;}
}

async function startOAuthFlowFromModal(appId){
  if(!globalThis.NoyaDesktop?.accounts)return;
  const aliasEl=document.getElementById('add-oauth-alias');
  const alias=aliasEl?.value.trim()||'main';
  const errEl=document.getElementById('add-account-error');
  if(errEl)errEl.textContent='';
  try{
    const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.oauthStart',{appId,alias});
    if(!res?.ok)throw new Error(res?.error?.message||'OAuth 授权启动失败。');
    state.oauthFlow=res.value;
    renderAddAccountDialogBody();
    stopOAuthPolling();
    const flowId=res.value.flowId;
    oauthPollTimer=setInterval(async()=>{
      if(!state.oauthFlow||state.oauthFlow.flowId!==flowId){stopOAuthPolling();return;}
      const poll=await globalThis.NoyaDesktop.accounts.invoke('accounts.oauthStatus',{flowId}).catch(()=>null);
      if(!poll?.ok)return;
      state.oauthFlow={...state.oauthFlow,...poll.value,authUrl:poll.value.authUrl||state.oauthFlow?.authUrl||null,verificationUri:poll.value.verificationUri||state.oauthFlow?.verificationUri||null};
      if(poll.value.status==='completed'||poll.value.status==='authorized'){
        stopOAuthPolling();
        document.getElementById('add-account-dialog')?.close();
        state.oauthFlow=null;
        await syncDesktopWorkbench();
        notify('浏览器 OAuth 授权完成，账号已加入安全槽位。');
      }else if(['failed','cancelled','expired'].includes(poll.value.status)){
        stopOAuthPolling();
        renderAddAccountDialogBody();
      }
    },1500);
  }catch(error){
    if(errEl)errEl.textContent=error?.message||'OAuth 启动未完成。';
  }
}

async function copyOAuthAuthorizationUrl(buttonEl){
  const flow=state.oauthFlow;
  const feedbackEl=document.getElementById('oauth-copy-feedback');
  const previewInput=document.getElementById('oauth-auth-url-preview');
  let copyUrl=flow?.authUrl||flow?.verificationUri||previewInput?.value||'';
  let copied=false;
  if(flow?.flowId&&globalThis.NoyaDesktop?.accounts?.invoke){
    const ipcRes=await globalThis.NoyaDesktop.accounts.invoke('accounts.oauthCopyUrl',{flowId:flow.flowId}).catch(()=>null);
    if(ipcRes?.ok){
      if(ipcRes.value?.url)copyUrl=ipcRes.value.url;
      if(ipcRes.value?.copied)copied=true;
    }
  }
  if(!copyUrl){
    if(feedbackEl){feedbackEl.style.color='var(--danger)';feedbackEl.textContent='当前授权链接尚未生成，请重新发起授权。';}
    notify('当前授权链接为空，请重新发起授权。');
    return;
  }
  if(!copied&&navigator.clipboard?.writeText){
    try{await navigator.clipboard.writeText(copyUrl);copied=true;}catch{copied=false;}
  }
  if(!copied&&previewInput){
    try{
      previewInput.focus({preventScroll:true});
      previewInput.select();
      if(typeof document.execCommand==='function'&&document.execCommand('copy'))copied=true;
    }catch{copied=false;}
  }
  if(copied){
    if(feedbackEl){feedbackEl.style.color='var(--ok)';feedbackEl.textContent='✓ 已复制授权链接，请粘贴至浏览器完成登录。';}
    if(buttonEl&&buttonEl.isConnected){
      const orig=buttonEl.dataset.origLabel||buttonEl.textContent;
      buttonEl.dataset.origLabel=orig;
      buttonEl.textContent='✓ 已复制';
      setTimeout(()=>{if(buttonEl.isConnected)buttonEl.textContent=orig;},2200);
    }
    notify('已复制授权链接，请粘贴至浏览器完成登录。');
  }else{
    if(previewInput){previewInput.focus({preventScroll:true});previewInput.select();}
    if(feedbackEl){feedbackEl.style.color='var(--warn, #b45309)';feedbackEl.textContent='自动复制不可用，已选中上方链接，请按 Ctrl+C 复制。';}
    notify('自动复制不可用，已选中授权链接，请按 Ctrl+C 复制。');
  }
}

function openAccountMetaDialog(appId,accountId){
  const acct=accountsForApp(appId).find(a=>a.id===accountId);
  if(!acct)return;
  document.getElementById('meta-app-id').value=appId;
  document.getElementById('meta-account-id').value=accountId;
  document.getElementById('meta-label-input').value=acct.email||acct.label||accountId;
  document.getElementById('meta-plan-input').value=acct.plan||'';
  document.getElementById('meta-tags-input').value=(acct.tags||[]).join(', ');
  document.getElementById('meta-note-input').value=acct.note||'';
  const errEl=document.getElementById('account-meta-error');
  if(errEl)errEl.textContent='';
  document.getElementById('account-meta-dialog')?.showModal();
}

function openAntigravityLaunchDialog(appId,accountId){
  const acct=accountsForApp(appId).find(a=>a.id===accountId);
  if(!acct)return;
  const dialog=document.getElementById('antigravity-launch-dialog');
  if(!dialog)return;
  dialog.dataset.appId=appId;
  dialog.dataset.accountId=accountId;
  const cliBtn=document.getElementById('ag-launch-cli-btn');
  if(cliBtn)cliBtn.hidden=appId!=='antigravity';
  const runningNotice=document.getElementById('antigravity-launch-running-notice');
  const isManagedRunning=(workbench.agentProfiles||[]).some(p=>p.appId===appId&&['starting','running','stopping'].includes(p.status));
  if(runningNotice)runningNotice.hidden=!isManagedRunning;
  document.getElementById('antigravity-launch-account-box').innerHTML=`<strong>${escapeHTML(accountDisplayName(acct))}</strong> ${tierBadgeHtml(acct.plan)}<div style="font-size:12px;color:var(--muted);margin-top:4px;">槽位：<code>${escapeHTML(acct.id)}</code> · 凭据来源：<code>${escapeHTML(appCredentialSourceDesc(appId))}</code></div>`;
  dialog.showModal();
  dialog.querySelector('[data-action="confirm-ag-switch-and-launch"]')?.focus({preventScroll:true});
  if(!isManagedRunning&&runningNotice&&globalThis.NoyaDesktop?.agent?.invoke){
    void globalThis.NoyaDesktop.agent.invoke('agent.isRunning',{appId:desktopAdapterIds[appId]||appId})
      .then(res=>{
        if(res?.ok&&res.value?.running&&dialog.open&&dialog.dataset.appId===appId&&dialog.dataset.accountId===accountId){
          runningNotice.hidden=false;
        }
      })
      .catch(()=>{});
  }
}

let pendingTotpQrEntries=[];

function renderGroupManageDialog(){
  const body=document.getElementById('group-manage-body');
  if(!body)return;
  const groups=workbench.groups||[];
  const appId=state.activeWorkspaceApp||state.selectedApp||'antigravity';
  const accts=accountsForApp(appId);
  body.innerHTML=`<div class="modal-form-stack">
    <form id="group-create-form" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
      <label style="flex:1;min-width:150px;">分组名称<input name="name" maxlength="32" placeholder="例如 主力号池" required></label>
      <label style="width:88px;">标记色<input name="color" type="color" value="#2563eb" style="height:38px;padding:2px;"></label>
      <button type="submit" class="button primary compact">新增分组</button>
    </form>
    ${groups.length?`<div style="display:flex;flex-direction:column;gap:8px;">${groups.map(g=>{
      const assignedSet=new Set(accts.filter(a=>Array.isArray(a.groups||a.groupIds)&&(a.groups||a.groupIds).includes(g.id)).map(a=>a.id));
      return `<div style="border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:#fafbff;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <strong style="display:inline-flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:999px;background:${escapeHTML(g.color||'#2563eb')};display:inline-block;"></span>${escapeHTML(g.name)}</strong>
          <button type="button" class="text-button" style="color:var(--danger);min-height:26px;" data-action="delete-custom-group" data-group-id="${escapeHTML(g.id)}">删除</button>
        </div>
        ${accts.length?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">${accts.map(a=>`<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;"><input type="checkbox" data-group-member-toggle data-group-id="${escapeHTML(g.id)}" data-app-id="${escapeHTML(appId)}" data-account-id="${escapeHTML(a.id)}" ${assignedSet.has(a.id)?'checked':''}>${escapeHTML(accountDisplayName(a))}</label>`).join('')}</div>`:''}
      </div>`;
    }).join('')}</div>`:`<p style="margin:6px 0;font-size:12.5px;color:var(--muted);">暂无自定义分组，请在上方创建分组名后分配账号。</p>`}
  </div>`;
}

function openGroupManageDialog(){
  state.platformDropdownOpen=false;
  renderGroupManageDialog();
  document.getElementById('group-manage-dialog')?.showModal();
}

function openWakeupDialog(appId,taskId=null){
  const dlg=document.getElementById('wakeup-task-dialog');
  const form=document.getElementById('wakeup-task-form');
  if(!dlg||!form)return;
  const targetApp=appId||state.activeWorkspaceApp||state.selectedApp||'antigravity';
  const existing=(workbench.wakeupTasks||[]).find(t=>t.id===taskId)||null;
  const accts=accountsForApp(targetApp);
  form.elements.taskId.value=existing?.id||'';
  form.elements.appId.value=targetApp;
  form.elements.name.value=existing?.name||`${targetApp} 定时配额刷新`;
  const acctSelect=form.elements.accountId;
  acctSelect.innerHTML=`<option value="">全部该应用账号</option>${accts.map(a=>`<option value="${escapeHTML(a.id)}"${existing?.accountId===a.id?' selected':''}>${escapeHTML(accountDisplayName(a))}</option>`).join('')}`;
  form.elements.scheduleType.value=existing?.scheduleType||'interval';
  form.elements.intervalMinutes.value=String(existing?.intervalMinutes||60);
  form.elements.dailyTime.value=existing?.dailyTime||'09:00';
  form.elements.action.value=existing?.action||'refresh_quota';
  document.getElementById('wakeup-interval-row').hidden=form.elements.scheduleType.value==='daily';
  document.getElementById('wakeup-daily-row').hidden=form.elements.scheduleType.value!=='daily';
  document.getElementById('wakeup-task-error').textContent='';
  dlg.showModal();
}

function openAutoRefreshDialog(){
  const dlg=document.getElementById('auto-refresh-dialog');
  const form=document.getElementById('auto-refresh-form');
  if(!dlg||!form)return;
  form.elements.autoRefreshMinutes.value=String(state.autoRefreshMinutes||0);
  dlg.showModal();
}

function closeTotpQrDialog(){
  pendingTotpQrEntries=[];
  const body=document.getElementById('totp-qr-body');
  if(body)body.innerHTML='';
  document.getElementById('totp-qr-dialog')?.close();
}

async function handleTotpQrUpload(){
  if(!globalThis.DingtuTotpQr?.scanQrFromImageFile){notify('二维码解析模块未加载。');return;}
  const fi=document.createElement('input');
  fi.type='file';
  fi.accept='image/png,image/jpeg,image/webp,image/gif';
  fi.onchange=async()=>{
    const file=fi.files?.[0];
    if(!file)return;
    try{
      const scanned=await globalThis.DingtuTotpQr.scanQrFromImageFile(file);
      const rawText=String(typeof scanned==='string'?scanned:(scanned?.rawText||'')).trim();
      let entries=[];
      if(rawText.startsWith('otpauth-migration://')){
        entries=globalThis.DingtuTotpQr.decodeOtpAuthMigration(rawText);
      }else if(rawText.startsWith('otpauth://')){
        const u=new URL(rawText);
        const rawLabel=decodeURIComponent(u.pathname.replace(/^\/+totp\//i,'').replace(/^\/+/,''));
        const issuer=u.searchParams.get('issuer')||'';
        const secret=u.searchParams.get('secret')||'';
        const period=Number(u.searchParams.get('period'))||30;
        const digits=Number(u.searchParams.get('digits'))||6;
        if(!secret)throw new Error('缺少 secret 参数');
        entries=[{uri:rawText,name:rawLabel||(issuer||'导入账号'),issuer,secret,period,digits}];
      }else{
        throw new Error('二维码不是有效的 otpauth:// 或 otpauth-migration:// 格式');
      }
      if(!entries.length)throw new Error('二维码中未包含可导入的 2FA 密钥');
      pendingTotpQrEntries=entries;
      document.getElementById('totp-qr-title').textContent='识别到 2FA 二维码凭证';
      document.getElementById('totp-qr-body').innerHTML=`<div class="modal-form-stack">
        <p style="margin:0;font-size:13px;">共解析出 <strong>${entries.length}</strong> 条 2FA 密钥，确认后将立即写入本地 DPAPI 安全存储：</p>
        <ul style="margin:0;padding-left:18px;font-size:12.5px;">${entries.map(e=>`<li><strong>${escapeHTML(e.name||e.issuer||'2FA')}</strong>${e.issuer?` (${escapeHTML(e.issuer)})`:''}</li>`).join('')}</ul>
        <div class="dialog-actions"><button type="button" class="button secondary" data-action="close-totp-qr-dialog">取消</button><button type="button" class="button primary" data-action="confirm-totp-qr-import">全部保存至 2FA 列表 (${entries.length})</button></div>
      </div>`;
      document.getElementById('totp-qr-dialog')?.showModal();
    }catch(err){
      notify(err?.message||'未能识别图片中的 2FA 二维码。');
    }
  };
  fi.click();
}

async function handleTotpQrExport(){
  if(!globalThis.NoyaDesktop?.accounts){notify('请在桌面客户端导出真实 2FA 迁移二维码。');return;}
  if(!globalThis.DingtuTotpQr?.encodeOtpAuthMigration||!globalThis.DingtuTotpQr?.renderQrSvg){notify('二维码生成模块未加载。');return;}
  try{
    const ids=(state.totpSelectedIds||[]).length?state.totpSelectedIds:(workbench.totpSaved||[]).map(x=>x.id);
    if(!ids.length){notify('暂无可导出的已保存 2FA 条目。');return;}
    const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.totpMigrationPayload',{ids});
    if(!res?.ok)throw new Error(res?.error?.message||'生成迁移载荷失败。');
    const rawList=res.value?.items||res.value?.entries;
    const items=Array.isArray(rawList)?rawList:[];
    if(!items.length){notify('没有可编码的 2FA 条目。');return;}
    const uri=globalThis.DingtuTotpQr.encodeOtpAuthMigration(items);
    const qrSvg=globalThis.DingtuTotpQr.renderQrSvg(uri,{margin:3});
    document.getElementById('totp-qr-title').textContent='导出 2FA 迁移二维码';
    document.getElementById('totp-qr-body').innerHTML=`<div class="qr-svg-frame">
      ${qrSvg}
      <p style="margin:0;font-size:12.5px;color:var(--muted);text-align:center;">已编码 <strong>${items.length}</strong> 条 2FA 密钥（兼容 Google Authenticator ` + '`otpauth-migration://`' + ` 格式）。请仅使用本人受信任设备扫码导入，关闭窗口将清除屏幕视图。</p>
      <div class="dialog-actions"><button type="button" class="button primary" data-action="close-totp-qr-dialog">完成并关闭</button></div>
    </div>`;
    document.getElementById('totp-qr-dialog')?.showModal();
  }catch(err){
    notify(err?.message||'导出 2FA 迁移二维码失败。');
  }
}

async function refreshTotpData(){
  if(!globalThis.NoyaDesktop?.accounts)return;
  try{
    const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.totpList');
    if(res?.ok){
      workbench.totpSaved=Array.isArray(res.value?.saved)?res.value.saved:[];
      workbench.totpHistory=Array.isArray(res.value?.history)?res.value.history:[];
      if(state.page==='totp')render();
    }
  }catch{}
}

async function handleTotpAction(kind){
  if(!globalThis.NoyaDesktop?.accounts){
    notify('请在桌面客户端中使用本地 2FA 动态码计算与加密存储。');
    return;
  }
  const input=(document.getElementById('totp-secret-input')?.value??state.totpInputDraft??'').trim();
  const name=(document.getElementById('totp-name-input')?.value??state.totpNameDraft??'').trim();
  state.totpInputDraft=input;
  state.totpNameDraft=name;
  try{
    if(kind==='query'){
      if(!input){notify('请先输入 otpauth:// 链接或 Base32 秘钥。');return;}
      const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.totpCompute',{input});
      if(!res?.ok)throw new Error(res?.error?.message||'秘钥格式无效。');
      workbench.totpLiveResult=res.value.result||null;
      workbench.totpSaved=res.value.saved||workbench.totpSaved;
      workbench.totpHistory=res.value.history||workbench.totpHistory;
      render();
    }else if(kind==='save'){
      if(!input){notify('请先输入要保存的 2FA 秘钥。');return;}
      const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.totpSave',{input,name});
      if(!res?.ok)throw new Error(res?.error?.message||'保存 2FA 秘钥失败。');
      workbench.totpLiveResult=res.value.entry||workbench.totpLiveResult;
      workbench.totpSaved=res.value.saved||workbench.totpSaved;
      workbench.totpHistory=res.value.history||workbench.totpHistory;
      render();
      notify('已加密保存至本地 2FA 列表。');
    }else if(kind==='export'){
      const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.totpExport');
      if(!res?.ok)throw new Error(res?.error?.message||'导出 2FA 清单失败。');
      downloadJsonFile('dingtu-2fa-sanitized.json',res.value.jsonText);
      notify(`已导出 ${res.value.count||0} 条 2FA 清单。`);
    }
  }catch(error){
    notify(error?.message||'2FA 操作未完成。');
  }
}

function openWorkbenchModal(app=selectedApplication(),modalMode='launch'){
  if(!app?.id)return;
  if(!globalThis.NoyaDesktop){
    if(!isMainSite){recordLocalEvent('app_demo',{appId:app.id});notify(`已演示操作 ${app.name}（${isEnterpriseUser()?'企业多开':'个人单开'}）。`);}
    else notify('请在桌面客户端中操作。');
    return;
  }
  if(!authState.user){go('settings');return;}
  if(modalMode==='launch'&&!isSafeEnvReady()){notify('纯净安全环境下请先点击底部按钮连接，或在我的设置切换自有网络环境。');return;}
  const dialog=document.getElementById('workbench-instance-dialog');
  if(!dialog)return;
  const preferShell=Boolean(browserShellAppMap[app.id])&&!(app.id==='metamuse'&&state.platform==='macos');
  const launchKind=preferShell?'app-shell':'native-agent';
  document.getElementById('workbench-app-id').value=app.id;
  document.getElementById('workbench-launch-kind').value=launchKind;
  document.getElementById('workbench-modal-mode').value=modalMode;
  document.getElementById('workbench-app-label').value=modalMode==='add-account'?`${app.name} · 手动新建应用账号（1 个槽位 = 1 个账号）`:`${app.name} · ${launchKind==='app-shell'?'独立安全应用容器':'隔离实例进程'}`;
  document.getElementById('workbench-instance-title').textContent=modalMode==='add-account'?'手动新建应用账号（1 槽位 = 1 账号）':'配置并启动实例';
  document.getElementById('workbench-submit-btn').textContent=modalMode==='add-account'?'保存账号':'立即启动';
  const emailField=document.getElementById('workbench-account-email-field');
  const planField=document.getElementById('workbench-account-plan-field');
  if(emailField)emailField.hidden=modalMode!=='add-account';
  if(planField)planField.hidden=modalMode!=='add-account';
  const emailInput=document.getElementById('workbench-account-email');
  const planInput=document.getElementById('workbench-account-plan');
  if(emailInput)emailInput.value='';
  if(planInput)planInput.value='';
  const errEl=document.getElementById('workbench-instance-error');
  if(errEl)errEl.textContent='';
  const safePrefix=app.id.replace(/[^a-z0-9_-]/g,'').slice(0,18)||'app';
  const existingCount=modalMode==='add-account'?accountsForApp(app.id).length:(workbench.browserInstances.length+workbench.agentProfiles.length);
  const aliasInput=document.getElementById('workbench-instance-alias');
  const tierHintEl=document.getElementById('workbench-tier-hint');
  if(modalMode==='add-account'){
    if(aliasInput){
      aliasInput.readOnly=false;
      aliasInput.value=existingCount===0?'main':`${safePrefix}-${existingCount+1}`;
    }
    if(tierHintEl)tierHintEl.textContent='可填写账号槽位标识（如 acct-2），保存后可一键切换或「切换并启动」；本机支持多开实例与多账号独立分区。';
  }else{
    configureTierInput(aliasInput,tierHintEl,safePrefix);
    if(aliasInput){aliasInput.value=`${safePrefix}-${existingCount+1}`;}
  }
  dialog.showModal();
}

async function submitWorkbenchInstance(event){
  event.preventDefault();
  const form=event.target;
  if(!form.reportValidity())return;
  const rawAppId=document.getElementById('workbench-app-id').value;
  const launchKind=document.getElementById('workbench-launch-kind').value;
  const modalMode=document.getElementById('workbench-modal-mode')?.value||'launch';
  const rawAlias=document.getElementById('workbench-instance-alias').value.trim();
  const alias=modalMode==='add-account'?(rawAlias||'main'):(isEnterpriseUser()?rawAlias:(rawAlias||'main'));
  const errEl=document.getElementById('workbench-instance-error');
  const submitBtn=document.getElementById('workbench-submit-btn');
  if(errEl)errEl.textContent='';
  if(!/^[a-z][a-z0-9_-]{0,31}$/.test(alias)){
    if(errEl)errEl.textContent='标识只能包含小写字母、数字、下划线或短横线，且以字母开头。';
    return;
  }
  submitBtn.disabled=true;
  try{
    if(modalMode==='add-account'){
      const email=(document.getElementById('workbench-account-email')?.value||'').trim();
      const plan=(document.getElementById('workbench-account-plan')?.value||'').trim();
      const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.add',{appId:rawAppId,alias,label:email||alias,email,plan,source:'manual'});
      if(!res?.ok)throw new Error(res?.error?.message||'账号添加未完成。');
      document.getElementById('workbench-instance-dialog').close();
      await syncDesktopWorkbench();
      notify(`已保存账号槽位 · ${email||alias}`);
      return;
    }
    const safeAlias=alias;
    const activeAccountId=safeAlias||activeAccountForApp(rawAppId)?.id||'main';
    if(launchKind==='app-shell'){
      const targetBrowserApp=browserShellAppMap[rawAppId];
      const res=await globalThis.NoyaDesktop.browser.open(targetBrowserApp,safeAlias,{appShell:true});
      if(!res?.ok)throw new Error(res?.error?.message||'安全容器未能打开。');
      recordLocalEvent('browser_started',{appId:rawAppId,simulated:false});
      document.getElementById('workbench-instance-dialog').close();
      await syncDesktopWorkbench();
      notify(`已打开独立安全容器 · ${safeAlias}`);
      return;
    }
    if(rawAppId==='antigravity'&&globalThis.NoyaDesktop.accounts&&activeAccountForApp('antigravity')){
      await globalThis.NoyaDesktop.accounts.invoke('accounts.switch',{appId:'antigravity',accountId:activeAccountId}).catch(()=>null);
    }
    const bridge=globalThis.NoyaDesktop?.agent;
    const adapterId=desktopAdapterIds[rawAppId]||rawAppId;
    const inspection=await bridge.invoke('agent.inspect',{appId:adapterId});
    if(!inspection?.ok)throw new Error(inspection?.error?.message||'应用环境检测未完成。');
    if(inspection.value.status==='not-installed')throw new Error('本机尚未检测到该客户端安装，请先安装官方客户端或使用安全容器。');
    if(inspection.value.status==='unknown')throw new Error('暂时无法确认客户端可执行路径。');
    const createPayload={alias:safeAlias,appId:adapterId,credentialSlotIds:[]};
    const silentRelay=silentMatchingRelayId(rawAppId);
    if(silentRelay)createPayload.relayId=silentRelay;
    const created=await bridge.invoke('agent.create',createPayload);
    if(!created?.ok&&created?.error?.code!=='PROFILE_ALIAS_CONFLICT')throw new Error(created?.error?.message||'实例创建未完成。');
    const started=await bridge.invoke('agent.start',{instanceId:safeAlias});
    if(!started?.ok)throw new Error(started?.error?.message||'实例启动失败。');
    recordLocalEvent('agent_instance_started',{appId:rawAppId,simulated:false});
    document.getElementById('workbench-instance-dialog').close();
    await syncDesktopWorkbench();
    notify(`应用实例 ${safeAlias} 已受控启动。`);
  }catch(error){
    if(errEl)errEl.textContent=error?.message||'操作未完成。';
  }finally{
    submitBtn.disabled=false;
  }
}

async function submitAddTokenForm(form){
  const errEl=document.getElementById('add-account-error');
  if(errEl)errEl.textContent='';
  const appId=state.addModalAppId||state.activeWorkspaceApp||'antigravity';
  const alias=form.elements.alias.value.trim()||'main';
  const token=form.elements.token.value.trim();
  const email=form.elements.email.value.trim();
  const plan=form.elements.plan.value.trim();
  const btn=form.querySelector('[type=submit]');
  if(btn)btn.disabled=true;
  try{
    const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.importToken',{appId,alias,token,refreshToken:token.startsWith('1//')?token:'',email,plan});
    if(!res?.ok)throw new Error(res?.error?.message||'Token 导入失败。');
    document.getElementById('add-account-dialog')?.close();
    await syncDesktopWorkbench();
    notify(`已校验并保存 ${availableApps().find(a=>a.id===appId)?.name||appId} 账号。`);
  }catch(error){
    if(errEl)errEl.textContent=error?.message||'导入未完成。';
  }finally{
    if(btn)btn.disabled=false;
  }
}

async function submitAddJsonForm(form){
  const errEl=document.getElementById('add-account-error');
  if(errEl)errEl.textContent='';
  const appId=state.addModalAppId||state.activeWorkspaceApp||'antigravity';
  const jsonText=form.elements.jsonText.value.trim();
  const btn=form.querySelector('[type=submit]');
  if(btn)btn.disabled=true;
  try{
    const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.importJson',{appId,jsonText});
    if(!res?.ok)throw new Error(res?.error?.message||'JSON 导入失败。');
    document.getElementById('add-account-dialog')?.close();
    await syncDesktopWorkbench();
    notify(`成功导入 ${res.value?.importedCount||1} 条账号。`);
  }catch(error){
    if(errEl)errEl.textContent=error?.message||'JSON 导入失败。';
  }finally{
    if(btn)btn.disabled=false;
  }
}

async function submitAccountMetaForm(form){
  const errEl=document.getElementById('account-meta-error');
  if(errEl)errEl.textContent='';
  const appId=document.getElementById('meta-app-id').value;
  const accountId=document.getElementById('meta-account-id').value;
  const label=document.getElementById('meta-label-input').value.trim();
  const plan=document.getElementById('meta-plan-input').value.trim();
  const tags=document.getElementById('meta-tags-input').value.split(/[,，]/).map(s=>s.trim()).filter(Boolean).slice(0,10);
  const note=document.getElementById('meta-note-input').value.trim();
  try{
    const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.updateMeta',{appId,accountId,label,plan,tags,note});
    if(!res?.ok)throw new Error(res?.error?.message||'保存失败。');
    document.getElementById('account-meta-dialog')?.close();
    await syncDesktopWorkbench();
    notify('已保存账号标签与备注。');
  }catch(error){
    if(errEl)errEl.textContent=error?.message||'保存失败。';
  }
}

document.addEventListener('submit',async event=>{
  const formId=event.target?.getAttribute?.('id')||'';
  if(formId==='add-token-form'){event.preventDefault();await submitAddTokenForm(event.target);return;}
  if(formId==='add-json-form'){event.preventDefault();await submitAddJsonForm(event.target);return;}
  if(formId==='account-meta-form'){event.preventDefault();await submitAccountMetaForm(event.target);return;}
  if(formId==='group-create-form'){
    event.preventDefault();
    const name=event.target.elements.name.value.trim();
    const color=event.target.elements.color.value||'#2563eb';
    if(!name||!globalThis.NoyaDesktop?.accounts)return;
    const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.groupsSave',{name,color});
    if(res?.ok){
      workbench.groups=res.value.groups||workbench.groups;
      event.target.reset();
      renderGroupManageDialog();
      render();
      notify(`已创建分组「${name}」。`);
    }else notify(res?.error?.message||'创建分组失败。');
    return;
  }
  if(formId==='wakeup-task-form'){
    event.preventDefault();
    if(!globalThis.NoyaDesktop?.accounts)return;
    const f=event.target;
    const errEl=document.getElementById('wakeup-task-error');
    if(errEl)errEl.textContent='';
    const payload={
      ...(f.elements.taskId.value?{id:f.elements.taskId.value}:{}),
      appId:f.elements.appId.value,
      ...(f.elements.accountId.value?{accountId:f.elements.accountId.value}:{}),
      name:f.elements.name.value.trim(),
      scheduleType:f.elements.scheduleType.value,
      intervalMinutes:Number(f.elements.intervalMinutes.value)||60,
      dailyTime:f.elements.dailyTime.value||'09:00',
      action:f.elements.action.value||'refresh_quota',
      enabled:true,
    };
    const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.wakeupSave',payload);
    if(res?.ok){
      workbench.wakeupTasks=res.value.tasks||workbench.wakeupTasks;
      workbench.wakeupHistory=res.value.history||workbench.wakeupHistory;
      document.getElementById('wakeup-task-dialog')?.close();
      render();
      notify('已保存唤醒任务。');
    }else if(errEl)errEl.textContent=res?.error?.message||'保存失败。';
    return;
  }
  if(formId==='auto-refresh-form'){
    event.preventDefault();
    const mins=Number(event.target.elements.autoRefreshMinutes.value)||0;
    state.autoRefreshMinutes=mins;
    scheduleAutoRefresh();
    if(globalThis.NoyaDesktop?.accounts){
      await globalThis.NoyaDesktop.accounts.invoke('accounts.settingsUpdate',{autoRefreshMinutes:mins}).catch(()=>null);
    }
    document.getElementById('auto-refresh-dialog')?.close();
    notify(mins>0?`已开启每 ${mins} 分钟后台自动刷新配额。`:'已关闭自动定时刷新。');
    return;
  }
  if(formId==='new-ticket-form'){
    event.preventDefault();
    if(!globalThis.NoyaDesktop?.tickets?.invoke)return;
    const f=event.target;
    const errEl=document.getElementById('new-ticket-error');
    if(errEl)errEl.textContent='';
    const res=await globalThis.NoyaDesktop.tickets.invoke('tickets.create',{
      category:f.elements.category.value,
      subject:f.elements.subject.value.trim(),
      body:f.elements.body.value.trim(),
      includeDiagnostics:Boolean(f.elements.includeDiagnostics.checked),
    });
    if(res?.ok&&res.value?.ticket){
      f.reset();
      f.elements.includeDiagnostics.checked=true;
      document.getElementById('new-ticket-dialog')?.close();
      state.selectedTicketId=res.value.ticket.ticketId;
      await loadTickets({silent:true});
      await loadTicketDetail(res.value.ticket.ticketId,{silent:true});
      notify('工单已提交，定途运营团队将尽快跟进。');
    }else if(errEl)errEl.textContent=res?.error?.message||'工单提交失败，请重试。';
    return;
  }
  if(formId==='ticket-reply-form'){
    event.preventDefault();
    if(!globalThis.NoyaDesktop?.tickets?.invoke)return;
    const f=event.target;
    const tid=f.elements.ticketId.value;
    const body=f.elements.body?.value.trim()||'';
    if(!tid||!body)return;
    const res=await globalThis.NoyaDesktop.tickets.invoke('tickets.reply',{ticketId:tid,body,action:'reply'});
    if(res?.ok){
      await loadTickets({silent:true});
      await loadTicketDetail(tid,{silent:true});
      notify('回复已发送。');
    }else notify(res?.error?.message||'回复发送失败。');
    return;
  }
  if(formId==='add-oauth-callback-form'){
    event.preventDefault();
    const url=(document.getElementById('oauth-manual-callback')?.value||'').trim();
    if(!state.oauthFlow?.flowId||!url)return;
    const res=await globalThis.NoyaDesktop?.accounts?.invoke('accounts.oauthSubmitCallback',{flowId:state.oauthFlow.flowId,callbackUrl:url});
    if(res?.ok&&(res.value?.status==='completed'||res.value?.status==='authorized')){
      stopOAuthPolling();document.getElementById('add-account-dialog')?.close();state.oauthFlow=null;
      await syncDesktopWorkbench();notify('浏览器 OAuth 回调已完成绑定。');
    }else if(res?.error||res?.value?.error){document.getElementById('add-account-error').textContent=res.error?.message||res.value?.error||'回调验证失败。';}
  }
});

async function launchDesktopInstance(app){
  openWorkbenchModal(app,'launch');
}
function launchSelected(){const app=selectedApplication();if(!isSafeEnvReady()){notify('请先点击下方蓝色按钮连接（或切换至自有网络环境）。');return}if(globalThis.NoyaDesktop){if(!authState.user){notify('请先在浏览器完成定途授权。');return}if(app.mode!=='verified'){notify('该应用模板尚未验证，暂不能启动。');return}launchDesktopInstance(app);return}if(app.mode!=='demo'){useApp(app.id);return}recordLocalEvent('app_demo',{appId:app.id});render();notify(`已演示为 ${app.name} 接入网络并启动，未修改配置或打开真实应用。`)}
function useApp(id){const app=availableApps().find(item=>item.id===id);if(!app)return;if(!isSafeEnvReady()){notify('请先建立连接，再查看工具的使用入口。');return}if(app.mode==='unverified'){explain(app.name+' · 适配待验证',(app.id==='copilot'?'Copilot 的启动需要宿主 IDE；宿主识别、网络适配与启动方式均待验证。':'这里只预览 '+app.name+' 的接入入口；正式版需要验证网络适配、安装检测与启动方式。')+'本原型不会修改配置、下载或打开真实应用。');return}if(app.mode==='web'){explain(app.name+' · 打开方式','连接后，请自行在浏览器访问 '+app.name+' 官方网站，或打开已安装的官方应用。官方账号需独立登录；移动端深链与原生应用启动尚未验证。本原型不会打开应用或网页。'+(app.category==='任务'?' '+app.name+' 云端执行第三方任务时的出口由该平台控制，我们只能控制你访问平台的网络出口。':''));return}launchSelected()}

let composingSearch=false;
document.addEventListener('compositionstart',event=>{if(event.target.matches?.('.library-search,.account-search,.totp-search,.usage-search-input'))composingSearch=true});
document.addEventListener('compositionend',event=>{if(event.target.matches?.('.library-search')){composingSearch=false;state.appSearch=event.target.value;render()}else if(event.target.matches?.('.totp-search')){composingSearch=false;state.totpSearch=event.target.value;render()}else if(event.target.matches?.('.usage-search-input')){composingSearch=false;state.usageSearch=event.target.value;render()}else if(event.target.matches?.('.account-search')){composingSearch=false;state.accountSearch=event.target.value;state.accountPage=1;render()}});
document.addEventListener('input',event=>{
  if(event.target.id==='totp-secret-input'){state.totpInputDraft=event.target.value;return;}
  if(event.target.id==='totp-name-input'){state.totpNameDraft=event.target.value;return;}
  if(composingSearch)return;
  if(event.target.matches?.('.library-search')){state.appSearch=event.target.value;render();}
  else if(event.target.matches?.('.totp-search')){state.totpSearch=event.target.value;render();}
  else if(event.target.matches?.('.usage-search-input')){state.usageSearch=event.target.value;render();}
  else if(event.target.matches?.('.account-search')){state.accountSearch=event.target.value;state.accountPage=1;render();}
});
document.addEventListener('change',async event=>{
  const t=event.target;
  if(t.id==='workspace-platform-select'){
    const nextApp=t.value;
    state.activeWorkspaceApp=nextApp;state.selectedApp=nextApp;state.accountPage=1;state.accountTierFilter='all';state.accountTagFilter='all';state.accountGroupFilter='all';state.selectedAccountIds=[];
    render();return;
  }
  if(t.id==='usage-range-select'){state.usageRange=t.value;if(state.activeWorkspaceApp)void loadUsageForApp(state.activeWorkspaceApp);render();return;}
  if(t.id==='usage-granularity-select'){state.usageGranularity=t.value;if(state.activeWorkspaceApp)void loadUsageForApp(state.activeWorkspaceApp);render();return;}
  if(t.id==='usage-type-select'){state.usageType=t.value;if(state.activeWorkspaceApp)void loadUsageForApp(state.activeWorkspaceApp);render();return;}
  if(t.id==='usage-model-select'){state.usageModel=t.value;if(state.activeWorkspaceApp)void loadUsageForApp(state.activeWorkspaceApp);render();return;}
  if(t.id==='usage-workspace-select'){state.usageWorkspace=t.value;if(state.activeWorkspaceApp)void loadUsageForApp(state.activeWorkspaceApp);render();return;}
  if(t.name==='scheduleType'&&t.closest('#wakeup-task-form')){
    document.getElementById('wakeup-interval-row').hidden=t.value==='daily';
    document.getElementById('wakeup-daily-row').hidden=t.value!=='daily';
    return;
  }
  if(t.hasAttribute('data-group-member-toggle')){
    if(!globalThis.NoyaDesktop?.accounts)return;
    const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.groupsAssign',{
      groupId:t.dataset.groupId,
      appId:t.dataset.appId,
      accountId:t.dataset.accountId,
      member:Boolean(t.checked),
    });
    if(res?.ok){await syncDesktopWorkbench();renderGroupManageDialog();}
    return;
  }
  if(t.id==='account-filter-select'){state.accountFilter=t.value;state.accountPage=1;render();return;}
  if(t.id==='account-sort-select'){state.accountSort=t.value;render();return;}
  if(t.dataset?.accountSelect){
    const id=t.dataset.accountSelect;
    const next=new Set(state.selectedAccountIds||[]);
    if(t.checked)next.add(id);else next.delete(id);
    state.selectedAccountIds=[...next];render();return;
  }
  if(t.dataset?.totpSelect){
    const id=t.dataset.totpSelect;
    const next=new Set(state.totpSelectedIds||[]);
    if(t.checked)next.add(id);else next.delete(id);
    state.totpSelectedIds=[...next];render();return;
  }
});
document.addEventListener('click',event=>{
if(state.platformDropdownOpen&&!event.target.closest('.platform-dropdown-wrap')){
  state.platformDropdownOpen=false;
  render();
}
const target=event.target.closest('button,a[data-page],a[data-official-app],[data-action],[data-open-workspace],[data-overview-select-app],[data-toggle-pin],[data-workspace-tab],[data-select-workspace-platform],[data-usage-range],[data-usage-metric],[data-account-view],[data-account-filter],[data-group-filter],[data-tier-filter],[data-tag-filter],[data-account-page],[data-add-tab],[data-totp-tab],[data-ticket-status-filter],[data-toggle-acceleration]');if(!target)return;
if(target.dataset.overviewSelectApp){
  const appId=target.dataset.overviewSelectApp;
  state.selectedApp=appId;
  devicePreferences.selectedApps[state.platform]=appId;
  saveDevicePreferences('');
  return;
}
if(target.dataset.openWorkspace){const nextApp=target.dataset.openWorkspace;state.page='connection';state.libraryExpanded=false;state.activeWorkspaceApp=nextApp;state.workspaceTab='accounts';state.platformDropdownOpen=false;state.accountSearch='';state.accountFilter='all';state.accountGroupFilter='all';state.accountTierFilter='all';state.accountTagFilter='all';state.accountPage=1;state.selectedAccountIds=[];state.selectedApp=nextApp;render();void loadUsageForApp(nextApp);document.getElementById('main-content').focus({preventScroll:true});return;}
if(target.dataset.selectWorkspacePlatform){const nextApp=target.dataset.selectWorkspacePlatform;state.activeWorkspaceApp=nextApp;state.selectedApp=nextApp;state.platformDropdownOpen=false;state.accountPage=1;state.accountGroupFilter='all';state.accountTierFilter='all';state.accountTagFilter='all';state.selectedAccountIds=[];state.usageModel='all';state.usageWorkspace='all';render();void loadUsageForApp(nextApp);return;}
if(target.dataset.togglePin){const pinId=target.dataset.togglePin;if(state.pinnedApps.includes(pinId)){savePinnedApps(state.pinnedApps.filter(x=>x!==pinId));notify('已从左侧常用接入中取消固定。');}else{savePinnedApps([...state.pinnedApps,pinId]);notify('已固定到左侧常用接入与概览页。');}render();return;}
if(target.dataset.ticketStatusFilter){state.ticketStatusFilter=target.dataset.ticketStatusFilter;void loadTickets();return;}
if(target.dataset.workspaceTab){state.workspaceTab=target.dataset.workspaceTab;if(state.workspaceTab==='usage'&&state.activeWorkspaceApp)void loadUsageForApp(state.activeWorkspaceApp);if(state.workspaceTab==='wakeup'&&globalThis.NoyaDesktop?.accounts&&state.activeWorkspaceApp){void globalThis.NoyaDesktop.accounts.invoke('accounts.wakeupList',{appId:state.activeWorkspaceApp}).then(r=>{if(r?.ok){workbench.wakeupTasks=r.value.tasks||[];workbench.wakeupHistory=r.value.history||[];render();}});}render();return;}
if(target.dataset.usageRange){state.usageRange=target.dataset.usageRange;if(state.activeWorkspaceApp)void loadUsageForApp(state.activeWorkspaceApp);render();return;}
if(target.dataset.usageMetric){state.usageTrendMetric=target.dataset.usageMetric;render();return;}
if(target.dataset.accountView){state.accountViewMode=target.dataset.accountView;render();return;}
if(target.dataset.accountFilter){state.accountFilter=target.dataset.accountFilter;state.accountPage=1;render();return;}
if(target.dataset.groupFilter){state.accountGroupFilter=state.accountGroupFilter===target.dataset.groupFilter?'all':target.dataset.groupFilter;state.accountTierFilter='all';state.accountTagFilter='all';state.accountPage=1;render();return;}
if(target.dataset.tierFilter){state.accountTierFilter=target.dataset.tierFilter;state.accountGroupFilter='all';state.accountTagFilter='all';state.accountPage=1;render();return;}
if(target.dataset.tagFilter){state.accountTagFilter=state.accountTagFilter===target.dataset.tagFilter?'all':target.dataset.tagFilter;state.accountPage=1;render();return;}
if(target.dataset.accountPage){state.accountPage=Math.max(1,state.accountPage+(target.dataset.accountPage==='next'?1:-1));render();return;}
if(target.dataset.addTab){state.addModalTab=target.dataset.addTab;renderAddAccountDialogBody();return;}
if(target.dataset.totpTab){state.totpTab=target.dataset.totpTab;state.totpSelectedIds=[];render();return;}
if(target.hasAttribute('data-toggle-acceleration')){workbench.useManagedAcceleration=!workbench.useManagedAcceleration;render();notify(workbench.useManagedAcceleration?'已启用后台托管加速通道。':'已切换为原应用直连。');return;}
if(target.dataset.officialApp&&globalThis.NoyaDesktop){event.preventDefault();const appId=officialPortalBrowserMap[target.dataset.officialApp];openBrowserTest(appId||null);return}
if(target.dataset.officialApp){recordLocalEvent('app_opened',{appId:target.dataset.officialApp,simulated:false});setTimeout(()=>render(),0);return}
if(target.dataset.page){event.preventDefault();go(target.dataset.page);return}
if(target.dataset.category){state.appCategory=target.dataset.category;devicePreferences.categories[state.platform]=state.appCategory;saveDevicePreferences('');return}
if(target.dataset.selectApp){state.selectedApp=target.dataset.selectApp;devicePreferences.selectedApps[state.platform]=state.selectedApp;saveDevicePreferences('');return}
if(target.dataset.setting){if(!authState.user){go('settings');return}const key=target.dataset.setting;state.settings[key]=!state.settings[key];target.setAttribute('aria-checked',state.settings[key]);saveDevicePreferences();return}
if(target.dataset.themeChoice){setTheme(target.dataset.themeChoice);return}
const action=target.dataset.action;
if(action==='back-overview'){state.page='connection';state.libraryExpanded=false;state.activeWorkspaceApp=null;render();return;}
if(action==='toggle-privacy-mask'){state.privacyMask=!state.privacyMask;render();notify(state.privacyMask?'已开启隐私模式（隐藏邮箱标识）。':'已关闭隐私模式。');return;}
if(action==='toggle-sort-dir'){state.accountSortDir=state.accountSortDir==='asc'?'desc':'asc';render();return;}
if(action==='toggle-select-all-accounts'){
  const appAccts=accountsForApp(state.activeWorkspaceApp);
  state.selectedAccountIds=(state.selectedAccountIds||[]).length===appAccts.length?[]:appAccts.map(a=>a.id);
  render();return;
}
if(action==='batch-remove-accounts'){void batchRemoveAppAccounts(target.dataset.appId||state.activeWorkspaceApp);return;}
if(action==='export-app-accounts'){void exportAccountsJson(target.dataset.appId||state.activeWorkspaceApp);return;}
if(action==='export-single-account'){void exportAccountsJson(target.dataset.appId,[target.dataset.accountId]);return;}
if(action==='refresh-single-quota'){void refreshQuotas(target.dataset.appId,target.dataset.accountId);return;}
if(action==='open-add-account-dialog'){openAddAccountDialog(target.dataset.appId||state.activeWorkspaceApp);return;}
if(action==='close-add-account-dialog'){stopOAuthPolling();state.oauthFlow=null;document.getElementById('add-account-dialog')?.close();return;}
if(action==='start-oauth-flow'){void startOAuthFlowFromModal(target.dataset.appId||state.addModalAppId);return;}
if(action==='copy-oauth-url'){
  void copyOAuthAuthorizationUrl(target);
  return;
}
if(action==='cancel-oauth-flow'){
  const fid=state.oauthFlow?.flowId;stopOAuthPolling();state.oauthFlow=null;
  if(fid)void globalThis.NoyaDesktop?.accounts?.invoke('accounts.oauthCancel',{flowId:fid}).catch(()=>null);
  renderAddAccountDialogBody();return;
}
if(action==='confirm-local-import-modal'){document.getElementById('add-account-dialog')?.close();void importLocalAccount(target.dataset.appId||state.addModalAppId);return;}
if(action==='open-account-meta'){openAccountMetaDialog(target.dataset.appId||state.activeWorkspaceApp,target.dataset.accountId);return;}
if(action==='close-meta-dialog'){document.getElementById('account-meta-dialog')?.close();return;}
if(action==='inspect-account-detail'){
  const acct=accountsForApp(target.dataset.appId).find(a=>a.id===target.dataset.accountId);
  if(acct)explain('账号详情 · '+(acct.email||acct.label||acct.id),`槽位：${acct.id} · 来源：${acct.source} · 等级：${acct.plan||'标准'} · 标签：${(acct.tags||[]).join(', ')||'无'} · 备注：${acct.note||'无'}`);
  return;
}
if(action==='telemetry-sync-now'){void syncTelemetryNow();return;}
if(action==='open-new-ticket-dialog'){document.getElementById('new-ticket-error').textContent='';document.getElementById('new-ticket-dialog')?.showModal();return;}
if(action==='close-new-ticket-dialog'){document.getElementById('new-ticket-dialog')?.close();return;}
if(action==='refresh-tickets'){void loadTickets();return;}
if(action==='select-ticket'){void loadTicketDetail(target.dataset.ticketId);return;}
if(action==='ticket-close'||action==='ticket-reopen'){
  const tid=target.dataset.ticketId;if(!tid||!globalThis.NoyaDesktop?.tickets?.invoke)return;
  const act=action==='ticket-close'?'close':'reopen';
  void globalThis.NoyaDesktop.tickets.invoke('tickets.reply',{ticketId:tid,action:act,body:''}).then(r=>{
    if(r?.ok){void loadTickets({silent:true});void loadTicketDetail(tid,{silent:true});notify(act==='close'?'已关闭该工单。':'已重新打开工单。');}
    else notify(r?.error?.message||'操作未完成。');
  });
  return;
}
if(action==='toggle-platform-dropdown'){state.platformDropdownOpen=!state.platformDropdownOpen;render();return;}
if(action==='toggle-switch-history'){const k=target.dataset.accountKey;if(k){state.expandedSwitchHistory[k]=!state.expandedSwitchHistory[k];render();}return;}
if(action==='overview-spare-prev'||action==='overview-spare-next'){
  const appId=target.dataset.appId||state.selectedApp;
  const appAccts=accountsForApp(appId);
  const active=activeAccountForApp(appId);
  const spares=appAccts.filter(a=>!active||a.id!==active.id);
  if(spares.length>1){
    const cur=Number(state.overviewSpareIndexByApp?.[appId])||0;
    const delta=action==='overview-spare-next'?1:-1;
    state.overviewSpareIndexByApp[appId]=((cur+delta)%spares.length+spares.length)%spares.length;
    render();
  }
  return;
}
if(action==='open-ag-launch-dialog'){openAntigravityLaunchDialog(target.dataset.appId||'antigravity',target.dataset.accountId||'main');return;}
if(action==='open-group-manage-dialog'){openGroupManageDialog();return;}
if(action==='close-group-dialog'){document.getElementById('group-manage-dialog')?.close();return;}
if(action==='delete-custom-group'){
  const gid=target.dataset.groupId;if(!gid||!globalThis.NoyaDesktop?.accounts)return;
  void globalThis.NoyaDesktop.accounts.invoke('accounts.groupsRemove',{id:gid}).then(r=>{if(r?.ok){workbench.groups=r.value.groups||[];return syncDesktopWorkbench().then(()=>{renderGroupManageDialog();notify('已删除分组。');});}});return;
}
if(action==='open-auto-refresh-dialog'){openAutoRefreshDialog();return;}
if(action==='close-auto-refresh-dialog'){document.getElementById('auto-refresh-dialog')?.close();return;}
if(action==='open-wakeup-dialog'){openWakeupDialog(target.dataset.appId||state.activeWorkspaceApp);return;}
if(action==='edit-wakeup-dialog'){openWakeupDialog(state.activeWorkspaceApp,target.dataset.taskId);return;}
if(action==='close-wakeup-dialog'){document.getElementById('wakeup-task-dialog')?.close();return;}
if(action==='toggle-wakeup-task'){
  if(!globalThis.NoyaDesktop?.accounts)return;
  void globalThis.NoyaDesktop.accounts.invoke('accounts.wakeupToggle',{id:target.dataset.taskId,enabled:target.dataset.enabled==='true'}).then(r=>{if(r?.ok){workbench.wakeupTasks=r.value.tasks||[];workbench.wakeupHistory=r.value.history||[];render();}});return;
}
if(action==='run-wakeup-task'){
  if(!globalThis.NoyaDesktop?.accounts)return;
  void globalThis.NoyaDesktop.accounts.invoke('accounts.wakeupRunNow',{id:target.dataset.taskId}).then(r=>{if(r?.ok){workbench.wakeupTasks=r.value.tasks||[];workbench.wakeupHistory=r.value.history||[];void syncDesktopWorkbench();notify('唤醒任务执行完成。');}else notify(r?.error?.message||'执行失败。');});return;
}
if(action==='delete-wakeup-task'){
  if(!globalThis.NoyaDesktop?.accounts)return;
  void globalThis.NoyaDesktop.accounts.invoke('accounts.wakeupRemove',{id:target.dataset.taskId}).then(r=>{if(r?.ok){workbench.wakeupTasks=r.value.tasks||[];workbench.wakeupHistory=r.value.history||[];render();notify('已删除唤醒任务。');}});return;
}
if(action==='refresh-local-usage'){if(state.activeWorkspaceApp)void loadUsageForApp(state.activeWorkspaceApp,{forceRescan:false});return;}
if(action==='force-rescan-usage'){if(state.activeWorkspaceApp)void loadUsageForApp(state.activeWorkspaceApp,{forceRescan:true}).then(()=>notify('已完成全量重扫。'));return;}
if(action==='pick-usage-dir'){
  const appId=target.dataset.appId||state.activeWorkspaceApp;
  if(!appId||!globalThis.NoyaDesktop?.accounts)return;
  void globalThis.NoyaDesktop.accounts.invoke('accounts.usageSetDir',{appId,pick:true}).then(r=>{if(r?.ok&&!r.value?.cancelled){void loadUsageForApp(appId,{forceRescan:true});notify(`已切换数据目录：${r.value.dirPath}`);}});return;
}
if(action==='reset-usage-dir'){
  const appId=target.dataset.appId||state.activeWorkspaceApp;
  if(!appId||!globalThis.NoyaDesktop?.accounts)return;
  void globalThis.NoyaDesktop.accounts.invoke('accounts.usageSetDir',{appId,reset:true}).then(r=>{if(r?.ok){void loadUsageForApp(appId,{forceRescan:true});notify('已恢复默认扫描目录。');}});return;
}
if(action==='close-ag-launch-dialog'){document.getElementById('antigravity-launch-dialog')?.close();return;}
if(action==='switch-and-launch-account'){
  void switchAppAccount(target.dataset.appId||state.activeWorkspaceApp||state.selectedApp,target.dataset.accountId||'main',true);return;
}
if(action==='confirm-ag-switch-and-launch'||action==='confirm-ag-switch-and-launch-cli'||action==='confirm-ag-switch-only'){
  const dlg=document.getElementById('antigravity-launch-dialog');
  const appId=dlg?.dataset.appId||'antigravity';const accountId=dlg?.dataset.accountId||'main';
  dlg?.close();void switchAppAccount(appId,accountId,action!=='confirm-ag-switch-only',{forceCli:action==='confirm-ag-switch-and-launch-cli'});return;
}
if(action==='totp-qr-upload'){void handleTotpQrUpload();return;}
if(action==='totp-qr-export'){void handleTotpQrExport();return;}
if(action==='close-totp-qr-dialog'){closeTotpQrDialog();return;}
if(action==='confirm-totp-qr-import'){
  if(!globalThis.NoyaDesktop?.accounts||!pendingTotpQrEntries.length)return;
  void (async()=>{
    let okCount=0;
    for(const item of pendingTotpQrEntries){
      const res=await globalThis.NoyaDesktop.accounts.invoke('accounts.totpSave',{input:item.uri,name:item.name||item.issuer||'导入账号'}).catch(()=>null);
      if(res?.ok){okCount+=1;workbench.totpSaved=res.value.saved||workbench.totpSaved;workbench.totpHistory=res.value.history||workbench.totpHistory;}
    }
    closeTotpQrDialog();
    render();
    notify(`已从二维码导入 ${okCount} 条 2FA 秘钥。`);
  })();
  return;
}
if(action==='totp-query'){void handleTotpAction('query');return;}
if(action==='totp-save'){void handleTotpAction('save');return;}
if(action==='totp-export'){void handleTotpAction('export');return;}
if(action==='totp-import'){
  const fi=document.createElement('input');fi.type='file';fi.accept='.json,application/json';
  fi.onchange=async()=>{const f=fi.files?.[0];if(!f)return;try{const jsonText=await f.text();const res=await globalThis.NoyaDesktop?.accounts?.invoke('accounts.totpImport',{jsonText});if(!res?.ok)throw new Error(res?.error?.message||'导入失败');workbench.totpSaved=res.value.saved||workbench.totpSaved;render();notify(`成功导入 ${res.value.importedCount||0} 条 2FA 秘钥。`);}catch(err){notify(err?.message||'导入失败');}};
  fi.click();return;
}
if(action==='copy-totp-code'){
  const code=target.dataset.code||'';
  if(code){
    if(navigator.clipboard?.writeText){
      navigator.clipboard.writeText(code).then(()=>notify(`已复制动态码：${code}`)).catch(()=>notify(`自动复制不可用，请手动复制动态码：${code}`));
    }else{
      notify(`自动复制不可用，请手动复制动态码：${code}`);
    }
  }
  return;
}
if(action==='delete-totp-row'){
  const id=target.dataset.totpId;if(!id)return;
  void globalThis.NoyaDesktop?.accounts?.invoke('accounts.totpRemove',{ids:[id],target:state.totpTab==='history'?'history':'saved'}).then(res=>{if(res?.ok){workbench.totpSaved=res.value.saved;workbench.totpHistory=res.value.history;render();notify('已删除 2FA 条目。');}});return;
}
if(action==='totp-select-all'){
  const list=state.totpTab==='history'?(workbench.totpHistory||[]):(workbench.totpSaved||[]);
  state.totpSelectedIds=(state.totpSelectedIds||[]).length===list.length?[]:list.map(x=>x.id);
  render();return;
}
if(action==='totp-batch-delete'){
  const ids=(state.totpSelectedIds||[]).filter(Boolean);if(!ids.length)return;
  void globalThis.NoyaDesktop?.accounts?.invoke('accounts.totpRemove',{ids,target:state.totpTab==='history'?'history':'saved'}).then(res=>{if(res?.ok){state.totpSelectedIds=[];workbench.totpSaved=res.value.saved;workbench.totpHistory=res.value.history;render();notify(`已删除 ${res.value.removedCount||ids.length} 条 2FA 条目。`);}});return;
}
if(action==='refresh-all-quotas'){void refreshQuotas(null);return;}if(action==='refresh-app-quotas'){void refreshQuotas(target.dataset.appId||state.activeWorkspaceApp);return;}if(action==='sync-local-accounts'){void importLocalAccount(null);return;}if(action==='import-local-account'){void importLocalAccount(target.dataset.appId||state.activeWorkspaceApp);return;}if(action==='open-add-account-modal'){stopOAuthPolling();state.oauthFlow=null;document.getElementById('add-account-dialog')?.close();const app=availableApps().find(a=>a.id===(target.dataset.appId||state.activeWorkspaceApp))||selectedApplication();openWorkbenchModal(app,'add-account');return;}if(action==='launch-workspace-app'||action==='quick-launch-app'){void quickLaunchApp(target.dataset.appId||state.activeWorkspaceApp);return;}if(action==='quick-switch-app'){void quickSwitchApp(target.dataset.appId);return;}if(action==='switch-app-account'){void switchAppAccount(target.dataset.appId,target.dataset.accountId,false);return;}if(action==='switch-and-launch-account'){void switchAppAccount(target.dataset.appId,target.dataset.accountId,true);return;}if(action==='remove-app-account'){void removeAppAccount(target.dataset.appId,target.dataset.accountId);return;}if(action==='open-workbench-modal'){const app=availableApps().find(a=>a.id===target.dataset.appId)||selectedApplication();openWorkbenchModal(app,'launch');return;}if(action==='refresh-workbench'){void syncDesktopWorkbench();return;}if(action==='focus-browser-instance'){void globalThis.NoyaDesktop?.browser?.open(target.dataset.appId,target.dataset.instanceId).then(()=>syncDesktopWorkbench());return;}if(action==='close-browser-instance'){void globalThis.NoyaDesktop?.browser?.close?.(target.dataset.appId,target.dataset.instanceId).then(()=>syncDesktopWorkbench()).then(()=>notify('已关闭安全容器实例。'));return;}if(action==='start-agent-instance'){void globalThis.NoyaDesktop?.agent?.invoke('agent.start',{instanceId:target.dataset.instanceId}).then(res=>{if(!res?.ok)notify(res?.error?.message||'实例启动失败。');return syncDesktopWorkbench();});return;}if(action==='stop-agent-instance'){void globalThis.NoyaDesktop?.agent?.invoke('agent.stop',{instanceId:target.dataset.instanceId}).then(()=>syncDesktopWorkbench()).then(()=>notify('已发送停止信号。'));return;}if(action==='remove-agent-instance'){void globalThis.NoyaDesktop?.agent?.invoke('agent.remove',{instanceId:target.dataset.instanceId}).then(res=>{if(!res?.ok)notify(res?.error?.message||'实例移除失败。');return syncDesktopWorkbench();});return;}if(action==='reload-catalog'){loadCatalog();return}if(action==='toggle-app-library'){const wasConnection=state.page==='connection'&&!state.activeWorkspaceApp;state.page='connection';state.activeWorkspaceApp=null;state.libraryExpanded=wasConnection?!state.libraryExpanded:true;window.history.pushState({assistantLibrary:state.libraryExpanded},'','#connection');render();document.getElementById('main-content').focus({preventScroll:true});return}if(action==='app-guide'){go('help');return}if(action==='download-diagnostic'){downloadDiagnostic();return}if(action==='copy-diagnostic'){copyDiagnostic();return}if(action==='clear-events'){requestLocalConfirmation('clear-events');return}if(action==='reset-preferences'){requestLocalConfirmation('reset-preferences');return}if(action==='confirm-local'){confirmLocalAction();return}if(action==='cancel-local'){pendingLocalAction=null;document.getElementById('local-confirm-dialog').close();return}if(action==='clear-library'){state.appCategory='全部';state.appSearch='';render();return}if(action==='login'){openAssistantAuth();return}if(action==='change-password'){openPasswordChange();return}if(action==='close-password'){closePasswordChange();return}if(action==='refresh-auth'){refreshAuth();return}if(action==='logout'){logoutAccount();return}if(action==='permission-help'){explain('系统网络权限 · '+platform().label,platform().mobile?'正式客户端添加 VPN 配置前会由系统询问授权。你可以取消；本原型不会调用系统权限或创建 VPN 配置。':state.platform==='macos'?'正式客户端可能需要批准网络扩展或 VPN 配置，具体接入方式待验证。本原型不会请求权限或修改系统。':'正式客户端可能需要网络组件或管理员权限，具体取决于接入方式。本原型不会请求管理员权限或修改系统代理。');return}if(action==='toggle-theme'){setTheme(state.theme==='dark'?'light':'dark');return}if(action==='notifications'){go('notifications');return}if(action==='grant-permission'){document.getElementById('permission-dialog').close();state.permissionGranted=true;connect();const cancel=document.getElementById('dock-connect');if(cancel)cancel.focus({preventScroll:true})}if(action==='cancel-permission'){document.getElementById('permission-dialog').close();recordLocalEvent('permission_cancelled');render();notify('已取消模拟授权，未建立连接。')}if(action==='launch-selected')launchSelected();if(action==='connect')connect();if(action==='close-dialog')document.getElementById('info-dialog').close();if(action==='reset'){state.scenario='normal';state.permissionGranted=false;document.getElementById('scenario-select').value='normal';resetConnection(true);notify('网络演示已重置，真实账号保持不变。')}if(action==='help')go('help');if(action==='account'){if(state.page!=='settings'){go('settings')}else if(!authState.user){openAssistantAuth()}else{const details=document.getElementById('assistant-account-details');if(details){details.open=!details.open;details.querySelector('summary').focus({preventScroll:true})}}}if(action==='spare')explain('专属备用说明','本页只有网络交互演示，不表示你的账号已拥有备用资源。真实资源应在主站按购买与分配结果展示。')});
document.addEventListener('keydown',event=>{const target=event.target.closest?.('[data-action=account]');if(!target||!['Enter',' '].includes(event.key))return;event.preventDefault();if(state.page!=='settings')go('settings');else if(!authState.user)openAssistantAuth()});
function showPermission(){document.getElementById('permission-heading').textContent=platform().mobile?'首次连接 · VPN 授权':'首次连接 · 网络权限';document.getElementById('permission-copy').textContent=platform().mobile?`${platform().label} 正式客户端建立隧道前，会由系统询问是否允许添加 VPN 配置。确认后仍使用服务端分配的身份与独立出口。这里只模拟授权流程，不会调用系统设置。`:state.platform==='macos'?'macOS 正式客户端可能需要批准网络扩展或 VPN 配置；具体取决于客户端接入方式。这里只预览权限说明，不会请求系统权限或修改配置。':'Windows 正式客户端可能需要网络组件或管理员授权；具体取决于接入方式。这里只预览权限说明，不会请求管理员权限或修改系统代理。';document.getElementById('permission-dialog').showModal()}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]'),action=button?.dataset.action;
  if(action==='load-identities'){loadMoreIdentities();return;}
  if(action==='refresh-overview'){loadOverview();return;}
  if(!['credential-pool-refresh','credential-pool-revoke'].includes(action))return;
  if(accountOverview.phase!=='ready'||authState.user?.customerType!=='enterprise'||!['owner','admin'].includes(authState.user.memberRole))return;
  try{
    const result=action==='credential-pool-refresh'?credentialPool.load():credentialPool.revoke(button.dataset.slotId);
    credentialPoolAvailable=result.ok;
    render();
    notify(result.ok?(action==='credential-pool-refresh'?'已刷新本机槽位元数据，未读取凭据。':'槽位已停用，系统安全存储中的凭据保留。'):'本机存储不可用，状态仅在当前页面生效。');
  }catch{notify('本机槽位操作未完成，请刷新账号后重试。');}
});
document.getElementById('platform-select').addEventListener('change',event=>{state.platform=event.target.value;state.permissionGranted=false;apps=data.mainSite?[]:catalogApi.previewApps();applyPlatformPreferences();document.getElementById('permission-dialog').close();resetConnection(true);loadCatalog();notify('已切换到 '+platform().label+'，模拟连接已重置。')});
document.getElementById('theme-toggle').addEventListener('click',()=>setTheme(state.theme==='light'?'dark':'light'));
document.getElementById('scenario-select').addEventListener('change',event=>{state.scenario=event.target.value;resetConnection();notify(state.scenario==='expired'?'已展示套餐到期场景。':'场景已切换，点击连接查看结果。')});
document.getElementById('local-confirm-dialog').addEventListener('cancel',()=>{pendingLocalAction=null});
document.getElementById('info-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget){const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)event.currentTarget.close()}});
const browserAgent=typeof navigator==='undefined'?'':navigator.userAgent;
if(globalThis.NoyaDesktop?.platform&&platforms[globalThis.NoyaDesktop.platform])state.platform=globalThis.NoyaDesktop.platform;
else if(/iPhone|iPad|iPod/.test(browserAgent)||(/Macintosh/.test(browserAgent)&&typeof navigator!=='undefined'&&navigator.maxTouchPoints>1))state.platform='ios';
else if(/Android/.test(browserAgent))state.platform='android';
else if(/Macintosh|Mac OS X/.test(browserAgent))state.platform='macos';
else if(/Linux/.test(browserAgent))state.platform='linux';
document.getElementById('platform-select').value=state.platform;
state.page=routeFromHash();settingsAuthPromptPending=state.page==='settings'&&!authState.user;
if(window.location.hash!=='#'+state.page)window.history.replaceState(null,'','#'+state.page);
if(globalThis.NoyaDesktop&&!apps.length)loadDesktopBuiltinCatalog(state.platform,false);
applyPlatformPreferences();
if(!storageAvailable){recordLocalEvent('storage_unavailable',{simulated:false});notify('浏览器存储不可用，偏好仅在本次页面生效。')}
showLaunchPromotion();
render();
document.documentElement.dataset.appReady='true';
if(!isMainSite||globalThis.NoyaDesktop)loadCatalog();
if(globalThis.NoyaDesktop){
  void syncDesktopWorkbench();
  if(globalThis.NoyaDesktop.accounts?.onUpdated){
    globalThis.NoyaDesktop.accounts.onUpdated(()=>{void syncDesktopWorkbench();});
  }
}
if(isMainSite)refreshAuth();
