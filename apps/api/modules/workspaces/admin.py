"""Restricted management access console; never registers raw subscription writers."""
from uuid import uuid4

from django import forms
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction
from django.http import Http404, HttpResponseRedirect
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils.decorators import method_decorator
from django.views.decorators.http import require_http_methods

from .entitlements import (
    _operator,
    grant_management_subscription,
    revoke_management_subscription,
)
from .models import (
    BillingAccount,
    ManagementPlan,
    ManagementSubscription,
    ManagementSubscriptionEvent,
)


def operator_mfa_verified(request, actor):
    """Closed until #30 supplies a reviewed, session-bound operator MFA verifier.

    Never accept browser headers, session booleans or environment bypasses as proof.
    Tests replace this function only against disposable synthetic databases.
    """
    return False


class ManagementAdminSite(admin.AdminSite):
    site_header = 'مدیریت دسترسی Management OS'
    site_title = 'مدیریت دسترسی'
    index_title = 'پلن‌ها و اشتراک‌ها'
    site_url = None

    def has_permission(self, request):
        # No development or superuser bypass while operator MFA is unresolved.
        return (super().has_permission(request) and bool(request.user.email_verified_at)
                and operator_mfa_verified(request, request.user))


management_admin_site = ManagementAdminSite(name='management_admin')


class ReadOnlyAdmin(admin.ModelAdmin):
    actions = None
    list_per_page = 50

    class Media:
        css = {'all': ('management_admin/access.css',)}

    def get_readonly_fields(self, request, obj=None):
        return tuple(field.name for field in self.model._meta.fields)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ManagementPlan, site=management_admin_site)
class ManagementPlanAdmin(ReadOnlyAdmin):
    list_display = ('code', 'title', 'revision', 'is_default', 'is_active', 'owned_workspace_limit', 'price', 'currency', 'duration_days')
    list_filter = ('is_active', 'is_default')
    search_fields = ('code', 'title')


class GrantForm(forms.Form):
    billing_account = forms.UUIDField(label='شناسهٔ حساب صورتحساب', widget=forms.TextInput(attrs={'dir': 'ltr'}))
    plan = forms.ModelChoiceField(label='پلن', queryset=ManagementPlan.objects.none())
    request_id = forms.UUIDField(label='شناسهٔ درخواست', widget=forms.TextInput(attrs={'dir': 'ltr'}),
                                help_text='برای تکرار همین درخواست، همین شناسه رو نگه دار.')
    reason = forms.CharField(label='دلیل فعال‌سازی', max_length=500, widget=forms.Textarea(attrs={'rows': 3}))
    confirm = forms.BooleanField(label='فعال‌سازی این پلن برای همین حساب رو تأیید می‌کنم')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['plan'].queryset = ManagementPlan.objects.filter(is_active=True, is_default=False).order_by('code')
        self.fields['plan'].label_from_instance = lambda plan: f'{plan.title} ({plan.code}, r{plan.revision})'

    def clean_billing_account(self):
        try:
            return BillingAccount.objects.get(pk=self.cleaned_data['billing_account'])
        except BillingAccount.DoesNotExist:
            raise forms.ValidationError('حساب صورتحساب پیدا نشد.') from None


class RevokeForm(forms.Form):
    reason = forms.CharField(label='دلیل لغو', max_length=500, widget=forms.Textarea(attrs={'rows': 3}))
    confirm = forms.BooleanField(label='لغو دسترسی این اشتراک رو تأیید می‌کنم')


class SubscriptionEventInline(admin.TabularInline):
    model = ManagementSubscriptionEvent
    fields = ('event_type', 'actor_reference', 'reason', 'created_at')
    readonly_fields = fields
    extra = 0
    can_delete = False
    ordering = ('created_at', 'pk')

    @admin.display(description='شناسهٔ اپراتور')
    def actor_reference(self, obj):
        return str(obj.actor_id)

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        return request.user.has_perm('workspaces.view_managementsubscriptionevent')


@admin.register(ManagementSubscription, site=management_admin_site)
class ManagementSubscriptionAdmin(ReadOnlyAdmin):
    list_display = ('id', 'billing_reference', 'plan_title', 'plan_revision', 'status', 'starts_at', 'ends_at')
    list_filter = ('status', 'plan')
    search_fields = ('=id', '=billing_account__id', '=request_id')
    ordering = ('-created_at',)
    inlines = (SubscriptionEventInline,)
    change_list_template = 'management_admin/subscription_list.html'
    change_form_template = 'management_admin/subscription_detail.html'
    # Foreign keys render only identifiers, never account email or customer content.
    fields = ('id', 'billing_reference', 'plan_reference', 'request_id', 'status', 'starts_at', 'ends_at',
              'plan_title', 'plan_revision', 'owned_workspace_limit', 'can_finalize_analysis',
              'can_calculate_metrics', 'can_generate_reports', 'operator_reference', 'reason', 'created_at')

    def get_readonly_fields(self, request, obj=None):
        return self.fields

    @admin.display(description='شناسهٔ حساب صورتحساب')
    def billing_reference(self, obj):
        return str(obj.billing_account_id)

    @admin.display(description='شناسهٔ پلن')
    def plan_reference(self, obj):
        return str(obj.plan_id)

    @admin.display(description='شناسهٔ اپراتور')
    def operator_reference(self, obj):
        return str(obj.granted_by_id)

    def _can_grant(self, request):
        return request.user.has_perms(('workspaces.add_managementsubscription', 'workspaces.view_managementsubscription',
                                      'workspaces.view_managementplan', 'workspaces.view_billingaccount'))

    def _can_revoke(self, request):
        return request.user.has_perms(('workspaces.change_managementsubscription', 'workspaces.view_managementsubscription'))

    def get_urls(self):
        return [path('grant/', self.admin_site.admin_view(self.grant_view), name='workspaces_managementsubscription_grant'),
                path('<uuid:subscription_id>/revoke/', self.admin_site.admin_view(self.revoke_view),
                     name='workspaces_managementsubscription_revoke')] + super().get_urls()

    def changelist_view(self, request, extra_context=None):
        return super().changelist_view(request, {**(extra_context or {}), 'can_grant': self._can_grant(request)})

    def change_view(self, request, object_id, form_url='', extra_context=None):
        obj = self.get_object(request, object_id)
        return super().change_view(request, object_id, form_url, {**(extra_context or {}),
            'can_revoke': bool(obj and obj.status == 'active' and self._can_revoke(request))})

    def _form_response(self, request, form, title, subscription=None):
        return TemplateResponse(request, 'management_admin/operation.html', {
            **self.admin_site.each_context(request), 'opts': self.model._meta, 'title': title,
            'form': form, 'subscription': subscription,
            'list_url': reverse('management_admin:workspaces_managementsubscription_changelist'),
        })

    @method_decorator(require_http_methods(['GET', 'POST']))
    def grant_view(self, request):
        if not self._can_grant(request):
            raise PermissionDenied
        _operator(request.user, 'workspaces.add_managementsubscription')
        form = GrantForm(request.POST if request.method == 'POST' else None, initial={'request_id': uuid4()})
        if request.method == 'POST' and form.is_valid():
            try:
                # Savepoint catches concurrent UUID reuse without breaking the outer admin transaction.
                with transaction.atomic():
                    grant = grant_management_subscription(request.user, form.cleaned_data['billing_account'],
                        form.cleaned_data['plan'], request_id=form.cleaned_data['request_id'], reason=form.cleaned_data['reason'])
            except ValidationError as error:
                form.add_error(None, ' '.join(error.messages))
            except IntegrityError:
                form.add_error(None, 'درخواست هم‌زمان ثبت نشد. همین شناسه رو دوباره بررسی کن؛ برای عملیات تازه شناسهٔ تازه لازم داری.')
            except (ManagementPlan.DoesNotExist, BillingAccount.DoesNotExist):
                form.add_error(None, 'حساب یا پلن دیگه در دسترس نیست. اطلاعات رو دوباره بررسی کن.')
            else:
                self.message_user(request, 'درخواست فعال‌سازی ثبت شده؛ نتیجه و تاریخچه رو ببین.', messages.SUCCESS)
                return HttpResponseRedirect(reverse('management_admin:workspaces_managementsubscription_change', args=[grant.pk]))
        return self._form_response(request, form, 'فعال‌سازی اشتراک')

    @method_decorator(require_http_methods(['GET', 'POST']))
    def revoke_view(self, request, subscription_id):
        if not self._can_revoke(request):
            raise PermissionDenied
        _operator(request.user, 'workspaces.change_managementsubscription')
        try:
            subscription = ManagementSubscription.objects.get(pk=subscription_id)
        except ManagementSubscription.DoesNotExist:
            raise Http404 from None
        form = RevokeForm(request.POST if request.method == 'POST' else None)
        if request.method == 'POST' and form.is_valid():
            try:
                revoke_management_subscription(request.user, subscription, reason=form.cleaned_data['reason'])
            except ValidationError as error:
                form.add_error(None, ' '.join(error.messages))
            else:
                self.message_user(request, 'اشتراک لغو شده؛ سابقهٔ فعال‌سازی و لغو حفظ شده.', messages.SUCCESS)
                return HttpResponseRedirect(reverse('management_admin:workspaces_managementsubscription_change', args=[subscription.pk]))
        return self._form_response(request, form, 'لغو اشتراک', subscription)
