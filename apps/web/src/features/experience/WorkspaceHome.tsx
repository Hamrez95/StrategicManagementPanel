import { useState } from 'react';
import { Link } from 'react-router';
import { BoardIllustration, Empty, Icon, PageHeading } from './ExperienceUI';
import { Header } from './ExperienceShell';
import { useSpaces, path } from './store';
import { sampleSpaces, kindLabels, goalLabels } from './model';
export function Welcome() {
  return (
    <>
      <Header simple />
      <section className="ex-welcome">
        <BoardIllustration compact />
        <h1 tabIndex={-1}>حمیدرضا، به استراتینو خوش آمدی.</h1>
        <p>
          برای هر کسب‌وکار یک فضای مستقل بساز.
          <br />
          با چند سؤال ساده، آن را برای خودت آماده می‌کنیم.
        </p>
        <Link className="ex-button" to="/preview/new">
          ساخت اولین فضای کار <Icon name="arrow" />
        </Link>
        <Link className="ex-text-button" to="/preview/tour">
          اول یک معرفی کوتاه می‌بینم
        </Link>
        <small>اینجا فقط اطلاعات مرورگر همین دستگاه ذخیره می‌شود.</small>
      </section>
    </>
  );
}

export function WelcomeTour() {
  const [step, setStep] = useState(0);
  const slides = [
    {
      title: 'هر کسب‌وکار، یک فضای مستقل.',
      text: 'از صفحهٔ فضاهای کاری وارد کسب‌وکارت شو. اطلاعات و برنامه‌های هر کسب‌وکار جدا می‌مانند.',
    },
    {
      title: 'فقط ابزار مرتبط، درست وقتی لازم است.',
      text: 'در نمای کلی، قدم بعدی را ببین. برای بررسی بیشتر، تحلیل‌ها و شواهد هر کدام جای مشخصی دارند.',
    },
    {
      title: 'فکرها را به قدم‌های کوچک تبدیل کن.',
      text: 'در صفحهٔ اقدامات یک کار اضافه کن و وضعیتش را از «برای انجام» به «انجام‌شده» تغییر بده.',
    },
  ];
  return (
    <>
      <Header simple />
      <section className="ex-welcome">
        <BoardIllustration compact />
        <div className="ex-tour-dots" aria-label={`معرفی، مرحلهٔ ${step + 1} از ۳`}>
          {slides.map((slide, index) => (
            <button
              key={slide.title}
              aria-label={`مرحلهٔ ${index + 1}`}
              aria-current={step === index ? 'step' : undefined}
              onClick={() => setStep(index)}
            />
          ))}
        </div>
        <h1 tabIndex={-1}>{slides[step].title}</h1>
        <p aria-live="polite">{slides[step].text}</p>
        {step < 2 ? (
          <button className="ex-button" onClick={() => setStep(step + 1)}>
            ادامهٔ معرفی <Icon name="arrow" />
          </button>
        ) : (
          <Link className="ex-button" to="/preview/new">
            ساخت فضای کار من <Icon name="plus" />
          </Link>
        )}
        <Link className="ex-text-button" to="/preview/workspaces">
          رفتن به فضاهای کاری
        </Link>
      </section>
    </>
  );
}

export function WorkspaceHome() {
  const { spaces, save } = useSpaces();
  const [search, setSearch] = useState('');
  const visible = spaces.filter((s) =>
    s.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  function addSamples() {
    save([...spaces, ...sampleSpaces().filter((s) => !spaces.some((x) => x.id === s.id))]);
  }
  return (
    <div className="ex-home">
      <PageHeading
        title="فضاهای کاری من"
        description="هر کسب‌وکار، فضای خودش را دارد."
        action={
          <Link className="ex-button" to="/preview/new">
            <Icon name="plus" />
            ساخت فضای کار
          </Link>
        }
      />
      {spaces.length > 0 ? (
        <>
          <label className="ex-search">
            <Icon name="search" />
            <input
              aria-label="جست‌وجو در فضاهای کاری"
              placeholder="پیدا کردن یک فضای کار…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="ex-space-grid">
            {visible.map((space) => (
              <Link className="ex-space-card" key={space.id} to={path(space)}>
                <div className={`ex-space-cover ex-color--${space.color}`}>
                  <span className="ex-cover-board">
                    <i />
                    <i />
                    <i />
                  </span>
                  {space.sample && <span className="ex-sample-label">دادهٔ نمونه</span>}
                </div>
                <div className="ex-space-card-body">
                  <h2>{space.name}</h2>
                  <p>
                    {space.setupComplete === false
                      ? 'آمادهٔ شناخت اولیه'
                      : `${kindLabels[space.kind]} · ${goalLabels[space.goal]}`}
                  </p>
                  <span>
                    بازکردن فضای کار <Icon name="arrow" size={17} />
                  </span>
                </div>
              </Link>
            ))}
            {!search && (
              <Link className="ex-create-card" to="/preview/new">
                <Icon name="plus" size={26} />
                <strong>یک کسب‌وکار دیگر</strong>
                <span>ساخت فضای کار جدید</span>
              </Link>
            )}
          </div>
          {visible.length === 0 && (
            <Empty
              icon="search"
              title="فضایی با این نام پیدا نشد"
              text="نام دیگری را جست‌وجو کنید."
              action={
                <button className="ex-button ex-button--outline" onClick={() => setSearch('')}>
                  پاک‌کردن جست‌وجو
                </button>
              }
            />
          )}
        </>
      ) : (
        <Empty
          title="اولین فضای کارتان را بسازید"
          text="نام و چند انتخاب ساده کافی است. بقیه را می‌توانید بعداً کامل کنید."
          action={
            <Link className="ex-button" to="/preview/new">
              ساخت فضای کار <Icon name="plus" />
            </Link>
          }
        />
      )}
      {!spaces.some((s) => s.sample) && (
        <div className="ex-home-foot">
          <span>می‌خواهید اول محیط را ببینید؟</span>
          <button className="ex-text-button" onClick={addSamples}>
            افزودن دو فضای نمونه
          </button>
        </div>
      )}
    </div>
  );
}
