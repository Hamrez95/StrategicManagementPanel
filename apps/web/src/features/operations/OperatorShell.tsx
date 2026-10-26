import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { Brand } from '@stratino/ui';
import { requestApi } from '../../api/client';
import { LanguageSwitch, ThemeSwitch } from '../chrome/HeaderControls';
import { AcademyFeedbackInbox } from '../academy/AcademyFeedbackInbox';
import { OperatorIcon } from './OperatorIcon';
import { OperatorOverview } from './OperatorOverview';
import { OperatorPassword, OperatorTeam } from './OperatorAdministration';
import {
  OperatorSecurity,
  type OperatorStatus,
  type OperatorCapabilities,
} from './OperatorSecurity';

export function OperatorShell({
  sections,
  titles,
  renderCollection,
}: {
  sections: readonly string[];
  titles: Record<string, [string, string]>;
  renderCollection: (
    section: string,
    english: boolean,
    reauthenticate: () => void,
    capabilities: OperatorCapabilities,
  ) => ReactNode;
}) {
  const location = useLocation();
  const route = location.pathname.split('/')[2] || 'overview';
  const [english, setEnglish] = useState(document.documentElement.lang === 'en');
  const [status, setStatus] = useState<OperatorStatus | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const more = useRef<HTMLDialogElement>(null);
  const reauthenticate = useCallback(() => {
    setStatus(null);
    setReload((value) => value + 1);
  }, []);
  const t = (fa: string, en: string) => (english ? en : fa);
  const labels: Record<string, [string, string]> = {
    overview: ['نمای کلی', 'Overview'],
    ...titles,
    security: ['امنیت حساب', 'Account security'],
    password: ['تغییر گذرواژه', 'Change password'],
    team: ['مدیران سرویس', 'Administrators'],
  };
  const available = [
    'overview',
    ...sections.filter((s) => status?.sections.includes(s)),
    ...(status?.can_manage_operators ? ['team'] : []),
    'password',
    'security',
  ];
  const href = (s: string) => '/internal' + (s === 'overview' ? '' : '/' + s);
  const label = (s: string) => labels[s]?.[english ? 1 : 0] ?? s;
  useEffect(() => {
    const observer = new MutationObserver(() => setEnglish(document.documentElement.lang === 'en'));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    requestApi<OperatorStatus>('/api/v1/operator/status/', { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setStatus(data);
      })
      .catch((err: Error) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    const refresh = () => setReload((value) => value + 1);
    const timer = window.setInterval(refresh, 60_000);
    const focus = () => refresh();
    window.addEventListener('focus', focus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', focus);
    };
  }, [reauthenticate]);
  useEffect(() => {
    if (!status?.mfa_ready || !status.expires_at) return;
    const timer = window.setTimeout(
      reauthenticate,
      Math.max(100, Date.parse(status.expires_at) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [status, reauthenticate]);
  useEffect(() => {
    more.current?.close();
  }, [location.pathname]);
  async function lock() {
    if (status) setStatus({ ...status, mfa_ready: false, expires_at: null });
    try {
      await requestApi('/api/v1/operator/mfa/lock/', { method: 'POST', body: {} });
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function logout() {
    setStatus(null);
    try {
      await requestApi('/api/v1/accounts/logout/', { method: 'POST', body: {} });
      window.location.assign('/account/login');
    } catch {
      setError(
        t(
          'خروج انجام نشد. اتصال رو بررسی کن و دوباره تلاش کن.',
          'Sign out was not confirmed. Check your connection and retry.',
        ),
      );
    }
  }
  const nav = (mobile = false) => (
    <nav
      aria-label={t(
        mobile ? 'همهٔ بخش‌های مدیریت' : 'بخش‌های اپراتور',
        mobile ? 'All admin sections' : 'Operator sections',
      )}
      className="op-navigation"
    >
      {available.map((s) => (
        <NavLink key={s} to={href(s)} end={s === 'overview'}>
          <OperatorIcon name={s} />
          <span>{label(s)}</span>
          <span className="op-nav-arrow">
            <OperatorIcon name="arrow" size={15} />
          </span>
        </NavLink>
      ))}
    </nav>
  );
  return (
    <div className="operator-console" dir={english ? 'ltr' : 'rtl'}>
      <aside className="op-sidebar">
        <Link to="/" className="op-brand" aria-label={t('صفحهٔ اصلی استراتینو', 'Stratino home')}>
          <Brand english={english} />
          <span>{t('مدیریت سرویس', 'Service administration')}</span>
        </Link>
        <div className="op-sidebar-label">{t('فضای مدیریت', 'Administration')}</div>
        {nav()}
        <div className="op-sidebar-bottom">
          <span className="op-avatar">
            <OperatorIcon name="accounts" size={23} />
          </span>
          <div>
            <strong>{status?.actor?.name ?? t('اپراتور', 'Operator')}</strong>
            <span>
              {status?.mfa_ready
                ? t('نشست تأییدشده', 'Verified session')
                : t('ورود دومرحله‌ای', 'Two-step verification')}
            </span>
          </div>
          <button onClick={() => void logout()} aria-label={t('خروج از حساب', 'Sign out')}>
            <OperatorIcon name="logout" size={19} />
          </button>
        </div>
      </aside>
      <div className="op-main">
        <header className="op-topbar">
          <div className="op-page-title">
            <Link to="/" aria-label={t('صفحهٔ اصلی استراتینو', 'Stratino home')}>
              {t('مدیریت کل استراتینو', 'Stratino service administration')}
            </Link>
            <h1>{label(route)}</h1>
          </div>
          <div className="op-topbar-tools">
            <time dateTime={new Date().toISOString().slice(0, 10)}>
              {new Intl.DateTimeFormat(english ? 'en' : 'fa-IR', {
                day: 'numeric',
                month: 'long',
              }).format(new Date())}
            </time>
            <ThemeSwitch />
            <LanguageSwitch english={english} />
            <button
              className="op-account-control"
              onClick={() => more.current?.showModal()}
              aria-label={t('بازکردن بخش‌های مدیریت', 'Open administration menu')}
            >
              <OperatorIcon name="more" />
            </button>
          </div>
        </header>
        <div className="op-page-body" key={route}>
          <div className="op-page-context">
            <span>
              <span className={'op-status-dot ' + (status?.mfa_ready ? 'is-ready' : '')} />
              {status?.mfa_ready
                ? t('نشست امن مدیریت', 'Verified admin session')
                : t('تأیید دسترسی مدیریت', 'Admin access verification')}
            </span>
            <div>
              <Link to="/">
                <OperatorIcon name="home" size={18} />
                {t('خانه', 'Home')}
              </Link>
              <Link to="/academy">
                <OperatorIcon name="academy" size={18} />
                {t('آکادمی', 'Academy')}
              </Link>
              {status?.mfa_ready && (
                <button onClick={() => void lock()}>
                  <OperatorIcon name="security" size={16} />
                  {t('قفل نشست', 'Lock session')}
                </button>
              )}
              <Link to="/app">
                {t('ورود به فضای کار', 'My Workspaces')}
                <OperatorIcon name="arrow" size={15} />
              </Link>
            </div>
          </div>
          {!status && !error && (
            <div
              className="op-skeleton"
              role="status"
              aria-label={t(
                'داریم مجوزهای دسترسی رو بررسی می‌کنیم…',
                'Checking operator permissions…',
              )}
            >
              <div />
              <div />
              <div />
            </div>
          )}
          {error && (
            <section className="op-empty op-card" role="alert">
              <OperatorIcon name="cloud" size={42} />
              <h2>{t('ارتباط با پنل برقرار نشد', 'Admin access could not be verified')}</h2>
              <p>
                {english ? 'Check your connection, session and administrator permissions.' : error}
              </p>
              <button className="op-primary" onClick={reauthenticate}>
                {t('تلاش دوباره', 'Retry')}
                <OperatorIcon name="refresh" size={18} />
              </button>
            </section>
          )}
          {status &&
            !error &&
            (status.must_change_password || (route === 'password' && status.mfa_ready) ? (
              <OperatorPassword
                english={english}
                initial={status.must_change_password}
                onDone={reauthenticate}
              />
            ) : !status.mfa_ready || route === 'security' ? (
              <OperatorSecurity
                key={String(status.mfa_ready)}
                status={status}
                english={english}
                onVerified={reauthenticate}
                onLock={() => void lock()}
              />
            ) : route === 'team' && status.can_manage_operators ? (
              <OperatorTeam english={english} />
            ) : route === 'overview' ? (
              <OperatorOverview
                english={english}
                sections={status.sections}
                onReauthenticate={reauthenticate}
              />
            ) : status.sections.includes(route) && sections.includes(route) ? (
              route === 'feedback' ? (
                <AcademyFeedbackInbox
                  embedded
                  english={english}
                  canTriage={status.capabilities?.triage_feedback === true}
                />
              ) : (
                renderCollection(route, english, reauthenticate, status.capabilities ?? {})
              )
            ) : (
              <section className="op-empty op-card" role="alert">
                <OperatorIcon name="security" size={36} />
                <h2>{t('این بخش در دسترس نیست', 'This section is unavailable')}</h2>
                <p>
                  {t(
                    'آدرس رو بررسی کن یا از فهرست مدیریت یک بخش دیگه رو انتخاب کن.',
                    'Check the address or choose another section from the menu.',
                  )}
                </p>
                <Link to="/internal">{t('برگشت به نمای کلی', 'Back to overview')}</Link>
              </section>
            ))}
        </div>
        <footer className="op-footer">
          <span>{t('استراتینو', 'Stratino')}</span>
          <span>
            {t('مدیریت حساب‌ها، آکادمی و دسترسی‌ها', 'Accounts, Academy and access administration')}
          </span>
        </footer>
      </div>
      <nav
        className="op-mobile-navigation"
        aria-label={t('ناوبری سریع مدیریت', 'Quick admin navigation')}
      >
        {available.slice(0, 4).map((s) => (
          <NavLink key={s} to={href(s)} end={s === 'overview'}>
            <OperatorIcon name={s} />
            <span>{label(s)}</span>
          </NavLink>
        ))}
        <button onClick={() => more.current?.showModal()}>
          <OperatorIcon name="more" />
          <span>{t('بیشتر', 'More')}</span>
        </button>
      </nav>
      <dialog
        ref={more}
        className="op-more-dialog"
        aria-labelledby="op-more-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) more.current?.close();
        }}
      >
        <header>
          <h2 id="op-more-title">{t('بخش‌های مدیریت', 'Administration sections')}</h2>
          <button onClick={() => more.current?.close()} aria-label={t('بستن', 'Close')}>
            <OperatorIcon name="close" />
          </button>
        </header>
        {nav(true)}
        <Link to="/">{t('صفحهٔ اصلی سایت', 'Website home')}</Link>
        <Link to="/academy">{t('آکادمی', 'Academy')}</Link>
        <Link to="/app/workspaces">{t('فضاهای من', 'My Workspaces')}</Link>
        <Link to="/app/account">{t('حساب من', 'My account')}</Link>
      </dialog>
    </div>
  );
}
