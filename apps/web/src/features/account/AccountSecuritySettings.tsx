import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Input } from '@stratino/ui';
import { ApiError, requestApi } from '../../api/client';
import { displayDigits } from '../chrome/locale';

type Security = { enabled: boolean; enrolled: boolean; can_disable: boolean; revision: number };

export function AccountSecuritySettings({
  english,
  operator,
  userId,
}: {
  english: boolean;
  operator: boolean;
  userId: string;
}) {
  const t = (fa: string, en: string) => (english ? en : fa);
  const settings = useQuery({
    queryKey: ['account', 'operator-security', userId],
    queryFn: ({ signal }) => requestApi<Security>('/api/v1/operator/mfa-settings/', { signal }),
    retry: false,
    enabled: operator,
  });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  if (!operator) return null;
  if (settings.error instanceof ApiError && [401, 403, 404].includes(settings.error.status))
    return null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!settings.data || pending || conflict || !confirmed) return;
    setPending(true);
    setError('');
    setSaved(false);
    try {
      await requestApi<Security>('/api/v1/operator/mfa-settings/', {
        method: 'PATCH',
        body: {
          enabled: !settings.data.enabled,
          revision: settings.data.revision,
          password,
          code,
          confirm: confirmed,
        },
      });
      setPassword('');
      setCode('');
      setConfirmed(false);
      await settings.refetch();
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError && err.code === 'revision_conflict') setConflict(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="account-card" aria-labelledby="account-security-heading">
      <h2 id="account-security-heading">
        {t('ورود دومرحله‌ای مدیریت کل', 'Admin two-factor authentication')}
      </h2>
      {settings.isPending && (
        <p role="status">{t('داریم تنظیمات امنیت رو می‌گیریم…', 'Loading security settings…')}</p>
      )}
      {settings.isError && (
        <p role="alert">{t('تنظیمات امنیت دریافت نشد.', 'Could not load security settings.')}</p>
      )}
      {settings.data && (
        <>
          <p>
            {settings.data.enabled
              ? t('ورود دومرحله‌ای روشنه.', 'Two-factor authentication is on.')
              : t(
                  'ورود دومرحله‌ای برای تست محلی خاموشه.',
                  'Two-factor authentication is off for local testing.',
                )}
          </p>
          <p>
            {settings.data.can_disable
              ? t(
                  'در محیط آزمایشی می‌تونی این گزینه رو تغییر بدی. این انتخاب برای همین حسابه؛ مجوزهای مدیریت تغییر نمی‌کنن.',
                  'You can change this setting in the test environment. It applies to your account and does not change admin permissions.',
                )
              : t(
                  'برای حفاظت از اطلاعات کاربران، ورود دومرحله‌ای مدیریت کل در این محیط الزامیه.',
                  'Admin two-factor authentication is required in this environment to protect user information.',
                )}
          </p>
          {settings.data.can_disable && (
            <form className="account-form" onSubmit={submit}>
              <Input
                label={t('گذرواژهٔ فعلی', 'Current password')}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={pending}
                maxLength={4096}
              />
              {settings.data.enabled && settings.data.enrolled && (
                <Input
                  label={t('کد Authenticator', 'Authenticator code')}
                  value={displayDigits(code, english)}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={6}
                  disabled={pending}
                />
              )}
              <label className="account-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={pending}
                  required
                />
                {t(
                  'این تغییر رو برای حساب خودم تأیید می‌کنم.',
                  'I confirm this change for my account.',
                )}
              </label>
              <Button
                type="submit"
                pending={pending}
                disabled={!confirmed || conflict}
                pendingLabel={t('داریم ذخیره می‌کنیم…', 'Saving…')}
              >
                {settings.data.enabled
                  ? t('خاموش‌کردن برای تست محلی', 'Turn off for local testing')
                  : t('روشن‌کردن ورود دومرحله‌ای', 'Turn on two-factor authentication')}
              </Button>
            </form>
          )}
          {settings.data.enabled && !settings.data.enrolled && (
            <p>
              {t(
                'برای تکمیل راه‌اندازی، برنامهٔ Authenticator رو به حساب وصل کن.',
                'Connect your Authenticator app to finish setup.',
              )}
            </p>
          )}
          <Link to="/internal/security">
            {t('راه‌اندازی یا تأیید Authenticator', 'Set up or verify Authenticator')}
          </Link>
        </>
      )}
      {saved && (
        <p role="status">{t('تنظیم ورود دومرحله‌ای ذخیره شد.', 'Two-factor settings saved.')}</p>
      )}
      {error && (
        <p role="alert">
          {english
            ? 'Could not update security settings. Check your password and a fresh code.'
            : error}
        </p>
      )}
      {(conflict || settings.isError) && (
        <Button
          onClick={() => {
            setConflict(false);
            setError('');
            void settings.refetch();
          }}
        >
          {t('دریافت اطلاعات تازه', 'Reload latest settings')}
        </Button>
      )}
    </section>
  );
}
