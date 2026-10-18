"""Rebuild the standalone review page from catalog and authored course bundles."""
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1]
catalog=json.loads((ROOT/'catalog.v1.json').read_text(encoding='utf-8'))
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for p in sorted((ROOT/'content').glob('*/course.v1.json')):
    bundle=read(p)
    for i,st in enumerate(bundle['stages']):
        stage=read(p.parent/'stages'/f"{st['id']}.json")
        stage['lessons']=[read(p.parent/'lessons'/f"{l['id']}.json") for l in stage['lessons']]
        bundle['stages'][i]=stage;write(p.parent/'stages'/f"{st['id']}.json",stage)
    if bundle.get('final_assessment'):bundle['final_assessment']=read(p.parent/'final-assessment.json')
    write(p,bundle)
    lines=[f"# {bundle['title']}؛ نسخهٔ نخست",'',
           'وضعیت: پیش‌نویس تألیفی؛ بازبینی متخصص، بانک سؤال هم‌ارز و بررسی با یادگیرنده هنوز کامل نیست. فایل‌های درس‌نامه مرجع محتوا هستند؛ این سند برای مطالعه و بازبینی ساخته شده است.','']
    for st in bundle['stages']:
        lines += [f"## مرحلهٔ {st['order']}؛ {st['title']}",'']
        for l in st['lessons']:
            lines += [f"### درس‌نامهٔ `{l['id']}`؛ {l['title']}",'',f"هدف: {l['objective']}",'']
            for card in l['learning_cards']:
                lines += [f"#### {card['title']}",'',card['text'],'']
                if card.get('table'):
                    t=card['table'];lines += ['| '+' | '.join(t['columns'])+' |','|'+'---|'*len(t['columns'])]+['| '+' | '.join(row)+' |' for row in t['rows']]+['']
                elif card.get('elements'):lines += [' ← '.join(card['elements']),'']
            lines += ['#### تمرین و بازخورد','']
            for q in l['questions']:
                lines += [q['prompt'],'']+[f"- {o['text']}" for o in q['options']]+['','پاسخ: '+next(o['text'] for o in q['options'] if o['id']==q['correct_option_id'])+'؛ '+q['explanation'],'']
            a=l.get('practice_activity')
            if a:
                lines += ['#### فعالیت کاربردی','',a['prompt'],'']
                if a.get('solution'):lines += [a['solution'],'']
                if a.get('rubric'):lines += ['معیار بررسی: '+'؛ '.join(x if isinstance(x,str) else x['criterion'] for x in a['rubric'])+'؛ ثبت پاسخ به معنی صحیح‌بودن خودکار نیست.','']
            if l.get('glossary'):lines += ['#### واژه‌های مرحله','']+[x['term']+'؛ '+x['definition'] for x in l['glossary']]+['']
            lines += ['#### منابع','']+[f"- منبع [{r.get('title',r['id'])}]({r['url']})؛ {r.get('scope','چارچوب مفهومی')}" for r in l['source_links']]+['']
        lines += ['### مرور مرحله','']
        for q in st['checkpoint']['questions']:lines += [q['prompt'],'','پاسخ: '+next(o['text'] for o in q['options'] if o['id']==q['correct_option_id'])+'؛ '+q['explanation'],'']
    if bundle.get('final_assessment'):
        lines += ['## جمع‌بندی پایان درس','']
        for q in bundle['final_assessment']['questions']:lines += [q['prompt'],'','پاسخ: '+next(o['text'] for o in q['options'] if o['id']==q['correct_option_id'])+'؛ '+q['explanation'],'']
    (p.parent/'COURSE_FA.md').write_text('\n'.join(lines),encoding='utf-8')
courses=[]
for c in catalog['courses']:
    slim={k:c[k] for k in ['id','title','counts','stages']}
    slim['stages']=[{**{k:s[k] for k in ['id','title','order','color_token','checkpoint']},'lessons':[{k:l[k] for k in ['id','title','objective','free_sample','content_status']} for l in s['lessons']]} for s in c['stages']]
    slim['final_assessment']=c.get('final_assessment');courses.append(slim)
view={'paths':catalog['paths'],'counts':catalog['counts'],'courses':courses}
bundles={'courses':[json.loads(p.read_text(encoding='utf-8')) for p in sorted((ROOT/'content').glob('*/course.v1.json'))]}
authored_ids={l['id'] for b in bundles['courses'] for s in b['stages'] for l in s['lessons']}
progress={'schema_version':'1.0','scope':'All curriculum lessons including optional preparation','lessons':[]}
for c in catalog['courses']:
    for s in c['stages']:
        for l in s['lessons']:
            if l['id'] in authored_ids:
                l['assessment_plan']['item_bank_status']='authored_draft'
                l['assessment_plan']['fresh_equivalent_variants']=0
            progress['lessons'].append({'id':l['id'],'course_id':c['id'],'title':l['title'],'authoring':'draft_done' if l['id'] in authored_ids else 'todo','review':'pending' if l['id'] in authored_ids else 'not_started','production_ready':False,'content_ref':l.get('content_ref') if l['id'] in authored_ids else None})
progress['counts']={'total':len(progress['lessons']),'draft_done':len(authored_ids),'todo':len(progress['lessons'])-len(authored_ids),'production_ready':0}
write(ROOT/'content/authoring-progress.json',progress)
write(ROOT/'catalog.v1.json',catalog)
def payload(value):return json.dumps(value,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
page=ROOT/'curriculum-explorer.html';text=page.read_text(encoding='utf-8')
text=re.sub(r'(<script id="catalogData" type="application/json">).*?(</script>)',lambda m:m[1]+payload(view)+m[2],text,flags=re.S,count=1)
text=re.sub(r'<script id="(?:sampleData|authoredData)" type="application/json">.*?</script>',lambda m:'<script id="authoredData" type="application/json">'+payload(bundles)+'</script>',text,flags=re.S,count=1)
script=(ROOT/'editor-preview.js').read_text(encoding='utf-8')
text=re.sub(r'(<script id="authoredData" type="application/json">.*?</script>)<script>.*?</script>',lambda m:m[1]+'<script>\n'+script+'\n</script>',text,flags=re.S,count=1)
text=text.replace('چهار دایرهٔ سبز استراتژی، متن و تمرین نمونه دارند؛ بقیه، طرح درس‌نامه‌اند.','استراتژی عمومی متن و تمرین نسخهٔ نخست دارد؛ وضعیت نگارش درس‌های دیگر روی هر دایره مشخص است.')
extra='''/* authoring-review-components */
.table-scroll{overflow-x:auto;max-width:100%}table{border-collapse:collapse;width:100%;margin:12px 0}caption{text-align:start;font-weight:bold}th,td{padding:10px;border:1px solid var(--line);text-align:start;vertical-align:top}textarea,input{box-sizing:border-box;width:100%;font:inherit;padding:10px;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:6px}button:focus-visible,select:focus-visible,a:focus-visible,textarea:focus-visible,input:focus-visible{outline:3px solid var(--blue);outline-offset:3px}dialog .card p{line-height:2;max-width:68ch}dialog{scrollbar-gutter:stable}button:disabled{opacity:.55}
'''
if '/* authoring-review-components */' not in text:text=text.replace('</style>',extra+'</style>',1)
page.write_text(text,encoding='utf-8')
print(json.dumps({'bundles':len(bundles['courses']),'lessons':sum(len(s['lessons']) for c in bundles['courses'] for s in c['stages']),'page_bytes':page.stat().st_size}))
