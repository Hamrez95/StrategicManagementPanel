"""Build a traceable inventory for owner review before UI integration.

Structural validation is not scientific certification or permission to publish.
The inventory points at editorial bundles containing private answer keys.
"""
import hashlib
import json
from pathlib import Path
from content_voice import ROOT

REPO=ROOT.parents[1]
OUT=ROOT/'handoff'

def read(path):return json.loads(path.read_text(encoding='utf-8'))
def file_record(path):
    return {'path':path.relative_to(REPO).as_posix(),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}

def main():
    OUT.mkdir(exist_ok=True)
    bundles=[(p,read(p)) for p in sorted((ROOT/'content').glob('*/course.v1.json'))]
    lessons=[l for _,c in bundles for s in c['stages'] for l in s['lessons']]
    cards=[card['id'] for l in lessons for card in l['learning_cards']]
    card_ids=set(cards);question_ids=set();errors=[];counts={'courses':len(bundles),'lessons':len(lessons),'learning_cards':len(cards),'stage_reviews':0,'final_reviews':0,'lesson_questions':0,'stage_questions':0,'final_questions':0,'final_courses_with_reuse':0,'final_reused_questions':0}
    if len(cards)!=len(card_ids):errors.append('duplicate_card_ids')
    def bank(items,kind):
        counts[kind]+=len(items)
        for q in items:
            if q['id'] in question_ids:errors.append('duplicate_question:'+q['id'])
            question_ids.add(q['id']);opts=q['options'];ids=[o['id'] for o in opts]
            if len(set(ids))!=len(ids) or q['correct_option_id'] not in ids:errors.append('invalid_answer_key:'+q['id'])
            if q.get('remediation_card_id') and q['remediation_card_id'] not in card_ids:errors.append('missing_remediation:'+q['id'])
    courses=[]
    for path,c in bundles:
        final=c.get('final_assessment') or {};counts['final_reviews']+=bool(final)
        counts['final_courses_with_reuse']+=bool(final.get('reuses_existing_questions'))
        counts['final_reused_questions']+=final.get('reused_question_count',0)
        entry={'id':c['id'],'title':c['title'],**file_record(path),'stages':[],'final_reused_questions':final.get('reused_question_count',0)}
        for s in c['stages']:
            counts['stage_reviews']+=1;bank(s['checkpoint']['questions'],'stage_questions')
            entry['stages'].append({'id':s['id'],'lesson_ids':[l['id'] for l in s['lessons']]})
            for l in s['lessons']:
                bank(l['questions'],'lesson_questions')
                for asset in l.get('media_plan',{}).get('assets',[]):
                    for key in ('asset_ref','mobile_asset_ref'):
                        if asset.get(key) and not (ROOT/asset[key]).is_file():errors.append('missing_asset:'+asset[key])
        bank(final.get('questions',[]),'final_questions');courses.append(entry)
    catalog=read(ROOT/'catalog.v1.json');planned={l['id'] for c in catalog['courses'] for s in c['stages'] for l in s['lessons']}
    if planned!={l['id'] for l in lessons}:errors.append('catalog_lesson_coverage_mismatch')
    if errors:raise SystemExit(json.dumps({'blocking_structural_issues':errors},ensure_ascii=False))
    access=read(ROOT/'content/source-access-followup.json')
    manifest={'schema_version':'1.0','state':'ready_for_owner_review','ready_for_ui_integration_draft':True,'owner_review_required':True,'production_ready':False,'answer_keys_in_bundles':True,'counts':counts,'structural_checks':'passed','review_method':'shared source patterns, targeted content corrections and representative browser/visual checks; not manual scientific certification of every statement','courses':courses,'catalog':file_record(ROOT/'catalog.v1.json'),'media':[file_record(p) for p in sorted((ROOT/'content/media').glob('*.svg'))],'typography':[file_record(p) for p in sorted((REPO/'public/typography').rglob('*')) if p.is_file()],'locales':file_record(ROOT/'localization/manifest.json'),'release_followups':{'unconfirmed_direct_publisher_urls':access['unique_original_urls'],'independent_assessment_bank':'not_validated','learner_pilot':'pending','additional_languages':'not_translated'},'rebuild_order':['repair_remediation_refs.py (one-time repairs; does not replace valid targets)','audit_review_reuse.py','build-preview.py','export_locales.py','prepare_ui_handoff.py']}
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'handoff_state':manifest['state'],'counts':counts,'structural_issues':0}))

if __name__=='__main__':main()
