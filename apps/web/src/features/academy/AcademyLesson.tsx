import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@stratino/ui';
import { gradePractice } from '@stratino/domain/academy';
import { academyLessons, academySources } from './content';
import type { LessonContent } from './content';
import { AcademyIcon } from './AcademyIcons';
import { AcademyMascot } from './AcademyMascot';

type Draft = {
  step: number;
  answers: Record<string, string>;
  checked: boolean;
  note: string;
  prediction: string;
};
const fresh = (): Draft => ({ step: 0, answers: {}, checked: false, note: '', prediction: '' });
const draftKey = (lesson: LessonContent) =>
  `stratino-academy-draft-v1:${lesson.id}:${lesson.version}`;
function readDraft(lesson: LessonContent): Draft {
  try {
    const d = JSON.parse(sessionStorage.getItem(draftKey(lesson)) ?? 'null');
    if (
      !d ||
      !Number.isInteger(d.step) ||
      d.step < 0 ||
      d.step > lesson.questions.length + 3 ||
      typeof d.note !== 'string' ||
      typeof d.prediction !== 'string' ||
      typeof d.checked !== 'boolean' ||
      !d.answers ||
      typeof d.answers !== 'object' ||
      Array.isArray(d.answers)
    )
      return fresh();
    for (const [id, answer] of Object.entries(d.answers)) {
      if (!lesson.questions.find((q) => q.id === id)?.choices.some((c) => c.id === answer))
        return fresh();
    }
    const question = lesson.questions[d.step - 3];
    if (
      (d.checked && question && !d.answers[question.id]) ||
      (d.step >= 3 && lesson.questions.slice(0, d.step - 3).some((q) => !d.answers[q.id]))
    )
      return fresh();
    return d;
  } catch {
    return fresh();
  }
}

export function AcademyLesson({
  lesson,
  onComplete,
}: {
  lesson: LessonContent;
  onComplete: (lesson: LessonContent, answers: Record<string, string>) => void;
}) {
  const [draft, setDraft] = useState(() => readDraft(lesson));
  const [storageWarning, setStorageWarning] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const { step, answers, checked, note, prediction } = draft;
  const lastStep = lesson.questions.length + 3;
  const question = lesson.questions[step - 3];
  const result = gradePractice(lesson, answers);
  const next = academyLessons[academyLessons.findIndex((item) => item.id === lesson.id) + 1];
  const number = new Intl.NumberFormat('fa-IR');
  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey(lesson), JSON.stringify(draft));
    } catch {
      setStorageWarning(true);
    }
  }, [draft, lesson]);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (checked) feedback.current?.focus();
  }, [checked]);
  function advance() {
    setDraft((d) => ({ ...d, step: d.step + 1, checked: false }));
  }
  return (
    <article className="academy-lesson academy-player" lang="fa" dir="rtl">
      <div className="academy-player-top">
        <Link to="/academy" className="academy-back" aria-label="بازگشت به مسیر">
          ×
        </Link>
        <progress aria-label="پیشرفت این درس" value={step} max={lastStep} />
        <span>
          {number.format(Math.min(step + 1, lastStep))} / {number.format(lastStep)}
        </span>
      </div>
      <p className="academy-muted">فصل اول · شرکت فرضی آوند</p>
      <h1>{lesson.title}</h1>
      {storageWarning && (
        <p className="academy-warning" role="alert">
          ادامه درس و یادداشت در مرورگر ذخیره نشد؛ قبل از خروج یادداشت را کپی کن.
        </p>
      )}
      <div className="academy-step" key={step}>
        <p className="academy-step-label">
          {step === 0
            ? 'داستان'
            : step === 1
              ? 'نظر اولیه تو'
              : step === 2
                ? 'کشف ایده'
                : step === lastStep
                  ? 'نتیجه تمرین'
                  : `تصمیم ${number.format(step - 2)}`}
        </p>
        <h2 ref={heading} tabIndex={-1}>
          {step === 0
            ? 'تو در تیم آوند هستی'
            : step === 1
              ? 'قبل از یادگیری، تو چه می‌کنی؟'
              : step === 2
                ? 'ایده اصلی'
                : step === lastStep
                  ? result.passed
                    ? 'این تمرین را کامل کردی'
                    : 'یک بار دیگر، با دلیل روشن‌تر'
                  : 'حالا تو تصمیم بگیر'}
        </h2>
        {step === 0 && (
          <>
            <div className="academy-scene">
              <AcademyMascot mood="welcome" />
              <p>{lesson.scene}</p>
            </div>
            <p className="academy-objective">بعد از این درس می‌توانی {lesson.objective}</p>
          </>
        )}
        {step === 1 && (
          <>
            <div className="academy-coach">
              <AcademyMascot mood="thinking" />
              <p>{lesson.questions[0].prompt}</p>
            </div>
            <p className="academy-muted">این انتخاب نمره ندارد؛ فقط برداشت اولیه‌ات را ثبت کن.</p>
            <fieldset>
              <legend>انتخاب اولیه</legend>
              <div className="academy-choices">
                {lesson.questions[0].choices.map((choice) => (
                  <label
                    key={choice.id}
                    className={prediction === choice.id ? 'academy-selected' : ''}
                  >
                    <input
                      type="radio"
                      name="prediction"
                      checked={prediction === choice.id}
                      onChange={() => setDraft((d) => ({ ...d, prediction: choice.id }))}
                    />
                    <span>{choice.text}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}
        {step === 2 && (
          <>
            <div className="academy-coach">
              <AcademyMascot mood="guidance" />
              <p className="academy-teaching">{lesson.teaching}</p>
            </div>
            <ol className="academy-diagram">
              {lesson.diagram.map((item, i) => (
                <li key={item.label}>
                  <span className="academy-diagram-number">{number.format(i + 1)}</span>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        {question && !checked && (
          <div className="academy-coach">
            <AcademyMascot mood="thinking" />
            <p>به موقعیت آوند برگرد؛ کدام گزینه با شواهد جور است؟</p>
          </div>
        )}
        {question && (
          <form
            id="academy-question"
            onSubmit={(event) => {
              event.preventDefault();
              if (!answers[question.id] || checked) return;
              setDraft((d) => ({ ...d, checked: true }));
            }}
          >
            <fieldset disabled={checked}>
              <legend>{question.prompt}</legend>
              <div className="academy-choices">
                {question.choices.map((choice, i) => (
                  <label
                    key={choice.id}
                    className={answers[question.id] === choice.id ? 'academy-selected' : ''}
                  >
                    <span className="academy-choice-number" aria-hidden="true">
                      {number.format(i + 1)}
                    </span>
                    <input
                      type="radio"
                      name={question.id}
                      checked={answers[question.id] === choice.id}
                      onChange={() =>
                        setDraft((d) => ({
                          ...d,
                          answers: { ...d.answers, [question.id]: choice.id },
                        }))
                      }
                    />
                    <span>{choice.text}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </form>
        )}
        {question && checked && (
          <div
            ref={feedback}
            tabIndex={-1}
            role="status"
            className={`academy-feedback ${answers[question.id] === question.correctChoiceId ? 'academy-feedback--passed' : 'academy-feedback--retry'}`}
          >
            <AcademyMascot
              mood={answers[question.id] === question.correctChoiceId ? 'correct' : 'retry'}
            />
            <h3>
              {answers[question.id] === question.correctChoiceId
                ? 'درست انتخاب کردی!'
                : 'بیاییم دلیلش را ببینیم'}
            </h3>
            <p>{question.explanation}</p>
          </div>
        )}
        {step === lastStep && (
          <>
            <div
              ref={feedback}
              tabIndex={-1}
              role="status"
              className={`academy-feedback academy-result${result.passed ? ' academy-feedback--passed' : ''}`}
            >
              <div className="academy-result-emblem">
                <AcademyMascot mood={result.passed ? 'celebration' : 'retry'} />
                <AcademyIcon name={result.passed ? 'trophy' : 'target'} />
              </div>
              <p>
                {number.format(result.correct)} پاسخ درست از{' '}
                {number.format(lesson.questions.length)}
              </p>
              <p>
                {result.passed
                  ? 'یک قدم جلوتر؛ حالا ایده را به تصمیم خودت وصل کن.'
                  : 'توضیح‌ها را مرور کن و دوباره تصمیم بگیر.'}
              </p>
            </div>
            <section className="academy-artifact">
              <h2>روی کاغذ کسب‌وکار تو</h2>
              <label htmlFor="academy-note">{lesson.artifactPrompt}</label>
              <textarea
                id="academy-note"
                rows={4}
                value={note}
                onChange={(event) => setDraft((d) => ({ ...d, note: event.target.value }))}
              />
              <small>
                یادداشت و ادامه درس فقط در همین تب نگه داشته می‌شوند؛ ذخیره حساب و ارزیابی متن فعال
                نیست.
              </small>
            </section>
            <details>
              <summary>مرور پاسخ‌ها و دلیل‌ها</summary>
              {lesson.questions.map((q) => (
                <div key={q.id}>
                  <strong>{q.prompt}</strong>
                  <p>{q.explanation}</p>
                </div>
              ))}
            </details>
          </>
        )}
      </div>
      <footer className="academy-player-footer">
        {step > 0 && step < 3 ? (
          <Button onClick={() => setDraft((d) => ({ ...d, step: d.step - 1, checked: false }))}>
            مرحله قبل
          </Button>
        ) : (
          <span className="academy-muted">
            {step === lastStep ? 'هر تمرین، یک قدم' : 'با سرعت خودت پیش برو'}
          </span>
        )}
        {step < 3 && (
          <Button variant="primary" disabled={step === 1 && !prediction} onClick={advance}>
            {step === 0 ? 'بریم سراغش' : 'ادامه'}
          </Button>
        )}
        {question &&
          (!checked ? (
            <Button
              variant="primary"
              type="submit"
              form="academy-question"
              disabled={!answers[question.id]}
            >
              بررسی پاسخ
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => {
                if (step + 1 === lastStep && result.valid && result.passed)
                  onComplete(lesson, answers);
                advance();
              }}
            >
              ادامه
            </Button>
          ))}
        {step === lastStep && (
          <div className="academy-feedback-actions">
            <Button
              onClick={() => setDraft((d) => ({ ...d, step: 3, answers: {}, checked: false }))}
            >
              دوباره تمرین می‌کنم
            </Button>
            {result.passed && (
              <Link
                className="ui-button ui-button--primary"
                to={next ? `/academy/lesson/${next.id}` : '/academy'}
              >
                {next ? 'درس بعدی' : 'بازگشت به مسیر'}
              </Link>
            )}
          </div>
        )}
      </footer>
      <details className="academy-sources">
        <summary>منابع، فرض‌ها و وضعیت بازبینی</summary>
        <p>
          متن و سناریو تألیف اولیه‌اند؛ بازبینی تخصصی مستقل در انتظار است. همه اعداد و شرکت آوند
          فرضی‌اند. قبولی تمرین، گواهی مهارت نیست.
        </p>
        <ul>
          {academySources
            .filter((source) => lesson.sourceRefs.includes(source.id))
            .map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noreferrer" lang="en" dir="ltr">
                  {source.title}
                </a>
                <p lang="en" dir="ltr">
                  {source.sections}
                </p>
              </li>
            ))}
        </ul>
      </details>
    </article>
  );
}
