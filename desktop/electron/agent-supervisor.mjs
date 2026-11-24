const fail = (code, message) => Object.assign(new Error(message), { code });

function snapshot(record) {
  return record ? Object.freeze({ ...record }) : null;
}

export function createAgentSupervisor({ launcher } = {}) {
  if (!launcher || typeof launcher.plan !== 'function' || typeof launcher.launch !== 'function') throw fail('AGENT_LAUNCHER_REQUIRED', '应用启动器不可用。');
  const records = new Map();

  async function inspect(app) {
    const plan = launcher.plan(app);
    if (typeof launcher.detect !== 'function') return Object.freeze({ appId: plan.appId, status: 'unknown', activation: plan.activation, path: null, command: plan.command });
    const detected = await launcher.detect(app);
    return Object.freeze({ appId: plan.appId, status: detected.status, activation: plan.activation, path: detected.path ?? null, command: detected.command ?? plan.command });
  }

  function start(app) {
    const plan = launcher.plan(app);
    const current = records.get(plan.appId);
    if (current && ['starting', 'running'].includes(current.status)) throw fail('AGENT_ALREADY_RUNNING', '应用已经在运行。');
    const child = launcher.launch(app);
    if (!child || typeof child.once !== 'function') throw fail('AGENT_START_FAILED', '应用进程未能启动。');
    const record = { appId: plan.appId, status: 'starting', activation: plan.activation, pid: Number.isSafeInteger(child.pid) ? child.pid : null, exit: null };
    records.set(plan.appId, record);
    child.once('spawn', () => { const latest = records.get(plan.appId); if (latest === record) record.status = 'running'; });
    child.once('error', () => { const latest = records.get(plan.appId); if (latest === record) { record.status = 'failed'; record.exit = 'spawn_error'; } });
    child.once('exit', (code, signal) => {
      const latest = records.get(plan.appId);
      if (latest !== record) return;
      record.status = code === 0 ? 'stopped' : 'failed';
      record.exit = signal ? `signal:${signal}` : `code:${code ?? 'unknown'}`;
    });
    return snapshot(record);
  }

  function status(appId) { return snapshot(records.get(appId)); }
  function clear(appId) {
    const record = records.get(appId);
    if (record && ['starting', 'running', 'stopping'].includes(record.status)) throw fail('AGENT_ACTIVE', '应用进程仍在运行。');
    records.delete(appId);
  }

  return Object.freeze({ inspect, start, status, clear });
}
