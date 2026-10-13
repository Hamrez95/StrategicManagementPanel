import {preferences} from './preferences.js';
import {english} from './translations.js';
const additions = {
  'آموزش‌ها روشن است. برای پنهان‌کردن دکمه‌ها و درس‌ها، کلید را خاموش کنید.':'Learning is on. Turn off the switch to hide tutorials and lessons.',
  'آموزش‌ها خاموش است. برای نمایش راهنمای صفحه‌ها، مفاهیم و کتابخانه، کلید را روشن کنید.':'Learning is off. Turn on the switch to show page guides, concept help and the learning library.',
  'نام صفحه، ماتریس، شاخص، مفهوم یا داده را بنویسید.':'Search pages, matrices, metrics, concepts or saved data.',
  'نتیجه‌ای پیدا نشد؛ نام صفحه، ماتریس یا شاخص را بنویسید.':'No results found. Try a page, matrix or metric name.',
  'مثلاً: ماتریس ICP، بازده دارایی یا ریسک':'For example: ICP matrix, return on assets or risk',
  'آموزش: روشن':'Learning: on', 'آموزش: خاموش':'Learning: off',
  'خاموش‌کردن آموزش':'Turn learning off', 'فعال‌کردن آموزش':'Turn learning on',
  'صفحه':'Page', 'ماتریس':'Matrix', 'داده':'Data', 'منبع':'Source',
  'شرکت نمونه':'Sample company', 'شرکت':'Company', 'خروجی':'Deliverable', 'بودجه':'Budget', 'موعد':'Due (Jalali)', 'م.':'m toman', 'رشد مرکب فروش سالانه':'Annual compound revenue growth', 'م':'M', 'س':'S', 'ع':'A', 'ن':'N',
  'اجرا و کنترل':'Execution and control', 'نمودار قابل پیمایش':'Scrollable chart', 'برای دیدن کامل نمودار، افقی بکشید.':'Swipe horizontally to view the full chart.',
  'آموزش این صفحه':'Page tutorial', 'تغییر تم':'Toggle theme', 'تغییر زبان':'Switch language', 'فا':'FA',
  'ظاهر، زبان و راهنمای آموزشی را مطابق سبک کار خود تنظیم کنید.':'Choose the appearance, language and learning tools that suit your workflow.',
  'ظاهر و زبان':'Appearance and language', 'یک محیط، دو سبک کار':'One workspace, two ways to work',
  'آموزش در جریان کار، یا فضای حرفه‌ای متمرکز.':'Learn as you work, or use a focused professional workspace.',
  'تم محیط':'Theme', 'روشن':'Light', 'تیره':'Dark', 'مطابق سیستم':'System', 'زبان محیط':'Language', 'فارسی':'Persian',
  'حرکت و انیمیشن':'Motion and animation', 'هماهنگ با تنظیم دستگاه':'Follow device preference', 'حرکت کمتر':'Reduced motion',
  'آموزش در اپ':'In-app learning', 'فعال‌سازی آموزش در اپ':'Enable in-app learning',
  'آموزش مرحله‌ای صفحات، توضیح مفاهیم و کتابخانه یادگیری.':'Page walkthroughs, concept explanations and the learning library.',
  'با خاموش‌کردن، همه دکمه‌ها و بخش‌های آموزشی پنهان می‌شوند. هشدارهای اعتبار داده و محاسبات همچنان نمایش داده می‌شوند.':'Turning this off hides learning buttons and sections. Data and calculation validation warnings remain visible.',
  'آموزش فعال است':'Learning enabled', 'حالت حرفه‌ای':'Professional mode',
  'پاک‌کردن داده مرورگر، اطلاعات را حذف می‌کند. فایل پشتیبان بگیرید.':'Clearing browser data deletes your records. Export a backup.',
  'رویش · فضای کار مدیریت استراتژیک':'Royesh · Strategy management workspace',
  'رفتن به محتوای اصلی':'Skip to main content', 'منوی اصلی':'Main navigation', 'شاخص':'Metric', 'بازکردن منو':'Open menu',
  'تنظیمات فضای کار':'Workspace settings', 'توجه‌ها و ریسک‌ها':'Alerts and risks',
  'مثلاً: بازده دارایی، QSPM یا ریسک':'For example: return on assets, QSPM or risk', 'عبارت جستجو':'Search query',
  'منطق انتخاب، کارهایی که انجام نمی‌دهیم، منابع و موعد بازبینی را ثبت کنید.':'Record your reasoning, exclusions, sources and review date.',
  'توضیح':'Explain', 'وزن':'Weight', 'رتبه':'Rating', 'اثر':'Impact', 'ارتباط':'Relevance', 'جذابیت':'Attractiveness',
  'نسبت به':'relative to', 'از':'of', 'از 5':'out of 5', 'از 6':'of 6', 'از 4':'out of 4',
  'میلیون تومان در ماه':'million toman per month', 'میلیون':'million toman', 'برابر':'times', 'نفر':'people',
  'بازبینی':'Review (Jalali)', 'شرط':'Trigger', 'مرحله':'Stage', 'جمع وزن':'Total weights', 'هزینه تخمینی':'Estimated cost',
  'سهم نسبی':'Relative share', 'قدم پیشنهادی بعدی':'Suggested next step', 'تصویر امروز':'Today at',
  'از تحلیل‌های پراکنده به انتخاب‌های روشن.':'from scattered analyses to clear choices.',
  'امتیاز':'Score', 'در مدل 1 تا 4 است. مقدار 2.5 نقطه میانی است، نه مرز قطعی موفقیت. کیفیت شاهد، حساسیت وزن‌ها و اقدام بعدی مهم‌تر از یک عدد هستند.':'in the 1–4 model. 2.5 is the midpoint, not a proven success threshold. Evidence, sensitivity and the next action matter more than one number.',
  'ریسک با اولویت بالا':'high-priority risks', 'شدت پنج نیرو':'Five-force intensity',
  'ماتریس BCG؛ محور افقی سهم نسبی لگاریتمی و نزولی، محور عمودی رشد بازار':'BCG: decreasing logarithmic relative-share axis; vertical market-growth axis',
  'رشد حجم فروش':'Sales volume growth', 'رشد هزینه':'Cost growth', 'خالص جریان نقدی ماه نمونه':'Sample monthly net cash flow',
  'همه ارقام فرضی‌اند. تاریخ تهیه':'All figures are fictional. Prepared on', 'مالی: ماه نمونه':'Finance: sample month',
  'از شناخت تا اقدام':'from company profile to action', 'حاشیه ناخالص':'Gross margin', 'ROA ماهانه':'Monthly ROA',
  'ICP · پروفایل مشتری ایده‌آل':'ICP · Ideal customer profile',
  'مشتری مناسب ما چه مسئله، بودجه و ویژگی‌هایی دارد؟':'Which customer problems, budgets and characteristics fit our offering?',
  'توصیف مستند بخش مشتری؛ ICP نسبت مالی با فرمول ثابت نیست.':'An evidenced description of a customer segment; ICP is not a financial ratio with a fixed formula.',
  'شرکت 50 تا 2000 نفره با نیاز تغذیه سالم، بودجه و مسئول خرید مشخص.':'A company with 50–2,000 employees, a healthy-snack need, an identified buyer and a defined budget.',
  'با مصاحبه، خرید، سودآوری و ماندگاری مشتری اعتبارسنجی و بازبینی شود.':'Validate and review through interviews, purchases, profitability and retention.',
  'ICP در فروش سازمانی توصیف شرکت مناسب است؛ پرسونا توصیف فرد تصمیم‌گیرنده است.':'For corporate sales, ICP describes the company, while a persona describes an individual decision-maker.',
  'تعریف بخش مشتری با ویژگی‌های شرکت، نیاز، بودجه و فرایند تصمیم؛ اعتبارسنجی با شواهد.':'Define a segment by company characteristics, needs, budget and buying process, then validate it with evidence.'
};
const normalize = value => String(value).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/٫/g,'.').replace(/٬/g,',').replace(/٪/g,'%').replace(/؛/g,';').replace(/،/g,',').replace(/\s+/g,' ').trim();
const entries = new Map(Object.entries({...english,...additions}).map(([fa,en])=>[normalize(fa),en]));
const partials = [...entries].filter(([key])=>/[\u0600-\u06ff]/.test(key)).sort((a,b)=>b[0].length-a[0].length).map(([key,en])=>[new RegExp(`(?<![\\p{L}])${key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\p{L}])`,'gu'),en]);
export function translate(value) {
  if (preferences.language !== 'en') return String(value ?? '');
  const original=String(value ?? '');
  if(!/[\u0600-\u06ff]/.test(original))return original;
  let result=normalize(original);
  if (entries.has(result)) result=entries.get(result);
  else for (const [pattern,en] of partials) result=result.replace(pattern,()=>en);
  if(/[\u0600-\u06ff]/.test(result))return original;
  return `${original.match(/^\s*/)[0]}${result}${original.match(/\s*$/)[0]}`;
}
const originalTexts=new WeakMap();
const originalAttributes=new WeakMap();
// Localize the existing HTML-rendering boundary, never IDs, routes or option values.
export function localize(root) {
  if (!root || !document.createTreeWalker) return;
  const walker=document.createTreeWalker(root,4);
  let node;
  while ((node=walker.nextNode())) {
    if (['SCRIPT','STYLE','TEXTAREA'].includes(node.parentElement?.tagName)) continue;
    if (!originalTexts.has(node)) originalTexts.set(node,node.nodeValue);
    node.nodeValue=translate(originalTexts.get(node));
  }
  for (const element of root.querySelectorAll('[aria-label],[placeholder],[title]')) {
    if (!originalAttributes.has(element)) originalAttributes.set(element,{});
    const originals=originalAttributes.get(element);
    for (const key of ['aria-label','placeholder','title']) {
      if (!element.hasAttribute(key)) continue;
      originals[key] ??= element.getAttribute(key);
      element.setAttribute(key,translate(originals[key]));
    }
  }
}
