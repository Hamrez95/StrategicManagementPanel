from datetime import date
from decimal import Decimal

from django.core.exceptions import PermissionDenied, ValidationError
from django.test import TestCase
from django.utils import timezone

from modules.accounts.models import User
from modules.customer_context.models import Segment
from modules.evidence.models import Evidence
from modules.workspaces.models import BillingAccount, Membership, Workspace

from .models import (
    CalculationRun,
    InputObservation,
    InputObservationEvidence,
    MetricValue,
    ObservationState,
)
from .services import (
    calculate_and_store_contribution_margin,
    link_input_evidence,
    snapshot_inputs,
)


class MetricPersistenceTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            "owner@example.test",
            password="not-a-real-user-password",
            email_verified_at=timezone.now(),
        )
        self.workspace = self.create_workspace(self.owner, "Workspace")
        self.other_workspace = self.create_workspace(
            User.objects.create_user(
                "other@example.test",
                password="not-a-real-user-password",
                email_verified_at=timezone.now(),
            ),
            "Other workspace",
        )
        self.segment = Segment.objects.create(
            workspace=self.workspace, name="فروش سازمانی"
        )

    @staticmethod
    def create_workspace(owner, name):
        billing = BillingAccount.objects.create(owner=owner)
        return Workspace.objects.create(owner=owner, billing_account=billing, name=name)

    def observation(self, **changes):
        values = {
            "workspace": self.workspace,
            "binding_id": "net_revenue",
            "period_start": date(2026, 1, 1),
            "period_end": date(2026, 2, 1),
            "value": Decimal("0"),
            "state": ObservationState.OBSERVED,
            "unit": "currency",
            "currency": "IRR",
            "accounting_basis": "cash",
            "cost_scope": "",
            "source_kind": "owner_reported",
            "source_id": "ledger:2026-01",
            "source_revision": "close-1",
            "recorded_by": self.owner,
        }
        values.update(changes)
        if values["binding_id"] == "variable_costs" and not values["cost_scope"]:
            values["cost_scope"] = "هزینه‌های متغیر اعلام‌شده برای این دوره"
        return InputObservation(**values)

    def test_observed_zero_is_distinct_from_unknown(self):
        observed_zero = self.observation()
        observed_zero.full_clean()
        observed_zero.save()
        self.assertEqual(observed_zero.value, Decimal("0.000000"))

        unknown = self.observation(
            binding_id="variable_costs",
            value=None,
            state=ObservationState.UNKNOWN,
            reason="دفتر هزینه‌ها هنوز بسته نشده است.",
        )
        unknown.full_clean()
        unknown.save()
        self.assertIsNone(unknown.value)
        self.assertEqual(unknown.state, ObservationState.UNKNOWN)

    def test_only_reviewed_bindings_and_explained_missing_states_are_accepted(self):
        with self.assertRaises(ValidationError):
            self.observation(binding_id="arbitrary_answer").full_clean()
        with self.assertRaises(ValidationError):
            self.observation(value=None, state=ObservationState.UNKNOWN).full_clean()
        with self.assertRaises(ValidationError):
            self.observation(
                value=Decimal("2"), state=ObservationState.INVALID
            ).full_clean()

    def test_scope_period_currency_source_and_permission_guards(self):
        mismatch = self.observation(scope_kind="segment", segment=self.segment)
        mismatch.full_clean()
        with self.assertRaises(ValidationError):
            self.observation(
                scope_kind="segment",
                segment=Segment.objects.create(
                    workspace=self.other_workspace, name="دور"
                ),
            ).full_clean()
        with self.assertRaises(ValidationError):
            self.observation(currency="irr").full_clean()
        with self.assertRaises(ValidationError):
            self.observation(source_revision="").full_clean()
        with self.assertRaises(ValidationError):
            self.observation(period_start=date(2026, 2, 1)).full_clean()

    def test_observation_cannot_be_rewritten_after_capture(self):
        observation = self.observation()
        observation.full_clean()
        observation.save()
        observation.value = Decimal("99")
        with self.assertRaisesRegex(ValidationError, "immutable"):
            observation.save()

    def test_evidence_link_must_stay_inside_the_workspace(self):
        observation = self.observation()
        observation.full_clean()
        observation.save()
        evidence = Evidence(
            workspace=self.other_workspace,
            origin=Evidence.Origin.INTERNAL_DATA,
            source_id="ledger:2026-01",
            owner=self.other_workspace.owner,
            provenance="ثبت آزمایشی دفتر مالی",
            observed_at=timezone.now(),
            permission_scope="workspace finance",
        )
        evidence.full_clean()
        evidence.save()
        link = InputObservationEvidence(observation=observation, evidence=evidence)
        with self.assertRaisesRegex(ValidationError, "Workspace"):
            link.full_clean()

    def test_run_pins_release_context_and_typed_input_trace(self):
        run = CalculationRun(
            workspace=self.workspace,
            metric_id="MET-CONTRIBUTION-MARGIN",
            method_revision="amount-v1",
            knowledge_release_id="first-slice-v1",
            knowledge_release_hash="a" * 64,
            variant="amount",
            period_start=date(2026, 1, 1),
            period_end=date(2026, 2, 1),
            currency="IRR",
            accounting_basis="cash",
            input_revision=1,
            input_snapshot=self.snapshot(),
            created_by=self.owner,
        )
        run.full_clean()
        run.save()
        with self.assertRaisesRegex(ValidationError, "immutable"):
            run.save()
        run.input_snapshot[0]["value"] = "5"
        with self.assertRaisesRegex(ValidationError, "immutable"):
            run.save()

    def test_run_rejects_unreviewed_metric_or_input_binding(self):
        run = CalculationRun(
            workspace=self.workspace,
            metric_id="MET-OPAQUE-SCORE",
            method_revision="v1",
            knowledge_release_id="release-a",
            knowledge_release_hash="a" * 64,
            variant="amount",
            period_start=date(2026, 1, 1),
            period_end=date(2026, 2, 1),
            currency="IRR",
            accounting_basis="cash",
            input_revision=1,
            input_snapshot=[{"binding_id": "answer_json"}],
            created_by=self.owner,
        )
        with self.assertRaises(ValidationError):
            run.full_clean()

    def test_snapshot_rejects_mixed_period_scope_currency_and_duplicate_binding(self):
        observation = self.observation()
        observation.full_clean()
        observation.save()
        with self.assertRaisesRegex(ValidationError, "match the run scope"):
            snapshot_inputs(
                [observation],
                workspace_id=self.workspace.pk,
                scope_kind="workspace",
                segment_id=None,
                period_start=date(2026, 2, 1),
                period_end=date(2026, 3, 1),
                currency="IRR",
                accounting_basis="cash",
            )
        with self.assertRaisesRegex(ValidationError, "one current observation"):
            snapshot_inputs(
                [observation, observation],
                workspace_id=self.workspace.pk,
                scope_kind="workspace",
                segment_id=None,
                period_start=date(2026, 1, 1),
                period_end=date(2026, 2, 1),
                currency="IRR",
                accounting_basis="cash",
            )

    def test_snapshot_pins_evidence_revision_without_copying_source_text(self):
        observation = self.observation()
        observation.full_clean()
        observation.save()
        evidence = Evidence(
            workspace=self.workspace,
            origin=Evidence.Origin.INTERNAL_DATA,
            source_id="ledger:2026-01",
            owner=self.owner,
            provenance="دفتر مالی ثبت‌شده",
            observed_at=timezone.now(),
            permission_scope="workspace finance",
            permission_status=Evidence.PermissionStatus.AVAILABLE,
        )
        evidence.full_clean()
        evidence.save()
        link = InputObservationEvidence(observation=observation, evidence=evidence)
        link.full_clean()
        link.save()

        snapshot = snapshot_inputs(
            [observation],
            workspace_id=self.workspace.pk,
            scope_kind="workspace",
            segment_id=None,
            period_start=observation.period_start,
            period_end=observation.period_end,
            currency="IRR",
            accounting_basis="cash",
        )[0]

        self.assertEqual(
            snapshot["evidence"],
            [
                {
                    "evidence_id": str(evidence.pk),
                    "revision": evidence.revision,
                    "permission_status": Evidence.PermissionStatus.AVAILABLE,
                }
            ],
        )
        self.assertNotIn("provenance", snapshot["evidence"][0])

    def test_evidence_link_requires_editor_and_snapshot_rejects_revoked_source(self):
        observation = self.observation()
        observation.full_clean()
        observation.save()
        viewer = User.objects.create_user(
            "viewer@example.test",
            password="not-a-real-user-password",
            email_verified_at=timezone.now(),
        )
        Membership.objects.create(
            workspace=self.workspace, user=viewer, role=Membership.Role.VIEWER
        )
        evidence = Evidence(
            workspace=self.workspace,
            origin=Evidence.Origin.INTERNAL_DATA,
            source_id="ledger:2026-01",
            owner=self.owner,
            provenance="دفتر مالی ثبت‌شده",
            observed_at=timezone.now(),
            permission_scope="workspace finance",
            permission_status=Evidence.PermissionStatus.AVAILABLE,
        )
        evidence.full_clean()
        evidence.save()

        with self.assertRaises(PermissionDenied):
            link_input_evidence(
                observation_id=observation.pk, evidence_id=evidence.pk, actor=viewer
            )
        link = link_input_evidence(
            observation_id=observation.pk, evidence_id=evidence.pk, actor=self.owner
        )
        self.assertEqual(link.evidence_revision, evidence.revision)
        Evidence.objects.filter(pk=evidence.pk).update(permission_status="revoked")
        with self.assertRaisesRegex(ValidationError, "revoked"):
            snapshot_inputs(
                [observation],
                workspace_id=self.workspace.pk,
                scope_kind="workspace",
                segment_id=None,
                period_start=observation.period_start,
                period_end=observation.period_end,
                currency="IRR",
                accounting_basis="cash",
            )

    def test_metric_value_preserves_zero_unknown_and_exact_run_identity(self):
        run = self.create_run()
        zero = MetricValue(
            run=run,
            metric_id=run.metric_id,
            variant=run.variant,
            value=Decimal("0"),
            status=MetricValue.Status.OBSERVED,
            unit="currency",
            currency="IRR",
        )
        zero.full_clean()
        zero.save()
        self.assertEqual(zero.value, Decimal("0.000000"))

        unknown = MetricValue(
            run=run,
            metric_id=run.metric_id,
            variant="unknown-context",
            value=None,
            status=MetricValue.Status.UNKNOWN,
            unit="currency",
            currency="IRR",
            reason="هزینه متغیر ثبت نشده است.",
        )
        with self.assertRaises(ValidationError):
            unknown.full_clean()

    def test_authorized_service_pins_current_release_and_persists_decimal_amount(self):
        revenue = self.observation(value=Decimal("100"))
        costs = self.observation(
            binding_id="variable_costs",
            value=Decimal("60"),
            cost_scope="هزینه پرداخت و ارسال ثبت‌شده",
        )
        for observation in (revenue, costs):
            observation.full_clean()
            observation.save()

        run, metric_value = calculate_and_store_contribution_margin(
            workspace_id=self.workspace.pk,
            actor=self.owner,
            observation_ids=[revenue.pk, costs.pk],
            scope_kind="workspace",
            segment_id=None,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 2, 1),
            currency="IRR",
            accounting_basis="cash",
            knowledge_release_id="stratino-first-slice-v2",
        )

        self.assertEqual(metric_value.status, MetricValue.Status.OBSERVED)
        self.assertEqual(metric_value.value, Decimal("40.000000"))
        self.assertEqual(run.knowledge_release_id, "stratino-first-slice-v2")
        self.assertEqual(run.cost_scope, costs.cost_scope)
        self.assertEqual(run.input_snapshot[0]["source_revision"], "close-1")

    def test_authorized_service_keeps_unknown_and_rejects_old_release_or_viewer(self):
        revenue = self.observation(value=Decimal("100"))
        revenue.full_clean()
        revenue.save()
        viewer = User.objects.create_user(
            "viewer@example.test",
            password="not-a-real-user-password",
            email_verified_at=timezone.now(),
        )
        Membership.objects.create(
            workspace=self.workspace, user=viewer, role=Membership.Role.VIEWER
        )
        args = {
            "workspace_id": self.workspace.pk,
            "observation_ids": [revenue.pk],
            "scope_kind": "workspace",
            "segment_id": None,
            "period_start": date(2026, 1, 1),
            "period_end": date(2026, 2, 1),
            "currency": "IRR",
            "accounting_basis": "cash",
            "knowledge_release_id": "stratino-first-slice-v2",
        }
        with self.assertRaises(PermissionDenied):
            calculate_and_store_contribution_margin(actor=viewer, **args)
        with self.assertRaises(ValidationError):
            calculate_and_store_contribution_margin(
                actor=self.owner,
                **{**args, "knowledge_release_id": "stratino-first-slice-v1"},
            )
        _, unknown = calculate_and_store_contribution_margin(actor=self.owner, **args)
        self.assertEqual(unknown.status, MetricValue.Status.UNKNOWN)
        self.assertIsNone(unknown.value)

    def create_run(self):
        run = CalculationRun(
            workspace=self.workspace,
            metric_id="MET-CONTRIBUTION-MARGIN",
            method_revision="amount-v1",
            knowledge_release_id="first-slice-v1",
            knowledge_release_hash="a" * 64,
            variant="amount",
            period_start=date(2026, 1, 1),
            period_end=date(2026, 2, 1),
            currency="IRR",
            accounting_basis="cash",
            input_revision=1,
            input_snapshot=self.snapshot(),
            created_by=self.owner,
        )
        run.full_clean()
        run.save()
        return run

    def snapshot(self):
        observation = self.observation()
        observation.full_clean()
        observation.save()
        return snapshot_inputs(
            [observation],
            workspace_id=self.workspace.pk,
            scope_kind="workspace",
            segment_id=None,
            period_start=observation.period_start,
            period_end=observation.period_end,
            currency="IRR",
            accounting_basis="cash",
        )
