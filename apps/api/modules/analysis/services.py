import json
import math
import re

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.http import Http404

from modules.workspaces.models import Workspace
from modules.workspaces.services import WorkspaceActionError, workspace_role
from modules.workspaces.entitlements import require_workspace_feature

from .calculation import evaluate_matrix
from .models import Analysis, AnalysisRevision

METHOD_VERSIONS = {'efe': 'efe-v1', 'ife': 'ife-v1'}
MAX_ROWS = 100
ROW_FIELDS = {'id', 'title', 'factor_type', 'weight', 'rating', 'evidence'}


def _invalid(field, message):
    raise DjangoValidationError({field: [message]})


def _access(actor, workspace, *, write=False):
    role = workspace_role(actor, workspace)
    if role is None:
        raise Http404('Workspace is not available.')
    if write and role not in {'owner', 'editor'}:
        raise WorkspaceActionError(403, 'workspace_permission_denied', 'برای تغییر این تحلیل دسترسی لازم را ندارید.')


def _locked_workspace(workspace):
    locked = Workspace.objects.select_for_update().filter(pk=workspace.pk).first()
    if locked is None:
        raise Http404('Workspace is not available.')
    if locked.archived_at is not None:
        raise WorkspaceActionError(409, 'workspace_archived', 'فضای بایگانی‌شده قابل ویرایش نیست.')
    return locked


def _text(value, field, maximum):
    if not isinstance(value, str):
        _invalid(field, 'این مقدار باید متن باشد.')
    normalized = value.strip()
    if len(normalized) > maximum:
        _invalid(field, f'این مقدار نباید بیشتر از {maximum} نویسه باشد.')
    return normalized


def _inputs(value):
    if not isinstance(value, dict) or set(value) != {'rows'} or not isinstance(value['rows'], list):
        _invalid('inputs', 'ساختار ورودی ماتریس معتبر نیست.')
    rows = value['rows']
    if len(rows) > MAX_ROWS:
        _invalid('inputs.rows', f'هر ماتریس حداکثر {MAX_ROWS} عامل دارد.')
    normalized = []
    for index, row in enumerate(rows):
        field = f'inputs.rows.{index}'
        if not isinstance(row, dict) or set(row) != ROW_FIELDS:
            _invalid(field, 'ساختار عامل معتبر نیست.')
        row_id = _text(row['id'], f'{field}.id', 80)
        if not row_id or not re.fullmatch(r'[A-Za-z0-9_-]+', row_id):
            _invalid(f'{field}.id', 'شناسه عامل معتبر نیست.')
        title = _text(row['title'], f'{field}.title', 500)
        evidence = _text(row['evidence'], f'{field}.evidence', 2000)
        factor_type = row['factor_type']
        if not isinstance(factor_type, str) or factor_type not in {'strength', 'weakness', 'opportunity', 'threat'}:
            _invalid(f'{field}.factor_type', 'نوع عامل معتبر نیست.')
        weight = row['weight']
        if weight is not None:
            if isinstance(weight, bool) or not isinstance(weight, (int, float)) or not math.isfinite(weight):
                _invalid(f'{field}.weight', 'وزن باید عدد معتبر یا خالی باشد.')
            weight = float(weight)
            if weight < 0 or weight > 100:
                _invalid(f'{field}.weight', 'وزن باید بین صفر تا ۱۰۰ باشد.')
        rating = row['rating']
        if rating is not None and (isinstance(rating, bool) or not isinstance(rating, int)):
            _invalid(f'{field}.rating', 'رتبه باید عدد صحیح یا خالی باشد.')
        if rating is not None and not 1 <= rating <= 4:
            _invalid(f'{field}.rating', 'رتبه باید عددی از ۱ تا ۴ باشد.')
        normalized.append({
            'id': row_id,
            'title': title,
            'factor_type': factor_type,
            'weight': weight,
            'rating': rating,
            'evidence': evidence,
        })
    return {'rows': normalized}


def _write_values(body):
    allowed = {'revision', 'kind', 'schema_version', 'method_version', 'inputs', 'state'}
    required = allowed
    if not isinstance(body, dict) or set(body) != required:
        _invalid('body', 'ساختار درخواست معتبر نیست.')
    if isinstance(body['revision'], bool) or not isinstance(body['revision'], int) or body['revision'] < 1:
        _invalid('revision', 'نسخه معتبر نیست.')
    kind = body['kind']
    if not isinstance(kind, str) or kind not in METHOD_VERSIONS:
        _invalid('kind', 'این نوع تحلیل هنوز در سرور پشتیبانی نمی‌شود.')
    if isinstance(body['schema_version'], bool) or body['schema_version'] != 1:
        _invalid('schema_version', 'نسخه داده پشتیبانی نمی‌شود.')
    if body['method_version'] != METHOD_VERSIONS[kind]:
        _invalid('method_version', 'نسخه روش محاسبه پشتیبانی نمی‌شود.')
    if not isinstance(body['state'], str) or body['state'] not in {Analysis.State.DRAFT, Analysis.State.FINALIZED}:
        _invalid('state', 'وضعیت ماتریس معتبر نیست.')
    return {
        'revision': body['revision'],
        'kind': kind,
        'schema_version': 1,
        'method_version': METHOD_VERSIONS[kind],
        'inputs': _inputs(body['inputs']),
        'state': body['state'],
    }


def _payload(analysis):
    return {
        'id': str(analysis.pk),
        'workspace_id': str(analysis.workspace_id),
        'revision': analysis.revision,
        'created_at': analysis.created_at,
        'updated_at': analysis.updated_at,
        'kind': analysis.kind,
        'schema_version': analysis.schema_version,
        'method_version': analysis.method_version,
        'inputs': analysis.inputs,
        'output': analysis.output,
        'state': analysis.state,
    }


def _capture_revision(analysis, actor):
    AnalysisRevision.objects.create(workspace=analysis.workspace, source_record_id=analysis.pk,
                                    revision=analysis.revision, recorded_by=actor,
                                    snapshot=json.loads(json.dumps(_payload(analysis), cls=DjangoJSONEncoder)))


def read_analysis_revisions(actor, workspace, record_id, before=None):
    _access(actor, workspace)
    rows = AnalysisRevision.objects.filter(workspace=workspace, source_record_id=record_id)
    if before is not None:
        try:
            before = int(before)
        except (TypeError, ValueError):
            _invalid('before', 'نسخهٔ شروع فهرست معتبر نیست.')
        if before < 1:
            _invalid('before', 'نسخهٔ شروع فهرست معتبر نیست.')
        rows = rows.filter(revision__lt=before)
    page = list(rows.order_by('-revision')[:51])
    if not page and not Analysis.objects.filter(workspace=workspace, pk=record_id).exists():
        raise Http404('Analysis history is not available.')
    return {'items': [{'revision': row.revision, 'snapshot': row.snapshot, 'recorded_at': row.recorded_at,
                       'recorded_by': str(row.recorded_by_id) if row.recorded_by_id else None, 'is_backfill': row.is_backfill} for row in page[:50]],
            'next_before': page[49].revision if len(page) > 50 else None}


def _ensure_finalizable(output):
    if output['can_finalize']:
        return
    fields = {}
    for issue in output['issues']:
        fields.setdefault(issue['field'], []).append(issue['code'])
    raise WorkspaceActionError(
        422,
        'incomplete_calculation',
        'برای نهایی‌کردن، وزن‌ها، رتبه‌ها و شواهد عامل‌ها را کامل کنید.',
        fields=fields,
    )


@transaction.atomic
def read_analyses(actor, workspace):
    _access(actor, workspace)
    items = Analysis.objects.filter(workspace=workspace).order_by('kind')
    return {'items': [_payload(item) for item in items], 'next_cursor': None}


@transaction.atomic
def read_analysis(actor, workspace, record_id):
    _access(actor, workspace)
    analysis = Analysis.objects.filter(workspace=workspace, pk=record_id).first()
    if analysis is None:
        raise Http404('Analysis is not available.')
    return _payload(analysis)


@transaction.atomic
def create_analysis(actor, workspace, body):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    values = _write_values(body)
    if values['revision'] != 1:
        _invalid('revision', 'نسخه نخست ماتریس باید ۱ باشد.')
    if Analysis.objects.filter(workspace=locked, kind=values['kind']).exists():
        raise WorkspaceActionError(409, 'analysis_exists', 'این ماتریس قبلاً در این فضای کار ساخته شده است.')
    output = evaluate_matrix(values['kind'], values['inputs']['rows'])
    if values['state'] == Analysis.State.FINALIZED:
        _ensure_finalizable(output)
        require_workspace_feature(locked, 'can_finalize_analysis')
    analysis = Analysis.objects.create(
        workspace=locked,
        created_by=actor,
        kind=values['kind'],
        schema_version=values['schema_version'],
        method_version=values['method_version'],
        inputs=values['inputs'],
        output=output,
        state=values['state'],
    )
    _capture_revision(analysis, actor)
    return _payload(analysis)


@transaction.atomic
def update_analysis(actor, workspace, record_id, body):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    analysis = Analysis.objects.select_for_update().filter(workspace=locked, pk=record_id).first()
    if analysis is None:
        raise Http404('Analysis is not available.')
    values = _write_values(body)
    if values['revision'] != analysis.revision:
        raise WorkspaceActionError(
            409,
            'revision_conflict',
            'این ماتریس هم‌زمان تغییر کرده است؛ نسخه تازه را بارگیری کنید.',
            fields={'revision': ['نسخه فعلی تغییر کرده است.']},
        )
    if values['kind'] != analysis.kind:
        _invalid('kind', 'نوع ماتریس ذخیره‌شده قابل تغییر نیست.')
    output = evaluate_matrix(values['kind'], values['inputs']['rows'])
    if values['state'] == Analysis.State.FINALIZED:
        _ensure_finalizable(output)
        require_workspace_feature(locked, 'can_finalize_analysis')
    analysis.schema_version = values['schema_version']
    analysis.method_version = values['method_version']
    analysis.inputs = values['inputs']
    analysis.output = output
    analysis.state = values['state']
    analysis.revision += 1
    analysis.save(update_fields=['schema_version', 'method_version', 'inputs', 'output', 'state', 'revision', 'updated_at'])
    _capture_revision(analysis, actor)
    return _payload(analysis)


@transaction.atomic
def delete_analysis(actor, workspace, record_id):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    analysis = Analysis.objects.select_for_update().filter(workspace=locked, pk=record_id).first()
    if analysis is None:
        raise Http404('Analysis is not available.')
    analysis.delete()
    return {'id': str(record_id), 'deleted': True}
