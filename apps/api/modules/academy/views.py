from django.db import transaction
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from .content import grade, units
from .models import LearningProgress

def serialize(row):
    return {key: getattr(row, key) for key in ['unit_id', 'content_revision', 'note', 'position', 'viewed_cards', 'responses', 'activity_response', 'bookmarked', 'completed', 'revision']}

def error(message, status=400):
    return Response({'message': message, 'code': 'academy_request_error'}, status=status)

def update_completion(row, unit):
    cards = {card['id'] for card in unit.get('learning_cards', [])}
    answered = all(row.responses.get(q['id'], {}).get('result', {}).get('correct') is True for q in unit.get('questions', []))
    activity = unit.get('practice_activity')
    practiced = not activity or (row.activity_response.get('result', {}).get('correct') is True if activity['type'] == 'numeric' else bool(row.activity_response))
    # Practice completion never certifies independent mastery.
    row.completed = row.completed or (cards.issubset(set(row.viewed_cards)) and answered and practiced)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def state(request):
    available = units()
    rows = LearningProgress.objects.filter(user=request.user).order_by('updated_at')
    return Response({'user_id': str(request.user.pk), 'units': {r.unit_id: serialize(r) for r in rows if r.unit_id in available and r.content_revision == available[r.unit_id]['revision']}})

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def progress(request, unit_id):
    unit = units().get(unit_id)
    if not unit:
        return error('این بخش پیدا نشد.', 404)
    data = request.data
    if not isinstance(data, dict) or type(data.get('revision')) is not int or data['revision'] < 0:
        return error('اطلاعات ذخیره معتبر نیست.')
    if data.get('expected_user_id') != str(request.user.pk):
        return error('حساب فعال عوض شده؛ صفحه رو تازه کن تا اطلاعات حساب درست باز بشه.', 409)
    if set(data) - {'revision', 'note', 'position', 'card_id', 'bookmarked', 'content_revision', 'expected_user_id'}:
        return error('اطلاعات ذخیره معتبر نیست.')
    if data.get('content_revision') != unit['revision']:
        return error('نسخهٔ این درس تغییر کرده؛ صفحه رو تازه کن.', 409)
    with transaction.atomic():
        row, _ = LearningProgress.objects.select_for_update().get_or_create(user=request.user, unit_id=unit_id, content_revision=unit['revision'])
        if data.get('revision') != row.revision:
            return error('یادداشت در صفحهٔ دیگه تغییر کرده؛ قبل از ذخیره، نسخهٔ تازه رو ببین.', 409)
        if 'note' in data:
            if not isinstance(data['note'], str) or len(data['note']) > 30000:
                return error('یادداشت باید متن باشه و کمتر از ۳۰ هزار نویسه داشته باشه.')
            row.note = data['note']
        if 'position' in data:
            if type(data['position']) is not int or not 0 <= data['position'] <= len(unit.get('learning_cards', [])) + len(unit.get('questions', [])) + 3:
                return error('مرحلهٔ ذخیره معتبر نیست.')
            row.position = data['position']
        if 'bookmarked' in data:
            if type(data['bookmarked']) is not bool:
                return error('نشانک معتبر نیست.')
            row.bookmarked = data['bookmarked']
        if 'card_id' in data:
            if data['card_id'] not in [c['id'] for c in unit.get('learning_cards', [])]:
                return error('کارت پیدا نشد.')
            row.viewed_cards = list(dict.fromkeys([*row.viewed_cards, data['card_id']]))
        update_completion(row, unit)
        row.revision += 1
        row.save()
    return Response(serialize(row))

@api_view(['POST'])
@permission_classes([AllowAny])
def answer(request, unit_id):
    if not isinstance(request.data, dict):
        return error('اطلاعات پاسخ معتبر نیست.')
    if request.user.is_authenticated and request.data.get('expected_user_id') != str(request.user.pk):
        return error('حساب فعال عوض شده؛ صفحه رو تازه کن تا اطلاعات حساب درست باز بشه.', 409)
    if not request.user.is_authenticated and request.data.get('expected_user_id'):
        return error('نشست حسابت تموم شده؛ دوباره وارد شو.', 401)
    unit = units().get(unit_id)
    if not unit:
        return error('این بخش پیدا نشد.', 404)
    if request.data.get('content_revision') != unit['revision']:
        return error('نسخهٔ درس تغییر کرده؛ صفحه رو تازه کن.', 409)
    qid, value = request.data.get('question_id'), request.data.get('answer')
    if not isinstance(qid, str):
        return error('پرسش معتبر نیست.')
    try:
        result = grade(unit, qid, value)
    except (ValueError, TypeError):
        return error('جوابت رو بررسی کن؛ عدد رو با واحد خواسته‌شده وارد کن. جداکنندهٔ مبهم پذیرفته نمی‌شه.')
    if not request.user.is_authenticated:
        return Response({'result': result, 'saved': False})
    with transaction.atomic():
        row, _ = LearningProgress.objects.select_for_update().get_or_create(user=request.user, unit_id=unit_id, content_revision=unit['revision'])
        previous = row.activity_response if qid == 'activity' else row.responses.get(qid, {})
        response = {'answer': value, 'result': result, 'attempts': previous.get('attempts', 0) + 1, 'first_correct': previous.get('first_correct', result['correct'])}
        if qid == 'activity':
            row.activity_response = response
        else:
            row.responses = {**row.responses, qid: response}
        update_completion(row, unit)
        row.revision += 1
        row.save()
    return Response({'result': result, 'saved': True, 'progress': serialize(row)})
