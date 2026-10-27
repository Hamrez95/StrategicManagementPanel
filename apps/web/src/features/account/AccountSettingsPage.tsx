import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useOutletContext } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../api/queryKeys';
import { Button, Input, useUIAppearance } from '@stratino/ui';
import { AuthApiError, firstFieldError, postAuth } from '../auth/api';
import type { AuthFields } from '../auth/api';
import type { Session } from '../../session';
import AccountSubscriptionHub from './AccountSubscriptionHub';
import { AccountSecuritySettings } from './AccountSecuritySettings';
import { AccountAvatar, AvatarPicker, useAccountAvatars } from './AccountAvatar';
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

function firstError(fields: AuthFields, name: string, english: boolean) {
  const message = firstFieldError(fields, name);
  return english && message ? 'Review this field and try again.' : message;
}

export default function AccountSettingsPage() {
  const session = useOutletContext<Session>();
  const english = useUIAppearance().dir === 'ltr';
  const t = (fa: string, en: string) => (english ? en : fa);
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
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const avatars = useAccountAvatars();
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
    setFirstName(profileQuery.data.first_name);
    setLastName(profileQuery.data.last_name);
    setPhone(profileQuery.data.phone_number);
    setAvatarId(profileQuery.data.avatar_id);
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
      const saved = await saveAccountProfile({
        display_name: displayName,
        role_title: roleTitle,
        first_name: firstName,
        last_name: lastName,
        phone_number: phone,
        avatar_id: avatarId,
        expected_user_id: profileQuery.data?.user_id,
      });
      queryClient.setQueryData(queryKeys.account.profile, saved);
      queryClient.setQueryData<Session | null>(queryKeys.session, (current) =>
        current
          ? {
              ...current,
              user: {
                ...current.user,
                name:
                  saved.display_name ||
                  `${saved.first_name} ${saved.last_name}`.trim() ||
                  saved.email,
                avatar: saved.avatar,
              },
            }
          : current,
      );
      setProfileSaved(true);
    } catch (error) {
      if (error instanceof AuthApiError) {
        setProfileFields(error.fields);
        setProfileError(
          english ? 'Could not save your profile. Review the highlighted fields.' : error.message,
        );
      } else {
        setProfileError(
          t(
            'اطلاعات ذخیره نشد؛ اتصال رو بررسی کن و دوباره تلاش کن.',
            'Could not save your profile. Check your connection and try again.',
          ),
        );
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
      setPreferencesMessage('saved');
    } catch (error) {
      setPreferencesError(true);
      setPreferencesMessage(
        !english && error instanceof AuthApiError
          ? error.message
          : t(
              'تنظیمات ذخیره نشد؛ اتصال رو بررسی کن و دوباره تلاش کن.',
              'Could not save settings. Check your connection and try again.',
            ),
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
      setEmailMessage(
        english
          ? 'Verification requested. Check the new email address for the link.'
          : response.message,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.account.profile });
    } catch (error) {
      setEmailError(
        !english && error instanceof AuthApiError
          ? error.message
          : t(
              'درخواست تغییر ایمیل ثبت نشد؛ دوباره تلاش کن.',
              'Could not request an email change. Try again.',
            ),
      );
    } finally {
      setEmailPending(false);
    }
  }

  return (
    <section className="account-settings" aria-labelledby="account-settings-title">
      <header className="account-settings__header">
        <p className="auth-kicker">{t('حساب شخصی', 'Personal account')}</p>
        <h1 id="account-settings-title" tabIndex={-1}>
          {t('پروفایل و تنظیمات', 'Profile and settings')}
        </h1>
        <p>
          {t(
            'مشخصاتت، چهرهٔ حسابت و اشتراک‌هات رو از اینجا مدیریت کن.',
            'Manage your profile, avatar and subscriptions here.',
          )}
        </p>
        <div className="account-profile-preview">
          <AccountAvatar
            avatar={
              avatars.data?.avatars.find((item) => item.id === avatarId) ??
              (avatarId ? profileQuery.data?.avatar : null)
            }
            name={displayName || firstName}
            size={72}
          />
          <div>
            <strong>
              {displayName || `${firstName} ${lastName}`.trim() || t('حساب من', 'My account')}
            </strong>
            <bdi dir="ltr">{profileQuery.data?.email ?? t('در حال بارگذاری…', 'Loading…')}</bdi>
          </div>
        </div>
      </header>
      <nav className="account-section-nav" aria-label={t('بخش‌های حساب', 'Account sections')}>
        <a href="#profile-heading">{t('اطلاعات شخصی', 'Personal information')}</a>
        <a href="#academy-plans">{t('اشتراک‌های آکادمی', 'Academy subscriptions')}</a>
        <a href="#account-preferences">{t('ظاهر و تجربه', 'Appearance and experience')}</a>
        <a href="#email-heading">{t('ایمیل و امنیت', 'Email and security')}</a>
      </nav>

      {profileQuery.isPending && (
        <Feedback message={t('در حال بارگذاری اطلاعات حساب…', 'Loading account information…')} />
      )}
      {profileQuery.isError && (
        <Feedback
          error
          message={
            english
              ? 'Could not load account information.'
              : profileQuery.error.message || 'اطلاعات حساب بارگذاری نشد.'
          }
        />
      )}
      {preferencesQuery.isError && (
        <Feedback
          error
          message={
            english
              ? 'Could not load account settings.'
              : preferencesQuery.error.message || 'تنظیمات حساب بارگذاری نشد.'
          }
        />
      )}

      <section className="account-card" aria-labelledby="profile-heading">
        <div className="account-card__heading">
          <div>
            <h2 id="profile-heading">{t('اطلاعات شخصی', 'Personal information')}</h2>
            <p>
              {t(
                'مشخصات اینجا به حساب تو مربوطه. نقش و دسترسی هر پروژه رو در فضای کار همون پروژه می‌بینی.',
                'These details belong to your account. You can find your role and permissions in each project’s workspace.',
              )}
            </p>
          </div>
        </div>
        <form className="account-form account-profile-editor" onSubmit={saveProfile} noValidate>
          <fieldset
            className="account-profile-fields"
            disabled={profilePending || profileQuery.isPending}
          >
            <Input
              label={t('نام', 'First name')}
              value={firstName}
              onChange={(event) => {
                setFirstName(event.target.value);
                setProfileSaved(false);
              }}
              autoComplete="given-name"
              maxLength={150}
              required
              error={firstError(profileFields, 'first_name', english)}
            />
            <Input
              label={t('نام خانوادگی', 'Last name')}
              value={lastName}
              onChange={(event) => {
                setLastName(event.target.value);
                setProfileSaved(false);
              }}
              autoComplete="family-name"
              maxLength={150}
              required
              error={firstError(profileFields, 'last_name', english)}
            />
            <Input
              label={t('نام نمایشی', 'Display name')}
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                setProfileSaved(false);
              }}
              error={firstError(profileFields, 'display_name', english)}
              maxLength={80}
              autoComplete="name"
            />
            <Input
              label={t('عنوان حرفه‌ای (اختیاری)', 'Professional title (optional)')}
              value={roleTitle}
              onChange={(event) => {
                setRoleTitle(event.target.value);
                setProfileSaved(false);
              }}
              error={firstError(profileFields, 'role_title', english)}
              maxLength={80}
            />
            <Input
              label={t('شماره موبایل', 'Mobile number')}
              type="tel"
              inputMode="tel"
              dir="ltr"
              autoComplete="tel"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                setProfileSaved(false);
              }}
              maxLength={40}
              required
              error={firstError(profileFields, 'phone_number', english)}
            />
            <p className="account-profile-phone-note">
              {profileQuery.data?.phone_verified && phone === profileQuery.data.phone_number
                ? t('شمارهٔ فعلی تأیید شده.', 'Your current number is verified.')
                : t(
                    'فعلاً تأیید پیامکی فعال نیست؛ شماره برای ارتباط دربارهٔ حسابت ثبت می‌شه.',
                    'SMS verification is not enabled yet. Your number is saved for account-related communication.',
                  )}
            </p>
          </fieldset>
          <AvatarPicker
            value={avatarId}
            onChange={(id) => {
              setAvatarId(id);
              setProfileSaved(false);
            }}
            disabled={profilePending || profileQuery.isPending}
            error={firstError(profileFields, 'avatar_id', english)}
          />
          {profileError && <Feedback error message={profileError} />}
          {profileSaved && (
            <Feedback message={t('اطلاعات شخصی ذخیره شد.', 'Personal information saved.')} />
          )}
          <Button
            type="submit"
            variant="primary"
            pending={profilePending}
            pendingLabel={t('در حال ذخیره…', 'Saving…')}
          >
            {t('ذخیره اطلاعات', 'Save information')}
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
            <h2 id="preferences-heading">{t('ظاهر و تجربه', 'Appearance and experience')}</h2>
            <p>
              {t(
                'این انتخاب‌ها با حسابت همگام می‌شن. در اولین ورود، تنظیمات همین دستگاه به حسابت منتقل می‌شه.',
                'These preferences sync with your account. On your first visit, this device’s preferences are copied to your account.',
              )}
            </p>
          </div>
        </div>
        <form className="account-form" onSubmit={savePreferences}>
          <div className="account-form__grid">
            <div className="ui-field">
              <label htmlFor="account-theme">{t('پوسته', 'Theme')}</label>
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
                <option value="system">{t('هماهنگ با دستگاه', 'Follow device')}</option>
                <option value="light">{t('روشن', 'Light')}</option>
                <option value="dark">{t('تیره', 'Dark')}</option>
              </select>
            </div>
            <div className="ui-field">
              <label htmlFor="account-language">{t('زبان رابط', 'Interface language')}</label>
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
              <label htmlFor="account-motion">{t('حرکت رابط', 'Interface motion')}</label>
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
                <option value="auto">
                  {t('هماهنگ با تنظیم دستگاه', 'Follow device preferences')}
                </option>
                <option value="reduced">{t('حرکت کمتر', 'Less motion')}</option>
              </select>
            </div>
          </div>
          <label className="account-check">
            <input
              type="checkbox"
              checked={preferences.show_tutorial}
              onChange={(event) =>
                setPreferences((current) => ({ ...current, show_tutorial: event.target.checked }))
              }
            />
            <span>
              {t(
                'نمایش راهنمای تعاملی در نسخه نمونه',
                'Show the interactive guide in the prototype',
              )}
            </span>
          </label>
          <p className="account-form__hint">
            {t(
              'خاموش‌کردن راهنما فقط تور آموزشی رو می‌بنده؛ هشدارهای اعتبار داده و محاسبات همچنان نمایش داده می‌شن.',
              'Turning off the guide only hides the tour. Data validity and calculation warnings remain visible.',
            )}
          </p>
          {preferencesMessage && (
            <Feedback
              error={preferencesError}
              message={
                preferencesError
                  ? english
                    ? 'Could not save settings. Check your connection and try again.'
                    : preferencesMessage
                  : t(
                      'تنظیمات حسابت ذخیره و با این دستگاه همگام شد.',
                      'Your settings were saved and synced with this device.',
                    )
              }
            />
          )}
          <Button
            type="submit"
            variant="primary"
            pending={preferencesPending}
            pendingLabel={t('در حال ذخیره…', 'Saving…')}
          >
            {t('ذخیره تنظیمات', 'Save settings')}
          </Button>
        </form>
      </section>

      <section className="account-card" aria-labelledby="email-heading">
        <div className="account-card__heading">
          <div>
            <h2 id="email-heading">{t('نشانی ایمیل', 'Email address')}</h2>
            <p>
              {t('ایمیل فعلی', 'Current email')}{' '}
              <strong dir="ltr">
                {profileQuery.data?.email ?? t('در حال بارگذاری…', 'Loading…')}
              </strong>
            </p>
          </div>
        </div>
        {profileQuery.data?.pending_email && (
          <Feedback
            message={
              english
                ? `Open the verification link to use ${profileQuery.data.pending_email}. Until then, sign in with your current email.`
                : `برای ثبت ${profileQuery.data.pending_email} پیوند تأیید رو باز کن. تا اون موقع با ایمیل فعلی وارد می‌شی.`
            }
          />
        )}
        <form className="account-form account-form--email" onSubmit={changeEmail} noValidate>
          <Input
            label={t('ایمیل تازه', 'New email')}
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
            pendingLabel={t('در حال ارسال…', 'Sending…')}
          >
            {t('ارسال پیوند تأیید به ایمیل تازه', 'Send verification link to new email')}
          </Button>
        </form>
      </section>

      <AccountSecuritySettings
        key={session.user.id}
        userId={session.user.id}
        english={english}
        operator={session.user.is_staff === true}
      />

      <p className="account-settings__back">
        <Link to="/app/workspaces">{t('بازگشت به فضاهای من', 'Back to my workspaces')}</Link>
      </p>
    </section>
  );
}

export function EmailChangeConfirmationPage() {
  const english = useUIAppearance().dir === 'ltr';
  const t = (fa: string, en: string) => (english ? en : fa);
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
        <p className="auth-kicker">{t('حساب استراتینو', 'Stratino account')}</p>
        <h1 id="email-confirmation-title" tabIndex={-1}>
          {state === 'success'
            ? t('ایمیل تازه تأیید شد', 'New email verified')
            : t('تأیید نشانی ایمیل', 'Verify email address')}
        </h1>
        <Feedback
          error={state === 'error'}
          message={
            english
              ? state === 'success'
                ? 'Your new email is verified. Sign in to continue.'
                : state === 'checking'
                  ? 'Checking the link…'
                  : 'This link could not be verified. Request a new link from account settings.'
              : message
          }
        />
        {state === 'success' ? (
          <Link className="ui-button ui-button--primary auth-submit" to="/account/login">
            {t('بازگشت به حساب', 'Back to account')}
          </Link>
        ) : (
          <Link className="auth-context__link" to="/account/login">
            {t('بازگشت به ورود', 'Back to sign in')}
          </Link>
        )}
      </div>
    </section>
  );
}
