import { useState } from 'react';
import { Icon } from '../experience/ExperienceUI';
import {
  chartNumber,
  DecisionOrbit,
  DistributionChart,
  type ChartRow,
} from '../management/ManagementCharts';
import type { ReportEnvelope } from './api';

const views = [
  {
    id: 'brief',
    icon: 'grid',
    fa: 'مرور مدیریتی',
    en: 'Executive brief',
    faHint: 'تصمیم‌ها، هدف‌ها و اجرای کار رو کنار هم ببین.',
    enHint: 'See decisions, goals and delivery together.',
  },
  {
    id: 'execution',
    icon: 'flag',
    fa: 'پیگیری اجرا',
    en: 'Execution review',
    faHint: 'وضعیت اقدام‌ها و موعد هر کار رو مرور کن.',
    enHint: 'Review action status and due dates.',
  },
  {
    id: 'strategy',
    icon: 'compass',
    fa: 'تصویر راهبرد',
    en: 'Strategy review',
    faHint: 'عامل‌های SWOT و شواهدشون رو دنبال کن.',
    enHint: 'Explore SWOT factors and their evidence.',
  },
  {
    id: 'documents',
    icon: 'file',
    fa: 'آمادگی مدارک',
    en: 'Document review',
    faHint: 'مدارک آماده و موارد در دست تکمیل رو پیدا کن.',
    enHint: 'Find ready documents and unfinished work.',
  },
] as const;
const string = (value: unknown) => (typeof value === 'string' ? value : '');
function dateText(value: string, english: boolean, dateOnly = false) {
  const date = new Date(dateOnly ? `${value}T12:00:00` : value);
  if (!Number.isFinite(date.getTime())) return english ? 'Date unavailable' : 'زمان نامشخص';
  return new Intl.DateTimeFormat(english ? 'en-US' : 'fa-IR', {
    dateStyle: 'medium',
    ...(dateOnly ? {} : { timeStyle: 'short' as const }),
  }).format(date);
}
const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : [];

export function ReportInsights({ report, english }: { report?: ReportEnvelope; english: boolean }) {
  const [view, setView] = useState<string>('brief');
  const [filter, setFilter] = useState<string | null>(null);
  const choice = views.find((item) => item.id === view) ?? views[0];
  const data = report?.data;
  const actions = rows(data?.actions),
    factors = rows(data?.strategy_factors),
    documents = rows(data?.documents);
  const source = view === 'strategy' ? factors : view === 'documents' ? documents : actions;
  const field = view === 'strategy' ? 'factor_type' : 'status';
  const categories =
    view === 'strategy'
      ? [
          ['strength', english ? 'Strengths' : 'قوت‌ها', '#496f9e'],
          ['weakness', english ? 'Weaknesses' : 'ضعف‌ها', '#b66a5e'],
          ['opportunity', english ? 'Opportunities' : 'فرصت‌ها', '#6684aa'],
          ['threat', english ? 'Threats' : 'تهدیدها', '#b68648'],
        ]
      : view === 'documents'
        ? [
            ['ready', english ? 'Ready' : 'آماده', '#496f9e'],
            ['review', english ? 'In review' : 'در بازبینی', '#6684aa'],
            ['draft', english ? 'Draft' : 'پیش‌نویس', '#b68648'],
          ]
        : [
            ['done', english ? 'Done' : 'انجام‌شده', '#496f9e'],
            ['in_progress', english ? 'In progress' : 'در حال انجام', '#6684aa'],
            ['planned', english ? 'Planned' : 'برنامه‌ریزی‌شده', '#b68648'],
            ['blocked', english ? 'Blocked' : 'متوقف', '#b66a5e'],
          ];
  const known = new Set(categories.map(([id]) => id));
  const grouped: ChartRow[] = categories.map(([id, label, color]) => ({
    id,
    label,
    color,
    count: source.filter((item) => item[field] === id).length,
  }));
  const unknown = source.filter((item) => !known.has(string(item[field])));
  if (unknown.length)
    grouped.push({
      id: '_unknown',
      label: english ? 'Unspecified' : 'وضعیت نامشخص',
      count: unknown.length,
      color: '#7c837e',
    });
  const filtered =
    filter === '_unknown'
      ? unknown
      : filter
        ? source.filter((item) => item[field] === filter)
        : source;
  const titles = new Map(
    rows(data?.document_templates).map((item) => {
      const title =
        item.title && typeof item.title === 'object' ? (item.title as Record<string, unknown>) : {};
      return [string(item.id), string(title[english ? 'en' : 'fa'])];
    }),
  );
  const section =
    view === 'documents'
      ? 'report-documents-title'
      : view === 'strategy'
        ? 'report-strategy-title'
        : 'report-decisions-title';
  return (
    <section className="report-studio" aria-labelledby="report-studio-title">
      <header className="management-welcome report-studio__welcome">
        <div>
          <p className="management-eyebrow">
            {english ? 'Your management review, ready to explore' : 'گزارشت رو از زاویهٔ درست ببین'}
          </p>
          <h2 id="report-studio-title">{english ? 'Report studio' : 'استودیوی گزارش'}</h2>
          <p>
            {english
              ? 'Pick a view, explore the records, then keep or export the full report.'
              : 'یک نما انتخاب کن، جزئیاتش رو ببین و نسخهٔ کامل گزارش رو نگه دار یا دریافت کن.'}
          </p>
          <span className="management-source-note">
            <Icon name="shield" size={17} />
            {report
              ? english
                ? 'Based on the selected saved snapshot'
                : 'بر پایهٔ نسخهٔ ذخیره‌شدهٔ انتخابی'
              : english
                ? 'Charts appear after a snapshot is saved'
                : 'نمودارها بعد از ثبت نسخهٔ گزارش نمایش داده می‌شن'}
          </span>
        </div>
        <DecisionOrbit />
      </header>
      <div
        className="report-view-picker"
        role="group"
        aria-label={english ? 'Report views' : 'نماهای گزارش'}
      >
        {views.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={view === item.id}
            onClick={() => {
              setView(item.id);
              setFilter(null);
            }}
          >
            <span className="report-view-picker__icon">
              <Icon name={item.icon} size={24} />
            </span>
            <strong>{english ? item.en : item.fa}</strong>
            <span>{english ? item.enHint : item.faHint}</span>
            <i aria-hidden="true">
              <Icon name={view === item.id ? 'check' : 'arrow'} size={16} />
            </i>
          </button>
        ))}
      </div>
      {!report ? (
        <div className="report-studio__empty">
          <Icon name={choice.icon} size={34} />
          <h3>{english ? choice.en : choice.fa}</h3>
          <p>
            {english
              ? 'Save a snapshot of your Workspace below to explore this view and its underlying records.'
              : 'از داده‌های فضای کارت یک نسخه ثبت کن تا این نما و جزئیاتش رو ببینی.'}
          </p>
          <a href="#report-actions">
            {english ? 'Go to report actions' : 'رفتن به ثبت گزارش'} <Icon name="arrow" size={17} />
          </a>
        </div>
      ) : (
        <div className="report-studio__content" key={view}>
          <div className="report-studio__meta">
            <h3>{english ? choice.en : choice.fa}</h3>
            <time dateTime={report.exported_at}>{dateText(report.exported_at, english)}</time>
          </div>
          {view === 'brief' && (
            <div className="management-stat-grid">
              {[
                {
                  label: english ? 'Decisions' : 'تصمیم ثبت‌شده',
                  count: rows(data?.decisions).length,
                  icon: 'compass',
                  anchor: 'report-decisions-title',
                },
                {
                  label: english ? 'Goals' : 'هدف ثبت‌شده',
                  count: rows(data?.goals).length,
                  icon: 'flag',
                  anchor: 'report-decisions-title',
                },
                {
                  label: english ? 'Documents' : 'مدرک ثبت‌شده',
                  count: documents.length,
                  icon: 'file',
                  anchor: 'report-documents-title',
                },
              ].map((item) => (
                <a href={`#${item.anchor}`} className="management-stat" key={item.label}>
                  <span className="management-stat__icon">
                    <Icon name={item.icon} size={24} />
                  </span>
                  <span>
                    <span>{item.label}</span>
                    <strong>{chartNumber(item.count, english)}</strong>
                    <small>
                      {english ? 'Explore the source records' : 'جزئیات ثبت‌شده رو ببین'}
                    </small>
                  </span>
                  <Icon name="arrow" size={18} />
                </a>
              ))}
            </div>
          )}
          <div className="management-overview-grid">
            <DistributionChart
              english={english}
              title={
                view === 'strategy'
                  ? english
                    ? 'SWOT factor mix'
                    : 'ترکیب عامل‌های SWOT'
                  : view === 'documents'
                    ? english
                      ? 'Document status'
                      : 'وضعیت مدارک'
                    : english
                      ? 'Action status'
                      : 'وضعیت اقدام‌ها'
              }
              rows={grouped}
              selected={filter}
              onSelect={(id) => setFilter(filter === id ? null : id)}
              caption={
                english
                  ? 'Select a status to see its records. Counts describe this snapshot, not a performance score.'
                  : 'روی هر دسته بزن تا رکوردهاش رو ببینی. این تعداد، وضعیت همین نسخه‌ست؛ نمرهٔ عملکرد نیست.'
              }
            />
            <section
              className="report-drilldown"
              aria-label={english ? 'Chart details' : 'جزئیات نمودار'}
            >
              <header>
                <h4>{english ? 'Behind the chart' : 'پشت این نمودار چه خبره؟'}</h4>
                <button type="button" onClick={() => setFilter(null)} disabled={!filter}>
                  {english ? 'Show all' : 'نمایش همه'}
                </button>
              </header>
              <p className="management-note" aria-live="polite">
                {english
                  ? `${chartNumber(filtered.length, true)} records in this selection`
                  : `${chartNumber(filtered.length, false)} رکورد در این انتخاب`}
              </p>
              {filtered.length ? (
                <ul tabIndex={0} aria-label={english ? 'Source records' : 'رکوردهای این انتخاب'}>
                  {filtered.map((item, index) => (
                    <li key={string(item.id) || index}>
                      <strong dir="auto">
                        {view === 'documents'
                          ? titles.get(string(item.template_id)) ||
                            string(item.template_id) ||
                            (english ? 'Untitled document' : 'مدرک بدون عنوان')
                          : string(item.title) ||
                            (english ? 'Untitled record' : 'رکورد بدون عنوان')}
                      </strong>
                      {view === 'strategy' ? (
                        <p dir="auto">
                          {string(item.evidence) ||
                            (english ? 'No evidence recorded.' : 'شاهدی ثبت نشده.')}
                        </p>
                      ) : (
                        view !== 'documents' && (
                          <span>
                            {string(item.owner_name) && (
                              <>
                                {english ? 'Owner: ' : 'مسئول: '}
                                <bdi>{string(item.owner_name)}</bdi> ·{' '}
                              </>
                            )}
                            {string(item.due_on) && (
                              <time dateTime={string(item.due_on)}>
                                {english ? 'Due: ' : 'موعد: '}
                                {dateText(string(item.due_on), english, true)}
                              </time>
                            )}
                          </span>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="management-chart__empty">
                  {english ? 'No records in this selection.' : 'رکوردی در این انتخاب نیست.'}
                </p>
              )}
              <a href={`#${section}`}>
                {english ? 'See the full source section' : 'دیدن بخش کامل گزارش'}{' '}
                <Icon name="arrow" size={17} />
              </a>
            </section>
          </div>
          <p className="management-note">
            {english
              ? 'Snapshot counts remain unchanged as live records change. Save a new snapshot for an updated review.'
              : 'با تغییر اطلاعات زنده، این نسخه عوض نمی‌شه. برای مرور تازه، یک نسخهٔ جدید ثبت کن.'}
          </p>
        </div>
      )}
    </section>
  );
}
