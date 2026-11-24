import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const fail = (code, message = code) => Object.assign(new Error(message), { code });
const MAX_TASKS = 48;
const MAX_HISTORY = 50;

function cleanText(value, maxLen = 120) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLen);
}

function atomicWrite(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, { mode: 0o600 });
  renameSync(tmp, filePath);
}

function isDueNow(task, nowMs) {
  if (!task.enabled) return false;
  const lastMs = task.lastRunAt ? Date.parse(task.lastRunAt) : 0;
  if (task.scheduleType === 'daily' && /^\d{2}:\d{2}$/.test(task.dailyTime || '')) {
    const [hh, mm] = task.dailyTime.split(':').map(Number);
    const d = new Date(nowMs);
    const scheduledToday = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0).getTime();
    return nowMs >= scheduledToday && (!lastMs || lastMs < scheduledToday);
  }
  const intervalMs = Math.max(15, Math.min(1440, Number(task.intervalMinutes) || 60)) * 60_000;
  return !lastMs || nowMs - lastMs >= intervalMs;
}

export function createWakeupScheduler({
  filePath,
  safeStorage,
  onRunTask = async () => ({ ok: true, message: '已完成巡检' }),
  now = Date.now,
} = {}) {
  if (typeof filePath !== 'string' || !filePath) throw fail('ACCOUNTS_CONFIG_INVALID', '唤醒任务配置路径无效。');
  if (!safeStorage || typeof safeStorage.encryptString !== 'function' || typeof safeStorage.decryptString !== 'function') {
    throw fail('ACCOUNTS_CONFIG_INVALID', '系统加密组件不可用。');
  }

  let loaded = false;
  let timer = null;
  let ticking = false;
  let state = { version: 1, tasks: [], history: [] };

  const currentMs = () => (typeof now === 'function' ? now() : Number(now) || Date.now());
  const currentIso = () => new Date(currentMs()).toISOString();

  function requireEncryptionAvailable() {
    if (typeof safeStorage.isEncryptionAvailable === 'function' && !safeStorage.isEncryptionAvailable()) {
      throw fail('SECURE_STORE_UNAVAILABLE', '本机安全存储不可用。');
    }
  }

  function ensureLoaded() {
    if (loaded) return;
    if (!existsSync(filePath)) {
      loaded = true;
      return;
    }
    requireEncryptionAvailable();
    try {
      const cipher = readFileSync(filePath);
      const plain = safeStorage.decryptString(cipher);
      const parsed = JSON.parse(plain);
      if (parsed && parsed.version === 1 && Array.isArray(parsed.tasks)) {
        state = {
          version: 1,
          tasks: parsed.tasks,
          history: Array.isArray(parsed.history) ? parsed.history.slice(0, MAX_HISTORY) : [],
        };
      }
      loaded = true;
    } catch {
      state = { version: 1, tasks: [], history: [] };
      loaded = true;
    }
  }

  function saveState() {
    requireEncryptionAvailable();
    const cipher = safeStorage.encryptString(JSON.stringify(state));
    atomicWrite(filePath, cipher);
  }

  function list({ appId = null } = {}) {
    ensureLoaded();
    const tasks = state.tasks
      .filter(t => !appId || t.appId === appId)
      .map(t => Object.freeze({ ...t }));
    const history = state.history
      .filter(h => !appId || h.appId === appId)
      .map(h => Object.freeze({ ...h }));
    return Object.freeze({
      tasks: Object.freeze(tasks),
      history: Object.freeze(history),
    });
  }

  function save({
    id = '',
    appId,
    accountId = 'main',
    name = '',
    enabled = true,
    scheduleType = 'interval',
    intervalMinutes = 240,
    dailyTime = '08:30',
    action = 'quota_refresh',
  } = {}) {
    ensureLoaded();
    if (typeof appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(appId)) {
      throw fail('ACCOUNT_APP_UNSUPPORTED', '唤醒任务的应用标识无效。');
    }
    const cleanAccountId = typeof accountId === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(accountId) ? accountId : 'main';
    const cleanName = cleanText(name, 80) || `${appId} · ${cleanAccountId} 唤醒`;
    const cleanSched = scheduleType === 'daily' ? 'daily' : 'interval';
    const cleanInterval = Math.max(15, Math.min(1440, Math.round(Number(intervalMinutes) || 240)));
    const cleanDaily = /^\d{2}:\d{2}$/.test(String(dailyTime || '')) ? String(dailyTime) : '08:30';
    const cleanAction = action === 'lightweight_ping' || action === 'probe_local' ? 'probe_local' : 'refresh_quota';
    const ts = currentIso();

    const idx = id ? state.tasks.findIndex(t => t.id === id) : -1;
    let task;
    if (idx >= 0) {
      task = {
        ...state.tasks[idx],
        appId,
        accountId: cleanAccountId,
        name: cleanName,
        enabled: Boolean(enabled),
        scheduleType: cleanSched,
        intervalMinutes: cleanInterval,
        dailyTime: cleanDaily,
        action: cleanAction,
        updatedAt: ts,
      };
      state.tasks[idx] = task;
    } else {
      if (state.tasks.length >= MAX_TASKS) {
        throw fail('ACCOUNT_LIMIT_REACHED', `最多可配置 ${MAX_TASKS} 条唤醒任务。`);
      }
      task = {
        id: `wu-${crypto.randomBytes(6).toString('hex')}`,
        appId,
        accountId: cleanAccountId,
        name: cleanName,
        enabled: Boolean(enabled),
        scheduleType: cleanSched,
        intervalMinutes: cleanInterval,
        dailyTime: cleanDaily,
        action: cleanAction,
        lastRunAt: null,
        lastStatus: null,
        lastMessage: null,
        createdAt: ts,
        updatedAt: ts,
      };
      state.tasks.unshift(task);
    }
    saveState();
    return Object.freeze({ task: Object.freeze({ ...task }), ...list(appId) });
  }

  function toggle({ id, enabled } = {}) {
    ensureLoaded();
    const task = state.tasks.find(t => t.id === id);
    if (!task) throw fail('ACCOUNT_NOT_FOUND', '唤醒任务不存在。');
    task.enabled = typeof enabled === 'boolean' ? enabled : !task.enabled;
    task.updatedAt = currentIso();
    saveState();
    return Object.freeze({ task: Object.freeze({ ...task }), ...list(task.appId) });
  }

  function remove({ id } = {}) {
    ensureLoaded();
    const existing = state.tasks.find(t => t.id === id);
    if (!existing) return Object.freeze({ removed: false, ...list() });
    state.tasks = state.tasks.filter(t => t.id !== id);
    saveState();
    return Object.freeze({ removed: true, ...list(existing.appId) });
  }

  async function runNow({ id } = {}) {
    ensureLoaded();
    const task = state.tasks.find(t => t.id === id);
    if (!task) throw fail('ACCOUNT_NOT_FOUND', '唤醒任务不存在。');
    const ts = currentIso();
    let status = 'ok';
    let message = '已完成额度刷新与状态唤醒';
    try {
      const res = await onRunTask({ ...task });
      if (res && res.ok === false) {
        status = res.skipped ? 'skipped' : 'failed';
        message = cleanText(res.message || '执行未达到预期条件', 140);
      } else if (res?.message) {
        message = cleanText(res.message, 140);
      }
    } catch (err) {
      status = 'failed';
      message = cleanText(err?.message || '唤醒任务执行失败', 140);
    }
    task.lastRunAt = ts;
    task.lastStatus = status;
    task.lastMessage = message;
    task.updatedAt = ts;
    state.history = [{
      id: `log-${crypto.randomBytes(5).toString('hex')}`,
      taskId: task.id,
      taskName: task.name,
      appId: task.appId,
      accountId: task.accountId,
      status,
      message,
      ranAt: ts,
    }, ...state.history].slice(0, MAX_HISTORY);
    saveState();
    return Object.freeze({
      task: Object.freeze({ ...task }),
      ...list(task.appId),
    });
  }

  async function tickDueTasks() {
    if (ticking) return 0;
    ticking = true;
    let ran = 0;
    try {
      ensureLoaded();
      const ms = currentMs();
      const dueIds = state.tasks.filter(t => isDueNow(t, ms)).map(t => t.id);
      for (const taskId of dueIds) {
        await runNow({ id: taskId }).catch(() => null);
        ran += 1;
      }
    } finally {
      ticking = false;
    }
    return ran;
  }

  function start(intervalMs = 60_000) {
    if (timer) return;
    timer = setInterval(() => {
      void tickDueTasks();
    }, Math.max(5_000, Number(intervalMs) || 60_000));
    timer.unref?.();
  }

  function dispose() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return Object.freeze({
    list,
    save,
    toggle,
    remove,
    runNow,
    tickDueTasks,
    start,
    dispose,
  });
}
