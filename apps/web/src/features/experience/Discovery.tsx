import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Empty, Icon } from './ExperienceUI';
import { Header } from './ExperienceShell';
import { ChoiceGroup, ColorPicker } from './ExperienceForms';
import { useSpaces, path, number, uid } from './store';
import {
  changeGoal,
  createSpace,
  followUps,
  freshDraft,
  goalLabels,
  isSpace,
  kindLabels,
  recommendedTools,
  stageLabels,
  tools,
  updateSpace,
  type Draft,
  type Goal,
} from './model';
import { DRAFT_KEY } from './local';
function readDraft(): Draft {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    if (
      raw &&
      isSpace({ ...createSpace({ ...freshDraft, name: '_' }, '_'), ...raw, name: raw.name || '_' })
    )
      return { ...freshDraft, ...raw };
  } catch {
    /* Keep the first-run form available without storage. */
  }
  return { ...freshDraft };
}
export function Discovery() {
  const { spaceId } = useParams();
  const { spaces, save, error } = useSpaces();
  const existing = spaces.find((s) => s.id === spaceId);
  const [draft, setDraft] = useState<Draft>(() => (existing ? { ...existing } : readDraft()));
  const [step, setStep] = useState(0);
  const [validation, setValidation] = useState('');
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  function change(next: Draft) {
    setDraft(next);
    setValidation('');
    if (!existing) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      } catch {
        setValidation('پیش‌نویس ذخیره نشد. پیش از خروج، ساخت فضا را کامل کنید.');
      }
    }
  }
  function finish(blank = false) {
    const data = blank ? { ...freshDraft, name: draft.name, color: draft.color } : draft;
    try {
      const space = existing
        ? { ...existing, ...data, setupComplete: true }
        : { ...createSpace(data, uid()), setupComplete: !blank };
      if (!save(existing ? updateSpace(spaces, existing.id, () => space) : [...spaces, space]))
        return;
      if (!existing) {
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          /* The workspace has already been saved successfully. */
        }
      }
      navigate(path(space), { replace: true });
    } catch (e) {
      setValidation(e instanceof Error ? e.message : 'ساخت فضای کار انجام نشد.');
    }
  }
  function next(e: FormEvent) {
    e.preventDefault();
    if (step === 0 && !draft.name.trim()) {
      setValidation('نام کسب‌وکارتان را وارد کنید.');
      return;
    }
    if (step === 4 && !draft.answer) {
      setValidation('یک گزینه را انتخاب کنید؛ «بعداً» هم می‌تواند پاسخ شما باشد.');
      return;
    }
    if (step === 5) finish();
    else {
      setValidation('');
      setStep(step + 1);
    }
  }
  const questions = [
    'اسم کسب‌وکارت چیست؟',
    'چه نوع کسب‌وکاری داری؟',
    'الان در چه وضعیتی هستی؟',
    'می‌خواهی از کجا شروع کنی؟',
    followUps[draft.goal].title,
    'همه‌چیز برای شروع آماده است.',
  ];
  const hints = [
    'این نام را در فهرست فضاهای کاری می‌بینی. هر فضا برای یک کسب‌وکار است.',
    'سؤال‌ها و فضای اولیه را متناسب با انتخابت آماده می‌کنیم.',
    'این فقط توصیف خودت است؛ هر وقت خواستی می‌توانی تغییرش بدهی.',
    'لازم نیست همهٔ کارها را همین حالا انجام بدهی. یک هدف انتخاب کن.',
    followUps[draft.goal].hint,
    'اطلاعات را مرور کن؛ بعداً هم قابل ویرایش‌اند.',
  ];
  if (spaceId && !existing)
    return (
      <>
        <Header simple />
        <Empty
          title="فضای کار پیدا نشد"
          text="از فهرست فضاها یک کسب‌وکار انتخاب کنید."
          action={
            <Link className="ex-button" to="/preview/workspaces">
              فضاهای کاری
            </Link>
          }
        />
      </>
    );
  return (
    <>
      <Header simple />
      <div className="ex-discovery">
        <div className="ex-progress-meta">
          <span>{existing ? 'تکمیل شناخت کسب‌وکار' : 'ساخت فضای کار'}</span>
          <span>
            گام {number(step + 1)} از {number(6)}
          </span>
        </div>
        <progress value={step + 1} max={6} aria-label="پیشرفت ساخت فضای کار" />
        <form onSubmit={next} className="ex-question" key={step}>
          <h1 ref={heading} tabIndex={-1}>
            {questions[step]}
          </h1>
          <p className="ex-question-hint">{hints[step]}</p>
          {step === 0 && (
            <div className="ex-name-step">
              <label className="ex-field">
                نام کسب‌وکار
                <input
                  autoComplete="organization"
                  value={draft.name}
                  maxLength={80}
                  placeholder="مثلاً: استودیو آبان"
                  onChange={(e) => change({ ...draft, name: e.target.value })}
                  aria-invalid={!!validation}
                  aria-describedby={validation ? 'discovery-error' : undefined}
                />
              </label>
              <span className="ex-field-caption">کوتاه، روشن و قابل تشخیص.</span>
              <ColorPicker value={draft.color} onChange={(color) => change({ ...draft, color })} />
            </div>
          )}
          {step === 1 && (
            <ChoiceGroup
              label="نوع کسب‌وکار"
              choices={Object.entries(kindLabels).map(([id, label]) => ({
                id,
                label,
                text: {
                  startup: 'یک ایده یا محصول نوپا که مسیرش را پیدا می‌کند.',
                  business: 'کسب‌وکاری که محصول، خدمت یا مشتری دارد.',
                  organization: 'یک شرکت یا واحد سازمانی با ساختار مشخص.',
                }[id],
                icon: id === 'startup' ? 'spark' : id === 'business' ? 'chart' : 'people',
              }))}
              value={draft.kind}
              onChange={(kind) => change({ ...draft, kind: kind as Draft['kind'] })}
            />
          )}
          {step === 2 && (
            <ChoiceGroup
              label="وضعیت فعلی"
              choices={Object.entries(stageLabels).map(([id, label]) => ({
                id,
                label,
                icon:
                  id === 'idea'
                    ? 'spark'
                    : id === 'building'
                      ? 'settings'
                      : id === 'operating'
                        ? 'chart'
                        : 'compass',
              }))}
              value={draft.stage}
              onChange={(stage) => change({ ...draft, stage: stage as Draft['stage'] })}
            />
          )}
          {step === 3 && (
            <ChoiceGroup
              label="هدف شروع"
              choices={Object.entries(goalLabels).map(([id, label]) => ({
                id,
                label,
                icon: {
                  customers: 'people',
                  growth: 'chart',
                  strategy: 'compass',
                  execution: 'check',
                }[id],
              }))}
              value={draft.goal}
              onChange={(goal) => change(changeGoal(draft, goal as Goal))}
            />
          )}
          {step === 4 && (
            <ChoiceGroup
              label="اطلاعات مرتبط"
              choices={followUps[draft.goal].options.map((id) => ({ id, label: id }))}
              value={draft.answer}
              onChange={(answer) => change({ ...draft, answer })}
            />
          )}
          {step === 5 && (
            <div className="ex-review">
              <div className="ex-review-name">
                <span className={`ex-space-avatar ex-color--${draft.color}`}>{draft.name[0]}</span>
                <strong>{draft.name}</strong>
              </div>
              {[
                [1, 'نوع', kindLabels[draft.kind]],
                [2, 'وضعیت فعلی', stageLabels[draft.stage]],
                [3, 'هدف شروع', goalLabels[draft.goal]],
                [4, 'اطلاعات تکمیلی', draft.answer],
              ].map(([index, label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <button
                    type="button"
                    className="ex-text-button"
                    onClick={() => setStep(Number(index))}
                  >
                    ویرایش
                  </button>
                </div>
              ))}
              <p>
                میان‌برهای اولیه:{' '}
                {recommendedTools(draft)
                  .map((id) => tools.find((t) => t.id === id)?.title)
                  .join('، ')}
              </p>
            </div>
          )}
          {(validation || error) && (
            <p id="discovery-error" className="ex-alert" role="alert">
              {validation || error}
            </p>
          )}
          <div className="ex-question-actions">
            {step > 0 ? (
              <button
                type="button"
                className="ex-button ex-button--quiet"
                onClick={() => {
                  setValidation('');
                  setStep(step - 1);
                }}
              >
                بازگشت
              </button>
            ) : (
              <Link className="ex-button ex-button--quiet" to="/preview/workspaces">
                فعلاً بعداً
              </Link>
            )}
            <button className="ex-button" type="submit">
              {step === 5 ? (existing ? 'ذخیره و بازگشت به فضا' : 'ساخت فضای کار') : 'ادامه'}
              <Icon name={step === 5 ? 'check' : 'arrow'} />
            </button>
          </div>
        </form>
        {step === 0 && !existing && (
          <button
            className="ex-text-button ex-blank-start"
            disabled={!draft.name.trim()}
            onClick={() => finish(true)}
          >
            با همین نام، یک فضای خالی می‌سازم
          </button>
        )}
        <p className="ex-discovery-footer">
          {existing
            ? 'اطلاعات قبلی فقط پس از تأیید نهایی تغییر می‌کند.'
            : 'پاسخ‌ها در پیش‌نویس همین مرورگر می‌مانند.'}
        </p>
      </div>
    </>
  );
}
