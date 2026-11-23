/**
 * Local, per-machine library state: favourites, recently viewed and watch
 * positions. Server history is authoritative when the user is signed in; this
 * layer keeps the app instant and useful offline.
 */
import { create } from 'zustand';

export interface ProgressRecord {
  position: number;
  duration: number;
  updatedAt: number;
  title: string;
  thumb: string | null;
}

interface LibraryState {
  favorites: string[];
  progress: Record<string, ProgressRecord>;
  loaded: boolean;

  load: () => Promise<void>;
  toggleFavorite: (id: string) => Promise<boolean>;
  isFavorite: (id: string) => boolean;
  recordProgress: (id: string, rec: ProgressRecord) => Promise<void>;
  clearProgress: (id: string) => Promise<void>;
  clearAllProgress: () => Promise<void>;
  clearFavorites: () => Promise<void>;
}

const FAV_KEY = 'favorites';
const PROGRESS_KEY = 'progress';
/** Keep the file small: positions older than six months are not useful. */
const MAX_AGE = 1000 * 60 * 60 * 24 * 180;

function prune(progress: Record<string, ProgressRecord>): Record<string, ProgressRecord> {
  const cutoff = Date.now() - MAX_AGE;
  const entries = Object.entries(progress)
    .filter(([, r]) => r && r.updatedAt > cutoff)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, 400);
  return Object.fromEntries(entries);
}

export const useLibrary = create<LibraryState>((set, get) => ({
  favorites: [],
  progress: {},
  loaded: false,

  async load() {
    const [favorites, progress] = await Promise.all([
      window.zovex.store.get<string[]>(FAV_KEY, []),
      window.zovex.store.get<Record<string, ProgressRecord>>(PROGRESS_KEY, {}),
    ]);
    set({ favorites: Array.isArray(favorites) ? favorites : [], progress: prune(progress ?? {}), loaded: true });
  },

  async toggleFavorite(id) {
    const list = get().favorites;
    const next = list.includes(id) ? list.filter((x) => x !== id) : [id, ...list];
    set({ favorites: next });
    await window.zovex.store.set(FAV_KEY, next);
    return next.includes(id);
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
    set({ progress: {} });
    await window.zovex.store.set(PROGRESS_KEY, {});
  },

  async clearFavorites() {
    set({ favorites: [] });
    await window.zovex.store.set(FAV_KEY, []);
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
