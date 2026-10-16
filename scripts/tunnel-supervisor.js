'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'cloudflared');
const LOG_DIR = path.join(ROOT, 'logs');
const URL_FILE = path.join(LOG_DIR, 'current-tunnel-url.txt');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

let child = null;
let restarting = false;

function startTunnel() {
  restarting = false;
  console.log(`[TunnelSupervisor] Starting Cloudflare tunnel at ${new Date().toISOString()}...`);

  child = spawn(BIN, ['tunnel', '--url', 'http://127.0.0.1:3000'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const handleOutput = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);

    const urlMatch = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (urlMatch) {
      const url = urlMatch[0];
      fs.writeFileSync(URL_FILE, url + '\n', 'utf8');
      console.log(`\n[TunnelSupervisor] Active Public URL saved: ${url}\n`);
    }

    if (text.includes('Unauthorized: Tunnel not found')) {
      if (!restarting) {
        restarting = true;
        console.warn('[TunnelSupervisor] Quick tunnel session expired; restarting for fresh tunnel...');
        try { child.kill('SIGTERM'); } catch {}
      }
    }
  };

  child.stdout.on('data', handleOutput);
  child.stderr.on('data', handleOutput);

  child.on('exit', (code, signal) => {
    console.log(`[TunnelSupervisor] cloudflared exited (code=${code}, signal=${signal}). Restarting in 3s...`);
    setTimeout(startTunnel, 3000);
  });
}

startTunnel();
