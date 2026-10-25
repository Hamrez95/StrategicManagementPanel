from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.exceptions import NotAuthenticated, AuthenticationFailed

def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return response
    # Authentication failures are 401; permission and CSRF failures stay 403.
    # DRF resets request.user after a failed authenticator, so that field cannot
    # distinguish a missing login from an authenticated session failing CSRF.
    if response.status_code == 403 and isinstance(exc, (NotAuthenticated, AuthenticationFailed)):
        response.status_code = 401
    codes = exc.get_codes() if hasattr(exc, 'get_codes') else None
    code = codes if isinstance(codes, str) else getattr(exc, 'default_code', 'request_error')
    messages = {
        'not_authenticated': 'برای ادامه وارد حساب شوید.',
        'workspace_not_found': 'فضای کار در دسترس نیست.',
        'workspace_resource_not_found': 'منبع در این فضای کار در دسترس نیست.',
        'workspace_permission_denied': 'برای این پروژه دسترسی لازم را ندارید.',
    }
    response.data = {
        'code': code,
        'message': messages.get(code, 'Request could not be completed.'),
        'fields': response.data if isinstance(response.data, dict) else {},
    }
    return response
