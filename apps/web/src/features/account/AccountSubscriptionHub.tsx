import { Link } from 'react-router';

function ProductIcon({ name }: { name: 'management' | 'academy' }) {
  return name === 'management' ? (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M8 38V10h32v28H8Z" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="M14 31V23m10 8V16m10 15v-5"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path d="M13 17h5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M6.5 12.5c6.4-2.3 12.2-1.5 17.5 2.2v25c-5.3-3.7-11.1-4.5-17.5-2.2v-25Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M41.5 12.5c-6.4-2.3-12.2-1.5-17.5 2.2v25c5.3-3.7 11.1-4.5 17.5-2.2v-25Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M13 20c2.8-.5 5.5.1 7.8 1.7M13 26c2.8-.5 5.5.1 7.8 1.7m14.2-7.7c-2.8-.5-5.5.1-7.8 1.7m7.8 4.3c-2.8-.5-5.5.1-7.8 1.7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const academyPlans = [
  {
    id: 'general',
    title: 'مدیریت عمومی',
    description: 'برای یادگیری پایه‌های مشترک مدیریت و تصمیم‌گیری.',
    detail: 'دسترسی ۱۲ماهه به مسیر مدیریت عمومی',
  },
  {
    id: 'specializations',
    title: 'گرایش‌های تخصصی',
    description: 'یک یا چند گرایش را متناسب با هدفت انتخاب کن.',
    detail: 'دسترسی ۱۲ماهه، با تخفیف پلکانی برای چند گرایش',
  },
  {
    id: 'complete',
    title: 'دسترسی کامل',
    description: 'مدیریت عمومی و همهٔ گرایش‌های تخصصی را یک‌جا داشته باش.',
    detail: 'دسترسی ۱۲ماهه به کل کاتالوگ',
    featured: true,
  },
];

export default function AccountSubscriptionHub() {
  return (
    <section
      id="subscription"
      className="account-subscriptions"
      aria-labelledby="subscription-heading"
    >
      <div className="account-subscriptions__intro">
        <div>
          <p className="account-subscriptions__eyebrow">خرید و دسترسی</p>
          <h2 id="subscription-heading">خرید و اشتراک‌ها</h2>
          <p>یک حساب داری؛ اشتراک هر محصول جداست و فقط همان محصول را باز می‌کند.</p>
        </div>
        <span className="account-subscriptions__account-mark" aria-hidden="true">
          ۱ حساب
        </span>
      </div>

      <div className="account-subscriptions__products">
        <article className="subscription-product subscription-product--management">
          <div className="subscription-product__topline">
            <span className="subscription-product__icon">
              <ProductIcon name="management" />
            </span>
            <span className="subscription-product__kind">محصول مدیریتی</span>
          </div>
          <h3>پنل مدیریت</h3>
          <p>برای مدیریت فضای کاری و ابزارهای کسب‌وکارت.</p>
          <p className="subscription-product__status">جزئیات پلن و قیمت هنوز نهایی نشده.</p>
          <Link className="subscription-product__link" to="#management-plans">
            دیدن وضعیت پلن‌ها
          </Link>
        </article>

        <article className="subscription-product subscription-product--academy">
          <div className="subscription-product__topline">
            <span className="subscription-product__icon">
              <ProductIcon name="academy" />
            </span>
            <span className="subscription-product__kind">محصول آموزشی</span>
          </div>
          <h3>آکادمی MBA</h3>
          <p>مدیریت عمومی و گرایش‌های تخصصی را با مسیرهای آموزشی یاد بگیر.</p>
          <p className="subscription-product__status">
            بسته‌های سالانه تعریف شده‌اند؛ خرید هنوز فعال نیست.
          </p>
          <Link className="subscription-product__link" to="#academy-plans">
            دیدن بسته‌های آموزشی
          </Link>
        </article>
      </div>

      <section
        id="management-plans"
        className="subscription-details"
        aria-labelledby="management-plans-title"
      >
        <div className="subscription-details__heading">
          <div>
            <p className="subscription-details__label">پنل مدیریت</p>
            <h3 id="management-plans-title">پلن‌های پنل مدیریت</h3>
          </div>
          <span className="subscription-status">در حال آماده‌سازی</span>
        </div>
        <p className="subscription-details__copy">
          محدودهٔ پلن‌ها، سهمیه‌ها و قیمت‌ها هنوز نهایی نشده. وقتی آماده باشند، همین‌جا می‌تونی
          جزئیات را ببینی و خرید را شروع کنی.
        </p>
        <div className="subscription-details__actions">
          <Link className="ui-button ui-button--secondary" to="/app/start">
            رفتن به پنل مدیریت
          </Link>
          <button
            className="ui-button ui-button--quiet academy-plan__action"
            type="button"
            disabled
            aria-describedby="subscription-not-ready"
          >
            خرید به‌زودی
          </button>
        </div>
      </section>

      <section
        id="academy-plans"
        className="subscription-details subscription-details--academy"
        aria-labelledby="academy-plans-title"
      >
        <div className="subscription-details__heading">
          <div>
            <p className="subscription-details__label">آکادمی MBA</p>
            <h3 id="academy-plans-title">بسته‌های آموزشی</h3>
          </div>
          <span className="subscription-status subscription-status--annual">دسترسی سالانه</span>
        </div>
        <p className="subscription-details__copy">
          همهٔ بسته‌ها ۱۲ماهه‌اند. قیمت‌های اولیه هنوز قطعی نیستند و فعلاً مبلغی از حسابت کم
          نمی‌شود.
        </p>
        <div className="academy-plan-grid">
          {academyPlans.map((plan) => (
            <article
              key={plan.id}
              className={`academy-plan${plan.featured ? ' academy-plan--featured' : ''}`}
            >
              {plan.featured && <span className="academy-plan__badge">بهترین پوشش محتوا</span>}
              <h4>{plan.title}</h4>
              <p>{plan.description}</p>
              <span className="academy-plan__detail">{plan.detail}</span>
              <p className="academy-plan__price">قیمت نهایی بعد از تکمیل کاتالوگ اعلام می‌شود.</p>
              <button
                className="ui-button ui-button--quiet academy-plan__action"
                type="button"
                disabled
                aria-describedby="subscription-not-ready"
              >
                خرید به‌زودی
              </button>
            </article>
          ))}
        </div>
        <div className="subscription-free-note">
          <div>
            <strong>قبل از خرید، مسیر را امتحان کن</strong>
            <p>
              نسخهٔ تمرینی فعلی آکادمی رایگانه. برنامه اینه که از هر مسیر هم دست‌کم یک درسنامهٔ
              رایگان داشته باشیم.
            </p>
          </div>
          <Link className="ui-button ui-button--secondary" to="/academy">
            دیدن آموزش رایگان
          </Link>
        </div>
      </section>

      <p id="subscription-not-ready" className="subscription-readiness" role="status">
        پرداخت آنلاین و نمایش وضعیت اشتراک هنوز به حساب وصل نشده؛ این صفحه فعلاً بسته‌ها را معرفی
        می‌کند.
      </p>
    </section>
  );
}
