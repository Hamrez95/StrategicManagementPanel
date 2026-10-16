# اتصال تجربهٔ جدید به بک‌اند — بسته‌های اجرایی Luna

۲۰۲۶-۱۰-۱۶. درخواست مالک: طراحی و فرانت‌اند با مدل اصلی؛ فقط پیاده‌سازی محدود و مشخص بک‌اند با Luna. این بسته‌ها زیرمجموعهٔ تسک‌های موجودند؛ catalog/roadmap موازی ایجاد نکن. مرجع بصری و رفتاری: [EXPERIENCE_REDESIGN](EXPERIENCE_REDESIGN.md) و کد `apps/web/src/features/experience/`.

## پیش‌شرط مشترک و ترتیب

ترتیب: **010-D → 013-D → 014-D → 015-D → 027-D**؛ سپس بسته‌های مستقل 018-D، 021-D، 022-D، 024-D و 028-D. بستهٔ 065-D در پایان یکپارچه‌سازی است. شناسهٔ suffix D در این سند برای برش بازطراحی است، نه task مستقل جدید. شمارهٔ GitHub از issue-map خوانده شود.

- فقط Hamrez95؛ author/committer طبق AGENTS. API نشست واقعی با cookie/CSRF؛ هیچ استفاده از `loginLocal`، `sessionStorage` یا fixture برای اثبات مجوز واقعی مجاز نیست.
- طراحی آماده است: خانه فقط فهرست کسب‌وکارها؛ سؤال‌ها تک‌به‌تک؛ پنج مقصد اصلی داخل فضا. در زمان اتصال، feature تازه را به داشبورد نریز.
- `/preview` adapter محلی قابل آزمون است، `/app` runtime قبلی حفظ شده. هنگام اتصال، اجزای نمایشی را مشترک کن و adapter سروری را پشت آن‌ها قرار بده؛ نسخهٔ local را در production صادر نکن، مسیرهای `/app` و لینک‌های قدیمی را با redirect سازگار نگه دار. API/client و DTO موجود را دوباره نساز.
- ذخیرهٔ سوال محصول با Journey پژوهشی یکی نیست. ساخت فضا نیازمند موتور تشخیص، اعتبار علمی مرحله یا اجرای STR-060 نیست. وضعیت کاربر self-reported است.
- fixture `toolNotes` فقط متن طراحی است؛ برای محصول واقعی آن را به مخزن JSON عمومیِ همهٔ تحلیل‌ها تبدیل نکن. دادهٔ هر ابزار به ماژول و schema فعلی خودش نگاشت شود.
- تست‌های کوچک محلی، parser، واحد، قرارداد و شبیه‌سازی خطا همان زمان انجام شوند. سرور/PostgreSQL، Docker و تست فیزیکی در صف پایان توسعه می‌مانند؛ اجرا نشده را pass/Done ننویس.
- هر بسته: کد + تست مرتبط + Graphify update + ثبت وضعیت + کامیت مستقل. بخش UI را دوباره طراحی نکن. تعارض داده یا تصمیم حل‌نشده را با مثال دقیق ثبت و بستهٔ مستقل بعدی را اجرا کن.

## 010-D — ورود، اولین بازدید و حساب تست واقعی

**والد:** STR-010/#10، STR-011/#11. **صفحات:** فرم مرکزی `/account/*`، خوشامد، خانه.

**موجود:** `features/auth/api.ts`، `AuthPages.tsx`، `session.ts`، `modules/accounts`؛ ثبت‌نام، verify، login، reset و session وجود دارند. این سرویس‌ها حفظ شوند. ورود تست local اکنون فقط در loopback و با `hamrez95@stratino.test` / `123456` است و به API دسترسی نمی‌دهد.

**کار دقیق:** پس از نشست موفق، invited user به دعوت معتبر برگردد؛ `next` داخلیِ مجاز حفظ شود؛ returning owner به فهرست فضاها برود؛ کاربر بدون فضای متعلق به خود خوشامد ببیند، اما فضای دعوت‌شده‌اش مسدود نشود. پرچم welcome/tour را زیر تنظیمات حساب version کن، نه داخل business profile. ردکردن آموزش یک انتخاب مجاز است.

برای fixture واقعیِ توسعه، management command idempotent زیر تنظیمات توسعه بساز/از seed موجود استفاده کن. ایمیل بالا، نام مالک، `email_verified` و دسترسی ابزارهای تجاری نمونه؛ **بدون staff/superuser**. گذرواژه با `set_password` استاندارد ذخیره شود. اجرای command در محیط غیرتوسعه باید fail کند. validator گذرواژهٔ کاربران واقعی را برای 123456 تضعیف نکن. command فقط با scope صریح دیتابیس توسعه مجاز است. اعتبار حساب واقعی بعد از آزمون login API گزارش شود، نه صرف ساخت مدل.

**پذیرش محلی:** نشست جعلی/منقضی، ایمیل تأییدنشده، رمز اشتباه، دعوت معتبر، returning owner، next خارجی/`//`/backslash؛ fixture idempotent و منع اجرا در production. local login نباید cookie احراز هویت، staff یا entitlement API بسازد.

## 013-D — خانهٔ فضاها و ساخت اتمیک

**والد:** STR-013/#13، وابسته به STR-012/#12. **صفحه:** خانه، ایجاد، تنظیمات.

**موجود:** `GET/POST /api/v1/workspaces/`، `GET/PATCH /api/v1/workspaces/{workspace_id}/`، `listWorkspaces/createWorkspace/saveWorkspace` در `features/workspaces/api.ts` و services متناظر. pagination فعلی حفظ شود.

**کار دقیق:** خانه فقط فضاهای مجاز را با id/name/role/archive و metadata نمایشی allowlisted نشان دهد. جست‌وجو حالت empty و no-results متفاوت دارد. Workspace به همان owner فعلی متصل باشد. joined با owned برای سهمیه اشتباه نشود. رنگ `blue/purple/green/orange` در metadata نمایشی versioned نگهداری شود؛ معنای علمی ندارد.

پیش از اضافه‌کردن endpoint تازه، قرارداد ایجاد فعلی را با درخواست اتمیک طرح 014-D هماهنگ کن. ایجاد workspace + ثبت discovery باید یک transaction/idempotency داشته باشند؛ retry شبکه نباید دو فضا بسازد. در صورت failure همه rollback شوند. «فضای خالی» یک Workspace معتبر بدون پاسخ/goal ساختگی می‌سازد. تغییر نام trim و max 80، همراه revision؛ archive/remove مطابق سیاست موجود، نه حذف فیزیکی خودسرانه.

**پذیرش محلی:** pagination/cursor loop، نام نامعتبر، درخواست تکراری، rollback ثبت پروفایل، membership revoked، فضاهای owned/joined، دو کاربر با فضاهای هم‌نام، workspace ناشناخته. 404 برای دسترسی خارج از scope؛ محتوا و نام فضای دیگر افشا نشوند.

## 014-D — پرسشنامهٔ محصول، draft و نگاشت بدون تکرار

**والد:** STR-014/#14، STR-059/#71 طبق issue-map، STR-061. **مرجع UI:** `Discovery.tsx`، `model.ts`، ADR-008.

**ترتیب مصوب:** `business_name` → `business_kind` → `reported_stage` → `setup_objective` → follow-up مرتبط → review → confirm/create. پاسخ هر مرحله پیش از confirm رکورد کسب‌وکار را نمی‌سازد. نام و نوع/هدف required برای guided flow، `unknown/deferred` مقدار معتبر است؛ blank flow مستقل است.

**شناسه‌ها و دامنه:**

| داده | مقدار API | مالک |
|---|---|---|
| نوع | `startup/business/organization` | context/profile همان فضا |
| وضعیت خوداظهاری | `idea/building/operating/unknown` | reported field، جدا از assessed stage |
| هدف رابط | `customers/growth/strategy/execution` | setup preference؛ یک Execution Goal تازه نساز |
| سؤال مرتبط | `customers.evidence_status`, `growth.focus`, `strategy.scope`, `execution.plan_status` | versioned setup answers، نگاشت صرفاً تأییدشده |
| نام/رنگ | نام trim و allowlisted color | Workspace |

در API، label فارسی را به enum تبدیل نکن؛ ID پایدار منتقل شود. گزینه‌های نهایی از همین تعریف طراحی و تصمیم‌های ثبت‌شده بیایند؛ enum/field تازه نیازمند OpenAPI، decoder و schema migration است. stage `operating` که در runtime پژوهشی مسدود است، فقط self-report ذخیره شود. organization سؤال تخصصی تشخیصی ندارد؛ STR-066 را دور نزن.

نگاشت ثابت گزینه‌های هر سؤال، به همان ترتیب `followUps` در فرانت‌اند:

| question_id | choice_idهای مرتب |
|---|---|
| `customers.evidence_status` | `none`, `interviews`, `transactions`, `deferred` |
| `growth.focus` | `acquisition`, `retention`, `economics`, `unknown` |
| `strategy.scope` | `business`, `product`, `reported_unit`, `deferred` |
| `execution.plan_status` | `none`, `goals_only`, `existing_plan`, `deferred` |

`reported_unit` فقط شرح محدودهٔ مدنظر کاربر است؛ BusinessUnit/Venture جدید ایجاد و مجوز آن را فعال نمی‌کند. پاسخ ناسازگار با objective با خطای فیلد رد شود، نه اینکه سرور خودش حدس بزند.

**درخواست تأیید طراحی‌شده:**

```json
{
  "name": "کسب‌وکار من",
  "presentation": { "color": "blue" },
  "setup": {
    "schema_version": 1,
    "business_kind": "startup",
    "reported_stage": "unknown",
    "setup_objective": "customers",
    "follow_up": { "question_id": "customers.evidence_status", "choice_id": "deferred" }
  }
}
```

برای retry هدر `Idempotency-Key` الزامی در ساخت هدایت‌شده. API فعلی ساخت ساده همچنان معتبر بماند. عملیات atomic bootstrap در همان ماژول workspaces و با سرویس‌های موجود انجام شود؛ route پیشنهادی جدید `POST /api/v1/workspaces/bootstrap/` تا پذیرش قرارداد فعال نیست. پاسخ شامل `workspace` با DTO موجود، `profile_revision` و `setup_revision` است. ساخت خالی `setup` ندارد و پاسخ یا مرحله‌ای به مشتری نسبت نمی‌دهد. mismatch کلید/بدنه → 409؛ retry همان principal+key+payload → همان Workspace؛ خطای عضویت/فیلد/سهمیه با قرارداد خطای فعلی. پاسخ خام نسخهٔ draft وارد مدل canonical نشود. این endpoint جایگزین سرویس‌های canonical نیست؛ orchestrator اتمیک آن‌هاست. قیمت، تشخیص مرحله و قواعد علمی در این درخواست جایی ندارند.

**draft:** namespace حساب + new-create token برای ساخت؛ workspace ID + draft revision برای ویرایش. خروج/refresh/back پاسخ‌ها را نگه می‌دارد؛ expiry باید صریح و قابل بازیابی باشد. تغییر هدف، فقط پاسخ follow-up نامرتبط را invalidate می‌کند؛ نام، مرحله و دادهٔ canonical مشتری دست‌نخورده می‌مانند. دادهٔ canonical موجود سؤال تکراری تولید نکند؛ source/revision روشن باشد. مرور و confirm اتمیک؛ ویرایش پیشین action/note/evidence را پاک نکند. draft جدید به کسب‌وکار بعدی نشت نکند.

**پذیرش محلی:** بازگشت بین همهٔ مراحل، خروج و ادامه، تغییر هدف و پاک‌شدن پاسخ stale، unknown/skip، کاربر دعوت‌شده، canonical ICP موجود، conflict revision، create retry و blank. هیچ headcount/revenue→stage یا تشخیص علمی به این flow اضافه نشود.

## 015-D — اتصال پوسته و ناوبری

**والد:** STR-015/#15، STR-016/#16، STR-026/#26. **کار:** ناوبری واقعی `ApplicationShell` و registry را به طرح آرام پنج‌مقصدی وصل کن. routeهای company/swot/matrices/execution/documents/reports فعلی با alias/redirect حفظ شوند. ابزارهای اجرا نشده لینک فعال محاسبهٔ جعلی نگیرند.

`SessionBoundary` همچنان مرز auth است. query key حتماً workspace ID داشته باشد؛ پاسخ late فضای قبلی روی فضای تازه render نشود. switching با draft ذخیره‌نشده تأیید و حفظ داده دارد. حذف دسترسی، cache همان فضا را invalid کند. منوی حساب فقط تنظیم شخصی؛ تنظیم فضا فقط همان کسب‌وکار. موبایل منوی قابل باز/بسته‌شدن با focus برگشتی؛ Escape در dialog. theme و reduced motion با preference فعلی sync شوند. زبان انگلیسی بستهٔ مستقل ترجمه است؛ در این تحویل، فارسی RTL مرجع است.

**پذیرش:** route مستقیم/refresh، unknown route/workspace، viewer read-only، keyboard، invalidation پس از logout/revoke، دعوت، بدون ناوبری تکراری سایت روی پنل.

## 027-D — نمای کلی خلوت و شخصی‌سازی

**والد:** STR-027/#27، STR-064 و STR-065. **ورودی:** هدف کاربر، context مجاز، فهرست اقدام موجود. **خروجی:** یک next action، حداکثر سه shortcut و حداکثر سه اقدام باز. سایر ابزارها فقط زیر تحلیل‌ها.

اولویت shortcut طراحی: customers→customer/market/decisions؛ growth→finance/retention/market؛ strategy→swot/matrices/decisions؛ execution→decisions/risks/swot. این presentation preference است؛ توصیهٔ علمی نیست. API می‌تواند دادهٔ مجاز موجود را resolve کند، اما موتور recommendation فقط پس از گیت پژوهشی خودش وارد این DTO شود. unknown/stale/missing صریح؛ نمودار و health score از نبود داده نساز. برای فضای خالی یک دعوت به ثبت اطلاعات، نه KPI صفر.

**پذیرش:** هر چهار هدف، unknown، فضای خالی، یک/سه/بیشتر از سه اقدام، late response، viewer، tool entitlement restricted. تستی بنویس که افزودن قابلیت تازه تعداد بخش‌های نمای کلی را افزایش ندهد.

## 018-D — اتصال فرم‌های ابزار به مالک دادهٔ فعلی

**والد:** STR-018/#18، STR-019/#19، STR-020/#20، STR-056/057/058. **کار:** فرم مشتری به schema canonical Product/Segment/ICP و پروفایل فعلی، SWOT به strategy، EFE/IFE به analysis. بازار/مالی/retention/risks تا سرویس خودشان آماده نیست فقط حالت pending واضح داشته باشند. دادهٔ پژوهشی تأییدنشده را به runtime ترفیع نده.

`toolNotes` محلی یک نمونهٔ فرانت‌اند است؛ در سرور استفاده نشود. source/type/revision همان Evidence/Observation موجود؛ hypothesis از evidence جدا باشد. متن raw پروفایل، مقدار assessed ایجاد نکند. autosave: saving→saved فقط بعد از پاسخ معتبر؛ خطا draft را حفظ کند؛ 409 latest/retry صریح، بدون overwrite خودکار. محاسبهٔ معتبر باید دوره/واحد/ارز/source داشته باشد؛ text field مالی را عدد یا صفر فرض نکن.

**پذیرش:** 403/404، شبکه قطع، conflict، پاسخ با workspace غلط، XSS متن، unknown در برابر صفر و schema decoder منفی؛ تمام داده‌های قبلی حفظ شوند.

## 021-D — بورد اقدامات

**والد:** STR-021/#21. **موجود:** `features/decisions/api.ts` و `/workspaces/{id}/execution/`؛ execution.Action/Goal/Decision canonical هستند.

سه ستون رابط `todo/doing/done` به statusهای واقعی DTO نگاشت شوند؛ enum سروری فعلی را صرفاً برای ظاهر بورد عوض نکن. عنوان، مسئول، موعد و ارتباط تصمیم در detail یا form مستقل، نه همه در صفحهٔ اول. drag/drop و select کیبورد باید یک mutation/revision service را مصرف کنند. جابه‌جایی در حال درخواست نشان داده شود؛ failure به وضعیت قبلی با حفظ متن برگردد. duplicate/idempotency رعایت؛ رکورد نمایشی تازه برای Goal یا Action مشترک ایجاد نشود.

**پذیرش:** ایجاد retry، move failure، stale revision، viewer منع تغییر، workspace injection، select/keyboard و drag فقط همان فضا. completion تاریخچه و owner/date را مطابق قرارداد اجرای فعلی نگه دارد.

## 022-D — کتابخانه و شواهد

**والد:** STR-022/#22، STR-023/#23، STR-057. **کار:** note/evidence با title/body/source در scope همان فضا به canonical module متصل شود؛ document و Evidence را یک مدل بی‌معنی نکن. فایل خصوصی از lifecycle فعلی quarantine/scan/download عبور کند. جست‌وجوی نسخهٔ اولیه فقط رکوردهای مجاز همان فضا؛ metadata و snippet از فضای دیگر نشت نکند. dialogs با draft و retry و حفظ focus.

**پذیرش:** متن خالی/بیش‌ازحد، source ثبت‌نشده، network retry/duplicate، membership revoked؛ private file URL و download مستقل از نقش UI کنترل شوند. در UI نمونه upload fake وجود ندارد؛ دکمهٔ upload فقط پس از wiring واقعی فعال شود.

## 024-D — گزارش و خروجی

**والد:** STR-024/#24. صفحهٔ گزارش فقط همان فضا، از snapshot مجاز و revisionهای روشن. print/PDF/data export از گزارش/exports فعلی استفاده کند؛ محتوا، یادداشت تحلیل‌ها و unknownها حفظ شوند. خروجی با عدد/واحد/دوره و زمان snapshot، بدون claimed health. draft مرورگر بدون رضایت به گزارش سروری تبدیل نشود. امنیت و دادهٔ شخصی با اشتراک قفل نشوند.

**پذیرش:** workspace mix، لینک export کاربر دیگر، revoke وسط job، archive، note/Unicode/RTL، round-trip JSON، unknown vs zero. PDF/browser و restore واقعی در صف نهایی باقی بمانند تا اجرا شوند.

## 028-D — اشتراک، quota و lock

**والد:** STR-028/#28، STR-029، STR-035. **کار:** DTO سروری با `capabilities`، allowance owned workspaces، used و reason code. backend creation transaction مالک سهمیه است؛ شمارش مرورگر کنترل مجوز نیست. joined spaces مستقل از owned allowance. free: نام ابزار و توضیح ارزش قابل خواندن، thumbnail فقط می‌تواند blur باشد، متن/CTA و دلیل قفل blur نشوند. account test تنها در development دسترسی کامل business capabilities دارد؛ هیچ staff bypass.

قیمت، provider و unlimited وعده نده. declined/pending subscription را success نکن. downgrade اطلاعات فعلی را پاک و export را قفل نکند. billing owner از workspace owner جداست. صفحهٔ فعلی فقط توضیح طراحی است و checkout ندارد.

**پذیرش:** concurrent create quota، cache stale، downgrade، membership role، joined count، tampered capability، expired subscription، billing outage؛ پرداخت واقعی و سرور تا انتهای توسعه.

## 065-D — یکپارچه‌سازی و حذف مسیر موقت از عرضه

پس از پذیرش بسته‌های بالا: `/`→signup→verify→welcome→create→dashboard و returning→workspaces؛ invited→invitation؛ ساخت دوم→draft مستقل. components مشترک، adapter نمونه پشت flag توسعه، مسیر preview در build تولید disabled. از نگهداری دو پوستهٔ ناسازگار یا انتقال fixture به session واقعی پرهیز کن.

**ماتریس:** fresh/returning/invited، startup/operating/organization-unknown، blank/guided، free/paid/expired، viewer/owner، دو Workspace، retry/conflict/session expired، موبایل/کیبورد/reduced/dark. قبل از task closure، merge/CI و صف پذیرش واقعی اجرا شده باشند. طراحی این سند جای آن شواهد نیست.

## شواهدی که Luna باید ثبت کند

شناسهٔ packet، قرارداد و مسیر تغییرکرده، commit، فرمان و exit code، تست مثبت/منفی، Graphify، validation اجرا نشده و قدم بعد. صرف حاضر بودن صفحه یا fixture تکمیل بک‌اند نیست.
