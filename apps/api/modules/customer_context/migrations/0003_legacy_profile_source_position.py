from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("customer_context", "0002_icp_legacy_segment_snapshot")]

    operations = [
        migrations.AddField(
            model_name="legacyprofileidentitymap",
            name="source_position",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.RemoveConstraint(
            model_name="legacyprofileidentitymap",
            name="cust_legacy_fields_valid",
        ),
        migrations.AddConstraint(
            model_name="legacyprofileidentitymap",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    models.Q(("legacy_id", ""), _negated=True),
                    models.Q(("source_namespace", ""), _negated=True),
                    ("source_profile_revision__gte", 1),
                    ("source_position__lt", 20),
                    models.Q(
                        models.Q(
                            ("entity_type", "product"),
                            ("icp__isnull", True),
                            ("product__isnull", False),
                            ("segment__isnull", True),
                        ),
                        models.Q(
                            ("entity_type", "segment"),
                            ("icp__isnull", True),
                            ("product__isnull", True),
                            ("segment__isnull", False),
                        ),
                        models.Q(
                            ("entity_type", "icp"),
                            ("icp__isnull", False),
                            ("product__isnull", True),
                            ("segment__isnull", True),
                        ),
                        _connector="OR",
                    ),
                ),
                name="cust_legacy_fields_valid",
            ),
        ),
    ]
