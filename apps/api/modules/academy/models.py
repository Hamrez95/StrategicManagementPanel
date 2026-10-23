from django.conf import settings
from django.db import models
from django.core.exceptions import ValidationError
from django.db.models import Q, F
import uuid


class AcademyArea(models.Model):
    id = models.CharField(primary_key=True, max_length=40)
    title = models.CharField(max_length=300)
    kind = models.CharField(max_length=16, choices=[('general', 'عمومی'), ('specialty', 'گرایش'), ('supplement', 'تکمیلی')])
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.title


class AcademyCourse(models.Model):
    id = models.CharField(primary_key=True, max_length=80)
    area = models.ForeignKey(AcademyArea, on_delete=models.PROTECT, related_name='courses')
    title = models.CharField(max_length=300)
    order = models.PositiveIntegerField(default=0)

    def __str__(self):
        return self.title


class AcademyUnit(models.Model):
    id = models.CharField(primary_key=True, max_length=80)
    course = models.ForeignKey(AcademyCourse, on_delete=models.PROTECT, related_name='units')
    title = models.CharField(max_length=400)
    kind = models.CharField(max_length=20, choices=[('lesson', 'درس‌نامه'), ('stage_review', 'مرور مرحله'), ('final_review', 'مرور پایانی')])
    order = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f'{self.id} — {self.title}'


class AcademyCard(models.Model):
    id = models.CharField(primary_key=True, max_length=160)
    unit = models.ForeignKey(AcademyUnit, on_delete=models.PROTECT, related_name='cards')
    title = models.CharField(max_length=500)
    order = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f'{self.id} — {self.title}'


class AcademyPlan(models.Model):
    code = models.SlugField(unique=True)
    title = models.CharField(max_length=160)
    kind = models.CharField(max_length=16, choices=[('free', 'رایگان'), ('full', 'کامل'), ('general', 'عمومی'), ('specialty', 'گرایش‌های انتخابی')])
    is_active = models.BooleanField(default=True)
    price = models.PositiveBigIntegerField(null=True, blank=True, help_text='خالی یعنی قیمت هنوز تعیین نشده. قیمت گرایش برای هر گرایش است.')
    sale_price = models.PositiveBigIntegerField(null=True, blank=True, help_text='قیمت پس از تخفیف عمومی؛ خالی یعنی بدون تخفیف.')
    currency = models.CharField(max_length=3, default='IRR')
    duration_days = models.PositiveIntegerField(null=True, blank=True, help_text='تا تعیین سیاست مدت، خالی بماند.')
    order = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(duration_days__isnull=True) | Q(duration_days__gt=0), name='academy_plan_duration_positive'), models.CheckConstraint(condition=Q(sale_price__isnull=True) | (Q(price__isnull=False) & Q(sale_price__lte=F('price'))), name='academy_sale_price_valid')]
        ordering = ['order', 'id']

    def __str__(self):
        return self.title


class FreeSample(models.Model):
    card = models.OneToOneField(AcademyCard, primary_key=True, on_delete=models.CASCADE, related_name='free_sample')
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)


class AcademyCoupon(models.Model):
    code = models.CharField(max_length=48, unique=True)
    percent = models.PositiveSmallIntegerField(help_text='درصد تخفیف روی مبلغ پس از تخفیف عمومی پلن.')
    is_active = models.BooleanField(default=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    plans = models.ManyToManyField(AcademyPlan, blank=True, help_text='خالی یعنی تمام پلن‌های پولی.')

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(percent__gte=1) & Q(percent__lte=100), name='academy_coupon_percent_valid'), models.CheckConstraint(condition=Q(starts_at__isnull=True) | Q(ends_at__isnull=True) | Q(ends_at__gt=F('starts_at')), name='academy_coupon_window_valid')]

    def clean(self):
        self.code = self.code.strip().upper()
        if not self.code or any(char.isspace() for char in self.code):
            raise ValidationError('کد تخفیف نباید خالی یا دارای فاصله باشد.')

    def save(self, *args, **kwargs):
        self.code = self.code.strip().upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.code


class AcademyOrder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='academy_orders')
    request_id = models.UUIDField(unique=True)
    status = models.CharField(max_length=16, default='requested', choices=[('requested', 'درخواست قیمت'), ('pending', 'در انتظار پرداخت'), ('paid', 'پرداخت‌شده'), ('cancelled', 'لغوشده'), ('refunded', 'بازپرداخت‌شده')])
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)


class AcademyOrderItem(models.Model):
    order = models.ForeignKey(AcademyOrder, on_delete=models.PROTECT, related_name='items')
    plan = models.ForeignKey(AcademyPlan, on_delete=models.PROTECT)
    plan_title = models.CharField(max_length=160)
    plan_kind = models.CharField(max_length=16)
    unit_price = models.PositiveBigIntegerField(null=True, blank=True)
    original_unit_price = models.PositiveBigIntegerField(null=True, blank=True)
    subtotal = models.PositiveBigIntegerField(null=True, blank=True)
    discount_amount = models.PositiveBigIntegerField(null=True, blank=True)
    total = models.PositiveBigIntegerField(null=True, blank=True)
    coupon = models.ForeignKey(AcademyCoupon, null=True, blank=True, on_delete=models.PROTECT)
    coupon_code = models.CharField(max_length=48, blank=True)
    currency = models.CharField(max_length=3)
    duration_days = models.PositiveIntegerField(null=True, blank=True)
    areas = models.ManyToManyField(AcademyArea, through='AcademyOrderArea')


class AcademyOrderArea(models.Model):
    item = models.ForeignKey(AcademyOrderItem, on_delete=models.CASCADE)
    area = models.ForeignKey(AcademyArea, on_delete=models.PROTECT)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['item', 'area'], name='academy_order_area_unique')]


class AcademySubscription(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='academy_subscriptions')
    plan = models.ForeignKey(AcademyPlan, on_delete=models.PROTECT)
    coverage = models.CharField(max_length=16, choices=[('full', 'کامل'), ('general', 'عمومی'), ('specialty', 'گرایش‌های انتخابی')], help_text='پوشش ثبت‌شده هنگام فعال‌سازی؛ تغییر پلن خریدهای قبلی را تغییر نمی‌دهد.')
    order_item = models.OneToOneField(AcademyOrderItem, on_delete=models.PROTECT, null=True, blank=True, related_name='subscription')
    status = models.CharField(max_length=16, default='active', choices=[('active', 'فعال'), ('revoked', 'لغوشده')])
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)
    granted_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name='academy_grants')
    reason = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    areas = models.ManyToManyField(AcademyArea, through='SubscriptionArea')

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(ends_at__isnull=True) | Q(ends_at__gt=F('starts_at')), name='academy_subscription_valid_window')]
        indexes = [models.Index(fields=['user', 'status', 'starts_at'], name='academy_active_access')]

    def clean(self):
        if self.order_item_id and (self.order_item.order.user_id != self.user_id or self.order_item.order.status != 'paid' or self.order_item.plan_kind != self.coverage):
            raise ValidationError('خرید پرداخت‌شده، مالک خرید و نوع پوشش باید با اشتراک مطابقت داشته باشند.')
        if not self.order_item_id and not self.reason.strip():
            raise ValidationError('برای فعال‌سازی دستی، دلیل را ثبت کن.')
        if self._state.adding and not self.order_item_id and self.plan.kind != self.coverage:
            raise ValidationError('نوع پلن و پوشش فعال‌سازی دستی باید یکی باشند.')


class SubscriptionArea(models.Model):
    subscription = models.ForeignKey(AcademySubscription, on_delete=models.CASCADE, related_name='area_grants')
    area = models.ForeignKey(AcademyArea, on_delete=models.PROTECT)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['subscription', 'area'], name='academy_subscription_area_unique')]

    def clean(self):
        if self.subscription.coverage != 'specialty' or self.area.kind != 'specialty':
            raise ValidationError('فقط گرایش را به اشتراک گرایش اضافه کن.')
        if self.subscription.order_item_id and not self.subscription.order_item.areas.filter(pk=self.area_id).exists():
            raise ValidationError('این گرایش در خرید ثبت‌شده وجود ندارد.')

class LearningProgress(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    unit_id = models.CharField(max_length=80)
    content_revision = models.CharField(max_length=64)
    note = models.TextField(blank=True, default='')
    position = models.PositiveIntegerField(default=0)
    viewed_cards = models.JSONField(default=list)
    responses = models.JSONField(default=dict)
    activity_response = models.JSONField(default=dict)
    bookmarked = models.BooleanField(default=False)
    completed = models.BooleanField(default=False)
    revision = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'unit_id', 'content_revision'], name='academy_user_unit_revision')]


class LearningFeedback(models.Model):
    submission_id = models.UUIDField(unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    unit_id = models.CharField(max_length=80)
    unit_title = models.CharField(max_length=300)
    content_revision = models.CharField(max_length=64)
    target_kind = models.CharField(max_length=16)
    target_id = models.CharField(max_length=160)
    target_title = models.CharField(max_length=300)
    target_text = models.TextField(blank=True)
    content_path = models.CharField(max_length=512)
    category = models.CharField(max_length=16, choices=[('correction', 'اصلاح محتوا'), ('question', 'ابهام'), ('suggestion', 'پیشنهاد')])
    message = models.TextField()
    status = models.CharField(max_length=16, default='new', choices=[('new', 'تازه'), ('reviewed', 'بررسی‌شده'), ('resolved', 'رسیدگی‌شده')])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [models.Index(fields=['status', '-created_at'], name='academy_feedback_inbox')]
