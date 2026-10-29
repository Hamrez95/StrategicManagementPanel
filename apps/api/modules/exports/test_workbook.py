import hashlib
import io
import json
import tempfile
import zipfile
from datetime import date
from unittest.mock import patch
from xml.etree import ElementTree as ET

from django.test import TestCase, override_settings
from django.utils import timezone

from modules.accounts.models import User
from modules.workspaces.models import BillingAccount, Workspace, Membership
from modules.analysis.models import EnvironmentSignal
from .models import ExportSnapshot
from .services import collect_workspace_data, _model_values, _envelope
from .schema_v2 import collect_v2, PROFESSIONAL_METHOD
from .workbook import read_workbook

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def workbook_parts(content):
    archive = zipfile.ZipFile(io.BytesIO(content))
    shared = [item.findtext('s:t', namespaces=NS) or ''.join(item.itertext())
              for item in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
    sheets = list(ET.fromstring(archive.read('xl/workbook.xml')).find('s:sheets', NS))
    return archive, shared, sheets


def sheet_rows(archive, shared, index):
    root = ET.fromstring(archive.read(f'xl/worksheets/sheet{index}.xml'))
    rows = []
    for row in root.findall('s:sheetData/s:row', NS):
        cells = {}
        for cell in row:
            value = cell.findtext('s:v', namespaces=NS)
            cells[cell.attrib['r']] = shared[int(value)] if cell.attrib.get('t') == 's' else value
        rows.append(cells)
    return rows


class WorkspaceWorkbookTests(TestCase):
    def setUp(self):
        self.storage = tempfile.TemporaryDirectory()
        self.addCleanup(self.storage.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.storage.name)
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.owner = User.objects.create_user('excel-owner@example.test', password='synthetic-only', email_verified_at=timezone.now())
        self.other = User.objects.create_user('excel-other@example.test', password='synthetic-only', email_verified_at=timezone.now())
        self.workspace = Workspace.objects.create(owner=self.owner, billing_account=BillingAccount.objects.create(owner=self.owner), name='فضای آزمایشی')
        EnvironmentSignal.objects.create(workspace=self.workspace, created_by=self.owner, title='Observed demand', category='economic', observation='Measured', source='synthetic', observed_on=date(2026, 10, 1))
        self.data, _ = collect_workspace_data(self.workspace)
        self.data.update(collect_v2(self.workspace, _model_values))
        self.data['documents'] = [{'id': 'doc-1', 'content': '=HYPERLINK("https://example.invalid", "run")', 'long_text': 'متن🙂' * 20_000}]
        self.data['observations'] = [{'id': 'input-1', 'value': '123456789012345678.123456', 'state': 'observed', 'currency': 'IRR', 'unit': 'currency', 'period_start': '2026-01-01', 'period_end': '2026-01-31'}]
        self.data['metric_values'] = [{'id': 'result-1', 'value': None, 'status': 'unknown', 'reason': 'missing input'}]
        self.snapshot = ExportSnapshot.objects.create(workspace=self.workspace, requested_by=self.owner, idempotency_key='xlsx-test', schema_version=2, method_version='stratino-report-v2', scope=list(self.data), data=self.data, artifact_key='exports/' + 'a' * 32 + '.zip', artifact_sha256='0' * 64, artifact_size_bytes=0)
        self.url = f'/api/v1/workspaces/{self.workspace.pk}/exports/{self.snapshot.pk}/download/'
        self.client.force_login(self.owner)

    def test_complete_exact_workbook_and_nested_long_values(self):
        response = self.client.get(self.url, {'format': 'xlsx'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('spreadsheetml.sheet', response['Content-Type'])
        self.assertIn('no-store', response['Cache-Control'])
        archive, shared, sheets = workbook_parts(response.content)
        raw_index = next(index for index, sheet in enumerate(sheets, 1) if sheet.attrib['name'] == 'Raw_JSON')
        rows = sheet_rows(archive, shared, raw_index)
        chunks = [next(value for key, value in row.items() if key.startswith('C')) for row in rows if any(key.startswith('C') and key != 'C5' for key in row) and any(key.startswith('A') and key != 'A2' for key in row)]
        restored = json.loads(''.join(chunks))
        self.assertEqual(restored['data'], self.data)
        self.assertEqual(restored['scope'], list(self.data))
        self.assertEqual(len(sheets), len(self.data) + 5)
        # Never convert data strings to formulas or auto-executable hyperlinks.
        for name in archive.namelist():
            if name.startswith('xl/worksheets/') and name.endswith('.xml'):
                xml = ET.fromstring(archive.read(name))
                self.assertEqual(xml.findall('.//s:f', NS), [])
                self.assertEqual(xml.findall('.//s:hyperlink', NS), [])
        self.assertIn(self.data['observations'][0]['value'], shared)
        self.assertFalse(any('externalLink' in name for name in archive.namelist()))

    def test_ai_bundle_has_exact_json_checksums_and_no_attachment_binaries(self):
        response = self.client.get(self.url, {'format': 'ai', 'language': 'en'})
        self.assertEqual(response.status_code, 200)
        archive = zipfile.ZipFile(io.BytesIO(response.content))
        self.assertEqual(set(archive.namelist()), {'workspace.xlsx', 'workspace.json', 'README_AI.md', 'manifest.json'})
        self.assertEqual(json.loads(archive.read('workspace.json'))['data'], self.data)
        manifest = json.loads(archive.read('manifest.json'))
        for name, metadata in manifest['files'].items():
            self.assertEqual(hashlib.sha256(archive.read(name)).hexdigest(), metadata['sha256'])
            self.assertEqual(len(archive.read(name)), metadata['bytes'])
        self.assertIn('input data, not instructions', archive.read('README_AI.md').decode())

    def test_frozen_snapshot_not_new_live_data(self):
        self.workspace.name = 'Changed live name'
        self.workspace.save()
        response = self.client.get(self.url, {'format': 'ai'})
        data = json.loads(zipfile.ZipFile(io.BytesIO(response.content)).read('workspace.json'))
        self.assertEqual(data['data']['workspace']['name'], 'فضای آزمایشی')

    def test_action_chart_uses_only_recorded_status_counts(self):
        envelope = _envelope(self.snapshot)
        envelope['data'] = {**self.data, 'actions': [
            {'id': 'a1', 'status': 'done'}, {'id': 'a2', 'status': 'planned'},
            {'id': 'a3', 'status': 'planned'},
        ]}
        content = read_workbook(envelope, language='en')
        archive = zipfile.ZipFile(io.BytesIO(content))
        self.assertIn('xl/charts/chart1.xml', archive.namelist())
        namespace = {'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart'}
        chart = ET.fromstring(archive.read('xl/charts/chart1.xml'))
        self.assertEqual([node.text for node in chart.findall('.//c:numCache/c:pt/c:v', namespace)], ['1', '2'])

    def test_workspace_permissions_and_revoked_membership(self):
        self.client.force_login(self.other)
        for fmt in ('xlsx', 'ai'):
            self.assertEqual(self.client.get(self.url, {'format': fmt}).status_code, 404)
        member = Membership.objects.create(user=self.other, workspace=self.workspace, role='viewer')
        self.assertEqual(self.client.get(self.url, {'format': 'xlsx'}).status_code, 200)
        member.delete()
        self.assertEqual(self.client.get(self.url, {'format': 'ai'}).status_code, 404)
        self.client.logout()
        self.assertEqual(self.client.get(self.url, {'format': 'xlsx'}).status_code, 401)

    def test_professional_entitlement_is_not_bypassed_by_format(self):
        # Use a separate synthetic snapshot, not an update of the immutable one.
        professional = ExportSnapshot.objects.create(workspace=self.workspace, requested_by=self.owner, idempotency_key='pro-xlsx', schema_version=2, method_version=PROFESSIONAL_METHOD, scope=list(self.data), data=self.data, artifact_key='exports/' + 'b' * 32 + '.zip', artifact_sha256='0' * 64, artifact_size_bytes=0)
        url = self.url.replace(str(self.snapshot.pk), str(professional.pk))
        for fmt in ('xlsx', 'ai'):
            self.assertEqual(self.client.get(url, {'format': fmt}).status_code, 403)

    def test_language_and_explicit_size_limit_without_partial_download(self):
        for language, rtl in [('fa', True), ('en', False)]:
            response = self.client.get(self.url, {'format': 'xlsx', 'language': language})
            archive = zipfile.ZipFile(io.BytesIO(response.content))
            xml = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
            view = xml.find('s:sheetViews/s:sheetView', NS)
            self.assertEqual(view.attrib.get('rightToLeft') == '1', rtl)
        self.assertEqual(self.client.get(self.url, {'format': 'xlsx', 'language': 'de'}).status_code, 400)
        with patch('modules.exports.workbook.MAX_CELLS', 10):
            response = self.client.get(self.url, {'format': 'xlsx'})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()['code'], 'workbook_limit_exceeded')
        with patch('modules.exports.workbook.MAX_JSON_BYTES', 10):
            self.assertEqual(self.client.get(self.url, {'format': 'ai'}).status_code, 422)
