/**
 * The only bridge between the renderer and the OS.
 *
 * Every function here is an explicit, named capability. The renderer gets no
 * generic "invoke whatever you like" escape hatch and no Node globals.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppVersionInfo, AuthState, CatalogPayload, EpgProgram, GoogleProfile,
  HistoryEntry, MediaItem, Settings, WindowState,
} from '../shared/types';

const api = {
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    patch: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:patch', patch),
    reset: (): Promise<Settings> => ipcRenderer.invoke('settings:reset'),
    defaults: (): Promise<Settings> => ipcRenderer.invoke('settings:defaults'),
  },
  identity: {
    get: (): Promise<{ userId: string; auth: AuthState }> => ipcRenderer.invoke('identity:get'),
  },
  auth: {
    signIn: (): Promise<{ ok: boolean; profile?: GoogleProfile; error?: string }> => ipcRenderer.invoke('auth:signIn'),
    signOut: (): Promise<boolean> => ipcRenderer.invoke('auth:signOut'),
    cancel: (): Promise<boolean> => ipcRenderer.invoke('auth:cancel'),
  },
  catalog: {
    cached: (): Promise<CatalogPayload | null> => ipcRenderer.invoke('catalog:cached'),
    fetch: (force?: boolean): Promise<CatalogPayload> => ipcRenderer.invoke('catalog:fetch', force),
    clearCache: (): Promise<boolean> => ipcRenderer.invoke('catalog:clearCache'),
    cacheSize: (): Promise<number> => ipcRenderer.invoke('catalog:cacheSize'),
  },
  content: {
    item: (id: string): Promise<MediaItem | null> => ipcRenderer.invoke('content:item', id),
    epg: (slug: string): Promise<EpgProgram[]> => ipcRenderer.invoke('epg:channel', slug),
  },
  playback: {
    saveProgress: (id: string, position: number, duration: number): Promise<boolean> =>
      ipcRenderer.invoke('progress:save', { id, position, duration }),
    loadProgress: (id: string): Promise<number> => ipcRenderer.invoke('progress:load', id),
    saveHistory: (id: string, title: string, thumb: string): Promise<boolean> =>
      ipcRenderer.invoke('history:save', { id, title, thumb }),
    history: (): Promise<HistoryEntry[]> => ipcRenderer.invoke('history:list'),
    refreshStream: (src: string): Promise<string | null> => ipcRenderer.invoke('stream:refresh', src),
    keepAwake: (on: boolean): Promise<boolean> => ipcRenderer.invoke('power:keepAwake', on),
  },
  server: {
    version: (): Promise<AppVersionInfo | null> => ipcRenderer.invoke('app:serverVersion'),
    ping: (): Promise<{ ok: boolean; ms: number; status: number }> => ipcRenderer.invoke('app:ping'),
    sendFeedback: (p: { name: string; email: string; text: string; kind: string }): Promise<boolean> =>
      ipcRenderer.invoke('feedback:send', p),
    myFeedback: (): Promise<{ messages: unknown[] }> => ipcRenderer.invoke('feedback:mine'),
  },
  store: {
    get: <T>(key: string, fallback: T): Promise<T> => ipcRenderer.invoke('kv:get', key, fallback),
    set: (key: string, value: unknown): Promise<boolean> => ipcRenderer.invoke('kv:set', key, value),
  },
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:toggleMaximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    setFullScreen: (on: boolean): Promise<boolean> => ipcRenderer.invoke('window:setFullScreen', on),
    state: (): Promise<WindowState> => ipcRenderer.invoke('window:state'),
    onState: (cb: (s: WindowState) => void): (() => void) => {
      const listener = (_e: unknown, s: WindowState) => cb(s);
      ipcRenderer.on('window:state', listener);
      return () => ipcRenderer.removeListener('window:state', listener);
    },
  },
  app: {
    ready: (): Promise<boolean> => ipcRenderer.invoke('app:ready'),
    info: (): Promise<{
      version: string; electron: string; chrome: string; node: string;
      platform: string; arch: string; userData: string; packaged: boolean;
    }> => ipcRenderer.invoke('app:info'),
    relaunch: (): Promise<void> => ipcRenderer.invoke('app:relaunch'),
    openUserData: (): Promise<boolean> => ipcRenderer.invoke('app:openUserData'),
    openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('shell:openExternal', url),
  },
};

contextBridge.exposeInMainWorld('zovex', api);

export type ZovexBridge = typeof api;
