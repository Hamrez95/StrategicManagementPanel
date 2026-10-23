import { Link } from 'react-router';
import { AcademyIcon } from './AcademyIcons';

export function AcademyPurchaseDock({
  courseId,
  label = 'دسترسی به آموزش کامل',
  onDismiss,
}: {
  courseId: string;
  label?: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="academy-purchase-dock">
      <span role="status">{label}</span>
      <Link
        className="ui-button ui-button--primary"
        to={`/academy/subscriptions?course=${encodeURIComponent(courseId)}`}
      >
        خرید اشتراک <AcademyIcon name="lock" />
      </Link>
      {onDismiss && (
        <button
          type="button"
          className="academy-dock-dismiss"
          aria-label="بستن پیام اشتراک"
          onClick={onDismiss}
        >
          ×
        </button>
      )}
    </div>
  );
}

export function AcademyAccessGate({
  title,
  sample = false,
  courseId,
}: {
  title: string;
  sample?: boolean;
  courseId: string;
}) {
  return (
    <section className="academy-access-gate" aria-label="دسترسی به ادامهٔ آموزش">
      <span className="academy-access-lock">
        <AcademyIcon name="lock" />
      </span>
      <h2>{sample ? 'ادامهٔ این درس با اشتراک' : 'این بخش با اشتراک باز می‌شه'}</h2>
      <p>
        {sample
          ? 'برای ادامهٔ همین درس‌نامه، تمرین‌ها و مرورها، اشتراک مناسب رو انتخاب کن.'
          : `برای دسترسی به «${title}»، اشتراک کامل یا اشتراک مربوط به این حوزه رو انتخاب کن.`}
      </p>
      <Link
        className="ui-button ui-button--primary"
        to={`/academy/subscriptions?course=${encodeURIComponent(courseId)}`}
      >
        دیدن اشتراک‌ها
      </Link>
      <Link to={`/academy?course=${encodeURIComponent(courseId)}`}>برگشتن به مسیر</Link>
    </section>
  );
}
