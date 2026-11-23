import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { PosterSkeleton } from './PosterCard';
import './media.css';

/**
 * Renders a long list in screen-sized pages.
 *
 * A category here can hold 9,000 rows. Mounting all of them costs seconds and
 * hundreds of MB, so the grid grows as the user scrolls and resets whenever the
 * list identity changes (new filter, new sort, new category).
 */
export function MediaGrid<T>({
  items, renderItem, keyOf, size = 'comfortable', wide, pageSize = 60, header, empty, scrollRef,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  keyOf: (item: T, index: number) => string;
  size?: 'compact' | 'comfortable' | 'large';
  wide?: boolean;
  pageSize?: number;
  header?: ReactNode;
  empty?: ReactNode;
  scrollRef?: React.RefObject<HTMLDivElement>;
}) {
  const [shown, setShown] = useState(pageSize);
  const sentinel = useRef<HTMLDivElement>(null);
  const localScroll = useRef<HTMLDivElement>(null);
  const container = scrollRef ?? localScroll;

  // A different list must start from the top, not from wherever the last one
  // was scrolled to.
  const signature = useMemo(() => `${items.length}:${items.length ? keyOf(items[0], 0) : ''}`, [items, keyOf]);
  useEffect(() => {
    setShown(pageSize);
    if (container.current) container.current.scrollTop = 0;
  }, [signature, pageSize, container]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown((n) => (n >= items.length ? n : n + pageSize));
        }
      },
      { root: container.current ?? null, rootMargin: '900px 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [items.length, pageSize, container]);

  const visible = items.slice(0, shown);
  const remaining = items.length - visible.length;

  return (
    <div className="grid-scroll" ref={container}>
      {header}
      {items.length === 0 ? (
        empty
      ) : (
        <div className={clsx('grid', `grid--${size}`, wide && 'grid--wide')}>
          {visible.map((item, i) => (
            <div key={keyOf(item, i)}>{renderItem(item, i)}</div>
          ))}
          {remaining > 0 && (
            <>
              {Array.from({ length: Math.min(remaining, 6) }, (_, i) => (
                <PosterSkeleton key={`sk-${i}`} wide={wide} />
              ))}
              <div className="grid-footer" ref={sentinel}>
                עוד {remaining.toLocaleString('he-IL')} פריטים…
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
