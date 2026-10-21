"""Fill absent end-of-course practice with explicitly reused questions.

This creates no fresh assessment variants and never overwrites an authored final.
The source lesson, question and version remain attached to each selected item.
"""
import copy
import json
from content_voice import ROOT

def main():
    catalog=json.loads((ROOT/'catalog.v1.json').read_text(encoding='utf-8'))
    created=[]
    for course in catalog['courses']:
        if not course.get('final_assessment'):continue
        folder=ROOT/'content'/course['id'].lower()
        path=folder/'final-assessment.json'
        if path.exists():continue
        questions=[]
        for stage in course['stages']:
            lessons=[json.loads((folder/'lessons'/f"{l['id']}.json").read_text(encoding='utf-8')) for l in stage['lessons']]
            # Four lessons: one question from each, then a fifth retrieval item.
            for i in range(5):
                lesson=lessons[i%len(lessons)]
                original=lesson['questions'][min(3+i//len(lessons),len(lesson['questions'])-1)]
                q=copy.deepcopy(original)
                q.update(id=f"{course['id']}-FINAL-Q{len(questions)+1:02d}",
                         origin_lesson_id=lesson['id'],origin_question_id=original['id'],
                         origin_question_version=original.get('version',1),reuses_question=True)
                questions.append(q)
        final={'id':course['final_assessment']['id'],'version':'1-review-selection',
               'status':'review_selection_draft','unlocks_content':False,
               'target_percent':80,'target_is_editorial_default':True,
               'fresh_equivalent_variants':0,'reuses_existing_questions':True,
               'description':'این مرور از سؤال‌های قبلی درس استفاده می‌کنه؛ سؤال تازه یا آزمون مستقل نیست.',
               'covered_stage_ids':[s['id'] for s in course['stages']],
               'questions':questions}
        path.write_text(json.dumps(final,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        created.append({'course':course['id'],'reused_questions':len(questions)})
    print(json.dumps({'created_review_selections':created,'new_independent_questions':0}))

if __name__=='__main__':main()
