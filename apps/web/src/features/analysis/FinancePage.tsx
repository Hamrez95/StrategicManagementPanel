import { useState, type FormEvent } from 'react';
import { useOutletContext, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Notice, Skeleton, useUIAppearance } from '@stratino/ui';
import { ApiError, requestApi } from '../../api/client';
import { postAuth } from '../auth/api';
import { useWorkspaceDirtyGuard } from '../workspaces/switchContext';
import type { Session } from '../../session';

type Observation = {
  binding_id: string;
  value: string | null;
  state: string;
  currency: string;
  period_start: string;
  period_end: string;
  accounting_basis: string;
  cost_scope: string;
  source_id: string;
  reason: string;
};
type Capture = {
  id: string;
  workspace_id: string;
  observations: Observation[];
  run: {
    id: string;
    method_revision: string;
    results: { status: string; value: string | null; reason: string; currency: string }[];
  } | null;
};
function root(id: string) {
  return `/api/v1/workspaces/${encodeURIComponent(id)}/metrics/captures/`;
}
function decode(value: unknown, id: string): Capture {
  const c = value as Capture;
  if (
    !c ||
    typeof c.id !== 'string' ||
    c.workspace_id !== id ||
    !Array.isArray(c.observations) ||
    c.observations.length !== 2 ||
    new Set(c.observations.map((o) => o.binding_id)).size !== 2 ||
    c.observations.some(
      (o) =>
        !['net_revenue', 'variable_costs'].includes(o.binding_id) ||
        typeof o.state !== 'string' ||
        (o.value !== null && (typeof o.value !== 'string' || !/^\d+(\.\d+)?$/.test(o.value))) ||
        typeof o.currency !== 'string' ||
        typeof o.period_start !== 'string' ||
        typeof o.period_end !== 'string',
    ) ||
    (c.run !== null &&
      (!c.run ||
        typeof c.run.id !== 'string' ||
        !Array.isArray(c.run.results) ||
        c.run.results.some(
          (r) =>
            !['observed', 'unknown', 'invalid', 'not_applicable'].includes(r.status) ||
            (r.value !== null &&
              (typeof r.value !== 'string' || !Number.isFinite(Number(r.value)))),
        )))
  )
    throw new ApiError('پاسخ مالی معتبر نیست.', 502, {}, 'invalid_response');
  return c;
}
function decimal(value: string): string {
  const normalized = value
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/٫/g, '.')
    .trim();
  if (!/^\d{1,18}(\.\d{1,6})?$/.test(normalized))
    throw new Error(
      'مقدار باید عدد نامنفی با حداکثر ۱۸ رقم صحیح و ۶ رقم اعشار باشه. جداکنندهٔ هزارگان رو حذف کن.',
    );
  return normalized;
}
export default function FinancePage() {
  const { workspaceId = '' } = useParams();
  return <FinanceEditor key={workspaceId} workspaceId={workspaceId} />;
}
function FinanceEditor({ workspaceId }: { workspaceId: string }) {
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const session = useOutletContext<Session>();
  const workspace = session.workspaces.find((w) => w.id === workspaceId);
  const editable = workspace?.role === 'owner' || workspace?.role === 'editor';
  const client = useQueryClient();
  const key = ['workspace', workspaceId, 'finance-captures'];
  const query = useQuery({
    queryKey: key,
    enabled: !!workspace,
    queryFn: async ({ signal }) => {
      const rows: Capture[] = [];
      let offset: number | null = 0;
      do {
        const next: { items: Capture[]; next_offset: number | null } = await requestApi<{
          items: Capture[];
          next_offset: number | null;
        }>(`${root(workspaceId)}?offset=${offset}`, {
          signal,
          decode(value) {
            const p = value as {
              workspace_id: string;
              items: unknown[];
              next_offset: number | null;
            };
            if (
              !p ||
              p.workspace_id !== workspaceId ||
              !Array.isArray(p.items) ||
              p.items.length > 20 ||
              (p.next_offset !== null && p.next_offset !== Number(offset) + 20)
            )
              throw new ApiError('فهرست مالی معتبر نیست.', 502);
            return {
              items: p.items.map((v) => decode(v, workspaceId)),
              next_offset: p.next_offset,
            };
          },
        });
        rows.push(...next.items);
        offset = next.next_offset;
        if (rows.length >= 200) offset = null;
      } while (offset !== null);
      return rows;
    },
  });
  const [form, setForm] = useState({
    period_start: '',
    period_end: '',
    currency: 'IRR',
    accounting_basis: 'cash',
    cost_scope: '',
    source_id: '',
    source_revision: '',
    revenue: '',
    cost: '',
    revenue_state: 'observed',
    cost_state: 'observed',
    revenue_reason: '',
    cost_reason: '',
  });
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [show, setShow] = useState(false);
  useWorkspaceDirtyGuard(`finance:${workspaceId}`, dirty);
  const set = (name: string, value: string) => {
    setForm((f) => ({ ...f, [name]: value }));
    setDirty(true);
    setRequestId(crypto.randomUUID());
  };
  const update = (capture: Capture) =>
    client.setQueryData<Capture[]>(key, (old) => [
      capture,
      ...(old ?? []).filter((c) => c.id !== capture.id),
    ]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    setSaved('');
    try {
      const context = {
        scope_kind: 'workspace',
        segment_id: null,
        period_start: form.period_start,
        period_end: form.period_end,
        currency: form.currency,
        accounting_basis: form.accounting_basis,
      };
      const observations = [
        ['net_revenue', 'revenue'],
        ['variable_costs', 'cost'],
      ].map(([binding_id, prefix]) => {
        const state = form[`${prefix}_state` as keyof typeof form];
        return {
          ...context,
          binding_id,
          state,
          value: state === 'observed' ? decimal(form[prefix as 'revenue' | 'cost']) : null,
          reason: state === 'observed' ? '' : form[`${prefix}_reason` as keyof typeof form],
          unit: 'currency',
          cost_scope: binding_id === 'variable_costs' ? form.cost_scope : '',
          source_kind: 'owner_reported',
          source_id: form.source_id,
          source_revision: form.source_revision,
          evidence_ids: [],
        };
      });
      const result = await postAuth(
        root(workspaceId),
        { id: requestId, context, observations },
        (v) => decode(v, workspaceId),
      );
      update(result);
      setDirty(false);
      setShow(false);
      setRequestId(crypto.randomUUID());
      setSaved(
        english
          ? 'Inputs saved. You can now calculate the contribution amount.'
          : 'ورودی‌ها ذخیره شدن؛ حالا می‌تونی حاشیهٔ مشارکت رو محاسبه کنی.',
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.message} ${Object.values(err.fields).flat().join(' ')}`
          : err instanceof Error
            ? err.message
            : 'ذخیره نشد.',
      );
    } finally {
      setPending(false);
    }
  }
  async function calculate(capture: Capture) {
    if (pending) return;
    setPending(true);
    setError('');
    setSaved('');
    try {
      update(
        await postAuth(
          `${root(workspaceId)}${encodeURIComponent(capture.id)}/calculate/`,
          {},
          (v) => decode(v, workspaceId),
        ),
      );
      setSaved(
        english
          ? 'Calculation saved with its exact input snapshot.'
          : 'محاسبه همراه نسخهٔ دقیق ورودی‌ها ذخیره شد.',
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.message} ${Object.values(err.fields).flat().join(' ')}`
          : err instanceof Error
            ? err.message
            : 'محاسبه انجام نشد.',
      );
    } finally {
      setPending(false);
    }
  }
  if (!workspace)
    return (
      <Notice title={english ? 'Workspace unavailable' : 'فضای کار در دسترس نیست'}>
        <p>
          {english ? 'Choose an accessible Workspace.' : 'یکی از فضاهای در دسترست رو انتخاب کن.'}
        </p>
      </Notice>
    );
  if (query.isPending)
    return <Skeleton label={english ? 'Loading financial inputs' : 'در حال دریافت اطلاعات مالی'} />;
  if (query.isError)
    return (
      <Notice title={english ? 'Financial data unavailable' : 'اطلاعات مالی دریافت نشد'}>
        <p role="alert">{query.error.message}</p>
        <Button onClick={() => void query.refetch()}>{english ? 'Retry' : 'تلاش دوباره'}</Button>
      </Notice>
    );
  const amount = (value: string | null) => {
    if (value === null) return english ? 'Unknown' : 'نامشخص';
    const formatter = new Intl.NumberFormat(english ? 'en-US' : 'fa-IR', {
      maximumFractionDigits: 0,
    });
    const [whole, fraction = ''] = value.split('.');
    const integer = BigInt(whole);
    const sign = value.startsWith('-') && integer === 0n ? '-' : '';
    const digits = fraction.replace(/0+$/, '');
    const separator =
      new Intl.NumberFormat(english ? 'en-US' : 'fa-IR')
        .formatToParts(1.1)
        .find((part) => part.type === 'decimal')?.value ?? '.';
    return (
      sign +
      formatter.format(integer) +
      (digits
        ? separator + [...digits].map((digit) => formatter.format(Number(digit))).join('')
        : '')
    );
  };
  const dateLabel = (value: string) =>
    new Intl.DateTimeFormat(english ? 'en-US' : 'fa-IR', {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00Z`));
  return (
    <section className="strategy-page planning-page" aria-labelledby="finance-title">
      <header className="strategy-heading">
        <div>
          <h1 id="finance-title">{english ? 'Business economics' : 'اقتصاد کسب‌وکار'}</h1>
          <p>
            {english
              ? 'Record comparable revenue and variable costs, then calculate contribution amount with an immutable source trace.'
              : 'درآمد خالص و هزینهٔ متغیر یک دوره رو ثبت کن؛ حاشیهٔ مشارکت با حفظ منبع و نسخهٔ ورودی‌ها محاسبه می‌شه.'}
          </p>
        </div>
        {editable && !show && (
          <Button variant="primary" onClick={() => setShow(true)}>
            {english ? 'Add financial period' : 'ثبت دورهٔ مالی'}
          </Button>
        )}
      </header>
      <details className="planning-note">
        <summary>{english ? 'Method and units' : 'روش محاسبه و واحدها'}</summary>
        <p>
          {english
            ? 'Contribution amount = net revenue − variable costs. This is not net profit or a financial-health score. Enter unscaled amounts in the selected currency; IRR means rials. Define which costs are variable and use a single period and accounting basis.'
            : 'حاشیهٔ مشارکت = درآمد خالص − هزینه‌های متغیر. این مقدار سود خالص یا امتیاز سلامت مالی نیست. مبلغ‌ها رو با واحد ارز انتخاب‌شده و بدون ضریب وارد کن؛ IRR یعنی ریال. مرز هزینه‌های متغیر، دوره و مبنای حسابداری باید روشن باشه.'}
        </p>
      </details>
      {error && (
        <p role="alert" className="planning-error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="planning-success">
          {saved}
        </p>
      )}
      {show && (
        <form className="strategy-panel planning-editor" onSubmit={(e) => void submit(e)}>
          <fieldset disabled={pending} className="planning-fields">
            {(['period_start', 'period_end'] as const).map((name, i) => (
              <Input
                key={name}
                label={
                  english ? (i ? 'Period end' : 'Period start') : i ? 'پایان دوره' : 'شروع دوره'
                }
                type="date"
                value={form[name]}
                required
                onChange={(e) => set(name, e.currentTarget.value)}
              />
            ))}
            <label className="planning-field">
              <span>{english ? 'Currency' : 'ارز و واحد مبلغ'}</span>
              <select
                value={form.currency}
                onChange={(e) => set('currency', e.currentTarget.value)}
              >
                <option value="IRR">{english ? 'IRR · rial' : 'IRR · ریال'}</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
            <label className="planning-field">
              <span>{english ? 'Accounting basis' : 'مبنای حسابداری'}</span>
              <select
                value={form.accounting_basis}
                onChange={(e) => set('accounting_basis', e.currentTarget.value)}
              >
                <option value="cash">{english ? 'Cash' : 'نقدی'}</option>
                <option value="accrual">{english ? 'Accrual' : 'تعهدی'}</option>
                <option value="forecast">{english ? 'Forecast' : 'پیش‌بینی'}</option>
              </select>
            </label>
            {(['revenue', 'cost'] as const).map((prefix) => (
              <div key={prefix} className="planning-input-pair">
                <label className="planning-field">
                  <span>
                    {prefix === 'revenue'
                      ? english
                        ? 'Net revenue'
                        : 'درآمد خالص'
                      : english
                        ? 'Variable costs'
                        : 'هزینه‌های متغیر'}
                  </span>
                  <select
                    value={form[`${prefix}_state`]}
                    onChange={(e) => set(`${prefix}_state`, e.currentTarget.value)}
                  >
                    <option value="observed">{english ? 'Known amount' : 'مبلغ مشخصه'}</option>
                    <option value="unknown">{english ? 'Unknown' : 'هنوز مشخص نیست'}</option>
                  </select>
                </label>
                {form[`${prefix}_state`] === 'observed' ? (
                  <Input
                    label={english ? 'Amount' : 'مبلغ'}
                    inputMode="decimal"
                    value={form[prefix]}
                    required
                    onChange={(e) => set(prefix, e.currentTarget.value)}
                  />
                ) : (
                  <Input
                    label={english ? 'Why unknown?' : 'چرا هنوز مشخص نیست؟'}
                    value={form[`${prefix}_reason`]}
                    maxLength={1000}
                    required
                    onChange={(e) => set(`${prefix}_reason`, e.currentTarget.value)}
                  />
                )}
              </div>
            ))}
            <Input
              label={english ? 'Variable-cost boundary' : 'چه هزینه‌هایی رو متغیر حساب کردی؟'}
              value={form.cost_scope}
              maxLength={240}
              required
              onChange={(e) => set('cost_scope', e.currentTarget.value)}
            />
            <Input
              label={english ? 'Source record or reference' : 'منبع یا شمارهٔ گزارش'}
              value={form.source_id}
              maxLength={160}
              required
              onChange={(e) => set('source_id', e.currentTarget.value)}
            />
            <Input
              label={english ? 'Source version or date' : 'نسخه یا تاریخ منبع'}
              value={form.source_revision}
              maxLength={80}
              required
              onChange={(e) => set('source_revision', e.currentTarget.value)}
            />
          </fieldset>
          <div className="planning-actions">
            <Button type="submit" variant="primary" pending={pending}>
              {english ? 'Save inputs' : 'ذخیرهٔ ورودی‌ها'}
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm(english ? 'Discard draft?' : 'نوشتهٔ ذخیره‌نشده رو کنار بذاریم؟')
                ) {
                  setShow(false);
                  setDirty(false);
                }
              }}
            >
              {english ? 'Cancel' : 'انصراف'}
            </Button>
          </div>
        </form>
      )}
      {!query.data.length && !show && (
        <p>{english ? 'No financial periods recorded yet.' : 'هنوز دورهٔ مالی ثبت نشده.'}</p>
      )}
      <div className="planning-record-grid">
        {query.data.map((capture) => {
          const revenue = capture.observations.find((o) => o.binding_id === 'net_revenue')!;
          const cost = capture.observations.find((o) => o.binding_id === 'variable_costs')!;
          return (
            <article key={capture.id} className="strategy-panel planning-record">
              <h2 dir="auto">
                {dateLabel(revenue.period_start)} — {dateLabel(revenue.period_end)}
              </h2>
              <dl>
                <div>
                  <dt>{english ? 'Net revenue' : 'درآمد خالص'}</dt>
                  <dd>
                    {amount(revenue.value)} {revenue.currency}
                  </dd>
                </div>
                <div>
                  <dt>{english ? 'Variable costs' : 'هزینه‌های متغیر'}</dt>
                  <dd>
                    {amount(cost.value)} {cost.currency}
                  </dd>
                </div>
                <div>
                  <dt>{english ? 'Source' : 'منبع'}</dt>
                  <dd>{revenue.source_id}</dd>
                </div>
                <div>
                  <dt>{english ? 'Variable-cost boundary' : 'مرز هزینهٔ متغیر'}</dt>
                  <dd>{cost.cost_scope}</dd>
                </div>
              </dl>
              {capture.run ? (
                <div className="planning-calculation">
                  <h3>{english ? 'Contribution amount' : 'حاشیهٔ مشارکت'}</h3>
                  {capture.run.results.map((result, i) => (
                    <p key={i}>
                      {result.status === 'observed'
                        ? `${amount(result.value)} ${result.currency}`
                        : result.reason ||
                          (english
                            ? 'Not calculable with these inputs.'
                            : 'با این ورودی‌ها قابل محاسبه نیست.')}
                    </p>
                  ))}
                  <small>{capture.run.method_revision}</small>
                </div>
              ) : (
                editable && (
                  <Button disabled={pending} onClick={() => void calculate(capture)}>
                    {english ? 'Calculate contribution' : 'محاسبهٔ حاشیهٔ مشارکت'}
                  </Button>
                )
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
