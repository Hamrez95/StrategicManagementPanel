from datetime import timedelta
from pathlib import Path

from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand
from django.utils import timezone

from modules.documents.models import DocumentAttachment


class Command(BaseCommand):
    help = 'Remove expired attachment reservations and old unreferenced private files.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Delete eligible metadata and files.')
        parser.add_argument('--orphan-age-hours', type=int, default=24)

    def handle(self, *args, **options):
        if options['orphan_age_hours'] < 1:
            self.stderr.write(self.style.ERROR('--orphan-age-hours must be at least 1.'))
            return
        now = timezone.now()
        expired = DocumentAttachment.objects.filter(
            status__in=(DocumentAttachment.Status.RESERVED, DocumentAttachment.Status.UPLOADING, DocumentAttachment.Status.CANCEL_REQUESTED, DocumentAttachment.Status.QUARANTINED),
            expires_at__lte=now,
        )
        expired_items = list(expired.only('pk', 'storage_key'))
        rejected_keys = list(DocumentAttachment.objects.filter(status=DocumentAttachment.Status.REJECTED).values_list('storage_key', flat=True))
        known_keys = set(DocumentAttachment.objects.values_list('storage_key', flat=True))
        root = Path(default_storage.location)
        cutoff = now.timestamp() - timedelta(hours=options['orphan_age_hours']).total_seconds()
        orphan_paths = []
        for directory in ('quarantine', 'attachments'):
            candidate_root = root / directory
            if not candidate_root.exists():
                continue
            for candidate in candidate_root.rglob('*'):
                if candidate.is_file() and not candidate.is_symlink():
                    storage_key = candidate.relative_to(root).as_posix()
                    if storage_key not in known_keys and candidate.stat().st_mtime <= cutoff:
                        orphan_paths.append((storage_key, candidate))

        self.stdout.write(f'Expired reservations: {len(expired_items)}; rejected remnants: {len(rejected_keys)}; old orphan files: {len(orphan_paths)}.')
        if not options['apply']:
            self.stdout.write('Dry run only. Use --apply to remove these items.')
            return

        for item in expired_items:
            default_storage.delete(item.storage_key)
            item.delete()
        for storage_key in rejected_keys:
            default_storage.delete(storage_key)
        for storage_key, _path in orphan_paths:
            default_storage.delete(storage_key)
        self.stdout.write(self.style.SUCCESS('Attachment cleanup completed.'))
