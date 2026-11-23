/**
 * Durable, crash-safe JSON storage in the user's app-data directory.
 *
 * Settings survive uninstall/reinstall and upgrades because electron-builder
 * leaves %APPDATA%/zovex-desktop alone; the installer only removes program files.
 */
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AuthState, Settings } from '../shared/types';

const DIR = app.getPath('userData');

function readJson<T>(file: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(path.join(DIR, file), 'utf8');
    return { ...fallback, ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback;
  }
}

/** Atomic write: a power cut mid-write leaves the previous file intact. */
function writeJson(file: string, value: unknown): void {
  const target = path.join(DIR, file);
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, target);
  } catch {
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  }
}

/**
 * Google OAuth client for this desktop app.
 *
 * Shipped with the app by the owner's decision, which matches Google's own
 * position on installed-app clients: the secret identifies the application on
 * the consent screen and nothing more. It grants no access to the owner's
 * Google account, to the Cloud project or to any user's data, and the only
 * scopes requested are name, e-mail and picture. Every user still has to
 * approve the sign-in themselves.
 *
 * A build environment may override both, and so may the user from Settings.
 * The values can be revoked at any time in Google Cloud Console.
 */
const BUILD_GOOGLE_CLIENT_ID = process.env.ZOVEX_GOOGLE_CLIENT_ID
  || '1095467813314-0gc3vhft8c8coip08d7e2fkt4vma1gsn.apps.googleusercontent.com';
const BUILD_GOOGLE_CLIENT_SECRET = process.env.ZOVEX_GOOGLE_CLIENT_SECRET
  || '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';

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: 'https://zovex.duckdns.org',
  googleClientId: BUILD_GOOGLE_CLIENT_ID,
  googleClientSecret: BUILD_GOOGLE_CLIENT_SECRET,
  theme: 'dark',
  accentHue: 354,
  reduceMotion: false,
  posterSize: 'comfortable',
  autoplayNext: true,
  resumePlayback: true,
  defaultVolume: 0.9,
  seekStep: 10,
  hardwareAcceleration: true,
  minimizeToTray: false,
  launchOnStartup: false,
  confirmOnExit: false,
  syncHistory: true,
  deviceId: '',
  accountId: null,
  showSplash: true,
};

let settings: Settings = DEFAULT_SETTINGS;
let auth: AuthState = { profile: null, signedInAt: null };

export function loadStore(): void {
  settings = readJson<Settings>('settings.json', DEFAULT_SETTINGS);
  if (!settings.deviceId) {
    settings.deviceId = `u_${crypto.randomBytes(9).toString('base64url')}${Date.now().toString(36)}`;
    writeJson('settings.json', settings);
  }
  // A build that now carries OAuth values should fill in what an older
  // install saved as empty, without overwriting anything the user typed.
  if (!settings.googleClientId && BUILD_GOOGLE_CLIENT_ID) settings.googleClientId = BUILD_GOOGLE_CLIENT_ID;
  if (!settings.googleClientSecret && BUILD_GOOGLE_CLIENT_SECRET) settings.googleClientSecret = BUILD_GOOGLE_CLIENT_SECRET;

  auth = readJson<AuthState>('auth.json', { profile: null, signedInAt: null });
}

export function getSettings(): Settings {
  return settings;
}

export function patchSettings(patch: Partial<Settings>): Settings {
  settings = { ...settings, ...patch };
  writeJson('settings.json', settings);
  return settings;
}

export function resetSettings(): Settings {
  const keep = { deviceId: settings.deviceId };
  settings = { ...DEFAULT_SETTINGS, ...keep };
  writeJson('settings.json', settings);
  return settings;
}

export function getAuth(): AuthState {
  return auth;
}

export function setAuth(next: AuthState): AuthState {
  auth = next;
  writeJson('auth.json', auth);
  return auth;
}

/** The id sent to the server as x-user-id. */
export function currentUserId(): string {
  return settings.accountId || settings.deviceId;
}

// ── Generic key/value bucket used for favourites, local history, UI memory ───

type Bucket = Record<string, unknown>;
let bucket: Bucket | null = null;

export function kvGet<T>(key: string, fallback: T): T {
  if (!bucket) bucket = readJson<Bucket>('appdata.json', {});
  const v = bucket[key];
  return v === undefined ? fallback : (v as T);
}

export function kvSet(key: string, value: unknown): void {
  if (!bucket) bucket = readJson<Bucket>('appdata.json', {});
  bucket[key] = value;
  writeJson('appdata.json', bucket);
}

// ── Catalog cache (large; kept in its own file) ──────────────────────────────

export interface CatalogCache {
  items: unknown[];
  fetchedAt: number;
  etag?: string;
}

const CATALOG_FILE = path.join(DIR, 'catalog-cache.json');

export function readCatalogCache(): CatalogCache | null {
  try {
    const raw = fs.readFileSync(CATALOG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as CatalogCache;
    return Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCatalogCache(cache: CatalogCache): void {
  const tmp = `${CATALOG_FILE}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(cache), 'utf8');
    fs.renameSync(tmp, CATALOG_FILE);
  } catch {
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  }
}

export function clearCatalogCache(): void {
  try { fs.rmSync(CATALOG_FILE, { force: true }); } catch { /* ignore */ }
}

export function cacheSizeBytes(): number {
  try { return fs.statSync(CATALOG_FILE).size; } catch { return 0; }
}
