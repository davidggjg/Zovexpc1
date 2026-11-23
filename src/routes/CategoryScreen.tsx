import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Film, Radio, Search, Tv, X } from 'lucide-react';
import { useCatalog } from '@/lib/CatalogProvider';
import { useApp } from '@/store/app';
import { MediaGrid } from '@/components/media/MediaGrid';
import { PosterCard } from '@/components/media/PosterCard';
import { IconButton, Segmented, Select, TextInput } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/feedback';
import { PageHeader } from './parts';
import { sortItems, sortSeries, type SortKey } from '@/lib/catalog';
import { normalize } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';

type Tab = 'movies' | 'series' | 'live';

export default function CategoryScreen() {
  const { name = '' } = useParams();
  const category = decodeURIComponent(name);
  const navigate = useNavigate();
  const { model } = useCatalog();
  const posterSize = useApp((s) => s.settings?.posterSize ?? 'comfortable');
  const [sort, setSort] = useState<SortKey>('newest');
  const [query, setQuery] = useState('');
  const search = useDebounced(query, 200);

  const movies = useMemo(() => model.movies.filter((m) => m.category === category), [model.movies, category]);
  const series = useMemo(() => model.series.filter((s) => s.category === category), [model.series, category]);
  const live = useMemo(() => model.live.filter((c) => c.category === category), [model.live, category]);

  const tabs = useMemo(() => {
    const out: { value: Tab; label: string; icon: React.ReactNode }[] = [];
    if (movies.length) out.push({ value: 'movies', label: `סרטים (${movies.length.toLocaleString('he-IL')})`, icon: <Film size={14} /> });
    if (series.length) out.push({ value: 'series', label: `סדרות (${series.length.toLocaleString('he-IL')})`, icon: <Tv size={14} /> });
    if (live.length) out.push({ value: 'live', label: `ערוצים (${live.length})`, icon: <Radio size={14} /> });
    return out;
  }, [movies.length, series.length, live.length]);

  const [tab, setTab] = useState<Tab | null>(null);
  const activeTab: Tab = tab ?? tabs[0]?.value ?? 'movies';

  const filteredMovies = useMemo(() => {
    const q = normalize(search);
    const list = search.trim().length >= 2 ? movies.filter((m) => normalize(m.title).includes(q)) : movies;
    return sortItems(list, sort);
  }, [movies, search, sort]);

  const filteredSeries = useMemo(() => {
    const q = normalize(search);
    const list = search.trim().length >= 2 ? series.filter((s) => normalize(s.name).includes(q)) : series;
    return sortSeries(list, sort);
  }, [series, search, sort]);

  const filteredLive = useMemo(() => {
    const q = normalize(search);
    return search.trim().length >= 2 ? live.filter((c) => normalize(c.title).includes(q)) : live;
  }, [live, search]);

  const total = movies.length + series.length + live.length;

  if (total === 0) {
    return (
      <div className="page page-enter">
        <PageHeader title={category} />
        <EmptyState
          title="הקטגוריה הזו ריקה"
          text="השרת לא מחזיר כרגע פריטים בקטגוריה הזו. ייתכן ששמה השתנה — רענן את הספרייה."
        />
      </div>
    );
  }

  return (
    <div className="page page-enter">
      <PageHeader
        title={category}
        subtitle={`${total.toLocaleString('he-IL')} פריטים בקטגוריה`}
        tools={
          <>
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="סינון לפי שם"
              icon={<Search size={15} />}
              style={{ width: 230 }}
              trailing={query ? <IconButton label="נקה" size="sm" onClick={() => setQuery('')}><X size={14} /></IconButton> : undefined}
            />
            {activeTab !== 'live' && (
              <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="מיון">
                <option value="newest">נוספו לאחרונה</option>
                <option value="title">לפי שם</option>
                <option value="year">לפי שנה</option>
                <option value="oldest">הישנים ביותר</option>
              </Select>
            )}
          </>
        }
      />

      {tabs.length > 1 && (
        <div className="page__sticky">
          <div className="filterbar">
            <Segmented options={tabs} value={activeTab} onChange={setTab} ariaLabel="סוג תוכן" />
          </div>
        </div>
      )}

      {activeTab === 'movies' && (
        <MediaGrid
          items={filteredMovies}
          size={posterSize}
          keyOf={(m) => m.id}
          empty={<EmptyState title="אין סרטים תואמים" />}
          renderItem={(item) => (
            <PosterCard
              title={item.title}
              subtitle={item.year ? String(item.year) : undefined}
              imageUrl={item.thumbnail_url}
              favoriteId={item.id}
              onOpen={() => navigate(`/title/${item.id}`)}
            />
          )}
        />
      )}

      {activeTab === 'series' && (
        <MediaGrid
          items={filteredSeries}
          size={posterSize}
          keyOf={(s) => s.key}
          empty={<EmptyState title="אין סדרות תואמות" />}
          renderItem={(s) => (
            <PosterCard
              title={s.name}
              subtitle={`${s.seasonCount} עונות · ${s.episodeCount} פרקים`}
              imageUrl={s.poster}
              kind="series"
              onOpen={() => navigate(`/series/${encodeURIComponent(s.key)}`)}
            />
          )}
        />
      )}

      {activeTab === 'live' && (
        <MediaGrid
          items={filteredLive}
          wide
          size={posterSize}
          keyOf={(c) => c.id}
          empty={<EmptyState title="אין ערוצים תואמים" />}
          renderItem={(ch) => (
            <PosterCard
              title={ch.title}
              imageUrl={ch.thumbnail_url}
              wide
              kind="live"
              badges={[{ label: 'שידור חי', tone: 'live' }]}
              favoriteId={ch.id}
              onOpen={() => navigate(`/watch/${ch.id}`)}
            />
          )}
        />
      )}
    </div>
  );
}
