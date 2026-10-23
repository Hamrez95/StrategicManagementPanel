"""Explicit synthetic grants for tests whose subject is not the free-plan boundary."""
from uuid import uuid4
from django.utils import timezone
from .models import BillingAccount, ManagementPlan, ManagementSubscription


def grant_test_management_access(user):
    plan, _ = ManagementPlan.objects.get_or_create(code='synthetic-management-special', defaults={'title': 'Synthetic special plan', 'is_active': True, 'can_finalize_analysis': True, 'can_calculate_metrics': True, 'can_generate_reports': True})
    billing, _ = BillingAccount.objects.get_or_create(owner=user)
    return ManagementSubscription.objects.create(billing_account=billing, plan=plan, request_id=uuid4(), starts_at=timezone.now(), plan_title=plan.title, plan_revision=1, granted_by=user, reason='Synthetic non-billing acceptance fixture', can_finalize_analysis=True, can_calculate_metrics=True, can_generate_reports=True)
