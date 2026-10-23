"""Carry progress across an explicitly verified, assessment-preserving content release."""
import hashlib
import json
import re
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from modules.academy.content import units
from modules.academy.models import LearningProgress


def assessment_digest(unit):
    payload = {'questions': unit.get('questions', []), 'practice_activity': unit.get('practice_activity')}
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


@transaction.atomic
def rebase_progress(mapping, current, dry_run=False):
    # Validate the complete release before writing any user's rows.
    for entry in mapping:
        unit = current.get(entry['unit_id'])
        if not unit or unit['revision'] != entry['new_revision'] or assessment_digest(unit) != entry['assessment_sha256']:
            raise CommandError('Release or assessment mismatch; no progress copied.')
        if not re.fullmatch(r'[0-9a-f]{64}', entry['old_revision']) or entry['old_revision'] == entry['new_revision']:
            raise CommandError('Invalid old revision.')
        cards = [card['id'] for card in unit.get('learning_cards', [])]
        if cards != entry['new_cards'] or [card for card in cards if card in entry['old_cards']] != entry['old_cards']:
            raise CommandError('Existing card order changed; manual migration required.')
    copied = skipped = 0
    for entry in mapping:
        old_cards, new_cards = entry['old_cards'], entry['new_cards']
        for row in LearningProgress.objects.filter(unit_id=entry['unit_id'], content_revision=entry['old_revision']).iterator():
            if LearningProgress.objects.filter(user_id=row.user_id, unit_id=row.unit_id, content_revision=entry['new_revision']).exists():
                skipped += 1
                continue
            position = new_cards.index(old_cards[row.position]) if row.position < len(old_cards) else row.position + len(new_cards) - len(old_cards)
            defaults = {key: getattr(row, key) for key in ['note', 'bookmarked', 'responses', 'activity_response']}
            defaults.update(position=position, viewed_cards=[card for card in row.viewed_cards if card in new_cards], completed=row.completed and old_cards == new_cards, revision=row.revision + 1)
            if not dry_run:
                _, created = LearningProgress.objects.get_or_create(user_id=row.user_id, unit_id=row.unit_id, content_revision=entry['new_revision'], defaults=defaults)
                copied += int(created)
            else:
                copied += 1
    return copied, skipped


class Command(BaseCommand):
    help = 'Copy progress using an audited revision map; never deletes historical rows or grants access.'

    def add_arguments(self, parser):
        parser.add_argument('--map', required=True, dest='map_path')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        try:
            with open(options['map_path'], encoding='utf-8') as stream:
                manifest = json.load(stream)
            if manifest.get('assessment_policy') != 'unchanged_exactly':
                raise CommandError('An assessment-preserving release map is required.')
            copied, skipped = rebase_progress(manifest['units'], units(), options['dry_run'])
        except (OSError, ValueError, KeyError, TypeError) as error:
            raise CommandError(str(error)) from error
        self.stdout.write(f"{'Would copy' if options['dry_run'] else 'Copied'} {copied} progress rows; {skipped} newer rows preserved. Historical rows retained.")
