/**
 * Favourites, history and watch positions.
 *
 * The server is the source of truth: everything here is pulled from it on
 * start-up and after a sign-in change. The local copy exists so the UI paints
 * immediately and keeps working without a connection, and writes are
 * optimistic — the screen updates first and rolls back if the server refuses.
 */
import { create } from 'zustand';
import type { FavoriteEntry, HistoryEntry } from '@shared/types';

export interface ProgressRecord {
  position: number;
  duration: number;
  updatedAt: number;
  title: string;
  thumb: string | null;
}

interface LibraryState {
  favorites: string[];
  favoriteDetails: Record<string, FavoriteEntry>;
  progress: Record<string, ProgressRecord>;
  history: HistoryEntry[];
  loaded: boolean;
  syncing: boolean;
  lastError: string | null;

  load: () => Promise<void>;
  syncFromServer: () => Promise<void>;
  toggleFavorite: (id: string, meta?: { title?: string; thumb?: string | null }) => Promise<boolean>;
  isFavorite: (id: string) => boolean;
  recordProgress: (id: string, rec: ProgressRecord) => Promise<void>;
  clearProgress: (id: string) => Promise<void>;
  clearAllProgress: () => Promise<void>;
  clearFavorites: () => Promise<void>;
}

const FAV_KEY = 'favorites';
const FAV_META_KEY = 'favoriteDetails';
const PROGRESS_KEY = 'progress';
/** Keep the local file small: positions older than six months are not useful. */
const MAX_AGE = 1000 * 60 * 60 * 24 * 180;

function prune(progress: Record<string, ProgressRecord>): Record<string, ProgressRecord> {
  const cutoff = Date.now() - MAX_AGE;
  const entries = Object.entries(progress)
    .filter(([, r]) => r && r.updatedAt > cutoff)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, 400);
  return Object.fromEntries(entries);
}

function progressFromHistory(rows: HistoryEntry[]): Record<string, ProgressRecord> {
  const out: Record<string, ProgressRecord> = {};
  for (const row of rows) {
    if (!row?.media_id) continue;
    const when = row.watched_at ?? row.updated_at;
    out[row.media_id] = {
      position: typeof row.position === 'number' ? row.position : 0,
      duration: typeof row.duration === 'number' ? row.duration : 0,
      updatedAt: when ? Date.parse(when) || Date.now() : Date.now(),
      title: row.title ?? '',
      thumb: row.thumbnail_url ?? null,
    };
  }
  return out;
}

export const useLibrary = create<LibraryState>((set, get) => ({
  favorites: [],
  favoriteDetails: {},
  progress: {},
  history: [],
  loaded: false,
  syncing: false,
  lastError: null,

  /** Paints from the local cache, then reconciles with the server. */
  async load() {
    const [favorites, favoriteDetails, progress] = await Promise.all([
      window.zovex.store.get<string[]>(FAV_KEY, []),
      window.zovex.store.get<Record<string, FavoriteEntry>>(FAV_META_KEY, {}),
      window.zovex.store.get<Record<string, ProgressRecord>>(PROGRESS_KEY, {}),
    ]);
    set({
      favorites: Array.isArray(favorites) ? favorites : [],
      favoriteDetails: favoriteDetails ?? {},
      progress: prune(progress ?? {}),
      loaded: true,
    });
    await get().syncFromServer();
  },

  async syncFromServer() {
    set({ syncing: true, lastError: null });
    try {
      const [serverFavorites, serverHistory] = await Promise.all([
        window.zovex.playback.favorites(),
        window.zovex.playback.history(),
      ]);

      // One-time merge: anything favourited on this machine while the server
      // did not know about it is pushed up rather than silently dropped.
      const serverIds = new Set(serverFavorites.map((f) => f.media_id));
      const localOnly = get().favorites.filter((id) => !serverIds.has(id));
      const details = get().favoriteDetails;
      for (const id of localOnly) {
        const meta = details[id];
        const ok = await window.zovex.playback.addFavorite(id, meta?.title ?? '', meta?.thumbnail_url ?? '');
        if (ok) serverFavorites.push({ media_id: id, title: meta?.title, thumbnail_url: meta?.thumbnail_url });
      }

      const mergedDetails: Record<string, FavoriteEntry> = {};
      for (const fav of serverFavorites) mergedDetails[fav.media_id] = fav;
      const ids = serverFavorites.map((f) => f.media_id);

      // Server history wins for positions; a local-only entry stays until the
      // server has heard about it.
      const merged = prune({ ...get().progress, ...progressFromHistory(serverHistory) });

      set({ favorites: ids, favoriteDetails: mergedDetails, history: serverHistory, progress: merged });
      await Promise.all([
        window.zovex.store.set(FAV_KEY, ids),
        window.zovex.store.set(FAV_META_KEY, mergedDetails),
        window.zovex.store.set(PROGRESS_KEY, merged),
      ]);
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : 'סנכרון נכשל' });
    } finally {
      set({ syncing: false });
    }
  },

  async toggleFavorite(id, meta) {
    const before = get().favorites;
    const beforeDetails = get().favoriteDetails;
    const adding = !before.includes(id);

    // Optimistic: the heart responds at once.
    const next = adding ? [id, ...before] : before.filter((x) => x !== id);
    const nextDetails = { ...beforeDetails };
    if (adding) nextDetails[id] = { media_id: id, title: meta?.title, thumbnail_url: meta?.thumb ?? undefined };
    else delete nextDetails[id];
    set({ favorites: next, favoriteDetails: nextDetails });

    const ok = adding
      ? await window.zovex.playback.addFavorite(id, meta?.title ?? '', meta?.thumb ?? '')
      : await window.zovex.playback.removeFavorite(id);

    if (!ok) {
      set({ favorites: before, favoriteDetails: beforeDetails, lastError: 'השרת לא קיבל את השינוי' });
      return before.includes(id);
    }

    await Promise.all([
      window.zovex.store.set(FAV_KEY, next),
      window.zovex.store.set(FAV_META_KEY, nextDetails),
    ]);
    return adding;
  },

  isFavorite(id) { return get().favorites.includes(id); },

  async recordProgress(id, rec) {
    const next = prune({ ...get().progress, [id]: rec });
    set({ progress: next });
    await window.zovex.store.set(PROGRESS_KEY, next);
  },

  async clearProgress(id) {
    const next = { ...get().progress };
    delete next[id];
    set({ progress: next });
    await window.zovex.store.set(PROGRESS_KEY, next);
  },

  async clearAllProgress() {
    set({ progress: {}, history: [] });
    await window.zovex.store.set(PROGRESS_KEY, {});
  },

  async clearFavorites() {
    const before = get().favorites;
    set({ favorites: [], favoriteDetails: {} });
    await Promise.all([
      window.zovex.store.set(FAV_KEY, []),
      window.zovex.store.set(FAV_META_KEY, {}),
    ]);
    // Remove them on the server too, or the next sync brings them all back.
    for (const id of before) await window.zovex.playback.removeFavorite(id);
  },
}));

/** A title counts as "finished" past 94% so it leaves Continue Watching. */
export function isFinished(rec: ProgressRecord): boolean {
  return rec.duration > 0 && rec.position / rec.duration > 0.94;
}

export function progressPercent(rec: ProgressRecord): number {
  if (!rec.duration) return 0;
  return Math.min(100, Math.max(0, (rec.position / rec.duration) * 100));
}
