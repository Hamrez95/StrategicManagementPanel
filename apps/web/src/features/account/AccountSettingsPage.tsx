import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../api/queryKeys';
import { Button, Input } from '@stratino/ui';
import { AuthApiError, firstFieldError, postAuth } from '../auth/api';
import type { AuthFields } from '../auth/api';
import type { Session } from '../../session';
import AccountSubscriptionHub from './AccountSubscriptionHub';
import {
  loadAndSyncAccountPreferences,
  readAccountProfile,
  requestEmailChange,
  saveAccountPreferences,
  saveAccountProfile,
  type DevicePreferences,
} from './api';

function Feedback({ message, error = false }: { message: string; error?: boolean }) {
  if (!message) return null;
  return (
    <p
      className={`account-feedback${error ? ' account-feedback--error' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      {message}
    </p>
  );
}

function firstError(fields: AuthFields, name: string) {
  return firstFieldError(fields, name);
}

export default function AccountSettingsPage() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: queryKeys.account.profile,
    queryFn: ({ signal }) => readAccountProfile(signal),
  });
  const preferencesQuery = useQuery({
    queryKey: queryKeys.account.preferences,
    queryFn: ({ signal }) => loadAndSyncAccountPreferences(signal),
  });
  const [displayName, setDisplayName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [email, setEmail] = useState('');
  const [profilePending, setProfilePending] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileFields, setProfileFields] = useState<AuthFields>({});
  const [profileSaved, setProfileSaved] = useState(false);
  const [preferences, setPreferences] = useState<DevicePreferences>({
    theme: 'system',
    language: 'fa',
    motion: 'auto',
    show_tutorial: true,
  });
  const [preferencesPending, setPreferencesPending] = useState(false);
  const [preferencesMessage, setPreferencesMessage] = useState('');
  const [preferencesError, setPreferencesError] = useState(false);
  const [emailPending, setEmailPending] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    if (!profileQuery.data) return;
    setDisplayName(profileQuery.data.display_name);
    setRoleTitle(profileQuery.data.role_title);
  }, [profileQuery.data]);

  useEffect(() => {
    if (!preferencesQuery.data) return;
    setPreferences({
      theme: preferencesQuery.data.theme,
      language: preferencesQuery.data.language,
      motion: preferencesQuery.data.motion,
      show_tutorial: preferencesQuery.data.show_tutorial,
    });
  }, [preferencesQuery.data]);

  useEffect(() => {
    const id = location.hash.slice(1);
    if (id)
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
  }, [location.hash]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfilePending(true);
    setProfileError('');
    setProfileFields({});
    setProfileSaved(false);
    try {
      const saved = await saveAccountProfile({ display_name: displayName, role_title: roleTitle });
      queryClient.setQueryData(queryKeys.account.profile, saved);
      queryClient.setQueryData<Session | null>(queryKeys.session, (current) =>
        current
          ? {
              ...current,
              user: { ...current.user, name: saved.display_name || saved.email },
            }
          : current,
      );
      setProfileSaved(true);
    } catch (error) {
      if (error instanceof AuthApiError) {
        setProfileFields(error.fields);
        setProfileError(error.message);
      } else {
        setProfileError('ذخیره اطلاعات انجام نشد. اتصال را بررسی و دوباره تلاش کنید.');
      }
    } finally {
      setProfilePending(false);
    }
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPreferencesPending(true);
    setPreferencesMessage('');
    setPreferencesError(false);
    try {
      const saved = await saveAccountPreferences(preferences);
      queryClient.setQueryData(queryKeys.account.preferences, saved);
      setPreferencesMessage('تنظیمات حساب ذخیره و با این دستگاه همگام شد.');
    } catch (error) {
      setPreferencesError(true);
      setPreferencesMessage(
        error instanceof AuthApiError
          ? error.message
          : 'تنظیمات ذخیره نشد. اتصال را بررسی و دوباره تلاش کنید.',
      );
    } finally {
      setPreferencesPending(false);
    }
  }

  async function changeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailPending(true);
    setEmailError('');
    setEmailMessage('');
    try {
      const response = await requestEmailChange(email);
      setEmailMessage(response.message);
      await queryClient.invalidateQueries({ queryKey: queryKeys.account.profile });
    } catch (error) {
      setEmailError(
        error instanceof AuthApiError
          ? error.message
          : 'درخواست تغییر ایمیل انجام نشد. اتصال را بررسی و دوباره تلاش کنید.',
      );
    } finally {
      setEmailPending(false);
    }
  }

  return (
    <section className="account-settings" aria-labelledby="account-settings-title">
      <header className="account-settings__header">
        <p className="auth-kicker">حساب شخصی</p>
        <h1 id="account-settings-title" tabIndex={-1}>
          پروفایل و تنظیمات
        </h1>
        <p>اطلاعات حساب شما از جزئیات هر فضای کار جدا نگهداری می‌شود.</p>
      </header>

      {profileQuery.isPending && <Feedback message="در حال بارگذاری اطلاعات حساب…" />}
      {profileQuery.isError && (
        <Feedback error message={profileQuery.error.message || 'اطلاعات حساب بارگذاری نشد.'} />
      )}
      {preferencesQuery.isError && (
        <Feedback error message={preferencesQuery.error.message || 'تنظیمات حساب بارگذاری نشد.'} />
      )}

      <section className="account-card" aria-labelledby="profile-heading">
        <div className="account-card__heading">
          <div>
            <h2 id="profile-heading">اطلاعات شخصی</h2>
            <p>
              نام و عنوان شما در حساب نمایش داده می‌شود؛ نقش‌های فضای کار در تنظیمات همان پروژه
              هستند.
            </p>
          </div>
        </div>
        <form className="account-form" onSubmit={saveProfile} noValidate>
          <Input
            label="نام نمایشی"
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setProfileSaved(false);
            }}
            error={firstError(profileFields, 'display_name')}
            maxLength={80}
            autoComplete="name"
          />
          <Input
            label="عنوان حرفه‌ای (اختیاری)"
            value={roleTitle}
            onChange={(event) => {
              setRoleTitle(event.target.value);
              setProfileSaved(false);
            }}
            error={firstError(profileFields, 'role_title')}
            maxLength={80}
          />
          {profileError && <Feedback error message={profileError} />}
          {profileSaved && <Feedback message="اطلاعات شخصی ذخیره شد." />}
          <Button
            type="submit"
            variant="primary"
            pending={profilePending}
            pendingLabel="در حال ذخیره…"
          >
            ذخیره اطلاعات
          </Button>
        </form>
      </section>

      <AccountSubscriptionHub />

      <section
        id="account-preferences"
        className="account-card"
        aria-labelledby="preferences-heading"
      >
        <div className="account-card__heading">
          <div>
            <h2 id="preferences-heading">ظاهر و تجربه</h2>
            <p>
              این انتخاب‌ها با حساب شما همگام می‌شوند. در اولین ورود، تنظیمات همین دستگاه به حساب
              منتقل می‌شود.
            </p>
          </div>
        </div>
        <form className="account-form" onSubmit={savePreferences}>
          <div className="account-form__grid">
            <div className="ui-field">
              <label htmlFor="account-theme">پوسته</label>
              <select
                id="account-theme"
                className="ui-input"
                value={preferences.theme}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    theme: event.target.value as DevicePreferences['theme'],
                  }))
                }
              >
                <option value="system">هماهنگ با دستگاه</option>
                <option value="light">روشن</option>
                <option value="dark">تیره</option>
              </select>
            </div>
            <div className="ui-field">
              <label htmlFor="account-language">زبان رابط</label>
              <select
                id="account-language"
                className="ui-input"
                value={preferences.language}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    language: event.target.value as DevicePreferences['language'],
                  }))
                }
              >
                <option value="fa">فارسی</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="ui-field">
              <label htmlFor="account-motion">حرکت رابط</label>
              <select
                id="account-motion"
                className="ui-input"
                value={preferences.motion}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    motion: event.target.value as DevicePreferences['motion'],
                  }))
                }
              >
                <option value="auto">هماهنگ با تنظیم دستگاه</option>
                <option value="reduced">حرکت کمتر</option>
              </select>
            </div>
          </div>
          {preferences.language === 'en' && (
            <p className="account-form__hint">
              نسخه نمونه استراتینو انگلیسی است؛ صفحه‌های تازه حساب فعلاً به فارسی نمایش داده
              می‌شوند.
            </p>
          )}
          <label className="account-check">
            <input
              type="checkbox"
              checked={preferences.show_tutorial}
              onChange={(event) =>
                setPreferences((current) => ({ ...current, show_tutorial: event.target.checked }))
              }
            />
            <span>نمایش راهنمای تعاملی در نسخه نمونه</span>
          </label>
          <p className="account-form__hint">
            خاموش‌کردن راهنما فقط تور آموزشی را می‌بندد؛ هشدارهای اعتبار داده و محاسبات همچنان نمایش
            داده می‌شوند.
          </p>
          {preferencesMessage && <Feedback error={preferencesError} message={preferencesMessage} />}
          <Button
            type="submit"
            variant="primary"
            pending={preferencesPending}
            pendingLabel="در حال ذخیره…"
          >
            ذخیره تنظیمات
          </Button>
        </form>
      </section>

      <section className="account-card" aria-labelledby="email-heading">
        <div className="account-card__heading">
          <div>
            <h2 id="email-heading">نشانی ایمیل</h2>
            <p>
              ایمیل فعلی <strong dir="ltr">{profileQuery.data?.email ?? 'در حال بارگذاری…'}</strong>
            </p>
          </div>
        </div>
        {profileQuery.data?.pending_email && (
          <Feedback
            message={`برای ثبت ${profileQuery.data.pending_email} پیوند تأیید را باز کنید. تا آن زمان با ایمیل فعلی وارد می‌شوید.`}
          />
        )}
        <form className="account-form account-form--email" onSubmit={changeEmail} noValidate>
          <Input
            label="ایمیل تازه"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={emailError}
            autoComplete="email"
            inputMode="email"
            dir="ltr"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
          />
          {emailMessage && <Feedback message={emailMessage} />}
          <Button
            type="submit"
            variant="secondary"
            pending={emailPending}
            pendingLabel="در حال ارسال…"
          >
            ارسال پیوند تأیید به ایمیل تازه
          </Button>
        </form>
      </section>

      <p className="account-settings__back">
        <Link to="/app/start">بازگشت به فضای کار</Link>
      </p>
    </section>
  );
}

export function EmailChangeConfirmationPage() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [state, setState] = useState<'checking' | 'success' | 'error'>('checking');
  const [message, setMessage] = useState('در حال بررسی پیوند…');
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const token = new URLSearchParams(location.hash.slice(1)).get('token');
    if (!token) {
      setState('error');
      setMessage(
        'پیوند تغییر ایمیل پیدا نشد یا منقضی شده است. از تنظیمات حساب درخواست تازه‌ای بفرستید.',
      );
      return;
    }
    handled.current = true;
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
    void postAuth<{ message: string }>('/api/v1/account/email-change/confirm/', { token })
      .then((response) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.session });
        void queryClient.invalidateQueries({ queryKey: queryKeys.account.profile });
        setState('success');
        setMessage(response.message);
      })
      .catch((error: unknown) => {
        setState('error');
        setMessage(
          error instanceof AuthApiError
            ? error.message
            : 'پیوند تأیید نشد. از تنظیمات حساب درخواست تازه‌ای بفرستید.',
        );
      });
  }, [location.hash, queryClient]);

  return (
    <section className="auth-shell auth-confirmation" aria-labelledby="email-confirmation-title">
      <div className="auth-panel">
        <p className="auth-kicker">حساب استراتینو</p>
        <h1 id="email-confirmation-title" tabIndex={-1}>
          {state === 'success' ? 'ایمیل تازه تأیید شد' : 'تأیید نشانی ایمیل'}
        </h1>
        <Feedback error={state === 'error'} message={message} />
        {state === 'success' ? (
          <Link className="ui-button ui-button--primary auth-submit" to="/account/login">
            بازگشت به حساب
          </Link>
        ) : (
          <Link className="auth-context__link" to="/account/login">
            بازگشت به ورود
          </Link>
        )}
      </div>
    </section>
  );
}
