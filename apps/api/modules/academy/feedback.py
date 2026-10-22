"""Context-bound learner reports; only service staff can read or triage the inbox."""
from hashlib import sha256
from urllib.parse import urlencode
from uuid import UUID
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from .content import units
from .models import LearningFeedback
from .views import error


class FeedbackThrottle(SimpleRateThrottle):
    scope = 'academy_feedback'
    rate = '10/hour'

    def get_cache_key(self, request, view):
        identity = f'user:{request.user.pk}' if request.user.is_authenticated else self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': sha256(identity.encode()).hexdigest()}


@api_view(['POST'])
@permission_classes([AllowAny])
def feedback_submit(request, unit_id):
    data = request.data
    if not isinstance(data, dict) or set(data) - {'submission_id', 'expected_user_id', 'content_revision', 'target_kind', 'target_id', 'category', 'message'}:
        return error('اطلاعات نظرت معتبر نیست.')
    expected_user = str(request.user.pk) if request.user.is_authenticated else ''
    if data.get('expected_user_id', '') != expected_user:
        return error('حساب فعال عوض شده؛ صفحه رو تازه کن و دوباره بفرست.', 409)
    unit = units().get(unit_id)
    if not unit:
        return error('این درس پیدا نشد.', 404)
    if data.get('content_revision') != unit['revision']:
        return error('نسخهٔ درس تغییر کرده؛ صفحه رو تازه کن. متن نظرت رو نگه دار.', 409)
    try:
        submission_id = UUID(str(data.get('submission_id')))
    except ValueError:
        return error('شناسهٔ ارسال معتبر نیست؛ دوباره تلاش کن.')
    message = data.get('message')
    category = data.get('category')
    if not isinstance(message, str) or not 5 <= len(message.strip()) <= 3000 or not isinstance(category, str) or category not in {'correction', 'question', 'suggestion'}:
        return error('نظرت رو بین ۵ تا ۳۰۰۰ نویسه بنویس و نوعش رو انتخاب کن.')
    kind, target_id = data.get('target_kind'), data.get('target_id')
    target, query = None, None
    if kind == 'card':
        target = next((c for c in unit.get('learning_cards', []) if c['id'] == target_id), None)
        query = {'card': target_id}
    elif kind == 'question':
        target = next((q for q in unit.get('questions', []) if q['id'] == target_id), None)
        query = {'question': target_id}
    elif kind == 'activity' and target_id == 'activity':
        target = unit.get('practice_activity')
        query = {'step': 'activity'}
    elif kind == 'summary' and target_id == unit_id:
        target = {'title': 'جمع‌بندی درس'}
        query = {'step': 'summary'}
    if not target:
        return error('بخش مربوط به نظرت پیدا نشد؛ صفحه رو تازه کن.')
    values = dict(user=request.user if request.user.is_authenticated else None,
        unit_id=unit_id, unit_title=unit.get('title', unit_id), content_revision=unit['revision'],
        target_kind=kind, target_id=target_id, target_title=target.get('title', 'پرسش' if kind == 'question' else 'فعالیت درس'),
        target_text=target.get('text', target.get('prompt', '')),
        content_path=f'/academy/lesson/{unit_id}?{urlencode(query)}', category=category, message=message.strip())
    previous = LearningFeedback.objects.filter(submission_id=submission_id).first()
    if previous:
        if any(getattr(previous, key) != value for key, value in values.items()):
            return error('این شناسه برای نظر دیگه‌ای ثبت شده؛ دوباره تلاش کن.', 409)
        return Response({'id': previous.pk, 'saved': True}, status=200)
    if not FeedbackThrottle().allow_request(request, None):
        return error('چند نظر پشت‌سرهم فرستادی؛ کمی بعد دوباره تلاش کن. متنت همین‌جا می‌مونه.', 429)
    row, _ = LearningFeedback.objects.get_or_create(submission_id=submission_id, defaults=values)
    if any(getattr(row, key) != value for key, value in values.items()):
        return error('این شناسه برای نظر دیگه‌ای ثبت شده؛ دوباره تلاش کن.', 409)
    return Response({'id': row.pk, 'saved': True}, status=201)


def serialize_feedback(row):
    return {key: getattr(row, key) for key in ['id', 'unit_id', 'unit_title', 'content_revision', 'target_kind', 'target_id', 'target_title', 'target_text', 'content_path', 'category', 'message', 'status', 'created_at']}


@api_view(['GET'])
@permission_classes([IsAdminUser])
def feedback_inbox(request):
    status = request.query_params.get('status', 'new')
    if status not in {'new', 'reviewed', 'resolved', 'all'}:
        return error('وضعیت انتخاب‌شده معتبر نیست.')
    try:
        page = max(1, int(request.query_params.get('page', '1')))
    except ValueError:
        return error('شمارهٔ صفحه معتبر نیست.')
    rows = LearningFeedback.objects.all()
    if status != 'all':
        rows = rows.filter(status=status)
    return Response({'count': rows.count(), 'page': page, 'results': [serialize_feedback(row) for row in rows[(page-1)*25:page*25]]})


@api_view(['PATCH'])
@permission_classes([IsAdminUser])
def feedback_update(request, feedback_id):
    data = request.data
    if not isinstance(data, dict) or set(data) != {'status'} or not isinstance(data.get('status'), str) or data['status'] not in {'new', 'reviewed', 'resolved'}:
        return error('وضعیت بررسی معتبر نیست.')
    row = LearningFeedback.objects.filter(pk=feedback_id).first()
    if not row:
        return error('این نظر پیدا نشد.', 404)
    row.status = data['status']
    row.save(update_fields=['status', 'updated_at'])
    return Response(serialize_feedback(row))
