from django.test import TestCase
from django.utils import timezone

from modules.accounts.models import User
from modules.workspaces.models import BillingAccount, Membership, Workspace
from modules.workspaces.services import update_workspace


class StrategyBoardApiTests(TestCase):
    def setUp(self):
        self.owner = self.user('owner-strategy@example.test')
        self.editor = self.user('editor-strategy@example.test')
        self.viewer = self.user('viewer-strategy@example.test')
        self.outsider = self.user('outsider-strategy@example.test')
        self.owner_workspace = self.workspace(self.owner, 'Owner workspace')
        self.other_workspace = self.workspace(self.outsider, 'Other workspace')
        Membership.objects.create(workspace=self.owner_workspace, user=self.editor, role=Membership.Role.EDITOR)
        Membership.objects.create(workspace=self.owner_workspace, user=self.viewer, role=Membership.Role.VIEWER)
        Membership.objects.create(workspace=self.other_workspace, user=self.editor, role=Membership.Role.EDITOR)

    @staticmethod
    def user(email):
        return User.objects.create_user(email, password='not-a-real-user-password', email_verified_at=timezone.now())

    @staticmethod
    def workspace(owner, name):
        billing = BillingAccount.objects.create(owner=owner)
        return Workspace.objects.create(owner=owner, billing_account=billing, name=name)

    def factor(self, kind, title, *, workspace=None, actor=None):
        self.client.force_login(actor or self.owner)
        response = self.client.post(
            f'/api/v1/workspaces/{(workspace or self.owner_workspace).pk}/strategy/factors/',
            data={'factor_type': kind, 'title': title, 'evidence': f'شاهد برای {title}', 'owner': 'تیم محصول', 'priority': 4},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def option(self, category, factors, *, workspace=None):
        return self.client.post(
            f'/api/v1/workspaces/{(workspace or self.owner_workspace).pk}/strategy/options/',
            data={
                'category': category,
                'title': 'آزمایش کاهش زمان تحویل',
                'action': 'یک پایلوت محدود با دو مشتری اجرا کنید.',
                'rationale': 'قابلیت فعلی با فرصت شناسایی‌شده هم‌راستاست.',
                'hypothesis': 'اگر زمان تحویل کم شود، تکرار سفارش افزایش می‌یابد.',
                'cost': 'یک هفته از زمان تیم',
                'factor_ids': [factor['id'] for factor in factors],
            },
            content_type='application/json',
        )

    def test_board_is_private_workspace_scoped_and_editor_only_for_writes(self):
        self.client.force_login(self.viewer)
        self.assertEqual(self.client.get(f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/').status_code, 200)
        denied = self.client.post(
            f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/factors/',
            data={'factor_type': 'strength', 'title': 'قوت', 'evidence': 'شاهد', 'owner': '', 'priority': 3},
            content_type='application/json',
        )
        self.assertEqual(denied.status_code, 403)

        strength = self.factor('strength', 'تحویل سریع', workspace=self.owner_workspace)
        opportunity = self.factor('opportunity', 'تقاضای فصلی', workspace=self.owner_workspace)
        self.client.force_login(self.viewer)
        factor_url = f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/factors/{strength["id"]}/'
        self.assertEqual(self.client.patch(factor_url, data={'revision': 1, 'title': 'ویرایش بیننده'}, content_type='application/json').status_code, 403)
        self.assertEqual(self.client.delete(factor_url).status_code, 403)
        self.client.force_login(self.editor)
        self.assertEqual(len(self.client.get(f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/').json()['factors']), 2)
        self.assertEqual(self.client.get(f'/api/v1/workspaces/{self.other_workspace.pk}/strategy/').json()['factors'], [])
        self.client.force_login(self.outsider)
        self.assertEqual(self.client.get(f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/').status_code, 404)
        self.assertNotEqual(str(strength['id']), str(opportunity['id']))

    def test_tows_requires_two_compatible_factors_from_same_workspace(self):
        strength = self.factor('strength', 'شبکه توزیع')
        opportunity = self.factor('opportunity', 'افزایش خرید سازمانی')
        self.client.force_login(self.owner)
        created = self.option('SO', [strength, opportunity])
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(created.json()['category'], 'SO')
        self.assertEqual({item['factor_type'] for item in created.json()['factor_refs']}, {'strength', 'opportunity'})
        self.client.force_login(self.viewer)
        option_url = f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/options/{created.json()["id"]}/'
        self.assertEqual(self.client.patch(option_url, data={'revision': 1, 'title': 'ویرایش بیننده'}, content_type='application/json').status_code, 403)
        self.assertEqual(self.client.delete(option_url).status_code, 403)

        weakness = self.factor('weakness', 'تیم فروش کوچک')
        incompatible = self.option('SO', [weakness, opportunity])
        self.assertEqual(incompatible.status_code, 400)
        self.assertIn('factor_ids', incompatible.json()['fields'])
        foreign = self.factor('strength', 'عامل فضای دیگر', workspace=self.other_workspace, actor=self.outsider)
        self.client.force_login(self.owner)
        cross_workspace = self.option('SO', [foreign, opportunity])
        self.assertEqual(cross_workspace.status_code, 400)

        malformed = self.option('SO', [{'id': 'not-a-uuid'}, opportunity])
        self.assertEqual(malformed.status_code, 400)
        self.assertIn('factor_ids', malformed.json()['fields'])

    def test_factor_edits_flag_options_and_confirmed_deletion_preserves_reviewable_option(self):
        strength = self.factor('strength', 'شناخت عمیق مشتری')
        opportunity = self.factor('opportunity', 'بازار تازه')
        option = self.option('SO', [strength, opportunity]).json()
        self.assertEqual(option['revision'], 1)

        self.client.force_login(self.owner)
        edited = self.client.patch(
            f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/factors/{strength["id"]}/',
            data={'revision': 1, 'evidence': 'سه مصاحبه تأیید می‌کنند که شناخت مشتری بهتر است.'},
            content_type='application/json',
        )
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.json()['revision'], 2)
        flagged = self.client.get(f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/').json()['options'][0]
        self.assertTrue(flagged['needs_review'])
        self.assertEqual(flagged['revision'], 2)

        changed_again = self.client.patch(
            f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/factors/{opportunity["id"]}/',
            data={'revision': opportunity['revision'], 'priority': 5},
            content_type='application/json',
        )
        self.assertEqual(changed_again.status_code, 200)
        flagged_again = self.client.get(f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/').json()['options'][0]
        self.assertTrue(flagged_again['needs_review'])
        self.assertEqual(flagged_again['revision'], 3, 'every subsequent semantic change invalidates a stale option editor')

        stale = self.client.patch(
            f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/factors/{strength["id"]}/',
            data={'revision': 1, 'title': 'عنوان قدیمی'},
            content_type='application/json',
        )
        self.assertEqual(stale.status_code, 409)

        blocked = self.client.delete(f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/factors/{strength["id"]}/')
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.json()['code'], 'factor_dependencies')
        self.assertEqual(blocked.json()['fields']['dependencies'], [option['title']])

        removed = self.client.delete(
            f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/factors/{strength["id"]}/?confirm_dependencies=true'
        )
        self.assertEqual(removed.status_code, 200)
        self.assertEqual(removed.json()['affected_options'][0]['id'], option['id'])
        board = self.client.get(f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/').json()
        preserved = next(item for item in board['options'] if item['id'] == option['id'])
        self.assertTrue(preserved['needs_review'])
        self.assertEqual([item['id'] for item in preserved['factor_refs']], [opportunity['id']])

        replacement = self.factor('strength', 'شبکه توزیع همکار')
        repaired = self.client.patch(
            f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/options/{option["id"]}/',
            data={'revision': preserved['revision'], 'factor_ids': [replacement['id'], opportunity['id']]},
            content_type='application/json',
        )
        self.assertEqual(repaired.status_code, 200, repaired.content)
        self.assertFalse(repaired.json()['needs_review'])
        self.assertEqual(len(repaired.json()['factor_refs']), 2)

        removed_option = self.client.delete(
            f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/options/{option["id"]}/'
        )
        self.assertEqual(removed_option.status_code, 200)
        board_after_option_delete = self.client.get(
            f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/'
        ).json()
        self.assertEqual(board_after_option_delete['options'], [])
        self.assertEqual(len(board_after_option_delete['factors']), 2, 'deleting an option must preserve its source factors')
        self.assertTrue(all(factor['linked_options'] == [] for factor in board_after_option_delete['factors']))

    def test_archived_workspace_rejects_strategy_changes(self):
        update_workspace(self.owner, self.owner_workspace, revision=1, archived=True)
        self.client.force_login(self.owner)
        response = self.client.post(
            f'/api/v1/workspaces/{self.owner_workspace.pk}/strategy/factors/',
            data={'factor_type': 'strength', 'title': 'قوت', 'evidence': 'شاهد', 'owner': '', 'priority': 3},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['code'], 'workspace_archived')
