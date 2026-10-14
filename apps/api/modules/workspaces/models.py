import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


class BillingAccount(models.Model):
    """Owner-scoped billing identity; plans and payment behavior live in STR-029."""

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        SUSPENDED = 'suspended', 'Suspended'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='billing_account',
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class Workspace(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='owned_workspaces',
    )
    billing_account = models.ForeignKey(
        BillingAccount,
        on_delete=models.PROTECT,
        related_name='workspaces',
    )
    name = models.CharField(max_length=120)
    archived_at = models.DateTimeField(null=True, blank=True)
    revision = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('name', 'id')
        constraints = [
            models.CheckConstraint(condition=Q(revision__gte=1), name='workspace_revision_gte_1'),
        ]

    def clean(self):
        super().clean()
        if self.billing_account_id and self.owner_id:
            account_owner_id = BillingAccount.objects.filter(pk=self.billing_account_id).values_list('owner_id', flat=True).first()
            if account_owner_id and account_owner_id != self.owner_id:
                raise ValidationError({'billing_account': 'Billing account must belong to the workspace owner.'})

    def __str__(self):
        return self.name


class Membership(models.Model):
    class Role(models.TextChoices):
        EDITOR = 'editor', 'Editor'
        VIEWER = 'viewer', 'Viewer'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='workspace_memberships')
    role = models.CharField(max_length=8, choices=Role.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=('workspace', 'user'), name='workspace_membership_unique_user'),
            models.CheckConstraint(condition=Q(role__in=('editor', 'viewer')), name='workspace_membership_valid_role'),
        ]

    def clean(self):
        super().clean()
        if self.workspace_id and self.user_id and self.workspace.owner_id == self.user_id:
            raise ValidationError({'user': 'Workspace ownership is derived from the owner field.'})


class WorkspaceInvitation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='invitations')
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='workspace_invitations_sent',
    )
    email = models.EmailField(max_length=254)
    role = models.CharField(max_length=8, choices=Membership.Role.choices)
    token_digest = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('expires_at', 'id')
        indexes = [models.Index(fields=('workspace', 'expires_at'), name='workspace_invite_expiry_idx')]
        constraints = [
            models.UniqueConstraint(
                fields=('workspace', 'email'),
                condition=Q(accepted_at__isnull=True, revoked_at__isnull=True),
                name='workspace_invite_pending_uniq',
            ),
            models.CheckConstraint(
                condition=Q(role__in=('editor', 'viewer')),
                name='workspace_invite_valid_role',
            ),
        ]

