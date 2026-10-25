import django.db.models.deletion
from django.db import migrations, models


def seed(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'AccountAvatar')
    titles = ['مدیر جسور', 'ایده‌پرداز', 'رهبر پرانرژی', 'همراه تیم', 'راهبردپرداز', 'مدیر آرام', 'رهبر خلاق', 'پیش‌قدم', 'ماجراجو', 'آینده‌نگر', 'نوآور', 'تحلیل‌گر', 'مذاکره‌گر', 'راه‌حل‌ساز', 'جست‌وجوگر', 'الهام‌بخش', 'سازمان‌دهنده', 'فرصت‌ساز', 'مسیرساز', 'توسعه‌گر']
    for index, title in enumerate(titles):
        Avatar.objects.get_or_create(id=f'executive-{index+1:02}', defaults={'title': title, 'sprite_index': index, 'sort_order': index})


class Migration(migrations.Migration):
    dependencies = [('accounts', '0004_google_identity_and_profile')]
    operations = [
        migrations.CreateModel(name='AccountAvatar', fields=[('id', models.SlugField(primary_key=True, serialize=False, max_length=48)), ('title', models.CharField(max_length=80)), ('category', models.CharField(max_length=16, default='original')), ('sprite_index', models.PositiveSmallIntegerField(unique=True)), ('is_active', models.BooleanField(default=True)), ('sort_order', models.PositiveSmallIntegerField(default=0))], options={'ordering': ['sort_order', 'id'], 'constraints': [models.CheckConstraint(condition=models.Q(sprite_index__gte=0, sprite_index__lte=19), name='account_avatar_sprite_bounds')]}),
        migrations.RunPython(seed, migrations.RunPython.noop),
        migrations.AddField(model_name='user', name='avatar', field=models.ForeignKey(null=True, blank=True, on_delete=django.db.models.deletion.PROTECT, related_name='users', to='accounts.accountavatar')),
    ]
