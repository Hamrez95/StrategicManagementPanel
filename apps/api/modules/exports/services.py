import csv
import hashlib
import io
import json
import re
import tempfile
import unicodedata
import uuid
import zipfile

from django.core.files import File
from django.core.files.storage import default_storage
from django.db import transaction
from django.http import Http404
from django.utils import timezone

from modules.analysis.models import Analysis
from modules.documents.models import DocumentAttachment, DocumentEvent, DocumentRecord
from modules.documents.catalog import document_catalog
from modules.execution.models import Action, Decision, ExecutionEvent, Goal
from modules.strategy.models import StrategyFactor, StrategyOption
from modules.workspaces.models import Workspace, WorkspaceProfile, WorkspaceProfileRevision
from modules.workspaces.services import workspace_role
from modules.workspaces.entitlements import require_workspace_feature
from .schema_v2 import collect_v2, V2_EXTRA_SCOPE, PROFESSIONAL_METHOD
from .verification import verify_report

from .models import ExportSnapshot

SCHEMA_NAME = 'stratino-workspace-v1'
SCHEMA_VERSION = 1
METHOD_VERSION = 'stratino-report-v1'
EXPORT_SCOPE = [
    'workspace',
    'workspace_profile',
    'profile_history',
    'analyses',
    'strategy_factors',
    'strategy_options',
    'decisions',
    'goals',
    'actions',
    'execution_history',
    'documents',
    'document_templates',
    'document_history',
    'ready_attachments',
]
IDEMPOTENCY_PATTERN = re.compile(r'^[A-Za-z0-9._:-]{1,100}$')


class ExportValidationError(Exception):
    def __init__(self, message, *, code='invalid_export'):
        super().__init__(message)
        self.code = code


def validate_idempotency_key(value):
    if not isinstance(value, str) or not IDEMPOTENCY_PATTERN.fullmatch(value.strip()):
        raise ExportValidationError(
            'برای ساخت نسخهٔ گزارش، کلید یکتای معتبر لازم است.',
            code='invalid_idempotency_key',
        )
    return value.strip()


def _time(value):
    return value.isoformat() if value else None


def _model_values(record, fields):
    payload = {}
    for field in fields:
        value = getattr(record, field)
        if isinstance(value, uuid.UUID):
            value = str(value)
        elif hasattr(value, 'isoformat'):
            value = value.isoformat()
        payload[field] = value
    return payload


def _profile_payload(profile):
    if profile is None:
        return None
    return {
        'company_name': profile.company_name,
        'industry': profile.industry,
        'stage': profile.stage,
        'mission': profile.mission,
        'problem_statement': profile.problem_statement,
        'products': profile.products,
        'customer_segments': profile.customer_segments,
        'goals': profile.goals,
        'icps': profile.icps,
        'revision': profile.revision,
        'onboarding_completed_at': _time(profile.onboarding_completed_at),
        'updated_at': _time(profile.updated_at),
    }


def collect_workspace_data(workspace):
    """Copy only project records; membership, billing, auth and storage keys stay private."""
    profile = WorkspaceProfile.objects.filter(workspace=workspace).first()
    analyses = [
        {
            **_model_values(item, ('id', 'kind', 'schema_version', 'method_version', 'inputs', 'output', 'state', 'revision')),
            'created_at': _time(item.created_at),
            'updated_at': _time(item.updated_at),
        }
        for item in Analysis.objects.filter(workspace=workspace).order_by('kind', 'id')
    ]
    factors = [
        {
            **_model_values(item, ('id', 'factor_type', 'title', 'evidence', 'owner', 'priority', 'revision')),
            'updated_at': _time(item.updated_at),
        }
        for item in StrategyFactor.objects.filter(workspace=workspace).order_by('factor_type', '-priority', 'title', 'id')
    ]
    options = [
        {
            **_model_values(item, ('id', 'category', 'title', 'action', 'rationale', 'hypothesis', 'cost', 'needs_review', 'revision')),
            'factor_ids': [str(value) for value in item.factors.order_by('id').values_list('id', flat=True)],
            'updated_at': _time(item.updated_at),
        }
        for item in StrategyOption.objects.filter(workspace=workspace).prefetch_related('factors').order_by('category', 'title', 'id')
    ]
    decisions = [
        {
            **_model_values(item, ('id', 'title', 'rationale', 'assumptions', 'review_trigger', 'source_analysis_id', 'source_option_id', 'source_snapshot', 'status', 'revision')),
            'created_at': _time(item.created_at),
            'updated_at': _time(item.updated_at),
        }
        for item in Decision.objects.filter(workspace=workspace).order_by('created_at', 'id')
    ]
    goals = [
        {
            **_model_values(item, ('id', 'title', 'description', 'due_on', 'status', 'revision')),
            'created_at': _time(item.created_at),
            'updated_at': _time(item.updated_at),
        }
        for item in Goal.objects.filter(workspace=workspace).order_by('created_at', 'id')
    ]
    actions = [
        {
            **_model_values(item, ('id', 'decision_id', 'goal_id', 'owner_id', 'title', 'description', 'due_on', 'status', 'revision')),
            'created_at': _time(item.created_at),
            'updated_at': _time(item.updated_at),
        }
        for item in Action.objects.filter(workspace=workspace).order_by('due_on', 'status', 'id')
    ]
    execution_history = [
        {
            **_model_values(item, ('id', 'entity_type', 'entity_id', 'entity_label', 'event_type', 'changes')),
            'created_at': _time(item.created_at),
        }
        for item in ExecutionEvent.objects.filter(workspace=workspace).order_by('created_at', 'id')
    ]

    document_records = list(DocumentRecord.objects.filter(workspace=workspace).order_by('template_id', 'id'))
    record_ids = [item.pk for item in document_records]
    attachments_by_record = {record_id: [] for record_id in record_ids}
    attachment_metadata = []
    for item in DocumentAttachment.objects.filter(
        workspace=workspace,
        document_id__in=record_ids,
        status=DocumentAttachment.Status.READY,
    ).order_by('document_id', 'version', 'id'):
        metadata = {
            'id': str(item.pk),
            'document_id': str(item.document_id),
            'name': item.original_name,
            'extension': item.extension,
            'media_type': item.media_type,
            'version': item.version,
            'size_bytes': item.size_bytes,
            'sha256': item.sha256,
            'created_at': _time(item.created_at),
            'archive_path': f'attachments/{item.pk}/{_archive_filename(item.original_name)}',
        }
        attachments_by_record[item.document_id].append(metadata)
        attachment_metadata.append((item, metadata))
    documents = [
        {
            **_model_values(item, ('id', 'template_id', 'stage', 'industry', 'status', 'content', 'content_version', 'revision')),
            'owner_id': str(item.owner_id),
            'reviewer_id': str(item.reviewer_id) if item.reviewer_id else None,
            'created_at': _time(item.created_at),
            'updated_at': _time(item.updated_at),
            'attachments': attachments_by_record.get(item.pk, []),
        }
        for item in document_records
    ]
    document_history = [
        {
            'id': str(item.pk),
            'document_id': str(item.document_id),
            'event_type': item.event_type,
            'changes': item.changes,
            'created_at': _time(item.created_at),
        }
        for item in DocumentEvent.objects.filter(workspace=workspace).order_by('created_at', 'id')
    ]
    catalog = document_catalog()
    document_templates = [
        {
            'id': item['id'],
            'title': item['title'],
            'structure': item['structure'],
        }
        for item in catalog['documents']
        if item.get('catalog_state') == 'mvp'
    ][:5]
    profile_history = [
        {
            'revision': item.revision,
            'snapshot': item.snapshot,
            'created_at': _time(item.created_at),
        }
        for item in WorkspaceProfileRevision.objects.filter(profile=profile).order_by('revision')
    ] if profile else []

    data = {
        'workspace': {
            'id': str(workspace.pk),
            'name': workspace.name,
            'revision': workspace.revision,
            'created_at': _time(workspace.created_at),
            'updated_at': _time(workspace.updated_at),
            'archived_at': _time(workspace.archived_at),
        },
        'workspace_profile': _profile_payload(profile),
        'profile_history': profile_history,
        'analyses': analyses,
        'strategy_factors': factors,
        'strategy_options': options,
        'decisions': decisions,
        'goals': goals,
        'actions': actions,
        'execution_history': execution_history,
        'documents': documents,
        'document_templates': document_templates,
        'ready_attachments': [metadata for _, metadata in attachment_metadata],
        'document_history': document_history,
    }
    return data, attachment_metadata


def _archive_filename(value):
    leaf = value.replace('\\', '/').split('/')[-1]
    safe = ''.join(
        char for char in leaf
        if unicodedata.category(char) not in {'Cc', 'Cs'}
        and char not in '\u202a\u202b\u202d\u202e\u2066\u2067\u2068\u2069'
    ).strip(' .')[:180]
    return safe or 'file'


def _envelope(snapshot):
    return {
        'schema': SCHEMA_NAME if snapshot.schema_version == 1 else 'stratino-workspace-v2',
        'schema_version': snapshot.schema_version,
        'exported_at': _time(snapshot.exported_at),
        'method_version': snapshot.method_version,
        'scope': snapshot.scope,
        'data': snapshot.data,
    }


def _csv_bytes(snapshot):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, lineterminator='\r\n')
    writer.writerow(('schema_version', 'section', 'record_id', 'record_json'))
    for section, value in snapshot.data.items():
        records = value if isinstance(value, list) else [value]
        if not records:
            writer.writerow((snapshot.schema_version, section, '', '[]'))
        for record in records:
            record_id = record.get('id', '') if isinstance(record, dict) else ''
            encoded = json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
            writer.writerow((snapshot.schema_version, section, record_id, encoded))
    return ('\ufeff' + stream.getvalue()).encode('utf-8')


def _json_bytes(snapshot):
    return (json.dumps(_envelope(snapshot), ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + '\n').encode('utf-8')


def _build_archive(snapshot, attachments):
    archive_file = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024, mode='w+b')
    try:
        with zipfile.ZipFile(archive_file, mode='w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            archive.writestr('workspace.json', _json_bytes(snapshot))
            archive.writestr('records.csv', _csv_bytes(snapshot))
            for attachment, metadata in attachments:
                if attachment.storage_key != f'attachments/{attachment.pk.hex}':
                    raise ExportValidationError('مسیر فایل خصوصی معتبر نیست.', code='unsafe_attachment_path')
                digest = hashlib.sha256()
                size = 0
                with default_storage.open(attachment.storage_key, 'rb') as stored:
                    with archive.open(metadata['archive_path'], mode='w') as member:
                        for chunk in iter(lambda: stored.read(64 * 1024), b''):
                            digest.update(chunk)
                            size += len(chunk)
                            member.write(chunk)
                if size != attachment.size_bytes or digest.hexdigest() != attachment.sha256:
                    raise ExportValidationError('فایل خصوصی با نسخهٔ ثبت‌شده یکسان نیست.', code='attachment_integrity_failed')
        archive_file.seek(0)
        digest = hashlib.sha256()
        size = 0
        for chunk in iter(lambda: archive_file.read(64 * 1024), b''):
            digest.update(chunk)
            size += len(chunk)
        archive_file.seek(0)
        return archive_file, digest.hexdigest(), size
    except Exception:
        archive_file.close()
        raise


def snapshot_payload(snapshot, *, include_data=False):
    payload = {
        'id': str(snapshot.pk),
        'workspace_id': str(snapshot.workspace_id),
        'schema_version': snapshot.schema_version,
        'method_version': snapshot.method_version,
        'scope': snapshot.scope,
        'state': snapshot.State.READY,
        'created_at': _time(snapshot.created_at),
        'artifact': {
            'format': 'zip',
            'size_bytes': snapshot.artifact_size_bytes,
            'sha256': snapshot.artifact_sha256,
        },
    }
    if include_data:
        payload['snapshot'] = _envelope(snapshot)
    return payload


@transaction.atomic
def create_snapshot(actor, workspace, idempotency_key, *, schema_version=1, purpose='raw'):
    key = validate_idempotency_key(idempotency_key)
    if type(schema_version) is not int or schema_version not in (1, 2) or purpose not in ('raw', 'professional') or (purpose == 'professional' and schema_version != 2):
        raise ExportValidationError('نسخه یا نوع خروجی معتبر نیست.', code='unsupported_export_contract')
    locked = Workspace.objects.select_for_update().get(pk=workspace.pk)
    if workspace_role(actor, locked) is None:
        raise Http404('Workspace is not available.')
    method = PROFESSIONAL_METHOD if purpose == 'professional' else (METHOD_VERSION if schema_version == 1 else 'stratino-report-v2')
    if purpose == 'professional':
        require_workspace_feature(locked, 'can_generate_reports')
    existing = ExportSnapshot.objects.filter(
        workspace=locked,
        requested_by=actor,
        idempotency_key=key,
    ).first()
    if existing:
        if existing.schema_version != schema_version or existing.method_version != method:
            raise ExportValidationError('این شناسه برای خروجی دیگه‌ای ثبت شده.', code='export_idempotency_conflict')
        return existing, False

    data, attachments = collect_workspace_data(locked)
    if schema_version == 2:
        data.update(collect_v2(locked, _model_values))
    if purpose == 'professional':
        from django.core.exceptions import ValidationError
        from modules.knowledge.registry import KnowledgeReleaseError
        try:
            data['report_verification'] = verify_report(data)
        except (ValidationError, KnowledgeReleaseError, ValueError, TypeError, KeyError, ArithmeticError) as error:
            raise ExportValidationError('روش یا ورودی‌های این گزارش قابل بررسی نیست؛ داده‌ها و نسخهٔ روش رو بررسی کن.', code='report_verification_failed') from error
    candidate = ExportSnapshot(
        workspace=locked,
        requested_by=actor,
        idempotency_key=key,
        schema_version=schema_version,
        method_version=method,
        scope=list(EXPORT_SCOPE) + (V2_EXTRA_SCOPE if schema_version == 2 else []),
        data=data,
        exported_at=timezone.now(),
        artifact_key=f'exports/{uuid.uuid4().hex}.zip',
    )
    artifact_file, digest, size = _build_archive(candidate, attachments)
    candidate.artifact_sha256 = digest
    candidate.artifact_size_bytes = size
    stored_key = ''
    try:
        if workspace_role(actor, locked) is None:
            raise Http404('Workspace is not available.')
        if purpose == 'professional':
            require_workspace_feature(locked, 'can_generate_reports')
        stored_key = default_storage.save(candidate.artifact_key, File(artifact_file, name='workspace-export.zip'))
        candidate.artifact_key = stored_key
        candidate.save(force_insert=True)
    except Exception:
        if stored_key:
            default_storage.delete(stored_key)
        raise
    finally:
        artifact_file.close()
    return candidate, True


def read_csv(snapshot):
    return _csv_bytes(snapshot)


def read_json(snapshot):
    return _json_bytes(snapshot)
