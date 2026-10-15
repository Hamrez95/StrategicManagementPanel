import hashlib
import unicodedata
import uuid
import zipfile
from datetime import timedelta
from pathlib import PurePosixPath

from django.conf import settings
from django.core.files import File
from django.core.files.storage import default_storage
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Max, Sum
from django.http import FileResponse, Http404
from django.utils import timezone

from modules.core.storage import PrivateFileStorage
from modules.workspaces.models import Workspace
from modules.workspaces.services import WorkspaceActionError, workspace_role

from ..models import DocumentAttachment, DocumentRecord
from .scanner import MalwareFound, ScanUnavailable, scan_stream

MAX_FILENAME_LENGTH = 180
ACTIVE_STATUSES = (
    DocumentAttachment.Status.RESERVED,
    DocumentAttachment.Status.UPLOADING,
    DocumentAttachment.Status.CANCEL_REQUESTED,
    DocumentAttachment.Status.QUARANTINED,
    DocumentAttachment.Status.READY,
)
ALLOWED_TYPES = {
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
}


class AttachmentTooLarge(Exception):
    pass


class HashedUpload(File):
    def __init__(self, uploaded_file, max_bytes):
        super().__init__(uploaded_file, name=uploaded_file.name)
        self.max_bytes = max_bytes
        self.size_bytes = 0
        self.sha256 = hashlib.sha256()

    def chunks(self, chunk_size=None):
        for chunk in self.file.chunks(chunk_size=chunk_size or 64 * 1024):
            self.size_bytes += len(chunk)
            if self.size_bytes > self.max_bytes:
                raise AttachmentTooLarge
            self.sha256.update(chunk)
            yield chunk


def _invalid(field, message):
    raise DjangoValidationError({field: [message]})


def _role(actor, workspace, *, write=False):
    role = workspace_role(actor, workspace)
    if role is None:
        raise Http404('Workspace is not available.')
    if write and role not in {'owner', 'editor'}:
        raise WorkspaceActionError(403, 'workspace_permission_denied', 'برای مدیریت فایل‌های این فضا دسترسی لازم را ندارید.')
    return role


def _locked_workspace(workspace):
    locked = Workspace.objects.select_for_update().filter(pk=workspace.pk).first()
    if locked is None:
        raise Http404('Workspace is not available.')
    if locked.archived_at is not None:
        raise WorkspaceActionError(409, 'workspace_archived', 'فضای بایگانی‌شده قابل ویرایش نیست.')
    return locked


def _record(workspace, record_id, *, lock=False):
    query = DocumentRecord.objects.filter(workspace=workspace, pk=record_id)
    if lock:
        query = query.select_for_update()
    value = query.first()
    if value is None:
        raise Http404('Document is not available.')
    return value


def _attachment(workspace, record, attachment_id, *, lock=False):
    query = DocumentAttachment.objects.filter(workspace=workspace, document=record, pk=attachment_id)
    if lock:
        query = query.select_for_update()
    value = query.first()
    if value is None:
        raise Http404('Attachment is not available.')
    return value


def _safe_name(value):
    if not isinstance(value, str):
        _invalid('name', 'نام فایل معتبر نیست.')
    leaf = value.replace('\\', '/').split('/')[-1]
    cleaned = ''.join(
        character for character in leaf
        if unicodedata.category(character) not in {'Cc', 'Cs'}
        and character not in '\u202a\u202b\u202d\u202e\u2066\u2067\u2068\u2069'
    ).strip(' .')
    if not cleaned or len(cleaned) > MAX_FILENAME_LENGTH or cleaned in {'.', '..'}:
        _invalid('name', f'نام فایل باید حداکثر {MAX_FILENAME_LENGTH} نویسه باشد.')
    return cleaned


def _media_for_name(name):
    extension = PurePosixPath(name).suffix.lower().lstrip('.')
    media_type = ALLOWED_TYPES.get(extension)
    if not media_type:
        _invalid('name', 'نوع فایل پشتیبانی نمی‌شود. PDF، Office، متن، CSV و تصویر مجاز هستند.')
    return extension, media_type


def _payload(item):
    return {
        'id': str(item.pk),
        'document_id': str(item.document_id),
        'name': item.original_name,
        'extension': item.extension,
        'media_type': item.media_type,
        'version': item.version,
        'size_bytes': item.size_bytes or item.reserved_size_bytes,
        'sha256': item.sha256,
        'status': item.status,
        'created_by': item.created_by.display_name.strip() or item.created_by.email,
        'created_at': item.created_at,
        'updated_at': item.updated_at,
    }


@transaction.atomic
def reserve_attachment(actor, workspace, record_id, body):
    locked = _locked_workspace(workspace)
    _role(actor, locked, write=True)
    record = _record(locked, record_id, lock=True)
    if not isinstance(body, dict) or set(body) != {'name', 'size_bytes', 'request_id'}:
        _invalid('body', 'نام، اندازه و شناسه درخواست فایل را ارسال کنید.')
    name = _safe_name(body.get('name'))
    extension, media_type = _media_for_name(name)
    try:
        request_id = uuid.UUID(body.get('request_id')) if isinstance(body.get('request_id'), str) else None
    except (ValueError, AttributeError):
        request_id = None
    if request_id is None:
        _invalid('request_id', 'شناسه درخواست فایل معتبر نیست.')
    size_bytes = body.get('size_bytes')
    if isinstance(size_bytes, bool) or not isinstance(size_bytes, int) or size_bytes <= 0:
        _invalid('size_bytes', 'اندازه فایل باید عددی مثبت باشد.')
    if size_bytes > settings.DOCUMENT_ATTACHMENT_MAX_BYTES:
        raise WorkspaceActionError(413, 'attachment_too_large', 'اندازه هر فایل از حد مجاز بیشتر است.')

    now = timezone.now()
    expired = DocumentAttachment.objects.select_for_update().filter(
        workspace=locked,
        status__in=(DocumentAttachment.Status.RESERVED, DocumentAttachment.Status.UPLOADING, DocumentAttachment.Status.CANCEL_REQUESTED, DocumentAttachment.Status.QUARANTINED),
        expires_at__lte=now,
    )
    for stale in expired:
        default_storage.delete(stale.storage_key)
        stale.delete()
    previous = DocumentAttachment.objects.filter(workspace=locked, created_by=actor, request_id=request_id).first()
    if previous is not None:
        if (
            previous.document_id != record.pk
            or previous.original_name != name
            or previous.reserved_size_bytes != size_bytes
        ):
            raise WorkspaceActionError(409, 'attachment_request_conflict', 'شناسه درخواست قبلاً برای فایل دیگری استفاده شده است.')
        return _payload(previous)
    if DocumentAttachment.objects.filter(document=record).count() >= 100:
        raise WorkspaceActionError(409, 'document_attachment_history_limit', 'برای ادامه، فایل‌های قدیمی یا ردشده این مدرک را حذف کنید.')

    active = DocumentAttachment.objects.filter(workspace=locked, status__in=ACTIVE_STATUSES)
    if active.filter(document=record).count() >= settings.DOCUMENT_ATTACHMENT_LIMIT:
        raise WorkspaceActionError(409, 'document_attachment_limit', 'تعداد فایل‌های این مدرک به سقف مجاز رسیده است.')
    reserved_total = active.aggregate(total=Sum('reserved_size_bytes'))['total'] or 0
    if reserved_total + size_bytes > settings.DOCUMENT_WORKSPACE_QUOTA_BYTES:
        raise WorkspaceActionError(409, 'workspace_storage_quota', 'فضای ذخیره‌سازی این فضای کار کافی نیست.')

    latest_version = DocumentAttachment.objects.filter(document=record).aggregate(latest=Max('version'))['latest'] or 0
    item = DocumentAttachment.objects.create(
        workspace=locked,
        document=record,
        created_by=actor,
        request_id=request_id,
        original_name=name,
        extension=extension,
        media_type=media_type,
        version=latest_version + 1,
        reserved_size_bytes=size_bytes,
        storage_key=f'quarantine/{uuid.uuid4().hex}',
        status=DocumentAttachment.Status.RESERVED,
        expires_at=now + timedelta(minutes=settings.DOCUMENT_ATTACHMENT_RESERVATION_MINUTES),
    )
    return _payload(item)


def prepare_attachment_upload(actor, workspace, record_id, attachment_id):
    _role(actor, workspace, write=True)
    record = _record(workspace, record_id)
    item = _attachment(workspace, record, attachment_id)
    if item.created_by_id != actor.pk:
        raise Http404('Attachment is not available.')
    if item.status != DocumentAttachment.Status.RESERVED or item.expires_at <= timezone.now():
        raise WorkspaceActionError(409, 'attachment_reservation_expired', 'رزرو این فایل معتبر نیست؛ رزرو تازه‌ای بسازید.')


def _valid_office_archive(storage_key, extension):
    required_member = {
        'docx': 'word/document.xml',
        'xlsx': 'xl/workbook.xml',
        'pptx': 'ppt/presentation.xml',
    }[extension]
    try:
        with default_storage.open(storage_key, 'rb') as stored, zipfile.ZipFile(stored) as archive:
            members = archive.infolist()
            return (
                len(members) <= 1000
                and sum(member.file_size for member in members) <= 100 * 1024 * 1024
                and '[Content_Types].xml' in {member.filename for member in members}
                and required_member in {member.filename for member in members}
            )
    except (OSError, zipfile.BadZipFile, KeyError):
        return False


def _sniff(storage_key, extension):
    with default_storage.open(storage_key, 'rb') as stored:
        prefix = stored.read(8192)
    if extension == 'pdf':
        return prefix.startswith(b'%PDF-')
    if extension == 'png':
        return prefix.startswith(b'\x89PNG\r\n\x1a\n')
    if extension in {'jpg', 'jpeg'}:
        return prefix.startswith(b'\xff\xd8\xff')
    if extension == 'webp':
        return len(prefix) >= 12 and prefix.startswith(b'RIFF') and prefix[8:12] == b'WEBP'
    if extension in {'docx', 'xlsx', 'pptx'}:
        return _valid_office_archive(storage_key, extension)
    try:
        return b'\x00' not in prefix and bool(prefix.decode('utf-8-sig') or not prefix)
    except UnicodeDecodeError:
        return False


def _mark_rejected(attachment_id):
    with transaction.atomic():
        item = DocumentAttachment.objects.select_for_update().filter(pk=attachment_id).first()
        if item is None:
            return
        default_storage.delete(item.storage_key)
        item.status = DocumentAttachment.Status.REJECTED
        item.size_bytes = 0
        item.sha256 = ''
        item.save(update_fields=['status', 'size_bytes', 'sha256', 'updated_at'])


def _storage_move(source, destination):
    if not hasattr(default_storage, 'atomic_move'):
        raise WorkspaceActionError(503, 'private_storage_unavailable', 'ذخیره‌سازی خصوصی فایل موقتاً در دسترس نیست.')
    try:
        default_storage.atomic_move(source, destination)
    except OSError as error:
        raise WorkspaceActionError(503, 'private_storage_unavailable', 'ذخیره‌سازی خصوصی فایل موقتاً در دسترس نیست.') from error


def _scan_and_finalize(attachment_id, workspace_id, record_id):
    item = DocumentAttachment.objects.filter(
        pk=attachment_id,
        workspace_id=workspace_id,
        document_id=record_id,
        status=DocumentAttachment.Status.QUARANTINED,
    ).first()
    if item is None:
        raise Http404('Attachment is not available.')
    try:
        with default_storage.open(item.storage_key, 'rb') as stored:
            scan_stream(stored)
    except MalwareFound:
        _mark_rejected(item.pk)
        raise WorkspaceActionError(422, 'attachment_rejected', 'فایل در بررسی امنیتی پذیرفته نشد؛ آن را حذف و نسخه سالم را بارگذاری کنید.')
    except (ScanUnavailable, OSError):
        return None

    final_key = f'attachments/{item.pk.hex}'
    moved = False
    try:
        with transaction.atomic():
            locked = DocumentAttachment.objects.select_for_update().filter(pk=item.pk).first()
            if locked is None:
                raise Http404('Attachment is not available.')
            if locked.status != DocumentAttachment.Status.QUARANTINED:
                return locked
            _storage_move(locked.storage_key, final_key)
            moved = True
            locked.storage_key = final_key
            locked.status = DocumentAttachment.Status.READY
            locked.save(update_fields=['storage_key', 'status', 'updated_at'])
            return locked
    except Exception:
        if moved:
            try:
                _storage_move(final_key, item.storage_key)
            except WorkspaceActionError:
                pass
        raise


def upload_attachment(actor, workspace, record_id, attachment_id, uploaded_file):
    with transaction.atomic():
        locked = _locked_workspace(workspace)
        _role(actor, locked, write=True)
        record = _record(locked, record_id)
        item = _attachment(locked, record, attachment_id, lock=True)
        if item.created_by_id != actor.pk:
            raise Http404('Attachment is not available.')
        if item.status != DocumentAttachment.Status.RESERVED or item.expires_at <= timezone.now():
            raise WorkspaceActionError(409, 'attachment_reservation_expired', 'رزرو این فایل معتبر نیست؛ رزرو تازه‌ای بسازید.')
        if uploaded_file.size != item.reserved_size_bytes:
            item.status = DocumentAttachment.Status.REJECTED
            item.save(update_fields=['status', 'updated_at'])
            raise DjangoValidationError({'file': ['اندازه فایل با رزرو آن مطابقت ندارد.']})
        item.status = DocumentAttachment.Status.UPLOADING
        item.expires_at = timezone.now() + timedelta(minutes=max(settings.DOCUMENT_ATTACHMENT_RESERVATION_MINUTES, 60))
        item.save(update_fields=['status', 'expires_at', 'updated_at'])
        storage_key = item.storage_key

    hashed = HashedUpload(uploaded_file, min(settings.DOCUMENT_ATTACHMENT_MAX_BYTES, item.reserved_size_bytes))
    try:
        stored_name = default_storage.save(storage_key, hashed)
    except AttachmentTooLarge:
        default_storage.delete(storage_key)
        _mark_rejected(item.pk)
        raise WorkspaceActionError(413, 'attachment_too_large', 'اندازه فایل از حد مجاز بیشتر است.')
    except OSError as error:
        _mark_rejected(item.pk)
        raise WorkspaceActionError(503, 'private_storage_unavailable', 'ذخیره‌سازی خصوصی فایل موقتاً در دسترس نیست.') from error

    if stored_name != storage_key or hashed.size_bytes != item.reserved_size_bytes:
        default_storage.delete(stored_name)
        _mark_rejected(item.pk)
        raise DjangoValidationError({'file': ['محتوای دریافت‌شده با اندازه رزرو مطابقت ندارد.']})
    try:
        valid = _sniff(stored_name, item.extension)
    except OSError:
        valid = False
    if not valid:
        default_storage.delete(stored_name)
        _mark_rejected(item.pk)
        raise DjangoValidationError({'file': ['محتوای فایل با نوع انتخاب‌شده سازگار نیست.']})

    canceled = False
    with transaction.atomic():
        current = DocumentAttachment.objects.select_for_update().filter(pk=item.pk).first()
        if current is None or current.status != DocumentAttachment.Status.UPLOADING:
            canceled = True
            if current is not None and current.status == DocumentAttachment.Status.CANCEL_REQUESTED:
                current.status = DocumentAttachment.Status.REJECTED
                current.size_bytes = 0
                current.sha256 = ''
                current.save(update_fields=['status', 'size_bytes', 'sha256', 'updated_at'])
        else:
            current.status = DocumentAttachment.Status.QUARANTINED
            current.size_bytes = hashed.size_bytes
            current.sha256 = hashed.sha256.hexdigest()
            current.expires_at = timezone.now() + timedelta(minutes=settings.DOCUMENT_ATTACHMENT_RESERVATION_MINUTES)
            current.save(update_fields=['status', 'size_bytes', 'sha256', 'expires_at', 'updated_at'])
    if canceled:
        default_storage.delete(stored_name)
        raise WorkspaceActionError(409, 'attachment_upload_cancelled', 'بارگذاری لغو شد.')

    ready = _scan_and_finalize(item.pk, workspace.pk, record.pk)
    current = ready or DocumentAttachment.objects.get(pk=item.pk)
    return _payload(current), 202 if ready is None else 201


@transaction.atomic
def list_attachments(actor, workspace, record_id):
    _role(actor, workspace)
    record = _record(workspace, record_id)
    items = record.attachments.select_related('created_by')
    return {
        'document_id': str(record.pk),
        'limits': {
            'max_file_bytes': settings.DOCUMENT_ATTACHMENT_MAX_BYTES,
            'document_attachment_limit': settings.DOCUMENT_ATTACHMENT_LIMIT,
        },
        'items': [_payload(item) for item in items],
    }


def retry_attachment_scan(actor, workspace, record_id, attachment_id):
    _role(actor, workspace, write=True)
    record = _record(workspace, record_id)
    item = _attachment(workspace, record, attachment_id)
    if item.status != DocumentAttachment.Status.QUARANTINED:
        raise WorkspaceActionError(409, 'attachment_scan_not_pending', 'این فایل در انتظار اسکن نیست.')
    if item.expires_at <= timezone.now():
        raise WorkspaceActionError(410, 'attachment_reservation_expired', 'مهلت نگهداری فایل قرنطینه‌شده تمام شده است؛ فایل را دوباره بارگذاری کنید.')
    ready = _scan_and_finalize(item.pk, workspace.pk, record.pk)
    current = ready or DocumentAttachment.objects.get(pk=item.pk)
    return _payload(current), 202 if ready is None else 200


def delete_attachment(actor, workspace, record_id, attachment_id):
    with transaction.atomic():
        locked = _locked_workspace(workspace)
        _role(actor, locked, write=True)
        record = _record(locked, record_id)
        item = _attachment(locked, record, attachment_id, lock=True)
        if item.status in {DocumentAttachment.Status.UPLOADING, DocumentAttachment.Status.CANCEL_REQUESTED}:
            item.status = DocumentAttachment.Status.CANCEL_REQUESTED
            item.save(update_fields=['status', 'updated_at'])
            return None
        default_storage.delete(item.storage_key)
        item.delete()
    return None


def download_attachment(actor, workspace, record_id, attachment_id):
    _role(actor, workspace)
    record = _record(workspace, record_id)
    item = _attachment(workspace, record, attachment_id)
    if item.status != DocumentAttachment.Status.READY:
        raise Http404('Attachment is not available.')
    try:
        content = default_storage.open(item.storage_key, 'rb')
    except OSError as error:
        raise Http404('Attachment is not available.') from error
    response = FileResponse(content, as_attachment=True, filename=item.original_name, content_type='application/octet-stream')
    response['X-Content-Type-Options'] = 'nosniff'
    response['Content-Security-Policy'] = "default-src 'none'; sandbox"
    response['Cache-Control'] = 'no-store, private'
    response['Content-Length'] = str(item.size_bytes)
    return response
