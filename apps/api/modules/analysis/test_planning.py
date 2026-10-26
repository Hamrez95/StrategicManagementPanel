import uuid

from django.test import Client, TestCase
from django.utils import timezone

from modules.accounts.models import User
from modules.metrics.models import CalculationRun, FinanceCapture, InputObservation
from modules.workspaces.models import BillingAccount, Membership, Workspace
from modules.workspaces.testing import grant_test_management_access

from .models import PlanningRevision
from .planning_views import TOOLS


class PlanningApiTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            "planning-owner@example.test", email_verified_at=timezone.now()
        )
        self.viewer = User.objects.create_user(
            "planning-viewer@example.test", email_verified_at=timezone.now()
        )
        self.outsider = User.objects.create_user(
            "planning-other@example.test",
            email_verified_at=timezone.now(),
            is_staff=True,
        )
        self.workspace = Workspace.objects.create(
            owner=self.owner,
            billing_account=BillingAccount.objects.create(owner=self.owner),
            name="Synthetic planning",
        )
        self.foreign = Workspace.objects.create(
            owner=self.outsider,
            billing_account=BillingAccount.objects.create(owner=self.outsider),
            name="Other",
        )
        Membership.objects.create(
            workspace=self.workspace, user=self.viewer, role="viewer"
        )
        self.client.force_login(self.owner)

    def url(self, tool="environment", record=None, workspace=None):
        return (
            f"/api/v1/workspaces/{(workspace or self.workspace).pk}/planning/{tool}/"
            + (f"{record}/" if record else "")
        )

    def body(self, tool="environment"):
        rows = {
            "environment": {
                "category": "economic",
                "observation": "مشاهدهٔ نمونه",
                "implication": "اثر نمونه",
                "source": "Synthetic source",
                "observed_on": "2026-01-01",
            },
            "industry": {
                "customer_segment": "Segment",
                "value_proposition": "Value",
                "advantage": "Difference",
                "source": "Source",
                "observed_on": None,
            },
            "internal": {
                "description": "Resource",
                "valuable": "unknown",
                "rare": "yes",
                "hard_to_imitate": "no",
                "organized": "unknown",
                "source": "Source",
            },
            "scenarios": {
                "uncertainty": "Uncertainty",
                "assumptions": "Assumptions",
                "early_signal": "Signal",
                "response": "Response",
                "review_on": None,
            },
            "risks": {
                "description": "Risk",
                "likelihood": "unknown",
                "impact": "high",
                "mitigation": "Response",
                "responsible": "Manager",
                "review_on": None,
                "status": "open",
            },
            "journey": {
                "stage": "understand", "status": "in_progress", "outcome": "Outcome"
            },
        }
        return dict(id=str(uuid.uuid4()), title="عنوان نمونه", **rows[tool])

    def post(self, url, body):
        return self.client.post(url, body, content_type="application/json")

    def test_all_tools_round_trip_update_history_and_retry(self):
        for tool, model in TOOLS.items():
            with self.subTest(tool=tool):
                body = self.body(tool)
                response = self.post(self.url(tool), body)
                self.assertEqual(response.status_code, 201, response.content)
                self.assertEqual(self.post(self.url(tool), body).status_code, 201)
                self.assertEqual(model.objects.count(), 1)
                stored = self.client.get(self.url(tool)).json()["items"][0]
                self.assertEqual(stored["workspace_id"], str(self.workspace.pk))
                update = {k: v for k, v in body.items() if k != "id"} | {
                    "revision": 1,
                    "title": "نسخهٔ دوم",
                }
                updated = self.client.patch(
                    self.url(tool, body["id"]), update, content_type="application/json"
                )
                self.assertEqual(updated.status_code, 200, updated.content)
                self.assertEqual(updated.json()["revision"], 2)
                self.assertEqual(
                    self.client.patch(
                        self.url(tool, body["id"]),
                        update,
                        content_type="application/json",
                    ).status_code,
                    409,
                )
                self.assertEqual(PlanningRevision.objects.filter(tool=tool).count(), 2)
                self.assertEqual(self.post(self.url(tool), body).json()["revision"], 2)

    def test_scope_viewer_archived_and_staff_not_bypass(self):
        for user, status in ((self.viewer, 403), (self.outsider, 404)):
            self.client.force_login(user)
            for tool in TOOLS:
                self.assertEqual(
                    self.post(self.url(tool), self.body(tool)).status_code, status
                )
        self.client.force_login(self.owner)
        body = self.body()
        self.assertEqual(self.post(self.url(), body).status_code, 201)
        self.assertEqual(
            self.post(self.url(workspace=self.foreign), body).status_code, 404
        )
        self.workspace.archived_at = timezone.now()
        self.workspace.save(update_fields=["archived_at"])
        self.assertIn(self.post(self.url(), self.body()).status_code, (404, 409))

    def test_reject_extra_fields_invalid_choices_blank_and_unknown_routes(self):
        for change in (
            {"workspace_id": str(self.foreign.pk)},
            {"category": "invented"},
            {"title": " "},
            {"observed_on": "2026-02-31"},
            {"source": ""},
        ):
            response = self.post(self.url(), self.body() | change)
            self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(self.post(self.url("unknown"), {}).status_code, 404)
        self.assertEqual(self.client.get(self.url() + "?offset=-1").status_code, 400)

    def test_unique_stage_and_mutated_request_id(self):
        body = self.body("journey")
        self.assertEqual(self.post(self.url("journey"), body).status_code, 201)
        self.assertEqual(
            self.post(self.url("journey"), body | {"title": "Different"}).status_code,
            409,
        )
        self.assertEqual(
            self.post(self.url("journey"), self.body("journey")).status_code, 400
        )

    def test_csrf_and_anonymous(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.owner)
        self.assertEqual(
            client.post(
                self.url(), self.body(), content_type="application/json"
            ).status_code,
            403,
        )
        self.client.logout()
        self.assertEqual(self.client.get(self.url()).status_code, 401)


class FinanceWorkbenchTests(PlanningApiTests):
    def finance_url(self):
        return f"/api/v1/workspaces/{self.workspace.pk}/metrics/captures/"

    def finance_body(self):
        context = {
            "scope_kind": "workspace",
            "segment_id": None,
            "period_start": "2026-01-01",
            "period_end": "2026-02-01",
            "currency": "IRR",
            "accounting_basis": "cash",
        }

        def observation(binding, value):
            return dict(
                **context,
                binding_id=binding,
                state="observed",
                value=value,
                unit="currency",
                cost_scope="Sales-variable costs"
                if binding == "variable_costs"
                else "",
                source_kind="owner_reported",
                source_id="Synthetic statement",
                source_revision="v1",
                reason="",
                evidence_ids=[],
            )

        return {
            "id": str(uuid.uuid4()),
            "context": context,
            "observations": [
                observation("net_revenue", "200"),
                observation("variable_costs", "80"),
            ],
        }

    def test_capture_retry_and_immutable_calculation(self):
        grant_test_management_access(self.owner)
        body = self.finance_body()
        response = self.post(self.finance_url(), body)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(self.post(self.finance_url(), body).status_code, 201)
        self.assertEqual(InputObservation.objects.count(), 2)
        url = self.finance_url() + body["id"] + "/calculate/"
        result = self.post(url, {})
        self.assertEqual(result.status_code, 200, result.content)
        self.assertEqual(result.json()["run"]["results"][0]["value"], "120.000000")
        self.assertEqual(
            self.post(url, {}).json()["run"]["id"], result.json()["run"]["id"]
        )
        self.assertEqual(CalculationRun.objects.count(), 1)
        self.assertEqual(
            self.client.get(self.finance_url()).json()["items"][0]["id"], body["id"]
        )

    def test_capture_free_but_calculation_grant_required(self):
        body = self.finance_body()
        self.assertEqual(self.post(self.finance_url(), body).status_code, 201)
        self.assertEqual(
            self.post(self.finance_url() + body["id"] + "/calculate/", {}).status_code,
            403,
        )
        self.assertEqual(FinanceCapture.objects.count(), 1)
        self.assertEqual(CalculationRun.objects.count(), 0)

    def test_unknown_not_zero_and_context_mismatch(self):
        grant_test_management_access(self.owner)
        body = self.finance_body()
        body["observations"][0].update(
            state="unknown", value=None, reason="Not available"
        )
        response = self.post(self.finance_url(), body)
        self.assertEqual(response.status_code, 201, response.content)
        result = self.post(self.finance_url() + body["id"] + "/calculate/", {})
        self.assertEqual(result.status_code, 200, result.content)
        self.assertIsNone(result.json()["run"]["results"][0]["value"])
        invalid = self.finance_body()
        invalid["observations"][0]["currency"] = "USD"
        self.assertEqual(self.post(self.finance_url(), invalid).status_code, 400)

    def test_capture_invalid_value_and_viewer_cannot_write(self):
        body = self.finance_body()
        body["observations"][0]["value"] = "NaN"
        self.assertEqual(self.post(self.finance_url(), body).status_code, 400)
        self.client.force_login(self.viewer)
        self.assertEqual(
            self.post(self.finance_url(), self.finance_body()).status_code, 403
        )
