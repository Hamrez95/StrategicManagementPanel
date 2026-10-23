from copy import deepcopy
from django.db.models import Q
from django.utils import timezone
from .models import AcademySubscription, FreeSample, AcademyArea
from .projection import curriculum


class AcademyAccess:
    def __init__(self, user):
        now = timezone.now()
        self.full = False
        self.general = False
        self.areas = set()
        self.active_areas = set(AcademyArea.objects.filter(is_active=True).values_list('id', flat=True))
        self.free_cards = set(FreeSample.objects.filter(is_active=True, card__unit__course__area__is_active=True).values_list('card_id', flat=True))
        if user.is_authenticated:
            subscriptions = AcademySubscription.objects.filter(user=user, status='active', starts_at__lte=now).filter(Q(ends_at=None) | Q(ends_at__gt=now)).select_related('order_item__order').prefetch_related('area_grants__area')
            for sub in subscriptions:
                if sub.order_item_id and (sub.order_item.order.user_id != user.pk or sub.order_item.order.status != 'paid' or sub.order_item.plan_kind != sub.coverage):
                    continue
                self.full |= sub.coverage == 'full'
                self.general |= sub.coverage == 'general'
                if sub.coverage == 'specialty':
                    selected = {grant.area_id for grant in sub.area_grants.all() if grant.area.kind == 'specialty'}
                    if sub.order_item_id:
                        selected &= set(sub.order_item.areas.values_list('id', flat=True))
                    self.areas.update(selected)
        catalog, _ = curriculum()
        self.course_areas = {c['id']: c['path_id'] for c in catalog['courses']}

    def has_full_course(self, course_id):
        area = self.course_areas.get(course_id)
        return area in self.active_areas and (self.full or (self.general and area == 'GENERAL') or area in self.areas)

    def unit_access(self, unit):
        full = self.has_full_course(unit['course_id'])
        cards = [c['id'] for c in unit['learning_cards'] if full or c['id'] in self.free_cards]
        return {'hasAccess': full or bool(cards), 'hasFullAccess': full, 'accessLevel': 'full' if full else 'sample' if cards else 'locked', 'allowed_card_ids': cards, 'total_cards': len(unit['learning_cards'])}

    def project_unit(self, unit):
        access = self.unit_access(unit)
        if access['hasFullAccess']:
            return {**deepcopy(unit), 'access': access}
        # Construct a small allowlisted projection; no paid scenario, activity,
        # assessment, rubric or side-channel metadata enters a sample response.
        safe = {k: unit.get(k) for k in ['id', 'title', 'kind', 'course_id', 'course_title', 'stage_id', 'revision', 'content_notice']}
        safe.update(access=access, learning_cards=[deepcopy(c) for c in unit['learning_cards'] if c['id'] in access['allowed_card_ids']], questions=[])
        safe['reference_visuals'] = [deepcopy(v) for v in unit.get('reference_visuals', []) if v['card_id'] in access['allowed_card_ids']]
        media = unit.get('media_plan')
        if media and media.get('display_on_card_id') in access['allowed_card_ids']:
            safe['media_plan'] = deepcopy(media)
        return safe

    def catalog(self):
        source, units = curriculum()
        result = deepcopy(source)
        by_course = {}
        for unit in units.values():
            by_course.setdefault(unit['course_id'], []).append(unit)
        for course in result['courses']:
            full = self.has_full_course(course['id'])
            sample = any(self.unit_access(unit)['hasAccess'] for unit in by_course[course['id']])
            course['access'] = {'hasAccess': full or sample, 'hasFullAccess': full, 'accessLevel': 'full' if full else 'sample' if sample else 'locked'}
            for stage in course['stages']:
                for lesson in stage['lessons']:
                    lesson['access'] = self.unit_access(units[lesson['id']])
                    lesson['free_sample'] = lesson['access']['accessLevel'] == 'sample'
                stage['review_access'] = self.unit_access(units[stage['review_id']]) if stage.get('review_id') in units else None
            course['final_review_access'] = self.unit_access(units[course['final_review_id']]) if course.get('final_review_id') in units else None
        for area in result['paths']:
            courses = [c for c in result['courses'] if c['path_id'] == area['id']]
            area['access'] = {'hasAccess': any(c['access']['hasAccess'] for c in courses), 'hasFullAccess': bool(courses) and all(c['access']['hasFullAccess'] for c in courses)}
        return result
