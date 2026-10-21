"""Conservative, scoped voice pass over authored Academy copy; sources/IDs are excluded.

Run from any directory. Canonical lessons, checkpoint questions and final questions
are inputs; build-preview.py regenerates the duplicated delivery bundles afterward.
"""
from pathlib import Path
import collections
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SKIP = {'source_refs', 'source_links', 'source_index', 'source_url', 'url', 'doi',
        'review_status', 'source_alignment', 'source_support', 'evidence_map'}
VISIBLE = {'text', 'title', 'prompt', 'explanation', 'feedback', 'objective',
           'solution', 'criterion', 'definition', 'alt_text', 'caption', 'purpose',
           'expected_artifact', 'instructions', 'alt', 'label', 'description'}
LISTS = {'rubric', 'elements', 'columns', 'rows', 'success_criteria'}
PROTECT = re.compile(r'`[^`]*`|«[^»]*»|https?://\S+|\{\{?[^{}]+\}\}?')
WORDS = {
    'می‌توانید':'می‌تونی', 'نمی‌توانید':'نمی‌تونی', 'می‌خواهید':'می‌خوای',
    'می‌توانند':'می‌تونن', 'نمی‌توانند':'نمی‌تونن', 'می‌تواند':'می‌تونه',
    'نمی‌تواند':'نمی‌تونه', 'می‌توانیم':'می‌تونیم', 'نمی‌توانیم':'نمی‌تونیم',
    'می‌توان':'می‌شه', 'نمی‌توان':'نمی‌شه', 'می‌باشد':'هست',
    'می‌شود':'می‌شه', 'نمی‌شود':'نمی‌شه', 'می‌شوند':'می‌شن', 'نمی‌شوند':'نمی‌شن',
    'می‌کند':'می‌کنه', 'نمی‌کند':'نمی‌کنه', 'می‌کنند':'می‌کنن', 'نمی‌کنند':'نمی‌کنن',
    'می‌کنید':'می‌کنی', 'می‌دهید':'می‌دی', 'می‌دانید':'می‌دونی',
    'می‌خواهد':'می‌خواد', 'می‌خواهند':'می‌خوان', 'نمی‌خواهد':'نمی‌خواد',
    'می‌دهد':'می‌ده', 'نمی‌دهد':'نمی‌ده', 'می‌دهند':'می‌دن', 'نمی‌دهند':'نمی‌دن',
    'می‌گیرد':'می‌گیره', 'نمی‌گیرد':'نمی‌گیره', 'می‌گیرند':'می‌گیرن',
    'می‌رود':'می‌ره', 'می‌روند':'می‌رن', 'می‌آید':'میاد', 'می‌آیند':'میان',
    'می‌گوید':'می‌گه', 'می‌گویند':'می‌گن', 'می‌بیند':'می‌بینه', 'می‌بینند':'می‌بینن',
    'می‌آورد':'میاره', 'می‌آورند':'میارن', 'می‌پردازد':'می‌پردازه', 'می‌پردازند':'می‌پردازن',
    'می‌رسد':'می‌رسه', 'می‌رسند':'می‌رسن', 'می‌یابد':'پیدا می‌کنه', 'می‌یابند':'پیدا می‌کنن',
    'می‌گذارد':'می‌ذاره', 'می‌گذارند':'می‌ذارن', 'می‌خواند':'می‌خونه', 'می‌خوانند':'می‌خونن',
    'می‌داند':'می‌دونه', 'می‌دانند':'می‌دونن', 'نمی‌داند':'نمی‌دونه',
    'می‌ماند':'می‌مونه', 'می‌مانند':'می‌مونن', 'می‌سازد':'می‌سازه', 'می‌سازند':'می‌سازن',
    'دارد':'داره', 'ندارد':'نداره', 'دارند':'دارن', 'ندارند':'ندارن',
    'دارید':'داری', 'ندارید':'نداری', 'هستند':'هستن', 'نیستند':'نیستن',
    'باشند':'باشن', 'نباشند':'نباشن', 'باشد':'باشه', 'نباشد':'نباشه',
    'کنید':'کن', 'نکنید':'نکن', 'بنویسید':'بنویس', 'بگویید':'بگو', 'ببینید':'ببین',
    'بپرسید':'بپرس', 'بگیرید':'بگیر', 'بدهید':'بده', 'بگذارید':'بذار',
    'بخوانید':'بخون', 'بشمارید':'بشمار', 'بسازید':'بساز', 'بسنجید':'بسنج',
    'بپذیرید':'بپذیر', 'بخواهید':'بخواه', 'بیابید':'پیدا کن', 'بردارید':'بردار',
    'بخرید':'بخر', 'بفروشید':'بفروش', 'نویسید':'بنویس', 'باشید':'باش',
    'کند':'کنه', 'کنند':'کنن', 'شود':'بشه', 'شوند':'بشن', 'دهد':'بده', 'دهند':'بدن',
    'بگیرد':'بگیره', 'بگیرند':'بگیرن', 'بماند':'بمونه', 'بمانند':'بمونن',
    'بسازد':'بسازه', 'بسازند':'بسازن', 'بسنجد':'بسنجه', 'ببیند':'ببینه', 'کیست':'کیه',
    'شما':'تو', 'خودتان':'خودت', 'جواب‌تان':'جوابت', 'پاسخ‌تان':'پاسخت',
    'را':'رو', 'آن‌ها':'اون‌ها', 'آن':'اون', 'آنان':'اون‌ها',
    'چیست':'چیه', 'چگونه':'چطور', 'نخست':'اول', 'سپس':'بعد',
    'به‌تنهایی':'به‌تنهایی', 'مذکور':'این', 'گاهاً':'گاهی',
}
TOKEN = re.compile(r'(?<![\w\u200c])(' + '|'.join(map(re.escape, sorted(WORDS,key=len,reverse=True))) + r')(?![\w\u200c])')
PERFECT = re.compile(r'(?<![آ-ی\u200c])(شده|کرده|داده|گرفته|رفته|داشته|بوده|آمده|نوشته) است(?![آ-ی\u200c])')
COPULA = re.compile(r'(?<![آ-ی\u200c])([آ-ی][آ-ی\u200c]+) است(?![آ-ی\u200c])')

def _segment(t):
    t=t.replace('ي','ی').replace('ك','ک')
    t=re.sub(r'\b(?:لازم به ذکر است که|شایان ذکر است که)\s*','',t)
    t=t.replace('در راستای','برای').replace('به عمل می‌آورد','انجام می‌ده')
    t=PERFECT.sub(r'\1',t)
    def cop(m):
        w=m[1]
        if w in {'این','آن','اون','همان','چنین','چه','که'}:return w+' هست'
        return w+('‌ست' if w.endswith('ه') else 'ست' if w.endswith(('ا','آ','و')) else 'ه')
    t=COPULA.sub(cop,t)
    t=TOKEN.sub(lambda m:WORDS[m[0]],t)
    t=t.replace(' — ','؛ ').replace(' – ','؛ ')
    return t

def voice(t):
    if not isinstance(t,str) or not re.search('[آ-ی]',t):return t
    # Status already appears in the shared question renderer. Keep the teaching reason.
    t=re.sub(r'^(?:درست|بازبینی):\s*','',t)
    t=re.sub(r'^«[^»]+» پاسخ این پرسش نیست\.\s*(?=\S)','',t)
    t=t.replace('توضیح عمیق‌تر: سازوکار، فرض و پیامد','چرا این روش جواب می‌ده و کجا محدود می‌شه؟')
    t=t.replace('واژگان و صورت‌بندی تخصصی','اصطلاح‌هایی که توی منابع می‌بینی').replace('واژه‌ها و صورت‌بندی تخصصی','اصطلاح‌هایی که توی منابع می‌بینی')
    parts=[];start=0
    for match in PROTECT.finditer(t):
        parts.extend((_segment(t[start:match.start()]),match[0]));start=match.end()
    parts.append(_segment(t[start:]))
    return ''.join(parts)

def walk(value, field='', enabled=False):
    if isinstance(value,dict):
        return {k:(v if k in SKIP or k.startswith('source_') else walk(v,k,enabled or k in LISTS)) for k,v in value.items()}
    if isinstance(value,list):return [walk(x,field,enabled) for x in value]
    if isinstance(value,str) and (field in VISIBLE or enabled):return voice(value)
    return value

def dump(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def main():
    counts=collections.Counter();authored={}
    for path in sorted((ROOT/'content').glob('*/lessons/*.json')):
        data=json.loads(path.read_text(encoding='utf-8'));updated=walk(data)
        if updated!=data:dump(path,updated);counts['lessons_changed']+=1
        authored[updated['id']]=updated
    for path in sorted((ROOT/'content').glob('*/stages/*.json')):
        data=json.loads(path.read_text(encoding='utf-8'))
        # Embedded lessons are delivery copies, regenerated by build-preview.py.
        updated={k:(v if k=='lessons' else walk(v,k)) for k,v in data.items()}
        if updated!=data:dump(path,updated);counts['stages_changed']+=1
    for path in sorted((ROOT/'content').glob('*/final-assessment.json')):
        data=json.loads(path.read_text(encoding='utf-8'));updated=walk(data)
        if updated!=data:dump(path,updated);counts['finals_changed']+=1
    catalog_path=ROOT/'catalog.v1.json';catalog=json.loads(catalog_path.read_text(encoding='utf-8'))
    for course in catalog['courses']:
        course['title']=voice(course['title'])
        for stage in course['stages']:
            stage['title']=voice(stage['title'])
            for node in stage['lessons']:
                if node['id'] in authored:
                    for key in ('title','objective'):node[key]=authored[node['id']][key]
    catalog_path.write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    # Copy-only changes in the review surface: IDs, selectors and logic are untouched.
    editor=ROOT/'editor-preview.js';script=editor.read_text(encoding='utf-8')
    literals=re.compile(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"")
    script=literals.sub(lambda m:json.dumps(voice(m[0][1:-1]),ensure_ascii=False) if re.search('[آ-ی]',m[0]) else m[0],script)
    editor.write_text(script,encoding='utf-8')
    page=ROOT/'curriculum-explorer.html';html=page.read_text(encoding='utf-8');head,sep,tail=html.partition('<script id="catalogData"')
    head=re.sub(r'(?<=>)[^<>]+(?=<)',lambda m:voice(m[0]),head)
    page.write_text(head+sep+tail,encoding='utf-8')
    print(json.dumps(counts))

if __name__=='__main__':main()
