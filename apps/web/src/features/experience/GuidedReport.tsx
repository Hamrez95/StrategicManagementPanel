import type { Space } from './model';
import { metricDraftText } from './MetricDraftField';
import { planningDefinitions } from './planningDesigns';
import research from './design-research.json';
import { guidedDefinitions, financeDefinition } from './guidedDefinitions';
import { financeResults, retentionRate } from './guidedCalculations';
import { evaluateMatrix, type EvaluationMatrixRow } from '@stratino/domain/evaluation-matrices';
import catalog from '../../../../../src/document-catalog.json';
import { fa } from './GuidedFlow';

export function GuidedReport({ space }: { space: Space }) {
  const values = (scope: string) =>
    Object.fromEntries(
      Object.entries(space.toolNotes)
        .filter(([k]) => k.startsWith(`${scope}:`))
        .map(([k, v]) => [k.slice(scope.length + 1), v]),
    );
  const finance = values('finance');
  const moneyUnit = `${finance.scale === '1000000' ? 'میلیون ' : finance.scale === '1000' ? 'هزار ' : ''}${({ IRT: 'تومان', IRR: 'ریال', USD: 'دلار' } as Record<string, string>)[finance.currency] || ''}`;
  return (
    <>
      <h3>تحلیل‌های ثبت‌شده</h3>
      {Object.entries({
        ...guidedDefinitions,
        ...planningDefinitions,
        finance: financeDefinition,
      }).map(([id, definition]) => {
        const fields = definition.steps
          .flatMap((s) => s.fields)
          .filter((field) => space.toolNotes[`${id}:${field.key}`]?.trim());
        if (!fields.length) return null;
        return (
          <section key={id}>
            <h4>{definition.title}</h4>
            {fields.map((field) => (
              <p key={field.key}>
                <strong>{field.label}: </strong>
                {field.options?.find((o) => o.value === space.toolNotes[`${id}:${field.key}`])
                  ?.label || space.toolNotes[`${id}:${field.key}`]}
              </p>
            ))}
          </section>
        );
      })}
      {financeResults(finance).some((r) => r.value !== null) && (
        <section>
          <h4>محاسبات مالیِ محلی</h4>
          <p>
            {finance.periodStart} تا {finance.periodEnd}؛ {moneyUnit}؛{' '}
            {finance.basis === 'estimate'
              ? 'برآورد'
              : finance.basis === 'cash'
                ? 'مبنای نقدی'
                : 'تعهدی'}
          </p>
          {financeResults(finance)
            .filter((r) => r.value !== null)
            .map((r) => (
              <p key={r.id}>
                {r.label}: {fa(r.value! * (r.percent ? 100 : 1))}{' '}
                {r.percent ? '٪' : r.unit || moneyUnit} — {r.note}
              </p>
            ))}
        </section>
      )}
      {(['ife', 'efe'] as const).map((kind) => {
        try {
          const rows = JSON.parse(
            space.toolNotes[`matrix:${kind}:rows`] || '[]',
          ) as EvaluationMatrixRow[];
          if (
            !Array.isArray(rows) ||
            !rows.length ||
            !rows.every((r) => r && typeof r.title === 'string' && typeof r.evidence === 'string')
          )
            return null;
          const result = evaluateMatrix(kind, rows);
          return (
            <section key={kind}>
              <h4>{kind.toUpperCase()}</h4>
              <p>
                {result.rounded_score === null
                  ? 'دادهٔ کافی برای محاسبه وجود ندارد.'
                  : `${result.can_finalize ? 'امتیاز محلی، بررسی‌نشده' : 'امتیاز پیش‌نویس'}: ${fa(result.rounded_score)} از ۴`}
                ؛ جمع وزن {fa(result.total_weight)} از ۱۰۰.
              </p>
              <ul>
                {rows.map((r) => (
                  <li key={r.id}>
                    {r.title || 'بدون عنوان'}؛ وزن {r.weight === null ? 'نامشخص' : fa(r.weight)}؛
                    نمره {r.rating === null ? 'نامشخص' : fa(r.rating)}؛ شاهد:{' '}
                    {r.evidence || 'ثبت نشده'}
                  </li>
                ))}
              </ul>
              <p>میانهٔ ۲٫۵ معیار عمومی موفقیت نیست؛ عوامل و شواهد به بازبینی انسانی نیاز دارند.</p>
            </section>
          );
        } catch {
          return null;
        }
      })}
      {retentionRate(values('retention')) !== null && (
        <p>
          نرخ بازگشت گروه تعریف‌شده: {fa(retentionRate(values('retention'))! * 100)}٪؛ فقط با همان
          تعریف گروه و بازهٔ مشاهده.
        </p>
      )}
      <h3>پیش‌نویس روش‌های مدیریتی</h3>
      {research.entries
        .filter((r) => space.toolNotes[`research:${r.id}:scope`])
        .map((r) => (
          <section key={r.id}>
            <h4>{r.title} — پیش‌نویس، محاسبهٔ تأییدشده نیست</h4>
            <p>{space.toolNotes[`research:${r.id}:scope`]}</p>
            {r.kind === 'metrics'
              ? r.inputs.map((input, i) => (
                  <p key={input.id}>
                    {input.label}:{' '}
                    {metricDraftText(
                      input.id,
                      space.toolNotes[`research:${r.id}:input-${i}`] || '',
                    )}
                  </p>
                ))
              : r.steps.map((step) => (
                  <p key={step.id}>
                    {step.instruction}: {space.toolNotes[`research:${r.id}:${step.id}`] || 'نامشخص'}
                  </p>
                ))}
          </section>
        ))}
      <h3>پیش‌نویس مستندات</h3>
      {catalog.documents
        .filter((d) =>
          d.structure.fa.some((_, i) => space.toolNotes[`document:${d.id}:section-${i}`]?.trim()),
        )
        .map((d) => (
          <section key={d.id}>
            <h4>{d.title.fa} — پیش‌نویس، تأیید نشده</h4>
            {d.structure.fa.map((title, i) => (
              <p key={title}>
                <strong>{title}: </strong>
                {space.toolNotes[`document:${d.id}:section-${i}`] || 'تکمیل نشده'}
              </p>
            ))}
          </section>
        ))}
      <p>
        فایل‌های پیوست جداگانه از صفحهٔ هر مستند دریافت می‌شوند؛ در خروجی JSON این صفحه بایت فایل‌ها
        وجود ندارد.
      </p>
    </>
  );
}
