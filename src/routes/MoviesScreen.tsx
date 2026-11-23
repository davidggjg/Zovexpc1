import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, Search, X } from 'lucide-react';
import { useCatalog } from '@/lib/CatalogProvider';
import { useApp } from '@/store/app';
import { useLibrary } from '@/store/library';
import { MediaGrid } from '@/components/media/MediaGrid';
import { PosterCard, PosterSkeleton } from '@/components/media/PosterCard';
import { Chip, IconButton, Select, TextInput } from '@/components/ui/primitives';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { PageHeader } from './parts';
import { sortItems, type SortKey } from '@/lib/catalog';
import { normalize } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'נוספו לאחרונה' },
  { value: 'oldest', label: 'הישנים ביותר' },
  { value: 'title', label: 'לפי שם' },
  { value: 'year', label: 'לפי שנה' },
];

export default function MoviesScreen() {
  const navigate = useNavigate();
  const { model, status, error, refresh, refreshing } = useCatalog();
  const posterSize = useApp((s) => s.settings?.posterSize ?? 'comfortable');
  const progress = useLibrary((s) => s.progress);
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('newest');
  const [query, setQuery] = useState('');
  const search = useDebounced(query, 200);

  const categories = useMemo(
    () => model.categories.filter((c) => c.movies > 0).map((c) => ({ name: c.name, count: c.movies })),
    [model.categories],
  );

  const items = useMemo(() => {
    let list = model.movies;
    if (category) list = list.filter((m) => m.category === category);
    if (search.trim().length >= 2) {
      const q = normalize(search);
      list = list.filter((m) => normalize(m.title).includes(q));
    }
    return sortItems(list, sort);
  }, [model.movies, category, search, sort]);

  if (status === 'error' && model.all.length === 0) {
    return <ErrorState detail={error ?? undefined} onRetry={() => void refresh(true)} retrying={refreshing} />;
  }

  const loading = status === 'loading' && model.all.length === 0;

  return (
    <div className="page page-enter">
      <PageHeader
        title="סרטים"
        subtitle={`${items.length.toLocaleString('he-IL')} מתוך ${model.movies.length.toLocaleString('he-IL')} סרטים בספרייה`}
        tools={
          <>
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="סינון לפי שם"
              icon={<Search size={15} />}
              style={{ width: 240 }}
              trailing={query ? <IconButton label="נקה" size="sm" onClick={() => setQuery('')}><X size={14} /></IconButton> : undefined}
            />
            <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="מיון">
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </>
        }
      />

      {categories.length > 0 && (
        <div className="page__sticky">
          <div className="filterbar">
            <Chip active={category === null} onClick={() => setCategory(null)} count={model.movies.length}>הכול</Chip>
            {categories.map((c) => (
              <Chip key={c.name} active={category === c.name} count={c.count} onClick={() => setCategory(c.name)}>
                {c.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className={`grid grid--${posterSize}`}>
          {Array.from({ length: 24 }, (_, i) => <PosterSkeleton key={i} />)}
        </div>
      ) : (
        <MediaGrid
          items={items}
          size={posterSize}
          keyOf={(item) => item.id}
          empty={
            <EmptyState
              icon={<Film size={26} />}
              title="אין סרטים שתואמים לסינון"
              text={search ? `לא נמצא סרט בשם “${search}”. נסה מילה אחרת או נקה את הסינון.` : 'נסה לבחור קטגוריה אחרת.'}
            />
          }
          renderItem={(item) => {
            const rec = progress[item.id];
            return (
              <PosterCard
                title={item.title}
                subtitle={[item.year, item.category].filter(Boolean).join(' · ') || undefined}
                imageUrl={item.thumbnail_url}
                favoriteId={item.id}
                progress={rec ? { position: rec.position, duration: rec.duration } : null}
                onOpen={() => navigate(`/title/${item.id}`)}
              />
            );
          }}
        />
      )}
    </div>
  );
}
