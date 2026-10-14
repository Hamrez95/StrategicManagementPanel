import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation, useMatch, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Brand, Button, Notice, useUIAppearance } from '@stratino/ui';
import { readSession, type Session } from './session';
import { postAuth } from './features/auth/api';
import {
  applyAccountPreferences,
  loadAndSyncAccountPreferences,
  readDevicePreferences,
  saveAccountPreferences,
} from './features/account/api';
import type { DevicePreferences } from './features/account/api';
import { WorkspaceSwitchProvider, useWorkspaceSwitch } from './features/workspaces/switchContext';
const Site = lazy(() => import('./pages/Site'));
const Account = lazy(() => import('./pages/Account'));
const Workspace = lazy(() => import('./pages/Workspace'));
const WorkspaceManagement = lazy(() => import('./features/workspaces/WorkspaceManagementPage'));
const Operator = lazy(() => import('./pages/Operator'));
const AccountSettingsPage = lazy(() => import('./features/account/AccountSettingsPage'));
const ComponentLab = import.meta.env.DEV ? lazy(() => import('./pages/ComponentLab')) : null;

function RouteFocus() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.querySelector<HTMLElement>('main h1')?.focus();
    document.title =
      'استراتینو | ' + (pathname.startsWith('/app') ? 'فضای کار' : 'از تحلیل تا اقدام');
  }, [pathname]);
  return null;
}
function SessionBoundary({ operator = false }: { operator?: boolean }) {
  const { pathname } = useLocation();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const activeWorkspace = useMatch('/app/workspaces/:workspaceId/*')?.params.workspaceId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const query = useQuery({ queryKey: ['session'], queryFn: ({ signal }) => readSession(signal) });
  useQuery({
    queryKey: ['account-preferences'],
    queryFn: ({ signal }) => loadAndSyncAccountPreferences(signal),
    enabled: Boolean(query.data),
    staleTime: 5 * 60 * 1000,
  });
  if (query.isPending)
    return (
      <Notice title="در حال بررسی حساب">
        <p role="status">دسترسی فضای کار در حال بررسی است.</p>
      </Notice>
    );
  if (query.isError)
    return (
      <Notice title="فضای کار در دسترس نیست">
        <p role="alert">{query.error.message}</p>
        <Button onClick={() => void query.refetch()}>تلاش دوباره</Button>
        <Link className="text-link" to="/demo">
          بازکردن نسخه نمونه
        </Link>
      </Notice>
    );
  if (!query.data)
    return <Navigate to={'/account/login?next=' + encodeURIComponent(pathname)} replace />;
  if (operator && !query.data.user.is_staff)
    return (
      <Notice title="دسترسی ندارید">
        <p>این بخش ویژه مدیریت سرویس است.</p>
        <Link to="/">بازگشت به صفحه اصلی</Link>
      </Notice>
    );
  async function signOut() {
    setLogoutError('');
    setLoggingOut(true);
    try {
      await postAuth('/api/v1/accounts/logout/');
      queryClient.setQueryData(['session'], null);
      queryClient.removeQueries({ queryKey: ['account-preferences'] });
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] === 'workspace' });
      queryClient.removeQueries({ queryKey: ['workspaces'] });
      navigate('/account/login', { replace: true });
    } catch {
      setLogoutError('خروج انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید.');
    } finally {
      setLoggingOut(false);
    }
  }
  return (
    <WorkspaceSwitchProvider>
      <div className="session-tools">
        <WorkspaceSelector session={query.data} activeWorkspace={activeWorkspace} />
        <Link to="/app/account" className="session-account-link" aria-label={english
          ? `Account settings for ${query.data.user.name}`
          : `تنظیمات حساب ${query.data.user.name}`}>
          <span className="session-account-avatar" aria-hidden="true">
            {Array.from(query.data.user.name)[0] ?? 'ح'}
          </span>
          {english ? 'Account settings' : 'تنظیمات حساب'}
        </Link>
        <span>{english ? 'Signed in as' : 'واردشده با'} <strong dir="auto">{query.data.user.name}</strong></span>
        <Button variant="quiet" pending={loggingOut} pendingLabel={english ? 'Signing out…' : 'در حال خروج…'} onClick={() => void signOut()}>
          {english ? 'Sign out' : 'خروج از حساب'}
        </Button>
      </div>
      {logoutError && <p className="session-tools__error" role="alert">{logoutError}</p>}
      <Outlet context={query.data} />
    </WorkspaceSwitchProvider>
  );
}

function WorkspaceSelector({
  session,
  activeWorkspace,
}: {
  session: Session;
  activeWorkspace: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canSwitch } = useWorkspaceSwitch();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  return (
    <label className="workspace-selector">
      <span>{english ? 'Workspace' : 'فضای کار'}</span>
      <select
        aria-label={english ? 'Select Workspace' : 'انتخاب فضای کار'}
        value={activeWorkspace}
        onChange={(event) => {
          const next = event.currentTarget.value;
          const currentName = session.workspaces.find((workspace) => workspace.id === activeWorkspace)?.name
            ?? (english ? 'Your Workspaces' : 'فضاهای من');
          const nextName = session.workspaces.find((workspace) => workspace.id === next)?.name
            ?? (english ? 'Your Workspaces' : 'فضاهای من');
          const confirmMessage = english
            ? `Unsaved changes will be lost. Leave “${currentName}” and switch to “${nextName}”?`
            : `تغییرات ذخیره‌نشده باقی می‌مانند. از «${currentName}» به «${nextName}» بروید؟`;
          if (!canSwitch(confirmMessage)) return;
          if (activeWorkspace) {
            queryClient.removeQueries({
              predicate: (query) => query.queryKey[0] === 'workspace' && query.queryKey[1] === activeWorkspace,
            });
          }
          navigate(next ? `/app/workspaces/${encodeURIComponent(next)}` : '/app/workspaces');
        }}
      >
        <option value="">{english ? 'Your Workspaces' : 'فضاهای من'}</option>
        {session.workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name} · {workspace.role === 'owner' ? (english ? 'Owner' : 'مالک') : workspace.role === 'editor' ? (english ? 'Editor' : 'ویرایشگر') : (english ? 'Viewer' : 'بیننده')}
          </option>
        ))}
      </select>
    </label>
  );
}
export function App() {
  const queryClient = useQueryClient();
  const [devicePreferences, setDevicePreferences] = useState<DevicePreferences>(readDevicePreferences);
  const [preferenceSyncError, setPreferenceSyncError] = useState(false);
  const dark =
    devicePreferences.theme === 'dark' ||
    (devicePreferences.theme === 'system' &&
      (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false));
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      root.dataset.theme =
        devicePreferences.theme === 'system'
          ? globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : devicePreferences.theme;
      root.lang = devicePreferences.language;
      root.dir = devicePreferences.language === 'en' ? 'ltr' : 'rtl';
      root.dataset.motion = devicePreferences.motion;
    };
    apply();
    const systemTheme = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    systemTheme?.addEventListener('change', apply);
    return () => systemTheme?.removeEventListener('change', apply);
  }, [devicePreferences]);
  useEffect(() => {
    const onPreferences = (event: Event) => {
      const detail = (event as CustomEvent<DevicePreferences>).detail;
      if (detail) {
        setDevicePreferences(detail);
        setPreferenceSyncError(false);
      }
    };
    window.addEventListener('stratino:preferences', onPreferences);
    return () => window.removeEventListener('stratino:preferences', onPreferences);
  }, []);
  const toggleTheme = () => {
    const next: DevicePreferences = { ...devicePreferences, theme: dark ? 'light' : 'dark' };
    applyAccountPreferences(next);
    setPreferenceSyncError(false);
    const session = queryClient.getQueryData<Session | null>(['session']);
    if (session?.authenticated) {
      void saveAccountPreferences(next)
        .then((saved) => queryClient.setQueryData(['account-preferences'], saved))
        .catch(() => setPreferenceSyncError(true));
    }
  };
  useEffect(() => {
    if (location.hash.startsWith('#') && location.pathname === '/')
      location.replace('/prototype/' + location.hash);
  }, []);
  return (
    <>
      <a className="skip-link" href="#content">
        رفتن به محتوای اصلی
      </a>
      <header className="site-header">
        <Link to="/" aria-label="استراتینو، صفحه اصلی">
          <Brand />
        </Link>
        <nav aria-label="ناوبری اصلی">
          <Link to="/demo">نمونه تعاملی</Link>
          <Link to="/account/login">حساب کاربری</Link>
          <Button aria-label="تغییر تم" onClick={toggleTheme}>
            {dark ? 'تم روشن' : 'تم تیره'}
          </Button>
        </nav>
      </header>
      {preferenceSyncError && (
        <p className="preference-sync-note" role="status">
          ظاهر روی این دستگاه ذخیره شد، اما همگام‌سازی حساب کامل نشد. در تنظیمات حساب دوباره ذخیره کنید.
        </p>
      )}
      <main id="content" tabIndex={-1}>
        <Suspense
          fallback={
            <p className="loading" role="status">
              در حال آماده‌سازی صفحه…
            </p>
          }
        >
          <Routes>
            {ComponentLab && <Route path="/__dev/ui" element={<ComponentLab />} />}
            <Route path="/" element={<Site />} />
            <Route
              path="/demo"
              element={
                <section className="demo-view">
                  <div className="demo-note">
                    <p>
                      نسخه نمونه؛ داده‌ها در همین مرورگر ذخیره می‌شوند. ورود و ذخیره سروری در حال
                      توسعه است.
                    </p>
                    <a href="/prototype/">بازکردن تمام‌صفحه</a>
                  </div>
                  <iframe title="نمونه تعاملی استراتینو" src="/prototype/" />
                </section>
              }
            />
            <Route path="/account/*" element={<Account />} />
            <Route element={<SessionBoundary />}>
              <Route path="/app/workspaces" element={<WorkspaceManagement />} />
              <Route path="/app/workspaces/:workspaceId/*" element={<Workspace />} />
              <Route path="/app/start" element={<Navigate to="/app/workspaces" replace />} />
              <Route path="/app/account" element={<AccountSettingsPage />} />
            </Route>
            <Route element={<SessionBoundary operator />}>
              <Route path="/internal/*" element={<Operator />} />
            </Route>
            <Route
              path="*"
              element={
                <Notice title="صفحه پیدا نشد">
                  <p>این آدرس در استراتینو وجود ندارد.</p>
                  <Link to="/">بازگشت به صفحه اصلی</Link>
                </Notice>
              }
            />
          </Routes>
          <RouteFocus />
        </Suspense>
      </main>
      <footer className="site-footer">
        <Brand />
        <p>از تحلیل به تصمیم؛ از تصمیم به اقدام.</p>
        <span>نسخه در حال توسعه</span>
      </footer>
    </>
  );
}
