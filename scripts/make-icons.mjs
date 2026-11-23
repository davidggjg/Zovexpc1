// Generates every Windows / renderer icon asset from resources/icon.svg.
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const svg = path.join(root, 'resources/icon.svg');
const buildDir = path.join(root, 'build');
const pubDir = path.join(root, 'public');
await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(pubDir, { recursive: true });

const render = (size, out) =>
  sharp(svg, { density: 384 }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toFile(out);

// Main app icon (electron-builder reads build/icon.png for Linux + 256px ICO source)
await render(1024, path.join(buildDir, 'icon.png'));
await render(512, path.join(pubDir, 'icon-512.png'));
await render(256, path.join(pubDir, 'icon-256.png'));
await render(64, path.join(pubDir, 'icon-64.png'));

// Multi-resolution Windows ICO
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const tmp = [];
for (const s of icoSizes) {
  const f = path.join(buildDir, `.ico-${s}.png`);
  await render(s, f);
  tmp.push(f);
}
await fs.writeFile(path.join(buildDir, 'icon.ico'), await pngToIco(tmp));
await Promise.all(tmp.map((f) => fs.rm(f, { force: true })));

// NSIS installer header (150x57) + sidebar (164x314), brand-matched
const tile = await sharp(svg, { density: 384 }).resize(512, 512).png().toBuffer();
await sharp({ create: { width: 150, height: 57, channels: 4, background: '#0B0D12' } })
  .composite([{ input: await sharp(tile).resize(44, 44).png().toBuffer(), top: 7, left: 98 }])
  .png().toFile(path.join(buildDir, 'installerHeader.bmp'));
await sharp({ create: { width: 164, height: 314, channels: 4, background: '#0B0D12' } })
  .composite([{ input: await sharp(tile).resize(104, 104).png().toBuffer(), top: 60, left: 30 }])
  .png().toFile(path.join(buildDir, 'installerSidebar.bmp'));

console.log('icons: build/icon.ico, build/icon.png, installer bitmaps, public/icon-*.png');
