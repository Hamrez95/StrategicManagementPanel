# قرارداد معماری — ACA-001

## مرزها

React/TS و Django modular monolith فعلی حفظ می‌شود. `/academy` مسیر مستقل از `/app/workspaces/:id` و آموزش اختیاری ابزارهاست. حساب مشترک، خریدهای مستقل academy/workspace/bundle، بدون سرویس جدید. پیش‌نمایش تمرینی در build عادی در دسترس است؛ `VITE_ACADEMY_PREVIEW=false` آن را از build خارج می‌کند. این flag ابزار پرداخت یا مجوز امنیتی نیست.

پیش‌نمایش شاخه: شش درس draft، سنجش قطعی در domain، نگهداری تلاش فقط در sessionStorage همین تب با namespace/version. ذخیره محدودیت/خرابی پیام روشن دارد؛ پیشرفت تمرینی است، نه پیشرفت رسمی حساب. هیچ API کسب‌وکار/کاربر یا انتقال داده شرکت فراخوانی نمی‌شود. منبع و پاسخ محتوای رایگان در bundle است؛ محتوای پولی واقعی نباید در bundle عمومی توزیع شود.

## قرارداد آینده سرور — هنوز پیاده نشده

LearningProfile(account_id)، ContentRelease(immutable version/hash)، Enrollment(account_id, release)، Attempt(account_id, lesson_version, question_version, submitted_answers, server_grade, idempotency_key)، SkillEvidence و ReviewSchedule. Business Workspace مالک یادگیری فرد نیست. مدیریت شرکت فقط گزارش مجاز enrollment سازمانی را می‌بیند و پاسخ‌های فردی عمومی نمی‌شوند. `/api/v1/academy/catalog/` عمومی تنها summary، `/me/progress/` و `/attempts/` session+CSRF+owner، authoring با role مستقل. server answer key، grade و entitlement مرجع‌اند. revision/transaction و uniqueness جلو duplicate را می‌گیرد. enum خطاهای unknown-content, prerequisite-required, subscription-required, revision-conflict تعریف شود.

صورتحساب از سرویس billing فعلی با featureهای مستقل استفاده می‌کند؛ خرید/انقضا/بازپرداخت بدون callback معتبر سرور دسترسی نمی‌سازد. هیچ امتیاز یا sessionStorage مجوز تولیدی نیست. منبع شخصی/داده شرکت در درس عمومی قرار نگیرد.

## داده و نسخه

Content: lesson ID+version، objective، prerequisites، sourceRefs، reviewStatus، blocks، questions، artifactPrompt و thresholdPolicyVersion. Attempt به نسخه پین شود؛ اصلاح محتوا تاریخچه را بازنویسی نکند. claimهای KB تنها reference می‌شوند؛ اضافه‌کردن درس، status علمی KB را ارتقا نمی‌دهد. درس آموزشی دستور اجرایی JourneyRule نیست.

## ریسک و برگشت

برای کار حسابی/پرداخت، contract و migration در packet مستقل با آزمون منفی و rollback داده لازم است. در شاخه فعلی هیچ DB migration ندارد. برگشت preview با خاموش‌کردن flag و حذف bundle؛ namespace آموزشی با preference/Workspace تداخل ندارد. ادغام محلی رابط به `main` با درخواست مالک مجاز است؛ push و deploy در این مرحله مجاز نیست.
