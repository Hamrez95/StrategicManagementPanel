import { useEffect, useRef, useState } from 'react';
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Brand, Button, useUIAppearance } from '@stratino/ui';
import { ApiError } from '../../api/client';
import { applyAccountPreferences, readDevicePreferences } from '../account/api';
import { AcademyIcon } from './AcademyIcons';
import type { AcademyIconName } from './AcademyIcons';
import { AcademyMascot } from './AcademyMascot';
import { CourseHero } from './CourseHero';
import { AcademyTopics } from './AcademyTopics';
import { LearningPlayer } from './LearningPlayer';
import type { LearningActions } from './LearningPlayer';
import { academyCopy as copy } from './academyMessages';
import { faNumber, learningState, loadContent, saveProgress, submitAnswer } from './connectedData';
import type { Catalog, Course, LearningState, Progress, Unit } from './connectedData';
import './academy.css';
import './connectedAcademy.css';
import './courseHero.css';
import './academyTopics.css';

const fresh = (unit: Unit): Progress => ({
  unit_id: unit.id,
  content_revision: unit.revision,
  note: '',
  position: 0,
  viewed_cards: [],
  responses: {},
  activity_response: {},
  bookmarked: false,
  completed: false,
  revision: 0,
});
const lessonIds = (course: Course) =>
  course.stages.flatMap((stage) => stage.lessons.map((lesson) => lesson.id));
function previewCompletion(unit: Unit, row: Progress): Progress {
  const viewed = unit.learning_cards.every((card) => row.viewed_cards.includes(card.id));
  const answered = unit.questions.every(
    (question) => row.responses[question.id]?.result.correct === true,
  );
  const practiced =
    !unit.practice_activity ||
    (unit.practice_activity.type === 'numeric'
      ? row.activity_response.result?.correct === true
      : Boolean(row.activity_response.answer));
  return { ...row, completed: row.completed || (viewed && answered && practiced) };
}
const courseFor = (catalog: Catalog, id: string) =>
  catalog.courses.find(
    (course) =>
      lessonIds(course).includes(id) ||
      course.final_review_id === id ||
      course.stages.some((stage) => stage.review_id === id),
  );

function UnitPage({ catalog, learning }: { catalog: Catalog; learning: LearningActions }) {
  const { unitId = '' } = useParams();
  const query = useQuery({
    queryKey: ['academy-content', catalog.version, unitId],
    queryFn: ({ signal }) => loadContent<Unit>(unitId, signal),
  });
  if (query.isPending)
    return (
      <p className="academy-page" role="status">
        {copy.loading}
      </p>
    );
  if (query.isError)
    return (
      <section className="academy-page">
        <h1>این بخش باز نشد</h1>
        <p role="alert">{query.error.message}</p>
        <Button onClick={() => void query.refetch()}>{copy.retry}</Button>
        <Link to="/academy">برگشتن به مسیر</Link>
      </section>
    );
  const course = catalog.courses.find((item) => item.id === query.data.course_id);
  return course ? (
    <LearningPlayer
      key={`${learning.userId}:${unitId}`}
      unit={query.data}
      course={course}
      learning={learning}
    />
  ) : (
    <p>این درس پیدا نشد.</p>
  );
}

function Path({ catalog, learning }: { catalog: Catalog; learning: LearningActions }) {
  const [params, setParams] = useSearchParams();
  const last = Object.keys(learning.progress).at(-1);
  const selected =
    catalog.courses.find((c) => c.id === params.get('course')) ??
    (last ? courseFor(catalog, last) : undefined) ??
    catalog.courses.find((c) => c.id === 'C07') ??
    catalog.courses[0];
  const path = catalog.paths.find((p) => p.id === selected.path_id) ?? catalog.paths[0];
  const ids = lessonIds(selected);
  const done = ids.filter((id) => learning.progress[id]?.completed).length;
  const next = ids.find((id) => !learning.progress[id]?.completed) ?? ids[0];
  return (
    <div className="academy-layout learning-layout">
      <aside className="academy-topics academy-topics--visual">
        <AcademyTopics
          paths={catalog.paths}
          selected={path.id}
          onSelect={(item) => {
            setParams({ course: item.recommended_order?.[0] ?? item.course_ids[0] });
          }}
        />
        <label className="learning-course-select">
          درس این حوزه
          <select
            value={selected.id}
            onChange={(event) => setParams({ course: event.target.value })}
          >
            {catalog.courses
              .filter((course) => course.path_id === path.id)
              .map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
          </select>
        </label>
      </aside>
      <section className="academy-path">
        <CourseHero
          key={selected.id}
          course={selected}
          pathTitle={path.title}
          lessons={ids.length}
        />
        <div className="academy-path-intro">
          <span>
            {faNumber(done)} از {faNumber(ids.length)} درس‌نامه تمرین شده
          </span>
          <Link className="ui-button ui-button--primary" to={`/academy/lesson/${next}`}>
            {done ? 'ادامهٔ یادگیری' : 'شروع یادگیری'}
          </Link>
        </div>
        {selected.stages.map((stage) => (
          <section className="learning-stage" data-color={stage.color_token} key={stage.id}>
            <header className="learning-stage-header">
              <span>مرحلهٔ {faNumber(stage.order)}</span>
              <h2>{stage.title}</h2>
            </header>
            <ol className="academy-nodes">
              {stage.lessons.map((lesson, index) => (
                <li
                  key={lesson.id}
                  className={`academy-node academy-node--${learning.progress[lesson.id]?.completed ? 'completed' : next === lesson.id ? 'available' : 'ready'}`}
                >
                  <div className="academy-node-control">
                    <Link
                      className="academy-node-disc"
                      to={`/academy/lesson/${lesson.id}`}
                      aria-label={lesson.title}
                      aria-current={next === lesson.id ? 'step' : undefined}
                    >
                      <AcademyIcon
                        name={learning.progress[lesson.id]?.completed ? 'check' : 'star'}
                      />
                    </Link>
                    <div>
                      <span className="academy-node-index">درس‌نامهٔ {faNumber(index + 1)}</span>
                      <strong>{lesson.title}</strong>
                      <small>
                        {learning.progress[lesson.id]?.completed
                          ? 'تمرین شده'
                          : lesson.id === next
                            ? 'قدم پیشنهادی بعدی'
                            : 'آمادهٔ شروع'}
                      </small>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            {stage.review_id && (
              <Link
                className={`learning-review-node${learning.progress[stage.review_id]?.completed ? ' learning-review-node--completed' : ''}`}
                to={`/academy/review/${stage.review_id}`}
              >
                <AcademyIcon name="target" />
                {learning.progress[stage.review_id]?.completed
                  ? 'مرور مرحله انجام شد'
                  : 'مرور این مرحله'}
              </Link>
            )}
          </section>
        ))}
        {selected.final_review_id && (
          <Link
            className={`learning-final-node${learning.progress[selected.final_review_id]?.completed ? ' learning-review-node--completed' : ''}`}
            to={`/academy/review/${selected.final_review_id}`}
          >
            <AcademyIcon name="trophy" />
            مرور پایانی {selected.title}
          </Link>
        )}
      </section>
      <aside className="academy-companion">
        <AcademyMascot mood="welcome" />
        <h2>هر قدم، یک فرصت برای تمرین</h2>
        <progress value={done} max={ids.length} aria-label="پیشرفت درس" />
        <p>{faNumber(done)} درس‌نامه رو تمرین کردی.</p>
        <p>ترتیب مسیر پیشنهاده. می‌تونی مستقیم سراغ هر درس‌نامه بری.</p>
        {selected.recommended_prerequisites && (
          <details>
            <summary>پیش‌نیاز پیشنهادی</summary>
            <p>{selected.recommended_prerequisites}</p>
          </details>
        )}
        <Link to="/academy/review">یادداشت‌ها و مرورهای من</Link>
      </aside>
    </div>
  );
}

function CatalogPage({ catalog, learning }: { catalog: Catalog; learning: LearningActions }) {
  const [search, setSearch] = useState('');
  return (
    <section className="academy-page">
      <div className="academy-page-intro">
        <div>
          <h1 tabIndex={-1}>دوست داری چه چیزی یاد بگیری؟</h1>
          <p>
            {faNumber(catalog.courses.length)} مجموعه و {faNumber(catalog.counts.lessons)} درس‌نامه
            برای یادگیری و تمرین
          </p>
        </div>
        <AcademyMascot mood="guidance" />
      </div>
      <label className="academy-search">
        جست‌وجوی درس یا حوزه
        <input value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      {catalog.paths.map((path) => {
        const courses = catalog.courses.filter(
          (c) => c.path_id === path.id && `${c.title} ${path.title}`.includes(search.trim()),
        );
        return courses.length ? (
          <section key={path.id}>
            <h2>{path.title}</h2>
            <div className="learning-course-grid">
              {courses.map((course) => {
                const ids = lessonIds(course);
                const done = ids.filter((id) => learning.progress[id]?.completed).length;
                return (
                  <Link
                    to={`/academy?course=${course.id}`}
                    className="learning-course-card"
                    key={course.id}
                  >
                    <AcademyIcon name="book" />
                    <h3>{course.title}</h3>
                    <p>
                      {faNumber(ids.length)} درس‌نامه · {faNumber(course.stages.length)} مرحله
                    </p>
                    <progress value={done} max={ids.length} aria-label={`پیشرفت ${course.title}`} />
                    <small>{faNumber(done)} درس‌نامه تمرین شده</small>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null;
      })}
      {!catalog.courses.some((c) =>
        `${c.title} ${catalog.paths.find((p) => p.id === c.path_id)?.title}`.includes(
          search.trim(),
        ),
      ) && <p>درسی با این عبارت پیدا نشد. عبارت کوتاه‌تری رو امتحان کن.</p>}
    </section>
  );
}

function ReviewPage({ catalog, learning }: { catalog: Catalog; learning: LearningActions }) {
  const records = Object.values(learning.progress);
  const selected = records.filter(
    (row) =>
      row.note ||
      row.bookmarked ||
      row.completed ||
      Object.values(row.responses).some((r) => !r.first_correct),
  );
  return (
    <section className="academy-page">
      <h1 tabIndex={-1}>مرور و یادداشت‌های من</h1>
      <p>{copy.independentNotice}</p>
      {!selected.length && (
        <p>
          بعد از شروع درس‌ها، یادداشت‌ها، درس‌های ذخیره‌شده و تمرین‌هایی که نیاز به مرور دارن اینجا
          دیده می‌شن.
        </p>
      )}
      <div className="learning-course-grid">
        {selected.map((row) => {
          const course = courseFor(catalog, row.unit_id);
          const lesson = course?.stages.flatMap((s) => s.lessons).find((l) => l.id === row.unit_id);
          return (
            <article className="learning-course-card" key={row.unit_id}>
              <h2>{lesson?.title ?? course?.title ?? row.unit_id}</h2>
              <p>
                {row.completed ? 'تمرین شده' : 'در حال تمرین'}
                {row.bookmarked ? ' · ذخیره‌شده برای بعد' : ''}
              </p>
              {row.note && <p className="learning-prose">{row.note}</p>}
              <Link to={`/academy/lesson/${row.unit_id}`}>بازکردن و مرور</Link>
            </article>
          );
        })}
      </div>
      <h2>مرور مرحله‌ها و پایان درس</h2>
      <div className="learning-review-list">
        {catalog.courses.map((course) => (
          <details key={course.id}>
            <summary>{course.title}</summary>
            {course.stages.map(
              (stage) =>
                stage.review_id && (
                  <Link key={stage.id} to={`/academy/review/${stage.review_id}`}>
                    {stage.title}
                  </Link>
                ),
            )}
            {course.final_review_id && (
              <Link to={`/academy/review/${course.final_review_id}`}>مرور پایانی</Link>
            )}
          </details>
        ))}
      </div>
    </section>
  );
}

function GuidePage({ catalog }: { catalog: Catalog }) {
  return (
    <section className="academy-page learning-guide">
      <h1 tabIndex={-1}>با این مسیر چطور یاد بگیریم؟</h1>
      <AcademyMascot mood="guidance" />
      <ol>
        <li>
          از «حوزه‌ها» یک درس رو انتخاب کن. رنگ‌ها مرحله‌های اون درس رو نشون می‌دن و هر دایره یک
          درس‌نامه‌ست.
        </li>
        <li>
          کارت‌ها رو کامل بخون؛ مثال، جدول و تصویر کنار مفهوم خودش قرار داره. تصویر عریض رو داخل
          قابش به طرفین حرکت بده.
        </li>
        <li>
          جوابت رو ثبت کن تا بازخورد و راه‌حل رو ببینی. در فعالیت عددی، واحد خواسته‌شده رو رعایت کن.
        </li>
        <li>
          فعالیت پاسخ‌باز نمرهٔ خودکار نداره؛ بعد از نوشتن پاسخ، با معیارهای ارائه‌شده مرورش کن.
        </li>
        <li>
          مرور هر مرحله و مرور پایانی جدا در دسترسن. سؤال‌های قبلی برچسب تکراری دارن و آزمون مستقل
          حساب نمی‌شن.
        </li>
        <li>
          با ورود به حسابت، پیشرفت، پاسخ ثبت‌شده، درس‌های انتخاب‌شده برای بعد و یادداشت‌هات در حساب
          خودت ذخیره می‌شن. ترتیب پیشنهادی درس‌ها جلوی دسترسی مستقیم رو نمی‌گیره.
        </li>
      </ol>
      <h2>وضعیت علمی این نسخه</h2>
      <p>{copy.draft}</p>
      <p>
        {faNumber(Number(catalog.release_followups.unconfirmed_direct_publisher_urls))} نشانی ناشر
        هنوز دسترسی مستقیم تأییدشده ندارن. دسترسی به چکیده با خواندن متن کامل یکی نیست. محدودیت هر
        منبع در درس مربوط حفظ شده.
      </p>
      <p>
        بانک سؤال مستقل و بررسی با یادگیرنده هنوز باقیه. ترجمهٔ کامل زبان‌های دیگه آماده نیست؛
        محتوای فعلی با زبان و جهت فارسی نمایش داده می‌شه.
      </p>
    </section>
  );
}

export default function ConnectedAcademy() {
  const catalog = useQuery({
    queryKey: ['academy-catalog'],
    queryFn: ({ signal }) => loadContent<Catalog>('catalog', signal),
  });
  const [state, setState] = useState<LearningState>({ user_id: '', units: {} });
  const stateRef = useRef(state);
  const [status, setStatus] = useState<'loading' | 'guest' | 'ready' | 'error'>('loading');
  const [warning, setWarning] = useState('');
  const { dir } = useUIAppearance();
  const location = useLocation();
  const inLesson = /\/(lesson|review)\//.test(location.pathname);
  function update(units: Record<string, Progress>) {
    const next = { ...stateRef.current, units };
    stateRef.current = next;
    setState(next);
  }
  async function refresh(silent = false) {
    if (!silent) setStatus('loading');
    try {
      const next = await learningState();
      stateRef.current = next;
      setState(next);
      setStatus('ready');
      setWarning('');
    } catch (error) {
      if (
        silent &&
        error instanceof ApiError &&
        error.status === 401 &&
        !stateRef.current.user_id
      ) {
        setStatus('guest');
        return;
      }
      if (silent && !(error instanceof ApiError && error.status === 401)) {
        setWarning(
          'ارتباط با حسابت برقرار نشد؛ نوشتهٔ ذخیره‌نشده‌ات همین‌جا می‌مونه. دوباره تلاش کن.',
        );
        return;
      }
      stateRef.current = { user_id: '', units: {} };
      setState(stateRef.current);
      if (error instanceof ApiError && error.status === 401) setStatus('guest');
      else {
        setStatus('error');
        setWarning('پیشرفت حسابت باز نشد. برای ذخیره، ارتباط با سرویس باید برقرار باشه.');
      }
    }
  }
  useEffect(() => {
    void refresh();
    const clear = () => {
      if (!stateRef.current.user_id) return;
      stateRef.current = { user_id: '', units: {} };
      setState(stateRef.current);
      setStatus('guest');
    };
    window.addEventListener('stratino:session-expired', clear);
    const focus = () => {
      void refresh(true);
    };
    window.addEventListener('focus', focus);
    return () => {
      window.removeEventListener('stratino:session-expired', clear);
      window.removeEventListener('focus', focus);
    };
  }, []);
  useEffect(() => {
    document.title = 'استراتینو | آکادمی آموزش';
    window.scrollTo(0, 0);
  }, [location.pathname, location.search]);
  const learning: LearningActions = {
    userId: state.user_id,
    progress: state.units,
    authenticated: status === 'ready',
    async save(unit, data) {
      if (status === 'error' || status === 'loading')
        throw new Error('پیشرفت حسابت هنوز در دسترس نیست؛ دوباره تلاش کن.');
      const current = stateRef.current.units[unit.id] ?? fresh(unit);
      if (status === 'ready') {
        const saved = await saveProgress(unit, current.revision, data, stateRef.current.user_id);
        update({ ...stateRef.current.units, [unit.id]: saved });
      } else {
        const viewed = Array.from(
          new Set([...current.viewed_cards, ...(data.card_id ? [data.card_id] : [])]),
        );
        update({
          ...stateRef.current.units,
          [unit.id]: previewCompletion(unit, { ...current, ...data, viewed_cards: viewed }),
        });
      }
    },
    async answer(unit, id, value) {
      const response = await submitAnswer(unit, id, value, stateRef.current.user_id);
      if (status === 'ready' && !response.saved) {
        stateRef.current = { user_id: '', units: {} };
        setState(stateRef.current);
        setStatus('guest');
        setWarning('نشست حسابت تموم شده. این پاسخ در حسابت ذخیره نشد؛ دوباره وارد شو.');
      }
      if (response.progress) update({ ...stateRef.current.units, [unit.id]: response.progress });
      else {
        const current = stateRef.current.units[unit.id] ?? fresh(unit);
        const previous = id === 'activity' ? current.activity_response : current.responses[id];
        const record = {
          answer: value,
          result: response.result,
          attempts: (previous?.attempts ?? 0) + 1,
          first_correct: previous?.first_correct ?? response.result.correct,
        };
        update({
          ...stateRef.current.units,
          [unit.id]: previewCompletion(unit, {
            ...current,
            ...(id === 'activity'
              ? { activity_response: record }
              : { responses: { ...current.responses, [id]: record } }),
          }),
        });
      }
      return response.result;
    },
  };
  const destinations: [string, string, AcademyIconName][] = [
    ['/academy', copy.path, 'star'],
    ['/academy/catalog', copy.catalog, 'book'],
    ['/academy/review', copy.review, 'target'],
    ['/academy/guide', copy.guide, 'spark'],
  ];
  return (
    <div className={`academy${inLesson ? ' academy--lesson' : ''}`} lang="fa" dir="rtl">
      <header className="academy-header">
        <Link to="/academy" aria-label="آکادمی استراتینو">
          <Brand />
        </Link>
        <span>یاد بگیر. تمرین کن. تصمیم بگیر.</span>
        <nav aria-label="ناوبری آموزش">
          <Button
            variant="quiet"
            onClick={() =>
              applyAccountPreferences({
                ...readDevicePreferences(),
                theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark',
              })
            }
          >
            تغییر تم
          </Button>
          <Link className="academy-account-link" to="/app/account#subscription">
            حساب و اشتراک‌ها
          </Link>
          <Link to="/">بازگشت به استراتینو</Link>
        </nav>
      </header>
      {!inLesson && (
        <nav className="academy-navigation" aria-label="بخش‌های آکادمی">
          {destinations.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end>
              <AcademyIcon name={icon} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
      <div className="academy-preview-note">{copy.draft}</div>
      {dir === 'ltr' && (
        <p className="academy-language-note" lang="en" dir="ltr">
          Course translations are not ready yet. The complete Persian content is shown in its
          original direction.
        </p>
      )}
      {status === 'guest' && (
        <p className="academy-language-note">
          {copy.guest}{' '}
          <Link
            to={`/account/login?next=${encodeURIComponent(location.pathname + location.search)}`}
          >
            ورود به حساب
          </Link>
        </p>
      )}
      {warning && (
        <div className="academy-warning" role="alert">
          {warning} <Button onClick={() => void refresh()}>{copy.retry}</Button>
        </div>
      )}
      {catalog.isPending || status === 'loading' ? (
        <p className="academy-page" role="status">
          {copy.loading}
        </p>
      ) : catalog.isError ? (
        <section className="academy-page">
          <h1>محتوا باز نشد</h1>
          <p role="alert">{catalog.error.message}</p>
          <Button onClick={() => void catalog.refetch()}>{copy.retry}</Button>
        </section>
      ) : (
        <Routes>
          <Route index element={<Path catalog={catalog.data} learning={learning} />} />
          <Route
            path="catalog"
            element={<CatalogPage catalog={catalog.data} learning={learning} />}
          />
          <Route
            path="review"
            element={<ReviewPage catalog={catalog.data} learning={learning} />}
          />
          <Route path="guide" element={<GuidePage catalog={catalog.data} />} />
          <Route
            path="lesson/:unitId"
            element={<UnitPage catalog={catalog.data} learning={learning} />}
          />
          <Route
            path="review/:unitId"
            element={<UnitPage catalog={catalog.data} learning={learning} />}
          />
          <Route
            path="*"
            element={
              <section className="academy-page">
                <h1>این صفحه پیدا نشد</h1>
                <Link to="/academy">بازگشت به مسیر</Link>
              </section>
            }
          />
        </Routes>
      )}
    </div>
  );
}
