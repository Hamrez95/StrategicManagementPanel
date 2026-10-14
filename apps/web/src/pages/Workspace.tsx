import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Dialog, EmptyState, Input, Notice, Skeleton, useToast, useUIAppearance } from '@stratino/ui';
import { AuthApiError, firstFieldError } from '../features/auth/api';
import type { Session } from '../session';
import {
  inviteWorkspaceMember,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  readWorkspace,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  saveWorkspace,
  updateWorkspaceMemberRole,
  type MemberRole,
  type WorkspaceInvitation,
  type WorkspaceMember,
} from '../features/workspaces/api';
import { useWorkspaceDirtyGuard } from '../features/workspaces/switchContext';

function roleLabel(role: WorkspaceMember['role'], english: boolean) {
  if (role === 'owner') return english ? 'Owner' : 'مالک';
  if (role === 'editor') return english ? 'Editor' : 'ویرایشگر';
  return english ? 'Viewer' : 'بیننده';
}

export default function Workspace() {
  const { workspaceId = '' } = useParams();
  const session = useOutletContext<Session>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const notify = useToast();
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const summary = session.workspaces.find((item) => item.id === workspaceId);
  const owner = summary?.role === 'owner';
  const workspaceQuery = useQuery({
    queryKey: ['workspace', workspaceId, 'detail'],
    queryFn: ({ signal }) => readWorkspace(workspaceId, signal),
    enabled: Boolean(summary && workspaceId),
  });
  const membersQuery = useQuery({
    queryKey: ['workspace', workspaceId, 'members'],
    queryFn: ({ signal }) => listWorkspaceMembers(workspaceId, signal),
    enabled: Boolean(owner && workspaceQuery.data),
  });
  const invitationsQuery = useQuery({
    queryKey: ['workspace', workspaceId, 'invitations'],
    queryFn: ({ signal }) => listWorkspaceInvitations(workspaceId, signal),
    enabled: Boolean(owner && workspaceQuery.data),
  });
  const [name, setName] = useState('');
  const [nameRevision, setNameRevision] = useState<number | null>(null);
  const [namePending, setNamePending] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameFieldError, setNameFieldError] = useState('');
  const [nameConflict, setNameConflict] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivePending, setArchivePending] = useState(false);
  const [archiveError, setArchiveError] = useState('');

  useEffect(() => {
    if (!workspaceQuery.data) return;
    setName(workspaceQuery.data.name);
    setNameRevision(workspaceQuery.data.revision);
    setNameError('');
    setNameFieldError('');
    setNameConflict(false);
  }, [workspaceQuery.data?.id]);

  const nameDirty = Boolean(workspaceQuery.data && name !== workspaceQuery.data.name);
  useWorkspaceDirtyGuard(`workspace-name-${workspaceId}`, Boolean(owner && nameDirty));

  async function invalidateWorkspace() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
      queryClient.invalidateQueries({ queryKey: ['session'] }),
    ]);
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceQuery.data || nameRevision === null) return;
    setNamePending(true);
    setNameError('');
    setNameFieldError('');
    setNameConflict(false);
    try {
      const saved = await saveWorkspace(workspaceId, { name, revision: nameRevision });
      queryClient.setQueryData(['workspace', workspaceId, 'detail'], saved);
      setName(saved.name);
      setNameRevision(saved.revision);
      await invalidateWorkspace();
      notify(english ? 'Workspace name saved.' : 'نام فضا ذخیره شد.');
    } catch (reason) {
      if (reason instanceof AuthApiError) {
        setNameError(reason.message);
        setNameFieldError(firstFieldError(reason.fields, 'name') ?? '');
        setNameConflict(reason.code === 'revision_conflict');
      } else {
        setNameError(english ? 'The Workspace name was not saved. Try again.' : 'نام فضا ذخیره نشد. دوباره تلاش کنید.');
      }
    } finally {
      setNamePending(false);
    }
  }

  async function reloadName() {
    const fresh = await workspaceQuery.refetch();
    if (!fresh.data) return;
    setName(fresh.data.name);
    setNameRevision(fresh.data.revision);
    setNameError('');
    setNameFieldError('');
    setNameConflict(false);
  }

  async function archiveWorkspace() {
    if (!workspaceQuery.data || nameDirty) return;
    setArchivePending(true);
    setArchiveError('');
    try {
      await saveWorkspace(workspaceId, { revision: workspaceQuery.data.revision, archived: true });
      setArchiveOpen(false);
      await queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] === 'workspace' && query.queryKey[1] === workspaceId,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
        queryClient.invalidateQueries({ queryKey: ['session'] }),
      ]);
      notify(english ? 'Workspace archived. Its records are kept.' : 'فضا بایگانی شد و اطلاعاتش حفظ شد.');
      navigate('/app/workspaces', { replace: true });
    } catch (reason) {
      setArchiveError(reason instanceof AuthApiError ? reason.message : english ? 'The Workspace could not be archived.' : 'بایگانی فضا انجام نشد.');
    } finally {
      setArchivePending(false);
    }
  }

  if (!summary) {
    return (
      <Notice title={english ? 'Workspace unavailable' : 'فضای کار در دسترس نیست'}>
        <p>{english ? 'This Workspace is not in your current access list.' : 'این فضا در فهرست دسترسی فعلی حساب شما نیست.'}</p>
        <Link to="/app/workspaces" className="text-link">{english ? 'Your Workspaces' : 'رفتن به فضاهای من'}</Link>
      </Notice>
    );
  }
  if (workspaceQuery.isPending) {
    return <section className="workspace-page"><Skeleton label={english ? 'Loading Workspace' : 'در حال بارگذاری فضا'} lines={5} /></section>;
  }
  if (workspaceQuery.isError || !workspaceQuery.data) {
    return (
      <Notice title={english ? 'Workspace unavailable' : 'فضای کار در دسترس نیست'}>
        <p role="alert">{workspaceQuery.error?.message || (english ? 'Access may have changed. Refresh this list and try again.' : 'ممکن است دسترسی تغییر کرده باشد. فهرست را تازه کنید و دوباره تلاش کنید.')}</p>
        <Button onClick={() => void workspaceQuery.refetch()}>{english ? 'Try again' : 'تلاش دوباره'}</Button>
        <Link to="/app/workspaces" className="text-link">{english ? 'Your Workspaces' : 'فضاهای من'}</Link>
      </Notice>
    );
  }

  const workspace = workspaceQuery.data;
  return (
    <section className="workspace-page" aria-labelledby="workspace-title">
      <header className="workspace-page__header">
        <div>
          <p className="auth-kicker">{english ? 'Workspace' : 'فضای کار'}</p>
          <h1 id="workspace-title" tabIndex={-1}>{workspace.name}</h1>
          <p>{english ? `Your role: ${roleLabel(summary.role, true)}` : `نقش شما: ${roleLabel(summary.role, false)}`}</p>
        </div>
        <Link
          to="/app/workspaces"
          className="text-link"
          onClick={(event) => {
            if (nameDirty && !window.confirm(english
              ? `Unsaved changes will be lost. Leave “${workspace.name}”?`
              : `تغییرات ذخیره‌نشده از بین می‌روند. از «${workspace.name}» خارج شوید؟`)) event.preventDefault();
          }}
        >
          {english ? 'All Workspaces' : 'همه فضاها'}
        </Link>
      </header>

      {owner ? (
        <>
          <section className="workspace-panel" aria-labelledby="workspace-details-title">
            <div className="workspace-panel__heading">
              <h2 id="workspace-details-title">{english ? 'Workspace details' : 'مشخصات فضا'}</h2>
              <p>{english ? 'Update the name used across this project.' : 'نامی را ویرایش کنید که در این پروژه نمایش داده می‌شود.'}</p>
            </div>
            <form className="workspace-form workspace-form--inline" onSubmit={(event) => void saveName(event)}>
              <Input
                label={english ? 'Workspace name' : 'نام فضای کار'}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                maxLength={120}
                required
                error={nameFieldError}
              />
              <div className="workspace-form__actions">
                <Button type="submit" variant="primary" pending={namePending} disabled={!nameDirty}>
                  {english ? 'Save name' : 'ذخیره نام'}
                </Button>
                {nameDirty && <Button type="button" variant="quiet" onClick={() => { setName(workspace.name); setNameRevision(workspace.revision); setNameError(''); }}>{english ? 'Discard' : 'لغو تغییر'}</Button>}
              </div>
              {nameError && <p className="account-feedback account-feedback--error" role="alert">{nameError}</p>}
              {nameConflict && <Button type="button" onClick={() => void reloadName()}>{english ? 'Load the latest version' : 'بارگیری نسخه تازه'}</Button>}
            </form>
            <div className="workspace-archive">
              <div>
                <h3>{english ? 'Archive this Workspace' : 'بایگانی این فضا'}</h3>
                <p>{english ? 'Records remain saved; this Workspace leaves active selectors.' : 'اطلاعات ذخیره می‌ماند و فضا از انتخاب‌گرهای فعال کنار می‌رود.'}</p>
              </div>
              <Dialog
                closeLabel={english ? 'Close' : 'بستن'}
                trigger={<Button variant="danger" disabled={nameDirty} onClick={() => setArchiveOpen(true)}>{english ? 'Archive' : 'بایگانی'}</Button>}
                title={english ? 'Archive Workspace' : 'بایگانی فضای کار'}
                description={english ? 'Check the project name before confirming.' : 'پیش از تأیید، نام پروژه را بررسی کنید.'}
                open={archiveOpen}
                onOpenChange={setArchiveOpen}
              >
                <div className="workspace-confirm">
                  <p>{workspace.name}</p>
                  <p>{english ? 'The Workspace and its records stay stored. You can restore it later.' : 'فضا و اطلاعاتش باقی می‌مانند و بعداً می‌توانید آن را بازگردانید.'}</p>
                  {archiveError && <p className="account-feedback account-feedback--error" role="alert">{archiveError}</p>}
                  <Button variant="danger" pending={archivePending} onClick={() => void archiveWorkspace()}>{english ? 'Archive Workspace' : 'بایگانی فضا'}</Button>
                </div>
              </Dialog>
            </div>
          </section>
          <WorkspaceMembers
            workspaceId={workspace.id}
            workspaceName={workspace.name}
            english={english}
            members={membersQuery.data ?? []}
            membersPending={membersQuery.isPending}
            membersError={membersQuery.error}
            refetchMembers={() => membersQuery.refetch()}
            invitations={invitationsQuery.data ?? []}
            invitationsPending={invitationsQuery.isPending}
            invitationsError={invitationsQuery.error}
            refetchInvitations={() => invitationsQuery.refetch()}
          />
        </>
      ) : (
        <EmptyState
          title={english ? 'You can work in this Workspace' : 'به این فضا دسترسی دارید'}
          description={summary.role === 'viewer'
            ? (english ? 'Your role allows you to view this Workspace. Only its owner can change members or details.' : 'نقش شما اجازه مشاهده می‌دهد. تغییر اعضا و مشخصات فقط در اختیار مالک است.')
            : (english ? 'Your role allows you to work with this Workspace. The owner manages its settings and members.' : 'نقش شما اجازه کار در این فضا را می‌دهد. تنظیمات و اعضا را مالک مدیریت می‌کند.')}
        />
      )}
    </section>
  );
}

function WorkspaceMembers({
  workspaceId,
  workspaceName,
  english,
  members,
  membersPending,
  membersError,
  refetchMembers,
  invitations,
  invitationsPending,
  invitationsError,
  refetchInvitations,
}: {
  workspaceId: string;
  workspaceName: string;
  english: boolean;
  members: WorkspaceMember[];
  membersPending: boolean;
  membersError: Error | null;
  refetchMembers: () => Promise<unknown>;
  invitations: WorkspaceInvitation[];
  invitationsPending: boolean;
  invitationsError: Error | null;
  refetchInvitations: () => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const notify = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('editor');
  const [invitePending, setInvitePending] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [removingId, setRemovingId] = useState('');
  const [revokingId, setRevokingId] = useState('');
  const [roleError, setRoleError] = useState('');
  useWorkspaceDirtyGuard(`workspace-invite-${workspaceId}`, email.trim().length > 0);

  async function sendInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInvitePending(true);
    setInviteError('');
    setEmailError('');
    setInviteMessage('');
    try {
      const response = await inviteWorkspaceMember(workspaceId, email, role);
      setInviteMessage(response.message);
      setEmail('');
      await queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'invitations'] });
    } catch (reason) {
      if (reason instanceof AuthApiError) {
        setInviteError(reason.message);
        setEmailError(firstFieldError(reason.fields, 'email') ?? '');
      } else {
        setInviteError(english ? 'The invitation could not be sent. Check the connection and try again.' : 'دعوت فرستاده نشد. اتصال را بررسی و دوباره تلاش کنید.');
      }
    } finally {
      setInvitePending(false);
    }
  }

  async function changeRole(userId: string, nextRole: MemberRole) {
    setRoleError('');
    try {
      await updateWorkspaceMemberRole(workspaceId, userId, nextRole);
      await queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'members'] });
      notify(english ? 'Member role updated.' : 'نقش عضو تغییر کرد.');
    } catch (reason) {
      setRoleError(reason instanceof AuthApiError ? reason.message : english ? 'The role could not be changed.' : 'تغییر نقش انجام نشد.');
    }
  }

  async function removeMember(userId: string) {
    setRemovingId(userId);
    try {
      await removeWorkspaceMember(workspaceId, userId);
      await queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'members'] });
      notify(english ? 'Member access removed.' : 'دسترسی عضو برداشته شد.');
    } catch (reason) {
      setRoleError(reason instanceof AuthApiError ? reason.message : english ? 'Member access could not be removed.' : 'برداشتن دسترسی عضو انجام نشد.');
    } finally {
      setRemovingId('');
    }
  }

  async function revokeInvite(invitationId: string) {
    setRevokingId(invitationId);
    try {
      await revokeWorkspaceInvitation(workspaceId, invitationId);
      await queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'invitations'] });
      notify(english ? 'Invitation revoked.' : 'دعوت لغو شد.');
    } catch (reason) {
      setInviteError(reason instanceof AuthApiError ? reason.message : english ? 'The invitation could not be revoked.' : 'لغو دعوت انجام نشد.');
    } finally {
      setRevokingId('');
    }
  }

  const dateLocale = english ? 'en-US' : 'fa-IR';
  return (
    <section className="workspace-panel workspace-members" aria-labelledby="workspace-members-title">
      <header className="workspace-panel__heading">
        <h2 id="workspace-members-title">{english ? 'Members and invitations' : 'اعضا و دعوت‌ها'}</h2>
        <p>{english ? 'Only the owner can manage who has access to this Workspace.' : 'مدیریت دسترسی این فضا فقط در اختیار مالک است.'}</p>
      </header>

      <form className="workspace-form workspace-invite-form" onSubmit={(event) => void sendInvite(event)}>
        <Input
          label={english ? 'Invite by email' : 'دعوت با ایمیل'}
          type="email"
          dir="ltr"
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          maxLength={254}
          required
          error={emailError}
        />
        <label className="workspace-select-field">
          <span>{english ? 'Access level' : 'سطح دسترسی'}</span>
          <select className="workspace-select" value={role} onChange={(event) => setRole(event.currentTarget.value as MemberRole)}>
            <option value="editor">{english ? 'Editor' : 'ویرایشگر'}</option>
            <option value="viewer">{english ? 'Viewer' : 'بیننده'}</option>
          </select>
        </label>
        <Button variant="primary" type="submit" pending={invitePending}>{english ? 'Send invitation' : 'فرستادن دعوت'}</Button>
        {inviteMessage && <p className="account-feedback" role="status">{inviteMessage}</p>}
        {inviteError && <p className="account-feedback account-feedback--error" role="alert">{inviteError}</p>}
      </form>

      {roleError && <p className="account-feedback account-feedback--error" role="alert">{roleError}</p>}
      <div className="workspace-subsection">
        <h3>{english ? 'People with access' : 'افراد دارای دسترسی'}</h3>
        {membersPending && <Skeleton label={english ? 'Loading members' : 'در حال بارگذاری اعضا'} lines={2} />}
        {membersError && <div className="workspace-error" role="alert"><p>{membersError.message}</p><Button onClick={() => void refetchMembers()}>{english ? 'Try again' : 'تلاش دوباره'}</Button></div>}
        {!membersPending && !membersError && members.length === 0 && <EmptyState title={english ? 'No members found' : 'عضوی پیدا نشد'} description={english ? 'Reload the member list.' : 'فهرست اعضا را دوباره بارگیری کنید.'} />}
        <ul className="workspace-member-list">
          {members.map((member) => (
            <li key={member.user_id} className="workspace-member-row">
              <div className="workspace-member-row__identity">
                <strong>{member.name}</strong>
                <bdi dir="ltr">{member.email}</bdi>
              </div>
              <span className="workspace-member-row__role">{roleLabel(member.role, english)}</span>
              {member.role !== 'owner' && (
                <div className="workspace-member-row__actions">
                  <label className="workspace-select-field workspace-select-field--compact">
                    <span>{english ? `Role for ${member.name}` : `نقش ${member.name}`}</span>
                    <select
                      className="workspace-select"
                      value={member.role}
                      aria-label={english ? `Role for ${member.name}` : `نقش ${member.name}`}
                      onChange={(event) => void changeRole(member.user_id, event.currentTarget.value as MemberRole)}
                    >
                      <option value="editor">{english ? 'Editor' : 'ویرایشگر'}</option>
                      <option value="viewer">{english ? 'Viewer' : 'بیننده'}</option>
                    </select>
                  </label>
                  <MemberRemovalDialog
                    member={member}
                    workspaceName={workspaceName}
                    english={english}
                    pending={removingId === member.user_id}
                    onConfirm={() => removeMember(member.user_id)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="workspace-subsection">
        <h3>{english ? 'Pending invitations' : 'دعوت‌های در انتظار'}</h3>
        {invitationsPending && <Skeleton label={english ? 'Loading invitations' : 'در حال بارگذاری دعوت‌ها'} lines={2} />}
        {invitationsError && <div className="workspace-error" role="alert"><p>{invitationsError.message}</p><Button onClick={() => void refetchInvitations()}>{english ? 'Try again' : 'تلاش دوباره'}</Button></div>}
        {!invitationsPending && !invitationsError && invitations.length === 0 && <EmptyState title={english ? 'No pending invitations' : 'دعوت در انتظاری نیست'} description={english ? 'New invitations will appear here until accepted or expired.' : 'دعوت‌های تازه تا زمان پذیرش یا پایان اعتبار در این فهرست می‌مانند.'} />}
        <ul className="workspace-invite-list">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="workspace-invite-row">
              <div>
                <bdi dir="ltr" className="workspace-invite-row__email">{invitation.email}</bdi>
                <span>{roleLabel(invitation.role, english)}</span>
                <small>{english ? 'Expires' : 'پایان اعتبار'}: {new Intl.DateTimeFormat(dateLocale, { dateStyle: 'medium' }).format(new Date(invitation.expires_at))}</small>
              </div>
              <InvitationRevokeDialog
                invitation={invitation}
                workspaceName={workspaceName}
                english={english}
                pending={revokingId === invitation.id}
                onConfirm={() => revokeInvite(invitation.id)}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function MemberRemovalDialog({
  member,
  workspaceName,
  english,
  pending,
  onConfirm,
}: {
  member: WorkspaceMember;
  workspaceName: string;
  english: boolean;
  pending: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      closeLabel={english ? 'Close' : 'بستن'}
      trigger={<Button variant="danger" onClick={() => setOpen(true)}>{english ? 'Remove' : 'برداشتن دسترسی'}</Button>}
      title={english ? 'Remove member access' : 'برداشتن دسترسی عضو'}
      description={english ? 'Confirm who will lose access and from which Workspace.' : 'بررسی کنید دسترسی چه کسی از کدام فضا برداشته می‌شود.'}
      open={open}
      onOpenChange={setOpen}
    >
      <div className="workspace-confirm">
        <p><strong>{workspaceName}</strong></p>
        <p>{member.name} <bdi dir="ltr">{member.email}</bdi></p>
        <Button variant="danger" pending={pending} onClick={() => void onConfirm()}>{english ? 'Remove access' : 'برداشتن دسترسی'}</Button>
      </div>
    </Dialog>
  );
}

function InvitationRevokeDialog({
  invitation,
  workspaceName,
  english,
  pending,
  onConfirm,
}: {
  invitation: WorkspaceInvitation;
  workspaceName: string;
  english: boolean;
  pending: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      closeLabel={english ? 'Close' : 'بستن'}
      trigger={<Button variant="quiet" onClick={() => setOpen(true)}>{english ? 'Revoke invitation' : 'لغو دعوت'}</Button>}
      title={english ? 'Revoke invitation' : 'لغو دعوت'}
      description={english ? 'The invitation link will stop working immediately.' : 'پیوند دعوت بلافاصله از کار می‌افتد.'}
      open={open}
      onOpenChange={setOpen}
    >
      <div className="workspace-confirm">
        <p><strong>{workspaceName}</strong></p>
        <p><bdi dir="ltr">{invitation.email}</bdi></p>
        <Button variant="danger" pending={pending} onClick={() => void onConfirm()}>{english ? 'Revoke invitation' : 'لغو دعوت'}</Button>
      </div>
    </Dialog>
  );
}
