import os
import subprocess
import sys
import tempfile
from unittest.mock import patch
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import DatabaseError, IntegrityError, transaction
from django.test import SimpleTestCase, TestCase
from modules.accounts.models import User
from modules.core.storage import PrivateFileStorage

class DatabaseTests(TestCase):
    def test_email_uniqueness_is_enforced_by_postgres(self):
        self.assertEqual(settings.DATABASES['default']['ENGINE'], 'django.db.backends.postgresql')
        user = User.objects.create_user('Owner@example.com', 'not-a-real-user-password')
        self.assertTrue(user.check_password('not-a-real-user-password'))
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create(email='OWNER@example.com')

    def test_readiness_requires_database_and_migrations(self):
        response = self.client.get('/api/v1/health/ready')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})
        with patch('modules.core.views.connection.cursor', side_effect=DatabaseError('sensitive database details')):
            response = self.client.get('/api/v1/health/ready')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {'status': 'unavailable'})
        with patch('modules.core.views.MigrationExecutor') as executor:
            executor.return_value.migration_plan.return_value = ['pending']
            self.assertEqual(self.client.get('/api/v1/health/ready').status_code, 503)

class BoundaryTests(SimpleTestCase):
    def test_health_is_minimal_uncached_and_read_only(self):
        response = self.client.get('/api/v1/health/live')
        self.assertEqual(response.json(), {'status': 'ok'})
        self.assertEqual(response['Cache-Control'], 'no-store, private')
        self.assertEqual(self.client.post('/api/v1/health/live').status_code, 405)
        self.assertEqual(self.client.get('/media/private.txt').status_code, 404)
        self.assertEqual(self.client.get('/api/v2/health/live').status_code, 404)

    def test_private_bytes_survive_storage_reopen_without_public_url(self):
        with tempfile.TemporaryDirectory() as directory:
            store = PrivateFileStorage(location=directory)
            name = store.save('test-only.txt', ContentFile(b'private synthetic file'))
            with PrivateFileStorage(location=directory).open(name, 'rb') as file:
                self.assertEqual(file.read(), b'private synthetic file')
            with self.assertRaises(NotImplementedError):
                store.url(name)

    def test_unsafe_production_and_external_development_email_fail(self):
        env = {**os.environ, 'STRATINO_ENV': 'production', 'DJANGO_DEBUG': '1'}
        process = subprocess.run([sys.executable, '-c', 'import config.settings'], env=env, capture_output=True)
        self.assertNotEqual(process.returncode, 0)
        env.update(STRATINO_ENV='development', EMAIL_HOST='smtp.external.invalid')
        process = subprocess.run([sys.executable, '-c', 'import config.settings'], env=env, capture_output=True)
        self.assertNotEqual(process.returncode, 0)
