import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, EmptyState, Input, Skeleton, useToast, useUIAppearance } from '@stratino/ui';
import { AuthApiError, firstFieldError } from '../auth/api';
import type { Session } from '../../session';
import { createWorkspace, listWorkspaces, saveWorkspace, type WorkspaceRecord } from './api';
import { useWorkspaceDirtyGuard } from './switchContext';

function WorkspaceRow({
  workspace,
  role,
  isOwner,
  english,
  onChanged,
}: {
  workspace: WorkspaceRecord;
  role: string;
  isOwner: boolean;
  english: boolean;
  onChanged: () => Promise<void>;
}) {
  const notify = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const archived = workspace.archived_at !== null;

  async function toggleArchive() {
    setPending(true);
    setError('');
    try {
      await saveWorkspace(workspace.id, { revision: workspace.revision, archived: !archived });
      await onChanged();
      notify(english ? (archived ? 'Workspace restored.' : 'Workspace archived.') : (archived ? 'فضا بازگردانی شد.' : 'فضا بایگانی شد.'));
      setDialogOpen(false);
    } catch (reason) {
      setError(reason instanceof AuthApiError ? reason.message : english ? 'The change could not be saved. Try again.' : 'تغییر ذخیره نشد. دوباره تلاش کنید.');
    } finally {
      setPending(false);
    }
  }

  return (
    <li className={`workspace-row${archived ? ' workspace-row--archived' : ''}`}>
      <div className="workspace-row__identity">
        {archived ? (
          <span className="workspace-row__name">{workspace.name}</span>
        ) : (
          <Link to={`/app/workspaces/${encodeURIComponent(workspace.id)}`} className="workspace-row__name">
            {workspace.name}
          </Link>
        )}
        <span className="workspace-row__role">{role}</span>
        {archived && <span className="workspace-row__status">{english ? 'Archived' : 'بایگانی‌شده'}</span>}
      </div>
      <div className="workspace-row__actions">
        {!archived && <Link to={`/app/workspaces/${encodeURIComponent(workspace.id)}`} className="text-link">{english ? 'Open' : 'بازکردن'}</Link>}
        {isOwner && (
          <Dialog
            closeLabel={english ? 'Close' : 'بستن'}
            trigger={
              <Button variant={archived ? 'secondary' : 'quiet'} onClick={() => setDialogOpen(true)}>
                {archived ? (english ? 'Restore' : 'بازگردانی') : (english ? 'Archive' : 'بایگانی')}
              </Button>
            }
            title={archived ? (english ? 'Restore Workspace' : 'بازگردانی فضای کار') : (english ? 'Archive Workspace' : 'بایگانی فضای کار')}
            description={english ? 'Confirm the exact Workspace before changing its status.' : 'پیش از تغییر وضعیت، نام دقیق فضای کار را بررسی کنید.'}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
          >
            <div className="workspace-confirm">
              <p>{workspace.name}</p>
              <p>{archived ? (english ? 'Its records will stay available.' : 'اطلاعات این فضا حفظ می‌شود.') : (english ? 'This hides it from active selectors; its records stay intact.' : 'از انتخاب‌گر فعال پنهان می‌شود و اطلاعاتش باقی می‌ماند.')}</p>
              {error && <p className="account-feedback account-feedback--error" role="alert">{error}</p>}
              <Button variant={archived ? 'primary' : 'danger'} pending={pending} onClick={() => void toggleArchive()}>
                {archived ? (english ? 'Restore Workspace' : 'بازگردانی فضا') : (english ? 'Archive Workspace' : 'بایگانی فضا')}
              </Button>
            </div>
          </Dialog>
        )}
      </div>
    </li>
  );
}

export default function WorkspaceManagementPage() {
  const session = useOutletContext<Session>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const notify = useToast();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: ({ signal }) => listWorkspaces(signal),
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  useWorkspaceDirtyGuard('workspace-create', createOpen && name.trim().length > 0);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    await queryClient.invalidateQueries({ queryKey: ['session'] });
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setNameError('');
    try {
      const workspace = await createWorkspace(name);
      setName('');
      setCreateOpen(false);
      await refresh();
      notify(english ? 'Workspace created.' : 'فضای کار ساخته شد.');
      navigate(`/app/workspaces/${encodeURIComponent(workspace.id)}`);
    } catch (reason) {
      if (reason instanceof AuthApiError) {
        setNameError(firstFieldError(reason.fields, 'name') ?? '');
        setError(reason.message);
      } else {
        setError(english ? 'Workspace could not be created. Check the connection and try again.' : 'فضای کار ساخته نشد. اتصال را بررسی و دوباره تلاش کنید.');
      }
    } finally {
      setPending(false);
    }
  }

  const records = workspaces.data ?? [];
  const owned = records.filter((workspace) => workspace.owner_id === session.user.id && !workspace.archived_at);
  const joined = records.filter((workspace) => workspace.owner_id !== session.user.id && !workspace.archived_at);
  const archived = records.filter((workspace) => workspace.owner_id === session.user.id && workspace.archived_at);
  const joinedRoles = new Map(session.workspaces.map((workspace) => [workspace.id, workspace.role]));
  const createTrigger = (
    <Button variant="primary" onClick={() => setCreateOpen(true)}>
      {english ? 'Create Workspace' : 'ساخت فضای کار'}
    </Button>
  );

  return (
    <section className="workspace-management" aria-labelledby="workspace-management-title">
      <header className="workspace-management__header">
        <div>
          <p className="auth-kicker">{english ? 'Project access' : 'دسترسی پروژه'}</p>
          <h1 id="workspace-management-title" tabIndex={-1}>{english ? 'Your Workspaces' : 'فضاهای من'}</h1>
          <p>{english ? 'Keep each project and its members in the right place.' : 'هر پروژه و اعضایش را در فضای خودش مدیریت کنید.'}</p>
        </div>
        <Dialog
          closeLabel={english ? 'Close' : 'بستن'}
          trigger={createTrigger}
          title={english ? 'Create a Workspace' : 'ساخت فضای کار'}
          description={english ? 'Give this project a clear name. You can invite members after creation.' : 'برای این پروژه نام مشخصی انتخاب کنید. پس از ساخت می‌توانید عضو دعوت کنید.'}
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) {
              setError('');
              setNameError('');
            }
          }}
        >
          <form className="workspace-form" onSubmit={(event) => void submitCreate(event)}>
            <Input
              label={english ? 'Workspace name' : 'نام فضای کار'}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              maxLength={120}
              required
              autoFocus
              error={nameError}
            />
            {error && <p className="account-feedback account-feedback--error" role="alert">{error}</p>}
            <Button variant="primary" type="submit" pending={pending}>
              {english ? 'Create Workspace' : 'ساخت فضا'}
            </Button>
          </form>
        </Dialog>
      </header>

      {workspaces.isPending && <Skeleton label={english ? 'Loading Workspaces' : 'در حال بارگذاری فضاها'} lines={4} />}
      {workspaces.isError && (
        <div className="workspace-error" role="alert">
          <p>{workspaces.error.message || (english ? 'Workspaces could not be loaded.' : 'فهرست فضاها بارگذاری نشد.')}</p>
          <Button onClick={() => void workspaces.refetch()}>{english ? 'Try again' : 'تلاش دوباره'}</Button>
        </div>
      )}

      {!workspaces.isPending && !workspaces.isError && records.length === 0 && (
        <EmptyState
          title={english ? 'No Workspace yet' : 'هنوز فضایی نساخته‌اید'}
          description={english ? 'Create a Workspace for your first project, then invite the people who need access.' : 'برای پروژه اول فضا بسازید و سپس افرادی را که نیاز به دسترسی دارند دعوت کنید.'}
          action={<Button variant="primary" onClick={() => setCreateOpen(true)}>{english ? 'Create Workspace' : 'ساخت فضای کار'}</Button>}
        />
      )}

      {owned.length > 0 && (
      <WorkspaceGroup title={english ? 'Owned by you' : 'در مالکیت شما'} rows={owned} role={english ? 'Owner' : 'مالک'} isOwner english={english} onChanged={refresh} />
      )}
      {joined.length > 0 && (
        <WorkspaceGroup
          title={english ? 'Shared with you' : 'فضاهای دعوتی'}
          rows={joined}
          roleFor={(workspace) => {
            const role = joinedRoles.get(workspace.id);
            return english ? (role === 'editor' ? 'Editor' : 'Viewer') : (role === 'editor' ? 'ویرایشگر' : 'بیننده');
          }}
          isOwner={false}
          english={english}
          onChanged={refresh}
        />
      )}
      {archived.length > 0 && (
        <WorkspaceGroup title={english ? 'Archived' : 'بایگانی‌شده'} rows={archived} role={english ? 'Owner' : 'مالک'} isOwner english={english} onChanged={refresh} />
      )}
      <p className="workspace-management__note">
        {english ? 'Archiving hides a Workspace from active selection and keeps its records.' : 'بایگانی، فضا را از انتخاب‌گر فعال پنهان می‌کند و اطلاعاتش را نگه می‌دارد.'}
      </p>
    </section>
  );
}

function WorkspaceGroup({
  title,
  rows,
  role,
  roleFor,
  isOwner = false,
  english,
  onChanged,
}: {
  title: string;
  rows: WorkspaceRecord[];
  role?: string;
  roleFor?: (workspace: WorkspaceRecord) => string;
  isOwner?: boolean;
  english: boolean;
  onChanged: () => Promise<void>;
}) {
  return (
    <section className="workspace-group" aria-label={title}>
      <h2>{title}</h2>
      <ul className="workspace-list">
        {rows.map((workspace) => (
          <WorkspaceRow
            key={workspace.id}
            workspace={workspace}
            role={roleFor?.(workspace) ?? role ?? ''}
            isOwner={isOwner}
            english={english}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </section>
  );
}
