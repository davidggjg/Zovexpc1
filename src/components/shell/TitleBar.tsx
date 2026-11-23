import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Minus, RefreshCw, Square, Copy, X } from 'lucide-react';
import { Logo } from './Logo';
import { IconButton, Tooltip } from '@/components/ui/primitives';
import { useApp } from '@/store/app';
import { useCatalog } from '@/lib/CatalogProvider';
import { timeAgo } from '@/lib/format';
import './shell.css';

/**
 * Custom window chrome. The window is frameless so the app owns the full
 * surface; these controls replace the ones Windows would have drawn, and the
 * bar itself is the drag region.
 */
export function TitleBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const windowState = useApp((s) => s.windowState);
  const setWindowState = useApp((s) => s.setWindowState);
  const online = useApp((s) => s.online);
  const { status, stale, fetchedAt, refreshing, refresh } = useCatalog();
  const [canBack, setCanBack] = useState(false);

  useEffect(() => window.zovex.window.onState(setWindowState), [setWindowState]);
  useEffect(() => { setCanBack(window.history.length > 1); }, [location.key]);

  const connection = !online
    ? { state: 'offline', text: 'אין חיבור לאינטרנט' }
    : status === 'loading' || refreshing
      ? { state: 'loading', text: 'מסנכרן את הספרייה…' }
      : status === 'error'
        ? { state: 'offline', text: 'השרת אינו זמין' }
        : stale
          ? { state: 'stale', text: `נתונים שמורים · ${timeAgo(fetchedAt)}` }
          : { state: 'ok', text: fetchedAt ? `עודכן ${timeAgo(fetchedAt)}` : 'מחובר' };

  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <Logo size={18} className="titlebar__logo" />
        <span className="titlebar__name">ZOVEX</span>
      </div>

      <div className="titlebar__nav">
        <Tooltip label="חזור" shortcut="Alt+→" placement="bottom">
          <IconButton label="חזור" size="sm" disabled={!canBack} onClick={() => navigate(-1)}>
            <ArrowRight size={16} />
          </IconButton>
        </Tooltip>
        <Tooltip label="קדימה" shortcut="Alt+←" placement="bottom">
          <IconButton label="קדימה" size="sm" onClick={() => navigate(1)}>
            <ArrowLeft size={16} />
          </IconButton>
        </Tooltip>
        <Tooltip label="רענן ספרייה" shortcut="F5" placement="bottom">
          <IconButton label="רענן" size="sm" onClick={() => void refresh(true)} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? 'spin-slow' : undefined}
              style={refreshing ? { animation: 'spin 1.1s linear infinite' } : undefined} />
          </IconButton>
        </Tooltip>
      </div>

      <div className="titlebar__spacer" />

      <div className="titlebar__status" title={connection.text}>
        <span className="titlebar__dot" data-state={connection.state} />
        <span>{connection.text}</span>
      </div>

      <div className="winctl">
        <button type="button" aria-label="מזער" title="מזער" onClick={() => void window.zovex.window.minimize()}>
          <Minus size={15} />
        </button>
        <button
          type="button"
          aria-label={windowState.maximized ? 'שחזר' : 'הגדל'}
          title={windowState.maximized ? 'שחזר' : 'הגדל'}
          onClick={() => void window.zovex.window.toggleMaximize()}
        >
          {windowState.maximized ? <Copy size={13} /> : <Square size={12} />}
        </button>
        <button type="button" aria-label="סגור" title="סגור" onClick={() => void window.zovex.window.close()}>
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
