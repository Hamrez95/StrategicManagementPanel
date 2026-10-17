import fs from 'node:fs';
import path from 'node:path';
import { frameworkFa, inputFa } from './design-research-fa.mjs';
const root = 'assets/management-knowledge';
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
function find(value, id) {
  if (!value || typeof value !== 'object') return null;
  if (value.id === id) return value;
  for (const child of Object.values(value)) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}
const catalog = read('catalog.json');
const sourceAliases = read('sources/source-aliases.json').aliases;
const labels = {
  'MET-ACTIVATION-RATE': 'نرخ فعال‌سازی',
  'MET-COHORT-RETENTION': 'حفظ مشتری در کوهورت',
  'MET-DELIVERY-ONTIME': 'تحویل به‌موقع',
  'MET-INVENTORY-TURNOVER': 'گردش موجودی',
  'MET-SALES-CYCLE': 'چرخهٔ فروش',
  'MET-WIN-RATE': 'نرخ برد فروش',
  'MET-DEFECT-RATE': 'نرخ واحدهای نامنطبق',
  'MET-THROUGHPUT': 'نرخ خروجی پذیرفته‌شده',
};
const entries = catalog.records
  .filter((x) => ['frameworks', 'metrics'].includes(x.kind))
  .map((item) => {
    const r = find(read(item.path), item.id);
    if (!r) throw new Error('Missing exact record ' + item.id);
    const fa = frameworkFa[r.id];
    const domain = r.domain || item.path.split('/')[1].replace('execution-additional', 'execution');
    return {
      id: r.id,
      kind: item.kind,
      domain,
      title:
        labels[r.id] || (typeof r.name === 'string' ? r.name : r.name?.fa) || r.title?.fa || r.id,
      description: fa
        ? `راهنمای تدوین و بررسی ${fa.title} با شواهد همان کسب‌وکار.`
        : r.purpose || r.definition || r.why_it_matters || '',
      inputs: (r.inputs || r.required_inputs || []).map((x) =>
        typeof x === 'string'
          ? {
              id: x,
              label:
                fa?.inputs[(r.inputs || r.required_inputs).indexOf(x)] ||
                inputFa[x] ||
                r.formula_variables?.[x] ||
                x,
            }
          : { id: x.id || x.name, label: x.description || x.label || x.name },
      ),
      steps: (r.steps || []).map((s, index) => ({
        id: `step-${index + 1}`,
        instruction: fa?.steps[index] || (typeof s === 'string' ? s : s.instruction),
        output: typeof s === 'object' ? s.output || '' : '',
      })),
      outputs: r.outputs || [],
      learn: fa
        ? 'محدوده، تعریف ورودی‌ها و شاهد هر پاسخ را ثبت کن. این قالب، تأیید خودکار تصمیم یا نتیجهٔ کسب‌وکار نیست.'
        : r.explanation?.learn || r.why_it_matters || '',
      quick: fa?.title || r.explanation?.quick || '',
      interpretation: r.interpretation || '',
      warnings: [...(r.common_mistakes || []), ...(r.warnings || [])],
      limitations: r.limitations || [],
      useWhen: r.use_when || [],
      avoidWhen: r.do_not_use_when || [],
      formula: r.formula || '',
      unit: r.unit || '',
      sources: (r.sources || []).map((id) => sourceAliases[id] || id),
      sourcePath: item.path,
      researchStatus: 'requires_expert_and_runtime_review',
    };
  });
const businessModel = entries.find((r) => r.id === 'FW-STARTUP-BUSINESS-MODEL-CANVAS');
businessModel.steps = [
  ['segments', 'بخش‌های مشتری', 'چه کسانی و در چه موقعیتی ارزش دریافت می‌کنند؟'],
  ['value', 'پیشنهاد ارزش', 'برای هر بخش مشتری کدام مسئله یا منفعت را پاسخ می‌دهی؟'],
  ['channels', 'کانال‌ها', 'چطور مشتری آگاه می‌شود، خرید می‌کند و ارزش را دریافت می‌کند؟'],
  ['relationships', 'رابطه با مشتری', 'رابطه چگونه ایجاد، حفظ و پشتیبانی می‌شود؟'],
  ['revenue', 'جریان درآمد', 'چه کسی برای چه چیزی، با چه واحد و الگویی پرداخت می‌کند؟'],
  ['resources', 'منابع کلیدی', 'برای خلق و رساندن این ارزش چه منابعی لازم است؟'],
  ['activities', 'فعالیت‌های کلیدی', 'چه کارهایی برای عملی‌شدن مدل ضروری است؟'],
  ['partners', 'شرکای کلیدی', 'کدام شریک، تأمین‌کننده یا وابستگی بیرونی لازم است؟'],
  ['costs', 'ساختار هزینه', 'هزینه‌های مهم، محرک‌های آن‌ها و موارد نامشخص چیست؟'],
  [
    'evidence',
    'فرض‌ها و آزمون بعدی',
    'کدام بخش فرض، دارای شاهد، متناقض یا نامشخص است و چه چیزی باید بررسی شود؟',
  ],
].map(([id, instruction, output]) => ({ id, instruction, output }));
const output = {
  schemaVersion: 1,
  scope: 'Design projection only; not runtime knowledge promotion',
  domains: read('taxonomy/domains.json').domains,
  entries,
  sources: read('sources/bibliography.json').sources.map((s) => ({
    id: s.id,
    title: s.title,
    url: s.url,
    depth: s.access_depth,
  })),
  inventory: catalog.records.map((r) => ({
    ...r,
    uiRole: ['frameworks', 'metrics'].includes(r.kind)
      ? 'dedicated_design_route'
      : r.kind === 'sources'
        ? 'source_attribution'
        : 'contextual_reference_pending_runtime',
  })),
};
const target = 'apps/web/src/features/experience/design-research.json';
const content = JSON.stringify(output, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== content)
    throw new Error('Design research projection drift');
} else fs.writeFileSync(target, content);
console.log(
  `Design projection: ${entries.length} method pages, ${output.domains.length} domains, ${output.inventory.length} exact source records. Runtime definitions untouched.`,
);
