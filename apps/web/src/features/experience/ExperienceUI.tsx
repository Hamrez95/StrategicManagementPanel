import { Link } from 'react-router';
import type { ReactNode } from 'react';
import './experience.css';

export function Mark({ to = '/' }: { to?: string }) {
  return (
    <Link
      className="ex-brand"
      to={to}
      aria-label={to === '/' ? 'استراتینو، صفحه اصلی' : 'استراتینو، فضاهای کاری من'}
    >
      <span className="ex-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <strong>استراتینو</strong>
    </Link>
  );
}
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7v10H3Z" />
        <path d="M9 20v-7h6v7" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    arrow: <path d="M19 12H5m6-6-6 6 6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    people: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v2" />
      </>
    ),
    compass: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m16 8-2 6-6 2 2-6Z" />
      </>
    ),
    chart: (
      <>
        <path d="M4 3v18h17M8 17v-4m5 4V8m5 9V5" />
      </>
    ),
    flag: (
      <>
        <path d="M5 22V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0" />
      </>
    ),
    book: (
      <>
        <path d="M3 4h7l2 2 2-2h7v16h-7l-2 1-2-1H3Z M12 6v15" />
      </>
    ),
    settings: (
      <>
        <path d="m12 3 3 3h4v4l2 2-2 2v4h-4l-3 3-3-3H5v-4l-2-2 2-2V6h4Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 9 4v5c0 6-9 10-9 10S3 18 3 12V7Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    file: (
      <>
        <path d="M5 3h9l5 5v13H5Z M14 3v6h5M8 13h8M8 17h6" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.grid}
    </svg>
  );
}
export function BoardIllustration({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`ex-illustration${compact ? ' ex-illustration--compact' : ''}`}
      aria-label="از شناخت کسب‌وکار تا تصمیم و اقدام"
      role="img"
    >
      <div className="ex-orbit ex-orbit--one" />
      <div className="ex-orbit ex-orbit--two" />
      <div className="ex-board">
        <div className="ex-board-top">
          <span className="ex-mini-mark">S</span>
          <strong>مسیر روشن کسب‌وکار شما</strong>
          <span className="ex-board-avatars">
            <i>ح</i>
            <i>م</i>
          </span>
        </div>
        <div className="ex-board-columns">
          {[
            {
              title: 'شناخت',
              color: 'purple',
              cards: ['مشتری ما کیست؟', 'مسئله‌ای که حل می‌کنیم'],
            },
            { title: 'تصمیم', color: 'blue', cards: ['انتخاب مسیر رشد', 'چرا این انتخاب؟'] },
            { title: 'اقدام', color: 'green', cards: ['گفت‌وگو با مشتری', 'مرور آموخته‌ها'] },
          ].map((column) => (
            <div className="ex-board-column" key={column.title}>
              <strong>
                <i className={`ex-dot ex-dot--${column.color}`} />
                {column.title}
              </strong>
              {column.cards.map((card, i) => (
                <div className="ex-mini-card" key={card}>
                  <span className={`ex-mini-line ex-mini-line--${column.color}`} />
                  <b>{card}</b>
                  <span className="ex-fake-lines">
                    <i />
                    <i />
                  </span>
                  <small>
                    {i === 0 ? 'یک قدم روشن' : 'فضا برای ایده‌های شما'}
                    <span className="ex-mini-avatar">{i === 0 ? 'ح' : 'م'}</span>
                  </small>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="ex-floating-check">
        <Icon name="check" size={18} />
        از ایده، به عمل.
      </div>
    </div>
  );
}
export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ex-page-heading">
      <div>
        <h1 tabIndex={-1}>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Empty({
  icon = 'grid',
  title,
  text,
  action,
}: {
  icon?: string;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="ex-empty">
      <span className="ex-empty-icon">
        <Icon name={icon} size={30} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
