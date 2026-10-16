import copy
import re
from uuid import UUID

from django.db import transaction
from django.http import Http404
from django.utils import timezone

from modules.execution.models import Goal
from modules.workspaces.models import WorkspaceProfile, WorkspaceProfileRevision
from modules.workspaces.services import WorkspaceActionError, workspace_role

from .context import legacy_canonical_id
from .models import (
    IdealCustomerProfile,
    LegacyProfileIdentityMap,
    Product,
    ProfileMigrationBatch,
    Segment,
)
from .profile_import import (
    PROFILE_SOURCE_NAMESPACE,
    CompatibilityProjectionError,
    build_profile_import_plan,
    project_legacy_profile,
)

IDEMPOTENCY_PATTERN = re.compile(r"[A-Za-z0-9._:-]{8,100}\Z")
PROFILE_HISTORY_LIMIT = 50
ENTITY_MODELS = {
    "product": Product,
    "segment": Segment,
    "icp": IdealCustomerProfile,
}
MAPPING_FIELDS = {"product": "product", "segment": "segment", "icp": "icp"}


def _profile_snapshot(profile):
    return {
        "workspace_id": str(profile.workspace_id),
        "company_name": profile.company_name,
        "industry": profile.industry,
        "stage": profile.stage,
        "mission": profile.mission,
        "problem_statement": profile.problem_statement,
        "products": profile.products,
        "customer_segments": profile.customer_segments,
        "goals": profile.goals,
        "icps": profile.icps,
        "revision": profile.revision,
        "onboarding_completed_at": (
            profile.onboarding_completed_at.isoformat()
            if profile.onboarding_completed_at
            else None
        ),
    }


def _conflict(status, code, message, *, fields=None):
    raise WorkspaceActionError(status, code, message, fields=fields or {})


def _batch_result(batch, *, already_applied=False):
    return {
        "id": str(batch.pk),
        "workspace_id": str(batch.workspace_id),
        "source_profile_revision": batch.source_profile_revision,
        "migrated_profile_revision": batch.migrated_profile_revision,
        "source_digest": batch.source_digest,
        "idempotency_key": batch.idempotency_key,
        "applied_at": batch.applied_at.isoformat(),
        "counts": batch.plan_snapshot["counts"],
        "already_applied": already_applied,
    }


def _reviewable_conflicts(plan):
    if plan["suppressed_conflict_count"]:
        _conflict(
            409,
            "profile_import_conflicts_truncated",
            "گزارش تعارض کامل نیست؛ ابتدا داده‌های قدیمی را اصلاح و دوباره بررسی کنید.",
            fields={"conflicts": ["تعداد تعارض‌ها از حد گزارش بیشتر است."]},
        )
    reviewable = set()
    unsafe = []
    for conflict in plan["conflicts"]:
        path = conflict.get("path", "")
        if path == "goals" or path.startswith("goals."):
            reviewable.add(conflict["code"])
        elif conflict.get("code") == "icp_segment_binding_requires_review":
            reviewable.add(conflict["code"])
        else:
            unsafe.append(conflict)
    if unsafe:
        _conflict(
            409,
            "profile_import_conflicts_unresolved",
            "پروفایل تعارض‌هایی دارد که پیش از انتقال باید اصلاح شوند.",
            fields={"conflicts": unsafe[:32]},
        )
    return reviewable


def _create_canonical_records(workspace, plan):
    records = {key: [] for key in ENTITY_MODELS}
    for item in plan["planned_records"]:
        entity_type = item["entity_type"]
        model = ENTITY_MODELS[entity_type]
        canonical_id = UUID(item["canonical_id"])
        values = dict(item["attributes"])
        if entity_type == "icp":
            values.pop("segment_id", None)
        record = model(id=canonical_id, workspace=workspace, **values)
        record.save(force_insert=True)
        mapping = LegacyProfileIdentityMap(
            workspace=workspace,
            source_namespace=PROFILE_SOURCE_NAMESPACE,
            entity_type=entity_type,
            legacy_id=item["legacy_id"],
            source_position=item["source_position"],
            source_profile_revision=plan["source_profile_revision"],
            **{MAPPING_FIELDS[entity_type]: record},
        )
        mapping.clean()
        mapping.save(force_insert=True)
        records[entity_type].append(record)
    return records


def _project_current_profile(profile):
    workspace_id = profile.workspace_id
    try:
        return project_legacy_profile(
            _profile_snapshot(profile),
            Product.objects.filter(workspace_id=workspace_id),
            Segment.objects.filter(workspace_id=workspace_id),
            IdealCustomerProfile.objects.filter(workspace_id=workspace_id),
            LegacyProfileIdentityMap.objects.filter(
                workspace_id=workspace_id,
                source_namespace=PROFILE_SOURCE_NAMESPACE,
            ).select_related("product", "segment", "icp"),
        )
    except CompatibilityProjectionError as error:
        _conflict(
            409,
            "profile_projection_invalid",
            "نگاشت سازگاری پروفایل کامل یا متعلق به همین فضای کار نیست.",
            fields={"profile": [str(error)]},
        )


def _apply_canonical_collection(workspace, entity_type, rows, *, source_revision):
    model = ENTITY_MODELS[entity_type]
    target_field = MAPPING_FIELDS[entity_type]
    desired_ids = set()
    for position, row in enumerate(rows):
        legacy_id = row["id"]
        canonical_id = legacy_canonical_id(
            workspace.pk, PROFILE_SOURCE_NAMESPACE, entity_type, legacy_id
        )
        desired_ids.add(canonical_id)
        if entity_type == "product":
            values = {
                "name": row["name"],
                "description": row["description"],
                "problem_solved": row["problem_solved"],
                "target_customer_legacy": row["target_customer"],
            }
        elif entity_type == "segment":
            values = {key: value for key, value in row.items() if key != "id"}
        else:
            values = {
                "name": row["name"],
                "persona_role": row["persona"]["role"],
                "persona_decision_role": row["persona"]["decision_role"],
                "persona_goals": row["persona"]["goals"],
                "persona_pains": row["persona"]["pains"],
                "problem": row["problem"],
                "legacy_segment_snapshot": row["segment"],
                "legacy_evidence_snapshot": row["evidence"],
                "legacy_assumptions_snapshot": row["assumptions"],
            }
        record = model.objects.filter(pk=canonical_id).first()
        if record is not None and record.workspace_id != workspace.pk:
            _conflict(
                409,
                "canonical_id_workspace_conflict",
                "شناسه پایدار به فضای کار دیگری تعلق دارد.",
                fields={"id": [legacy_id]},
            )
        if record is None:
            record = model(id=canonical_id, workspace=workspace, **values)
            record.save(force_insert=True)
        else:
            changed_fields = [
                name for name, value in values.items() if getattr(record, name) != value
            ]
            if changed_fields:
                for name in changed_fields:
                    setattr(record, name, values[name])
                record.revision += 1
                record.updated_at = timezone.now()
                record.save(update_fields=[*changed_fields, "revision", "updated_at"])

        conflicting_identity = LegacyProfileIdentityMap.objects.filter(
            workspace=workspace,
            source_namespace=PROFILE_SOURCE_NAMESPACE,
            **{target_field: record},
        ).exclude(legacy_id=legacy_id)
        if conflicting_identity.exists():
            _conflict(
                409,
                "legacy_identity_conflict",
                "شناسهٔ قدیمی رکورد canonical قابل تغییر نیست.",
                fields={"id": [legacy_id]},
            )

        mapping, created = LegacyProfileIdentityMap.objects.get_or_create(
            workspace=workspace,
            source_namespace=PROFILE_SOURCE_NAMESPACE,
            entity_type=entity_type,
            legacy_id=legacy_id,
            defaults={
                "source_position": position,
                "source_profile_revision": source_revision,
                target_field: record,
            },
        )
        if not created:
            if mapping.canonical_id != record.pk:
                _conflict(
                    409,
                    "legacy_identity_conflict",
                    "شناسه قدیمی از قبل به رکورد دیگری متصل شده است.",
                    fields={"id": [legacy_id]},
                )
            changed_mapping_fields = []
            if mapping.source_position != position:
                mapping.source_position = position
                changed_mapping_fields.append("source_position")
            if mapping.source_profile_revision != source_revision:
                mapping.source_profile_revision = source_revision
                changed_mapping_fields.append("source_profile_revision")
            if changed_mapping_fields:
                mapping.save(update_fields=changed_mapping_fields)

    removed = model.objects.filter(workspace=workspace).exclude(pk__in=desired_ids)
    if entity_type == "segment" and removed.filter(icps__isnull=False).exists():
        _conflict(
            409,
            "segment_in_use",
            "بخشی که به یک ICP متصل است قابل حذف نیست.",
            fields={"customer_segments": ["ابتدا اتصال ICP را بازبینی کنید."]},
        )
    removed.delete()


def sync_profile_entities(
    profile,
    *,
    products=None,
    customer_segments=None,
    icps=None,
    source_revision,
):
    """Single transactional write owner for canonical entities and legacy projection."""

    workspace = profile.workspace
    values = {
        "icp": icps,
        "segment": customer_segments,
        "product": products,
    }
    for entity_type, rows in values.items():
        if rows is not None:
            _apply_canonical_collection(
                workspace, entity_type, rows, source_revision=source_revision
            )
    return _project_current_profile(profile)


@transaction.atomic
def apply_profile_import(
    actor,
    workspace,
    *,
    expected_revision,
    expected_source_digest,
    idempotency_key,
    reviewed_conflict_codes=(),
):
    """Apply one reviewed profile import under the Workspace and profile locks."""

    if (
        isinstance(expected_revision, bool)
        or not isinstance(expected_revision, int)
        or expected_revision < 1
    ):
        _conflict(400, "invalid_revision", "نسخه پروفایل معتبر نیست.")
    if not isinstance(idempotency_key, str) or not IDEMPOTENCY_PATTERN.fullmatch(
        idempotency_key
    ):
        _conflict(400, "invalid_idempotency_key", "کلید یکتای انتقال معتبر نیست.")
    if (
        not isinstance(expected_source_digest, str)
        or not re.fullmatch(r"[a-f0-9]{64}", expected_source_digest)
    ):
        _conflict(400, "invalid_source_digest", "اثر انگشت پروفایل معتبر نیست.")
    if not isinstance(reviewed_conflict_codes, (list, tuple, set)) or not all(
        isinstance(code, str) for code in reviewed_conflict_codes
    ):
        _conflict(400, "invalid_conflict_review", "فهرست بازبینی تعارض‌ها معتبر نیست.")
    reviewed = set(reviewed_conflict_codes)

    locked_workspace = (
        type(workspace)
        .objects.select_for_update()
        .filter(pk=workspace.pk)
        .first()
    )
    if locked_workspace is None:
        raise Http404("Workspace is not available.")
    role = workspace_role(actor, locked_workspace)
    if role is None:
        raise Http404("Workspace is not available.")
    if role != "owner":
        _conflict(
            403,
            "workspace_permission_denied",
            "اجرای انتقال سراسری پروفایل فقط در اختیار مالک فضای کار است.",
        )
    if locked_workspace.archived_at is not None:
        _conflict(409, "workspace_archived", "فضای بایگانی‌شده قابل انتقال نیست.")

    profile, _ = WorkspaceProfile.objects.select_for_update().get_or_create(
        workspace=locked_workspace
    )
    existing = ProfileMigrationBatch.objects.filter(workspace=locked_workspace).first()
    if existing is not None:
        if (
            existing.idempotency_key == idempotency_key
            and existing.source_profile_revision == expected_revision
            and existing.source_digest == expected_source_digest
        ):
            return _batch_result(existing, already_applied=True)
        _conflict(
            409,
            "profile_migration_already_applied",
            "این فضای کار قبلاً انتقال canonical دریافت کرده است.",
            fields={"source_digest": [existing.source_digest]},
        )
    if profile.revision != expected_revision:
        _conflict(
            409,
            "revision_conflict",
            "پروفایل پس از بازبینی تغییر کرده است؛ dry-run تازه بسازید.",
            fields={"revision": ["نسخه فعلی با نسخه بازبینی‌شده فرق دارد."]},
        )
    if any(
        model.objects.filter(workspace=locked_workspace).exists()
        for model in ENTITY_MODELS.values()
    ):
        _conflict(
            409,
            "canonical_profile_records_exist",
            "رکوردهای canonical از قبل موجودند و انتقال نمی‌تواند آن‌ها را بازنویسی کند.",
        )

    source = _profile_snapshot(profile)
    execution_goals = list(
        Goal.objects.filter(workspace=locked_workspace).values(
            "id", "title", "workspace_id"
        )
    )
    plan = build_profile_import_plan(source, execution_goals)
    if plan["source_digest"] != expected_source_digest:
        _conflict(
            409,
            "source_digest_conflict",
            "پروفایل با dry-run بازبینی‌شده یکسان نیست.",
            fields={"source_digest": [plan["source_digest"]]},
        )
    reviewable = _reviewable_conflicts(plan)
    if reviewed != reviewable:
        _conflict(
            409,
            "conflict_review_mismatch",
            "کدهای تعارض تأییدشده باید دقیقاً با dry-run بازبینی‌شده مطابقت داشته باشند.",
            fields={"reviewed_conflict_codes": [sorted(reviewable)]},
        )

    records = _create_canonical_records(locked_workspace, plan)
    projection = project_legacy_profile(
        source,
        records["product"],
        records["segment"],
        records["icp"],
        list(
            LegacyProfileIdentityMap.objects.filter(
                workspace=locked_workspace,
                source_namespace=PROFILE_SOURCE_NAMESPACE,
            ).select_related("product", "segment", "icp")
        ),
    )
    profile.products = projection["products"]
    profile.customer_segments = projection["customer_segments"]
    profile.icps = projection["icps"]
    profile.revision += 1
    profile.updated_at = timezone.now()
    profile.save(
        update_fields=[
            "products",
            "customer_segments",
            "icps",
            "revision",
            "updated_at",
        ]
    )
    WorkspaceProfileRevision.objects.create(
        profile=profile,
        revision=profile.revision,
        snapshot=_profile_snapshot(profile),
        changed_by=actor,
    )
    oldest_revision_to_keep = profile.revision - PROFILE_HISTORY_LIMIT + 1
    if oldest_revision_to_keep > 1:
        WorkspaceProfileRevision.objects.filter(
            profile=profile,
            revision__lt=oldest_revision_to_keep,
        ).delete()
    plan_snapshot = copy.deepcopy(plan)
    plan_snapshot.pop("source_backup", None)
    batch = ProfileMigrationBatch.objects.create(
        workspace=locked_workspace,
        created_by=actor,
        idempotency_key=idempotency_key,
        source_profile_revision=expected_revision,
        migrated_profile_revision=profile.revision,
        source_digest=plan["source_digest"],
        source_backup=copy.deepcopy(source),
        plan_snapshot=plan_snapshot,
    )
    return _batch_result(batch)
