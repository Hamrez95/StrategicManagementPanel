import { useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useLocation, useParams } from 'react-router';
import { Brand, Button, useUIAppearance } from '@stratino/ui';
import {
  completedPractice,
  emptyPractice,
  gradePractice,
  lessonAvailability,
  parsePractice,
  recordPractice,
} from '@stratino/domain/academy';
import type { PracticeState } from '@stratino/domain/academy';
import { applyAccountPreferences, readDevicePreferences } from '../account/api';
import { academyLessons, academySources, curriculum } from './content';
import type { LessonContent } from './content';
import './academy.css';
const PRACTICE_KEY = 'stratino-academy-preview-v1';
function readPractice() {
  try {
    const result = parsePractice(sessionStorage.getItem(PRACTICE_KEY));
    return {
      state: result.state,
      warning: result.invalid ? 'پیشرفت تمرینی خوانده نشد؛ با یک تمرین تازه شروع می‌کنیم.' : '',
    };
  } catch {
    return {
      state: emptyPractice(),
      warning: 'ذخیره مرورگر در دسترس نیست؛ پیشرفت فقط تا بسته‌شدن صفحه می‌ماند.',
    };
  }
}
export function StratinoGuide({ celebrating = false }: { celebrating?: boolean }) {
  return (
    <svg
      className={`academy-guide${celebrating ? ' academy-guide--celebrate' : ''}`}
      viewBox="0 0 180 160"
      role="img"
      aria-label="همراه استراتینو"
    >
      <path
        d="M30 74 8 62M150 74l22-20"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <rect
        x="36"
        y="28"
        width="108"
        height="100"
        rx="30"
        fill="var(--wash)"
        stroke="var(--action)"
        strokeWidth="4"
      />
      <path d="m64 28 26-18 26 18" fill="var(--action-fill)" />
      <rect x="55" y="54" width="70" height="37" rx="14" fill="var(--paper)" />
      <g className="academy-guide-eyes" fill="var(--ink)">
        <circle cx="73" cy="71" r="5" />
        <circle cx="107" cy="71" r="5" />
      </g>
      <path
        d="M78 104q12 12 24 0M62 131v13m56-13v13"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}
function LearningPath({ state }: { state: PracticeState }) {
  const [track, setTrack] = useState('foundations');
  const done = completedPractice(academyLessons, state);
  const next =
    academyLessons.find(
      (lesson) => lessonAvailability(lesson.id, academyLessons, state) === 'available',
    ) ?? academyLessons[0];
  const modules = curriculum.modules.filter((module) => module.track === track);
  const number = new Intl.NumberFormat('fa-IR');
  return (
    <div className="academy-layout" lang="fa" dir="rtl">
      <aside className="academy-topics" aria-label="حوزه‌های آموزش">
        <h2>چه چیزی یاد بگیریم؟</h2>
        <p className="academy-muted">از مبانی تا تصمیم‌های پیشرفته</p>
        <div className="academy-topic-list">
          {curriculum.tracks.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={track === item.id}
              onClick={() => setTrack(item.id)}
            >
              {item.title}
              {item.id !== 'foundations' && <small>در برنامه تولید</small>}
            </button>
          ))}
        </div>
      </aside>
      <section className="academy-path" aria-labelledby="academy-title">
        <div className="academy-chapter">
          <p>سطح اول · مبانی</p>
          <h1 id="academy-title" tabIndex={-1}>
            {track === 'foundations'
              ? 'کسب‌وکار چگونه کار می‌کند؟'
              : curriculum.tracks.find((item) => item.id === track)?.title}
          </h1>
          <p>
            {track === 'foundations'
              ? 'با آوند همراه شو؛ از شناخت مشتری تا اولین تصمیم.'
              : 'نقشه پیشنهادی این حوزه؛ محتوای این ماژول‌ها هنوز منتشر نشده است.'}
          </p>
        </div>
        {track === 'foundations' ? (
          <>
            <div className="academy-path-intro">
              <span>فصل رایگان · ۶ درس تمرینی</span>
              <Link className="ui-button ui-button--primary" to={`/academy/lesson/${next.id}`}>
                {done.size === academyLessons.length
                  ? 'مرور فصل'
                  : done.size
                    ? 'ادامه یادگیری'
                    : 'شروع یادگیری'}
              </Link>
            </div>
            <ol className="academy-nodes">
              {academyLessons.map((lesson, index) => {
                const status = lessonAvailability(lesson.id, academyLessons, state);
                const locked = status === 'locked';
                const text =
                  status === 'completed'
                    ? 'تمرین تکمیل شد'
                    : locked
                      ? 'پس از درس قبلی'
                      : 'آماده شروع';
                return (
                  <li key={lesson.id} className={`academy-node academy-node--${status}`}>
                    <div className="academy-node-control">
                      {locked ? (
                        <button
                          type="button"
                          className="academy-node-disc"
                          aria-disabled="true"
                          aria-label={`${lesson.title}؛ ${text}`}
                          onClick={() => undefined}
                        >
                          <span aria-hidden="true">◇</span>
                        </button>
                      ) : (
                        <Link
                          className="academy-node-disc"
                          to={`/academy/lesson/${lesson.id}`}
                          aria-label={`${lesson.title}؛ ${text}`}
                          aria-current={
                            next.id === lesson.id && status === 'available' ? 'step' : undefined
                          }
                        >
                          <span aria-hidden="true">
                            {status === 'completed' ? '✓' : number.format(index + 1)}
                          </span>
                        </Link>
                      )}
                      <div>
                        <strong>{lesson.title}</strong>
                        <small>{text}</small>
                        {locked && (
                          <small>
                            پیش‌نیاز:{' '}
                            {
                              academyLessons.find((item) => item.id === lesson.prerequisites[0])
                                ?.title
                            }
                          </small>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="academy-finish">
              <strong>خروجی فصل: یادداشت اولین تصمیم</strong>
              <p>
                مشتری، شواهد، نقدینگی و گزینه بعدی را کنار هم می‌گذاری. آزمون این نمونه، گواهی تخصص
                صادر نمی‌کند.
              </p>
            </div>
          </>
        ) : (
          <ol className="academy-roadmap">
            {modules.map((module) => (
              <li key={module.id}>
                <small>
                  {curriculum.levels.find((level) => level.id === module.level)?.title} · در برنامه
                  تولید
                </small>
                <h2>{module.title}</h2>
                <p>{module.objective}</p>
                <p>
                  <strong>خروجی: </strong>
                  {module.artifact}
                </p>
                <details>
                  <summary>فصل‌ها و پیش‌نیازها</summary>
                  <ul>
                    {module.chapters.map((chapter) => (
                      <li key={chapter}>{chapter}</li>
                    ))}
                  </ul>
                  <p>
                    پیش‌نیاز:{' '}
                    {module.prerequisites
                      .map((id) => curriculum.modules.find((item) => item.id === id)?.title ?? id)
                      .join('، ') || 'ندارد'}
                  </p>
                </details>
              </li>
            ))}
          </ol>
        )}
      </section>
      <aside className="academy-companion" aria-label="همراه یادگیری">
        <StratinoGuide />
        <h2>قدم کوچک، تصمیم بهتر</h2>
        <p>امروز یک مسئله را بفهم و یک تصمیم را تمرین کن.</p>
        <label htmlFor="academy-progress">پیشرفت تمرینی همین تب</label>
        <progress id="academy-progress" value={done.size} max={academyLessons.length} />
        <p>
          {number.format(done.size)} از {number.format(academyLessons.length)} درس
        </p>
        <p className="academy-muted">لیگ و نشان مهارت پس از ساخت ارزیابی معتبر اضافه می‌شوند.</p>
        <details>
          <summary>مسیر کامل آموزش</summary>
          <p>
            ۱۲ حوزه و پنج سطح: مبانی، مهارت مشترک، کاربرد مدیریتی، تخصص و پروژه پیشرفته. فعلاً فصل
            اول مبانی قابل تمرین است.
          </p>
        </details>
      </aside>
    </div>
  );
}
function LessonRoute({
  state,
  onComplete,
}: {
  state: PracticeState;
  onComplete: (lesson: LessonContent, answers: Record<string, string>) => void;
}) {
  const { lessonId } = useParams();
  const lesson = academyLessons.find((item) => item.id === lessonId);
  if (!lesson)
    return (
      <section className="academy-missing" lang="fa" dir="rtl">
        <h1 tabIndex={-1}>این درس پیدا نشد</h1>
        <Link to="/academy">بازگشت به مسیر آموزش</Link>
      </section>
    );
  if (lessonAvailability(lesson.id, academyLessons, state) === 'locked')
    return (
      <section className="academy-missing" lang="fa" dir="rtl">
        <h1 tabIndex={-1}>اول پیش‌نیاز را تمرین کن</h1>
        <p>
          پیش از «{lesson.title}»، درس «
          {academyLessons.find((item) => item.id === lesson.prerequisites[0])?.title}» را کامل کن.
        </p>
        <Link to="/academy">بازگشت به مسیر آموزش</Link>
      </section>
    );
  return <AcademyLesson key={lesson.id} lesson={lesson} onComplete={onComplete} />;
}
function AcademyLesson({
  lesson,
  onComplete,
}: {
  lesson: LessonContent;
  onComplete: (lesson: LessonContent, answers: Record<string, string>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [note, setNote] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);
  const grade = gradePractice(lesson, answers);
  const next = academyLessons[academyLessons.findIndex((item) => item.id === lesson.id) + 1];
  useEffect(() => {
    if (submitted) resultRef.current?.focus();
  }, [submitted]);
  return (
    <article className="academy-lesson" lang="fa" dir="rtl">
      <Link to="/academy" className="academy-back">
        بازگشت به مسیر
      </Link>
      <p className="academy-muted">فصل اول · شرکت فرضی آوند</p>
      <h1 tabIndex={-1}>{lesson.title}</h1>
      <p className="academy-objective">بعد از این درس می‌توانی {lesson.objective}</p>
      <section className="academy-scene">
        <StratinoGuide />
        <div>
          <h2>تو در تیم آوند هستی</h2>
          <p>{lesson.scene}</p>
        </div>
      </section>
      <section>
        <h2>ایده اصلی</h2>
        <p>{lesson.teaching}</p>
        <ol className="academy-diagram">
          {lesson.diagram.map((item) => (
            <li key={item.label}>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </li>
          ))}
        </ol>
      </section>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!grade.valid) return;
          if (grade.passed) onComplete(lesson, answers);
          setSubmitted(true);
        }}
      >
        <h2>حالا تو تصمیم بگیر</h2>
        {lesson.questions.map((question, index) => (
          <fieldset key={question.id} disabled={submitted}>
            <legend>
              {new Intl.NumberFormat('fa-IR').format(index + 1)}. {question.prompt}
            </legend>
            <div className="academy-choices">
              {question.choices.map((choice) => (
                <label
                  key={choice.id}
                  className={answers[question.id] === choice.id ? 'academy-selected' : ''}
                >
                  <input
                    type="radio"
                    name={question.id}
                    value={choice.id}
                    checked={answers[question.id] === choice.id}
                    onChange={() =>
                      setAnswers((current) => ({ ...current, [question.id]: choice.id }))
                    }
                  />
                  <span>{choice.text}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {!submitted && (
          <>
            <Button type="submit" variant="primary" disabled={!grade.valid}>
              بررسی پاسخ‌ها
            </Button>
            {!grade.valid && <p className="academy-muted">برای هر پرسش یک پاسخ انتخاب کن.</p>}
          </>
        )}
      </form>
      {submitted && (
        <div
          ref={resultRef}
          tabIndex={-1}
          role="status"
          className={`academy-feedback${grade.passed ? ' academy-feedback--passed' : ''}`}
        >
          <h2>{grade.passed ? 'این تمرین را کامل کردی' : 'یک بار دیگر، با دلیل روشن‌تر'}</h2>
          <p>
            {new Intl.NumberFormat('fa-IR').format(grade.correct)} پاسخ درست از{' '}
            {new Intl.NumberFormat('fa-IR').format(lesson.questions.length)}
          </p>
          {lesson.questions.map((question) => (
            <div key={question.id}>
              <strong>{question.prompt}</strong>
              <p>
                {answers[question.id] === question.correctChoiceId ? 'درست. ' : 'نیاز به بازبینی. '}
                {question.explanation}
              </p>
            </div>
          ))}
          <div className="academy-feedback-actions">
            <Button
              onClick={() => {
                setSubmitted(false);
                setAnswers({});
              }}
            >
              دوباره تمرین می‌کنم
            </Button>
            {grade.passed && (
              <Link
                className="ui-button ui-button--primary"
                to={next ? `/academy/lesson/${next.id}` : '/academy'}
              >
                {next ? 'درس بعدی' : 'بازگشت به مسیر'}
              </Link>
            )}
          </div>
        </div>
      )}
      <section className="academy-artifact">
        <h2>روی کاغذ کسب‌وکار تو</h2>
        <label htmlFor="academy-note">{lesson.artifactPrompt}</label>
        <textarea
          id="academy-note"
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <small>
          یادداشت در این صفحه می‌ماند؛ قبل از خروج آن را کپی کن. ذخیره حساب و ارزیابی متن هنوز فعال
          نیست.
        </small>
      </section>
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
export default function Academy() {
  const [{ state, warning }, setPractice] = useState(readPractice);
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const location = useLocation();
  useEffect(() => {
    document.title = 'استراتینو | آکادمی آموزش';
    document.querySelector<HTMLElement>('.academy h1')?.focus();
    window.scrollTo(0, 0);
  }, [location.pathname]);
  function complete(lesson: LessonContent, answers: Record<string, string>) {
    const next = recordPractice(lesson, academyLessons, state, answers);
    let nextWarning = '';
    try {
      sessionStorage.setItem(PRACTICE_KEY, JSON.stringify(next));
    } catch {
      nextWarning =
        'تمرین انجام شد، اما در مرورگر ذخیره نشد؛ با بازکردن دوباره صفحه ممکن است پیشرفت از دست برود.';
    }
    setPractice({ state: next, warning: nextWarning });
  }
  function appearance(kind: 'theme' | 'motion') {
    const prefs = readDevicePreferences();
    applyAccountPreferences(
      kind === 'theme'
        ? { ...prefs, theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }
        : { ...prefs, motion: prefs.motion === 'reduced' ? 'auto' : 'reduced' },
    );
  }
  return (
    <div className="academy">
      <header className="academy-header">
        <Link to="/academy" aria-label={english ? 'Stratino Academy' : 'آکادمی استراتینو'}>
          <Brand english={english} />
        </Link>
        <span>{english ? 'Learn. Practise. Decide.' : 'یاد بگیر. تمرین کن. تصمیم بگیر.'}</span>
        <nav aria-label={english ? 'Academy navigation' : 'ناوبری آموزش'}>
          <Button variant="quiet" onClick={() => appearance('theme')}>
            {english ? 'Change theme' : 'تغییر تم'}
          </Button>
          <Button variant="quiet" onClick={() => appearance('motion')}>
            {readDevicePreferences().motion === 'reduced'
              ? english
                ? 'Enable motion'
                : 'فعال‌کردن حرکت'
              : english
                ? 'Reduce motion'
                : 'کاهش حرکت'}
          </Button>
          <Link to="/">{english ? 'Back to Stratino' : 'بازگشت به استراتینو'}</Link>
        </nav>
      </header>
      <div className="academy-preview-note" lang="fa" dir="rtl">
        پیش‌نمایش آموزشی · محتوای اولیه در انتظار بازبینی تخصصی است. پیشرفت فقط در همین تب ذخیره
        می‌شود؛ حساب، اشتراک و گواهی فعال نیست.
      </div>
      {english && (
        <p className="academy-language-note" lang="en">
          The pilot lessons are in Persian. English course content is not published yet.
        </p>
      )}
      {warning && (
        <p className="academy-warning" role="alert" lang="fa" dir="rtl">
          {warning}
        </p>
      )}
      <Routes>
        <Route index element={<LearningPath state={state} />} />
        <Route
          path="lesson/:lessonId"
          element={<LessonRoute state={state} onComplete={complete} />}
        />
        <Route
          path="*"
          element={
            <section className="academy-missing">
              <h1 tabIndex={-1}>صفحه آموزش پیدا نشد</h1>
              <Link to="/academy">بازگشت به آموزش</Link>
            </section>
          }
        />
      </Routes>
    </div>
  );
}
