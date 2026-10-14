from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import Http404
from django.utils import timezone

from .models import Workspace, WorkspaceProfile
from .services import WorkspaceActionError, workspace_role

PROFILE_FIELDS = {'industry': 200, 'stage': 100, 'mission': 2000}


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
    industry=None,
    stage=None,
    mission=None,
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
    for field, value in (('industry', industry), ('stage', stage), ('mission', mission)):
        maximum = PROFILE_FIELDS[field]
        if value is None:
            continue
        if not isinstance(value, str) or len(value.strip()) > maximum:
            raise DjangoValidationError({field: [f'این مقدار باید کوتاه‌تر از {maximum + 1} نویسه باشد.']})
        normalized = value.strip()
        if getattr(profile, field) != normalized:
            setattr(profile, field, normalized)
            changed.append(field)

    if complete is True and profile.onboarding_completed_at is None:
        profile.onboarding_completed_at = timezone.now()
        changed.append('onboarding_completed_at')
    if changed:
        profile.revision += 1
        profile.updated_at = timezone.now()
        profile.save(update_fields=[*changed, 'revision', 'updated_at'])
    return profile


def workspace_profile_dict(profile):
    return {
        'workspace_id': str(profile.workspace_id),
        'industry': profile.industry,
        'stage': profile.stage,
        'mission': profile.mission,
        'revision': profile.revision,
        'onboarding_completed_at': profile.onboarding_completed_at,
    }
