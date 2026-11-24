import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWakeupScheduler } from './wakeup-scheduler.mjs';

const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: plain => Buffer.from(Buffer.from(plain, 'utf8').toString('base64'), 'utf8'),
  decryptString: buf => Buffer.from(buf.toString('utf8'), 'base64').toString('utf8'),
};

test('wakeup-scheduler persists DPAPI encrypted tasks, runs immediate/due triggers, and records bounded history', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dingtu-wakeup-'));
  try {
    let nowMs = Date.parse('2026-11-22T09:00:00Z');
    const runs = [];
    const filePath = path.join(root, 'wakeup.bin');

    const sched = createWakeupScheduler({
      filePath,
      safeStorage: fakeSafeStorage,
      now: () => nowMs,
      onRunTask: async task => {
        runs.push(task.id);
        return { ok: true, message: `refreshed ${task.appId}` };
      },
    });

    const saved = await sched.save({
      appId: 'antigravity',
      accountId: 'main',
      name: '每小时配额检查',
      scheduleType: 'interval',
      intervalMinutes: 30,
      action: 'refresh_quota',
    });
    assert.equal(saved.tasks.length, 1);
    const id = saved.tasks[0].id;

    // Immediate manual run
    const manual = await sched.runNow({ id });
    assert.equal(manual.task.lastStatus, 'ok');
    assert.equal(manual.history.length, 1);
    assert.deepEqual(runs, [id]);

    // Not due yet after 10 minutes
    nowMs += 10 * 60_000;
    const skipped = await sched.tickDueTasks();
    assert.equal(skipped, 0);

    // Due after 35 minutes
    nowMs += 25 * 60_000;
    const due = await sched.tickDueTasks();
    assert.equal(due, 1);
    assert.equal(runs.length, 2);

    // Reload from disk verifies encryption & persistence
    const rawDisk = await fs.readFile(filePath, 'utf8');
    assert.equal(rawDisk.includes('antigravity'), false);
    const reloaded = createWakeupScheduler({ filePath, safeStorage: fakeSafeStorage, now: () => nowMs });
    assert.equal(reloaded.list({ appId: 'antigravity' }).tasks.length, 1);

    const toggled = reloaded.toggle({ id, enabled: false });
    assert.equal(toggled.tasks[0].enabled, false);
    const removed = reloaded.remove({ id });
    assert.equal(removed.tasks.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
