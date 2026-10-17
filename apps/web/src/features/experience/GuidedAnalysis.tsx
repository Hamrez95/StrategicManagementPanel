import { useState } from 'react';
import { Link } from 'react-router';
import { type Space } from './model';
import { path } from './store';
import { Icon } from './ExperienceUI';
import {
  GuideHeader,
  GuideStart,
  GuideCard,
  Learn,
  ResultRows,
  useToolDraft,
  fa,
} from './GuidedFlow';
import { guidedDefinitions, financeDefinition, type GuidedField } from './guidedDefinitions';
import { financeResults, readNumber, retentionRate } from './guidedCalculations';

function Field({
  field,
  value,
  onChange,
}: {
  field: GuidedField;
  value: string;
  onChange: (value: string) => void;
}) {
  const parsed = readNumber(value);
  const invalid =
    !!value &&
    field.numeric &&
    (parsed === null ||
      (!field.signed && parsed < 0) ||
      (field.integer && !Number.isInteger(parsed)));
  return (
    <label className="ex-field gx-field">
      <span>{field.label}</span>
      <small>{field.hint}</small>
      {field.options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">هنوز مشخص نیست</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.key === 'periodStart' || field.key === 'periodEnd' ? (
        <input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : field.numeric ? (
        <input
          inputMode="decimal"
          dir="ltr"
          value={value}
          maxLength={24}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
          placeholder="نامشخص"
        />
      ) : (
        <textarea
          rows={3}
          value={value}
          maxLength={10000}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.example || 'اگر هنوز نمی‌دانی، خالی بگذار…'}
        />
      )}
      {invalid && (
        <small className="gx-error">
          یک عدد معتبر با حداکثر ۶ رقم اعشار وارد کن؛ نامشخص را خالی بگذار.
        </small>
      )}
    </label>
  );
}

export function GuidedAnalysis({ space, toolId }: { space: Space; toolId: string }) {
  const definition = toolId === 'finance' ? financeDefinition : guidedDefinitions[toolId];
  const { values, write, message } = useToolDraft(space, toolId);
  const [mode, setMode] = useState<'home' | 'guide' | 'result'>(
    values._reviewed ? 'result' : 'home',
  );
  const storedStep = Number(values._step ?? 0);
  const [step, setStep] = useState(
    Number.isInteger(storedStep)
      ? Math.max(0, Math.min(storedStep, (definition?.steps.length ?? 1) - 1))
      : 0,
  );
  const [error, setError] = useState('');
  if (!definition) return null;
  const current = definition.steps[step];
  const fields = definition.steps.flatMap((s) => s.fields);
  const count = fields.filter((f) => values[f.key]?.trim()).length;
  const move = (next: number) => {
    if (write({ _step: String(next) })) {
      setStep(next);
      setError('');
    }
  };
  function next() {
    for (const field of current.fields) {
      if (!field.numeric || !values[field.key]?.trim()) continue;
      const n = readNumber(values[field.key]);
      if (n === null || (!field.signed && n < 0) || (field.integer && !Number.isInteger(n))) {
        setError(
          `${field.label}: ${field.integer ? 'تعداد صحیح و نامنفی' : field.signed ? 'عدد معتبر' : 'عدد نامنفی'} وارد کن، یا برای نامشخص خالی بگذار.`,
        );
        return;
      }
    }
    if (
      toolId === 'finance' &&
      current.id === 'context' &&
      values.periodStart &&
      values.periodEnd &&
      values.periodStart > values.periodEnd
    ) {
      setError('پایان دوره نباید قبل از شروع دوره باشد.');
      return;
    }
    if (toolId === 'retention' && current.id === 'counts') {
      const a = readNumber(values.initial),
        b = readNumber(values.returned);
      if (a !== null && b !== null && b > a) {
        setError('بازگشته‌ها باید از همان گروه اولیه و حداکثر برابر تعداد آن باشند.');
        return;
      }
    }
    if (step < definition.steps.length - 1) move(step + 1);
    else if (write({ _reviewed: '1', _step: '0' })) {
      setMode('result');
      setError('');
    }
  }
  return (
    <>
      <GuideHeader
        space={space}
        title={definition.title}
        description={definition.outcome}
        status={message}
      />
      {mode === 'home' && (
        <GuideStart
          title="دانش تخصصی لازم نیست؛ با داده‌های خودت شروع کن."
          description="هر بار یک موضوع را بررسی می‌کنیم. توضیح و مثال در همان گام در دسترس است و پاسخ‌هایت برای ادامه می‌مانند."
          steps={definition.steps.map((s) => s.title)}
          started={count > 0}
          onStart={() => setMode('guide')}
        />
      )}
      {mode === 'guide' && (
        <GuideCard
          title={current.title}
          description={current.description}
          step={step}
          total={definition.steps.length}
          onBack={() => (step ? move(step - 1) : setMode('home'))}
          onPause={() => setMode(count ? 'result' : 'home')}
          onNext={next}
          nextLabel={step === definition.steps.length - 1 ? 'مرور و دیدن نتیجه' : 'ادامه'}
          error={error}
        >
          <Learn example={current.example}>{current.learn}</Learn>
          <div className="gx-fields">
            {current.fields.map((field) => (
              <Field
                key={field.key}
                field={field}
                value={values[field.key] ?? ''}
                onChange={(value) => write({ [field.key]: value, _reviewed: '' })}
              />
            ))}
          </div>
          <small className="gx-muted">
            هر موردی که نمی‌دانی خالی بماند؛ صفر یعنی واقعاً مقدار صفر بوده است.
          </small>
        </GuideCard>
      )}
      {mode === 'result' && (
        <div className="gx-results">
          <div className="gx-review-heading">
            <div>
              <h2>{toolId === 'finance' ? 'تصویر مالی این دوره' : 'آنچه تا اینجا روشن شده'}</h2>
              <p>
                {fa(count)} از {fa(fields.length)} پاسخ ثبت شده؛ پاسخ خالی نامشخص می‌ماند.
              </p>
            </div>
            <button className="ex-button ex-button--outline" onClick={() => setMode('guide')}>
              ادامه / ویرایش
              <Icon name="edit" />
            </button>
          </div>
          {toolId === 'finance' && <FinanceResults values={values} />}
          {toolId === 'retention' && (
            <div className="gx-score">
              <span>نرخ بازگشت همان گروه</span>
              <strong>
                {retentionRate(values) === null
                  ? 'نیاز به داده'
                  : `${fa(retentionRate(values)! * 100)}٪`}
              </strong>
              <p>
                مشتریان بازگشتهٔ همان گروه ÷ تعداد گروه اولیه × ۱۰۰؛ تعریف گروه و بازه باید یکسان
                باشد. این مقدار، نرخ حفظ درآمد یا پیش‌بینی وفاداری نیست.
              </p>
            </div>
          )}
          <div className="gx-review-list">
            {definition.steps.map((item, index) => (
              <details key={item.id}>
                <summary>
                  {item.title}
                  <span>
                    {fa(item.fields.filter((f) => values[f.key]?.trim()).length)} /{' '}
                    {fa(item.fields.length)}
                  </span>
                </summary>
                <div>
                  <ResultRows
                    rows={item.fields.map((f) => ({
                      label: f.label,
                      value:
                        f.options?.find((o) => o.value === values[f.key])?.label ||
                        values[f.key] ||
                        'هنوز مشخص نیست',
                    }))}
                  />
                  <button
                    className="ex-button ex-button--quiet"
                    onClick={() => {
                      move(index);
                      setMode('guide');
                    }}
                  >
                    ویرایش این بخش
                  </button>
                </div>
              </details>
            ))}
          </div>
          {toolId === 'swot' && (
            <Link className="ex-button" to={path(space, 'tool/matrices')}>
              وزن‌دهی عوامل در IFE / EFE
              <Icon name="arrow" />
            </Link>
          )}
          <div className="gx-result-actions">
            <Link className="ex-button ex-button--outline" to={path(space, 'library')}>
              منابع و مستندات
            </Link>
            <Link className="ex-button" to={path(space, 'actions')}>
              ثبت اقدام بعدی
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

function FinanceResults({ values }: { values: Record<string, string> }) {
  const [all, setAll] = useState(false);
  const [group, setGroup] = useState('profit');
  const groups = [
    {
      id: 'profit',
      label: 'درآمد و هزینه',
      ids: [
        'gross',
        'grossMargin',
        'contribution',
        'contributionMargin',
        'operating',
        'breakEven',
        'netMargin',
      ],
    },
    { id: 'cash', label: 'نقدینگی', ids: ['workingCapital', 'currentRatio', 'runway'] },
    { id: 'return', label: 'جذب و بازده', ids: ['cac', 'roa', 'roe'] },
  ];
  const results = financeResults(values);
  const available = results.filter((r) => r.value !== null);
  const moneyUnit = `${values.scale === '1000000' ? 'میلیون ' : values.scale === '1000' ? 'هزار ' : ''}${({ IRT: 'تومان', IRR: 'ریال', USD: 'دلار آمریکا' } as Record<string, string>)[values.currency] ?? 'واحد نامشخص'}`;
  return (
    <>
      <p className="gx-context">
        <bdi>{values.periodStart || 'شروع نامشخص'}</bdi> تا{' '}
        <bdi>{values.periodEnd || 'پایان نامشخص'}</bdi>{' '}
        <span>
          {moneyUnit} ·{' '}
          {values.basis === 'estimate'
            ? 'برآورد / پیش‌بینی'
            : values.basis === 'cash'
              ? 'مبنای نقدی'
              : values.basis === 'actual'
                ? 'مبنای تعهدی'
                : 'مبنای نامشخص'}
        </span>
      </p>
      {!available.length && (
        <p className="gx-callout">
          هنوز ورودی کافی برای محاسبه نداریم. دوره و واحد پول را مشخص کن و فقط اعدادی را که در
          اختیار داری وارد کن.
        </p>
      )}
      <div className="ex-filter-group" aria-label="گروه شاخص‌های مالی">
        {groups.map((item) => (
          <button key={item.id} aria-pressed={group === item.id} onClick={() => setGroup(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="gx-metrics">
        {(all ? results : available)
          .filter((item) => groups.find((g) => g.id === group)!.ids.includes(item.id))
          .map((item) => (
            <article key={item.id}>
              <h3>{item.label}</h3>
              <strong className="gx-metric-value">
                {item.value === null ? 'نیاز به داده' : fa(item.value * (item.percent ? 100 : 1))}
                <small>
                  {item.value !== null ? (item.percent ? '٪' : item.unit || moneyUnit) : ''}
                </small>
              </strong>
              <p>{item.value === null ? item.missing : item.note}</p>
              <details>
                <summary>روش محاسبه و محدودیت</summary>
                <p>{item.formula}</p>
                <p>{item.note}</p>
              </details>
            </article>
          ))}
      </div>
      <button className="ex-button ex-button--quiet" onClick={() => setAll(!all)}>
        {all
          ? 'فقط شاخص‌های قابل محاسبه'
          : `دیدن ${fa(results.length - available.length)} شاخصِ نیازمند داده`}
      </button>
      <Learn>
        این محاسبات از توابع موجود پروژه و تعاریف ثبت‌شده استفاده می‌کنند؛ هنوز گزارش سرور یا نظر
        حسابرس نیستند. راهنمای اصلی:{' '}
        <a
          href="https://openstax.org/books/principles-managerial-accounting/pages/3-2-calculate-a-break-even-point-in-units-and-dollars"
          target="_blank"
          rel="noreferrer"
        >
          OpenStax، تحلیل سربه‌سر
        </a>
        . نتیجهٔ سربه‌سر به فرض‌های هزینه و ترکیب فروش وابسته است؛ سود و نقدینگی را جدا بررسی کن.
      </Learn>
    </>
  );
}
