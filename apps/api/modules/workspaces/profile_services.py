from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import Http404
from django.utils import timezone

from .models import Workspace, WorkspaceProfile, WorkspaceProfileRevision
from .services import WorkspaceActionError, workspace_role

PROFILE_TEXT_LIMITS = {
    'company_name': 120,
    'industry': 200,
    'stage': 100,
    'mission': 2000,
    'problem_statement': 2000,
}
PROFILE_HISTORY_LIMIT = 50
PRODUCT_FIELDS = {'id': 80, 'name': 120, 'description': 1000, 'problem_solved': 600, 'target_customer': 400}
CUSTOMER_FIELDS = {'id': 80, 'name': 120, 'description': 1000, 'needs': 600, 'buying_roles': 400}
GOAL_FIELDS = {'id': 80, 'title': 160, 'success_signal': 500, 'timeframe': 120}
SEGMENT_FIELDS = {'industry': 160, 'organization_size': 120, 'geography': 120, 'buying_context': 500}
PERSONA_FIELDS = {'role': 120, 'decision_role': 120, 'goals': 500, 'pains': 500}
EVIDENCE_FIELDS = {'id': 80, 'source_type': 40, 'reference': 400, 'statement': 1000, 'date': 32, 'confidence': 20}
ASSUMPTION_FIELDS = {'id': 80, 'statement': 1000, 'confidence': 20, 'test': 600, 'status': 20}
SOURCE_TYPES = {'interview', 'sales', 'support', 'usage', 'survey', 'document', 'secondary', 'other'}
CONFIDENCE_LEVELS = {'low', 'medium', 'high'}
ASSUMPTION_STATUSES = {'untested', 'supported', 'rejected'}


def _invalid(field, message):
    raise DjangoValidationError({field: [message]})


def _profile_workspace(actor, workspace, *, write=False):
    role = workspace_role(actor, workspace)
    if role is None:
        raise Http404('Workspace is not available.')
    if write and role not in {'owner', 'editor'}:
        raise WorkspaceActionError(
            403,
            'workspace_permission_denied',
            'برای تغییر اطلاعات این پروژه دسترسی لازم را ندارید.',
        )
    return role


def _clean_text(value, field, maximum, *, required=False):
    if not isinstance(value, str):
        _invalid(field, 'این مقدار باید متن باشد.')
    normalized = value.strip()
    if len(normalized) > maximum:
        _invalid(field, f'این مقدار نباید بیشتر از {maximum} نویسه باشد.')
    if required and not normalized:
        _invalid(field, 'این فیلد را تکمیل کنید.')
    return normalized


def _clean_object(value, field, schema, *, required_fields=()):
    if not isinstance(value, dict) or set(value) != set(schema):
        _invalid(field, 'ساختار این بخش معتبر نیست.')
    result = {}
    for key, maximum in schema.items():
        result[key] = _clean_text(
            value[key],
            f'{field}.{key}',
            maximum,
            required=key in required_fields,
        )
    return result


def _clean_rows(value, field, maximum, schema, *, required_fields=()):
    if not isinstance(value, list) or len(value) > maximum:
        _invalid(field, f'این بخش حداکثر {maximum} مورد می‌تواند داشته باشد.')
    rows = []
    seen_ids = set()
    for index, row in enumerate(value):
        row_field = f'{field}.{index}'
        cleaned = _clean_object(row, row_field, schema, required_fields=required_fields)
        row_id = cleaned.get('id')
        if row_id and row_id in seen_ids:
            _invalid(f'{row_field}.id', 'شناسه موارد تکراری است.')
        if row_id:
            seen_ids.add(row_id)
        rows.append(cleaned)
    return rows


def _clean_icps(value):
    if not isinstance(value, list) or len(value) > 20:
        _invalid('icps', 'حداکثر ۲۰ پروفایل مشتری ایده‌آل قابل ثبت است.')
    rows = []
    seen_ids = set()
    for index, item in enumerate(value):
        field = f'icps.{index}'
        expected = {'id', 'name', 'segment', 'persona', 'problem', 'evidence', 'assumptions'}
        if not isinstance(item, dict) or set(item) != expected:
            _invalid(field, 'ساختار ICP معتبر نیست.')
        row_id = _clean_text(item['id'], f'{field}.id', 80, required=True)
        if row_id in seen_ids:
            _invalid(f'{field}.id', 'شناسه موارد تکراری است.')
        seen_ids.add(row_id)
        segment = _clean_object(item['segment'], f'{field}.segment', SEGMENT_FIELDS)
        persona = _clean_object(item['persona'], f'{field}.persona', PERSONA_FIELDS)
        evidence = _clean_rows(
            item['evidence'], f'{field}.evidence', 10, EVIDENCE_FIELDS,
            required_fields=('id', 'statement'),
        )
        for evidence_index, record in enumerate(evidence):
            if record['source_type'] not in SOURCE_TYPES:
                _invalid(f'{field}.evidence.{evidence_index}.source_type', 'نوع منبع را از فهرست انتخاب کنید.')
            if record['confidence'] not in CONFIDENCE_LEVELS:
                _invalid(f'{field}.evidence.{evidence_index}.confidence', 'سطح اطمینان معتبر نیست.')
        assumptions = _clean_rows(
            item['assumptions'], f'{field}.assumptions', 10, ASSUMPTION_FIELDS,
            required_fields=('id', 'statement'),
        )
        for assumption_index, assumption in enumerate(assumptions):
            if assumption['confidence'] not in CONFIDENCE_LEVELS:
                _invalid(f'{field}.assumptions.{assumption_index}.confidence', 'سطح اطمینان معتبر نیست.')
            if assumption['status'] not in ASSUMPTION_STATUSES:
                _invalid(f'{field}.assumptions.{assumption_index}.status', 'وضعیت فرضیه معتبر نیست.')
        rows.append({
            'id': row_id,
            'name': _clean_text(item['name'], f'{field}.name', 120, required=True),
            'segment': segment,
            'persona': persona,
            'problem': _clean_text(item['problem'], f'{field}.problem', 1000),
            'evidence': evidence,
            'assumptions': assumptions,
        })
    return rows


def _profile_snapshot(profile):
    return {
        'workspace_id': str(profile.workspace_id),
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
        'onboarding_completed_at': profile.onboarding_completed_at.isoformat() if profile.onboarding_completed_at else None,
    }


def read_workspace_profile(actor, workspace):
    _profile_workspace(actor, workspace)
    profile, _ = WorkspaceProfile.objects.get_or_create(workspace=workspace)
    return profile


@transaction.atomic
def update_workspace_profile(
    actor,
    workspace,
    *,
    revision,
    company_name=None,
    industry=None,
    stage=None,
    mission=None,
    problem_statement=None,
    products=None,
    customer_segments=None,
    goals=None,
    icps=None,
    complete=None,
):
    locked_workspace = Workspace.objects.select_for_update().filter(pk=workspace.pk).first()
    if locked_workspace is None:
        raise Http404('Workspace is not available.')
    role = _profile_workspace(actor, locked_workspace, write=True)
    if locked_workspace.archived_at is not None:
        raise WorkspaceActionError(409, 'workspace_archived', 'فضای بایگانی‌شده قابل ویرایش نیست.')
    if complete is True and role != 'owner':
        raise WorkspaceActionError(
            403,
            'workspace_permission_denied',
            'تکمیل راه‌اندازی این فضا در اختیار مالک است.',
        )

    profile, _ = WorkspaceProfile.objects.select_for_update().get_or_create(workspace=locked_workspace)
    if revision != profile.revision:
        raise WorkspaceActionError(
            409,
            'revision_conflict',
            'اطلاعات پروژه هم‌زمان تغییر کرده است. نسخه تازه را بارگیری و دوباره تلاش کنید.',
            fields={'revision': ['نسخه فعلی تغییر کرده است.']},
        )

    changed = []
    for field, value in (
        ('company_name', company_name),
        ('industry', industry),
        ('stage', stage),
        ('mission', mission),
        ('problem_statement', problem_statement),
    ):
        if value is None:
            continue
        normalized = _clean_text(value, field, PROFILE_TEXT_LIMITS[field])
        if getattr(profile, field) != normalized:
            setattr(profile, field, normalized)
            changed.append(field)

    collection_values = {
        'products': (products, 20, PRODUCT_FIELDS, ('id', 'name')),
        'customer_segments': (customer_segments, 20, CUSTOMER_FIELDS, ('id', 'name')),
        'goals': (goals, 30, GOAL_FIELDS, ('id', 'title')),
    }
    cleaned_collections = {}
    for field, (value, maximum, schema, required_fields) in collection_values.items():
        if value is None:
            continue
        cleaned = _clean_rows(value, field, maximum, schema, required_fields=required_fields)
        cleaned_collections[field] = cleaned
        if getattr(profile, field) != cleaned:
            setattr(profile, field, cleaned)
            changed.append(field)
    if icps is not None:
        cleaned_icps = _clean_icps(icps)
        if profile.icps != cleaned_icps:
            profile.icps = cleaned_icps
            changed.append('icps')

    # STR-056 cutover keeps this existing service as the one write boundary.
    # Canonical rows and the legacy-shaped profile projection commit together.
    from modules.customer_context.models import ProfileMigrationBatch

    if ProfileMigrationBatch.objects.filter(workspace=locked_workspace).exists():
        from modules.customer_context.profile_migration import sync_profile_entities

        projection = sync_profile_entities(
            profile,
            products=cleaned_collections.get('products'),
            customer_segments=cleaned_collections.get('customer_segments'),
            icps=cleaned_icps if icps is not None else None,
            source_revision=profile.revision + 1,
        )
        for field in ('products', 'customer_segments', 'icps'):
            projected = projection[field]
            if getattr(profile, field) != projected:
                setattr(profile, field, projected)
                if field not in changed:
                    changed.append(field)

    if complete is True and profile.onboarding_completed_at is None:
        profile.onboarding_completed_at = timezone.now()
        changed.append('onboarding_completed_at')
    if changed:
        profile.revision += 1
        profile.updated_at = timezone.now()
        profile.save(update_fields=[*changed, 'revision', 'updated_at'])
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
    return profile


def workspace_profile_dict(profile):
    return _profile_snapshot(profile)


def workspace_profile_revisions(actor, workspace, *, limit=10):
    _profile_workspace(actor, workspace)
    profile = read_workspace_profile(actor, workspace)
    return [
        {
            'revision': item.revision,
            'snapshot': item.snapshot,
            'changed_by_id': str(item.changed_by_id),
            'created_at': item.created_at,
        }
        for item in profile.history.select_related('changed_by').all()[:limit]
    ]
