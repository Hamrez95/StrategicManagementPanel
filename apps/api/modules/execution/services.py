from datetime import date, timedelta
import re
from uuid import UUID

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count
from django.http import Http404
from django.utils import timezone

from modules.analysis.models import Analysis
from modules.strategy.models import StrategyOption
from modules.workspaces.models import Membership, Workspace
from modules.workspaces.services import WorkspaceActionError, workspace_role

from .models import Action, Decision, ExecutionEvent, Goal

DECISION_LIMIT = 100
GOAL_LIMIT = 100
ACTION_LIMIT = 500
EVENT_LIMIT = 100


def _invalid(field, message):
    raise DjangoValidationError({field: [message]})


def _access(actor, workspace, *, write=False):
    role = workspace_role(actor, workspace)
    if role is None:
        raise Http404('Workspace is not available.')
    if write and role not in {'owner', 'editor'}:
        raise WorkspaceActionError(403, 'workspace_permission_denied', 'برای تغییر برنامه دسترسی لازم را ندارید.')
    return role


def _locked_workspace(workspace):
    locked = Workspace.objects.select_for_update().filter(pk=workspace.pk).first()
    if locked is None:
        raise Http404('Workspace is not available.')
    if locked.archived_at is not None:
        raise WorkspaceActionError(409, 'workspace_archived', 'فضای بایگانی‌شده قابل ویرایش نیست.')
    return locked


def _fields(body, *, allowed, required=()):
    if not isinstance(body, dict) or set(body) - set(allowed) or set(required) - set(body):
        _invalid('body', 'ساختار درخواست معتبر نیست.')


def _text(value, field, maximum, *, required=False):
    if not isinstance(value, str):
        _invalid(field, 'این مقدار باید متن باشد.')
    normalized = value.strip()
    if required and not normalized:
        _invalid(field, 'این فیلد را تکمیل کنید.')
    if len(normalized) > maximum:
        _invalid(field, f'این مقدار نباید بیشتر از {maximum} نویسه باشد.')
    return normalized


def _uuid(value, field):
    if not isinstance(value, str):
        _invalid(field, 'شناسه معتبر نیست.')
    try:
        return UUID(value)
    except (ValueError, AttributeError):
        _invalid(field, 'شناسه معتبر نیست.')


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


def _date(value, field, *, optional=False):
    if value is None and optional:
        return None
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        _invalid(field, 'تاریخ را با قالب سال-ماه-روز وارد کنید.')
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        _invalid(field, 'تاریخ معتبر نیست.')
    if parsed.isoformat() != value:
        _invalid(field, 'تاریخ معتبر نیست.')
    return parsed


def _source(workspace, kind, source_id):
    if kind not in {'analysis', 'strategy_option'} or source_id is None:
        _invalid('source_id', 'یک منبع معتبر از همین فضای کار انتخاب کنید.')
    source_uuid = _uuid(source_id, 'source_id')
    if kind == 'analysis':
        record = Analysis.objects.filter(workspace=workspace, pk=source_uuid).first()
        if record is None or record.state != Analysis.State.FINALIZED:
            _invalid('source_id', 'برای تصمیم، یک تحلیل نهایی‌شده از همین فضا انتخاب کنید.')
        snapshot = {'kind': 'analysis', 'id': str(record.pk), 'title': record.kind.upper()}
        return record, None, snapshot
    record = StrategyOption.objects.filter(workspace=workspace, pk=source_uuid).first()
    if record is None:
        _invalid('source_id', 'گزینه راهبردی باید در همین فضای کار باشد.')
    if record.needs_review:
        _invalid('source_id', 'پیش از پیوند، گزینه راهبردی نیازمند بازبینی را اصلاح کنید.')
    return None, record, {'kind': 'strategy_option', 'id': str(record.pk), 'title': record.title}


def _source_payload(decision):
    if decision.source_analysis_id:
        return {
            'kind': 'analysis',
            'id': str(decision.source_analysis_id),
            'title': decision.source_analysis.kind.upper(),
        }
    if decision.source_option_id:
        return {
            'kind': 'strategy_option',
            'id': str(decision.source_option_id),
            'title': decision.source_option.title,
        }
    snapshot = decision.source_snapshot
    if isinstance(snapshot, dict) and snapshot.get('kind') and snapshot.get('id') and snapshot.get('title'):
        return snapshot
    return None


def _decision_values(workspace, body, *, preserved_source=None):
    allowed = {
        'title', 'rationale', 'assumptions', 'review_trigger', 'status',
        'source_kind', 'source_id',
    }
    _fields(body, allowed=allowed, required={'title', 'rationale', 'assumptions', 'review_trigger', 'status', 'source_kind', 'source_id'})
    status = body['status']
    if not isinstance(status, str) or status not in Decision.Status.values:
        _invalid('status', 'وضعیت تصمیم معتبر نیست.')
    source_kind = body['source_kind']
    if not isinstance(source_kind, str):
        _invalid('source_kind', 'نوع منبع معتبر نیست.')
    if preserved_source is None:
        source_analysis, source_option, source_snapshot = _source(workspace, source_kind, body['source_id'])
    else:
        source_analysis, source_option, source_snapshot = None, None, preserved_source
    return {
        'title': _text(body['title'], 'title', 160, required=True),
        'rationale': _text(body['rationale'], 'rationale', 2000, required=True),
        'assumptions': _text(body['assumptions'], 'assumptions', 2000, required=True),
        'review_trigger': _text(body['review_trigger'], 'review_trigger', 500, required=True),
        'status': status,
        'source_analysis': source_analysis,
        'source_option': source_option,
        'source_snapshot': source_snapshot,
    }


def _goal_values(body):
    allowed = {'title', 'description', 'due_on', 'status'}
    _fields(body, allowed=allowed, required={'title', 'description', 'due_on', 'status'})
    status = body['status']
    if not isinstance(status, str) or status not in Goal.Status.values:
        _invalid('status', 'وضعیت هدف معتبر نیست.')
    return {
        'title': _text(body['title'], 'title', 160, required=True),
        'description': _text(body['description'], 'description', 1000),
        'due_on': _date(body['due_on'], 'due_on', optional=True),
        'status': status,
    }


def _member(workspace, value):
    user_id = _uuid(value, 'owner_id')
    owner = workspace.owner
    if owner.pk == user_id and owner.is_active and owner.email_verified_at is not None:
        return owner
    membership = Membership.objects.select_related('user').filter(
        workspace=workspace,
        user_id=user_id,
        user__is_active=True,
        user__email_verified_at__isnull=False,
    ).first()
    if membership is None:
        _invalid('owner_id', 'مسئول باید مالک یا عضو فعال همین فضای کار باشد.')
    return membership.user


def _action_values(workspace, body, *, current=None):
    allowed = {'decision_id', 'goal_id', 'owner_id', 'title', 'description', 'due_on', 'status'}
    required = {'decision_id', 'goal_id', 'owner_id', 'title', 'description', 'due_on', 'status'}
    _fields(body, allowed=allowed, required=required)
    decision = Decision.objects.filter(workspace=workspace, pk=_uuid(body['decision_id'], 'decision_id')).first()
    if decision is None:
        _invalid('decision_id', 'تصمیم باید متعلق به همین فضای کار باشد.')
    goal = None
    if body['goal_id'] is not None:
        goal = Goal.objects.filter(workspace=workspace, pk=_uuid(body['goal_id'], 'goal_id')).first()
        if goal is None:
            _invalid('goal_id', 'هدف باید متعلق به همین فضای کار باشد.')
        if goal.status == Goal.Status.COMPLETE and (current is None or current.goal_id != goal.pk):
            _invalid('goal_id', 'اقدام تازه را به یک هدف فعال پیوند دهید.')
    status = body['status']
    if not isinstance(status, str) or status not in Action.Status.values:
        _invalid('status', 'وضعیت اقدام معتبر نیست.')
    owner_id = _uuid(body['owner_id'], 'owner_id')
    owner = current.owner if current is not None and current.owner_id == owner_id else _member(workspace, body['owner_id'])
    return {
        'decision': decision,
        'goal': goal,
        'owner': owner,
        'title': _text(body['title'], 'title', 160, required=True),
        'description': _text(body['description'], 'description', 1000),
        'due_on': _date(body['due_on'], 'due_on'),
        'status': status,
    }


def _decision_snapshot(record):
    source = _source_payload(record)
    return {
        'title': record.title,
        'rationale': record.rationale,
        'assumptions': record.assumptions,
        'review_trigger': record.review_trigger,
        'status': record.status,
        'source': source,
    }


def _goal_snapshot(record):
    return {
        'title': record.title,
        'description': record.description,
        'due_on': record.due_on.isoformat() if record.due_on else None,
        'status': record.status,
    }


def _action_snapshot(record):
    return {
        'title': record.title,
        'description': record.description,
        'due_on': record.due_on.isoformat(),
        'status': record.status,
        'owner_id': str(record.owner_id),
        'owner_name': record.owner.display_name.strip() or record.owner.email,
        'decision_id': str(record.decision_id),
        'decision_title': record.decision.title,
        'goal_id': str(record.goal_id) if record.goal_id else None,
        'goal_title': record.goal.title if record.goal_id else None,
    }


def _record_event(workspace, actor, entity_type, record, event_type, changes, label):
    ExecutionEvent.objects.create(
        workspace=workspace,
        actor=actor,
        entity_type=entity_type,
        entity_id=record.pk,
        entity_label=label[:160],
        event_type=event_type,
        changes=changes,
    )


def _changes(before, after):
    return {
        key: {'from': before.get(key), 'to': value}
        for key, value in after.items()
        if before.get(key) != value
    }


def _decision_payload(record):
    action_count = getattr(record, 'action_count_value', None)
    if action_count is None:
        action_count = record.actions.count()
    return {
        'id': str(record.pk),
        'title': record.title,
        'rationale': record.rationale,
        'assumptions': record.assumptions,
        'review_trigger': record.review_trigger,
        'source': _source_payload(record),
        'status': record.status,
        'revision': record.revision,
        'action_count': action_count,
        'created_at': record.created_at,
        'updated_at': record.updated_at,
    }


def _goal_payload(record):
    action_count = getattr(record, 'action_count_value', None)
    if action_count is None:
        action_count = record.actions.count()
    return {
        'id': str(record.pk),
        'title': record.title,
        'description': record.description,
        'due_on': record.due_on.isoformat() if record.due_on else None,
        'status': record.status,
        'revision': record.revision,
        'action_count': action_count,
        'created_at': record.created_at,
        'updated_at': record.updated_at,
    }


def _action_payload(record, today):
    due_on = record.due_on.isoformat()
    return {
        'id': str(record.pk),
        'decision_id': str(record.decision_id),
        'decision_title': record.decision.title,
        'goal_id': str(record.goal_id) if record.goal_id else None,
        'goal_title': record.goal.title if record.goal_id else None,
        'owner_id': str(record.owner_id),
        'owner_name': record.owner.display_name.strip() or record.owner.email,
        'title': record.title,
        'description': record.description,
        'due_on': due_on,
        'overdue': record.status != Action.Status.DONE and record.due_on < today,
        'status': record.status,
        'revision': record.revision,
        'created_at': record.created_at,
        'updated_at': record.updated_at,
    }


def _event_payload(record):
    return {
        'id': str(record.pk),
        'entity_type': record.entity_type,
        'entity_id': str(record.entity_id),
        'entity_label': record.entity_label,
        'event_type': record.event_type,
        'changes': record.changes,
        'actor_name': record.actor.display_name.strip() or record.actor.email,
        'created_at': record.created_at,
    }


@transaction.atomic
def read_execution_board(actor, workspace):
    role = _access(actor, workspace)
    today = timezone.localdate()
    end = today + timedelta(days=90)
    decisions = Decision.objects.filter(workspace=workspace).select_related('source_analysis', 'source_option').annotate(action_count_value=Count('actions'))
    goals = Goal.objects.filter(workspace=workspace).annotate(action_count_value=Count('actions'))
    actions = Action.objects.filter(workspace=workspace).select_related('decision', 'goal', 'owner')
    events_query = ExecutionEvent.objects.filter(workspace=workspace).select_related('actor').order_by('-created_at', '-id')
    events = list(events_query[:EVENT_LIMIT])
    users = [workspace.owner] if workspace.owner.is_active and workspace.owner.email_verified_at is not None else []
    users.extend(
        membership.user
        for membership in Membership.objects.select_related('user').filter(
            workspace=workspace, user__is_active=True, user__email_verified_at__isnull=False,
        ).exclude(
            user_id=workspace.owner_id,
        )
    )
    member_payload = [
        {'id': str(user.pk), 'name': user.display_name.strip() or user.email, 'role': 'owner' if user.pk == workspace.owner_id else 'member'}
        for user in users
    ]
    analyses = Analysis.objects.filter(workspace=workspace, state=Analysis.State.FINALIZED).order_by('kind')
    options = StrategyOption.objects.filter(workspace=workspace, needs_review=False).order_by('title', 'id')
    return {
        'workspace_id': str(workspace.pk),
        'role': role,
        'today': today.isoformat(),
        'horizon_end': end.isoformat(),
        'history_limit': EVENT_LIMIT,
        'decisions': [_decision_payload(item) for item in decisions],
        'goals': [_goal_payload(item) for item in goals],
        'actions': [_action_payload(item, today) for item in actions],
        'events': [_event_payload(item) for item in events],
        'members': member_payload,
        'sources': [
            {'kind': 'analysis', 'id': str(item.pk), 'title': item.kind.upper()}
            for item in analyses
        ] + [
            {'kind': 'strategy_option', 'id': str(item.pk), 'title': item.title}
            for item in options
        ],
    }


@transaction.atomic
def create_decision(actor, workspace, body):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    if Decision.objects.filter(workspace=locked).count() >= DECISION_LIMIT:
        _invalid('title', f'هر فضای کار حداکثر {DECISION_LIMIT} تصمیم دارد.')
    values = _decision_values(locked, body)
    record = Decision.objects.create(workspace=locked, created_by=actor, **values)
    _record_event(locked, actor, ExecutionEvent.EntityType.DECISION, record, 'created', _decision_snapshot(record), record.title)
    return _decision_payload(record)


@transaction.atomic
def update_decision(actor, workspace, record_id, body):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    record = Decision.objects.select_for_update().filter(workspace=locked, pk=record_id).first()
    if record is None:
        raise Http404('Decision is not available.')
    _fields(body, allowed={'revision', 'title', 'rationale', 'assumptions', 'review_trigger', 'status', 'source_kind', 'source_id'}, required={'revision'})
    _check_revision(record, body['revision'])
    if set(body) == {'revision'}:
        _invalid('body', 'حداقل یک فیلد برای تغییر بفرستید.')
    previous = _decision_snapshot(record)
    merged = {
        'title': body.get('title', record.title),
        'rationale': body.get('rationale', record.rationale),
        'assumptions': body.get('assumptions', record.assumptions),
        'review_trigger': body.get('review_trigger', record.review_trigger),
        'status': body.get('status', record.status),
        'source_kind': body.get('source_kind', (record.source_snapshot or {}).get('kind', '')),
        'source_id': body.get('source_id', (record.source_snapshot or {}).get('id')),
    }
    old_source = record.source_snapshot if isinstance(record.source_snapshot, dict) else {}
    if not old_source:
        old_source = _source_payload(record) or {}
    requested_source = {'kind': merged['source_kind'], 'id': merged['source_id']}
    same_source_preserved = (
        old_source.get('kind') == requested_source['kind']
        and old_source.get('id') == requested_source['id']
    )
    values = _decision_values(
        locked,
        merged,
        preserved_source=old_source if same_source_preserved else None,
    )
    if same_source_preserved:
        values.update(
            source_analysis=record.source_analysis if record.source_analysis_id else None,
            source_option=record.source_option if record.source_option_id else None,
            source_snapshot=old_source,
        )
    changed = {}
    after = {
        'title': values['title'],
        'rationale': values['rationale'],
        'assumptions': values['assumptions'],
        'review_trigger': values['review_trigger'],
        'status': values['status'],
        'source': values['source_snapshot'] or None,
    }
    differences = _changes(previous, after)
    for key, value in values.items():
        current = getattr(record, key)
        if current != value:
            setattr(record, key, value)
            changed[key] = value
    if differences:
        record.revision += 1
        record.save(update_fields=[*changed.keys(), 'revision', 'updated_at'])
        _record_event(locked, actor, ExecutionEvent.EntityType.DECISION, record, 'updated', differences, record.title)
    return _decision_payload(record)


@transaction.atomic
def create_goal(actor, workspace, body):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    if Goal.objects.filter(workspace=locked).count() >= GOAL_LIMIT:
        _invalid('title', f'هر فضای کار حداکثر {GOAL_LIMIT} هدف دارد.')
    values = _goal_values(body)
    record = Goal.objects.create(workspace=locked, created_by=actor, **values)
    _record_event(locked, actor, ExecutionEvent.EntityType.GOAL, record, 'created', _goal_snapshot(record), record.title)
    return _goal_payload(record)


@transaction.atomic
def update_goal(actor, workspace, record_id, body):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    record = Goal.objects.select_for_update().filter(workspace=locked, pk=record_id).first()
    if record is None:
        raise Http404('Goal is not available.')
    _fields(body, allowed={'revision', 'title', 'description', 'due_on', 'status'}, required={'revision'})
    _check_revision(record, body['revision'])
    if set(body) == {'revision'}:
        _invalid('body', 'حداقل یک فیلد برای تغییر بفرستید.')
    previous = _goal_snapshot(record)
    merged = {key: body.get(key, getattr(record, key).isoformat() if key == 'due_on' and record.due_on else getattr(record, key)) for key in ('title', 'description', 'due_on', 'status')}
    values = _goal_values(merged)
    differences = _changes(previous, _goal_snapshot(Goal(**values)))
    changed = [key for key, value in values.items() if getattr(record, key) != value]
    if changed:
        for key in changed:
            setattr(record, key, values[key])
        if record.status == Goal.Status.COMPLETE and record.actions.filter(status__in=[Action.Status.PLANNED, Action.Status.IN_PROGRESS, Action.Status.BLOCKED]).exists():
            _invalid('status', 'پیش از بستن هدف، اقدام‌های باز را تکمیل یا به هدف دیگری پیوند دهید.')
        record.revision += 1
        record.save(update_fields=[*changed, 'revision', 'updated_at'])
        _record_event(locked, actor, ExecutionEvent.EntityType.GOAL, record, 'updated', differences, record.title)
    return _goal_payload(record)


@transaction.atomic
def create_action(actor, workspace, body):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    if Action.objects.filter(workspace=locked).count() >= ACTION_LIMIT:
        _invalid('title', f'هر فضای کار حداکثر {ACTION_LIMIT} اقدام دارد.')
    values = _action_values(locked, body)
    record = Action.objects.create(workspace=locked, created_by=actor, **values)
    _record_event(locked, actor, ExecutionEvent.EntityType.ACTION, record, 'created', _action_snapshot(record), record.title)
    return _action_payload(record, timezone.localdate())


@transaction.atomic
def update_action(actor, workspace, record_id, body):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    record = Action.objects.select_for_update().filter(workspace=locked, pk=record_id).first()
    if record is None:
        raise Http404('Action is not available.')
    _fields(body, allowed={'revision', 'decision_id', 'goal_id', 'owner_id', 'title', 'description', 'due_on', 'status'}, required={'revision'})
    _check_revision(record, body['revision'])
    if set(body) == {'revision'}:
        _invalid('body', 'حداقل یک فیلد برای تغییر بفرستید.')
    previous = _action_snapshot(record)
    merged = {
        'decision_id': body.get('decision_id', str(record.decision_id)),
        'goal_id': body.get('goal_id', str(record.goal_id) if record.goal_id else None),
        'owner_id': body.get('owner_id', str(record.owner_id)),
        'title': body.get('title', record.title),
        'description': body.get('description', record.description),
        'due_on': body.get('due_on', record.due_on.isoformat()),
        'status': body.get('status', record.status),
    }
    values = _action_values(locked, merged, current=record)
    after_record = Action(**values)
    after_record.decision = values['decision']
    after_record.goal = values['goal']
    after_record.owner = values['owner']
    after = {
        'title': after_record.title,
        'description': after_record.description,
        'due_on': after_record.due_on.isoformat(),
        'status': after_record.status,
        'owner_id': str(after_record.owner_id),
        'owner_name': after_record.owner.display_name.strip() or after_record.owner.email,
        'decision_id': str(after_record.decision_id),
        'decision_title': after_record.decision.title,
        'goal_id': str(after_record.goal_id) if after_record.goal_id else None,
        'goal_title': after_record.goal.title if after_record.goal_id else None,
    }
    differences = _changes(previous, after)
    changed = [key for key, value in values.items() if getattr(record, f'{key}_id' if key in {'decision', 'goal', 'owner'} else key) != (value.pk if key in {'decision', 'goal', 'owner'} and value else value)]
    if differences:
        for key, value in values.items():
            setattr(record, key, value)
        record.revision += 1
        record.save(update_fields=[*changed, 'revision', 'updated_at'])
        event_type = 'status_changed' if set(differences) == {'status'} else 'updated'
        _record_event(locked, actor, ExecutionEvent.EntityType.ACTION, record, event_type, differences, record.title)
    return _action_payload(record, timezone.localdate())
