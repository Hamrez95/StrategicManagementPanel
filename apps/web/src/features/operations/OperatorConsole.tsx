import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { ApiError, requestApi } from '../../api/client';
import { LanguageSwitch, ThemeSwitch } from '../chrome/HeaderControls';
import './operator.css';

const sections = ['accounts', 'workspaces', 'plans', 'subscriptions', 'access', 'audit'] as const;
type Section = (typeof sections)[number];
type Row = Record<string, unknown>;
type Status = { sections: Section[]; mfa_ready: boolean };
type Page = {
  results: Row[];
  count: number;
  page: number;
  has_next: boolean;
  has_previous: boolean;
};
const titles: Record<Section, [string, string]> = {
  accounts: ['حساب‌ها', 'Accounts'],
  workspaces: ['فضاهای کاری', 'Workspaces'],
  plans: ['پلن‌های مدیریت', 'Management plans'],
  subscriptions: ['اشتراک‌های مدیریت', 'Management subscriptions'],
  access: ['دسترسی مؤثر مدیریت', 'Effective management access'],
  audit: ['تاریخچهٔ ممیزی', 'Audit history'],
};
const columns: Record<Section, string[]> = {
  accounts: ['id', 'is_active', 'verified', 'date_joined'],
  workspaces: ['id', 'owner_id', 'archived_at', 'created_at'],
  plans: [
    'code',
    'title',
    'is_active',
    'is_default',
    'revision',
    'owned_workspace_limit',
    'can_finalize_analysis',
    'can_calculate_metrics',
    'can_generate_reports',
    'price',
    'currency',
    'duration_days',
  ],
  subscriptions: [
    'id',
    'owner_id',
    'plan_title',
    'plan_revision',
    'status',
    'starts_at',
    'ends_at',
    'owned_workspace_limit',
    'can_finalize_analysis',
    'can_calculate_metrics',
    'can_generate_reports',
  ],
  access: [
    'id',
    'accessLevel',
    'owned_workspace_limit',
    'owned_workspaces',
    'can_create_workspace',
    'features',
  ],
  audit: ['source', 'event_id', 'actor_id', 'event_type', 'target', 'created_at'],
};
const names: Record<string, [string, string]> = {
  id: ['شناسه', 'ID'],
  owner_id: ['شناسهٔ مالک', 'Owner ID'],
  is_active: ['فعال', 'Active'],
  verified: ['ایمیل تأییدشده', 'Verified email'],
  date_joined: ['زمان ثبت‌نام', 'Joined'],
  archived_at: ['زمان بایگانی', 'Archived at'],
  created_at: ['زمان ثبت', 'Created'],
  code: ['کد', 'Code'],
  title: ['عنوان', 'Title'],
  is_default: ['پیش‌فرض', 'Default'],
  revision: ['نسخه', 'Revision'],
  owned_workspace_limit: ['سقف فضاهای تحت مالکیت', 'Owned Workspace limit'],
  price: ['قیمت ثبت‌شده', 'Configured price'],
  currency: ['واحد ارز', 'Currency'],
  duration_days: ['مدت به روز', 'Duration in days'],
  can_finalize_analysis: ['نهایی‌کردن تحلیل', 'Finalize analysis'],
  can_calculate_metrics: ['محاسبهٔ شاخص', 'Calculate metrics'],
  can_generate_reports: ['مجوز رزروشدهٔ گزارش', 'Reserved report capability'],
  plan_title: ['عنوان پلن هنگام اعطا', 'Granted plan title'],
  plan_revision: ['نسخهٔ پلن هنگام اعطا', 'Granted plan revision'],
  status: ['وضعیت ثبت‌شده', 'Recorded status'],
  starts_at: ['شروع', 'Starts'],
  ends_at: ['پایان', 'Ends'],
  accessLevel: ['سطح دسترسی', 'Access level'],
  owned_workspaces: ['فضاهای فعال تحت مالکیت', 'Active owned Workspaces'],
  can_create_workspace: ['امکان ساخت فضا', 'Can create Workspace'],
  features: ['قابلیت‌ها', 'Capabilities'],
  source: ['منبع', 'Source'],
  event_id: ['شناسهٔ رویداد', 'Event ID'],
  actor_id: ['شناسهٔ عامل', 'Actor ID'],
  event_type: ['نوع رویداد', 'Event type'],
  target: ['شناسهٔ مرجع', 'Reference ID'],
};

export function OperatorConsole() {
  const { pathname } = useLocation();
  const route = pathname.split('/')[2] || 'accounts';
  const section = sections.find((value) => value === route);
  const [english, setEnglish] = useState(document.documentElement.lang === 'en');
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState('');
  const [reload, setReload] = useState(0);
  const t = (fa: string, en: string) => (english ? en : fa);
  useEffect(() => {
    const observer = new MutationObserver(() => setEnglish(document.documentElement.lang === 'en'));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setStatus(null);
    setStatusError('');
    requestApi<Status>('/api/v1/operator/status/', { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setStatus(value);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setStatusError(error.message);
      });
    return () => controller.abort();
  }, [reload]);
  return (
    <div className="operator-console" dir={english ? 'ltr' : 'rtl'}>
      <header className="operator-header">
        <div>
          <h1>{t('پنل داخلی اپراتور', 'Internal operator console')}</h1>
          <p>{t('نمای خلاصه و فقط‌خواندنی سرویس', 'Read-only service summaries')}</p>
        </div>
        <div className="operator-tools">
          <ThemeSwitch />
          <LanguageSwitch english={english} />
          <Link to="/app">{t('فضاهای من', 'My Workspaces')}</Link>
        </div>
      </header>
      {!status && !statusError && (
        <p role="status">
          {t('داریم مجوزهای دسترسی رو بررسی می‌کنیم…', 'Checking operator permissions…')}
        </p>
      )}
      {statusError && (
        <div role="alert">
          <p>
            {english
              ? 'Operator access could not be verified. Check your session and permissions.'
              : statusError}
          </p>
          <button onClick={() => setReload((value) => value + 1)}>
            {t('تلاش دوباره', 'Retry')}
          </button>
        </div>
      )}
      {status && (
        <>
          <nav aria-label={t('بخش‌های اپراتور', 'Operator sections')} className="operator-nav">
            {sections
              .filter((value) => status.sections.includes(value))
              .map((value) => (
                <NavLink key={value} to={'/internal/' + value}>
                  {titles[value][english ? 1 : 0]}
                </NavLink>
              ))}
          </nav>
          {!status.mfa_ready ? (
            <section className="operator-message" role="alert">
              <h2>{t('نمایش اطلاعات مشتری بسته است', 'Customer information is locked')}</h2>
              <p>
                {t(
                  'احراز هویت دومرحله‌ای اپراتور هنوز آماده نیست. بعد از آماده‌شدن این پیش‌نیاز و تأیید مجوز هر بخش، اطلاعات نمایش داده می‌شه.',
                  'Operator MFA is not ready. Data remains unavailable until MFA and section permissions are verified.',
                )}
              </p>
              <button onClick={() => setReload((value) => value + 1)}>
                {t('بررسی دوباره', 'Check again')}
              </button>
            </section>
          ) : section && status.sections.includes(section) ? (
            <OperatorCollection
              key={section + String(english)}
              section={section}
              english={english}
            />
          ) : (
            <p role="alert">
              {t(
                'این بخش در دسترس نیست یا مجوزش رو نداری.',
                'This section is unavailable or you do not have permission.',
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function OperatorCollection({ section, english }: { section: Section; english: boolean }) {
  const t = (fa: string, en: string) => (english ? en : fa);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const number = (value: number) => new Intl.NumberFormat(english ? 'en' : 'fa-IR').format(value);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError('');
    const params = new URLSearchParams({ q: query, state, page: String(page) });
    requestApi<Page>(`/api/v1/operator/${section}/?${params}`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof ApiError && err.code === 'operator_mfa_unavailable'
            ? english
              ? 'Operator MFA is unavailable. Customer information is locked.'
              : 'احراز هویت دومرحله‌ای اپراتور هنوز آماده نیست. نمایش اطلاعات مشتری بسته است.'
            : english
              ? 'Could not load this section. Check your connection and access, then retry.'
              : err.message,
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [section, query, state, page, reload, english]);
  function display(value: unknown, key: string): ReactNode {
    if (value === null && key === 'owned_workspace_limit')
      return t('بدون سقف اضافی پلن', 'No additional plan cap');
    if (value === null && key === 'archived_at') return t('بایگانی نشده', 'Not archived');
    if (value === null || value === undefined) return t('ثبت نشده', 'Not set');
    if (typeof value === 'boolean') return value ? t('بله', 'Yes') : t('خیر', 'No');
    if (typeof value === 'number') return number(value);
    if (typeof value === 'object')
      return (
        <ul className="operator-features">
          {Object.entries(value).map(([feature, enabled]) => (
            <li key={feature}>
              {names[feature]?.[english ? 1 : 0] ?? feature}: {display(enabled, feature)}
            </li>
          ))}
        </ul>
      );
    if (typeof value === 'string' && (key.endsWith('_at') || key === 'date_joined'))
      return new Intl.DateTimeFormat(english ? 'en' : 'fa-IR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value));
    const labels: Record<string, [string, string]> = {
      active: ['فعال', 'Active'],
      revoked: ['لغوشده', 'Revoked'],
      free: ['رایگان', 'Free'],
      special: ['اشتراک ویژه', 'Special'],
      workspace: ['فضای کاری', 'Workspace'],
      subscription: ['اشتراک', 'Subscription'],
      created: ['ساخته‌شدن', 'Created'],
      updated: ['به‌روزرسانی', 'Updated'],
      member_changed: ['تغییر عضویت', 'Membership changed'],
      member_removed: ['حذف عضویت', 'Membership removed'],
      invite_created: ['ایجاد دعوت', 'Invitation created'],
      invite_revoked: ['لغو دعوت', 'Invitation revoked'],
      invite_accepted: ['پذیرش دعوت', 'Invitation accepted'],
      granted: ['اعطای اشتراک', 'Subscription granted'],
    };
    return <bdi>{labels[String(value)]?.[english ? 1 : 0] ?? String(value)}</bdi>;
  }
  return (
    <section aria-labelledby="operator-section-title">
      <h2 id="operator-section-title">{titles[section][english ? 1 : 0]}</h2>
      <p id="operator-search-help">
        {section === 'plans'
          ? t('جست‌وجو با کد یا عنوان پلن.', 'Search by plan code or title.')
          : section === 'accounts' || section === 'access'
            ? t(
                'جست‌وجو با شناسهٔ حساب یا ایمیل کامل. ایمیل در نتیجه نمایش داده نمی‌شه.',
                'Search by account ID or exact email. Emails are not displayed.',
              )
            : t(
                'جست‌وجو با شناسهٔ کامل رکورد یا مالک؛ در ممیزی با شناسهٔ مرجع یا عامل.',
                'Search by full record or owner ID; for audit, use a reference or actor ID.',
              )}
      </p>
      <form
        className="operator-tools"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(input.trim());
          setPage(1);
          setReload((value) => value + 1);
        }}
      >
        <label>
          {t('جست‌وجو', 'Search')}
          <input
            aria-describedby="operator-search-help"
            value={input}
            maxLength={254}
            onChange={(event) => setInput(event.target.value)}
            type="search"
          />
        </label>
        {section !== 'audit' && (
          <label>
            {t('وضعیت', 'State')}
            <select
              value={state}
              onChange={(event) => {
                setState(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('همه', 'All')}</option>
              <option value="active">{t('فعال', 'Active')}</option>
              <option
                value={
                  section === 'workspaces'
                    ? 'archived'
                    : section === 'subscriptions'
                      ? 'revoked'
                      : 'inactive'
                }
              >
                {section === 'workspaces'
                  ? t('بایگانی‌شده', 'Archived')
                  : section === 'subscriptions'
                    ? t('لغوشده', 'Revoked')
                    : t('غیرفعال', 'Inactive')}
              </option>
            </select>
          </label>
        )}
        <button type="submit">{t('جست‌وجو', 'Search')}</button>
        <button type="button" onClick={() => setReload((value) => value + 1)}>
          {t('تازه‌کردن', 'Refresh')}
        </button>
      </form>
      {loading && <p role="status">{t('داریم اطلاعات رو می‌گیریم…', 'Loading…')}</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => setReload((value) => value + 1)}>
            {t('تلاش دوباره', 'Retry')}
          </button>
          {page > 1 && <button onClick={() => setPage(1)}>{t('صفحهٔ اول', 'First page')}</button>}
        </div>
      )}
      {data && !loading && !error && (
        <>
          <p role="status">
            {number(data.count)} {t('رکورد', 'records')}
          </p>
          {data.results.length === 0 ? (
            <p className="operator-message">
              {t(
                'رکوردی پیدا نشد. جست‌وجو یا فیلتر رو تغییر بده.',
                'No records found. Change your search or filter.',
              )}
            </p>
          ) : (
            <div
              className="operator-table"
              role="region"
              aria-label={titles[section][english ? 1 : 0]}
              tabIndex={0}
            >
              <table>
                <caption>{titles[section][english ? 1 : 0]}</caption>
                <thead>
                  <tr>
                    {columns[section].map((key) => (
                      <th key={key} scope="col">
                        {names[key]?.[english ? 1 : 0] ?? key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((row) => (
                    <tr key={String(row.id ?? `${row.source}:${row.event_id}`)}>
                      {columns[section].map((key) => (
                        <td key={key}>{display(row[key], key)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav className="operator-tools" aria-label={t('صفحه‌بندی', 'Pagination')}>
            <button disabled={!data.has_previous} onClick={() => setPage((value) => value - 1)}>
              {t('قبلی', 'Previous')}
            </button>
            <span>
              {t('صفحهٔ', 'Page')} {number(data.page)}
            </span>
            <button disabled={!data.has_next} onClick={() => setPage((value) => value + 1)}>
              {t('بعدی', 'Next')}
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
