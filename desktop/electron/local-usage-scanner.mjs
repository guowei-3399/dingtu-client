import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import fsp from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const requireFromHere = createRequire(import.meta.url);

function loadSqlite() {
  try {
    const mod = requireFromHere('node:sqlite');
    return typeof mod?.DatabaseSync === 'function' ? mod : null;
  } catch {
    return null;
  }
}

export function resolveDefaultUsageDir(appId, { homeDir = os.homedir(), appDataDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming') } = {}) {
  switch (appId) {
    case 'antigravity':
      return path.join(homeDir, '.gemini', 'antigravity');
    case 'codex':
    case 'codex-cli':
    case 'codex-desktop':
      return path.join(homeDir, '.codex', 'sessions');
    case 'claude-code':
    case 'claude-desktop':
    case 'claude':
      return path.join(homeDir, '.claude', 'projects');
    case 'gemini-cli':
      return path.join(homeDir, '.gemini');
    case 'cursor':
      return path.join(appDataDir, 'Cursor', 'User', 'globalStorage');
    case 'windsurf':
      return path.join(appDataDir, 'Windsurf', 'User', 'globalStorage');
    case 'kiro':
      return path.join(homeDir, '.aws', 'sso', 'cache');
    case 'grok-cli':
    case 'grok':
      return path.join(homeDir, '.grok');
    default:
      return path.join(homeDir, '.dingtu', appId || 'workspace');
  }
}

function readVarint(buf, offset) {
  let val = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < buf.length) {
    const b = buf[pos++];
    val |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { val, next: pos };
    shift += 7n;
    if (shift > 64n) return null;
  }
  return null;
}

function parseProtoFields(buf, start = 0, end = buf.length) {
  const fields = [];
  let pos = start;
  while (pos < end) {
    const tagRes = readVarint(buf, pos);
    if (!tagRes) break;
    pos = tagRes.next;
    const tag = Number(tagRes.val);
    const fieldNo = tag >>> 3;
    const wire = tag & 7;
    if (fieldNo <= 0 || fieldNo > 2000) break;
    if (wire === 0) {
      const valRes = readVarint(buf, pos);
      if (!valRes) break;
      pos = valRes.next;
      fields.push({ f: fieldNo, w: 0, v: Number(valRes.val) });
    } else if (wire === 1) {
      if (pos + 8 > end) break;
      pos += 8;
      fields.push({ f: fieldNo, w: 1 });
    } else if (wire === 5) {
      if (pos + 4 > end) break;
      pos += 4;
      fields.push({ f: fieldNo, w: 5 });
    } else if (wire === 2) {
      const lenRes = readVarint(buf, pos);
      if (!lenRes) break;
      const len = Number(lenRes.val);
      pos = lenRes.next;
      if (!Number.isFinite(len) || len < 0 || pos + len > end) break;
      fields.push({ f: fieldNo, w: 2, buf: buf.subarray(pos, pos + len) });
      pos += len;
    } else {
      break;
    }
  }
  return fields;
}

export function decodeAntigravityGenMetadata(blob) {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob || '');
  if (!buf.length) return null;
  const top = parseProtoFields(buf);
  const f1 = top.find(x => x.f === 1 && x.w === 2);
  if (!f1) return null;
  const inner = parseProtoFields(f1.buf);
  const f4 = inner.find(x => x.f === 4 && x.w === 2);
  const modelField = inner.find(x => x.f === 19 && x.w === 2);
  const rawModel = modelField ? modelField.buf.toString('utf8').replace(/[\u0000-\u001f]/g, '').trim() : '';
  if (!f4) {
    return rawModel ? { modelId: rawModel, input: 0, thinking: 0, output: 0, cacheRead: 0, cacheWrite: 0, exact: false } : null;
  }
  const usageFields = parseProtoFields(f4.buf);
  let input = 0;
  let totalCand = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let thinking = 0;
  let visibleOut = 0;
  for (const uf of usageFields) {
    if (uf.w !== 0) continue;
    if (uf.f === 2) input = Math.max(0, uf.v);
    else if (uf.f === 3) totalCand = Math.max(0, uf.v);
    else if (uf.f === 5) cacheRead = Math.max(0, uf.v);
    else if (uf.f === 6) cacheWrite = Math.max(0, uf.v);
    else if (uf.f === 9) thinking = Math.max(0, uf.v);
    else if (uf.f === 10) visibleOut = Math.max(0, uf.v);
  }
  const output = visibleOut > 0 ? visibleOut : Math.max(0, totalCand - thinking);
  const exact = input > 0 || output > 0 || thinking > 0 || cacheRead > 0 || cacheWrite > 0;
  return {
    modelId: rawModel || 'unknown',
    input,
    thinking,
    output,
    cacheRead,
    cacheWrite,
    exact,
  };
}

export function decodeStepMetadataInfo(metaBlob) {
  if (!metaBlob || !metaBlob.length) return { tsMs: null, genIdx: null, hasUsage: false };
  try {
    const buf = Buffer.isBuffer(metaBlob) ? metaBlob : Buffer.from(metaBlob);
    const fields = parseProtoFields(buf);
    let tsMs = null;
    const f1 = fields.find(x => x.f === 1 && x.w === 2);
    if (f1) {
      const tsFields = parseProtoFields(f1.buf);
      const sec = tsFields.find(x => x.f === 1 && x.w === 0)?.v;
      if (Number.isFinite(sec) && sec > 1_500_000_000 && sec < 4_000_000_000) {
        tsMs = sec * 1000;
      }
    }
    let genIdx = null;
    const f20 = fields.find(x => x.f === 20 && x.w === 2);
    if (f20) {
      const refFields = parseProtoFields(f20.buf);
      const f3 = refFields.find(x => x.f === 3 && x.w === 0);
      if (f3 && Number.isInteger(f3.v) && f3.v >= 0) {
        genIdx = f3.v;
      }
    }
    const hasUsage = fields.some(x => x.f === 9 && x.w === 2);
    return { tsMs, genIdx, hasUsage };
  } catch {}
  return { tsMs: null, genIdx: null, hasUsage: false };
}

function parseSummaryTimestampMs(raw) {
  if (raw === null || raw === undefined || raw === '') return NaN;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw > 1_500_000_000 && raw < 4_000_000_000) return raw * 1000;
    if (raw >= 1_500_000_000_000 && raw < 4_000_000_000_000) return raw;
    return NaN;
  }
  const str = String(raw).trim();
  if (/^\d{10,13}$/.test(str)) {
    const num = Number(str);
    return str.length <= 10 ? num * 1000 : num;
  }
  return Date.parse(str);
}

export function normalizeModelDisplay(rawModel) {
  const s = String(rawModel || '').trim();
  if (!s || s === 'unknown') return { label: 'Unknown', provider: 'Antigravity' };
  const lower = s.toLowerCase();
  const provider = lower.includes('claude')
    ? (lower.includes('vertex') || lower.includes('opus') || lower.includes('sonnet') ? 'Anthropic' : 'Anthropic')
    : lower.includes('gemini')
      ? 'Google Gemini'
      : lower.includes('gpt') || lower.includes('o1') || lower.includes('o3') || lower.includes('codex')
        ? 'OpenAI'
        : lower.includes('grok')
          ? 'xAI'
          : 'Antigravity';

  const parts = s.replace(/-vertex$/i, '').split(/[-_]+/).filter(Boolean);
  const pretty = [];
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    const next = parts[i + 1];
    if (/^\d+$/.test(p) && next && /^\d+$/.test(next) && p.length <= 2 && next.length <= 2) {
      pretty.push(`${p}.${next}`);
      i += 1;
    } else if (/^high$|^low$|^medium$/i.test(p)) {
      pretty.push(`(${p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()})`);
    } else {
      pretty.push(p.charAt(0).toUpperCase() + p.slice(1));
    }
  }
  return { label: pretty.join(' '), provider };
}

function decodeWorkspaceInfo(rawUris) {
  if (!rawUris) return { name: '(Unassigned)', path: '' };
  let firstUri = '';
  if (typeof rawUris === 'string') {
    const trimmed = rawUris.trim();
    if (trimmed.startsWith('[')) {
      try {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr) && arr[0]) firstUri = String(arr[0]);
      } catch {}
    } else {
      firstUri = trimmed.split(/[\s,;]+/)[0] || '';
    }
  }
  if (!firstUri) return { name: '(Unassigned)', path: '' };
  let fsPath = firstUri;
  try {
    if (/^file:\/\//i.test(firstUri)) {
      fsPath = decodeURIComponent(new URL(firstUri).pathname);
      if (/^\/[A-Za-z]:/.test(fsPath)) fsPath = fsPath.slice(1);
    } else {
      fsPath = decodeURIComponent(firstUri);
    }
  } catch {}
  if (process.platform === 'win32' || /^[A-Za-z]:[\\/]/.test(fsPath)) {
    fsPath = fsPath.replace(/\//g, '\\').replace(/^([a-z]):/, (_m, d) => `${d.toUpperCase()}:`);
  }
  fsPath = fsPath.replace(/[\\/]+$/, '');
  const baseName = path.basename(fsPath) || fsPath || '(Unassigned)';
  return { name: baseName, path: fsPath };
}

function formatBucketKey(ms, granularity) {
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  if (granularity === 'hour') {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`;
  }
  if (granularity === 'month') {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }
  if (granularity === 'week') {
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
    return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const CODEX_NEEDLES = [
  Buffer.from('"session_meta"'),
  Buffer.from('"turn_context"'),
  Buffer.from('"token_count"'),
  Buffer.from('"token_usage_record"'),
];
const CLAUDE_USAGE_NEEDLES = [Buffer.from('"usage"')];
const GENERIC_USAGE_NEEDLES = [Buffer.from('"usage"')];
const yieldEventLoop = () => new Promise(resolve => setImmediate(resolve));

function extractMatchingLinesFromBuffer(buf, needles) {
  const out = [];
  if (!buf || !buf.length) return out;
  const nextPos = needles.map(n => buf.indexOf(n, 0));
  let searchFrom = 0;
  const len = buf.length;
  while (searchFrom < len) {
    let hit = -1;
    for (let i = 0; i < needles.length; i += 1) {
      if (nextPos[i] !== -1 && nextPos[i] < searchFrom) {
        nextPos[i] = buf.indexOf(needles[i], searchFrom);
      }
      if (nextPos[i] !== -1 && (hit === -1 || nextPos[i] < hit)) {
        hit = nextPos[i];
      }
    }
    if (hit === -1) break;
    const prevNl = hit > 0 ? buf.lastIndexOf(0x0a, hit - 1) : -1;
    const lineStart = prevNl === -1 ? 0 : prevNl + 1;
    const nl = buf.indexOf(0x0a, hit);
    const rawEnd = nl === -1 ? len : nl;
    const lineEnd = rawEnd > lineStart && buf[rawEnd - 1] === 0x0d ? rawEnd - 1 : rawEnd;
    if (lineEnd > lineStart) {
      out.push(buf.toString('utf8', lineStart, lineEnd).replace(/^\uFEFF/, ''));
    }
    searchFrom = nl === -1 ? len : nl + 1;
  }
  return out;
}

function extractLeadingLinesFromBuffer(buf, maxLines = 10) {
  const out = [];
  if (!buf || !buf.length || maxLines <= 0) return out;
  let pos = 0;
  const len = buf.length;
  while (pos < len && out.length < maxLines) {
    const nl = buf.indexOf(0x0a, pos);
    const rawEnd = nl === -1 ? len : nl;
    const lineEnd = rawEnd > pos && buf[rawEnd - 1] === 0x0d ? rawEnd - 1 : rawEnd;
    if (lineEnd > pos) {
      const text = buf.toString('utf8', pos, lineEnd).replace(/^\uFEFF/, '');
      if (text.trim()) out.push(text);
    }
    pos = nl === -1 ? len : nl + 1;
  }
  return out;
}

function parseCodexJsonlBuffer(file, st, buf) {
  let sessionId = path.basename(file, '.jsonl').slice(-16);
  let title = path.basename(file, '.jsonl');
  let cwd = '';
  let currentModel = 'gpt-5-codex';
  let prevTotal = { input: 0, cached: 0, cacheWrite: 0, output: 0, reasoning: 0 };
  const turns = [];
  const fallbackRecordTurns = [];
  let lastTimeMs = st.mtimeMs;

  try {
    const lines = extractMatchingLinesFromBuffer(buf, CODEX_NEEDLES);
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      const tsMs = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
      if (Number.isFinite(tsMs) && tsMs > lastTimeMs) lastTimeMs = tsMs;
      if (obj.type === 'session_meta' && obj.payload) {
        if (obj.payload.id) sessionId = String(obj.payload.id);
        if (obj.payload.cwd) cwd = String(obj.payload.cwd);
        if (obj.payload.model) currentModel = String(obj.payload.model);
      } else if (obj.type === 'turn_context' && obj.payload?.model) {
        currentModel = String(obj.payload.model);
      } else if (obj.type === 'token_usage_record' && obj.payload?.usage) {
        const u = obj.payload.usage;
        const turnInput = Math.max(0, Number(u.input_tokens || 0));
        const turnCached = Math.max(0, Number(u.cached_input_tokens || 0));
        const turnCacheWrite = Math.max(0, Number(u.cache_write_input_tokens || 0));
        const turnOutput = Math.max(0, Number(u.output_tokens || 0));
        const turnReasoning = Math.max(0, Number(u.reasoning_output_tokens || 0));
        if (turnInput > 0 || turnOutput > 0 || turnCached > 0 || turnReasoning > 0) {
          fallbackRecordTurns.push({
            modelId: currentModel,
            input: turnInput,
            thinking: turnReasoning,
            output: turnOutput,
            cacheRead: turnCached,
            cacheWrite: turnCacheWrite,
            exact: true,
            tsMs: Number.isFinite(tsMs) ? tsMs : st.mtimeMs,
          });
        }
      } else if (obj.type === 'event_msg' && obj.payload?.type === 'token_count') {
        const info = obj.payload.info;
        if (!info) continue;
        let turnInput = 0;
        let turnCached = 0;
        let turnCacheWrite = 0;
        let turnOutput = 0;
        let turnReasoning = 0;
        if (info.last_token_usage) {
          const l = info.last_token_usage;
          turnInput = Math.max(0, Number(l.input_tokens || 0));
          turnCached = Math.max(0, Number(l.cached_input_tokens || 0));
          turnCacheWrite = Math.max(0, Number(l.cache_write_input_tokens || 0));
          turnOutput = Math.max(0, Number(l.output_tokens || 0));
          turnReasoning = Math.max(0, Number(l.reasoning_output_tokens || 0));
        } else if (info.total_token_usage) {
          const t = info.total_token_usage;
          turnInput = Math.max(0, Number(t.input_tokens || 0) - prevTotal.input);
          turnCached = Math.max(0, Number(t.cached_input_tokens || 0) - prevTotal.cached);
          turnCacheWrite = Math.max(0, Number(t.cache_write_input_tokens || 0) - prevTotal.cacheWrite);
          turnOutput = Math.max(0, Number(t.output_tokens || 0) - prevTotal.output);
          turnReasoning = Math.max(0, Number(t.reasoning_output_tokens || 0) - prevTotal.reasoning);
          prevTotal = {
            input: Number(t.input_tokens || 0),
            cached: Number(t.cached_input_tokens || 0),
            cacheWrite: Number(t.cache_write_input_tokens || 0),
            output: Number(t.output_tokens || 0),
            reasoning: Number(t.reasoning_output_tokens || 0),
          };
        }
        const exact = turnInput > 0 || turnOutput > 0 || turnCached > 0 || turnReasoning > 0;
        if (exact) {
          turns.push({
            modelId: currentModel,
            input: turnInput,
            thinking: turnReasoning,
            output: turnOutput,
            cacheRead: turnCached,
            cacheWrite: turnCacheWrite,
            exact: true,
            tsMs: Number.isFinite(tsMs) ? tsMs : st.mtimeMs,
          });
        }
      }
    }
  } catch {}

  const effectiveTurns = turns.length > 0 ? turns : fallbackRecordTurns;
  const wsName = cwd ? path.basename(cwd.replace(/[\\/]+$/, '')) || cwd : '(Unassigned)';
  return {
    id: sessionId,
    shortId: sessionId.slice(0, 7),
    title,
    workspaceName: wsName,
    workspacePath: cwd,
    sessionType: 'main',
    lastTimeMs,
    turns: effectiveTurns,
  };
}

function parseClaudeJsonlBuffer(file, st, buf) {
  const fallbackId = path.basename(file, '.jsonl');
  let sessionId = fallbackId;
  let cwd = '';
  const turns = [];
  let lastTimeMs = st.mtimeMs;
  const isSub = file.includes(`${path.sep}subagents${path.sep}`) || fallbackId.startsWith('agent-');

  try {
    // Capture session metadata from leading non-usage lines (e.g., initial user event) without decoding entire large files.
    for (const line of extractLeadingLinesFromBuffer(buf, 10)) {
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.sessionId) sessionId = String(obj.sessionId);
      if (obj.cwd && !cwd) cwd = String(obj.cwd);
      const tsMs = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
      if (Number.isFinite(tsMs) && tsMs > lastTimeMs) lastTimeMs = tsMs;
    }

    for (const line of extractMatchingLinesFromBuffer(buf, CLAUDE_USAGE_NEEDLES)) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.sessionId) sessionId = String(obj.sessionId);
      if (obj.cwd && !cwd) cwd = String(obj.cwd);
      const tsMs = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
      if (Number.isFinite(tsMs) && tsMs > lastTimeMs) lastTimeMs = tsMs;
      if (obj.type === 'assistant' && obj.message?.usage) {
        const u = obj.message.usage;
        const input = Math.max(0, Number(u.input_tokens || 0));
        const cacheRead = Math.max(0, Number(u.cache_read_input_tokens || 0));
        const cacheWrite = Math.max(0, Number(u.cache_creation_input_tokens || 0));
        const output = Math.max(0, Number(u.output_tokens || 0));
        const thinking = Math.max(0, Number(u.output_tokens_details?.thinking_tokens || 0));
        turns.push({
          modelId: String(obj.message.model || 'claude'),
          input,
          thinking,
          output,
          cacheRead,
          cacheWrite,
          exact: input > 0 || output > 0 || cacheRead > 0 || cacheWrite > 0,
          tsMs: Number.isFinite(tsMs) ? tsMs : st.mtimeMs,
        });
      }
    }
  } catch {}

  const wsName = cwd ? path.basename(cwd.replace(/[\\/]+$/, '')) : path.basename(path.dirname(file));
  return {
    id: isSub ? fallbackId : sessionId,
    shortId: (isSub ? fallbackId : sessionId).slice(0, 7),
    title: isSub ? `[@subagent] ${fallbackId.slice(0, 12)}` : `Claude ${sessionId.slice(0, 8)}`,
    workspaceName: wsName || '(Unassigned)',
    workspacePath: cwd,
    sessionType: isSub ? 'subagent' : 'main',
    lastTimeMs,
    turns,
  };
}

function parseGenericJsonlBuffer(file, st, buf) {
  const id = path.basename(file, '.jsonl');
  const turns = [];
  try {
    for (const line of extractMatchingLinesFromBuffer(buf, GENERIC_USAGE_NEEDLES)) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      const u = obj.usage || obj.message?.usage;
      if (!u) continue;
      turns.push({
        modelId: String(obj.model || obj.message?.model || 'default'),
        input: Math.max(0, Number(u.input_tokens || u.prompt_tokens || 0)),
        thinking: Math.max(0, Number(u.thinking_tokens || u.reasoning_tokens || 0)),
        output: Math.max(0, Number(u.output_tokens || u.completion_tokens || 0)),
        cacheRead: Math.max(0, Number(u.cache_read_input_tokens || 0)),
        cacheWrite: Math.max(0, Number(u.cache_creation_input_tokens || 0)),
        exact: true,
        tsMs: obj.timestamp ? Date.parse(obj.timestamp) || st.mtimeMs : st.mtimeMs,
      });
    }
  } catch {}
  return {
    id,
    shortId: id.slice(0, 7),
    title: id,
    workspaceName: path.basename(path.dirname(file)) || '(Unassigned)',
    workspacePath: path.dirname(file),
    sessionType: 'main',
    lastTimeMs: st.mtimeMs,
    turns,
  };
}

function walkJsonlFiles(dir, maxDepth = 5) {
  const out = [];
  if (!dir || !existsSync(dir)) return out;
  function walk(cur, depth) {
    if (depth > maxDepth) return;
    let ents;
    try { ents = readdirSync(cur, { withFileTypes: true }); } catch { return; }
    for (const ent of ents) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) walk(full, depth + 1);
      else if (ent.name.endsWith('.jsonl')) out.push(full);
    }
  }
  walk(dir, 0);
  return out;
}

async function walkJsonlFilesAsync(dir, maxDepth = 5) {
  const out = [];
  if (!dir) return out;
  async function walk(cur, depth) {
    if (depth > maxDepth) return;
    let ents;
    try { ents = await fsp.readdir(cur, { withFileTypes: true }); } catch { return; }
    for (const ent of ents) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) await walk(full, depth + 1);
      else if (ent.name.endsWith('.jsonl')) out.push(full);
    }
  }
  await walk(dir, 0);
  return out;
}

export function createLocalUsageScanner({
  homeDir = os.homedir(),
  appDataDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  now = Date.now,
} = {}) {
  const fileCache = new Map();

  function loadAntigravitySummaries(sqliteMod, summaryDbPath, sessionsMap) {
    if (!existsSync(summaryDbPath)) return;
    try {
      const sumDb = new sqliteMod.DatabaseSync(summaryDbPath, { open: true, readOnly: true });
      try {
        const rows = sumDb.prepare(
          'SELECT conversation_id, title, workspace_uris, last_modified_time, parent_conversation_id, nesting_depth, agent_name FROM conversation_summaries',
        ).all();
        for (const row of rows) {
          const id = String(row.conversation_id || '');
          if (!id) continue;
          const title = String(row.title || `#${id.slice(0, 7)}`);
          const ws = decodeWorkspaceInfo(row.workspace_uris);
          const hasParent = Boolean(row.parent_conversation_id) || Number(row.nesting_depth) > 0;
          const isSub = /^\[@/.test(title) || (hasParent && !String(row.agent_name || '').toLowerCase().includes('worker'));
          const sessionType = isSub ? 'subagent' : hasParent ? 'swarm' : 'main';
          const parsedMod = parseSummaryTimestampMs(row.last_modified_time);
          sessionsMap.set(id, {
            id,
            shortId: id.slice(0, 7),
            title: title.slice(0, 120),
            workspaceName: ws.name,
            workspacePath: ws.path,
            sessionType,
            lastTimeMs: Number.isFinite(parsedMod) ? parsedMod : 0,
            turns: [],
          });
        }
      } finally {
        sumDb.close();
      }
    } catch {}
  }

  function loadOrParseAntigravityConv(sqliteMod, dbFile, st, walSt, forceRescan) {
    const cacheKey = `ag:${dbFile}`;
    const walMtimeMs = walSt?.mtimeMs || 0;
    const walSize = walSt?.size || 0;
    const effectiveMtimeMs = Math.max(st.mtimeMs, walMtimeMs);
    const cached = !forceRescan && fileCache.get(cacheKey);
    if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size
      && cached.walMtimeMs === walMtimeMs && cached.walSize === walSize) {
      return { parsedConv: cached.data, cacheHit: true };
    }
    const convId = path.basename(dbFile, '.db');
    const turns = [];
    try {
      const db = new sqliteMod.DatabaseSync(dbFile, { open: true, readOnly: true });
      try {
        const legacyStepTimes = new Map();
        const genTimesUsage = new Map();
        const genTimesAny = new Map();
        const stepRows = db.prepare('SELECT idx, metadata FROM steps').all();
        for (const sRow of stepRows) {
          const { tsMs, genIdx, hasUsage } = decodeStepMetadataInfo(sRow.metadata);
          if (!tsMs) continue;
          legacyStepTimes.set(sRow.idx, tsMs);
          if (genIdx !== null) {
            if (hasUsage && !genTimesUsage.has(genIdx)) genTimesUsage.set(genIdx, tsMs);
            if (!genTimesAny.has(genIdx)) genTimesAny.set(genIdx, tsMs);
          }
        }
        const hasGenMapping = genTimesUsage.size > 0 || genTimesAny.size > 0;
        const sortedKnownGenIdxs = hasGenMapping
          ? [...new Set([...genTimesUsage.keys(), ...genTimesAny.keys()])].sort((a, b) => a - b)
          : [];
        const resolveGenTimestampMs = genIdx => {
          if (genTimesUsage.has(genIdx)) return genTimesUsage.get(genIdx);
          if (genTimesAny.has(genIdx)) return genTimesAny.get(genIdx);
          if (hasGenMapping && sortedKnownGenIdxs.length > 0) {
            let lo = 0;
            let hi = sortedKnownGenIdxs.length - 1;
            let prev = null;
            let next = null;
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              if (sortedKnownGenIdxs[mid] < genIdx) { prev = sortedKnownGenIdxs[mid]; lo = mid + 1; }
              else { next = sortedKnownGenIdxs[mid]; hi = mid - 1; }
            }
            const neighbor = prev !== null ? prev : next;
            if (neighbor !== null) {
              return genTimesUsage.get(neighbor) ?? genTimesAny.get(neighbor) ?? effectiveMtimeMs;
            }
          }
          if (!hasGenMapping && legacyStepTimes.has(genIdx)) return legacyStepTimes.get(genIdx);
          return effectiveMtimeMs;
        };

        const genRows = db.prepare('SELECT idx, data FROM gen_metadata ORDER BY idx ASC').all();
        for (const gRow of genRows) {
          const decoded = decodeAntigravityGenMetadata(gRow.data);
          if (!decoded) continue;
          const tsMs = resolveGenTimestampMs(gRow.idx);
          turns.push({ ...decoded, tsMs });
        }
      } finally {
        db.close();
      }
    } catch {}
    const parsedConv = { convId, mtimeMs: effectiveMtimeMs, turns };
    fileCache.set(cacheKey, { mtimeMs: st.mtimeMs, size: st.size, walMtimeMs, walSize, data: parsedConv });
    return { parsedConv, cacheHit: false };
  }

  function mergeAntigravityConv(sessionsMap, parsedConv) {
    const existing = sessionsMap.get(parsedConv.convId) || {
      id: parsedConv.convId,
      shortId: parsedConv.convId.slice(0, 7),
      title: `#${parsedConv.convId.slice(0, 7)}`,
      workspaceName: '(Unassigned)',
      workspacePath: '',
      sessionType: 'main',
      lastTimeMs: parsedConv.mtimeMs,
      turns: [],
    };
    existing.turns = parsedConv.turns;
    if (!existing.lastTimeMs || parsedConv.mtimeMs > existing.lastTimeMs) {
      existing.lastTimeMs = parsedConv.mtimeMs;
    }
    sessionsMap.set(parsedConv.convId, existing);
  }

  function scanAntigravityDir(dataDir, forceRescan) {
    const sqliteMod = loadSqlite();
    const sessionsMap = new Map();
    let cacheHits = 0;
    let newlyScanned = 0;
    let scannedFiles = 0;

    if (!sqliteMod || !existsSync(dataDir)) {
      return { rawSessions: [], scannedFiles: 0, cacheHits: 0, newlyScanned: 0 };
    }

    loadAntigravitySummaries(sqliteMod, path.join(dataDir, 'conversation_summaries.db'), sessionsMap);

    const convDir = path.join(dataDir, 'conversations');
    if (existsSync(convDir)) {
      let dbFiles = [];
      try { dbFiles = readdirSync(convDir).filter(f => f.endsWith('.db')).map(f => path.join(convDir, f)); } catch {}
      for (const dbFile of dbFiles) {
        scannedFiles += 1;
        let st;
        try { st = statSync(dbFile); } catch { continue; }
        let walSt = null;
        try { walSt = statSync(`${dbFile}-wal`); } catch {}
        const { parsedConv, cacheHit } = loadOrParseAntigravityConv(sqliteMod, dbFile, st, walSt, forceRescan);
        if (cacheHit) cacheHits += 1;
        else newlyScanned += 1;
        mergeAntigravityConv(sessionsMap, parsedConv);
      }
    }

    return {
      rawSessions: [...sessionsMap.values()],
      scannedFiles,
      cacheHits,
      newlyScanned,
    };
  }

  async function scanAntigravityDirAsync(dataDir, forceRescan) {
    const sqliteMod = loadSqlite();
    const sessionsMap = new Map();
    let cacheHits = 0;
    let newlyScanned = 0;
    let scannedFiles = 0;

    if (!sqliteMod || !existsSync(dataDir)) {
      return { rawSessions: [], scannedFiles: 0, cacheHits: 0, newlyScanned: 0 };
    }

    loadAntigravitySummaries(sqliteMod, path.join(dataDir, 'conversation_summaries.db'), sessionsMap);
    await yieldEventLoop();

    const convDir = path.join(dataDir, 'conversations');
    if (existsSync(convDir)) {
      let dbFiles = [];
      try { dbFiles = (await fsp.readdir(convDir)).filter(f => f.endsWith('.db')).map(f => path.join(convDir, f)); } catch {}
      let sliceStart = Date.now();
      for (const dbFile of dbFiles) {
        scannedFiles += 1;
        let st;
        try { st = await fsp.stat(dbFile); } catch { continue; }
        let walSt = null;
        try { walSt = await fsp.stat(`${dbFile}-wal`); } catch {}
        const { parsedConv, cacheHit } = loadOrParseAntigravityConv(sqliteMod, dbFile, st, walSt, forceRescan);
        if (cacheHit) cacheHits += 1;
        else newlyScanned += 1;
        mergeAntigravityConv(sessionsMap, parsedConv);
        if (Date.now() - sliceStart >= 12) {
          await yieldEventLoop();
          sliceStart = Date.now();
        }
      }
    }

    return {
      rawSessions: [...sessionsMap.values()],
      scannedFiles,
      cacheHits,
      newlyScanned,
    };
  }

  function createSessionCollector(mergeById) {
    if (!mergeById) {
      const list = [];
      return { add: parsed => list.push(parsed), result: () => list };
    }
    const byId = new Map();
    return {
      add(parsed) {
        const existing = byId.get(parsed.id);
        if (existing) {
          existing.turns = existing.turns.concat(parsed.turns);
          if (parsed.lastTimeMs > existing.lastTimeMs) existing.lastTimeMs = parsed.lastTimeMs;
        } else {
          byId.set(parsed.id, { ...parsed, turns: [...parsed.turns] });
        }
      },
      result: () => [...byId.values()],
    };
  }

  function scanJsonlDirSync({ prefix, dataDir, maxDepth, forceRescan, parseBuffer, mergeById = false }) {
    const files = walkJsonlFiles(dataDir, maxDepth);
    const collector = createSessionCollector(mergeById);
    let cacheHits = 0;
    let newlyScanned = 0;

    for (const file of files) {
      let st;
      try { st = statSync(file); } catch { continue; }
      const cacheKey = `${prefix}:${file}`;
      const cached = !forceRescan && fileCache.get(cacheKey);
      let parsed;
      if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
        cacheHits += 1;
        parsed = cached.data;
      } else {
        newlyScanned += 1;
        let buf = null;
        try { buf = readFileSync(file); } catch {}
        parsed = parseBuffer(file, st, buf);
        fileCache.set(cacheKey, { mtimeMs: st.mtimeMs, size: st.size, data: parsed });
      }
      collector.add(parsed);
    }

    return { rawSessions: collector.result(), scannedFiles: files.length, cacheHits, newlyScanned };
  }

  async function scanJsonlDirAsync({ prefix, dataDir, maxDepth, forceRescan, parseBuffer, mergeById = false }) {
    const files = await walkJsonlFilesAsync(dataDir, maxDepth);
    const collector = createSessionCollector(mergeById);
    let cacheHits = 0;
    let newlyScanned = 0;
    let sliceStart = Date.now();

    for (const file of files) {
      let st;
      try { st = await fsp.stat(file); } catch { continue; }
      const cacheKey = `${prefix}:${file}`;
      const cached = !forceRescan && fileCache.get(cacheKey);
      if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
        cacheHits += 1;
        collector.add(cached.data);
        if (Date.now() - sliceStart >= 12) {
          await yieldEventLoop();
          sliceStart = Date.now();
        }
        continue;
      }
      newlyScanned += 1;
      let buf = null;
      try { buf = await fsp.readFile(file); } catch {}
      const parsed = parseBuffer(file, st, buf);
      fileCache.set(cacheKey, { mtimeMs: st.mtimeMs, size: st.size, data: parsed });
      collector.add(parsed);
      await yieldEventLoop();
      sliceStart = Date.now();
    }

    return { rawSessions: collector.result(), scannedFiles: files.length, cacheHits, newlyScanned };
  }

  const scanCodexDir = (dataDir, forceRescan) => scanJsonlDirSync({
    prefix: 'cx', dataDir, maxDepth: 5, forceRescan, parseBuffer: parseCodexJsonlBuffer,
  });
  const scanCodexDirAsync = (dataDir, forceRescan) => scanJsonlDirAsync({
    prefix: 'cx', dataDir, maxDepth: 5, forceRescan, parseBuffer: parseCodexJsonlBuffer,
  });
  const scanClaudeDir = (dataDir, forceRescan) => scanJsonlDirSync({
    prefix: 'cl', dataDir, maxDepth: 4, forceRescan, parseBuffer: parseClaudeJsonlBuffer, mergeById: true,
  });
  const scanClaudeDirAsync = (dataDir, forceRescan) => scanJsonlDirAsync({
    prefix: 'cl', dataDir, maxDepth: 4, forceRescan, parseBuffer: parseClaudeJsonlBuffer, mergeById: true,
  });
  const scanGenericJsonlDir = (dataDir, forceRescan) => scanJsonlDirSync({
    prefix: 'gen', dataDir, maxDepth: 3, forceRescan, parseBuffer: parseGenericJsonlBuffer,
  });
  const scanGenericJsonlDirAsync = (dataDir, forceRescan) => scanJsonlDirAsync({
    prefix: 'gen', dataDir, maxDepth: 3, forceRescan, parseBuffer: parseGenericJsonlBuffer,
  });

  async function scanLocalUsage({
    appId = 'antigravity',
    customDir = '',
    range = '30d',
    granularity = 'day',
    sessionType = 'all',
    model = 'all',
    workspace = 'all',
    forceRescan = false,
  } = {}) {
    const startMs = Date.now();
    const nowMs = typeof now === 'function' ? now() : Number(now) || Date.now();
    const dataDir = customDir && typeof customDir === 'string' && customDir.trim()
      ? customDir.trim()
      : resolveDefaultUsageDir(appId, { homeDir, appDataDir });

    let rawResult;
    if (appId === 'antigravity') rawResult = await scanAntigravityDirAsync(dataDir, forceRescan);
    else if (appId === 'codex' || appId === 'codex-desktop' || appId === 'codex-cli') rawResult = await scanCodexDirAsync(dataDir, forceRescan);
    else if (appId === 'claude-code' || appId === 'claude-desktop' || appId === 'claude') rawResult = await scanClaudeDirAsync(dataDir, forceRescan);
    else rawResult = await scanGenericJsonlDirAsync(dataDir, forceRescan);

    const nowDate = new Date(nowMs);
    let rangeStartMs = 0;
    if (range === 'today' || range === '1d') {
      rangeStartMs = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
    } else if (range === '7d') {
      rangeStartMs = nowMs - 7 * 86_400_000;
    } else if (range === '30d') {
      rangeStartMs = nowMs - 30 * 86_400_000;
    } else if (range === 'month') {
      rangeStartMs = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
    }

    const availableModels = new Set();
    const availableWorkspaces = new Set();

    for (const sess of rawResult.rawSessions) {
      if (sess.workspaceName) availableWorkspaces.add(sess.workspaceName);
      for (const t of sess.turns) {
        availableModels.add(normalizeModelDisplay(t.modelId).label);
      }
    }

    let totalInput = 0;
    let totalThinking = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;
    let totalCacheWrite = 0;
    let exactTurns = 0;
    let estimatedTurns = 0;
    const activeDays = new Set();
    const trendMap = new Map();
    const modelMap = new Map();
    const wsMap = new Map();
    const typeMap = new Map([
      ['main', { type: 'main', label: '主会话', sessionIds: new Set(), turns: 0, inputTokens: 0, thinkingTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0 }],
      ['swarm', { type: 'swarm', label: 'Swarm 协作', sessionIds: new Set(), turns: 0, inputTokens: 0, thinkingTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0 }],
      ['subagent', { type: 'subagent', label: '子代理', sessionIds: new Set(), turns: 0, inputTokens: 0, thinkingTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0 }],
    ]);
    const filteredSessions = [];

    for (const sess of rawResult.rawSessions) {
      if (sessionType !== 'all' && sess.sessionType !== sessionType) continue;
      if (workspace !== 'all' && sess.workspaceName !== workspace) continue;

      const matchedTurns = [];
      let sessInput = 0;
      let sessThinking = 0;
      let sessOutput = 0;
      let sessCacheRead = 0;
      let sessCacheWrite = 0;
      const sessModels = new Map();
      let sessLastMs = sess.lastTimeMs || 0;

      for (const turn of sess.turns) {
        if (rangeStartMs > 0 && turn.tsMs < rangeStartMs) continue;
        const mInfo = normalizeModelDisplay(turn.modelId);
        if (model !== 'all' && mInfo.label !== model) continue;

        matchedTurns.push(turn);
        if (turn.tsMs > sessLastMs) sessLastMs = turn.tsMs;
        if (!turn.exact) {
          estimatedTurns += 1;
          continue;
        }
        exactTurns += 1;
        const turnCache = turn.cacheRead + turn.cacheWrite;
        const turnTotal = turn.input + turn.thinking + turn.output + turnCache;

        sessInput += turn.input;
        sessThinking += turn.thinking;
        sessOutput += turn.output;
        sessCacheRead += turn.cacheRead;
        sessCacheWrite += turn.cacheWrite;

        totalInput += turn.input;
        totalThinking += turn.thinking;
        totalOutput += turn.output;
        totalCacheRead += turn.cacheRead;
        totalCacheWrite += turn.cacheWrite;

        sessModels.set(mInfo.label, (sessModels.get(mInfo.label) || 0) + 1);
        activeDays.add(formatBucketKey(turn.tsMs, 'day'));

        const bKey = formatBucketKey(turn.tsMs, granularity);
        const curBucket = trendMap.get(bKey) || {
          bucketKey: bKey,
          label: bKey,
          totalTokens: 0,
          inputTokens: 0,
          thinkingTokens: 0,
          outputTokens: 0,
          cacheTokens: 0,
          turns: 0,
        };
        curBucket.totalTokens += turnTotal;
        curBucket.inputTokens += turn.input;
        curBucket.thinkingTokens += turn.thinking;
        curBucket.outputTokens += turn.output;
        curBucket.cacheTokens += turnCache;
        curBucket.turns += 1;
        trendMap.set(bKey, curBucket);

        const curM = modelMap.get(mInfo.label) || {
          model: mInfo.label,
          provider: mInfo.provider,
          sessionIds: new Set(),
          turns: 0,
          inputTokens: 0,
          thinkingTokens: 0,
          outputTokens: 0,
          cacheTokens: 0,
          totalTokens: 0,
        };
        curM.sessionIds.add(sess.id);
        curM.turns += 1;
        curM.inputTokens += turn.input;
        curM.thinkingTokens += turn.thinking;
        curM.outputTokens += turn.output;
        curM.cacheTokens += turnCache;
        curM.totalTokens += turnTotal;
        modelMap.set(mInfo.label, curM);

        const typeBucket = typeMap.get(sess.sessionType) || typeMap.get('main');
        typeBucket.sessionIds.add(sess.id);
        typeBucket.turns += 1;
        typeBucket.inputTokens += turn.input;
        typeBucket.thinkingTokens += turn.thinking;
        typeBucket.outputTokens += turn.output;
        typeBucket.cacheTokens += turnCache;
        typeBucket.totalTokens += turnTotal;
      }

      const inWindow = rangeStartMs === 0 || (sess.lastTimeMs && sess.lastTimeMs >= rangeStartMs) || matchedTurns.length > 0;
      if (!inWindow) continue;
      if (model !== 'all' && matchedTurns.length === 0) continue;

      const sessCache = sessCacheRead + sessCacheWrite;
      const sessTotal = sessInput + sessThinking + sessOutput + sessCache;

      const wsKey = `${sess.workspaceName}|${sess.workspacePath}`;
      const curWs = wsMap.get(wsKey) || {
        name: sess.workspaceName,
        path: sess.workspacePath || '—',
        sessions: 0,
        turns: 0,
        inputTokens: 0,
        thinkingTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        totalTokens: 0,
      };
      curWs.sessions += 1;
      curWs.turns += matchedTurns.length;
      curWs.inputTokens += sessInput;
      curWs.thinkingTokens += sessThinking;
      curWs.outputTokens += sessOutput;
      curWs.cacheTokens += sessCache;
      curWs.totalTokens += sessTotal;
      wsMap.set(wsKey, curWs);

      if (matchedTurns.length === 0) {
        const typeBucket = typeMap.get(sess.sessionType) || typeMap.get('main');
        typeBucket.sessionIds.add(sess.id);
      }

      let primaryModel = 'Unknown';
      let maxModelTurns = -1;
      for (const [mName, cnt] of sessModels.entries()) {
        if (cnt > maxModelTurns) {
          maxModelTurns = cnt;
          primaryModel = mName;
        }
      }

      filteredSessions.push({
        id: sess.id,
        shortId: sess.shortId,
        title: sess.title,
        workspaceName: sess.workspaceName,
        workspacePath: sess.workspacePath || '',
        sessionType: sess.sessionType,
        model: primaryModel,
        turns: matchedTurns.length,
        inputTokens: sessInput,
        thinkingTokens: sessThinking,
        outputTokens: sessOutput,
        cacheTokens: sessCache,
        totalTokens: sessTotal,
        lastTime: sessLastMs ? new Date(sessLastMs).toISOString() : null,
      });
    }

    const totalCache = totalCacheRead + totalCacheWrite;
    const totalTokens = totalInput + totalThinking + totalOutput + totalCache;
    const totalTurnsCount = exactTurns + estimatedTurns;
    const exactCoveragePct = totalTurnsCount > 0 ? Math.round((exactTurns / totalTurnsCount) * 1000) / 10 : 100;
    const activeDailyAvg = activeDays.size > 0 ? Math.round(totalTokens / activeDays.size) : 0;

    const trend = [...trendMap.values()].sort((a, b) => a.bucketKey.localeCompare(b.bucketKey));
    const byModel = [...modelMap.values()]
      .map(({ sessionIds, ...rest }) => ({ ...rest, sessions: sessionIds.size }))
      .sort((a, b) => b.totalTokens - a.totalTokens || b.turns - a.turns);
    const byWorkspace = [...wsMap.values()].sort((a, b) => b.totalTokens - a.totalTokens || b.sessions - a.sessions);
    const bySessionType = [...typeMap.values()].map(({ sessionIds, ...rest }) => ({
      ...rest,
      sessions: sessionIds.size,
      sharePct: totalTokens > 0 ? Math.round((rest.totalTokens / totalTokens) * 1000) / 10 : 0,
    }));

    filteredSessions.sort((a, b) => (Date.parse(b.lastTime || 0) || 0) - (Date.parse(a.lastTime || 0) || 0));

    return Object.freeze({
      appId,
      dataDir,
      scannedAt: new Date(nowMs).toISOString(),
      scanMs: Math.max(1, Date.now() - startMs),
      scannedFiles: rawResult.scannedFiles,
      cacheHits: rawResult.cacheHits,
      newlyScanned: rawResult.newlyScanned,
      totals: {
        totalTokens,
        inputTokens: totalInput,
        thinkingTokens: totalThinking,
        outputTokens: totalOutput,
        cacheReadTokens: totalCacheRead,
        cacheWriteTokens: totalCacheWrite,
        cacheTokens: totalCache,
        sessions: filteredSessions.length,
        turns: exactTurns,
        exactCoveragePct,
        activeDailyAvg,
        estimatedTurns,
        estimatedTokens: estimatedTurns * 242,
      },
      trend,
      byModel,
      byWorkspace,
      bySessionType,
      sessions: filteredSessions.slice(0, 200),
      filters: {
        models: [...availableModels].sort(),
        workspaces: [...availableWorkspaces].sort(),
        sessionTypes: ['main', 'swarm', 'subagent'],
      },
    });
  }

  function scanTelemetryBuckets({
    appIds = ['antigravity', 'codex', 'claude-code'],
    customDataDirs = {},
    days = 30,
  } = {}) {
    const nowMs = typeof now === 'function' ? now() : Number(now) || Date.now();
    const safeDays = Math.max(1, Math.min(90, Number(days) || 30));
    const cutoffMs = nowMs - safeDays * 86_400_000;
    const bucketMap = new Map();

    for (const appId of (Array.isArray(appIds) ? appIds : [])) {
      if (typeof appId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(appId)) continue;
      const customDir = typeof customDataDirs?.[appId] === 'string' && customDataDirs[appId].trim()
        ? customDataDirs[appId].trim()
        : '';
      const dataDir = customDir || resolveDefaultUsageDir(appId, { homeDir, appDataDir });
      let rawResult;
      if (appId === 'antigravity') rawResult = scanAntigravityDir(dataDir, false);
      else if (appId === 'codex' || appId === 'codex-desktop' || appId === 'codex-cli') rawResult = scanCodexDir(dataDir, false);
      else if (appId === 'claude-code' || appId === 'claude-desktop' || appId === 'claude') rawResult = scanClaudeDir(dataDir, false);
      else rawResult = scanGenericJsonlDir(dataDir, false);

      for (const sess of (rawResult?.rawSessions || [])) {
        const sType = ['main', 'swarm', 'subagent'].includes(sess.sessionType) ? sess.sessionType : 'main';
        for (const turn of (sess.turns || [])) {
          if (!turn.exact || (cutoffMs > 0 && turn.tsMs < cutoffMs)) continue;
          const bucketDate = formatBucketKey(turn.tsMs, 'day');
          const mLabel = normalizeModelDisplay(turn.modelId).label.slice(0, 120) || 'Unknown';
          const cacheTokens = Math.max(0, Math.round((turn.cacheRead || 0) + (turn.cacheWrite || 0)));
          const inputTokens = Math.max(0, Math.round(turn.input || 0));
          const thinkingTokens = Math.max(0, Math.round(turn.thinking || 0));
          const outputTokens = Math.max(0, Math.round(turn.output || 0));
          const totalTokens = inputTokens + thinkingTokens + outputTokens + cacheTokens;
          if (totalTokens <= 0) continue;

          // Privacy §16.1: aggregate strictly by (date, app, model, sessionType); never include title or workspace fields.
          const key = `${bucketDate}|${appId}|${mLabel}|${sType}`;
          let b = bucketMap.get(key);
          if (!b) {
            b = {
              bucketDate,
              appId,
              model: mLabel,
              sessionType: sType,
              sessionIds: new Set(),
              turns: 0,
              inputTokens: 0,
              thinkingTokens: 0,
              outputTokens: 0,
              cacheTokens: 0,
              totalTokens: 0,
            };
            bucketMap.set(key, b);
          }
          b.sessionIds.add(sess.id);
          b.turns += 1;
          b.inputTokens += inputTokens;
          b.thinkingTokens += thinkingTokens;
          b.outputTokens += outputTokens;
          b.cacheTokens += cacheTokens;
          b.totalTokens += totalTokens;
        }
      }
    }

    return [...bucketMap.values()]
      .map(({ sessionIds, ...rest }) => ({
        bucketDate: rest.bucketDate,
        appId: rest.appId,
        model: rest.model,
        sessionType: rest.sessionType,
        sessions: sessionIds.size,
        turns: rest.turns,
        inputTokens: rest.inputTokens,
        thinkingTokens: rest.thinkingTokens,
        outputTokens: rest.outputTokens,
        cacheTokens: rest.cacheTokens,
        totalTokens: rest.totalTokens,
      }))
      .sort((a, b) => b.bucketDate.localeCompare(a.bucketDate) || b.totalTokens - a.totalTokens)
      .slice(0, 200);
  }

  return Object.freeze({
    scanLocalUsage,
    scanTelemetryBuckets,
  });
}
