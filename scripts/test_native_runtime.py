"""Offline guards for the native bootstrap. Integration evidence comes from -VerifyApi/-VerifyBrowser."""
import argparse
import json
import os
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

runtime = runpy.run_path(str(Path(__file__).with_name('native-runtime.py')))


class NativeRuntimeTests(unittest.TestCase):
    @unittest.skipUnless(os.name == 'nt', 'Windows process-handle guard')
    def test_watches_the_launcher_without_termination_privileges(self):
        parent = runtime['ParentProcess'](os.getpid())
        try:
            self.assertTrue(parent.alive())
        finally:
            parent.close()

    def test_forces_local_development_and_discards_production_or_relay_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            args = argparse.Namespace(db_port=15432, smtp_port=11025, web_port=4173, scanner_host='', scanner_port=3310)
            with patch.dict(os.environ, {'STRATINO_ENV': 'production', 'POSTGRES_HOST': 'external.invalid', 'MP_SMTP_RELAY_CONFIG': 'must-not-inherit', 'DJANGO_DEBUG': '0'}):
                env = runtime['environment_for'](state, state / 'checkout', args)
            self.assertEqual(env['STRATINO_ENV'], 'development')
            self.assertEqual(env['POSTGRES_HOST'], '127.0.0.1')
            self.assertEqual(env['EMAIL_HOST'], '127.0.0.1')
            self.assertEqual(env['GOOGLE_OAUTH_CLIENT_ID'], '')
            self.assertEqual(env['STRATINO_OPERATOR_MFA_OPTIONAL_IN_DEVELOPMENT'], '0')
            self.assertNotIn('MP_SMTP_RELAY_CONFIG', env)
            self.assertNotEqual(env['DJANGO_SECRET_KEY'], env['POSTGRES_PASSWORD'])
            self.assertEqual(runtime['environment_for'](state, state / 'checkout', args)['POSTGRES_PASSWORD'], env['POSTGRES_PASSWORD'])

    def test_existing_invalid_archive_fails_without_executing_or_redownloading(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'invalid.zip'
            archive.write_bytes(b'not-the-reviewed-release')
            with patch('urllib.request.urlopen') as network:
                with self.assertRaises(RuntimeError):
                    runtime['verified_download']('https://unused.invalid/file', archive, '0' * 64)
            network.assert_not_called()

    def test_generated_json_is_atomic_and_contains_only_requested_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'settings.json'
            runtime['save_json'](target, {'local': True})
            self.assertEqual(json.loads(target.read_text()), {'local': True})
            self.assertFalse(target.with_suffix('.tmp').exists())


if __name__ == '__main__':
    unittest.main()
