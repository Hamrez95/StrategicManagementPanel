from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase, SimpleTestCase
from rest_framework.test import APIClient
from .content import grade, parse_number, units
from .models import LearningProgress


class ContentContractTests(SimpleTestCase):
    def test_full_inventory_and_original_correct_ids(self):
        content = units()
        self.assertEqual(len(content), 592 + 148 + 43)
        # Includes the 16 approved instructor-enrichment cards added to the original release.
        self.assertEqual(sum(len(u.get('learning_cards', [])) for u in content.values()), 5974)
        self.assertEqual(sum(len(u['questions']) for u in content.values()), 4549)
        for unit in content.values():
            for question in unit['questions']:
                result = grade(unit, question['id'], question['correct_option_id'])
                self.assertTrue(result['correct'], question['id'])
                self.assertFalse(result['independent_assessment'])
                self.assertEqual(result['origin_question_id'], question.get('origin_question_id', question['id']))

    def test_persian_numbers_and_ambiguous_separators(self):
        for value in ['۱٬۰۰۰', '1,000', '1000', '١٠٠٠']:
            self.assertEqual(parse_number(value), Decimal(1000))
        self.assertEqual(parse_number('−۲۷٫۲۷'), Decimal('-27.27'))
        for value in ['', '1,5', 'NaN', 'Infinity', '1e3', '۱٫۲٫۳']:
            with self.assertRaises(ValueError):
                parse_number(value)
        unit = units()['C03-ST02-L02']
        self.assertTrue(grade(unit, 'activity', '۲۷٫۲۷')['correct'])
        self.assertFalse(grade(unit, 'activity', '۲۷')['correct'])
        with self.assertRaises(ValueError):
            grade(units()['C01-ST01-L01'], 'activity', '{"text":"","rows":[[""]]}')


class AccountLearningTests(TestCase):
    def setUp(self):
        from .testing import general_fixture, full_grant
        general_fixture()
        self.a = get_user_model().objects.create_user('academy-a@stratino.invalid')
        self.b = get_user_model().objects.create_user('academy-b@stratino.invalid')
        full_grant(self.a)
        full_grant(self.b)
        self.client = APIClient()
        self.unit = units()['C01-ST01-L01']
        self.url = '/api/v1/academy/units/C01-ST01-L01/'

    def patch(self, **data):
        user = getattr(self.client.handler, '_force_user', None)
        return self.client.patch(self.url, {'content_revision': self.unit['revision'], 'expected_user_id': str(user.pk) if user else '', 'revision': 0, **data}, format='json')

    def test_private_state_and_conflict_protected_notes(self):
        self.assertEqual(self.patch(note='private').status_code, 401)
        self.client.force_authenticate(self.a)
        self.assertEqual(self.client.patch(self.url, [], format='json').status_code, 400)
        self.assertEqual(self.patch(revision=True).status_code, 400)
        self.assertEqual(self.patch(note='یادداشت الف').status_code, 200)
        self.assertEqual(self.patch(note='stale').status_code, 409)
        self.assertEqual(self.patch(user_id=str(self.b.pk)).status_code, 400)
        self.client.force_authenticate(self.b)
        self.assertEqual(self.client.get('/api/v1/academy/state/').data['units'], {})
        self.assertEqual(self.patch(expected_user_id=str(self.a.pk), note='wrong account').status_code, 409)
        self.assertEqual(self.patch(note='یادداشت ب').status_code, 200)
        self.assertEqual(LearningProgress.objects.get(user=self.a).note, 'یادداشت الف')
        self.assertEqual(LearningProgress.objects.get(user=self.b).note, 'یادداشت ب')

    def test_completion_requires_cards_and_practice_not_client_claim(self):
        self.client.force_authenticate(self.a)
        self.assertEqual(self.patch(completed=True).status_code, 400)
        self.assertEqual(self.patch(card_id='not-a-card').status_code, 400)
        for question in self.unit['questions']:
            response = self.client.post(self.url + 'answer/', {'expected_user_id': str(self.a.pk), 'content_revision': self.unit['revision'], 'question_id': question['id'], 'answer': question['correct_option_id']}, format='json')
            self.assertEqual(response.status_code, 200)
        self.assertFalse(LearningProgress.objects.get(user=self.a).completed)
        for card in self.unit['learning_cards']:
            row = LearningProgress.objects.get(user=self.a)
            self.assertEqual(self.patch(revision=row.revision, card_id=card['id']).status_code, 200)
        response = self.client.post(self.url + 'answer/', {'expected_user_id': str(self.a.pk), 'content_revision': self.unit['revision'], 'question_id': 'activity', 'answer': 'پاسخ برای مرور با معیارها'}, format='json')
        self.assertIsNone(response.data['result']['correct'])
        self.assertTrue(response.data['result']['self_review_required'])
        self.assertTrue(LearningProgress.objects.get(user=self.a).completed)

    def test_first_attempt_is_preserved_and_keys_only_follow_answer(self):
        self.client.force_authenticate(self.a)
        q = self.unit['questions'][0]
        wrong = next(o['id'] for o in q['options'] if o['id'] != q['correct_option_id'])
        for value in [wrong, q['correct_option_id']]:
            response = self.client.post(self.url + 'answer/', {'expected_user_id': str(self.a.pk), 'content_revision': self.unit['revision'], 'question_id': q['id'], 'answer': value}, format='json')
            self.assertEqual(response.status_code, 200)
        record = LearningProgress.objects.get(user=self.a).responses[q['id']]
        self.assertFalse(record['first_correct'])
        self.assertTrue(record['result']['correct'])
        self.assertEqual(record['attempts'], 2)
        self.client.force_authenticate(self.b)
        self.assertEqual(self.client.get('/api/v1/academy/state/').data['units'], {})
