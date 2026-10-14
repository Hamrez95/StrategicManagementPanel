import json
import uuid

from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.http import Http404, HttpResponse, JsonResponse
from django.utils.dateparse import parse_datetime
from django.utils.timezone import is_aware, now
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from modules.accounts.models import User

from .models import Membership, Workspace, WorkspaceInvitation
from .profile_services import read_workspace_profile, update_workspace_profile, workspace_profile_dict
from .services import (
    WorkspaceActionError,
    accept_workspace_invitation,
    accessible_workspaces_for,
    create_owned_workspace,
    create_workspace_invitation,
    get_accessible_workspace_or_404,
    grant_workspace_membership,
    remove_workspace_membership,
    revoke_workspace_invitation,
    update_workspace,
    workspace_dict,
    workspace_role,
)

CURSOR_SALT = 'stratino.workspace-list-cursor'
CURSOR_MAX_AGE = 60 * 60


def _error(status, code, message, fields=None, headers=None):
    return JsonResponse(
        {'code': code, 'message': message, 'fields': fields or {}},
        status=status,
        headers=headers,
    )


def _json_body(request):
    try:
        value = json.loads(request.body or b'{}')
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _verified_user(request):
    user = request.user
    return bool(
        user.is_authenticated
        and user.is_active
        and user.email_verified_at is not None
    )


def _validation_error(error):
    fields = getattr(error, 'message_dict', None)
    if fields is None:
        fields = {'non_field_errors': error.messages}
    return _error(400, 'validation_error', 'اطلاعات را بررسی کنید.', fields)


def _action_error(error):
    headers = {'Retry-After': str(error.retry_after)} if error.retry_after else None
    return _error(error.status, error.code, error.message, error.fields, headers)


def _owner_workspace(request, workspace_id):
    workspace = get_accessible_workspace_or_404(request.user, workspace_id)
    role = workspace_role(request.user, workspace)
    if role is None:
        raise Http404('Workspace is not available.')
    if role != 'owner':
        raise WorkspaceActionError(
            403,
            'workspace_permission_denied',
            'مدیریت این فضا فقط در دسترس مالک آن است.',
        )
    return workspace


def _member_payload(user, role):
    return {
        'user_id': str(user.pk),
        'email': user.email,
        'name': user.display_name or user.get_full_name() or user.email,
        'role': role,
    }


@require_http_methods(['GET', 'POST'])
def list_workspaces(request):
    if not _verified_user(request):
        return _error(401, 'not_authenticated', 'برای ادامه وارد حساب تأییدشده شوید.')
    if request.method == 'POST':
        body = _json_body(request)
        if body is None:
            return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
        if set(body) != {'name'}:
            return _error(400, 'invalid_fields', 'فقط نام فضای کار را وارد کنید.')
        try:
            workspace = create_owned_workspace(request.user, body['name'])
        except DjangoValidationError as error:
            return _validation_error(error)
        return JsonResponse(workspace_dict(workspace), status=201)

    raw_limit = request.GET.get('limit', '25')
    try:
        limit = int(raw_limit)
    except (TypeError, ValueError):
        return _error(400, 'validation_error', 'تعداد موارد باید بین ۱ تا ۱۰۰ باشد.')
    if not 1 <= limit <= 100:
        return _error(400, 'validation_error', 'تعداد موارد باید بین ۱ تا ۱۰۰ باشد.')

    after_created_at = None
    after_id = None
    cursor = request.GET.get('cursor', '')
    if cursor:
        if len(cursor) > 500:
            return _error(400, 'invalid_cursor', 'نشانگر فهرست معتبر نیست؛ فهرست را از ابتدا باز کنید.')
        try:
            value = signing.loads(cursor, salt=CURSOR_SALT, max_age=CURSOR_MAX_AGE)
            if value.get('user') != str(request.user.pk):
                raise ValueError
            after_created_at = parse_datetime(value['created_at'])
            after_id = uuid.UUID(value['id'])
            if after_created_at is None or not is_aware(after_created_at):
                raise ValueError
        except (signing.BadSignature, DjangoValidationError, AttributeError, KeyError, TypeError, ValueError):
            return _error(400, 'invalid_cursor', 'نشانگر فهرست معتبر نیست؛ فهرست را از ابتدا باز کنید.')

    workspaces = accessible_workspaces_for(request.user).filter(
        Q(owner_id=request.user.pk) | Q(archived_at__isnull=True)
    ).order_by('created_at', 'id')
    if after_id is not None:
        workspaces = workspaces.filter(
            Q(created_at__gt=after_created_at)
            | Q(created_at=after_created_at, pk__gt=after_id)
        )
    page = list(workspaces[: limit + 1])
    has_more = len(page) > limit
    page = page[:limit]
    next_cursor = None
    if has_more and page:
        next_cursor = signing.dumps(
            {
                'user': str(request.user.pk),
                'created_at': page[-1].created_at.isoformat(),
                'id': str(page[-1].pk),
            },
            salt=CURSOR_SALT,
            compress=True,
        )
    return JsonResponse({
        'items': [workspace_dict(workspace) for workspace in page],
        'next_cursor': next_cursor,
    })


@require_http_methods(['GET', 'PATCH'])
def workspace_detail(request, workspace_id):
    if not _verified_user(request):
        return _error(401, 'not_authenticated', 'برای ادامه وارد حساب تأییدشده شوید.')
    try:
        workspace = get_accessible_workspace_or_404(request.user, workspace_id)
        if request.method == 'GET':
            return JsonResponse(workspace_dict(workspace))

        body = _json_body(request)
        if body is None:
            return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
        if not body or set(body) - {'revision', 'name', 'archived'} or 'revision' not in body:
            return _error(400, 'invalid_fields', 'نسخه و اطلاعات مجاز فضای کار را بفرستید.')
        if isinstance(body['revision'], bool) or not isinstance(body['revision'], int) or body['revision'] < 1:
            return _error(400, 'validation_error', 'نسخه فضای کار معتبر نیست.', {'revision': ['مقدار معتبر وارد کنید.']})
        if 'name' in body and not isinstance(body['name'], str):
            return _error(400, 'validation_error', 'نام معتبر نیست.', {'name': ['متن وارد کنید.']})
        if 'archived' in body and not isinstance(body['archived'], bool):
            return _error(400, 'validation_error', 'وضعیت بایگانی معتبر نیست.', {'archived': ['یک گزینه معتبر انتخاب کنید.']})
        _owner_workspace(request, workspace_id)
        saved = update_workspace(
            request.user,
            workspace,
            revision=body['revision'],
            name=body.get('name'),
            archived=body.get('archived'),
        )
        return JsonResponse(workspace_dict(saved))
    except Http404:
        return _error(404, 'workspace_not_found', 'فضای کار در دسترس نیست.')
    except WorkspaceActionError as error:
        return _action_error(error)
    except DjangoValidationError as error:
        return _validation_error(error)


@require_http_methods(['GET', 'PATCH'])
def workspace_profile(request, workspace_id):
    if not _verified_user(request):
        return _error(401, 'not_authenticated', 'برای ادامه وارد حساب تأییدشده شوید.')
    try:
        workspace = get_accessible_workspace_or_404(request.user, workspace_id)
        if request.method == 'GET':
            profile = read_workspace_profile(request.user, workspace)
            return JsonResponse(workspace_profile_dict(profile))

        body = _json_body(request)
        if body is None:
            return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
        allowed = {'revision', 'industry', 'stage', 'mission', 'complete'}
        if (
            'revision' not in body
            or set(body) - allowed
            or not set(body).intersection({'industry', 'stage', 'mission', 'complete'})
        ):
            return _error(400, 'invalid_fields', 'نسخه و اطلاعات مجاز پروژه را بفرستید.')
        if isinstance(body['revision'], bool) or not isinstance(body['revision'], int) or body['revision'] < 1:
            return _error(400, 'validation_error', 'نسخه اطلاعات پروژه معتبر نیست.', {'revision': ['مقدار معتبر وارد کنید.']})
        if 'complete' in body and body['complete'] is not True:
            return _error(400, 'validation_error', 'وضعیت تکمیل معتبر نیست.', {'complete': ['برای تکمیل مقدار درست بفرستید.']})
        profile = update_workspace_profile(
            request.user,
            workspace,
            revision=body['revision'],
            industry=body.get('industry'),
            stage=body.get('stage'),
            mission=body.get('mission'),
            complete=body.get('complete'),
        )
        return JsonResponse(workspace_profile_dict(profile))
    except Http404:
        return _error(404, 'workspace_not_found', 'فضای کار در دسترس نیست.')
    except WorkspaceActionError as error:
        return _action_error(error)
    except DjangoValidationError as error:
        return _validation_error(error)


@require_GET
def workspace_members(request, workspace_id):
    if not _verified_user(request):
        return _error(401, 'not_authenticated', 'برای ادامه وارد حساب تأییدشده شوید.')
    try:
        workspace = _owner_workspace(request, workspace_id)
    except Http404:
        return _error(404, 'workspace_not_found', 'فضای کار در دسترس نیست.')
    except WorkspaceActionError as error:
        return _action_error(error)

    items = [_member_payload(workspace.owner, 'owner')]
    items.extend(
        _member_payload(membership.user, membership.role)
        for membership in Membership.objects.filter(workspace=workspace).select_related('user').order_by('user__email')
    )
    return JsonResponse({'items': items})


@require_http_methods(['GET', 'POST'])
def workspace_invitations(request, workspace_id):
    if not _verified_user(request):
        return _error(401, 'not_authenticated', 'برای ادامه وارد حساب تأییدشده شوید.')
    try:
        workspace = _owner_workspace(request, workspace_id)
    except Http404:
        return _error(404, 'workspace_not_found', 'فضای کار در دسترس نیست.')
    except WorkspaceActionError as error:
        return _action_error(error)

    if request.method == 'GET':
        items = WorkspaceInvitation.objects.filter(
            workspace=workspace,
            accepted_at__isnull=True,
            revoked_at__isnull=True,
            expires_at__gt=now(),
        ).order_by('expires_at', 'id')
        return JsonResponse({
            'items': [
                {
                    'id': str(invitation.pk),
                    'email': invitation.email,
                    'role': invitation.role,
                    'expires_at': invitation.expires_at,
                }
                for invitation in items
            ]
        })

    body = _json_body(request)
    if body is None:
        return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
    if set(body) != {'email', 'role'}:
        return _error(400, 'invalid_fields', 'ایمیل و نقش دعوت را وارد کنید.')
    try:
        create_workspace_invitation(request.user, workspace, body['email'], body['role'])
    except WorkspaceActionError as error:
        return _action_error(error)
    except DjangoValidationError as error:
        return _validation_error(error)
    return JsonResponse(
        {'message': 'اگر نشانی قابل افزودن باشد، دعوت به همان ایمیل فرستاده می‌شود.'},
        status=202,
    )


@require_http_methods(['DELETE'])
def workspace_invitation_detail(request, workspace_id, invitation_id):
    if not _verified_user(request):
        return _error(401, 'not_authenticated', 'برای ادامه وارد حساب تأییدشده شوید.')
    try:
        workspace = _owner_workspace(request, workspace_id)
        revoke_workspace_invitation(request.user, workspace, invitation_id)
    except Http404:
        return _error(404, 'invitation_not_found', 'دعوت در دسترس نیست.')
    except (DjangoValidationError, TypeError, ValueError):
        return _error(404, 'invitation_not_found', 'دعوت در دسترس نیست.')
    except WorkspaceActionError as error:
        return _action_error(error)
    return HttpResponse(status=204)


@require_http_methods(['PATCH', 'DELETE'])
def workspace_member_detail(request, workspace_id, user_id):
    if not _verified_user(request):
        return _error(401, 'not_authenticated', 'برای ادامه وارد حساب تأییدشده شوید.')
    try:
        workspace = _owner_workspace(request, workspace_id)
        member = Membership.objects.filter(workspace=workspace).select_related('user').get(user_id=user_id)
    except (Http404, Membership.DoesNotExist, DjangoValidationError, TypeError, ValueError):
        return _error(404, 'workspace_member_not_found', 'عضو در این فضا در دسترس نیست.')
    except WorkspaceActionError as error:
        return _action_error(error)

    if request.method == 'PATCH':
        body = _json_body(request)
        if body is None:
            return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
        if set(body) != {'role'}:
            return _error(400, 'invalid_fields', 'فقط نقش عضو قابل تغییر است.')
        try:
            updated = grant_workspace_membership(request.user, workspace, member.user, body['role'])
        except DjangoValidationError as error:
            return _validation_error(error)
        except WorkspaceActionError as error:
            return _action_error(error)
        return JsonResponse(_member_payload(updated.user, updated.role))

    try:
        remove_workspace_membership(request.user, workspace, member.user)
    except DjangoValidationError as error:
        return _validation_error(error)
    except WorkspaceActionError as error:
        return _action_error(error)
    return HttpResponse(status=204)


@require_POST
def accept_invitation(request):
    if not _verified_user(request):
        return _error(401, 'not_authenticated', 'برای ادامه با حساب تأییدشده وارد شوید.')
    body = _json_body(request)
    if body is None:
        return _error(400, 'invalid_json', 'درخواست قابل خواندن نیست.')
    if set(body) != {'token'}:
        return _error(400, 'invalid_fields', 'پیوند دعوت معتبر نیست.')
    try:
        workspace, membership = accept_workspace_invitation(request.user, body['token'])
    except WorkspaceActionError as error:
        return _action_error(error)
    except DjangoValidationError as error:
        return _validation_error(error)
    return JsonResponse({
        'workspace': workspace_dict(workspace),
        'membership': _member_payload(request.user, membership.role),
    })
