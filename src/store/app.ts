/** Global app state: settings, identity, window chrome, toasts. */
import { create } from 'zustand';
import type { AuthState, Settings, WindowState } from '@shared/types';

export interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: 'default' | 'success' | 'warning' | 'danger';
  duration: number;
  action?: { label: string; run: () => void };
}

interface AppState {
  settings: Settings | null;
  auth: AuthState;
  userId: string;
  windowState: WindowState;
  online: boolean;
  toasts: Toast[];
  commandOpen: boolean;

  init: () => Promise<void>;
  setSettings: (patch: Partial<Settings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  refreshIdentity: () => Promise<void>;
  setWindowState: (s: WindowState) => void;
  setOnline: (online: boolean) => void;
  toast: (t: Omit<Toast, 'id' | 'duration' | 'tone'> & { tone?: Toast['tone']; duration?: number }) => number;
  dismissToast: (id: number) => void;
  setCommandOpen: (open: boolean) => void;
}

let toastSeq = 0;

export const useApp = create<AppState>((set, get) => ({
  settings: null,
  auth: { profile: null, signedInAt: null },
  userId: '',
  windowState: { maximized: false, fullScreen: false, focused: true },
  online: navigator.onLine,
  toasts: [],
  commandOpen: false,

  async init() {
    const [settings, identity, windowState] = await Promise.all([
      window.zovex.settings.get(),
      window.zovex.identity.get(),
      window.zovex.window.state(),
    ]);
    set({ settings, auth: identity.auth, userId: identity.userId, windowState });
    applyTheme(settings);
  },

  async setSettings(patch) {
    const next = await window.zovex.settings.patch(patch);
    set({ settings: next });
    applyTheme(next);
    if (patch.accountId !== undefined || patch.deviceId !== undefined) await get().refreshIdentity();
  },

  async resetSettings() {
    const next = await window.zovex.settings.reset();
    set({ settings: next });
    applyTheme(next);
  },

  async refreshIdentity() {
    const identity = await window.zovex.identity.get();
    set({ auth: identity.auth, userId: identity.userId });
  },

  setWindowState(windowState) { set({ windowState }); },
  setOnline(online) { set({ online }); },

  toast(t) {
    const id = ++toastSeq;
    const toast: Toast = { id, tone: 'default', duration: 4200, ...t };
    set((s) => ({ toasts: [...s.toasts.slice(-3), toast] }));
    if (toast.duration > 0) {
      setTimeout(() => get().dismissToast(id), toast.duration);
    }
    return id;
  },

  dismissToast(id) { set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })); },
  setCommandOpen(commandOpen) { set({ commandOpen }); },
}));

/** Applies theme + accent to the document root. */
export function applyTheme(settings: Settings): void {
  const root = document.documentElement;
  const mode = settings.theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : settings.theme;
  root.dataset.theme = mode;
  root.dataset.reduceMotion = String(settings.reduceMotion);
  root.style.setProperty('--accent-h', String(settings.accentHue));
}

export const serverOrigin = (): string =>
  (useApp.getState().settings?.serverUrl ?? 'https://zovex.duckdns.org').replace(/\/+$/, '');
