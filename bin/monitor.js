#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const MARK = '--usage-monitor';
const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'];

// our entries carry MARK; the regex also catches entries written before MARK existed
const isOurs = (command) =>
  typeof command === 'string' &&
  (command.includes(MARK) || /usage-monitor[\/\\]bin[\/\\](hook|statusline)\.js/.test(command));

const scriptCommand = (name) =>
  `node "${path.join(root, 'bin', name).replace(/\\/g, '/')}" ${MARK}`;

function readSettings() {
  if (!fs.existsSync(SETTINGS)) return {};
  return JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  if (fs.existsSync(SETTINGS)) {
    const backup = SETTINGS + '.usage-monitor.bak';
    if (!fs.existsSync(backup)) fs.copyFileSync(SETTINGS, backup); // keep the first original only
  }
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
}

// drop our hook commands, keep everything else (including empty-group cleanup)
function stripOurHooks(settings) {
  if (!settings.hooks) return;
  for (const event of Object.keys(settings.hooks)) {
    settings.hooks[event] = (settings.hooks[event] || [])
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h.command)) }))
      .filter((g) => g.hooks.length);
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
}

function install(force) {
  let settings;
  try { settings = readSettings(); } catch (e) {
    console.error(`Tidak bisa membaca ${SETTINGS}: ${e.message}`);
    process.exit(1);
  }

  stripOurHooks(settings);
  settings.hooks = settings.hooks || {};
  for (const event of HOOK_EVENTS) {
    settings.hooks[event] = settings.hooks[event] || [];
    settings.hooks[event].push({ hooks: [{ type: 'command', command: scriptCommand('hook.js') }] });
  }

  const sl = settings.statusLine;
  if (sl && !isOurs(sl.command) && !force) {
    console.log('! statusLine sudah dipakai script lain, tidak diganti:');
    console.log(`    ${sl.command}`);
    console.log('  Tanpa itu, persen limit asli (5 jam / 7 hari) tidak akan muncul.');
    console.log('  Ulangi dengan "monitor install --force" kalau mau menggantinya.');
  } else {
    settings.statusLine = { type: 'command', command: scriptCommand('statusline.js') };
  }

  writeSettings(settings);
  console.log(`Terpasang di ${SETTINGS}`);
  console.log(`  hooks: ${HOOK_EVENTS.join(', ')}`);
  console.log('Sesi Claude Code yang sudah terbuka baru terdeteksi setelah di-restart.');
}

function uninstall() {
  const settings = readSettings();
  stripOurHooks(settings);
  if (settings.statusLine && isOurs(settings.statusLine.command)) delete settings.statusLine;
  writeSettings(settings);
  console.log(`Hooks dan statusLine usage-monitor dihapus dari ${SETTINGS}`);
}

function start() {
  // require('electron') resolves to the electron executable path
  const electron = require(path.join(root, 'node_modules', 'electron'));
  // detached so the card keeps running after the terminal is closed or freed
  const child = spawn(electron, [root], { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  console.log('Usage monitor started.');
}

const [cmd, ...flags] = process.argv.slice(2);
const commands = { start, install: () => install(flags.includes('--force')), uninstall };

if (!commands[cmd]) {
  console.log('Usage: monitor <start | install [--force] | uninstall>');
  process.exit(cmd ? 1 : 0);
}
commands[cmd]();
