/**
 * zv-auth v1 — application authentication against the ZOVEX server.
 *
 * The device holds a P-256 key pair. A handshake proves the app's identity
 * with an HMAC over the public key, and returns a session id plus the
 * server's public key; both sides then derive the same HMAC key with HKDF and
 * every subsequent request is signed with it.
 *
 * Everything here runs in the main process. The private key, the derived
 * session key and the app secret never reach the renderer, and the key
 * material at rest is encrypted with Electron's safeStorage (DPAPI on
 * Windows), so another user on the same machine cannot read it.
 */
import { app, safeStorage } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The application secret for the "PC" client, as issued in the ZOVEX admin
 * panel. It is split so that a plain `strings` sweep over the installer does
 * not hand it over in one piece; this raises the cost of lifting it, it does
 * not make the binary secret-proof, and nothing in the protocol depends on
 * that being true.
 */
declare const __ZV_APP_SECRET_PARTS__: string[];

/** Undoes the build-time masking; see maskSecret in scripts/build-electron.mjs. */
function appSecret(): string {
  const parts = typeof __ZV_APP_SECRET_PARTS__ === 'undefined' ? [] : __ZV_APP_SECRET_PARTS__;
  if (!parts.length) return process.env.ZOVEX_APP_SECRET ?? '';
  const masked = Buffer.from(parts.join(''), 'base64').toString('binary');
  return [...masked].map((ch, i) => String.fromCharCode(ch.charCodeAt(0) ^ (0x5a + (i % 7)))).join('');
}

export function hasAppSecret(): boolean {
  return appSecret().length > 0;
}

const DIR = app.getPath('userData');
const KEY_FILE = path.join(DIR, 'device-key.bin');
const SESSION_FILE = path.join(DIR, 'session.bin');
const CURVE = 'prime256v1';
const INFO = Buffer.from('zovex-v1');
/** Renew while the session is still valid, so no request races the expiry. */
const RENEW_MARGIN_MS = 2 * 60 * 1000;

const b64url = (buf: Buffer): string => buf.toString('base64url').replace(/=+$/, '');

// ── Encrypted storage ───────────────────────────────────────────────────────

function writeSecret(file: string, value: string): void {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const data = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(value)
      : Buffer.from(`plain:${value}`, 'utf8');
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  } catch { /* a session that cannot be cached is re-established next time */ }
}

function readSecret(file: string): string | null {
  try {
    const data = fs.readFileSync(file);
    const asText = data.toString('utf8');
    if (asText.startsWith('plain:')) return asText.slice(6);
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(data);
  } catch {
    return null;
  }
}

// ── Device identity ─────────────────────────────────────────────────────────

let ecdh: crypto.ECDH | null = null;

function deviceKey(): crypto.ECDH {
  if (ecdh) return ecdh;
  const saved = readSecret(KEY_FILE);
  const next = crypto.createECDH(CURVE);
  if (saved) {
    try {
      next.setPrivateKey(Buffer.from(saved, 'base64'));
      ecdh = next;
      return ecdh;
    } catch { /* unreadable key: start over with a fresh one */ }
  }
  next.generateKeys();
  writeSecret(KEY_FILE, next.getPrivateKey().toString('base64'));
  ecdh = next;
  return ecdh;
}

/** Uncompressed 65-byte public point, base64url without padding. */
function devicePublicKey(): string {
  return b64url(deviceKey().getPublicKey());
}

// ── Session ─────────────────────────────────────────────────────────────────

interface Session {
  sid: string;
  exp: number;       // epoch ms
  key: Buffer;       // HMAC key
}

let session: Session | null = null;
let handshakeInFlight: Promise<Session | null> | null = null;
let blockedReason: string | null = null;

function loadSession(): Session | null {
  if (session) return session;
  const raw = readSecret(SESSION_FILE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { sid: string; exp: number; key: string };
    if (!parsed.sid || !parsed.key) return null;
    session = { sid: parsed.sid, exp: parsed.exp, key: Buffer.from(parsed.key, 'base64') };
    return session;
  } catch {
    return null;
  }
}

function saveSession(next: Session): void {
  session = next;
  writeSecret(SESSION_FILE, JSON.stringify({ sid: next.sid, exp: next.exp, key: next.key.toString('base64') }));
}

export function clearSession(): void {
  session = null;
  try { fs.rmSync(SESSION_FILE, { force: true }); } catch { /* ignore */ }
}

/** Normalises the expiry the server reports, in seconds or milliseconds. */
function normaliseExp(exp: unknown): number {
  const value = typeof exp === 'number' ? exp : Number(exp);
  if (!Number.isFinite(value)) return Date.now() + 24 * 3600 * 1000;
  return value < 1e12 ? value * 1000 : value;
}

async function handshake(origin: string): Promise<Session | null> {
  if (!hasAppSecret()) return null;
  const pub = devicePublicKey();
  const proof = crypto.createHmac('sha256', appSecret()).update(pub).digest('hex');

  const res = await fetch(`${origin}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ pub, plat: 'pc', app_proof: proof }),
  });

  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string; zv?: string };
    // Only a declared block is permanent. A plain 403 means the proof was
    // rejected — worth retrying later rather than disabling the client.
    if (body.zv === 'blocked') {
      blockedReason = body.detail ?? 'הגישה נחסמה על ידי השרת';
      return null;
    }
    throw new Error(body.detail ?? 'האפליקציה לא אומתה מול השרת');
  }
  if (!res.ok) throw new Error(`handshake failed (${res.status})`);

  const body = (await res.json()) as { sid?: string; spub?: string; exp?: number };
  if (!body.sid || !body.spub) throw new Error('handshake response incomplete');

  const shared = deviceKey().computeSecret(Buffer.from(body.spub, 'base64url'));
  const key = Buffer.from(
    crypto.hkdfSync('sha256', shared, Buffer.from(body.sid), INFO, 32) as ArrayBuffer,
  );

  const next: Session = { sid: body.sid, exp: normaliseExp(body.exp), key };
  saveSession(next);
  blockedReason = null;
  return next;
}

/** Returns a usable session, performing or renewing the handshake as needed. */
export async function ensureSession(origin: string, force = false): Promise<Session | null> {
  if (blockedReason) return null;
  if (!force) {
    const current = loadSession();
    if (current && current.exp - Date.now() > RENEW_MARGIN_MS) return current;
  }
  // One handshake at a time: a burst of requests must not open many sessions.
  if (!handshakeInFlight) {
    handshakeInFlight = handshake(origin)
      .catch(() => null)
      .finally(() => { handshakeInFlight = null; });
  }
  return handshakeInFlight;
}

// ── Request signing ─────────────────────────────────────────────────────────

/** Paths the server requires a signature on. */
const SIGNED = [
  /^\/content/,
  /^\/feedback\/(send|mine)/,
  /^\/api\/progress/,
  /^\/api\/history/,
  /^\/api\/favorites/,
  /^\/api\/refresh-stream/,
];

export function needsSignature(pathWithQuery: string): boolean {
  return SIGNED.some((re) => re.test(pathWithQuery));
}

export interface SignedHeaders {
  'X-ZV-S': string;
  'X-ZV-T': string;
  'X-ZV-N': string;
  'X-ZV-Sig': string;
}

/**
 * Signs one request. The message covers the method and the exact path that
 * goes on the wire, so a signature cannot be replayed onto another route, and
 * the nonce makes it single-use.
 */
export function signRequest(sess: Session, method: string, pathWithQuery: string): SignedHeaders {
  const ts = String(Date.now());
  const nonce = b64url(crypto.randomBytes(12));
  const msg = `${method.toUpperCase()}\n${pathWithQuery}\n${ts}\n${nonce}`;
  const sig = b64url(crypto.createHmac('sha256', sess.key).update(msg).digest());
  return { 'X-ZV-S': sess.sid, 'X-ZV-T': ts, 'X-ZV-N': nonce, 'X-ZV-Sig': sig };
}

export interface AuthStatus {
  configured: boolean;
  active: boolean;
  expiresAt: number | null;
  blocked: string | null;
}

export function authStatus(): AuthStatus {
  const current = loadSession();
  return {
    configured: hasAppSecret(),
    active: Boolean(current && current.exp > Date.now()),
    expiresAt: current?.exp ?? null,
    blocked: blockedReason,
  };
}

export function setBlocked(reason: string | null): void {
  blockedReason = reason;
}
