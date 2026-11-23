import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Tv, X } from 'lucide-react';
import { useCatalog } from '@/lib/CatalogProvider';
import { useApp } from '@/store/app';
import { MediaGrid } from '@/components/media/MediaGrid';
import { PosterCard, PosterSkeleton } from '@/components/media/PosterCard';
import { Chip, IconButton, Select, TextInput } from '@/components/ui/primitives';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { PageHeader } from './parts';
import { sortSeries, type SortKey } from '@/lib/catalog';
import { normalize } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'עודכנו לאחרונה' },
  { value: 'title', label: 'לפי שם' },
  { value: 'year', label: 'לפי שנה' },
  { value: 'oldest', label: 'הוותיקות ביותר' },
];

export default function SeriesScreen() {
  const navigate = useNavigate();
  const { model, status, error, refresh, refreshing } = useCatalog();
  const posterSize = useApp((s) => s.settings?.posterSize ?? 'comfortable');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('newest');
  const [query, setQuery] = useState('');
  const search = useDebounced(query, 200);

  const categories = useMemo(
    () => model.categories.filter((c) => c.series > 0).map((c) => ({ name: c.name, count: c.series })),
    [model.categories],
  );

  const list = useMemo(() => {
    let result = model.series;
    if (category) result = result.filter((s) => s.category === category);
    if (search.trim().length >= 2) {
      const q = normalize(search);
      result = result.filter((s) => normalize(s.name).includes(q));
    }
    return sortSeries(result, sort);
  }, [model.series, category, search, sort]);

  if (status === 'error' && model.all.length === 0) {
    return <ErrorState detail={error ?? undefined} onRetry={() => void refresh(true)} retrying={refreshing} />;
  }

  const loading = status === 'loading' && model.all.length === 0;

  return (
    <div className="page page-enter">
      <PageHeader
        title="סדרות"
        subtitle={`${list.length.toLocaleString('he-IL')} סדרות · ${model.series.reduce((n, s) => n + s.episodeCount, 0).toLocaleString('he-IL')} פרקים`}
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
            <Chip active={category === null} onClick={() => setCategory(null)} count={model.series.length}>הכול</Chip>
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
          items={list}
          size={posterSize}
          keyOf={(s) => s.key}
          empty={<EmptyState icon={<Tv size={26} />} title="אין סדרות שתואמות לסינון" text="נסה שם אחר או קטגוריה אחרת." />}
          renderItem={(s) => (
            <PosterCard
              title={s.name}
              subtitle={`${s.seasonCount} עונות · ${s.episodeCount} פרקים`}
              imageUrl={s.poster}
              kind="series"
              badges={s.category ? [{ label: s.category, tone: 'neutral' }] : undefined}
              onOpen={() => navigate(`/series/${encodeURIComponent(s.key)}`)}
            />
          )}
        />
      )}
    </div>
  );
}
