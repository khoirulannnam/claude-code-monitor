const fs = require('fs');
const os = require('os');
const path = require('path');
const { costOf } = require('./pricing');

const ROOT = path.join(os.homedir(), '.claude', 'projects');
const CONFIG = path.join(__dirname, 'config.json');
const DEFAULT_BUDGET = { last5h: 25, today: 50, last7d: 200 };

// file path -> { mtimeMs, size, entries: Map<messageId, entry> }
const cache = new Map();

function listJsonl() {
  const files = [];
  let dirs = [];
  try { dirs = fs.readdirSync(ROOT, { withFileTypes: true }); } catch { return files; }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const dir = path.join(ROOT, d.name);
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.jsonl')) files.push(path.join(dir, f));
    }
  }
  return files;
}

function parseFile(file) {
  const entries = new Map();
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const msg = obj.message;
    const u = msg && msg.usage;
    if (!u || !msg.id) continue;

    const cacheWrite = u.cache_creation_input_tokens || 0;
    const cc = u.cache_creation;
    const write1h = cc ? cc.ephemeral_1h_input_tokens || 0 : 0;
    // no TTL breakdown -> treat the whole write as 5m
    const write5m = cc ? cc.ephemeral_5m_input_tokens || 0 : cacheWrite;

    const e = {
      ts: Date.parse(obj.timestamp) || 0,
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0,
      cacheWrite,
      cacheWrite5m: write5m,
      cacheWrite1h: write1h,
    };
    const { cost, known } = costOf(msg.model, e);
    e.cost = cost;
    e.knownModel = known;
    // the same message id repeats once per content block; keep the latest
    entries.set(msg.id, e);
  }
  return entries;
}

function emptyTotals() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0, cost: 0, unpriced: 0 };
}

function add(t, e) {
  t.input += e.input;
  t.output += e.output;
  t.cacheRead += e.cacheRead;
  t.cacheWrite += e.cacheWrite;
  t.requests += 1;
  t.cost += e.cost;
  if (!e.knownModel) t.unpriced += 1;
}

function readBudget() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    return { ...DEFAULT_BUDGET, ...(cfg.budgetUsd || {}) };
  } catch {
    return DEFAULT_BUDGET;
  }
}

const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'usage-monitor', 'sessions');
const STALE_NO_PID_MS = 6 * 3600 * 1000;
const STATUS_ORDER = { attention: 0, working: 1, idle: 2 };

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// Live Claude Code sessions, written by bin/hook.js. Dead sessions are cleaned up here.
function getSessions() {
  const now = Date.now();
  let files = [];
  try { files = fs.readdirSync(SESSIONS_DIR); } catch { return []; }

  const sessions = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const file = path.join(SESSIONS_DIR, f);
    let s;
    try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    const alive = s.pid ? isAlive(s.pid) : now - s.updatedAt < STALE_NO_PID_MS;
    if (!alive) {
      try { fs.unlinkSync(file); } catch { /* ignore */ }
      continue;
    }
    sessions.push({
      id: s.sessionId,
      name: path.basename(s.cwd || '') || s.cwd || 'sesi',
      status: s.status,
      since: s.since,
    });
  }
  sessions.sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) || b.since - a.since);
  return sessions;
}

// Real rate-limit percentages saved by bin/statusline.js (Pro/Max only, updated while Claude Code runs)
function readRateLimits(now) {
  try {
    const file = path.join(os.homedir(), '.claude', 'usage-monitor-rate-limits.json');
    const { savedAt, rate_limits: rl } = JSON.parse(fs.readFileSync(file, 'utf8'));
    const pick = (w) =>
      w && typeof w.used_percentage === 'number' && w.resets_at * 1000 > now
        ? { pct: w.used_percentage, resetsAt: w.resets_at * 1000 }
        : null; // a window whose reset time has passed is stale
    return { last5h: pick(rl.five_hour), last7d: pick(rl.seven_day), savedAt };
  } catch {
    return null;
  }
}

function getUsage() {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const windows = {
    last5h: { since: now - 5 * 3600 * 1000, totals: emptyTotals() },
    today: { since: startOfToday.getTime(), totals: emptyTotals() },
    last7d: { since: now - 7 * 24 * 3600 * 1000, totals: emptyTotals() },
  };

  const seen = new Set(); // a resumed session can copy messages into another file
  for (const file of listJsonl()) {
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    let c = cache.get(file);
    if (!c || c.mtimeMs !== st.mtimeMs || c.size !== st.size) {
      try { c = { mtimeMs: st.mtimeMs, size: st.size, entries: parseFile(file) }; } catch { continue; }
      cache.set(file, c);
    }
    for (const [id, e] of c.entries) {
      if (seen.has(id)) continue;
      seen.add(id);
      for (const w of Object.values(windows)) {
        if (e.ts >= w.since) add(w.totals, e);
      }
    }
  }

  return {
    last5h: windows.last5h.totals,
    today: windows.today.totals,
    last7d: windows.last7d.totals,
    budget: readBudget(),
    rateLimits: readRateLimits(now),
    updatedAt: now,
  };
}

module.exports = { getUsage, getSessions };
