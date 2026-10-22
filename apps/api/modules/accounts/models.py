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

class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = None
    email = models.EmailField(unique=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    email_verification_nonce = models.UUIDField(default=uuid.uuid4, editable=False)
    display_name = models.CharField(max_length=80, blank=True, default='')
    role_title = models.CharField(max_length=80, blank=True, default='')
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
