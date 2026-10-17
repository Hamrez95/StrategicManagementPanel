import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import data from './design-research.json';
import { planningDesigns } from './planningDesigns';
import { tools, type Space } from './model';
import { path } from './store';
import { Icon, PageHeading, Empty } from './ExperienceUI';
import { fa } from './GuidedFlow';
import './management.css';
const phases = [
  {
    area: 'foundation',
    title: 'جهت‌گیری',
    description: 'چرایی، چشم‌انداز، مأموریت، ارزش‌ها و هدف‌ها.',
    links: ['vision', 'mission', 'values', 'strategic-goals'],
  },
  {
    area: 'strategy',
    title: 'شناخت و تحلیل',
    description: 'محیط، صنعت، مشتری، منابع و عوامل داخلی و خارجی.',
    links: ['customer', 'market', 'swot', 'matrices'],
  },
  {
    area: 'strategy',
    title: 'انتخاب استراتژی',
    description: 'گزینه‌های رشد، سبد، منطق برد و تصمیم.',
    links: ['tows', 'ansoff', 'qspm', 'strategy-choice'],
  },
  {
    area: 'marketing',
    title: 'برنامه‌های کسب‌وکار',
    description: 'بازاریابی، فروش، مالی، افراد و عملیات.',
    links: ['stp', 'marketing-mix', 'marketing-plan', 'sales-pipeline'],
  },
  {
    area: 'execution',
    title: 'اجرا و هم‌راستایی',
    description: 'هدف، شاخص، مسئولیت، منابع و اقدام.',
    links: ['strategic-goals', 'governance', 'decisions', 'risks'],
  },
  {
    area: 'execution',
    title: 'کنترل و بازنگری',
    description: 'مرور نتیجه، تغییر فرض‌ها و اصلاح مسیر.',
    links: ['strategy-review', 'retention', 'data-quality', 'transformation'],
  },
];
const featuredAreas: Record<string, string> = {
  customer: 'customer',
  market: 'market',
  swot: 'strategy',
  matrices: 'strategy',
  decisions: 'strategy',
  finance: 'finance',
  retention: 'customer',
  risks: 'risk',
};
export function ManagementDirectory({ space }: { space: Space }) {
  const [params, setParams] = useSearchParams();
  const area = params.get('area') || 'all';
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [page, setPage] = useState(0);
  const [journey, setJourney] = useState(!params.has('area'));
  const entries = [
    ...planningDesigns.map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      area: d.area,
      kind: 'planning',
      route: `tool/${d.id}`,
      icon: 'compass',
    })),
    ...tools.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      area: featuredAreas[t.id],
      kind: 'active',
      route: `tool/${t.id}`,
      icon: t.icon,
    })),
    ...data.entries.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      area: r.domain,
      kind: r.kind,
      route: `research/${r.id}`,
      icon: r.kind === 'metrics' ? 'chart' : 'grid',
    })),
  ];
  const normalized = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLocaleLowerCase('fa');
  const visible = entries.filter(
    (e) =>
      (area === 'all' || e.area === area) &&
      (kind === 'all' ||
        e.kind === kind ||
        (kind === 'matrices' &&
          [
            'matrices',
            'swot',
            'tows',
            'qspm',
            'space',
            'cpm',
            'ie',
            'ansoff',
            'grand-strategy',
            'STR-BCG-GROWTH-SHARE',
            'STR-GE-MCKINSEY',
          ].includes(e.id))) &&
      normalized(
        `${e.title} ${e.description} ${e.id} ${e.id === 'vision' ? 'ویژن vision' : e.id === 'mission' ? 'میژن mission' : ''}`,
      ).includes(normalized(search.trim())),
  );
  const total = Math.max(1, Math.ceil(visible.length / 12));
  const selected = Math.min(page, total - 1);
  const filterArea = (next: string) => {
    setParams(next === 'all' ? {} : { area: next });
    setPage(0);
    setJourney(false);
  };
  return (
    <>
      <PageHeading
        title="تحلیل‌ها"
        description="از تعریف جهت‌گیری تا اجرا و بازنگری؛ هر موضوع در صفحهٔ خودش و با راهنمای گام‌به‌گام."
      />
      <div className="ex-filter-group mx-view-switch">
        <button aria-pressed={journey} onClick={() => setJourney(true)}>
          نقشهٔ مدیریت استراتژیک
        </button>
        <button
          aria-pressed={!journey && kind !== 'matrices'}
          onClick={() => {
            setJourney(false);
            setKind('all');
          }}
        >
          همهٔ ابزارها و شاخص‌ها
        </button>
        <button
          aria-pressed={!journey && kind === 'matrices'}
          onClick={() => {
            filterArea('all');
            setKind('matrices');
          }}
        >
          ماتریس‌ها
        </button>
        <button
          aria-pressed={!journey && area === 'marketing'}
          onClick={() => {
            filterArea('marketing');
            setKind('all');
          }}
        >
          مدیریت بازاریابی
        </button>
      </div>
      {journey ? (
        <>
          <section className="mx-roadmap-intro">
            <h2>یک مسیر روشن؛ با امکان شروع از نیاز امروز</h2>
            <p>
              این ترتیب برای پیدا کردن بخش‌هاست؛ مرحلهٔ بلوغ یا مسیر اجباری کسب‌وکار شما را تعیین
              نمی‌کند.
            </p>
          </section>
          <ol className="mx-roadmap">
            {phases.map((phase, i) => (
              <li key={phase.title}>
                <span className="mx-phase-index">{fa(i + 1)}</span>
                <div>
                  <h2>{phase.title}</h2>
                  <p>{phase.description}</p>
                  <div>
                    {phase.links.map((id) => {
                      const entry = entries.find((e) => e.id === id)!;
                      return (
                        <Link key={id} to={path(space, entry.route)}>
                          {entry.title}
                          <Icon name="arrow" size={15} />
                        </Link>
                      );
                    })}
                  </div>
                  <button
                    className="ex-button ex-button--quiet"
                    onClick={() => filterArea(phase.area)}
                  >
                    دیدن ابزارهای این حوزه
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <section className="mx-domain-links">
            <h2>حوزه‌های تخصصی مدیریت</h2>
            <div>
              {data.domains.map((d) => (
                <button key={d.id} onClick={() => filterArea(d.id)}>
                  {d.name_fa}
                  <Icon name="arrow" size={15} />
                </button>
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <div className="gx-doc-toolbar">
            <label className="ex-search">
              <Icon name="search" />
              <input
                aria-label="جست‌وجوی ابزار"
                placeholder="ویژن، بازاریابی، نام ماتریس یا شاخص…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label className="ex-field">
              حوزهٔ مدیریت
              <select value={area} onChange={(e) => filterArea(e.target.value)}>
                <option value="all">همهٔ حوزه‌ها</option>
                {data.domains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name_fa}
                  </option>
                ))}
              </select>
            </label>
            <label className="ex-field">
              نوع ابزار
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">همه</option>
                <option value="planning">برنامه‌ریزی و تدوین</option>
                <option value="frameworks">چارچوب‌های پژوهش</option>
                <option value="metrics">شاخص‌های پژوهش</option>
                <option value="active">ابزارهای فعلی</option>
                <option value="matrices">ماتریس‌ها</option>
              </select>
            </label>
          </div>
          <p className="gx-muted">
            {fa(visible.length)} ابزار · طراحی و ثبت پیش‌نویس در دسترس است؛ وضعیت محاسبه و محدودیت
            هر روش در صفحهٔ خودش مشخص است.
          </p>
          <div className="ex-tools-grid">
            {visible.slice(selected * 12, selected * 12 + 12).map((e) => (
              <Link key={e.id} className="ex-tool-card" to={path(space, e.route)}>
                <span className="ex-tool-icon">
                  <Icon name={e.icon} size={24} />
                </span>
                <small>{data.domains.find((d) => d.id === e.area)?.name_fa || e.area}</small>
                <h2>{e.title}</h2>
                <p>{e.description}</p>
                <span className="ex-card-link">
                  {e.kind === 'active' ? 'باز کردن ابزار' : 'راهنما و پیش‌نویس'}
                  <Icon name="arrow" size={16} />
                </span>
              </Link>
            ))}
          </div>
          {!visible.length && (
            <Empty title="ابزاری پیدا نشد" text="عبارت یا حوزهٔ دیگری را امتحان کن." />
          )}
          {total > 1 && (
            <nav className="gx-pagination" aria-label="صفحات ابزارها">
              <button
                className="ex-button ex-button--outline"
                disabled={selected === 0}
                onClick={() => setPage(selected - 1)}
              >
                قبلی
              </button>
              <span>
                {fa(selected + 1)} از {fa(total)}
              </span>
              <button
                className="ex-button ex-button--outline"
                disabled={selected + 1 === total}
                onClick={() => setPage(selected + 1)}
              >
                بعدی
              </button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
