import uuid
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required.')
        user = self.model(email=self.normalize_email(email).lower(), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('email_verified_at', timezone.now())
        if not extra_fields['is_staff'] or not extra_fields['is_superuser']:
            raise ValueError('Superuser flags must be true.')
        return self.create_user(email, password, **extra_fields)

class AccountAvatar(models.Model):
    id = models.SlugField(primary_key=True, max_length=48)
    title = models.CharField(max_length=80)
    character_name = models.CharField(max_length=80, blank=True, default='')
    leadership_note = models.CharField(max_length=400, blank=True, default='')
    category = models.CharField(max_length=16, default='original')
    sprite_index = models.PositiveSmallIntegerField()
    sprite_sheet = models.CharField(max_length=32, default='executives-v1')
    source_url = models.URLField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'id']
        constraints = [models.CheckConstraint(condition=models.Q(sprite_index__gte=0, sprite_index__lte=19), name='account_avatar_sprite_bounds'), models.UniqueConstraint(fields=['sprite_sheet', 'sprite_index'], name='account_avatar_sheet_position')]

    def __str__(self):
        return self.title


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = None
    email = models.EmailField(unique=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    email_verification_nonce = models.UUIDField(default=uuid.uuid4, editable=False)
    display_name = models.CharField(max_length=80, blank=True, default='')
    role_title = models.CharField(max_length=80, blank=True, default='')
    avatar = models.ForeignKey(AccountAvatar, null=True, blank=True, on_delete=models.PROTECT, related_name='users')
    phone_number = models.CharField(max_length=16, blank=True, default='')
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    profile_completed_at = models.DateTimeField(null=True, blank=True)
    requires_profile_completion = models.BooleanField(default=False)
    marketing_consent_at = models.DateTimeField(null=True, blank=True)
    pending_email = models.EmailField(blank=True, default='')
    email_change_nonce = models.UUIDField(default=uuid.uuid4, editable=False)
    objects = UserManager()
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    class Meta:
        constraints = [models.UniqueConstraint(Lower('email'), name='user_email_case_insensitive')]
        permissions = [
            ('operator_view_accounts', 'Operator: read account summaries'),
            ('operator_view_workspaces', 'Operator: read Workspace summaries'),
            ('operator_view_plans', 'Operator: read management plans'),
            ('operator_view_subscriptions', 'Operator: read management subscriptions'),
            ('operator_view_access', 'Operator: read effective management access'),
            ('operator_view_audit', 'Operator: read redacted audit history'),
            ('operator_view_academy', 'Operator: read Academy course inventory'),
            ('operator_view_academy_plans', 'Operator: read Academy plans'),
            ('operator_view_academy_subscriptions', 'Operator: read Academy subscriptions'),
            ('operator_view_academy_orders', 'Operator: read Academy orders'),
            ('operator_view_academy_samples', 'Operator: read Academy free samples'),
            ('operator_view_feedback', 'Operator: read learner feedback'),
            ('operator_triage_feedback', 'Operator: triage learner feedback'),
            ('operator_view_identity', 'Operator: read customer contact identity'),
            ('operator_manage_accounts', 'Operator: activate or deactivate customer accounts'),
        ]


class AuthRateLimit(models.Model):
    """Shared fixed-window counters; bucket keys contain hashes, never raw identifiers."""

    bucket_hash = models.CharField(max_length=64, primary_key=True)
    window_started_at = models.DateTimeField()
    attempts = models.PositiveIntegerField(default=0)


class GoogleIdentity(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='google_identity')
    subject = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)


class GoogleLoginChallenge(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nonce_hash = models.CharField(max_length=64)
    binding_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField(db_index=True)
    used_at = models.DateTimeField(null=True, blank=True)


class AccountPreferences(models.Model):
    THEME_CHOICES = [('system', 'System'), ('light', 'Light'), ('dark', 'Dark')]
    LANGUAGE_CHOICES = [('fa', 'Persian'), ('en', 'English')]
    MOTION_CHOICES = [('auto', 'System'), ('reduced', 'Reduced')]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='account_preferences')
    theme = models.CharField(max_length=8, choices=THEME_CHOICES, default='system')
    language = models.CharField(max_length=2, choices=LANGUAGE_CHOICES, default='fa')
    motion = models.CharField(max_length=8, choices=MOTION_CHOICES, default='auto')
    show_tutorial = models.BooleanField(default=True)
    device_synced_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
