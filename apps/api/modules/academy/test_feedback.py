from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .content import units
from .models import LearningFeedback


class LearningFeedbackTests(TestCase):
    def setUp(self):
        from .testing import full_grant, general_fixture
        general_fixture()
        cache.clear()
        self.client = APIClient()
        self.unit = units()['C01-ST01-L01']
        self.card = self.unit['learning_cards'][0]
        self.url = '/api/v1/academy/units/C01-ST01-L01/feedback/'
        self.payload = dict(submission_id=str(uuid4()), expected_user_id='', content_revision=self.unit['revision'], target_kind='card', target_id=self.card['id'], category='correction', message='این بخش به توضیح روشن‌تری نیاز داره.')
        self.user = get_user_model().objects.create_user(email='feedback-reader@example.test')
        self.staff = get_user_model().objects.create_user(email='feedback-staff@example.test', is_staff=True)
        full_grant(self.user)
        full_grant(self.staff)

    def post(self, **overrides):
        return self.client.post(self.url, {**self.payload, **overrides}, format='json')

    def test_guest_report_has_server_derived_context_and_safe_retry(self):
        response = self.post()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(LearningFeedback.objects.count(), 1)
        row = LearningFeedback.objects.get()
        self.assertIsNone(row.user)
        self.assertEqual(row.target_text, self.card['text'])
        self.assertEqual(row.content_path, f'/academy/lesson/C01-ST01-L01?card={self.card["id"]}')
        self.assertEqual(self.post(message='متن دیگری برای همان شناسه').status_code, 409)
        self.assertEqual(self.post(content_path='https://example.test/').status_code, 400)

    def test_context_revision_types_and_account_are_validated(self):
        self.assertEqual(self.post(target_id='wrong-card').status_code, 400)
        self.assertEqual(self.post(content_revision='stale').status_code, 409)
        self.assertEqual(self.post(category=[]).status_code, 400)
        self.assertEqual(self.post(message='  ').status_code, 400)
        self.assertEqual(self.post(target_kind='activity', target_id='wrong').status_code, 400)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.post().status_code, 409)
        self.assertEqual(self.post(expected_user_id=str(self.user.pk)).status_code, 201)
        self.assertEqual(LearningFeedback.objects.get().user, self.user)

    @patch('modules.operations.security.operator_mfa_verified', return_value=True)
    def test_inbox_and_status_require_explicit_operator_permissions(self, _mfa):
        row_id = self.post().data['id']
        inbox = '/api/v1/academy/feedback/inbox/'
        detail = f'/api/v1/academy/feedback/{row_id}/'
        self.assertEqual(self.client.get(inbox).status_code, 401)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(inbox).status_code, 403)
        self.assertEqual(self.client.patch(detail, {'status': 'resolved'}, format='json').status_code, 403)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(inbox).status_code, 403)
        self.staff.email_verified_at = timezone.now()
        self.staff.save(update_fields=['email_verified_at'])
        self.staff.user_permissions.add(*Permission.objects.filter(
            codename__in=['operator_view_feedback', 'operator_triage_feedback']))
        response = self.client.get(inbox)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(self.client.patch(detail, {'status': []}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(detail, {'status': 'reviewed'}, format='json').status_code, 200)
        self.assertEqual(self.client.get(inbox).data['count'], 0)
        self.assertEqual(self.client.get(inbox+'?status=reviewed').data['count'], 1)

    def test_question_activity_and_summary_paths(self):
        self.client.force_authenticate(self.user)
        self.payload['expected_user_id'] = str(self.user.pk)
        for kind, target, query in [('question', self.unit['questions'][0]['id'], f'question={self.unit["questions"][0]["id"]}'), ('activity', 'activity', 'step=activity'), ('summary', self.unit['id'], 'step=summary')]:
            response = self.post(submission_id=str(uuid4()), target_kind=kind, target_id=target)
            self.assertEqual(response.status_code, 201)
            self.assertTrue(LearningFeedback.objects.get(pk=response.data['id']).content_path.endswith(query))

    def test_guest_rate_limit_does_not_claim_success(self):
        for _ in range(10):
            self.assertEqual(self.post(submission_id=str(uuid4())).status_code, 201)
        response = self.post(submission_id=str(uuid4()))
        self.assertEqual(response.status_code, 429)
        self.assertNotIn('saved', response.data)
        self.assertEqual(LearningFeedback.objects.count(), 10)
