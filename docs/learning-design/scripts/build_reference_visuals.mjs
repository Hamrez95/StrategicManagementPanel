// Offline build: publisher originals are checked in, with provenance in the registry.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const media = fileURLToPath(new URL('../content/media/', import.meta.url));
const escape = (s) =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const text = (x, y, s, size = 23, anchor = 'middle') =>
  `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}">${escape(s)}</text>`;
const rect = (x, y, w, h, fill = '#fff') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="#222" stroke-width="2"/>`;
const box = (x, y, w, h, lines, fill = '#fff') =>
  rect(x, y, w, h, fill) +
  lines.map((s, i) => text(x + w / 2, y + h / 2 - (lines.length - 1) * 16 + i * 32, s)).join('');
const arrow = (x1, y1, x2, y2) =>
  `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="#333" stroke-width="3" marker-end="url(#arrow)"/>`;
const figures = {};
function diagram(id, title, body, footer) {
  figures[id] =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 720" role="img"><title>${escape(title)}</title><desc>${escape(footer)}</desc><defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#333"/></marker></defs><rect width="1100" height="720" fill="white"/><g font-family="Arial, sans-serif" fill="#171717">${text(550, 54, title, 32)}${body}${text(550, 678, footer, 17)}${text(550, 705, 'Independent educational drawing by Stratino. Not publisher artwork. CC BY 4.0.', 14)}</g></svg>`;
}
diagram(
  'ansoff',
  'Ansoff Product–Market Matrix',
  text(650, 112, 'PRODUCTS', 24) +
    text(430, 160, 'Existing') +
    text(840, 160, 'New') +
    text(90, 365, 'MARKETS', 22) +
    text(185, 300, 'Existing', 20) +
    text(185, 510, 'New', 20) +
    box(230, 185, 410, 200, ['Market penetration']) +
    box(640, 185, 410, 200, ['Product development']) +
    box(230, 385, 410, 200, ['Market development']) +
    box(640, 385, 410, 200, ['Diversification']),
  'Product and market newness are relative to the business and decision scope.',
);
diagram(
  'tows',
  'TOWS Matrix',
  box(280, 125, 360, 100, ['Strengths (S)'], '#edf3f6') +
    box(640, 125, 360, 100, ['Weaknesses (W)'], '#edf3f6') +
    box(40, 225, 240, 170, ['Opportunities (O)'], '#edf3f6') +
    box(40, 395, 240, 170, ['Threats (T)'], '#edf3f6') +
    box(280, 225, 360, 170, ['SO', 'Use strengths', 'to pursue opportunities']) +
    box(640, 225, 360, 170, ['WO', 'Address weaknesses', 'to pursue opportunities']) +
    box(280, 395, 360, 170, ['ST', 'Use strengths', 'to reduce threats']) +
    box(640, 395, 360, 170, ['WT', 'Reduce weaknesses', 'and exposure to threats']),
  'Heinz Weihrich (1982). Combinations generate options; they do not rank them.',
);
let ge =
  text(655, 115, 'BUSINESS UNIT COMPETITIVE STRENGTH', 22) +
  text(400, 155, 'High') +
  text(650, 155, 'Medium') +
  text(900, 155, 'Low') +
  text(140, 125, 'INDUSTRY', 19) +
  text(140, 152, 'ATTRACTIVENESS', 19);
for (let r = 0; r < 3; r++) {
  ge += text(150, 245 + r * 145, ['High', 'Medium', 'Low'][r], 21);
  for (let c = 0; c < 3; c++) {
    const band = r + c;
    ge += box(
      275 + c * 250,
      180 + r * 145,
      250,
      145,
      band < 2 ? ['Invest / grow'] : band === 2 ? ['Selectivity / earnings'] : ['Harvest / divest'],
      band < 2 ? '#e1f0e7' : band === 2 ? '#fff2c9' : '#f3e1df',
    );
  }
}
diagram(
  'ge',
  'GE–McKinsey Nine-Box Matrix',
  ge,
  'Direction is a starting point for judgment, not an automatic investment decision.',
);
let bsc = box(380, 300, 340, 100, ['Vision and strategy'], '#edf3f6');
for (const [x, y, label] of [
  [380, 100, 'Financial'],
  [20, 300, 'Customer'],
  [740, 300, 'Internal processes'],
  [380, 500, 'Learning and growth'],
])
  bsc += box(x, y, 340, 100, [label]);
bsc +=
  arrow(550, 300, 550, 205) +
  arrow(380, 350, 365, 350) +
  arrow(720, 350, 735, 350) +
  arrow(550, 400, 550, 495);
diagram(
  'bsc',
  'Balanced Scorecard: Four Perspectives',
  bsc,
  'Kaplan and Norton. Links between measures remain hypotheses to examine.',
);
let raci = box(50, 115, 260, 70, ['Deliverable'], '#edf3f6');
['Role 1', 'Role 2', 'Role 3', 'Role 4'].forEach(
  (s, i) => (raci += box(310 + i * 185, 115, 185, 70, [s], '#edf3f6')),
);
['Deliverable 1', 'Deliverable 2', 'Deliverable 3'].forEach((s, i) => {
  raci += box(50, 185 + i * 95, 260, 95, [s]);
  ['', '', '', ''].forEach((_, j) => (raci += box(310 + j * 185, 185 + i * 95, 185, 95, ['—'])));
});
['R — Responsible', 'A — Accountable', 'C — Consulted', 'I — Informed'].forEach(
  (s, i) => (raci += text(i % 2 ? 800 : 300, 540 + Math.floor(i / 2) * 45, s, 24)),
);
diagram(
  'raci',
  'RACI Responsibility Assignment Matrix',
  raci,
  'Blank format: assign roles to actual deliverables; usually one A per row.',
);
let fish = arrow(60, 350, 890, 350) + box(890, 300, 180, 100, ['Problem', 'or effect']);
for (const [i, name] of [
  'People',
  'Methods',
  'Machines',
  'Materials',
  'Measurement',
  'Environment',
].entries()) {
  const top = i < 3;
  const x = 120 + (i % 3) * 250;
  const y = top ? 155 : 550;
  fish +=
    text(x + 60, top ? 130 : 590, name, 22) +
    `<path d="M${x} ${y}L${x + 130} 350M${x + 32} ${top ? 203 : 500}h-48M${x + 77} ${top ? 270 : 430}h-48" fill="none" stroke="#333" stroke-width="3"/>`;
}
diagram(
  'fishbone',
  'Ishikawa Cause-and-Effect (Fishbone) Diagram',
  fish,
  'Example category headings; branches contain possible causes, not proven causes.',
);
let pareto =
  arrow(120, 580, 990, 580) +
  arrow(120, 580, 120, 130) +
  arrow(990, 580, 990, 130) +
  text(130, 110, 'Count', 22) +
  text(940, 110, 'Cumulative %', 22);
let sum = 0;
const points = [];
[40, 25, 15, 12, 8].forEach((value, i) => {
  const x = 220 + i * 155;
  sum += value;
  pareto +=
    rect(x - 45, 580 - value * 4.2, 90, value * 4.2, '#dce8ef') +
    text(x, 615, String.fromCharCode(65 + i)) +
    text(x, 565 - value * 4.2, String(value), 20);
  points.push([x, 580 - sum * 4.2]);
});
pareto +=
  `<polyline points="${points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#a63232" stroke-width="4"/>` +
  points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="#a63232"/>`).join('');
[0, 50, 100].forEach((n) => {
  pareto += text(1020, 587 - n * 4.2, `${n}%`, 18) + text(90, 587 - n * 4.2, String(n), 18);
});
diagram(
  'pareto',
  'Pareto Chart',
  pareto,
  'Illustrative data only: 40, 25, 15, 12, 8. The distribution is not a universal 80/20 rule.',
);
let pdsa =
  box(370, 110, 360, 100, ['Plan']) +
  box(730, 300, 300, 100, ['Do']) +
  box(370, 490, 360, 100, ['Study']) +
  box(60, 300, 300, 100, ['Act']);
pdsa +=
  arrow(730, 160, 875, 295) +
  arrow(875, 400, 735, 530) +
  arrow(370, 535, 215, 405) +
  arrow(215, 300, 365, 165) +
  text(550, 345, 'Test and learn', 26) +
  text(550, 383, 'Repeat in context', 22);
diagram(
  'pdsa',
  'Plan–Do–Study–Act (PDSA)',
  pdsa,
  'The lesson uses Study, not Check. Preserve the distinction from PDCA.',
);
let qspm =
  box(40, 140, 290, 110, ['Key factors'], '#edf3f6') +
  box(330, 140, 130, 110, ['Weight'], '#edf3f6');
for (let i = 0; i < 2; i++) {
  qspm += box(460 + i * 290, 140, 290, 55, [`Strategy ${i + 1}`], '#edf3f6');
  qspm +=
    box(460 + i * 290, 195, 145, 55, ['AS'], '#edf3f6') +
    box(605 + i * 290, 195, 145, 55, ['TAS'], '#edf3f6');
}
['External factors', 'Internal factors', 'Total'].forEach((name, i) => {
  qspm += box(40, 250 + i * 95, 290, 95, [name]);
  [130, 145, 145, 145, 145].reduce((x, w) => {
    qspm += box(x, 250 + i * 95, w, 95, ['—']);
    return x + w;
  }, 330);
});
qspm += text(550, 605, 'TAS = Weight × Attractiveness Score (AS)', 24);
diagram(
  'qspm',
  'Quantitative Strategic Planning Matrix (QSPM)',
  qspm,
  'Blank structure; ratings are judgments. Scores do not replace evidence or constraints.',
);
for (const [id, svg] of Object.entries(figures))
  await writeFile(`${media}reference-${id}-standard.svg`, svg + '\n');

const base = 'https://openstax.org/books/principles-management/pages/';
const cc4 = 'https://creativecommons.org/licenses/by/4.0/';
const cc3 = 'https://creativecommons.org/licenses/by-sa/3.0/';
const originals = [
  [
    'swot',
    'SWOT',
    '8-2-using-swot-for-strategic-analysis',
    '8.3',
    'bb3ced59267c57b88073eba0fe790b69bc7f6a9b',
  ],
  [
    'pestel',
    'PESTEL',
    '8-3-a-firms-external-macro-environment-pestel',
    '8.5',
    'e013bf3774732ea44fecae6c2c8a6632cfc8479e',
  ],
  [
    'five-forces',
    'Porter’s Five Forces',
    '8-4-a-firms-micro-environment-porters-five-forces',
    '8.6',
    'a6c7979aeaa6911fcdcd7ff4325f57c38c32a063',
  ],
  [
    'value-chain',
    'Value Chain',
    '8-5-the-internal-environment',
    '8.8',
    '94e2626b25b3175a2e196ff2a2abf09d3e67abf7',
  ],
  [
    'vrio',
    'VRIO',
    '8-5-the-internal-environment',
    '8.9',
    '804d538e384a5d25f36f3c57e1216a78bd4f9d27',
  ],
  [
    'bcg',
    'BCG Growth–Share Matrix',
    '9-4-strategic-objectives-and-levels-of-strategy',
    '9.7',
    '5f643c0fc79bb78827c7b227052ac5977e9cc57c',
  ],
].map(([id, title, slug, figure, hash]) => ({
  id,
  title,
  kind: 'publisher_original',
  asset_ref: `content/media/reference-${id}-openstax.png`,
  creator: 'Rice University / OpenStax',
  source_url: base + slug,
  original_url: `https://openstax.org/apps/archive/20260604.144757/resources/${hash}`,
  locator: `Principles of Management, Exhibit ${figure}`,
  license: 'CC BY 4.0',
  license_url: cc4,
  changes: 'بدون تغییر در تصویر ناشر.',
  alt_text: `شکل مرجع ${title} در کتاب Principles of Management، شکل ${figure}.`,
  caption:
    id === 'value-chain'
      ? 'این شکل کتاب، مثال زنجیرهٔ ارزش Walmart رو نشون می‌ده؛ بخش‌های پشتیبان بالا و فعالیت‌های اصلی پایین قرار دارن.'
      : id === 'bcg'
        ? 'در این شکل کتاب، سهم بازار از چپ به راست زیاد می‌شه؛ بعضی نسخه‌ها جهت برعکس دارن. برچسب خانه‌ها به‌تنهایی حکم سرمایه‌گذاری یا واگذاری نیست.'
        : 'شکل منتشرشده در کتاب رو کنار توضیح فارسی درس ببین؛ برچسب‌های اصلی تصویر حفظ شده‌اند.',
}));
const visuals = [
  {
    id: 'bmc',
    title: 'Business Model Canvas',
    kind: 'publisher_original',
    asset_ref: 'content/media/reference-bmc-strategyzer.png',
    download_ref: 'content/media/reference-bmc-strategyzer.pdf',
    creator: 'Strategyzer AG',
    source_url: 'https://www.strategyzer.com/library/the-business-model-canvas',
    original_url: 'https://assets.strategyzer.com/assets/resources/the-business-model-canvas.pdf',
    locator: 'Official one-page template',
    license: 'CC BY-SA 3.0',
    license_url: cc3,
    changes: 'فقط تبدیل صفحهٔ کامل PDF به PNG؛ بدون برش، ترجمه یا تغییر چیدمان.',
    alt_text: 'نسخهٔ رسمی Business Model Canvas با چیدمان اصلی ۹ بلوک، آیکن‌ها و نام‌های انگلیسی.',
    caption:
      'این نسخهٔ رسمی بومه. جای ۹ بلوک و نام‌های انگلیسی‌شون رو ببین؛ تصویر فارسی و مثال درس هم سر جاشون هستن.',
  },
  ...originals,
  {
    id: 'lean',
    title: 'Lean Canvas',
    kind: 'publisher_original',
    asset_ref: 'content/media/reference-lean-canvas-maurya.png',
    creator: 'Ash Maurya',
    source_url: 'https://commons.wikimedia.org/wiki/File:Lean_Canvas.png',
    original_url: 'https://upload.wikimedia.org/wikipedia/commons/2/22/Lean_Canvas.png',
    locator: 'Lean Canvas, 2010; file published 2013',
    license: 'CC BY-SA 3.0',
    license_url: cc3,
    changes: 'بدون تغییر در فایل تصویر؛ نسخهٔ تاریخی منتشرشده با نام Ash Maurya.',
    alt_text: 'Lean Canvas اثر Ash Maurya با چیدمان ۹ بخش و برچسب‌های انگلیسی.',
    caption:
      'این نسخهٔ منتشرشدهٔ Lean Canvas رو با Business Model Canvas مقایسه کن؛ جای بعضی بلوک‌ها و هدفشون فرق داره.',
  },
];
const standards = {
  ansoff: [
    'Ansoff Matrix',
    'https://www.aqa.org.uk/resources/business/as-and-a-level/business-7131-7132/teach/teaching-guide-ansoff-matrix-model',
    'AQA teaching guide; H. Igor Ansoff framework',
    'محصول فعلی یا جدید رو در ستون‌ها و بازار فعلی یا جدید رو در ردیف‌ها دنبال کن.',
  ],
  tows: [
    'TOWS Matrix',
    'https://doi.org/10.1016/0024-6301(82)90120-0',
    'Heinz Weihrich, Long Range Planning 15(2), 1982, pp. 54–66',
    'چهار ترکیب SO، WO، ST و WT رو ببین؛ این ترکیب‌ها گزینه می‌سازن و به‌تنهایی اولویت رو تعیین نمی‌کنن.',
  ],
  ge: [
    'GE–McKinsey Nine-Box Matrix',
    'https://www.mckinsey.com/capabilities/strategy-and-corporate-finance/our-insights/enduring-ideas-the-ge-and-mckinsey-nine-box-matrix',
    'McKinsey, Enduring Ideas, 2008',
    'قدرت رقابتی در محور افقی و جذابیت صنعت در محور عمودی قرار داره؛ جهت‌ها پیشنهاد بررسی‌اند، نه حکم سرمایه‌گذاری.',
  ],
  bsc: [
    'Balanced Scorecard',
    'https://www.ifm.eng.cam.ac.uk/research/dstools/balanced-scorecard/',
    'Cambridge IfM; Kaplan and Norton, 1992',
    'چهار منظر کلاسیک به استراتژی وصل می‌شن. این ارتباط‌ها به‌تنهایی رابطهٔ علت‌ومعلولی رو ثابت نمی‌کنن.',
  ],
  raci: [
    'RACI Matrix',
    'https://www.pmi.org/learning/library/best-practices-managing-people-quality-management-7012',
    'PMI, Roles, responsibilities, and resources',
    'ردیف‌ها تحویل‌دادنی و ستون‌ها نقش‌اند. جدول خالیه تا ساختار R، A، C و I رو ببینی.',
  ],
  fishbone: [
    'Ishikawa / Fishbone Diagram',
    'https://asq.org/quality-resources/fishbone',
    'ASQ, Fishbone diagram procedure',
    'شاخه‌ها دسته‌های علت احتمالی‌اند. این دسته‌بندی نمونه‌ست و علت قطعی رو ثابت نمی‌کنه.',
  ],
  pareto: [
    'Pareto Chart',
    'https://asq.org/quality-resources/pareto',
    'ASQ, Pareto chart procedure',
    'داده‌های این شکل فرضی‌اند: ۴۰، ۲۵، ۱۵، ۱۲ و ۸. ستون‌ها نزولی‌اند و خط، درصد تجمعی رو نشون می‌ده.',
  ],
  pdsa: [
    'PDSA Cycle',
    'https://www.ihi.org/library/model-for-improvement/testing-changes',
    'IHI, Model for Improvement: Testing Changes',
    'در این درس مرحلهٔ سوم Study است؛ چرخهٔ PDSA رو با PDCA و مرحلهٔ Check یکی نگیر.',
  ],
  qspm: [
    'QSPM',
    'https://www.strategyclub.com/free-student-template/',
    'Fred R. David, Forest R. David, Meredith E. David; Strategy Club template',
    'این قالب خالیه: هر گزینه ستون AS و TAS داره. امتیاز جذابیت کل از ضرب وزن در AS به دست میاد.',
  ],
};
for (const [id, [title, source_url, locator, caption]] of Object.entries(standards))
  visuals.push({
    id,
    title,
    kind: 'standard_redraw',
    asset_ref: `content/media/reference-${id}-standard.svg`,
    creator: 'Stratino',
    source_url,
    locator,
    license: 'CC BY 4.0',
    license_url: cc4,
    changes: 'بازترسیم مستقلِ ساختار شناخته‌شده؛ تصویر اصلی ناشر نیست.',
    alt_text: `ساختار متداول ${title}؛ ${caption}`,
    caption,
  });
visuals.push(
  {
    id: 'ie',
    title: 'Internal–External (IE) Matrix',
    kind: 'source_link',
    creator: 'David / Strategy Club',
    source_url: 'https://www.strategyclub.com/free-student-template/',
    locator: 'Official strategic planning template',
    caption: 'قالب مرجع رو در سایت نویسندگان ببین؛ محور افقی IFE و محور عمودی EFE است.',
  },
  {
    id: 'vpc',
    title: 'Value Proposition Canvas',
    kind: 'source_link',
    creator: 'Strategyzer AG',
    source_url: 'https://www.strategyzer.com/library/the-value-proposition-canvas',
    locator: 'Official template',
    caption:
      'شکل رسمی بوم ارزش پیشنهادی رو در سایت سازنده ببین؛ پروفایل مشتری و نقشهٔ ارزش رو کنار هم قرار می‌ده.',
  },
);
const targets = {
  bmc: [
    'E02-ST02-L04-CARD07',
    'S01-C3-ST01-L02-CARD01',
    'S06-C2-ST01-L01-CARD02',
    'S06-C2-ST01-L02-CARD02',
  ],
  lean: ['S06-C2-ST01-L02-CARD01'],
  swot: ['C07-ST04-L01-DEEP'],
  tows: ['C07-ST04-L01-DEEP'],
  pestel: ['C07-ST02-L02-DEEP'],
  'five-forces': ['C02-ST03-L01-TERMS', 'C07-ST02-L03-CARD01', 'S01-C1-ST01-L02-CARD02'],
  vrio: ['C07-ST03-L02-DEEP', 'S01-C1-ST02-L02-CARD01'],
  'value-chain': ['C07-ST03-L03-CARD01', 'S01-C1-ST02-L03-CARD01'],
  ansoff: ['C07-ST04-L02-CARD01'],
  bcg: ['C07-ST04-L03-DEEP', 'S01-C2-ST01-L03-CARD01', 'S01-C2-ST01-L04-CARD09'],
  ge: ['S01-C2-ST01-L04-CARD01'],
  bsc: ['C07-ST05-L03-CARD01', 'S01-C2-ST03-L04-CARD05', 'S01-C4-ST02-L04-CARD01'],
  raci: ['C07-ST05-L02-DEEP', 'S01-C4-ST03-L02-CARD02', 'S04-C1-ST01-L03-CARD04'],
  fishbone: ['S05-C1-ST02-L02-CARD04'],
  pareto: ['S05-C1-ST02-L02-CARD03', 'S05-C1-ST02-L04-CARD07'],
  pdsa: ['S05-C1-ST02-L03-CARD03'],
  qspm: ['S01-C4-ST02-L01-CARD02'],
  ie: ['S01-C1-ST03-L03-CARD02'],
  vpc: ['S03-C1-ST03-L01-CARD01'],
};
const placements = Object.entries(targets).flatMap(([visual_id, cards]) =>
  cards.map((card_id) => ({
    lesson_id: card_id.split(/-(?:CARD|OPEN|TERMS|DEEP)/)[0],
    card_id,
    visual_id,
  })),
);
for (const v of visuals)
  if (v.asset_ref) {
    v.sha256 = createHash('sha256')
      .update(await readFile(media + v.asset_ref.split('/').at(-1)))
      .digest('hex');
  }
const registry = {
  schema_version: '1.0',
  checked_at: '2026-10-22',
  scope:
    'Reference figures supplement existing approved lessons; no teaching text or answers replaced.',
  visuals,
  placements,
  followups: [
    {
      visual_id: 'ie',
      status: 'content_review_required',
      reason:
        'S01-C1-ST03-L03-CARD04 table groups differ from conventional David I–IX bands. Existing content preserved; no conflicting diagram introduced. Reconcile the table with the author template before embedding.',
    },
    {
      visual_id: 'vpc',
      status: 'publisher_permission_required',
      reason:
        'Strategyzer explicitly requires permission for VPC inclusion in software. Official page linked; no VPC image copied or adapted.',
      evidence: 'https://www.strategyzer.com/legal/usage-of-our-tools',
    },
    {
      visual_id: 'tows',
      status: 'publisher_full_text_unavailable',
      reason:
        'Publisher returned 403 during verification. DOI and known SO/WO/ST/WT structure recorded; drawing is independent, not a copied publisher image.',
    },
  ],
};
await writeFile(media + 'reference-visuals.v1.json', JSON.stringify(registry, null, 2) + '\n');
console.log(
  `Reference figures: ${visuals.length} models, ${placements.length} placements, ${visuals.filter((v) => v.kind === 'publisher_original').length} publisher/author originals.`,
);
