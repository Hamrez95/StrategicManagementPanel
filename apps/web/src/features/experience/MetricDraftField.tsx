import { readNumber } from './guidedCalculations';
import { fa } from './GuidedFlow';
type SeriesRow = { period: string; value: string };
export function metricDraftText(id: string, value: string) {
  if (metricInputKind(id) !== 'series' || !value) return value || 'هنوز مشخص نیست';
  try {
    const rows: unknown = JSON.parse(value);
    if (!Array.isArray(rows)) return 'قالب سری نیاز به بررسی دارد.';
    return rows
      .map((row) => `${row.period || 'دورهٔ نامشخص'}: ${row.value || 'مبلغ نامشخص'}`)
      .join('\n');
  } catch {
    return 'قالب سری نیاز به بررسی دارد؛ ورودی اولیه در پیش‌نویس حفظ شده است.';
  }
}
export function metricInputKind(id: string) {
  if (['cash_flow_series', 'expected_margin_series'].includes(id)) return 'series';
  if (id === 'valuation_date') return 'date';
  if (id === 'currency') return 'currency';
  if (['interval', 'period_length'].includes(id)) return 'text';
  return 'number';
}
export function MetricDraftField({
  id,
  label,
  value,
  state,
  onChange,
  onState,
}: {
  id: string;
  label: string;
  value: string;
  state: string;
  onChange: (value: string) => void;
  onState: (state: string) => void;
}) {
  const kind = metricInputKind(id);
  let rows: SeriesRow[] = [];
  if (kind === 'series') {
    try {
      const parsed: unknown = JSON.parse(value || '[]');
      if (
        Array.isArray(parsed) &&
        parsed.every((r) => r && typeof r.period === 'string' && typeof r.value === 'string')
      )
        rows = parsed;
    } catch {
      /* Retain the original invalid draft for explicit correction. */
    }
  }
  function updateRow(index: number, update: Partial<SeriesRow>) {
    onChange(JSON.stringify(rows.map((row, i) => (i === index ? { ...row, ...update } : row))));
  }
  return (
    <div className="gx-fields">
      <label className="ex-field">
        وضعیت این داده
        <select value={state} onChange={(e) => onState(e.target.value)}>
          <option value="">هنوز دسته‌بندی نشده</option>
          <option value="observed">مشاهده‌شده / از گزارش</option>
          <option value="estimate">برآورد / فرض</option>
          <option value="unknown">نامشخص</option>
          <option value="not_applicable">برای این محدوده کاربرد ندارد</option>
        </select>
      </label>
      {kind === 'series' ? (
        <fieldset className="mx-series">
          <legend>{label}</legend>
          <p>
            هر دوره و مبلغ با واحد و ارز یکسان؛ ورودی اولیه، جریان نقد منفی یا مثبت و زمان آن را
            صریح ثبت کن.
          </p>
          {rows.map((row, index) => (
            <div key={index}>
              <label className="ex-field">
                دورهٔ {fa(index + 1)}
                <input
                  value={row.period}
                  maxLength={100}
                  onChange={(e) => updateRow(index, { period: e.target.value })}
                  placeholder="مثلاً زمان صفر یا پایان سال اول"
                />
              </label>
              <label className="ex-field">
                مبلغ دورهٔ {fa(index + 1)}
                <input
                  dir="ltr"
                  inputMode="decimal"
                  value={row.value}
                  maxLength={24}
                  onChange={(e) => updateRow(index, { value: e.target.value })}
                  aria-invalid={(!!row.value && readNumber(row.value) === null) || undefined}
                />
              </label>
              <button
                type="button"
                className="ex-button ex-button--quiet"
                onClick={() => onChange(JSON.stringify(rows.filter((_, i) => i !== index)))}
                aria-label={`حذف دورهٔ ${fa(index + 1)}`}
              >
                حذف
              </button>
            </div>
          ))}
          <button
            type="button"
            className="ex-button ex-button--outline"
            disabled={rows.length >= 60}
            onClick={() => onChange(JSON.stringify([...rows, { period: '', value: '' }]))}
          >
            افزودن دوره
          </button>
        </fieldset>
      ) : (
        <label className="ex-field">
          {label}
          {kind === 'currency' ? (
            <select value={value} onChange={(e) => onChange(e.target.value)}>
              <option value="">واحد پول نامشخص</option>
              <option value="IRR">ریال</option>
              <option value="IRT">تومان</option>
              <option value="USD">دلار آمریکا</option>
            </select>
          ) : (
            <input
              type={kind === 'date' ? 'date' : 'text'}
              inputMode={kind === 'number' ? 'decimal' : undefined}
              dir={kind === 'number' ? 'ltr' : undefined}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              maxLength={kind === 'number' ? 24 : 200}
              aria-invalid={
                (kind === 'number' && !!value && readNumber(value) === null) || undefined
              }
              placeholder="نامشخص را خالی بگذار؛ صفر مقدار واقعی است."
            />
          )}
        </label>
      )}
      <small className="gx-muted">
        واحد، دوره، مبنای حسابداری و منبع باید با تعریف شاخص سازگار باشد. ورود داده به‌تنهایی نتیجهٔ
        معتبر تولید نمی‌کند.
      </small>
    </div>
  );
}
