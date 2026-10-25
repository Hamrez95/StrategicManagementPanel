import { useState } from 'react';
import { Link } from 'react-router';
import { AcademyIcon } from './AcademyIcons';
import { AcademyMascot } from './AcademyMascot';
import { AcademyPurchaseDock } from './AcademyAccess';
import { academyCopy as copy } from './academyMessages';
import type { Access, Catalog, Progress } from './connectedData';
import { faNumber } from './connectedData';
import type { LearningActions } from './LearningPlayer';
import './academyLibrary.css';

type Entry = {
  id: string;
  title: string;
  course: string;
  courseId: string;
  path: string;
  review: boolean;
  access?: Access;
};
function entries(catalog: Catalog): Entry[] {
  return catalog.courses.flatMap((course) => [
    ...course.stages.flatMap((stage) => [
      ...stage.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        course: course.title,
        courseId: course.id,
        path: course.path_id,
        review: false,
        access: lesson.access,
      })),
      ...(stage.review_id
        ? [
            {
              id: stage.review_id,
              title: `مرور ${stage.title}`,
              course: course.title,
              courseId: course.id,
              path: course.path_id,
              review: true,
              access: stage.review_access,
            },
          ]
        : []),
    ]),
    ...(course.final_review_id
      ? [
          {
            id: course.final_review_id,
            title: `مرور پایانی ${course.title}`,
            course: course.title,
            courseId: course.id,
            path: course.path_id,
            review: true,
            access: course.final_review_access,
          },
        ]
      : []),
  ]);
}
const mistakes = (row: Progress) =>
  Object.entries(row.responses).filter(([, response]) => response.first_correct === false);
const filters = [
  ['all', 'همه'],
  ['practice', 'نیاز به مرور'],
  ['saved', 'ذخیره‌شده‌ها'],
  ['notes', 'یادداشت‌ها'],
  ['completed', 'تمرین‌شده‌ها'],
] as const;

export function ReviewPage({ catalog, learning }: { catalog: Catalog; learning: LearningActions }) {
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [path, setPath] = useState('all');
  const [locked, setLocked] = useState<string | null>(null);
  const all = entries(catalog),
    lookup = new Map(all.map((entry) => [entry.id, entry]));
  const records = Object.values(learning.progress).filter(
    (row) =>
      row.note ||
      row.bookmarked ||
      row.completed ||
      row.viewed_cards.length ||
      Object.keys(row.responses).length,
  );
  const matches = (entry?: Entry) =>
    (!search || `${entry?.title ?? ''} ${entry?.course ?? ''}`.includes(search.trim())) &&
    (path === 'all' || entry?.path === path);
  const selected = records.filter(
    (row) =>
      matches(lookup.get(row.unit_id)) &&
      (filter === 'all' ||
        (filter === 'practice' && mistakes(row).length > 0) ||
        (filter === 'saved' && row.bookmarked) ||
        (filter === 'notes' && row.note.trim()) ||
        (filter === 'completed' && row.completed)),
  );
  return (
    <section className="academy-page academy-library">
      <header className="library-heading">
        <div>
          <h1>یادگیری با مرور جا می‌افته</h1>
          <p>
            یادداشت‌هات رو پیدا کن، سراغ ذخیره‌شده‌ها برو یا تمرینی رو که بار اول درست جواب ندادی
            دوباره ببین.
          </p>
        </div>
        <span className="library-heading-icon">
          <AcademyIcon name="target" />
        </span>
      </header>
      {!learning.authenticated && (
        <p className="library-notice">
          این مرور به همین بازدید مربوطه. برای نگه‌داشتن پیشرفت و یادداشت‌هات،{' '}
          <Link to="/account/login?next=%2Facademy%2Freview">وارد حسابت شو</Link>.
        </p>
      )}
      <div className="library-stats">
        <span>
          <strong>{faNumber(records.filter((row) => row.bookmarked).length)}</strong> درس ذخیره‌شده
        </span>
        <span>
          <strong>{faNumber(records.filter((row) => row.note.trim()).length)}</strong> یادداشت
        </span>
        <span>
          <strong>{faNumber(records.filter((row) => mistakes(row).length > 0).length)}</strong> بخش
          برای مرور
        </span>
      </div>
      <div className="library-search">
        <label>
          پیداکردن درس
          <input
            type="search"
            value={search}
            placeholder="اسم درس یا مجموعه رو بنویس"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          حوزه
          <select value={path} onChange={(event) => setPath(event.target.value)}>
            <option value="all">همهٔ حوزه‌ها</option>
            {catalog.paths.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="library-filters" role="group" aria-label="نوع مرور">
        {filters.map(([id, title]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {title}
          </button>
        ))}
      </div>
      <p className="library-result-count" role="status">
        {faNumber(selected.length)} بخش در این فهرست
      </p>
      {!selected.length ? (
        <div className="library-empty">
          <AcademyIcon name={filter === 'notes' ? 'book' : 'target'} />
          <h2>
            {records.length
              ? 'اینجا چیزی با این انتخاب پیدا نشد'
              : 'اولین مرور از یک درس شروع می‌شه'}
          </h2>
          <p>
            {records.length
              ? 'فیلتر یا عبارت جست‌وجو رو عوض کن.'
              : 'یک درس رو شروع کن؛ هر چیزی که ذخیره کنی یا براش یادداشت بنویسی، اینجا دم دستته.'}
          </p>
          <Link className="ui-button" to="/academy/catalog">
            دیدن درس‌ها
          </Link>
        </div>
      ) : (
        <div className="library-records">
          {selected.map((row) => {
            const entry = lookup.get(row.unit_id),
              wrong = mistakes(row);
            const href = `/academy/${entry?.review ? 'review' : 'lesson'}/${row.unit_id}`;
            return (
              <article key={row.unit_id} className="library-record">
                <div className="library-record-meta">
                  <span>{entry?.course ?? 'درس خارج از فهرست فعلی'}</span>
                  <span>{row.completed ? 'تمرین شده ✓' : 'در حال یادگیری'}</span>
                </div>
                <h2>{entry?.title ?? 'یادداشت درس قبلی'}</h2>
                {row.bookmarked && <span className="library-saved">ذخیره‌شده برای بعد</span>}
                {row.note && (
                  <details className="library-note" open={filter === 'notes'}>
                    <summary>یادداشت من</summary>
                    <p>{row.note}</p>
                  </details>
                )}
                {!!wrong.length && (
                  <details className="library-mistakes">
                    <summary>{faNumber(wrong.length)} تمرین برای مرور دوباره</summary>
                    <p>
                      این‌ها تمرین‌هایی هستن که بار اول درست جواب ندادی؛ حتی اگر بعداً اصلاحشون کرده
                      باشی.
                    </p>
                    {wrong.map(([id], index) => (
                      <Link key={id} to={`${href}?question=${encodeURIComponent(id)}`}>
                        مرور تمرین {faNumber(index + 1)}
                      </Link>
                    ))}
                  </details>
                )}
                <Link className="text-link" to={href}>
                  {row.completed ? 'بازکردن و مرور' : 'ادامهٔ یادگیری'}
                </Link>
              </article>
            );
          })}
        </div>
      )}
      <section className="library-review-bank">
        <h2>مرور مرحله‌ها و پایان درس</h2>
        <p>{copy.independentNotice}</p>
        {catalog.courses
          .filter(
            (course) =>
              (path === 'all' || course.path_id === path) &&
              (!search ||
                course.title.includes(search.trim()) ||
                course.stages.some((stage) => stage.title.includes(search.trim()))),
          )
          .map((course) => (
            <details key={course.id}>
              <summary>{course.title}</summary>
              <div>
                {all
                  .filter((entry) => entry.courseId === course.id && entry.review)
                  .map((entry) => (
                    <Link
                      key={entry.id}
                      to={`/academy/review/${entry.id}`}
                      onClick={(event) => {
                        if (!entry.access?.hasAccess) {
                          event.preventDefault();
                          setLocked(course.id);
                        }
                      }}
                    >
                      <AcademyIcon name={entry.access?.hasAccess ? 'target' : 'lock'} />
                      <span>{entry.title}</span>
                      <small>
                        {learning.progress[entry.id]?.completed
                          ? 'مرور شده'
                          : entry.access?.hasAccess
                            ? 'آمادهٔ مرور'
                            : 'با اشتراک'}
                      </small>
                    </Link>
                  ))}
              </div>
            </details>
          ))}
      </section>
      {locked && (
        <AcademyPurchaseDock
          courseId={locked}
          label="این مرور با اشتراک باز می‌شه"
          onDismiss={() => setLocked(null)}
        />
      )}
    </section>
  );
}

const guideSteps = [
  [
    'book',
    'یک مسیر متناسب با نیازت پیدا کن',
    'در «حوزه‌ها» مجموعه‌ها رو ببین. در «مسیر من» هم می‌تونی حوزه و درس رو عوض کنی. ترتیب پیشنهاده؛ لازم نیست برای دیدن درس‌های اشتراکت همهٔ مسیر رو به ترتیب بری.',
  ],
  [
    'star',
    'هر دایره، یک درس‌نامه‌ست',
    'رنگ‌ها مرحله‌های درس رو جدا می‌کنن. دایرهٔ طلایی یعنی اون بخش رو تمرین کردی. دایرهٔ خاکستری و قفل‌دار یعنی برای بازکردنش اشتراک مربوط رو لازم داری.',
  ],
  [
    'spark',
    'کارت‌ها رو بخون و مثال‌ها رو بررسی کن',
    'آموزش، مثال، جدول و تصویر کنار هم قرار دارن. تصویر رو باز کن تا جزئیاتش رو ببینی؛ روی موبایل می‌تونی با دو انگشت بزرگش کنی. جدول عریض رو داخل کادر خودش جابه‌جا کن.',
  ],
  [
    'check',
    'جوابت رو بده، بعد دلیلش رو ببین',
    'در تمرین گزینه‌ای، جواب رو انتخاب کن و «بررسی جواب» رو بزن. در فعالیت عددی، به واحد خواسته‌شده توجه کن. در فعالیت پاسخ‌باز، پاسخت رو بنویس و با معیارهایی که بعدش می‌بینی مرور کن؛ نمرهٔ خودکار نداره.',
  ],
  [
    'target',
    'مرور رو به آخر مسیر محدود نکن',
    'مرور مرحله و مرور پایانی برای تمرین بیشترن. در بخش «مرور» هم می‌تونی تمرین‌هایی رو پیدا کنی که بار اول درست جواب ندادی. سؤال تکراری، آزمون مستقل حساب نمی‌شه.',
  ],
] as const;
const faqs = [
  [
    'از کجا شروع کنم؟',
    'اگر تازه شروع کردی، حوزهٔ «آماده‌سازی از صفر» رو ببین. برای نیاز مشخص، از فهرست حوزه‌ها مجموعهٔ مرتبط رو پیدا کن. پیش‌نیازها پیشنهادی هستن، نه قفل دسترسی.',
  ],
  [
    'چه بخش‌هایی رایگانه؟',
    'چند کارت اول تک‌تک درس‌نامه‌های عمومی و چند کارت از یک درس منتخب گرایش‌ها رایگانه. تمرین‌ها و مرورهای کامل به اشتراک مربوط نیاز دارن.',
  ],
  [
    'فرق اشتراک‌ها چیه؟',
    'اشتراک عمومی فقط بخش عمومی رو باز می‌کنه. در اشتراک گرایش، یک یا چند گرایش رو انتخاب می‌کنی. اشتراک کامل همهٔ محتوای عمومی، گرایش‌ها و درس‌های تکمیلی رو شامل می‌شه.',
  ],
  [
    'چطور یک درس رو برای بعد نگه دارم؟',
    'داخل درس، آیکن ذخیره رو بزن. پیام کوتاه ثبت‌شدن رو می‌بینی و بعد می‌تونی درس رو در «مرور ← ذخیره‌شده‌ها» پیدا کنی. با زدن دوبارهٔ آیکن، از اون فهرست برداشته می‌شه.',
  ],
  [
    'یادداشت و پیشرفتم کجا ذخیره می‌شه؟',
    'برای نگه‌داشتن یادداشت و پیشرفت بین بازدیدها وارد حسابت شو. متن یادداشت رو با دکمهٔ ذخیره ثبت کن و پیام موفقیت رو ببین. اگر ارتباط قطع بشه یا نشستت تموم بشه، پیام خطا رو می‌بینی؛ بعد از رفع مشکل دوباره ذخیره کن.',
  ],
  [
    'اگر یک پاسخ یا مطلب رو نادرست دیدم چی؟',
    'پایین همون درس از بخش «نظر و اصلاح» استفاده کن. بگو کدوم جمله یا تصویر نیاز به بررسی داره و اگر منبعی داری بنویس. نشانی دقیق درس و کارت همراه نظرت ثبت می‌شه.',
  ],
  [
    'چطور منبع یک مطلب رو ببینم؟',
    'بخش منابع همون درس‌نامه رو باز کن. ارجاع‌ها و محدودیت دسترسی اونجا نوشته شده. دیدن چکیده به معنی بررسی متن کامل منبع نیست.',
  ],
  [
    'چرا بعضی مرورها سؤال آشنا دارن؟',
    'بعضی مرورها از سؤال‌های قبلی استفاده می‌کنن و برچسب تکراری دارن. این تکرار برای تمرینه؛ نتیجه‌اش گواهی تسلط یا ارزیابی مستقل نیست.',
  ],
  [
    'لیدربورد چه زمانی باز می‌شه؟',
    'هنوز زمان مشخصی نداره. فعلاً صفحهٔ «به‌زودی» رو می‌بینی و رتبه‌بندی واقعی فعال نیست.',
  ],
];
export function GuidePage({ catalog }: { catalog: Catalog }) {
  const [search, setSearch] = useState('');
  const shown = faqs.filter(([question, answer]) =>
    `${question} ${answer}`.includes(search.trim()),
  );
  return (
    <section className="academy-page academy-library academy-help">
      <header className="library-heading">
        <div>
          <h1>برای هر قدم، یک راه روشن</h1>
          <p>از انتخاب درس تا مرور و یادداشت؛ اینجا ببین هر بخش چطور به یادگیریت کمک می‌کنه.</p>
          <div className="help-shortcuts">
            <a href="#learning-steps">شروع یادگیری</a>
            <a href="#common-questions">سؤال‌های رایج</a>
            <a href="#scientific-status">وضعیت علمی</a>
          </div>
        </div>
        <AcademyMascot mood="guidance" />
      </header>
      <section id="learning-steps">
        <h2>مسیر یادگیری چطور پیش می‌ره؟</h2>
        <ol className="help-steps">
          {guideSteps.map(([icon, title, text], index) => (
            <li key={title}>
              <span className="help-step-icon">
                <AcademyIcon name={icon} />
              </span>
              <div>
                <small>قدم {faNumber(index + 1)}</small>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section id="common-questions">
        <h2>چیزی برات مبهمه؟</h2>
        <label className="help-search">
          جست‌وجو در راهنما
          <input
            type="search"
            value={search}
            placeholder="مثلاً ذخیره، اشتراک یا تمرین"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="help-faqs">
          {shown.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
        {!shown.length && (
          <p role="status">سؤالی با این عبارت پیدا نشد؛ یک کلمهٔ کوتاه‌تر رو امتحان کن.</p>
        )}
      </section>
      <section id="scientific-status" className="help-scientific">
        <h2>وضعیت علمی این نسخه</h2>
        <p>{copy.draft}</p>
        <p>
          {faNumber(Number(catalog.release_followups.unconfirmed_direct_publisher_urls))} نشانی ناشر
          هنوز دسترسی مستقیم تأییدشده ندارن. محدودیت هر منبع در درس مربوط حفظ شده.
        </p>
        <p>
          بانک سؤال مستقل و بررسی با یادگیرنده هنوز باقیه. ترجمهٔ کامل زبان‌های دیگه آماده نیست؛
          محتوای فعلی با زبان و جهت فارسی نمایش داده می‌شه.
        </p>
      </section>
      <div className="help-actions">
        <Link className="ui-button ui-button--primary" to="/academy/catalog">
          انتخاب یک درس
        </Link>
        <Link className="ui-button" to="/academy/subscriptions">
          مقایسهٔ اشتراک‌ها
        </Link>
      </div>
    </section>
  );
}

export function LeaderboardPage() {
  return (
    <section className="academy-page academy-leaderboard">
      <div className="leaderboard-preview" aria-hidden="true">
        <img
          src={new URL('../../assets/academy/leaderboard-coming-soon.png', import.meta.url).href}
          alt=""
        />
        <div className="leaderboard-stars">
          <span>✦</span>
          <span>✦</span>
          <span>✧</span>
        </div>
      </div>
      <div className="leaderboard-announcement">
        <span className="leaderboard-badge">
          <AcademyIcon name="trophy" />
          لیدربورد
        </span>
        <h1>به‌زودی</h1>
        <p>
          جای رقابت دوستانهٔ یادگیری اینجاست.
          <br />
          داریم این بخش رو آماده می‌کنیم؛ رتبه‌بندی هنوز فعال نیست.
        </p>
        <Link className="ui-button ui-button--primary" to="/academy">
          برگشتن به مسیر یادگیری
        </Link>
      </div>
    </section>
  );
}
