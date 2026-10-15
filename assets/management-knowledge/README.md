# Management knowledge foundation — Startino / Stratino

نسخه 0.1، پژوهش از 2026-10-15. **Research foundation؛ نه موتور تصمیم‌گیری آماده تولید.** وضعیت واقعی و ادامه کار در [STATUS.md](STATUS.md) و [NEXT_ACTIONS.md](NEXT_ACTIONS.md).

## مرز و معماری

Brief نام Startino دارد؛ زمینه مخزن Stratino است. این مجموعه مستقل از نام، UI، API، دیتابیس و کد محصول است. هیچ داده مشتری یا integration جدیدی اضافه نمی‌کند.

مسیر آینده: `Knowledge Base → Rule Engine → Journey Engine → Dashboard`. اکنون فقط لایه اول و قراردادهای قابل بررسی تحویل می‌شوند. اسکریپت validation فقط ابزار پژوهش آفلاین است؛ پیاده‌سازی موتور محصول محسوب نمی‌شود.

JSON UTF-8 منبع canonical رکوردها است (ماشین‌خوان و زیرمجموعه YAML 1.2). Markdown برای توضیح و log است. SOURCE_INDEX.yaml و sources/bibliography.json خروجی تولیدشده از فایل‌های sources/*.json هستند؛ آن‌ها را دستی ویرایش نکنید. شناسه‌ها با نام انگلیسی پایدار، توضیح مناسب برای کاربر فارسی و فرمول قابل بررسی نگهداری می‌شوند.

## قرارداد دانش

- هر تعریف یک id و یک محل canonical دارد؛ aliases و indexها فقط ارجاع می‌دهند.
- هر رکورد مهم sources دارد. منبع عمومی وجود یک چارچوب، اعتبار یک recommendation محلی را اثبات نمی‌کند.
- synthesis، heuristic و fact از هم جدا هستند؛ این knowledge base معیار جهانی PMF یا health score اختراع نمی‌کند.
- مرحله، مدل کسب‌وکار، اندازه، صنعت، کشور و بلوغ قابلیت محورهای مستقل هستند. multi-model و unknown مجازند.
- context شامل Workspace، business unit، cohort، period، currency، accounting basis و evidence snapshot است. دانش عمومی بین Workspaceها مشترک است؛ داده واقعی باید در محصول آینده جدا و مجازسازی شود.
- نسخه دانش، تاریخ ارزیابی و ورودی استفاده‌شده برای هر recommendation ذخیره شود. recommendation قدیمی نباید با تغییر registry بی‌صدا بازتفسیر شود.
- null/unknown با صفر متفاوت است. missing evidence موجب پرسش محدود یا abstain می‌شود؛ امتیازدهی مجاز نیست که کمبود داده را سلامت خوب تعبیر کند.
- هیچ رشته formula یا condition را با eval اجرا نکنید. قرارداد آتی باید typed، allowlisted و واحدآگاه باشد؛ فرمول‌های فعلی specification انسانی هستند.

## نقشه فایل‌ها

`taxonomy/` طبقه‌بندی؛ `journeys/` dependency graph؛ `metrics/` تعریف canonical شاخص؛ `frameworks/` زمینه استفاده؛ `diagnostics/` مسیر تشخیص؛ `decisions/` قواعد؛ `recommendations/` خروجی پیشنهاد؛ `actions/` اقدام؛ `anti-patterns/` الگوهای شکست؛ `evidence/` منشأ و confidence؛ `cadence/` ریتم؛ `glossary/` مفاهیم؛ `sources/` منابع؛ `research/` شکاف‌ها؛ `validation/` بررسی‌های قابل تکرار.

## قواعد تغییر

schema_version در هر مجموعه؛ idها هرگز بازیافت نشوند. اصلاح معنای فرمول یا denominator یک revision معنایی است. حذف با deprecated/replaced_by؛ فایل تاریخی در Git باقی می‌ماند. importer آینده باید نسخه ناشناخته را رد کند. موارد planned در research/deferred-concepts.json تنها backlog هستند و نباید به‌عنوان دانش فعال به موتور داده شوند.

## بازتولید بررسی

از ریشه مخزن: `node assets/management-knowledge/validation/validate.mjs`.
گزارش صرفاً parse، قرارداد، references و fixtureهای محدود را بررسی می‌کند؛ علمی‌بودن، تناسب با بازار ایران یا اثربخشی توصیه را اثبات نمی‌کند. source coverage نسبت records دارای citation است؛ هرگز درصد تکمیل پژوهش نیست.
