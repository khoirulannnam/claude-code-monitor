#!/usr/bin/env node
// Claude Code statusLine command: saves rate_limits from stdin for the usage monitor card.
// Prints nothing, so the status line stays empty.
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = path.join(os.homedir(), '.claude', 'usage-monitor-rate-limits.json');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const rl = JSON.parse(raw).rate_limits;
    // absent for non-subscribers and before the first API response: keep the last saved value
    if (!rl) return;
    const tmp = OUT + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ savedAt: Date.now(), rate_limits: rl }));
    fs.renameSync(tmp, OUT);
  } catch {
    // never break the status line
  }
});
