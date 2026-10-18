import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Dialog } from '@stratino/ui';
import { gradePractice } from '@stratino/domain/academy';
import { academyLessons, academySources } from './content';
import type { LessonContent } from './content';
import { AcademyIcon } from './AcademyIcons';
import { AcademyMascot } from './AcademyMascot';
import { AcademyText } from './AcademyText';
import { CelebrationBurst } from './AcademyMotion';

type Draft = {
  step: number;
  answers: Record<string, string>;
  checked: boolean;
  note: string;
  prediction: string;
  learned: boolean;
};
const fresh = (): Draft => ({
  step: 0,
  answers: {},
  checked: false,
  note: '',
  prediction: '',
  learned: false,
});
const draftKey = (lesson: LessonContent) =>
  `stratino-academy-draft-v2:${lesson.id}:${lesson.version}`;
function readDraft(lesson: LessonContent): Draft {
  const quizStart = 3 + lesson.diagram.length;
  try {
    const saved = sessionStorage.getItem(draftKey(lesson));
    if (saved === null) {
      const previous = JSON.parse(
        sessionStorage.getItem(`stratino-academy-draft-v1:${lesson.id}:${lesson.version}`) ??
          'null',
      );
      return { ...fresh(), note: typeof previous?.note === 'string' ? previous.note : '' };
    }
    const d = JSON.parse(saved);
    if (
      !d ||
      !Number.isInteger(d.step) ||
      d.step < 0 ||
      d.step > lesson.questions.length + quizStart ||
      typeof d.note !== 'string' ||
      typeof d.prediction !== 'string' ||
      typeof d.checked !== 'boolean' ||
      typeof d.learned !== 'boolean' ||
      (d.step >= quizStart && !d.learned) ||
      !d.answers ||
      typeof d.answers !== 'object' ||
      Array.isArray(d.answers)
    )
      return fresh();
    for (const [id, answer] of Object.entries(d.answers)) {
      if (!lesson.questions.find((q) => q.id === id)?.choices.some((c) => c.id === answer))
        return fresh();
    }
    const question = lesson.questions[d.step - quizStart];
    if (
      (d.checked && question && !d.answers[question.id]) ||
      (d.step >= quizStart &&
        lesson.questions.slice(0, d.step - quizStart).some((q) => !d.answers[q.id]))
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
  const navigate = useNavigate();
  const [exitOpen, setExitOpen] = useState(false);
  const [direction, setDirection] = useState('forward');
  const [draft, setDraft] = useState(() => readDraft(lesson));
  const [storageWarning, setStorageWarning] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const { step, answers, checked, note, prediction, learned } = draft;
  const quizStart = 3 + lesson.diagram.length;
  const lastStep = lesson.questions.length + quizStart;
  const concept = lesson.diagram[step - 3];
  const question = lesson.questions[step - quizStart];
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
    window.scrollTo(0, 0);
  }, [step]);
  useEffect(() => {
    if (checked) feedback.current?.focus();
  }, [checked]);
  function advance() {
    setDirection('forward');
    setDraft((d) => ({
      ...d,
      step: Math.min(d.step + 1, lastStep),
      checked: false,
      learned: d.learned || d.step + 1 === quizStart,
    }));
  }
  return (
    <article
      className="academy-lesson academy-player"
      lang="fa"
      dir="rtl"
      data-stage={step < quizStart ? 'learn' : step === lastStep ? 'result' : 'quiz'}
    >
      <div className="academy-player-top">
        <Dialog
          open={exitOpen}
          onOpenChange={setExitOpen}
          trigger={
            <Button variant="quiet" className="academy-back" aria-label="بازگشت به مسیر">
              ×
            </Button>
          }
          title="برای امروز کافی است؟"
          description={
            storageWarning
              ? 'ذخیره مرورگر در دسترس نیست؛ اگر یادداشت داری، قبل از خروج آن را کپی کن.'
              : 'ادامه درس و یادداشتت در همین تب می‌ماند؛ هر وقت خواستی برگرد و ادامه بده.'
          }
        >
          <div className="academy-exit-content">
            <AcademyMascot mood="retry" />
            <Button variant="primary" onClick={() => setExitOpen(false)}>
              ادامه می‌دهم
            </Button>
            <Button onClick={() => navigate('/academy')}>فعلاً برمی‌گردم</Button>
          </div>
        </Dialog>
        <progress aria-label="پیشرفت این درس" value={step} max={lastStep} />
        <span>
          {number.format(Math.min(step + 1, lastStep))} / {number.format(lastStep)}
        </span>
      </div>
      <p className="academy-muted">فصل اول · شرکت فرضی آوند</p>
      <h1>
        <AcademyText>{lesson.title}</AcademyText>
      </h1>
      {storageWarning && (
        <p className="academy-warning" role="alert">
          ادامه درس و یادداشت در مرورگر ذخیره نشد؛ قبل از خروج یادداشت را کپی کن.
        </p>
      )}
      <div className="academy-step" key={step} data-direction={direction}>
        <p className="academy-step-label">
          {step === 0
            ? 'داستان'
            : step === 1
              ? 'نظر اولیه تو'
              : step === 2
                ? 'کشف ایده'
                : step === lastStep
                  ? 'نتیجه تمرین'
                  : step < quizStart
                    ? `آموزش ${number.format(step - 2)} از ${number.format(lesson.diagram.length)}`
                    : `پرسش ${number.format(step - quizStart + 1)}`}
        </p>
        <h2 ref={heading} tabIndex={-1}>
          {step === 0 ? (
            'تو در تیم آوند هستی'
          ) : step === 1 ? (
            'قبل از یادگیری، تو چه می‌کنی؟'
          ) : step === 2 ? (
            'ایده اصلی'
          ) : step === lastStep ? (
            result.passed ? (
              'این تمرین را کامل کردی'
            ) : (
              'یک بار دیگر، با دلیل روشن‌تر'
            )
          ) : step < quizStart ? (
            <AcademyText>{concept?.label ?? ''}</AcademyText>
          ) : (
            'حالا تو تصمیم بگیر'
          )}
        </h2>
        {step === 0 && (
          <>
            <div className="academy-scene">
              <AcademyMascot mood="welcome" />
              <p>
                <AcademyText>{lesson.scene}</AcademyText>
              </p>
            </div>
            <p className="academy-objective">بعد از این درس می‌توانی {lesson.objective}</p>
          </>
        )}
        {step === 1 && (
          <>
            <div className="academy-coach">
              <AcademyMascot mood="thinking" />
              <p>
                <AcademyText>{lesson.questions[0].prompt}</AcademyText>
              </p>
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
                    <span>
                      <AcademyText>{choice.text}</AcademyText>
                    </span>
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
              <p className="academy-teaching">
                <AcademyText>{lesson.teaching}</AcademyText>
              </p>
            </div>
          </>
        )}
        {step >= 3 && step < quizStart && concept && (
          <div className="academy-concept">
            <div className="academy-concept-art">
              <AcademyIcon name={step % 2 ? 'target' : 'spark'} />
              <span>{number.format(step - 2)}</span>
            </div>
            <div className="academy-coach">
              <AcademyMascot mood="guidance" />
              <p>
                <AcademyText>{concept.detail}</AcademyText>
              </p>
            </div>
            <ol className="academy-diagram" aria-label="قدم‌های این ایده">
              {lesson.diagram.map((item, i) => (
                <li
                  key={item.label}
                  className={i <= step - 3 ? 'academy-diagram-active' : ''}
                  aria-current={i === step - 3 ? 'step' : undefined}
                >
                  <span className="academy-diagram-number">
                    {i < step - 3 ? <AcademyIcon name="check" /> : number.format(i + 1)}
                  </span>
                  <strong>
                    <AcademyText>{item.label}</AcademyText>
                  </strong>
                </li>
              ))}
            </ol>
          </div>
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
              <legend>
                <AcademyText>{question.prompt}</AcademyText>
              </legend>
              <div className="academy-choices">
                {question.choices.map((choice, i) => (
                  <label
                    key={choice.id}
                    className={[
                      answers[question.id] === choice.id ? 'academy-selected' : '',
                      checked && choice.id === question.correctChoiceId
                        ? 'academy-choice-correct'
                        : '',
                      checked &&
                      answers[question.id] === choice.id &&
                      choice.id !== question.correctChoiceId
                        ? 'academy-choice-retry'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
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
                    <span>
                      <AcademyText>{choice.text}</AcademyText>
                    </span>
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
            {answers[question.id] === question.correctChoiceId && <CelebrationBurst small />}
            <AcademyMascot
              mood={answers[question.id] === question.correctChoiceId ? 'correct' : 'retry'}
            />
            <h3>
              {answers[question.id] === question.correctChoiceId
                ? 'درست انتخاب کردی!'
                : 'بیاییم دلیلش را ببینیم'}
            </h3>
            <p>
              <AcademyText>{question.explanation}</AcademyText>
            </p>
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
                {result.passed && <CelebrationBurst />}
                <AcademyMascot mood={result.passed ? 'celebration' : 'retry'} />
                <AcademyIcon name={result.passed ? 'trophy' : 'target'} />
              </div>
              <p>
                {number.format(result.correct)} پاسخ درست از{' '}
                {number.format(lesson.questions.length)}
              </p>
              <p>
                {result.passed
                  ? next
                    ? 'آفرین! بخش بعد برایت باز شد. آماده‌ای یک قدم دیگر برداریم؟'
                    : 'آفرین! همه بخش‌های این فصل را گذراندی. حالا ایده‌ها را به تصمیم خودت وصل کن.'
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
                  <p>
                    <AcademyText>{q.explanation}</AcademyText>
                  </p>
                </div>
              ))}
            </details>
          </>
        )}
      </div>
      <footer className="academy-player-footer">
        {step > 0 && step < quizStart ? (
          <Button
            onClick={() => {
              setDirection('back');
              setDraft((d) => ({ ...d, step: d.step - 1, checked: false }));
            }}
          >
            مرحله قبل
          </Button>
        ) : (
          <span className="academy-muted">
            {step === lastStep ? 'هر تمرین، یک قدم' : 'با سرعت خودت پیش برو'}
          </span>
        )}
        {step < quizStart && (
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
                if (step + 1 === lastStep && learned && result.valid && result.passed)
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
              onClick={() =>
                setDraft((d) => ({ ...d, step: quizStart, answers: {}, checked: false }))
              }
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
