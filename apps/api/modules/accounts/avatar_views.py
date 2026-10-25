from django.http import JsonResponse
from django.views.decorators.http import require_GET
from .models import AccountAvatar


def avatar_payload(user):
    if not user.avatar_id:
        return None
    return {'id': user.avatar_id, 'title': user.avatar.title, 'sprite_index': user.avatar.sprite_index, 'sprite_sheet': user.avatar.sprite_sheet}


def resolve_avatar(value, current_id=None):
    if value is None:
        return None
    if not isinstance(value, str) or len(value) > 48:
        raise ValueError('یکی از آواتارهای فهرست رو انتخاب کن.')
    avatar = AccountAvatar.objects.filter(pk=value).first()
    if not avatar or (not avatar.is_active and avatar.pk != current_id):
        raise ValueError('این آواتار در دسترس نیست؛ یک گزینهٔ دیگه انتخاب کن.')
    return avatar


@require_GET
def avatar_catalog(request):
    rows = list(AccountAvatar.objects.filter(is_active=True).values('id', 'title', 'sprite_index', 'sprite_sheet', 'category', 'character_name', 'leadership_note', 'source_url'))
    return JsonResponse({'avatars': rows}, headers={'Cache-Control': 'public, max-age=300'})
