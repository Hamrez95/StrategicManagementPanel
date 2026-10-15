from datetime import date
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from .context import ContextRef, legacy_canonical_id
from .models import LegacyProfileIdentityMap, Segment


class ContextRefTests(SimpleTestCase):
    def test_whole_business_scope_is_the_workspace_without_a_duplicate_business_id(
        self,
    ):
        workspace_id = uuid4()

        context = ContextRef(workspace_id=workspace_id)

        self.assertEqual(context.scope_kind, "whole_business")
        self.assertIsNone(context.segment_id)

    def test_segment_scope_requires_a_stable_segment_id(self):
        with self.assertRaisesRegex(ValueError, "segment_id is required"):
            ContextRef(workspace_id=uuid4(), scope_kind="segment")

        segment_id = uuid4()
        context = ContextRef(
            workspace_id=uuid4(), scope_kind="segment", segment_id=segment_id
        )
        self.assertEqual(context.segment_id, segment_id)

    def test_period_is_half_open_and_revision_is_positive(self):
        with self.assertRaisesRegex(ValueError, "Both period boundaries"):
            ContextRef(workspace_id=uuid4(), period_start=date(2026, 1, 1))
        with self.assertRaisesRegex(ValueError, "later than"):
            ContextRef(
                workspace_id=uuid4(),
                period_start=date(2026, 1, 2),
                period_end=date(2026, 1, 1),
            )
        with self.assertRaisesRegex(ValueError, "positive"):
            ContextRef(workspace_id=uuid4(), input_revision=0)

    def test_legacy_ids_are_deterministic_and_scoped_by_workspace_source_and_type(self):
        workspace = uuid4()
        same = legacy_canonical_id(workspace, "stratino-profile-v1", "icp", "icp-1")

        self.assertEqual(
            same, legacy_canonical_id(workspace, "stratino-profile-v1", "icp", "icp-1")
        )
        self.assertNotEqual(
            same, legacy_canonical_id(uuid4(), "stratino-profile-v1", "icp", "icp-1")
        )
        self.assertNotEqual(
            same, legacy_canonical_id(workspace, "other-source", "icp", "icp-1")
        )
        self.assertNotEqual(
            same,
            legacy_canonical_id(workspace, "stratino-profile-v1", "product", "icp-1"),
        )

    def test_legacy_id_mapping_rejects_ambiguous_or_untyped_inputs(self):
        for args in (
            (uuid4(), "", "product", "p-1"),
            (uuid4(), "profile-v1", "goal", "g-1"),
            (uuid4(), "profile-v1", "product", " p-1 "),
        ):
            with self.subTest(args=args), self.assertRaises(ValueError):
                legacy_canonical_id(*args)

    def test_identity_map_requires_a_matching_target_in_the_same_workspace(self):
        workspace_id = uuid4()
        segment = Segment(id=uuid4(), workspace_id=workspace_id, name="بنگاه‌های کوچک")
        mapping = LegacyProfileIdentityMap(
            workspace_id=workspace_id,
            source_namespace="stratino-profile-v1",
            entity_type="segment",
            legacy_id="segment-1",
            source_profile_revision=1,
            segment=segment,
        )

        mapping.clean()
        self.assertEqual(mapping.canonical_id, segment.pk)

        foreign_segment = Segment(
            id=uuid4(), workspace_id=uuid4(), name="شناسه فضای دیگر"
        )
        mapping.segment = foreign_segment
        with self.assertRaisesRegex(ValidationError, "this Workspace"):
            mapping.clean()
