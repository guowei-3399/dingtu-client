(function(root){
  'use strict';
  const PLATFORMS=['windows','macos','linux','ios','android'];
  const STATUS=['verified','beta','unverified','hidden'];
  const ADAPTER=['env-launch','electron-launch','app-server','electron-profile','system-proxy','tun','pac','mobile-vpn-app-rule','https-web'];
  const CATEGORY=['coding','general','task'];
  const ASSET_MIME={'image/png':'png','image/svg+xml':'svg'};
  const INJECTION_ENV=['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','WS_PROXY','WSS_PROXY'];
  const localPlaceholder=value=>typeof value==='string'?value.replace(/\{\{local\.(httpProxy|httpsProxy|socks5Proxy|noProxy)\}\}/g,(_m,name)=>({httpProxy:'{{local.http}}',httpsProxy:'{{local.https}}',socks5Proxy:'{{local.socks5}}',noProxy:'{{local.host}}'}[name])):value;
  const ACCOUNT_MODES=['none','config-dir','app-server-external-token','electron-profile'];
  const ACCOUNT_ROTATION=['disabled','request-boundary'];
  const ACCOUNT_RESTART=['none','new-session','required'];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const text=(value,max=6000)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
  const safeId=value=>typeof value==='string'&&/^[a-z0-9-]{1,64}$/.test(value);
  const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password}catch{return false}};
  const shellLike=value=>/^(?:sh|bash|zsh|fish|cmd|cmd\.exe|powershell|pwsh)$/i.test(value);
  function validateAccount(account){
    if(account===undefined||account===null)return null;
    if(!account||typeof account!=='object'||Array.isArray(account)||!text(account.provider,64)||!/^[a-z][a-z0-9._-]*$/.test(account.provider)||!ACCOUNT_MODES.includes(account.mode)||!ACCOUNT_ROTATION.includes(account.rotation)||!ACCOUNT_RESTART.includes(account.restart))throw new Error('CATALOG_TEMPLATE_INVALID');
    if(account.mode==='none'&&(account.rotation!=='disabled'||account.restart!=='none'))throw new Error('CATALOG_TEMPLATE_INVALID');
    if(account.mode!=='none'&&account.rotation==='disabled'&&account.restart!=='none')throw new Error('CATALOG_TEMPLATE_INVALID');
    return {provider:account.provider,mode:account.mode,rotation:account.rotation,restart:account.restart};
  }
  function validateTemplate(template){
    if(!template||typeof template!=='object'||Array.isArray(template))throw new Error('CATALOG_TEMPLATE_INVALID');
    if(!STATUS.includes(template.status)||!ADAPTER.includes(template.adapter)||!Number.isSafeInteger(template.templateRevision)||template.templateRevision<1||typeof template.notes!=='string')throw new Error('CATALOG_TEMPLATE_INVALID');
    if(template.detect!==null){if(!template.detect||!['executable','bundle','package'].includes(template.detect.kind)||!Array.isArray(template.detect.names)||!template.detect.names.every(x=>typeof x==='string'&&x.length>0&&x.length<=80))throw new Error('CATALOG_TEMPLATE_INVALID');}
    if(template.launch!==null){const validArg=x=>typeof x==='string'&&x.length<=200&&!/[\s\r\n]/.test(x)&&(!/[{}]/.test(x)||(/^--proxy-server=\{\{local\.(?:http|https|socks5)\}\}$/.test(x)&&template.adapter==='electron-launch')||(template.adapter==='system-proxy'&&x==='{{local.cursorExecutable}}'));if(!template.launch||template.launch.kind!=='exec'||!Array.isArray(template.launch.argv)||!template.launch.argv.length||!template.launch.argv.every(validArg)||shellLike(template.launch.argv[0]))throw new Error('CATALOG_TEMPLATE_INVALID');template.launch.argv=template.launch.argv.map(localPlaceholder);const env=template.launch.env;if(!env||typeof env!=='object'||Array.isArray(env)||!Object.keys(env).every(k=>INJECTION_ENV.includes(k)&&/^\{\{local\.(?:http|https|socks5|host|port|httpProxy|httpsProxy|socks5Proxy|noProxy)\}\}$/.test(env[k])))throw new Error('CATALOG_TEMPLATE_INVALID');template.launch.env=Object.fromEntries(Object.entries(env).map(([key,value])=>[key,localPlaceholder(value)]));}
    const account=validateAccount(template.account);
    if(template.packageName!==null&&(!text(template.packageName,200)||/[\s/\\]/.test(template.packageName)))throw new Error('CATALOG_TEMPLATE_INVALID');
    if(template.openUri!==null&&!https(template.openUri))throw new Error('CATALOG_TEMPLATE_INVALID');
    if(template.verifiedAt!==null&&!Number.isFinite(Date.parse(template.verifiedAt)))throw new Error('CATALOG_TEMPLATE_INVALID');
    if(template.verifiedClientVersion!==null&&!text(template.verifiedClientVersion,80))throw new Error('CATALOG_TEMPLATE_INVALID');
    if(template.status==='verified'&&(template.verifiedAt===null||template.verifiedClientVersion===null))throw new Error('CATALOG_TEMPLATE_INVALID');
    if(account)template.account=account;
    return template;
  }
  const BUNDLED_LOGO_BRANDS=new Set(['claude','openai','gemini','grok','cursor','copilot','meta','manus']);
  const VISUAL_PRESETS=Object.freeze({
    antigravity:{icon:'spark',color:'blue'},
    windsurf:{icon:'cursor',color:'cyan'},
    kiro:{icon:'spark',color:'purple'},
    'grok-cli':{icon:'terminal',color:'orange'},
  });
  function normalize(payload,platform){
    if(!payload||payload.data_source!=='real'||!Number.isSafeInteger(payload.catalogRevision)||payload.catalogRevision<1||typeof payload.generatedAt!=='string'||!Number.isFinite(Date.parse(payload.generatedAt))||typeof payload.checksum!=='string'||!/^[0-9a-f]{64}$/.test(payload.checksum)||payload.platform!==platform||!Array.isArray(payload.apps))throw new Error('CATALOG_INVALID');
    const seen=new Set();
    const apps=payload.apps.map(item=>{
      if(!item||!safeId(item.appId)||seen.has(item.appId)||!text(item.name,160)||!CATEGORY.includes(item.category)||typeof item.featured!=='boolean'||!item.logo||!safeId(item.logo.assetId)||!/^[0-9a-f]{64}$/.test(item.logo.sha256)||!ASSET_MIME[item.logo.mime]||!https(item.officialUrl)||!item.platforms)throw new Error('CATALOG_INVALID');
      seen.add(item.appId);const template=validateTemplate(item.platforms[platform]);const status=template.status;if(status==='hidden')return null;
      const mode=status==='verified'?'verified':status==='beta'?'beta':'unverified';
      const preset=VISUAL_PRESETS[item.appId]||{icon:'grid',color:'blue'};
      return {id:item.appId,name:item.name,short:item.name,category:item.category==='coding'?'编程':item.category==='task'?'任务':'通用',brand:item.logo.assetId,icon:preset.icon,color:preset.color,mode,mobile:platform==='ios'||platform==='android',copy:template.notes,featured:item.featured,platformStatus:status,officialUrl:item.officialUrl,logoMime:item.logo.mime,logoSha256:item.logo.sha256,adapter:template.adapter,templateRevision:template.templateRevision,account:template.account??null,template,platforms:{[platform]:template}};
    }).filter(Boolean);
    const out={data_source:'real',catalogRevision:payload.catalogRevision,generatedAt:payload.generatedAt,checksum:payload.checksum,platform,apps:Object.freeze(apps)};
    if(payload.clientRelease!==undefined)out.clientRelease=payload.clientRelease?clone(payload.clientRelease):null;
    return Object.freeze(out);
  }
  const previewApps=[
    // Retained 17 Core AI Apps & Containers (100% Cockpit Parity)
    ['antigravity','Antigravity','coding',null,'https://antigravity.google/',false,'spark','blue'],
    ['codex','Codex','coding','openai','https://github.com/openai/codex',false,'terminal','blue'],
    ['codex-desktop','Codex Desktop','coding','openai','https://chatgpt.com/codex',false,'code','blue'],
    ['copilot','GitHub Copilot','coding','copilot','https://github.com/features/copilot',false,'code','purple'],
    ['windsurf','Windsurf','coding',null,'https://windsurf.com/',false,'cursor','cyan'],
    ['kiro','Kiro','coding',null,'https://kiro.dev/',false,'spark','purple'],
    ['cursor','Cursor','coding','cursor','https://cursor.com/downloads',false,'cursor','blue'],
    ['grok-cli','Grok CLI','coding','grok','https://grok.com/',false,'terminal','orange'],
    ['claude-code','Claude Code','coding','claude','https://code.claude.com/docs/en/overview',false,'terminal','orange'],
    ['gemini-cli','Gemini CLI','coding','gemini','https://geminicli.com/',false,'terminal','blue'],
    ['claude-desktop','Claude Desktop','general','claude','https://claude.ai/download',false,'spark','orange'],
    ['metamuse','Meta Muse','task','meta','https://muse.ai/',true,'spark','blue'],
    ['manus','Manus','task','manus','https://manus.im/',true,'layers','purple'],
    ['chatgpt','ChatGPT','general','openai','https://chatgpt.com/',true,'spark','green'],
    ['claude','Claude Web','general','claude','https://claude.ai/',true,'spark','orange'],
    ['gemini-web','Gemini','general','gemini','https://gemini.google.com/',true,'spark','blue'],
    ['grok','Grok','general','grok','https://grok.com/',true,'spark','purple']
  ].map(([id,name,category,brand,officialUrl,mobile,icon,color])=>({id,name,short:name,category:category==='coding'?'编程':category==='task'?'任务':'通用',brand,icon:icon||'grid',color:color||'blue',mode:'unverified',mobile,copy:id==='metamuse'?'Windows 安全独立应用容器 (https://muse.ai/) · macOS 双态适配':'独立实例目录隔离 · 支持账号快速切换与多开',featured:['antigravity','claude-code','claude-desktop','codex','cursor','windsurf','kiro','metamuse','chatgpt','grok'].includes(id),platformStatus:'unverified',officialUrl,logoMime:brand?(['cursor','copilot','meta','manus'].includes(brand)?'image/svg+xml':'image/png'):'',logoSha256:'',adapter:'https-web',templateRevision:1,template:null}));
  root.AssistantCatalog=Object.freeze({platforms:Object.freeze(PLATFORMS),normalize,previewApps:()=>clone(previewApps),assetPath(app){if(!app||!safeId(app.brand)||!BUNDLED_LOGO_BRANDS.has(app.brand))return null;const ext=ASSET_MIME[app.logoMime]||(['cursor','copilot','meta','manus'].includes(app.brand)?'svg':'png');return `./assets/app-logos/${app.brand}.${ext}`;}});
})(globalThis);
