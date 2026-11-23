/**
 * All server communication lives in the main process.
 *
 * Why not in the renderer: the catalog is ~18MB of JSON. Parsing it on the UI
 * thread janks the whole window, and every reopen would re-download it. Here it
 * is fetched once, cached on disk with its ETag, and handed to the renderer as
 * an already-parsed array.
 */
import type {
  AppVersionInfo, CatalogPayload, EpgProgram, FavoriteEntry, FetchResult, HistoryEntry, MediaItem,
} from '../shared/types';
import { currentUserId, getSettings, patchSettings, readCatalogCache, writeCatalogCache } from './store';
import { clearSession, ensureSession, needsSignature, setBlocked, signRequest } from './zvauth';

const USER_AGENT = 'ZovexDesktop';

function base(): string {
  return (getSettings().serverUrl || 'https://zovex.duckdns.org').replace(/\/+$/, '');
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  withUser?: boolean;
  signal?: AbortSignal;
  /** Internal: set while retrying a request that the server asked us to reauth. */
  reauthed?: boolean;
}

export class BlockedError extends Error {}

/**
 * fetch with timeout, exponential backoff, zv-auth signing and no secret ever
 * logged. A 401 carrying {"zv":"reauth"} drops the session and retries once
 * with a fresh handshake; a 403 {"zv":"blocked"} stops, so a blocked client
 * never loops against the server.
 */
async function request(path: string, opts: RequestOptions = {}): Promise<Response> {
  const { method = 'GET', body, timeoutMs = 20000, retries = 2, withUser = false } = opts;
  const absolute = path.startsWith('http');
  const url = absolute ? path : `${base()}${path}`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        ...(opts.headers ?? {}),
      };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (withUser) headers['x-user-id'] = currentUserId();

      // The signature covers the exact path that goes on the wire.
      if (!absolute && needsSignature(path)) {
        const session = await ensureSession(base());
        if (session) Object.assign(headers, signRequest(session, method, path));
      }

      const res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (res.status === 401 || res.status === 403) {
        const detail = (await res.clone().json().catch(() => ({}))) as { zv?: string; detail?: string };
        if (res.status === 403 && detail.zv === 'blocked') {
          setBlocked(detail.detail ?? 'הגישה מהאפליקציה נחסמה');
          throw new BlockedError(detail.detail ?? 'הגישה מהאפליקציה נחסמה');
        }
        if (res.status === 401 && detail.zv === 'reauth' && !opts.reauthed) {
          clearSession();
          const session = await ensureSession(base(), true);
          if (session) {
            clearTimeout(timer);
            opts.signal?.removeEventListener('abort', onAbort);
            return request(path, { ...opts, reauthed: true, retries: 0 });
          }
        }
        return res;
      }

      // 5xx is worth another try; 4xx is the caller's problem and never retried.
      if (res.status >= 500 && attempt < retries) {
        lastError = new HttpError(res.status, `server error ${res.status}`);
      } else {
        return res;
      }
    } catch (err) {
      if (err instanceof BlockedError) throw err;
      lastError = err;
      if (opts.signal?.aborted) throw err;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error('request failed');
}

async function json<T>(path: string, opts: RequestOptions = {}): Promise<FetchResult<T>> {
  try {
    const res = await request(path, opts);
    if (!res.ok) return { ok: false, status: res.status, data: null, error: `HTTP ${res.status}` };
    const text = await res.text();
    if (!text.trim()) return { ok: true, status: res.status, data: null };
    return { ok: true, status: res.status, data: JSON.parse(text) as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'network error';
    return { ok: false, status: 0, data: null, error: message };
  }
}

// ── Catalog ─────────────────────────────────────────────────────────────────

function sanitize(raw: unknown): MediaItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MediaItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : null;
    const title = typeof r.title === 'string' ? r.title : null;
    if (!id || !title) continue; // a row we cannot address or name is unusable
    out.push({
      id,
      title,
      year: typeof r.year === 'number' ? r.year : null,
      category: typeof r.category === 'string' && r.category.trim() ? r.category.trim() : null,
      type: typeof r.type === 'string' ? r.type : null,
      video_url: typeof r.video_url === 'string' ? r.video_url : null,
      video_id: typeof r.video_id === 'string' ? r.video_id : null,
      thumbnail_url: typeof r.thumbnail_url === 'string' ? r.thumbnail_url : null,
      trailer_url: typeof r.trailer_url === 'string' ? r.trailer_url : null,
      custom_slug: typeof r.custom_slug === 'string' ? r.custom_slug : null,
      series_name: typeof r.series_name === 'string' && r.series_name.trim() ? r.series_name.trim() : null,
      season_number: typeof r.season_number === 'number' ? r.season_number : null,
      episode_number: typeof r.episode_number === 'number' ? r.episode_number : null,
      episode_number_end: typeof r.episode_number_end === 'number' ? r.episode_number_end : null,
      episode_title: typeof r.episode_title === 'string' ? r.episode_title : null,
      tmdb_id: (r.tmdb_id as number | string | null) ?? null,
      is_live: r.is_live === true,
      created_date: typeof r.created_date === 'string' ? r.created_date : '',
    });
  }
  return out;
}

/** Absolute URL for images that the server returns as site-relative paths. */
export function absoluteImage(url: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return base() + url;
  return url;
}

let inFlight: Promise<CatalogPayload> | null = null;

export function cachedCatalog(): CatalogPayload | null {
  const cache = readCatalogCache();
  if (!cache) return null;
  return { items: sanitize(cache.items), fetchedAt: cache.fetchedAt, stale: true };
}

/** Fetches /content/lite, falling back to the disk cache when offline. */
/** The server allows 120 catalog pulls an hour; a fresh cache is reused. */
const CATALOG_MIN_AGE_MS = 10 * 60 * 1000;

export function fetchCatalog(force = false): Promise<CatalogPayload> {
  if (inFlight) return inFlight; // de-duplicate concurrent callers
  inFlight = (async (): Promise<CatalogPayload> => {
    const cache = readCatalogCache();
    if (!force && cache && Date.now() - cache.fetchedAt < CATALOG_MIN_AGE_MS) {
      inFlight = null;
      return { items: sanitize(cache.items), fetchedAt: cache.fetchedAt, stale: false };
    }
    const headers: Record<string, string> = {};
    if (cache?.etag && !force) headers['If-None-Match'] = cache.etag;
    try {
      const res = await request('/content/lite', { timeoutMs: 120000, retries: 1, headers });
      if (res.status === 304 && cache) {
        return { items: sanitize(cache.items), fetchedAt: cache.fetchedAt, stale: false };
      }
      if (res.status === 401) throw new HttpError(401, 'האפליקציה אינה מאומתת מול שרת ZOVEX');
      if (res.status === 403) throw new HttpError(403, 'הגישה מהאפליקציה נחסמה על ידי השרת');
      if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status}`);
      const raw = (await res.json()) as unknown[];
      const items = sanitize(raw);
      if (!items.length) throw new Error('empty catalog');
      const fetchedAt = Date.now();
      writeCatalogCache({ items: raw, fetchedAt, etag: res.headers.get('etag') ?? undefined });
      return { items, fetchedAt, stale: false };
    } catch (err) {
      if (cache) return { items: sanitize(cache.items), fetchedAt: cache.fetchedAt, stale: true };
      throw err;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export async function fetchItem(id: string): Promise<MediaItem | null> {
  const res = await json<Record<string, unknown>>(`/content/item/${encodeURIComponent(id)}`, { timeoutMs: 15000 });
  if (!res.ok || !res.data) return null;
  const [item] = sanitize([{ ...res.data, id: res.data.id ?? id }]);
  if (!item) return null;
  const description = typeof res.data.description === 'string' ? res.data.description : null;
  return { ...item, description };
}

// ── EPG ─────────────────────────────────────────────────────────────────────

export async function fetchEpg(slug: string): Promise<EpgProgram[]> {
  const one = await json<{ programs?: EpgProgram[] }>(`/epg/${encodeURIComponent(slug)}.json`, { timeoutMs: 10000, retries: 1 });
  let programs = one.ok && Array.isArray(one.data?.programs) ? one.data!.programs! : null;
  if (!programs) {
    const all = await json<{ channels?: Record<string, { programs?: EpgProgram[] }> }>('/epg.json', { timeoutMs: 30000, retries: 0 });
    programs = all.data?.channels?.[slug]?.programs ?? [];
  }
  return programs
    .filter((p) => p && typeof p.start === 'number' && typeof p.end === 'number')
    .sort((a, b) => a.start - b.start);
}

// ── Watch progress & history (server-side, keyed by x-user-id) ──────────────

export async function saveProgress(mediaId: string, position: number, duration: number): Promise<boolean> {
  if (!mediaId || !getSettings().syncHistory) return false;
  const res = await json('/api/progress', {
    method: 'POST',
    body: { media_id: mediaId, position: Math.floor(position), duration: Math.floor(duration) },
    withUser: true,
    retries: 0,
    timeoutMs: 8000,
  });
  return res.ok;
}

export async function loadProgress(mediaId: string): Promise<number> {
  if (!mediaId) return 0;
  const res = await json<{ position?: number }>(`/api/progress/${encodeURIComponent(mediaId)}`, {
    withUser: true, retries: 1, timeoutMs: 8000,
  });
  return typeof res.data?.position === 'number' ? res.data.position : 0;
}

export async function saveHistory(mediaId: string, title: string, thumbnailUrl: string): Promise<boolean> {
  if (!mediaId || !getSettings().syncHistory) return false;
  const res = await json('/api/history', {
    method: 'POST',
    body: { media_id: mediaId, title, thumbnail_url: thumbnailUrl || '' },
    withUser: true, retries: 0, timeoutMs: 8000,
  });
  return res.ok;
}

export async function fetchHistory(): Promise<HistoryEntry[]> {
  const res = await json<HistoryEntry[]>('/api/history', { withUser: true, retries: 1, timeoutMs: 12000 });
  return Array.isArray(res.data) ? res.data : [];
}

// ── Favourites (server-side, keyed by x-user-id) ────────────────────────────

export async function fetchFavorites(): Promise<FavoriteEntry[]> {
  const res = await json<FavoriteEntry[]>('/api/favorites', { withUser: true, retries: 1, timeoutMs: 12000 });
  return Array.isArray(res.data) ? res.data : [];
}

export async function addFavorite(entry: FavoriteEntry): Promise<boolean> {
  const res = await json('/api/favorites', {
    method: 'POST',
    body: { media_id: entry.media_id, title: entry.title ?? '', thumbnail_url: entry.thumbnail_url ?? '' },
    withUser: true, retries: 1, timeoutMs: 10000,
  });
  return res.ok;
}

export async function removeFavorite(mediaId: string): Promise<boolean> {
  const res = await json(`/api/favorites/${encodeURIComponent(mediaId)}`, {
    method: 'DELETE', withUser: true, retries: 1, timeoutMs: 10000,
  });
  return res.ok;
}

export { authStatus } from './zvauth';

/**
 * Moves favourites, history and watch positions from a pre-migration
 * "g_<sub>" identity onto the bare Google sub the website uses. Runs once:
 * the legacy id is cleared whether or not anything was found, so a user with
 * nothing to move is not re-checked on every launch.
 */
export async function migrateLegacyAccount(): Promise<{ favorites: number; history: number }> {
  const legacy = getSettings().legacyAccountId;
  const current = getSettings().accountId;
  if (!legacy || !current || legacy === current) return { favorites: 0, history: 0 };

  const asLegacy = { headers: { 'x-user-id': legacy }, retries: 1, timeoutMs: 15000 };
  let favorites = 0;
  let history = 0;

  try {
    const oldFavorites = await json<FavoriteEntry[]>('/api/favorites', asLegacy);
    for (const fav of oldFavorites.data ?? []) {
      if (!fav?.media_id) continue;
      if (await addFavorite(fav)) favorites += 1;
    }

    const oldHistory = await json<HistoryEntry[]>('/api/history', asLegacy);
    for (const row of oldHistory.data ?? []) {
      if (!row?.media_id) continue;
      const saved = await saveHistory(row.media_id, row.title ?? '', row.thumbnail_url ?? '');
      if (saved) history += 1;
      if (typeof row.position === 'number' && typeof row.duration === 'number' && row.duration > 0) {
        await saveProgress(row.media_id, row.position, row.duration);
      }
    }
  } catch { /* a failed migration must not block sign-in */ }

  patchSettings({ legacyAccountId: null });
  return { favorites, history };
}

/** Forces a fresh handshake; used by the diagnostics in Settings. */
export async function reauthenticate(): Promise<boolean> {
  clearSession();
  setBlocked(null);
  return Boolean(await ensureSession(base(), true));
}

// ── Misc ────────────────────────────────────────────────────────────────────

export async function fetchAppVersion(): Promise<AppVersionInfo | null> {
  const res = await json<AppVersionInfo>('/app/version', { timeoutMs: 8000, retries: 1 });
  return res.data;
}

export async function sendFeedback(payload: { name: string; email: string; text: string; kind: string }): Promise<boolean> {
  const res = await json('/feedback/send', {
    method: 'POST',
    body: { user_id: currentUserId(), ...payload },
    retries: 0,
    timeoutMs: 15000,
  });
  return res.ok;
}

export async function fetchMyFeedback(): Promise<{ messages: unknown[] }> {
  const res = await json<{ messages?: unknown[] }>(`/feedback/mine?user_id=${encodeURIComponent(currentUserId())}`, {
    retries: 1, timeoutMs: 12000,
  });
  return { messages: res.data?.messages ?? [] };
}

/** Signed stream URLs expire; the server hands back a fresh one. */
export async function refreshStream(currentSrc: string): Promise<string | null> {
  const res = await json<{ hls_url?: string; url?: string }>('/api/refresh-stream', {
    method: 'POST', body: { current_src: currentSrc }, retries: 1, timeoutMs: 15000,
  });
  return res.data?.hls_url ?? res.data?.url ?? null;
}

/** Lightweight connectivity probe used by the error screen's retry button. */
export async function ping(): Promise<{ ok: boolean; ms: number; status: number }> {
  const started = Date.now();
  try {
    const res = await request('/app/version', { timeoutMs: 8000, retries: 0 });
    return { ok: res.ok, ms: Date.now() - started, status: res.status };
  } catch {
    return { ok: false, ms: Date.now() - started, status: 0 };
  }
}
