import os
import secrets
from pathlib import Path
from urllib.parse import urlsplit
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
ENVIRONMENT = os.environ.get('STRATINO_ENV', 'development')
if ENVIRONMENT not in ('development', 'production', 'test'):
    raise ImproperlyConfigured('STRATINO_ENV must be development, test or production.')
PRODUCTION = ENVIRONMENT == 'production'
DEBUG = os.environ.get('DJANGO_DEBUG', '0' if PRODUCTION else '1') == '1'
STRATINO_ALLOW_TEST_ACCOUNT = os.environ.get('STRATINO_ALLOW_TEST_ACCOUNT') == '1'
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', '')
ALLOWED_HOSTS = [host.strip() for host in os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1,[::1]' if not PRODUCTION else '').split(',') if host.strip()]
if PRODUCTION:
    if DEBUG or len(SECRET_KEY) < 50 or len(set(SECRET_KEY)) < 5 or not ALLOWED_HOSTS or '*' in ALLOWED_HOSTS:
        raise ImproperlyConfigured('Production requires DEBUG=0, a strong secret and explicit allowed hosts.')
elif not SECRET_KEY:
    # Ephemeral development only: restart invalidates sessions unless configured.
    SECRET_KEY = secrets.token_urlsafe(64)

INSTALLED_APPS = ['django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.sessions', 'rest_framework', 'modules.accounts', 'modules.workspaces', 'modules.customer_context', 'modules.evidence', 'modules.metrics', 'modules.strategy', 'modules.analysis', 'modules.execution', 'modules.documents', 'modules.imports', 'modules.exports', 'modules.core']
INSTALLED_APPS += ['modules.academy']
INSTALLED_APPS += ['django.contrib.admin', 'django.contrib.messages', 'django.contrib.staticfiles']
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'static-root'
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'APP_DIRS': True, 'OPTIONS': {'context_processors': ['django.template.context_processors.request', 'django.contrib.auth.context_processors.auth', 'django.contrib.messages.context_processors.messages']}}]
GOOGLE_OAUTH_CLIENT_ID = os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '').strip()
MIDDLEWARE = ['django.middleware.security.SecurityMiddleware', 'django.contrib.sessions.middleware.SessionMiddleware', 'django.middleware.common.CommonMiddleware', 'django.middleware.csrf.CsrfViewMiddleware', 'django.contrib.auth.middleware.AuthenticationMiddleware', 'django.middleware.clickjacking.XFrameOptionsMiddleware', 'modules.core.middleware.PrivateResponseMiddleware']
ROOT_URLCONF = 'config.urls'
MIDDLEWARE.insert(MIDDLEWARE.index('django.contrib.auth.middleware.AuthenticationMiddleware') + 1, 'modules.accounts.profile_completion.ProfileCompletionMiddleware')
MIDDLEWARE.append('django.contrib.messages.middleware.MessageMiddleware')
WSGI_APPLICATION = 'config.wsgi.application'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
AUTH_USER_MODEL = 'accounts.User'
DATABASES = {'default': {
    'ENGINE': 'django.db.backends.postgresql',
    'NAME': os.environ.get('POSTGRES_DB', 'stratino'),
    'USER': os.environ.get('POSTGRES_USER', 'stratino'),
    'PASSWORD': os.environ.get('POSTGRES_PASSWORD', ''),
    'HOST': os.environ.get('POSTGRES_HOST', '127.0.0.1'),
    'PORT': os.environ.get('POSTGRES_PORT', '5432'),
    'CONN_MAX_AGE': 0,
    'OPTIONS': {'connect_timeout': 3, 'sslmode': os.environ.get('POSTGRES_SSLMODE', 'require' if PRODUCTION else 'prefer')},
}}
if PRODUCTION and (not DATABASES['default']['PASSWORD'] or DATABASES['default']['OPTIONS']['sslmode'] not in ('require', 'verify-ca', 'verify-full')):
    raise ImproperlyConfigured('Production requires database credentials and TLS.')
LANGUAGE_CODE = 'fa'
TIME_ZONE = 'Asia/Tehran'
USE_I18N = True
USE_TZ = True
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.SessionAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    'EXCEPTION_HANDLER': 'modules.core.errors.exception_handler',
}
AUTH_PASSWORD_VALIDATORS = [{'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'}, {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 12}}, {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'}, {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'}]
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = PRODUCTION
CSRF_COOKIE_SECURE = PRODUCTION
SESSION_COOKIE_SAMESITE = 'Lax'
SECURE_SSL_REDIRECT = PRODUCTION
SECURE_HSTS_SECONDS = 31536000 if PRODUCTION else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = PRODUCTION
SECURE_HSTS_PRELOAD = PRODUCTION
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
DATA_UPLOAD_MAX_MEMORY_SIZE = 6 * 1024 * 1024
MEDIA_ROOT = Path(os.environ.get('STRATINO_PRIVATE_FILES', str(BASE_DIR / '.private-files')))
STORAGES = {'default': {'BACKEND': 'modules.core.storage.PrivateFileStorage'}, 'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}}
DOCUMENT_ATTACHMENT_MAX_BYTES = int(os.environ.get('STRATINO_ATTACHMENT_MAX_BYTES', str(20 * 1024 * 1024)))
DOCUMENT_WORKSPACE_QUOTA_BYTES = int(os.environ.get('STRATINO_WORKSPACE_FILE_QUOTA_BYTES', str(100 * 1024 * 1024)))
DOCUMENT_ATTACHMENT_LIMIT = int(os.environ.get('STRATINO_DOCUMENT_ATTACHMENT_LIMIT', '20'))
DOCUMENT_ATTACHMENT_RESERVATION_MINUTES = int(os.environ.get('STRATINO_ATTACHMENT_RESERVATION_MINUTES', '30'))
CLAMAV_HOST = os.environ.get('CLAMAV_HOST', '').strip()
CLAMAV_PORT = int(os.environ.get('CLAMAV_PORT', '3310'))
CLAMAV_TIMEOUT_SECONDS = int(os.environ.get('CLAMAV_TIMEOUT_SECONDS', '30'))
if min(DOCUMENT_ATTACHMENT_MAX_BYTES, DOCUMENT_WORKSPACE_QUOTA_BYTES, DOCUMENT_ATTACHMENT_LIMIT,
       DOCUMENT_ATTACHMENT_RESERVATION_MINUTES, CLAMAV_PORT, CLAMAV_TIMEOUT_SECONDS) <= 0:
    raise ImproperlyConfigured('Attachment limits and ClamAV connection settings must be positive integers.')
if PRODUCTION and not CLAMAV_HOST:
    raise ImproperlyConfigured('Production requires a private ClamAV service for document attachment scanning.')
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.environ.get('EMAIL_HOST', '127.0.0.1')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '1025'))
EMAIL_TIMEOUT = 5
EMAIL_USE_TLS = PRODUCTION
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'development@stratino.invalid')
STRATINO_PUBLIC_URL = os.environ.get('STRATINO_PUBLIC_URL', 'http://127.0.0.1:4173').rstrip('/')
CSRF_TRUSTED_ORIGINS = [origin.strip() for origin in os.environ.get(
    'DJANGO_CSRF_TRUSTED_ORIGINS',
    STRATINO_PUBLIC_URL if PRODUCTION else ','.join([STRATINO_PUBLIC_URL, 'http://127.0.0.1:5193', 'http://localhost:5193']),
).split(',') if origin.strip()]
PASSWORD_RESET_TIMEOUT = 60 * 60
EMAIL_VERIFICATION_TIMEOUT = 60 * 60 * 24
public_url = urlsplit(STRATINO_PUBLIC_URL)
if PRODUCTION and (public_url.scheme != 'https' or not public_url.netloc or public_url.username or public_url.password):
    raise ImproperlyConfigured('Production requires a public HTTPS application URL for account email links.')
if not PRODUCTION and EMAIL_HOST not in ('localhost', '127.0.0.1', 'mailpit'):
    raise ImproperlyConfigured('Development email must use the local catcher.')
