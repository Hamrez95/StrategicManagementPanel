from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('academy', '0004_subscription_pricing_and_coupons')]
    operations = [migrations.AlterField(model_name='academycoupon', name='plans', field=models.ManyToManyField(blank=True, help_text='خالی یعنی تمام اشتراک‌های ویژه.', to='academy.academyplan'))]
