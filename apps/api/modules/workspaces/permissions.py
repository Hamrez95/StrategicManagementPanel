from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework.exceptions import NotAuthenticated, NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission

from .services import (
    get_accessible_workspace_or_404,
    scope_queryset_to_user_workspaces,
    workspace_role,
)


class WorkspaceRolePermission(BasePermission):
    """Use with IsAuthenticated and an explicit view.workspace_roles allow-list."""

    message = 'برای این پروژه دسترسی لازم را ندارید.'

    def has_permission(self, request, view):
        if (
            not getattr(request.user, 'is_authenticated', False)
            or not getattr(request.user, 'is_active', False)
            or getattr(request.user, 'email_verified_at', None) is None
        ):
            raise NotAuthenticated('برای ادامه وارد حساب تأییدشده شوید.')
        workspace_id = view.kwargs.get('workspace_id')
        if workspace_id is None:
            return False
        try:
            workspace = get_accessible_workspace_or_404(request.user, workspace_id)
        except Http404:
            raise NotFound('فضای کار در دسترس نیست.', code='workspace_not_found') from None

        role = workspace_role(request.user, workspace)
        if role is None:
            raise NotFound('فضای کار در دسترس نیست.', code='workspace_not_found')
        allowed_roles = set(getattr(view, 'workspace_roles', ()))
        if role not in allowed_roles:
            raise PermissionDenied(self.message, code='workspace_permission_denied')

        view.workspace = workspace
        view.workspace_role = role
        return True


class WorkspaceScopedQuerySetMixin:
    """Filter every row by membership and, when present, the route's parent ID."""

    workspace_field = 'workspace'

    def get_queryset(self):
        queryset = super().get_queryset()
        return scope_queryset_to_user_workspaces(
            queryset,
            self.request.user,
            workspace_field=self.workspace_field,
            workspace_id=self.kwargs.get('workspace_id'),
        )


def get_workspace_child_or_404(user, workspace, queryset, resource_id, workspace_field='workspace'):
    """Resolve a nested ID only inside both the member scope and route Workspace."""
    scoped = scope_queryset_to_user_workspaces(
        queryset,
        user,
        workspace_field=workspace_field,
        workspace_id=workspace.pk,
    )
    try:
        return scoped.get(pk=resource_id)
    except (queryset.model.DoesNotExist, DjangoValidationError, TypeError, ValueError):
        raise NotFound('منبع در این فضای کار در دسترس نیست.', code='workspace_resource_not_found') from None


def validate_related_workspaces(workspace, related_objects):
    """Reject nested relations that point outside the authoritative route Workspace."""
    for related in related_objects:
        if related is not None and getattr(related, 'workspace_id', None) != workspace.pk:
            raise ValidationError({'related': 'همه موارد پیوندخورده باید متعلق به همین فضای کار باشند.'})

