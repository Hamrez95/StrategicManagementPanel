import './management.css';
import { planningDesigns } from './planningDesigns';
import { ResultRows } from './GuidedFlow';
export function PlanningSummary({
  toolId,
  values,
}: {
  toolId: string;
  values: Record<string, string>;
}) {
  const design = planningDesigns.find((d) => d.id === toolId);
  if (!design) return null;
  const rows = design.questions.map(([key, label]) => ({
    label,
    value: values[key] || 'هنوز مشخص نیست',
  }));
  return (
    <section className="mx-output">
      <h3>{design.title}؛ نسخهٔ کاری شما</h3>
      {design.layout === 'statement' ? (
        <blockquote className="mx-statement">
          <p>
            {values.statement ||
              values[design.questions.at(-1)![0]] ||
              'بیانیه هنوز نوشته نشده است.'}
          </p>
          <small>پیش‌نویس قابل بازنگری؛ متن شما بدون ادعای تأیید خودکار.</small>
        </blockquote>
      ) : design.layout === 'comparison' ? (
        <ResultRows rows={rows} />
      ) : (
        <div className="mx-canvas">
          {rows.map((row) => (
            <article key={row.label}>
              <h4>{row.label}</h4>
              <p>{row.value}</p>
            </article>
          ))}
        </div>
      )}
      <p className="gx-muted">
        این قالب برای تدوین و گفت‌وگوست. نتیجهٔ خودکار یا محاسبهٔ نسخه‌دارِ روش‌های جدید پس از اتصال
        سرویس مربوط در دسترس خواهد بود.
      </p>
      {['vision', 'mission', 'purpose', 'values', 'strategic-goals'].includes(toolId) && (
        <a
          href="https://openstax.org/books/principles-management/pages/9-2-firm-vision-and-mission"
          target="_blank"
          rel="noreferrer"
        >
          مرجع آموزشی جهت‌گیری و مأموریت
        </a>
      )}
      {['stp', 'marketing-mix', 'marketing-plan'].includes(toolId) && (
        <a
          href="https://openstax.org/books/principles-marketing/pages/2-3-purpose-and-structure-of-the-marketing-plan"
          target="_blank"
          rel="noreferrer"
        >
          مرجع آموزشی برنامهٔ بازاریابی
        </a>
      )}
    </section>
  );
}
