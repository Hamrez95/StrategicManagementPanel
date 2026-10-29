"""Explicit, additive v2 transfer contract. Never expand v1 by model discovery."""
from decimal import Decimal

from modules.analysis.models import AnalysisRevision
from modules.customer_context.models import Product, Segment, IdealCustomerProfile, LegacyProfileIdentityMap
from modules.evidence.models import Claim, Evidence, ClaimEvidenceLink, ConfidenceAssessment
from modules.metrics.models import InputObservation, InputObservationEvidence, CalculationRun, MetricValue
from modules.documents.models import DocumentAttachment
from modules.analysis.models import CompetitorProfile, EnvironmentSignal, JourneyStep, PlanningRevision, ResourceAssessment, RiskRecord, ScenarioPlan
from modules.metrics.models import FinanceCapture
from modules.execution.models import (Scorecard, ScorecardObjective, ScorecardAction, ScorecardIndicator, ScorecardObservation, ScorecardRelation, ScorecardReview, ScorecardRevision)


V2_FIELDS = {
    'scorecards': (Scorecard, 'id title scope strategy decision_id period_start period_end revision created_by_id created_at updated_at'),
    'scorecard_objectives': (ScorecardObjective, 'id card_id perspective title goal_id position'),
    'scorecard_actions': (ScorecardAction, 'id objective_id action_id request_id request_fingerprint'),
    'scorecard_indicators': (ScorecardIndicator, 'id objective_id name definition unit formula direction baseline baseline_on target target_high warning_margin due_on cadence_days source owner_id kind guardrail position'),
    'scorecard_observations': (ScorecardObservation, 'id indicator_id request_id observed_on value evidence definition_snapshot created_by_id created_at'),
    'scorecard_relations': (ScorecardRelation, 'id card_id source_id destination_id rationale test_method'),
    'scorecard_reviews': (ScorecardReview, 'id card_id request_id reviewed_on decision action_id created_by_id created_at'),
    'scorecard_history': (ScorecardRevision, 'id card_id revision snapshot actor_id created_at'),
    'environment_signals': (EnvironmentSignal, 'id title category observation implication source observed_on revision created_at updated_at'),
    'competitor_profiles': (CompetitorProfile, 'id title customer_segment value_proposition advantage source observed_on revision created_at updated_at'),
    'resource_assessments': (ResourceAssessment, 'id title description valuable rare hard_to_imitate organized source revision created_at updated_at'),
    'scenario_plans': (ScenarioPlan, 'id title uncertainty assumptions early_signal response review_on revision created_at updated_at'),
    'risk_records': (RiskRecord, 'id title description likelihood impact mitigation responsible review_on status revision created_at updated_at'),
    'journey_steps': (JourneyStep, 'id title stage status outcome revision created_at updated_at'),
    'planning_history': (PlanningRevision, 'id tool record_id revision snapshot recorded_at'),
    'finance_captures': (FinanceCapture, 'id revenue_id variable_costs_id run_id created_at'),
    'products': (Product, 'id name description problem_solved target_customer_legacy revision created_at updated_at'),
    'segments': (Segment, 'id name description needs buying_roles industry organization_size geography buying_context revision created_at updated_at'),
    'icps': (IdealCustomerProfile, 'id name segment_id persona_role persona_decision_role persona_goals persona_pains problem legacy_segment_snapshot legacy_evidence_snapshot legacy_assumptions_snapshot revision created_at updated_at'),
    'context_identities': (LegacyProfileIdentityMap, 'id source_namespace entity_type legacy_id source_position source_profile_revision product_id segment_id icp_id'),
    'claims': (Claim, 'id statement claim_type status scope_kind segment_id period_start period_end expires_at revision created_at updated_at'),
    'evidence': (Evidence, 'id origin source_id source_revision provenance method observed_at imported_at review_due period_start period_end sample population geography limitations permission_scope permission_status scope_kind segment_id revision created_at updated_at'),
    'claim_evidence_links': (ClaimEvidenceLink, 'id claim_id evidence_id polarity rationale revision reviewed_at created_at updated_at'),
    'confidence_assessments': (ConfidenceAssessment, 'id claim_id claim_revision revision confidence freshness axis_reviews contradiction_status contradiction_reason essential_information_missing missing_information_reason limitations_known limitations_reason rationale rule_revision source_trace reviewed_at'),
    'observations': (InputObservation, 'id binding_id scope_kind segment_id period_start period_end value state unit currency accounting_basis cost_scope source_kind source_id source_revision reason revision created_at'),
    'observation_evidence_links': (InputObservationEvidence, 'id observation_id evidence_id evidence_revision permission_status created_at'),
    'calculation_runs': (CalculationRun, 'id metric_id method_revision knowledge_release_id knowledge_release_hash variant scope_kind segment_id period_start period_end currency accounting_basis cost_scope input_revision input_snapshot created_at'),
    'metric_values': (MetricValue, 'id run_id metric_id variant value status unit currency reason created_at'),
    'analysis_history': (AnalysisRevision, 'id source_record_id revision snapshot recorded_at is_backfill'),
    'attachment_records': (DocumentAttachment, 'id document_id original_name extension media_type version size_bytes sha256 status created_at updated_at'),
}
V2_EXTRA_SCOPE = [*V2_FIELDS, 'report_verification']
PROFESSIONAL_METHOD = 'stratino-professional-report-v1'


def collect_v2(workspace, model_values):
    result = {}
    for section, (model, fields) in V2_FIELDS.items():
        lookup = {'workspace': workspace}
        if section in ('scorecard_objectives', 'scorecard_relations', 'scorecard_reviews', 'scorecard_history'):
            lookup = {'card__workspace': workspace}
        elif section in ('scorecard_indicators', 'scorecard_actions'):
            lookup = {'objective__card__workspace': workspace}
        elif section == 'scorecard_observations':
            lookup = {'indicator__objective__card__workspace': workspace}
        if section == 'observation_evidence_links':
            lookup = {'observation__workspace': workspace, 'evidence__workspace': workspace}
        elif section == 'metric_values':
            lookup = {'run__workspace': workspace}
        result[section] = []
        for item in model.objects.filter(**lookup).order_by('pk'):
            value = model_values(item, fields.split())
            result[section].append({key: str(part) if isinstance(part, Decimal) else part for key, part in value.items()})
    result['report_verification'] = None
    return result
