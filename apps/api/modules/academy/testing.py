"""Small fixtures for pre-existing progress/feedback behavior tests."""
from django.utils import timezone
from .models import AcademyArea, AcademyCourse, AcademyUnit, AcademyCard, FreeSample, AcademyPlan, AcademySubscription
from .content import units


def general_fixture():
    area, _ = AcademyArea.objects.get_or_create(id='GENERAL', defaults={'title': 'General', 'kind': 'general'})
    course, _ = AcademyCourse.objects.get_or_create(id='C01', defaults={'title': 'Accounting', 'area': area})
    source = units()['C01-ST01-L01']
    unit, _ = AcademyUnit.objects.get_or_create(id=source['id'], defaults={'title': source['title'], 'kind': 'lesson', 'course': course})
    for index, card in enumerate(source['learning_cards']):
        item, _ = AcademyCard.objects.get_or_create(id=card['id'], defaults={'unit': unit, 'title': card['title'], 'order': index})
        if index < 2:
            FreeSample.objects.get_or_create(card=item)


def full_grant(user):
    plan, _ = AcademyPlan.objects.get_or_create(code='full', defaults={'title': 'Full', 'kind': 'full'})
    return AcademySubscription.objects.create(user=user, plan=plan, coverage='full', starts_at=timezone.now(), reason='Test fixture')
