// Waits for the Vite dev server, then launches Electron in dev mode.
import { spawn } from 'node:child_process';
import electron from 'electron';

const URL = 'http://localhost:5290';

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(URL, { method: 'HEAD' });
      if (res.ok || res.status === 404) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

if (!(await waitForServer())) {
  console.error('[dev] Vite did not start on', URL);
  process.exit(1);
}

const child = spawn(electron, ['.', '--no-sandbox'], {
  stdio: 'inherit',
  env: { ...process.env, ZOVEX_DEV: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
});
child.on('close', (code) => process.exit(code ?? 0));
