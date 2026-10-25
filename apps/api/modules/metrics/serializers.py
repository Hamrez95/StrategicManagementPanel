"""Bounded wire inputs for the reviewed contribution-amount slice only."""

from rest_framework import serializers

from .bindings import NUMERIC_INPUT_BINDINGS
from .models import ObservationState


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, dict) and set(data) - set(self.fields):
            raise serializers.ValidationError(
                {"non_field_errors": ["Unexpected fields are not accepted."]}
            )
        return super().to_internal_value(data)


class ExactDecimalField(serializers.DecimalField):
    def to_internal_value(self, data):
        if not isinstance(data, str):
            raise serializers.ValidationError("Send an exact decimal string.")
        return super().to_internal_value(data)


class MetricContextSerializer(StrictSerializer):
    scope_kind = serializers.ChoiceField(choices=("workspace", "segment"))
    segment_id = serializers.UUIDField(allow_null=True)
    period_start = serializers.DateField(input_formats=["%Y-%m-%d"])
    period_end = serializers.DateField(input_formats=["%Y-%m-%d"])
    currency = serializers.RegexField(r"^[A-Z]{3}$", max_length=3)
    accounting_basis = serializers.CharField(max_length=64)

    def validate(self, attrs):
        if (attrs["scope_kind"] == "segment") != (attrs["segment_id"] is not None):
            raise serializers.ValidationError(
                {"segment_id": "Scope and Segment must agree."}
            )
        if attrs["period_start"] >= attrs["period_end"]:
            raise serializers.ValidationError(
                {"period_end": "The end must follow the start."}
            )
        return attrs


class ObservationCreateSerializer(MetricContextSerializer):
    binding_id = serializers.ChoiceField(choices=tuple(NUMERIC_INPUT_BINDINGS))
    state = serializers.ChoiceField(choices=ObservationState.choices)
    value = ExactDecimalField(max_digits=24, decimal_places=6, allow_null=True)
    unit = serializers.ChoiceField(choices=("currency",))
    cost_scope = serializers.CharField(max_length=240, allow_blank=True, default="")
    source_kind = serializers.ChoiceField(choices=("owner_reported",))
    source_id = serializers.CharField(max_length=160)
    source_revision = serializers.CharField(max_length=80)
    reason = serializers.CharField(max_length=1000, allow_blank=True, default="")
    evidence_ids = serializers.ListField(
        child=serializers.UUIDField(), max_length=20, default=list
    )

    def validate_evidence_ids(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Evidence IDs must be unique.")
        return value


class ContributionCreateSerializer(MetricContextSerializer):
    observation_ids = serializers.ListField(
        child=serializers.UUIDField(), max_length=2, allow_empty=True
    )
    knowledge_release_id = serializers.CharField(max_length=100)


class MetricPageSerializer(StrictSerializer):
    offset = serializers.IntegerField(min_value=0, max_value=100000, default=0)
