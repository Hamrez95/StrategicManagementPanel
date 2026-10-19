import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { completedPractice } from '@stratino/domain/academy';
import type { PracticeState } from '@stratino/domain/academy';
import { academyLessons, curriculum } from './content';
import { AcademyMascot } from './AcademyMascot';
import { AcademyIcon } from './AcademyIcons';
import type { AcademyIconName } from './AcademyIcons';

const destinations: { to: string; label: string; icon: AcademyIconName }[] = [
  { to: '/academy', label: 'مسیر من', icon: 'star' },
  { to: '/academy/catalog', label: 'حوزه‌ها', icon: 'book' },
  { to: '/academy/review', label: 'مرور', icon: 'target' },
  { to: '/academy/guide', label: 'راهنما', icon: 'spark' },
];

export function AcademyNavigation() {
  return (
    <nav className="academy-navigation" aria-label="بخش‌های آکادمی" lang="fa" dir="rtl">
      {destinations.map((item) => (
        <NavLink key={item.to} to={item.to} end>
          <AcademyIcon name={item.icon} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function AcademyCatalog() {
  const [search, setSearch] = useState('');
  const tracks = curriculum.tracks.filter((track) => track.title.includes(search.trim()));
  return (
    <section className="academy-page" lang="fa" dir="rtl">
      <div className="academy-page-intro">
        <div>
          <p className="academy-eyebrow">یک مسیر، قدم‌های روشن</p>
          <h1 tabIndex={-1}>دوست داری چه چیزی یاد بگیری؟</h1>
          <p>از مبانی شروع کن. مسیر حوزه‌های بعدی هم اینجاست تا بدانی قرار است به کجا برسیم.</p>
        </div>
        <AcademyMascot mood="guidance" />
      </div>
      <label className="academy-search">
        جست‌وجوی حوزه
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="مثلاً مدیریت استراتژیک"
        />
      </label>
      <div className="academy-course-grid">
        {tracks.map((track, index) => (
          <article key={track.id} className={`academy-course academy-course--${index % 4}`}>
            <div className="academy-course-icon">
              <AcademyIcon name={track.id === 'foundations' ? 'book' : 'briefcase'} />
            </div>
            <span className="academy-course-state">
              {track.id === 'foundations' ? '۶ بخش تمرینی آماده است' : 'در حال آماده‌سازی'}
            </span>
            <h2>{track.title}</h2>
            <p>
              {track.id === 'foundations'
                ? 'مشتری، شواهد و اولین تصمیم را در یک داستان ساده تمرین کن.'
                : 'از آشنایی با مفاهیم تا تصمیم‌های پیشرفته؛ محتوا پس از بررسی منابع و بازبینی آماده می‌شود.'}
            </p>
            <details>
              <summary>در این حوزه چه می‌آموزیم؟</summary>
              <ol>
                {curriculum.modules
                  .filter((module) => module.track === track.id)
                  .map((module) => (
                    <li key={module.id}>{module.title}</li>
                  ))}
              </ol>
            </details>
            {track.id === 'foundations' ? (
              <Link className="ui-button ui-button--primary" to="/academy">
                دیدن مسیر مبانی
              </Link>
            ) : (
              <p className="academy-muted">هنوز برای شروع باز نشده است.</p>
            )}
          </article>
        ))}
      </div>
      {!tracks.length && (
        <div className="academy-empty">
          <AcademyIcon name="target" />
          <h2>این حوزه را پیدا نکردیم</h2>
          <p>یک نام کوتاه‌تر بنویس یا جست‌وجو را پاک کن.</p>
          <button className="ui-button" onClick={() => setSearch('')}>
            پاک‌کردن جست‌وجو
          </button>
        </div>
      )}
    </section>
  );
}

export function AcademyReview({ state }: { state: PracticeState }) {
  const done = completedPractice(academyLessons, state);
  return (
    <section className="academy-page" lang="fa" dir="rtl">
      <div className="academy-page-intro">
        <div>
          <p className="academy-eyebrow">یک بار دیگر، این بار عمیق‌تر</p>
          <h1 tabIndex={-1}>با یک مرور کوتاه برگرد</h1>
          <p>
            بخش‌هایی که گذرانده‌ای اینجا هستند. مرور ناموفق، بخش‌های بازشده‌ات را دوباره قفل
            نمی‌کند.
          </p>
        </div>
        <AcademyMascot mood={done.size ? 'correct' : 'thinking'} />
      </div>
      {done.size ? (
        <div className="academy-review-list">
          {academyLessons
            .filter((lesson) => done.has(lesson.id))
            .map((lesson) => (
              <article key={lesson.id}>
                <AcademyIcon name="check" />
                <div>
                  <h2>{lesson.title}</h2>
                  <p>یک تصمیم تازه با همان ایده تمرین کن.</p>
                </div>
                <Link className="ui-button" to={`/academy/lesson/${lesson.id}`}>
                  مرور این بخش
                </Link>
              </article>
            ))}
        </div>
      ) : (
        <div className="academy-empty">
          <AcademyIcon name="book" />
          <h2>اولین بخش را با هم شروع کنیم؟</h2>
          <p>وقتی آموزش و پرسش‌های یک بخش را پشت سر بگذاری، از اینجا هم می‌توانی مرورش کنی.</p>
          <Link className="ui-button ui-button--primary" to="/academy">
            رفتن به مسیر من
          </Link>
        </div>
      )}
    </section>
  );
}

export function AcademyGuide() {
  return (
    <section className="academy-page academy-help" lang="fa" dir="rtl">
      <div className="academy-page-intro">
        <div>
          <p className="academy-eyebrow">با سرعت خودت پیش برو</p>
          <h1 tabIndex={-1}>اینجا چطور یاد می‌گیریم؟</h1>
          <p>هر بار یک مفهوم کوچک، یک مثال روشن و چند تصمیم؛ من هم کنارت هستم.</p>
        </div>
        <AcademyMascot mood="welcome" />
      </div>
      <ol className="academy-how">
        <li>
          <AcademyIcon name="book" />
          <h2>اول، ایده را بفهم</h2>
          <p>
            داستان را بخوان، برداشت اولیه‌ات را بگو و قاب‌های کوتاه آموزش را یکی‌یکی ببین. انتخاب
            اولیه نمره ندارد.
          </p>
        </li>
        <li>
          <AcademyIcon name="target" />
          <h2>بعد، خودت تصمیم بگیر</h2>
          <p>
            چند پرسش جدا می‌بینی. بعد از هر پاسخ، دلیلش را با هم مرور می‌کنیم. هرجا لازم بود، دوباره
            تمرین کن.
          </p>
        </li>
        <li>
          <AcademyIcon name="lock" />
          <h2>با قبولی، قدم بعد باز می‌شود</h2>
          <p>
            وقتی آموزش این بخش را کامل کنی و پرسش‌هایش را با موفقیت پشت سر بگذاری، بخش بعد برایت باز
            می‌شود. در نمونهٔ فعلی باید هر دو پرسش را درست پاسخ بدهی.
          </p>
        </li>
      </ol>
      <details open>
        <summary>پیشرفت و یادداشت من کجا می‌ماند؟</summary>
        <p>
          فعلاً فقط در همین تب مرورگر نگه داشته می‌شود. رفرش‌کردن مشکلی ندارد؛ بستن تب ممکن است آن
          را پاک کند. ذخیره در حساب هنوز فعال نیست.
        </p>
      </details>
      <details>
        <summary>اصطلاحات تخصصی را چطور می‌بینم؟</summary>
        <p>
          اصطلاح به زبان اصلی نوشته می‌شود؛ مثل{' '}
          <bdi dir="ltr" lang="en">
            Cash Flow
          </bdi>{' '}
          (جریان نقدی). ترجمهٔ فارسی کمک می‌کند معنی را راحت‌تر دنبال کنی.
        </p>
      </details>
      <details>
        <summary>این محتوا چه وضعیتی دارد؟</summary>
        <p>
          شش بخش فعلی نمونهٔ اولیه‌اند و هنوز بازبینی تخصصی نشده‌اند. منابع هر بخش را می‌توانی در
          همان صفحه باز کنی. قبولی این تمرین‌ها، گواهی حرفه‌ای نیست.
        </p>
      </details>
      <Link className="ui-button ui-button--primary" to="/academy">
        برویم سراغ یادگیری
      </Link>
    </section>
  );
}
