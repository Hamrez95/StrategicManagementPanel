import secrets
from datetime import timedelta
from urllib.parse import quote

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Case, CharField, OuterRef, Q, Subquery, Value, When
from django.http import Http404
from django.utils import timezone
from django.utils.crypto import salted_hmac
from rest_framework.exceptions import PermissionDenied as ApiPermissionDenied

from modules.accounts.models import User
from modules.core.mailer import deliver_email

from .models import BillingAccount, Membership, Workspace, WorkspaceInvitation, WorkspaceProfile

INVITATION_TIMEOUT = timedelta(days=7)
INVITATION_SALT = 'stratino.workspace-invitation'


class WorkspaceActionError(Exception):
    def __init__(self, status, code, message, *, fields=None, retry_after=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields or {}
        self.retry_after = retry_after


def accessible_workspaces_for(user):
    """The single source of truth for the Workspaces visible to an account."""
    if (
        not getattr(user, 'is_authenticated', False)
        or not getattr(user, 'is_active', False)
        or getattr(user, 'email_verified_at', None) is None
    ):
        return Workspace.objects.none()
    return Workspace.objects.filter(
        Q(owner_id=user.pk) | Q(memberships__user_id=user.pk)
    ).distinct()


def workspace_role(user, workspace):
    """Return owner/editor/viewer; operator flags never grant Workspace access."""
    if (
        not getattr(user, 'is_authenticated', False)
        or not getattr(user, 'is_active', False)
        or getattr(user, 'email_verified_at', None) is None
    ):
        return None
    if workspace.owner_id == user.pk:
        return 'owner'
    return Membership.objects.filter(
        workspace_id=workspace.pk,
        user_id=user.pk,
    ).values_list('role', flat=True).first()


def get_accessible_workspace_or_404(user, workspace_id):
    try:
        return accessible_workspaces_for(user).get(pk=workspace_id)
    except (Workspace.DoesNotExist, DjangoValidationError, TypeError, ValueError):
        raise Http404('Workspace is not available.') from None


def require_workspace_role(user, workspace, allowed_roles):
    """Hide invisible Workspaces, then reject visible members with insufficient roles."""
    role = workspace_role(user, workspace)
    if role is None:
        raise Http404('Workspace is not available.')
    if role not in set(allowed_roles):
        raise ApiPermissionDenied(
            'برای این پروژه دسترسی لازم را ندارید.',
            code='workspace_permission_denied',
        )
    return role


@transaction.atomic
def create_owned_workspace(owner, name):
    """Create a Workspace only with an owner-matched billing identity."""
    if (
        not getattr(owner, 'is_authenticated', False)
        or not owner.is_active
        or owner.email_verified_at is None
    ):
        raise DjangoValidationError({'owner': 'A verified, active account is required.'})
    normalized_name = name.strip() if isinstance(name, str) else ''
    if not normalized_name or len(normalized_name) > 120:
        raise DjangoValidationError({'name': 'Workspace name must contain 1 to 120 characters.'})

    billing_account, _ = BillingAccount.objects.get_or_create(owner=owner)
    if billing_account.status != BillingAccount.Status.ACTIVE:
        raise DjangoValidationError({'billing_account': 'This billing account cannot create Workspaces.'})
    workspace = Workspace(
        owner=owner,
        billing_account=billing_account,
        name=normalized_name,
    )
    workspace.full_clean()
    workspace.save(force_insert=True)
    WorkspaceProfile.objects.create(workspace=workspace)
    return workspace


@transaction.atomic
def update_workspace(actor, workspace, *, revision, name=None, archived=None):
    locked = Workspace.objects.select_for_update().filter(pk=workspace.pk).first()
    if locked is None:
        raise Http404('Workspace is not available.')
    require_workspace_role(actor, locked, {'owner'})
    if revision != locked.revision:
        raise WorkspaceActionError(
            409,
            'revision_conflict',
            'این فضا هم‌زمان تغییر کرده است. اطلاعات تازه را بارگیری و دوباره تلاش کنید.',
            fields={'revision': ['نسخه فعلی تغییر کرده است.']},
        )

    changed_fields = []
    if name is not None:
        normalized_name = name.strip() if isinstance(name, str) else ''
        if not normalized_name or len(normalized_name) > 120:
            raise DjangoValidationError({'name': 'نام باید بین ۱ تا ۱۲۰ نویسه باشد.'})
        if normalized_name != locked.name:
            locked.name = normalized_name
            changed_fields.append('name')
    if archived is not None:
        if not isinstance(archived, bool):
            raise DjangoValidationError({'archived': 'یک وضعیت معتبر انتخاب کنید.'})
        if archived and locked.archived_at is None:
            locked.archived_at = timezone.now()
            changed_fields.append('archived_at')
            WorkspaceInvitation.objects.filter(
                workspace=locked,
                accepted_at__isnull=True,
                revoked_at__isnull=True,
            ).update(revoked_at=timezone.now())
        elif not archived and locked.archived_at is not None:
            locked.archived_at = None
            changed_fields.append('archived_at')
    if not changed_fields:
        return locked
    locked.revision += 1
    locked.updated_at = timezone.now()
    locked.save(update_fields=[*changed_fields, 'revision', 'updated_at'])
    return locked


@transaction.atomic
def grant_workspace_membership(actor, workspace, user, role):
    """Owners alone can grant editor/viewer access; ownership stays derived."""
    locked = Workspace.objects.select_for_update().get(pk=workspace.pk)
    require_workspace_role(actor, locked, {'owner'})
    allowed = {Membership.Role.EDITOR, Membership.Role.VIEWER}
    if not isinstance(role, str) or role not in allowed:
        raise DjangoValidationError({'role': 'Role must be editor or viewer.'})
    if user.pk == locked.owner_id:
        raise DjangoValidationError({'user': 'The owner role is derived from Workspace ownership.'})
    if not user.is_active or user.email_verified_at is None:
        raise DjangoValidationError({'user': 'Only active, verified accounts can be members.'})
    membership, _ = Membership.objects.update_or_create(
        workspace=locked,
        user=user,
        defaults={'role': role},
    )
    return membership


@transaction.atomic
def remove_workspace_membership(actor, workspace, user):
    """Remove a member atomically; owners cannot lose the final owner through this path."""
    locked = Workspace.objects.select_for_update().get(pk=workspace.pk)
    require_workspace_role(actor, locked, {'owner'})
    if user.pk == locked.owner_id:
        raise DjangoValidationError({'user': 'Transfer ownership before removing the owner.'})
    deleted, _ = Membership.objects.filter(workspace=locked, user=user).delete()
    if not deleted:
        raise DjangoValidationError({'user': 'This account is not a member of the Workspace.'})


def _invitation_digest(token):
    return salted_hmac(INVITATION_SALT, token).hexdigest()


def create_workspace_invitation(actor, workspace, email, role):
    normalized_email = email.strip().casefold() if isinstance(email, str) else ''
    if not normalized_email or len(normalized_email) > 254:
        raise DjangoValidationError({'email': 'ایمیل معتبری وارد کنید.'})
    try:
        validate_email(normalized_email)
    except DjangoValidationError:
        raise DjangoValidationError({'email': 'ایمیل معتبری وارد کنید.'}) from None
    if not isinstance(role, str) or role not in {Membership.Role.EDITOR, Membership.Role.VIEWER}:
        raise DjangoValidationError({'role': 'نقش باید ویرایشگر یا بیننده باشد.'})

    now = timezone.now()
    with transaction.atomic():
        User.objects.select_for_update().get(pk=actor.pk)
        locked = Workspace.objects.select_for_update().get(pk=workspace.pk)
        require_workspace_role(actor, locked, {'owner'})
        if locked.archived_at is not None:
            raise DjangoValidationError({'workspace': 'برای فضای بایگانی‌شده نمی‌توان دعوت فرستاد.'})
        if normalized_email == actor.email.casefold():
            raise DjangoValidationError({'email': 'مالک از قبل به این فضا دسترسی دارد.'})
        if Membership.objects.filter(workspace=locked, user__email__iexact=normalized_email).exists():
            raise WorkspaceActionError(409, 'already_a_member', 'این حساب از قبل عضو این فضاست.')

        WorkspaceInvitation.objects.filter(
            workspace=locked,
            email=normalized_email,
            accepted_at__isnull=True,
            revoked_at__isnull=True,
            expires_at__lte=now,
        ).update(revoked_at=now)
        if WorkspaceInvitation.objects.filter(
            workspace=locked,
            email=normalized_email,
            accepted_at__isnull=True,
            revoked_at__isnull=True,
        ).exists():
            raise WorkspaceActionError(409, 'duplicate_invitation', 'برای این نشانی دعوت فعالی وجود دارد.')

        recent_count = WorkspaceInvitation.objects.filter(
            invited_by=actor,
            created_at__gte=now - timedelta(hours=1),
        ).count()
        if recent_count >= 10:
            raise WorkspaceActionError(
                429,
                'rate_limited',
                'تعداد دعوت‌ها در یک ساعت گذشته زیاد بوده است. کمی بعد دوباره تلاش کنید.',
                retry_after=3600,
            )

        token = secrets.token_urlsafe(32)
        invitation = WorkspaceInvitation.objects.create(
            workspace=locked,
            invited_by=actor,
            email=normalized_email,
            role=role,
            token_digest=_invitation_digest(token),
            expires_at=now + INVITATION_TIMEOUT,
        )

    link = f'{settings.STRATINO_PUBLIC_URL}/account/invitation#token={quote(token, safe="")}'
    sent = deliver_email(
        'دعوت به فضای کار استراتینو',
        f'برای پیوستن به فضای «{locked.name}» این پیوند را باز کنید:\n\n{link}\n\n'
        'این دعوت تا هفت روز معتبر است و فقط با حساب دارای همین نشانی ایمیل پذیرفته می‌شود. '
        'اگر انتظار این پیام را نداشتید، آن را نادیده بگیرید.',
        normalized_email,
        purpose='Workspace invitation',
    )
    if not sent:
        WorkspaceInvitation.objects.filter(pk=invitation.pk, accepted_at__isnull=True).update(
            revoked_at=timezone.now()
        )
        raise WorkspaceActionError(
            503,
            'email_unavailable',
            'ارسال دعوت انجام نشد. اتصال ایمیل را بررسی کنید و دوباره تلاش کنید.',
        )
    return invitation


def accept_workspace_invitation(user, token):
    if not isinstance(token, str) or not 32 <= len(token) <= 256:
        raise DjangoValidationError({'token': 'دعوت معتبر نیست یا منقضی شده است.'})
    digest = _invitation_digest(token)
    workspace_id = WorkspaceInvitation.objects.filter(token_digest=digest).values_list('workspace_id', flat=True).first()
    if workspace_id is None:
        raise DjangoValidationError({'token': 'دعوت معتبر نیست یا منقضی شده است.'})

    with transaction.atomic():
        workspace = Workspace.objects.select_for_update().filter(pk=workspace_id).first()
        invitation = WorkspaceInvitation.objects.select_for_update().filter(
            workspace_id=workspace_id,
            token_digest=digest,
        ).first()
        now = timezone.now()
        if (
            workspace is None
            or invitation is None
            or invitation.accepted_at is not None
            or invitation.revoked_at is not None
            or invitation.expires_at <= now
            or workspace.archived_at is not None
        ):
            raise DjangoValidationError({'token': 'دعوت معتبر نیست یا منقضی شده است.'})
        if not user.is_active or user.email_verified_at is None:
            raise DjangoValidationError({'account': 'ابتدا ایمیل حساب را تأیید کنید.'})
        if user.email.casefold() != invitation.email:
            raise DjangoValidationError({'account': 'با حسابی وارد شوید که این دعوت به آن فرستاده شده است.'})
        if user.pk == workspace.owner_id:
            raise DjangoValidationError({'token': 'مالک از قبل به این فضا دسترسی دارد.'})
        if Membership.objects.filter(workspace=workspace, user=user).exists():
            raise WorkspaceActionError(409, 'already_a_member', 'این حساب از قبل عضو این فضاست.')

        membership = Membership.objects.create(
            workspace=workspace,
            user=user,
            role=invitation.role,
        )
        invitation.accepted_at = now
        invitation.save(update_fields=['accepted_at'])
    return workspace, membership


@transaction.atomic
def revoke_workspace_invitation(actor, workspace, invitation_id):
    locked = Workspace.objects.select_for_update().get(pk=workspace.pk)
    require_workspace_role(actor, locked, {'owner'})
    invitation = WorkspaceInvitation.objects.select_for_update().filter(
        workspace=locked,
        pk=invitation_id,
        accepted_at__isnull=True,
        revoked_at__isnull=True,
    ).first()
    if invitation is None:
        raise Http404('Invitation is not available.')
    invitation.revoked_at = timezone.now()
    invitation.save(update_fields=['revoked_at'])
    return invitation


def scope_queryset_to_user_workspaces(queryset, user, workspace_field='workspace', workspace_id=None):
    """Scope any Workspace-owned row set before list, detail, search, export, or jobs."""
    allowed = accessible_workspaces_for(user)
    if workspace_id is not None:
        try:
            allowed = allowed.filter(pk=workspace_id)
        except DjangoValidationError:
            return queryset.none()
    return queryset.filter(**{f'{workspace_field}__in': allowed})


def workspace_session_payload(user):
    member_role = Membership.objects.filter(
        workspace_id=OuterRef('pk'),
        user_id=user.pk,
    ).values('role')[:1]
    rows = (
        accessible_workspaces_for(user)
        .filter(archived_at__isnull=True)
        .annotate(
            role=Case(
                When(owner_id=user.pk, then=Value('owner')),
                default=Subquery(member_role),
                output_field=CharField(),
            )
        )
        .values('id', 'name', 'role')
    )
    return [{'id': str(row['id']), 'name': row['name'], 'role': row['role']} for row in rows]


def workspace_dict(workspace):
    return {
        'id': str(workspace.pk),
        'owner_id': str(workspace.owner_id),
        'billing_account_id': str(workspace.billing_account_id),
        'name': workspace.name,
        'revision': workspace.revision,
        'archived_at': workspace.archived_at,
    }

