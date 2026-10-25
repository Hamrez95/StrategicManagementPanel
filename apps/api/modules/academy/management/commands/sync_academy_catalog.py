from django.core.management.base import BaseCommand
from django.db import transaction
from modules.academy.models import AcademyArea, AcademyCourse, AcademyUnit, AcademyCard, AcademyPlan, FreeSample
from modules.academy.projection import curriculum


class Command(BaseCommand):
    help = 'Synchronize stable curriculum IDs; preserve commercial configuration and existing free sample choices.'

    def add_arguments(self, parser):
        parser.add_argument('--seed-free-samples', action='store_true')
        parser.add_argument('--sample-cards', type=int, default=2)

    @transaction.atomic
    def handle(self, *args, **options):
        catalog, units = curriculum()
        for index, area in enumerate(catalog['paths']):
            AcademyArea.objects.update_or_create(id=area['id'], defaults={'title': area['title'], 'order': index, 'kind': 'general' if area['id'] == 'GENERAL' else 'specialty' if area['id'].startswith('S') else 'supplement'})
        for index, course in enumerate(catalog['courses']):
            AcademyCourse.objects.update_or_create(id=course['id'], defaults={'title': course['title'], 'area_id': course['path_id'], 'order': index})
        for index, unit in enumerate(units.values()):
            AcademyUnit.objects.update_or_create(id=unit['id'], defaults={'course_id': unit['course_id'], 'title': unit['title'], 'kind': unit['kind'], 'order': index})
            for position, card in enumerate(unit['learning_cards']):
                AcademyCard.objects.update_or_create(id=card['id'], defaults={'unit_id': unit['id'], 'title': card.get('title', ''), 'order': position})
        for index, (code, title) in enumerate([('free', 'نمونه‌های رایگان'), ('general', 'آموزش عمومی'), ('specialty', 'گرایش‌های انتخابی'), ('full', 'آکادمی کامل')]):
            AcademyPlan.objects.get_or_create(code=code, defaults={'kind': code, 'title': title, 'order': index})
        if options['seed_free_samples'] and not FreeSample.objects.exists():
            if not 1 <= options['sample_cards'] <= 10:
                raise ValueError('sample-cards must be between 1 and 10')
            course_areas = {c['id']: c['path_id'] for c in catalog['courses']}
            specialty_seeded = False
            for unit in units.values():
                if unit['kind'] != 'lesson':
                    continue
                area = course_areas[unit['course_id']]
                seed = area == 'GENERAL' or (area.startswith('S') and not specialty_seeded)
                if seed:
                    for card in unit['learning_cards'][:options['sample_cards']]:
                        FreeSample.objects.get_or_create(card_id=card['id'])
                    specialty_seeded |= area.startswith('S')
        self.stdout.write(f"Synced {len(catalog['paths'])} areas, {len(catalog['courses'])} courses, {len(units)} units; prices unchanged.")
