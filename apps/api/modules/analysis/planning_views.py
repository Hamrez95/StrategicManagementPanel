"""Strict typed planning APIs. Actor, Workspace and revision are server boundaries."""

import json
from typing import ClassVar
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import Http404
from django.views.decorators.http import require_http_methods
from rest_framework import serializers

from modules.workspaces.models import Workspace
from modules.workspaces.services import WorkspaceActionError, workspace_role

from .models import (
    CompetitorProfile,
    EnvironmentSignal,
    JourneyStep,
    PlanningRevision,
    ResourceAssessment,
    RiskRecord,
    ScenarioPlan,
)
from .views import _run

TOOLS = {
    "environment": EnvironmentSignal,
    "industry": CompetitorProfile,
    "internal": ResourceAssessment,
    "scenarios": ScenarioPlan,
    "risks": RiskRecord,
    "journey": JourneyStep,
}
RESERVED = {"id", "workspace", "revision", "created_by", "created_at", "updated_at"}


def fields_for(model):
    return [f.name for f in model._meta.fields if f.name not in RESERVED]


def record_dict(record):
    result = {key: getattr(record, key) for key in fields_for(type(record))}
    return {
        **result,
        "id": str(record.pk),
        "workspace_id": str(record.workspace_id),
        "revision": record.revision,
        "updated_at": record.updated_at,
    }


def serializer_for(model):
    class RecordSerializer(serializers.ModelSerializer):
        class Meta:
            fields = fields_for(model)
            validators: ClassVar[list] = []  # Checked under the Workspace row lock.

    RecordSerializer.Meta.model = model
    return RecordSerializer


@transaction.atomic
def write_record(actor, workspace, tool, body, record_id=None):
    workspace = Workspace.objects.select_for_update().get(pk=workspace.pk)
    if workspace_role(actor, workspace) not in {"owner", "editor"}:
        raise WorkspaceActionError(
            403,
            "workspace_permission_denied",
            "برای تغییر این اطلاعات دسترسی لازم رو نداری.",
        )
    if workspace.archived_at is not None:
        raise WorkspaceActionError(
            409, "workspace_archived", "فضای بایگانی‌شده فقط قابل مشاهده است."
        )
    model = TOOLS[tool]
    allowed = set(fields_for(model)) | ({"revision"} if record_id else {"id"})
    if not isinstance(body, dict) or set(body) != allowed:
        raise ValidationError(
            {"body": "همهٔ فیلدهای مشخص‌شده رو بفرست؛ فیلد اضافه پذیرفته نمی‌شه."}
        )
    serializer = serializer_for(model)(
        data={key: body[key] for key in fields_for(model)}
    )
    if not serializer.is_valid():
        raise ValidationError(
            {key: [str(v) for v in errors] for key, errors in serializer.errors.items()}
        )
    if record_id:
        record = (
            model.objects.select_for_update()
            .filter(workspace=workspace, pk=record_id)
            .first()
        )
        if record is None:
            raise Http404
        if type(body["revision"]) is not int or body["revision"] != record.revision:
            raise WorkspaceActionError(
                409,
                "revision_conflict",
                "نسخهٔ تازه‌ای ذخیره شده؛ نوشته‌ات حفظ شده. آخرین نسخه رو ببین و دوباره تصمیم بگیر.",
            )
        for key, value in serializer.validated_data.items():
            setattr(record, key, value)
        record.revision += 1
    else:
        try:
            identifier = UUID(body["id"])
        except (ValueError, TypeError, AttributeError):
            raise ValidationError({"id": "شناسهٔ درخواست معتبر نیست."}) from None
        existing = model.objects.filter(pk=identifier).first()
        if existing:
            if (
                existing.workspace_id == workspace.pk
                and existing.created_by_id == actor.pk
            ):
                original = PlanningRevision.objects.filter(
                    workspace=workspace, tool=tool, record_id=identifier, revision=1
                ).first()
                normalized = json.loads(
                    json.dumps(serializer.validated_data, default=str)
                )
                if original and all(
                    original.snapshot.get(k) == v for k, v in normalized.items()
                ):
                    return record_dict(existing)
            raise WorkspaceActionError(
                409,
                "request_conflict",
                "این شناسه قبلاً برای اطلاعات دیگری استفاده شده.",
            )
        if model.objects.filter(workspace=workspace).count() >= 200:
            raise ValidationError({"body": "سقف این فهرست ۲۰۰ رکورد است."})
        record = model(
            id=identifier,
            workspace=workspace,
            created_by=actor,
            **serializer.validated_data,
        )
    record.full_clean()
    record.save()
    snapshot = json.loads(json.dumps(record_dict(record), default=str))
    PlanningRevision.objects.create(
        workspace=workspace,
        tool=tool,
        record_id=record.pk,
        revision=record.revision,
        snapshot=snapshot,
        recorded_by=actor,
    )
    return record_dict(record)


@require_http_methods(["GET", "POST", "PATCH"])
def planning_records(request, workspace_id, tool, record_id=None):
    def operation(workspace):
        if tool not in TOOLS or (request.method == "PATCH") != (record_id is not None):
            raise Http404
        if request.method == "GET":
            try:
                offset = int(request.GET.get("offset", "0"))
                if offset < 0 or offset > 100000:
                    raise ValueError
            except ValueError:
                raise ValidationError({"offset": "صفحه معتبر نیست."}) from None
            rows = list(
                TOOLS[tool].objects.filter(workspace=workspace)[offset : offset + 51]
            )
            return {
                "workspace_id": str(workspace.pk),
                "tool": tool,
                "items": [record_dict(r) for r in rows[:50]],
                "next_offset": offset + 50 if len(rows) > 50 else None,
            }
        try:
            body = json.loads(request.body)
        except (ValueError, UnicodeDecodeError):
            raise ValidationError({"body": "درخواست قابل خواندن نیست."}) from None
        return write_record(request.user, workspace, tool, body, record_id)

    return _run(
        request,
        workspace_id,
        operation,
        status=201 if request.method == "POST" else 200,
    )
