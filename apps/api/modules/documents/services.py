from uuid import UUID

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.http import Http404

from modules.workspaces.models import Membership, Workspace
from modules.workspaces.services import WorkspaceActionError, workspace_role

from .catalog import document_catalog
from .models import DocumentEvent, DocumentRecord

MAX_RECORDS = 60
MAX_EVENTS = 50
MAX_CONTENT = 16000


def _invalid(field, message):
    raise DjangoValidationError({field: [message]})


def _access(actor, workspace, *, write=False):
    role = workspace_role(actor, workspace)
    if role is None:
        raise Http404('Workspace is not available.')
    if write and role not in {'owner', 'editor'}:
        raise WorkspaceActionError(403, 'workspace_permission_denied', 'برای تغییر راهنمای مدارک دسترسی لازم را ندارید.')
    return role


def _locked_workspace(workspace):
    locked = Workspace.objects.select_for_update().filter(pk=workspace.pk).first()
    if locked is None:
        raise Http404('Workspace is not available.')
    if locked.archived_at is not None:
        raise WorkspaceActionError(409, 'workspace_archived', 'فضای بایگانی‌شده قابل ویرایش نیست.')
    return locked


def _record_event(workspace, document, actor, event_type, changes):
    DocumentEvent.objects.create(
        workspace=workspace,
        document=document,
        actor=actor,
        event_type=event_type,
        changes=changes,
    )


def _member(workspace, value, field, *, optional=False):
    if optional and value is None:
        return None
    try:
        user_id = UUID(value) if isinstance(value, str) else None
    except (ValueError, AttributeError):
        user_id = None
    if user_id is None:
        _invalid(field, 'عضو انتخاب‌شده معتبر نیست.')
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
        _invalid(field, 'این فرد عضو فعال همین فضای کار نیست.')
    if optional and membership.role != Membership.Role.EDITOR:
        _invalid(field, 'بازبین باید مالک یا ویرایشگر همین فضای کار باشد.')
    return membership.user


def _catalog_entry(template_id):
    record = next((item for item in document_catalog()['documents'] if item['id'] == template_id), None)
    if record is None:
        _invalid('template_id', 'راهنمای انتخاب‌شده در کاتالوگ موجود نیست.')
    return record


def _filter_options(query, valid_ids, field):
    value = query or ''
    if value and value not in valid_ids:
        _invalid(field, 'فیلتر انتخاب‌شده معتبر نیست.')
    return value


def _document_payload(record):
    if record is None:
        return None
    return {
        'id': str(record.pk),
        'template_id': record.template_id,
        'stage': record.stage,
        'industry': record.industry,
        'owner_id': str(record.owner_id),
        'owner_name': record.owner.display_name.strip() or record.owner.email,
        'reviewer_id': str(record.reviewer_id) if record.reviewer_id else None,
        'reviewer_name': (record.reviewer.display_name.strip() or record.reviewer.email) if record.reviewer_id else None,
        'status': record.status,
        'content': record.content,
        'content_version': record.content_version,
        'revision': record.revision,
        'created_at': record.created_at,
        'updated_at': record.updated_at,
    }


def _event_payload(event):
    return {
        'id': str(event.pk),
        'template_id': event.document.template_id,
        'event_type': event.event_type,
        'changes': event.changes,
        'actor_name': event.actor.display_name.strip() or event.actor.email,
        'created_at': event.created_at,
    }


@transaction.atomic
def read_document_board(actor, workspace, *, stage='', industry=''):
    role = _access(actor, workspace)
    catalog = document_catalog()
    stage = _filter_options(stage, {item['id'] for item in catalog['stages']}, 'stage')
    industry = _filter_options(industry, {item['id'] for item in catalog['industries']}, 'industry')
    records = {
        item.template_id: item
        for item in DocumentRecord.objects.filter(workspace=workspace).select_related('owner', 'reviewer')
    }
    items = []
    for template in catalog['documents']:
        record = records.get(template['id'])
        if stage and (record.stage != stage if record else stage not in template['stages']):
            continue
        if industry and (record.industry != industry if record else industry != 'general' and industry not in template['industries'] and 'general' not in template['industries']):
            continue
        items.append({**template, 'record': _document_payload(record)})
    workspace_members = []
    if workspace.owner.is_active and workspace.owner.email_verified_at is not None:
        workspace_members.append((workspace.owner, 'owner'))
    workspace_members.extend(
        (membership.user, membership.role)
        for membership in Membership.objects.select_related('user').filter(
            workspace=workspace,
            user__is_active=True,
            user__email_verified_at__isnull=False,
        ).exclude(user_id=workspace.owner_id)
    )
    members = [
        {
            'id': str(user.pk),
            'name': user.display_name.strip() or user.email,
            'role': member_role,
        }
        for user, member_role in workspace_members
    ]
    events = DocumentEvent.objects.filter(workspace=workspace).select_related('document', 'actor')[:MAX_EVENTS]
    return {
        'workspace_id': str(workspace.pk),
        'role': role,
        'history_limit': MAX_EVENTS,
        'stages': catalog['stages'],
        'industries': catalog['industries'],
        'sections': catalog['sections'],
        'priorities': catalog['priorities'],
        'items': items,
        'members': members,
        'events': [_event_payload(event) for event in events],
    }


def _write_values(workspace, actor, body, *, current=None):
    allowed = {'template_id', 'stage', 'industry', 'owner_id', 'reviewer_id', 'status', 'content', 'revision'}
    if not isinstance(body, dict) or set(body) - allowed:
        _invalid('body', 'ساختار درخواست معتبر نیست.')
    if current is None:
        if 'revision' in body:
            _invalid('revision', 'نسخه فقط هنگام ویرایش رکورد ارسال می‌شود.')
        required = {'template_id', 'stage', 'industry', 'owner_id', 'reviewer_id', 'status', 'content'}
        if required - set(body):
            _invalid('body', 'همه فیلدهای لازم را تکمیل کنید.')
    elif 'revision' not in body:
        _invalid('revision', 'نسخه فعلی رکورد را بفرستید.')
    catalog = document_catalog()
    template = _catalog_entry(body.get('template_id', current.template_id if current else ''))
    if current is not None and body.get('template_id', current.template_id) != current.template_id:
        _invalid('template_id', 'شناسه راهنما پس از ثبت تغییر نمی‌کند.')
    stage = body.get('stage', current.stage if current else '')
    industry = body.get('industry', current.industry if current else '')
    stage_ids = {item['id'] for item in catalog['stages']}
    industry_ids = {item['id'] for item in catalog['industries']}
    if not isinstance(stage, str) or stage not in stage_ids or stage not in template['stages']:
        _invalid('stage', 'این راهنما برای مرحله انتخاب‌شده فهرست نشده است.')
    if not isinstance(industry, str) or industry not in industry_ids or (industry != 'general' and industry not in template['industries'] and 'general' not in template['industries']):
        _invalid('industry', 'این راهنما برای صنعت انتخاب‌شده فهرست نشده است.')
    owner_value = body.get('owner_id')
    owner = (
        current.owner
        if current is not None and ('owner_id' not in body or owner_value == str(current.owner_id))
        else _member(workspace, owner_value, 'owner_id')
    )
    reviewer_value = body.get('reviewer_id')
    reviewer = (
        current.reviewer
        if current is not None and ('reviewer_id' not in body or reviewer_value == str(current.reviewer_id))
        else _member(workspace, reviewer_value, 'reviewer_id', optional=True)
    )
    content = body.get('content', current.content if current else '')
    if not isinstance(content, str) or len(content) > MAX_CONTENT:
        _invalid('content', f'متن راهنما باید حداکثر {MAX_CONTENT} نویسه باشد.')
    if template['catalog_state'] != 'mvp' and content:
        _invalid('content', 'ثبت محتوای راهنما در این نسخه فقط برای پنج الگوی MVP فعال است.')
    status = body.get('status', current.status if current else DocumentRecord.Status.DRAFT)
    if status not in DocumentRecord.Status.values:
        _invalid('status', 'وضعیت سند معتبر نیست.')
    if current is not None and current.status == DocumentRecord.Status.READY and content != current.content:
        status = DocumentRecord.Status.DRAFT
    if status in {DocumentRecord.Status.REVIEW, DocumentRecord.Status.READY} and reviewer is None:
        _invalid('reviewer_id', 'برای ارسال به بازبینی یا آماده‌کردن سند، بازبین انتخاب کنید.')
    if status == DocumentRecord.Status.READY and template['catalog_state'] == 'mvp' and not content.strip():
        _invalid('content', 'برای آماده‌کردن یکی از پنج راهنمای MVP، متن سند را تکمیل کنید.')
    if status == DocumentRecord.Status.READY and current is None:
        _invalid('status', 'راهنمای تازه را ابتدا به پیش‌نویس یا بازبینی ببرید.')
    if status == DocumentRecord.Status.READY and current is not None and current.status != status:
        if actor.pk != workspace.owner_id and actor.pk != current.reviewer_id:
            raise WorkspaceActionError(403, 'reviewer_permission_denied', 'فقط بازبین تعیین‌شده یا مالک فضا می‌تواند سند را آماده کند.')
    return {
        'template_id': template['id'],
        'stage': stage,
        'industry': industry,
        'owner': owner,
        'reviewer': reviewer,
        'status': status,
        'content': content,
    }


def _event_changes(before, after, *, version_before, version_after):
    changes = {}
    for key, value in after.items():
        previous = before.get(key)
        if key == 'content':
            if previous != value:
                changes[key] = {'from_version': version_before, 'to_version': version_after}
        else:
            previous_value = str(previous.pk) if hasattr(previous, 'pk') else previous
            current_value = str(value.pk) if hasattr(value, 'pk') else value
            if previous_value != current_value:
                changes[key] = {'from': previous_value, 'to': current_value}
    return changes


@transaction.atomic
def create_document_record(actor, workspace, body):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    if DocumentRecord.objects.filter(workspace=locked).count() >= MAX_RECORDS:
        _invalid('template_id', f'هر فضای کار حداکثر {MAX_RECORDS} راهنمای ثبت‌شده دارد.')
    values = _write_values(locked, actor, body)
    try:
        record = DocumentRecord.objects.create(workspace=locked, created_by=actor, updated_by=actor, **values)
    except IntegrityError:
        _invalid('template_id', 'این راهنما از قبل در فضای کار ثبت شده است.')
    _record_event(locked, record, actor, 'created', {'status': {'from': None, 'to': record.status}, 'content_version': {'from': None, 'to': 1}})
    return _document_payload(record)


@transaction.atomic
def update_document_record(actor, workspace, record_id, body):
    locked = _locked_workspace(workspace)
    _access(actor, locked, write=True)
    try:
        record_uuid = UUID(str(record_id))
    except (ValueError, AttributeError):
        raise Http404('Document is not available.')
    record = DocumentRecord.objects.select_for_update(of=('self',)).select_related('owner', 'reviewer').filter(workspace=locked, pk=record_uuid).first()
    if record is None:
        raise Http404('Document is not available.')
    if not isinstance(body, dict) or set(body) - {'stage', 'industry', 'owner_id', 'reviewer_id', 'status', 'content', 'revision'} or 'revision' not in body:
        _invalid('body', 'ساختار درخواست معتبر نیست.')
    if isinstance(body['revision'], bool) or not isinstance(body['revision'], int) or body['revision'] != record.revision:
        raise WorkspaceActionError(409, 'revision_conflict', 'نسخه این راهنما تغییر کرده است؛ نسخه تازه را بارگیری کنید.', fields={'revision': ['نسخه فعلی تغییر کرده است.']})
    if set(body) == {'revision'}:
        _invalid('body', 'حداقل یک فیلد برای تغییر بفرستید.')
    before = {
        'stage': record.stage,
        'industry': record.industry,
        'owner': record.owner,
        'reviewer': record.reviewer,
        'status': record.status,
        'content': record.content,
    }
    values = _write_values(locked, actor, {**body, 'template_id': record.template_id}, current=record)
    content_changed = values['content'] != record.content
    version_before = record.content_version
    version_after = version_before + 1 if content_changed else version_before
    changes = _event_changes(before, values, version_before=version_before, version_after=version_after)
    if changes:
        for key, value in values.items():
            setattr(record, key, value)
        record.content_version = version_after
        record.revision += 1
        record.updated_by = actor
        record.save(update_fields=[*values.keys(), 'content_version', 'revision', 'updated_by', 'updated_at'])
        event_type = 'status_changed' if set(changes) == {'status'} else 'updated'
        _record_event(locked, record, actor, event_type, changes)
    return _document_payload(record)
