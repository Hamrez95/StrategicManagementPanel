from django.conf import settings
from django.db import models

class LearningProgress(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    unit_id = models.CharField(max_length=80)
    content_revision = models.CharField(max_length=64)
    note = models.TextField(blank=True, default='')
    position = models.PositiveIntegerField(default=0)
    viewed_cards = models.JSONField(default=list)
    responses = models.JSONField(default=dict)
    activity_response = models.JSONField(default=dict)
    bookmarked = models.BooleanField(default=False)
    completed = models.BooleanField(default=False)
    revision = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'unit_id', 'content_revision'], name='academy_user_unit_revision')]


class LearningFeedback(models.Model):
    submission_id = models.UUIDField(unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    unit_id = models.CharField(max_length=80)
    unit_title = models.CharField(max_length=300)
    content_revision = models.CharField(max_length=64)
    target_kind = models.CharField(max_length=16)
    target_id = models.CharField(max_length=160)
    target_title = models.CharField(max_length=300)
    target_text = models.TextField(blank=True)
    content_path = models.CharField(max_length=512)
    category = models.CharField(max_length=16, choices=[('correction', 'اصلاح محتوا'), ('question', 'ابهام'), ('suggestion', 'پیشنهاد')])
    message = models.TextField()
    status = models.CharField(max_length=16, default='new', choices=[('new', 'تازه'), ('reviewed', 'بررسی‌شده'), ('resolved', 'رسیدگی‌شده')])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [models.Index(fields=['status', '-created_at'], name='academy_feedback_inbox')]
