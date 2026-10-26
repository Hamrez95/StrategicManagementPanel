import { useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@stratino/ui';
import { requestApi } from '../../api/client';
import { AcademyIcon } from './AcademyIcons';
import { topicArtwork } from './AcademyTopics';
import { Symbol as CourseSymbol } from './CourseHero';
import type { Motif } from './CourseHero';
import { faNumber } from './connectedData';
import './academySubscriptions.css';

type Plan = {
  id: number;
  code: string;
  title: string;
  kind: 'free' | 'full' | 'general' | 'specialty';
  price: number | null;
  sale_price: number | null;
  currency: string;
  duration_days: number | null;
};
type PlanData = {
  plans: Plan[];
  areas: { id: string; title: string }[];
  subscriptions: {
    id: string;
    title: string;
    status: string;
    ends_at: string | null;
    areas: string[];
  }[];
};
type Quote = {
  subtotal: number | null;
  sale_discount: number | null;
  coupon_discount: number;
  total: number | null;
  coupon_code: string;
  currency: string;
};
const descriptions = {
  free: 'چند کارت از هر درس‌نامهٔ عمومی و یک درس منتخب گرایش‌ها؛ برای آشنایی با شیوهٔ آموزش.',
  general: 'پایه‌های مدیریت رو یاد بگیر؛ همهٔ آموزش‌ها، تمرین‌ها و مرورهای بخش عمومی.',
  specialty: 'روی موضوع‌های موردنیازت تمرکز کن؛ یک یا چند گرایش رو خودت انتخاب کن.',
  full: 'تمام درس‌های عمومی، تخصصی و تکمیلی آکادمی رو کنار هم داشته باش.',
};
const areaDescriptions: Record<string, string> = {
  S01: 'رقابت، انتخاب مسیر و اجرای استراتژی',
  S02: 'تصمیم‌های مالی، ارزش و سرمایه‌گذاری',
  S03: 'مشتری، بازار و مسیر رشد کسب‌وکار',
  S04: 'تیم، رهبری و تصمیم‌های مربوط به افراد',
  S05: 'فرایندها، عملیات و زنجیرهٔ تأمین',
  S06: 'ایده، مدل کسب‌وکار و نوآوری',
  S07: 'داده، مدل‌ها و کاربرد AI در کسب‌وکار',
};
const planArt: Record<Plan['kind'], { motif: Motif; color: string }> = {
  free: { motif: 'leaf', color: '#71b596' },
  general: { motif: 'ledger', color: '#6fa6e8' },
  specialty: { motif: 'compass', color: '#b09be8' },
  full: { motif: 'globe', color: '#dfb760' },
};
const money = (value: number, currency: string) =>
  `${faNumber(value)} ${currency === 'IRR' ? 'ریال' : currency}`;
function Illustration({ motif, color }: { motif: Motif; color: string }) {
  return (
    <span
      className="subscription-illustration"
      style={{ '--subscription-color': color } as CSSProperties}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <CourseSymbol motif={motif} />
      </svg>
    </span>
  );
}
function Price({ plan }: { plan: Plan }) {
  const discounted =
    plan.price !== null && plan.sale_price !== null && plan.sale_price < plan.price;
  return (
    <span className="subscription-price">
      {plan.kind === 'free' ? (
        <strong>رایگان</strong>
      ) : plan.price === null ? (
        <strong>قیمت در حال تعیین</strong>
      ) : (
        <>
          {discounted && (
            <span className="subscription-original">
              <del>{money(plan.price, plan.currency)}</del>
              <span>{faNumber(Math.round((1 - plan.sale_price! / plan.price) * 100))}٪ تخفیف</span>
            </span>
          )}
          <strong>{money(plan.sale_price ?? plan.price, plan.currency)}</strong>
        </>
      )}
      <small>
        {plan.kind === 'free'
          ? 'برای همه فعاله'
          : `${plan.kind === 'specialty' ? 'برای هر گرایش' : 'برای این اشتراک'}${plan.duration_days ? ` · ${faNumber(plan.duration_days)} روز` : ' · مدت هنوز مشخص نشده'}`}
      </small>
    </span>
  );
}
export function AcademySubscriptions({ authenticated }: { authenticated: boolean }) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const query = useQuery({
    queryKey: ['academy-plans', authenticated],
    queryFn: () => requestApi<PlanData>('/api/v1/academy/plans/'),
  });
  const requestedPlan = params.get('plan');
  const planId = requestedPlan && /^\d+$/.test(requestedPlan) ? Number(requestedPlan) : null;
  const areas = (params.get('areas') ?? '').split(',').filter(Boolean);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const couponCode = params.get('coupon') ?? '';
  const [couponDraft, setCouponDraft] = useState({ key: couponCode, value: couponCode });
  const couponInput = couponDraft.key === couponCode ? couponDraft.value : couponCode;
  const setCouponInput = (value: string) => setCouponDraft({ key: couponCode, value });
  const requestId = useRef(crypto.randomUUID());
  const requestContext = useRef('');
  const [feedbackContext, setFeedbackContext] = useState('');
  const selected = query.data?.plans.find((p) => p.id === planId && p.kind !== 'free');
  const chosenAreas = (query.data?.areas ?? []).filter((area) => areas.includes(area.id));
  const selectionContext = JSON.stringify([
    selected?.id,
    selected?.kind === 'specialty' ? chosenAreas.map((area) => area.id) : [],
    couponCode,
  ]);
  const currentMessage = feedbackContext === selectionContext ? message : '';
  const currentError = feedbackContext === selectionContext ? error : '';
  const selectionReady = !!selected && (selected.kind !== 'specialty' || chosenAreas.length > 0);
  const pricing = useQuery({
    queryKey: [
      'academy-price',
      selected?.id,
      selected?.kind === 'specialty' ? chosenAreas.map((a) => a.id) : [],
      couponCode,
    ],
    queryFn: ({ signal }) =>
      requestApi<Quote>('/api/v1/academy/price-quote/', {
        method: 'POST',
        signal,
        body: {
          plan_id: selected!.id,
          area_ids: selected!.kind === 'specialty' ? chosenAreas.map((a) => a.id) : [],
          coupon_code: couponCode,
        },
      }),
    enabled: selectionReady,
    retry: false,
  });
  function resetRequest() {
    requestId.current = crypto.randomUUID();
    setMessage('');
    setError('');
  }
  function changeSelection(name: 'plan' | 'areas' | 'coupon', value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(name, value);
        else next.delete(name);
        return next;
      },
      { replace: true },
    );
    resetRequest();
  }
  function applyCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = couponInput.trim().toUpperCase();
    changeSelection('coupon', code);
    if (couponCode === code) void pricing.refetch();
  }
  async function submit() {
    if (!selected || busy || !pricing.data || pricing.isError || pricing.isFetching) return;
    setBusy(true);
    if (requestContext.current !== selectionContext) {
      requestContext.current = selectionContext;
      requestId.current = crypto.randomUUID();
    }
    setFeedbackContext(selectionContext);
    setError('');
    setMessage('');
    try {
      const result = await requestApi<{ message: string }>('/api/v1/academy/orders/', {
        method: 'POST',
        body: {
          request_id: requestId.current,
          plan_id: selected.id,
          area_ids: selected.kind === 'specialty' ? chosenAreas.map((a) => a.id) : [],
          coupon_code: couponCode,
        },
      });
      setMessage(result.message ?? 'درخواستت ثبت شده؛ پرداخت هنوز فعال نیست.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending)
    return (
      <p className="academy-page" role="status">
        داریم اشتراک‌ها رو آماده می‌کنیم…
      </p>
    );
  if (query.isError)
    return (
      <div className="academy-page">
        <p role="alert">{query.error.message}</p>
        <Button onClick={() => void query.refetch()}>تلاش دوباره</Button>
      </div>
    );
  const total = pricing.isError ? undefined : pricing.data;
  return (
    <section className="academy-page academy-subscriptions">
      <Link
        className="subscription-back"
        to={
          params.get('course')
            ? `/academy?course=${encodeURIComponent(params.get('course')!)}`
            : '/academy'
        }
      >
        برگشتن به آموزش
      </Link>
      <header className="subscription-heading">
        <div>
          <h1>مقایسهٔ اشتراک‌های آکادمی</h1>
          <p>
            از پایه‌های مدیریت شروع کن، روی یک گرایش تمرکز کن یا همهٔ آکادمی رو کنار هم داشته باش.
          </p>
        </div>
        <Illustration {...planArt.full} />
      </header>
      <p role="status" className="subscription-section-note">
        {selected
          ? `اشتراک انتخاب‌شده: ${selected.title}`
          : requestedPlan
            ? 'این اشتراک در دسترس نیست؛ یکی از گزینه‌های فعال رو انتخاب کن.'
            : 'هنوز اشتراکی انتخاب نکردی. گزینه‌ها رو مقایسه کن و مورد مناسب خودت رو انتخاب کن.'}
      </p>
      <div className="academy-plan-grid" role="group" aria-label="انتخاب نوع اشتراک">
        {query.data.plans.map((plan) => (
          <button
            type="button"
            key={plan.id}
            className={`academy-plan${plan.kind === 'full' ? ' academy-plan--full' : ''}`}
            disabled={busy || plan.kind === 'free'}
            aria-pressed={selected?.id === plan.id}
            onClick={() => {
              changeSelection('plan', String(plan.id));
            }}
          >
            <span className="subscription-plan-top">
              <Illustration {...planArt[plan.kind]} />
              <span className="subscription-plan-mark">
                {plan.kind === 'free'
                  ? 'برای شروع'
                  : selected?.id === plan.id
                    ? 'انتخاب تو ✓'
                    : plan.kind === 'full'
                      ? 'همهٔ آکادمی'
                      : 'انتخاب اشتراک'}
              </span>
            </span>
            <h2>{plan.title}</h2>
            <p>{descriptions[plan.kind]}</p>
            <Price plan={plan} />
          </button>
        ))}
      </div>
      <div className="subscription-selection-layout">
        <div className="subscription-selection-main">
          {selected?.kind === 'specialty' ? (
            <fieldset className="academy-area-choices" disabled={busy}>
              <legend>گرایش‌های دلخواهت رو کنار هم بذار</legend>
              <p className="subscription-section-note">
                می‌تونی یک یا چند گرایش انتخاب کنی. همهٔ درس‌ها، تمرین‌ها و مرورهای هر گرایش
                همراهشه.
              </p>
              <div className="subscription-area-grid">
                {query.data.areas.map((area) => {
                  const art = topicArtwork[area.id] ?? topicArtwork.GENERAL,
                    checked = chosenAreas.some((a) => a.id === area.id);
                  return (
                    <label
                      key={area.id}
                      className={`subscription-area${checked ? ' subscription-area--selected' : ''}`}
                      style={{ '--subscription-color': art.color } as CSSProperties}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          changeSelection(
                            'areas',
                            (event.target.checked
                              ? [...areas, area.id]
                              : areas.filter((id) => id !== area.id)
                            ).join(','),
                          );
                        }}
                      />
                      <span className="subscription-area-check" aria-hidden="true">
                        {checked ? '✓' : '+'}
                      </span>
                      <Illustration {...art} />
                      <span className="subscription-area-copy">
                        <strong>{area.title}</strong>
                        <span>{areaDescriptions[area.id] ?? 'آموزش، تمرین و مرور این گرایش'}</span>
                        <Price plan={selected} />
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            selected && (
              <section className="subscription-included">
                <Illustration {...planArt[selected.kind]} />
                <h2>این اشتراک چی در اختیارت می‌ذاره؟</h2>
                <p>{descriptions[selected.kind]}</p>
                <ul>
                  <li>کارت‌های آموزش و مثال همراه تصویر و جدول</li>
                  <li>تمرین‌های مرتبط و مرور مرحله‌ها</li>
                  <li>ذخیرهٔ پیشرفت و یادداشت‌ها در حسابت</li>
                </ul>
              </section>
            )
          )}
          <p className="subscription-payment-note">
            قیمت و مدت اشتراک‌ها هنوز نهایی نشده. فعلاً فقط درخواستت ثبت می‌شه؛ پرداخت و فعال‌سازی
            خرید هنوز راه‌اندازی نشده.
          </p>
        </div>
        {selected && (
          <aside className="subscription-checkout" aria-label="خلاصهٔ انتخاب و هزینه">
            <div className="subscription-checkout-heading">
              <AcademyIcon name="book" />
              <h2>انتخاب تو</h2>
            </div>
            <strong>{selected.title}</strong>
            {selected.kind === 'specialty' && (
              <>
                <p className="subscription-selection-count" role="status">
                  {chosenAreas.length
                    ? `${faNumber(chosenAreas.length)} گرایش انتخاب کردی`
                    : 'اول یک گرایش انتخاب کن'}
                </p>
                <div className="subscription-selected-tags">
                  {chosenAreas.map((area) => (
                    <span key={area.id}>{area.title}</span>
                  ))}
                </div>
              </>
            )}
            <dl className="subscription-totals">
              <div>
                <dt>قیمت اصلی</dt>
                <dd>
                  {selectionReady && total?.subtotal != null
                    ? money(total.subtotal, total.currency)
                    : 'هنوز مشخص نشده'}
                </dd>
              </div>
              <div>
                <dt>تخفیف اشتراک</dt>
                <dd>
                  {total?.sale_discount ? `−${money(total.sale_discount, total.currency)}` : '—'}
                </dd>
              </div>
              {!!total?.coupon_discount && (
                <div>
                  <dt>تخفیف کد</dt>
                  <dd>−{money(total.coupon_discount, total.currency)}</dd>
                </div>
              )}
              <div className="subscription-total">
                <dt>مبلغ نهایی</dt>
                <dd>
                  {selectionReady && total?.total != null
                    ? money(total.total, total.currency)
                    : 'در انتظار قیمت‌گذاری'}
                </dd>
              </div>
            </dl>
            <form className="subscription-coupon" onSubmit={applyCoupon}>
              <label htmlFor="academy-coupon">کد تخفیف داری؟</label>
              <div>
                <input
                  id="academy-coupon"
                  value={couponInput}
                  maxLength={48}
                  autoComplete="off"
                  placeholder="کد رو اینجا بنویس"
                  disabled={busy}
                  aria-describedby="academy-coupon-status"
                  onChange={(event) => setCouponInput(event.target.value)}
                />
                <Button
                  type="submit"
                  variant="quiet"
                  disabled={!selectionReady || busy || pricing.isFetching || !couponInput.trim()}
                >
                  اعمال
                </Button>
              </div>
              <p id="academy-coupon-status" role={pricing.isError ? 'alert' : 'status'}>
                {pricing.isFetching && selectionReady
                  ? 'داریم هزینه رو بررسی می‌کنیم…'
                  : pricing.isError
                    ? pricing.error.message
                    : total?.coupon_code
                      ? `کد ${total.coupon_code} اعمال شد.`
                      : 'کد، روی مبلغ پس از تخفیف اشتراک اعمال می‌شه.'}
              </p>
              {couponCode && (
                <button
                  className="subscription-remove-coupon"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    changeSelection('coupon', '');
                    setCouponInput('');
                    resetRequest();
                  }}
                >
                  حذف کد تخفیف
                </button>
              )}
            </form>
            {authenticated ? (
              <Button
                disabled={
                  busy ||
                  !!currentMessage ||
                  !selectionReady ||
                  pricing.isFetching ||
                  !total ||
                  pricing.isError
                }
                onClick={() => void submit()}
              >
                {busy ? 'داریم ثبت می‌کنیم…' : 'ثبت درخواست خرید'}
              </Button>
            ) : (
              <Link
                className="ui-button ui-button--primary"
                to={`/account/login?next=${encodeURIComponent(location.pathname + '?' + new URLSearchParams({ course: params.get('course') ?? '', plan: String(selected.id), areas: chosenAreas.map((a) => a.id).join(','), coupon: couponCode }).toString())}`}
              >
                ورود و ادامهٔ انتخاب
              </Link>
            )}
            <p className="subscription-checkout-note">
              ثبت درخواست، پرداخت یا فعال‌سازی اشتراک نیست.
            </p>
            <p role="status">{currentMessage}</p>
            {currentError && <p role="alert">{currentError}</p>}
          </aside>
        )}
      </div>
      {!!query.data.subscriptions.length && (
        <section className="subscription-owned">
          <h2>اشتراک‌های تو</h2>
          {query.data.subscriptions.map((row) => (
            <article className="academy-owned-plan" key={row.id}>
              <h3>{row.title}</h3>
              <p>
                {row.status === 'expired'
                  ? 'منقضی شده'
                  : row.status === 'scheduled'
                    ? 'از تاریخ شروع فعال می‌شه'
                    : row.status === 'active'
                      ? 'فعال'
                      : 'لغوشده'}
              </p>
              {row.areas.map((id) => (
                <span key={id}>{query.data.areas.find((a) => a.id === id)?.title ?? id} </span>
              ))}
              {row.ends_at && <p>تا {new Date(row.ends_at).toLocaleDateString('fa-IR')}</p>}
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
