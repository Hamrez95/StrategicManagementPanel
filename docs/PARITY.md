# خط پایه و نقشه حفظ قابلیت‌ها — STR-001

نسخه مبنا: `f8dcdbc`، پروتوتایپ browser-local. بخش جدید React نباید این ابزارها را پیش از انتقال آزموده حذف کند. تمام hash routeهای زیر در prototype حفظ می‌شوند؛ رابط حساب واقعی و فایل سروری هنوز ساخته نشده است.

| بخش فعلی | مسیر | وضعیت انتقال | تسک مقصد |
|---|---|---|---|
| نمای مدیریتی | overview | حفظ در prototype؛ انتقال با داده واقعی | STR-027 |
| مسیر شش‌مرحله‌ای | journey | حفظ؛ onboarding پروژه واقعی جدا | STR-014 |
| پروفایل و ICP | company | حفظ؛ ICP توصیفی و مبتنی بر شواهد | STR-018 |
| PESTEL و محیط | environment | حفظ تا انتقال صنعت/محیط | STR-051 |
| صنعت، پنج نیرو و رقبا | industry | حفظ تا انتقال | STR-051/040 |
| قابلیت داخلی و VRIO | internal | حفظ تا انتقال | STR-039 |
| EFE و IFE | matrices/efe, matrices/ife | اولویت گردش کار نخست | STR-020 |
| CPM، SPACE و BCG | matrices/cpm, matrices/space, matrices/bcg | توسعه پس از پایلوت؛ حذف نمی‌شوند | STR-040 |
| IE، GE، Ansoff و Grand | matrices/ie, matrices/ge, matrices/ansoff, matrices/grand | روش ساده‌شده فعلی واضح بماند | STR-041 |
| SWOT/TOWS | swot | انتقال به داده واقعی | STR-019 |
| QSPM | qspm | حفظ fixtures و قواعد irrelevant/AS | STR-039 |
| مالی، NPV/IRR و سناریو | finance, scenarios | حفظ واحد و قواعد محاسبه | STR-042 |
| اجرا، BSC و ریسک | execution, scorecard, risks | انتقال مرحله‌ای به داده سروری | STR-021/043 |
| دفتر تصمیم | journal | انتقال تاریخچه و لینک تحلیل | STR-021 |
| چاپ/PDF و JSON | reports | خروجی قدیمی قابل انتقال بماند | STR-017/024 |
| مدارک مدیریتی (۶۰ رکورد) | documents | چند انتخاب فایل صرفاً جلسه‌ای؛ بایت دائمی ندارد | STR-022/023 |
| درس، منبع و تور | learn, learn/:concept | کنترل آموزش حفظ می‌شود | STR-026 |
| ظاهر و تنظیمات | settings | تم، زبان، حرکت، آموزش و export حفظ می‌شوند | STR-011 |
| جست‌وجو | dialog | aliases و routeهای تخصصی حفظ می‌شوند | STR-025 |

## داده و روش محاسبه

state اصلی `royesh-strategy-v1` و ترجیحات `royesh-preferences-v1` هستند؛ تغییر برند نباید این کلیدها یا داده شخصی را پاک کند.
محاسبات `src/calculations.js` مستقل‌اند: weightedScore/validWeights، QSPM، SPACE، IE، financials، NPV، IRR، scenario و progress. بسته TS باید در برابر همین fixtures و contractها بررسی شود؛ preview مرورگر جای authoritative API آینده نیست.
داده شرکت فرضی نمونه با داده پروژه واقعی متفاوت است. seed جدید قابل تغییر است، اما org.name ذخیره‌شده کاربر با rebrand بازنویسی نمی‌شود.

## مرز نسخه React

Prototype در مسیر جدا و با state قدیمی حفظ می‌شود. account و operator فقط با پاسخ معتبر session API اجازه ورود دارند؛ نبود بک‌اند نباید با login محلی جعلی پوشانده شود. رابط نمایشی پیشرفته همچنان prototype است؛ نمایش آن auth یا tenant isolation را ثابت نمی‌کند.

## قرارداد توسعه و Done

شاخه‌های کاری فعلی: main، feature/guided-experience (تاریخچه قبلی)، docs/stratino-execution-plan (برنامه مرج‌شده) و feat/stratino-foundation. شاخه‌ای حذف نشده است.
هر تغییر با PR محدود، Graphify query/update، آزمون مرتبط و شواهد پذیرش مرج می‌شود. Issue و catalog فقط پس از ادغام و تکمیل واقعی Done می‌شوند؛ مدارک توسعه همچنان محدودیت‌ها را آشکار می‌کنند.
