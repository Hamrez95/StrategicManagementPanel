"""Build complete, RTL-safe teaching diagrams and readable mobile variants.

visuals.v1.json is the text source for the 60 concept summaries and two canvases.
The other 26 specialist diagrams retain their original geometry and data.
"""
import html
import json
import math
import re
import xml.etree.ElementTree as ET
from content_voice import ROOT,voice,has_arabic_letters

MEDIA=ROOT/'content/media'; MANIFEST=MEDIA/'visuals.v1.json'; NS={'s':'http://www.w3.org/2000/svg'}
ET.register_namespace('',NS['s'])
PALETTE=[('#e9f0ff','#bdcfee'),('#f0eaff','#cfc0eb'),('#e5f5ec','#b5dcc7'),('#fff0df','#e9cba4')]

def plain(node):return ''.join(node.itertext()) if node is not None else ''

def extract():
    records=[]
    for p in sorted(MEDIA.glob('*.svg')):
        if '.mobile.' in p.name:continue
        svg=ET.parse(p).getroot(); groups=[g for g in svg.findall('s:g',NS) if g.find("s:text[@class='h']",NS) is not None]
        if len(groups)==4:
            desc=plain(svg.find('s:desc',NS));heads=[plain(g.find("s:text[@class='h']",NS)) for g in groups]
            starts=[desc.index(h+':') for h in heads]
            sections=[]
            for i,h in enumerate(heads):
                body=desc[starts[i]+len(h)+1:starts[i+1] if i+1<len(heads) else len(desc)].strip(' ؛')
                # The complete sentence is in desc; old visible lines were truncated.
                sections.append({'title':voice(h),'text':voice(body.replace('.؛','.'))})
            records.append({'asset':p.name,'kind':'concept_summary','title':voice(plain(svg.find('s:title',NS))),
                            'subtitle':voice(desc[:starts[0]].strip()),'sections':sections})
        elif p.name.startswith('business-model-canvas-'):
            blocks=[]
            for g in svg.findall('s:g',NS):
                h=g.find("s:text[@class='heading']",NS)
                if h is None:continue
                prompt=' '.join(plain(t) for t in g.findall("s:text[@class='body']",NS))
                example=' '.join(plain(t) for t in g.findall("s:text[@class='example']",NS))
                blocks.append({'title':plain(h),'prompt':voice(prompt),'text':voice(example or prompt)})
            assert len(blocks)==9,(p.name,len(blocks))
            records.append({'asset':p.name,'kind':'business_model_canvas','title':'بوم مدل کسب‌وکار؛ '+('نمونهٔ فرضی سپهر' if 'sepehr' in p.name else 'الگوی آموزشی ۹ خانه'),
                            'subtitle':'هر خانه یک فرض قابل بررسیه؛ ارتباط خانه‌ها رو با شاهد واقعی بسنج.','sections':blocks})
    assert len(records)==62,len(records)
    MANIFEST.write_text(json.dumps({'schema_version':'1.0','role':'canonical visual teaching text; authored, not copied source artwork','visuals':records},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return records

def wrap(text,width):
    # Conservative weighted wrapping; never drops a word or a final sentence.
    out=[];line='';weight=0
    for word in text.split():
        w=sum(.53 if ch in ' .،؛:!ilI1' else 1 if '\u0600'<=ch<='\u06ff' else .8 for ch in word)+1
        if line and weight+w>width:out.append(line);line='';weight=0
        line+=(' ' if line else '')+word;weight+=w
    if line:out.append(line)
    return out or ['']

def ltr_token(value):
    token=value.rstrip()
    # Parentheses that opened in Persian prose must also close outside the isolate.
    while token.endswith(')') and token.count(')')>token.count('('):token=token[:-1].rstrip()
    return token

def isolated_match(match):
    token=ltr_token(match[0])
    return '\u2066'+token+'\u2069'+match[0][len(token):]

def label(text,x,y,size=24,bold=False,width=None,color='#26364c',lineheight=None,ltr=False):
    lines=wrap(text,width) if width else [text];lh=lineheight or size*1.5
    anchor='start';direction='ltr' if ltr else 'rtl'
    def isolated(line):
        # Keep English terms and formulas in reading order inside an RTL line.
        parts=[];pos=0
        for match in re.finditer(r'[A-Za-z][A-Za-z0-9_₀₁₂₃₄₅₆₇₈₉ .(),=+*/^÷×−√-]*',line):
            token=ltr_token(match[0]);end=match.start()+len(token)
            parts.extend((html.escape(line[pos:match.start()]),'\u2066'+html.escape(token)+'\u2069'));pos=end
        parts.append(html.escape(line[pos:]));return ''.join(parts)
    runs=''.join(f'<tspan x="{x}" dy="{0 if i==0 else lh}">{isolated(s) if not ltr else html.escape(s)}</tspan>' for i,s in enumerate(lines))
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" direction="{direction}" style="direction:{direction};unicode-bidi:isolate;font-size:{size}px;font-weight:{700 if bold else 400};fill:{color}">{runs}</text>',len(lines)*lh

def start(w,h,title,desc):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-labelledby="title desc">',f'<title id="title">{html.escape(title)}</title><desc id="desc">{html.escape(desc)}</desc>',
            '<style>text{font-family:Vazirmatn,Tahoma,Segoe UI,sans-serif}*{box-sizing:border-box}</style>',f'<rect width="{w}" height="{h}" rx="24" fill="#f7f9fc"/>']

def concept(v,mobile=False):
    w=420 if mobile else 1200;pad=24 if mobile else 48;boxw=w-2*pad if mobile else 532
    title,th=label(v['title'],w-pad,48 if mobile else 58,26 if mobile else 36,True,26 if mobile else 58)
    sub,sh=label(v['subtitle'],w-pad,(48 if mobile else 58)+th+8,19 if mobile else 23,width=30 if mobile else 75,color='#526178')
    y=(48 if mobile else 58)+th+sh+42;panels=[];rowheight=0
    for i,s in enumerate(v['sections']):
        lines=wrap(s['text'],29 if mobile else 37);height=max(170 if mobile else 210,92+len(lines)*(31 if mobile else 36))
        if mobile:bx=pad;by=y;y+=height+18
        else:
            if i%2==0:rowheight=max(height,92+len(wrap(v['sections'][i+1]['text'],37))*36,210)
            bx=620 if i%2==0 else 48;by=y
            if i%2==1:y+=rowheight+24
            height=rowheight
        fill,stroke=PALETTE[i%4]
        panels.append(f'<rect x="{bx}" y="{by}" width="{boxw}" height="{height}" rx="20" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>')
        panels.append(label(s['title'],bx+boxw-24,by+40,23 if mobile else 27,True,26 if mobile else 37)[0])
        panels.append(label(s['text'],bx+boxw-24,by+86,20 if mobile else 24,width=29 if mobile else 37,lineheight=31 if mobile else 36)[0])
    footer='خلاصهٔ مفهومی؛ هر بخش رو با مثال و تمرین همون درس بخون.'
    foot,fh=label(footer,w-pad,y+24,16 if mobile else 19,width=34 if mobile else 92,color='#526178')
    parts=start(w,math.ceil(y+fh+50),v['title'],v['subtitle']+' '+'؛ '.join(s['title']+': '+s['text'] for s in v['sections']))
    return ''.join(parts+[title,sub]+panels+[foot,'</svg>'])

ENGLISH=['Key Partners','Key Activities','Key Resources','Value Propositions','Customer Relationships','Channels','Customer Segments','Cost Structure','Revenue Streams']
def canvas(v,mobile=False):
    w=420 if mobile else 1280;parts=[];full=[]
    if mobile:
        title,th=label(v['title'],396,44,26,True,27);sub,sh=label('نسخهٔ خوانای موبایل؛ این ۹ خانه با هم یک مدل می‌سازن.',396,44+th+12,18,width=32,color='#526178');y=44+th+sh+38
        for i in [6,3,5,4,8,1,2,0,7]:
            s=v['sections'][i];lines=wrap(s['text'],29);h=max(170,112+len(lines)*30);fill,stroke=PALETTE[(0 if i<3 else 2 if i==3 else 1 if i<7 else 3)]
            parts.append(f'<rect x="24" y="{y}" width="372" height="{h}" rx="18" fill="{fill}" stroke="{stroke}"/>')
            parts.append(label(s['title'],374,y+36,23,True)[0]);parts.append(label(ENGLISH[i],44,y+65,16,ltr=True,color='#526178')[0]);parts.append(label(s['text'],374,y+103,20,width=29,lineheight=30)[0]);y+=h+16
        foot,fh=label('نمونهٔ فرضی، شاهد بازار نیست. فرض‌ها و نتیجهٔ آزمون رو جدا ثبت کن.',396,y+18,16,width=32,color='#526178')
        return ''.join(start(w,math.ceil(y+fh+40),v['title'],v['subtitle'])+[title,sub]+parts+[foot,'</svg>'])
    y0=150;large=572;small=278;bottom=746
    positions=[(32,y0,232,large),(280,y0,232,small),(280,y0+294,232,small),(528,y0,232,large),(776,y0,232,small),(776,y0+294,232,small),(1024,y0,224,large),(32,bottom,600,206),(648,bottom,600,206)]
    for i,(s,(x,y,bw,bh)) in enumerate(zip(v['sections'],positions)):
        fill,stroke=PALETTE[(0 if i<3 else 2 if i==3 else 1 if i<7 else 3)];parts.append(f'<rect x="{x}" y="{y}" width="{bw}" height="{bh}" rx="20" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>')
        parts.append(label(s['title'],x+bw-16,y+36,23,True,width=22 if bw<300 else 54)[0]);parts.append(label(ENGLISH[i],x+16,y+68,16,ltr=True,color='#526178')[0]);parts.append(label(s['text'],x+bw-18,y+108,21,width=18 if bw<300 else 48,lineheight=32)[0])
    title=label(v['title'],1248,54,34,True)[0];sub=label(v['subtitle'],1248,100,22,width=86,color='#526178')[0];foot=label('طرح تألیفی بر پایهٔ ۹ جزء بوم؛ عددها و مثال سپهر فرضی‌اند. برای هر خانه منبع، فرض و آزمون رو ثبت کن.',1248,995,19,width=105,color='#526178')[0]
    return ''.join(start(w,1040,v['title'],v['subtitle']+' '+'؛ '.join(s['title']+': '+s['text'] for s in v['sections']))+[title,sub]+parts+[foot,'</svg>'])

def repair_specialist(path):
    tree=ET.parse(path);svg=tree.getroot()
    for style in svg.findall('s:style',NS):
        if style.text:style.text=style.text.replace('unicode-bidi:plaintext','unicode-bidi:isolate').replace('IRANSans,Segoe','Tahoma,Segoe')
    for text in svg.findall('.//s:text',NS):
        value=plain(text);rtl=has_arabic_letters(value);old_anchor=text.get('text-anchor')
        if not rtl and text.get('direction')=='rtl' and old_anchor=='start':text.set('text-anchor','end')
        if rtl and old_anchor=='end':text.set('text-anchor','start')
        direction='rtl' if rtl else 'ltr';text.set('direction',direction)
        inline=re.sub(r'(?:^|;)(?:direction|unicode-bidi):[^;]*','',text.get('style','')).strip(';')
        text.set('style',(inline+';' if inline else '')+f'direction:{direction};unicode-bidi:isolate')
        if text.text:text.text=voice(text.text)
        for tspan in text.findall('s:tspan',NS):
            if tspan.text:tspan.text=voice(tspan.text)
    # A leading LTR child span changes SVG chunk anchoring in Chromium.
    # Unicode isolates keep the parent chunk's RTL anchor and isolate only the run.
    for parent in list(svg.iter()):
        for child in list(parent):
            if child.tag!=f'{{{NS["s"]}}}tspan' or child.get('direction')!='ltr' or any(child.get(k) is not None for k in ('x','y','dy')):continue
            chunk='\u2066'+plain(child)+'\u2069'+(child.tail or '')
            index=list(parent).index(child)
            if index:previous=list(parent)[index-1];previous.tail=(previous.tail or '')+chunk
            else:parent.text=(parent.text or '')+chunk
            parent.remove(child)
    for node in list(svg.iter()):
        if node.tag not in {f'{{{NS["s"]}}}text',f'{{{NS["s"]}}}tspan'} or list(node):continue
        value=re.sub('[\u2066-\u2069]','',node.text or '')
        if not (has_arabic_letters(value) and re.search('[A-Za-z]',value)):continue
        node.text=re.sub(r'[A-Za-z][A-Za-z0-9_₀₁₂₃₄₅₆₇₈₉ .(),=+*/^÷×−√-]*',isolated_match,value)
    for meta in ('title','desc'):
        node=svg.find('s:'+meta,NS)
        if node is not None and node.text:node.text=voice(node.text)
    tree.write(path,encoding='unicode',xml_declaration=False)

def main():
    records=json.loads(MANIFEST.read_text(encoding='utf-8'))['visuals'] if MANIFEST.exists() else extract()
    for v in records:
        for key in ('title','subtitle'):
            if key in v:v[key]=voice(v[key])
        for section in v['sections']:
            for key in ('title','text','prompt'):
                if key in section:section[key]=voice(section[key])
    MANIFEST.write_text(json.dumps({'schema_version':'1.0','role':'canonical authored visual text','visuals':records},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    generated=set()
    for v in records:
        builder=canvas if v['kind']=='business_model_canvas' else concept
        (MEDIA/v['asset']).write_text(builder(v),encoding='utf-8')
        (MEDIA/v['asset'].replace('.svg','.mobile.svg')).write_text(builder(v,True),encoding='utf-8');generated.add(v['asset'])
    for p in MEDIA.glob('*.svg'):
        if p.name not in generated and '.mobile.' not in p.name:repair_specialist(p)
    # Embed a text-only font subset so standalone SVG images use the central content font.
    from visual_typography import embed_fonts
    embed_fonts(MEDIA)
    updated=0
    for p in (ROOT/'content').glob('*/lessons/*.json'):
        l=json.loads(p.read_text(encoding='utf-8'));mp=l.get('media_plan')
        if not isinstance(mp,dict) or not mp.get('assets'):continue
        # Teach first; place the diagram next to the lesson's visual card or summary.
        cards=l['learning_cards'];target=next((c for c in cards if c.get('type')=='authored_diagram'),None)
        if not target:target=next((c for c in reversed(cards) if c.get('type')=='summary'),cards[-1])
        mp['display_on_card_id']=target['id']
        for asset in mp['assets']:
            ref=asset['asset_ref'];name=ref.split('/')[-1]
            svg=ET.parse(ROOT/ref).getroot();title=plain(svg.find('s:title',NS));desc=plain(svg.find('s:desc',NS))
            asset['long_description']=desc;asset['alt_text']=title+'؛ '+('خلاصهٔ تصویری مفاهیم مرحله' if name in generated and not name.startswith('business-model') else 'شکل آموزشی؛ توضیح و فرض‌ها در کپشن و متن درس اومده')
            mobile=ref.replace('.svg','.mobile.svg')
            if (ROOT/mobile).exists():asset['mobile_asset_ref']=mobile
            else:
                asset['mobile_display']='horizontal_scroll_preserve_axes'
                asset['desktop_width_px']=int(float(svg.get('viewBox').split()[2]))
            if name in generated and not name.startswith('business-model'):asset['caption']='خلاصهٔ مرحله: '+title+'. بخش مرتبط با این درس رو با مثال و تمرینش دنبال کن.'
        (p).write_text(json.dumps(l,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');updated+=1
    print(json.dumps({'visual_sources':len(records),'mobile_variants':len(records),'specialist_diagrams':88-len(records),'lesson_media_placements':updated}))

if __name__=='__main__':main()
