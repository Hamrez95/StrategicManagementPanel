import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useMatch, useNavigate, useOutletContext } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Brand, Button, Dialog, Input, useUIAppearance } from '@stratino/ui';
import { queryKeys } from '../../api/queryKeys';
import type { Session } from '../../session';
import { postAuth } from '../auth/api';
import { AccountAvatar } from '../account/AccountAvatar';
import { useWorkspaceSwitch } from './switchContext';
import { getWorkspaceTool, workspaceToolGroups, workspaceToolPath } from './routeRegistry';

type RouteChoice = { title: string; path: string; keywords: string };

function routeChoices(workspaceId: string | undefined, english: boolean): RouteChoice[] {
  const choices: RouteChoice[] = [
    {
      title: english ? 'Your Workspaces' : 'فضاهای من',
      path: '/app/workspaces',
      keywords: 'workspace project فضا پروژه',
    },
    {
      title: english ? 'Account and preferences' : 'حساب و تنظیمات ظاهر',
      path: '/app/account',
      keywords: 'account profile theme language settings حساب پروفایل تم زبان تنظیمات',
    },
  ];
  if (!workspaceId) return choices;
  choices.push(
    {
      title: english ? 'Project overview' : 'نمای کلی پروژه',
      path: `/app/workspaces/${encodeURIComponent(workspaceId)}/overview`,
      keywords: 'overview home نمای کلی خانه',
    },
    {
      title: english ? 'Import old backup' : 'واردسازی پشتیبان قدیمی',
      path: `/app/workspaces/${encodeURIComponent(workspaceId)}/imports`,
      keywords: 'backup import migration json انتقال پشتیبان مهاجرت',
    },
    {
      title: english ? 'Workspace settings' : 'تنظیمات فضای کار',
      path: `/app/workspaces/${encodeURIComponent(workspaceId)}/settings`,
      keywords: 'settings members invites تنظیمات اعضا دعوت',
    },
    ...workspaceToolGroups.flatMap((group) =>
      group.tools.map((tool) => ({
        title: tool.title[english ? 'en' : 'fa'],
        path: workspaceToolPath(workspaceId, tool.id),
        keywords: `${group.title.fa} ${group.title.en} ${tool.id} ${tool.legacyHash}`,
      })),
    ),
    {
      title: english ? 'ICP guide and customer profiles' : 'راهنمای ICP و پروفایل مشتری',
      path: `${workspaceToolPath(workspaceId, 'company')}#icps`,
      keywords:
        'ICP ideal customer persona segment evidence assumption مشتری ایده‌آل پرسونا بخش بازار شاهد فرضیه',
    },
  );
  return choices;
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
    <label className="app-workspace-select">
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
              queryKey: queryKeys.workspace.root(activeWorkspace),
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

function WorkspaceNavigation({
  workspaceId,
  english,
  idPrefix,
  onNavigate,
}: {
  workspaceId: string;
  english: boolean;
  idPrefix: string;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const activeTool = getWorkspaceTool(location.pathname.split('/tools/')[1]?.split('/')[0]);

  return (
    <nav className="app-sidebar-nav" aria-label={english ? 'Workspace tools' : 'ابزارهای فضای کار'}>
      <Link
        className={`app-nav-link${location.pathname.endsWith('/overview') ? ' is-active' : ''}`}
        to={`/app/workspaces/${encodeURIComponent(workspaceId)}/overview`}
        aria-current={location.pathname.endsWith('/overview') ? 'page' : undefined}
        onClick={onNavigate}
      >
        <span className="app-nav-link__mark" aria-hidden="true">
          {new Intl.NumberFormat(english ? 'en-US' : 'fa-IR').format(1)}
        </span>
        <span>{english ? 'Project overview' : 'نمای کلی پروژه'}</span>
      </Link>
      {workspaceToolGroups.map((group, index) => (
        <section
          className="app-nav-group"
          key={group.id}
          aria-labelledby={`${idPrefix}-nav-${group.id}`}
        >
          <h2 id={`${idPrefix}-nav-${group.id}`}>{group.title[english ? 'en' : 'fa']}</h2>
          {group.tools.map((tool) => {
            const active = activeTool?.id === tool.id;
            return (
              <Link
                className={`app-nav-link${active ? ' is-active' : ''}`}
                key={tool.id}
                to={workspaceToolPath(workspaceId, tool.id)}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
              >
                <span className="app-nav-link__mark" aria-hidden="true">
                  {new Intl.NumberFormat(english ? 'en-US' : 'fa-IR').format(index + 2)}
                </span>
                <span>{tool.title[english ? 'en' : 'fa']}</span>
              </Link>
            );
          })}
        </section>
      ))}
      <Link
        className={`app-nav-link app-nav-link--settings${location.pathname.endsWith('/settings') ? ' is-active' : ''}`}
        to={`/app/workspaces/${encodeURIComponent(workspaceId)}/settings`}
        aria-current={location.pathname.endsWith('/settings') ? 'page' : undefined}
        onClick={onNavigate}
      >
        <span className="app-nav-link__mark" aria-hidden="true">
          ⚙
        </span>
        <span>{english ? 'Workspace settings' : 'تنظیمات فضای کار'}</span>
      </Link>
    </nav>
  );
}

export default function ApplicationShell() {
  const session = useOutletContext<Session>();
  const location = useLocation();
  const accountMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (accountMenu.current) accountMenu.current.open = false;
  }, [location.pathname, location.hash]);
  useEffect(() => {
    const outside = (event: globalThis.PointerEvent) => {
      if (accountMenu.current && !accountMenu.current.contains(event.target as Node))
        accountMenu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && accountMenu.current?.open) {
        accountMenu.current.open = false;
        accountMenu.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { dir } = useUIAppearance();
  const { canSwitch } = useWorkspaceSwitch();
  const english = dir === 'ltr';
  const activeWorkspaceId = useMatch('/app/workspaces/:workspaceId/*')?.params.workspaceId;
  const workspace = session.workspaces.find((item) => item.id === activeWorkspaceId);
  const toolId = location.pathname.split('/tools/')[1]?.split('/')[0];
  const tool = getWorkspaceTool(toolId);
  const currentTitle =
    tool?.title[english ? 'en' : 'fa'] ??
    (location.pathname.endsWith('/settings')
      ? english
        ? 'Workspace settings'
        : 'تنظیمات فضای کار'
      : location.pathname.endsWith('/account')
        ? english
          ? 'Account and preferences'
          : 'حساب و تنظیمات'
        : location.pathname.endsWith('/imports')
          ? english
            ? 'Old browser backup'
            : 'پشتیبان مرورگر قدیمی'
          : location.pathname.endsWith('/workspaces')
            ? english
              ? 'Your Workspaces'
              : 'فضاهای من'
            : location.pathname.endsWith('/start')
              ? english
                ? 'Get started'
                : 'شروع کار'
              : english
                ? 'Project overview'
                : 'نمای کلی پروژه');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const choices = useMemo(() => routeChoices(workspace?.id, english), [workspace?.id, english]);
  const normalizedSearch = searchText.trim().toLocaleLowerCase(english ? 'en' : 'fa');
  const matches = choices
    .filter(
      (choice) =>
        !normalizedSearch ||
        `${choice.title} ${choice.keywords}`
          .toLocaleLowerCase(english ? 'en' : 'fa')
          .includes(normalizedSearch),
    )
    .slice(0, 10);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      } else if (
        event.key === '/' &&
        !typing &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  async function signOut() {
    setLogoutError('');
    setLogoutPending(true);
    try {
      await postAuth('/api/v1/accounts/logout/');
      queryClient.setQueryData(queryKeys.session, null);
      queryClient.removeQueries({ queryKey: queryKeys.account.preferences });
      queryClient.removeQueries({ queryKey: queryKeys.account.profile });
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] === 'workspace' });
      queryClient.removeQueries({ queryKey: queryKeys.workspaces.all });
      navigate('/account/login', { replace: true });
    } catch {
      setLogoutError(
        english
          ? 'Sign out failed. Check your connection and try again.'
          : 'خروج انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید.',
      );
    } finally {
      setLogoutPending(false);
    }
  }

  return (
    <div
      className={`application-shell${workspace ? ' application-shell--workspace' : ''}`}
      onClickCapture={(event) => {
        const target = event.target;
        const anchor =
          target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
        if (!anchor || anchor.target === '_blank') return;
        const destination = new URL(anchor.href, window.location.href);
        if (
          destination.origin !== window.location.origin ||
          destination.pathname === location.pathname
        )
          return;
        const message = english
          ? 'Unsaved Workspace changes will be lost. Continue?'
          : 'تغییرات ذخیره‌نشده از بین می‌روند. ادامه می‌دهید؟';
        if (!canSwitch(message)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <header className="app-topbar">
        {workspace && (
          <Dialog
            closeLabel={english ? 'Close menu' : 'بستن منو'}
            title={english ? 'Workspace navigation' : 'ناوبری فضای کار'}
            description={workspace.name}
            open={mobileNavOpen}
            onOpenChange={setMobileNavOpen}
            trigger={
              <Button
                className="app-menu-trigger"
                variant="quiet"
                aria-label={english ? 'Open workspace menu' : 'بازکردن منوی فضای کار'}
                aria-expanded={mobileNavOpen}
              >
                ☰
              </Button>
            }
          >
            <WorkspaceNavigation
              workspaceId={workspace.id}
              english={english}
              idPrefix="mobile"
              onNavigate={() => setMobileNavOpen(false)}
            />
          </Dialog>
        )}
        <Link
          className="app-brand"
          to="/app/workspaces"
          aria-label={english ? 'Stratino Workspaces' : 'فضاهای استراتینو'}
        >
          <Brand english={english} />
        </Link>
        {workspace && (
          <WorkspaceSelector session={session} activeWorkspace={activeWorkspaceId ?? ''} />
        )}
        <nav
          className="app-topbar-actions"
          aria-label={english ? 'Application tools' : 'ابزارهای برنامه'}
        >
          <Dialog
            closeLabel={english ? 'Close search' : 'بستن جستجو'}
            title={english ? 'Search this Workspace' : 'جستجو در فضای کار'}
            description={
              english
                ? 'Find a route by name. Use / or Ctrl+K to open search.'
                : 'نام صفحه یا ابزار را بنویسید؛ با / یا Ctrl+K جستجو را باز کنید.'
            }
            open={searchOpen}
            onOpenChange={(open) => {
              setSearchOpen(open);
              if (!open) setSearchText('');
            }}
            trigger={
              <Button
                variant="quiet"
                className="app-search-trigger"
                aria-label={english ? 'Search' : 'جستجو'}
                onClick={() => setSearchOpen(true)}
              >
                <span aria-hidden="true">⌕</span>
                <span>{english ? 'Search' : 'جستجو'}</span>
                <kbd>/</kbd>
              </Button>
            }
          >
            <div className="app-search-dialog">
              <Input
                label={english ? 'Search pages and tools' : 'جستجوی صفحه و ابزار'}
                value={searchText}
                onChange={(event) => setSearchText(event.currentTarget.value)}
                autoFocus
                autoComplete="off"
              />
              {matches.length ? (
                <ul className="app-search-results">
                  {matches.map((choice) => (
                    <li key={choice.path}>
                      <Link to={choice.path} onClick={() => setSearchOpen(false)}>
                        {choice.title}
                        <span aria-hidden="true">↵</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="app-search-empty" role="status">
                  {english
                    ? 'No matching route. Try a shorter term.'
                    : 'صفحه‌ای پیدا نشد؛ واژه کوتاه‌تری بنویسید.'}
                </p>
              )}
            </div>
          </Dialog>
          <details className="app-account-menu" ref={accountMenu}>
            <summary aria-label={english ? 'Account menu' : 'منوی حساب'}>
              <AccountAvatar avatar={session.user.avatar} name={session.user.name} size={40} />
              <span className="app-account-name">{session.user.name}</span>
              <span className="app-account-menu-indicator" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </summary>
            <div className="app-account-menu__panel">
              <div className="app-account-menu__identity">
                <AccountAvatar avatar={session.user.avatar} name={session.user.name} size={48} />
                <div>
                  <strong>{session.user.name}</strong>
                  <p>{english ? 'Your personal account' : 'حساب شخصی تو'}</p>
                </div>
              </div>
              <Link to="/app/account">
                {english ? 'Account and appearance' : 'حساب و تنظیمات ظاهر'}
              </Link>
              {activeWorkspaceId && (
                <Link to={`/app/workspaces/${encodeURIComponent(activeWorkspaceId)}/imports`}>
                  {english ? 'Import old backup' : 'واردسازی پشتیبان قدیمی'}
                </Link>
              )}
              <Link
                to={
                  activeWorkspaceId ? workspaceToolPath(activeWorkspaceId, 'learn') : '/app/start'
                }
              >
                {english ? 'Guided learning' : 'آموزش راهنما'}
              </Link>
              <Link to="/app/account#subscription">
                {english ? 'Plan and usage' : 'پلن و سهمیه'}
              </Link>
              <Button variant="quiet" pending={logoutPending} onClick={() => void signOut()}>
                {english ? 'Sign out' : 'خروج از حساب'}
              </Button>
            </div>
          </details>
        </nav>
      </header>
      <nav className="app-breadcrumbs" aria-label={english ? 'Breadcrumb' : 'مسیر صفحه'}>
        <Link to="/app/workspaces">{english ? 'Workspaces' : 'فضاهای من'}</Link>
        {workspace && (
          <>
            <span aria-hidden="true">/</span>
            <Link to={`/app/workspaces/${encodeURIComponent(workspace.id)}/overview`}>
              {workspace.name}
            </Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span aria-current="page">{currentTitle}</span>
      </nav>
      {logoutError && (
        <p className="app-shell-feedback" role="alert">
          {logoutError}
        </p>
      )}
      <div className="app-shell-body">
        {workspace && (
          <aside
            className="app-sidebar"
            aria-label={english ? 'Workspace sidebar' : 'ناوبری فضای کار'}
          >
            <div className="app-sidebar__workspace">
              <span className="app-sidebar__eyebrow">
                {english ? 'CURRENT PROJECT' : 'پروژه فعال'}
              </span>
              <strong dir="auto">{workspace.name}</strong>
            </div>
            <WorkspaceNavigation workspaceId={workspace.id} english={english} idPrefix="desktop" />
          </aside>
        )}
        <div className="app-content">
          <div className="app-route-content" key={location.pathname}>
            <Outlet context={session} />
          </div>
        </div>
      </div>
    </div>
  );
}
