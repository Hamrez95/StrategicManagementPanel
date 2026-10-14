from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Case, CharField, OuterRef, Q, Subquery, Value, When
from django.http import Http404
from rest_framework.exceptions import PermissionDenied as ApiPermissionDenied

from .models import BillingAccount, Membership, Workspace


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
    return workspace


@transaction.atomic
def grant_workspace_membership(actor, workspace, user, role):
    """Owners alone can grant editor/viewer access; ownership stays derived."""
    locked = Workspace.objects.select_for_update().get(pk=workspace.pk)
    require_workspace_role(actor, locked, {'owner'})
    allowed = {Membership.Role.EDITOR, Membership.Role.VIEWER}
    if role not in allowed:
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

