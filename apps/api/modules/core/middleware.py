from ipaddress import ip_address

from django.conf import settings


class TrustedProxyMiddleware:
    """Accept a single client IP only from an explicitly trusted ingress network."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        allowed = settings.STRATINO_TRUSTED_PROXY_IPS
        trusted = settings.STRATINO_TRUST_PROXY and (not allowed or request.META.get('REMOTE_ADDR') in allowed)
        if settings.STRATINO_TRUST_PROXY and not trusted:
            # Django's secure-proxy setting must not trust an unrelated network peer.
            request.META.pop('HTTP_X_FORWARDED_PROTO', None)
        if trusted:
            forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
            try:
                client_ip = str(ip_address(forwarded))
            except ValueError:
                # Missing/malformed headers cannot create attacker-selected limiter buckets.
                client_ip = request.META.get('REMOTE_ADDR', '')
            request.META['REMOTE_ADDR'] = client_ip
        return self.get_response(request)


class PrivateResponseMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith('/api/'):
            response['Cache-Control'] = 'no-store, private'
        return response
