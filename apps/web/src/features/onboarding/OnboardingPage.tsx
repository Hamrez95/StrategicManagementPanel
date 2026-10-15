import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useOutletContext } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Notice, Skeleton, useToast, useUIAppearance } from '@stratino/ui';
import { queryKeys } from '../../api/queryKeys';
import { AuthApiError } from '../auth/api';
import { readAccountProfile, saveAccountProfile } from '../account/api';
import type { Session } from '../../session';
import {
  createWorkspace,
  listWorkspaces,
  readWorkspaceProfile,
  saveWorkspace,
  saveWorkspaceProfile,
  type ProjectProfile,
  type WorkspaceRecord,
} from '../workspaces/api';
import { useWorkspaceDirtyGuard } from '../workspaces/switchContext';

type OnboardingStep = 'person' | 'workspace' | 'project';

const STEP_ORDER: OnboardingStep[] = ['person', 'workspace', 'project'];

export default function OnboardingPage() {
  const session = useOutletContext<Session>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const notify = useToast();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const accountQuery = useQuery({
    queryKey: queryKeys.account.profile,
    queryFn: ({ signal }) => readAccountProfile(signal),
  });
  const workspacesQuery = useQuery({
    queryKey: queryKeys.workspaces.all,
    queryFn: ({ signal }) => listWorkspaces(signal),
  });
  const workspaces = workspacesQuery.data ?? [];
  const ownedWorkspace = workspaces.find(
    (workspace) => workspace.owner_id === session.user.id && !workspace.archived_at,
  );
  const profileQuery = useQuery({
    queryKey: queryKeys.workspace.profile(ownedWorkspace?.id ?? ''),
    queryFn: ({ signal }) => readWorkspaceProfile(ownedWorkspace!.id, signal),
    enabled: Boolean(ownedWorkspace),
  });
  const [stepOverride, setStepOverride] = useState<OnboardingStep | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [industry, setIndustry] = useState('');
  const [stage, setStage] = useState('');
  const [mission, setMission] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [nameConflict, setNameConflict] = useState(false);
  const hydratedAccount = useRef('');
  const hydratedWorkspace = useRef('');
  const hydratedProfile = useRef('');

  useEffect(() => {
    if (!accountQuery.data) return;
    if (hydratedAccount.current === accountQuery.data.email) return;
    hydratedAccount.current = accountQuery.data.email;
    setDisplayName(accountQuery.data.display_name);
    setRoleTitle(accountQuery.data.role_title);
  }, [accountQuery.data]);

  useEffect(() => {
    if (!ownedWorkspace) return;
    if (hydratedWorkspace.current === ownedWorkspace.id) return;
    hydratedWorkspace.current = ownedWorkspace.id;
    setWorkspaceName(ownedWorkspace.name);
  }, [ownedWorkspace]);

  useEffect(() => {
    if (!profileQuery.data || profileQuery.data.workspace_id !== ownedWorkspace?.id) return;
    if (hydratedProfile.current === profileQuery.data.workspace_id) return;
    hydratedProfile.current = profileQuery.data.workspace_id;
    setIndustry(profileQuery.data.industry);
    setStage(profileQuery.data.stage);
    setMission(profileQuery.data.mission);
  }, [ownedWorkspace?.id, profileQuery.data]);

  const savedDisplayName = accountQuery.data?.display_name ?? '';
  const savedRoleTitle = accountQuery.data?.role_title ?? '';
  const savedProfile: ProjectProfile | undefined = profileQuery.data?.workspace_id === ownedWorkspace?.id
    ? profileQuery.data
    : undefined;
  const derivedStep: OnboardingStep = !savedDisplayName.trim()
    ? 'person'
    : !ownedWorkspace
      ? 'workspace'
      : 'project';
  const step = stepOverride ?? derivedStep;
  const personalDirty = displayName !== savedDisplayName || roleTitle !== savedRoleTitle;
  const workspaceDirty = Boolean(ownedWorkspace && workspaceName.trim() !== ownedWorkspace.name);
  const projectDirty = Boolean(savedProfile && (
    industry !== savedProfile.industry || stage !== savedProfile.stage || mission !== savedProfile.mission
  ));
  const hasUnsavedChanges = pending || (step === 'person'
    ? personalDirty
    : step === 'workspace'
      ? workspaceDirty || (!ownedWorkspace && workspaceName.trim().length > 0)
      : projectDirty);
  useWorkspaceDirtyGuard('onboarding-form', hasUnsavedChanges);

  const loading = accountQuery.isPending || workspacesQuery.isPending;
  const profileLoading = Boolean(ownedWorkspace) && profileQuery.isPending;
  const currentIndex = STEP_ORDER.indexOf(step);
  const progressValue = ((currentIndex + 1) / STEP_ORDER.length) * 100;

  function clearFeedback() {
    setError('');
    setFieldErrors({});
    setNameConflict(false);
  }

  function setApiError(reason: unknown, fallback: string) {
    if (reason instanceof AuthApiError) {
      setError(reason.message);
      setFieldErrors(Object.fromEntries(
        Object.entries(reason.fields).map(([key, values]) => [key, values[0] ?? '']),
      ));
      setNameConflict(reason.code === 'revision_conflict');
      return;
    }
    setError(fallback);
  }

  function updateSessionName(name: string) {
    queryClient.setQueryData<Session | null>(queryKeys.session, (current) => current
      ? { ...current, user: { ...current.user, name } }
      : current);
  }

  async function reloadLatestProject() {
    clearFeedback();
    const result = await workspacesQuery.refetch();
    const latest = result.data?.find((workspace) => workspace.id === ownedWorkspace?.id);
    if (latest) setWorkspaceName(latest.name);
  }

  async function reloadLatestProfile() {
    clearFeedback();
    const result = await profileQuery.refetch();
    if (!result.data) return;
    setIndustry(result.data.industry);
    setStage(result.data.stage);
    setMission(result.data.mission);
  }

  async function savePersonalDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    const normalizedName = displayName.trim();
    if (!normalizedName) {
      setFieldErrors({ display_name: english ? 'Enter your name to continue.' : 'نام خود را وارد کنید.' });
      return;
    }
    setPending(true);
    try {
      const saved = await saveAccountProfile({ display_name: normalizedName, role_title: roleTitle.trim() });
      queryClient.setQueryData(queryKeys.account.profile, saved);
      updateSessionName(saved.display_name || saved.email);
      setDisplayName(saved.display_name);
      setRoleTitle(saved.role_title);
      setStepOverride('workspace');
    } catch (reason) {
      setApiError(reason, english ? 'Your details could not be saved. Try again.' : 'اطلاعات شما ذخیره نشد. دوباره تلاش کنید.');
    } finally {
      setPending(false);
    }
  }

  async function saveWorkspaceName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    const normalizedName = workspaceName.trim();
    if (!normalizedName) {
      setFieldErrors({ name: english ? 'Enter a project name to continue.' : 'نام پروژه را وارد کنید.' });
      return;
    }
    setPending(true);
    try {
      if (ownedWorkspace) {
        const saved = normalizedName === ownedWorkspace.name
          ? ownedWorkspace
          : await saveWorkspace(ownedWorkspace.id, { name: normalizedName, revision: ownedWorkspace.revision });
        queryClient.setQueryData<WorkspaceRecord[]>(queryKeys.workspaces.all, (current) => current?.map((item) => item.id === saved.id ? saved : item));
        setWorkspaceName(saved.name);
      } else {
        const created = await createWorkspace(normalizedName);
        setWorkspaceName(created.name);
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
        await queryClient.invalidateQueries({ queryKey: queryKeys.session });
      }
      setStepOverride('project');
    } catch (reason) {
      setApiError(reason, english ? 'The project could not be saved. Check your connection and try again.' : 'پروژه ذخیره نشد. اتصال را بررسی و دوباره تلاش کنید.');
    } finally {
      setPending(false);
    }
  }

  async function finishProject(skip = false) {
    clearFeedback();
    if (!ownedWorkspace || !savedProfile) {
      setError(english ? 'The new project is still loading. Try again in a moment.' : 'فضای تازه هنوز بارگذاری نشده است. کمی بعد دوباره تلاش کنید.');
      return;
    }
    setPending(true);
    try {
      const saved = await saveWorkspaceProfile(ownedWorkspace.id, {
        revision: savedProfile.revision,
        industry: industry.trim(),
        stage: stage.trim(),
        mission: mission.trim(),
        complete: true,
      });
      queryClient.setQueryData(queryKeys.workspace.profile(ownedWorkspace.id), saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.session }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all }),
      ]);
      notify(skip
        ? (english ? 'Setup skipped. You can add project details later.' : 'این مرحله رد شد؛ هر زمان خواستید جزئیات پروژه را اضافه کنید.')
        : (english ? 'Project setup saved.' : 'اطلاعات اولیه پروژه ذخیره شد.'));
      navigate(`/app/workspaces/${encodeURIComponent(ownedWorkspace.id)}`, { replace: true });
    } catch (reason) {
      setApiError(reason, english ? 'Project details could not be saved. Try again.' : 'اطلاعات پروژه ذخیره نشد. دوباره تلاش کنید.');
    } finally {
      setPending(false);
    }
  }

  function goBack() {
    clearFeedback();
    const previous = STEP_ORDER[Math.max(0, STEP_ORDER.indexOf(step) - 1)];
    setStepOverride(previous);
  }

  if (loading || profileLoading) {
    return <section className="onboarding-shell"><Skeleton label={english ? 'Loading your setup' : 'در حال آماده‌سازی شروع کار'} lines={5} /></section>;
  }
  if (accountQuery.isError || workspacesQuery.isError || profileQuery.isError) {
    const refetch = async () => {
      await Promise.all([accountQuery.refetch(), workspacesQuery.refetch(), profileQuery.refetch()]);
    };
    return (
      <section className="onboarding-shell">
        <Notice title={english ? 'Setup could not be loaded' : 'اطلاعات شروع کار بارگیری نشد'}>
          <p role="alert">{accountQuery.error?.message || workspacesQuery.error?.message || profileQuery.error?.message || (english ? 'Check your connection and try again.' : 'اتصال را بررسی و دوباره تلاش کنید.')}</p>
          <Button onClick={() => void refetch()}>{english ? 'Try again' : 'تلاش دوباره'}</Button>
          <Link className="text-link" to="/app/workspaces">{english ? 'Your Workspaces' : 'فضاهای من'}</Link>
        </Notice>
      </section>
    );
  }

  const hasAnyOwnedWorkspace = workspaces.some((workspace) => workspace.owner_id === session.user.id);
  if (!loading) {
    if (!ownedWorkspace && (hasAnyOwnedWorkspace || session.workspaces.length > 0)) {
      return <Navigate to="/app/workspaces" replace />;
    }
    if (ownedWorkspace && savedProfile?.onboarding_completed_at && savedDisplayName.trim()) {
      return <Navigate to={`/app/workspaces/${encodeURIComponent(ownedWorkspace.id)}`} replace />;
    }
  }

  const stepTitle = {
    person: english ? 'A little about you' : 'کمی درباره شما',
    workspace: english ? 'Name your project' : 'برای پروژه نام بگذارید',
    project: english ? 'Set a starting direction' : 'برای شروع، جهت پروژه را مشخص کنید',
  }[step];
  const stepDescription = {
    person: english ? 'Your name helps people recognize you in shared Workspaces.' : 'نام شما در فضاهای مشترک به دیگران کمک می‌کند شما را بشناسند.',
    workspace: english ? 'Each business or product gets its own Workspace.' : 'برای هر کسب‌وکار یا محصول، یک فضای جدا ساخته می‌شود.',
    project: english ? 'These details are optional and can be changed whenever you like.' : 'این اطلاعات اختیاری‌اند و هر زمان بخواهید می‌توانید تغییرشان دهید.',
  }[step];

  return (
    <section className="onboarding-shell" aria-labelledby="onboarding-title">
      <div className="onboarding-topline">
        <div>
          <p className="auth-kicker">{english ? 'Build your strategy workspace' : 'آماده‌سازی فضای استراتژی'}</p>
          <p>{english ? `Step ${currentIndex + 1} of ${STEP_ORDER.length}` : `گام ${new Intl.NumberFormat('fa-IR').format(currentIndex + 1)} از ${new Intl.NumberFormat('fa-IR').format(STEP_ORDER.length)}`}</p>
        </div>
        <Link to="/demo" className="text-link">{english ? 'Explore the demo' : 'دیدن نسخه نمونه'}</Link>
      </div>
      <div className="onboarding-progress" role="progressbar" aria-label={english ? 'Setup progress' : 'پیشرفت راه‌اندازی'} aria-valuemin={1} aria-valuemax={STEP_ORDER.length} aria-valuenow={currentIndex + 1}>
        <span style={{ inlineSize: `${progressValue}%` }} />
      </div>
      <div className="onboarding-layout">
        <nav className="onboarding-steps" aria-label={english ? 'Setup steps' : 'گام‌های راه‌اندازی'}>
          {STEP_ORDER.map((item, index) => {
            const labels = english
              ? ['Your details', 'Project name', 'Project direction']
              : ['اطلاعات شما', 'نام پروژه', 'جهت پروژه'];
            const current = item === step;
            const complete = index < currentIndex;
            return (
              <div key={item} className={`onboarding-step${current ? ' onboarding-step--current' : ''}${complete ? ' onboarding-step--complete' : ''}`} aria-current={current ? 'step' : undefined}>
                <span className="onboarding-step__number">{complete ? '✓' : new Intl.NumberFormat(english ? 'en-US' : 'fa-IR').format(index + 1)}</span>
                <span>{labels[index]}</span>
              </div>
            );
          })}
        </nav>
        <div className="onboarding-content">
          <header className="onboarding-heading">
            {ownedWorkspace && step === 'project' && <p className="onboarding-project-name">{english ? 'Project' : 'پروژه'}: <strong>{ownedWorkspace.name}</strong></p>}
            <h1 id="onboarding-title" tabIndex={-1}>{stepTitle}</h1>
            <p>{stepDescription}</p>
          </header>

          {step === 'person' && (
            <form className="onboarding-form" onSubmit={(event) => void savePersonalDetails(event)}>
              <Input
                label={english ? 'Your name' : 'نام شما'}
                value={displayName}
                onChange={(event) => { setDisplayName(event.currentTarget.value); clearFeedback(); }}
                maxLength={80}
                autoComplete="name"
                required
                autoFocus
                error={fieldErrors.display_name}
              />
              <Input
                label={english ? 'Role or title (optional)' : 'نقش یا عنوان شغلی (اختیاری)'}
                value={roleTitle}
                onChange={(event) => { setRoleTitle(event.currentTarget.value); clearFeedback(); }}
                maxLength={80}
                autoComplete="organization-title"
                error={fieldErrors.role_title}
              />
              {error && <p className="onboarding-feedback onboarding-feedback--error" role="alert">{error}</p>}
              <div className="onboarding-actions">
                <span />
                <Button variant="primary" type="submit" pending={pending}>{english ? 'Continue' : 'ادامه'}</Button>
              </div>
            </form>
          )}

          {step === 'workspace' && (
            <form className="onboarding-form" onSubmit={(event) => void saveWorkspaceName(event)}>
              <Input
                label={english ? 'Project or business name' : 'نام کسب‌وکار یا پروژه'}
                value={workspaceName}
                onChange={(event) => { setWorkspaceName(event.currentTarget.value); clearFeedback(); }}
                maxLength={120}
                required
                autoFocus
                error={fieldErrors.name}
              />
              <p className="onboarding-hint">{english ? 'You can rename it later. Nothing is pre-filled with demo data.' : 'بعداً هم می‌توانید نام را عوض کنید. هیچ داده نمایشی به‌جای اطلاعات شما وارد نمی‌شود.'}</p>
              {error && <p className="onboarding-feedback onboarding-feedback--error" role="alert">{error}</p>}
              {nameConflict && <Button type="button" variant="secondary" onClick={() => void reloadLatestProject()}>{english ? 'Load the latest project name' : 'بارگیری نام تازه پروژه'}</Button>}
              <div className="onboarding-actions">
                <Button type="button" variant="quiet" onClick={goBack}>{english ? 'Back' : 'بازگشت'}</Button>
                <Button variant="primary" type="submit" pending={pending}>{english ? 'Create project' : 'ساخت پروژه'}</Button>
              </div>
            </form>
          )}

          {step === 'project' && (
            <form className="onboarding-form" onSubmit={(event) => { event.preventDefault(); void finishProject(); }}>
              <Input
                label={english ? 'Industry (optional)' : 'حوزه فعالیت (اختیاری)'}
                value={industry}
                onChange={(event) => { setIndustry(event.currentTarget.value); clearFeedback(); }}
                maxLength={200}
                error={fieldErrors.industry}
              />
              <Input
                label={english ? 'Current stage (optional)' : 'مرحله فعلی (اختیاری)'}
                value={stage}
                onChange={(event) => { setStage(event.currentTarget.value); clearFeedback(); }}
                maxLength={100}
                error={fieldErrors.stage}
              />
              <div className="ui-field">
                <label htmlFor="onboarding-mission">{english ? 'Main goal or challenge (optional)' : 'هدف یا مسئله اصلی (اختیاری)'}</label>
                <textarea
                  id="onboarding-mission"
                  className="ui-input onboarding-textarea"
                  value={mission}
                  onChange={(event) => { setMission(event.currentTarget.value); clearFeedback(); }}
                  maxLength={2000}
                  rows={4}
                  aria-describedby="onboarding-mission-hint"
                  aria-invalid={Boolean(fieldErrors.mission) || undefined}
                />
                <p id="onboarding-mission-hint" className="ui-hint">{fieldErrors.mission || (english ? 'A sentence is enough. You can update it later.' : 'یک جمله کافی است؛ بعداً می‌توانید آن را ویرایش کنید.')}</p>
              </div>
              {error && <p className="onboarding-feedback onboarding-feedback--error" role="alert">{error}</p>}
              {nameConflict && <Button type="button" variant="secondary" onClick={() => void reloadLatestProfile()}>{english ? 'Load the latest project details' : 'بارگیری اطلاعات تازه پروژه'}</Button>}
              <div className="onboarding-actions onboarding-actions--project">
                <Button type="button" variant="quiet" onClick={goBack}>{english ? 'Back' : 'بازگشت'}</Button>
                <div>
                  <Button type="button" variant="quiet" pending={pending} onClick={() => void finishProject(true)}>{english ? 'Skip for now' : 'فعلاً رد می‌کنم'}</Button>
                  <Button variant="primary" type="submit" pending={pending}>{english ? 'Save and open Workspace' : 'ذخیره و ورود به فضا'}</Button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
