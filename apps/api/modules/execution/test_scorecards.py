import copy
import uuid
from datetime import date
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.test import TestCase, TransactionTestCase, Client
from django.utils import timezone

from modules.accounts.models import User
from modules.workspaces.models import BillingAccount, Membership, Workspace
from modules.exports.schema_v2 import collect_v2
from modules.exports.services import _model_values
from .models import (Action, Decision, Goal, Scorecard, ScorecardObjective, ScorecardIndicator,
                     ScorecardObservation, ScorecardRevision)
from .scorecards import assess


class ScorecardTests(TestCase):
    def setUp(self):
        self.owner = self.user('bsc-owner@example.test')
        self.editor = self.user('bsc-editor@example.test')
        self.viewer = self.user('bsc-viewer@example.test')
        self.outsider = self.user('bsc-other@example.test')
        self.workspace = self.space(self.owner)
        self.other = self.space(self.outsider)
        Membership.objects.create(workspace=self.workspace, user=self.editor, role='editor')
        Membership.objects.create(workspace=self.workspace, user=self.viewer, role='viewer')
        self.client.force_login(self.owner)
        self.root = f'/api/v1/workspaces/{self.workspace.pk}/execution/scorecards/'
        self.decision = Decision.objects.create(workspace=self.workspace, title='Direction', rationale='Evidence', assumptions='Hypothesis', review_trigger='Quarter end', created_by=self.owner)
        self.goal = Goal.objects.create(workspace=self.workspace, title='Existing goal', created_by=self.owner)
        self.action = Action.objects.create(workspace=self.workspace, decision=self.decision, goal=self.goal, owner=self.editor, title='Existing initiative', due_on='2026-12-01', created_by=self.owner)
        self.data = {
            'id': str(uuid.uuid4()), 'revision': 0, 'title': 'Quarterly strategy', 'scope': 'Support',
            'strategy': 'Improve reliable resolution', 'decision_id': str(self.decision.pk),
            'period_start': '2026-01-01', 'period_end': '2026-12-31', 'relations': [],
            'objectives': [{'id': str(uuid.uuid4()), 'perspective': 'process', 'title': 'Resolve faster',
                'goal_id': str(self.goal.pk), 'action_ids': [str(self.action.pk)], 'indicators': [{
                    'id': str(uuid.uuid4()), 'name': 'Resolution hours', 'definition': 'Median elapsed hours to resolved tickets',
                    'unit': 'hours', 'formula': 'Median', 'direction': 'decrease', 'baseline': '48',
                    'baseline_on': '2026-01-01', 'target': '24', 'target_high': None, 'warning_margin': '2',
                    'due_on': '2026-12-01', 'cadence_days': 30, 'source': 'Support system',
                    'owner_id': str(self.editor.pk), 'kind': 'lagging', 'guardrail': 'Reopening rate'}]}],
        }

    @staticmethod
    def user(email):
        return User.objects.create_user(email, password='synthetic-test-only', display_name='BSC test', email_verified_at=timezone.now())

    @staticmethod
    def space(owner):
        return Workspace.objects.create(name='BSC test business', owner=owner, billing_account=BillingAccount.objects.create(owner=owner))

    def post(self, path, data):
        return self.client.post(path, data=data, content_type='application/json')

    def create(self):
        response = self.post(self.root, self.data)
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def observation(self, card, value='36', day='2026-02-01', request_id=None):
        return {'revision': card['revision'], 'request_id': request_id or str(uuid.uuid4()),
                'indicator_id': card['objectives'][0]['indicators'][0]['id'], 'observed_on': day,
                'value': value, 'evidence': 'Synthetic observation; ticket sample'}

    def test_full_workflow_history_link_reopen_and_export(self):
        card = self.create()
        path = self.root + card['id'] + '/'
        one = self.post(path + 'observations/', self.observation(card))
        self.assertEqual(one.status_code, 201, one.content)
        two = self.post(path + 'observations/', self.observation(one.json(), '24', '2026-03-01'))
        self.assertEqual(two.status_code, 201, two.content)
        read = self.client.get(self.root).json()['cards'][0]
        indicator = read['objectives'][0]['indicators'][0]
        self.assertEqual(len(indicator['observations']), 2)
        self.assertEqual(indicator['assessment']['status'], 'on_target')
        self.assertEqual(Decimal(indicator['assessment']['baseline_progress_percent']), Decimal('100'))
        self.assertEqual(Decimal(indicator['assessment']['trend_delta']), Decimal('-12'))
        review = self.post(path + 'reviews/', {'revision': two.json()['revision'], 'request_id': str(uuid.uuid4()), 'reviewed_on': '2026-03-01', 'decision': 'Continue and review reopening rate', 'action_id': str(self.action.pk)})
        self.assertEqual(review.status_code, 201, review.content)
        exported = collect_v2(self.workspace, _model_values)
        self.assertEqual(len(exported['scorecard_observations']), 2)
        self.assertEqual(exported['scorecard_actions'][0]['action_id'], str(self.action.pk))
        self.assertEqual(len(exported['scorecard_reviews']), 1)
        self.assertEqual(len(exported['scorecard_history']), 4)
        self.assertEqual(Goal.objects.get(pk=self.goal.pk).title, 'Existing goal')
        self.assertEqual(Action.objects.get(pk=self.action.pk).goal_id, self.goal.pk)

    def test_roles_archive_and_nonmember_resources(self):
        card = self.create()
        for actor, expected in ((self.viewer, 403), (self.outsider, 404)):
            self.client.force_login(actor)
            data = copy.deepcopy(self.data); data['id'] = str(uuid.uuid4())
            self.assertEqual(self.post(self.root, data).status_code, expected)
        self.client.force_login(self.viewer)
        self.assertEqual(self.client.get(self.root).status_code, 200)
        self.client.force_login(self.editor)
        data = copy.deepcopy(self.data); data['id'] = str(uuid.uuid4()); data['objectives'] = []
        self.assertEqual(self.post(self.root, data).status_code, 201)
        self.workspace.archived_at = timezone.now(); self.workspace.save()
        self.assertEqual(self.post(self.root + card['id'] + '/observations/', self.observation(card)).status_code, 409)

    def test_reject_cross_workspace_links_and_foreign_ids_atomically(self):
        foreign_goal = Goal.objects.create(workspace=self.other, title='Other goal', created_by=self.outsider)
        data = copy.deepcopy(self.data); data['objectives'][0]['goal_id'] = str(foreign_goal.pk)
        self.assertEqual(self.post(self.root, data).status_code, 400)
        self.assertEqual(Scorecard.objects.count(), 0)
        data['objectives'][0]['goal_id'] = None
        data['objectives'][0]['indicators'][0]['owner_id'] = str(self.outsider.pk)
        self.assertEqual(self.post(self.root, data).status_code, 400)
        card = self.create()
        self.client.force_login(self.outsider)
        other_root = f'/api/v1/workspaces/{self.other.pk}/execution/scorecards/'
        self.assertEqual(self.client.patch(other_root + card['id'] + '/', self.data, content_type='application/json').status_code, 404)
        data = copy.deepcopy(self.data); data['id'] = str(uuid.uuid4()); data['decision_id'] = None
        self.assertEqual(self.post(other_root, data).status_code, 400)

    def test_optimistic_conflict_and_failed_nested_save_keep_history(self):
        card = self.create()
        self.data['revision'] = 1
        self.data['title'] = 'Changed title'
        path = self.root + card['id'] + '/'
        self.assertEqual(self.client.patch(path, self.data, content_type='application/json').status_code, 200)
        self.data['title'] = 'Stale overwrite'
        self.assertEqual(self.client.patch(path, self.data, content_type='application/json').status_code, 409)
        self.assertEqual(Scorecard.objects.get().title, 'Changed title')
        self.data['revision'] = 2; self.data['objectives'] = []
        self.assertEqual(self.client.patch(path, self.data, content_type='application/json').status_code, 400)
        self.assertEqual(Scorecard.objects.get().revision, 2)
        self.assertEqual(ScorecardRevision.objects.count(), 2)

    def test_retry_is_idempotent_and_payload_bound(self):
        card = self.create(); path = self.root + card['id'] + '/observations/'
        body = self.observation(card)
        self.assertEqual(self.post(path, body).status_code, 201)
        self.assertEqual(self.post(path, body).status_code, 201)
        self.assertEqual(ScorecardObservation.objects.count(), 1)
        body['value'] = '99'
        self.assertEqual(self.post(path, body).status_code, 409)
        self.assertEqual(ScorecardObservation.objects.count(), 1)

    def test_unknown_zero_and_decimal_precision(self):
        card = self.create(); path = self.root + card['id'] + '/observations/'
        one = self.post(path, self.observation(card, '0')).json()
        self.assertEqual(one['objectives'][0]['indicators'][0]['assessment']['status'], 'on_target')
        two = self.post(path, self.observation(one, None, '2026-03-01')).json()
        self.assertIsNone(two['objectives'][0]['indicators'][0]['assessment']['actual'])
        self.assertIsNone(two['objectives'][0]['indicators'][0]['assessment']['trend_delta'])
        three = self.post(path, self.observation(two, '123456789012345678.123456', '2026-04-01'))
        self.assertEqual(three.status_code, 201, three.content)
        self.assertEqual(three.json()['objectives'][0]['indicators'][0]['assessment']['actual'], '123456789012345678.123456')

    def test_invalid_values_and_dates(self):
        for field, value in (('baseline', 'NaN'), ('target', True), ('target', '1e100'), ('warning_margin', '-1'), ('cadence_days', 0), ('baseline_on', None)):
            with self.subTest(field=field, value=value):
                data = copy.deepcopy(self.data); data['objectives'][0]['indicators'][0][field] = value
                self.assertEqual(self.post(self.root, data).status_code, 400)
        card = self.create()
        self.assertEqual(self.post(self.root + card['id'] + '/observations/', self.observation(card, day='2099-01-01')).status_code, 400)

    def test_csrf_required_and_no_scope_data_in_foreign_export(self):
        self.create()
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.owner)
        self.assertEqual(client.post(self.root, self.data, content_type='application/json').status_code, 403)
        exported = collect_v2(self.other, _model_values)
        self.assertTrue(all(not value for key, value in exported.items() if key.startswith('scorecard')))

    def test_same_date_and_changed_definition_never_invent_trend_or_score(self):
        card = self.create(); path = self.root + card['id'] + '/observations/'
        card = self.post(path, self.observation(card, '36')).json()
        card = self.post(path, self.observation(card, '35')).json()
        self.assertIsNone(card['objectives'][0]['indicators'][0]['assessment']['trend_delta'])
        self.data['revision'] = card['revision']
        self.data['objectives'][0]['indicators'][0]['unit'] = 'minutes'
        changed = self.client.patch(self.root + card['id'] + '/', self.data, content_type='application/json').json()
        assessment = changed['objectives'][0]['indicators'][0]['assessment']
        self.assertEqual(assessment['status'], 'unknown')
        self.assertTrue(assessment['definition_changed'])
        self.assertEqual(assessment['actual_unit'], 'hours')
        self.assertIsNone(assessment['baseline_progress_percent'])

    def test_create_action_from_bsc_preserves_goal_and_objective(self):
        card = self.create(); objective = card['objectives'][0]
        body = {'revision': 1, 'request_id': str(uuid.uuid4()), 'action': {'decision_id': str(self.decision.pk), 'goal_id': str(self.goal.pk), 'owner_id': str(self.editor.pk), 'title': 'New follow-up', 'description': '', 'due_on': '2026-12-01', 'status': 'planned'}}
        path = self.root + card['id'] + '/objectives/' + objective['id'] + '/actions/'
        response = self.post(path, body)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(len(response.json()['objectives'][0]['action_ids']), 2)
        self.assertEqual(Action.objects.get(title='New follow-up').goal_id, self.goal.pk)
        self.assertEqual(self.post(path, body).status_code, 201)
        self.assertEqual(Action.objects.filter(title='New follow-up').count(), 1)

    def test_database_scope_and_append_only_guards(self):
        card = self.create()
        foreign = Goal.objects.create(workspace=self.other, title='Other goal', created_by=self.outsider)
        with self.assertRaises(IntegrityError), transaction.atomic():
            ScorecardObjective.objects.filter(pk=card['objectives'][0]['id']).update(goal=foreign)
        self.post(self.root + card['id'] + '/observations/', self.observation(card))
        with self.assertRaises(IntegrityError), transaction.atomic():
            ScorecardObservation.objects.update(value=Decimal('999'))
        with self.assertRaises(IntegrityError), transaction.atomic():
            ScorecardRevision.objects.update(snapshot={})
        with self.assertRaises(IntegrityError), transaction.atomic():
            Scorecard.objects.filter(pk=card['id']).update(workspace=self.other)

    def test_increasing_decreasing_zero_range_assessment(self):
        today = date(2026, 3, 1)
        for direction, baseline, target, high, actual, expected, progress in (
            ('increase', '10', '20', None, '15', 'off_target', '50.00'),
            ('decrease', '48', '24', None, '25', 'near_target', '95.83'),
            ('decrease', '10', '0', None, '0', 'on_target', '100.00'),
            ('increase', '0', '0', None, '0', 'on_target', None),
            ('range', '10', '20', '30', '25', 'on_target', None),
            ('range', '10', '20', '30', '32', 'near_target', None),
        ):
            with self.subTest(direction=direction, actual=actual):
                i = ScorecardIndicator(name='Test', direction=direction, baseline=Decimal(baseline), baseline_on=date(2026, 1, 1), target=Decimal(target), target_high=Decimal(high) if high else None, warning_margin=Decimal('2'))
                obs = ScorecardObservation(value=Decimal(actual), observed_on=today)
                result = assess(i, [obs], today)
                self.assertEqual(result['status'], expected)
                self.assertEqual(result['baseline_progress_percent'], progress)


class ScorecardConcurrencyTests(TransactionTestCase):
    setUp = ScorecardTests.setUp
    user = staticmethod(ScorecardTests.user)
    space = staticmethod(ScorecardTests.space)
    post = ScorecardTests.post
    create = ScorecardTests.create

    def test_two_real_connections_cannot_overwrite_the_same_revision(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from django.db import close_old_connections, connection
        from modules.workspaces.services import WorkspaceActionError
        from .scorecards import save_card
        self.create()
        barrier = Barrier(2)

        def edit(title):
            close_old_connections()
            try:
                actor = User.objects.get(pk=self.owner.pk)
                workspace = Workspace.objects.get(pk=self.workspace.pk)
                data = copy.deepcopy(self.data); data['revision'] = 1; data['title'] = title
                barrier.wait(timeout=10)
                try:
                    save_card(actor, workspace, data, self.data['id'])
                    return 'saved'
                except WorkspaceActionError as error:
                    return error.code
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(edit, ('Editor one', 'Editor two')))
        self.assertCountEqual(results, ['saved', 'revision_conflict'])
        self.assertEqual(Scorecard.objects.get().revision, 2)
        self.assertEqual(ScorecardRevision.objects.count(), 2)
