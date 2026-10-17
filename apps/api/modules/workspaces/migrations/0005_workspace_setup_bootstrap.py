import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("workspaces", "0004_workspace_strategy_profile"),
    ]

    operations = [
        migrations.CreateModel(
            name="WorkspaceSetup",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("schema_version", models.PositiveSmallIntegerField(default=1)),
                (
                    "business_kind",
                    models.CharField(
                        choices=[
                            ("startup", "Startup"),
                            ("business", "Business"),
                            ("organization", "Organization"),
                        ],
                        max_length=16,
                    ),
                ),
                (
                    "reported_stage",
                    models.CharField(
                        choices=[
                            ("idea", "Idea"),
                            ("building", "Building"),
                            ("operating", "Operating"),
                            ("unknown", "Unknown"),
                        ],
                        default="unknown",
                        max_length=16,
                    ),
                ),
                (
                    "setup_objective",
                    models.CharField(
                        choices=[
                            ("customers", "Customers"),
                            ("growth", "Growth"),
                            ("strategy", "Strategy"),
                            ("execution", "Execution"),
                        ],
                        max_length=16,
                    ),
                ),
                ("follow_up_question_id", models.CharField(max_length=48)),
                ("follow_up_choice_id", models.CharField(max_length=32)),
                ("presentation_color", models.CharField(default="blue", max_length=16)),
                ("revision", models.PositiveIntegerField(default=1)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "workspace",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="setup",
                        to="workspaces.workspace",
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="workspacesetup",
            constraint=models.CheckConstraint(
                condition=models.Q(("schema_version__gte", 1)),
                name="workspace_setup_schema_gte_1",
            ),
        ),
        migrations.AddConstraint(
            model_name="workspacesetup",
            constraint=models.CheckConstraint(
                condition=models.Q(("revision__gte", 1)),
                name="workspace_setup_revision_gte_1",
            ),
        ),
        migrations.CreateModel(
            name="WorkspaceBootstrapRequest",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("key", models.CharField(max_length=100)),
                ("payload_digest", models.CharField(max_length=64)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "owner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="workspace_bootstrap_requests",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="bootstrap_requests",
                        to="workspaces.workspace",
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="workspacebootstraprequest",
            constraint=models.UniqueConstraint(
                fields=("owner", "key"), name="workspace_bootstrap_owner_key_uniq"
            ),
        ),
    ]
