"""Export translation units from canonical content without changing IDs or answer keys.

Object IDs form stable paths. Unkeyed lists use indexes and require source-hash checks.
Each unit retains a JSON pointer so a future importer can apply reviewed translations.
"""
import hashlib
import json
from pathlib import Path
from content_voice import ROOT, VISIBLE, SKIP, LISTS

OUT = ROOT/'localization'

def digest(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True).encode()).hexdigest()

def units(obj, stable='', pointer='', enabled=False):
    if isinstance(obj,dict):
        for key,value in obj.items():
            if key in SKIP or key.startswith('source_') or key in {'asset_ref','mobile_asset_ref'}:continue
            yield from units(value,stable+'/'+key,pointer+'/'+key,enabled or key in LISTS or key in VISIBLE)
    elif isinstance(obj,list):
        for i,value in enumerate(obj):
            anchor=value['id'] if isinstance(value,dict) and 'id' in value else str(i)
            yield from units(value,stable+'/'+anchor,pointer+'/'+str(i),enabled)
    elif isinstance(obj,str) and enabled and obj.strip():
        yield stable,{'pointer':pointer,'text':obj,'source_hash':digest(obj)}

def export():
    (OUT/'fa-IR').mkdir(parents=True,exist_ok=True);(OUT/'en').mkdir(exist_ok=True)
    files=sorted((ROOT/'content').glob('*/lessons/*.json'))+sorted((ROOT/'content').glob('*/stages/*.json'))+sorted((ROOT/'content').glob('*/final-assessment.json'))
    groups={};total=0
    for path in files:
        document=json.loads(path.read_text(encoding='utf-8'))
        if path.parent.name=='stages':document={k:v for k,v in document.items() if k!='lessons'}
        course=path.relative_to(ROOT/'content').parts[0];entry=path.relative_to(ROOT).as_posix()
        group=groups.setdefault(course,{})
        # Full source revision protects index-based table/rubric units against reordering.
        group[entry]={'source_revision':digest(document),'messages':dict(units(document))}
        total+=len(group[entry]['messages'])
    for name,obj in [('catalog',json.loads((ROOT/'catalog.v1.json').read_text(encoding='utf-8'))),('visuals',json.loads((ROOT/'content/media/visuals.v1.json').read_text(encoding='utf-8')))]:
        if name=='catalog':obj={k:v for k,v in obj.items() if k in {'paths','courses'}}
        groups[name]={name:{'source_revision':digest(obj),'messages':dict(units(obj))}}
    for name,documents in groups.items():
        path=OUT/'fa-IR'/f'{name}.json';path.write_text(json.dumps({'locale':'fa-IR','documents':documents},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        # Never overwrite a translator's work on regeneration.
        target=OUT/'en'/f'{name}.json'
        if not target.exists():target.write_text(json.dumps({'locale':'en','documents':{}},indent=2)+'\n',encoding='utf-8')
    manifest={'schema_version':'1.0','source_locale':'fa-IR','fallback_locale':'fa-IR','locales':{'fa-IR':{'direction':'rtl','status':'source'},'en':{'direction':'ltr','status':'not_translated'}},'groups':sorted(groups),'lesson_and_assessment_units':total,'apply_policy':'Whole-document source_revision must match. Apply translated messages only by exported pointer; reject ID/answer/formula/source changes. Render missing document in source language and direction.'}
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'groups':len(groups),'lesson_and_assessment_units':total}))

if __name__=='__main__':export()
