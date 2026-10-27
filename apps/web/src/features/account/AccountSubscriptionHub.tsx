import { useEffect } from 'react';
import { useUIAppearance } from '@stratino/ui';
import { accountMessages } from './accountMessages';
import { Link, useLocation, useOutletContext } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { requestApi } from '../../api/client';
import type { Session } from '../../session';
import { Icon } from '../experience/ExperienceUI';
import './accountSubscriptions.css';

type Kind = 'free' | 'general' | 'specialty' | 'full';
type Plan = {
  id: number;
  code: string;
  title: string;
  kind: Kind;
  price: number | null;
  sale_price: number | null;
  currency: string;
  duration_days: number | null;
};
type Subscription = {
  id: string;
  title: string;
  coverage: Kind;
  status: string;
  is_effective: boolean;
  starts_at: string;
  ends_at: string | null;
  areas: string[];
  effective_areas: string[];
  source: string;
  order_id: string | null;
};
type Order = {
  id: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  items: {
    title: string;
    coverage: Kind;
    currency: string;
    total: number | null;
    discount_amount: number | null;
    coupon_code: string;
    areas: string[];
  }[];
};
type Summary = {
  user_id: string;
  academy: {
    plans: Plan[];
    areas: { id: string; title: string }[];
    subscriptions: Subscription[];
    orders: Order[];
    payment_enabled: boolean;
    order_history_limit: number;
    access_summary: { full: boolean; general: boolean; area_ids: string[]; free_sample: boolean };
  };
  management: {
    billing_status: string | null;
    owned_workspaces: number;
    archived_workspaces: number;
    joined_workspaces: number;
    plans_configured: boolean;
    access?: {
      accessLevel: 'free' | 'special';
      owned_workspace_limit: number | null;
      can_create_workspace: boolean;
      features: {
        can_finalize_analysis: boolean;
        can_calculate_metrics: boolean;
        can_generate_reports: boolean;
      };
      subscriptions: { id: string; title: string; starts_at: string; ends_at: string | null }[];
    };
  };
};

const statusText: Record<string, string> = {
  active: 'فعال',
  scheduled: 'شروع در آینده',
  expired: 'پایان‌یافته',
  revoked: 'لغوشده',
  requested: 'درخواست ثبت‌شده',
  pending: 'در انتظار پرداخت',
  paid: 'پرداخت‌شده',
  cancelled: 'لغوشده',
  refunded: 'بازپرداخت‌شده',
};
const plansCopy: Record<Kind, { icon: string; description: string; features: string[] }> = {
  free: {
    icon: 'book',
    description: 'اول با شیوهٔ یادگیری آشنا شو.',
    features: [
      'چند کارت اول هر درس‌نامهٔ عمومی',
      'چند کارت از یک درس منتخب گرایش‌ها',
      'ذخیرهٔ پیشرفت و یادداشت در حسابت',
    ],
  },
  general: {
    icon: 'chart',
    description: 'پایه‌های مشترک مدیریت رو یک‌جا دنبال کن.',
    features: [
      'درس‌های عمومی مدیریت',
      'کارت‌ها، تمرین‌ها و مرورهای عمومی',
      'دسترسی مستقل از ترتیب پیشنهادی مسیر',
    ],
  },
  specialty: {
    icon: 'compass',
    description: 'یک یا چند گرایش رو متناسب با نیازت انتخاب کن.',
    features: [
      'انتخاب گرایش موقع خرید',
      'درس‌ها و مرورهای گرایش‌های انتخابی',
      'فعال‌شدن دسترسی‌های مرتبط با همون گرایش',
    ],
  },
  full: {
    icon: 'spark',
    description: 'کل محتوای آکادمی رو در دسترس داشته باش.',
    features: ['همهٔ درس‌های عمومی', 'همهٔ گرایش‌های تخصصی', 'درس‌های تکمیلی و آماده‌سازی'],
  },
};

export default function AccountSubscriptionHub() {
  const english = useUIAppearance().dir === 'ltr';
  const t = (value: string) => (english ? (accountMessages[value] ?? value) : value);
  const number = (value: number) => new Intl.NumberFormat(english ? 'en' : 'fa-IR').format(value);
  const date = (value: string) =>
    new Intl.DateTimeFormat(english ? 'en' : 'fa-IR', { dateStyle: 'medium' }).format(
      new Date(value),
    );
  const amount = (value: number, currency: string) =>
    number(value) + ' ' + (currency === 'IRR' ? (english ? 'IRR' : 'ریال') : currency);
  const session = useOutletContext<Session>(),
    location = useLocation();
  const query = useQuery({
    queryKey: ['account', 'subscriptions', session.user.id],
    queryFn: ({ signal }) => requestApi<Summary>('/api/v1/account/subscriptions/', { signal }),
  });
  useEffect(() => {
    if (query.data && location.hash)
      requestAnimationFrame(() =>
        document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' }),
      );
  }, [query.data, location.hash]);
  if (query.isPending)
    return (
      <section id="subscription" className="account-card" aria-busy="true">
        <h2>{t('اشتراک‌های من')} </h2>
        <p role="status">{t('داریم اشتراک‌ها و دسترسی‌هات رو بررسی می‌کنیم…')} </p>
      </section>
    );
  if (query.isError)
    return (
      <section id="subscription" className="account-card">
        <h2>{t('اشتراک‌های من')} </h2>
        <p role="alert">{t('اطلاعات اشتراک‌ها بارگذاری نشد. دسترسی‌هات تغییر نکرده.')} </p>
        <button className="ui-button" type="button" onClick={() => void query.refetch()}>
          {t('تلاش دوباره')}{' '}
        </button>
      </section>
    );
  const { academy, management } = query.data,
    access = academy.access_summary;
  const areaTitle = (id: string) => t(academy.areas.find((area) => area.id === id)?.title ?? id);
  const active = academy.subscriptions.filter((row) => row.is_effective);
  const covered = (kind: Kind) =>
    kind === 'free' ||
    (kind === 'full'
      ? access.full
      : kind === 'general'
        ? access.general
        : access.area_ids.length > 0);
  return (
    <section
      id="subscription"
      className="account-live-subscriptions"
      aria-labelledby="account-subscriptions-heading"
    >
      <header className="account-subscription-intro">
        <div>
          <p>{t('خریدها و دسترسی‌های تو')} </p>
          <h2 id="account-subscriptions-heading">{t('اشتراک‌های من')} </h2>
          <span>
            {t('هر اشتراک به همین حساب وصله؛ دسترسی آکادمی و پنل جدا از هم نگهداری می‌شن.')}{' '}
          </span>
        </div>
        <img
          src={new URL('../../assets/home/academy-orbit.webp', import.meta.url).href}
          alt=""
          width="110"
          height="110"
          loading="lazy"
        />
      </header>
      <section
        id="academy-plans"
        className="account-card account-academy-access"
        aria-labelledby="account-academy-title"
      >
        <div className="account-subscription-heading">
          <div>
            <h3 id="account-academy-title">{t('دسترسی آکادمی')} </h3>
            <p>
              {active.length
                ? t('این دسترسی‌ها همین الان برای حسابت فعالن.')
                : t('نمونه‌های رایگان برای حسابت فعالن. هنوز اشتراک ویژه فعالی نداری.')}
            </p>
          </div>
          <span
            className={`account-access-badge${access.full ? ' account-access-badge--gold' : ''}`}
          >
            <Icon name={access.full ? 'spark' : 'book'} size={17} />
            {access.full ? t('دسترسی کامل') : active.length ? t('اشتراک فعال') : t('نمونهٔ رایگان')}
          </span>
        </div>
        <div className="account-access-facts">
          <div>
            <strong>{number(active.length)}</strong>
            <span>{t('اشتراک ویژه فعال')} </span>
          </div>
          <div>
            <strong>{access.general ? t('فعال') : t('نمونهٔ رایگان')}</strong>
            <span>{t('بخش عمومی')} </span>
          </div>
          <div>
            <strong>{number(access.area_ids.length)}</strong>
            <span>{t('گرایش با دسترسی کامل')} </span>
          </div>
        </div>
        {!!access.area_ids.length && (
          <div className="account-area-tags" aria-label={t('گرایش‌های فعال')}>
            {access.area_ids.map((id) => (
              <Link key={id} to={`/academy/catalog?area=${encodeURIComponent(id)}`}>
                <Icon name="check" size={14} />
                {areaTitle(id)}
              </Link>
            ))}
          </div>
        )}
        <div className="account-subscription-actions">
          <Link className="ui-button ui-button--primary" to="/academy">
            {t('ادامهٔ یادگیری')}{' '}
          </Link>
          <Link className="ui-button ui-button--secondary" to="/academy/subscriptions">
            {t('مقایسه و انتخاب اشتراک')}{' '}
          </Link>
        </div>
        <p className="account-access-hint">
          {t(
            'نمونهٔ رایگان شامل چند کارت اول تک‌تک درس‌نامه‌های عمومی و چند کارت از یک درس منتخب گرایش‌هاست.',
          )}{' '}
        </p>
      </section>
      <section className="account-owned-section" aria-labelledby="account-owned-title">
        <h3 id="account-owned-title">{t('اشتراک‌های ثبت‌شده')} </h3>
        {!academy.subscriptions.length ? (
          <div className="account-subscription-empty">
            <Icon name="compass" size={26} />
            <div>
              <strong>{t('وقتی اشتراکی فعال کنی، اینجا می‌بینیش.')} </strong>
              <p>{t('نوع پوشش، گرایش‌ها و تاریخ شروع و پایانش همین‌جا ثبت می‌شن.')} </p>
            </div>
          </div>
        ) : (
          <div className="account-owned-grid">
            {academy.subscriptions.map((row) => (
              <article
                key={row.id}
                className={`account-owned-card account-owned-card--${row.coverage}`}
              >
                <header>
                  <span className="account-plan-symbol">
                    <Icon name={plansCopy[row.coverage]?.icon ?? 'book'} size={23} />
                  </span>
                  <span
                    className={`account-subscription-status account-subscription-status--${row.status}`}
                  >
                    {t(statusText[row.status] ?? row.status)}
                  </span>
                </header>
                <h4>{t(row.title)}</h4>
                <dl>
                  <div>
                    <dt>{t('شروع')} </dt>
                    <dd>{date(row.starts_at)}</dd>
                  </div>
                  <div>
                    <dt>{t('پایان')} </dt>
                    <dd>{row.ends_at ? date(row.ends_at) : t('تاریخ پایان ثبت نشده')}</dd>
                  </div>
                </dl>
                {row.coverage === 'specialty' && (
                  <div className="account-area-tags">
                    {row.areas.map((id) => (
                      <span key={id}>
                        {areaTitle(id)}
                        {row.is_effective && !row.effective_areas.includes(id)
                          ? t(' · غیرفعال')
                          : ''}
                      </span>
                    ))}
                  </div>
                )}
                <p>
                  {row.source === 'purchase'
                    ? t('فعال‌شده از خرید ثبت‌شده')
                    : t('فعال‌شده برای این حساب')}
                </p>
                <span className="account-subscription-reference">
                  {t('شناسهٔ اشتراک')} <bdi dir="ltr">{row.id.slice(0, 8)}</bdi>
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="account-plan-options" aria-labelledby="account-plan-options-title">
        <div className="account-subscription-heading">
          <div>
            <h3 id="account-plan-options-title">{t('مسیر مناسب خودت رو انتخاب کن')} </h3>
            <p>{t('مدت و قیمت هر پلن از تنظیمات خودش خونده می‌شه.')} </p>
          </div>
        </div>
        <div className="account-plan-grid">
          {[...academy.plans]
            .sort(
              (a, b) =>
                ['free', 'general', 'specialty', 'full'].indexOf(a.kind) -
                ['free', 'general', 'specialty', 'full'].indexOf(b.kind),
            )
            .map((plan) => (
              <article
                className={`account-plan-option account-plan-option--${plan.kind}`}
                key={plan.id}
              >
                <span className="account-plan-symbol">
                  <Icon name={plansCopy[plan.kind].icon} size={25} />
                </span>
                <h4>{t(plan.title)}</h4>
                <p>{t(plansCopy[plan.kind].description)}</p>
                <ul>
                  {plansCopy[plan.kind].features.map((feature) => (
                    <li key={t(feature)}>
                      <Icon name="check" size={14} />
                      {t(feature)}
                    </li>
                  ))}
                </ul>
                <div className="account-plan-price">
                  {plan.kind === 'free' ? (
                    <strong>{t('رایگان')} </strong>
                  ) : plan.price === null ? (
                    <strong>{t('قیمت هنوز تعیین نشده')} </strong>
                  ) : (
                    <>
                      {plan.sale_price !== null && plan.sale_price < plan.price && (
                        <del>{amount(plan.price, plan.currency)}</del>
                      )}
                      <strong>{amount(plan.sale_price ?? plan.price, plan.currency)}</strong>
                    </>
                  )}
                  {plan.kind !== 'free' && (
                    <small>
                      {plan.duration_days
                        ? english
                          ? `${number(plan.duration_days)} days of access`
                          : `${number(plan.duration_days)} روز دسترسی`
                        : t('مدت اشتراک هنوز تعیین نشده')}
                    </small>
                  )}
                </div>
                {covered(plan.kind) && (
                  <span className="account-covered-note">
                    <Icon name="check" size={14} />
                    {plan.kind === 'free' ? t('برای همه فعاله') : t('این پوشش رو در دسترس داری')}
                  </span>
                )}
                <Link
                  className="account-plan-choose"
                  to={
                    plan.kind === 'free'
                      ? '/academy/catalog'
                      : `/academy/subscriptions?plan=${plan.id}`
                  }
                >
                  {plan.kind === 'free'
                    ? t('دیدن نمونه‌ها')
                    : plan.kind === 'specialty'
                      ? t('انتخاب گرایش‌ها')
                      : t('دیدن جزئیات')}
                  <Icon name="arrow" size={17} />
                </Link>
              </article>
            ))}
        </div>
        {!academy.payment_enabled && (
          <p className="account-payment-note">
            <Icon name="shield" size={18} />
            {t(
              'پرداخت آنلاین هنوز فعال نیست. می‌تونی گزینه‌ها رو مقایسه کنی؛ ثبت درخواست به‌تنهایی دسترسی ویژه ایجاد نمی‌کنه.',
            )}{' '}
          </p>
        )}
      </section>
      <section
        className="account-card account-order-history"
        aria-labelledby="account-orders-title"
      >
        <h3 id="account-orders-title">{t('سابقهٔ سفارش‌ها')} </h3>
        {!academy.orders.length ? (
          <p className="account-orders-empty">{t('هنوز سفارشی ثبت نکردی.')} </p>
        ) : (
          <>
            <p className="account-orders-empty">
              {english
                ? `The latest ${number(academy.order_history_limit)} orders for this account; amounts reflect the original order.`
                : `${number(academy.order_history_limit)} سفارش آخر این حساب؛ مبلغ‌ها مربوط به زمان ثبت همون سفارش‌اند.`}
            </p>
            <div className="account-order-list">
              {academy.orders.map((order) => (
                <details key={order.id}>
                  <summary>
                    <span>
                      {order.items.map((item) => t(item.title)).join(english ? ', ' : '، ') ||
                        t('سفارش اشتراک')}
                    </span>
                    <span
                      className={`account-subscription-status account-subscription-status--${order.status}`}
                    >
                      {order.status === 'cancelled' && english
                        ? 'Cancelled'
                        : t(statusText[order.status] ?? order.status)}
                    </span>
                    <time dateTime={order.created_at}>{date(order.created_at)}</time>
                  </summary>
                  <div className="account-order-detail">
                    <p>
                      {t('شناسهٔ سفارش')} <bdi dir="ltr">{order.id}</bdi>
                    </p>
                    {order.items.map((item, index) => (
                      <div key={index}>
                        <strong>{t(item.title)}</strong>
                        {!!item.areas.length && (
                          <p>{item.areas.map(areaTitle).join(english ? ', ' : '، ')}</p>
                        )}
                        <p>
                          {item.total === null
                            ? t('مبلغ نهایی ثبت نشده')
                            : english
                              ? `Final amount: ${amount(item.total, item.currency)}`
                              : `مبلغ نهایی: ${amount(item.total, item.currency)}`}
                        </p>
                        {!!item.discount_amount && (
                          <p>
                            {t('تخفیف:')} {amount(item.discount_amount, item.currency)}
                          </p>
                        )}
                        {item.coupon_code && (
                          <p>
                            {t('کد تخفیف:')} <bdi dir="ltr">{item.coupon_code}</bdi>
                          </p>
                        )}
                      </div>
                    ))}
                    {order.status !== 'paid' && (
                      <p>{t('این سفارش به‌خودی‌خود اشتراک فعال محسوب نمی‌شه.')} </p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </>
        )}
      </section>
      <section
        id="management-plans"
        className="account-card account-management-access"
        aria-labelledby="account-management-title"
      >
        <div className="account-subscription-heading">
          <div>
            <h3 id="account-management-title">{t('فضاهای کاری تو')} </h3>
            <p>{t('این بخش به پنل مدیریت مربوطه و از اشتراک آکادمی جداست.')} </p>
          </div>
          <Icon name="grid" size={26} />
        </div>
        <div className="account-access-facts">
          <div>
            <strong>{number(management.owned_workspaces)}</strong>
            <span>{t('فضای فعال خودت')} </span>
          </div>
          <div>
            <strong>{number(management.joined_workspaces)}</strong>
            <span>{t('فضای عضو‌شده')} </span>
          </div>
          <div>
            <strong>{number(management.archived_workspaces)}</strong>
            <span>{t('فضای بایگانی‌شده')} </span>
          </div>
        </div>
        {management.billing_status === 'suspended' && (
          <p role="status">{t('حساب فضای کار محدود شده؛ وضعیت اشتراک آکادمی جداست.')} </p>
        )}
        <p className="account-access-hint">
          {management.access?.accessLevel === 'special'
            ? t('اشتراک ویژهٔ پنل برای حسابت فعاله.')
            : t('پنل رایگان شامل یک فضای کاری، اطلاعات پایهٔ کسب‌وکار و پیش‌نویس ابزارهاست.')}{' '}
          {t('دیدن داده‌های قبلی و گرفتن نسخهٔ پشتیبان همیشه در دسترسه.')}{' '}
        </p>
        {management.access && (
          <>
            <p className="account-access-hint">
              {t('ظرفیت فضای کاری فعال:')}{' '}
              {management.access.owned_workspace_limit === null
                ? t('بدون محدودیت پلن')
                : number(management.access.owned_workspace_limit)}
              {t('. عضویت در فضای دیگران از این ظرفیت کم نمی‌کنه.')}{' '}
            </p>
            <ul className="account-plan-benefits">
              <li>
                {t('نهایی‌سازی تحلیل‌ها:')}{' '}
                {management.access.features.can_finalize_analysis
                  ? t('فعاله')
                  : t('با اشتراک ویژه')}
              </li>
              <li>
                {t('محاسبهٔ تأییدشدهٔ شاخص‌ها:')}{' '}
                {management.access.features.can_calculate_metrics
                  ? t('فعاله')
                  : t('با اشتراک ویژه')}
              </li>
            </ul>
            {management.access.subscriptions.map((subscription) => (
              <p key={subscription.id} className="account-access-hint">
                {t(subscription.title)}
                {english ? '; from ' : '؛ از '}
                {date(subscription.starts_at)}
                {subscription.ends_at
                  ? `${english ? ' to ' : ' تا '}${date(subscription.ends_at)}`
                  : ''}
              </p>
            ))}
          </>
        )}
        <Link className="ui-button ui-button--secondary" to="/app/workspaces">
          {t('رفتن به فضاهای من')}{' '}
        </Link>
      </section>
    </section>
  );
}
