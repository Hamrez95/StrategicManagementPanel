from django.test import TransactionTestCase
from django.utils import timezone

from modules.accounts.models import User
from modules.workspaces.models import (
    BillingAccount,
    Membership,
    Workspace,
    WorkspaceProfile,
    WorkspaceProfileRevision,
)
from modules.workspaces.profile_services import update_workspace_profile
from modules.workspaces.services import WorkspaceActionError

from .models import (
    IdealCustomerProfile,
    LegacyProfileIdentityMap,
    Product,
    ProfileMigrationBatch,
    Segment,
)
from .profile_import import build_profile_import_plan
from .profile_migration import apply_profile_import


class ProfileMigrationTransactionTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.owner = User.objects.create_user(
            "owner@example.test",
            password="not-a-real-user-password",
            email_verified_at=timezone.now(),
        )
        self.viewer = User.objects.create_user(
            "viewer@example.test",
            password="not-a-real-user-password",
            email_verified_at=timezone.now(),
        )
        billing = BillingAccount.objects.create(owner=self.owner)
        self.workspace = Workspace.objects.create(
            owner=self.owner, billing_account=billing, name="Workspace"
        )
        Membership.objects.create(
            workspace=self.workspace,
            user=self.viewer,
            role=Membership.Role.VIEWER,
        )
        self.profile = WorkspaceProfile.objects.create(
            workspace=self.workspace,
            company_name="کارگاه نمونه",
            products=[
                {
                    "id": "product-1",
                    "name": "محصول اصلی",
                    "description": "شرح محصول",
                    "problem_solved": "مسئله مشتری",
                    "target_customer": "فروشگاه کوچک",
                }
            ],
            customer_segments=[
                {
                    "id": "segment-1",
                    "name": "خرده‌فروشان",
                    "description": "کسب‌وکارهای خرد",
                    "needs": "پیش‌بینی تقاضا",
                    "buying_roles": "مدیر فروش",
                }
            ],
            goals=[
                {
                    "id": "goal-1",
                    "title": "هدف مستقل",
                    "success_signal": "شاخص",
                    "timeframe": "فصل جاری",
                }
            ],
            icps=[
                {
                    "id": "icp-1",
                    "name": "مدیر فروش",
                    "segment": {
                        "industry": "خرده‌فروشی",
                        "organization_size": "کوچک",
                        "geography": "ایران",
                        "buying_context": "فصلی",
                    },
                    "persona": {
                        "role": "مدیر فروش",
                        "decision_role": "تصمیم‌گیر",
                        "goals": "کاهش کمبود کالا",
                        "pains": "اطلاعات دیرهنگام",
                    },
                    "problem": "کمبود داده",
                    "evidence": [],
                    "assumptions": [],
                }
            ],
        )
        self.plan = build_profile_import_plan(self.snapshot())
        self.source_revision = self.profile.revision

    def snapshot(self):
        return {
            "workspace_id": str(self.workspace.pk),
            "revision": self.profile.revision,
            "company_name": self.profile.company_name,
            "industry": self.profile.industry,
            "stage": self.profile.stage,
            "mission": self.profile.mission,
            "problem_statement": self.profile.problem_statement,
            "products": self.profile.products,
            "customer_segments": self.profile.customer_segments,
            "goals": self.profile.goals,
            "icps": self.profile.icps,
            "onboarding_completed_at": None,
        }

    def apply(self, *, actor=None, **changes):
        return apply_profile_import(
            actor or self.owner,
            self.workspace,
            expected_revision=self.source_revision,
            expected_source_digest=self.plan["source_digest"],
            idempotency_key="profile-cutover-0001",
            reviewed_conflict_codes=["icp_segment_binding_requires_review"],
            **changes,
        )

    def test_owner_cutover_is_auditable_idempotent_and_keeps_goals(self):
        result = self.apply()

        self.profile.refresh_from_db()
        self.assertEqual(result["migrated_profile_revision"], 2)
        self.assertEqual(self.profile.revision, 2)
        self.assertEqual(self.profile.goals[0]["id"], "goal-1")
        self.assertEqual(Product.objects.filter(workspace=self.workspace).count(), 1)
        self.assertEqual(Segment.objects.filter(workspace=self.workspace).count(), 1)
        self.assertEqual(
            IdealCustomerProfile.objects.filter(workspace=self.workspace).count(), 1
        )
        self.assertEqual(
            LegacyProfileIdentityMap.objects.filter(workspace=self.workspace).count(), 3
        )
        self.assertEqual(
            ProfileMigrationBatch.objects.get(workspace=self.workspace).source_backup,
            self.plan["source_backup"],
        )
        self.assertEqual(
            WorkspaceProfileRevision.objects.filter(profile=self.profile).count(), 1
        )
        repeated = self.apply()
        self.assertTrue(repeated["already_applied"])
        self.assertEqual(repeated["id"], result["id"])

    def test_viewer_cannot_apply_workspace_wide_cutover(self):
        with self.assertRaises(WorkspaceActionError) as error:
            self.apply(actor=self.viewer)

        self.assertEqual(error.exception.code, "workspace_permission_denied")
        self.assertFalse(ProfileMigrationBatch.objects.filter(workspace=self.workspace).exists())

    def test_digest_mismatch_rolls_back_without_partial_canonical_rows(self):
        with self.assertRaises(WorkspaceActionError) as error:
            apply_profile_import(
                self.owner,
                self.workspace,
                expected_revision=self.source_revision,
                expected_source_digest="0" * 64,
                idempotency_key="profile-cutover-0002",
                reviewed_conflict_codes=["icp_segment_binding_requires_review"],
            )

        self.assertEqual(error.exception.code, "source_digest_conflict")
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.revision, self.source_revision)
        self.assertFalse(ProfileMigrationBatch.objects.filter(workspace=self.workspace).exists())
        self.assertFalse(Product.objects.filter(workspace=self.workspace).exists())
        self.assertFalse(Segment.objects.filter(workspace=self.workspace).exists())
        self.assertFalse(
            IdealCustomerProfile.objects.filter(workspace=self.workspace).exists()
        )

    def test_existing_profile_write_service_updates_canonical_and_projection(self):
        self.apply()
        profile = WorkspaceProfile.objects.get(workspace=self.workspace)
        products = [dict(profile.products[0], name="نام به‌روز")]

        updated = update_workspace_profile(
            self.owner,
            self.workspace,
            revision=profile.revision,
            products=products,
        )

        product = Product.objects.get(workspace=self.workspace)
        self.assertEqual(product.name, "نام به‌روز")
        self.assertEqual(updated.products[0]["name"], "نام به‌روز")
        self.assertEqual(updated.revision, profile.revision + 1)
        self.assertEqual(updated.goals, profile.goals)
        self.assertEqual(updated.customer_segments[0]["id"], "segment-1")
        self.assertEqual(
            WorkspaceProfileRevision.objects.filter(profile=updated).count(), 2
        )

