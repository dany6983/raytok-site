import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RELAY_DIR = path.resolve(__dirname, '..');
const DEV_LOG = path.join(RELAY_DIR, 'dev.log');
const DEV_ERR = path.join(RELAY_DIR, 'dev.err');

let serverProc = null;

export async function startRelayServer(timeoutMs = 30000) {
  // 1. Clear previous logs
  fs.writeFileSync(DEV_LOG, '', 'utf8');
  fs.writeFileSync(DEV_ERR, '', 'utf8');

  console.log('[RELAY HELPER] Starting wrangler dev in background...');

  // 1. Rule: Start-Process -NoNewWindow -FilePath "npx" -ArgumentList "wrangler","dev","-c","relay\\wrangler.toml" -RedirectStandardOutput "relay\\dev.log" -RedirectStandardError "relay\\dev.err"
  const psCmd = `Start-Process -NoNewWindow -FilePath "npx.cmd" -ArgumentList "wrangler","dev","-c","relay\\\\wrangler.toml" -RedirectStandardOutput "relay\\\\dev.log" -RedirectStandardError "relay\\\\dev.err"`;
  
  execSync(`powershell -NoProfile -Command "${psCmd}"`, {
    cwd: path.resolve(RELAY_DIR, '..')
  });

  // 2. Rule: Poll dev.log for "Ready on http://127.0.0.1:8787" up to 30s
  console.log('[RELAY HELPER] Polling dev.log for "Ready on http://127.0.0.1:8787" (max 30s)...');
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(DEV_LOG)) {
      const logContent = fs.readFileSync(DEV_LOG, 'utf8');
      if (logContent.includes('Ready on http://127.0.0.1:8787') || logContent.includes('Ready on http://localhost:8787')) {
        console.log(`[RELAY HELPER] Detected readiness in dev.log (${Date.now() - start}ms)`);
        return true;
      }
    }
    // Also verify via HTTP fetch
    try {
      const res = await fetch('http://127.0.0.1:8787/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'desk' }), signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 401) {
        console.log(`[RELAY HELPER] Relay responded to HTTP (${Date.now() - start}ms)`);
        return true;
      }
    } catch (_) {}

    await new Promise(r => setTimeout(r, 500));
  }

  throw new Error(`[RELAY HELPER] Relay server failed to start within ${timeoutMs}ms`);
}

export function stopRelayServer() {
  console.log('[RELAY HELPER] Stopping relay server via Stop-Process...');
  try {
    execSync('powershell -NoProfile -Command "Stop-Process -Name node -Force -ErrorAction SilentlyContinue"');
  } catch (_) {}
}
