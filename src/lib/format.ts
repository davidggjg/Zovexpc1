/** Formatting helpers. Hebrew-first, all pure. */

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatRuntimeHe(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h} שע׳ ${m} דק׳`;
  if (h) return `${h} שע׳`;
  return `${m} דק׳`;
}

export function formatBytes(n: number): string {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function formatCount(n: number): string {
  return n.toLocaleString('he-IL');
}

const RELATIVE = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });

export function timeAgo(iso: string | number | null | undefined): string {
  if (!iso) return '';
  const then = typeof iso === 'number' ? iso : Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const diff = (then - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'ממש עכשיו';
  if (abs < 3600) return RELATIVE.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return RELATIVE.format(Math.round(diff / 3600), 'hour');
  if (abs < 2592000) return RELATIVE.format(Math.round(diff / 86400), 'day');
  if (abs < 31536000) return RELATIVE.format(Math.round(diff / 2592000), 'month');
  return RELATIVE.format(Math.round(diff / 31536000), 'year');
}

export function formatDate(iso: string | number | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatClock(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Normalises Hebrew and Latin text for searching: strips niqqud, geresh
 * variants and punctuation so "ג'ון" matches "גון" and "The Office" matches
 * "the office".
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '')      // Hebrew points & cantillation
    .replace(/[̀-ͯ]/g, '')      // Latin combining marks
    .replace(/["'’`״׳.,:!?()[\]{}\-–—_/\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pluralHe(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}
