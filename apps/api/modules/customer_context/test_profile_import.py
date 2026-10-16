import copy
from uuid import UUID, uuid4

from django.test import SimpleTestCase

from .context import legacy_canonical_id
from .profile_import import (
    MAX_CONFLICTS,
    CompatibilityProjectionError,
    build_profile_import_plan,
    project_legacy_profile,
)


def legacy_profile(**changes):
    profile = {
        "workspace_id": str(uuid4()),
        "revision": 7,
        "company_name": "کارگاه نمونه",
        "industry": "تولید",
        "stage": "legacy-stage",
        "mission": "حفظ عین متن مأموریت",
        "problem_statement": "",
        "products": [
            {
                "id": "product-1",
                "name": "محصول اصلی",
                "description": "شرح محصول",
                "problem_solved": "مسئله مشتری",
                "target_customer": "فروشگاه کوچک",
            }
        ],
        "customer_segments": [
            {
                "id": "segment-1",
                "name": "خرده‌فروشان",
                "description": "کسب‌وکارهای خرد",
                "needs": "پیش‌بینی تقاضا",
                "buying_roles": "مدیر فروش",
            }
        ],
        "goals": [
            {
                "id": "goal-legacy-1",
                "title": "کاهش زمان تحویل",
                "success_signal": "یک روز کمتر",
                "timeframe": "فصل جاری",
            }
        ],
        "icps": [
            {
                "id": "icp-1",
                "name": "مدیر فروش خرده‌فروشی",
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
                "problem": "کمبود دادهٔ به‌روز",
                "evidence": [
                    {
                        "id": "evidence-1",
                        "source_type": "interview",
                        "reference": "مصاحبه ۱",
                        "statement": "باورهای تقاضا تغییر می‌کنند",
                        "date": "1405-01-01",
                        "confidence": "medium",
                    }
                ],
                "assumptions": [
                    {
                        "id": "assumption-1",
                        "statement": "مدیران فایل را به‌روز می‌کنند",
                        "confidence": "low",
                        "test": "مصاحبه با مدیران",
                        "status": "untested",
                    }
                ],
            }
        ],
    }
    profile.update(changes)
    return profile


class ProfileImportPlanTests(SimpleTestCase):
    def test_plan_preserves_source_and_builds_repeatable_scoped_record_ids(self):
        source = legacy_profile()
        before = copy.deepcopy(source)

        plan = build_profile_import_plan(source)

        self.assertEqual(source, before)
        self.assertEqual(plan["source_backup"], source)
        self.assertEqual(plan["source_profile_revision"], 7)
        self.assertEqual(
            {conflict["code"] for conflict in plan["conflicts"]},
            {"icp_segment_binding_requires_review"},
        )
        self.assertEqual(
            plan["deferred_profile_fields"], ["mission", "problem_statement", "goals"]
        )
        self.assertEqual(plan["planned_records"][0]["entity_type"], "product")
        for item in plan["planned_records"]:
            self.assertEqual(
                item["canonical_id"],
                str(
                    legacy_canonical_id(
                        UUID(source["workspace_id"]),
                        plan["source_namespace"],
                        item["entity_type"],
                        item["legacy_id"],
                    )
                ),
            )
        icp = next(
            item for item in plan["planned_records"] if item["entity_type"] == "icp"
        )
        self.assertEqual(icp["attributes"]["segment_id"], None)
        self.assertEqual(
            icp["attributes"]["legacy_segment_snapshot"], source["icps"][0]["segment"]
        )
        self.assertEqual(
            icp["attributes"]["legacy_evidence_snapshot"], source["icps"][0]["evidence"]
        )
        self.assertEqual(
            icp["attributes"]["legacy_assumptions_snapshot"],
            source["icps"][0]["assumptions"],
        )

    def test_duplicate_entity_ids_are_conflicts_and_neither_copy_is_planned(self):
        product = legacy_profile()["products"][0]
        source = legacy_profile(products=[product, copy.deepcopy(product)])

        plan = build_profile_import_plan(source)

        self.assertEqual(plan["counts"]["products"], 0)
        self.assertIn(
            "duplicate_legacy_id",
            {conflict["code"] for conflict in plan["conflicts"]},
        )
        self.assertFalse(
            any(item["entity_type"] == "product" for item in plan["planned_records"])
        )

    def test_noncanonical_legacy_ids_are_not_trimmed_into_new_identities(self):
        product = legacy_profile()["products"][0]
        product["id"] = " product-1 "

        plan = build_profile_import_plan(legacy_profile(products=[product]))

        self.assertFalse(
            any(item["entity_type"] == "product" for item in plan["planned_records"])
        )
        self.assertIn(
            "legacy_id_not_canonical",
            {conflict["code"] for conflict in plan["conflicts"]},
        )

    def test_profile_goal_title_match_is_reported_but_never_merged(self):
        source = legacy_profile()
        execution_goals = [
            {
                "id": str(uuid4()),
                "workspace_id": source["workspace_id"],
                "title": "  کاهش زمان   تحویل ",
            }
        ]

        plan = build_profile_import_plan(source, execution_goals)

        self.assertEqual(plan["counts"]["profile_goals_deferred"], 1)
        self.assertEqual(plan["goal_reviews"][0]["status"], "conflict")
        self.assertEqual(
            plan["goal_reviews"][0]["candidate_execution_goal_ids"],
            [execution_goals[0]["id"]],
        )
        self.assertIn(
            "goal_title_match_requires_review",
            {conflict["code"] for conflict in plan["conflicts"]},
        )
        self.assertFalse(
            any(item["entity_type"] == "goal" for item in plan["planned_records"])
        )
        self.assertEqual(plan["source_backup"]["mission"], source["mission"])

    def test_invalid_nested_icp_data_is_kept_in_backup_and_not_planned(self):
        source = legacy_profile()
        source["icps"][0]["evidence"][0]["source_type"] = "unknown-origin"

        plan = build_profile_import_plan(source)

        self.assertEqual(plan["source_backup"]["icps"], source["icps"])
        self.assertFalse(
            any(item["entity_type"] == "icp" for item in plan["planned_records"])
        )
        self.assertIn(
            "unknown_enum", {conflict["code"] for conflict in plan["conflicts"]}
        )

    def test_conflict_report_is_bounded_and_counts_suppressed_entries(self):
        source = legacy_profile(
            icps=[
                {
                    "id": f"icp-{index}",
                    "name": "ICP",
                    "segment": {"invalid": "shape"},
                    "persona": {"invalid": "shape"},
                    "problem": "",
                    "evidence": [{"invalid": "shape"}] * 10,
                    "assumptions": [{"invalid": "shape"}] * 10,
                }
                for index in range(20)
            ]
        )

        plan = build_profile_import_plan(source)

        self.assertEqual(len(plan["conflicts"]), MAX_CONFLICTS)
        self.assertGreater(plan["suppressed_conflict_count"], 0)
        self.assertEqual(
            plan["counts"]["conflicts"],
            MAX_CONFLICTS + plan["suppressed_conflict_count"],
        )


class LegacyProfileProjectionTests(SimpleTestCase):
    def test_projector_round_trips_supported_profile_entities_and_keeps_goals(self):
        source = legacy_profile()
        plan = build_profile_import_plan(source)
        products = []
        segments = []
        icps = []
        identity_maps = []
        for row in plan["planned_records"]:
            canonical_id = row["canonical_id"]
            entity = {
                "id": canonical_id,
                "workspace_id": source["workspace_id"],
                **row["attributes"],
            }
            identity_maps.append(
                {
                    "workspace_id": source["workspace_id"],
                    "entity_type": row["entity_type"],
                    "legacy_id": row["legacy_id"],
                    "source_position": row["source_position"],
                    "canonical_id": canonical_id,
                }
            )
            {"product": products, "segment": segments, "icp": icps}[
                row["entity_type"]
            ].append(entity)

        projection = project_legacy_profile(
            source, products, segments, icps, identity_maps
        )

        self.assertEqual(projection, source)

    def test_projector_rejects_missing_identity_and_foreign_workspace(self):
        source = legacy_profile(products=[])
        product = {
            "id": str(uuid4()),
            "workspace_id": source["workspace_id"],
            "name": "بدون نگاشت",
        }

        with self.assertRaisesRegex(CompatibilityProjectionError, "no legacy identity"):
            project_legacy_profile(source, [product], [], [], [])

        mapping = {
            "workspace_id": str(uuid4()),
            "entity_type": "product",
            "legacy_id": "product-1",
            "source_position": 0,
            "canonical_id": product["id"],
        }
        with self.assertRaisesRegex(CompatibilityProjectionError, "another Workspace"):
            project_legacy_profile(source, [product], [], [], [mapping])

        mapping["workspace_id"] = source["workspace_id"]
        product.pop("workspace_id")
        with self.assertRaisesRegex(CompatibilityProjectionError, "another Workspace"):
            project_legacy_profile(source, [product], [], [], [mapping])

    def test_projection_restores_legacy_collection_order_from_identity_maps(self):
        first = legacy_profile()["products"][0]
        second = copy.deepcopy(first)
        second.update(id="product-2", name="محصول دوم")
        source = legacy_profile(products=[first, second])
        plan = build_profile_import_plan(source)
        products = []
        identity_maps = []
        for row in reversed(plan["planned_records"]):
            if row["entity_type"] != "product":
                continue
            products.append(
                {
                    "id": row["canonical_id"],
                    "workspace_id": source["workspace_id"],
                    **row["attributes"],
                }
            )
            identity_maps.append(
                {
                    "workspace_id": source["workspace_id"],
                    "entity_type": row["entity_type"],
                    "legacy_id": row["legacy_id"],
                    "source_position": row["source_position"],
                    "canonical_id": row["canonical_id"],
                }
            )

        projection = project_legacy_profile(source, products, [], [], identity_maps)

        self.assertEqual(projection["products"], source["products"])

    def test_goal_title_candidates_are_scoped_to_the_same_workspace(self):
        source = legacy_profile()
        foreign_goal = {
            "id": str(uuid4()),
            "workspace_id": str(uuid4()),
            "title": source["goals"][0]["title"],
        }

        plan = build_profile_import_plan(source, [foreign_goal])

        self.assertEqual(plan["goal_reviews"][0]["candidate_execution_goal_ids"], [])
        self.assertEqual(plan["goal_reviews"][0]["status"], "needs_review")
