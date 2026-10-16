import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("customer_context", "0003_legacy_profile_source_position"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProfileMigrationBatch",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("idempotency_key", models.CharField(max_length=100)),
                ("source_profile_revision", models.PositiveIntegerField()),
                ("migrated_profile_revision", models.PositiveIntegerField()),
                ("source_digest", models.CharField(max_length=64)),
                ("source_backup", models.JSONField()),
                ("plan_snapshot", models.JSONField()),
                ("applied_at", models.DateTimeField(auto_now_add=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="profile_migration_batches",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "workspace",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="customer_context_migration",
                        to="workspaces.workspace",
                    ),
                ),
            ],
            options={"ordering": ("-applied_at", "id")},
        ),
        migrations.AddConstraint(
            model_name="profilemigrationbatch",
            constraint=models.UniqueConstraint(
                fields=("workspace", "idempotency_key"),
                name="cust_migration_idempotency_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="profilemigrationbatch",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("source_profile_revision__gte", 1),
                    ("migrated_profile_revision__gte", 1),
                ),
                name="cust_migration_revisions_gte1",
            ),
        ),
        migrations.AddConstraint(
            model_name="profilemigrationbatch",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    models.Q(("idempotency_key", ""), _negated=True),
                    models.Q(("source_digest", ""), _negated=True),
                ),
                name="cust_migration_identity_valid",
            ),
        ),
    ]
