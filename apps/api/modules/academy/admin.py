from django.contrib import admin
from .models import (AcademyArea, AcademyCourse, AcademyUnit, AcademyCard, AcademyPlan, AcademyCoupon, FreeSample, AcademyOrder, AcademyOrderItem, AcademyOrderArea, AcademySubscription, SubscriptionArea)

admin.site.site_header = 'مدیریت آکادمی استراتینو'
admin.site.site_title = 'مدیریت آکادمی'


@admin.register(AcademyArea)
class AreaAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'kind', 'is_active', 'order']
    list_filter = ['kind', 'is_active']
    search_fields = ['id', 'title']
    readonly_fields = ['id', 'kind']


@admin.register(AcademyCourse)
class CourseAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'area']
    search_fields = ['id', 'title']
    list_filter = ['area']
    readonly_fields = ['id', 'area', 'title']


@admin.register(AcademyUnit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'course', 'kind']
    search_fields = ['id', 'title', 'course__title']
    list_filter = ['kind', 'course__area']
    readonly_fields = ['id', 'course', 'title', 'kind', 'order']


@admin.register(AcademyCard)
class CardAdmin(admin.ModelAdmin):
    search_fields = ['id', 'title', 'unit__title']
    list_display = ['id', 'title', 'unit', 'order']
    list_filter = ['unit__course__area']
    readonly_fields = ['id', 'unit', 'title', 'order']


@admin.register(FreeSample)
class FreeSampleAdmin(admin.ModelAdmin):
    list_display = ['card', 'is_active', 'updated_at']
    list_filter = ['is_active', 'card__unit__course__area']
    search_fields = ['card__id', 'card__title']
    autocomplete_fields = ['card']


@admin.register(AcademyPlan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ['code', 'title', 'kind', 'price', 'sale_price', 'currency', 'duration_days', 'is_active']
    list_filter = ['kind', 'is_active']


@admin.register(AcademyCoupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = ['code', 'percent', 'is_active', 'starts_at', 'ends_at']
    list_filter = ['is_active']
    search_fields = ['code']
    filter_horizontal = ['plans']


class SubscriptionAreaInline(admin.TabularInline):
    model = SubscriptionArea
    extra = 0


@admin.register(AcademySubscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'plan', 'coverage', 'status', 'starts_at', 'ends_at']
    list_filter = ['coverage', 'status', 'plan']
    search_fields = ['user__email', 'reason']
    raw_id_fields = ['user', 'order_item']
    readonly_fields = ['created_at', 'granted_by']
    inlines = [SubscriptionAreaInline]

    def get_readonly_fields(self, request, obj=None):
        return self.readonly_fields + (['user', 'plan', 'coverage', 'order_item'] if obj else [])

    def save_model(self, request, obj, form, change):
        if not change:
            obj.granted_by = request.user
        super().save_model(request, obj, form, change)


class OrderItemInline(admin.TabularInline):
    model = AcademyOrderItem
    extra = 0
    can_delete = False
    readonly_fields = ['plan', 'plan_title', 'plan_kind', 'unit_price', 'original_unit_price', 'subtotal', 'discount_amount', 'total', 'coupon_code', 'coupon', 'currency', 'duration_days', 'selected_areas']

    @admin.display(description='گرایش‌های خرید')
    def selected_areas(self, obj):
        return '، '.join(area.title for area in obj.areas.all()) or '—'

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(AcademyOrder)
class OrderAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'status', 'created_at', 'paid_at']
    list_filter = ['status']
    search_fields = ['user__email', 'id']
    readonly_fields = ['id', 'user', 'request_id', 'status', 'created_at', 'paid_at']
    inlines = [OrderItemInline]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(AcademyOrderArea)
class OrderAreaAdmin(admin.ModelAdmin):
    list_display = ['item', 'area']
    readonly_fields = ['item', 'area']

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
