/**
 * ZOVEX Desktop — main process.
 *
 * Security posture: the renderer runs with context isolation on, node
 * integration off and sandboxing on. It never touches the network or the disk
 * directly; everything goes through the narrow, typed IPC surface in preload.
 */
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, powerSaveBlocker, screen, shell, Tray } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import * as api from './api';
import * as auth from './auth';
import {
  cacheSizeBytes, clearCatalogCache, currentUserId, DEFAULT_SETTINGS, getAuth, getSettings,
  kvGet, kvSet, loadStore, patchSettings, resetSettings,
} from './store';
import type { Settings } from '../shared/types';

// Dev mode is opt-in (npm run dev); otherwise the built renderer is loaded,
// so running `electron .` on a build behaves exactly like the installed app.
const DEV = !app.isPackaged && process.env.ZOVEX_DEV === '1';
const DEV_URL = 'http://localhost:5290';
const ROOT = path.join(__dirname, '..');

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let powerBlockerId: number | null = null;
let quitting = false;

// A second launch should raise the window that is already open, not start a
// second copy fighting over the same settings file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });
}

loadStore();
if (!getSettings().hardwareAcceleration) app.disableHardwareAcceleration();
app.setAppUserModelId('com.zovex.desktop');

// ── Window bounds memory ────────────────────────────────────────────────────

interface Bounds { x?: number; y?: number; width: number; height: number; maximized: boolean }

function savedBounds(): Bounds {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const fallback: Bounds = {
    width: Math.min(1480, Math.round(workAreaSize.width * 0.88)),
    height: Math.min(940, Math.round(workAreaSize.height * 0.88)),
    maximized: false,
  };
  const saved = kvGet<Bounds | null>('windowBounds', null);
  if (!saved || typeof saved.width !== 'number') return fallback;
  // A monitor that is no longer attached would put the window off-screen.
  const visible = screen.getAllDisplays().some((d) => {
    const b = d.workArea;
    return saved.x !== undefined && saved.y !== undefined
      && saved.x < b.x + b.width && saved.x + saved.width > b.x
      && saved.y < b.y + b.height && saved.y + saved.height > b.y;
  });
  return visible ? saved : { ...fallback, maximized: saved.maximized };
}

function rememberBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFullScreen()) return;
  const maximized = mainWindow.isMaximized();
  const b = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
  kvSet('windowBounds', { x: b.x, y: b.y, width: b.width, height: b.height, maximized });
}

// ── Windows ─────────────────────────────────────────────────────────────────

function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 460, height: 300, frame: false, resizable: false, movable: false,
    center: true, show: false, transparent: true, backgroundColor: '#00000000',
    skipTaskbar: true, alwaysOnTop: true, hasShadow: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  void splashWindow.loadFile(path.join(ROOT, 'dist-electron/splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow?.show());
}

function closeSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
}

function createWindow(): void {
  const b = savedBounds();
  mainWindow = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    minWidth: 1024, minHeight: 640,
    show: false,
    frame: false,                    // custom title bar, drawn by the renderer
    backgroundColor: '#0B0D12',
    title: 'ZOVEX',
    icon: nativeImage.createFromPath(path.join(ROOT, 'build/icon.png')),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  if (b.maximized) mainWindow.maximize();

  if (DEV) void mainWindow.loadURL(DEV_URL);
  else void mainWindow.loadFile(path.join(ROOT, 'dist/index.html'));

  // The renderer asks to be shown once its first screen is painted, so the
  // user never sees an empty frame. This is the safety net if that never comes.
  const failsafe = setTimeout(() => revealWindow(), 12000);
  mainWindow.once('ready-to-show', () => {
    if (!getSettings().showSplash) revealWindow();
  });
  mainWindow.on('closed', () => { clearTimeout(failsafe); mainWindow = null; });

  mainWindow.on('resize', rememberBounds);
  mainWindow.on('move', rememberBounds);
  mainWindow.on('maximize', rememberBounds);
  mainWindow.on('unmaximize', rememberBounds);
  const notify = () => sendWindowState();
  mainWindow.on('maximize', notify);
  mainWindow.on('unmaximize', notify);
  mainWindow.on('enter-full-screen', notify);
  mainWindow.on('leave-full-screen', notify);
  mainWindow.on('focus', notify);
  mainWindow.on('blur', notify);

  mainWindow.on('close', (e) => {
    if (quitting) return;
    if (getSettings().minimizeToTray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  // Anything that wants its own window opens in the real browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const dev = DEV && url.startsWith(DEV_URL);
    if (!dev && !url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    dialog.showErrorBox('ZOVEX', `תהליך התצוגה נסגר (${details.reason}). האפליקציה תיטען מחדש.`);
    mainWindow?.reload();
  });
}

/**
 * Headless smoke check used by CI and local verification:
 * ZOVEX_SMOKE=<png path> boots the app, waits for the first screen, writes a
 * screenshot and exits non-zero if the renderer reported errors.
 */
function runSmokeTest(target: string): void {
  const win = mainWindow;
  if (!win) { app.exit(1); return; }
  const problems: string[] = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) problems.push(message);
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => problems.push(`load failed ${code}: ${desc}`));

  const wait = Number(process.env.ZOVEX_SMOKE_WAIT ?? 25000);
  setTimeout(() => {
    void (async () => {
      try {
        const title = await win.webContents.executeJavaScript(
          `document.querySelector('.hero__title, .state__title, .page__title')?.textContent ?? '(none)'`,
        );
        const cards = await win.webContents.executeJavaScript(`document.querySelectorAll('.card').length`);
        const rows = await win.webContents.executeJavaScript(`document.querySelectorAll('.row').length`);
        const image = await win.webContents.capturePage();
        fs.writeFileSync(target, image.toPNG());
        console.log(`[smoke] heading=${String(title).trim().slice(0, 60)} cards=${cards} rows=${rows}`);
        if (problems.length) console.log(`[smoke] console problems:\n- ${problems.slice(0, 10).join('\n- ')}`);
        console.log(`[smoke] screenshot: ${target}`);
        quitting = true;
        app.exit(Number(cards) > 0 ? 0 : 2);
      } catch (err) {
        console.error('[smoke] failed:', err);
        quitting = true;
        app.exit(3);
      }
    })();
  }, wait);
}

function revealWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isVisible()) return;
  closeSplash();
  mainWindow.show();
  mainWindow.focus();
}

function sendWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('window:state', {
    maximized: mainWindow.isMaximized(),
    fullScreen: mainWindow.isFullScreen(),
    focused: mainWindow.isFocused(),
  });
}

function buildTray(): void {
  if (tray) return;
  try {
    const img = nativeImage.createFromPath(path.join(ROOT, 'build/icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.setToolTip('ZOVEX');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'פתח את ZOVEX', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { type: 'separator' },
      { label: 'יציאה', click: () => { quitting = true; app.quit(); } },
    ]));
    tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
  } catch { /* tray is a nicety, never fatal */ }
}

/** Standard edit shortcuts still need a menu to exist on Windows. */
function installMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'קובץ',
      submenu: [
        { role: 'reload', label: 'רענן' },
        { type: 'separator' },
        { label: 'יציאה', accelerator: 'Alt+F4', click: () => { quitting = true; app.quit(); } },
      ],
    },
    {
      label: 'עריכה',
      submenu: [
        { role: 'undo', label: 'בטל' }, { role: 'redo', label: 'בצע שוב' }, { type: 'separator' },
        { role: 'cut', label: 'גזור' }, { role: 'copy', label: 'העתק' }, { role: 'paste', label: 'הדבק' },
        { role: 'selectAll', label: 'בחר הכל' },
      ],
    },
    {
      label: 'תצוגה',
      submenu: [
        { role: 'togglefullscreen', label: 'מסך מלא' },
        { role: 'zoomIn', label: 'הגדל' }, { role: 'zoomOut', label: 'הקטן' }, { role: 'resetZoom', label: 'איפוס תצוגה' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'כלי פיתוח' },
      ],
    },
  ]));
}

// ── IPC ─────────────────────────────────────────────────────────────────────

function registerIpc(): void {
  // Settings & identity
  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:patch', (_e, patch: Partial<Settings>) => {
    const before = getSettings();
    const next = patchSettings(patch ?? {});
    if (patch?.launchOnStartup !== undefined && patch.launchOnStartup !== before.launchOnStartup) {
      try { app.setLoginItemSettings({ openAtLogin: next.launchOnStartup, args: ['--hidden'] }); } catch { /* ignore */ }
    }
    if (patch?.minimizeToTray) buildTray();
    return next;
  });
  ipcMain.handle('settings:reset', () => resetSettings());
  ipcMain.handle('settings:defaults', () => DEFAULT_SETTINGS);
  ipcMain.handle('identity:get', () => ({ userId: currentUserId(), auth: getAuth() }));

  // Auth
  ipcMain.handle('auth:signIn', () => auth.signInWithGoogle(mainWindow));
  ipcMain.handle('auth:signOut', () => { auth.signOut(); return true; });
  ipcMain.handle('auth:cancel', () => { auth.cancelSignIn(); return true; });

  // Content
  ipcMain.handle('catalog:cached', () => api.cachedCatalog());
  ipcMain.handle('catalog:fetch', (_e, force?: boolean) => api.fetchCatalog(Boolean(force)));
  ipcMain.handle('catalog:clearCache', () => { clearCatalogCache(); return true; });
  ipcMain.handle('catalog:cacheSize', () => cacheSizeBytes());
  ipcMain.handle('content:item', (_e, id: string) => api.fetchItem(String(id)));
  ipcMain.handle('epg:channel', (_e, slug: string) => api.fetchEpg(String(slug)));

  // Playback state
  ipcMain.handle('progress:save', (_e, p: { id: string; position: number; duration: number }) =>
    api.saveProgress(p.id, p.position, p.duration));
  ipcMain.handle('progress:load', (_e, id: string) => api.loadProgress(String(id)));
  ipcMain.handle('history:save', (_e, p: { id: string; title: string; thumb: string }) =>
    api.saveHistory(p.id, p.title, p.thumb));
  ipcMain.handle('history:list', () => api.fetchHistory());
  ipcMain.handle('stream:refresh', (_e, src: string) => api.refreshStream(String(src)));

  // Misc server
  ipcMain.handle('app:serverVersion', () => api.fetchAppVersion());
  ipcMain.handle('app:ping', () => api.ping());
  ipcMain.handle('feedback:send', (_e, p: { name: string; email: string; text: string; kind: string }) => api.sendFeedback(p));
  ipcMain.handle('feedback:mine', () => api.fetchMyFeedback());

  // Local key/value (favourites, local history, UI memory)
  ipcMain.handle('kv:get', (_e, key: string, fallback: unknown) => kvGet(String(key), fallback));
  ipcMain.handle('kv:set', (_e, key: string, value: unknown) => { kvSet(String(key), value); return true; });

  // Window controls
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggleMaximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('window:setFullScreen', (_e, on: boolean) => { mainWindow?.setFullScreen(Boolean(on)); return Boolean(on); });
  ipcMain.handle('window:state', () => ({
    maximized: mainWindow?.isMaximized() ?? false,
    fullScreen: mainWindow?.isFullScreen() ?? false,
    focused: mainWindow?.isFocused() ?? false,
  }));
  ipcMain.handle('app:ready', () => { revealWindow(); return true; });

  // Keep the screen awake only while something is actually playing.
  ipcMain.handle('power:keepAwake', (_e, on: boolean) => {
    if (on && powerBlockerId === null) powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    if (!on && powerBlockerId !== null) { powerSaveBlocker.stop(powerBlockerId); powerBlockerId = null; }
    return Boolean(on);
  });

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return true;
  });
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    userData: app.getPath('userData'),
    packaged: app.isPackaged,
  }));
  ipcMain.handle('app:relaunch', () => { quitting = true; app.relaunch(); app.exit(0); });
  ipcMain.handle('app:openUserData', () => { void shell.openPath(app.getPath('userData')); return true; });
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

void app.whenReady().then(() => {
  installMenu();
  registerIpc();
  if (getSettings().showSplash) createSplash();
  createWindow();
  if (getSettings().minimizeToTray) buildTray();
  if (process.env.ZOVEX_SMOKE) runSmokeTest(process.env.ZOVEX_SMOKE);

  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (DEV) mainWindow?.webContents.toggleDevTools();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => { quitting = true; rememberBounds(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// Never let a background rejection take the window down silently.
process.on('unhandledRejection', (reason) => {
  if (DEV) console.error('[main] unhandled rejection:', reason);
});

// Make sure the splash file is present in packaged builds even if the copy step
// was skipped during development.
if (!fs.existsSync(path.join(ROOT, 'dist-electron/splash.html'))) {
  try { fs.mkdirSync(path.join(ROOT, 'dist-electron'), { recursive: true }); } catch { /* ignore */ }
}
