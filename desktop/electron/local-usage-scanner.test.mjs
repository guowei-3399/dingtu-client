import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  createLocalUsageScanner,
  decodeAntigravityGenMetadata,
  decodeStepMetadataInfo,
  normalizeModelDisplay,
} from './local-usage-scanner.mjs';

function encodeVarint(n) {
  let v = BigInt(n);
  const out = [];
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) b |= 0x80;
    out.push(b);
  } while (v > 0n);
  return Buffer.from(out);
}

function ldField(fieldNo, payload) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  return Buffer.concat([encodeVarint((fieldNo << 3) | 2), encodeVarint(buf.length), buf]);
}

function varintField(fieldNo, value) {
  return Buffer.concat([encodeVarint((fieldNo << 3) | 0), encodeVarint(value)]);
}

test('decodeAntigravityGenMetadata separates input, thinking, output, and cache tokens from protobuf payloads', () => {
  const f4 = Buffer.concat([
    varintField(2, 12000),
    varintField(5, 45000),
    varintField(6, 500),
    varintField(9, 1800),
    varintField(10, 2400),
  ]);
  const f1 = Buffer.concat([ldField(4, f4), ldField(19, 'gemini-4-carbon-high')]);
  const blob = ldField(1, f1);
  const parsed = decodeAntigravityGenMetadata(blob);
  assert.equal(parsed.modelId, 'gemini-4-carbon-high');
  assert.equal(parsed.input, 12000);
  assert.equal(parsed.thinking, 1800);
  assert.equal(parsed.output, 2400);
  assert.equal(parsed.cacheRead, 45000);
  assert.equal(parsed.cacheWrite, 500);
  assert.equal(normalizeModelDisplay(parsed.modelId).label, 'Gemini 4 Carbon (High)');
});

test('local usage scanner scans Antigravity SQLite conversations, Codex JSONL, Claude Code JSONL and uses cache on second scan', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dingtu-usage-'));
  try {
    const nowSec = Math.floor(Date.now() / 1000) - 3600;
    const agDir = path.join(root, '.gemini', 'antigravity');
    const convDir = path.join(agDir, 'conversations');
    await fs.mkdir(convDir, { recursive: true });

    const sumDb = new DatabaseSync(path.join(agDir, 'conversation_summaries.db'));
    sumDb.exec('CREATE TABLE conversation_summaries (conversation_id TEXT PRIMARY KEY, title TEXT, workspace_uris TEXT, last_modified_time INTEGER, parent_conversation_id TEXT, nesting_depth INTEGER, agent_name TEXT)');
    sumDb.prepare('INSERT INTO conversation_summaries VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'conv-main-1',
      '定途主架构开发',
      JSON.stringify(['file:///d:/singbox']),
      nowSec,
      null,
      0,
      '',
    );
    sumDb.close();

    const db = new DatabaseSync(path.join(convDir, 'conv-main-1.db'));
    db.exec('CREATE TABLE steps (idx INTEGER PRIMARY KEY, metadata BLOB); CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB);');
    const stepMeta = ldField(1, varintField(1, nowSec));
    const genBlob = ldField(1, Buffer.concat([
      ldField(4, Buffer.concat([
        varintField(2, 5000),
        varintField(5, 10000),
        varintField(9, 600),
        varintField(10, 900),
      ])),
      ldField(19, 'gemini-4-carbon-high'),
    ]));
    db.prepare('INSERT INTO steps VALUES (1, ?)').run(stepMeta);
    db.prepare('INSERT INTO gen_metadata VALUES (1, ?)').run(genBlob);
    db.close();

    const codexDir = path.join(root, '.codex', 'sessions');
    await fs.mkdir(codexDir, { recursive: true });
    await fs.writeFile(path.join(codexDir, 'rollout-1.jsonl'), [
      JSON.stringify({ timestamp: new Date(nowSec * 1000).toISOString(), type: 'session_meta', payload: { id: 'cx-1', cwd: 'd:\\singbox' } }),
      JSON.stringify({ timestamp: new Date(nowSec * 1000).toISOString(), type: 'turn_context', payload: { model: 'gpt-5-codex' } }),
      JSON.stringify({ timestamp: new Date(nowSec * 1000).toISOString(), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 3000, cached_input_tokens: 2000, output_tokens: 700, reasoning_output_tokens: 300 } } } }),
    ].join('\n'), 'utf8');

    const claudeDir = path.join(root, '.claude', 'projects', 'proj-a');
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.writeFile(path.join(claudeDir, 'sess-1.jsonl'), [
      JSON.stringify({
        type: 'assistant',
        timestamp: new Date(nowSec * 1000).toISOString(),
        sessionId: 'cc-1',
        cwd: 'd:\\singbox',
        message: {
          model: 'claude-sonnet-4-5',
          usage: { input_tokens: 1500, cache_read_input_tokens: 4000, cache_creation_input_tokens: 200, output_tokens: 350 },
        },
      }),
    ].join('\n'), 'utf8');

    const scanner = createLocalUsageScanner({ homeDir: root, appDataDir: root });
    const first = await scanner.scanLocalUsage({ appId: 'antigravity', range: '30d', granularity: 'day' });
    assert.equal(first.totals.sessions, 1);
    assert.equal(first.totals.turns, 1);
    assert.equal(first.totals.inputTokens, 5000);
    assert.equal(first.totals.thinkingTokens, 600);
    assert.equal(first.totals.outputTokens, 900);
    assert.equal(first.totals.cacheReadTokens, 10000);
    assert.equal(first.totals.totalTokens, 16500);
    assert.equal(first.newlyScanned, 1);
    assert.equal(first.byModel[0].model, 'Gemini 4 Carbon (High)');
    assert.equal(first.byWorkspace[0].name, 'singbox');

    const second = await scanner.scanLocalUsage({ appId: 'antigravity', range: '30d', granularity: 'day' });
    assert.equal(second.cacheHits, 1);
    assert.equal(second.newlyScanned, 0);

    const cx = await scanner.scanLocalUsage({ appId: 'codex', range: '30d' });
    assert.equal(cx.totals.inputTokens, 3000);
    assert.equal(cx.totals.thinkingTokens, 300);

    const cc = await scanner.scanLocalUsage({ appId: 'claude-code', range: '30d' });
    assert.equal(cc.totals.inputTokens, 1500);
    assert.equal(cc.totals.cacheReadTokens, 4000);
    assert.equal(cc.totals.cacheWriteTokens, 200);
    assert.equal(cc.totals.outputTokens, 350);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('async buffer prefilter yields to event loop, avoids double counting multi-needle CRLF Codex lines, and keeps Claude leading metadata', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dingtu-usage-async-'));
  try {
    const nowIso = new Date(Date.now() - 1800_000).toISOString();
    const codexDir = path.join(root, '.codex', 'sessions');
    await fs.mkdir(codexDir, { recursive: true });
    const bigNoise = JSON.stringify({ timestamp: nowIso, type: 'response_item', payload: { text: 'x'.repeat(200_000) } });

    // File 1: CRLF endings + noise + multi-keyword token_count line containing both turn_context/session_meta strings in text
    await fs.writeFile(
      path.join(codexDir, 'rollout-a.jsonl'),
      [
        JSON.stringify({ timestamp: nowIso, type: 'session_meta', payload: { id: 'cx-multi', cwd: 'd:\\singbox\\proj-one' } }),
        bigNoise,
        JSON.stringify({ timestamp: nowIso, type: 'turn_context', payload: { model: 'gpt-5-codex' } }),
        JSON.stringify({
          timestamp: nowIso,
          type: 'event_msg',
          note: '"session_meta" "turn_context"',
          payload: {
            type: 'token_count',
            info: {
              last_token_usage: { input_tokens: 400, cached_input_tokens: 100, output_tokens: 50, reasoning_output_tokens: 25 },
            },
          },
        }),
      ].join('\r\n') + '\r\n',
      'utf8',
    );

    // File 2: second session file to confirm yielding between files via setImmediate
    await fs.writeFile(
      path.join(codexDir, 'rollout-b.jsonl'),
      [
        JSON.stringify({ timestamp: nowIso, type: 'session_meta', payload: { id: 'cx-second', cwd: 'd:\\singbox\\proj-two' } }),
        JSON.stringify({
          timestamp: nowIso,
          type: 'event_msg',
          payload: {
            type: 'token_count',
            info: {
              last_token_usage: { input_tokens: 600, cached_input_tokens: 200, output_tokens: 80, reasoning_output_tokens: 20 },
            },
          },
        }),
      ].join('\n'),
      'utf8',
    );

    // Claude Code: line 1 has sessionId + cwd on non-usage user event, later line has usage without cwd
    const claudeDir = path.join(root, '.claude', 'projects', 'fallback-name');
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.writeFile(
      path.join(claudeDir, 'conv-1.jsonl'),
      [
        JSON.stringify({ type: 'user', timestamp: nowIso, sessionId: 'cc-lead-meta', cwd: 'd:\\singbox\\custom-ws', message: { content: 'hi' } }),
        bigNoise,
        JSON.stringify({
          type: 'assistant',
          timestamp: nowIso,
          message: {
            model: 'claude-sonnet-4-5',
            usage: { input_tokens: 220, cache_read_input_tokens: 80, cache_creation_input_tokens: 10, output_tokens: 40 },
          },
        }),
      ].join('\n'),
      'utf8',
    );

    const scanner = createLocalUsageScanner({ homeDir: root, appDataDir: root });
    let immediateTicks = 0;
    let scanning = true;
    const tick = () => {
      if (!scanning) return;
      immediateTicks += 1;
      setImmediate(tick);
    };
    setImmediate(tick);

    const cxPromise = scanner.scanLocalUsage({ appId: 'codex', range: '30d' });
    assert.equal(typeof cxPromise?.then, 'function');
    const cx = await cxPromise;
    scanning = false;

    assert.ok(immediateTicks >= 1, `expected setImmediate to run during async scan, got ${immediateTicks}`);
    assert.equal(cx.totals.sessions, 2);
    assert.equal(cx.totals.turns, 2);
    assert.equal(cx.totals.inputTokens, 1000);
    assert.equal(cx.totals.cacheReadTokens, 300);
    assert.equal(cx.totals.outputTokens, 130);
    assert.equal(cx.totals.thinkingTokens, 45);

    const cc = await scanner.scanLocalUsage({ appId: 'claude-code', range: '30d' });
    assert.equal(cc.totals.sessions, 1);
    assert.equal(cc.sessions[0].id, 'cc-lead-meta');
    assert.equal(cc.byWorkspace[0].name, 'custom-ws');
    assert.equal(cc.totals.inputTokens, 220);
    assert.equal(cc.totals.cacheReadTokens, 80);
    assert.equal(cc.totals.cacheWriteTokens, 10);
    assert.equal(cc.totals.outputTokens, 40);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Antigravity scanner joins gen_metadata.idx via steps.metadata f20.f3 (not steps.idx), handles WAL cache invalidation, and supports Codex token_usage_record fallback', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dingtu-usage-f20-'));
  try {
    const nowMs = Date.now();
    const nowDate = new Date(nowMs);
    const todayMidMs = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime() + 60_000;
    const todaySec = Math.floor(Math.max(todayMidMs, nowMs - 120_000) / 1000);
    const threeDaysAgoSec = todaySec - 3 * 86_400;

    const makeStepMeta = ({ sec, stepIdx, genIdx, includeUsage = false }) => {
      const parts = [
        ldField(1, varintField(1, sec)),
        ldField(20, Buffer.concat([varintField(2, stepIdx), varintField(3, genIdx)])),
      ];
      if (includeUsage) parts.push(ldField(9, varintField(2, 1)));
      return Buffer.concat(parts);
    };
    const makeGenBlob = ({ input, thinking, output, cacheRead, cacheWrite = 24, model = 'gemini-4-neon' }) => ldField(1, Buffer.concat([
      ldField(4, Buffer.concat([
        varintField(2, input),
        varintField(5, cacheRead),
        varintField(6, cacheWrite),
        varintField(9, thinking),
        varintField(10, output),
      ])),
      ldField(19, model),
    ]));

    // Verify decodeStepMetadataInfo directly
    const info = decodeStepMetadataInfo(makeStepMeta({ sec: todaySec, stepIdx: 500, genIdx: 150, includeUsage: true }));
    assert.equal(info.tsMs, todaySec * 1000);
    assert.equal(info.genIdx, 150);
    assert.equal(info.hasUsage, true);

    const agDir = path.join(root, '.gemini', 'antigravity');
    const convDir = path.join(agDir, 'conversations');
    await fs.mkdir(convDir, { recursive: true });

    // Multi-day WAL-mode DB where steps.idx (150 = 3 days ago, 500 = today) diverges wildly from gen_metadata.idx (150 = today)
    const dbPath = path.join(convDir, 'conv-multiday.db');
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0;');
    db.exec('CREATE TABLE steps (idx INTEGER PRIMARY KEY, metadata BLOB); CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB);');
    // Old step at idx=150 (3 days ago, genIdx=40) — old buggy code matched gen_metadata.idx=150 to this!
    db.prepare('INSERT INTO steps VALUES (150, ?)').run(makeStepMeta({ sec: threeDaysAgoSec, stepIdx: 150, genIdx: 40, includeUsage: true }));
    db.prepare('INSERT INTO gen_metadata VALUES (40, ?)').run(makeGenBlob({ input: 1000, thinking: 100, output: 200, cacheRead: 3000 }));
    // Today's actual planner step at idx=500 referencing genIdx=150
    db.prepare('INSERT INTO steps VALUES (500, ?)').run(makeStepMeta({ sec: todaySec, stepIdx: 500, genIdx: 150, includeUsage: true }));
    db.prepare('INSERT INTO gen_metadata VALUES (150, ?)').run(makeGenBlob({ input: 5000, thinking: 600, output: 900, cacheRead: 12000 }));
    // Unreferenced genIdx=151 right after 150 -> must interpolate monotonically to todaySec, NOT 3 days ago
    db.prepare('INSERT INTO gen_metadata VALUES (151, ?)').run(makeGenBlob({ input: 1100, thinking: 50, output: 150, cacheRead: 2000 }));

    const scanner = createLocalUsageScanner({ homeDir: root, appDataDir: root, now: () => nowMs });
    const today1 = await scanner.scanLocalUsage({ appId: 'antigravity', range: '1d' });
    assert.equal(today1.totals.turns, 2);
    assert.equal(today1.totals.inputTokens, 6100);
    assert.equal(today1.totals.thinkingTokens, 650);
    assert.equal(today1.totals.outputTokens, 1050);
    assert.equal(today1.totals.cacheReadTokens, 14000);
    assert.equal(today1.totals.cacheWriteTokens, 48);
    assert.equal(today1.totals.totalTokens, 6100 + 650 + 1050 + 14000 + 48);

    // Second scan without changes hits cache
    const cached = await scanner.scanLocalUsage({ appId: 'antigravity', range: '1d' });
    assert.equal(cached.cacheHits, 1);
    assert.equal(cached.newlyScanned, 0);

    // Live WAL write (no checkpoint -> .db untouched, only .db-wal grows) must invalidate cache on normal refresh!
    db.prepare('INSERT INTO steps VALUES (502, ?)').run(makeStepMeta({ sec: todaySec + 5, stepIdx: 502, genIdx: 152, includeUsage: true }));
    db.prepare('INSERT INTO gen_metadata VALUES (152, ?)').run(makeGenBlob({ input: 2000, thinking: 300, output: 400, cacheRead: 8000 }));
    const todayAfterWal = await scanner.scanLocalUsage({ appId: 'antigravity', range: '1d', forceRescan: false });
    assert.equal(todayAfterWal.newlyScanned, 1, 'WAL update must invalidate cache without forceRescan');
    assert.equal(todayAfterWal.totals.turns, 3);
    assert.equal(todayAfterWal.totals.inputTokens, 8100);
    db.close();

    // Codex token_usage_record fallback when token_count is absent (and no double count when both exist)
    const codexDir = path.join(root, '.codex', 'sessions');
    await fs.mkdir(codexDir, { recursive: true });
    const todayIso = new Date(todaySec * 1000).toISOString();
    await fs.writeFile(path.join(codexDir, 'tur-only.jsonl'), [
      JSON.stringify({ timestamp: todayIso, type: 'session_meta', payload: { id: 'cx-tur', cwd: 'd:\\singbox' } }),
      JSON.stringify({ timestamp: todayIso, type: 'turn_context', payload: { model: 'gpt-5-codex' } }),
      JSON.stringify({
        timestamp: todayIso,
        type: 'token_usage_record',
        payload: { usage: { input_tokens: 900, cached_input_tokens: 700, cache_write_input_tokens: 0, output_tokens: 120, reasoning_output_tokens: 40 } },
      }),
    ].join('\n'), 'utf8');
    const cxToday = await scanner.scanLocalUsage({ appId: 'codex', range: '1d' });
    assert.equal(cxToday.totals.turns, 1);
    assert.equal(cxToday.totals.inputTokens, 900);
    assert.equal(cxToday.totals.thinkingTokens, 40);
    assert.equal(cxToday.totals.outputTokens, 120);
    assert.equal(cxToday.totals.cacheReadTokens, 700);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
