# استراتینو — فهرست اجرای پروژه

۵۲ تسک تفصیلی در GitHub و در همین پوشه ثبت شده‌اند. همه **باز / برنامه‌ریزی‌شده** هستند؛ ایجاد تسک به معنی پیاده‌سازی نیست.

## ترتیب اجرا

۱. STR-001: آماده‌سازی ریپو و ابزار؛ STR-002: نام و هویت استراتینو؛ STR-003: React/TypeScript/Vite و جداسازی بخش‌ها.
۲. Foundation تا STR-008؛ پژوهش STR-004 می‌تواند همزمان با پایه فنی پیش برود و وابسته به خرید سرور نیست.
۳. MVP، STR-009 تا STR-038، با رعایت وابستگی‌ها. P0 در این برنامه **گیت امنیت/داده/پرداخت عرضه جدید** است، نه ادعای وجود رخداد بحرانی فعلی.
۴. Expansion: STR-039 تا STR-043، STR-050 تا STR-052 بر اساس نتیجه پایلوت. ابتدا نیاز اصلی مشتری را انتخاب کن؛ مهاجرت تمام ابزارها شرط اولین فروش نیست.
۵. Future: STR-044 تا STR-049؛ انگلیسی، عربی، PWA، AI و پرداخت خارجی بعد از اثبات ارزش و تصمیم مالک. شماره ID شناسه پایدار است؛ مجوز اجرای زودهنگام Future نیست.

یک تسک کامل انتخاب کن، وابستگی‌ها و Graphify query همان تسک را اجرا کن، تغییر محدود بساز و پس از تست PR بده. تعویق به معنی حذف قابلیت فعلی نیست؛ parity و دسترسی prototype حفظ شود. قالب نمونه ساختار نهایی در apps/packages هنوز برنامه است، نه فایل اجراشده.

## انتخاب فنی

React + TypeScript + Vite؛ Django/DRF modular monolith؛ PostgreSQL؛ فایل خصوصی S3-compatible؛ auth session/CSRF استاندارد. زیرساخت local-first development، اما **داده تولید روی سرور**. managed Iran hosting انتخاب اولیه و VPS مشترک با جداسازی انتخاب پشتیبان است؛ سرویس نخریده‌ایم.

## اسناد لازم

- [زمینه محصول](../PRODUCT_CONTEXT_FA.md)
- [معماری](../ARCHITECTURE_STRATINO.md)
- [UI/UX تمام تسک‌ها](../UX_STANDARD.md)
- [Graphify و مصرف توکن](../DEVELOPMENT_WORKFLOW.md)
- `catalog.json`: داده قابل پردازش تسک‌ها؛ `issue-map.json`: شماره و لینک واقعی GitHub.

نام استراتینو در زمینه و برنامه پذیرفته شده؛ تغییر واقعی title/manifest/interface در STR-002 است. P0/P1 بدون آزمون منفی مناسب و شواهد Done نمی‌شوند. تاریخ خط پایه ۲۰۲۶-۱۰-۱۳؛ main اولیه 71d18cbef8a57b792cc7cd9bd7bd6c1633717a6b.

## Foundation

| شناسه | اولویت | تسک و Issue | وابستگی | جزئیات محلی |
|---|---|---|---|---|
| STR-001 | P1 | [#1 — آماده‌سازی ریپو، خط پایه و ابزار توسعه](https://github.com/Hamrez95/StrategicManagementPanel/issues/1) | — | [شرح](STR-001.md) |
| STR-002 | P1 | [#2 — تغییر هویت محصول به استراتینو با حفظ داده قدیمی](https://github.com/Hamrez95/StrategicManagementPanel/issues/2) | STR-001 | [شرح](STR-002.md) |
| STR-003 | P1 | [#3 — ساخت پایه React/TypeScript/Vite و جداسازی بخش‌های ریپو](https://github.com/Hamrez95/StrategicManagementPanel/issues/3) | STR-001, STR-002 | [شرح](STR-003.md) |
| STR-004 | P1 | [#4 — اعتبارسنجی گردش کار مدیر و قیمت پیش از هزینه سرور](https://github.com/Hamrez95/StrategicManagementPanel/issues/4) | STR-001 | [شرح](STR-004.md) |
| STR-005 | P1 | [#5 — تثبیت مدل داده و قرارداد معماری SaaS](https://github.com/Hamrez95/StrategicManagementPanel/issues/5) | STR-003 | [شرح](STR-005.md) |
| STR-006 | P1 | [#6 — ساخت design system خوانا، فارسی و دارای موشن](https://github.com/Hamrez95/StrategicManagementPanel/issues/6) | STR-002, STR-003 | [شرح](STR-006.md) |
| STR-007 | P1 | [#7 — CI و آزمون‌های پایه برای جلوگیری از رگرسیون](https://github.com/Hamrez95/StrategicManagementPanel/issues/7) | STR-003, STR-005 | [شرح](STR-007.md) |
| STR-008 | P1 | [#8 — رانر PowerShell یکپارچه برای main و HEAD](https://github.com/Hamrez95/StrategicManagementPanel/issues/8) | STR-003, STR-007 | [شرح](STR-008.md) |

## MVP

| شناسه | اولویت | تسک و Issue | وابستگی | جزئیات محلی |
|---|---|---|---|---|
| STR-009 | P1 | [#9 — بک‌اند Django/PostgreSQL با محیط محلی واقعی](https://github.com/Hamrez95/StrategicManagementPanel/issues/9) | STR-005, STR-007 | [شرح](STR-009.md) |
| STR-010 | P0 | [#10 — ثبت‌نام، ورود، تأیید ایمیل و بازیابی امن حساب](https://github.com/Hamrez95/StrategicManagementPanel/issues/10) | STR-006, STR-009 | [شرح](STR-010.md) |
| STR-011 | P1 | [#11 — پروفایل و تنظیمات شخصی تم، زبان و آموزش](https://github.com/Hamrez95/StrategicManagementPanel/issues/11) | STR-010 | [شرح](STR-011.md) |
| STR-012 | P0 | [#12 — جداسازی Workspace و کنترل مجوز در تمام مسیرها](https://github.com/Hamrez95/StrategicManagementPanel/issues/12) | STR-009, STR-010 | [شرح](STR-012.md) |
| STR-013 | P1 | [#13 — ساخت، سوییچ و مدیریت اعضای Workspace](https://github.com/Hamrez95/StrategicManagementPanel/issues/13) | STR-006, STR-012 | [شرح](STR-013.md) |
| STR-014 | P1 | [#14 — آن‌بوردینگ کوتاه برای اطلاعات کاربر و پروژه](https://github.com/Hamrez95/StrategicManagementPanel/issues/14) | STR-011, STR-013 | [شرح](STR-014.md) |
| STR-015 | P1 | [#15 — پوسته پنل با ناوبری مدرن و مسیرهای مستقل](https://github.com/Hamrez95/StrategicManagementPanel/issues/15) | STR-006, STR-013 | [شرح](STR-015.md) |
| STR-016 | P1 | [#16 — کلاینت API تایپ‌شده و ذخیره مطمئن فرم‌ها](https://github.com/Hamrez95/StrategicManagementPanel/issues/16) | STR-005, STR-009, STR-015 | [شرح](STR-016.md) |
| STR-017 | P1 | [#17 — انتقال امن داده نمونه قدیمی و پشتیبان JSON](https://github.com/Hamrez95/StrategicManagementPanel/issues/17) | STR-005, STR-013, STR-016 | [شرح](STR-017.md) |
| STR-018 | P1 | [#18 — پروفایل کسب‌وکار و ICP مبتنی بر شواهد](https://github.com/Hamrez95/StrategicManagementPanel/issues/18) | STR-016, STR-017 | [شرح](STR-018.md) |
| STR-019 | P1 | [#19 — SWOT/TOWS واقعی و اتصال به تصمیم](https://github.com/Hamrez95/StrategicManagementPanel/issues/19) | STR-018 | [شرح](STR-019.md) |
| STR-020 | P1 | [#20 — محاسبه EFE/IFE و نمایش تفسیر معتبر](https://github.com/Hamrez95/StrategicManagementPanel/issues/20) | STR-018 | [شرح](STR-020.md) |
| STR-021 | P1 | [#21 — دفتر تصمیم و برنامه اجرای قابل پیگیری](https://github.com/Hamrez95/StrategicManagementPanel/issues/21) | STR-019, STR-020 | [شرح](STR-021.md) |
| STR-022 | P1 | [#22 — کتابخانه مدارک مدیریتی با راهنما و وضعیت پروژه](https://github.com/Hamrez95/StrategicManagementPanel/issues/22) | STR-018, STR-021 | [شرح](STR-022.md) |
| STR-023 | P0 | [#23 — آپلود واقعی چند فایل برای هر مدرک](https://github.com/Hamrez95/StrategicManagementPanel/issues/23) | STR-012, STR-022 | [شرح](STR-023.md) |
| STR-024 | P1 | [#24 — گزارش، PDF و خروجی قابل انتقال داده](https://github.com/Hamrez95/StrategicManagementPanel/issues/24) | STR-020, STR-021, STR-023 | [شرح](STR-024.md) |
| STR-025 | P1 | [#25 — جست‌وجوی سراسری ابزار و محتوای مجاز پروژه](https://github.com/Hamrez95/StrategicManagementPanel/issues/25) | STR-012, STR-015, STR-022 | [شرح](STR-025.md) |
| STR-026 | P1 | [#26 — تور آموزشی زمینه‌ای با خاموش‌کردن سراسری](https://github.com/Hamrez95/StrategicManagementPanel/issues/26) | STR-011, STR-015, STR-018, STR-020, STR-022 | [شرح](STR-026.md) |
| STR-027 | P1 | [#27 — داشبورد مدیر بر پایه اقدام بعدی و سلامت پروژه](https://github.com/Hamrez95/StrategicManagementPanel/issues/27) | STR-021, STR-022, STR-024 | [شرح](STR-027.md) |
| STR-028 | P1 | [#28 — پلن، سهمیه و entitlement واقعی و قابل تنظیم](https://github.com/Hamrez95/StrategicManagementPanel/issues/28) | STR-012, STR-013, STR-023 | [شرح](STR-028.md) |
| STR-029 | P0 | [#29 — پرداخت داخلی و فعال‌سازی قابل اعتماد اشتراک](https://github.com/Hamrez95/StrategicManagementPanel/issues/29) | STR-028 | [شرح](STR-029.md) |
| STR-030 | P0 | [#30 — پنل مالک سرویس برای کاربران و پشتیبانی](https://github.com/Hamrez95/StrategicManagementPanel/issues/30) | STR-010, STR-012, STR-028 | [شرح](STR-030.md) |
| STR-031 | P0 | [#31 — بک‌آپ مستقل دیتابیس و فایل و آزمون بازیابی](https://github.com/Hamrez95/StrategicManagementPanel/issues/31) | STR-009, STR-023 | [شرح](STR-031.md) |
| STR-032 | P1 | [#32 — ثبت خطا، audit و پایش هزینه بدون داده حساس](https://github.com/Hamrez95/StrategicManagementPanel/issues/32) | STR-009, STR-021, STR-029 | [شرح](STR-032.md) |
| STR-033 | P0 | [#33 — سخت‌سازی امنیت، کش خصوصی و نشست‌ها](https://github.com/Hamrez95/StrategicManagementPanel/issues/33) | STR-010, STR-012, STR-023, STR-029, STR-030 | [شرح](STR-033.md) |
| STR-034 | P1 | [#34 — صفحه عمومی استراتینو با نمایش محصول و موشن اصیل](https://github.com/Hamrez95/StrategicManagementPanel/issues/34) | STR-006, STR-015, STR-028 | [شرح](STR-034.md) |
| STR-035 | P1 | [#35 — سیاست داده، لغو اشتراک و فرایندهای اعتماد](https://github.com/Hamrez95/StrategicManagementPanel/issues/35) | STR-023, STR-028, STR-029 | [شرح](STR-035.md) |
| STR-036 | P1 | [#36 — بررسی سراسری کیفیت UI/UX و کارایی MVP](https://github.com/Hamrez95/StrategicManagementPanel/issues/36) | STR-024, STR-025, STR-026, STR-027, STR-029, STR-034 | [شرح](STR-036.md) |
| STR-037 | P0 | [#37 — استقرار قابل انتقال روی ایران با مسیر VPS مشترک](https://github.com/Hamrez95/StrategicManagementPanel/issues/37) | STR-007, STR-031, STR-032, STR-033 | [شرح](STR-037.md) |
| STR-038 | P0 | [#38 — پایلوت نهایی و گیت عرضه اولین نسخه پولی](https://github.com/Hamrez95/StrategicManagementPanel/issues/38) | STR-004, STR-024, STR-029, STR-030, STR-031, STR-032, STR-033, STR-035, STR-036, STR-037 | [شرح](STR-038.md) |

## Expansion

| شناسه | اولویت | تسک و Issue | وابستگی | جزئیات محلی |
|---|---|---|---|---|
| STR-039 | P2 | [#39 — انتقال QSPM و VRIO با روش محاسبه آزموده](https://github.com/Hamrez95/StrategicManagementPanel/issues/39) | STR-020, STR-021, STR-038 | [شرح](STR-039.md) |
| STR-040 | P2 | [#40 — ماتریس‌های CPM، SPACE و BCG متصل به پروژه](https://github.com/Hamrez95/StrategicManagementPanel/issues/40) | STR-039 | [شرح](STR-040.md) |
| STR-041 | P2 | [#41 — ماتریس‌های IE، GE، Ansoff و Grand Strategy](https://github.com/Hamrez95/StrategicManagementPanel/issues/41) | STR-040 | [شرح](STR-041.md) |
| STR-042 | P2 | [#42 — ابزار مالی و سناریو با واحد و فرض‌های روشن](https://github.com/Hamrez95/StrategicManagementPanel/issues/42) | STR-038 | [شرح](STR-042.md) |
| STR-043 | P2 | [#43 — BSC، ریسک و بازبینی چرخه استراتژی](https://github.com/Hamrez95/StrategicManagementPanel/issues/43) | STR-021, STR-027, STR-038 | [شرح](STR-043.md) |
| STR-050 | P2 | [#50 — رشد، بازگشت مشتری و اصلاح پلن با داده واقعی](https://github.com/Hamrez95/StrategicManagementPanel/issues/50) | STR-004, STR-032, STR-038 | [شرح](STR-050.md) |
| STR-051 | P2 | [#51 — تحلیل محیط و صنعت با PESTEL و پنج نیروی رقابتی](https://github.com/Hamrez95/StrategicManagementPanel/issues/51) | STR-018, STR-020, STR-038 | [شرح](STR-051.md) |
| STR-052 | P2 | [#52 — مرکز اعلان و یادآوری قابل کنترل پروژه](https://github.com/Hamrez95/StrategicManagementPanel/issues/52) | STR-021, STR-032, STR-038 | [شرح](STR-052.md) |

## Future

| شناسه | اولویت | تسک و Issue | وابستگی | جزئیات محلی |
|---|---|---|---|---|
| STR-044 | P3 | [#44 — آماده‌سازی نسخه انگلیسی و عرضه خارج ایران](https://github.com/Hamrez95/StrategicManagementPanel/issues/44) | STR-038 | [شرح](STR-044.md) |
| STR-045 | P3 | [#45 — نسخه عربی برای بازار خاورمیانه](https://github.com/Hamrez95/StrategicManagementPanel/issues/45) | STR-044 | [شرح](STR-045.md) |
| STR-046 | P3 | [#46 — PWA نصب‌پذیر بدون کش ناامن داده شرکت](https://github.com/Hamrez95/StrategicManagementPanel/issues/46) | STR-033, STR-038 | [شرح](STR-046.md) |
| STR-047 | P3 | [#47 — کمک AI اختیاری با بودجه و محرمانگی](https://github.com/Hamrez95/StrategicManagementPanel/issues/47) | STR-022, STR-028, STR-032, STR-038 | [شرح](STR-047.md) |
| STR-048 | P3 | [#48 — سازمان، همکاری پیشرفته و اتصال ابزارها](https://github.com/Hamrez95/StrategicManagementPanel/issues/48) | STR-038, STR-043 | [شرح](STR-048.md) |
| STR-049 | P3 | [#49 — پرداخت خارجی و رمزارزی با ارزیابی مستقل](https://github.com/Hamrez95/StrategicManagementPanel/issues/49) | STR-029, STR-044 | [شرح](STR-049.md) |
