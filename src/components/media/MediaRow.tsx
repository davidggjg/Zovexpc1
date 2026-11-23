import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PosterSkeleton } from './PosterCard';
import './media.css';

const CARD_WIDTH = { comfortable: 164, compact: 132, large: 204 };

/**
 * Horizontal shelf with mouse-friendly paging arrows. Arrows only appear when
 * there is somewhere to scroll, and they page by whole screens, not pixels.
 */
export function MediaRow({ title, count, moreTo, moreLabel = 'הצג הכל', children, loading, wide, size = 'comfortable' }: {
  title: string;
  count?: number;
  moreTo?: string;
  moreLabel?: string;
  children?: ReactNode;
  loading?: boolean;
  wide?: boolean;
  size?: keyof typeof CARD_WIDTH;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // RTL reports negative scrollLeft in Chromium; compare on absolute values.
    const pos = Math.abs(el.scrollLeft);
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: pos > 8, end: pos < max - 8 });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const step = Math.max(el.clientWidth - 120, 240);
    el.scrollBy({ left: dir * step * (document.dir === 'rtl' ? -1 : 1), behavior: 'smooth' });
  };

  const width = CARD_WIDTH[size] * (wide ? 1.6 : 1);

  return (
    <section className="row">
      <header className="row__head">
        <h2 className="row__title">{title}</h2>
        {count !== undefined && <span className="row__count">{count.toLocaleString('he-IL')}</span>}
        {moreTo && (
          <Link className="row__more" to={moreTo}>
            {moreLabel}
            <ChevronLeft size={14} />
          </Link>
        )}
      </header>

      <button type="button" className="row__nav row__nav--start" data-can={edges.start} aria-label="הקודם" onClick={() => page(-1)}>
        <ChevronRight size={20} />
      </button>
      <button type="button" className="row__nav row__nav--end" data-can={edges.end} aria-label="הבא" onClick={() => page(1)}>
        <ChevronLeft size={20} />
      </button>

      <div className="row__viewport" ref={ref} onScroll={measure}>
        {loading
          ? Array.from({ length: 10 }, (_, i) => (
              <div className="row__item" key={i} style={{ width }}><PosterSkeleton wide={wide} /></div>
            ))
          : children}
      </div>
    </section>
  );
}

export function RowItem({ children, wide, size = 'comfortable' }: { children: ReactNode; wide?: boolean; size?: keyof typeof CARD_WIDTH }) {
  return <div className="row__item" style={{ width: CARD_WIDTH[size] * (wide ? 1.6 : 1) }}>{children}</div>;
}
