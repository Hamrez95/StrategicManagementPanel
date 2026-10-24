"""Recalculate only existing reviewed engines; never evaluate client formulas."""
from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError

from modules.analysis.calculation import evaluate_matrix
from modules.analysis.services import METHOD_VERSIONS, _inputs
from modules.knowledge.registry import load_release
from modules.metrics.calculations import ContributionContext, ContributionInput, calculate_contribution_amount


def verify_report(data):
    analyses = []
    metrics = []
    draft = False
    for analysis in data['analyses']:
        if analysis['schema_version'] != 1 or METHOD_VERSIONS.get(analysis['kind']) != analysis['method_version']:
            raise ValidationError('Unsupported analysis method.')
        inputs = _inputs(analysis['inputs'])
        output = evaluate_matrix(analysis['kind'], inputs['rows'])
        draft |= analysis['state'] != 'finalized' or not output['can_finalize']
        analyses.append({**analysis, 'output': output})

    observations = {item['id']: item for item in data['observations']}
    evidence = {item['id']: item for item in data['evidence']}
    for run in data['calculation_runs']:
        if (run['metric_id'], run['method_revision'], run['variant']) != (
            'MET-CONTRIBUTION-MARGIN', 'contribution-amount-v1', 'amount'
        ):
            raise ValidationError('Unsupported metric method.')
        release = load_release(run['knowledge_release_id'])
        definition = release.get(run['metric_id'])
        if release.content_sha256 != run['knowledge_release_hash'] or definition is None or definition.definition.get('runtime_gate', {}).get('status') != 'typed_calculation_only':
            raise ValidationError('Exact reviewed release is unavailable.')
        context = ContributionContext(
            workspace_id=data['workspace']['id'], scope_kind=run['scope_kind'], segment_id=run['segment_id'],
            period_start=date.fromisoformat(run['period_start']), period_end=date.fromisoformat(run['period_end']),
            currency=run['currency'], accounting_basis=run['accounting_basis'],
        )
        typed = {}
        if not isinstance(run['input_snapshot'], list):
            raise ValidationError('Invalid metric trace.')
        for trace in run['input_snapshot']:
            observation = observations.get(trace['observation_id'])
            if observation is None or any(trace[key] != observation[key] for key in (
                'binding_id', 'revision', 'state', 'value', 'unit', 'currency', 'accounting_basis', 'cost_scope',
                'source_id', 'source_kind', 'source_revision', 'reason', 'scope_kind', 'segment_id', 'period_start', 'period_end',
            )):
                raise ValidationError('Metric trace does not match its scoped immutable observation.')
            for link in trace['evidence']:
                source = evidence.get(link['evidence_id'])
                if source is None or source['permission_status'] != 'available' or source['revision'] != link['revision']:
                    raise ValidationError('Metric evidence is unavailable or revised.')
            binding = trace['binding_id']
            if binding in typed:
                raise ValidationError('Duplicate metric binding.')
            typed[binding] = ContributionInput(
                binding_id=binding, workspace_id=context.workspace_id, scope_kind=trace['scope_kind'],
                segment_id=trace['segment_id'], period_start=date.fromisoformat(trace['period_start']),
                period_end=date.fromisoformat(trace['period_end']), state=trace['state'],
                value=Decimal(trace['value']) if trace['value'] is not None else None,
                unit=trace['unit'], currency=trace['currency'], accounting_basis=trace['accounting_basis'],
                cost_scope=trace['cost_scope'], reason=trace['reason'],
            )
        result = calculate_contribution_amount(typed, context)
        draft |= result.status != 'observed'
        metrics.append({
            'run_id': run['id'], 'method_revision': run['method_revision'], 'status': result.status,
            'value': str(result.value) if result.value is not None else None, 'unit': 'currency',
            'currency': result.currency, 'cost_scope': result.cost_scope, 'reason': result.reason,
            'missing_inputs': list(result.missing_inputs),
        })
    draft |= any(item['state'] != 'observed' for item in data['observations'])
    draft |= any(item['status'] != 'ready' for item in data['documents'])
    draft |= any(item['claim_type'] in ('hypothesis', 'assumption') for item in data['claims'])
    draft |= any(item['permission_status'] != 'available' for item in data['evidence'])
    return {'state': 'draft' if draft or not (analyses or metrics) else 'verified',
            'analyses': analyses, 'metrics': metrics, 'calculated_server_side': True}
