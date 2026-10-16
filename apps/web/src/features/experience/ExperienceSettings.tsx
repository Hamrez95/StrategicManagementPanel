import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Dialog } from '@stratino/ui';
import { applyAccountPreferences, readDevicePreferences } from '../account/api';
import { ChoiceGroup, ColorPicker } from './ExperienceForms';
import { Icon, PageHeading } from './ExperienceUI';
import { useSpaces, path } from './store';
import { updateSpace, type Space } from './model';
import { TEST_EMAIL } from './local';
export function SpaceSettings({ space }: { space: Space }) {
  const { spaces, save } = useSpaces();
  const navigate = useNavigate();
  const [name, setName] = useState(space.name);
  const [color, setColor] = useState(space.color);
  const [status, setStatus] = useState('');
  const [confirmName, setConfirmName] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    if (save(updateSpace(spaces, space.id, (s) => ({ ...s, name: name.trim(), color }))))
      setStatus('تغییرات در همین مرورگر ذخیره شد.');
  }
  return (
    <>
      <PageHeading title="تنظیمات فضای کار" description="تنظیمات فقط برای همین کسب‌وکار است." />
      <form className="ex-settings-panel" onSubmit={submit}>
        <h2>نام و ظاهر</h2>
        <label className="ex-field">
          نام فضای کار
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            pattern=".*\S.*"
          />
        </label>
        <ColorPicker value={color} onChange={setColor} />
        <button type="submit" className="ex-button">
          ذخیرهٔ تغییرات
        </button>
        <p role="status">{status}</p>
      </form>
      <div className="ex-settings-panel">
        <h2>شناخت کسب‌وکار</h2>
        <p>پاسخ‌های اولیه را مرور یا اصلاح کن. یادداشت‌ها و اقداماتت حفظ می‌شوند.</p>
        <Link className="ex-button ex-button--outline" to={path(space, 'discovery')}>
          مرور سؤال‌ها
        </Link>
      </div>
      <div className="ex-settings-panel ex-danger-zone">
        <h2>حذف فضای کار محلی</h2>
        <p>
          فقط اطلاعات این فضا از همین مرورگر حذف می‌شود. ابتدا از گزارش، نسخهٔ داده‌ها را دریافت کن.
        </p>
        <Dialog
          trigger={<button className="ex-button ex-button--outline">حذف این فضای کار</button>}
          title="حذف فضای کار"
          description={`برای حذف «${space.name}»، نام آن را وارد کن. این کار قابل بازگشت نیست.`}
        >
          <div className="ex-dialog-form">
            <label className="ex-field">
              نام فضای کار
              <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
            </label>
            <button
              className="ex-button ex-button--danger"
              disabled={confirmName !== space.name}
              onClick={() => {
                if (save(spaces.filter((s) => s.id !== space.id))) navigate('/preview/workspaces');
              }}
            >
              حذف اطلاعات این فضا
            </button>
          </div>
        </Dialog>
      </div>
    </>
  );
}
export function PersonalSettings() {
  const [preferences, setPreferences] = useState(readDevicePreferences);
  const [status, setStatus] = useState('');
  function updateTheme(theme: 'light' | 'dark' | 'system') {
    const next = { ...preferences, theme };
    try {
      applyAccountPreferences(next);
      setPreferences(next);
      setStatus('ظاهر روی همین دستگاه اعمال شد.');
    } catch {
      setStatus('ذخیرهٔ ظاهر انجام نشد.');
    }
  }
  return (
    <div className="ex-narrow-page">
      <PageHeading
        title="حساب و ظاهر برنامه"
        description="انتخاب‌های شخصی تو، مستقل از فضای هر کسب‌وکار."
      />
      <div className="ex-settings-panel">
        <div className="ex-review-name">
          <span className="ex-avatar">ح</span>
          <div>
            <h2>حمیدرضا پاکپور</h2>
            <p dir="ltr">{TEST_EMAIL}</p>
          </div>
        </div>
        <p className="ex-verified">
          <Icon name="shield" />
          حساب تست محلی · ایمیل تأییدشده در نمونه · تمام دسترسی‌های نمونه فعال
        </p>
      </div>
      <div className="ex-settings-panel">
        <h2>ظاهر برنامه</h2>
        <ChoiceGroup
          label="تم"
          value={preferences.theme}
          onChange={(value) => updateTheme(value as 'light' | 'dark' | 'system')}
          choices={[
            { id: 'light', label: 'روشن' },
            { id: 'dark', label: 'تیره' },
            { id: 'system', label: 'همراه با دستگاه' },
          ]}
        />
        <label className="ex-checkbox">
          <input
            type="checkbox"
            checked={preferences.motion === 'reduced'}
            onChange={(e) => {
              const next = {
                ...preferences,
                motion: e.target.checked ? ('reduced' as const) : ('auto' as const),
              };
              applyAccountPreferences(next);
              setPreferences(next);
              setStatus('تنظیم حرکت روی همین دستگاه اعمال شد.');
            }}
          />
          کاهش حرکت و انیمیشن
        </label>
        <p role="status">{status}</p>
      </div>
      <p className="ex-subtle-note">
        این حساب فقط برای تست طراحی روی این دستگاه است؛ دسترسی به حساب واقعی یا کنسول مدیریت سرویس
        نمی‌دهد.
      </p>
    </div>
  );
}
export function Plans() {
  return (
    <div className="ex-narrow-page">
      <PageHeading
        title="دسترسی‌ها و اشتراک"
        description="امکانات متناسب با تعداد کسب‌وکارها و نیاز تو."
      />
      <div className="ex-plan-current">
        <Icon name="shield" size={28} />
        <div>
          <h2>دسترسی کامل برای بررسی طراحی</h2>
          <p>تمام ابزارهای نمونه و ساخت چند فضای کار برای حساب تست باز است.</p>
        </div>
      </div>
      <div className="ex-plan-grid">
        <article>
          <h2>شروع</h2>
          <p>برای مرتب‌کردن اولین کسب‌وکار.</p>
          <ul>
            <li>یک فضای کار برای یک کسب‌وکار</li>
            <li>شناخت اولیه و ابزارهای پایه</li>
            <li>نگهداری و خروجی اطلاعات خودت</li>
          </ul>
        </article>
        <article>
          <h2>اشتراک</h2>
          <p>برای چند کسب‌وکار و تحلیل‌های بیشتر.</p>
          <ul>
            <li>ساخت فضاهای کاری بیشتر</li>
            <li>دسترسی به ابزارهای اشتراک</li>
            <li>شناخت مستقل هر کسب‌وکار</li>
          </ul>
        </article>
      </div>
      <p className="ex-subtle-note">
        قیمت، سقف دقیق و پرداخت هنوز فعال نیستند. این صفحه دسترسی حساب واقعی را تغییر نمی‌دهد.
      </p>
      <Link className="ex-button ex-button--outline" to="/preview/workspaces">
        بازگشت به فضاهای کاری
      </Link>
    </div>
  );
}
