import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@stratino/ui';
import { ApiError, requestApi } from '../../api/client';
import { OperatorIcon } from './OperatorIcon';
import './operatorDialogs.css';

type Plan = {
  id: number;
  code: string;
  kind: string;
  currency: string;
  title: string;
  is_active: boolean;
  price: number | null;
  sale_price: number | null;
  duration_days: number | null;
  version: string;
};

function optionalInteger(value: string): number | null {
  const normalized = value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[,٬\s]/g, '');
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(Number(normalized)))
    throw new Error('invalid');
  return Number(normalized);
}

export function OperatorAcademyPlanDialog({
  id,
  english,
  onClose,
  onDone,
  onReauthenticate,
}: {
  id: string;
  english: boolean;
  onClose: () => void;
  onDone: () => void;
  onReauthenticate: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queries = useQueryClient();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [sale, setSale] = useState('');
  const [duration, setDuration] = useState('');
  const [active, setActive] = useState(true);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const t = (fa: string, en: string) => (english ? en : fa);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    requestApi<Plan>(`/api/v1/operator/academy_plans/${id}/`, { signal: controller.signal })
      .then((data) => {
        setPlan(data);
        setTitle(data.title);
        setActive(data.is_active);
        setPrice(data.price === null ? '' : String(data.price));
        setSale(data.sale_price === null ? '' : String(data.sale_price));
        setDuration(data.duration_days === null ? '' : String(data.duration_days));
        setConflict(false);
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) return;
        setError(err.message);
        if (err instanceof ApiError && err.code === 'operator_mfa_unavailable') onReauthenticate();
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, reload, onReauthenticate]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !plan || conflict) return;
    let values;
    try {
      values = {
        price: optionalInteger(price),
        sale_price: optionalInteger(sale),
        duration_days: optionalInteger(duration),
      };
    } catch {
      setError(
        t('مبلغ و مدت رو با عدد صحیح وارد کن.', 'Enter whole numbers for prices and duration.'),
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      await requestApi(`/api/v1/operator/academy_plans/${id}/`, {
        method: 'PATCH',
        body: {
          ...values,
          title: title.trim(),
          is_active: active,
          version: plan.version,
          reason: reason.trim(),
        },
      });
      await queries.invalidateQueries({ queryKey: ['academy-plans'] });
      await queries.invalidateQueries({ queryKey: ['account'] });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError && err.code === 'revision_conflict') setConflict(true);
      if (err instanceof ApiError && err.code === 'operator_mfa_unavailable') onReauthenticate();
    } finally {
      setBusy(false);
    }
  }
  const unit = plan?.currency === 'IRR' ? t('ریال', 'IRR') : (plan?.currency ?? 'IRR');
  return (
    <dialog
      ref={dialog}
      className="op-action-dialog op-plan-dialog"
      dir={english ? 'ltr' : 'rtl'}
      aria-labelledby="op-plan-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2 id="op-plan-title">{t('ویرایش پلن آکادمی', 'Edit Academy plan')}</h2>
        <button onClick={onClose} disabled={busy} aria-label={t('بستن', 'Close')}>
          <OperatorIcon name="close" />
        </button>
      </header>
      <p>
        {t(
          'تغییرات در صفحهٔ اشتراک‌ها نمایش داده می‌شن. قیمت و مدت خریدهای قبلی تغییر نمی‌کنه.',
          'Changes appear on subscription pages. Existing purchases keep their original prices and durations.',
        )}
      </p>
      {loading ? (
        <p role="status">{t('داریم پلن رو می‌گیریم…', 'Loading plan…')}</p>
      ) : (
        plan && (
          <form
            id="op-plan-form"
            className="op-admin-form"
            onSubmit={(event) => void submit(event)}
          >
            <p className="op-inline-note">
              <bdi>{plan.code}</bdi> · {t('واحد مبلغ‌ها:', 'Currency:')} {unit}
              {plan.kind === 'specialty' && (
                <span>
                  {t(
                    'قیمت برای هر گرایشه؛ مبلغ انتخاب چند گرایش از همین قیمت محاسبه می‌شه.',
                    'Price is per specialty; selecting multiple specialties multiplies this amount.',
                  )}
                </span>
              )}
            </p>
            <Input
              label={t('عنوان پلن', 'Plan title')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              required
              disabled={busy}
            />
            <Input
              label={t('قیمت اصلی', 'Original price') + ` (${unit})`}
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={busy || plan.kind === 'free'}
              hint={t(
                'خالی یعنی قیمت هنوز تعیین نشده.',
                'Leave blank if the price is not decided.',
              )}
            />
            <Input
              label={t('قیمت با تخفیف', 'Sale price') + ` (${unit})`}
              inputMode="numeric"
              value={sale}
              onChange={(e) => setSale(e.target.value)}
              disabled={busy || plan.kind === 'free'}
              hint={t(
                'خالی یعنی بدون تخفیف. این مبلغ نباید از قیمت اصلی بیشتر باشه.',
                'Blank means no discount. Must not exceed the original price.',
              )}
            />
            <Input
              label={t('مدت اشتراک (روز)', 'Duration (days)')}
              inputMode="numeric"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              disabled={busy}
              hint={t('خالی یعنی مدت هنوز تعیین نشده.', 'Leave blank if duration is not decided.')}
            />
            <label className="op-checkbox">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                disabled={busy}
              />
              {t('نمایش پلن در فهرست اشتراک‌ها', 'Show plan in subscription catalog')}
            </label>
            <Input
              label={t('دلیل تغییر', 'Reason for change')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={3}
              maxLength={500}
              required
              disabled={busy}
            />
          </form>
        )
      )}
      {error && <p role="alert">{error}</p>}
      {(conflict || (!loading && !plan)) && (
        <button onClick={() => setReload((value) => value + 1)}>
          {t('دریافت اطلاعات تازه', 'Reload latest plan')}
        </button>
      )}
      {!loading && plan && (
        <footer>
          <button type="button" onClick={onClose} disabled={busy}>
            {t('انصراف', 'Cancel')}
          </button>
          <button
            className="op-primary"
            type="submit"
            form="op-plan-form"
            disabled={busy || conflict}
          >
            {t(busy ? 'داریم ذخیره می‌کنیم…' : 'ذخیرهٔ تغییرات', busy ? 'Saving…' : 'Save changes')}
          </button>
        </footer>
      )}
    </dialog>
  );
}
