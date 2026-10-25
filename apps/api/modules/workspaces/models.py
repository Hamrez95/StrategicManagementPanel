import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from .payment_models import (  # noqa: F401
    ManagementDiscount,
    ManagementOrder,
    ManagementPaymentAttempt,
    ManagementPaymentEvent,
    ManagementRefund,
)
from .plan_models import (  # noqa: F401
    ManagementPlan,
    ManagementSubscription,
    ManagementSubscriptionEvent,
)


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


class WorkspaceProfile(models.Model):
    workspace = models.OneToOneField(Workspace, on_delete=models.CASCADE, related_name='profile')
    company_name = models.CharField(max_length=120, blank=True, default='')
    industry = models.CharField(max_length=200, blank=True, default='')
    stage = models.CharField(max_length=100, blank=True, default='')
    mission = models.TextField(max_length=2000, blank=True, default='')
    problem_statement = models.TextField(max_length=2000, blank=True, default='')
    products = models.JSONField(default=list)
    customer_segments = models.JSONField(default=list)
    goals = models.JSONField(default=list)
    icps = models.JSONField(default=list)
    revision = models.PositiveIntegerField(default=1)
    onboarding_completed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(revision__gte=1), name='workspace_profile_revision_gte_1'),
        ]


class WorkspaceProfileRevision(models.Model):
    profile = models.ForeignKey(WorkspaceProfile, on_delete=models.CASCADE, related_name='history')
    revision = models.PositiveIntegerField()
    snapshot = models.JSONField()
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='workspace_profile_revisions')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-revision',)
        constraints = [
            models.UniqueConstraint(fields=('profile', 'revision'), name='workspace_profile_revision_unique'),
            models.CheckConstraint(condition=Q(revision__gte=1), name='workspace_profile_history_revision_gte_1'),
        ]


class WorkspaceSetup(models.Model):
    """Versioned, self-reported discovery answers kept apart from assessments."""

    BUSINESS_KINDS = (('startup', 'Startup'), ('business', 'Business'), ('organization', 'Organization'))
    REPORTED_STAGES = (('idea', 'Idea'), ('building', 'Building'), ('operating', 'Operating'), ('unknown', 'Unknown'))
    OBJECTIVES = (('customers', 'Customers'), ('growth', 'Growth'), ('strategy', 'Strategy'), ('execution', 'Execution'))

    workspace = models.OneToOneField(Workspace, on_delete=models.CASCADE, related_name='setup')
    schema_version = models.PositiveSmallIntegerField(default=1)
    business_kind = models.CharField(max_length=16, choices=BUSINESS_KINDS)
    reported_stage = models.CharField(max_length=16, choices=REPORTED_STAGES, default='unknown')
    setup_objective = models.CharField(max_length=16, choices=OBJECTIVES)
    follow_up_question_id = models.CharField(max_length=48)
    follow_up_choice_id = models.CharField(max_length=32)
    presentation_color = models.CharField(max_length=16, default='blue')
    revision = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(schema_version__gte=1), name='workspace_setup_schema_gte_1'),
            models.CheckConstraint(condition=Q(revision__gte=1), name='workspace_setup_revision_gte_1'),
        ]


class WorkspaceBootstrapRequest(models.Model):
    """Idempotency receipt for an atomic first Workspace plus setup bootstrap."""

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='workspace_bootstrap_requests')
    key = models.CharField(max_length=100)
    payload_digest = models.CharField(max_length=64)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='bootstrap_requests')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=('owner', 'key'), name='workspace_bootstrap_owner_key_uniq'),
        ]


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


class WorkspaceEvent(models.Model):
    """Access/Workspace lifecycle audit; never stores invitation tokens or email bodies."""

    class Type(models.TextChoices):
        CREATED = 'created', 'Created'
        UPDATED = 'updated', 'Updated'
        MEMBER_CHANGED = 'member_changed', 'Member changed'
        MEMBER_REMOVED = 'member_removed', 'Member removed'
        INVITE_CREATED = 'invite_created', 'Invitation created'
        INVITE_REVOKED = 'invite_revoked', 'Invitation revoked'
        INVITE_ACCEPTED = 'invite_accepted', 'Invitation accepted'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='audit_events')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='workspace_audit_events')
    event_type = models.CharField(max_length=20, choices=Type.choices)
    target_id = models.UUIDField(null=True, blank=True)
    changes = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at', '-id')
        indexes = [models.Index(fields=('workspace', '-created_at'), name='workspace_event_recent_idx')]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError('Workspace audit events are immutable.')
        return super().save(*args, **kwargs)

