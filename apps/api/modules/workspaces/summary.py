from django.utils import timezone

from modules.analysis.models import Analysis
from modules.documents.models import DocumentRecord
from modules.execution.models import Action, Decision

SHORTCUTS = {
    'customers': ('company', 'swot', 'execution'),
    'growth': ('matrices', 'company', 'execution'),
    'strategy': ('swot', 'matrices', 'execution'),
    'execution': ('execution', 'documents', 'reports'),
}


def _profile_state(workspace):
    profile = getattr(workspace, 'profile', None)
    if profile is None:
        return {'state': 'empty', 'provided_fields': []}
    fields = {
        'company_name': bool(profile.company_name.strip()),
        'industry': bool(profile.industry.strip()),
        'stage': bool(profile.stage.strip()),
        'mission': bool(profile.mission.strip()),
        'problem_statement': bool(profile.problem_statement.strip()),
        'products': bool(profile.products),
        'customer_segments': bool(profile.customer_segments),
        'goals': bool(profile.goals),
        'icps': bool(profile.icps),
    }
    provided = [name for name, value in fields.items() if value]
    return {'state': 'started' if provided else 'empty', 'provided_fields': provided}


def read_workspace_summary(workspace, role):
    """Resolve a compact, read-only view from canonical records in one Workspace."""
    today = timezone.localdate()
    # Membership has already been checked at the HTTP boundary; callers pass the role so
    # this summary does not need to perform another membership lookup.
    actions = list(
        Action.objects.filter(workspace=workspace)
        .exclude(status=Action.Status.DONE)
        .order_by('due_on', 'created_at', 'id')[:3]
    )
    overdue_actions = [item for item in actions if item.due_on < today]
    proposed_decisions = list(
        Decision.objects.filter(workspace=workspace, status=Decision.Status.PROPOSED)
        .order_by('updated_at', 'id')[:3]
    )
    document_records = list(
        DocumentRecord.objects.filter(workspace=workspace)
        .exclude(status=DocumentRecord.Status.READY)
        .order_by('updated_at', 'id')[:3]
    )

    profile = _profile_state(workspace)
    objective = getattr(getattr(workspace, 'setup', None), 'setup_objective', None)
    shortcuts = SHORTCUTS.get(objective, ('company', 'swot', 'execution'))
    open_actions = [
        {
            'id': str(item.pk),
            'title': item.title,
            'due_on': item.due_on.isoformat(),
            'status': item.status,
            'is_overdue': item.due_on < today,
        }
        for item in actions
    ]
    attention = [
        {
            'kind': 'overdue_action',
            'id': str(item.pk),
            'label': item.title,
            'destination': 'execution',
        }
        for item in overdue_actions
    ]
    attention.extend(
        {
            'kind': 'decision_review',
            'id': str(item.pk),
            'label': item.title,
            'destination': 'execution',
        }
        for item in proposed_decisions
    )
    attention.extend(
        {
            'kind': 'document_incomplete',
            'id': str(item.pk),
            'label': item.template_id,
            'destination': 'documents',
        }
        for item in document_records
    )
    attention = attention[:3]

    if overdue_actions:
        next_action = {
            'kind': 'overdue_action',
            'id': str(overdue_actions[0].pk),
            'label': overdue_actions[0].title,
            'destination': 'execution',
        }
    elif proposed_decisions:
        next_action = {
            'kind': 'decision_review',
            'id': str(proposed_decisions[0].pk),
            'label': proposed_decisions[0].title,
            'destination': 'execution',
        }
    elif profile['state'] == 'empty':
        next_action = {'kind': 'complete_profile', 'destination': 'company'}
    elif document_records:
        next_action = {
            'kind': 'document_incomplete',
            'id': str(document_records[0].pk),
            'label': document_records[0].template_id,
            'destination': 'documents',
        }
    elif actions:
        next_action = {
            'kind': 'open_action',
            'id': str(actions[0].pk),
            'label': actions[0].title,
            'destination': 'execution',
        }
    else:
        next_action = None

    return {
        'workspace_id': str(workspace.pk),
        'role': role,
        'objective': objective,
        'profile': profile,
        'analyses': {
            'draft_count': Analysis.objects.filter(workspace=workspace, state=Analysis.State.DRAFT).count(),
            'finalized_count': Analysis.objects.filter(workspace=workspace, state=Analysis.State.FINALIZED).count(),
        },
        'next_action': next_action,
        'shortcuts': list(shortcuts[:3]),
        'open_actions': open_actions,
        'attention_items': attention,
        'unknowns': ['objective'] if objective is None else [],
        'as_of': today.isoformat(),
    }
