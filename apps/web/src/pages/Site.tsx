import { Link } from 'react-router';
import { BoardIllustration, Icon, Mark } from '../features/experience/ExperienceUI';

export default function Site({ academyEnabled = true }: { academyEnabled?: boolean }) {
  return (
    <div className="ex-public" dir="rtl">
      <header className="ex-public-nav">
        <Mark />
        <nav aria-label="معرفی استراتینو">
          <a href="#how-it-works">چطور کار می‌کند؟</a>
          {academyEnabled && <Link to="/academy">آموزش مدیریت</Link>}
          <a href="#your-workspace">فضای کار شما</a>
        </nav>
        <div>
          <Link className="ex-button ex-button--quiet" to="/account/login">
            ورود
          </Link>
          <Link className="ex-button" to="/account/signup">
            شروع رایگان
          </Link>
        </div>
      </header>
      <section className="ex-site-hero">
        <div className="ex-site-hero-inner">
          <div className="ex-site-copy">
            <h1 tabIndex={-1}>
              مسیر کسب‌وکارت،
              <br />
              روشن و مرتب.
            </h1>
            <p>
              از شناخت مشتری تا تصمیم و اجرا؛ یک فضای مرتب برای فکرهای مهم و کارهایی که کسب‌وکارت را
              جلو می‌برند.
            </p>
            <div className="ex-site-cta">
              <Link className="ex-button" to="/account/signup">
                فضای کارت را بساز <Icon name="arrow" />
              </Link>
              <Link className="ex-button ex-button--quiet" to="/account/login">
                ورود به حساب
              </Link>
            </div>
            <small>برای استارتاپ‌ها، کسب‌وکارها و تیم‌های سازمانی.</small>
          </div>
          <BoardIllustration />
        </div>
      </section>
      <section className="ex-site-process" id="how-it-works">
        <h2>شروع ساده، مسیر مشخص.</h2>
        <p>همهٔ ابزارها را هم‌زمان لازم نداری. از جایی شروع کن که برای کسب‌وکار تو مهم است.</p>
        <div className="ex-process-grid">
          {[
            {
              title: 'کمی از کسب‌وکارت بگو',
              text: 'چند سؤال کوتاه، هر بار یک سؤال. نوع کسب‌وکار، وضعیت فعلی و هدفت را انتخاب کن.',
            },
            {
              title: 'فضای خودت را داشته باش',
              text: 'برای هر کسب‌وکار یک فضای مستقل؛ با اطلاعات، تحلیل‌ها و برنامه‌های همان کسب‌وکار.',
            },
            {
              title: 'یک قدم عملی بردار',
              text: 'از میان‌بر مرتبط با هدفت شروع کن. تصمیم‌ها را ثبت کن و اقدام بعدی را دنبال کن.',
            },
          ].map((step, i) => (
            <article key={step.title}>
              <span>{new Intl.NumberFormat('fa-IR').format(i + 1)}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>
      {academyEnabled && (
        <section className="ex-site-academy" aria-labelledby="site-academy-title">
          <div className="ex-site-academy-copy">
            <p>آکادمی مدیریت</p>
            <h2 id="site-academy-title">مدیریت را قدم‌به‌قدم یاد بگیر.</h2>
            <p>
              مفهوم‌های کسب‌وکار را در درس‌های کوتاه ببین و با تمرین، آن‌ها را به تصمیم‌هایت وصل کن.
            </p>
            <Link className="ex-button" to="/academy">
              رفتن به آکادمی <Icon name="arrow" />
            </Link>
            <small>
              نسخهٔ تمرینی است؛ درس‌های آغازین در حال بازبینی‌اند. پیشرفت به حساب وصل نیست و فقط در
              همین تب می‌ماند.
            </small>
          </div>
          <ol className="ex-site-academy-steps" aria-label="سه گام یادگیری">
            <li>
              <span>۱</span>
              <strong>یک مفهوم را یاد بگیر</strong>
            </li>
            <li>
              <span>۲</span>
              <strong>یادگیریت را با تمرین بسنج</strong>
            </li>
            <li>
              <span>۳</span>
              <strong>آن را در یک تصمیم به کار ببر</strong>
            </li>
          </ol>
        </section>
      )}
      <section className="ex-site-end" id="your-workspace">
        <h2>هر کسب‌وکار، یک فضای روشن.</h2>
        <p>ایده‌ها، شواهد و برنامه‌هایت را از هم جدا و کنار هم نگه دار.</p>
        <Link className="ex-button" to="/account/signup">
          اولین فضای کارت را بساز
        </Link>
      </section>
      <footer className="ex-site-footer">
        <Mark />
        <p>از شناخت، به تصمیم. از تصمیم، به اقدام.</p>
        <Link to="/account/login">ورود به استراتینو</Link>
      </footer>
    </div>
  );
}
