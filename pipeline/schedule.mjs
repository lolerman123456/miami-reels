// Install / remove the daily macOS job (launchd).
//   node pipeline/schedule.mjs 18:30     → create + post a Reel every day at 6:30pm
//   node pipeline/schedule.mjs off       → stop the daily job
// If the Mac is asleep at that time, it runs as soon as it wakes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT } from './util.mjs';

const LABEL = 'com.miamireels.daily';
const plist = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const arg = process.argv[2];

try { execSync(`launchctl unload "${plist}"`, { stdio: 'ignore' }); } catch {}

if (!arg || arg === 'off') {
  if (fs.existsSync(plist)) fs.unlinkSync(plist);
  console.log('Daily job removed.');
  process.exit(0);
}

const m = arg.match(/^(\d{1,2}):(\d{2})$/);
if (!m) { console.error('Usage: node pipeline/schedule.mjs HH:MM | off'); process.exit(1); }
const [hour, minute] = [+m[1], +m[2]];
const logDir = path.join(ROOT, 'out');
fs.mkdirSync(logDir, { recursive: true });

fs.writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${process.execPath}</string><string>${path.join(ROOT, 'pipeline', 'daily.mjs')}</string></array>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${path.dirname(process.execPath)}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>
  <key>StandardOutPath</key><string>${path.join(logDir, 'daily.log')}</string>
  <key>StandardErrorPath</key><string>${path.join(logDir, 'daily.log')}</string>
</dict>
</plist>
`);
execSync(`launchctl load "${plist}"`);
console.log(`Daily Reel scheduled at ${arg}. Log: out/daily.log`);
