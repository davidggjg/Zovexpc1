// Bundles the Electron main process + preload with esbuild (CJS, no runtime deps).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const watch = process.argv.includes('--watch');
const dev = process.argv.includes('--dev');

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: dev,
  minify: !dev,
  external: ['electron'],
  define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
  logLevel: 'info',
};

const targets = [
  { entryPoints: [path.join(root, 'electron/main.ts')], outfile: path.join(root, 'dist-electron/main.cjs') },
  { entryPoints: [path.join(root, 'electron/preload.ts')], outfile: path.join(root, 'dist-electron/preload.cjs') },
];

// The splash window is plain HTML loaded from disk by the main process.
fs.mkdirSync(path.join(root, 'dist-electron'), { recursive: true });
fs.copyFileSync(path.join(root, 'electron/splash.html'), path.join(root, 'dist-electron/splash.html'));

if (watch) {
  const ctxs = await Promise.all(targets.map((t) => esbuild.context({ ...common, ...t })));
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log('[electron] watching…');
} else {
  await Promise.all(targets.map((t) => esbuild.build({ ...common, ...t })));
}
