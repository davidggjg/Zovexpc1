// Bundles the Electron main process + preload with esbuild (CJS, no runtime deps).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const watch = process.argv.includes('--watch');
const dev = process.argv.includes('--dev');

/** XOR each byte with a rotating pad, then emit 8-character chunks. */
function maskSecret(secret) {
  if (!secret) return [];
  const masked = [...secret].map((ch, i) =>
    String.fromCharCode(ch.charCodeAt(0) ^ (0x5a + (i % 7))),
  ).join('');
  return Buffer.from(masked, 'binary').toString('base64').match(/.{1,8}/g) ?? [];
}

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: dev,
  minify: !dev,
  external: ['electron'],
  define: {
    'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
    // Baked in from the build environment; empty when not configured.
    'process.env.ZOVEX_GOOGLE_CLIENT_ID': JSON.stringify(process.env.ZOVEX_GOOGLE_CLIENT_ID ?? ''),
    'process.env.ZOVEX_GOOGLE_CLIENT_SECRET': JSON.stringify(process.env.ZOVEX_GOOGLE_CLIENT_SECRET ?? ''),
    // Split and lightly masked at build time so the bundle holds no
    // contiguous copy of the secret. This raises the cost of lifting it from
    // the installer; it does not make an installed app able to keep a secret.
    '__ZV_APP_SECRET_PARTS__': JSON.stringify(maskSecret(process.env.ZOVEX_APP_SECRET ?? '')),
  },
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
