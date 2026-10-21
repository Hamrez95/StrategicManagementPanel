import type { CSSProperties } from 'react';
import type { Course } from './connectedData';
import { faNumber } from './connectedData';

type Motif =
  | 'compass'
  | 'ledger'
  | 'finance'
  | 'market'
  | 'team'
  | 'flow'
  | 'data'
  | 'talk'
  | 'shield'
  | 'idea'
  | 'rocket'
  | 'network'
  | 'globe'
  | 'leaf';
type Palette = 'ocean' | 'violet' | 'copper' | 'berry' | 'teal';
// Editorial artwork mapping only; teaching content and stage colours keep their source IDs.
const themes: Record<string, [Motif, Motif, Palette]> = {
  C01: ['ledger', 'finance', 'ocean'],
  C02: ['market', 'data', 'copper'],
  C03: ['finance', 'data', 'teal'],
  C04: ['market', 'talk', 'berry'],
  C05: ['team', 'idea', 'violet'],
  C06: ['flow', 'network', 'ocean'],
  C07: ['compass', 'globe', 'violet'],
  C08: ['data', 'compass', 'ocean'],
  C09: ['talk', 'team', 'copper'],
  C10: ['shield', 'globe', 'teal'],
  E01: ['talk', 'network', 'violet'],
  E02: ['network', 'flow', 'ocean'],
  E03: ['market', 'rocket', 'copper'],
  E04: ['globe', 'team', 'violet'],
  E05: ['leaf', 'shield', 'teal'],
  P00: ['rocket', 'idea', 'copper'],
  'S01-C1': ['compass', 'shield', 'ocean'],
  'S01-C2': ['globe', 'compass', 'violet'],
  'S01-C3': ['idea', 'network', 'berry'],
  'S01-C4': ['flow', 'compass', 'copper'],
  'S02-C1': ['ledger', 'data', 'teal'],
  'S02-C2': ['finance', 'globe', 'violet'],
  'S02-C3': ['shield', 'finance', 'ocean'],
  'S02-C4': ['network', 'finance', 'teal'],
  'S03-C1': ['market', 'data', 'berry'],
  'S03-C2': ['idea', 'market', 'copper'],
  'S03-C3': ['network', 'market', 'ocean'],
  'S03-C4': ['rocket', 'data', 'berry'],
  'S04-C1': ['team', 'flow', 'violet'],
  'S04-C2': ['idea', 'team', 'ocean'],
  'S04-C3': ['team', 'finance', 'copper'],
  'S04-C4': ['compass', 'team', 'berry'],
  'S05-C1': ['flow', 'data', 'teal'],
  'S05-C2': ['data', 'ledger', 'ocean'],
  'S05-C3': ['globe', 'flow', 'copper'],
  'S05-C4': ['shield', 'leaf', 'teal'],
  'S06-C1': ['idea', 'compass', 'copper'],
  'S06-C2': ['ledger', 'idea', 'berry'],
  'S06-C3': ['team', 'rocket', 'teal'],
  'S06-C4': ['rocket', 'network', 'violet'],
  'S07-C1': ['network', 'data', 'violet'],
  'S07-C2': ['data', 'idea', 'teal'],
  'S07-C3': ['flow', 'team', 'ocean'],
  'S07-C4': ['shield', 'network', 'berry'],
};
const colours: Record<Palette, [string, string, string]> = {
  ocean: ['#248bb8', '#8bd4ee', '#0c5073'],
  violet: ['#8764c7', '#d6bcf6', '#57398d'],
  copper: ['#b87938', '#f3cf91', '#795025'],
  berry: ['#b25e86', '#f0bad2', '#853f61'],
  teal: ['#278d85', '#9cddd0', '#1a5f5a'],
};
function Symbol({ motif }: { motif: Motif }) {
  switch (motif) {
    case 'compass':
      return (
        <>
          <circle cx="50" cy="50" r="37" />
          <path d="m50 4 5 12M96 50l-12 5M50 96l-5-12M4 50l12-5M65 29 56 57 29 70l11-28Z" />
          <path className="course-art-fill" d="m65 29-9 28-16-15Z" />
        </>
      );
    case 'ledger':
      return (
        <>
          <rect x="17" y="10" width="65" height="81" rx="9" />
          <path d="M31 30h37M31 44h37M31 58h13m-13 14h13M53 56v23m13-23v23M22 8v9m12-9v9M12 34h10M12 51h10M12 68h10" />
        </>
      );
    case 'finance':
      return (
        <>
          <path d="M13 82V53h17v29m10 0V34h17v48m10 0V15h17v67M8 89h84" />
          <path className="course-art-fill" d="M42 36h13v45H42Z" />
          <path d="m13 33 26-13 16 4L84 7m-12 0h12v12" />
        </>
      );
    case 'market':
      return (
        <>
          <circle cx="45" cy="53" r="33" />
          <circle cx="45" cy="53" r="20" />
          <circle className="course-art-fill" cx="45" cy="53" r="6" />
          <path d="m45 53 39-39m-1 0-1 15 14-2M81 15l-1-12m3 11 13 1" />
        </>
      );
    case 'team':
      return (
        <>
          <circle cx="50" cy="27" r="13" />
          <circle cx="19" cy="49" r="10" />
          <circle cx="81" cy="49" r="10" />
          <path d="M28 87V71a22 22 0 0 1 44 0v16ZM4 85V73a15 15 0 0 1 21-14m71 26V73a15 15 0 0 0-21-14" />
          <path className="course-art-fill" d="M36 78h28v8H36Z" />
        </>
      );
    case 'flow':
      return (
        <>
          <rect x="8" y="12" width="31" height="26" rx="7" />
          <rect x="61" y="61" width="31" height="26" rx="7" />
          <path d="M39 25h28a12 12 0 0 1 12 12v24m-8-8 8 8 8-8M61 74H33a12 12 0 0 1-12-12V38m-8 8 8-8 8 8" />
          <circle className="course-art-fill" cx="23" cy="25" r="5" />
        </>
      );
    case 'data':
      return (
        <>
          <path d="M13 10v78h78M24 72l17-24 18 9 25-35" />
          <circle className="course-art-fill" cx="41" cy="48" r="5" />
          <circle cx="59" cy="57" r="5" />
          <circle cx="84" cy="22" r="5" />
          <path d="M24 34V21m14 4V12m19 20V16" />
        </>
      );
    case 'talk':
      return (
        <>
          <path d="M8 16h58v39H36L21 70V55H8ZM44 65h20l15 14V65h13V35H77" />
          <path d="M20 30h32M20 41h21" />
          <circle className="course-art-fill" cx="83" cy="85" r="6" />
        </>
      );
    case 'shield':
      return (
        <>
          <path d="M50 7 84 21v27c0 21-16 34-34 45C32 82 16 69 16 48V21Z" />
          <path d="m32 47 13 13 24-27" />
          <path className="course-art-fill" d="M28 26 48 18v7l-13 6v14h-7Z" />
        </>
      );
    case 'idea':
      return (
        <>
          <path d="M33 66c0-17-13-18-13-35a30 30 0 0 1 60 0c0 17-13 18-13 35Zm0 10h34m-30 9h26m-21 8h16M50 1v-8M7 17 0 12m92 5 8-5M7 45l-9 3m94-3 9 3" />
          <path d="M50 65V42m-9-8 9 9 9-9" />
        </>
      );
    case 'rocket':
      return (
        <>
          <path d="M33 66C31 36 53 12 86 8c-1 31-22 57-52 59ZM34 43 16 48 8 69l25-4m23 0-3 22-23 7 6-26M26 76 10 92m9-21L4 84" />
          <circle className="course-art-fill" cx="65" cy="29" r="9" />
        </>
      );
    case 'network':
      return (
        <>
          <path d="m20 20 30 30 30-30M20 80l30-30 30 30M50 8v28M8 50h28m28 0h28M50 64v28" />
          <rect className="course-art-fill" x="35" y="35" width="30" height="30" rx="8" />
          {[
            [20, 20],
            [80, 20],
            [20, 80],
            [80, 80],
          ].map(([cx, cy], i) => (
            <circle cx={cx} cy={cy} r="9" key={i} />
          ))}
        </>
      );
    case 'globe':
      return (
        <>
          <circle cx="50" cy="50" r="39" />
          <ellipse cx="50" cy="50" rx="17" ry="39" />
          <path d="M12 50h76M20 25c18 12 42 12 60 0M20 75c18-12 42-12 60 0" />
          <circle className="course-art-fill" cx="81" cy="30" r="7" />
        </>
      );
    case 'leaf':
      return (
        <>
          <path d="M18 79C-4 28 48 9 88 12c7 49-23 77-70 67Zm1-1 48-45M36 61V39m0 22h24M50 47V28m0 19h23M18 78l-7 14" />
        </>
      );
  }
}
export function CourseHero({
  course,
  pathTitle,
  lessons,
}: {
  course: Course;
  pathTitle: string;
  lessons: number;
}) {
  const [motif, secondary, palette] = themes[course.id] ?? ['compass', 'idea', 'ocean'];
  const [accent, soft, edge] = colours[palette];
  const seed = [...course.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (
    <div
      className="course-hero"
      data-course={course.id}
      data-palette={palette}
      style={
        {
          '--course-accent': accent,
          '--course-soft': soft,
          '--course-edge': edge,
          '--art-delay': `${-(seed % 7)}s`,
        } as CSSProperties
      }
    >
      <div className="course-hero-copy">
        <p className="course-hero-domain">{pathTitle}</p>
        <h1 tabIndex={-1}>{course.title}</h1>
        <p className="course-hero-count">
          {faNumber(lessons)} درس‌نامه <span aria-hidden="true">·</span>{' '}
          {faNumber(course.stages.length)} مرحله
        </p>
      </div>
      <svg className="course-art" viewBox="0 0 300 215" fill="none" aria-hidden="true">
        <ellipse className="course-art-shadow" cx="155" cy="184" rx="80" ry="12" />
        <ellipse
          className="course-art-orbit"
          cx="155"
          cy="105"
          rx="132"
          ry="69"
          transform={`rotate(${seed % 2 ? -18 : 18} 155 105)`}
        />
        <g className="course-art-main">
          <rect
            className="course-art-tile-edge"
            x="87"
            y="39"
            width="137"
            height="139"
            rx="32"
            transform="rotate(-8 155 108)"
          />
          <rect
            className="course-art-tile"
            x="85"
            y="30"
            width="137"
            height="139"
            rx="32"
            transform="rotate(-8 155 100)"
          />
          <g transform="translate(105 47) scale(1.05)" className="course-art-symbol">
            <Symbol motif={motif} />
          </g>
        </g>
        <g className="course-art-satellite">
          <rect
            className="course-art-mini"
            x="21"
            y="111"
            width="62"
            height="62"
            rx="18"
            transform="rotate(12 52 142)"
          />
          <g transform="translate(30 119) scale(.44)" className="course-art-symbol">
            <Symbol motif={secondary} />
          </g>
        </g>
        <g className="course-art-sparks">
          <path d="m244 31 3 10 10 3-10 3-3 10-3-10-10-3 10-3Z" />
          <circle cx="59" cy="49" r="5" />
          <circle cx="258" cy="144" r="4" />
          <path d="M244 174h14m-7-7v14" />
        </g>
      </svg>
    </div>
  );
}
