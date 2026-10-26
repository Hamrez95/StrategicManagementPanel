type Text = { fa: string; en: string };
export type PlanningField = {
  id: string;
  label: Text;
  type?: 'text' | 'textarea' | 'date';
  maximum?: number;
  required?: boolean;
  options?: { value: string; label: Text }[];
};
export type PlanningDefinition = {
  title: Text;
  description: Text;
  fields: PlanningField[];
  note?: Text;
};
const text = (fa: string, en: string): Text => ({ fa, en });
const field = (
  id: string,
  fa: string,
  en: string,
  maximum = 2000,
  required = true,
): PlanningField => ({
  id,
  label: text(fa, en),
  maximum,
  required,
  type: maximum > 1000 ? 'textarea' : 'text',
});
const date = (id: string, fa: string, en: string): PlanningField => ({
  id,
  label: text(fa, en),
  type: 'date',
});
const options = (items: [string, string, string][]) =>
  items.map(([value, fa, en]) => ({ value, label: text(fa, en) }));
const unknownYesNo = options([
  ['unknown', 'هنوز مشخص نیست', 'Unknown'],
  ['yes', 'بله', 'Yes'],
  ['no', 'نه', 'No'],
]);
const level = options([
  ['unknown', 'هنوز مشخص نیست', 'Unknown'],
  ['low', 'کم', 'Low'],
  ['medium', 'متوسط', 'Medium'],
  ['high', 'زیاد', 'High'],
]);
const source = field('source', 'شاهد یا منبع و تاریخش', 'Evidence or source and its date', 1000);
export const planningDefinitions: Record<string, PlanningDefinition> = {
  environment: {
    title: text('محیط و بازار', 'Environment and market'),
    description: text(
      'تغییرهای بیرون کسب‌وکار رو با PESTEL ثبت کن؛ بعد بنویس هر تغییر چه اثری روی کارت داره.',
      'Record external changes using PESTEL and explain their implications for your business.',
    ),
    fields: [
      {
        id: 'category',
        label: text('دستهٔ PESTEL', 'PESTEL category'),
        options: options([
          ['political', 'سیاسی', 'Political'],
          ['economic', 'اقتصادی', 'Economic'],
          ['social', 'اجتماعی', 'Social'],
          ['technological', 'فناوری', 'Technological'],
          ['environmental', 'محیط‌زیستی', 'Environmental'],
          ['legal', 'حقوقی', 'Legal'],
        ]),
      },
      field('observation', 'چی تغییر کرده؟', 'What changed?'),
      field('implication', 'چه اثری روی کسب‌وکارت داره؟', 'Business implication', 2000, false),
      source,
      date('observed_on', 'تاریخ مشاهده', 'Observation date'),
    ],
  },
  industry: {
    title: text('صنعت و رقبا', 'Industry and competitors'),
    description: text(
      'رقیبت برای چه مشتری‌ای چه ارزشی می‌سازه؟ تفاوت‌ها رو با شاهد ثبت کن تا مقایسه‌ات قابل پیگیری باشه.',
      'Record the customers, value propositions and evidence behind competitor comparisons.',
    ),
    fields: [
      field('customer_segment', 'مشتری هدف رقیب', 'Target customer', 500, false),
      field('value_proposition', 'ارزشی که به مشتری می‌ده', 'Value proposition'),
      field('advantage', 'تفاوت‌ها و مزیت‌ها', 'Differences and advantages', 2000, false),
      source,
      date('observed_on', 'تاریخ بررسی', 'Review date'),
    ],
  },
  internal: {
    title: text('منابع و قابلیت‌ها', 'Resources and capabilities'),
    description: text(
      'هر منبع یا قابلیت رو با پرسش‌های VRIO بررسی کن. اگر شاهد کافی نداری، «هنوز مشخص نیست» رو انتخاب کن.',
      'Review each resource using the VRIO questions. Keep uncertain assessments explicitly unknown.',
    ),
    fields: [
      field('description', 'منبع یا قابلیت رو توضیح بده', 'Resource description'),
      ...[
        ['valuable', 'برای مشتری ارزش می‌سازه؟', 'Valuable?'],
        ['rare', 'بین رقبا کمیابه؟', 'Rare?'],
        ['hard_to_imitate', 'تقلیدش دشواره؟', 'Costly to imitate?'],
        ['organized', 'سازمان برای استفاده ازش آماده است؟', 'Organized to capture value?'],
      ].map(([id, fa, en]) => ({ id, label: text(fa, en), options: unknownYesNo })),
      source,
    ],
    note: text(
      'این پاسخ‌ها ارزیابی خودته؛ تکمیل فرم به معنی تأیید مزیت رقابتی نیست.',
      'These are your assessments, not a verified competitive-advantage classification.',
    ),
  },
  scenarios: {
    title: text('سناریو و آینده', 'Scenarios and futures'),
    description: text(
      'یک آیندهٔ ممکن رو توصیف کن؛ فرض‌ها، علامت‌های اولیه و پاسخی که آماده می‌کنی رو کنارش نگه دار.',
      'Describe a plausible future, its assumptions, early signals and your planned response.',
    ),
    fields: [
      field('uncertainty', 'عدم‌قطعیت اصلی چیه؟', 'Key uncertainty'),
      field('assumptions', 'چه فرض‌هایی داری؟', 'Assumptions'),
      field('early_signal', 'چه علامتی رو دنبال می‌کنی؟', 'Early signal', 1000),
      field('response', 'اگر اتفاق افتاد، چه کار می‌کنی؟', 'Planned response'),
      date('review_on', 'تاریخ بازبینی', 'Review date'),
    ],
    note: text(
      'سناریو پیش‌بینی قطعی نیست و احتمال آماری بهش نسبت داده نمی‌شه.',
      'Scenarios are not forecasts or statistically assigned probabilities.',
    ),
  },
  risks: {
    title: text('ریسک‌ها', 'Risks'),
    description: text(
      'ریسک، پیامد و برنامهٔ برخورد باهاش رو ثبت کن. مسئول پیگیری و زمان بازبینی رو هم مشخص کن.',
      'Keep risks, consequences, responses and review ownership together.',
    ),
    fields: [
      field('description', 'چه اتفاقی ممکنه بیفته؟', 'Risk description'),
      { id: 'likelihood', label: text('برآورد احتمال', 'Assessed likelihood'), options: level },
      { id: 'impact', label: text('برآورد اثر', 'Assessed impact'), options: level },
      field('mitigation', 'برای کاهش ریسک چه کار می‌کنی؟', 'Response plan'),
      field('responsible', 'مسئول پیگیری', 'Responsible person', 160, false),
      date('review_on', 'تاریخ بازبینی', 'Review date'),
      {
        id: 'status',
        label: text('وضعیت', 'Status'),
        options: options([
          ['open', 'باز', 'Open'],
          ['monitoring', 'در حال پیگیری', 'Monitoring'],
          ['closed', 'بسته‌شده', 'Closed'],
        ]),
      },
    ],
    note: text(
      'احتمال و اثر، برآورد کیفی خودته؛ اینجا ازشون امتیاز عددی یا قطعیت نمی‌سازیم.',
      'Likelihood and impact are qualitative self-assessments, not a calculated risk score.',
    ),
  },
  journey: {
    title: text('مسیر استراتژی', 'Strategy journey'),
    description: text(
      'وضعیت هر مرحله و خروجی کارت رو ثبت کن. می‌تونی بین مرحله‌ها رفت‌وبرگشت داشته باشی؛ هیچ مرحله‌ای ابزارهای دیگه رو قفل نمی‌کنه.',
      'Track stage progress and outcomes. Stages guide your work without locking other tools.',
    ),
    fields: [
      {
        id: 'stage',
        label: text('مرحله', 'Stage'),
        options: options([
          ['understand', 'شناخت', 'Understand'],
          ['analyze', 'تحلیل', 'Analyze'],
          ['decide', 'تصمیم', 'Decide'],
          ['execute', 'اجرا', 'Execute'],
          ['evidence', 'مدارک و یادگیری', 'Evidence and learning'],
        ]),
      },
      {
        id: 'status',
        label: text('وضعیت', 'Status'),
        options: options([
          ['not_started', 'شروع نشده', 'Not started'],
          ['in_progress', 'در حال انجام', 'In progress'],
          ['done', 'انجام شده', 'Done'],
        ]),
      },
      field('outcome', 'خروجی یا قدم بعدت چیه؟', 'Outcome or next step', 2000, false),
    ],
    note: text(
      'وضعیت مرحله رو خودت ثبت می‌کنی؛ این وضعیت تأیید علمی تحلیل نیست.',
      'Stage completion is self-reported, not scientific approval.',
    ),
  },
};
