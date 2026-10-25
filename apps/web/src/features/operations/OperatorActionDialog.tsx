import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, requestApi } from '../../api/client';
import { OperatorIcon } from './OperatorIcon';
import './operatorDialogs.css';

export type OperatorAction = {
  kind: 'grant' | 'revoke' | 'account-status';
  id?: string;
  active?: boolean;
};
type Plan = {
  id: string;
  title: string;
  revision: number;
  is_default: boolean;
  is_active: boolean;
};

export function OperatorActionDialog({
  action,
  english,
  onClose,
  onDone,
  onReauthenticate,
}: {
  action: OperatorAction;
  english: boolean;
  onClose: () => void;
  onDone: () => void;
  onReauthenticate: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [owner, setOwner] = useState('');
  const [plan, setPlan] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(action.kind === 'grant');
  const [error, setError] = useState('');
  const t = (fa: string, en: string) => (english ? en : fa);
  const title =
    action.kind === 'grant'
      ? t('اعطای اشتراک مدیریت', 'Grant management subscription')
      : action.kind === 'revoke'
        ? t('لغو دسترسی اشتراک', 'Revoke subscription access')
        : action.active
          ? t('غیرفعال‌کردن حساب', 'Deactivate account')
          : t('فعال‌کردن حساب', 'Activate account');
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    if (action.kind !== 'grant') return;
    const controller = new AbortController();
    async function load() {
      try {
        const result: Plan[] = [];
        for (let page = 1; page <= 100; page++) {
          const data = await requestApi<{ results: Plan[]; has_next: boolean }>(
            `/api/v1/operator/plans/?state=active&page=${page}`,
            { signal: controller.signal },
          );
          result.push(...data.results.filter((row) => row.is_active && !row.is_default));
          if (!data.has_next) {
            if (!controller.signal.aborted) setPlans(result);
            return;
          }
        }
        throw new Error(
          english
            ? 'Too many plans for this form. Contact the server administrator.'
            : 'تعداد پلن‌ها بیشتر از حد این فرم است. با مسئول فنی تماس بگیر.',
        );
      } catch (err) {
        if (!controller.signal.aborted) setError((err as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [action.kind, english]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !confirm) return;
    setBusy(true);
    setError('');
    const path =
      action.kind === 'grant'
        ? '/api/v1/operator/subscriptions/grant/'
        : action.kind === 'revoke'
          ? `/api/v1/operator/subscriptions/${action.id}/revoke/`
          : `/api/v1/operator/accounts/${action.id}/status/`;
    const body = {
      reason: reason.trim(),
      confirm,
      ...(action.kind === 'grant'
        ? { owner_id: owner.trim(), plan_id: plan, request_id: requestId }
        : action.kind === 'account-status'
          ? { is_active: !action.active }
          : {}),
    };
    try {
      await requestApi(path, { method: 'POST', body });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'operator_mfa_unavailable') {
        onReauthenticate();
        return;
      }
      setError(
        english
          ? 'The change was not confirmed. Check the form, connection and permissions before retrying.'
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="op-action-dialog"
      aria-labelledby="op-action-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <header>
        <span className="op-icon-tile op-tone-sand">
          <OperatorIcon name={action.kind === 'account-status' ? 'accounts' : 'subscriptions'} />
        </span>
        <h2 id="op-action-title">{title}</h2>
        <button onClick={onClose} disabled={busy} aria-label={t('بستن', 'Close')}>
          <OperatorIcon name="close" />
        </button>
      </header>
      <p>
        {action.kind === 'grant'
          ? t(
              'این کار، دسترسی مدیریت رو فعال می‌کنه و پرداختی ثبت نمی‌کنه. مشخصات و دلیل رو دقیق بررسی کن.',
              'This grants management access and does not record a payment. Review the account, plan and reason carefully.',
            )
          : action.kind === 'revoke'
            ? t(
                'با لغو اشتراک، دسترسی مؤثر کاربر دوباره از اشتراک‌های باقی‌مانده محاسبه می‌شه.',
                'Revoking this grant recalculates access from the remaining subscriptions.',
              )
            : t(
                'اطلاعات این حساب حذف نمی‌شه. حساب‌های همکاران مدیریتی از این بخش تغییر نمی‌کنن.',
                'Account data is retained. Staff accounts cannot be changed here.',
              )}
      </p>
      <form onSubmit={submit}>
        {action.id && (
          <div className="op-inline-note">
            <span>{t('شناسهٔ حساب یا اشتراک', 'Account or subscription ID')}</span>
            <code dir="ltr">{action.id}</code>
          </div>
        )}
        {action.kind === 'grant' && (
          <>
            <label>
              {t('شناسهٔ مالک حساب', 'Account owner ID')}
              <input
                dir="ltr"
                required
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                autoComplete="off"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
            </label>
            <label>
              {t('پلن مدیریت', 'Management plan')}
              <select
                required
                value={plan}
                onChange={(event) => setPlan(event.target.value)}
                disabled={loading}
              >
                <option value="">
                  {loading
                    ? t('داریم پلن‌ها رو می‌گیریم…', 'Loading plans…')
                    : t('یک پلن انتخاب کن', 'Select a plan')}
                </option>
                {plans.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title} ({t('نسخهٔ ', 'revision ')}
                    {new Intl.NumberFormat(english ? 'en' : 'fa-IR').format(row.revision)})
                  </option>
                ))}
              </select>
            </label>
            {!loading && plans.length === 0 && !error && (
              <p className="op-inline-note">
                {t(
                  'پلن ویژهٔ فعالی برای اعطا وجود نداره.',
                  'No active special plan is available to grant.',
                )}
              </p>
            )}
          </>
        )}
        <label>
          {t('دلیل تغییر', 'Reason for change')}
          <textarea
            required
            minLength={3}
            maxLength={500}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t(
              'دلیل این تغییر رو برای سابقهٔ مدیریتی بنویس.',
              'Explain this change for the administration history.',
            )}
          />
        </label>
        <label className="op-confirm">
          <input
            type="checkbox"
            required
            checked={confirm}
            onChange={(event) => setConfirm(event.target.checked)}
          />
          {t(
            'شناسه و اثر این تغییر رو بررسی و تأیید می‌کنم.',
            'I have reviewed the identifier and effect of this change.',
          )}
        </label>
        {error && (
          <p role="alert" className="op-error">
            {error}
          </p>
        )}
        <footer>
          <button type="button" onClick={onClose} disabled={busy}>
            {t('انصراف', 'Cancel')}
          </button>
          <button
            type="submit"
            className={action.kind === 'grant' ? 'op-primary' : 'op-danger'}
            disabled={
              busy || loading || !confirm || (action.kind === 'grant' && plans.length === 0)
            }
          >
            {busy ? t('داریم ثبت می‌کنیم…', 'Saving…') : title}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
