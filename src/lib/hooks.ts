import { useCallback, useEffect, useRef, useState } from 'react';

/** Debounced mirror of a fast-changing value (search boxes, sliders). */
export function useDebounced<T>(value: T, delay = 220): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Remembers a value in the main process's key/value store. */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void window.zovex.store.get<T>(key, initial).then((v) => {
      if (alive) { setValue(v); setLoaded(true); }
    });
    return () => { alive = false; };
    // `initial` is intentionally not a dependency: it is a default, not state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback((v: T) => {
    setValue(v);
    void window.zovex.store.set(key, v);
  }, [key]);

  return [value, update, loaded];
}

/** Window-level keyboard shortcuts, skipped while typing in a field. */
export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>, enabled = true): void {
  const ref = useRef(map);
  ref.current = map;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('mod');
      if (e.shiftKey) parts.push('shift');
      if (e.altKey) parts.push('alt');
      parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      const combo = parts.join('+');
      const handler = ref.current[combo];
      if (!handler) return;
      // Plain single-letter keys must not fire while the user is writing.
      if (typing && !e.ctrlKey && !e.metaKey && !e.altKey) return;
      handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

/** True once the element has been on screen at least once. */
export function useInView<T extends Element>(rootMargin = '200px'): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || seen) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setSeen(true);
    }, { rootMargin });
    io.observe(node);
    return () => io.disconnect();
  }, [seen, rootMargin]);
  return [ref, seen];
}

/** Interval that pauses when the window is hidden. */
export function useVisibleInterval(fn: () => void, ms: number, enabled = true): void {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (!enabled || ms <= 0) return;
    let id: number | null = null;
    const start = () => { if (id === null) id = window.setInterval(() => saved.current(), ms); };
    const stop = () => { if (id !== null) { window.clearInterval(id); id = null; } };
    const onVisibility = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [ms, enabled]);
}
