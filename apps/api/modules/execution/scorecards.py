"""Workspace BSC aggregate. Exact decimals; explicit policy, never an overall score."""
import hashlib
import json
from datetime import timedelta
from decimal import Decimal, InvalidOperation, localcontext

from django.db import transaction
from django.http import Http404
from django.utils import timezone

from modules.workspaces.services import WorkspaceActionError
from .models import (Action, Decision, Goal, Scorecard, ScorecardObjective, ScorecardAction,
                     ScorecardIndicator, ScorecardObservation, ScorecardRelation,
                     ScorecardReview, ScorecardRevision)
from .services import (_access, _locked_workspace, _fields, _text, _uuid, _date,
                       _invalid, _check_revision, _member, create_action)

PERSPECTIVES = ('financial', 'customer', 'process', 'learning')
INDICATOR_FIELDS = ('name', 'definition', 'unit', 'formula', 'direction', 'baseline',
                    'baseline_on', 'target', 'target_high', 'warning_margin', 'due_on',
                    'cadence_days', 'source', 'owner_id', 'kind', 'guardrail')


def number(value, field):
    if value is None:
        return None
    if not isinstance(value, str) or len(value) > 40:
        _invalid(field, 'عدد رو با رقم و ممیز بنویس.')
    try:
        result = Decimal(value)
    except InvalidOperation:
        _invalid(field, 'عدد معتبر نیست.')
    if not result.is_finite() or abs(result) >= Decimal('1e18') or result.as_tuple().exponent < -6:
        _invalid(field, 'حداکثر ۱۸ رقم صحیح و ۶ رقم اعشار بنویس.')
    return result


def plain(record, fields):
    result = {}
    for field in fields:
        value = getattr(record, field)
        result[field] = value if value is None or isinstance(value, (str, int, bool, dict)) else str(value)
    return result


def assess(indicator, observations, today):
    """Absolute user-configured warning band. Baseline progress is not target/actual."""
    observed = [o for o in observations if o.observed_on <= today]
    latest = observed[-1] if observed else None
    value = latest.value if latest else None
    definition_changed = bool(latest and latest.definition_snapshot and any(
        latest.definition_snapshot.get(key) != getattr(indicator, key)
        for key in ('definition', 'unit', 'formula')))
    status, difference, progress = 'unknown', None, None
    if value is not None and indicator.target is not None and not definition_changed:
        if indicator.direction == 'range' and indicator.target_high is not None:
            difference = value - min(max(value, indicator.target), indicator.target_high)
            good = difference == 0
        else:
            difference = value - indicator.target
            good = difference >= 0 if indicator.direction == 'increase' else difference <= 0
        status = 'on_target' if good else ('near_target' if indicator.warning_margin is not None and abs(difference) <= indicator.warning_margin else 'off_target')
        baseline = indicator.baseline
        if indicator.direction != 'range' and baseline is not None and indicator.baseline_on <= latest.observed_on:
            span = indicator.target - baseline
            if (indicator.direction == 'increase' and span > 0) or (indicator.direction == 'decrease' and span < 0):
                with localcontext() as context:
                    context.prec = 64
                    progress = (100 * (value - baseline) / span).quantize(Decimal('.01'))
    # Don't connect across unknown readings or changed operational definitions.
    trend = None
    if len(observed) >= 2 and all(o.value is not None for o in observed[-2:]):
        a, b = observed[-2:]
        if a.observed_on < b.observed_on and a.definition_snapshot == b.definition_snapshot:
            trend = str(b.value - a.value)
    next_due = None
    if indicator.cadence_days:
        start = latest.observed_on if latest else indicator.baseline_on
        if start:
            next_due = start + timedelta(days=indicator.cadence_days)
    missing = [f for f in ('definition', 'unit', 'target', 'due_on', 'cadence_days', 'source', 'owner_id', 'baseline') if getattr(indicator, f) in (None, '')]
    return {'status': status, 'actual': str(value) if value is not None else None,
            'actual_unit': latest.definition_snapshot.get('unit', indicator.unit) if latest else indicator.unit,
            'definition_changed': definition_changed,
            'observed_on': str(latest.observed_on) if latest else None,
            'difference': str(difference) if difference is not None else None,
            'baseline_progress_percent': str(progress) if progress is not None else None,
            'trend_delta': trend, 'next_due': str(next_due) if next_due else None,
            'needs_review': bool(definition_changed or status != 'on_target' or missing or (next_due and next_due <= today) or (indicator.due_on and indicator.due_on < today)),
            'missing': missing}


def serialize(card):
    result = plain(card, ('id', 'title', 'scope', 'strategy', 'decision_id', 'period_start', 'period_end', 'revision', 'created_at', 'updated_at'))
    result['objectives'] = []
    for objective in sorted(card.objectives.all(), key=lambda o: (o.position, o.pk)):
        item = plain(objective, ('id', 'title', 'perspective', 'goal_id'))
        item['action_ids'] = [str(link.action_id) for link in sorted(objective.action_links.all(), key=lambda o: o.pk)]
        item['indicators'] = []
        for indicator in sorted(objective.indicators.all(), key=lambda o: (o.position, o.pk)):
            values = plain(indicator, ('id', *INDICATOR_FIELDS))
            observations = sorted(indicator.observations.all(), key=lambda o: (o.observed_on, o.created_at, o.pk))
            values['observations'] = [plain(o, ('id', 'observed_on', 'value', 'evidence', 'created_by_id', 'created_at', 'definition_snapshot')) for o in observations]
            values['assessment'] = assess(indicator, observations, timezone.localdate())
            item['indicators'].append(values)
        result['objectives'].append(item)
    result['relations'] = [plain(r, ('id', 'source_id', 'destination_id', 'rationale', 'test_method')) for r in sorted(card.relations.all(), key=lambda r: r.pk)]
    result['reviews'] = [plain(r, ('id', 'reviewed_on', 'decision', 'action_id', 'created_by_id', 'created_at')) for r in sorted(card.reviews.all(), key=lambda r: (r.reviewed_on, r.created_at))]
    return result


@transaction.atomic
def read_cards(actor, workspace):
    workspace = type(workspace).objects.select_for_update().get(pk=workspace.pk)
    role = _access(actor, workspace)
    return {'workspace_id': str(workspace.pk), 'can_edit': role in ('owner', 'editor') and not workspace.archived_at,
            'cards': [serialize(c) for c in Scorecard.objects.filter(workspace=workspace).order_by('-updated_at', 'id').prefetch_related('objectives__action_links', 'objectives__indicators__observations', 'relations', 'reviews')]}


def linked(model, workspace, value, field):
    if value is None:
        return None
    record = model.objects.filter(workspace=workspace, pk=_uuid(value, field)).first()
    if record is None:
        _invalid(field, 'این مورد باید در همین فضای کار باشه.')
    return record


def sequence(value, field, maximum):
    if not isinstance(value, list) or len(value) > maximum:
        _invalid(field, 'تعداد یا قالب موارد معتبر نیست.')
    return value


def existing_or_new(model, parent, values):
    record_id = _uuid(values['id'], 'id')
    record = model.objects.filter(pk=record_id).first()
    if record is not None and any(getattr(record, f'{k}_id') != v.pk for k, v in parent.items()):
        _invalid('id', 'شناسه به این کارت تعلق نداره.')
    return record or model(id=record_id, **parent)


def indicator_values(data, workspace):
    _fields(data, allowed={'id', *INDICATOR_FIELDS}, required={'id', *INDICATOR_FIELDS})
    result = {key: _text(data[key], key, limit, required=key == 'name') for key, limit in (
        ('name', 160), ('definition', 2000), ('unit', 80), ('formula', 1000), ('source', 500), ('guardrail', 500))}
    for key in ('direction', 'kind'):
        allowed = ('increase', 'decrease', 'range') if key == 'direction' else ('leading', 'lagging')
        if data[key] not in allowed:
            _invalid(key, 'گزینه معتبر نیست.')
        result[key] = data[key]
    for key in ('baseline', 'target', 'target_high', 'warning_margin'):
        result[key] = number(data[key], key)
    for key in ('baseline_on', 'due_on'):
        result[key] = _date(data[key], key, optional=True)
    if (result['baseline'] is None) != (result['baseline_on'] is None):
        _invalid('baseline', 'مقدار و تاریخ خط پایه رو با هم بنویس.')
    if result['direction'] == 'range':
        if (result['target'] is None) != (result['target_high'] is None) or (result['target'] is not None and result['target'] > result['target_high']):
            _invalid('target_high', 'حد بالا باید همراه حد پایین و بزرگ‌تر یا برابر اون باشه.')
    elif result['target_high'] is not None:
        _invalid('target_high', 'حد بالا فقط برای شاخص محدوده‌ایه.')
    if result['warning_margin'] is not None and result['warning_margin'] < 0:
        _invalid('warning_margin', 'حاشیهٔ هشدار منفی نیست.')
    cadence = data['cadence_days']
    if cadence is not None and (type(cadence) is not int or not 1 <= cadence <= 3660):
        _invalid('cadence_days', 'فاصلهٔ سنجش باید بین ۱ و ۳۶۶۰ روز باشه.')
    result['cadence_days'] = cadence
    result['owner'] = _member(workspace, data['owner_id']) if data['owner_id'] else None
    return result


def record_revision(card, actor):
    ScorecardRevision.objects.create(card=card, revision=card.revision, snapshot=serialize(card), actor=actor)


@transaction.atomic
def save_card(actor, workspace, data, card_id=None):
    workspace = _locked_workspace(workspace)
    _access(actor, workspace, write=True)
    allowed = {'id', 'revision', 'title', 'scope', 'strategy', 'decision_id', 'period_start', 'period_end', 'objectives', 'relations'}
    _fields(data, allowed=allowed, required=allowed)
    card = Scorecard.objects.filter(workspace=workspace, pk=card_id).first() if card_id else None
    if card_id and not card:
        raise Http404
    if card:
        _check_revision(card, data['revision'])
        if str(card.pk) != data['id']:
            _invalid('id', 'شناسهٔ کارت تغییر نمی‌کنه.')
    else:
        if type(data['revision']) is not int or data['revision'] != 0 or Scorecard.objects.filter(workspace=workspace).count() >= 30:
            _invalid('revision', 'نسخه یا تعداد کارت‌ها معتبر نیست.')
        # Client UUID survives uncertain network failures. Don't duplicate or silently overwrite.
        if Scorecard.objects.filter(pk=_uuid(data['id'], 'id')).exists():
            raise WorkspaceActionError(409, 'revision_conflict', 'کارت قبلاً ذخیره شده؛ نسخهٔ تازه رو بررسی کن.')
        card = Scorecard(id=data['id'], workspace=workspace, created_by=actor, revision=0)
    card.title = _text(data['title'], 'title', 160, required=True)
    card.scope = _text(data['scope'], 'scope', 1000)
    card.strategy = _text(data['strategy'], 'strategy', 2000)
    card.decision = linked(Decision, workspace, data['decision_id'], 'decision_id')
    card.period_start = _date(data['period_start'], 'period_start', optional=True)
    card.period_end = _date(data['period_end'], 'period_end', optional=True)
    if card.period_start and card.period_end and card.period_end < card.period_start:
        _invalid('period_end', 'پایان دوره باید بعد از شروع اون باشه.')
    readings = ScorecardObservation.objects.filter(indicator__objective__card=card)
    if (card.period_start and readings.filter(observed_on__lt=card.period_start).exists()) or (card.period_end and readings.filter(observed_on__gt=card.period_end).exists()):
        _invalid('period_start', 'دورهٔ تازه نباید مشاهده‌های قبلی رو بیرون از کارت قرار بده.')
    card.revision += 1
    card.save()
    seen_objectives, seen_indicators = set(), set()
    for index, item in enumerate(sequence(data['objectives'], 'objectives', 80)):
        _fields(item, allowed={'id', 'title', 'perspective', 'goal_id', 'action_ids', 'indicators'}, required={'id', 'title', 'perspective', 'goal_id', 'action_ids', 'indicators'})
        objective = existing_or_new(ScorecardObjective, {'card': card}, item)
        if objective.pk in seen_objectives or item['perspective'] not in PERSPECTIVES:
            _invalid('objectives', 'منظر یا شناسهٔ تکراری معتبر نیست.')
        seen_objectives.add(objective.pk)
        objective.title = _text(item['title'], 'title', 160, required=True)
        objective.perspective, objective.position = item['perspective'], index
        objective.goal = linked(Goal, workspace, item['goal_id'], 'goal_id')
        objective.save()
        action_ids = sequence(item['action_ids'], 'action_ids', 100)
        actions = [linked(Action, workspace, aid, 'action_ids') for aid in action_ids]
        if None in actions or len(set(action_ids)) != len(action_ids):
            _invalid('action_ids', 'اقدام تکراری یا نامشخصه.')
        objective.action_links.exclude(action_id__in=action_ids).delete()
        for action in actions:
            ScorecardAction.objects.get_or_create(objective=objective, action=action)
        for position, values in enumerate(sequence(item['indicators'], 'indicators', 20)):
            valid = indicator_values(values, workspace)
            indicator = existing_or_new(ScorecardIndicator, {'objective': objective}, values)
            if indicator.pk in seen_indicators:
                _invalid('indicators', 'شناسهٔ شاخص تکراریه.')
            seen_indicators.add(indicator.pk)
            for key, value in valid.items():
                setattr(indicator, key, value)
            indicator.position = position
            indicator.save()
    # Never erase measurements through an accidentally incomplete aggregate submission.
    if card.objectives.exclude(pk__in=seen_objectives).exists() or ScorecardIndicator.objects.filter(objective__card=card).exclude(pk__in=seen_indicators).exists():
        _invalid('objectives', 'حذف هدف یا شاخص ذخیره‌شده پشتیبانی نمی‌شه؛ تاریخچه حفظ می‌شه.')
    relation_ids, pairs = set(), set()
    for item in sequence(data['relations'], 'relations', 160):
        _fields(item, allowed={'id', 'source_id', 'destination_id', 'rationale', 'test_method'}, required={'id', 'source_id', 'destination_id', 'rationale', 'test_method'})
        relation = existing_or_new(ScorecardRelation, {'card': card}, item)
        source, destination = _uuid(item['source_id'], 'source_id'), _uuid(item['destination_id'], 'destination_id')
        if source == destination or not {source, destination} <= seen_objectives or (source, destination) in pairs or relation.pk in relation_ids:
            _invalid('relations', 'پیوند باید بین دو هدف متفاوت همین کارت باشه و تکراری نباشه.')
        pairs.add((source, destination))
        relation_ids.add(relation.pk)
        relation.source_id, relation.destination_id = source, destination
        relation.rationale = _text(item['rationale'], 'rationale', 2000, required=True)
        relation.test_method = _text(item['test_method'], 'test_method', 2000, required=True)
        relation.save()
    card.relations.exclude(pk__in=relation_ids).delete()
    record_revision(card, actor)
    return serialize(card)


@transaction.atomic
def append_record(actor, workspace, card_id, data, kind):
    workspace = _locked_workspace(workspace)
    _access(actor, workspace, write=True)
    card = Scorecard.objects.filter(workspace=workspace, pk=card_id).first()
    if not card:
        raise Http404
    fields = {'revision', 'request_id', 'indicator_id', 'observed_on', 'value', 'evidence'} if kind == 'observation' else {'revision', 'request_id', 'reviewed_on', 'decision', 'action_id'}
    _fields(data, allowed=fields, required=fields)
    request_id = _uuid(data['request_id'], 'request_id')
    if kind == 'observation':
        indicator = ScorecardIndicator.objects.filter(objective__card=card, pk=_uuid(data['indicator_id'], 'indicator_id')).first()
        if not indicator:
            raise Http404
        day = _date(data['observed_on'], 'observed_on')
        if day > timezone.localdate() or (card.period_start and day < card.period_start) or (card.period_end and day > card.period_end):
            _invalid('observed_on', 'تاریخ باید داخل دورهٔ کارت و حداکثر امروز باشه.')
        values = {'observed_on': day, 'value': number(data['value'], 'value'), 'evidence': _text(data['evidence'], 'evidence', 2000, required=True)}
        query = ScorecardObservation.objects.filter(indicator=indicator, request_id=request_id)
        kwargs = {'indicator': indicator, 'definition_snapshot': plain(indicator, INDICATOR_FIELDS)}
    else:
        day = _date(data['reviewed_on'], 'reviewed_on')
        if day > timezone.localdate():
            _invalid('reviewed_on', 'تاریخ مرور نمی‌تونه در آینده باشه.')
        values = {'reviewed_on': day, 'decision': _text(data['decision'], 'decision', 2000, required=True), 'action': linked(Action, workspace, data['action_id'], 'action_id')}
        query = ScorecardReview.objects.filter(card=card, request_id=request_id)
        kwargs = {'card': card}
    previous = query.first()
    if previous:
        if previous.created_by_id != actor.pk or any(getattr(previous, key) != value for key, value in values.items()):
            raise WorkspaceActionError(409, 'retry_conflict', 'این درخواست قبلاً با اطلاعات متفاوت ثبت شده.')
        return serialize(card)
    _check_revision(card, data['revision'])
    query.model.objects.create(request_id=request_id, created_by=actor, **kwargs, **values)
    card.revision += 1
    card.save(update_fields=['revision', 'updated_at'])
    record_revision(card, actor)
    return serialize(card)


@transaction.atomic
def add_action(actor, workspace, card_id, objective_id, data):
    workspace = _locked_workspace(workspace)
    _access(actor, workspace, write=True)
    objective = ScorecardObjective.objects.filter(card_id=card_id, card__workspace=workspace, pk=objective_id).select_related('card').first()
    if not objective:
        raise Http404
    _fields(data, allowed={'revision', 'request_id', 'action'}, required={'revision', 'request_id', 'action'})
    request_id = _uuid(data['request_id'], 'request_id')
    fingerprint = hashlib.sha256(json.dumps({'actor': str(actor.pk), 'action': data['action']}, sort_keys=True).encode()).hexdigest()
    previous = objective.action_links.filter(request_id=request_id).first()
    if previous:
        if previous.request_fingerprint != fingerprint:
            raise WorkspaceActionError(409, 'retry_conflict', 'این درخواست با اطلاعات دیگری ثبت شده.')
        return serialize(objective.card)
    _check_revision(objective.card, data['revision'])
    body = data['action']
    if not isinstance(body, dict) or body.get('goal_id') != (str(objective.goal_id) if objective.goal_id else None):
        _invalid('goal_id', 'اقدام باید به هدف پیوندشدهٔ همین کارت وصل باشه.')
    result = create_action(actor, workspace, body)
    ScorecardAction.objects.create(objective=objective, action_id=result['id'], request_id=request_id, request_fingerprint=fingerprint)
    card = objective.card
    card.revision += 1
    card.save(update_fields=['revision', 'updated_at'])
    record_revision(card, actor)
    return serialize(card)
