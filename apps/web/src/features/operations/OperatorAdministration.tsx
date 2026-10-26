import { Input } from '@stratino/ui';
import { useEffect, useState, type FormEvent } from 'react';
import { requestApi } from '../../api/client';
import { OperatorIcon } from './OperatorIcon';

export function OperatorPassword({
  english,
  onDone,
  initial = false,
}: {
  english: boolean;
  onDone: () => void;
  initial?: boolean;
}) {
  const t = (fa: string, en: string) => (english ? en : fa);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await requestApi('/api/v1/operator/password/', {
        method: 'POST',
        body: { current_password: current, new_password: password, confirmation },
      });
      setCurrent('');
      setPassword('');
      setConfirmation('');
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="op-card op-collection">
      <h2>
        {t(
          initial ? 'گذرواژهٔ اولیه رو تغییر بده' : 'تغییر گذرواژهٔ مدیریت',
          initial ? 'Replace your temporary password' : 'Change admin password',
        )}
      </h2>
      <p>
        {t(
          'حداقل ۱۲ نویسه انتخاب کن. بعد از تغییر، نشست‌های دیگه بسته می‌شن و ورود دومرحله‌ای رو دوباره تأیید می‌کنی.',
          'Choose at least 12 characters. Other sessions close after the change; verify MFA again.',
        )}
      </p>
      <form className="op-admin-form" onSubmit={submit}>
        <Input
          label={t('گذرواژهٔ فعلی', 'Current password')}
          type="password"
          autoComplete="current-password"
          required
          maxLength={1024}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Input
          label={t('گذرواژهٔ جدید', 'New password')}
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={1024}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label={t('تکرار گذرواژهٔ جدید', 'Confirm new password')}
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={1024}
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <button className="op-primary" disabled={busy || password !== confirmation}>
          {t(busy ? 'داریم ذخیره می‌کنیم…' : 'تغییر گذرواژه', busy ? 'Saving…' : 'Change password')}
        </button>
      </form>
    </section>
  );
}

type Admin = {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  revision: number;
  permissions: string[];
};
type Team = { results: Admin[]; permissions: string[] };
const permissionLabels: Record<string, [string, string]> = {
  accounts: ['حساب‌های کاربران', 'User accounts'],
  workspaces: ['فضاهای کاری', 'Workspaces'],
  plans: ['پلن‌های مدیریت', 'Management plans'],
  subscriptions: ['اشتراک‌های مدیریت', 'Management subscriptions'],
  access: ['دسترسی مؤثر', 'Effective access'],
  audit: ['تاریخچه', 'Audit'],
  academy: ['مجموعه‌های آموزشی', 'Courses'],
  academy_plans: ['پلن‌های آکادمی', 'Academy plans'],
  academy_subscriptions: ['اشتراک‌های آکادمی', 'Academy subscriptions'],
  academy_orders: ['سفارش‌های آکادمی', 'Academy orders'],
  academy_samples: ['نمونه‌های رایگان', 'Free samples'],
  feedback: ['نظرهای یادگیرنده‌ها', 'Feedback'],
  operator_view_identity: ['دیدن اطلاعات تماس', 'Read contact identity'],
  operator_manage_accounts: ['تغییر وضعیت حساب', 'Change account status'],
  operator_triage_feedback: ['رسیدگی به نظرها', 'Triage feedback'],
  add_managementsubscription: ['اعطای اشتراک مدیریت', 'Grant management subscription'],
  change_managementsubscription: ['لغو اشتراک مدیریت', 'Revoke management subscription'],
  change_academyplan: ['ویرایش پلن و قیمت آکادمی', 'Edit Academy plans and pricing'],
  add_freesample: ['افزودن نمونهٔ رایگان', 'Add free samples'],
  change_freesample: ['تغییر نمونهٔ رایگان', 'Change free samples'],
  add_academysubscription: ['اعطای دسترسی آکادمی', 'Grant Academy access'],
  change_academysubscription: ['لغو دسترسی آکادمی', 'Revoke Academy access'],
};
export function OperatorTeam({ english }: { english: boolean }) {
  const t = (fa: string, en: string) => (english ? en : fa);
  const [data, setData] = useState<Team | null>(null);
  const [selected, setSelected] = useState<Admin | null>(null);
  const [email, setEmail] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    requestApi<Team>('/api/v1/operator/team/', { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [reload]);
  function edit(row: Admin | null) {
    setSelected(row);
    setEmail(row?.email ?? '');
    setCodes(row?.permissions ?? []);
    setActive(row?.is_active ?? true);
    setReason('');
    setPassword('');
    setSuccess('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await requestApi('/api/v1/operator/team/', {
        method: 'POST',
        body: {
          email,
          permissions: codes,
          is_active: active,
          revision: selected?.revision ?? 0,
          reason,
          current_password: password,
        },
      });
      edit(null);
      setSuccess(t('دسترسی مدیر ثبت شد.', 'Administrator access saved.'));
      setReload((v) => v + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setPassword('');
    }
  }
  return (
    <section className="op-card op-collection">
      <h2>{t('مدیران سرویس', 'Service administrators')}</h2>
      <p>
        {t(
          'فقط مالک می‌تونه مدیر تعریف کنه. فرد جدید اول باید حساب بسازه و ایمیلش رو تأیید کنه؛ بعد مجوزهای لازم رو براش انتخاب کن.',
          'Only an owner can approve administrators. New administrators must first create and verify their account; then select their permissions.',
        )}
      </p>
      {error && <p role="alert">{error}</p>}
      {success && <p role="status">{success}</p>}
      <button onClick={() => setReload((v) => v + 1)}>
        <OperatorIcon name="refresh" size={18} />
        {t('تازه‌کردن', 'Refresh')}
      </button>
      {!data && !error && <p role="status">{t('داریم فهرست رو می‌گیریم…', 'Loading…')}</p>}
      {data && (
        <>
          <ul className="op-team-list">
            {data.results.map((row) => (
              <li key={row.id}>
                <span>
                  <strong dir="ltr">{row.email}</strong>
                  <small>
                    {row.role === 'owner'
                      ? t('مالک', 'Owner')
                      : row.is_active
                        ? t('مدیر فعال', 'Active administrator')
                        : t('دسترسی بسته', 'Access disabled')}
                  </small>
                </span>
                {row.role !== 'owner' && (
                  <button onClick={() => edit(row)}>{t('ویرایش دسترسی', 'Edit access')}</button>
                )}
              </li>
            ))}
          </ul>
          <form className="op-admin-form" onSubmit={submit}>
            <h3>
              {selected
                ? t('ویرایش دسترسی مدیر', 'Edit administrator')
                : t('تعریف مدیر', 'Approve administrator')}
            </h3>
            {selected && (
              <button type="button" onClick={() => edit(null)}>
                {t('انصراف از ویرایش', 'Cancel edit')}
              </button>
            )}
            <label>
              {t('ایمیل مدیر', 'Administrator email')}
              <input
                type="email"
                required
                maxLength={254}
                readOnly={!!selected}
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <fieldset>
              <legend>{t('مجوزها', 'Permissions')}</legend>
              <div className="op-permission-grid">
                {data.permissions.map((code) => (
                  <label key={code}>
                    <input
                      type="checkbox"
                      checked={codes.includes(code)}
                      onChange={(e) =>
                        setCodes((old) =>
                          e.target.checked ? [...old, code] : old.filter((v) => v !== code),
                        )
                      }
                    />
                    <span>
                      {permissionLabels[code.replace(/^operator_view_(?!identity)/, '')]?.[
                        english ? 1 : 0
                      ] ?? code}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="op-checkbox">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              {t('دسترسی مدیر فعال باشه', 'Enable administrator access')}
            </label>
            <label>
              {t('دلیل تغییر', 'Reason')}
              <textarea
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <Input
              label={t('گذرواژهٔ خودت برای تأیید', 'Your password to confirm')}
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="op-primary" disabled={busy || codes.length === 0}>
              {t(
                busy ? 'داریم ذخیره می‌کنیم…' : 'ثبت دسترسی مدیر',
                busy ? 'Saving…' : 'Save administrator access',
              )}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
