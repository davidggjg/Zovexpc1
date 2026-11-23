import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { MediaItem } from '@shared/types';
import { buildCatalog, type CatalogModel } from './catalog';
import { useApp } from '@/store/app';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface CatalogContextValue {
  model: CatalogModel;
  status: Status;
  error: string | null;
  stale: boolean;
  fetchedAt: number | null;
  refreshing: boolean;
  refresh: (force?: boolean) => Promise<void>;
}

const EMPTY: CatalogModel = buildCatalog([]);

const CatalogContext = createContext<CatalogContextValue>({
  model: EMPTY, status: 'idle', error: null, stale: false, fetchedAt: null, refreshing: false,
  refresh: async () => {},
});

export const useCatalog = (): CatalogContextValue => useContext(CatalogContext);

/**
 * Owns the catalog for the whole app.
 *
 * Boot order is deliberate: the on-disk cache paints the UI in one frame, then
 * the network copy replaces it. The server is the only source — nothing here
 * invents an item, a category or a channel.
 */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const serverUrl = useApp((s) => s.settings?.serverUrl);
  const toast = useApp((s) => s.toast);
  const booted = useRef(false);

  const refresh = useCallback(async (force = false) => {
    setRefreshing(true);
    setError(null);
    try {
      const payload = await window.zovex.catalog.fetch(force);
      setItems(payload.items);
      setFetchedAt(payload.fetchedAt);
      setStale(payload.stale);
      setStatus('ready');
      if (payload.stale) {
        toast({
          title: 'מוצגים נתונים שמורים',
          description: 'לא הצלחנו להגיע לשרת, אז מוצגת הספרייה מהפעם הקודמת.',
          tone: 'warning',
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'שגיאה לא ידועה';
      setError(message);
      setStatus((prev) => (prev === 'ready' ? 'ready' : 'error'));
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    setStatus('loading');
    void (async () => {
      const cached = await window.zovex.catalog.cached();
      if (cached?.items.length) {
        setItems(cached.items);
        setFetchedAt(cached.fetchedAt);
        setStale(true);
        setStatus('ready');
      }
      await refresh(false);
    })();
  }, [refresh]);

  // Changing the server address must re-pull everything from the new host.
  const firstServer = useRef(serverUrl);
  useEffect(() => {
    if (!serverUrl || serverUrl === firstServer.current) return;
    firstServer.current = serverUrl;
    void refresh(true);
  }, [serverUrl, refresh]);

  // Building the model over ~27k rows costs ~100ms — do it only when the rows
  // actually change, never on an unrelated re-render.
  const model = useMemo(() => (items ? buildCatalog(items) : EMPTY), [items]);

  const value = useMemo<CatalogContextValue>(
    () => ({ model, status, error, stale, fetchedAt, refreshing, refresh }),
    [model, status, error, stale, fetchedAt, refreshing, refresh],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}
