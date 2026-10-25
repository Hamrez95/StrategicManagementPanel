import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useMatch,
  useNavigate,
} from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Brand, Button, Notice, useUIAppearance } from '@stratino/ui';
import { queryKeys } from './api/queryKeys';
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
import { getWorkspaceTool, workspaceTools } from './features/workspaces/routeRegistry';
const Academy =
  import.meta.env.VITE_ACADEMY_PREVIEW === 'false'
    ? null
    : lazy(() => import('./features/academy/Academy'));
const Site = lazy(() => import('./pages/Site'));
const ProductExperience = lazy(() => import('./features/experience/ProductExperience'));
const Account = lazy(() => import('./pages/Account'));
const Workspace = lazy(() => import('./pages/Workspace'));
const WorkspaceManagement = lazy(() => import('./features/workspaces/WorkspaceManagementPage'));
const Onboarding = lazy(() => import('./features/onboarding/OnboardingPage'));
const ApplicationShell = lazy(() => import('./features/workspaces/ApplicationShell'));
const WorkspaceOverviewPage = lazy(() =>
  import('./features/workspaces/WorkspaceRoutePages').then((module) => ({
    default: module.WorkspaceOverviewPage,
  })),
);
const WorkspaceToolPage = lazy(() =>
  import('./features/workspaces/WorkspaceRoutePages').then((module) => ({
    default: module.WorkspaceToolPage,
  })),
);
const LegacyWorkspaceRedirect = lazy(() =>
  import('./features/workspaces/WorkspaceRoutePages').then((module) => ({
    default: module.LegacyWorkspaceRedirect,
  })),
);
const WorkspaceIndexRedirect = lazy(() =>
  import('./features/workspaces/WorkspaceRoutePages').then((module) => ({
    default: module.WorkspaceIndexRedirect,
  })),
);
const Operator = lazy(() => import('./pages/Operator'));
const OperatorLogin = lazy(() => import('./pages/OperatorLogin'));
const AccountSettingsPage = lazy(() => import('./features/account/AccountSettingsPage'));
const WorkspaceImportPage = lazy(() => import('./features/imports/WorkspaceImportPage'));
const CompanyProfilePage = lazy(() => import('./features/workspaces/CompanyProfilePage'));
const SwotPage = lazy(() => import('./features/strategy/SwotPage'));
const EvaluationMatrixPage = lazy(() => import('./features/analysis/EvaluationMatrixPage'));
const ExecutionPlanPage = lazy(() => import('./features/decisions/ExecutionPlanPage'));
const DocumentsPage = lazy(() => import('./features/documents/DocumentsPage'));
const ReportsPage = lazy(() => import('./features/reports/ReportsPage'));
const ComponentLab = import.meta.env.DEV ? lazy(() => import('./pages/ComponentLab')) : null;

function RouteFocus() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.querySelector<HTMLElement>('main h1')?.focus();
    const english = document.documentElement.lang === 'en';
    const toolId = pathname.split('/tools/')[1]?.split('/')[0];
    const tool = getWorkspaceTool(toolId);
    const title =
      tool?.title[english ? 'en' : 'fa'] ??
      (pathname.endsWith('/settings')
        ? english
          ? 'Workspace settings'
          : 'تنظیمات فضای کار'
        : pathname.endsWith('/imports')
          ? english
            ? 'Old browser backup'
            : 'پشتیبان مرورگر قدیمی'
          : pathname.endsWith('/account')
            ? english
              ? 'Account and preferences'
              : 'حساب و تنظیمات'
            : pathname.startsWith('/app')
              ? english
                ? 'Workspace'
                : 'فضای کار'
              : english
                ? 'From analysis to action'
                : 'از تحلیل تا اقدام');
    document.title = `استراتینو | ${title}`;
  }, [pathname]);
  return null;
}
function SessionBoundary({ operator = false }: { operator?: boolean }) {
  const { pathname, search } = useLocation();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const activeWorkspace = useMatch('/app/workspaces/:workspaceId/*')?.params.workspaceId ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const appPath = pathname.startsWith('/app');
  const query = useQuery({
    queryKey: queryKeys.session,
    queryFn: ({ signal }) => readSession(signal),
  });
  useQuery({
    queryKey: queryKeys.account.preferences,
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
    return (
      <Navigate
        to={
          (operator ? '/internal/login' : '/account/login') +
          '?next=' +
          encodeURIComponent(pathname + search)
        }
        replace
      />
    );
  if (query.data.user.profile_required && !operator)
    return (
      <Navigate
        to={'/account/complete-profile?next=' + encodeURIComponent(pathname + search)}
        replace
      />
    );
  if (operator && !query.data.user.is_staff)
    return (
      <Notice title="دسترسی ندارید">
        <p>این بخش ویژه مدیریت سرویس است.</p>
        <Link to="/">بازگشت به صفحه اصلی</Link>
      </Notice>
    );
  // Global administration has its own shell and no active customer Workspace.
  if (operator) return <Outlet context={query.data} />;
  async function signOut() {
    setLogoutError('');
    setLoggingOut(true);
    try {
      await postAuth('/api/v1/accounts/logout/');
      queryClient.setQueryData(queryKeys.session, null);
      queryClient.removeQueries({ queryKey: queryKeys.account.preferences });
      queryClient.removeQueries({ queryKey: queryKeys.account.profile });
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] === 'workspace' });
      queryClient.removeQueries({ queryKey: queryKeys.workspaces.all });
      navigate('/account/login', { replace: true });
    } catch {
      setLogoutError('خروج انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید.');
    } finally {
      setLoggingOut(false);
    }
  }
  return (
    <WorkspaceSwitchProvider>
      {!appPath && (
        <>
          <div className="session-tools">
            <WorkspaceSelector session={query.data} activeWorkspace={activeWorkspace} />
            <Link
              to="/app/account"
              className="session-account-link"
              aria-label={
                english
                  ? `Account settings for ${query.data.user.name}`
                  : `تنظیمات حساب ${query.data.user.name}`
              }
            >
              <span className="session-account-avatar" aria-hidden="true">
                {Array.from(query.data.user.name)[0] ?? 'ح'}
              </span>
              {english ? 'Account settings' : 'تنظیمات حساب'}
            </Link>
            <span>
              {english ? 'Signed in as' : 'واردشده با'}{' '}
              <strong dir="auto">{query.data.user.name}</strong>
            </span>
            <Button
              variant="quiet"
              pending={loggingOut}
              pendingLabel={english ? 'Signing out…' : 'در حال خروج…'}
              onClick={() => void signOut()}
            >
              {english ? 'Sign out' : 'خروج از حساب'}
            </Button>
          </div>
          {logoutError && (
            <p className="session-tools__error" role="alert">
              {logoutError}
            </p>
          )}
        </>
      )}
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
          const currentName =
            session.workspaces.find((workspace) => workspace.id === activeWorkspace)?.name ??
            (english ? 'Your Workspaces' : 'فضاهای من');
          const nextName =
            session.workspaces.find((workspace) => workspace.id === next)?.name ??
            (english ? 'Your Workspaces' : 'فضاهای من');
          const confirmMessage = english
            ? `Unsaved changes will be lost. Leave “${currentName}” and switch to “${nextName}”?`
            : `تغییرات ذخیره‌نشدهٔ «${currentName}» کنار گذاشته می‌شوند. به «${nextName}» بروید؟`;
          if (!canSwitch(confirmMessage)) return;
          if (activeWorkspace) {
            queryClient.removeQueries({
              predicate: (query) =>
                query.queryKey[0] === 'workspace' && query.queryKey[1] === activeWorkspace,
            });
          }
          navigate(next ? `/app/workspaces/${encodeURIComponent(next)}` : '/app/workspaces');
        }}
      >
        <option value="">{english ? 'Your Workspaces' : 'فضاهای من'}</option>
        {session.workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name} ·{' '}
            {workspace.role === 'owner'
              ? english
                ? 'Owner'
                : 'مالک'
              : workspace.role === 'editor'
                ? english
                  ? 'Editor'
                  : 'ویرایشگر'
                : english
                  ? 'Viewer'
                  : 'بیننده'}
          </option>
        ))}
      </select>
    </label>
  );
}
export function App() {
  const location = useLocation();
  const applicationPath = location.pathname.startsWith('/app');
  const managementPreviewPath = location.pathname === '/management-preview';
  const independentChrome =
    location.pathname === '/' ||
    location.pathname.startsWith('/internal') ||
    location.pathname.startsWith('/account') ||
    location.pathname.startsWith('/preview') ||
    (Academy !== null &&
      (location.pathname === '/academy' || location.pathname.startsWith('/academy/'))) ||
    managementPreviewPath;
  const queryClient = useQueryClient();
  const [devicePreferences, setDevicePreferences] =
    useState<DevicePreferences>(readDevicePreferences);
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
  useEffect(() => {
    const onSessionExpired = () => {
      queryClient.setQueryData(queryKeys.session, null);
      queryClient.removeQueries({ queryKey: queryKeys.account.preferences });
      queryClient.removeQueries({ queryKey: queryKeys.account.profile });
      queryClient.removeQueries({ queryKey: queryKeys.workspaces.all });
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] === 'workspace' });
    };
    window.addEventListener('stratino:session-expired', onSessionExpired);
    return () => window.removeEventListener('stratino:session-expired', onSessionExpired);
  }, [queryClient]);
  const toggleTheme = () => {
    const next: DevicePreferences = { ...devicePreferences, theme: dark ? 'light' : 'dark' };
    applyAccountPreferences(next);
    setPreferenceSyncError(false);
    const session = queryClient.getQueryData<Session | null>(queryKeys.session);
    if (session?.authenticated) {
      void saveAccountPreferences(next)
        .then((saved) => queryClient.setQueryData(queryKeys.account.preferences, saved))
        .catch(() => setPreferenceSyncError(true));
    }
  };
  useEffect(() => {
    if (
      location.pathname === '/' &&
      workspaceTools.some(
        (tool) =>
          location.hash === '#' + tool.legacyHash ||
          location.hash.startsWith('#' + tool.legacyHash + '/'),
      )
    )
      window.location.replace('/prototype/' + location.hash);
  }, [location.hash, location.pathname]);
  return (
    <>
      <a className="skip-link" href="#content">
        رفتن به محتوای اصلی
      </a>
      {!applicationPath && !independentChrome && (
        <header className={`site-header${managementPreviewPath ? ' site-header--preview' : ''}`}>
          <Link to="/" aria-label="استراتینو، صفحه اصلی">
            <Brand />
          </Link>
          <nav aria-label="ناوبری اصلی">
            {Academy && <Link to="/academy">آموزش مدیریت</Link>}
            <Link to="/management-preview">پیش‌نمایش پنل مدیریت</Link>
            <Link to="/demo">نمونه تعاملی</Link>
            <Link to="/account/login">حساب کاربری</Link>
            <Button aria-label="تغییر تم" onClick={toggleTheme}>
              {dark ? 'تم روشن' : 'تم تیره'}
            </Button>
          </nav>
        </header>
      )}
      {!applicationPath && preferenceSyncError && (
        <p className="preference-sync-note" role="status">
          ظاهر روی این دستگاه ذخیره شد، اما همگام‌سازی حساب کامل نشد. در تنظیمات حساب دوباره ذخیره
          کنید.
        </p>
      )}
      <main
        id="content"
        className={
          applicationPath || independentChrome ? 'route-main route-main--application' : 'route-main'
        }
        tabIndex={-1}
      >
        <Suspense
          fallback={
            <p className="loading" role="status">
              در حال آماده‌سازی صفحه…
            </p>
          }
        >
          <Routes>
            {ComponentLab && <Route path="/__dev/ui" element={<ComponentLab />} />}
            {Academy && <Route path="/academy/*" element={<Academy />} />}
            <Route path="/" element={<Site academyEnabled={Academy !== null} />} />
            <Route
              path="/management-preview"
              element={<Navigate to="/preview/workspaces" replace />}
            />
            <Route path="/preview/*" element={<ProductExperience />} />
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
            <Route path="/app" element={<SessionBoundary />}>
              <Route element={<ApplicationShell />}>
                <Route index element={<Navigate to="/app/workspaces" replace />} />
                <Route path="workspaces" element={<WorkspaceManagement />} />
                <Route path="start" element={<Onboarding />} />
                <Route path="account" element={<AccountSettingsPage />} />
                <Route path="workspaces/:workspaceId">
                  <Route index element={<WorkspaceIndexRedirect />} />
                  <Route path="overview" element={<WorkspaceOverviewPage />} />
                  <Route path="imports" element={<WorkspaceImportPage />} />
                  <Route path="settings" element={<Workspace />} />
                  <Route path="tools/company" element={<CompanyProfilePage />} />
                  <Route path="tools/swot" element={<SwotPage />} />
                  <Route path="tools/matrices" element={<EvaluationMatrixPage />} />
                  <Route path="tools/execution" element={<ExecutionPlanPage />} />
                  <Route path="tools/documents" element={<DocumentsPage />} />
                  <Route path="tools/reports" element={<ReportsPage />} />
                  <Route path="tools/:toolId" element={<WorkspaceToolPage />} />
                  <Route path="*" element={<LegacyWorkspaceRedirect />} />
                </Route>
              </Route>
            </Route>
            <Route path="/internal/login" element={<OperatorLogin />} />
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
      {!applicationPath && !independentChrome && (
        <footer className="site-footer">
          <Brand />
          <p>از تحلیل به تصمیم؛ از تصمیم به اقدام.</p>
          <span>نسخه در حال توسعه</span>
        </footer>
      )}
    </>
  );
}
