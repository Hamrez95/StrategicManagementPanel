from django.contrib.auth import get_user_model
from django.core.management.base import CommandError
from django.test import TestCase
from .models import LearningProgress
from .management.commands.rebase_academy_progress import assessment_digest, rebase_progress


class ProgressRebaseTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('rebase@example.test')
        self.current = {'L1': {'revision': 'b'*64, 'learning_cards': [{'id': 'a'}, {'id': 'new'}, {'id': 'z'}], 'questions': [], 'practice_activity': None}}
        self.entry = {'unit_id': 'L1', 'old_revision': 'a'*64, 'new_revision': 'b'*64, 'old_cards': ['a','z'], 'new_cards': ['a','new','z'], 'assessment_sha256': assessment_digest(self.current['L1'])}
        self.old = LearningProgress.objects.create(user=self.user, unit_id='L1', content_revision='a'*64, position=2, viewed_cards=['a','z'], note='یادداشت من', bookmarked=True, completed=True, revision=4)

    def test_history_and_personal_notes_survive_and_new_cards_require_reading(self):
        self.assertEqual(rebase_progress([self.entry], self.current), (1, 0))
        new = LearningProgress.objects.get(content_revision='b'*64)
        self.assertEqual((new.note, new.bookmarked, new.position, new.revision), ('یادداشت من', True, 3, 5))
        self.assertFalse(new.completed)
        self.assertEqual(new.viewed_cards, ['a','z'])
        new.note = 'نسخهٔ تازه'
        new.save()
        self.assertEqual(rebase_progress([self.entry], self.current), (0, 1))
        new.refresh_from_db()
        self.assertEqual(new.note, 'نسخهٔ تازه')
        self.assertTrue(LearningProgress.objects.filter(pk=self.old.pk).exists())

    def test_mismatch_or_dry_run_never_writes(self):
        self.assertEqual(rebase_progress([self.entry], self.current, True), (1, 0))
        self.assertEqual(LearningProgress.objects.count(), 1)
        with self.assertRaises(CommandError):
            rebase_progress([{**self.entry, 'assessment_sha256': 'wrong'}], self.current)
        self.assertEqual(LearningProgress.objects.count(), 1)
