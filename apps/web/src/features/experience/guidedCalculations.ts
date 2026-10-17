import { financials, ratio, type FinancialInputs } from '@stratino/domain';
export function normalizeNumber(raw: string): string {
  return raw
    .trim()
    .replace(/[۰-۹]/g, (n) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(n)))
    .replace(/[٠-٩]/g, (n) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(n)))
    .replace(/[٬,]/g, '')
    .replace(/٫/g, '.')
    .replace(/−/g, '-');
}
export function readNumber(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const normalized = normalizeNumber(raw);
  if (!/^-?\d+(?:\.\d{1,6})?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && Math.abs(n) <= 1e12 ? n : null;
}
export type FinanceMetric = {
  id: string;
  label: string;
  value: number | null;
  percent?: boolean;
  unit?: string;
  formula: string;
  missing: string;
  note: string;
};
export function financeResults(values: Record<string, string>): FinanceMetric[] {
  const get = (key: string, signed = false) => {
    const n = readNumber(values[key]);
    return n !== null && (signed || n >= 0) ? n : null;
  };
  const v = (key: string) => get(key) ?? NaN;
  const f: FinancialInputs = {
    revenue: v('revenue'),
    cogs: v('cogs'),
    variable: v('variable'),
    fixed: v('fixed'),
    netIncome: get('netIncome', true) ?? NaN,
    assetsStart: v('assetsStart'),
    assetsEnd: v('assetsEnd'),
    equity: get('equity', true) ?? NaN,
    acquisitionCost: v('acquisitionCost'),
    newCustomers: v('newCustomers'),
    cash: v('cash'),
    cashFlow: -(get('monthlyBurn', true) ?? NaN),
    aov: NaN,
    frequency: NaN,
    lifetime: NaN,
    startRevenue: NaN,
    endRevenue: NaN,
    years: NaN,
    marketRevenue: NaN,
  };
  const result = financials(f);
  const validDate = (value: string | undefined) =>
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  const context =
    validDate(values.periodStart) &&
    validDate(values.periodEnd) &&
    values.periodEnd >= values.periodStart &&
    ['IRT', 'IRR', 'USD'].includes(values.currency) &&
    ['1', '1000', '1000000'].includes(values.scale) &&
    ['actual', 'cash', 'estimate'].includes(values.basis);
  const metric = (
    id: string,
    label: string,
    value: number | null,
    formula: string,
    missing: string,
    note: string,
    percent = false,
    unit?: string,
  ): FinanceMetric => ({
    id,
    label,
    value: context && value !== null && Number.isFinite(value) ? value : null,
    formula,
    missing: context ? missing : 'ابتدا دوره، واحد پول، مقیاس و مبنای گزارش را مشخص کن.',
    note,
    percent,
    unit,
  });
  const costsDocumented = !!values.costScope?.trim();
  const currentAssets = get('currentAssets'),
    currentLiabilities = get('currentLiabilities');
  const customers = get('newCustomers');
  return [
    metric(
      'gross',
      'سود ناخالص',
      result.gross,
      'درآمد خالص − بهای تمام‌شدهٔ فروش',
      'درآمد و بهای تمام‌شده لازم است.',
      'مبلغ باقی‌مانده پیش از سایر هزینه‌ها؛ سود خالص نیست.',
    ),
    metric(
      'grossMargin',
      'حاشیهٔ سود ناخالص',
      result.grossMargin,
      'سود ناخالص ÷ درآمد خالص × ۱۰۰',
      'درآمد مثبت و بهای تمام‌شده لازم است.',
      'نسبت مربوط به همین دوره است؛ معیار عمومی موفقیت ندارد.',
      true,
    ),
    metric(
      'contribution',
      'مبلغ مشارکت',
      costsDocumented ? result.contribution : null,
      'درآمد خالص − هزینهٔ متغیر',
      'درآمد، هزینهٔ متغیر و شرح دامنهٔ هزینه لازم است.',
      'برای پوشش هزینهٔ ثابت و سپس سود عملیاتی باقی می‌ماند.',
    ),
    metric(
      'contributionMargin',
      'نرخ حاشیهٔ مشارکت',
      costsDocumented ? result.contributionMargin : null,
      'مبلغ مشارکت ÷ درآمد خالص × ۱۰۰',
      'درآمد مثبت، هزینهٔ متغیر و دامنهٔ هزینه لازم است.',
      'به تعریف ثابت/متغیر و دامنهٔ هزینه وابسته است.',
      true,
    ),
    metric(
      'operating',
      'مازاد عملیاتی در مدل هزینه',
      costsDocumented ? result.operating : null,
      'درآمد − هزینهٔ متغیر − هزینهٔ ثابت',
      'درآمد، هزینه‌های ثابت و متغیر و دامنهٔ هزینه لازم است.',
      'فقط مدل هزینهٔ واردشده؛ معادل قطعی EBIT صورت مالی نیست.',
    ),
    metric(
      'breakEven',
      'فروش سربه‌سر در این مدل',
      costsDocumented ? result.breakEven : null,
      'هزینهٔ ثابت ÷ نرخ حاشیهٔ مشارکت',
      'نرخ مشارکت مثبت، هزینهٔ ثابت و دامنهٔ هزینه لازم است.',
      'با فرض ثبات قیمت، هزینه و ترکیب فروش؛ نقدینگی یا ظرفیت را تضمین نمی‌کند.',
    ),
    metric(
      'netMargin',
      'حاشیهٔ سود خالص',
      ratio(get('netIncome', true), get('revenue')),
      'سود خالص ÷ درآمد خالص × ۱۰۰',
      'سود/زیان خالص و درآمد مثبت لازم است.',
      'مبنای نقدی یا برآوردی را با گزارش تعهدی مقایسه نکن.',
      true,
    ),
    metric(
      'workingCapital',
      'سرمایهٔ در گردش',
      currentAssets !== null && currentLiabilities !== null
        ? currentAssets - currentLiabilities
        : null,
      'دارایی جاری − بدهی جاری',
      'دارایی و بدهی جاریِ یک تاریخ لازم است.',
      'ماندهٔ پایان دوره؛ قابلیت وصول و زمان تعهدها باید جدا بررسی شود.',
    ),
    metric(
      'currentRatio',
      'نسبت جاری',
      ratio(currentAssets, currentLiabilities),
      'دارایی جاری ÷ بدهی جاری',
      'دارایی جاری و بدهی جاری مثبت لازم است.',
      'قضاوت به صنعت، ترکیب دارایی و زمان سررسید وابسته است.',
      false,
      'برابر',
    ),
    metric(
      'runway',
      'دوام نقد با نرخ ثابت',
      result.runway,
      'نقد قابل استفاده ÷ خالص خروج نقد ماهانه',
      'ماندهٔ نقد و خالص خروج نقد ماهانهٔ مثبت لازم است.',
      'اگر سوخت نقد صفر/منفی است مدت متناهی محاسبه نمی‌شود؛ پیش‌بینی قطعی نیست.',
      false,
      'ماه',
    ),
    metric(
      'cac',
      'متوسط هزینهٔ جذب مشتری',
      customers !== null && Number.isInteger(customers) ? result.cac : null,
      'هزینهٔ جذب ÷ مشتری جدید',
      'هزینهٔ جذب و تعداد صحیح و مثبت مشتری جدید لازم است.',
      'هزینه و مشتریان باید به یک دوره و یک تعریف جذب تعلق داشته باشند.',
    ),
    metric(
      'roa',
      'بازده دارایی در همین دوره',
      result.roa,
      'سود خالص ÷ میانگین دارایی ابتدا و انتهای دوره × ۱۰۰',
      'سود خالص و دو ماندهٔ دارایی با میانگین مثبت لازم است.',
      'سالانه‌سازی نشده؛ دوره‌های متفاوت را مستقیم مقایسه نکن.',
      true,
    ),
    metric(
      'roe',
      'بازده حقوق صاحبان سهام پایان دوره',
      result.roe,
      'سود خالص ÷ حقوق صاحبان سهام پایان دوره × ۱۰۰',
      'سود خالص و حقوق صاحبان سهام مثبت لازم است.',
      'با ماندهٔ پایان دوره، نه میانگین؛ در حقوق صفر/منفی قابل نمایش نیست.',
      true,
    ),
  ];
}

export function retentionRate(values: Record<string, string>): number | null {
  const initial = readNumber(values.initial),
    returned = readNumber(values.returned);
  if (
    !values.cohort?.trim() ||
    !values.window?.trim() ||
    initial === null ||
    returned === null ||
    !Number.isInteger(initial) ||
    !Number.isInteger(returned) ||
    initial <= 0 ||
    returned < 0 ||
    returned > initial
  )
    return null;
  return returned / initial;
}
