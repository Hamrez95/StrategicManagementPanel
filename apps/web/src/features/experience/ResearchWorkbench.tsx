import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import data from './design-research.json';
import { MetricDraftField, metricDraftText } from './MetricDraftField';
import type { Space } from './model';
import { path } from './store';
import { Empty, Icon } from './ExperienceUI';
import { GuideHeader, GuideStart, GuideCard, Learn, ResultRows, useToolDraft } from './GuidedFlow';

export function ResearchWorkbench({ space, recordId }: { space: Space; recordId: string }) {
  const record = data.entries.find((r) => r.id === recordId);
  const { values, write, message } = useToolDraft(space, `research:${recordId}`);
  const [mode, setMode] = useState<'home' | 'guide' | 'result'>(
    values.reviewed ? 'result' : 'home',
  );
  const steps =
    record?.kind === 'metrics'
      ? record.inputs.map((input, index) => ({
          id: `input-${index}`,
          instruction: input.label,
          output: '',
        }))
      : (record?.steps ?? []);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (mode === 'result') reviewHeading.current?.focus();
  }, [mode]);
  const total = steps.length + 1;
  const [step, setStep] = useState(Math.min(total - 1, Math.max(0, Number(values.step) || 0)));
  if (!record) return <Empty title="روش پیدا نشد" text="از فهرست ابزارها یک روش انتخاب کن." />;
  const labels = ['محدوده و منابع', ...steps.map((s) => s.instruction)];
  const move = (next: number) => {
    if (write({ step: String(next) })) setStep(next);
  };
  return (
    <>
      <GuideHeader
        space={space}
        title={record.title}
        description={record.description}
        status={message}
      />
      {mode === 'home' && (
        <GuideStart
          title={record.quick || 'با اطلاعات خودت، این روش را بررسی کن.'}
          description={
            record.learn ||
            'ابتدا محدوده و داده‌های لازم را مشخص می‌کنیم؛ هر گام و محدودیت در جای خودش توضیح داده می‌شود.'
          }
          steps={labels}
          started={!!values.scope}
          onStart={() => setMode('guide')}
        />
      )}
      {mode === 'guide' && (
        <GuideCard
          title={labels[step]}
          description={
            step === 0
              ? 'کسب‌وکار، محصول یا واحد، دوره و منبع داده را روشن کن.'
              : steps[step - 1].output ||
                'پاسخ و شواهد این گام را ثبت کن؛ ادعا و واقعیت را جدا نگه دار.'
          }
          step={step}
          total={total}
          onBack={() => (step ? move(step - 1) : setMode('home'))}
          onPause={() => setMode('result')}
          onNext={() => {
            if (step < total - 1) move(step + 1);
            else if (write({ reviewed: '1' })) setMode('result');
          }}
          nextLabel={step === total - 1 ? 'مرور خروجی' : 'ادامه'}
        >
          <Learn>
            {record.learn}
            <ul>
              {record.inputs.map((input) => (
                <li key={input.id}>{input.label}</li>
              ))}
            </ul>
            {record.limitations[0]}
          </Learn>
          {step === 0 ? (
            <>
              <label className="ex-field">
                محدوده و دوره
                <textarea
                  rows={3}
                  value={values.scope || ''}
                  onChange={(e) => write({ scope: e.target.value, reviewed: '' })}
                  maxLength={5000}
                  placeholder="همین کسب‌وکار، محصول یا واحد مشخص؛ دورهٔ مورد بررسی…"
                />
              </label>
              <label className="ex-field">
                منبع و کیفیت داده
                <textarea
                  rows={3}
                  value={values.sources || ''}
                  onChange={(e) => write({ sources: e.target.value, reviewed: '' })}
                  maxLength={5000}
                  placeholder="گزارش، گفت‌وگو، تاریخ و موارد نامشخص…"
                />
              </label>
            </>
          ) : record.kind === 'metrics' ? (
            <MetricDraftField
              id={record.inputs[step - 1].id}
              label={steps[step - 1].instruction}
              value={values[steps[step - 1].id] || ''}
              state={values[`${steps[step - 1].id}:state`] || ''}
              onChange={(value) => write({ [steps[step - 1].id]: value, reviewed: '' })}
              onState={(state) => write({ [`${steps[step - 1].id}:state`]: state, reviewed: '' })}
            />
          ) : (
            <label className="ex-field">
              {steps[step - 1].instruction}
              <textarea
                rows={6}
                maxLength={10000}
                value={values[steps[step - 1].id] || ''}
                onChange={(e) => write({ [steps[step - 1].id]: e.target.value, reviewed: '' })}
                placeholder={
                  record.kind === 'metrics'
                    ? 'مقدار، واحد، دوره، منبع و وضعیت واقعی/برآوردی؛ نامشخص را صریح بنویس…'
                    : 'پاسخ، شاهد، فرض و پرسش باز این گام…'
                }
              />
            </label>
          )}
        </GuideCard>
      )}
      {mode === 'result' && (
        <div className="gx-results">
          <div className="gx-review-heading">
            <div>
              <h2 ref={reviewHeading} tabIndex={-1}>
                پیش‌نویس {record.title}
              </h2>
              <p>
                داده‌ها ثبت می‌شوند؛ نتیجهٔ محاسباتی یا تشخیص تأییدشدهٔ این روش هنوز به سرویس متصل
                نیست.
              </p>
            </div>
            <button className="ex-button ex-button--outline" onClick={() => setMode('guide')}>
              ادامه / ویرایش
            </button>
          </div>
          <ResearchOutput
            recordId={recordId}
            title={record.title}
            fields={steps.map((s) => ({
              label: s.instruction,
              value:
                record.kind === 'metrics'
                  ? metricDraftText(record.inputs[steps.indexOf(s)].id, values[s.id] || '')
                  : values[s.id] || 'هنوز مشخص نیست',
            }))}
          />
          {record.formula && (
            <section className="gx-callout">
              <h3>رابط محاسبهٔ این شاخص</h3>
              <p>
                ورودی‌ها پیش از محاسبه باید با واحد، دوره و تعریف پژوهش تطبیق داده شوند؛ این صفحه
                فعلاً پیش‌نویس ورودی را نگه می‌دارد.
              </p>
              <code dir="ltr" className="mx-formula">
                {record.formula}
              </code>
              <p>{record.interpretation}</p>
            </section>
          )}
          <details className="gx-doc-guide">
            <summary>محدوده و داده‌های ثبت‌شده</summary>
            <div>
              <ResultRows
                rows={[
                  { label: 'محدوده', value: values.scope || 'نامشخص' },
                  { label: 'منبع داده', value: values.sources || 'نامشخص' },
                ]}
              />
              {steps.map((s, index) => (
                <section key={s.id}>
                  <h3>{s.instruction}</h3>
                  <p className="gx-prewrap">
                    {record.kind === 'metrics'
                      ? metricDraftText(record.inputs[index].id, values[s.id] || '')
                      : values[s.id] || 'هنوز مشخص نیست'}
                  </p>
                  <button
                    className="ex-button ex-button--quiet"
                    onClick={() => {
                      move(index + 1);
                      setMode('guide');
                    }}
                  >
                    ویرایش این گام
                  </button>
                </section>
              ))}
            </div>
          </details>
          <div className="gx-result-actions">
            <Link className="ex-button" to={path(space, 'actions')}>
              ثبت اقدام بعدی
              <Icon name="arrow" />
            </Link>
            <Link className="ex-button ex-button--outline" to={path(space, 'library')}>
              شواهد و مستندات
            </Link>
          </div>
        </div>
      )}
      <details className="gx-doc-guide mx-method">
        <summary>کاربرد، محدودیت و منابع روش</summary>
        <div>
          {record.useWhen.length > 0 && (
            <>
              <h3>چه زمانی مفید است؟</h3>
              <ul>
                {record.useWhen.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {record.avoidWhen.length > 0 && (
            <>
              <h3>چه زمانی مناسب نیست؟</h3>
              <ul>
                {record.avoidWhen.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
          <p>{record.interpretation}</p>
          <ul>
            {[...record.limitations, ...record.warnings].map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <h3>منابع پژوهش موجود</h3>
          <ul>
            {record.sources.map((id) => {
              const source = data.sources.find((s) => s.id === id);
              return source && /^https:\/\//.test(source.url) ? (
                <li key={id}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                </li>
              ) : null;
            })}
          </ul>
          <p>وجود منبع، تأیید کارایی برای همهٔ کسب‌وکارها یا مجوز تصمیم خودکار نیست.</p>
        </div>
      </details>
    </>
  );
}

export function ResearchOutput({
  recordId,
  title,
  fields,
}: {
  recordId: string;
  title: string;
  fields: { label: string; value: string }[];
}) {
  const matrix = ['STR-BCG-GROWTH-SHARE', 'STR-GE-MCKINSEY'].includes(recordId);
  const comparison = ['STR-VRIO', 'EXE-RACI', 'EXE-MOSCOW', 'FW-PRODUCT-RICE'].includes(recordId);
  return (
    <section className="mx-output">
      <h3>{matrix ? 'صفحهٔ مرور سبد' : comparison ? 'دفتر بررسی و مقایسه' : `بوم ${title}`}</h3>
      {matrix && (
        <div
          className={`mx-matrix ${recordId === 'STR-GE-MCKINSEY' ? 'mx-matrix--nine' : ''}`}
          role="img"
          aria-label="قالب ماتریس؛ هیچ جایگاه محاسبه‌نشده‌ای به دادهٔ شما نسبت داده نشده است"
        >
          {Array.from({ length: recordId === 'STR-GE-MCKINSEY' ? 9 : 4 }, (_, i) => (
            <div key={i}>
              <Icon name="grid" />
              <span>جایگذاری پس از بررسی داده و مقیاس</span>
            </div>
          ))}
        </div>
      )}
      {comparison ? (
        <ResultRows rows={fields} />
      ) : (
        <div className="mx-canvas">
          {fields.map((f, i) => (
            <article key={i}>
              <h4>{f.label}</h4>
              <p>{f.value}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
