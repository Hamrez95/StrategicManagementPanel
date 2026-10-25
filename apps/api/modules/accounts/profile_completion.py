import re
from django.http import JsonResponse


def profile_complete(user):
    return bool(user.first_name.strip() and user.last_name.strip() and user.phone_number and user.profile_completed_at)


def require_profile_on_login(user):
    required = not profile_complete(user)
    if user.requires_profile_completion != required:
        user.requires_profile_completion = required
        user.save(update_fields=['requires_profile_completion'])


def normalize_phone(value):
    if not isinstance(value, str) or len(value) > 40:
        return None
    value = value.strip().translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'))
    value = re.sub(r'[ ()-]', '', value)
    if value.startswith('00'):
        value = '+' + value[2:]
    if re.fullmatch(r'09[0-9]{9}', value):
        value = '+98' + value[1:]
    if not re.fullmatch(r'\+[1-9][0-9]{7,14}', value):
        return None
    if value.startswith('+98') and not re.fullmatch(r'\+989[0-9]{9}', value):
        return None
    return value


class ProfileCompletionMiddleware:
    """Limited onboarding sessions cannot bypass the form by calling app APIs directly."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Operator APIs have their own approval/MFA gate and no customer Workspace.
        allowed = ('/api/v1/accounts/', '/api/v1/account/', '/api/v1/session/', '/api/v1/csrf/', '/api/v1/health/', '/api/v1/operator/')
        user = request.user
        if request.path.startswith('/api/') and not request.path.startswith(allowed) and user.is_authenticated and user.requires_profile_completion and not profile_complete(user):
            return JsonResponse({'code': 'profile_incomplete', 'message': 'برای ادامه، نام، نام خانوادگی و شماره موبایلت رو تکمیل کن.'}, status=403)
        return self.get_response(request)
