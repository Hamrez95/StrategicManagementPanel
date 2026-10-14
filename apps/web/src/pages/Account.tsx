import { Link } from 'react-router';
import { Notice } from '@stratino/ui';
export default function Account() {
  return (
    <Notice title="حساب استراتینو در حال آماده‌سازی است">
      <p>
        ثبت‌نام، ورود و بازیابی حساب پس از آماده‌شدن بک‌اند فعال می‌شوند. نسخه نمونه را همین حالا
        می‌توانید بررسی کنید؛ اطلاعاتش در مرورگر شما نگهداری می‌شود.
      </p>
      <Link className="ui-button ui-button--primary" to="/demo">
        استفاده از نسخه نمونه
      </Link>
    </Notice>
  );
}
