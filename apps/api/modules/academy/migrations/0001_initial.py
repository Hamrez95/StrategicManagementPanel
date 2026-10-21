from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [migrations.CreateModel(name='LearningProgress', fields=[
        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
        ('unit_id', models.CharField(max_length=80)), ('content_revision', models.CharField(max_length=64)),
        ('note', models.TextField(blank=True, default='')), ('position', models.PositiveIntegerField(default=0)),
        ('viewed_cards', models.JSONField(default=list)), ('responses', models.JSONField(default=dict)),
        ('activity_response', models.JSONField(default=dict)), ('bookmarked', models.BooleanField(default=False)),
        ('completed', models.BooleanField(default=False)), ('revision', models.PositiveIntegerField(default=0)),
        ('updated_at', models.DateTimeField(auto_now=True)),
        ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
    ], options={'constraints': [models.UniqueConstraint(fields=('user', 'unit_id', 'content_revision'), name='academy_user_unit_revision')]})]
