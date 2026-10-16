from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("customer_context", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="idealcustomerprofile",
            name="legacy_segment_snapshot",
            field=models.JSONField(default=dict),
        ),
    ]
