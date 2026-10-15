# Research log

## 2026-10-15 — checkpoint 0

- Brief کامل از فایل پیوست خوانده شد؛ هدف ساخت دانش، نه UI یا اتصال موتور است.
- مخزن محلی clean در `5a4dafe98332dd5b869dbaf4d5d02e8b88645ffe`، remote و دسترسی آن با GitHub تأیید شد.
- AGENTS.md و DEVELOPMENT_WORKFLOW و بخش‌های مرتبط زمینه و معماری محصول بررسی شد.
- معماری انتخابی: JSON استاندارد برای داده‌های canonical؛ YAML فقط برای index سازگار؛ Markdown برای سیاست و audit. هیچ وابستگی جدید محصول لازم نیست.
- سه شاخه پژوهشی مستقل و موازی: strategy، startup، finance؛ فایل‌های مشترک فقط توسط هماهنگ‌کننده نوشته می‌شوند.
- CLI graphify در PATH یافت نشد؛ مسیر نصب محلی در حال بررسی است. هیچ کد محصولی خوانده یا تغییر داده نشده است.
- قراردادهای مرحله، confidence و recommendation در این پروژه محصول‌ساخته هستند؛ نباید به منابع به‌عنوان مدل علمی اعتبارسنجی‌شده نسبت داده شوند.

## 2026-10-15 — checkpoint 1: research units

- Strategy: ۹ چارچوب با HBS/Porter، Barney abstract، BCG، McKinsey، CIPD، Blue Ocean و Shell؛ TOWS/Ansoff به علت بررسی ناکافی متن اصلی deferred.
- Startup: Blank/Ries/Strategyzer/YC/MIT/Christensen؛ شش مرحله و graph غیرخطی؛ stage/size/maturity جدا. عمق دسترسی جلوی ادعای مطالعه کل کتاب را می‌گیرد.
- Finance: SEC/IFRS/NYU و practitioner definitions؛ ۱۸ شاخص، سپس ۷ شاخص سرمایه‌گذاری. dependencies محاسباتی از related metrics جدا شد.
- Product/growth: cohort، RICE، North Star، VPC و درخت‌های churn/activation/PMF. تعریف روش، اثبات اثر علّی نیست.
- Operations/people: LEI، ASQ، Goldratt، Kotter، McKinsey، ILO و author-hosted Edmondson؛ محدودیت 7S secondary supplement و متن 1999 صریح است.
- Execution: Google re:Work، PMI و Agile Business Consortium برای OKR/RACI/MoSCoW؛ ICE/AARRR deferred.

## 2026-10-15 — checkpoint 2: integration

- JSON canonical؛ indexهای catalog/metrics/frameworks/bibliography و YAML تولیدشده از داده؛ بدون اتصال API محصول.
- نوع claim از origin شاهد جدا؛ confidence ordinal و کالیبره‌نشده؛ benchmark عمومی، PMF cutoff و health score ساخته نشد.
- operating=true به‌تنهایی مسیر سازمان را تعیین نمی‌کند؛ classification tree اصلاح شد.
- cadence، question budget، trigger و action محصول‌ساخته‌اند؛ منابع مفهومی تأیید آستانه یا efficacy نیستند.
- URL تکراری Amplitude ادغام؛ شناسه قبلی در sources/source-aliases.json محفوظ است.
- اختلاف retention، win-rate و ایراد مثال درصد Salesforce در research/conflicting-evidence.md ثبت شد.
- صفحه رسمی NIST در Browser revision را در حال انجام اعلام می‌کند؛ v1.0 به‌عنوان جدیدترین الزام معرفی نشد. GenAI full-text هنوز خوانده نشده است.

## 2026-10-15 — checkpoint 3: validation and independent review

- validator ابتدا خطاهای واقعی schema/shape و نبود explanation را یافت؛ اصلاح شد. adapterهای صریح برای source arrays/envelopes و درخت‌های متفاوت اضافه شد.
- سه ایراد P2 در بازبینی مستقل: stage applicability، rule linkage نامرتبط و field mapping غایب؛ هر سه اصلاح و fixture محافظ اضافه شد. جزئیات در validation/INDEPENDENT_REVIEW.md.
- ساختار، ۶ persona مصنوعی و ۱۶ guard pass؛ user research، domain certification یا اجرای متن فرمول‌ها ادعا نمی‌شود.
- Graphify در PATH نبود؛ مسیر uv pinned query و update AST-only را اجرا کرد. semantic/cloud extraction یا paid labeling انجام نشد.
- UI/API/runtime متصل نشدند؛ برنامه کامل پژوهش تکمیل اعلام نمی‌شود. ادامه دقیق و شکاف‌ها در NEXT_ACTIONS.md و research/ هستند.
