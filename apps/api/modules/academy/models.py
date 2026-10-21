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
