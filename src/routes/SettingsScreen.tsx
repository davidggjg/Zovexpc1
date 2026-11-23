import { useEffect, useState } from 'react';
import {
  Activity, CircleUser, Database, Info, Keyboard, LogOut, MonitorCog, Palette, PlayCircle, Server, Trash2,
} from 'lucide-react';
import type { Settings } from '@shared/types';
import { useApp } from '@/store/app';
import { useCatalog } from '@/lib/CatalogProvider';
import { Button, Select, Slider, Switch, TextInput } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/feedback';
import { PageHeader } from './parts';
import { formatBytes, initials, timeAgo } from '@/lib/format';
import './settings.css';

const ACCENTS = [
  { hue: 354, name: 'אדום ZOVEX' },
  { hue: 14, name: 'כתום' },
  { hue: 265, name: 'סגול' },
  { hue: 212, name: 'כחול' },
  { hue: 158, name: 'ירוק' },
  { hue: 330, name: 'ורוד' },
];

function Group({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="sgroup">
      <header className="sgroup__head">
        <span className="sgroup__icon">{icon}</span>
        <div>
          <div className="sgroup__title">{title}</div>
          {desc && <div className="sgroup__desc">{desc}</div>}
        </div>
      </header>
      {children}
    </section>
  );
}

function Row({ label, hint, children, stack }: { label: string; hint?: string; children?: React.ReactNode; stack?: boolean }) {
  return (
    <div className={stack ? 'srow srow--stack' : 'srow'}>
      <div className="srow__text">
        <div className="srow__label">{label}</div>
        {hint && <div className="srow__hint">{hint}</div>}
      </div>
      {children && <div className="srow__control">{children}</div>}
    </div>
  );
}

export default function SettingsScreen() {
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const resetSettings = useApp((s) => s.resetSettings);
  const auth = useApp((s) => s.auth);
  const userId = useApp((s) => s.userId);
  const refreshIdentity = useApp((s) => s.refreshIdentity);
  const toast = useApp((s) => s.toast);
  const { fetchedAt, refresh, refreshing, model } = useCatalog();

  const [info, setInfo] = useState<Awaited<ReturnType<typeof window.zovex.app.info>> | null>(null);
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [cacheSize, setCacheSize] = useState(0);
  const [serverDraft, setServerDraft] = useState('');
  const [clientDraft, setClientDraft] = useState('');
  const [secretDraft, setSecretDraft] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    void (async () => {
      const [i, size, version] = await Promise.all([
        window.zovex.app.info(),
        window.zovex.catalog.cacheSize(),
        window.zovex.server.version(),
      ]);
      setInfo(i);
      setCacheSize(size);
      setServerVersion(version?.latest ?? null);
    })();
  }, []);

  useEffect(() => {
    if (!settings) return;
    setServerDraft(settings.serverUrl);
    setClientDraft(settings.googleClientId);
    setSecretDraft(settings.googleClientSecret);
  }, [settings]);

  if (!settings) return null;

  const patch = (p: Partial<Settings>) => void setSettings(p);

  const signIn = async () => {
    setSigningIn(true);
    const result = await window.zovex.auth.signIn();
    setSigningIn(false);
    if (result.ok && result.profile) {
      await refreshIdentity();
      toast({ title: `שלום ${result.profile.name || result.profile.email}`, description: 'ההתחברות הושלמה.', tone: 'success' });
    } else {
      toast({ title: 'ההתחברות נכשלה', description: result.error, tone: 'danger', duration: 7000 });
    }
  };

  const signOut = async () => {
    await window.zovex.auth.signOut();
    await setSettings({ accountId: null });
    await refreshIdentity();
    toast({ title: 'התנתקת', description: 'ההיסטוריה המקומית נשמרת במחשב הזה.', tone: 'default' });
  };

  const testServer = async () => {
    setPinging(true);
    const result = await window.zovex.server.ping();
    setPinging(false);
    toast({
      title: result.ok ? `השרת מגיב (${result.ms} מ״ש)` : 'אין מענה מהשרת',
      description: result.ok ? undefined : `סטטוס ${result.status || 'ללא תשובה'} — בדוק את הכתובת ואת החיבור.`,
      tone: result.ok ? 'success' : 'danger',
    });
  };

  return (
    <div className="page page-enter">
      <PageHeader title="הגדרות" subtitle="החשבון, התצוגה, הניגון והחיבור לשרת" />

      <div className="settings">
        {/* ── Account ─────────────────────────────────────────────── */}
        <Group icon={<CircleUser size={18} />} title="חשבון" desc="התחברות עם Google מסנכרנת את ההמשך צפייה בין מחשבים">
          <div className="account-card">
            <span className="account-card__avatar">
              {auth.profile?.picture
                ? <img src={auth.profile.picture} alt="" referrerPolicy="no-referrer" />
                : auth.profile ? initials(auth.profile.name || auth.profile.email) : <CircleUser size={24} />}
            </span>
            <div className="account-card__text">
              <div className="account-card__name">{auth.profile?.name || 'צפייה ללא חשבון'}</div>
              <div className="account-card__mail">
                {auth.profile?.email
                  ?? (settings.googleClientSecret.trim()
                    ? 'כל התכונות עובדות גם בלי התחברות — הנתונים נשמרים במחשב הזה בלבד'
                    : 'כדי להתחבר, מלא Google Client Secret בקטע "שרת" למטה')}
              </div>
            </div>
            {auth.profile ? (
              <Button variant="secondary" icon={<LogOut size={15} />} onClick={() => void signOut()}>התנתק</Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => void signIn()}
                loading={signingIn}
                disabled={!settings.googleClientId.trim() || !settings.googleClientSecret.trim()}
                title={
                  !settings.googleClientSecret.trim()
                    ? 'חסר Google Client Secret — מלא אותו בקטע "שרת" למטה'
                    : undefined
                }
              >
                התחבר עם Google
              </Button>
            )}
          </div>

          {signingIn && (
            <Row label="ממתין לאישור בדפדפן" hint="נפתח חלון Google בדפדפן ברירת המחדל. אחרי האישור חזור לכאן.">
              <Button variant="ghost" size="sm" onClick={() => void window.zovex.auth.cancel()}>בטל</Button>
            </Row>
          )}

          {auth.profile && (
            <Row
              label="סנכרן היסטוריה לפי חשבון Google"
              hint="מופעל: ההמשך צפייה מזוהה לפי החשבון ועובר בין מחשבים. כבוי: מזוהה לפי המחשב הזה בלבד."
            >
              <Switch
                label="סנכרון לפי חשבון"
                checked={settings.accountId !== null}
                onChange={(on) => patch({ accountId: on && auth.profile ? `g_${auth.profile.sub}` : null })}
              />
            </Row>
          )}

          <Row label="שמור היסטוריה בשרת" hint="שולח לשרת מה נצפה והיכן נעצרת, בדיוק כמו באפליקציית האנדרואיד.">
            <Switch label="שמירת היסטוריה" checked={settings.syncHistory} onChange={(v) => patch({ syncHistory: v })} />
          </Row>

          <Row label="מזהה המשתמש הנוכחי" hint="זה המזהה שנשלח לשרת בכותרת x-user-id." stack>
            <TextInput value={userId} readOnly onFocus={(e) => e.currentTarget.select()} />
          </Row>
        </Group>

        {/* ── Appearance ──────────────────────────────────────────── */}
        <Group icon={<Palette size={18} />} title="מראה">
          <Row label="ערכת נושא">
            <Select value={settings.theme} onChange={(e) => patch({ theme: e.target.value as Settings['theme'] })} aria-label="ערכת נושא">
              <option value="dark">כהה</option>
              <option value="light">בהיר</option>
              <option value="system">לפי המערכת</option>
            </Select>
          </Row>
          <Row label="צבע הדגשה">
            <div className="swatches">
              {ACCENTS.map((a) => (
                <button
                  key={a.hue}
                  type="button"
                  className="swatch"
                  title={a.name}
                  aria-label={a.name}
                  data-active={settings.accentHue === a.hue}
                  style={{ background: `hsl(${a.hue} 88% 48%)` }}
                  onClick={() => patch({ accentHue: a.hue })}
                />
              ))}
            </div>
          </Row>
          <Row label="גודל כרטיסים" hint="כמה פריטים ייכנסו בשורה אחת במסכי הספרייה.">
            <Select value={settings.posterSize} onChange={(e) => patch({ posterSize: e.target.value as Settings['posterSize'] })} aria-label="גודל כרטיסים">
              <option value="compact">צפוף</option>
              <option value="comfortable">רגיל</option>
              <option value="large">גדול</option>
            </Select>
          </Row>
          <Row label="צמצם אנימציות" hint="מבטל מעברים ותנועה — שימושי במחשבים חלשים.">
            <Switch label="צמצום אנימציות" checked={settings.reduceMotion} onChange={(v) => patch({ reduceMotion: v })} />
          </Row>
        </Group>

        {/* ── Playback ────────────────────────────────────────────── */}
        <Group icon={<PlayCircle size={18} />} title="ניגון">
          <Row label="נגן אוטומטית את הפרק הבא" hint="בסיום פרק בסדרה, עובר לפרק הבא באותה עונה.">
            <Switch label="ניגון אוטומטי" checked={settings.autoplayNext} onChange={(v) => patch({ autoplayNext: v })} />
          </Row>
          <Row label="המשך מהמקום שבו עצרת">
            <Switch label="המשך צפייה" checked={settings.resumePlayback} onChange={(v) => patch({ resumePlayback: v })} />
          </Row>
          <Row label={`עוצמת שמע התחלתית — ${Math.round(settings.defaultVolume * 100)}%`}>
            <Slider
              value={Math.round(settings.defaultVolume * 100)}
              onChange={(v) => patch({ defaultVolume: v / 100 })}
              ariaLabel="עוצמת שמע התחלתית"
              className="srow__slider"
            />
          </Row>
          <Row label="קפיצה בחיצים" hint="כמה שניות לדלג עם מקשי החיצים בנגן.">
            <Select value={String(settings.seekStep)} onChange={(e) => patch({ seekStep: Number(e.target.value) })} aria-label="קפיצה בחיצים">
              {[5, 10, 15, 30].map((n) => <option key={n} value={n}>{n} שניות</option>)}
            </Select>
          </Row>
        </Group>

        {/* ── Server ──────────────────────────────────────────────── */}
        <Group icon={<Server size={18} />} title="שרת" desc="כל התוכן נטען מהשרת הזה — אין נתונים מקומיים מלבד מטמון">
          <Row label="כתובת השרת" hint="שנה רק אם כתובת השירות השתנתה. שינוי מרענן את כל הספרייה." stack>
            <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
              <TextInput
                value={serverDraft}
                onChange={(e) => setServerDraft(e.target.value)}
                placeholder="https://zovex.duckdns.org"
                dir="ltr"
                style={{ flex: 1 }}
              />
              <Button
                variant="secondary"
                disabled={!serverDraft.trim() || serverDraft === settings.serverUrl}
                onClick={() => { patch({ serverUrl: serverDraft.trim().replace(/\/+$/, '') }); toast({ title: 'כתובת השרת עודכנה', tone: 'success' }); }}
              >
                שמור
              </Button>
              <Button variant="ghost" icon={<Activity size={15} />} onClick={() => void testServer()} loading={pinging}>בדוק</Button>
            </div>
          </Row>

          <Row
            label="מטמון הספרייה"
            hint={`${formatBytes(cacheSize)} · ${model.all.length.toLocaleString('he-IL')} פריטים${fetchedAt ? ` · עודכן ${timeAgo(fetchedAt)}` : ''}`}
          >
            <Button variant="secondary" size="sm" onClick={() => void refresh(true)} loading={refreshing}>רענן עכשיו</Button>
            <Button
              variant="quiet-danger"
              size="sm"
              icon={<Trash2 size={14} />}
              onClick={async () => {
                await window.zovex.catalog.clearCache();
                setCacheSize(0);
                await refresh(true);
                toast({ title: 'המטמון נוקה והספרייה נטענה מחדש', tone: 'success' });
              }}
            >
              נקה מטמון
            </Button>
          </Row>

          <Row
            label="Google Client ID"
            hint="מזהה ציבורי של לקוח Desktop ב-Google Cloud. נדרש רק להתחברות עם Google."
            stack
          >
            <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
              <TextInput value={clientDraft} onChange={(e) => setClientDraft(e.target.value)} dir="ltr" style={{ flex: 1 }} />
              <Button
                variant="secondary"
                disabled={clientDraft === settings.googleClientId}
                onClick={() => { patch({ googleClientId: clientDraft.trim() }); toast({ title: 'Client ID עודכן', tone: 'success' }); }}
              >
                שמור
              </Button>
            </div>
          </Row>

          <Row
            label="Google Client Secret"
            hint="גוגל דורשת אותו גם בלקוח Desktop, אחרת ההתחברות נדחית. נשמר רק במחשב הזה, בקובץ ההגדרות שלך — הוא לא נכלל בקוד ולא בקובץ ההתקנה."
            stack
          >
            <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
              <TextInput
                type="password"
                value={secretDraft}
                onChange={(e) => setSecretDraft(e.target.value)}
                placeholder={settings.googleClientSecret ? '•••••••••• (שמור)' : 'GOCSPX-…'}
                dir="ltr"
                style={{ flex: 1 }}
              />
              <Button
                variant="secondary"
                disabled={secretDraft === settings.googleClientSecret}
                onClick={() => { patch({ googleClientSecret: secretDraft.trim() }); toast({ title: 'Client Secret נשמר במחשב הזה', tone: 'success' }); }}
              >
                שמור
              </Button>
            </div>
          </Row>
        </Group>

        {/* ── Application ─────────────────────────────────────────── */}
        <Group icon={<MonitorCog size={18} />} title="אפליקציה">
          <Row label="הפעל עם הדלקת המחשב">
            <Switch label="הפעלה עם Windows" checked={settings.launchOnStartup} onChange={(v) => patch({ launchOnStartup: v })} />
          </Row>
          <Row label="סגירה ממזערת לאזור ההודעות" hint="לחיצה על X תשאיר את האפליקציה פעילה ליד השעון.">
            <Switch label="מזעור למגש" checked={settings.minimizeToTray} onChange={(v) => patch({ minimizeToTray: v })} />
          </Row>
          <Row label="הצג מסך פתיחה">
            <Switch label="מסך פתיחה" checked={settings.showSplash} onChange={(v) => patch({ showSplash: v })} />
          </Row>
          <Row label="האצת חומרה" hint="כבה רק אם יש בעיות תצוגה או ניגון. דורש הפעלה מחדש.">
            <Switch
              label="האצת חומרה"
              checked={settings.hardwareAcceleration}
              onChange={(v) => { patch({ hardwareAcceleration: v }); toast({ title: 'השינוי ייכנס לתוקף בהפעלה הבאה', tone: 'warning' }); }}
            />
          </Row>
          <Row label="הפעל מחדש את האפליקציה">
            <Button variant="secondary" size="sm" onClick={() => void window.zovex.app.relaunch()}>הפעל מחדש</Button>
          </Row>
          <Row label="איפוס הגדרות" hint="מחזיר את כל ההגדרות לברירת המחדל. מועדפים והיסטוריה נשמרים.">
            <Button variant="quiet-danger" size="sm" onClick={() => setConfirmReset(true)}>אפס</Button>
          </Row>
        </Group>

        {/* ── Shortcuts ───────────────────────────────────────────── */}
        <Group icon={<Keyboard size={18} />} title="קיצורי מקלדת">
          <div style={{ padding: 'var(--s-4) var(--s-5)' }}>
            <table className="kbd-table">
              <tbody>
                {[
                  ['חיפוש מהיר', 'Ctrl + K'],
                  ['הגדרות', 'Ctrl + ,'],
                  ['כווץ/הרחב תפריט', 'Ctrl + B'],
                  ['רענון', 'F5'],
                  ['נגן / השהה', 'רווח או K'],
                  ['דילוג קדימה / אחורה', '← →'],
                  ['דילוג 30 שניות', 'J / L'],
                  ['עוצמת שמע', '↑ ↓'],
                  ['השתקה', 'M'],
                  ['מסך מלא', 'F'],
                  ['הפרק הבא', 'N'],
                  ['יציאה מהנגן', 'Esc'],
                ].map(([what, keys]) => (
                  <tr key={what}><td>{what}</td><td><kbd>{keys}</kbd></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Group>

        {/* ── About ───────────────────────────────────────────────── */}
        <Group icon={<Info size={18} />} title="אודות">
          <Row label="ZOVEX Desktop" hint={info ? `גרסה ${info.version} · Electron ${info.electron} · Chromium ${info.chrome}` : 'טוען…'} />
          {serverVersion && <Row label="גרסת אפליקציית האנדרואיד בשרת" hint={`${serverVersion} — מספר הגרסה של אפליקציית הטלפון, לא של גרסת המחשב`} />}
          <Row label="תיקיית נתוני המשתמש" hint={info?.userData}>
            <Button variant="ghost" size="sm" icon={<Database size={14} />} onClick={() => void window.zovex.app.openUserData()}>פתח</Button>
          </Row>
        </Group>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="לאפס את כל ההגדרות?"
        message="כל ההגדרות יחזרו לברירת המחדל. המועדפים, ההיסטוריה והחשבון לא ימחקו."
        confirmLabel="אפס"
        destructive
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => { void resetSettings(); setConfirmReset(false); toast({ title: 'ההגדרות אופסו', tone: 'success' }); }}
      />
    </div>
  );
}
