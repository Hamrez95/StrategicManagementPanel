"""Private canonical assessment data. Public teaching assets are built separately."""
import json
import os
import re
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[2]
ROOT = Path(os.environ.get('STRATINO_ACADEMY_ROOT', API_ROOT / 'academy-content' if (API_ROOT / 'academy-content').exists() else API_ROOT.parent.parent / 'docs' / 'learning-design'))

@lru_cache(maxsize=1)
def units():
    manifest = json.loads((ROOT / 'handoff/manifest.json').read_text(encoding='utf-8'))
    result = {}
    for ref in manifest['courses']:
        course = json.loads((ROOT / 'content' / ref['id'].lower() / 'course.v1.json').read_text(encoding='utf-8'))
        for stage in course['stages']:
            for lesson in stage['lessons']:
                result[lesson['id']] = {**lesson, 'revision': ref['sha256']}
            review = stage.get('checkpoint')
            if review and review.get('questions'):
                result[review['id']] = {**review, 'revision': ref['sha256']}
        review = course.get('final_assessment')
        if review and review.get('questions'):
            result[review['id']] = {**review, 'revision': ref['sha256']}
    return result

def parse_number(value):
    if not isinstance(value, str) or len(value) > 100:
        raise ValueError('invalid number')
    text = value.strip().translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩−', '01234567890123456789-'))
    if ',' in text or '٬' in text:
        if not re.fullmatch(r'[+-]?\d{1,3}([,٬]\d{3})+([.٫]\d+)?', text):
            raise ValueError('ambiguous separator')
        text = text.replace(',', '').replace('٬', '')
    text = text.replace('٫', '.')
    if not re.fullmatch(r'[+-]?(\d+(\.\d+)?|\.\d+)', text):
        raise ValueError('invalid number')
    number = Decimal(text)
    if not number.is_finite():
        raise ValueError('invalid number')
    return number

def grade(unit, question_id, answer):
    if question_id == 'activity':
        activity = unit.get('practice_activity')
        if not activity:
            raise ValueError('unknown activity')
        if activity['type'] == 'numeric':
            correct = abs(parse_number(answer) - Decimal(str(activity['answer']))) <= Decimal(str(activity.get('absolute_tolerance', 0)))
            return {'correct': correct, 'solution': activity.get('solution', ''), 'rubric': activity.get('rubric', []), 'unit': activity.get('unit', '')}
        if not isinstance(answer, str) or not answer.strip() or len(answer) > 30000:
            raise ValueError('empty response')
        try:
            sheet = json.loads(answer)
        except (ValueError, TypeError):
            sheet = None
        if isinstance(sheet, dict) and 'rows' in sheet:
            rows = sheet['rows']
            if not isinstance(rows, list) or not all(isinstance(row, list) and all(isinstance(cell, str) for cell in row) for row in rows):
                raise ValueError('invalid worksheet')
            if not str(sheet.get('text', '')).strip() and not any(cell.strip() for row in rows for cell in row):
                raise ValueError('empty worksheet')
        return {'correct': None, 'solution': activity.get('solution', ''), 'rubric': activity.get('rubric', []), 'self_review_required': True}
    question = next((q for q in unit.get('questions', []) if q['id'] == question_id), None)
    if not question or answer not in [option['id'] for option in question['options']]:
        raise ValueError('invalid option')
    option = next(option for option in question['options'] if option['id'] == answer)
    return {'correct': answer == question['correct_option_id'], 'explanation': question.get('explanation', ''),
            'feedback': option.get('feedback', ''), 'correct_option_id': question['correct_option_id'],
            'origin_question_id': question.get('origin_question_id', question['id']),
            'equivalence_group': question.get('equivalence_group', question['id']), 'independent_assessment': False}
