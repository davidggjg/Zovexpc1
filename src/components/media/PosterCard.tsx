import { memo, useState } from 'react';
import { Film, Heart, Play, Radio, Tv } from 'lucide-react';
import clsx from 'clsx';
import type { MediaItem } from '@shared/types';
import { Badge } from '@/components/ui/primitives';
import { useLibrary, progressPercent, isFinished } from '@/store/library';
import { serverOrigin } from '@/store/app';
import { absoluteImage } from '@/lib/source';
import './media.css';

export interface PosterCardProps {
  title: string;
  subtitle?: string;
  imageUrl: string | null;
  wide?: boolean;
  badges?: { label: string; tone?: 'accent' | 'live' | 'neutral' | 'success' }[];
  overlayLines?: string[];
  favoriteId?: string;
  progress?: { position: number; duration: number } | null;
  kind?: 'movie' | 'series' | 'live';
  onOpen: () => void;
}

/**
 * The one card used everywhere. Images are lazy and fade in; a missing or
 * broken poster falls back to a typed placeholder rather than a blank hole.
 */
function PosterCardBase({
  title, subtitle, imageUrl, wide, badges, overlayLines, favoriteId, progress, kind = 'movie', onOpen,
}: PosterCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const favorites = useLibrary((s) => s.favorites);
  const toggleFavorite = useLibrary((s) => s.toggleFavorite);
  const isFav = favoriteId ? favorites.includes(favoriteId) : false;
  const src = absoluteImage(imageUrl, serverOrigin());

  const pct = progress && progress.duration > 0 && !isFinished({ ...progress, updatedAt: 0, title: '', thumb: null })
    ? progressPercent({ ...progress, updatedAt: 0, title: '', thumb: null })
    : 0;

  const FallbackIcon = kind === 'live' ? Radio : kind === 'series' ? Tv : Film;

  return (
    <div
      className={clsx('card', wide && 'card--wide')}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      title={title}
    >
      <div className="card__art">
        {src && !failed ? (
          <img
            className="card__img"
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            data-loaded={loaded}
            data-cover={kind !== 'live'}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="card__fallback">
            <FallbackIcon size={26} />
            <span className="clamp-2">{title}</span>
          </div>
        )}

        <div className="card__veil" />
        <div className="card__play"><Play size={20} fill="currentColor" /></div>

        {badges && badges.length > 0 && (
          <div className="card__tags">
            {badges.map((b) => <Badge key={b.label} tone={b.tone ?? 'neutral'}>{b.label}</Badge>)}
          </div>
        )}

        {favoriteId && (
          <button
            type="button"
            className="card__fav"
            data-on={isFav}
            aria-label={isFav ? 'הסר ממועדפים' : 'הוסף למועדפים'}
            title={isFav ? 'הסר ממועדפים' : 'הוסף למועדפים'}
            onClick={(e) => { e.stopPropagation(); void toggleFavorite(favoriteId, { title, thumb: imageUrl }); }}
          >
            <Heart size={15} fill={isFav ? 'currentColor' : 'none'} />
          </button>
        )}

        {overlayLines && overlayLines.length > 0 && (
          <div className="card__bottom">
            {overlayLines.map((line) => (
              <span key={line} className="card__meta-line truncate">{line}</span>
            ))}
          </div>
        )}

        {pct > 0 && <div className="card__progress"><i style={{ width: `${pct}%` }} /></div>}
      </div>

      <div>
        <div className="card__title clamp-2">{title}</div>
        {subtitle && <div className="card__sub truncate">{subtitle}</div>}
      </div>
    </div>
  );
}

export const PosterCard = memo(PosterCardBase);

export function PosterSkeleton({ wide }: { wide?: boolean }) {
  return (
    <div className={clsx('card', wide && 'card--wide')} aria-hidden>
      <div className="card__art skeleton" style={{ border: 0 }} />
      <div className="skeleton" style={{ height: 11, width: '78%', borderRadius: 4 }} />
      <div className="skeleton" style={{ height: 9, width: '45%', borderRadius: 4, marginTop: 5 }} />
    </div>
  );
}

/** Maps a catalog row to card props so every screen shows it identically. */
export function itemToCard(item: MediaItem, onOpen: () => void, progress?: { position: number; duration: number } | null): PosterCardProps {
  const live = item.is_live === true;
  const badges: PosterCardProps['badges'] = [];
  if (live) badges.push({ label: 'שידור חי', tone: 'live' });
  return {
    title: item.title,
    subtitle: live ? (item.category ?? undefined) : [item.year, item.category].filter(Boolean).join(' · ') || undefined,
    imageUrl: item.thumbnail_url,
    wide: live,
    kind: live ? 'live' : 'movie',
    badges,
    favoriteId: item.id,
    progress: progress ?? null,
    onOpen,
  };
}
