"""Repair proven missing remediation targets; leave valid targets unchanged."""
import json
from content_voice import ROOT

# Topic-reviewed lesson destinations for checkpoints with fictitious card IDs.
# None of these edits changes a prompt, option, answer or grading rule.
TOPICS={
    'C03-ST01':{1:1,2:1,3:2,4:3,5:4,6:2},
    'C05-ST03':{5:4,6:4},'C05-ST04':{5:1,6:4},
    'C06-ST01':{5:4,6:3},'C06-ST02':{5:2,6:1},
    'C06-ST03':{5:4,6:4},'C06-ST04':{5:4,6:3},
    'C08-ST01':{5:4,6:2},
    'S05-C3-ST01':dict(enumerate([1,2,3,4,4,3],1)),
    'S05-C3-ST02':dict(enumerate([1,2,3,4,4,2],1)),
    'S05-C3-ST03':dict(enumerate([1,2,3,4,4,2],1)),
    'S05-C4-ST01':dict(enumerate([1,2,3,4,4,2],1)),
    'S05-C4-ST02':dict(enumerate([1,2,3,4,4,3],1)),
    'S05-C4-ST03':dict(enumerate([1,2,3,3,4,4],1)),
    'S06-C1-ST01':dict(enumerate([1,2,2,3,4,4],1)),
    'S06-C1-ST02':dict(enumerate([1,2,3,1,1,4],1)),
    'S06-C1-ST03':dict(enumerate([1,2,3,1,4,4],1)),
    'S06-C2-ST01':dict(enumerate([1,2,3,4,2,1],1)),
}

def main():
    lessons={}
    for p in (ROOT/'content').glob('*/lessons/*.json'):
        lesson=json.loads(p.read_text(encoding='utf-8'));lessons[lesson['id']]=lesson
    cards={c['id'] for lesson in lessons.values() for c in lesson['learning_cards']}
    counts={'unambiguous_suffix':0,'topic_reviewed_lesson':0};unresolved=[]
    for p in list((ROOT/'content').glob('*/stages/*.json'))+list((ROOT/'content').glob('*/final-assessment.json')):
        doc=json.loads(p.read_text(encoding='utf-8'));changed=False
        questions=doc['questions'] if p.name=='final-assessment.json' else doc['checkpoint']['questions']
        for q in questions:
            old=q.get('remediation_card_id')
            if not old or old in cards:continue
            candidates=[card for card in cards if old.endswith(card)]
            if len(candidates)==1:q['remediation_card_id']=candidates[0];counts['unambiguous_suffix']+=1
            else:
                stage=q['id'].rsplit('-',2)[0];number=int(q['id'].rsplit('Q',1)[1])
                n=TOPICS.get(stage,{}).get(number)
                if not n:unresolved.append(q['id']);continue
                lid=f'{stage}-L{n:02d}';lesson=lessons[lid]
                target=next((c for c in lesson['learning_cards'] if c.get('type')=='definition'),lesson['learning_cards'][0])
                q.update(remediation_card_id=target['id'],remediation_lesson_id=lid,remediation_scope='lesson_review')
                counts['topic_reviewed_lesson']+=1
            changed=True
        if changed:p.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'repaired':counts,'unresolved':unresolved}))
    if unresolved:raise SystemExit('Unresolved remediation references require content review')

if __name__=='__main__':main()
