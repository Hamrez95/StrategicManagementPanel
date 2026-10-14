from uuid import UUID

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import Http404
from django.utils import timezone

from modules.workspaces.models import Workspace
from modules.workspaces.services import WorkspaceActionError, workspace_role

from .models import StrategyFactor, StrategyOption

FACTOR_TYPES = {choice for choice, _label in StrategyFactor.Type.choices}
OPTION_CATEGORIES = {choice for choice, _label in StrategyOption.Category.choices}
CATEGORY_FACTORS = {
    'SO': {'strength', 'opportunity'},
    'WO': {'weakness', 'opportunity'},
    'ST': {'strength', 'threat'},
    'WT': {'weakness', 'threat'},
}
FACTOR_LIMIT = 100
OPTION_LIMIT = 50
OPTION_FACTOR_LIMIT = 10


def _invalid(field, message):
    raise DjangoValidationError({field: [message]})


def _access(actor, workspace, *, write=False):
    role = workspace_role(actor, workspace)
    if role is None:
        raise Http404('Workspace is not available.')
    if write and role not in {'owner', 'editor'}:
        raise WorkspaceActionError(403, 'workspace_permission_denied', 'برای تغییر این تحلیل دسترسی لازم را ندارید.')
    return role


def _locked_workspace(workspace):
    locked = Workspace.objects.select_for_update().filter(pk=workspace.pk).first()
    if locked is None:
        raise Http404('Workspace is not available.')
    if locked.archived_at is not None:
        raise WorkspaceActionError(409, 'workspace_archived', 'فضای بایگانی‌شده قابل ویرایش نیست.')
    return locked


def _text(value, field, maximum, *, required=False):
    if not isinstance(value, str):
        _invalid(field, 'این مقدار باید متن باشد.')
    normalized = value.strip()
    if required and not normalized:
        _invalid(field, 'این فیلد را تکمیل کنید.')
    if len(normalized) > maximum:
        _invalid(field, f'این مقدار نباید بیشتر از {maximum} نویسه باشد.')
    return normalized


def _priority(value):
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 5:
        _invalid('priority', 'اولویت باید عددی از ۱ تا ۵ باشد.')
    return value


def _revision(value):
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        _invalid('revision', 'نسخه معتبر نیست.')
    return value


def _check_revision(record, value):
    if _revision(value) != record.revision:
        raise WorkspaceActionError(
            409,
            'revision_conflict',
            'این مورد هم‌زمان تغییر کرده است؛ نسخه تازه را بارگیری کنید.',
            fields={'revision': ['نسخه فعلی تغییر کرده است.']},
        )


def _validate_fields(body, *, allowed, required=()):
    if not isinstance(body, dict) or set(body) - set(allowed) or set(required) - set(body):
        _invalid('body', 'ساختار درخواست معتبر نیست.')


def _factor_payload(factor, option_titles=()):
    return {
        'id': str(factor.pk),
        'factor_type': factor.factor_type,
        'title': factor.title,
        'evidence': factor.evidence,
        'owner': factor.owner,
        'priority': factor.priority,
        'revision': factor.revision,
        'updated_at': factor.updated_at,
        'linked_options': list(option_titles),
    }


def _option_payload(option):
    factors = sorted(option.factors.all(), key=lambda factor: (factor.factor_type, factor.title, str(factor.pk)))
    return {
        'id': str(option.pk),
        'category': option.category,
        'title': option.title,
        'action': option.action,
        'rationale': option.rationale,
        'hypothesis': option.hypothesis,
        'cost': option.cost,
        'factor_refs': [
            {'id': str(factor.pk), 'factor_type': factor.factor_type, 'title': factor.title}
            for factor in factors
        ],
        'needs_review': option.needs_review,
        'revision': option.revision,
        'updated_at': option.updated_at,
    }


@transaction.atomic
def read_strategy_board(actor, workspace):
    _access(actor, workspace)
    locked = Workspace.objects.select_for_update().filter(pk=workspace.pk).first()
    if locked is None:
        raise Http404('Workspace is not available.')
    factors = list(StrategyFactor.objects.filter(workspace=locked))
    options = list(StrategyOption.objects.filter(workspace=locked).prefetch_related('factors'))
    dependencies = {factor.pk: [] for factor in factors}
    for option in options:
        for factor in option.factors.all():
            dependencies[factor.pk].append({'id': str(option.pk), 'title': option.title, 'category': option.category})
    return {
        'workspace_id': str(workspace.pk),
        'factors': [_factor_payload(factor, dependencies[factor.pk]) for factor in factors],
        'options': [_option_payload(option) for option in options],
    }


@transaction.atomic
def create_factor(actor, workspace, body):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    fields = {'factor_type', 'title', 'evidence', 'owner', 'priority'}
    _validate_fields(body, allowed=fields, required=fields)
    if not isinstance(body['factor_type'], str) or body['factor_type'] not in FACTOR_TYPES:
        _invalid('factor_type', 'نوع عامل معتبر نیست.')
    if StrategyFactor.objects.filter(workspace=locked).count() >= FACTOR_LIMIT:
        _invalid('factor_type', f'هر Workspace حداکثر {FACTOR_LIMIT} عامل SWOT دارد.')
    factor = StrategyFactor.objects.create(
        workspace=locked,
        factor_type=body['factor_type'],
        title=_text(body['title'], 'title', 160, required=True),
        evidence=_text(body['evidence'], 'evidence', 2000, required=True),
        owner=_text(body['owner'], 'owner', 120),
        priority=_priority(body['priority']),
        created_by=actor,
    )
    return _factor_payload(factor)


@transaction.atomic
def update_factor(actor, workspace, factor_id, body):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    factor = StrategyFactor.objects.select_for_update().filter(workspace=locked, pk=factor_id).first()
    if factor is None:
        raise Http404('Factor is not available.')
    _validate_fields(body, allowed={'revision', 'factor_type', 'title', 'evidence', 'owner', 'priority'}, required={'revision'})
    _check_revision(factor, body['revision'])
    if set(body) == {'revision'}:
        _invalid('body', 'حداقل یک فیلد برای تغییر بفرستید.')
    values = {}
    if 'factor_type' in body:
        factor_type = body['factor_type']
        if not isinstance(factor_type, str) or factor_type not in FACTOR_TYPES:
            _invalid('factor_type', 'نوع عامل معتبر نیست.')
        if factor_type != factor.factor_type:
            linked_options = list(factor.strategy_options.select_for_update().order_by('title'))
            incompatible = [option for option in linked_options if factor_type not in CATEGORY_FACTORS[option.category]]
            if incompatible:
                raise WorkspaceActionError(
                    409,
                    'factor_type_in_use',
                    'نوع عامل با گزینه‌های راهبردی پیوندخورده سازگار نیست؛ ابتدا پیوندها را ویرایش کنید.',
                    fields={'dependencies': [option.title for option in incompatible]},
                )
        values['factor_type'] = factor_type
    for key, limit, required in (
        ('title', 160, True), ('evidence', 2000, True), ('owner', 120, False),
    ):
        if key in body:
            values[key] = _text(body[key], key, limit, required=required)
    if 'priority' in body:
        values['priority'] = _priority(body['priority'])
    changed = {key: value for key, value in values.items() if getattr(factor, key) != value}
    if changed:
        for key, value in changed.items():
            setattr(factor, key, value)
        factor.revision += 1
        factor.save(update_fields=[*changed, 'revision', 'updated_at'])
        if set(changed).intersection({'factor_type', 'title', 'evidence', 'priority'}):
            for option in factor.strategy_options.select_for_update():
                option.needs_review = True
                option.revision += 1
                option.updated_at = timezone.now()
                option.save(update_fields=['needs_review', 'revision', 'updated_at'])
    titles = [
        {'id': str(option.pk), 'title': option.title, 'category': option.category}
        for option in factor.strategy_options.order_by('title')
    ]
    return _factor_payload(factor, titles)


@transaction.atomic
def delete_factor(actor, workspace, factor_id, *, confirm_dependencies=False):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    factor = StrategyFactor.objects.select_for_update().filter(workspace=locked, pk=factor_id).first()
    if factor is None:
        raise Http404('Factor is not available.')
    options = list(factor.strategy_options.select_for_update().order_by('title'))
    dependencies = [{'id': str(option.pk), 'title': option.title, 'category': option.category} for option in options]
    if dependencies and not confirm_dependencies:
        raise WorkspaceActionError(
            409,
            'factor_dependencies',
            'این عامل در گزینه‌های راهبردی استفاده شده است. وابستگی‌ها را مرور و حذف را تأیید کنید.',
            fields={'dependencies': [item['title'] for item in dependencies]},
        )
    for option in options:
        option.needs_review = True
        option.revision += 1
        option.updated_at = timezone.now()
        option.save(update_fields=['needs_review', 'revision', 'updated_at'])
    factor.delete()
    return {'id': str(factor_id), 'deleted': True, 'affected_options': dependencies}


def _factor_ids(workspace, values, category):
    if not isinstance(values, list) or len(values) < 2 or len(values) > OPTION_FACTOR_LIMIT:
        _invalid('factor_ids', 'برای هر گزینه دست‌کم دو و حداکثر ۱۰ عامل انتخاب کنید.')
    if any(not isinstance(value, str) for value in values) or len(set(values)) != len(values):
        _invalid('factor_ids', 'شناسه عامل‌ها باید یکتا و معتبر باشد.')
    try:
        [UUID(value) for value in values]
    except (ValueError, AttributeError):
        _invalid('factor_ids', 'شناسه عامل معتبر نیست.')
    factors = list(StrategyFactor.objects.select_for_update().filter(workspace=workspace, pk__in=values))
    if len(factors) != len(values):
        _invalid('factor_ids', 'همه عامل‌ها باید در همین Workspace موجود باشند.')
    expected_types = CATEGORY_FACTORS[category]
    actual_types = {factor.factor_type for factor in factors}
    if not expected_types.issubset(actual_types) or not actual_types.issubset(expected_types):
        _invalid('factor_ids', 'عامل‌های انتخاب‌شده باید با هر دو بُعد گزینه TOWS سازگار باشند.')
    return factors


def _option_values(body, current=None):
    fields = {'category', 'title', 'action', 'rationale', 'hypothesis', 'cost', 'factor_ids'}
    if not isinstance(body, dict) or set(body) - fields:
        _invalid('body', 'ساختار گزینه راهبردی معتبر نیست.')
    values = {}
    for key, maximum in (
        ('title', 160), ('action', 1000), ('rationale', 1000), ('hypothesis', 600), ('cost', 300),
    ):
        if key in body:
            values[key] = _text(body[key], key, maximum, required=key != 'cost')
        elif current is None and key != 'cost':
            _invalid(key, 'این فیلد را تکمیل کنید.')
    if 'category' in body:
        if not isinstance(body['category'], str) or body['category'] not in OPTION_CATEGORIES:
            _invalid('category', 'نوع راهبرد TOWS معتبر نیست.')
        values['category'] = body['category']
    elif current is None:
        _invalid('category', 'نوع راهبرد TOWS را انتخاب کنید.')
    if 'factor_ids' not in body and current is None:
        _invalid('factor_ids', 'عامل‌های مرتبط را انتخاب کنید.')
    return values


@transaction.atomic
def create_option(actor, workspace, body):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    if StrategyOption.objects.filter(workspace=locked).count() >= OPTION_LIMIT:
        _invalid('category', f'هر Workspace حداکثر {OPTION_LIMIT} گزینه TOWS دارد.')
    values = _option_values(body)
    factors = _factor_ids(locked, body['factor_ids'], values['category'])
    option = StrategyOption.objects.create(workspace=locked, created_by=actor, **values)
    option.factors.set(factors)
    return _option_payload(option)


@transaction.atomic
def update_option(actor, workspace, option_id, body):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    option = StrategyOption.objects.select_for_update().filter(workspace=locked, pk=option_id).first()
    if option is None:
        raise Http404('Strategy option is not available.')
    if not isinstance(body, dict) or set(body) - {'revision', 'category', 'title', 'action', 'rationale', 'hypothesis', 'cost', 'factor_ids'} or 'revision' not in body:
        _invalid('body', 'نسخه و فیلدهای معتبر گزینه را بفرستید.')
    _check_revision(option, body['revision'])
    if set(body) == {'revision'}:
        _invalid('body', 'حداقل یک فیلد برای تغییر بفرستید.')
    values = _option_values({key: value for key, value in body.items() if key != 'revision'}, current=option)
    category = values.get('category', option.category)
    if 'factor_ids' in body:
        factors = _factor_ids(locked, body['factor_ids'], category)
    else:
        factors = list(option.factors.select_for_update())
        expected_types = CATEGORY_FACTORS[category]
        types = {factor.factor_type for factor in factors}
        if not expected_types.issubset(types) or not types.issubset(expected_types):
            _invalid('factor_ids', 'با تغییر نوع راهبرد باید عامل‌های سازگار را هم انتخاب کنید.')
    changed = {key: value for key, value in values.items() if getattr(option, key) != value}
    factors_changed = set(option.factors.values_list('pk', flat=True)) != {factor.pk for factor in factors}
    needs_review = option.needs_review
    if changed or factors_changed or needs_review:
        for key, value in changed.items():
            setattr(option, key, value)
        option.needs_review = False
        option.revision += 1
        option.updated_at = timezone.now()
        option.save(update_fields=[*changed, 'needs_review', 'revision', 'updated_at'])
        option.factors.set(factors)
    return _option_payload(option)


@transaction.atomic
def delete_option(actor, workspace, option_id):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    option = StrategyOption.objects.select_for_update().filter(workspace=locked, pk=option_id).first()
    if option is None:
        raise Http404('Strategy option is not available.')
    option.delete()
    return {'id': str(option_id), 'deleted': True}
