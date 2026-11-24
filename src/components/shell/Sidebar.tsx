import { useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Clapperboard, Film, Heart, History, Home, LifeBuoy, PanelRightClose, PanelRightOpen,
  Radio, Search, Settings, Tv,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from './Logo';
import { IconButton, Tooltip } from '@/components/ui/primitives';
import { useCatalog } from '@/lib/CatalogProvider';
import { useApp } from '@/store/app';
import { useLibrary, isContinueWatching } from '@/store/library';
import { initials } from '@/lib/format';
import './shell.css';

function NavItem({ to, icon, label, count, collapsed, end }: {
  to: string; icon: ReactNode; label: string; count?: number; collapsed: boolean; end?: boolean;
}) {
  const content = (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className="navitem"
    >
      <span className="navitem__icon">{icon}</span>
      <span className="navitem__text">{label}</span>
      {count !== undefined && count > 0 && <span className="navitem__count">{count.toLocaleString('he-IL')}</span>}
    </NavLink>
  );
  return collapsed ? <Tooltip label={label} placement="bottom">{content}</Tooltip> : content;
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const navigate = useNavigate();
  const { model } = useCatalog();
  const auth = useApp((s) => s.auth);
  const setCommandOpen = useApp((s) => s.setCommandOpen);
  const favorites = useLibrary((s) => s.favorites);
  const progress = useLibrary((s) => s.progress);

  const continueCount = useMemo(
    () => Object.values(progress).filter(isContinueWatching).length,
    [progress],
  );

  // Category list comes straight from the catalog — no hard-coded menu.
  const categories = useMemo(
    () => model.categories.filter((c) => c.live === 0 || c.total > c.live).slice(0, 14),
    [model.categories],
  );

  return (
    <nav className="sidebar" data-collapsed={collapsed} aria-label="ניווט ראשי">
      <div className="sidebar__search">
        {collapsed ? (
          <Tooltip label="חיפוש" shortcut="Ctrl+K" placement="bottom">
            <IconButton label="חיפוש" onClick={() => setCommandOpen(true)} style={{ width: '100%' }}>
              <Search size={17} />
            </IconButton>
          </Tooltip>
        ) : (
          <button type="button" className="input-wrap" style={{ width: '100%', cursor: 'pointer' }} onClick={() => setCommandOpen(true)}>
            <span className="input-wrap__icon"><Search size={15} /></span>
            <span style={{ flex: 1, textAlign: 'start', color: 'var(--text-tertiary)', fontSize: 'var(--fs-sm)' }}>
              חיפוש בספרייה
            </span>
            <kbd className="tip__kbd">Ctrl K</kbd>
          </button>
        )}
      </div>

      <div className="sidebar__scroll">
        <div className="sidebar__group">
          <NavItem to="/" end icon={<Home size={17} />} label="בית" collapsed={collapsed} />
          <NavItem to="/movies" icon={<Film size={17} />} label="סרטים" count={model.movies.length} collapsed={collapsed} />
          <NavItem to="/series" icon={<Tv size={17} />} label="סדרות" count={model.series.length} collapsed={collapsed} />
          <NavItem to="/live" icon={<Radio size={17} />} label="שידורים חיים" count={model.live.length} collapsed={collapsed} />
        </div>

        <div className="sidebar__group">
          <div className="sidebar__label">{collapsed ? '•' : 'האוסף שלי'}</div>
          <NavItem to="/continue" icon={<History size={17} />} label="המשך צפייה" count={continueCount} collapsed={collapsed} />
          <NavItem to="/favorites" icon={<Heart size={17} />} label="מועדפים" count={favorites.length} collapsed={collapsed} />
        </div>

        {categories.length > 0 && (
          <div className="sidebar__group">
            <div className="sidebar__label">{collapsed ? '•' : 'קטגוריות'}</div>
            {categories.map((cat) => (
              <NavItem
                key={cat.name}
                to={`/category/${encodeURIComponent(cat.name)}`}
                icon={<Clapperboard size={16} />}
                label={cat.name}
                count={cat.total}
                collapsed={collapsed}
              />
            ))}
          </div>
        )}
      </div>

      <div className="sidebar__foot">
        <NavItem to="/settings" icon={<Settings size={17} />} label="הגדרות" collapsed={collapsed} />
        <NavItem to="/support" icon={<LifeBuoy size={17} />} label="תמיכה" collapsed={collapsed} />

        <button type="button" className="account" onClick={() => navigate('/settings#account')}>
          <span className="account__avatar">
            {auth.profile?.picture
              ? <img src={auth.profile.picture} alt="" referrerPolicy="no-referrer" />
              : auth.profile ? initials(auth.profile.name || auth.profile.email) : <Logo size={16} />}
          </span>
          <span className="account__text">
            <span className="account__name truncate">{auth.profile?.name || 'צפייה ללא חשבון'}</span>
            <span className="account__mail truncate">{auth.profile?.email || 'התחבר כדי לסנכרן'}</span>
          </span>
        </button>

        <Tooltip label={collapsed ? 'הרחב תפריט' : 'כווץ תפריט'} placement="bottom">
          <IconButton label={collapsed ? 'הרחב תפריט' : 'כווץ תפריט'} size="sm" onClick={onToggle} style={{ alignSelf: 'center' }}>
            {collapsed ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </IconButton>
        </Tooltip>
      </div>
    </nav>
  );
}
