import { useEffect } from 'react';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, Notice, Skeleton, useUIAppearance } from '@stratino/ui';
import { queryKeys } from '../../api/queryKeys';
import type { Session } from '../../session';
import { readWorkspaceProfile, readWorkspaceSummary } from './api';
import { getWorkspaceTool, workspaceToolGroups, workspaceToolPath } from './routeRegistry';
import { WorkspacePulse } from '../management/WorkspacePulse';

function formatSummaryDate(value: string, english: boolean) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(english ? 'en-US' : 'fa-IR', { dateStyle: 'medium' }).format(
    new Date(year, month - 1, day),
  );
}

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
  const summaryQuery = useQuery({
    queryKey: queryKeys.workspace.summary(workspaceId),
    queryFn: ({ signal }) => readWorkspaceSummary(workspaceId, signal),
    enabled: Boolean(workspace),
  });

  if (!workspace) {
    return (
      <Notice title={english ? 'Workspace unavailable' : 'فضای کار در دسترس نیست'}>
        <p role="alert">
          {english
            ? 'This Workspace is not in your access list.'
            : 'این فضا در فهرست دسترسی حساب شما نیست.'}
        </p>
        <Link className="text-link" to="/app/workspaces">
          {english ? 'Your Workspaces' : 'فضاهای من'}
        </Link>
      </Notice>
    );
  }

  return (
    <section className="workspace-home" aria-labelledby="workspace-home-title">
      <header className="workspace-home__heading">
        <p className="auth-kicker">
          {english ? 'STRATEGY WORKSPACE' : 'فضای برنامه‌ریزی استراتژی'}
        </p>
        <h1 id="workspace-home-title" tabIndex={-1} dir="auto">
          {workspace.name}
        </h1>
        <p>
          {english
            ? 'Move from a clear view of the business to a decision, an execution plan and its evidence.'
            : 'از شناخت روشن کسب‌وکار به تحلیل، تصمیم، برنامه اجرا و مدارک برسید.'}
        </p>
      </header>

      {summaryQuery.data && (
        <WorkspacePulse summary={summaryQuery.data} workspaceId={workspaceId} english={english} />
      )}

      {profileQuery.isPending && (
        <Skeleton
          label={english ? 'Loading project profile' : 'در حال بارگذاری نمای پروژه'}
          lines={3}
        />
      )}
      {profileQuery.isError && (
        <div className="workspace-home__error" role="alert">
          <p>
            {profileQuery.error.message ||
              (english ? 'Project details could not be loaded.' : 'اطلاعات پروژه بارگذاری نشد.')}
          </p>
          <Button onClick={() => void profileQuery.refetch()}>
            {english ? 'Try again' : 'تلاش دوباره'}
          </Button>
        </div>
      )}
      {profileQuery.data && summaryQuery.data?.profile.state !== 'empty' && (
        <section
          className="workspace-home__profile"
          aria-labelledby="workspace-profile-summary-title"
        >
          <div className="workspace-home__section-heading">
            <div>
              <h2 id="workspace-profile-summary-title">
                {english ? 'Starting direction' : 'جهت اولیه پروژه'}
              </h2>
              <p>
                {english
                  ? 'The project profile saved for this Workspace.'
                  : 'اطلاعات پایه‌ای که برای این فضا ثبت کرده‌اید.'}
              </p>
            </div>
            <Link
              className="text-link"
              to={`/app/workspaces/${encodeURIComponent(workspaceId)}/tools/company`}
            >
              {english ? 'Edit business profile' : 'ویرایش شناخت کسب‌وکار'}
            </Link>
          </div>
          {profileQuery.data.company_name ||
          profileQuery.data.industry ||
          profileQuery.data.stage ||
          profileQuery.data.mission ||
          profileQuery.data.icps.length ? (
            <dl className="workspace-home__facts">
              <div>
                <dt>{english ? 'Company or project' : 'شرکت یا پروژه'}</dt>
                <dd>{profileQuery.data.company_name || (english ? 'Not provided' : 'ثبت نشده')}</dd>
              </div>
              <div>
                <dt>{english ? 'Industry' : 'حوزه فعالیت'}</dt>
                <dd>{profileQuery.data.industry || (english ? 'Not provided' : 'ثبت نشده')}</dd>
              </div>
              <div>
                <dt>{english ? 'Current stage' : 'مرحله فعلی'}</dt>
                <dd>{profileQuery.data.stage || (english ? 'Not provided' : 'ثبت نشده')}</dd>
              </div>
              <div>
                <dt>{english ? 'Goal or challenge' : 'هدف یا مسئله'}</dt>
                <dd>{profileQuery.data.mission || (english ? 'Not provided' : 'ثبت نشده')}</dd>
              </div>
              <div>
                <dt>{english ? 'Ideal customer profiles' : 'پروفایل‌های مشتری ایده‌آل'}</dt>
                <dd>
                  {new Intl.NumberFormat(english ? 'en-US' : 'fa-IR').format(
                    profileQuery.data.icps.length,
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <EmptyState
              title={
                english ? 'Project direction has not been added' : 'هنوز جهت پروژه را ثبت نکرده‌اید'
              }
              description={
                english
                  ? 'Add a business profile or ideal customer to give your strategy work a useful starting point.'
                  : 'شناخت کسب‌وکار یا مشتری ایده‌آل را بنویسید تا کار استراتژی نقطه شروع روشن‌تری داشته باشد.'
              }
              action={
                <Link
                  className="ui-button ui-button--secondary"
                  to={`/app/workspaces/${encodeURIComponent(workspaceId)}/tools/company`}
                >
                  {english ? 'Add business profile' : 'ثبت شناخت کسب‌وکار'}
                </Link>
              }
            />
          )}
        </section>
      )}

      {summaryQuery.isPending && (
        <Skeleton
          label={english ? 'Loading Workspace summary' : 'در حال بارگذاری خلاصه فضا'}
          lines={2}
        />
      )}
      {summaryQuery.isError && (
        <div className="workspace-home__error" role="alert">
          <p>
            {summaryQuery.error.message ||
              (english
                ? 'The Workspace summary could not be loaded.'
                : 'خلاصه فضای کار بارگذاری نشد.')}
          </p>
          <Button onClick={() => void summaryQuery.refetch()}>
            {english ? 'Try again' : 'تلاش دوباره'}
          </Button>
        </div>
      )}
      {summaryQuery.data && (
        <section className="workspace-home__summary" aria-labelledby="workspace-summary-title">
          <div className="workspace-home__section-heading">
            <div>
              <h2 id="workspace-summary-title">{english ? 'The next useful step' : 'گام بعدی'}</h2>
              <p>
                {english
                  ? 'Based on records saved in this Workspace.'
                  : 'بر پایه اطلاعات ثبت‌شده در همین فضای کار.'}
              </p>
            </div>
          </div>
          {summaryQuery.data.next_action ? (
            <div className="workspace-home__next-action">
              <div>
                <strong>
                  {summaryQuery.data.next_action.kind === 'complete_profile'
                    ? english
                      ? 'Add your business context'
                      : 'شناخت کسب‌وکار را ثبت کنید'
                    : summaryQuery.data.next_action.kind === 'overdue_action'
                      ? english
                        ? 'Review an overdue action'
                        : 'اقدام سررسیدشده را پیگیری کنید'
                      : summaryQuery.data.next_action.kind === 'decision_review'
                        ? english
                          ? 'Review a proposed decision'
                          : 'تصمیم پیشنهادی را بررسی کنید'
                        : summaryQuery.data.next_action.kind === 'document_incomplete'
                          ? english
                            ? 'Continue a document'
                            : 'نوشتن یک سند را ادامه دهید'
                          : english
                            ? 'Continue an open action'
                            : 'اقدام باز را ادامه دهید'}
                </strong>
                {summaryQuery.data.next_action.label &&
                  summaryQuery.data.next_action.kind !== 'document_incomplete' && (
                    <span>{summaryQuery.data.next_action.label}</span>
                  )}
              </div>
              <Link
                className="ui-button ui-button--secondary"
                to={workspaceToolPath(workspaceId, summaryQuery.data.next_action.destination)}
              >
                {english ? 'Open' : 'باز کردن'}
              </Link>
            </div>
          ) : (
            <EmptyState
              title={english ? 'No next action has been recorded' : 'اقدام بعدی هنوز ثبت نشده است'}
              description={
                english
                  ? 'Create an action in the execution plan when you are ready.'
                  : 'هر زمان آماده بودید، اقدام بعدی را در برنامه اجرا ثبت کنید.'
              }
              action={
                <Link
                  className="ui-button ui-button--secondary"
                  to={workspaceToolPath(workspaceId, 'execution')}
                >
                  {english ? 'Open execution plan' : 'رفتن به برنامه اجرا'}
                </Link>
              }
            />
          )}
          <p className="workspace-home__summary-meta">
            {summaryQuery.data.analyses.finalized_count || summaryQuery.data.analyses.draft_count
              ? english
                ? `${summaryQuery.data.analyses.finalized_count} finalized and ${summaryQuery.data.analyses.draft_count} draft analyses`
                : `${new Intl.NumberFormat('fa-IR').format(summaryQuery.data.analyses.finalized_count)} تحلیل نهایی و ${new Intl.NumberFormat('fa-IR').format(summaryQuery.data.analyses.draft_count)} پیش‌نویس`
              : english
                ? 'No analysis has been recorded yet.'
                : 'هنوز تحلیلی ثبت نشده است.'}{' '}
            <Link to={workspaceToolPath(workspaceId, 'matrices')}>
              {english ? 'View analyses' : 'دیدن تحلیل‌ها'}
            </Link>
          </p>
          {summaryQuery.data.open_actions.length > 0 && (
            <details className="workspace-home__open-actions">
              <summary>
                {english
                  ? `Open actions (${summaryQuery.data.open_actions.length})`
                  : `اقدام‌های باز (${new Intl.NumberFormat('fa-IR').format(summaryQuery.data.open_actions.length)})`}
              </summary>
              <ul>
                {summaryQuery.data.open_actions.map((action) => (
                  <li key={action.id}>
                    <Link to={workspaceToolPath(workspaceId, 'execution')}>{action.title}</Link>
                    <span>
                      {action.is_overdue
                        ? english
                          ? 'Overdue'
                          : 'سررسید گذشته'
                        : formatSummaryDate(action.due_on, english)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {summaryQuery.data.attention_items.length > 0 && (
            <div className="workspace-home__attention">
              <h3>{english ? 'Needs attention' : 'موارد نیازمند توجه'}</h3>
              <ul>
                {summaryQuery.data.attention_items.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <Link to={workspaceToolPath(workspaceId, item.destination)}>
                      {item.kind === 'document_incomplete'
                        ? english
                          ? 'Document in progress'
                          : 'سند در حال تکمیل'
                        : item.label}
                    </Link>
                    <span>
                      {item.kind === 'overdue_action'
                        ? english
                          ? 'Overdue action'
                          : 'اقدام سررسیدشده'
                        : item.kind === 'decision_review'
                          ? english
                            ? 'Proposed decision'
                            : 'تصمیم پیشنهادی'
                          : english
                            ? 'Document in progress'
                            : 'سند در حال تکمیل'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="workspace-home__path" aria-labelledby="workspace-path-title">
        <div className="workspace-home__section-heading">
          <div>
            <h2 id="workspace-path-title">
              {english ? 'Useful starting points' : 'میان‌برهای مرتبط'}
            </h2>
            <p>
              {english
                ? summaryQuery.data?.objective
                  ? 'Shortcuts reflect the Workspace goal you reported.'
                  : 'General starting points while no goal has been reported.'
                : summaryQuery.data?.objective
                  ? 'این میان‌برها با هدفی که برای این فضا ثبت کرده‌اید هماهنگ‌اند.'
                  : 'تا زمانی که هدفی ثبت نشده، این‌ها میان‌برهای عمومی شروع هستند.'}
            </p>
          </div>
        </div>
        <ol className="workspace-home__steps">
          {(
            summaryQuery.data?.shortcuts ??
            workspaceToolGroups.slice(0, 3).map((group) => group.tools[0].id)
          )
            .slice(0, 3)
            .map((toolId) => {
              const tool = getWorkspaceTool(toolId);
              if (!tool) return null;
              return (
                <li key={tool.id}>
                  <Link to={workspaceToolPath(workspaceId, tool.id)}>
                    <span>{english ? 'Workspace tool' : 'ابزار فضای کار'}</span>
                    <strong>{tool.title[english ? 'en' : 'fa']}</strong>
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
        <p role="alert">
          {english
            ? 'This Workspace is not in your access list.'
            : 'این فضا در فهرست دسترسی حساب شما نیست.'}
        </p>
        <Link className="text-link" to="/app/workspaces">
          {english ? 'Your Workspaces' : 'فضاهای من'}
        </Link>
      </Notice>
    );
  }
  if (!tool) {
    return (
      <Notice title={english ? 'Tool not found' : 'ابزار پیدا نشد'}>
        <p>
          {english
            ? 'Choose a tool from the Workspace navigation.'
            : 'یک ابزار را از ناوبری فضای کار انتخاب کنید.'}
        </p>
        <Link
          className="text-link"
          to={`/app/workspaces/${encodeURIComponent(workspaceId)}/overview`}
        >
          {english ? 'Project overview' : 'نمای کلی پروژه'}
        </Link>
      </Notice>
    );
  }

  const legacyPath = new URLSearchParams(location.search).get('path')?.replace(/^\/+|\/+$/g, '');
  const prototypeRoute = [tool.legacyHash, legacyPath].filter(Boolean).join('/');
  return (
    <section className="workspace-tool" aria-labelledby="workspace-tool-title">
      <header className="workspace-tool__heading">
        <p className="auth-kicker">
          {english ? 'STRATEGY WORK' : 'کار استراتژی'} / {tool.title[english ? 'en' : 'fa']}
        </p>
        <h1 id="workspace-tool-title" tabIndex={-1}>
          {tool.title[english ? 'en' : 'fa']}
        </h1>
        <p>{english ? `Part of ${workspace.name}.` : `بخشی از فضای «${workspace.name}».`}</p>
      </header>
      <section
        className="workspace-tool__availability"
        aria-labelledby="workspace-tool-availability-title"
      >
        <h2 id="workspace-tool-availability-title">
          {english
            ? 'Workspace data connection is being prepared'
            : 'اتصال ابزار به داده‌های فضا در حال آماده‌سازی است'}
        </h2>
        <p>
          {english
            ? 'This tool route is ready, but its forms do not yet save to this Workspace. The older browser prototype keeps separate local data.'
            : 'مسیر ابزار آماده است، اما فرم‌های نسخه فعلی هنوز در این فضای کار ذخیره نمی‌شوند. نمونه قدیمی داده را جداگانه و فقط در همین مرورگر نگه می‌دارد.'}
        </p>
        <a
          className="ui-button ui-button--secondary"
          href={`/prototype/#${encodeURI(prototypeRoute)}`}
          target="_blank"
          rel="noreferrer"
        >
          {english ? 'Open the local prototype' : 'بازکردن نسخه نمونه محلی'}
        </a>
      </section>
      <p className="workspace-tool__back">
        <Link
          className="text-link"
          to={`/app/workspaces/${encodeURIComponent(workspaceId)}/overview`}
        >
          {english ? 'Back to project overview' : 'بازگشت به نمای کلی پروژه'}
        </Link>
      </p>
    </section>
  );
}

export function LegacyWorkspaceRedirect() {
  const { workspaceId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [legacyPath, ...legacySegments] = location.pathname.split('/').slice(4);
  const rawParts = [legacyPath, ...legacySegments].filter(Boolean);
  const decodedParts = rawParts
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return '';
      }
    })
    .filter(Boolean);
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
      navigate(`${workspaceToolPath(workspaceId, tool.id)}${suffix ? `?${suffix}` : ''}`, {
        replace: true,
      });
    }
  }, [childPathKey, legacyTool, navigate, workspaceId]);

  if (
    getWorkspaceTool(legacyTool) ||
    ['overview', 'settings', 'profile', 'account'].includes(legacyTool ?? '')
  )
    return null;
  return (
    <Notice title="صفحه پیدا نشد">
      <p>این مسیر در فضای کار وجود ندارد.</p>
      <Link
        className="text-link"
        to={`/app/workspaces/${encodeURIComponent(workspaceId)}/overview`}
      >
        بازگشت به نمای کلی پروژه
      </Link>
    </Notice>
  );
}

export function WorkspaceIndexRedirect() {
  const { workspaceId = '' } = useParams();
  return <Navigate to={`/app/workspaces/${encodeURIComponent(workspaceId)}/overview`} replace />;
}
