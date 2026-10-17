import { useState } from 'react';
import { Link } from 'react-router';
import {
  evaluateMatrix,
  type EvaluationMatrixKind,
  type EvaluationMatrixRow,
} from '@stratino/domain/evaluation-matrices';
import type { Space } from './model';
import { path, uid } from './store';
import { Icon } from './ExperienceUI';
import { GuideCard, GuideHeader, GuideStart, Learn, Choice, useToolDraft, fa } from './GuidedFlow';
import { readNumber } from './guidedCalculations';

function decodeRows(raw: string | undefined, kind: EvaluationMatrixKind): EvaluationMatrixRow[] {
  try {
    const rows: unknown = JSON.parse(raw || '[]');
    if (!Array.isArray(rows) || rows.length > 100) return [];
    return rows.filter(
      (r): r is EvaluationMatrixRow =>
        !!r &&
        typeof r === 'object' &&
        typeof r.id === 'string' &&
        typeof r.title === 'string' &&
        typeof r.evidence === 'string' &&
        (kind === 'ife' ? ['strength', 'weakness'] : ['opportunity', 'threat']).includes(
          r.factor_type,
        ) &&
        (r.weight === null || typeof r.weight === 'number') &&
        (r.rating === null || typeof r.rating === 'number'),
    );
  } catch {
    return [];
  }
}
export function GuidedMatrix({ space }: { space: Space }) {
  const [kind, setKind] = useState<EvaluationMatrixKind>('ife');
  return (
    <>
      <GuideHeader
        space={space}
        title="ماتریس‌های IFE و EFE"
        description="عوامل را یکی‌یکی تعریف، وزن‌دهی و ارزیابی کن؛ محاسبه با همان اعداد خودت انجام می‌شود."
      />
      <div className="ex-filter-group gx-kind" aria-label="نوع ماتریس">
        {(['ife', 'efe'] as const).map((k) => (
          <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === 'ife' ? 'IFE · عوامل داخلی' : 'EFE · عوامل بیرونی'}
          </button>
        ))}
      </div>
      <MatrixFlow key={`${space.id}:${kind}`} space={space} kind={kind} />
    </>
  );
}

function MatrixFlow({ space, kind }: { space: Space; kind: EvaluationMatrixKind }) {
  const { values, write, message } = useToolDraft(space, `matrix:${kind}`);
  const rows = decodeRows(values.rows, kind);
  const [mode, setMode] = useState<'home' | 'guide' | 'between' | 'result'>(
    values.reviewed ? 'result' : 'home',
  );
  const [index, setIndex] = useState(
    Math.max(0, Math.min(Number(values.index) || 0, rows.length - 1)),
  );
  const [step, setStep] = useState(Math.max(0, Math.min(Number(values.step) || 0, 2)));
  const [error, setError] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [removeId, setRemoveId] = useState('');
  const row = rows[index];
  const result = evaluateMatrix(kind, rows);
  const label = kind.toUpperCase();
  const types =
    kind === 'ife'
      ? [
          { value: 'strength', label: 'قوت داخلی' },
          { value: 'weakness', label: 'ضعف داخلی' },
        ]
      : [
          { value: 'opportunity', label: 'فرصت بیرونی' },
          { value: 'threat', label: 'تهدید بیرونی' },
        ];
  const ratings =
    kind === 'efe'
      ? [
          { value: '1', label: '۱ · پاسخ ضعیف', hint: 'پاسخ شرکت به این عامل ضعیف است.' },
          { value: '2', label: '۲ · پاسخ متوسط', hint: 'پاسخ شرکت در سطح متوسط است.' },
          { value: '3', label: '۳ · پاسخ بالاتر از متوسط', hint: 'پاسخ شرکت بالاتر از متوسط است.' },
          { value: '4', label: '۴ · پاسخ برتر', hint: 'پاسخ شرکت به این عامل برتر است.' },
        ]
      : row?.factor_type === 'strength'
        ? [
            { value: '3', label: '۳ · قوت نسبی' },
            { value: '4', label: '۴ · قوت عمده' },
          ]
        : [
            { value: '1', label: '۱ · ضعف عمده' },
            { value: '2', label: '۲ · ضعف نسبی' },
          ];
  function saveRows(next: EvaluationMatrixRow[], updates: Record<string, string> = {}) {
    return write({ rows: JSON.stringify(next), reviewed: '', ...updates });
  }
  function editRow(updates: Partial<EvaluationMatrixRow>) {
    saveRows(rows.map((r, i) => (i === index ? { ...r, ...updates } : r)));
  }
  function edit(at: number) {
    if (write({ index: String(at), step: '0' })) {
      setIndex(at);
      setStep(0);
      setMode('guide');
      setError('');
    }
  }
  function add() {
    if (rows.length >= 100) {
      setError('حداکثر ۱۰۰ عامل در هر ماتریس قابل ثبت است.');
      return;
    }
    const next = [
      ...rows,
      {
        id: uid(),
        title: '',
        evidence: '',
        factor_type: kind === 'ife' ? 'strength' : 'opportunity',
        weight: null,
        rating: null,
      } as EvaluationMatrixRow,
    ];
    if (saveRows(next, { index: String(rows.length), step: '0' })) {
      setIndex(rows.length);
      setStep(0);
      setMode('guide');
      setError('');
    }
  }
  function changeStep(next: number) {
    if (write({ step: String(next) })) {
      setStep(next);
      setWeightInput('');
      setError('');
    }
  }
  function next() {
    if (step === 0 && !row.title.trim()) {
      setError('یک عامل مشخص بنویس؛ برای دیدن پیش‌نویس از «فعلاً بستن» استفاده کن.');
      return;
    }
    if (
      step === 1 &&
      weightInput &&
      (readNumber(weightInput) === null ||
        readNumber(weightInput)! < 0 ||
        readNumber(weightInput)! > 100)
    ) {
      setError('وزن باید عددی بین صفر تا ۱۰۰ باشد.');
      return;
    }
    if (step < 2) changeStep(step + 1);
    else {
      setMode('between');
      setError('');
    }
  }
  function importSwot() {
    const keys = kind === 'ife' ? ['strengths', 'weaknesses'] : ['opportunities', 'threats'];
    const next = keys.flatMap((key, i) =>
      (space.toolNotes[`swot:${key}`] || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
        .map(
          (title) =>
            ({
              id: uid(),
              title,
              evidence: '',
              factor_type: types[i].value,
              weight: null,
              rating: null,
            }) as EvaluationMatrixRow,
        ),
    );
    if (!next.length) {
      setError('هنوز عامل نوشته‌شده‌ای در SWOT این فضای کار وجود ندارد.');
      return;
    }
    if (rows.length + next.length > 100) {
      setError('با این کپی، تعداد عوامل از ۱۰۰ بیشتر می‌شود؛ ابتدا عوامل را در SWOT محدود کن.');
      return;
    }
    if (saveRows([...rows, ...next], { snapshot: new Date().toISOString() })) {
      setMode('result');
      setError('');
    }
  }
  return (
    <>
      <p className="gx-save-state" role="status">
        {message}
      </p>
      {mode === 'home' && (
        <>
          <GuideStart
            title={
              kind === 'ife'
                ? 'قابلیت‌های درون کسب‌وکار را بسنج.'
                : 'پاسخ کسب‌وکار به محیط بیرونی را بسنج.'
            }
            description={
              kind === 'ife'
                ? 'قوت و ضعف، اهمیت هر عامل و وضعیت شما در آن را جدا می‌کنیم.'
                : 'فرصت و تهدید، اهمیت هر عامل و کیفیت پاسخ شرکت به آن را جدا می‌کنیم.'
            }
            steps={['تعریف عامل و شاهد', 'وزن اهمیت از ۱۰۰', 'نمرهٔ ۱ تا ۴', 'مرور عوامل و محاسبه']}
            started={rows.length > 0}
            onStart={() => (rows.length ? setMode('guide') : add())}
          />
          <div className="gx-import">
            <button className="ex-button ex-button--quiet" onClick={importSwot}>
              کپی عوامل موجود از SWOT
            </button>
            <small>کپی مستقل با انتخاب شما؛ وزن و نمره خودکار تعیین نمی‌شوند.</small>
          </div>
        </>
      )}
      {mode === 'guide' && row && (
        <GuideCard
          title={
            step === 0
              ? `عامل ${fa(index + 1)}: چه چیزی مهم است؟`
              : step === 1
                ? 'این عامل چقدر اهمیت دارد؟'
                : 'وضعیت شما در برابر این عامل چیست؟'
          }
          description={
            step === 0
              ? 'عنوان دقیق و شاهدی که از این عامل داری.'
              : step === 1
                ? 'وزن، اهمیت عامل است؛ نمره، وضعیت یا پاسخ شما. این دو را جدا نگه دار.'
                : kind === 'ife'
                  ? 'نمره با نوع عامل داخلی هماهنگ است.'
                  : 'در EFE نمرهٔ بالا یعنی پاسخ بهتر شرکت، نه فرصت جذاب‌تر یا تهدید شدیدتر.'
          }
          step={step}
          total={3}
          onBack={() => (step ? changeStep(step - 1) : setMode('result'))}
          onPause={() => setMode('result')}
          onNext={next}
          nextLabel={step === 2 ? 'ثبت این عامل' : 'ادامه'}
          error={error}
        >
          <Learn
            example={
              kind === 'ife'
                ? 'مثال آموزشی: وابستگی فروش به یک مشتری عمده؛ عنوان را با سهم فروش و تاریخ گزارش دقیق کن.'
                : 'مثال آموزشی: تغییر مقررات واردات؛ منبع مقرره، تاریخ و اثر بر شرکت را ثبت کن.'
            }
          >
            وزن‌ها باید در پایان برای هر ماتریس جداگانه جمعاً ۱۰۰ شوند. نمرهٔ IFE: ضعف عمده ۱، ضعف
            نسبی ۲، قوت نسبی ۳، قوت عمده ۴. در EFE، نمره از پاسخ ضعیف ۱ تا پاسخ برتر ۴ است؛ فرصت یا
            تهدید بودن آن را تعیین نمی‌کند.
          </Learn>
          {step === 0 && (
            <div className="gx-fields">
              <Choice
                value={row.factor_type}
                options={types}
                label="نوع عامل"
                onChange={(value) =>
                  editRow({
                    factor_type: value as EvaluationMatrixRow['factor_type'],
                    rating: null,
                  })
                }
              />
              <label className="ex-field">
                عنوان عامل
                <input
                  maxLength={500}
                  value={row.title}
                  onChange={(e) => editRow({ title: e.target.value })}
                  placeholder="یک قابلیت یا تغییر مشخص…"
                />
              </label>
              <label className="ex-field">
                شاهد، منبع و تاریخ
                <textarea
                  rows={3}
                  maxLength={5000}
                  value={row.evidence}
                  onChange={(e) => editRow({ evidence: e.target.value })}
                  placeholder="اگر شاهد نداری خالی بگذار؛ نتیجه پیش‌نویس باقی می‌ماند."
                />
              </label>
            </div>
          )}
          {step === 1 && (
            <div className="gx-fields">
              <h3>{row.title}</h3>
              <label className="ex-field">
                وزن اهمیت این عامل، از ۱۰۰
                <input
                  inputMode="decimal"
                  dir="ltr"
                  value={weightInput || (row.weight === null ? '' : String(row.weight))}
                  placeholder="نامشخص"
                  maxLength={12}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setWeightInput(raw);
                    const n = readNumber(raw);
                    editRow({ weight: n !== null && n >= 0 && n <= 100 ? n : null });
                  }}
                />
              </label>
              <p>
                جمع وزن فعلی: <strong>{fa(result.total_weight)} از ۱۰۰</strong>؛{' '}
                {result.total_weight <= 100
                  ? `${fa(100 - result.total_weight)} باقی مانده`
                  : `${fa(result.total_weight - 100)} اضافه است`}
                .
              </p>
              <small>
                وزن‌ها خودکار تغییر نمی‌کنند؛ برای مرور و اصلاح همهٔ عوامل به نتیجه برگرد.
              </small>
            </div>
          )}
          {step === 2 && (
            <>
              <h3>{row.title}</h3>
              <Choice
                value={String(row.rating ?? '')}
                options={ratings}
                label="نمرهٔ عامل"
                onChange={(value) => editRow({ rating: Number(value) })}
              />
              <button
                type="button"
                className="ex-button ex-button--quiet"
                onClick={() => editRow({ rating: null })}
              >
                هنوز نمره را نمی‌دانم
              </button>
            </>
          )}
        </GuideCard>
      )}
      {mode === 'between' && (
        <section className="gx-start gx-between">
          <span className="gx-start-icon">
            <Icon name="check" size={32} />
          </span>
          <h2>این عامل ثبت شد.</h2>
          <p>
            {fa(rows.length)} عامل تا اینجا؛ جمع وزن‌ها {fa(result.total_weight)} از ۱۰۰ است.
          </p>
          <div className="gx-result-actions">
            <button className="ex-button" onClick={add}>
              <Icon name="plus" />
              عامل بعدی
            </button>
            <button
              className="ex-button ex-button--outline"
              onClick={() => {
                if (write({ reviewed: '1' })) setMode('result');
              }}
            >
              مرور و محاسبه
            </button>
          </div>
        </section>
      )}
      {mode === 'result' && (
        <div className="gx-results">
          <div className="gx-review-heading">
            <div>
              <h2>نتیجهٔ {label}</h2>
              <p>روش {kind}-v1؛ محاسبهٔ محلی بر اساس ورودی‌های همین فضا.</p>
            </div>
            <button className="ex-button" onClick={add}>
              <Icon name="plus" />
              عامل تازه
            </button>
          </div>
          <section className="gx-score">
            <span>
              {result.can_finalize
                ? 'امتیاز محاسبه‌شده؛ نیازمند بازبینی انسانی'
                : 'پیش‌نویس ارزیابی'}
            </span>
            <strong>
              {result.rounded_score === null
                ? 'هنوز قابل محاسبه نیست'
                : `${fa(result.rounded_score)} از ۴`}
            </strong>
            <p>جمع وزن: {fa(result.total_weight)} از ۱۰۰</p>
            {result.ready && (
              <div
                className="gx-score-scale"
                role="img"
                aria-label={`امتیاز ${fa(result.rounded_score!)} از چهار؛ نقطهٔ میانی ۲٫۵`}
              >
                <i style={{ insetInlineStart: `${((result.rounded_score! - 1) / 3) * 100}%` }} />
                <span>۱</span>
                <span>نقطهٔ میانی ۲٫۵</span>
                <span>۴</span>
              </div>
            )}
            <p>
              {kind === 'ife'
                ? 'این امتیاز ارزیابی وزنی عوامل داخلی انتخاب‌شده است.'
                : 'این امتیاز کیفیت پاسخ شرکت به عوامل بیرونی انتخاب‌شده را نشان می‌دهد.'}{' '}
              نقطهٔ ۲٫۵ فقط میانهٔ مقیاس است؛ موفقیت، شکست یا انتخاب راهبرد را به‌تنهایی تعیین
              نمی‌کند.
            </p>
          </section>
          {!result.can_finalize && (
            <div className="gx-callout">
              <strong>برای کامل‌ترشدن ارزیابی</strong>
              <ul>
                {!rows.length && <li>حداقل یک عامل تعریف کن.</li>}
                {rows.some((r) => !r.title.trim()) && <li>عنوان عوامل بدون نام را مشخص کن.</li>}
                {Math.abs(result.total_weight - 100) >= 0.001 && (
                  <li>جمع وزن‌ها را دقیقاً به ۱۰۰ برسان؛ وزن‌ها خودکار نرمال نمی‌شوند.</li>
                )}
                {rows.some((r) => r.weight === null || r.rating === null) && (
                  <li>وزن و نمرهٔ عوامل نامشخص را تکمیل کن.</li>
                )}
                {rows.some((r) => !r.evidence.trim()) && (
                  <li>شاهد هر عامل را اضافه کن؛ امتیاز بدون شاهد، پیش‌نویس است.</li>
                )}
              </ul>
            </div>
          )}
          <div className="gx-table-wrap">
            <table>
              <caption>عوامل {label} و سهم هر عامل از امتیاز</caption>
              <thead>
                <tr>
                  <th>عامل</th>
                  <th>نوع</th>
                  <th>وزن ٪</th>
                  <th>نمره</th>
                  <th>سهم وزنی</th>
                  <th>ویرایش</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, at) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.title || 'بدون عنوان'}</strong>
                      <small>{r.evidence || 'شاهد ثبت نشده'}</small>
                    </td>
                    <td>{types.find((t) => t.value === r.factor_type)?.label}</td>
                    <td>{r.weight === null ? 'نامشخص' : fa(r.weight)}</td>
                    <td>{r.rating === null ? 'نامشخص' : fa(r.rating)}</td>
                    <td>
                      {r.weight === null || r.rating === null
                        ? '—'
                        : fa((r.weight / 100) * r.rating, 4)}
                    </td>
                    <td>
                      <button
                        className="ex-button ex-button--quiet"
                        onClick={() => edit(at)}
                        aria-label={`ویرایش عامل ${at + 1}`}
                      >
                        ویرایش
                      </button>
                      {removeId === r.id ? (
                        <>
                          <button
                            className="ex-button ex-button--quiet"
                            onClick={() => {
                              saveRows(rows.filter((x) => x.id !== r.id));
                              setRemoveId('');
                            }}
                          >
                            تأیید حذف
                          </button>
                          <button
                            className="ex-button ex-button--quiet"
                            onClick={() => setRemoveId('')}
                          >
                            انصراف
                          </button>
                        </>
                      ) : (
                        <button
                          className="ex-button ex-button--quiet"
                          onClick={() => setRemoveId(r.id)}
                          aria-label={`حذف عامل ${at + 1}`}
                        >
                          حذف
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Learn>
            امتیاز برابر مجموعِ «وزن درصدی ÷ ۱۰۰ × نمره» است. کیفیت شواهد، انتخاب عوامل و قضاوت
            ارزیاب بر اعتبار تحلیل اثر دارند. ارزیابی IFE و EFE جدا می‌ماند؛ از یک امتیاز به‌تنهایی
            راهبرد تولید نمی‌کنیم.
          </Learn>
          <div className="gx-result-actions">
            <button className="ex-button ex-button--outline" onClick={importSwot}>
              کپی عوامل SWOT
            </button>
            <Link className="ex-button ex-button--quiet" to={path(space, 'tool/swot')}>
              برگشت به SWOT
            </Link>
          </div>
          {values.snapshot && (
            <small>
              کپی مستقل از SWOT در {new Date(values.snapshot).toLocaleString('fa-IR')}؛ تغییرات بعدی
              SWOT این عوامل را عوض نمی‌کند.
            </small>
          )}
        </div>
      )}
      {error && mode !== 'guide' && (
        <p className="gx-error" role="alert">
          {error}
        </p>
      )}
      {(space.toolNotes['matrices:internal'] || space.toolNotes['matrices:external']) && (
        <details className="gx-learn">
          <summary>یادداشت‌های نسخهٔ قبلی</summary>
          <p className="gx-prewrap">{space.toolNotes['matrices:internal']}</p>
          <p className="gx-prewrap">{space.toolNotes['matrices:external']}</p>
        </details>
      )}
    </>
  );
}
