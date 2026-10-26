import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@stratino/ui';
import { ApiError, requestApi } from '../../api/client';
import { OperatorIcon } from './OperatorIcon';
import './operatorDialogs.css';

export type AcademyAction =
  { kind: 'samples'; unitId?: string } | { kind: 'grant' } | { kind: 'revoke'; id: string };
type Sample = {
  unit_id: string;
  title: string;
  area_kind: string;
  version: string;
  cards: { id: string; title: string }[];
  active_card_ids: string[];
  other_specialty_cards: number;
};
type Choices = {
  plans: { id: number; title: string; kind: string }[];
  areas: { id: string; title: string }[];
};
type Subscription = {
  id: string;
  user_id: string;
  coverage: string;
  areas: string[];
  status: string;
  starts_at: string;
  ends_at: string | null;
  version: string;
};
const sampleUrl = '/api/v1/operator/academy_samples/configure/';
const grantUrl = '/api/v1/operator/academy_subscriptions/grant/';

export function OperatorAcademyAccessDialog({
  action,
  english,
  onClose,
  onDone,
  onReauthenticate,
}: {
  action: AcademyAction;
  english: boolean;
  onClose: () => void;
  onDone: () => void;
  onReauthenticate: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queries = useQueryClient();
  const requestKey = useRef({ signature: '', id: '' });
  const [sample, setSample] = useState<Sample | null>(null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [units, setUnits] = useState<{ id: string; title: string }[]>([]);
  const [search, setSearch] = useState('');
  const [unitId, setUnitId] = useState(action.kind === 'samples' ? (action.unitId ?? '') : '');
  const [count, setCount] = useState('0');
  const [userId, setUserId] = useState('');
  const [planId, setPlanId] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [starts, setStarts] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [ends, setEnds] = useState('');
  const [noExpiry, setNoExpiry] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conflict, setConflict] = useState(false);
  const [reload, setReload] = useState(0);
  const t = (fa: string, en: string) => (english ? en : fa);
  const number = (n: number) => new Intl.NumberFormat(english ? 'en' : 'fa-IR').format(n);
  const title =
    action.kind === 'samples'
      ? t('تنظیم نمونهٔ رایگان', 'Configure free sample')
      : action.kind === 'grant'
        ? t('اعطای دسترسی آکادمی', 'Grant Academy access')
        : t('لغو دسترسی آکادمی', 'Revoke Academy access');
  const unitInitial = action.kind === 'samples' ? (action.unitId ?? '') : '';
  const subscriptionId = action.kind === 'revoke' ? action.id : '';
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setConflict(false);
    async function load() {
      if (action.kind === 'grant') {
        setChoices(await requestApi<Choices>(grantUrl, { signal: controller.signal }));
      } else if (action.kind === 'revoke') {
        setSubscription(
          await requestApi<Subscription>(
            `/api/v1/operator/academy_subscriptions/${subscriptionId}/`,
            { signal: controller.signal },
          ),
        );
      } else if (unitInitial) {
        const data = await requestApi<Sample>(
          sampleUrl + '?unit_id=' + encodeURIComponent(unitInitial),
          { signal: controller.signal },
        );
        setSample(data);
        setCount(String(data.active_card_ids.length));
        setUnitId(data.unit_id);
      } else {
        setUnits(
          (await requestApi<{ units: typeof units }>(sampleUrl, { signal: controller.signal }))
            .units,
        );
      }
    }
    void load()
      .catch((err: Error) => {
        if (!controller.signal.aborted) {
          setError(err.message);
          if (err instanceof ApiError && err.code === 'operator_mfa_unavailable')
            onReauthenticate();
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [action.kind, unitInitial, subscriptionId, reload, onReauthenticate]);
  async function loadSample(searchOnly: boolean) {
    setLoading(true);
    setError('');
    try {
      if (searchOnly) {
        const data = await requestApi<{ units: typeof units }>(
          sampleUrl + '?q=' + encodeURIComponent(search.trim()),
        );
        setUnits(data.units);
      } else {
        const data = await requestApi<Sample>(sampleUrl + '?unit_id=' + encodeURIComponent(unitId));
        setSample(data);
        setCount(String(data.active_card_ids.length));
        setConflict(false);
        setConfirmed(false);
      }
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError && err.code === 'operator_mfa_unavailable') onReauthenticate();
    } finally {
      setLoading(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || loading || conflict || !confirmed) return;
    setBusy(true);
    setError('');
    try {
      let url: string;
      let body: Record<string, unknown>;
      if (action.kind === 'samples') {
        if (!sample) return;
        url = sampleUrl;
        body = {
          unit_id: sample.unit_id,
          count: Number(count),
          version: sample.version,
          reason: reason.trim(),
        };
      } else if (action.kind === 'grant') {
        url = grantUrl;
        body = {
          user_id: userId.trim(),
          plan_id: Number(planId),
          areas,
          starts_at: new Date(starts).toISOString(),
          ends_at: noExpiry ? null : new Date(ends).toISOString(),
          reason: reason.trim(),
          confirm: true,
        };
        const signature = JSON.stringify(body);
        if (requestKey.current.signature !== signature)
          requestKey.current = { signature, id: crypto.randomUUID() };
        body.request_id = requestKey.current.id;
      } else {
        if (!subscription) return;
        url = `/api/v1/operator/academy_subscriptions/${subscription.id}/`;
        body = { version: subscription.version, reason: reason.trim(), confirm: true };
      }
      await requestApi(url, { method: 'POST', body });
      queries.removeQueries({ queryKey: ['academy-content'] });
      await Promise.all([
        queries.invalidateQueries({ queryKey: ['academy-catalog'] }),
        queries.invalidateQueries({ queryKey: ['academy-plans'] }),
        queries.invalidateQueries({ queryKey: ['account'] }),
      ]);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError && err.code === 'revision_conflict') setConflict(true);
      if (err instanceof ApiError && err.code === 'operator_mfa_unavailable') onReauthenticate();
    } finally {
      setBusy(false);
    }
  }
  const selectedPlan = choices?.plans.find((plan) => String(plan.id) === planId);
  const ready =
    action.kind === 'samples'
      ? sample !== null
      : action.kind === 'grant'
        ? Boolean(choices && selectedPlan)
        : subscription !== null;
  return (
    <dialog
      ref={dialog}
      className="op-action-dialog op-plan-dialog"
      dir={english ? 'ltr' : 'rtl'}
      aria-labelledby="op-academy-access-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2 id="op-academy-access-title">{title}</h2>
        <button onClick={onClose} disabled={busy} aria-label={t('بستن', 'Close')}>
          <OperatorIcon name="close" />
        </button>
      </header>
      <p>
        {action.kind === 'samples'
          ? t(
              'نمونه شامل کارت‌های اول درس‌نامه می‌شه. برای گرایش‌ها فقط یک درس‌نامهٔ منتخب نمونه داره؛ انتخاب تازه جای قبلی رو می‌گیره.',
              'Samples contain the first cards of a lesson. Only one selected specialty lesson has a sample; a new selection replaces it.',
            )
          : action.kind === 'grant'
            ? t(
                'دسترسی دستی با نام تو و دلیل ثبت می‌شه. این تغییر پرداخت یا خریدی ثبت نمی‌کنه.',
                'Manual access records your identity and reason. It does not record a payment or purchase.',
              )
            : t(
                'این کار دسترسی همین اشتراک رو لغو می‌کنه. سابقهٔ خرید حفظ می‌شه و بازپرداخت انجام نمی‌شه. اشتراک‌های دیگهٔ کاربر تغییر نمی‌کنن.',
                'This revokes only this subscription. Purchase history is preserved; no refund is issued. Other subscriptions remain unchanged.',
              )}
      </p>
      <form
        id="op-academy-access-form"
        className="op-admin-form"
        onSubmit={(event) => void submit(event)}
      >
        {loading && <p role="status">{t('داریم اطلاعات رو می‌گیریم…', 'Loading…')}</p>}
        {action.kind === 'samples' && (
          <>
            {!sample && (
              <>
                <label>
                  {t('جست‌وجوی درس‌نامه', 'Find lesson')}
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    maxLength={160}
                    disabled={busy || loading}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void loadSample(true)}
                  disabled={busy || loading}
                >
                  {t('پیداکردن درس‌نامه', 'Find lessons')}
                </button>
                <label>
                  {t('درس‌نامه', 'Lesson')}
                  <select
                    value={unitId}
                    disabled={busy || loading}
                    onChange={(e) => {
                      setUnitId(e.target.value);
                      setSample(null);
                      setConfirmed(false);
                    }}
                  >
                    <option value="">{t('انتخاب کن', 'Choose')}</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.title} ({unit.id})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void loadSample(false)}
                  disabled={!unitId || busy || loading}
                >
                  {t('دیدن کارت‌ها', 'View cards')}
                </button>
              </>
            )}
            {sample && (
              <>
                <h3>{sample.title}</h3>
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => {
                    setSample(null);
                    setConfirmed(false);
                    void loadSample(true);
                  }}
                >
                  {t('تغییر درس‌نامه', 'Change lesson')}
                </button>
                <label>
                  {t('تعداد کارت‌های اول', 'Number of first cards')}
                  <select
                    value={count}
                    disabled={busy || loading}
                    onChange={(e) => {
                      setCount(e.target.value);
                      setConfirmed(false);
                    }}
                  >
                    {Array.from({ length: sample.cards.length + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {n === 0 ? t('بدون نمونه', 'No sample') : number(n)}
                      </option>
                    ))}
                  </select>
                </label>
                <details>
                  <summary>{t('دیدن عنوان کارت‌ها', 'View card titles')}</summary>
                  <ol className="op-sample-preview">
                    {sample.cards.map((card, index) => (
                      <li key={card.id} data-selected={index < Number(count)}>
                        {card.title}
                        <span>
                          {index < Number(count)
                            ? t('نمونهٔ رایگان', 'Free sample')
                            : t('دسترسی با اشتراک', 'Subscription access')}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
                {sample.other_specialty_cards > 0 && Number(count) > 0 && (
                  <p className="op-inline-note">
                    {t(
                      'با ذخیره، نمونهٔ درس‌نامهٔ قبلی گرایش‌ها غیرفعال می‌شه.',
                      'Saving disables the previous specialty lesson sample.',
                    )}
                  </p>
                )}
              </>
            )}
          </>
        )}
        {action.kind === 'grant' && choices && (
          <>
            <Input
              label={t('شناسهٔ حساب کاربر', 'User account ID')}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              maxLength={36}
              disabled={busy}
              hint={t('شناسه رو از جدول حساب‌ها بردار.', 'Use the ID from the accounts table.')}
            />
            <label>
              {t('پلن آکادمی', 'Academy plan')}
              <select
                required
                value={planId}
                disabled={busy}
                onChange={(e) => {
                  setPlanId(e.target.value);
                  setAreas([]);
                  setConfirmed(false);
                }}
              >
                <option value="">{t('انتخاب کن', 'Choose')}</option>
                {choices.plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.title}
                  </option>
                ))}
              </select>
            </label>
            {selectedPlan?.kind === 'specialty' && (
              <fieldset>
                <legend>{t('گرایش‌های این دسترسی', 'Included specialties')}</legend>
                {choices.areas.map((area) => (
                  <label className="op-checkbox" key={area.id}>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={areas.includes(area.id)}
                      onChange={(e) =>
                        setAreas((old) =>
                          e.target.checked ? [...old, area.id] : old.filter((id) => id !== area.id),
                        )
                      }
                    />
                    {area.title}
                  </label>
                ))}
              </fieldset>
            )}
            <Input
              type="datetime-local"
              label={t('شروع دسترسی (زمان محلی)', 'Access starts (local time)')}
              value={starts}
              onChange={(e) => setStarts(e.target.value)}
              required
              disabled={busy}
            />
            <Input
              type="datetime-local"
              label={t('پایان دسترسی (زمان محلی)', 'Access ends (local time)')}
              value={ends}
              onChange={(e) => setEnds(e.target.value)}
              required={!noExpiry}
              disabled={busy || noExpiry}
            />
            <label className="op-checkbox">
              <input
                type="checkbox"
                checked={noExpiry}
                disabled={busy}
                onChange={(e) => setNoExpiry(e.target.checked)}
              />
              {t('بدون تاریخ پایان اعطا کن', 'Grant without an expiry date')}
            </label>
          </>
        )}
        {action.kind === 'revoke' && subscription && (
          <div className="op-inline-note">
            <p>
              {t('شناسهٔ حساب:', 'Account ID:')} <bdi>{subscription.user_id}</bdi>
            </p>
            <p>
              {t('شناسهٔ اشتراک:', 'Subscription ID:')} <bdi>{subscription.id}</bdi>
            </p>
          </div>
        )}
        {ready && (
          <>
            <Input
              label={t('دلیل تغییر', 'Reason for change')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={3}
              maxLength={500}
              required
              disabled={busy}
            />
            <label className="op-checkbox">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={busy}
                required
              />
              {t(
                'دامنهٔ تغییر رو بررسی کردم و تأیید می‌کنم.',
                'I reviewed and confirm the scope of this change.',
              )}
            </label>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {conflict && (
          <button
            type="button"
            onClick={() =>
              action.kind === 'samples' ? void loadSample(false) : setReload((old) => old + 1)
            }
          >
            {t('گرفتن اطلاعات تازه و جایگزینی فرم', 'Reload latest data and replace form')}
          </button>
        )}
        {!ready && error && (
          <button type="button" onClick={() => setReload((old) => old + 1)}>
            {t('تلاش دوباره', 'Retry')}
          </button>
        )}
      </form>
      <footer>
        <button type="button" disabled={busy} onClick={onClose}>
          {t('انصراف', 'Cancel')}
        </button>
        <button
          form="op-academy-access-form"
          type="submit"
          className={action.kind === 'revoke' ? 'op-danger' : 'op-primary'}
          disabled={
            !ready ||
            busy ||
            loading ||
            conflict ||
            !confirmed ||
            (selectedPlan?.kind === 'specialty' && !areas.length)
          }
        >
          {busy ? t('در حال ثبت…', 'Saving…') : title}
        </button>
      </footer>
    </dialog>
  );
}
