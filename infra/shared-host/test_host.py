import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import types
import unittest
from unittest.mock import patch

import configuration
import monitor
import snapshots


class HostConfigurationTests(unittest.TestCase):
    def fixture(self, root):
        private = root / 'private'
        private.mkdir()
        sha = 'a' * 40
        (root / 'release.json').write_text(json.dumps(dict(stratino=sha, mazeduneh=sha)))
        configuration.write_env(root / 'release.env', dict(STRATINO_RELEASE=sha, MAZEDUNEH_RELEASE=sha,
                                COMPOSE_PROJECT_NAME='businesses', HOST_SECRETS_DIR=str(private)))
        smtp = dict(host='smtp.stratino.ir', user='synthetic', password='synthetic', sender='accounts@stratino.ir')
        values = {
            'stratino-db.env': configuration.database_environment('stratino', 's' * 64, 't' * 64),
            'mazeduneh-db.env': configuration.database_environment('mazeduneh', 'm' * 64, 'n' * 64),
            'stratino-api.env': configuration.stratino_environment('s' * 64, smtp),
            'mazeduneh-api.env': configuration.mazeduneh_environment('m' * 64, 'owner@mazeduneh.ir', 'synthetic-password'),
            'restic.env': dict(RESTIC_REPOSITORY='s3:https://backup.example.net/private', RESTIC_PASSWORD='r' * 64),
        }
        for name, env in values.items():
            configuration.write_env(private / name, env)
        return private

    def test_generated_base_profile_is_consistent_but_commerce_stays_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            self.assertEqual(configuration.validation_errors(root), [])
            self.assertIn('real payment merchant', ' '.join(configuration.validation_errors(root, launch=True)))

    def test_cross_business_credentials_and_weakened_proxy_are_rejected_without_values(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            private = self.fixture(root)
            target = private / 'stratino-api.env'
            target.write_text(target.read_text().replace('POSTGRES_PASSWORD=' + 's' * 64, 'POSTGRES_PASSWORD=private-sensitive')
                              .replace('STRATINO_TRUSTED_PROXY_IPS=172.30.11.2,127.0.0.1,::1', 'STRATINO_TRUSTED_PROXY_IPS=*'))
            errors = configuration.validation_errors(root)
            self.assertTrue(errors)
            self.assertNotIn('private-sensitive', str(errors))
            self.assertIn('password mismatch', str(errors))
            self.assertIn('ingress trust', str(errors))

    def test_environment_values_are_never_executed_or_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'fixture.env'
            configuration.write_env(target, dict(PASSWORD='literal$()=`value`'))
            self.assertEqual(configuration.read_env(target)['PASSWORD'], 'literal$()=`value`')
            with self.assertRaises(FileExistsError):
                configuration.write_env(target, dict(PASSWORD='replace'))
            with self.assertRaises(ValueError):
                configuration.write_env(Path(directory) / 'bad.env', dict(PASSWORD='x\nSECOND=bad'))

    def test_final_secret_generation_is_blocked_on_the_company_windows_machine(self):
        with patch('configuration.sys.platform', 'win32'):
            with self.assertRaises(ValueError):
                configuration.initialize(Path('.'), Path('must-not-exist'))

    def test_local_backup_repository_cannot_clear_the_launch_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            private = self.fixture(root)
            target = private / 'restic.env'
            target.write_text('RESTIC_REPOSITORY=/same-server\nRESTIC_PASSWORD=' + 'r' * 64 + '\n')
            self.assertIn('off-host', str(configuration.validation_errors(root, launch=True)))


class SnapshotTests(unittest.TestCase):
    def test_malformed_archive_cannot_write_outside_the_new_restore_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'unsafe.tar'
            with tarfile.open(archive, 'w') as package:
                entry = tarfile.TarInfo('../escaped.txt')
                entry.size = 1
                package.addfile(entry, io.BytesIO(b'x'))
            with self.assertRaises(ValueError):
                snapshots.extract_files(archive, root / 'restored')
            self.assertFalse((root / 'escaped.txt').exists())

    def test_snapshot_links_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'link.tar'
            with tarfile.open(archive, 'w') as package:
                entry = tarfile.TarInfo('link')
                entry.type, entry.linkname = tarfile.SYMTYPE, '/etc/passwd'
                package.addfile(entry)
            with self.assertRaises(ValueError):
                snapshots.extract_files(archive, root / 'restored')

    def test_incomplete_or_tampered_capture_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'receipt.json').write_text(json.dumps({'sha256': {}}))
            with self.assertRaises(ValueError):
                snapshots.verify_capture(root)
            for name in ('stratino.dump', 'mazeduneh.dump', 'stratino-files.tar.gz', 'mazeduneh-media.tar.gz'):
                (root / name).write_bytes(b'synthetic')
            (root / 'receipt.json').write_text(json.dumps(snapshots.snapshot_manifest(root, {})))
            snapshots.verify_capture(root)
            (root / 'stratino.dump').write_bytes(b'changed')
            with self.assertRaises(ValueError):
                snapshots.verify_capture(root)

    def test_regular_file_snapshot_extracts_inside_its_new_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'safe.tar'
            with tarfile.open(archive, 'w') as package:
                entry = tarfile.TarInfo('folder/example.txt')
                entry.size = 4
                package.addfile(entry, io.BytesIO(b'test'))
            snapshots.extract_files(archive, root / 'restored')
            self.assertEqual((root / 'restored/folder/example.txt').read_bytes(), b'test')

    def test_capture_failure_restarts_only_the_previously_running_writers(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            configuration.write_env(root / 'release.env', dict(COMPOSE_PROJECT_NAME='businesses'))
            configuration.write_env(root / 'restic.env', dict(RESTIC_REPOSITORY='remote:backup'))
            calls = []
            def compose(*args, **kwargs):
                calls.append(args)
                return types.SimpleNamespace(stdout='stratino-api\nedge\n')
            with patch('snapshots.capture_database', side_effect=RuntimeError('synthetic capture failure')):
                with self.assertRaises(RuntimeError):
                    snapshots.capture_and_upload(root, root, compose, lambda *a, **kw: None)
            self.assertEqual(calls[-1], ('start', 'stratino-api'))
            self.assertFalse((root / 'last-backup.json').exists())


class MonitorTests(unittest.TestCase):
    def test_healthy_runs_are_quiet_and_repeated_failures_notify_only_once(self):
        from datetime import datetime, timezone
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            configuration.write_env(root / 'release.env', dict(HOST_SECRETS_DIR=str(root)))
            (root / 'last-backup.json').write_text(json.dumps({'uploaded_at': datetime.now(timezone.utc).isoformat()}))
            disk = types.SimpleNamespace(total=100 * 1024 ** 3, free=50 * 1024 ** 3)
            with patch.object(monitor, 'ROOT', root), patch.object(monitor, 'notify') as notify, \
                    patch.object(monitor.shutil, 'disk_usage', return_value=disk), patch.object(monitor, 'probe', return_value=True) as probe:
                monitor.check()
                notify.assert_not_called()
                probe.return_value = False
                monitor.check()
                monitor.check()
                self.assertEqual(notify.call_count, 1)
                probe.return_value = True
                monitor.check()
                self.assertEqual(notify.call_count, 2)

    def test_notification_failure_is_not_recorded_as_delivered(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            configuration.write_env(root / 'release.env', dict(HOST_SECRETS_DIR=str(root)))
            with patch.object(monitor, 'ROOT', root), patch.object(monitor, 'notify', side_effect=OSError('synthetic SMTP failure')), \
                    patch.object(monitor, 'probe', return_value=False):
                with self.assertRaises(OSError):
                    monitor.check()
                self.assertFalse((root / 'monitor-state.json').exists())


if __name__ == '__main__':
    unittest.main()
