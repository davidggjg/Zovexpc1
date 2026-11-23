import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, SearchX, WifiOff, X, XCircle } from 'lucide-react';
import { Button, IconButton } from './primitives';
import { useApp } from '@/store/app';
import './ui.css';

/* ── Modal ──────────────────────────────────────────────────────────────── */

export function Modal({ open, onClose, title, children, footer, size = 'md', closeOnScrim = true }: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  closeOnScrim?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && panelRef.current) {
        // Keep focus inside the dialog — a desktop app should never let Tab
        // wander onto the page behind a modal.
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();
    }, 40);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      window.clearTimeout(timer);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="scrim" onMouseDown={(e) => { if (closeOnScrim && e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} className={clsx('modal', size !== 'md' && `modal--${size}`)} role="dialog" aria-modal="true">
        {title && (
          <header className="modal__head">
            <h2 className="modal__title">{title}</h2>
            <IconButton label="סגור" onClick={onClose}><X size={17} /></IconButton>
          </header>
        )}
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'אישור', cancelLabel = 'ביטול', destructive, onConfirm, onCancel, busy }: {
  open: boolean; title: string; message: ReactNode;
  confirmLabel?: string; cancelLabel?: string; destructive?: boolean;
  onConfirm: () => void; onCancel: () => void; busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
        </>
      }
    >
      <p style={{ color: 'var(--text-secondary)', lineHeight: 'var(--lh-normal)' }}>{message}</p>
    </Modal>
  );
}

/* ── Toasts ─────────────────────────────────────────────────────────────── */

const TOAST_ICON = {
  default: <Info size={17} />,
  success: <CheckCircle2 size={17} />,
  warning: <AlertTriangle size={17} />,
  danger: <XCircle size={17} />,
};

export function ToastLayer() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  if (!toasts.length) return null;
  return createPortal(
    <div className="toast-layer">
      {toasts.map((t) => (
        <div key={t.id} className={clsx('toast', `toast--${t.tone}`)} role="status">
          <span className="toast__icon">{TOAST_ICON[t.tone]}</span>
          <div className="toast__body">
            <div className="toast__title">{t.title}</div>
            {t.description && <div className="toast__desc">{t.description}</div>}
          </div>
          {t.action && (
            <Button size="sm" variant="ghost" onClick={() => { t.action?.run(); dismiss(t.id); }}>
              {t.action.label}
            </Button>
          )}
          <IconButton label="סגור" size="sm" onClick={() => dismiss(t.id)}><X size={14} /></IconButton>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/* ── Empty / error states ───────────────────────────────────────────────── */

export function EmptyState({ icon, title, text, action }: {
  icon?: ReactNode; title: string; text?: string; action?: ReactNode;
}) {
  return (
    <div className="state">
      <div className="state__icon">{icon ?? <SearchX size={26} />}</div>
      <h3 className="state__title">{title}</h3>
      {text && <p className="state__text">{text}</p>}
      {action && <div className="state__actions">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, text, detail, onRetry, retrying, extra }: {
  title?: string; text?: string; detail?: string;
  onRetry?: () => void; retrying?: boolean; extra?: ReactNode;
}) {
  return (
    <div className="state">
      <div className="state__icon state__icon--danger"><WifiOff size={26} /></div>
      <h3 className="state__title">{title ?? 'אין חיבור לשרת ZOVEX'}</h3>
      <p className="state__text">
        {text ?? 'לא הצלחנו להגיע לשרת כדי לטעון את הספרייה. בדוק את חיבור האינטרנט ונסה שוב — אם הבעיה נמשכת, ייתכן שהשרת אינו זמין כרגע.'}
      </p>
      {detail && <code className="state__detail" data-selectable>{detail}</code>}
      <div className="state__actions">
        {onRetry && <Button variant="primary" onClick={onRetry} loading={retrying}>נסה שוב</Button>}
        {extra}
      </div>
    </div>
  );
}

/** Wraps a render tree so one broken screen cannot blank the whole window. */
export function useAsyncRetry(fn: () => Promise<unknown>): [() => void, boolean] {
  const busy = useRef(false);
  const run = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    void fn().finally(() => { busy.current = false; });
  }, [fn]);
  return [run, busy.current];
}
