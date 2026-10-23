import { useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@stratino/ui';
import { requestApi } from '../../api/client';
import { AcademyIcon } from './AcademyIcons';
import { faNumber } from './connectedData';

type Plan = {
  id: number;
  code: string;
  title: string;
  kind: 'free' | 'full' | 'general' | 'specialty';
  price: number | null;
  currency: string;
  duration_days: number | null;
};
type PlanData = {
  plans: Plan[];
  areas: { id: string; title: string }[];
  subscriptions: {
    id: string;
    title: string;
    coverage: string;
    status: string;
    starts_at: string;
    ends_at: string | null;
    areas: string[];
  }[];
  payment_enabled: boolean;
};
export function AcademySubscriptions({ authenticated }: { authenticated: boolean }) {
  const location = useLocation();
  const [params] = useSearchParams();
  const query = useQuery({
    queryKey: ['academy-plans', authenticated],
    queryFn: () => requestApi<PlanData>('/api/v1/academy/plans/'),
  });
  const [planId, setPlanId] = useState<number | null>(() =>
    params.get('plan') ? Number(params.get('plan')) : null,
  );
  const [areas, setAreas] = useState<string[]>(() =>
    (params.get('areas') ?? '').split(',').filter(Boolean),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const requestId = useRef(crypto.randomUUID());
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
  const selected = query.data.plans.find((p) => p.id === planId);
  async function submit() {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await requestApi<{ message: string }>('/api/v1/academy/orders/', {
        method: 'POST',
        body: {
          request_id: requestId.current,
          plan_id: selected.id,
          area_ids: selected.kind === 'specialty' ? areas : [],
        },
      });
      setMessage(result.message ?? 'درخواستت ثبت شده؛ پرداخت هنوز فعال نیست.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const descriptions = {
    free: 'چند کارت از تک‌تک درس‌نامه‌های عمومی و یک درس منتخب گرایش‌ها؛ همیشه برای شروع در دسترسه.',
    general: 'همهٔ درس‌نامه‌ها، تمرین‌ها و مرورهای بخش عمومی.',
    specialty: 'یک یا چند گرایش رو انتخاب کن؛ آموزش، تمرین و مرور همون گرایش‌ها برات باز می‌شه.',
    full: 'تمام محتوای آکادمی؛ عمومی، همهٔ گرایش‌ها و درس‌های تکمیلی.',
  };
  return (
    <section className="academy-page academy-subscriptions">
      <Link
        to={
          params.get('course')
            ? `/academy?course=${encodeURIComponent(params.get('course')!)}`
            : '/academy'
        }
      >
        بازگشت به آموزش
      </Link>
      <h1>اشتراک مناسب یادگیری تو</h1>
      <p>عمومی، گرایش‌های دلخواه یا کل آکادمی رو انتخاب کن.</p>
      <p className="learning-notice">
        قیمت و مدت اشتراک‌ها هنوز نهایی نشده. فعلاً پرداخت انجام نمی‌شه؛ می‌تونی انتخابت رو به‌عنوان
        درخواست خرید ثبت کنی.
      </p>
      <div className="academy-plan-grid">
        {query.data.plans.map((plan) => (
          <button
            type="button"
            key={plan.id}
            className={`academy-plan${plan.kind === 'full' ? ' academy-plan--full' : ''}`}
            disabled={busy || plan.kind === 'free'}
            aria-pressed={planId === plan.id}
            onClick={() => {
              setPlanId(plan.id);
              requestId.current = crypto.randomUUID();
              setMessage('');
            }}
          >
            <AcademyIcon
              name={plan.kind === 'full' ? 'trophy' : plan.kind === 'specialty' ? 'target' : 'book'}
            />
            <h2>{plan.title}</h2>
            <p>{descriptions[plan.kind]}</p>
            <strong>
              {plan.kind === 'free'
                ? 'برای همه فعاله'
                : plan.price === null
                  ? 'قیمت به‌زودی مشخص می‌شه'
                  : `${faNumber(plan.price)} ${plan.currency === 'IRR' ? 'ریال' : plan.currency}${plan.kind === 'specialty' ? ' برای هر گرایش' : ''}`}
            </strong>
            {plan.duration_days && <small>{faNumber(plan.duration_days)} روز</small>}
            {plan.kind !== 'free' && (
              <span>{planId === plan.id ? 'انتخاب شده ✓' : 'انتخاب اشتراک'}</span>
            )}
          </button>
        ))}
      </div>
      {selected?.kind === 'specialty' && (
        <fieldset className="academy-area-choices" disabled={busy}>
          <legend>کدوم گرایش‌ها رو می‌خوای؟</legend>
          {query.data.areas.map((area) => (
            <label key={area.id}>
              <input
                type="checkbox"
                checked={areas.includes(area.id)}
                onChange={(event) => {
                  setAreas((current) =>
                    event.target.checked
                      ? [...current, area.id]
                      : current.filter((id) => id !== area.id),
                  );
                  requestId.current = crypto.randomUUID();
                  setMessage('');
                }}
              />
              <span>{area.title}</span>
            </label>
          ))}
          <p>{faNumber(areas.length)} گرایش انتخاب کردی.</p>
        </fieldset>
      )}
      {selected && (
        <div className="academy-plan-confirm">
          <h2>انتخابت رو ثبت کنیم؟</h2>
          <p>
            {selected.title}
            {selected.kind === 'specialty' ? ` · ${faNumber(areas.length)} گرایش` : ''}
          </p>
          {authenticated ? (
            <Button
              disabled={busy || !!message || (selected.kind === 'specialty' && !areas.length)}
              onClick={() => void submit()}
            >
              {busy ? 'داریم ثبت می‌کنیم…' : 'ثبت درخواست خرید'}
            </Button>
          ) : (
            <Link
              className="ui-button ui-button--primary"
              to={`/account/login?next=${encodeURIComponent(location.pathname + '?' + new URLSearchParams({ course: params.get('course') ?? '', plan: String(planId), areas: areas.join(',') }).toString())}`}
            >
              ورود و ادامهٔ انتخاب
            </Link>
          )}
          <p role="status">{message}</p>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      {!!query.data.subscriptions.length && (
        <section>
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
