"""Read canonical teaching content privately; never export paid content into web assets."""
import json
from copy import deepcopy
from functools import lru_cache
from .content import ROOT


@lru_cache(maxsize=1)
def curriculum():
    manifest = json.loads((ROOT / 'handoff/manifest.json').read_text(encoding='utf-8'))
    catalog = json.loads((ROOT / 'catalog.v1.json').read_text(encoding='utf-8'))
    references = json.loads((ROOT / manifest['reference_visuals']['path'].split('docs/learning-design/')[-1]).read_text(encoding='utf-8'))
    result = {'version': catalog['curriculum_version'], 'production_ready': manifest['production_ready'], 'counts': manifest['counts'], 'release_followups': manifest['release_followups'], 'paths': catalog['paths'], 'courses': []}
    projected = {}
    for ref in manifest['courses']:
        course = json.loads((ROOT / 'content' / ref['id'].lower() / 'course.v1.json').read_text(encoding='utf-8'))
        meta = next(c for c in catalog['courses'] if c['id'] == course['id'])
        summary = {k: course[k] for k in ['id', 'title', 'version']}
        summary.update(path_id=meta['path_id'], revision=ref['sha256'], recommended_prerequisites=meta.get('recommended_prerequisites'), stages=[], final_review_id=(course.get('final_assessment') or {}).get('id'))
        def add(unit, kind, stage_id=None, title=None):
            item = deepcopy(unit)
            item.update(kind=kind, course_id=course['id'], course_title=course['title'], stage_id=stage_id, revision=ref['sha256'])
            if title:
                item['title'] = title
            item['learning_cards'] = item.get('learning_cards', [])
            allowed_question_keys = {'id', 'version', 'type', 'prompt', 'options', 'origin_question_id', 'equivalence_group', 'remediation_lesson_id', 'remediation_card_id', 'remediation_scope'}
            item['questions'] = [{**{k: v for k, v in q.items() if k in allowed_question_keys}, 'options': [{k: o[k] for k in ['id', 'text']} for o in q['options']]} for q in unit.get('questions', [])]
            if item.get('practice_activity'):
                item['practice_activity'] = {k: v for k, v in item['practice_activity'].items() if k in {'type', 'prompt', 'unit', 'expected_output', 'auto_grade'}}
            item['reference_visual_revision'] = manifest['reference_visuals']['sha256']
            item['reference_visuals'] = [{**next(v for v in references['visuals'] if v['id'] == p['visual_id']), 'card_id': p['card_id']} for p in references['placements'] if p['lesson_id'] == unit['id']]
            projected[unit['id']] = item
        for stage in course['stages']:
            stage_summary = {k: stage[k] for k in ['id', 'title', 'order', 'color_token']}
            stage_summary.update(lessons=[], review_id=(stage.get('checkpoint') or {}).get('id'))
            for lesson in stage['lessons']:
                add(lesson, 'lesson', stage['id'])
                stage_summary['lessons'].append({k: lesson.get(k) for k in ['id', 'title', 'objective', 'suggested_minutes']})
            if (stage.get('checkpoint') or {}).get('questions'):
                add(stage['checkpoint'], 'stage_review', stage['id'], f"مرور {stage['title']}")
            summary['stages'].append(stage_summary)
        if (course.get('final_assessment') or {}).get('questions'):
            add(course['final_assessment'], 'final_review', title=f"مرور پایانی {course['title']}")
        result['courses'].append(summary)
    card_owners = {card['id']: unit['id'] for unit in projected.values() for card in unit['learning_cards']}
    for unit in projected.values():
        for question in unit['questions']:
            if not question.get('remediation_lesson_id') and question.get('remediation_card_id') in card_owners:
                question['remediation_lesson_id'] = card_owners[question['remediation_card_id']]
    return result, projected
