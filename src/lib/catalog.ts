/**
 * Derives everything the UI shows from the raw catalog the server returns.
 *
 * Nothing here is hard-coded: categories, series, seasons and channels are all
 * read out of the data. If the server stops returning a category, it simply
 * stops appearing.
 */
import type { MediaItem } from '@shared/types';
import { normalize } from './format';

export interface Season {
  number: number;
  episodes: MediaItem[];
}

export interface Series {
  key: string;
  name: string;
  category: string | null;
  poster: string | null;
  seasons: Season[];
  episodeCount: number;
  seasonCount: number;
  latest: number;          // epoch ms of the newest episode
  years: [number, number] | null;
}

export interface CatalogModel {
  all: MediaItem[];
  movies: MediaItem[];
  live: MediaItem[];
  series: Series[];
  seriesByKey: Map<string, Series>;
  byId: Map<string, MediaItem>;
  bySlug: Map<string, MediaItem>;
  categories: CategoryInfo[];
  newest: MediaItem[];
  searchIndex: SearchEntry[];
}

export interface CategoryInfo {
  name: string;
  total: number;
  movies: number;
  series: number;
  live: number;
  poster: string | null;
}

export interface SearchEntry {
  id: string;
  /** 'item' for a movie/episode/channel, 'series' for a whole show. */
  kind: 'item' | 'series';
  haystack: string;
  title: string;
  item?: MediaItem;
  series?: Series;
}

const epoch = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

export function seriesKey(name: string): string {
  return normalize(name);
}

export function buildCatalog(items: MediaItem[]): CatalogModel {
  const byId = new Map<string, MediaItem>();
  const bySlug = new Map<string, MediaItem>();
  const live: MediaItem[] = [];
  const movies: MediaItem[] = [];
  const seriesMap = new Map<string, { name: string; category: string | null; eps: MediaItem[] }>();

  for (const item of items) {
    byId.set(item.id, item);
    if (item.custom_slug && !bySlug.has(item.custom_slug)) bySlug.set(item.custom_slug, item);

    if (item.is_live) {
      live.push(item);
    } else if (item.series_name) {
      const key = seriesKey(item.series_name);
      let bucket = seriesMap.get(key);
      if (!bucket) {
        bucket = { name: item.series_name, category: item.category, eps: [] };
        seriesMap.set(key, bucket);
      }
      bucket.eps.push(item);
    } else {
      movies.push(item);
    }
  }

  const series: Series[] = [];
  for (const [key, bucket] of seriesMap) {
    const bySeason = new Map<number, MediaItem[]>();
    let latest = 0;
    let minYear = Infinity;
    let maxYear = -Infinity;
    let poster: string | null = null;

    for (const ep of bucket.eps) {
      const n = ep.season_number ?? 1;
      const list = bySeason.get(n);
      if (list) list.push(ep);
      else bySeason.set(n, [ep]);
      latest = Math.max(latest, epoch(ep.created_date));
      if (ep.year) { minYear = Math.min(minYear, ep.year); maxYear = Math.max(maxYear, ep.year); }
      if (!poster && ep.thumbnail_url) poster = ep.thumbnail_url;
    }

    const seasons: Season[] = [...bySeason.entries()]
      .map(([number, episodes]) => ({
        number,
        episodes: episodes.sort(
          (a, b) => (a.episode_number ?? 0) - (b.episode_number ?? 0) || epoch(a.created_date) - epoch(b.created_date),
        ),
      }))
      .sort((a, b) => a.number - b.number);

    series.push({
      key,
      name: bucket.name,
      category: bucket.category,
      poster,
      seasons,
      episodeCount: bucket.eps.length,
      seasonCount: seasons.length,
      latest,
      years: Number.isFinite(minYear) ? [minYear, maxYear] : null,
    });
  }

  series.sort((a, b) => b.latest - a.latest);
  const seriesByKey = new Map(series.map((s) => [s.key, s]));

  movies.sort((a, b) => epoch(b.created_date) - epoch(a.created_date));
  live.sort((a, b) => a.title.localeCompare(b.title, 'he'));

  // Categories, counted from the data itself.
  const catMap = new Map<string, CategoryInfo>();
  const bump = (name: string | null, field: 'movies' | 'series' | 'live', poster: string | null) => {
    // Items the server sends without a category are simply not counted into
    // one — inventing a bucket for them would put a category in the menu that
    // does not exist in the data.
    if (!name) return;
    const key = name;
    let info = catMap.get(key);
    if (!info) {
      info = { name: key, total: 0, movies: 0, series: 0, live: 0, poster: null };
      catMap.set(key, info);
    }
    info.total += 1;
    info[field] += 1;
    if (!info.poster && poster) info.poster = poster;
  };
  for (const m of movies) bump(m.category, 'movies', m.thumbnail_url);
  for (const s of series) bump(s.category, 'series', s.poster);
  for (const c of live) bump(c.category, 'live', c.thumbnail_url);
  const categories = [...catMap.values()].sort((a, b) => b.total - a.total);

  // "New" mixes films and whole shows, newest first, one row per show.
  const newest: MediaItem[] = [...movies].slice(0, 60);

  // Search index: one entry per film, per show and per channel — not per
  // episode, or a show with 400 episodes would bury everything else.
  const searchIndex: SearchEntry[] = [];
  for (const m of movies) {
    searchIndex.push({
      id: m.id, kind: 'item', item: m, title: m.title,
      haystack: normalize([m.title, m.category, m.year, m.custom_slug].filter(Boolean).join(' ')),
    });
  }
  for (const s of series) {
    searchIndex.push({
      id: `series:${s.key}`, kind: 'series', series: s, title: s.name,
      haystack: normalize([s.name, s.category, s.years?.join(' ')].filter(Boolean).join(' ')),
    });
  }
  for (const c of live) {
    searchIndex.push({
      id: c.id, kind: 'item', item: c, title: c.title,
      haystack: normalize([c.title, c.category, c.custom_slug, 'שידור חי live'].filter(Boolean).join(' ')),
    });
  }

  return { all: items, movies, live, series, seriesByKey, byId, bySlug, categories, newest, searchIndex };
}

export interface SearchHit extends SearchEntry {
  score: number;
}

/** Ranked substring search. Prefix and word-start matches win over mid-word. */
export function searchCatalog(model: CatalogModel, rawQuery: string, limit = 60): SearchHit[] {
  const q = normalize(rawQuery);
  if (q.length < 2) return [];
  const terms = q.split(' ').filter(Boolean);
  const hits: SearchHit[] = [];

  for (const entry of model.searchIndex) {
    let score = 0;
    let ok = true;
    for (const term of terms) {
      const at = entry.haystack.indexOf(term);
      if (at === -1) { ok = false; break; }
      if (at === 0) score += 60;
      else if (entry.haystack[at - 1] === ' ') score += 35;
      else score += 12;
      score += Math.max(0, 14 - at / 6);
    }
    if (!ok) continue;
    const title = normalize(entry.title);
    if (title === q) score += 180;
    else if (title.startsWith(q)) score += 90;
    if (entry.kind === 'series') score += 18; // a show outranks one of its films
    hits.push({ ...entry, score });
  }

  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'he'));
  return hits.slice(0, limit);
}

export type SortKey = 'newest' | 'oldest' | 'title' | 'year';

export function sortItems<T extends MediaItem>(items: T[], key: SortKey): T[] {
  const copy = [...items];
  switch (key) {
    case 'oldest': return copy.sort((a, b) => epoch(a.created_date) - epoch(b.created_date));
    case 'title': return copy.sort((a, b) => a.title.localeCompare(b.title, 'he'));
    case 'year': return copy.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    default: return copy.sort((a, b) => epoch(b.created_date) - epoch(a.created_date));
  }
}

export function sortSeries(list: Series[], key: SortKey): Series[] {
  const copy = [...list];
  switch (key) {
    case 'oldest': return copy.sort((a, b) => a.latest - b.latest);
    case 'title': return copy.sort((a, b) => a.name.localeCompare(b.name, 'he'));
    case 'year': return copy.sort((a, b) => (b.years?.[1] ?? 0) - (a.years?.[1] ?? 0));
    default: return copy.sort((a, b) => b.latest - a.latest);
  }
}

/** Episode label: "ע׳1 פ׳12" plus the episode title when it has one. */
export function episodeLabel(ep: MediaItem): string {
  const parts: string[] = [];
  if (ep.season_number != null) parts.push(`עונה ${ep.season_number}`);
  if (ep.episode_number != null) {
    parts.push(ep.episode_number_end && ep.episode_number_end !== ep.episode_number
      ? `פרקים ${ep.episode_number}-${ep.episode_number_end}`
      : `פרק ${ep.episode_number}`);
  }
  return parts.join(' · ');
}

export function findNextEpisode(series: Series, current: MediaItem): MediaItem | null {
  const season = series.seasons.find((s) => s.number === (current.season_number ?? 1));
  if (!season) return null;
  const idx = season.episodes.findIndex((e) => e.id === current.id);
  if (idx >= 0 && idx + 1 < season.episodes.length) return season.episodes[idx + 1];
  const si = series.seasons.findIndex((s) => s.number === season.number);
  const next = series.seasons[si + 1];
  return next?.episodes[0] ?? null;
}
