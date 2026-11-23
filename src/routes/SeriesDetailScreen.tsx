import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Heart, Layers, Play, Tv } from 'lucide-react';
import { useCatalog } from '@/lib/CatalogProvider';
import { serverOrigin } from '@/store/app';
import { useLibrary, isFinished, progressPercent } from '@/store/library';
import { Badge, Button, Chip, IconButton } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/feedback';
import { absoluteImage } from '@/lib/source';
import { formatDuration, timeAgo } from '@/lib/format';
import './detail.css';

export default function SeriesDetailScreen() {
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const { model } = useCatalog();
  const progress = useLibrary((s) => s.progress);
  const favorites = useLibrary((s) => s.favorites);
  const toggleFavorite = useLibrary((s) => s.toggleFavorite);
  const origin = serverOrigin();

  const series = model.seriesByKey.get(decodeURIComponent(key)) ?? null;
  const [seasonNumber, setSeasonNumber] = useState<number | null>(null);

  const season = useMemo(() => {
    if (!series) return null;
    const wanted = seasonNumber ?? series.seasons[0]?.number;
    return series.seasons.find((s) => s.number === wanted) ?? series.seasons[0] ?? null;
  }, [series, seasonNumber]);

  // "Continue" points at the furthest episode the user actually started.
  const resumeEpisode = useMemo(() => {
    if (!series) return null;
    const started = series.seasons
      .flatMap((s) => s.episodes)
      .map((ep) => ({ ep, rec: progress[ep.id] }))
      .filter((x) => x.rec && x.rec.position > 30);
    if (!started.length) return null;
    started.sort((a, b) => b.rec!.updatedAt - a.rec!.updatedAt);
    const latest = started[0];
    return isFinished(latest.rec!) ? null : latest.ep;
  }, [series, progress]);

  if (!series) {
    return (
      <EmptyState
        icon={<Tv size={26} />}
        title="הסדרה לא נמצאה"
        text="הסדרה אינה קיימת בספרייה שהשרת מחזיר כרגע."
        action={<Button variant="secondary" icon={<ArrowRight size={16} />} onClick={() => navigate('/series')}>לכל הסדרות</Button>}
      />
    );
  }

  const firstEpisode = series.seasons[0]?.episodes[0];
  const isFav = favorites.includes(`series:${series.key}`);

  return (
    <div className="page page-enter">
      <div className="detail__backdrop" style={{ backgroundImage: `url("${absoluteImage(series.poster, origin) ?? ''}")` }} />
      <div className="detail__scrim" />

      <div className="detail">
        <div className="detail__poster">
          {series.poster
            ? <img src={absoluteImage(series.poster, origin) ?? ''} alt="" />
            : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-tertiary)' }}><Tv size={34} /></div>}
        </div>

        <div className="detail__main">
          <div className="detail__eyebrow">
            <Badge tone="accent">סדרה</Badge>
            {series.category && (
              <button type="button" className="linkish" onClick={() => navigate(`/category/${encodeURIComponent(series.category!)}`)}>
                {series.category}
              </button>
            )}
          </div>

          <h1 className="detail__title">{series.name}</h1>

          <div className="detail__meta">
            <span><Layers size={14} /> {series.seasonCount} עונות</span>
            <span>{series.episodeCount.toLocaleString('he-IL')} פרקים</span>
            {series.years && <span className="num">{series.years[0] === series.years[1] ? series.years[0] : `${series.years[0]}–${series.years[1]}`}</span>}
            {series.latest > 0 && <span>עודכן {timeAgo(series.latest)}</span>}
          </div>

          <div className="detail__actions">
            {resumeEpisode ? (
              <Button size="lg" variant="primary" icon={<Play size={17} fill="currentColor" />} onClick={() => navigate(`/watch/${resumeEpisode.id}`)}>
                המשך — עונה {resumeEpisode.season_number ?? 1}, פרק {resumeEpisode.episode_number ?? 1}
              </Button>
            ) : firstEpisode ? (
              <Button size="lg" variant="primary" icon={<Play size={17} fill="currentColor" />} onClick={() => navigate(`/watch/${firstEpisode.id}`)}>
                התחל מהפרק הראשון
              </Button>
            ) : null}
            <Button
              size="lg"
              variant="ghost"
              icon={<Heart size={17} fill={isFav ? 'currentColor' : 'none'} />}
              onClick={() => void toggleFavorite(`series:${series.key}`)}
            >
              {isFav ? 'במועדפים' : 'הוסף למועדפים'}
            </Button>
          </div>

          <div className="seasons">
            {series.seasons.length > 1 && (
              <div className="seasons__bar">
                {series.seasons.map((s) => (
                  <Chip
                    key={s.number}
                    active={season?.number === s.number}
                    count={s.episodes.length}
                    onClick={() => setSeasonNumber(s.number)}
                  >
                    עונה {s.number}
                  </Chip>
                ))}
              </div>
            )}

            <div className="episodes">
              {season?.episodes.map((ep) => {
                const rec = progress[ep.id];
                const pct = rec && rec.duration > 0 ? progressPercent(rec) : 0;
                return (
                  <button key={ep.id} type="button" className="episode" onClick={() => navigate(`/watch/${ep.id}`)}>
                    <span className="episode__num">{ep.episode_number ?? '–'}</span>
                    <span className="episode__thumb">
                      {ep.thumbnail_url && <img src={absoluteImage(ep.thumbnail_url, origin) ?? ''} alt="" loading="lazy" />}
                      {pct > 0 && <span className="episode__thumb-progress"><i style={{ width: `${pct}%` }} /></span>}
                    </span>
                    <span className="episode__body">
                      <span className="episode__title truncate">
                        {ep.episode_title?.trim() || ep.title}
                      </span>
                      <span className="episode__sub">
                        {[
                          ep.episode_number_end && ep.episode_number_end !== ep.episode_number
                            ? `פרקים ${ep.episode_number}–${ep.episode_number_end}`
                            : null,
                          rec && rec.position > 30 && !isFinished(rec) ? `נעצרת ב־${formatDuration(rec.position)}` : null,
                          rec && isFinished(rec) ? 'נצפה' : null,
                        ].filter(Boolean).join(' · ') || ' '}
                      </span>
                    </span>
                    <span className="episode__play">
                      <IconButton label="נגן" size="sm"><Play size={15} fill="currentColor" /></IconButton>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
