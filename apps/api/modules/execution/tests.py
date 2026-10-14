from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from modules.accounts.models import User
from modules.analysis.models import Analysis
from modules.strategy.models import StrategyOption
from modules.workspaces.models import BillingAccount, Membership, Workspace

from .models import Action, Decision, ExecutionEvent, Goal


class ExecutionBoardApiTests(TestCase):
    def setUp(self):
        self.owner = self.user('execution-owner@example.test', 'مالک')
        self.editor = self.user('execution-editor@example.test', 'ویرایشگر')
        self.viewer = self.user('execution-viewer@example.test', 'بیننده')
        self.outsider = self.user('execution-outsider@example.test', 'بیرونی')
        self.workspace = self.workspace_for(self.owner, 'Workspace one')
        self.other_workspace = self.workspace_for(self.outsider, 'Workspace two')
        Membership.objects.create(workspace=self.workspace, user=self.editor, role=Membership.Role.EDITOR)
        Membership.objects.create(workspace=self.workspace, user=self.viewer, role=Membership.Role.VIEWER)
        Membership.objects.create(workspace=self.other_workspace, user=self.editor, role=Membership.Role.EDITOR)
        self.analysis = self.analysis_for(self.workspace, self.owner)

    @staticmethod
    def user(email, display_name):
        return User.objects.create_user(
            email,
            password='not-a-real-user-password',
            display_name=display_name,
            email_verified_at=timezone.now(),
        )

    @staticmethod
    def workspace_for(owner, name):
        billing = BillingAccount.objects.create(owner=owner)
        return Workspace.objects.create(owner=owner, billing_account=billing, name=name)

    @staticmethod
    def analysis_for(workspace, actor, *, state=Analysis.State.FINALIZED):
        return Analysis.objects.create(
            workspace=workspace,
            created_by=actor,
            kind=Analysis.Kind.EFE,
            schema_version=1,
            method_version='efe-v1',
            inputs={'rows': []},
            output={'rounded_score': 3.1},
            state=state,
        )

    @staticmethod
    def strategy_option_for(workspace, actor, *, needs_review=False):
        return StrategyOption.objects.create(
            workspace=workspace,
            created_by=actor,
            category=StrategyOption.Category.SO,
            title='پایلوت فروش سازمانی',
            action='پایلوت را با دو مشتری اجرا کنید.',
            rationale='فرصت با قابلیت فعلی هم‌راستاست.',
            hypothesis='اگر زمان پاسخ کم شود، خرید آزمایشی افزایش می‌یابد.',
            needs_review=needs_review,
        )

    @property
    def root(self):
        return f'/api/v1/workspaces/{self.workspace.pk}/execution/'

    def decision(self, *, actor=None, source=None):
        self.client.force_login(actor or self.owner)
        source = source or self.analysis
        return self.client.post(
            self.root + 'decisions/',
            data={
                'title': 'آزمایش پیشنهاد تازه',
                'rationale': 'گفت‌وگوها تقاضای کافی نشان داده‌اند.',
                'assumptions': 'هزینه جذب زیر سقف می‌ماند.',
                'review_trigger': 'پس از سه پایلوت یا پایان ماه اول.',
                'status': 'approved',
                'source_kind': 'analysis',
                'source_id': str(source.pk),
            },
            content_type='application/json',
        )

    def goal(self, *, actor=None):
        self.client.force_login(actor or self.owner)
        return self.client.post(
            self.root + 'goals/',
            data={'title': 'کاهش زمان تحویل', 'description': 'برای دو مشتری پایلوت.', 'due_on': None, 'status': 'active'},
            content_type='application/json',
        )

    def action(self, decision, *, actor=None, owner_id=None, goal_id=None, due_on=None):
        self.client.force_login(actor or self.owner)
        return self.client.post(
            self.root,
            data={
                'decision_id': decision['id'],
                'goal_id': goal_id,
                'owner_id': str(owner_id or self.editor.pk),
                'title': 'اجرای یک پایلوت محدود',
                'description': 'با دو مشتری منتخب و یک معیار خروج.',
                'due_on': due_on or (timezone.localdate() - timedelta(days=1)).isoformat(),
                'status': 'planned',
            },
            content_type='application/json',
        )

    def test_decision_goal_and_action_form_a_workspace_scoped_audited_plan(self):
        decision_response = self.decision()
        self.assertEqual(decision_response.status_code, 201, decision_response.content)
        decision = decision_response.json()
        goal_response = self.goal()
        self.assertEqual(goal_response.status_code, 201, goal_response.content)
        goal = goal_response.json()
        action_response = self.action(decision, goal_id=goal['id'])
        self.assertEqual(action_response.status_code, 201, action_response.content)
        action = action_response.json()
        self.assertEqual(action['decision_id'], decision['id'])
        self.assertEqual(action['goal_id'], goal['id'])
        self.assertEqual(action['owner_id'], str(self.editor.pk))
        self.assertTrue(action['overdue'])

        self.client.force_login(self.viewer)
        board = self.client.get(self.root)
        self.assertEqual(board.status_code, 200)
        self.assertEqual(board.json()['role'], 'viewer')
        self.assertEqual(board.json()['decisions'][0]['action_count'], 1)
        self.assertEqual(board.json()['goals'][0]['action_count'], 1)
        self.assertEqual(board.json()['actions'][0]['decision_title'], decision['title'])
        self.assertEqual(board.json()['actions'][0]['goal_title'], goal['title'])
        self.assertEqual(board.json()['horizon_end'], (timezone.localdate() + timedelta(days=90)).isoformat())
        self.assertEqual(len(board.json()['events']), 3)
        self.assertEqual({event['actor_name'] for event in board.json()['events']}, {'مالک'})

    def test_viewer_cannot_write_and_nonmembers_cannot_read_workspace_records(self):
        self.client.force_login(self.viewer)
        denied = self.decision(actor=self.viewer)
        self.assertEqual(denied.status_code, 403)
        self.client.force_login(self.outsider)
        self.assertEqual(self.client.get(self.root).status_code, 404)

    def test_source_and_assignee_must_belong_to_workspace_and_source_must_be_ready(self):
        foreign_analysis = self.analysis_for(self.other_workspace, self.outsider)
        self.assertEqual(self.decision(source=foreign_analysis).status_code, 400)
        draft_analysis = self.analysis_for(self.workspace, self.owner, state=Analysis.State.DRAFT)
        response = self.decision(source=draft_analysis)
        self.assertEqual(response.status_code, 400)
        self.assertIn('source_id', response.json()['fields'])
        option = self.strategy_option_for(self.workspace, self.owner, needs_review=True)
        self.client.force_login(self.owner)
        stale_option = self.client.post(
            self.root + 'decisions/',
            data={
                'title': 'تصمیم مبتنی بر گزینه قدیمی', 'rationale': 'دلیل', 'assumptions': 'فرض',
                'review_trigger': 'زمان بازبینی', 'status': 'proposed', 'source_kind': 'strategy_option',
                'source_id': str(option.pk),
            },
            content_type='application/json',
        )
        self.assertEqual(stale_option.status_code, 400)

        decision = self.decision().json()
        unassigned = self.action(decision, owner_id=self.outsider.pk)
        self.assertEqual(unassigned.status_code, 400)
        self.assertIn('owner_id', unassigned.json()['fields'])

    def test_action_rejects_foreign_decision_and_invalid_dates(self):
        foreign_decision = Decision.objects.create(
            workspace=self.other_workspace, created_by=self.outsider, title='تصمیم بیرونی',
            rationale='دلیل', assumptions='فرض', review_trigger='محرک',
        )
        self.client.force_login(self.owner)
        response = self.client.post(
            self.root,
            data={
                'decision_id': str(foreign_decision.pk), 'goal_id': None, 'owner_id': str(self.owner.pk),
                'title': 'اقدام نامعتبر', 'description': '', 'due_on': '1405-13-70', 'status': 'planned',
            },
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('decision_id', response.json()['fields'])

        decision = self.decision().json()
        invalid_date = self.action(decision, due_on='1405-13-70')
        self.assertEqual(invalid_date.status_code, 400)
        self.assertIn('due_on', invalid_date.json()['fields'])

    def test_revision_conflicts_status_history_and_open_goal_guard(self):
        decision = self.decision().json()
        goal = self.goal().json()
        action = self.action(decision, goal_id=goal['id']).json()
        self.client.force_login(self.editor)
        action_url = self.root + f"actions/{action['id']}/"
        changed = self.client.patch(action_url, data={'revision': 1, 'status': 'in_progress'}, content_type='application/json')
        self.assertEqual(changed.status_code, 200, changed.content)
        self.assertEqual(changed.json()['revision'], 2)
        conflict = self.client.patch(action_url, data={'revision': 1, 'status': 'blocked'}, content_type='application/json')
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()['code'], 'revision_conflict')

        goal_url = self.root + f"goals/{goal['id']}/"
        cannot_close = self.client.patch(goal_url, data={'revision': 1, 'status': 'complete'}, content_type='application/json')
        self.assertEqual(cannot_close.status_code, 400)
        self.assertIn('status', cannot_close.json()['fields'])
        self.assertTrue(ExecutionEvent.objects.filter(entity_type='action', event_type='status_changed').exists())
        self.assertEqual(Action.objects.get(pk=action['id']).status, Action.Status.IN_PROGRESS)

    def test_archived_workspace_is_readable_but_rejects_changes(self):
        decision = self.decision().json()
        self.workspace.archived_at = timezone.now()
        self.workspace.save(update_fields=['archived_at'])
        self.assertEqual(self.client.get(self.root).status_code, 200)
        response = self.action(decision)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['code'], 'workspace_archived')
