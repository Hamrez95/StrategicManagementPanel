import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [("workspaces", "0004_workspace_strategy_profile")]

    operations = [
        migrations.CreateModel(
            name="Product",
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
                ("revision", models.PositiveIntegerField(default=1)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=120)),
                (
                    "description",
                    models.CharField(blank=True, default="", max_length=1000),
                ),
                (
                    "problem_solved",
                    models.CharField(blank=True, default="", max_length=600),
                ),
                (
                    "target_customer_legacy",
                    models.CharField(blank=True, default="", max_length=400),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(class)s_records",
                        to="workspaces.workspace",
                    ),
                ),
            ],
            options={"ordering": ("name", "id")},
        ),
        migrations.AddIndex(
            model_name="product",
            index=models.Index(
                fields=["workspace", "name"], name="customer_product_name_idx"
            ),
        ),
        migrations.AddConstraint(
            model_name="product",
            constraint=models.CheckConstraint(
                condition=models.Q(("revision__gte", 1)),
                name="cust_product_revision_gte1",
            ),
        ),
        migrations.CreateModel(
            name="Segment",
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
                ("revision", models.PositiveIntegerField(default=1)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=120)),
                (
                    "description",
                    models.CharField(blank=True, default="", max_length=1000),
                ),
                ("needs", models.CharField(blank=True, default="", max_length=600)),
                (
                    "buying_roles",
                    models.CharField(blank=True, default="", max_length=400),
                ),
                ("industry", models.CharField(blank=True, default="", max_length=160)),
                (
                    "organization_size",
                    models.CharField(blank=True, default="", max_length=120),
                ),
                ("geography", models.CharField(blank=True, default="", max_length=120)),
                (
                    "buying_context",
                    models.CharField(blank=True, default="", max_length=500),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(class)s_records",
                        to="workspaces.workspace",
                    ),
                ),
            ],
            options={"ordering": ("name", "id")},
        ),
        migrations.AddIndex(
            model_name="segment",
            index=models.Index(
                fields=["workspace", "name"], name="customer_segment_name_idx"
            ),
        ),
        migrations.AddConstraint(
            model_name="segment",
            constraint=models.CheckConstraint(
                condition=models.Q(("revision__gte", 1)),
                name="cust_segment_revision_gte1",
            ),
        ),
        migrations.CreateModel(
            name="IdealCustomerProfile",
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
                ("revision", models.PositiveIntegerField(default=1)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=120)),
                (
                    "persona_role",
                    models.CharField(blank=True, default="", max_length=120),
                ),
                (
                    "persona_decision_role",
                    models.CharField(blank=True, default="", max_length=120),
                ),
                (
                    "persona_goals",
                    models.CharField(blank=True, default="", max_length=500),
                ),
                (
                    "persona_pains",
                    models.CharField(blank=True, default="", max_length=500),
                ),
                ("problem", models.CharField(blank=True, default="", max_length=1000)),
                ("legacy_evidence_snapshot", models.JSONField(default=list)),
                ("legacy_assumptions_snapshot", models.JSONField(default=list)),
                (
                    "segment",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="icps",
                        to="customer_context.segment",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(class)s_records",
                        to="workspaces.workspace",
                    ),
                ),
            ],
            options={"ordering": ("name", "id")},
        ),
        migrations.AddIndex(
            model_name="idealcustomerprofile",
            index=models.Index(
                fields=["workspace", "name"], name="customer_icp_name_idx"
            ),
        ),
        migrations.AddConstraint(
            model_name="idealcustomerprofile",
            constraint=models.CheckConstraint(
                condition=models.Q(("revision__gte", 1)), name="cust_icp_revision_gte1"
            ),
        ),
        migrations.CreateModel(
            name="LegacyProfileIdentityMap",
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
                ("source_namespace", models.CharField(max_length=80)),
                (
                    "entity_type",
                    models.CharField(
                        choices=[
                            ("product", "Product"),
                            ("segment", "Segment"),
                            ("icp", "Ideal customer profile"),
                        ],
                        max_length=16,
                    ),
                ),
                ("legacy_id", models.CharField(max_length=80)),
                ("source_profile_revision", models.PositiveIntegerField()),
                (
                    "icp",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="legacy_identity_maps",
                        to="customer_context.idealcustomerprofile",
                    ),
                ),
                (
                    "product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="legacy_identity_maps",
                        to="customer_context.product",
                    ),
                ),
                (
                    "segment",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="legacy_identity_maps",
                        to="customer_context.segment",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="legacy_profile_identity_maps",
                        to="workspaces.workspace",
                    ),
                ),
            ],
            options={"ordering": ("entity_type", "legacy_id", "id")},
        ),
        migrations.AddConstraint(
            model_name="legacyprofileidentitymap",
            constraint=models.UniqueConstraint(
                fields=("workspace", "source_namespace", "entity_type", "legacy_id"),
                name="cust_legacy_source_id_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="legacyprofileidentitymap",
            constraint=models.UniqueConstraint(
                condition=models.Q(("product__isnull", False)),
                fields=("workspace", "product"),
                name="cust_legacy_product_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="legacyprofileidentitymap",
            constraint=models.UniqueConstraint(
                condition=models.Q(("segment__isnull", False)),
                fields=("workspace", "segment"),
                name="cust_legacy_segment_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="legacyprofileidentitymap",
            constraint=models.UniqueConstraint(
                condition=models.Q(("icp__isnull", False)),
                fields=("workspace", "icp"),
                name="cust_legacy_icp_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="legacyprofileidentitymap",
            constraint=models.CheckConstraint(
                condition=models.Q(("entity_type__in", ("product", "segment", "icp"))),
                name="cust_legacy_type_valid",
            ),
        ),
        migrations.AddConstraint(
            model_name="legacyprofileidentitymap",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    models.Q(("legacy_id", ""), _negated=True),
                    models.Q(("source_namespace", ""), _negated=True),
                    ("source_profile_revision__gte", 1),
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
