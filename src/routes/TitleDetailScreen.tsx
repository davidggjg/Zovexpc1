import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Clapperboard, Heart, Play, RotateCcw, Server, Tv } from 'lucide-react';
import type { MediaItem } from '@shared/types';
import { useCatalog } from '@/lib/CatalogProvider';
import { serverOrigin } from '@/store/app';
import { useLibrary, isFinished, progressPercent } from '@/store/library';
import { Badge, Button, ProgressBar, Skeleton } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/feedback';
import { MediaRow, RowItem } from '@/components/media/MediaRow';
import { PosterCard } from '@/components/media/PosterCard';
import { absoluteImage, buildSource } from '@/lib/source';
import { episodeLabel, seriesKey } from '@/lib/catalog';
import { formatDate, formatDuration } from '@/lib/format';
import './detail.css';

const TYPE_LABEL: Record<string, string> = {
  direct: 'קובץ ישיר', telegram: 'ערוץ טלגרם', kaltura: 'Kaltura', drive: 'Google Drive',
  dailymotion: 'Dailymotion', archive: 'Archive.org', youtube: 'YouTube', vimeo: 'Vimeo',
};

export default function TitleDetailScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { model } = useCatalog();
  const progress = useLibrary((s) => s.progress);
  const favorites = useLibrary((s) => s.favorites);
  const toggleFavorite = useLibrary((s) => s.toggleFavorite);
  const clearProgress = useLibrary((s) => s.clearProgress);

  const base = model.byId.get(id) ?? null;
  const [detail, setDetail] = useState<MediaItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const origin = serverOrigin();

  // The catalog is served without descriptions; the full row is fetched on open.
  useEffect(() => {
    let alive = true;
    setLoadingDetail(true);
    setDetail(null);
    void window.zovex.content.item(id)
      .then((item) => { if (alive) setDetail(item); })
      .finally(() => { if (alive) setLoadingDetail(false); });
    return () => { alive = false; };
  }, [id]);

  const item = detail ?? base;
  const rec = progress[id];

  const related = useMemo(() => {
    if (!item?.category) return [];
    return model.movies.filter((m) => m.category === item.category && m.id !== item.id).slice(0, 18);
  }, [model.movies, item]);

  const source = useMemo(() => (item ? buildSource(item, origin) : null), [item, origin]);

  if (!item && loadingDetail) {
    return (
      <div className="detail">
        <Skeleton className="detail__poster" />
        <div>
          <Skeleton height={34} width="46%" />
          <Skeleton height={14} width="28%" style={{ marginTop: 14 }} />
          <Skeleton height={44} width={320} style={{ marginTop: 28, borderRadius: 10 }} />
          <Skeleton height={90} width="80%" style={{ marginTop: 28 }} />
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <EmptyState
        title="הפריט לא נמצא"
        text="הפריט כבר אינו קיים בספרייה שהשרת מחזיר. ייתכן שהוסר."
        action={<Button variant="secondary" icon={<ArrowRight size={16} />} onClick={() => navigate('/')}>חזור לבית</Button>}
      />
    );
  }

  const series = item.series_name ? model.seriesByKey.get(seriesKey(item.series_name)) : null;
  const isFav = favorites.includes(item.id);
  const canResume = rec && rec.position > 30 && !isFinished(rec);

  return (
    <div className="page page-enter">
      <div
        className="detail__backdrop"
        style={{ backgroundImage: `url("${absoluteImage(item.thumbnail_url, origin) ?? ''}")` }}
      />
      <div className="detail__scrim" />

      <div className="detail">
        <div className={item.is_live ? 'detail__poster detail__poster--wide' : 'detail__poster'}>
          {item.thumbnail_url
            ? <img src={absoluteImage(item.thumbnail_url, origin) ?? ''} alt="" />
            : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-tertiary)' }}><Clapperboard size={34} /></div>}
        </div>

        <div className="detail__main">
          <div className="detail__eyebrow">
            {item.is_live && <Badge tone="live">שידור חי</Badge>}
            {item.category && (
              <button type="button" className="linkish" onClick={() => navigate(`/category/${encodeURIComponent(item.category!)}`)}>
                {item.category}
              </button>
            )}
          </div>

          <h1 className="detail__title">{item.title}</h1>

          <div className="detail__meta">
            {item.year && <span className="num">{item.year}</span>}
            {item.series_name && (
              <span>
                <Tv size={14} />
                <button type="button" className="linkish" onClick={() => navigate(`/series/${encodeURIComponent(seriesKey(item.series_name!))}`)}>
                  {item.series_name}
                </button>
              </span>
            )}
            {(item.season_number != null || item.episode_number != null) && <span>{episodeLabel(item)}</span>}
            {item.created_date && <span>נוסף ב־{formatDate(item.created_date)}</span>}
          </div>

          <div className="detail__actions">
            <Button
              size="lg"
              variant="primary"
              icon={<Play size={17} fill="currentColor" />}
              disabled={source?.kind === 'none'}
              onClick={() => navigate(`/watch/${item.id}`)}
            >
              {canResume ? 'המשך צפייה' : 'נגן'}
            </Button>
            {canResume && (
              <Button
                size="lg"
                variant="secondary"
                icon={<RotateCcw size={16} />}
                onClick={() => { void clearProgress(item.id); navigate(`/watch/${item.id}?restart=1`); }}
              >
                התחל מהתחלה
              </Button>
            )}
            <Button
              size="lg"
              variant="ghost"
              icon={<Heart size={17} fill={isFav ? 'currentColor' : 'none'} />}
              onClick={() => void toggleFavorite(item.id)}
            >
              {isFav ? 'במועדפים' : 'הוסף למועדפים'}
            </Button>
          </div>

          {source?.kind === 'none' && (
            <p style={{ marginTop: 'var(--s-4)', color: 'var(--warning)', fontSize: 'var(--fs-sm)' }}>
              {source.reason} — לכן לא ניתן לנגן אותו מהאפליקציה.
            </p>
          )}

          {canResume && rec && (
            <div className="detail__resume">
              <div className="detail__resume-text">
                נעצרת ב־{formatDuration(rec.position)} מתוך {formatDuration(rec.duration)}
                <ProgressBar percent={progressPercent(rec)} className="detail__resume-bar" />
              </div>
            </div>
          )}

          {loadingDetail && !detail?.description ? (
            <Skeleton height={64} width="76%" style={{ marginTop: 'var(--s-6)' }} />
          ) : detail?.description ? (
            <p className="detail__overview" data-selectable>{detail.description}</p>
          ) : (
            <p className="detail__overview" style={{ color: 'var(--text-tertiary)' }}>
              לפריט הזה אין תיאור בשרת.
            </p>
          )}

          <div className="detail__facts">
            <div>
              <div className="fact__label">סוג מקור</div>
              <div className="fact__value">{TYPE_LABEL[item.type ?? ''] ?? item.type ?? 'לא צוין'}</div>
            </div>
            <div>
              <div className="fact__label">אופן ניגון</div>
              <div className="fact__value">
                {source?.kind === 'hls' ? 'שידור HLS' : source?.kind === 'native' ? 'נגן מובנה' : source?.kind === 'embed' ? 'נגן חיצוני מוטמע' : 'לא זמין'}
              </div>
            </div>
            {item.custom_slug && (
              <div>
                <div className="fact__label">מזהה קצר</div>
                <div className="fact__value">{item.custom_slug}</div>
              </div>
            )}
            <div>
              <div className="fact__label"><Server size={11} style={{ display: 'inline' }} /> מזהה בשרת</div>
              <div className="fact__value" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)' }} data-selectable>{item.id}</div>
            </div>
          </div>
        </div>
      </div>

      {series && series.episodeCount > 1 && (
        <MediaRow title={`עוד מתוך ${series.name}`} count={series.episodeCount} moreTo={`/series/${encodeURIComponent(series.key)}`}>
          {series.seasons.flatMap((s) => s.episodes).slice(0, 20).map((ep) => (
            <RowItem key={ep.id}>
              <PosterCard
                title={ep.episode_title || ep.title}
                subtitle={episodeLabel(ep)}
                imageUrl={ep.thumbnail_url}
                kind="series"
                onOpen={() => navigate(`/watch/${ep.id}`)}
              />
            </RowItem>
          ))}
        </MediaRow>
      )}

      {related.length > 0 && (
        <MediaRow title={`עוד בקטגוריה ${item.category}`} moreTo={`/category/${encodeURIComponent(item.category!)}`}>
          {related.map((m) => (
            <RowItem key={m.id}>
              <PosterCard
                title={m.title}
                subtitle={m.year ? String(m.year) : undefined}
                imageUrl={m.thumbnail_url}
                favoriteId={m.id}
                onOpen={() => navigate(`/title/${m.id}`)}
              />
            </RowItem>
          ))}
        </MediaRow>
      )}
    </div>
  );
}
