from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, override_settings

from modules.core.middleware import TrustedProxyMiddleware


class TrustedProxyTests(SimpleTestCase):
    def request(self, forwarded):
        request = RequestFactory().get('/', REMOTE_ADDR='172.18.0.2', HTTP_X_FORWARDED_FOR=forwarded)
        TrustedProxyMiddleware(lambda request: HttpResponse())(request)
        return request

    @override_settings(STRATINO_TRUST_PROXY=False)
    def test_direct_installation_ignores_browser_forwarding_headers(self):
        self.assertEqual(self.request('203.0.113.5').META['REMOTE_ADDR'], '172.18.0.2')

    @override_settings(STRATINO_TRUST_PROXY=True)
    def test_isolated_proxy_passes_independent_ipv4_and_ipv6_limiter_keys(self):
        self.assertEqual(self.request('203.0.113.5').META['REMOTE_ADDR'], '203.0.113.5')
        self.assertEqual(self.request('2001:db8::5').META['REMOTE_ADDR'], '2001:db8::5')

    @override_settings(STRATINO_TRUST_PROXY=True)
    def test_malformed_and_multiple_ips_cannot_choose_rate_limit_keys(self):
        for forwarded in ['', 'invalid', '203.0.113.5, 10.0.0.1']:
            with self.subTest(forwarded=forwarded):
                self.assertEqual(self.request(forwarded).META['REMOTE_ADDR'], '172.18.0.2')

    @override_settings(SECURE_PROXY_SSL_HEADER=('HTTP_X_FORWARDED_PROTO', 'https'))
    def test_proxy_https_is_recognized_for_secure_cookies_and_csrf(self):
        request = RequestFactory().get('/', HTTP_X_FORWARDED_PROTO='https')
        self.assertTrue(request.is_secure())

    @override_settings(STRATINO_TRUST_PROXY=True, STRATINO_TRUSTED_PROXY_IPS=('172.30.11.2',),
                       SECURE_PROXY_SSL_HEADER=('HTTP_X_FORWARDED_PROTO', 'https'))
    def test_untrusted_peer_cannot_assert_client_identity_or_https(self):
        request = RequestFactory().get('/', REMOTE_ADDR='172.30.11.3',
                                       HTTP_X_FORWARDED_FOR='203.0.113.5', HTTP_X_FORWARDED_PROTO='https')
        TrustedProxyMiddleware(lambda request: HttpResponse())(request)
        self.assertEqual(request.META['REMOTE_ADDR'], '172.30.11.3')
        self.assertFalse(request.is_secure())

    @override_settings(STRATINO_TRUST_PROXY=True, STRATINO_TRUSTED_PROXY_IPS=('172.30.11.2',),
                       SECURE_PROXY_SSL_HEADER=('HTTP_X_FORWARDED_PROTO', 'https'))
    def test_designated_ingress_preserves_client_identity_and_https(self):
        request = RequestFactory().get('/', REMOTE_ADDR='172.30.11.2',
                                       HTTP_X_FORWARDED_FOR='203.0.113.5', HTTP_X_FORWARDED_PROTO='https')
        TrustedProxyMiddleware(lambda request: HttpResponse())(request)
        self.assertEqual(request.META['REMOTE_ADDR'], '203.0.113.5')
        self.assertTrue(request.is_secure())
