import { useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate, useOutletContext, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, Notice, Skeleton, useUIAppearance } from '@stratino/ui';
import { queryKeys } from '../../api/queryKeys';
import type { Session } from '../../session';
import { readWorkspaceProfile } from './api';
import { getWorkspaceTool, workspaceToolGroups, workspaceToolPath } from './routeRegistry';

export function WorkspaceOverviewPage() {
  const { workspaceId = '' } = useParams();
  const session = useOutletContext<Session>();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const workspace = session.workspaces.find((item) => item.id === workspaceId);
  const profileQuery = useQuery({
    queryKey: queryKeys.workspace.profile(workspaceId),
    queryFn: ({ signal }) => readWorkspaceProfile(workspaceId, signal),
    enabled: Boolean(workspace),
  });

  if (!workspace) {
    return (
      <Notice title={english ? 'Workspace unavailable' : 'فضای کار در دسترس نیست'}>
        <p role="alert">{english ? 'This Workspace is not in your access list.' : 'این فضا در فهرست دسترسی حساب شما نیست.'}</p>
        <Link className="text-link" to="/app/workspaces">{english ? 'Your Workspaces' : 'فضاهای من'}</Link>
      </Notice>
    );
  }

  return (
    <section className="workspace-home" aria-labelledby="workspace-home-title">
      <header className="workspace-home__heading">
        <p className="auth-kicker">{english ? 'STRATEGY WORKSPACE' : 'فضای برنامه‌ریزی استراتژی'}</p>
        <h1 id="workspace-home-title" tabIndex={-1} dir="auto">{workspace.name}</h1>
        <p>{english
          ? 'Move from a clear view of the business to a decision, an execution plan and its evidence.'
          : 'از شناخت روشن کسب‌وکار به تحلیل، تصمیم، برنامه اجرا و مدارک برسید.'}</p>
      </header>

      {profileQuery.isPending && <Skeleton label={english ? 'Loading project profile' : 'در حال بارگذاری نمای پروژه'} lines={3} />}
      {profileQuery.isError && (
        <div className="workspace-home__error" role="alert">
          <p>{profileQuery.error.message || (english ? 'Project details could not be loaded.' : 'اطلاعات پروژه بارگذاری نشد.')}</p>
          <Button onClick={() => void profileQuery.refetch()}>{english ? 'Try again' : 'تلاش دوباره'}</Button>
        </div>
      )}
      {profileQuery.data && (
        <section className="workspace-home__profile" aria-labelledby="workspace-profile-summary-title">
          <div className="workspace-home__section-heading">
            <div>
              <h2 id="workspace-profile-summary-title">{english ? 'Starting direction' : 'جهت اولیه پروژه'}</h2>
              <p>{english ? 'The project profile saved for this Workspace.' : 'اطلاعات پایه‌ای که برای این فضا ثبت کرده‌اید.'}</p>
            </div>
            <Link className="text-link" to={`/app/workspaces/${encodeURIComponent(workspaceId)}/settings`}>{english ? 'Edit details' : 'ویرایش اطلاعات'}</Link>
          </div>
          {profileQuery.data.industry || profileQuery.data.stage || profileQuery.data.mission ? (
            <dl className="workspace-home__facts">
              <div><dt>{english ? 'Industry' : 'حوزه فعالیت'}</dt><dd>{profileQuery.data.industry || (english ? 'Not provided' : 'ثبت نشده')}</dd></div>
              <div><dt>{english ? 'Current stage' : 'مرحله فعلی'}</dt><dd>{profileQuery.data.stage || (english ? 'Not provided' : 'ثبت نشده')}</dd></div>
              <div><dt>{english ? 'Goal or challenge' : 'هدف یا مسئله'}</dt><dd>{profileQuery.data.mission || (english ? 'Not provided' : 'ثبت نشده')}</dd></div>
            </dl>
          ) : (
            <EmptyState
              title={english ? 'Project direction has not been added' : 'هنوز جهت پروژه را ثبت نکرده‌اید'}
              description={english ? 'Add an industry, stage or goal to give your strategy work a useful starting point.' : 'حوزه، مرحله یا هدف پروژه را بنویسید تا کار استراتژی نقطه شروع روشن‌تری داشته باشد.'}
              action={<Link className="ui-button ui-button--secondary" to={`/app/workspaces/${encodeURIComponent(workspaceId)}/settings`}>{english ? 'Add project details' : 'ثبت اطلاعات پروژه'}</Link>}
            />
          )}
        </section>
      )}

      <section className="workspace-home__path" aria-labelledby="workspace-path-title">
        <div className="workspace-home__section-heading">
          <div>
            <h2 id="workspace-path-title">{english ? 'Your strategy path' : 'مسیر کار استراتژی'}</h2>
            <p>{english ? 'Choose a step to continue. Each route keeps its own address.' : 'برای ادامه یک مرحله را انتخاب کنید؛ هر صفحه نشانی جدا دارد.'}</p>
          </div>
        </div>
        <ol className="workspace-home__steps">
          {workspaceToolGroups.map((group) => {
            const firstTool = group.tools[0];
            return (
              <li key={group.id}>
                <Link to={workspaceToolPath(workspaceId, firstTool.id)}>
                  <span>{group.title[english ? 'en' : 'fa']}</span>
                  <strong>{firstTool.title[english ? 'en' : 'fa']}</strong>
                  <span aria-hidden="true">↗</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </section>
  );
}

export function WorkspaceToolPage() {
  const { workspaceId = '', toolId } = useParams();
  const session = useOutletContext<Session>();
  const location = useLocation();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const tool = getWorkspaceTool(toolId);
  const workspace = session.workspaces.find((item) => item.id === workspaceId);

  if (!workspace) {
    return (
      <Notice title={english ? 'Workspace unavailable' : 'فضای کار در دسترس نیست'}>
        <p role="alert">{english ? 'This Workspace is not in your access list.' : 'این فضا در فهرست دسترسی حساب شما نیست.'}</p>
        <Link className="text-link" to="/app/workspaces">{english ? 'Your Workspaces' : 'فضاهای من'}</Link>
      </Notice>
    );
  }
  if (!tool) {
    return (
      <Notice title={english ? 'Tool not found' : 'ابزار پیدا نشد'}>
        <p>{english ? 'Choose a tool from the Workspace navigation.' : 'یک ابزار را از ناوبری فضای کار انتخاب کنید.'}</p>
        <Link className="text-link" to={`/app/workspaces/${encodeURIComponent(workspaceId)}/overview`}>{english ? 'Project overview' : 'نمای کلی پروژه'}</Link>
      </Notice>
    );
  }

  const legacyPath = new URLSearchParams(location.search).get('path')?.replace(/^\/+|\/+$/g, '');
  const prototypeRoute = [tool.legacyHash, legacyPath].filter(Boolean).join('/');
  return (
    <section className="workspace-tool" aria-labelledby="workspace-tool-title">
      <header className="workspace-tool__heading">
        <p className="auth-kicker">{english ? 'STRATEGY WORK' : 'کار استراتژی'} / {tool.title[english ? 'en' : 'fa']}</p>
        <h1 id="workspace-tool-title" tabIndex={-1}>{tool.title[english ? 'en' : 'fa']}</h1>
        <p>{english ? `Part of ${workspace.name}.` : `بخشی از فضای «${workspace.name}».`}</p>
      </header>
      <section className="workspace-tool__availability" aria-labelledby="workspace-tool-availability-title">
        <h2 id="workspace-tool-availability-title">{english ? 'Workspace data connection is being prepared' : 'اتصال ابزار به داده‌های فضا در حال آماده‌سازی است'}</h2>
        <p>{english
          ? 'This tool route is ready, but its forms do not yet save to this Workspace. The older browser prototype keeps separate local data.'
          : 'مسیر ابزار آماده است، اما فرم‌های نسخه فعلی هنوز در این فضای کار ذخیره نمی‌شوند. نمونه قدیمی داده را جداگانه و فقط در همین مرورگر نگه می‌دارد.'}</p>
        <a className="ui-button ui-button--secondary" href={`/prototype/#${encodeURI(prototypeRoute)}`} target="_blank" rel="noreferrer">
          {english ? 'Open the local prototype' : 'بازکردن نسخه نمونه محلی'}
        </a>
      </section>
      <p className="workspace-tool__back"><Link className="text-link" to={`/app/workspaces/${encodeURIComponent(workspaceId)}/overview`}>{english ? 'Back to project overview' : 'بازگشت به نمای کلی پروژه'}</Link></p>
    </section>
  );
}

export function LegacyWorkspaceRedirect() {
  const { workspaceId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [legacyPath, ...legacySegments] = location.pathname.split('/').slice(4);
  const rawParts = [legacyPath, ...legacySegments].filter(Boolean);
  const decodedParts = rawParts.map((part) => {
    try { return decodeURIComponent(part); } catch { return ''; }
  }).filter(Boolean);
  const [legacyTool, ...childPath] = decodedParts;
  const childPathKey = childPath.join('/');

  useEffect(() => {
    if (!workspaceId) return;
    if (legacyTool === 'overview' || !legacyTool) {
      navigate(`/app/workspaces/${encodeURIComponent(workspaceId)}/overview`, { replace: true });
      return;
    }
    if (legacyTool === 'settings') {
      navigate(`/app/workspaces/${encodeURIComponent(workspaceId)}/settings`, { replace: true });
      return;
    }
    if (legacyTool === 'profile' || legacyTool === 'account') {
      navigate('/app/account', { replace: true });
      return;
    }
    const tool = getWorkspaceTool(legacyTool);
    if (tool) {
      const query = new URLSearchParams();
      if (childPathKey) query.set('path', childPathKey);
      const suffix = query.toString();
      navigate(`${workspaceToolPath(workspaceId, tool.id)}${suffix ? `?${suffix}` : ''}`, { replace: true });
    }
  }, [childPathKey, legacyTool, navigate, workspaceId]);

  if (getWorkspaceTool(legacyTool) || ['overview', 'settings', 'profile', 'account'].includes(legacyTool ?? '')) return null;
  return (
    <Notice title="صفحه پیدا نشد">
      <p>این مسیر در فضای کار وجود ندارد.</p>
      <Link className="text-link" to={`/app/workspaces/${encodeURIComponent(workspaceId)}/overview`}>بازگشت به نمای کلی پروژه</Link>
    </Notice>
  );
}

export function WorkspaceIndexRedirect() {
  const { workspaceId = '' } = useParams();
  return <Navigate to={`/app/workspaces/${encodeURIComponent(workspaceId)}/overview`} replace />;
}
