import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Trash2 } from 'lucide-react';
import { useCatalog } from '@/lib/CatalogProvider';
import { useApp } from '@/store/app';
import { useLibrary } from '@/store/library';
import { MediaGrid } from '@/components/media/MediaGrid';
import { PosterCard } from '@/components/media/PosterCard';
import { Button } from '@/components/ui/primitives';
import { ConfirmDialog, EmptyState } from '@/components/ui/feedback';
import { PageHeader } from './parts';

type Entry =
  | { kind: 'item'; id: string; title: string; subtitle?: string; image: string | null; live: boolean }
  | { kind: 'series'; id: string; title: string; subtitle: string; image: string | null };

export default function FavoritesScreen() {
  const navigate = useNavigate();
  const { model } = useCatalog();
  const posterSize = useApp((s) => s.settings?.posterSize ?? 'comfortable');
  const toast = useApp((s) => s.toast);
  const favorites = useLibrary((s) => s.favorites);
  const clearFavorites = useLibrary((s) => s.clearFavorites);
  const [confirm, setConfirm] = useState(false);

  // A favourite whose item is gone from the server is listed as unavailable
  // rather than silently dropped — the user chose it, we say what happened.
  const entries = useMemo<(Entry | { kind: 'missing'; id: string })[]>(() => {
    return favorites.map((id) => {
      if (id.startsWith('series:')) {
        const series = model.seriesByKey.get(id.slice('series:'.length));
        if (!series) return { kind: 'missing' as const, id };
        return {
          kind: 'series' as const,
          id,
          title: series.name,
          subtitle: `${series.seasonCount} עונות · ${series.episodeCount} פרקים`,
          image: series.poster,
        };
      }
      const item = model.byId.get(id);
      if (!item) return { kind: 'missing' as const, id };
      return {
        kind: 'item' as const,
        id,
        title: item.title,
        subtitle: [item.year, item.category].filter(Boolean).join(' · ') || undefined,
        image: item.thumbnail_url,
        live: item.is_live === true,
      };
    });
  }, [favorites, model]);

  return (
    <div className="page page-enter">
      <PageHeader
        title="מועדפים"
        subtitle={`${favorites.length.toLocaleString('he-IL')} פריטים שסימנת במחשב הזה`}
        tools={
          favorites.length > 0 ? (
            <Button variant="quiet-danger" size="sm" icon={<Trash2 size={14} />} onClick={() => setConfirm(true)}>
              רוקן רשימה
            </Button>
          ) : undefined
        }
      />

      <MediaGrid
        items={entries}
        size={posterSize}
        keyOf={(e) => e.id}
        empty={
          <EmptyState
            icon={<Heart size={26} />}
            title="הרשימה ריקה"
            text="סמן סרטים, סדרות וערוצים בלב כדי שיופיעו כאן, זמינים בלחיצה אחת."
            action={<Button variant="primary" onClick={() => navigate('/')}>עיין בספרייה</Button>}
          />
        }
        renderItem={(entry) => {
          if (entry.kind === 'missing') {
            return (
              <PosterCard
                title="פריט שאינו זמין עוד"
                subtitle="הוסר מהשרת"
                imageUrl={null}
                favoriteId={entry.id}
                onOpen={() => toast({ title: 'הפריט הוסר מהשרת', description: 'אפשר להסיר אותו מהמועדפים בלחיצה על הלב.', tone: 'warning' })}
              />
            );
          }
          if (entry.kind === 'series') {
            return (
              <PosterCard
                title={entry.title}
                subtitle={entry.subtitle}
                imageUrl={entry.image}
                kind="series"
                favoriteId={entry.id}
                onOpen={() => navigate(`/series/${encodeURIComponent(entry.id.slice('series:'.length))}`)}
              />
            );
          }
          return (
            <PosterCard
              title={entry.title}
              subtitle={entry.subtitle}
              imageUrl={entry.image}
              wide={entry.live}
              kind={entry.live ? 'live' : 'movie'}
              favoriteId={entry.id}
              onOpen={() => navigate(entry.live ? `/watch/${entry.id}` : `/title/${entry.id}`)}
            />
          );
        }}
      />

      <ConfirmDialog
        open={confirm}
        title="לרוקן את רשימת המועדפים?"
        message="כל הפריטים שסימנת יוסרו מהרשימה במחשב הזה."
        confirmLabel="רוקן"
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={() => { void clearFavorites(); setConfirm(false); toast({ title: 'המועדפים נוקו', tone: 'success' }); }}
      />
    </div>
  );
}
