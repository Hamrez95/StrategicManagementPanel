# محدوده حل‌نشده

این تحویل یک foundation پژوهشی قابل ادامه است، نه پایان برنامه کامل پیوست.

- Financial calculation implementation: فرمول‌ها specification هستند؛ validator آن‌ها را اجرا نمی‌کند. قرارداد واحد، تاریخ، ارز، دامنه، zero/negative denominator و fixtures واقعی برای هر variant در مرحله بعد لازم است.
- Applicability: برچسب‌های ویرایشی business_types/business_stages یک DSL واحد نیستند. taxonomy/applicability-contract.json هم‌معنی‌ها و موارد مبهم را مشخص می‌کند؛ هیچ موتور تولیدی نباید آن‌ها را بی‌تطبیق اجرا کند.
- Rules: هشت route مستقل برای شش persona تست شده است. rules اضافی startup از نظر قرارداد بررسی می‌شوند اما semantics تمام عملگرهای آن‌ها هنوز به موتور مشترک تبدیل نشده است.
- Diagnostic trees: مسیرهای inquiry هستند، نه classifier علّی اعتبارسنجی‌شده. بعضی عوامل هم‌زمان‌اند؛ ترتیب شاخه همیشه به معنی ترتیب علت نیست.
- Evidence: confidence و maturity محصولی، qualitative و کالیبره‌نشده‌اند؛ health score جهانی ساخته نشده است.
- Sources: abstract/summary با full-text فرق دارد. citations وجود منبع را نشان می‌دهند؛ اثر توصیه در context شرکت نیازمند آزمون مستقل است.
- UX: بودجه پرسش و import/expert/skip طراحی پیشنهادی‌اند؛ تست واقعی مدیران یا زمان‌سنجی journey انجام نشده است.
- Language: quick/learn/deep برای frameworks و metrics وجود دارد؛ زبان و اصطلاحات بعضی رکوردها هنوز انگلیسی است و به بازبینی فارسی نیاز دارد.
- Regulation/accounting: طبقه‌بندی SME، الزامات board، ایران، تورم، ارز و قواعد حقوقی بررسی کامل نشده‌اند. هیچ آستانه یا الزام محلی از منابع بین‌المللی استنتاج نشده است.
