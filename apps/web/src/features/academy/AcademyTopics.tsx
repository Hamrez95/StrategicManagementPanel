import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { Symbol as CourseSymbol } from './CourseHero';
import type { Motif } from './CourseHero';
import type { Catalog } from './connectedData';
import { faNumber } from './connectedData';

type Topic = Catalog['paths'][number];
const artwork: Record<string, { motif: Motif; color: string; motion: string }> = {
  GENERAL: { motif: 'ledger', color: '#5f9fea', motion: 'page' },
  S01: { motif: 'compass', color: '#ac8aef', motion: 'turn' },
  S02: { motif: 'finance', color: '#46b5a0', motion: 'rise' },
  S03: { motif: 'market', color: '#ed9a65', motion: 'turn' },
  S04: { motif: 'team', color: '#e78ea8', motion: 'wave' },
  S05: { motif: 'flow', color: '#61bbd2', motion: 'turn' },
  S06: { motif: 'idea', color: '#d7ad50', motion: 'glow' },
  S07: { motif: 'network', color: '#8e9ef3', motion: 'glow' },
  ELECTIVES: { motif: 'globe', color: '#80b7a0', motion: 'turn' },
  PREPARATION: { motif: 'rocket', color: '#e3a17d', motion: 'rise' },
};
function Arrow({ next = false }: { next?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d={next ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'} />
    </svg>
  );
}
export function AcademyTopics({
  paths,
  selected,
  onSelect,
}: {
  paths: Topic[];
  selected: string;
  onSelect: (topic: Topic) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ previous: false, next: false });
  function measure() {
    const element = rail.current;
    if (!element) return;
    // In RTL browsers scrollLeft is zero at the start and negative towards the end.
    const offset = Math.abs(element.scrollLeft);
    setEdges({
      previous: offset > 3,
      next: offset + element.clientWidth < element.scrollWidth - 3,
    });
  }
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener('scroll', measure, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', measure);
    };
  }, []);
  useEffect(() => {
    const element = rail.current;
    const active = element?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!element || !active) return;
    const outer = element.getBoundingClientRect(),
      inner = active.getBoundingClientRect();
    if (inner.left < outer.left || inner.right > outer.right) {
      element.scrollBy({
        left: inner.left + inner.width / 2 - outer.left - outer.width / 2,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    }
  }, [selected]);
  function move(next: boolean) {
    rail.current?.scrollBy({
      left: (next ? -1 : 1) * rail.current.clientWidth * 0.7,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }
  return (
    <div className="topic-browser">
      <div className="topic-browser-heading">
        <h2>چه چیزی یاد بگیریم؟</h2>
        <div className="topic-browser-actions">
          <Link to="/academy/catalog">همهٔ حوزه‌ها</Link>
          <button
            type="button"
            aria-label="حوزه‌های قبلی"
            disabled={!edges.previous}
            onClick={() => move(false)}
          >
            <Arrow />
          </button>
          <button
            type="button"
            aria-label="حوزه‌های بعدی"
            disabled={!edges.next}
            onClick={() => move(true)}
          >
            <Arrow next />
          </button>
        </div>
      </div>
      <div className="topic-browser-window" data-previous={edges.previous} data-next={edges.next}>
        <div
          className="topic-browser-rail"
          ref={rail}
          role="group"
          aria-label="انتخاب حوزهٔ یادگیری"
        >
          {paths.map((item) => {
            const art = artwork[item.id] ?? artwork.GENERAL;
            return (
              <button
                type="button"
                key={item.id}
                className={`topic-tile${item.access && !item.access.hasAccess ? ' topic-tile--locked' : ''}`}
                aria-pressed={selected === item.id}
                style={{ '--topic-color': art.color } as CSSProperties}
                data-motion={art.motion}
                onClick={() => onSelect(item)}
              >
                <span className="topic-tile-art" aria-hidden="true">
                  <svg
                    viewBox="0 0 100 100"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <CourseSymbol motif={art.motif} />
                  </svg>
                </span>
                <span className="topic-tile-copy">
                  <span className="topic-tile-title">{item.title}</span>
                  <span className="topic-tile-meta">
                    {faNumber(item.course_ids.length)} مجموعهٔ آموزشی
                    {item.access && !item.access.hasAccess ? ' · قفل' : ''}
                  </span>
                </span>
                <span className="topic-tile-selection" aria-hidden="true">
                  ✓
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
