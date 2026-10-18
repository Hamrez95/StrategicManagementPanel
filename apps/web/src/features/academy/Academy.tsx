import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation, useParams } from 'react-router';
import { Brand, Button, useUIAppearance } from '@stratino/ui';
import {
  completedPractice,
  emptyPractice,
  lessonAvailability,
  parsePractice,
  recordPractice,
} from '@stratino/domain/academy';
import type { PracticeState } from '@stratino/domain/academy';
import { applyAccountPreferences, readDevicePreferences } from '../account/api';
import { academyLessons, curriculum } from './content';
import type { LessonContent } from './content';
import { AcademyLesson } from './AcademyLesson';
import { AcademyIcon } from './AcademyIcons';
import { AcademyMascot } from './AcademyMascot';
import { AcademyCatalog, AcademyGuide, AcademyNavigation, AcademyReview } from './AcademyPages';
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
              <span className="academy-topic-title">
                <AcademyIcon name={item.id === 'foundations' ? 'book' : 'briefcase'} />
                {item.title}
              </span>
              {item.id !== 'foundations' && <small>در حال آماده‌سازی</small>}
            </button>
          ))}
        </div>
      </aside>
      <section className="academy-path" aria-labelledby="academy-title">
        <div className="academy-chapter">
          <AcademyIcon name="book" />
          <p>سطح اول · فصل مبانی</p>
          <h1 id="academy-title" tabIndex={-1}>
            {track === 'foundations'
              ? 'کسب‌وکار چگونه کار می‌کند؟'
              : curriculum.tracks.find((item) => item.id === track)?.title}
          </h1>
          <p>
            {track === 'foundations'
              ? 'با آوند همراه شو؛ از شناخت مشتری تا اولین تصمیم.'
              : 'این مسیر را برایت آماده می‌کنیم؛ بخش‌هایش هنوز برای شروع باز نشده‌اند.'}
          </p>
        </div>
        {track === 'foundations' ? (
          <>
            <div className="academy-path-intro">
              <span>۶ بخش کوتاه؛ از یادگیری تا تصمیم</span>
              <Link className="ui-button ui-button--primary" to={`/academy/lesson/${next.id}`}>
                {done.size === academyLessons.length
                  ? 'مرور فصل'
                  : done.size
                    ? 'ادامه یادگیری'
                    : 'شروع یادگیری'}
              </Link>
            </div>
            <ol className="academy-nodes">
              <li className="academy-path-sidekick" aria-hidden="true">
                <AcademyMascot mood="welcome" />
              </li>
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
                    {index % 2 === 0 && (
                      <div className="academy-unit-label">
                        {['مشتری و شواهد', 'پول و تصمیم', 'رقابت و انتخاب'][index / 2]}
                      </div>
                    )}
                    <div className="academy-node-control">
                      {status === 'available' && next.id === lesson.id && (
                        <span className="academy-start-label">
                          {done.size ? 'ادامه از اینجا' : 'از اینجا شروع کن'}
                        </span>
                      )}
                      {locked ? (
                        <button
                          type="button"
                          className="academy-node-disc"
                          aria-disabled="true"
                          aria-label={`${lesson.title}؛ ${text}`}
                          onClick={() => undefined}
                        >
                          <AcademyIcon name="lock" />
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
                          <AcademyIcon
                            name={
                              status === 'completed' ? 'check' : index === 5 ? 'trophy' : 'star'
                            }
                          />
                        </Link>
                      )}
                      <div>
                        <span className="academy-node-index">بخش {number.format(index + 1)}</span>
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
              <AcademyIcon name="trophy" />
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
        <AcademyMascot mood={done.size === academyLessons.length ? 'celebration' : 'welcome'} />
        <p className="academy-eyebrow">هدفت برای این فصل</p>
        <h2>قدم کوچک، تصمیم بهتر</h2>
        <p>امروز یک مسئله را بفهم و یک تصمیم را تمرین کن.</p>
        <label htmlFor="academy-progress">پیشرفت تمرینی همین تب</label>
        <progress id="academy-progress" value={done.size} max={academyLessons.length} />
        <p>
          {number.format(done.size)} از {number.format(academyLessons.length)} درس
        </p>
        <div className="academy-session-goal">
          <AcademyIcon name="book" />
          <span>
            قدم بعدی
            <br />
            <strong>{done.size === academyLessons.length ? 'مرور فصل مبانی' : next.title}</strong>
          </span>
        </div>
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
export default function Academy() {
  const [{ state, warning }, setPractice] = useState(readPractice);
  const { dir } = useUIAppearance();
  const english = dir === 'ltr';
  const location = useLocation();
  const inLesson = location.pathname.includes('/lesson/');
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
  function toggleTheme() {
    const prefs = readDevicePreferences();
    applyAccountPreferences({
      ...prefs,
      theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark',
    });
  }
  return (
    <div className={`academy${inLesson ? ' academy--lesson' : ''}`}>
      <header className="academy-header">
        <Link to="/academy" aria-label={english ? 'Stratino Academy' : 'آکادمی استراتینو'}>
          <Brand english={english} />
        </Link>
        <span>{english ? 'Learn. Practise. Decide.' : 'یاد بگیر. تمرین کن. تصمیم بگیر.'}</span>
        <nav aria-label={english ? 'Academy navigation' : 'ناوبری آموزش'}>
          <Button variant="quiet" onClick={toggleTheme}>
            {english ? 'Change theme' : 'تغییر تم'}
          </Button>
          <Link to="/">{english ? 'Back to Stratino' : 'بازگشت به استراتینو'}</Link>
        </nav>
      </header>
      {!inLesson && <AcademyNavigation />}
      <div className="academy-preview-note" lang="fa" dir="rtl">
        نسخهٔ تمرینی · شش بخش اولیه هنوز در حال بازبینی‌اند. پیشرفتت فعلاً فقط در همین تب می‌ماند.
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
        <Route path="catalog" element={<AcademyCatalog />} />
        <Route path="review" element={<AcademyReview state={state} />} />
        <Route path="guide" element={<AcademyGuide />} />
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
