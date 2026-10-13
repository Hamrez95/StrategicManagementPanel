# پایه React و مرزهای محصول — STR-003

## اجرا و ساخت

از ریشه: `npm ci` سپس `npm run build`؛ توسعه: `npm run dev` روی 5173. `npm run typecheck`، `npm run test:domain` و `npm test`. Preview ساخته‌شده: `node scripts/serve.mjs 4173`؛ `npm run test:web` تست مرزها و صفحه عمومی است.
رابط با React/TypeScript strict، Vite، React Router، TanStack Query و Motion ساخته شده است. root lockfile نسخه‌های واقعی را pin می‌کند. packages/domain محاسبات pure و packages/ui primitives مشترک هستند. apps/api و infra مرز مستندند؛ بک‌اند در این تسک ایجاد نمی‌شود.

نسخه JS محاسبات برای سازگاری prototype فعلاً حفظ شده است؛ بسته TS در برابر تمام exports و داده‌های واقعی fixture/ورودی مرزی مقایسه می‌شود. هنگام انتقال هر ابزار، همان بسته domain استفاده خواهد شد؛ دو نسخه نباید بدون اجرای parity تغییر کنند. خطاهای lazy route با ErrorBoundary قابل بازیابی‌اند و theme-init پیش از paint فقط ظاهر را تنظیم می‌کند.

## حفظ نسخه فعلی

صفحه نخست اکنون React است؛ اپ قبلی در `/prototype/` و wrapper `/demo` تمام ابزارهای جدول PARITY را حفظ می‌کند. src/data.js و localStorage قدیمی تغییر namespace ندارند؛ لینک‌های `/#route` به prototype منتقل می‌شوند. build:legacy برای ساخت مستقل نسخه قدیمی در دسترس است.
داده نمونه، فایل جلسه‌ای و آموزش قدیمی همچنان نمونه‌اند. قرارگرفتن در قاب React آن‌ها را cloud یا چند Workspace واقعی نمی‌کند.

## مسیرها و اعتماد

`/`: عمومی؛ `/demo`: نمونه؛ `/account/*`: مرز ثبت‌نام/ورود در حال توسعه؛ `/app/workspaces/:workspaceId/*`: session معتبر و پروژه مجاز؛ `/internal/*`: session معتبر staff. هر صفحه با lazy route جدا بارگذاری می‌شود.
Session تنها از `/api/v1/session/`، بدون cache و با cookie same-origin خوانده می‌شود. 401/403 به حساب هدایت می‌کند؛ شبکه یا پاسخ نامعتبر fail closed است. localStorage/URL ورود واقعی تولید نمی‌کند. guard مرورگر جای authorization سرور نیست؛ STR-010/012 پیش از عرضه الزامی‌اند.
Service Worker نمونه محدود به `/prototype/` است و فقط assetهای فهرست‌شده را cache می‌کند. root worker قدیمی retire می‌شود؛ API و مسیرهای خصوصی از fallback استاتیک خارج‌اند.

## جهت طراحی و نقد

هسته بصری «مسیر تصمیم» است: انتخاب چهار قدم تحلیل/انتخاب/اجرا/مدارک یک توضیح کوتاه را تغییر می‌دهد. palette آبی عمل، خاکستری سرد و سبز معنا؛ متن فارسی محلی خوانا، یک motion کوتاه در پاسخ به عمل و layout منطقی RTL. تم تیره از header قابل دسترسی است.
از KPI و testimonial ساختگی، pricing تأییدنشده و فرم login نمایشی پرهیز شده. مطالعه قالب‌های Figma/Buffer به وضوح مرز حساب/پروژه کمک می‌کند؛ هویت آن‌ها کپی نشده است. انتشار صفحه عمومی کامل و SEO در STR-034 است؛ این پایه آن را جایگزین نمی‌کند.
