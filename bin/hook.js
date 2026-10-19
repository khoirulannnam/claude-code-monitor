#!/usr/bin/env node
// Claude Code hook: records per-session state for the usage monitor card. Prints nothing.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = path.join(os.homedir(), '.claude', 'usage-monitor', 'sessions');

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// Walk up from the hook's parent to the claude/node process that owns the session.
// Costs one PowerShell call, so it only runs the first time a session is seen.
function resolveOwnerPid() {
  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress'],
      { encoding: 'utf8', timeout: 8000, windowsHide: true }
    );
    const byPid = new Map(JSON.parse(out).map((p) => [p.ProcessId, p]));
    let cur = byPid.get(process.ppid);
    for (let i = 0; cur && i < 10; i++) {
      if (/^(claude|node)\.exe$/i.test(cur.Name)) return cur.ProcessId;
      cur = byPid.get(cur.ParentProcessId);
    }
  } catch { /* fall back to staleness check in the card */ }
  return null;
}

function statusFor(event, input) {
  switch (event) {
    case 'SessionStart': return 'idle';
    case 'UserPromptSubmit': return 'working';
    case 'PostToolUse': return 'working'; // flips back after a permission prompt is approved
    case 'Stop': return 'idle';
    case 'Notification':
      // the 60s idle reminder is not a request for attention
      return /waiting for your input/i.test(input.message || '') ? 'idle' : 'attention';
    default: return null;
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw);
    const id = input.session_id;
    if (!id || !/^[\w-]+$/.test(id)) return;
    const file = path.join(DIR, id + '.json');

    if (input.hook_event_name === 'SessionEnd') {
      try { fs.unlinkSync(file); } catch { /* already gone */ }
      return;
    }

    const status = statusFor(input.hook_event_name, input);
    if (!status) return;

    fs.mkdirSync(DIR, { recursive: true });
    let prev = null;
    try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first event */ }

    const now = Date.now();
    const pid = prev && prev.pid && isAlive(prev.pid) ? prev.pid : resolveOwnerPid();
    const state = {
      sessionId: id,
      cwd: input.cwd || (prev && prev.cwd) || '',
      status,
      since: prev && prev.status === status ? prev.since : now,
      updatedAt: now,
      pid,
    };
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, file);
  } catch {
    // never break Claude Code
  }
});
