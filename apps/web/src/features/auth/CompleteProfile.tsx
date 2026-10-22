import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Input } from '@stratino/ui';
import { AuthFrame } from './AuthPages';
import { AuthApiError, firstFieldError, postAuth } from './api';
import type { AuthFields } from './api';
import { ApiError, requestApi } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { readSession } from '../../session';
import { destinationAfterLogin } from './authNavigation';
import './googleAuth.css';

type Profile = {
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string;
  google_connected: boolean;
  marketing_opt_in: boolean;
};
export function CompleteProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState('');
  const [fields, setFields] = useState<AuthFields>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const navigate = useNavigate(),
    location = useLocation(),
    client = useQueryClient();
  const next = new URLSearchParams(location.search).get('next');
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    Promise.all([
      requestApi<Profile>('/api/v1/account/completion/', { signal: controller.signal }),
      readSession(controller.signal),
    ])
      .then(([data, session]) => {
        if (!controller.signal.aborted) {
          if (!session) navigate(`/account/login${location.search}`, { replace: true });
          else {
            setProfile(data);
            setUserId(session.user.id);
          }
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          if (err instanceof ApiError && err.status === 401)
            navigate(`/account/login${location.search}`, { replace: true });
          else setError((err as Error).message);
        }
      });
    return () => controller.abort();
  }, [retry, navigate, location.search]);
  function update(key: keyof Profile, value: string | boolean) {
    setProfile((current) => (current ? { ...current, [key]: value } : current));
    setFields((current) => ({ ...current, [key]: [] }));
    setError('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!profile || busy) return;
    setBusy(true);
    setError('');
    setFields({});
    try {
      await postAuth('/api/v1/account/complete-profile/', {
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone_number: profile.phone_number,
        marketing_opt_in: profile.marketing_opt_in,
        expected_user_id: userId,
      });
      client.removeQueries({ queryKey: queryKeys.session });
      const session = await client.fetchQuery({
        queryKey: queryKeys.session,
        queryFn: () => readSession(),
      });
      if (!session) throw new Error('نشست حسابت تموم شده؛ دوباره وارد شو.');
      navigate(destinationAfterLogin(session, next), { replace: true });
    } catch (err) {
      if (err instanceof AuthApiError) setFields(err.fields);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      title="حسابت رو کامل کنیم"
      description="فقط چند مشخصات کوتاه مونده تا به درس یا فضای کارت برگردی."
      step="account"
    >
      {profile ? (
        <>
          <div className="auth-profile-identity">
            <span className="auth-profile-check" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>
                {profile.google_connected ? 'حساب گوگلت متصل شد' : 'ایمیلت تأیید شده'}
              </strong>
              <bdi dir="ltr">{profile.email}</bdi>
            </div>
            <span className="auth-profile-step">۲ از ۲</span>
          </div>
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <div className="auth-name-pair">
              <Input
                label="نام"
                autoComplete="given-name"
                value={profile.first_name}
                onChange={(event) => update('first_name', event.target.value)}
                error={firstFieldError(fields, 'first_name')}
                required
                maxLength={150}
                disabled={busy}
              />
              <Input
                label="نام خانوادگی"
                autoComplete="family-name"
                value={profile.last_name}
                onChange={(event) => update('last_name', event.target.value)}
                error={firstFieldError(fields, 'last_name')}
                required
                maxLength={150}
                disabled={busy}
              />
            </div>
            <Input
              label="شماره موبایل"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              placeholder="0912 123 4567"
              value={profile.phone_number}
              onChange={(event) => update('phone_number', event.target.value)}
              error={firstFieldError(fields, 'phone_number')}
              required
              maxLength={40}
              disabled={busy}
            />
            <p className="auth-profile-purpose">
              شماره‌ات برای ارتباط دربارهٔ حسابت ثبت می‌شه. فعلاً کد پیامکی نمی‌فرستیم و شماره،
              تأییدنشده می‌مونه.
            </p>
            <label className="auth-marketing-choice">
              <input
                type="checkbox"
                checked={profile.marketing_opt_in}
                onChange={(event) => update('marketing_opt_in', event.target.checked)}
                disabled={busy}
              />
              <span>
                مایلم خبر دوره‌ها و پیشنهادها رو دریافت کنم. <small>اختیاری</small>
              </span>
            </label>
            {error && (
              <p role="alert" className="auth-message auth-message--error">
                {error}
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              pending={busy}
              pendingLabel="داریم ذخیره می‌کنیم…"
              className="auth-submit"
            >
              ذخیره و ادامه
            </Button>
          </form>
          <Button
            type="button"
            variant="quiet"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              postAuth('/api/v1/accounts/logout/')
                .then(() => {
                  client.clear();
                  navigate(`/account/login${location.search}`, { replace: true });
                })
                .catch((err) => setError((err as Error).message))
                .finally(() => setBusy(false));
            }}
          >
            خروج و استفاده از حساب دیگه
          </Button>
        </>
      ) : error ? (
        <>
          <p role="alert">{error}</p>
          <Button onClick={() => setRetry((value) => value + 1)}>تلاش دوباره</Button>
        </>
      ) : (
        <p role="status">داریم مشخصات حسابت رو می‌گیریم…</p>
      )}
    </AuthFrame>
  );
}
