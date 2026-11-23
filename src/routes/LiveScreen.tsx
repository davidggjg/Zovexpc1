import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Play, Radio, Search, X } from 'lucide-react';
import type { EpgProgram, MediaItem } from '@shared/types';
import { useCatalog } from '@/lib/CatalogProvider';
import { PosterCard, PosterSkeleton } from '@/components/media/PosterCard';
import { MediaGrid } from '@/components/media/MediaGrid';
import { Badge, Button, IconButton, Spinner, TextInput } from '@/components/ui/primitives';
import { EmptyState, ErrorState, Modal } from '@/components/ui/feedback';
import { PageHeader } from './parts';
import { formatClock, normalize } from '@/lib/format';
import { useDebounced, useVisibleInterval } from '@/lib/hooks';
import './live.css';

function channelSlug(ch: MediaItem): string {
  return ch.custom_slug || encodeURIComponent(ch.title.replace(/ /g, '-'));
}

/** Now / next / rest-of-day schedule for one channel. */
function ChannelSchedule({ channel, onWatch, onClose }: { channel: MediaItem; onWatch: () => void; onClose: () => void }) {
  const [programs, setPrograms] = useState<EpgProgram[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now() / 1000);

  useVisibleInterval(() => setNow(Date.now() / 1000), 30000);

  useEffect(() => {
    let alive = true;
    setPrograms(null);
    setFailed(false);
    void window.zovex.content.epg(channelSlug(channel))
      .then((list) => { if (alive) setPrograms(list); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [channel]);

  const current = programs?.find((p) => p.start <= now && now < p.end) ?? null;
  const upcoming = programs?.filter((p) => p.start > now).slice(0, 14) ?? [];

  return (
    <Modal open onClose={onClose} size="lg" title={channel.title}>
      <div className="epg">
        <div className="epg__head">
          <Badge tone="live">שידור חי</Badge>
          {channel.category && <span className="epg__cat">{channel.category}</span>}
          <Button variant="primary" icon={<Play size={16} fill="currentColor" />} onClick={onWatch} style={{ marginInlineStart: 'auto' }}>
            צפה בערוץ
          </Button>
        </div>

        {programs === null && !failed && (
          <div className="epg__loading"><Spinner size={18} /><span>טוען לוח שידורים…</span></div>
        )}

        {failed && <p className="epg__empty">לא הצלחנו לטעון את לוח השידורים לערוץ הזה.</p>}

        {programs && programs.length === 0 && (
          <p className="epg__empty">השרת לא מספק לוח שידורים לערוץ הזה.</p>
        )}

        {current && (
          <div className="epg__now">
            <div className="epg__now-label"><CalendarClock size={14} /> משודר עכשיו</div>
            <div className="epg__now-title">{current.title || 'ללא שם'}</div>
            <div className="epg__now-time num">{formatClock(current.start)} – {formatClock(current.end)}</div>
            <div className="progress-track" style={{ marginTop: 10 }}>
              <div
                className="progress-fill"
                style={{ width: `${Math.min(100, ((now - current.start) / (current.end - current.start)) * 100)}%` }}
              />
            </div>
            {current.desc && <p className="epg__desc clamp-3">{current.desc}</p>}
          </div>
        )}

        {upcoming.length > 0 && (
          <ul className="epg__list">
            {upcoming.map((p) => (
              <li key={`${p.start}`} className="epg__row">
                <span className="epg__row-time num">{formatClock(p.start)}</span>
                <span className="epg__row-title truncate">{p.title || 'ללא שם'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

export default function LiveScreen() {
  const navigate = useNavigate();
  const { model, status, error, refresh, refreshing } = useCatalog();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const search = useDebounced(query, 180);

  const channels = useMemo(() => {
    if (search.trim().length < 2) return model.live;
    const q = normalize(search);
    return model.live.filter((c) => normalize(c.title).includes(q));
  }, [model.live, search]);

  if (status === 'error' && model.all.length === 0) {
    return <ErrorState detail={error ?? undefined} onRetry={() => void refresh(true)} retrying={refreshing} />;
  }

  const loading = status === 'loading' && model.all.length === 0;

  return (
    <div className="page page-enter">
      <PageHeader
        title="שידורים חיים"
        subtitle={`${channels.length.toLocaleString('he-IL')} ערוצים זמינים מהשרת`}
        tools={
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חפש ערוץ"
            icon={<Search size={15} />}
            style={{ width: 260 }}
            trailing={query ? <IconButton label="נקה" size="sm" onClick={() => setQuery('')}><X size={14} /></IconButton> : undefined}
          />
        }
      />

      {loading ? (
        <div className="grid grid--comfortable grid--wide">
          {Array.from({ length: 12 }, (_, i) => <PosterSkeleton key={i} wide />)}
        </div>
      ) : (
        <MediaGrid
          items={channels}
          wide
          size="comfortable"
          pageSize={48}
          keyOf={(c) => c.id}
          empty={<EmptyState icon={<Radio size={26} />} title="אין ערוצים להצגה" text="השרת לא מחזיר כרגע ערוצי שידור חי." />}
          renderItem={(ch) => (
            <PosterCard
              title={ch.title}
              imageUrl={ch.thumbnail_url}
              wide
              kind="live"
              badges={[{ label: 'שידור חי', tone: 'live' }]}
              favoriteId={ch.id}
              overlayLines={['לחץ ללוח שידורים']}
              onOpen={() => setSelected(ch)}
            />
          )}
        />
      )}

      {selected && (
        <ChannelSchedule
          channel={selected}
          onClose={() => setSelected(null)}
          onWatch={() => { const id = selected.id; setSelected(null); navigate(`/watch/${id}`); }}
        />
      )}
    </div>
  );
}
