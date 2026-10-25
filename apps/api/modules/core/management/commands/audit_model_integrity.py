import json

from django.core.management.base import BaseCommand, CommandError

from modules.core.integrity import audit_data, schema_inventory


class Command(BaseCommand):
    help = 'Read-only schema inventory or aggregate model-integrity audit; never repairs customer data.'

    def add_arguments(self, parser):
        parser.add_argument('--schema', action='store_true', help='Emit schema metadata without reading customer rows.')
        parser.add_argument('--database', default='default')
        parser.add_argument('--summary', action='store_true', help='Only emit aggregate counts and failing checks.')

    def handle(self, *args, **options):
        result = {'models': schema_inventory()} if options['schema'] else audit_data(options['database'])
        if options['summary'] and 'checks' in result:
            result['checks'] = [check for check in result['checks'] if check['violations']]
        self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
        if result.get('violations'):
            raise CommandError('Model integrity violations found. Review the affected rule before changing data.')
