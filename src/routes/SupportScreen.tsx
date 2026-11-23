import { useEffect, useState } from 'react';
import { ExternalLink, LifeBuoy, Send } from 'lucide-react';
import { useApp } from '@/store/app';
import { Button, Segmented, TextArea } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/feedback';
import { PageHeader } from './parts';
import { SignInGate, useSignIn } from '@/components/shell/SignInGate';
import './settings.css';

type Kind = 'support' | 'bug' | 'suggestion';

const KINDS: { value: Kind; label: string }[] = [
  { value: 'support', label: 'תמיכה' },
  { value: 'bug', label: 'דיווח על תקלה' },
  { value: 'suggestion', label: 'הצעה לשיפור' },
];

export default function SupportScreen() {
  const auth = useApp((s) => s.auth);
  const userId = useApp((s) => s.userId);
  const toast = useApp((s) => s.toast);

  const { signedIn } = useSignIn();
  const [kind, setKind] = useState<Kind>('support');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<unknown[] | null>(null);

  useEffect(() => {
    if (!signedIn) { setMessages([]); return; }
    void window.zovex.server.myFeedback().then((r) => setMessages(r.messages)).catch(() => setMessages([]));
  }, [signedIn]);

  const send = async () => {
    if (text.trim().length < 5) {
      toast({ title: 'כתוב קצת יותר', description: 'תאר את הבעיה או הבקשה במשפט אחד לפחות.', tone: 'warning' });
      return;
    }
    setSending(true);
    const ok = await window.zovex.server.sendFeedback({
      name: auth.profile?.name ?? '',
      email: auth.profile?.email ?? '',
      text: text.trim(),
      kind,
    });
    setSending(false);
    if (ok) {
      setText('');
      toast({ title: 'ההודעה נשלחה', description: 'נחזור אליך דרך האפליקציה או במייל.', tone: 'success' });
      void window.zovex.server.myFeedback().then((r) => setMessages(r.messages));
    } else {
      toast({ title: 'השליחה נכשלה', description: 'לא הצלחנו להגיע לשרת. נסה שוב בעוד רגע.', tone: 'danger' });
    }
  };

  if (!signedIn) {
    return (
      <div className="page page-enter">
        <PageHeader title="תמיכה" />
        <SignInGate
          title="התחבר כדי לפנות לתמיכה"
          text="פנייה נשלחת מחשבון מזוהה, כדי שנדע למי לחזור וכדי שלא יהיה אפשר להציף את התיבה בהודעות אנונימיות."
        />
      </div>
    );
  }

  return (
    <div className="page page-enter">
      <PageHeader title="תמיכה" subtitle="שאלות, תקלות והצעות — נשלח ישירות לשרת ZOVEX" />

      <div className="settings">
        <section className="sgroup">
          <header className="sgroup__head">
            <span className="sgroup__icon"><LifeBuoy size={18} /></span>
            <div>
              <div className="sgroup__title">שלח הודעה</div>
              <div className="sgroup__desc">ההודעה נשלחת מהחשבון שלך כדי שנוכל לחזור אליך ולאתר את הבעיה</div>
            </div>
          </header>

          <div className="srow srow--stack">
            <Segmented options={KINDS} value={kind} onChange={setKind} ariaLabel="סוג הפנייה" />
          </div>

          <div className="srow">
            <div className="srow__text">
              <div className="srow__label">נשלח מהחשבון {auth.profile?.name || auth.profile?.email}</div>
              <div className="srow__hint">נחזור אליך לכתובת {auth.profile?.email}</div>
            </div>
          </div>

          <div className="srow srow--stack">
            <TextArea
              label="ההודעה"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder={
                kind === 'bug'
                  ? 'מה ניסית לעשות, מה קרה בפועל ובאיזה סרט או ערוץ זה קרה?'
                  : kind === 'suggestion'
                    ? 'מה היית רוצה שיתווסף או ישתנה?'
                    : 'איך אפשר לעזור?'
              }
              hint={`נשלח עם המזהה ${userId}`}
            />
          </div>

          <div className="srow">
            <div className="srow__text">
              <div className="srow__hint">בלחיצה על שליחה ההודעה נשלחת לשרת ZOVEX בלבד.</div>
            </div>
            <div className="srow__control">
              <Button variant="primary" icon={<Send size={15} />} onClick={() => void send()} loading={sending}>
                שלח
              </Button>
            </div>
          </div>
        </section>

        <section className="sgroup">
          <header className="sgroup__head">
            <span className="sgroup__icon"><LifeBuoy size={18} /></span>
            <div>
              <div className="sgroup__title">הפניות שלי</div>
              <div className="sgroup__desc">הודעות ששלחת מהמזהה הזה</div>
            </div>
          </header>
          {messages === null ? (
            <div className="srow"><div className="srow__hint">טוען מהשרת…</div></div>
          ) : messages.length === 0 ? (
            <EmptyState title="אין פניות קודמות" text="כשתשלח הודעה, היא תופיע כאן יחד עם התשובה." />
          ) : (
            <ul>
              {messages.map((m, i) => {
                const row = m as Record<string, unknown>;
                return (
                  <li key={i} className="srow">
                    <div className="srow__text">
                      <div className="srow__label" data-selectable>{String(row.text ?? row.message ?? '')}</div>
                      {Boolean(row.reply) && <div className="srow__hint">תשובה: {String(row.reply)}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="sgroup">
          <header className="sgroup__head">
            <span className="sgroup__icon"><ExternalLink size={18} /></span>
            <div><div className="sgroup__title">קישורים</div></div>
          </header>
          <div className="srow">
            <div className="srow__text">
              <div className="srow__label">אתר ZOVEX</div>
              <div className="srow__hint">אותה ספרייה, בדפדפן</div>
            </div>
            <div className="srow__control">
              <Button variant="secondary" size="sm" onClick={() => void window.zovex.app.openExternal('https://zovex.duckdns.org')}>
                פתח
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
