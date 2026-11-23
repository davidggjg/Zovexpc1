import { Suspense, lazy, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { TitleBar } from '@/components/shell/TitleBar';
import { Sidebar } from '@/components/shell/Sidebar';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { ToastLayer } from '@/components/ui/feedback';
import { Spinner } from '@/components/ui/primitives';
import { CatalogProvider } from '@/lib/CatalogProvider';
import { useApp } from '@/store/app';
import { useLibrary } from '@/store/library';
import { useHotkeys, usePersistentState } from '@/lib/hooks';
import '@/components/shell/shell.css';

const HomeScreen = lazy(() => import('@/routes/HomeScreen'));
const MoviesScreen = lazy(() => import('@/routes/MoviesScreen'));
const SeriesScreen = lazy(() => import('@/routes/SeriesScreen'));
const LiveScreen = lazy(() => import('@/routes/LiveScreen'));
const CategoryScreen = lazy(() => import('@/routes/CategoryScreen'));
const SeriesDetailScreen = lazy(() => import('@/routes/SeriesDetailScreen'));
const TitleDetailScreen = lazy(() => import('@/routes/TitleDetailScreen'));
const ContinueScreen = lazy(() => import('@/routes/ContinueScreen'));
const FavoritesScreen = lazy(() => import('@/routes/FavoritesScreen'));
const SettingsScreen = lazy(() => import('@/routes/SettingsScreen'));
const SupportScreen = lazy(() => import('@/routes/SupportScreen'));
const WatchScreen = lazy(() => import('@/routes/WatchScreen'));

function ScreenFallback() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', gap: 14 }}>
      <Spinner size={22} />
      <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--fs-sm)' }}>טוען מסך…</span>
    </div>
  );
}

/** Each navigation starts at the top of the new screen, like a native app. */
function ScrollReset({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  useEffect(() => {
    document.querySelector('.shell__main')?.scrollTo?.({ top: 0 });
  }, [location.pathname]);
  return <>{children}</>;
}

function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const setCommandOpen = useApp((s) => s.setCommandOpen);
  const [collapsed, setCollapsed] = usePersistentState<boolean>('sidebarCollapsed', false);
  const isWatching = location.pathname.startsWith('/watch/');

  useHotkeys({
    'mod+k': (e) => { e.preventDefault(); setCommandOpen(true); },
    'mod+f': (e) => { e.preventDefault(); setCommandOpen(true); },
    '/': (e) => { e.preventDefault(); setCommandOpen(true); },
    'mod+b': (e) => { e.preventDefault(); setCollapsed(!collapsed); },
    'mod+,': (e) => { e.preventDefault(); navigate('/settings'); },
    'alt+ArrowRight': () => navigate(-1),
    'alt+ArrowLeft': () => navigate(1),
    'F5': (e) => { e.preventDefault(); window.location.reload(); },
  }, !isWatching);

  // The player takes the whole window; chrome would only get in the way.
  if (isWatching) {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <Routes>
          <Route path="/watch/:id" element={<WatchScreen />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <div className="shell">
      <TitleBar />
      <div className="shell__body" data-collapsed={collapsed}>
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <main className="shell__main">
          <div className="shell__scroll">
            <ScrollReset>
              <Suspense fallback={<ScreenFallback />}>
                <Routes>
                  <Route path="/" element={<HomeScreen />} />
                  <Route path="/movies" element={<MoviesScreen />} />
                  <Route path="/series" element={<SeriesScreen />} />
                  <Route path="/series/:key" element={<SeriesDetailScreen />} />
                  <Route path="/live" element={<LiveScreen />} />
                  <Route path="/category/:name" element={<CategoryScreen />} />
                  <Route path="/title/:id" element={<TitleDetailScreen />} />
                  <Route path="/continue" element={<ContinueScreen />} />
                  <Route path="/favorites" element={<FavoritesScreen />} />
                  <Route path="/settings" element={<SettingsScreen />} />
                  <Route path="/support" element={<SupportScreen />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </ScrollReset>
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}

export default function App() {
  const init = useApp((s) => s.init);
  const setOnline = useApp((s) => s.setOnline);
  const loadLibrary = useLibrary((s) => s.load);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    void (async () => {
      await Promise.all([init(), loadLibrary()]);
      setBooted(true);
    })();
  }, [init, loadLibrary]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [setOnline]);

  // Tell the main process to swap the splash for the real window once the
  // first screen has actually painted.
  useEffect(() => {
    if (!booted) return;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => { void window.zovex.app.ready(); });
    });
    return () => window.cancelAnimationFrame(id);
  }, [booted]);

  if (!booted) return null;

  return (
    <CatalogProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
      <ToastLayer />
    </CatalogProvider>
  );
}
