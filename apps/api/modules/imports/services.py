import hashlib
import json
import math
from modules.exports.schema_v2 import V2_EXTRA_SCOPE

MAX_IMPORT_BYTES = 5_000_000
MAX_REQUEST_BYTES = MAX_IMPORT_BYTES + 256
MAX_DEPTH = 16
MAX_ARRAY_ITEMS = 400
MAPPING_VERSION = 1

REQUIRED_FIELDS = {
    'version', 'org', 'completed', 'external', 'internal', 'qScores', 'space', 'fin',
    'investment', 'trend', 'objectives', 'initiatives', 'risks', 'journal', 'pestel',
    'forces', 'competitors', 'vrio', 'swot', 'options', 'products', 'scenario',
    'bcgThreshold', 'learning', 'mode', 'period', 'notes',
}
OPTIONAL_FIELDS = {'schema', 'schema_version', 'exported_at', 'attachments', 'file_metadata', 'files', 'documents'}
RECORD_FIELDS = ('external', 'internal', 'objectives', 'initiatives', 'risks', 'journal', 'pestel', 'competitors', 'vrio', 'swot', 'options', 'products')
BYTE_FIELDS = {'file_bytes', 'bytes_base64', 'content_base64', 'data_url', 'blob'}
STRATINO_EXPORT_SCHEMA = 'stratino-workspace-v1'
STRATINO_EXPORT_SCHEMAS = {'stratino-workspace-v1': 1, 'stratino-workspace-v2': 2}
STRATINO_EXPORT_SCOPE = {
    'workspace', 'workspace_profile', 'profile_history', 'analyses', 'strategy_factors', 'strategy_options',
    'decisions', 'goals', 'actions', 'execution_history', 'documents', 'document_templates', 'document_history', 'ready_attachments',
}


class ImportValidationError(Exception):
    def __init__(self, message, *, fields=None, code='invalid_import'):
        super().__init__(message)
        self.fields = fields or {}
        self.code = code


def _bad(message, field='file'):
    raise ImportValidationError(message, fields={field: [message]})


def _finite_json(value, depth=0):
    if depth > MAX_DEPTH:
        _bad('ساختار فایل بیش از حد تو در تو است.')
    if value is None or isinstance(value, (str, bool)):
        if isinstance(value, str):
            if len(value) > MAX_IMPORT_BYTES:
                _bad('یکی از متن‌های فایل بیش از اندازه بزرگ است.')
            try:
                value.encode('utf-8')
            except UnicodeEncodeError:
                _bad('فایل شامل متن Unicode نامعتبر است.')
        return
    if isinstance(value, int) and not isinstance(value, bool):
        if value.bit_length() > 1024:
            _bad('یکی از عددهای فایل بیش از اندازه بزرگ است.')
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            _bad('فایل شامل عدد نامعتبر است.')
        return
    if isinstance(value, list):
        if len(value) > MAX_ARRAY_ITEMS:
            _bad('تعداد رکوردهای یک بخش بیش از حد مجاز است.')
        for item in value:
            _finite_json(item, depth + 1)
        return
    if isinstance(value, dict):
        if len(value) > 200:
            _bad('تعداد فیلدهای یک بخش بیش از حد مجاز است.')
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > 120:
                _bad('نام یکی از فیلدها معتبر نیست.')
            try:
                key.encode('utf-8')
            except UnicodeEncodeError:
                _bad('نام یکی از فیلدها Unicode معتبر ندارد.')
            _finite_json(item, depth + 1)
        return
    _bad('فایل شامل مقدار پشتیبانی‌نشده است.')


def _reject_constant(value):
    raise ValueError(f'Invalid numeric constant: {value}')


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON object key')
        result[key] = value
    return result


def _source_state(value):
    if not isinstance(value, dict):
        _bad('ریشه فایل باید یک شیء JSON باشد.')
    schema = value.get('schema')
    if 'schema' in value:
        if not isinstance(schema, str) or schema not in {'royesh-strategy-v1', 'stratino-legacy-v1'}:
            _bad('نوع schema فایل پشتیبان شناخته‌شده نیست.')
        schema_version = value.get('schema_version')
        if not isinstance(schema_version, int) or isinstance(schema_version, bool) or schema_version != 1 or not isinstance(value.get('data'), dict):
            _bad('نسخه فایل پشتیبان شناخته‌شده نیست.')
        if set(value) - {'schema', 'schema_version', 'data', 'exported_at'}:
            _bad('پوشش فایل پشتیبان شامل فیلد ناشناخته است.')
        if 'exported_at' in value and not isinstance(value['exported_at'], str):
            _bad('زمان خروجی فایل پشتیبان معتبر نیست.')
        envelope = {key: item for key, item in value.items() if key != 'data'}
        return value['data'], schema, envelope
    if 'schema_version' in value:
        schema_version = value['schema_version']
        if not isinstance(schema_version, int) or isinstance(schema_version, bool) or schema_version != 1:
            _bad('نسخه فایل پشتیبان شناخته‌شده نیست.')
    return value, 'royesh-strategy-v1', None


def _validate_legacy_state(state):
    if not isinstance(state.get('version'), int) or isinstance(state.get('version'), bool) or state.get('version') != 1:
        _bad('این فایل نسخه پشتیبان قدیمی استراتینو نیست.')
    missing = REQUIRED_FIELDS - set(state)
    unknown = set(state) - REQUIRED_FIELDS - OPTIONAL_FIELDS
    if missing:
        _bad('بعضی بخش‌های ضروری فایل وجود ندارند.')
    if unknown:
        _bad('فایل شامل بخش‌هایی است که این نسخه نمی‌تواند امن منتقل کند.')
    if not isinstance(state.get('org'), dict) or not isinstance(state['org'].get('name'), str):
        _bad('اطلاعات کسب‌وکار فایل معتبر نیست.', 'org')
    for field in RECORD_FIELDS:
        value = state.get(field)
        if not isinstance(value, list) or len(value) > 200:
            _bad('فهرست رکوردها معتبر نیست.', field)
        if any(not isinstance(item, dict) for item in value):
            _bad('هر رکورد باید یک شیء JSON باشد.', field)
    if not state['external'] or not state['internal'] or len(state['options']) != 3:
        _bad('فهرست عوامل یا گزینه‌های استراتژی کامل نیست.')
    if not isinstance(state['completed'], list) or len(state['completed']) != 6 or any(not isinstance(item, bool) for item in state['completed']):
        _bad('وضعیت مرحله‌های راهبرد معتبر نیست.', 'completed')
    if not isinstance(state['forces'], list) or len(state['forces']) != 5:
        _bad('مقادیر پنج نیروی رقابتی معتبر نیستند.', 'forces')
    if not isinstance(state['qScores'], dict) or not isinstance(state['space'], dict):
        _bad('داده ماتریس‌ها معتبر نیست.')
    if not isinstance(state['fin'], dict) or not isinstance(state['investment'], dict) or not isinstance(state['trend'], dict):
        _bad('داده مالی معتبر نیست.')
    trend = state['trend']
    if not all(isinstance(trend.get(key), list) for key in ('months', 'revenue', 'target')):
        _bad('دوره‌های روند مالی معتبر نیستند.', 'trend')
    if not (len(trend['months']) == len(trend['revenue']) == len(trend['target'])):
        _bad('دوره‌های روند مالی با هم سازگار نیستند.', 'trend')
    if any(not isinstance(month, str) for month in trend['months']) or any(
        not isinstance(amount, (int, float)) or isinstance(amount, bool)
        for key in ('revenue', 'target') for amount in trend[key]
    ):
        _bad('مقادیر روند مالی معتبر نیستند.', 'trend')
    if not isinstance(state['scenario'], dict) or not isinstance(state['notes'], str):
        _bad('سناریو یا یادداشت فایل معتبر نیست.')
    if not isinstance(state['learning'], bool):
        _bad('وضعیت راهنمای یادگیری فایل معتبر نیست.', 'learning')
    if not isinstance(state['bcgThreshold'], (int, float)) or isinstance(state['bcgThreshold'], bool):
        _bad('آستانه ماتریس BCG معتبر نیست.', 'bcgThreshold')
    if not isinstance(state.get('mode'), str) or state['mode'] not in {'company', 'startup'} or not isinstance(state.get('period'), str) or state['period'] not in {'six', 'quarter', 'month'}:
        _bad('حالت یا دوره فایل پشتیبان معتبر نیست.')
    for field in ('attachments', 'file_metadata', 'files', 'documents'):
        if field in state and (
            not isinstance(state[field], list)
            or len(state[field]) > 200
            or any(not isinstance(item, dict) for item in state[field])
        ):
            _bad('فهرست مدارک و پیوست‌ها معتبر نیست.', field)
    _finite_json(state)


def _strip_file_bytes(value):
    if isinstance(value, list):
        clean = []
        missing = 0
        for item in value:
            safe, count = _strip_file_bytes(item)
            clean.append(safe)
            missing += count
        return clean, missing
    if not isinstance(value, dict):
        return value, 0
    clean = {}
    missing = 0
    contains_bytes = False
    for key, item in value.items():
        if key in BYTE_FIELDS:
            contains_bytes = contains_bytes or bool(item)
            continue
        safe, count = _strip_file_bytes(item)
        clean[key] = safe
        missing += count
    has_metadata = any(key in clean for key in ('file_name', 'filename', 'name', 'size', 'mime_type', 'content_type'))
    if contains_bytes or (has_metadata and isinstance(clean.get('size'), (int, float)) and clean['size'] > 0):
        missing += 1
    return clean, missing


def inspect_legacy_backup(value):
    """Validate and map the old browser backup without mutating its source."""
    if isinstance(value, dict) and isinstance(value.get('schema'), str) and value.get('schema') in STRATINO_EXPORT_SCHEMAS:
        return inspect_stratino_export(value)
    state, source_schema, source_envelope = _source_state(value)
    _validate_legacy_state(state)
    metadata_fields = ('attachments', 'file_metadata', 'files', 'documents')
    metadata = []
    missing_bytes = 0
    for field in metadata_fields:
        entries = state.get(field, [])
        safe, missing = _strip_file_bytes(entries)
        metadata.extend(safe)
        missing_bytes += missing
    safe_source = dict(state)
    for field in metadata_fields:
        if field in safe_source:
            safe_source[field], _ = _strip_file_bytes(safe_source[field])

    record_counts = {
        'analysis_records': sum(len(state[field]) for field in ('external', 'internal', 'pestel', 'competitors', 'vrio', 'swot')),
        'decision_records': len(state['options']) + len(state['journal']),
        'execution_records': len(state['objectives']) + len(state['initiatives']) + len(state['risks']),
        'financial_periods': len(state['trend']['months']),
        'file_metadata': len(metadata),
    }
    mapped = {
        'mapping_version': MAPPING_VERSION,
        'organization': state['org'],
        'analysis': {
            'external_factors': state['external'],
            'internal_factors': state['internal'],
            'pestel': state['pestel'],
            'five_forces': state['forces'],
            'competitors': state['competitors'],
            'vrio': state['vrio'],
            'swot': state['swot'],
            'strategic_options': state['options'],
            'products': state['products'],
            'matrices': state['space'],
            'qspm_scores': state['qScores'],
        },
        'decisions': state['journal'],
        'execution': {
            'completed_stages': state['completed'],
            'objectives': state['objectives'],
            'initiatives': state['initiatives'],
            'risks': state['risks'],
        },
        'financial': {
            'assumptions': state['fin'],
            'investment': state['investment'],
            'trend': state['trend'],
            'scenario': state['scenario'],
            'bcg_threshold': state['bcgThreshold'],
        },
        'learning': {'enabled': state['learning'], 'mode': state['mode'], 'period': state['period']},
        'notes': state['notes'],
        'document_metadata': metadata,
        'source_fields': {
            key: item for key, item in state.items()
            if key not in REQUIRED_FIELDS and key not in metadata_fields
        },
    }
    canonical = json.dumps(safe_source, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
    safe_source_backup = {**source_envelope, 'data': safe_source} if source_envelope is not None else safe_source
    return {
        'source_schema': source_schema,
        'source_digest': hashlib.sha256(canonical.encode('utf-8')).hexdigest(),
        'record_counts': record_counts,
        'record_count': sum(record_counts.values()),
        'missing_attachment_bytes': missing_bytes,
        'source_backup': safe_source_backup,
        'warnings': [
            'نسخه مرورگر و فایل پشتیبان قدیمی دست‌نخورده می‌ماند.',
            'داده در آرشیو واردسازی همین فضای کار نگه‌داری می‌شود و به‌تدریج توسط ابزارهای ساختاریافته خوانده خواهد شد.',
            *(['اطلاعات پیوست‌ها منتقل شد، اما بایت فایل باید دوباره بارگذاری شود.'] if missing_bytes else []),
        ],
        'data': mapped,
    }


def inspect_stratino_export(value):
    """Validate a versioned Workspace export for safe, non-destructive import archiving."""
    required = {'schema', 'schema_version', 'exported_at', 'method_version', 'scope', 'data'}
    if set(value) != required:
        _bad('ساختار فایل خروجی استراتینو معتبر نیست.')
    version = STRATINO_EXPORT_SCHEMAS.get(value.get('schema')) if isinstance(value.get('schema'), str) else None
    if version is None or value.get('schema_version') != version or isinstance(value.get('schema_version'), bool):
        _bad('نسخه فایل خروجی استراتینو پشتیبانی نمی‌شود.')
    if not isinstance(value.get('exported_at'), str) or not isinstance(value.get('method_version'), str):
        _bad('نسخه روش یا زمان ساخت فایل معتبر نیست.')
    scope = value.get('scope')
    expected_scope = STRATINO_EXPORT_SCOPE | (set(V2_EXTRA_SCOPE) if version == 2 else set())
    if (
        not isinstance(scope, list)
        or any(not isinstance(item, str) for item in scope)
        or set(scope) != expected_scope
        or len(scope) != len(expected_scope)
    ):
        _bad('دامنه داده فایل با دامنه مجاز این نسخه هماهنگ نیست.')
    data = value.get('data')
    required_sections = {
        'workspace', 'workspace_profile', 'profile_history', 'analyses', 'strategy_factors',
        'strategy_options', 'decisions', 'goals', 'actions', 'execution_history', 'documents', 'document_templates',
        'ready_attachments', 'document_history',
    }
    if version == 2:
        required_sections.update(V2_EXTRA_SCOPE)
    if not isinstance(data, dict) or set(data) != required_sections:
        _bad('بخش‌های فایل خروجی کامل یا شناخته‌شده نیستند.')
    if not isinstance(data['workspace'], dict) or not isinstance(data['workspace'].get('id'), str):
        _bad('شناسه فضای کار در فایل معتبر نیست.')
    for field in required_sections - {'workspace', 'workspace_profile', 'report_verification'}:
        if not isinstance(data[field], list):
            _bad('ساختار یکی از فهرست‌های فایل معتبر نیست.', field)
    if data['workspace_profile'] is not None and not isinstance(data['workspace_profile'], dict):
        _bad('مشخصات فضای کار در فایل معتبر نیست.', 'workspace_profile')
    _finite_json(value)

    record_counts = {
        'analysis_records': len(data['analyses']),
        'decision_records': len(data['decisions']),
        'execution_records': len(data['goals']) + len(data['actions']) + len(data['execution_history']),
        'financial_periods': 0,
        'file_metadata': sum(len(item.get('attachments', [])) for item in data['documents'] if isinstance(item, dict)),
        'strategy_records': len(data['strategy_factors']) + len(data['strategy_options']),
        'document_records': len(data['documents']),
    }
    if version == 2:
        record_counts['canonical_records'] = sum(len(data[key]) for key in V2_EXTRA_SCOPE if key != 'report_verification')
    canonical = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
    return {
        'source_schema': value['schema'],
        'source_digest': hashlib.sha256(canonical.encode('utf-8')).hexdigest(),
        'record_counts': record_counts,
        'record_count': sum(record_counts.values()),
        'missing_attachment_bytes': record_counts['file_metadata'],
        'warnings': [
            'این نسخه در تاریخچهٔ واردسازی ثبت می‌شود و دادهٔ فعال فضای کار را بازنویسی نمی‌کند.',
            *(['فایل JSON فراداده پیوست‌ها را دارد؛ بایت فایل‌ها فقط در آرشیو ZIP خروجی قرار می‌گیرند.'] if record_counts['file_metadata'] else []),
        ],
        'data': {
            'mapping_version': MAPPING_VERSION,
            'source_workspace': data['workspace'],
            'workspace_profile': data['workspace_profile'],
            'project_records': {key: data[key] for key in required_sections if key not in {'workspace', 'workspace_profile'}},
            'export_scope': scope,
            'method_version': value['method_version'],
            'exported_at': value['exported_at'],
        },
        'source_backup': value,
    }


def parse_import_request(raw_body):
    if len(raw_body) > MAX_REQUEST_BYTES:
        raise ImportValidationError('فایل پشتیبان بیش از پنج مگابایت است.', fields={'file': ['حداکثر اندازه فایل پنج مگابایت است.']}, code='import_too_large')
    try:
        body = json.loads(raw_body or b'{}', parse_constant=_reject_constant, object_pairs_hook=_unique_object)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError, RecursionError):
        _bad('فایل JSON معتبر نیست.')
    if isinstance(body, dict) and isinstance(body.get('schema'), str) and body.get('schema') in STRATINO_EXPORT_SCHEMAS:
        return inspect_stratino_export(body)
    if not isinstance(body, dict) or set(body) != {'schema_version', 'data'}:
        _bad('درخواست باید شامل نسخه طرح و داده فایل باشد.')
    if not isinstance(body.get('schema_version'), int) or isinstance(body.get('schema_version'), bool) or body.get('schema_version') != 1:
        _bad('نسخه درخواست واردسازی پشتیبانی نمی‌شود.', 'schema_version')
    return inspect_legacy_backup(body['data'])
