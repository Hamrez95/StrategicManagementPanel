"""Embed only glyphs used by a diagram; font selection comes from the shared CSS."""
import base64
import io
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[3]
NS = 'http://www.w3.org/2000/svg'

def embed_fonts(media):
    config = (ROOT / 'public/typography/typography.css').read_text(encoding='utf-8')
    family = re.search(r'--font-content:\s*([^,;}]+)', config)[1].strip(' \"\'')
    faces = re.findall(r'@font-face\{([^}]+)\}', config)
    for path in sorted(media.glob('*.svg')):
        tree = ET.parse(path); svg = tree.getroot()
        for old in list(svg):
            if old.get('id') == 'content-font': svg.remove(old)
        text = ''.join(''.join(t.itertext()) for t in svg.iter('{'+NS+'}text'))
        rules = []
        for face in faces:
            if not re.search(r'font-family:\s*'+re.escape(family)+r'\s*;', face): continue
            relative = re.search(r"url\(['\"]?([^)'\"]+)", face)[1]
            weight = re.search(r'font-weight:([^;]+)', face)[1]
            font = TTFont(ROOT/'public/typography'/relative)
            options = subset.Options(); options.flavor = 'woff2'; options.recalc_timestamp = False; options.drop_tables.append('FFTM')
            sub = subset.Subsetter(options=options); sub.populate(text=text); sub.subset(font)
            stream = io.BytesIO(); font.flavor = 'woff2'; font.save(stream)
            encoded = base64.b64encode(stream.getvalue()).decode('ascii')
            rules.append(f'@font-face{{font-family:"{family}";font-weight:{weight};src:url(data:font/woff2;base64,{encoded}) format("woff2")}}')
        style = ET.Element('{'+NS+'}style', {'id':'content-font'})
        style.text = ''.join(rules)+f'text{{font-family:"{family}",Tahoma,sans-serif!important}}'
        svg.append(style)
        tree.write(path,encoding='unicode')
