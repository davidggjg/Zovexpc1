import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Info, LogIn, Play, Radio, RefreshCw } from 'lucide-react';
import type { MediaItem } from '@shared/types';
import { useCatalog } from '@/lib/CatalogProvider';
import { useApp } from '@/store/app';
import { useLibrary, isFinished } from '@/store/library';
import { useSignIn } from '@/components/shell/SignInGate';
import { MediaRow, RowItem } from '@/components/media/MediaRow';
import { PosterCard } from '@/components/media/PosterCard';
import { Button, Badge, Skeleton } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/feedback';
import { absoluteImage } from '@/lib/source';
import { serverOrigin } from '@/store/app';
import { episodeLabel } from '@/lib/catalog';
import './home.css';

/** The newest item with artwork makes the hero; nothing is hand-picked. */
function useHero(movies: MediaItem[]): MediaItem | null {
  return useMemo(() => movies.find((m) => m.thumbnail_url && m.year) ?? movies[0] ?? null, [movies]);
}

export default function HomeScreen() {
  const navigate = useNavigate();
  const { model, status, error, refresh, refreshing } = useCatalog();
  const auth = useApp((s) => s.auth);
  const { signIn, busy: signingIn } = useSignIn();
  const progress = useLibrary((s) => s.progress);
  const favorites = useLibrary((s) => s.favorites);
  const toggleFavorite = useLibrary((s) => s.toggleFavorite);

  const hero = useHero(model.movies);
  const origin = serverOrigin();

  const continueItems = useMemo(() => {
    if (!auth.profile) return [];
    return Object.entries(progress)
      .filter(([, rec]) => rec.position > 30 && !isFinished(rec))
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .map(([id, rec]) => ({ item: model.byId.get(id), rec }))
      .filter((x): x is { item: MediaItem; rec: typeof x.rec } => Boolean(x.item))
      .slice(0, 20);
  }, [progress, model.byId, auth.profile]);

  const favoriteItems = useMemo(
    () => favorites.map((id) => model.byId.get(id)).filter((x): x is MediaItem => Boolean(x)).slice(0, 20),
    [favorites, model.byId],
  );

  const topCategories = useMemo(
    () => model.categories.filter((c) => c.total >= 12 && c.live === 0).slice(0, 6),
    [model.categories],
  );

  if (status === 'error' && model.all.length === 0) {
    return (
      <ErrorState
        detail={error ?? undefined}
        onRetry={() => void refresh(true)}
        retrying={refreshing}
        extra={<Button variant="secondary" onClick={() => navigate('/settings')}>פתח הגדרות שרת</Button>}
      />
    );
  }

  const loading = status === 'loading' && model.all.length === 0;

  return (
    <div className="page page-enter">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="hero"><Skeleton className="hero__skeleton" /></div>
      ) : hero ? (
        <section className="hero">
          <div
            className="hero__backdrop"
            style={{ backgroundImage: `url("${absoluteImage(hero.thumbnail_url, origin) ?? ''}")` }}
          />
          <div className="hero__scrim" />
          <div className="hero__art">
            {hero.thumbnail_url && <img src={absoluteImage(hero.thumbnail_url, origin) ?? ''} alt="" />}
          </div>
          <div className="hero__content">
            <div className="hero__eyebrow">
              <Badge tone="accent">נוסף לאחרונה</Badge>
              {hero.category && <span>{hero.category}</span>}
            </div>
            <h2 className="hero__title">{hero.title}</h2>
            <div className="hero__meta">
              {hero.year && <span className="num">{hero.year}</span>}
              {hero.series_name && <span>{episodeLabel(hero)}</span>}
            </div>
            <div className="hero__actions">
              <Button size="lg" variant="primary" icon={<Play size={17} fill="currentColor" />} onClick={() => navigate(`/watch/${hero.id}`)}>
                צפה עכשיו
              </Button>
              <Button size="lg" variant="secondary" icon={<Info size={17} />} onClick={() => navigate(`/title/${hero.id}`)}>
                פרטים
              </Button>
              <Button
                size="lg"
                variant="ghost"
                icon={<Heart size={17} fill={favorites.includes(hero.id) ? 'currentColor' : 'none'} />}
                onClick={() => void toggleFavorite(hero.id)}
              >
                {favorites.includes(hero.id) ? 'במועדפים' : 'הוסף למועדפים'}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Rows ─────────────────────────────────────────────────────── */}
      <div className="home__rows">
        {!auth.profile && (
          <div className="banner" style={{ marginBottom: 'var(--s-2)' }}>
            <span className="banner__icon"><LogIn size={17} /></span>
            <span className="banner__text">
              <strong>התחבר כדי לשמור איפה עצרת.</strong>{' '}
              ההמשך צפייה וההיסטוריה נשמרים בשרת לפי החשבון, וזמינים בכל מחשב שתתחבר בו.
            </span>
            <Button size="sm" variant="primary" onClick={() => void signIn()} loading={signingIn}>
              התחבר עם Google
            </Button>
          </div>
        )}

        {continueItems.length > 0 && (
          <MediaRow title="המשך צפייה" count={continueItems.length} moreTo="/continue">
            {continueItems.map(({ item, rec }) => (
              <RowItem key={item.id}>
                <PosterCard
                  title={item.title}
                  subtitle={item.series_name ? episodeLabel(item) : (item.year ? String(item.year) : undefined)}
                  imageUrl={item.thumbnail_url}
                  favoriteId={item.id}
                  progress={{ position: rec.position, duration: rec.duration }}
                  kind={item.series_name ? 'series' : 'movie'}
                  onOpen={() => navigate(`/watch/${item.id}`)}
                />
              </RowItem>
            ))}
          </MediaRow>
        )}

        <MediaRow title="נוסף לאחרונה" count={model.movies.length} moreTo="/movies" loading={loading}>
          {model.movies.slice(0, 24).map((item) => (
            <RowItem key={item.id}>
              <PosterCard
                title={item.title}
                subtitle={[item.year, item.category].filter(Boolean).join(' · ') || undefined}
                imageUrl={item.thumbnail_url}
                favoriteId={item.id}
                onOpen={() => navigate(`/title/${item.id}`)}
              />
            </RowItem>
          ))}
        </MediaRow>

        <MediaRow title="סדרות שעודכנו" count={model.series.length} moreTo="/series" loading={loading}>
          {model.series.slice(0, 24).map((s) => (
            <RowItem key={s.key}>
              <PosterCard
                title={s.name}
                subtitle={`${s.seasonCount} עונות · ${s.episodeCount} פרקים`}
                imageUrl={s.poster}
                kind="series"
                onOpen={() => navigate(`/series/${encodeURIComponent(s.key)}`)}
              />
            </RowItem>
          ))}
        </MediaRow>

        {model.live.length > 0 && (
          <MediaRow title="שידורים חיים" count={model.live.length} moreTo="/live" wide loading={loading}>
            {model.live.slice(0, 20).map((ch) => (
              <RowItem key={ch.id} wide>
                <PosterCard
                  title={ch.title}
                  imageUrl={ch.thumbnail_url}
                  wide
                  kind="live"
                  badges={[{ label: 'שידור חי', tone: 'live' }]}
                  favoriteId={ch.id}
                  onOpen={() => navigate(`/watch/${ch.id}`)}
                />
              </RowItem>
            ))}
          </MediaRow>
        )}

        {favoriteItems.length > 0 && (
          <MediaRow title="המועדפים שלי" count={favorites.length} moreTo="/favorites">
            {favoriteItems.map((item) => (
              <RowItem key={item.id} wide={item.is_live}>
                <PosterCard
                  title={item.title}
                  subtitle={item.year ? String(item.year) : undefined}
                  imageUrl={item.thumbnail_url}
                  wide={item.is_live}
                  kind={item.is_live ? 'live' : item.series_name ? 'series' : 'movie'}
                  favoriteId={item.id}
                  onOpen={() => navigate(item.is_live ? `/watch/${item.id}` : `/title/${item.id}`)}
                />
              </RowItem>
            ))}
          </MediaRow>
        )}

        {topCategories.map((cat) => {
          const items = model.movies.filter((m) => m.category === cat.name).slice(0, 20);
          const series = model.series.filter((s) => s.category === cat.name).slice(0, 20);
          const useSeries = series.length > items.length;
          if (!items.length && !series.length) return null;
          return (
            <MediaRow
              key={cat.name}
              title={cat.name}
              count={cat.total}
              moreTo={`/category/${encodeURIComponent(cat.name)}`}
            >
              {useSeries
                ? series.map((s) => (
                    <RowItem key={s.key}>
                      <PosterCard
                        title={s.name}
                        subtitle={`${s.episodeCount} פרקים`}
                        imageUrl={s.poster}
                        kind="series"
                        onOpen={() => navigate(`/series/${encodeURIComponent(s.key)}`)}
                      />
                    </RowItem>
                  ))
                : items.map((item) => (
                    <RowItem key={item.id}>
                      <PosterCard
                        title={item.title}
                        subtitle={item.year ? String(item.year) : undefined}
                        imageUrl={item.thumbnail_url}
                        favoriteId={item.id}
                        onOpen={() => navigate(`/title/${item.id}`)}
                      />
                    </RowItem>
                  ))}
            </MediaRow>
          );
        })}

        <div className="home__footer">
          <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => void refresh(true)} loading={refreshing}>
            רענן את הספרייה מהשרת
          </Button>
          <span className="home__stat">
            <Radio size={13} /> {model.all.length.toLocaleString('he-IL')} פריטים · {model.categories.length} קטגוריות
          </span>
        </div>
      </div>
    </div>
  );
}
