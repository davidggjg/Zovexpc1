import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Trash2 } from 'lucide-react';
import type { MediaItem } from '@shared/types';
import { useCatalog } from '@/lib/CatalogProvider';
import { useApp } from '@/store/app';
import { useLibrary, isContinueWatching, parseWatchedAt } from '@/store/library';
import { MediaGrid } from '@/components/media/MediaGrid';
import { PosterCard } from '@/components/media/PosterCard';
import { Button, Segmented } from '@/components/ui/primitives';
import { ConfirmDialog, EmptyState } from '@/components/ui/feedback';
import { PageHeader } from './parts';
import { SignInGate, useSignIn } from '@/components/shell/SignInGate';
import { episodeLabel } from '@/lib/catalog';
import { formatDuration, timeAgo } from '@/lib/format';

type Tab = 'continue' | 'history';

export default function ContinueScreen() {
  const navigate = useNavigate();
  const { model } = useCatalog();
  const posterSize = useApp((s) => s.settings?.posterSize ?? 'comfortable');
  const toast = useApp((s) => s.toast);
  const progress = useLibrary((s) => s.progress);
  const clearAllProgress = useLibrary((s) => s.clearAllProgress);
  const [tab, setTab] = useState<Tab>('continue');
  const serverHistory = useLibrary((s) => s.history);
  const syncing = useLibrary((s) => s.syncing);
  const syncFromServer = useLibrary((s) => s.syncFromServer);
  const [confirmClear, setConfirmClear] = useState(false);

  const { signedIn } = useSignIn();

  useEffect(() => {
    if (signedIn) void syncFromServer();
  }, [signedIn, syncFromServer]);

  const unfinished = useMemo(() => {
    return Object.entries(progress)
      .filter(([, rec]) => isContinueWatching(rec))
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .map(([id, rec]) => ({ id, rec, item: model.byId.get(id) ?? null }));
  }, [progress, model.byId]);

  const history = useMemo(() => {
    const rows = serverHistory.map((h) => ({
      id: h.media_id,
      item: model.byId.get(h.media_id) ?? null,
      title: h.title ?? '',
      thumb: h.thumbnail_url ?? null,
      when: parseWatchedAt(h.watched_at ?? h.updated_at),
    }));
    const seen = new Set<string>();
    return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  }, [serverHistory, model.byId]);

  const open = (item: MediaItem | null, id: string) => navigate(item ? `/watch/${item.id}` : `/title/${id}`);

  if (!signedIn) {
    return (
      <div className="page page-enter">
        <PageHeader title="המשך צפייה" />
        <SignInGate
          title="התחבר כדי לשמור איפה עצרת"
          text="ההמשך צפייה וההיסטוריה נשמרים בשרת לפי החשבון שלך, כך שהם זמינים בכל מחשב שתתחבר בו. בלי חשבון אין למה לקשר אותם."
        />
      </div>
    );
  }

  return (
    <div className="page page-enter">
      <PageHeader
        title="המשך צפייה"
        subtitle="ממשיך בדיוק מהמקום שעצרת — נשמר בשרת לפי החשבון שלך"
        tools={
          unfinished.length > 0 && tab === 'continue' ? (
            <Button variant="quiet-danger" size="sm" icon={<Trash2 size={14} />} onClick={() => setConfirmClear(true)}>
              נקה הכול
            </Button>
          ) : undefined
        }
      />

      <div className="page__sticky">
        <div className="filterbar">
          <Segmented
            value={tab}
            onChange={setTab}
            ariaLabel="תצוגה"
            options={[
              { value: 'continue', label: `ממשיכים (${unfinished.length})` },
              { value: 'history', label: `היסטוריה (${history.length})` },
            ]}
          />
        </div>
      </div>

      {tab === 'continue' ? (
        <MediaGrid
          items={unfinished}
          size={posterSize}
          keyOf={(row) => row.id}
          empty={
            <EmptyState
              icon={<History size={26} />}
              title="אין צפיות פתוחות"
              text="כשתתחיל לצפות במשהו ותעצור באמצע, הוא יופיע כאן כדי להמשיך בלחיצה אחת."
              action={<Button variant="primary" onClick={() => navigate('/')}>עבור לספרייה</Button>}
            />
          }
          renderItem={({ id, rec, item }) => (
            <PosterCard
              title={item?.title ?? rec.title}
              subtitle={
                item?.series_name
                  ? episodeLabel(item)
                  : rec.position > 0
                    ? `נעצרת ב־${formatDuration(rec.position)} · ${timeAgo(rec.updatedAt)}`
                    : timeAgo(rec.updatedAt)
              }
              imageUrl={item?.thumbnail_url ?? rec.thumb}
              favoriteId={item?.id}
              progress={{ position: rec.position, duration: rec.duration }}
              kind={item?.is_live ? 'live' : item?.series_name ? 'series' : 'movie'}
              onOpen={() => open(item, id)}
            />
          )}
        />
      ) : (
        <MediaGrid
          items={history}
          size={posterSize}
          keyOf={(row) => row.id}
          empty={
            <EmptyState
              icon={<History size={26} />}
              title={syncing ? 'טוען היסטוריה מהשרת…' : 'אין היסטוריית צפייה בשרת'}
              text={syncing ? undefined : 'ההיסטוריה נשמרת בשרת לפי החשבון שלך. ברגע שתצפה במשהו, הוא יופיע כאן.'}
            />
          }
          renderItem={(row) => (
            <PosterCard
              title={row.item?.title ?? row.title ?? 'ללא שם'}
              subtitle={row.when ? timeAgo(row.when) : undefined}
              imageUrl={row.item?.thumbnail_url ?? row.thumb}
              favoriteId={row.item?.id}
              kind={row.item?.is_live ? 'live' : 'movie'}
              onOpen={() => open(row.item, row.id)}
            />
          )}
        />
      )}

      <ConfirmDialog
        open={confirmClear}
        title="לנקות את כל סימוני ההמשך?"
        message="הפעולה מוחקת את כל המיקומים השמורים במחשב הזה. ההיסטוריה בשרת לא תימחק."
        confirmLabel="נקה"
        destructive
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          void clearAllProgress();
          setConfirmClear(false);
          toast({ title: 'סימוני ההמשך נוקו', tone: 'success' });
        }}
      />
    </div>
  );
}
