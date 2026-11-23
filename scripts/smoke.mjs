// Boots the built app headlessly, screenshots the first screen and fails if
// the renderer never painted any content.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import electron from 'electron';

const out = process.argv[2] ?? path.join(process.cwd(), 'release/smoke.png');
mkdirSync(path.dirname(out), { recursive: true });

if (!existsSync(path.join(process.cwd(), 'dist/index.html'))) {
  console.error('[smoke] build the renderer first (npm run build)');
  process.exit(1);
}

const args = ['.', '--no-sandbox', '--disable-gpu'];
const useXvfb = process.platform === 'linux' && !process.env.DISPLAY;
const cmd = useXvfb ? 'xvfb-run' : electron;
const argv = useXvfb ? ['-a', '--server-args=-screen 0 1600x1000x24', electron, ...args] : args;

const child = spawn(cmd, argv, {
  stdio: 'inherit',
  env: { ...process.env, ZOVEX_SMOKE: out, ZOVEX_SMOKE_WAIT: process.env.ZOVEX_SMOKE_WAIT ?? '35000' },
});
child.on('close', (code) => process.exit(code ?? 1));
