# بستهٔ طراحی اولیهٔ استراتینو

**2026-10-17 owner update:** the eight exposed Workspace tools now use contextual guided cards, real local financial/IFE/EFE calculations, and the 60-document catalog with guided drafts and actual local attachments. Read [GUIDED_WORKSPACES](GUIDED_WORKSPACES.md) and execute the precise adapter refinements in [LUNA_GUIDED_PACKETS](LUNA_GUIDED_PACKETS.md) alongside the existing experience integration sequence. Preserve the design; source/fixture completion is not server/scientific acceptance.


## مبنای تازهٔ تجربه — بازطراحی ۲۰۲۶-۱۰-۱۶

با درخواست مالک برای رفع شلوغی، [طرح تجربهٔ تازه](EXPERIENCE_REDESIGN.md) و کد `apps/web/src/features/experience/` مبنای جدید چیدمان، سایت، ورود، خوشامد، خانه و ساخت فضا هستند. [بسته‌های اتصال بک‌اند Luna](LUNA_EXPERIENCE_PACKETS.md) کار دقیق، قرارداد و پذیرش هر بخش را زیر تسک‌های موجود تعیین می‌کنند. مسیر `/management-preview` به تجربهٔ تازه هدایت می‌شود. پیش‌نمایش ۴۰ صفحه و اسناد زیر مرجع دامنه/داده/حالت‌های تخصصی‌اند؛ برای چیدمان جدید، طرح تجربهٔ تازه مقدم است.

تاریخ: ۲۰۲۶-۱۰-۱۶. این بسته مبنای پیاده‌سازی مرحلهٔ دوم است. مسیرهای کاربر، ساختار صفحات، مالکیت داده، رفتار حالت‌های خطا و مرز ماژول‌ها در این مرحله مشخص شده‌اند. تأیید علمی همهٔ منابع و اعتبارسنجی با کاربر واقعی هنوز انجام نشده است؛ فرض‌های پژوهشی همچنان علامت دارند.

## از اینجا شروع کنید

- [پیش‌نمایش تعاملی ۴۰ صفحه](design-preview.html): انتخاب صفحه، فارسی/انگلیسی، روشن/تیره، هدایت‌شده/فشرده، عرض موبایل و حالت‌های خالی/بارگذاری/خطا/تعارض. این نمونه فقط طراحی است؛ ذخیره، حساب واقعی یا موتور تصمیم ندارد. قالب‌های مشترک، سلسله‌مراتب صفحه را نشان می‌دهند؛ جزئیات هر صفحه در سند بعدی‌اند.
- [مشخصات ۴۰ صفحه](PAGE_SPECIFICATIONS.md): هدف، مسیر، محدوده، اطلاعات، عمل اصلی، مجوز، حالت‌ها و تسک مالک؛ صفحه‌های برنامه‌ریزی‌شده تا آماده‌شدن به ناوبری محصول اضافه نمی‌شوند.
- [۱۱ مسیر کاربر](USER_JOURNEYS.md): شروع استارتاپ، کسب‌وکار دارای مشتری، سازمان، جابه‌جایی کسب‌وکار، دعوت و دسترسی، آموزش، شواهد، مرور دوره‌ای، حفظ ابزارهای قبلی، خروجی و بازیابی.
- [جهت بصری و وایرفریم‌ها](DESIGN.md) و [قرارداد تعامل](INTERACTION_CONTRACTS.md): طراحی نمایش مدیریتی، گام هدایت‌شده، حالت فشرده، توضیح پیشنهاد، ذخیره و بازگشت از خطا.

## معماری و منطق آمادهٔ پیاده‌سازی

- [معماری](ARCHITECTURE.md)، [مدل داده و مالکیت](DOMAIN_BLUEPRINT.md)، [مدل وضعیت و رویداد](STATE_AND_EVENT_MODEL.md).
- [راهنمای ماژول‌ها و قرارداد سرویس‌ها](IMPLEMENTATION_GUIDE.md)، [تصمیم‌ها و ADRها](DECISIONS.md)، [وابستگی‌ها](DEPENDENCIES.md).
- [برش عمودی اول](VERTICAL_SLICE.md)، [ممیزی پژوهش و محدودیت‌ها](AUDIT.md)، [نقشهٔ تطبیق تسک‌ها](TASK_MAP.md).

## تحویل به Luna

- [دستور شروع](LUNA_HANDOFF.md)، [بسته‌های کوچک پیاده‌سازی](LUNA_WORK_PACKETS.md)، [وضعیت دقیق](STATUS.md)، [قدم بعد](NEXT_ACTIONS.md).
- اول STR-055A و STR-055B: ۸ ایراد lint و قالب‌بندی ۳۲ فایل باقی‌مانده. سپس بسته‌های STR-054 برای دانش بررسی‌شده و نسخه‌دار. طراحی صفحه یا موتور عمومی از نو ساخته نمی‌شود.
- Luna قرارداد مشخص را پیاده می‌کند. تغییر مالکیت داده، روش محاسبه، شرط موفقیت، سیاست دسترسی، مهاجرت مخرب یا تفسیر علمی تازه، کار سادهٔ پیاده‌سازی نیست؛ در برخورد با تناقض، آن را با شواهد ثبت کند و بستهٔ مستقل بعدی را پیش ببرد.

## مرز تکمیل

طراحی اولیه، توسعه، آزمون محلی و پذیرش نهایی چهار وضعیت جدا هستند. مستند یا نمونهٔ تصویری، قابلیت اجراشده محسوب نمی‌شود. صف سرور، Docker، مهاجرت واقعی، تست فیزیکی و مرورگر محصول در NEXT_ACTIONS نگه داشته شده است. گیت کیفیت هنوز سبز نیست؛ هیچ تسکی صرفاً برای آماده‌بودن این بسته Done نشده است.
**Latest design coverage — 2026-10-17:** [Research/UI inventory](RESEARCH_UI_COVERAGE.md) and [complete Luna packets](LUNA_COMPLETE_DESIGN_PACKETS.md) extend the calm guided experience to 64 researched methods, 28 planning flows and 21 domains. These are the current specialized page layouts. Calculation/backend readiness and research gaps are explicitly separate.
