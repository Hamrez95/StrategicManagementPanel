# تحویل واقعی Windows — 2026-10-18

این checkpoint بر ادعاها و محدودیت‌های تاریخی پایین مقدم است. توسعه روی feat/stratino-academy انجام شد؛ main محلی با fast-forward از 0494c63 به 7491dcc رسید. commit 1c4a63b همگام‌سازی main در شاخه آموزش و 7491dcc اصلاح رانر است. هیچ push، deploy، حذف شاخه یا بستن issue انجام نشد. هویت author/committer مطابق AGENTS تأیید شد.

## شخصیت: مسدود و باز

مالک پس از دیدن نمونه مستقل، خود Boss Baby را با سه تصویر مرجع خواست. درخواست واقعی image_gen در مرحله output با moderation_blocked رد شد (request ID در QA ثبت است). صفر فایل Boss Baby، صفر mood و صفر نقش جدید تولید/متصل شد. نمونه فرفری قبلی مورد پذیرش مالک نیست، داخل پروژه کپی نشده و به UI متصل نیست؛ جایگزین تازه مجاز نیست. ACA-013 Done نیست. راهنمای SVG موقت موجود حفظ شد؛ کد آزمایشی ناقص شخصیت وارد تحویل نشد. منشأ مراجع ارسالی مالک است؛ مجوز Boss Baby و حقوق انحصاری تأیید نشده‌اند.

AcademyVisuals.tsx، MOTION.md و تغییرات قاب‌های درسِ شرح‌داده‌شده در checkout ابری در baseline محلی وجود نداشتند؛ MOTION.md اکنون فقط مشخصات و وضعیت واقعی را ثبت می‌کند. b97c4d8 و 87c5e04 در object database این سیستم موجود نیستند. برای انتقال دقیق آن کارها، Git bundle شامل این commitها و اجداد مفقود، یا export/patch به‌همراه تمام فایل‌های asset و شواهد آن checkout لازم است؛ تاریخچه بازسازی‌شده به‌عنوان اصل گزارش نمی‌شود.

## نتیجه اجرای همین سیستم

| بررسی | نتیجه |
|---|---|
| npm run test:academy | exit 0؛ ۱۰ engine test، شش درس draft و ۶۰ ماژول planned |
| npm run typecheck | exit 0 |
| ESLint فایل‌های Academy/content/domain و browser verifier | exit 0؛ هیچ TS/TSX در تحویل نهایی تغییر نکرد |
| npm run test:academy:browser | exit 0؛ Chrome نصب‌شده ویندوز، ۲۰ بررسی، ۵ axe audit، صفر page error/API شرکت |
| npm run build:academy | exit 0 |
| npm run build | exit 0؛ نسخه پیش‌فرض بدون chunk آموزش |
| npm run test:academy:disabled | exit 0؛ دو مسیر آموزش غایب و خانه اصلی فعال |
| تست واقعی منوی PowerShell | exit 0؛ ورودی 1 و 2، commit محلی صحیح، default-off/preview، fallback پورت 18472→18473، healthcheck و cleanup |
| main -AcademyPreview -SmokeTest | exit 0؛ main در 7491dcc با /academy و یک chunk آموزش، cleanup کامل |
| قرارداد Session، تست مستقل | exit 1؛ tests/contracts.test.mjs:162؛ خطای شناخته‌شده، دست‌نخورده |
| Graphify 0.9.89 | query قبل و update/query بعد، محلی و بدون semantic/cloud |

رانر branch محلی را بر origin ترجیح می‌دهد، flag را برای هر ref جدا تعیین و محیط قبلی را restore می‌کند. academy /academy را باز می‌کند؛ main عادی خاموش و main -AcademyPreview روشن است. healthcheck وب واقعی انجام شد؛ Docker/بک‌اند در این تحویل اجرا نشد.

شواهد Windows در docs/qa/academy/windows-2026-10-18 ثبت شد. تم روشن/تیره، fa/en، عرض‌های 360/768/1280/1440، انتخاب غلط/درست، retry، focus و reduced-motion بررسی شدند. zoom موجود بزرگ‌کردن فونت ۲۰۰٪ است؛ native browser zoom هنوز تأیید نشده. کنترل بومی مرورگر به علت تشخیص نامطمئن URL متوقف شد؛ این شکست، تولید تصویر یا QA شخصیت را موفق نمی‌کند.

## محدودیت تحویل

این ادغام فقط prototype شش درس و اصلاح اجرای محلی را آماده می‌کند. تولید و اتصال شخصیت Boss Baby، نقش‌های ۱۲ حوزه، حالت‌های جدید و جشن نهایی همچنان باز است؛ محتوای سایر حوزه‌ها منتشر نشده. ACA-004 و ACA-013 باز می‌مانند. نتایج تاریخی زیر مربوط به checkpoint قبلی‌اند.

# وضعیت واقعی آکادمی — 2026-10-17

اپیک #90، تسک‌های #91–#108؛ شاخه `feat/stratino-academy` از b1a34901c5570b6b87086f6bcbe01f7ad350d8a7. همه issueها باز هستند؛ هیچ merge یا deploy انجام نشده است. این checkpoint اولین برش فنی است، نه پایان آکادمی یا تأیید علمی دوره.

## ثبت دوردست

کد و تصاویر QA با کامیت [71df5e2](https://github.com/Hamrez95/StrategicManagementPanel/commit/71df5e2f80f429548834fe9c059637d7d080eea7) روی شاخه آموزش ثبت و tree آن با checkpoint محلی یکسان بررسی شد. Git مستقیم این محیط credential نوشتن نداشت؛ GitHub connection تأییدشده Hamrez95 برای انتقال Git objects استفاده شد. نویسنده و committer خامِ کامیت هر دو `Hamidreza Pakpour <136631329+Hamrez95@users.noreply.github.com>` تأیید شدند. main در این عملیات تغییر نکرد و PR/merge به آن ساخته نشد.

## ساخته‌شده در این شاخه

- ACA-001/002/003/004: مرز محصول و داده، بررسی ویدئو، طراحی، نقشه ۱۲ حوزه/پنج سطح/۶۰ ماژول برنامه‌ریزی‌شده، pipeline منبع و بازبینی، برنامه پایلوت و ادامه توسعه.
- ACA-005: قرارداد pure TypeScript درس/سؤال/نسخه/پیش‌نیاز/تلاش؛ بررسی گراف و سنجش قطعی تمرین، مقابله با وضعیت خراب/نسخه قدیمی و عدم کاهش موفقیت قبلی با مرور ناموفق.
- ACA-006/007: مسیر lazy مستقل `/academy` فقط با flag؛ نقشه قابل اجرا، شش درس مبانی آوند با ۱۲ سؤال، توضیح پاسخ و کاربرد متنی، منابع قابل بازکردن، سناریوی فرضی و برچسب draft.
- پیشرفت تمرینی همین تب در sessionStorage با namespace/version مستقل؛ ذخیره ناموفق پیام آشکار دارد. ذخیره متن آزاد و حساب سروری فعال نیست. یادداشت قبل از خروج باید کپی شود؛ refinement حفظ draft در CONTINUE packet 2 است.
- موشن اولیه بازخورد و واکنش دکمه؛ راهنمای SVG اصیل موقت. کاراکتر و animationهای نهایی هنوز ACA-013 است. هیچ لیگ، XP، اشتراک و گواهی ساختگی در UI نمایش داده نمی‌شود.
- ACA-018: تست‌های موتور، محتوای ماشین‌خوان، مرورگر و default-off؛ شواهد و محدودیت‌ها پایین.

## مرز اعتبار

شش صفحه منبع اولیه با بخش پشتیبان خوانده شده‌اند؛ تأیید متخصص مستقل ندارند. همه درس‌ها draft و همه ماژول‌های curriculum planned هستند. برنامه هاروارد مرجع پوشش حوزه است، نه منبع متن همه درس‌ها یا معادل‌سازی MBA. منابع پولی/کتاب‌ها هنوز مطالعه نشده‌اند. هیچ داده واقعی از شرکت کاربر وارد آموزش نشده است.

## نتایج اجرا

| بررسی | نتیجه واقعی |
|---|---|
| npm run test:academy | exit 0؛ ۱۰ تست موتور و validation گراف/۶۰ ماژول/شش درس/شش منبع/۱۸ تسک |
| npm run test:domain | exit 0؛ ۱۸/۱۸، شامل ۱۰ تست جدید |
| npm run typecheck | exit 0؛ web/domain/ui |
| ESLint فایل‌های TS/TSX تغییرکرده | exit 0 |
| Prettier فایل‌های تغییرکرده و git diff --check | exit 0 |
| npm run check | exit 0 |
| npm run build:academy | exit 0؛ chunk آموزش lazy حدود ۷۲KB، gzip حدود ۱۶KB |
| npm run test:academy:browser | exit 0؛ ۲۰ بررسی و ۵ axe audit scoped؛ صفر page error و صفر API شرکت/حساب |
| npm run build + test:academy:disabled | exit 0؛ هیچ chunk Academy در build عادی، دو مسیر آموزش غیرفعال و صفحه اصلی قابل اجرا |
| npm test (کل پروژه) | exit 1؛ ۹۵/۹۶؛ یک شکست از قبل در قرارداد Session، مستقل از آموزش |
| Graphify 0.9.89 | build/query پیش از کد و update/query بعد؛ AST-only، بدون cloud/LLM |

مرورگر: Chromium 153 headless از runtime موقت آزمون. دریافت استاندارد مرورگر Playwright در این محیط archive نامعتبر داد؛ مرورگر مستقل فقط برای QA فراهم شد و dependency پروژه نشد. این تفاوت نسخه مرورگر با Chromium پیشنهادی Playwright در runbook باقی می‌ماند؛ تست مرورگر هدف کاربران/سیستم واقعی هنوز نیازمند دور پذیرش نهایی است. اسکریپت‌ها از Playwright یا مسیر STRATEGY_BROWSER_EXECUTABLE استفاده می‌کنند.

مرورگر داستان: route مستقیم قفل/ناموجود، پاسخ ناقص/اشتباه، بازخورد و retry، رادیوی کیبورد، focus نتیجه، refresh، تمام شش درس و progress، roadmap پیشرفته، شکست ذخیره، fa/en chrome، light/dark و 360/768/1280/1440، بزرگ‌نمایی متن ۲۰۰٪ و کاهش حرکت. درس‌ها فارسی‌اند؛ انگلیسی فقط chrome/جهت با توضیح صریح و محتوای فارسی lang/dir صحیح است. zoom آزمون افزایش font-size است و جای تست native browser zoom را نمی‌گیرد. axe خودکار گواهی WCAG نیست.

## شکست خط پایه که باید مستقل حل شود

tests/contracts.test.mjs:162، fixture نشست workspaces=[{id,name,role}] ولی OpenAPI Session به WorkspaceSummary جدید با workspace_id/profile/analyses/... اشاره می‌کند. این ناسازگاری در checkout تمیز همان main پایه b1a3490 با `node --test --test-name-pattern='session contract' tests/contracts.test.mjs` نیز exit 1 داشت. فایل تست و OpenAPI در شاخه آموزش تغییر نکرده‌اند. رفع نیازمند تطبیق قرارداد با endpoint واقعی نشست است؛ تغییر fixture برای سبزکردن ظاهری انجام نشده. این شکست gate عمومی را قرمز نگه می‌دارد و در پذیرش بعدی نباید پنهان شود.

## نقد بصری

تصاویر واقعی مسیر دسکتاپ تیره، موبایل روشن و صفحه بازخورد درس بازبینی شد: مسیر و مرحله‌ها قابل خواندن، اندازه‌ها و کنتراست متنی در axe بی‌خطا، ستون‌ها روی عرض محدود جمع می‌شوند و اسکرول حوزه‌ها در پنل خودش است. یک سطح یادگیری در مرکز حفظ شد. outline عنوان/بازخورد عمدی برای focus کیبورد است. نسبت به مرجع، پیش‌نمایش فعلی ساده‌تر است؛ نمایش کارت‌به‌کارت، شخصیت نهایی و شبیه‌سازی‌های متحرک هنوز packet بعدی‌اند. همین محدودیت‌ها دلیل بازبودن ACA-004/007/013 است.

## باقی‌مانده

سنجش انتقال/بانک سؤال، پیشرفت حساب و امنیت سروری، پنل نشر، اشتراک واقعی، مرور، انتقال مجاز به Workspace، شخصیت نهایی، پایلوت، محتوای سایر حوزه‌ها و سطح‌های پیشرفته هنوز تکمیل نشده‌اند. پیگیری دقیق در [CONTINUE](CONTINUE.md) و ۱۸ issue. هیچ‌یک از وضعیت‌های علمی/تجاری/سروری از پاس‌شدن prototype نتیجه نمی‌شوند.
