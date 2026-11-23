import { forwardRef, useId, useState } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';
import './ui.css';

/* ── Button ─────────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet-danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  iconEnd?: ReactNode;
  block?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconEnd, block, loading, children, className, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={clsx('btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner size={size === 'lg' ? 16 : 13} /> : icon}
      {children}
      {iconEnd}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', active, children, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={clsx('icon-btn', size !== 'md' && `icon-btn--${size}`, active && 'icon-btn--active', className)}
      {...rest}
    >
      {children}
    </button>
  );
});

/* ── Spinner / Skeleton / Progress ──────────────────────────────────────── */

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="טוען" />;
}

export function Skeleton({ width, height, radius, className, style }: {
  width?: number | string; height?: number | string; radius?: number | string;
  className?: string; style?: React.CSSProperties;
}) {
  return <div className={clsx('skeleton', className)} style={{ width, height, borderRadius: radius, ...style }} aria-hidden />;
}

export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div className={clsx('progress-track', className)} role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  );
}

/* ── Badge / Chip ───────────────────────────────────────────────────────── */

export function Badge({ children, tone = 'neutral', className }: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'live';
  className?: string;
}) {
  return <span className={clsx('badge', tone !== 'neutral' && `badge--${tone}`, className)}>{children}</span>;
}

export function Chip({ active, count, children, onClick, title }: {
  active?: boolean; count?: number; children: ReactNode; onClick?: () => void; title?: string;
}) {
  return (
    <button type="button" className="chip" data-active={Boolean(active)} onClick={onClick} title={title}>
      <span className="truncate">{children}</span>
      {count !== undefined && <span className="chip__count">{count.toLocaleString('he-IL')}</span>}
    </button>
  );
}

/* ── Segmented control ──────────────────────────────────────────────────── */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: {
  options: SegmentOption<T>[]; value: T; onChange: (v: T) => void; ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={opt.value === value}
          data-active={opt.value === value}
          className="segmented__item"
          onClick={() => onChange(opt.value)}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── Fields ─────────────────────────────────────────────────────────────── */

interface FieldShellProps {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}

export function Field({ label, hint, error, children, htmlFor }: FieldShellProps) {
  return (
    <div className="field">
      {label && <label className="field__label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  inputSize?: 'md' | 'lg';
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, hint, error, icon, trailing, inputSize = 'md', className, ...rest },
  ref,
) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className={clsx('input-wrap', inputSize === 'lg' && 'input-wrap--lg', className)}>
        {icon && <span className="input-wrap__icon">{icon}</span>}
        <input ref={ref} id={id} className="input" {...rest} />
        {trailing}
      </div>
    </Field>
  );
});

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, className, rows = 5, ...rest },
  ref,
) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className={clsx('input-wrap input-wrap--area', className)}>
        <textarea ref={ref} id={id} rows={rows} className="input" {...rest} />
      </div>
    </Field>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, className, children, ...rest },
  ref,
) {
  const id = useId();
  const select = <select ref={ref} id={id} className={clsx('select', className)} {...rest}>{children}</select>;
  return label || hint ? <Field label={label} hint={hint} htmlFor={id}>{select}</Field> : select;
});

export function Switch({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-on={checked}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

export function Slider({ value, min = 0, max = 100, step = 1, onChange, ariaLabel, className }: {
  value: number; min?: number; max?: number; step?: number;
  onChange: (v: number) => void; ariaLabel: string; className?: string;
}) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      className={clsx('slider', className)}
      style={{ ['--fill' as string]: `${fill}%` }}
      value={value}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

/* ── Tooltip ────────────────────────────────────────────────────────────── */

export function Tooltip({ label, shortcut, placement = 'top', children }: {
  label: string; shortcut?: string; placement?: 'top' | 'bottom'; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="tip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span className={clsx('tip__bubble', placement === 'bottom' && 'tip__bubble--bottom')} role="tooltip">
          {label}
          {shortcut && <kbd className="tip__kbd">{shortcut}</kbd>}
        </span>
      )}
    </span>
  );
}
