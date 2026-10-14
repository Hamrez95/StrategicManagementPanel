from django.urls import path
from modules.core.views import live, ready
from modules.accounts.auth_views import (
    csrf_cookie,
    login_view,
    logout_view,
    password_reset_confirm,
    password_reset_request,
    resend_verification,
    session_view,
    signup,
    verify_email,
)

urlpatterns = [
    path('api/v1/health/live', live),
    path('api/v1/health/ready', ready),
    path('api/v1/csrf/', csrf_cookie),
    path('api/v1/session/', session_view),
    path('api/v1/accounts/signup/', signup),
    path('api/v1/accounts/verify-email/', verify_email),
    path('api/v1/accounts/resend-verification/', resend_verification),
    path('api/v1/accounts/login/', login_view),
    path('api/v1/accounts/logout/', logout_view),
    path('api/v1/accounts/password-reset/request/', password_reset_request),
    path('api/v1/accounts/password-reset/confirm/', password_reset_confirm),
]
