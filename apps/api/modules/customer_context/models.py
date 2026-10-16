import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


class WorkspaceScopedRecord(models.Model):
    """Shared identity and optimistic revision for canonical profile records."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="%(class)s_records",
    )
    revision = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Product(WorkspaceScopedRecord):
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=1000, blank=True, default="")
    problem_solved = models.CharField(max_length=600, blank=True, default="")
    target_customer_legacy = models.CharField(max_length=400, blank=True, default="")

    class Meta:
        ordering = ("name", "id")
        indexes = [
            models.Index(fields=("workspace", "name"), name="customer_product_name_idx")
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(revision__gte=1), name="cust_product_revision_gte1"
            )
        ]


class Segment(WorkspaceScopedRecord):
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=1000, blank=True, default="")
    needs = models.CharField(max_length=600, blank=True, default="")
    buying_roles = models.CharField(max_length=400, blank=True, default="")
    industry = models.CharField(max_length=160, blank=True, default="")
    organization_size = models.CharField(max_length=120, blank=True, default="")
    geography = models.CharField(max_length=120, blank=True, default="")
    buying_context = models.CharField(max_length=500, blank=True, default="")

    class Meta:
        ordering = ("name", "id")
        indexes = [
            models.Index(fields=("workspace", "name"), name="customer_segment_name_idx")
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(revision__gte=1), name="cust_segment_revision_gte1"
            )
        ]


class IdealCustomerProfile(WorkspaceScopedRecord):
    name = models.CharField(max_length=120)
    segment = models.ForeignKey(
        Segment, null=True, blank=True, on_delete=models.PROTECT, related_name="icps"
    )
    persona_role = models.CharField(max_length=120, blank=True, default="")
    persona_decision_role = models.CharField(max_length=120, blank=True, default="")
    persona_goals = models.CharField(max_length=500, blank=True, default="")
    persona_pains = models.CharField(max_length=500, blank=True, default="")
    problem = models.CharField(max_length=1000, blank=True, default="")
    legacy_segment_snapshot = models.JSONField(default=dict)
    # Frozen compatibility data until STR-057 supplies canonical evidence records.
    legacy_evidence_snapshot = models.JSONField(default=list)
    legacy_assumptions_snapshot = models.JSONField(default=list)

    class Meta:
        ordering = ("name", "id")
        indexes = [
            models.Index(fields=("workspace", "name"), name="customer_icp_name_idx")
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(revision__gte=1), name="cust_icp_revision_gte1"
            )
        ]


class LegacyProfileIdentityMap(models.Model):
    """Stable mapping from a source profile ID to its typed canonical UUID."""

    class EntityType(models.TextChoices):
        PRODUCT = "product", "Product"
        SEGMENT = "segment", "Segment"
        ICP = "icp", "Ideal customer profile"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="legacy_profile_identity_maps",
    )
    source_namespace = models.CharField(max_length=80)
    entity_type = models.CharField(max_length=16, choices=EntityType.choices)
    legacy_id = models.CharField(max_length=80)
    source_position = models.PositiveSmallIntegerField(default=0)
    source_profile_revision = models.PositiveIntegerField()
    product = models.ForeignKey(
        Product,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="legacy_identity_maps",
    )
    segment = models.ForeignKey(
        Segment,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="legacy_identity_maps",
    )
    icp = models.ForeignKey(
        IdealCustomerProfile,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="legacy_identity_maps",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("entity_type", "legacy_id", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("workspace", "source_namespace", "entity_type", "legacy_id"),
                name="cust_legacy_source_id_uniq",
            ),
            models.UniqueConstraint(
                fields=("workspace", "product"),
                condition=Q(product__isnull=False),
                name="cust_legacy_product_uniq",
            ),
            models.UniqueConstraint(
                fields=("workspace", "segment"),
                condition=Q(segment__isnull=False),
                name="cust_legacy_segment_uniq",
            ),
            models.UniqueConstraint(
                fields=("workspace", "icp"),
                condition=Q(icp__isnull=False),
                name="cust_legacy_icp_uniq",
            ),
            models.CheckConstraint(
                condition=Q(entity_type__in=("product", "segment", "icp")),
                name="cust_legacy_type_valid",
            ),
            models.CheckConstraint(
                condition=(
                    ~Q(legacy_id="")
                    & ~Q(source_namespace="")
                    & Q(source_profile_revision__gte=1)
                    & Q(source_position__lt=20)
                    & (
                        Q(
                            entity_type="product",
                            product__isnull=False,
                            segment__isnull=True,
                            icp__isnull=True,
                        )
                        | Q(
                            entity_type="segment",
                            product__isnull=True,
                            segment__isnull=False,
                            icp__isnull=True,
                        )
                        | Q(
                            entity_type="icp",
                            product__isnull=True,
                            segment__isnull=True,
                            icp__isnull=False,
                        )
                    )
                ),
                name="cust_legacy_fields_valid",
            ),
        ]

    def clean(self):
        super().clean()
        target_field = (
            self.entity_type
            if self.entity_type in {"product", "segment"}
            else "icp"
            if self.entity_type == "icp"
            else None
        )
        if target_field is None or any(
            (getattr(self, f"{name}_id") is not None) != (name == target_field)
            for name in ("product", "segment", "icp")
        ):
            raise ValidationError(
                {"entity_type": "Exactly one matching canonical record is required."}
            )
        if getattr(self, f"{target_field}_id") is None:
            raise ValidationError({target_field: "The canonical record is required."})
        target = getattr(self, target_field)
        if target.workspace_id != self.workspace_id:
            raise ValidationError(
                {target_field: "The canonical record must belong to this Workspace."}
            )
        if self.source_position >= 20:
            raise ValidationError(
                {"source_position": "The source collection position is out of range."}
            )

    @property
    def canonical_id(self):
        if self.entity_type not in {"product", "segment", "icp"}:
            return None
        return getattr(self, f"{self.entity_type}_id")


class ProfileMigrationBatch(models.Model):
    """Auditable source backup and idempotency marker for one reviewed cutover."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.OneToOneField(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="customer_context_migration",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="profile_migration_batches",
    )
    idempotency_key = models.CharField(max_length=100)
    source_profile_revision = models.PositiveIntegerField()
    migrated_profile_revision = models.PositiveIntegerField()
    source_digest = models.CharField(max_length=64)
    source_backup = models.JSONField()
    plan_snapshot = models.JSONField()
    applied_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-applied_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=("workspace", "idempotency_key"),
                name="cust_migration_idempotency_uniq",
            ),
            models.CheckConstraint(
                condition=Q(source_profile_revision__gte=1)
                & Q(migrated_profile_revision__gte=1),
                name="cust_migration_revisions_gte1",
            ),
            models.CheckConstraint(
                condition=~Q(idempotency_key="") & ~Q(source_digest=""),
                name="cust_migration_identity_valid",
            ),
        ]
