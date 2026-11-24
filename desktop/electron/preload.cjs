'use strict';

// Sandboxed preload is plain JavaScript: only Electron may be required here.
const { contextBridge, ipcRenderer } = require('electron');

function failConfiguration() {
  // Never include argv or a malformed value in errors or diagnostics.
  throw new Error('Invalid Noya desktop configuration');
}

function hasOnlyKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

function readConfiguration() {
  const prefix = '--noya-desktop-config=';
  const args = process.argv.filter(value => typeof value === 'string' && value.startsWith(prefix));
  if (args.length !== 1 || args[0].length > 16384) failConfiguration();
  let config;
  try { config = JSON.parse(decodeURIComponent(args[0].slice(prefix.length))); }
  catch { failConfiguration(); }
  if (!hasOnlyKeys(config, ['version', 'platform', 'apiBase', 'localProxy'])
      || config.version !== 1 || !['windows', 'macos', 'linux'].includes(config.platform)
      || typeof config.apiBase !== 'string' || config.apiBase.length > 2048) failConfiguration();
  if (config.apiBase) {
    let url;
    try { url = new URL(config.apiBase); } catch { failConfiguration(); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
        || url.toString().replace(/\/$/, '') !== config.apiBase) failConfiguration();
  }
  const proxy = config.localProxy;
  if (!hasOnlyKeys(proxy, ['host', 'port', 'http', 'socks5']) || proxy.host !== '127.0.0.1'
      || !Number.isInteger(proxy.port) || proxy.port < 1 || proxy.port > 65535
      || proxy.http !== `http://${proxy.host}:${proxy.port}`
      || proxy.socks5 !== `socks5://${proxy.host}:${proxy.port}`) failConfiguration();
  return config;
}

const config = readConfiguration();
const allowedBrowserApps = [
  'claude', 'chatgpt', 'codex', 'grok', 'gemini', 'metamuse', 'manus',
  'antigravity', 'copilot', 'windsurf', 'kiro', 'cursor',
];
// Port and endpoints originate from runtime-contract.mjs in the main process;
// no second proxy setting, secrets, filesystem, shell, or arbitrary IPC is exposed.
contextBridge.exposeInMainWorld('NoyaDesktop', Object.freeze({
  isDesktop: true,
  platform: config.platform,
  apiBase: config.apiBase,
  localProxy: Object.freeze(config.localProxy),
  auth: Object.freeze({ mode: 'browser-pkce', invoke(operation) {
    if (typeof operation !== 'string' || !/^auth\.(?:status|login|cancel|logout)$/.test(operation)) throw new Error('Invalid Noya desktop operation');
    return ipcRenderer.invoke('noya:desktop', { operation });
  } }),
  proxy: Object.freeze({ invoke(operation, args = {}) {
    if (typeof operation !== 'string' || !/^proxy\.(?:status|start|stop|environment|mode\.set)$/.test(operation)
      || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid Noya desktop proxy operation');
    return ipcRenderer.invoke('noya:desktop', { ...args, operation });
  } }),
  agent: Object.freeze({ invoke(operation, args = {}) {
    if (typeof operation !== 'string' || !/^agent\.(?:adapters|list|inspect|create|start|stop|remove|closeApp|isRunning)$/.test(operation)
      || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid Noya desktop agent operation');
    // Keep the operation selected by the trusted bridge. Renderer data may only
    // fill the allow-listed fields validated again in the main process.
    return ipcRenderer.invoke('noya:desktop', { ...args, operation });
  } }),
  accounts: Object.freeze({
    invoke(operation, args = {}) {
      if (typeof operation !== 'string' || !/^accounts\.(?:list|importLocal|add|switch|refreshQuota|remove|detectAll|oauthStart|oauthStatus|oauthCopyUrl|oauthSubmitCallback|oauthCancel|importToken|importJson|exportJson|updateMeta|batchRemove|groupsList|groupsSave|groupsRemove|groupsAssign|usageScan|usageSetDir|wakeupList|wakeupSave|wakeupToggle|wakeupRemove|wakeupRunNow|settingsGet|settingsUpdate|totpCompute|totpList|totpSave|totpRemove|totpImport|totpExport|totpMigrationPayload)$/.test(operation)
        || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid Noya desktop accounts operation');
      return ipcRenderer.invoke('noya:desktop', { ...args, operation });
    },
    onUpdated(listener) {
      if (typeof listener !== 'function' || typeof ipcRenderer.on !== 'function') return () => {};
      const wrapped = (_event, payload) => {
        try {
          listener({
            appId: typeof payload?.appId === 'string' ? payload.appId : '',
            accountId: typeof payload?.accountId === 'string' ? payload.accountId : '',
          });
        } catch {}
      };
      ipcRenderer.on('noya:accounts-updated', wrapped);
      return () => {
        try { ipcRenderer.removeListener?.('noya:accounts-updated', wrapped); } catch {}
      };
    },
  }),
  telemetry: Object.freeze({ invoke(operation, args = {}) {
    if (typeof operation !== 'string' || !/^telemetry\.(?:status|sync)$/.test(operation)
      || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid Noya desktop telemetry operation');
    return ipcRenderer.invoke('noya:desktop', { ...args, operation });
  } }),
  tickets: Object.freeze({ invoke(operation, args = {}) {
    if (typeof operation !== 'string' || !/^tickets\.(?:list|create|detail|reply)$/.test(operation)
      || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid Noya desktop tickets operation');
    return ipcRenderer.invoke('noya:desktop', { ...args, operation });
  } }),
  browser: Object.freeze({
    open(appId, instanceId, options) {
      if (!allowedBrowserApps.includes(appId) || typeof instanceId !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(instanceId)) throw new Error('Invalid browser instance');
      const payload = { operation: 'browser.open', appId, instanceId };
      if (options !== undefined) {
        if (!options || typeof options !== 'object' || Array.isArray(options) || typeof options.appShell !== 'boolean') throw new Error('Invalid browser options');
        payload.appShell = options.appShell;
      }
      return ipcRenderer.invoke('noya:desktop', payload);
    },
    list() {
      return ipcRenderer.invoke('noya:desktop', { operation: 'browser.list' });
    },
    close(appId, instanceId) {
      if (!allowedBrowserApps.includes(appId) || typeof instanceId !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(instanceId)) throw new Error('Invalid browser instance');
      return ipcRenderer.invoke('noya:desktop', { operation: 'browser.close', appId, instanceId });
    },
  }),
  read(kind, args = {}) {
    if (typeof kind !== 'string' || !/^(?:me|entitlements|members|identities|overview|catalog|relays|devices|tunnelStatus)$/.test(kind)) throw new Error('Invalid Noya desktop read');
    return ipcRenderer.invoke('noya:desktop', { operation: 'read', kind, args });
  },
}));
