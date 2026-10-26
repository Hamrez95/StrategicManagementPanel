import { useId, type CSSProperties } from 'react';

export type ChartRow = { id: string; label: string; count: number; color: string };
export const chartNumber = (value: number, english: boolean) =>
  new Intl.NumberFormat(english ? 'en-US' : 'fa-IR').format(value);

/** Original decorative artwork, not a chart of business performance. */
export function DecisionOrbit() {
  const id = useId();
  return (
    <svg className="management-orbit" viewBox="0 0 260 190" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x2="1" y2="1">
          <stop stopColor="#dce8f5" />
          <stop offset="1" stopColor="#f5e4c8" />
        </linearGradient>
      </defs>
      <circle
        className="management-orbit__ring"
        cx="130"
        cy="95"
        r="76"
        fill="none"
        stroke="currentColor"
        strokeDasharray="3 7"
      />
      <path
        d="M50 115Q100 10 205 63M57 138Q154 203 214 92"
        fill="none"
        stroke="currentColor"
        opacity=".25"
      />
      <g className="management-orbit__sheet">
        <rect
          x="76"
          y="35"
          width="112"
          height="128"
          rx="20"
          fill={`url(#${id})`}
          stroke="currentColor"
          strokeOpacity=".2"
          transform="rotate(-10 132 99)"
        />
        <rect
          x="89"
          y="29"
          width="112"
          height="128"
          rx="20"
          fill="var(--paper)"
          stroke="currentColor"
          strokeOpacity=".2"
          transform="rotate(6 145 93)"
        />
        <path
          d="M111 62h53M111 76h34M111 135h54"
          stroke="currentColor"
          strokeWidth="4"
          opacity=".2"
          strokeLinecap="round"
        />
        <rect x="111" y="105" width="10" height="14" rx="3" fill="#b97d44" />
        <rect x="130" y="94" width="10" height="25" rx="3" fill="#8aa9ca" />
        <rect x="149" y="83" width="10" height="36" rx="3" fill="#3c6593" />
      </g>
      <g className="management-orbit__seal">
        <rect
          x="41"
          y="116"
          width="47"
          height="47"
          rx="15"
          fill="#f3c36e"
          transform="rotate(-12 64 139)"
        />
        <path
          d="m55 139 7 6 13-15"
          fill="none"
          stroke="#29435f"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <circle cx="211" cy="53" r="7" fill="#d7937c" />
      <circle cx="57" cy="67" r="4" fill="#7d9fc4" />
    </svg>
  );
}

export function DistributionChart({
  title,
  rows,
  english,
  selected,
  onSelect,
  caption,
}: {
  title: string;
  rows: ChartRow[];
  english: boolean;
  selected?: string | null;
  onSelect?: (id: string) => void;
  caption?: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  let offset = 0;
  const stops = rows
    .filter((row) => row.count > 0)
    .map((row) => {
      const start = offset;
      offset += (row.count / total) * 100;
      return `${row.color} ${start}% ${offset}%`;
    });
  return (
    <section className="management-chart" aria-label={title}>
      <header>
        <h3>{title}</h3>
        <span>{english ? 'Record count' : 'تعداد رکورد'}</span>
      </header>
      <div className="management-chart__body">
        <div
          className="management-donut"
          style={
            {
              '--chart-fill': stops.length ? `conic-gradient(${stops.join(',')})` : 'var(--line)',
            } as CSSProperties
          }
          aria-hidden="true"
        >
          <div>
            <strong>{chartNumber(total, english)}</strong>
            <span>{english ? 'records' : 'رکورد'}</span>
          </div>
        </div>
        <ul className="management-chart__rows">
          {rows.map((row) => {
            const content = (
              <>
                <span className="management-chart__label">
                  <i style={{ background: row.color }} />
                  <span>{row.label}</span>
                  <strong>{chartNumber(row.count, english)}</strong>
                </span>
                <span className="management-chart__track" aria-hidden="true">
                  <i style={{ width: `${(row.count / maximum) * 100}%`, background: row.color }} />
                </span>
              </>
            );
            return (
              <li key={row.id}>
                {onSelect ? (
                  <button
                    type="button"
                    aria-pressed={selected === row.id}
                    onClick={() => onSelect(row.id)}
                  >
                    {content}
                  </button>
                ) : (
                  <div>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {caption && <p className="management-chart__caption">{caption}</p>}
      {!total && (
        <p className="management-chart__empty">
          {english ? 'No records in this view yet.' : 'هنوز رکوردی در این نما ثبت نشده.'}
        </p>
      )}
    </section>
  );
}
