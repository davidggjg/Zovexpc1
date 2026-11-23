/** Types shared between the Electron main process and the renderer. */

export interface MediaItem {
  id: string;
  title: string;
  year: number | null;
  category: string | null;
  type: string | null;
  video_url: string | null;
  video_id?: string | null;
  thumbnail_url: string | null;
  trailer_url: string | null;
  custom_slug: string | null;
  series_name: string | null;
  season_number: number | null;
  episode_number: number | null;
  episode_number_end: number | null;
  episode_title: string | null;
  tmdb_id?: number | string | null;
  is_live?: boolean;
  created_date: string;
  description?: string | null;
}

export interface CatalogPayload {
  items: MediaItem[];
  fetchedAt: number;
  /** true when the items came from the on-disk cache rather than the network. */
  stale: boolean;
}

export interface EpgProgram {
  start: number;
  end: number;
  title?: string;
  desc?: string;
}

export interface HistoryEntry {
  media_id: string;
  title?: string;
  thumbnail_url?: string;
  position?: number;
  duration?: number;
  watched_at?: string;
  updated_at?: string;
}

export interface FavoriteEntry {
  media_id: string;
  title?: string;
  thumbnail_url?: string;
  added_at?: string;
}

export interface AuthStatus {
  /** The app secret is compiled in and a handshake is possible. */
  configured: boolean;
  active: boolean;
  expiresAt: number | null;
  /** Set when the server refused this client outright. */
  blocked: string | null;
  /** Why the last handshake failed, verbatim from the server where possible. */
  lastError: string | null;
  lastErrorStatus: number | null;
  /** How far the machine's clock is from the server's, in milliseconds. */
  clockOffsetMs: number;
}

export interface AppVersionInfo {
  latest?: string;
  min?: string;
  url?: string;
  notes?: string;
  source_url?: string;
}

export type ThemeMode = 'dark' | 'light' | 'system';

export interface Settings {
  serverUrl: string;
  googleClientId: string;
  /**
   * Google rejects the token exchange for an installed-app client without
   * this, PKCE notwithstanding. It is stored only in the user's local
   * settings file on their own machine — never in the repository, the
   * renderer bundle or the installer.
   */
  googleClientSecret: string;
  theme: ThemeMode;
  accentHue: number;
  reduceMotion: boolean;
  posterSize: 'compact' | 'comfortable' | 'large';
  autoplayNext: boolean;
  resumePlayback: boolean;
  defaultVolume: number;
  seekStep: number;
  hardwareAcceleration: boolean;
  minimizeToTray: boolean;
  launchOnStartup: boolean;
  confirmOnExit: boolean;
  syncHistory: boolean;
  deviceId: string;
  /**
   * When signed in this is the Google `sub`, exactly as the website sends it,
   * so both clients read the same history.
   */
  accountId: string | null;
  /** A pre-migration "g_<sub>" id whose data still needs moving across. */
  legacyAccountId: string | null;
  showSplash: boolean;
}

export interface GoogleProfile {
  sub: string;
  name: string;
  email: string;
  picture: string;
}

export interface AuthState {
  profile: GoogleProfile | null;
  signedInAt: number | null;
}

export interface WindowState {
  maximized: boolean;
  fullScreen: boolean;
  focused: boolean;
}

export interface FetchResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}
