import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Film, Heart, History, Home, Radio, Search, Settings, Tv } from 'lucide-react';
import { useApp } from '@/store/app';
import { useCatalog } from '@/lib/CatalogProvider';
import { searchCatalog } from '@/lib/catalog';
import { useDebounced } from '@/lib/hooks';
import { absoluteImage } from '@/lib/source';
import { serverOrigin } from '@/store/app';
import './shell.css';

interface Command {
  id: string;
  title: string;
  sub?: string;
  icon?: React.ReactNode;
  thumb?: string | null;
  run: () => void;
}

/** Ctrl+K — go anywhere, find anything. */
export function CommandPalette() {
  const open = useApp((s) => s.commandOpen);
  const setOpen = useApp((s) => s.setCommandOpen);
  const navigate = useNavigate();
  const { model } = useCatalog();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const debounced = useDebounced(query, 140);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) { setQuery(''); setCursor(0); }
  }, [open]);

  const navCommands = useMemo<Command[]>(() => [
    { id: 'nav-home', title: 'בית', icon: <Home size={16} />, run: () => navigate('/') },
    { id: 'nav-movies', title: 'סרטים', icon: <Film size={16} />, run: () => navigate('/movies') },
    { id: 'nav-series', title: 'סדרות', icon: <Tv size={16} />, run: () => navigate('/series') },
    { id: 'nav-live', title: 'שידורים חיים', icon: <Radio size={16} />, run: () => navigate('/live') },
    { id: 'nav-continue', title: 'המשך צפייה', icon: <History size={16} />, run: () => navigate('/continue') },
    { id: 'nav-fav', title: 'מועדפים', icon: <Heart size={16} />, run: () => navigate('/favorites') },
    { id: 'nav-settings', title: 'הגדרות', icon: <Settings size={16} />, run: () => navigate('/settings') },
  ], [navigate]);

  const results = useMemo<Command[]>(() => {
    if (debounced.trim().length < 2) {
      return navCommands;
    }
    const hits = searchCatalog(model, debounced, 24).map<Command>((hit) => {
      if (hit.kind === 'series' && hit.series) {
        const s = hit.series;
        return {
          id: hit.id,
          title: s.name,
          sub: `סדרה · ${s.seasonCount} עונות · ${s.episodeCount} פרקים${s.category ? ` · ${s.category}` : ''}`,
          thumb: s.poster,
          run: () => navigate(`/series/${encodeURIComponent(s.key)}`),
        };
      }
      const item = hit.item!;
      return {
        id: hit.id,
        title: item.title,
        sub: [item.is_live ? 'שידור חי' : item.year, item.category].filter(Boolean).join(' · '),
        thumb: item.thumbnail_url,
        run: () => navigate(item.is_live ? `/watch/${item.id}` : `/title/${item.id}`),
      };
    });
    const matchingNav = navCommands.filter((c) => c.title.includes(debounced.trim()));
    return [...matchingNav, ...hits];
  }, [debounced, model, navCommands, navigate]);

  useEffect(() => { setCursor(0); }, [debounced]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = results[cursor];
        if (chosen) { chosen.run(); setOpen(false); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, results, cursor, setOpen]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  const origin = serverOrigin();

  return createPortal(
    <div className="palette-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="חיפוש ופקודות">
        <div className="palette__input">
          <Search size={19} style={{ color: 'var(--text-tertiary)' }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חפש סרט, סדרה או ערוץ — או עבור למסך"
            aria-label="חיפוש"
          />
        </div>

        <div className="palette__list" ref={listRef}>
          {results.length === 0 ? (
            <div className="palette__section">לא נמצאו תוצאות עבור “{debounced}”</div>
          ) : (
            <>
              <div className="palette__section">
                {debounced.trim().length < 2 ? 'מעבר מהיר' : `${results.length} תוצאות`}
              </div>
              {results.map((cmd, i) => (
                <button
                  key={cmd.id}
                  type="button"
                  data-index={i}
                  data-active={i === cursor}
                  className="palette__row"
                  onMouseMove={() => setCursor(i)}
                  onClick={() => { cmd.run(); setOpen(false); }}
                >
                  {cmd.thumb !== undefined ? (
                    <img className="palette__thumb" src={absoluteImage(cmd.thumb, origin) ?? ''} alt="" loading="lazy" />
                  ) : (
                    <span style={{ width: 34, display: 'grid', placeItems: 'center' }}>{cmd.icon}</span>
                  )}
                  <span className="palette__row-main">
                    <span className="palette__row-title truncate">{cmd.title}</span>
                    {cmd.sub && <span className="palette__row-sub truncate">{cmd.sub}</span>}
                  </span>
                  {i === cursor && <CornerDownLeft size={14} style={{ color: 'var(--text-tertiary)' }} />}
                </button>
              ))}
            </>
          )}
        </div>

        <div className="palette__foot">
          <span><kbd>↑↓</kbd>ניווט</span>
          <span><kbd>Enter</kbd>פתיחה</span>
          <span><kbd>Esc</kbd>סגירה</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
