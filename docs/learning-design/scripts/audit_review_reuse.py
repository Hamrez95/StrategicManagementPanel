"""Record exact reuse in final practice without changing question IDs or answers."""
import json
from content_voice import ROOT

def fingerprint(q):
    correct=next(o['text'].strip() for o in q['options'] if o['id']==q['correct_option_id'])
    return q['prompt'].strip(),tuple(sorted(o['text'].strip() for o in q['options'])),correct

def main():
    summary=[]
    for folder in sorted((ROOT/'content').iterdir()):
        path=folder/'final-assessment.json'
        if not path.exists():continue
        origins={}
        for lesson_path in sorted((folder/'lessons').glob('*.json')):
            lesson=json.loads(lesson_path.read_text(encoding='utf-8'))
            for q in lesson['questions']:
                origins.setdefault(fingerprint(q),{'origin_lesson_id':lesson['id'],'origin_question_id':q['id'],'origin_question_version':q.get('version',1)})
        for stage_path in sorted((folder/'stages').glob('*.json')):
            stage=json.loads(stage_path.read_text(encoding='utf-8'))
            for q in stage['checkpoint']['questions']:
                origins.setdefault(fingerprint(q),{'origin_stage_id':stage['id'],'origin_question_id':q['id'],'origin_question_version':q.get('version',1)})
        final=json.loads(path.read_text(encoding='utf-8'));count=0
        for q in final['questions']:
            origin=origins.get(fingerprint(q))
            if origin:
                for k,v in origin.items():q.setdefault(k,v)
                q['reuses_question']=True
                q['origin_match_kind']='exact_prompt_options_and_correct_text'
            if q.get('reuses_question'):count+=1
        if count:
            final['reuses_existing_questions']=True
            final['reused_question_count']=count
            final['fresh_equivalent_variants']=0
            final['description']='این مرور شامل سؤال‌های قبلی درس یا مرور مرحله‌هاست؛ نتیجه‌اش به‌تنهایی تسلط مستقل رو ثابت نمی‌کنه.'
            path.write_text(json.dumps(final,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            summary.append({'course':folder.name,'reused':count,'total':len(final['questions'])})
    print(json.dumps({'courses_with_reuse':len(summary),'reused_items':sum(r['reused'] for r in summary),'courses':summary}))

if __name__=='__main__':main()
