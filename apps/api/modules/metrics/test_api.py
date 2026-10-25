import json

from django.test import Client, TestCase
from django.utils import timezone

from modules.accounts.models import User
from modules.customer_context.models import Segment
from modules.evidence.models import Evidence
from modules.workspaces.models import BillingAccount, Membership, Workspace
from modules.workspaces.testing import grant_test_management_access

from .models import CalculationRun, InputObservation, InputObservationEvidence
from .services import calculate_and_store_contribution_margin, link_input_evidence


class MetricApiTests(TestCase):
    def setUp(self):
        self.owner = self.user("owner")
        self.viewer = self.user("viewer")
        self.editor = self.user("editor")
        self.outsider = self.user("outsider", is_staff=True)
        self.workspace = self.space(self.owner)
        self.foreign = self.space(self.outsider)
        Membership.objects.create(
            workspace=self.workspace, user=self.viewer, role="viewer"
        )
        Membership.objects.create(
            workspace=self.workspace, user=self.editor, role="editor"
        )
        self.base = f"/api/v1/workspaces/{self.workspace.pk}/metrics/"
        self.client.force_login(self.owner)

    def user(self, name, **extra):
        return User.objects.create_user(
            f"{name}@example.test", email_verified_at=timezone.now(), **extra
        )

    def space(self, owner):
        return Workspace.objects.create(
            owner=owner,
            name="Synthetic Workspace",
            billing_account=BillingAccount.objects.create(owner=owner),
        )

    def context(self):
        return {
            "scope_kind": "workspace",
            "segment_id": None,
            "period_start": "2026-01-01",
            "period_end": "2026-02-01",
            "currency": "IRR",
            "accounting_basis": "cash",
        }

    def payload(self, **changes):
        payload = {
            **self.context(),
            "binding_id": "net_revenue",
            "state": "observed",
            "value": "100.000000",
            "unit": "currency",
            "cost_scope": "",
            "source_kind": "owner_reported",
            "source_id": "synthetic-ledger",
            "source_revision": "close-1",
            "reason": "",
            "evidence_ids": [],
        }
        payload.update(changes)
        return payload

    def post(self, suffix, payload, **extra):
        return self.client.post(
            self.base + suffix,
            data=json.dumps(payload),
            content_type="application/json",
            **extra,
        )

    def capture(self, **changes):
        response = self.post("observations/", self.payload(**changes))
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def calculate(self, ids, **changes):
        payload = {
            **self.context(),
            "observation_ids": ids,
            "knowledge_release_id": "stratino-first-slice-v2",
        }
        payload.update(changes)
        return self.post("contribution-runs/", payload)

    def evidence(self, workspace=None):
        return Evidence.objects.create(
            workspace=workspace or self.workspace,
            origin=Evidence.Origin.INTERNAL_DATA,
            source_id="synthetic-source",
            owner=(workspace or self.workspace).owner,
            provenance="Synthetic test only",
            observed_at=timezone.now(),
            permission_scope="workspace finance",
            permission_status="available",
        )

    def test_round_trip_exact_amount_and_frozen_revisions(self):
        grant_test_management_access(self.owner)
        revenue = self.capture()
        cost = self.capture(
            binding_id="variable_costs",
            value="60.000001",
            cost_scope="Declared variable costs",
        )
        response = self.calculate([revenue["id"], cost["id"]])
        self.assertEqual(response.status_code, 201, response.content)
        run = response.json()
        self.assertEqual(run["results"][0]["value"], "39.999999")
        self.assertEqual(run["method_revision"], "contribution-amount-v1")
        self.assertEqual(len(run["input_snapshot"]), 2)
        revised = self.capture(value="200.000000")
        self.assertEqual(revised["revision"], 2)
        frozen = self.client.get(self.base + f"contribution-runs/{run['id']}/")
        self.assertEqual(frozen.json(), run)
        observations = self.client.get(self.base + "observations/").json()["items"]
        self.assertEqual(len(observations), 3)
        self.assertIn(revenue["id"], [item["id"] for item in observations])
        self.assertIn("no-store", frozen.headers["Cache-Control"])

    def test_zero_unknown_invalid_and_not_applicable_remain_distinct(self):
        grant_test_management_access(self.owner)
        zero = self.capture(value="0")
        cost = self.capture(
            binding_id="variable_costs", value="0", cost_scope="Declared costs"
        )
        observed = self.calculate([zero["id"], cost["id"]])
        self.assertEqual(observed.json()["results"][0]["value"], "0.000000")
        for state in ("unknown", "invalid", "not_applicable"):
            with self.subTest(state=state):
                source = self.capture(
                    state=state, value=None, reason="Explicit synthetic state"
                )
                response = self.calculate([source["id"], cost["id"]])
                self.assertEqual(response.status_code, 201, response.content)
                result = response.json()["results"][0]
                self.assertEqual(result["status"], state)
                self.assertIsNone(result["value"])
                self.assertTrue(result["reason"])
        missing = self.calculate([])
        self.assertEqual(missing.status_code, 201, missing.content)
        self.assertEqual(missing.json()["results"][0]["status"], "unknown")

    def test_free_capture_and_read_but_calculation_requires_owner_grant(self):
        revenue = self.capture()
        response = self.calculate([revenue["id"]])
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "management_subscription_required")
        self.assertEqual(CalculationRun.objects.count(), 0)
        self.assertEqual(self.client.get(self.base + "observations/").status_code, 200)

    def test_viewer_read_only_editor_follows_owner_grant_and_revocation(self):
        grant_test_management_access(self.owner)
        self.client.force_login(self.viewer)
        self.assertEqual(self.post("observations/", self.payload()).status_code, 403)
        self.assertEqual(self.calculate([]).status_code, 403)
        self.assertEqual(self.client.get(self.base + "observations/").status_code, 200)
        self.client.force_login(self.editor)
        self.capture()
        self.assertEqual(self.calculate([]).status_code, 201)
        Membership.objects.filter(user=self.editor).delete()
        self.assertEqual(self.client.get(self.base + "observations/").status_code, 404)
        self.assertEqual(self.post("observations/", self.payload()).status_code, 404)

    def test_staff_has_no_bypass_and_foreign_run_stays_hidden(self):
        grant_test_management_access(self.owner)
        run = self.calculate([]).json()
        self.client.force_login(self.outsider)
        for path in (
            "observations/",
            "contribution-runs/",
            f"contribution-runs/{run['id']}/",
        ):
            self.assertEqual(self.client.get(self.base + path).status_code, 404)
        self.assertEqual(self.post("observations/", self.payload()).status_code, 404)
        foreign_url = f"/api/v1/workspaces/{self.foreign.pk}/metrics/contribution-runs/{run['id']}/"
        self.assertEqual(self.client.get(foreign_url).status_code, 404)

    def test_cross_workspace_input_segment_and_evidence_rejected_atomically(self):
        grant_test_management_access(self.owner)
        self.client.force_login(self.outsider)
        foreign_base = self.base
        self.base = f"/api/v1/workspaces/{self.foreign.pk}/metrics/"
        foreign_input = self.capture()
        self.base = foreign_base
        self.client.force_login(self.owner)
        self.assertEqual(self.calculate([foreign_input["id"]]).status_code, 400)
        segment = Segment.objects.create(workspace=self.foreign, name="Foreign")
        self.assertEqual(
            self.post(
                "observations/",
                self.payload(scope_kind="segment", segment_id=str(segment.pk)),
            ).status_code,
            400,
        )
        self.assertEqual(
            self.calculate(
                [], scope_kind="segment", segment_id=str(segment.pk)
            ).status_code,
            400,
        )
        source = self.evidence(self.foreign)
        self.assertEqual(
            self.post(
                "observations/", self.payload(evidence_ids=[str(source.pk)])
            ).status_code,
            400,
        )
        self.assertEqual(
            InputObservation.objects.filter(workspace=self.workspace).count(), 0
        )
        self.assertEqual(CalculationRun.objects.count(), 0)

    def test_evidence_is_pinned_and_changed_or_revoked_sources_block_new_runs(self):
        grant_test_management_access(self.owner)
        source = self.evidence()
        observation = self.capture(evidence_ids=[str(source.pk)])
        self.assertEqual(observation["evidence"][0]["revision"], source.revision)
        self.assertTrue(observation["evidence"][0]["current"])
        run = self.calculate([observation["id"]]).json()
        Evidence.objects.filter(pk=source.pk).update(permission_status="revoked")
        self.assertEqual(self.calculate([observation["id"]]).status_code, 400)
        latest = self.client.get(self.base + "observations/").json()["items"][0]
        self.assertFalse(latest["evidence"][0]["current"])
        self.assertEqual(
            self.client.get(self.base + f"contribution-runs/{run['id']}/").json(), run
        )
        count = InputObservation.objects.count()
        self.assertEqual(
            self.post(
                "observations/", self.payload(evidence_ids=[str(source.pk)])
            ).status_code,
            400,
        )
        self.assertEqual(InputObservation.objects.count(), count)
        self.assertEqual(InputObservationEvidence.objects.count(), 1)

    def test_archive_blocks_http_and_direct_calculation_but_preserves_reads(self):
        grant_test_management_access(self.owner)
        observation = self.capture()
        Workspace.objects.filter(pk=self.workspace.pk).update(
            archived_at=timezone.now()
        )
        self.assertEqual(self.post("observations/", self.payload()).status_code, 403)
        self.assertEqual(self.calculate([]).status_code, 403)
        self.assertEqual(self.client.get(self.base + "observations/").status_code, 200)
        from datetime import date

        from django.core.exceptions import PermissionDenied

        with self.assertRaises(PermissionDenied):
            calculate_and_store_contribution_margin(
                workspace_id=self.workspace.pk,
                actor=self.owner,
                observation_ids=[],
                scope_kind="workspace",
                segment_id=None,
                period_start=date(2026, 1, 1),
                period_end=date(2026, 2, 1),
                currency="IRR",
                accounting_basis="cash",
                knowledge_release_id="stratino-first-slice-v2",
            )
        source = self.evidence()
        with self.assertRaises(PermissionDenied):
            link_input_evidence(
                observation_id=observation["id"],
                evidence_id=source.pk,
                actor=self.owner,
            )

    def test_strict_input_types_reject_unreviewed_or_fabricated_fields(self):
        cases = [
            {"value": 0.1},
            {"value": True},
            {"value": "NaN"},
            {"value": "Infinity"},
            {"value": "0.0000001"},
            {"binding_id": "cash_runway"},
            {"unit": "percent"},
            {"source_kind": "verified_import"},
            {"revision": 80},
            {"workspace_id": str(self.foreign.pk)},
            {"period_start": "2026-02-30"},
            {"period_end": "2026-01-01"},
            {"state": "unknown", "value": None},
            {"state": "unknown", "value": "0", "reason": "Missing"},
        ]
        for changes in cases:
            with self.subTest(changes=changes):
                self.assertEqual(
                    self.post("observations/", self.payload(**changes)).status_code, 400
                )
        self.assertEqual(InputObservation.objects.count(), 0)

    def test_run_rejects_duplicates_context_mismatch_unknown_release_and_result_injection(
        self,
    ):
        grant_test_management_access(self.owner)
        revenue = self.capture()
        cases = [
            {"observation_ids": [revenue["id"], revenue["id"]]},
            {"currency": "IRT"},
            {"accounting_basis": "accrual"},
            {"period_end": "2026-03-01"},
            {"knowledge_release_id": "latest"},
            {"value": "40"},
            {"method_revision": "invented"},
        ]
        for changes in cases:
            with self.subTest(changes=changes):
                self.assertEqual(
                    self.calculate([revenue["id"]], **changes).status_code, 400
                )
        self.assertEqual(CalculationRun.objects.count(), 0)

    def test_revoked_grant_does_not_allow_new_runs_or_hide_existing_results(self):
        grant = grant_test_management_access(self.owner)
        run = self.calculate([]).json()
        grant.status = "revoked"
        grant.save(update_fields=["status"])
        self.assertEqual(self.calculate([]).status_code, 403)
        self.assertEqual(
            self.client.get(self.base + f"contribution-runs/{run['id']}/").status_code,
            200,
        )

    def test_pagination_is_bounded_and_invalid_queries_fail(self):
        observation = self.capture()
        original = InputObservation.objects.get(pk=observation["id"])
        import uuid

        rows = []
        for revision in range(2, 53):
            original.pk = uuid.uuid4()
            original.revision = revision
            original._state.adding = True
            original.save()
            rows.append(original.pk)
        first = self.client.get(self.base + "observations/").json()
        second = self.client.get(self.base + "observations/?offset=50").json()
        self.assertEqual(len(first["items"]), 50)
        self.assertEqual(first["next_offset"], 50)
        self.assertEqual(len(second["items"]), 2)
        self.assertIsNone(second["next_offset"])
        self.assertFalse(
            {item["id"] for item in first["items"]}
            & {item["id"] for item in second["items"]}
        )
        for query in ("offset=-1", "offset=no", "offset=100001", "unknown=1"):
            self.assertEqual(
                self.client.get(self.base + "observations/?" + query).status_code, 400
            )

    def test_anonymous_unverified_sessions_and_csrf_are_enforced(self):
        self.client.logout()
        self.assertEqual(self.client.get(self.base + "observations/").status_code, 401)
        self.owner.email_verified_at = None
        self.owner.save(update_fields=["email_verified_at"])
        self.client.force_login(self.owner)
        self.assertEqual(self.client.get(self.base + "observations/").status_code, 401)
        self.owner.email_verified_at = timezone.now()
        self.owner.save(update_fields=["email_verified_at"])
        strict = Client(enforce_csrf_checks=True)
        strict.force_login(self.owner)
        response = strict.post(
            self.base + "observations/",
            data=json.dumps(self.payload()),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(InputObservation.objects.count(), 0)
