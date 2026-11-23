import type { ReactNode } from 'react';
import { AlertTriangle, Download, Info } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import '@/components/shell/shell.css';

export function PageHeader({ title, subtitle, tools }: { title: string; subtitle?: ReactNode; tools?: ReactNode }) {
  return (
    <header className="page__head">
      <div className="page__titles">
        <h1 className="page__title">{title}</h1>
        {subtitle && <p className="page__subtitle">{subtitle}</p>}
      </div>
      {tools && <div className="page__tools">{tools}</div>}
    </header>
  );
}

export function Banner({ tone = 'info', icon, children, action }: {
  tone?: 'info' | 'warning';
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={tone === 'warning' ? 'banner banner--warning' : 'banner'}>
      <span className="banner__icon">{icon ?? (tone === 'warning' ? <AlertTriangle size={17} /> : <Info size={17} />)}</span>
      <span className="banner__text">{children}</span>
      {action}
    </div>
  );
}

/** Shown when the server advertises a newer desktop build than this one. */
export function UpdateBanner({ latest, notes, url }: { latest: string; notes?: string; url?: string }) {
  return (
    <Banner
      icon={<Download size={17} />}
      action={url ? (
        <Button size="sm" variant="primary" onClick={() => void window.zovex.app.openExternal(url)}>
          הורד עדכון
        </Button>
      ) : undefined}
    >
      <strong>גרסה {latest} זמינה.</strong>{' '}
      {notes ? notes.slice(0, 180) : 'מומלץ לעדכן כדי לקבל את השיפורים האחרונים.'}
    </Banner>
  );
}
