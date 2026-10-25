import { useEffect, useState, type ReactNode } from 'react';
import { ApiError, requestApi } from '../../api/client';
import { OperatorShell } from './OperatorShell';
import { OperatorIcon } from './OperatorIcon';
import { OperatorActionDialog, type OperatorAction } from './OperatorActionDialog';
import type { OperatorCapabilities } from './OperatorSecurity';
import './operator.css';

const sections = [
  'accounts',
  'workspaces',
  'plans',
  'subscriptions',
  'access',
  'audit',
  'academy',
  'academy_plans',
  'academy_subscriptions',
  'academy_orders',
  'academy_samples',
  'feedback',
] as const;
type Section = (typeof sections)[number];
type Row = Record<string, unknown>;
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
  academy: ['مجموعه‌های آموزشی', 'Academy courses'],
  academy_plans: ['پلن‌های آکادمی', 'Academy plans'],
  academy_subscriptions: ['اشتراک‌های آکادمی', 'Academy subscriptions'],
  academy_orders: ['سفارش‌های آکادمی', 'Academy orders'],
  academy_samples: ['نمونه‌های رایگان', 'Free samples'],
  feedback: ['نظرهای یادگیرنده‌ها', 'Learner feedback'],
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
  academy: ['id', 'title', 'area_id', 'order', 'unit_count', 'card_count'],
  academy_plans: [
    'code',
    'title',
    'kind',
    'is_active',
    'price',
    'sale_price',
    'currency',
    'duration_days',
  ],
  academy_subscriptions: [
    'id',
    'user_id',
    'plan_code',
    'coverage',
    'areas',
    'status',
    'is_effective',
    'starts_at',
    'ends_at',
    'order_item_id',
  ],
  academy_orders: ['id', 'user_id', 'status', 'created_at', 'paid_at', 'items'],
  academy_samples: ['id', 'title', 'unit_id', 'course_id', 'is_active', 'updated_at'],
  feedback: [],
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
  can_generate_reports: ['گزارش حرفه‌ای', 'Professional reports'],
  plan_title: ['عنوان ثبت‌شدهٔ پلن', 'Recorded plan title'],
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
  area_id: ['حوزه', 'Area'],
  order: ['ترتیب', 'Order'],
  first_name: ['نام', 'First name'],
  last_name: ['نام خانوادگی', 'Last name'],
  email: ['ایمیل', 'Email'],
  phone_number: ['شمارهٔ تماس', 'Phone'],
  user_id: ['شناسهٔ کاربر', 'User ID'],
  kind: ['نوع پلن', 'Plan type'],
  coverage: ['پوشش ثبت‌شده', 'Recorded coverage'],
  areas: ['گرایش‌های انتخابی', 'Selected specialties'],
  sale_price: ['قیمت با تخفیف', 'Sale price'],
  plan_code: ['کد پلن', 'Plan code'],
  is_effective: ['دسترسی در این لحظه', 'Effective now'],
  order_item_id: ['ردیف خرید', 'Order item'],
  paid_at: ['زمان پرداخت', 'Paid at'],
  items: ['جزئیات ثبت‌شدهٔ خرید', 'Recorded order items'],
  original_unit_price: ['قیمت اصلی واحد', 'Original unit price'],
  unit_price: ['قیمت واحد', 'Unit price'],
  subtotal: ['جمع اولیه', 'Subtotal'],
  discount_amount: ['مبلغ تخفیف', 'Discount amount'],
  total: ['مبلغ نهایی', 'Total'],
  unit_id: ['شناسهٔ درس‌نامه', 'Unit ID'],
  course_id: ['شناسهٔ مجموعه', 'Course ID'],
  updated_at: ['آخرین تغییر', 'Updated'],
  unit_count: ['تعداد درس و مرور', 'Learning and review units'],
  card_count: ['تعداد کارت', 'Cards'],
};

export function OperatorConsole() {
  return (
    <OperatorShell
      sections={sections}
      titles={titles}
      renderCollection={(section, english, reauthenticate, capabilities) => (
        <OperatorCollection
          key={section + String(english)}
          section={section as Section}
          english={english}
          onReauthenticate={reauthenticate}
          capabilities={capabilities}
        />
      )}
    />
  );
}

function OperatorCollection({
  section,
  english,
  onReauthenticate,
  capabilities,
}: {
  section: Section;
  english: boolean;
  onReauthenticate: () => void;
  capabilities: OperatorCapabilities;
}) {
  const t = (fa: string, en: string) => (english ? en : fa);
  const [action, setAction] = useState<OperatorAction | null>(null);
  const [success, setSuccess] = useState('');
  const keys =
    section === 'accounts' && capabilities.identity
      ? [
          'id',
          'first_name',
          'last_name',
          'email',
          'phone_number',
          'is_active',
          'verified',
          'date_joined',
        ]
      : columns[section];
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
  }, [section, query, state, page, reload, english, onReauthenticate]);
  function display(value: unknown, key: string): ReactNode {
    if (value === null && key === 'owned_workspace_limit')
      return t('بدون سقف اضافی پلن', 'No additional plan cap');
    if (value === null && key === 'archived_at') return t('بایگانی نشده', 'Not archived');
    if (value === null && key === 'ends_at') return t('بدون تاریخ پایان', 'No end date');
    if (value === null && (key === 'price' || key === 'duration_days'))
      return t('هنوز تعیین نشده', 'Not decided yet');
    if (value === null && key === 'sale_price') return t('بدون تخفیف عمومی', 'No catalog discount');
    if (value === null || value === undefined) return t('ثبت نشده', 'Not set');
    if (typeof value === 'boolean') return value ? t('بله', 'Yes') : t('خیر', 'No');
    if (typeof value === 'number') return number(value);
    if (Array.isArray(value))
      return value.length ? (
        <ul className="operator-features">
          {value.map((item, index) => (
            <li key={index}>{display(item, key)}</li>
          ))}
        </ul>
      ) : (
        t('موردی ثبت نشده', 'None recorded')
      );
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
      full: ['کامل', 'Full'],
      general: ['عمومی', 'General'],
      specialty: ['گرایش‌های انتخابی', 'Selected specialties'],
      requested: ['درخواست قیمت', 'Quote requested'],
      pending: ['در انتظار پرداخت', 'Pending payment'],
      paid: ['پرداخت‌شده', 'Paid'],
      cancelled: ['لغوشده', 'Cancelled'],
      refunded: ['بازپرداخت‌شده', 'Refunded'],
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
      security: ['امنیت حساب', 'Account security'],
      operator: ['مدیریت سرویس', 'Service administration'],
      enrolled: ['اتصال Authenticator', 'Authenticator enrolled'],
      enrollment_started: ['شروع اتصال Authenticator', 'Authenticator setup started'],
      verified: ['تأیید نشست', 'Session verified'],
      locked: ['قفل نشست', 'Session locked'],
      factor_removed: ['حذف Authenticator', 'Authenticator removed'],
      account_status_changed: ['تغییر وضعیت حساب', 'Account status changed'],
      feedback_triaged: ['بررسی نظر', 'Feedback triaged'],
      operator_access_changed: ['تغییر دسترسی مدیر', 'Administrator access changed'],
      operator_password_changed: ['تغییر گذرواژهٔ مدیر', 'Administrator password changed'],
    };
    return (
      <bdi
        className={
          ['active', 'revoked', 'free', 'special'].includes(String(value))
            ? 'op-badge op-badge-' + value
            : undefined
        }
      >
        {labels[String(value)]?.[english ? 1 : 0] ?? String(value)}
      </bdi>
    );
  }
  return (
    <section className="op-card op-collection" aria-labelledby="operator-section-title">
      <div className="op-collection-heading">
        <h2 id="operator-section-title">{titles[section][english ? 1 : 0]}</h2>
        {section === 'subscriptions' && capabilities.grant && (
          <button className="op-primary" onClick={() => setAction({ kind: 'grant' })}>
            <OperatorIcon name="subscriptions" size={18} />
            {t('اعطای اشتراک', 'Grant subscription')}
          </button>
        )}
      </div>
      {success && (
        <p role="status" className="op-success">
          {success}
        </p>
      )}
      <p id="operator-search-help">
        {section === 'plans' || section === 'academy_plans'
          ? t('جست‌وجو با کد یا عنوان پلن.', 'Search by plan code or title.')
          : section === 'academy'
            ? t('جست‌وجو با شناسه یا عنوان مجموعه.', 'Search by course ID or title.')
            : section === 'academy_samples'
              ? t(
                  'با شناسهٔ کارت، درس‌نامه، مجموعه یا عنوان کارت جست‌وجو کن.',
                  'Search by card, unit, course ID or card title.',
                )
              : section === 'academy_orders' || section === 'academy_subscriptions'
                ? t(
                    'با شناسهٔ کامل کاربر یا رکورد جست‌وجو کن.',
                    'Search by full user or record ID.',
                  )
                : section === 'accounts' || section === 'access'
                  ? t(
                      'جست‌وجو با شناسهٔ حساب یا ایمیل کامل.',
                      'Search by account ID or exact email.',
                    )
                  : t(
                      'جست‌وجو با شناسهٔ کامل رکورد یا مالک؛ در ممیزی با شناسهٔ مرجع یا عامل.',
                      'Search by full record or owner ID; for audit, use a reference or actor ID.',
                    )}
      </p>
      {section === 'academy_subscriptions' && (
        <p className="op-inline-note">
          {t(
            'وضعیت ثبت‌شده با دسترسی فعلی فرق داره؛ زمان شروع، پایان و لغو اشتراک رو هم بررسی کن. پوشش و گرایش‌های هر خرید جدا ثبت می‌شن.',
            'Recorded status and current access differ. Check start, expiry and revocation. Coverage and selected specialties belong to each grant.',
          )}
        </p>
      )}
      {section === 'academy_orders' && (
        <p className="op-inline-note">
          {t(
            'مبلغ‌ها به واحد ارز هر ردیف هستن. اینجا فقط سابقهٔ سفارش رو می‌بینی؛ وضعیت پرداخت رو از این بخش تغییر نمی‌دی.',
            'Amounts use each item’s recorded currency. This view shows order history; it does not change payment status.',
          )}
        </p>
      )}
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
        {section !== 'audit' && section !== 'academy' && (
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
              {section === 'academy_orders' ? (
                <>
                  <option value="requested">{t('درخواست قیمت', 'Quote requested')}</option>
                  <option value="pending">{t('در انتظار پرداخت', 'Pending payment')}</option>
                  <option value="paid">{t('پرداخت‌شده', 'Paid')}</option>
                  <option value="cancelled">{t('لغوشده', 'Cancelled')}</option>
                  <option value="refunded">{t('بازپرداخت‌شده', 'Refunded')}</option>
                </>
              ) : (
                <>
                  <option value="active">{t('فعال', 'Active')}</option>
                  <option
                    value={
                      section === 'workspaces'
                        ? 'archived'
                        : section === 'subscriptions' || section === 'academy_subscriptions'
                          ? 'revoked'
                          : 'inactive'
                    }
                  >
                    {section === 'workspaces'
                      ? t('بایگانی‌شده', 'Archived')
                      : section === 'subscriptions' || section === 'academy_subscriptions'
                        ? t('لغوشده', 'Revoked')
                        : t('غیرفعال', 'Inactive')}
                  </option>
                </>
              )}
            </select>
          </label>
        )}
        <button type="submit" className="op-primary">
          <OperatorIcon name="search" size={18} />
          {t('جست‌وجو', 'Search')}
        </button>
        <button type="button" onClick={() => setReload((value) => value + 1)}>
          <OperatorIcon name="refresh" size={18} />
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
              aria-label={t('جدول ', 'Table: ') + titles[section][english ? 1 : 0]}
              tabIndex={0}
            >
              <table>
                <caption>{titles[section][english ? 1 : 0]}</caption>
                <thead>
                  <tr>
                    {keys.map((key) => (
                      <th key={key} scope="col">
                        {names[key]?.[english ? 1 : 0] ?? key}
                      </th>
                    ))}
                    {((section === 'accounts' && capabilities.manage_accounts) ||
                      (section === 'subscriptions' && capabilities.revoke)) && (
                      <th scope="col">{t('عملیات', 'Actions')}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((row) => (
                    <tr key={String(row.id ?? `${row.source}:${row.event_id}`)}>
                      {keys.map((key) => (
                        <td key={key}>{display(row[key], key)}</td>
                      ))}
                      {section === 'accounts' && capabilities.manage_accounts && (
                        <td>
                          <button
                            onClick={() =>
                              setAction({
                                kind: 'account-status',
                                id: String(row.id),
                                active: row.is_active === true,
                              })
                            }
                          >
                            {row.is_active
                              ? t('غیرفعال‌کردن', 'Deactivate')
                              : t('فعال‌کردن', 'Activate')}
                          </button>
                        </td>
                      )}
                      {section === 'subscriptions' && capabilities.revoke && (
                        <td>
                          {row.status === 'active' ? (
                            <button
                              className="op-danger"
                              onClick={() => setAction({ kind: 'revoke', id: String(row.id) })}
                            >
                              {t('لغو دسترسی', 'Revoke access')}
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
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
      {action && (
        <OperatorActionDialog
          action={action}
          english={english}
          onClose={() => setAction(null)}
          onReauthenticate={onReauthenticate}
          onDone={() => {
            setAction(null);
            setSuccess(t('تغییر با موفقیت ثبت شد.', 'Change saved successfully.'));
            setReload((value) => value + 1);
          }}
        />
      )}
    </section>
  );
}
