# تحویل توسعه Management OS به Luna

**2026-10-17 owner update:** the eight exposed Workspace tools now use contextual guided cards, real local financial/IFE/EFE calculations, and the 60-document catalog with guided drafts and actual local attachments. Read [GUIDED_WORKSPACES](GUIDED_WORKSPACES.md) and execute the precise adapter refinements in [LUNA_GUIDED_PACKETS](LUNA_GUIDED_PACKETS.md) alongside the existing experience integration sequence. Preserve the design; source/fixture completion is not server/scientific acceptance.


## اولویت تازهٔ مالک — طراحی خلوت و اتصال بک‌اند

طراحی و فرانت‌اند تجربهٔ تازه در `features/experience` آمادهٔ بررسی محلی است. برای ادامهٔ بک‌اند، ابتدا [EXPERIENCE_REDESIGN](EXPERIENCE_REDESIGN.md) و [LUNA_EXPERIENCE_PACKETS](LUNA_EXPERIENCE_PACKETS.md) را بخوان. ترتیب فعلی اتصال: 010-D → 013-D → 014-D → 015-D → 027-D، سپس بسته‌های مستقل و 065-D. طراحی را دوباره نساز؛ حساب local را session واقعی فرض نکن. packetهای علمی پیشین و گیت‌های پژوهشی همچنان معتبرند؛ flow ساخت Workspace به اجرای موتور تشخیص وابسته نیست.

به‌روزشدن: ۲۰۲۶-۱۰-۱۶. ریپو: `D:\Hamidreza\Projects\StrategicManagementPanel`. این فایل نقطه شروع ادامه است؛ کل گفت‌وگو یا تمام تحقیق را دوباره نخوان.

## الزام‌های مالک

- مالک حمیدرضا است؛ GitHub فقط **Hamrez95**. author و committer: `Hamidreza Pakpour <136631329+Hamrez95@users.noreply.github.com>`. قبل از هر commit و عملیات GitHub بررسی کن. به حساب/اعتبارنامهٔ فرد دیگر دست نزن. AGENTS.md الزام را ثبت کرده است.
- تغییرات و فایل‌های تحقیق حفظ شوند؛ reset --hard، clean، overwrite تحقیق یا حذف untracked ممنوع. `sources/` پروژهٔ ChatGPT نیز مرجع فقط‌خواندنی است.
- سرور، Docker، تست فیزیکی و تست مرورگر/تصاویر طبق دستور مالک در صف اعتبارسنجی نهایی‌اند. اجرا نشده را pass یا Done ننویس. آزمون‌های محلی مناسب هر تغییر را همان موقع اجرا کن.
- پس از تکمیل واقعی هر packet، وضعیت، commit، تست، blocker و قدم بعد را در STATUS/NEXT_ACTIONS ثبت کن. issue فقط بعد از معیار پذیرش، مرج و شواهد بسته می‌شود.
- مهارت frontend-design و UX_STANDARD برای UI اجباری؛ Graphify query قبل از خواندن کد و update پس از تغییر کد. فقط AST محلی، بدون تحلیل پولی/ابری.

## چه چیزهایی آماده‌اند؟

۱. Knowledge Base پژوهشی در `assets/management-knowledge/`: ۱۲۰ فایل، ۳۱ شاخص، ۳۳ چارچوب، ۶۸ منبع؛ commit مستقل `19bb2d4`. کامل‌بودن علمی یا آمادگی همه رکوردها برای اجرا ادعا نشده است.

۲. ممیزی واقعی، نگاشت داده، معماری، شش ADR مرتبط، طراحی تجربه، ترتیب وابستگی و برش عمودی اول در همین پوشه و docs/adr. طرح جدید قابلیت‌های فعلی را حذف نمی‌کند.

۳. همان backlog قبلی اکنون ۶۹ تسک و ۸ Epic دارد. ۵۲ تسک قبلی با دلیل KEEP/MODIFY/MERGE/SUPERSEDE تطبیق داده شده‌اند. task catalog تازه یا roadmap موازی نساز. GitHub roadmap همان #53 است.

۴. STR-053 توسعه شده: ممیزی فقط‌خواندنی، ۱۸ تست منفی/مثبت و CI مستقل؛ commit `6e4873a`. issue #65 هنوز باز است چون مرج/CI ریموت تأیید نشده است. ۲۸ هشدار، مانع ترفیع خودکار دانش به runtime هستند: ۱۹ نسخهٔ سند، ۶ نگاشت ورودی مالی و ۳ نقطهٔ ورود تشخیص.

۵. اصلاحات STR-055 برای خطاهای TypeScript، قرارداد واقعی فهرست راهنمای مدارک، ارجاع قدیمی hash و آزمون ترجیحات انجام شده است؛ وضعیت دقیق آخرین run و commit را از STATUS و Git بخوان. موفقیت typecheck به معنی موفقیت تمام quality/server/browser نیست.

## ترتیب خواندن محدود

1. AGENTS.md و STATUS.md؛ سپس `git status --short` و چند commit آخر.
2. NEXT_ACTIONS.md و تسک انتخابی در docs/backlog؛ شماره تسک با شماره issue فرق دارد: **STR-053→#65، STR-054→#66، STR-055→#67**؛ mapping واقعی در issue-map.json است.
3. برای STR-054 فقط packetهای مربوط در IMPLEMENTATION_GUIDE.md و ADR-002، موارد K01–K12 در AUDIT و فایل‌های KB همان manifest را بخوان. بازخوانی همه ۱۲۰ فایل لازم نیست.
4. برای UI بعدی DESIGN.md، مهارت و استاندارد مشترک؛ برای مهاجرت ADR-003 و packetهای STR-056؛ برای پذیرش پیشنهاد ADR-007.

## اولویت ادامه

اگر چک ناتمام STR-055 در STATUS مانده، فقط همان را کامل کن؛ سپس **STR-054 packet A: قرارداد release و reader نسخه‌دار**. هنوز Journey، داشبورد یا موتور عمومی نساز.

بعد: 056 مالکیت/migration → 057 شواهد/تازگی/اطمینان → 058 محاسبه حاشیه مشارکت → 059 ارزیابی → 060 Journey → 061 ورودی شرطی → 062 تشخیص → 063 پیشنهاد/اقدام → آموزش مشترک026، رابط064 و داشبورد027 → برش عمودی065. 054 و 055 مستقل‌اند؛ ترتیب عملی پس از وضعیت فعلی مشخص می‌شود. جدول کامل و وابستگی‌های تاریخی در catalog/DEPENDENCIES است.

## تصمیم‌هایی که نباید دوباره حدس زده شوند

- Business Twin یک projection روی داده canonical است؛ Workspace/Goal/Decision/Action موجود حفظ می‌شوند. ICP، درآمد و هدف در Journey دوباره ذخیره نشوند.
- فرمول/شرط متنی KB اجرا نمی‌شود؛ eval یا DSL عمومی نساز. فقط ID/روش بررسی‌شده و تابع typed/allowlisted. unknown با false/zero فرق دارد.
- MET-CONTRIBUTION-MARGIN مبلغ است، نه gross margin درصد. در برش اول زمینهٔ تصمیم است؛ آستانهٔ ساختگی برای قاعده retention نیست.
- شرط‌های قابل بازگشت مرحله با prerequisite DAG متفاوت‌اند؛ برگشت مرحله مجاز است. skip/defer موفقیت نیست.
- confidence ordinal و توضیح‌پذیر است؛ درصد احتمال یا health score کلی اختراع نشود. label قدیمی کاربر شواهد کالیبره‌شده نیست.
- قالب راهنمای مدارک `structure.fa/en` فهرست رشته‌هاست؛ قرارداد اصلاح‌شده را دوباره به string تبدیل نکن.
- Build API با context `apps/api` انجام می‌شود؛ registry نمی‌تواند در کانتینر به پوشه root/assets تکیه کند. artifact تأییدشده داخل package API ساخته/نسخه‌دار می‌شود؛ تحقیق وارد public assets نمی‌شود.
- Decision فعلی source_kind تحلیل/گزینه راهبردی می‌خواهد. برای پیشنهاد مستقل، منبع recommendation باید مطابق ADR-007 و STR-063 افزوده شود؛ تحلیل نهایی جعلی یا bypass مجوز نساز.
- دو UX هدایت‌شده/فشرده، یک منطق کسب‌وکار دارند. show_tutorial، تم، زبان و reduced motion همان تنظیمات حساب فعلی‌اند.
- TOWS/Ansoff و منابع/شاخص‌های بررسی‌نشده را به‌خاطر وجود ابزار legacy آمادهٔ توصیه خودکار ندان. gap را حفظ کن و packet مستقل دیگر را ادامه بده.

## فرمان‌های شروع و محدودیت عملیاتی

`npm run check:knowledge` و `npm run test:knowledge`؛ `npm run typecheck`؛ تست مرتبط با task؛ سپس بررسی diff. Root quality برای سنجش گیت کلی است؛ علت شکست دقیق ثبت شود. رانر کامل موجود `run-local.ps1` است؛ رانر موازی جدید نساز.

GitHub connector با Hamrez95 تأیید شده است؛ تسک‌های جدید #65–81، Epicهای #82–89. آخرین تلاش HTTPS push به‌دلیل حساب نامرتبط رد شد و بعد از دستور مالک دیگر از آن اعتبارنامه استفاده نشده است. ارجاع محلی قدیمیِ حاوی ۱۴ کامیت اشتباه پس از تطبیق برابری درخت با نسخهٔ اصلاح‌شده حذف شد؛ در history قابل دسترس محلی نویسنده/committer اشتباه یافت نشد. پوش و مرج main هنوز تأیید نشده است. به‌جای تغییر credential دیگری، فقط اتصال مجاز Hamrez95 را استفاده کن و اگر مسیر transport فراهم نیست، blocker را دقیق حفظ کن.

## شیوه کار کم‌مصرف

یک packet، query هدفمند، فایل و مصرف‌کنندهٔ مرتبط، تغییر کوچک، آزمون مرتبط، checkpoint و commit. ابزار/issueهای ساخته‌شده را دوباره نساز. اسکریپت one-off در `.local-dev/management-os-plan-20261015.mjs` برای بازتولید روز اول بوده؛ **آن را روی وضعیت جدید اجرا نکن** چون ممکن است پیشرفت/شماره‌ها را بازنویسی کند. catalog و شرح موجود را مستقیم و محدود اصلاح کن. معماری جدیدی بدون برخورد واقعی با محدودیت مستند پیشنهاد نکن.

## بستهٔ طراحی اولیهٔ تکمیل‌شده

[DESIGN_INDEX](DESIGN_INDEX.md) مرجع ورود است: ۱۱ سفر کاربر، ۴۰ صفحه، نمونهٔ تعاملی، قرارداد تعامل، مدل داده و وضعیت‌ها. برای هر بسته فقط بخش مرتبط را بخوان. [LUNA_WORK_PACKETS](LUNA_WORK_PACKETS.md) کار ساده و مرز توقف را مشخص کرده است. تصمیم معماری، طراحی تازه، تفسیر علمی و سیاست دسترسی به Luna واگذار نشده؛ تغییر نیازمند دلیل و بازبینی است. شروع دقیق: 055-A و 055-B، سپس 054-A.

## Checkpoint جدید — STR-056-C (2026-10-16)

ترتیب قبلی 055/054 تکمیل شده است؛ ادامه از **STR-057-A** در شاخه `feat/stratino-files-023` است. STR-056-C در کد محلی، سرویس `apply_profile_import` را برای cutover بازبینی‌شده و idempotent اضافه می‌کند: قفل Workspace/profile، مجوز owner، کنترل revision و digest، backup/plan audit، FK identity map، نگهداری history و retry دقیق. پس از cutover، `update_workspace_profile` همچنان تنها مرز نوشتن است و تغییر canonical rowها و projection قدیمی را تراکنشی ثبت می‌کند؛ `execution.Goal` دست‌نخورده canonical می‌ماند.

اعتبارسنجی محلی: `modules.customer_context` برابر 20/20 روی SQLite موقت، مهاجرت‌های همین ماژول روی SQLite، Django system check، Ruff E/F/I برای کد تازه، Graphify 4333/8385/265. PostgreSQL/backup-restore، سرور، Docker، مرورگر و تست فیزیکی عمداً اجرا نشده‌اند و برای مرحلهٔ پایانی‌اند. قبل از commit، هویت محلی باید دقیقاً Hamrez95 باشد؛ برای هر عملیات ریموت نیز connector login را دوباره بررسی کن. Issue #68 باز می‌ماند تا merge و پذیرش نهایی.

## Checkpoint بعدی — STR-058-A (2026-10-16)

`modules.evidence` اکنون مدل‌های Workspace-scoped Claim, Evidence و ClaimEvidenceLink را دارد. نوع ادعا از منشأ شاهد جداست؛ source identity یکتا، scope/segment و دوره صریح، support/refute/qualify و trace reviewer/rationale ثبت می‌شوند؛ owner/reviewer فعال Workspace و rationale پیوند الزامی‌اند. وضعیت مجوز منبع unverified/available/revoked است؛ دادهٔ لغوشده حفظ و پیوند تازه به آن رد می‌شود. سرویس پیوند، دسترسی owner/editor و revision ادعا/شاهد را بررسی می‌کند. endpoint/UI عمداً ساخته نشد. migration افزایشی است؛ rollback کد جدول‌ها را حفظ می‌کند و حذف جدول به backup/restore واقعی موکول است.

057-B نیز در کد commit `7b064d6` شد: `Evidence.review_due` مالک‌محور و `ConfidenceAssessment` append-only با rule revision، reviewer، وضعیت/دلیل تعارض، پنج محور و دلایل مستقل، snapshot نسخه و freshness ثبت می‌کند. `insufficient` برای ورودی ضروری ناقص/بدون شاهد جاری مجاز، تعارض حل‌نشده سقف `low`، `high` فقط با همه محورهای adequate و تمام منابع جاری؛ هیچ درصد، وزن جمعی یا TTL سراسری وجود ندارد.

`modules.metrics` اضافه شد: bindingهای عددی reviewed فقط `net_revenue` و `variable_costs` هستند؛ observationهای Workspace-scoped با Decimal، حالت‌های جدا از صفر، واحد/ارز/دوره/basis/source و recorder نگهداری می‌شوند. trace محاسبه exact metric/method/release/hash/context/input و evidence revision/permission snapshot را نگه می‌دارد؛ Observation، CalculationRun، MetricValue و evidence link append-only هستند. `snapshot_inputs` دادهٔ خارج از scope/period/currency/basis یا شاهد لغوشده/تغییرنسخه‌یافته را رد می‌کند. فرمول/API/UI در این بسته اضافه نشد.

اعتبارسنجی: suiteهای ترکیبی `customer_context`، `evidence` و `metrics` برابر 44/44 روی SQLite موقت با migrationها، Ruff E/F/I، system check و migration autodetection هدفمند بدون drift؛ Graphify 4475/8765/284. **بعدی STR-058-B** است: تابع Decimal حاشیه مشارکت و سرویس مجاز با fixture مشترک TypeScript. PostgreSQL/restore، سرور، Docker، مرورگر و تست فیزیکی در صف پایانی‌اند. Issue #70 باز می‌ماند. تأیید GitHub connector را پیش از هر remote mutation مجدداً روی Hamrez95 بخواه.

## Checkpoint — STR-058-B complete locally (2026-10-16)

Code commit `bbbcbbb` adds fixed-precision Decimal contribution amount calculation and an owner/editor-authorized transactional service, with explicit cost scope and immutable calculation/value snapshots. Exact `stratino-first-slice-v2` ID/hash is pinned; v1 remains historical and definition-only. A shared fixture validates Python/TypeScript behavior. No endpoint, UI, general rule engine, or cost classifier was added.

Validation: combined `customer_context`, `evidence`, `metrics` Django tests 48/48 on temporary in-memory SQLite with migrations; domain/TypeScript tests 8/8; release builder tests 9/9; both release snapshots reproduce; Django system check, targeted migration autodetection, Ruff E/F/I and diff check pass. Graphify: 4521 nodes / 8886 edges / 278 communities. Code and Git author/committer are Hamrez95. Docs/status checkpoint follows this code commit on local `main`; source is not pushed or remotely merged. Next: STR-059-A. Journey reuse and all user-deferred PostgreSQL/server/Docker/browser/physical checks stay pending for final acceptance.

## Checkpoint — STR-059-A safe context projection (2026-10-16)

Code commit `95f2b82` adds a read-only, lossless Workspace/Segment context mapper in `customer_context`. The stored stage string is preserved as reported data and appears only as provisional at whole-Workspace scope; missing stage and Segment scope stay unknown. No taxonomy alias is normalized, no stage ID is asserted, and employee count/organization-size text never assigns lifecycle. The source trace pins WorkspaceProfile ID/revision; evidence refs remain empty because the current schema has no reviewed typed relation between stage claims and profile stage. Same-Workspace nested references and membership are enforced; reads do not create profile rows.

Focused in-memory SQLite Django tests pass 8/8; system check, targeted migration autodetection and Ruff E/F/I pass. Graphify: 4541 nodes / 8945 edges / 273 communities. STR-059 remains in progress. Research taxonomy requires expert/user review, and its venture-scope request conflicts with architecture that defers venture/BusinessUnit until another task. Do not activate `supported`/`conflicted`, manual overrides, alias mapping or venture inference until those decisions and evidence bindings are resolved. Continue with STR-060-A only within the approved Workspace/Segment boundary. All PostgreSQL/server/Docker/browser/physical checks remain deferred.

## STR-060-A readiness blocker — 2026-10-16

No code or migration was added. The source startup Journey requires domain-expert/user validation; routing rules explicitly remain knowledge-only; and no Journey/Step exists in packaged immutable release v2. The definition also proposes venture scope while the accepted architecture defers it. There is no safe exact release/step contract to pin, so execution must not be activated and gates must not be invented. Resume only after expert/owner review and packaging of a bounded first slice with supported scope, stable IDs, prerequisite graph and completion/skip/defer/re-entry semantics. STR-060 remains planned; later Journey-dependent packets remain blocked behind this prerequisite.
## Latest continuation — 2026-10-17 complete design coverage

Read [RESEARCH_UI_COVERAGE](RESEARCH_UI_COVERAGE.md) and [LUNA_COMPLETE_DESIGN_PACKETS](LUNA_COMPLETE_DESIGN_PACKETS.md) first. The frontend now includes 64 source methods, 28 authored planning flows and 21 domains. Implement the typed backend packets behind these layouts after the existing auth/Workspace sequence; do not redesign them or invent missing scientific calculations. Research gaps and server/physical acceptance remain pending. See STATUS for actual checks.
### 010-D progress — 2026-10-17

Existing secure account endpoints were preserved. Login now selects a verified-session-aware destination and validates same-origin `next`; a development-only, explicitly acknowledged seed command and four guard tests were added. Local route browser checks pass 4/4. Database execution, email catcher and real API auth integration remain untested for the final acceptance pass. Do not close #10 yet; continue the remaining packets by dependency order.

### Continuation checkpoint — 2026-10-17

`010-D` (`4dcc418`) and `013-D` (`34b0517`) are committed on `main` and pushed as Hamrez95. `014-D` backend bootstrap is implemented locally: see the latest 014-D section in `STATUS.md`, migration `0005_workspace_setup_bootstrap.py`, OpenAPI and the typed client helper. Its browser draft remains local and the UI is not yet wired; keep #14 open. A full temporary-SQLite Workspace suite reported one failure and two errors outside the six passing bootstrap tests; investigate before claiming the suite green. Next follow the requested order with `015-D` shell/navigation, then `027-D` dashboard summary, preserving designs and the final PostgreSQL/server/Docker/physical acceptance queue.

### 015-D continuation — 2026-10-17

`010-D` (`4dcc418`), `013-D` (`34b0517`), and `014-D` (`f9021e6`) are committed and pushed as Hamrez95. The 014-D browser draft remains local and is not wired to the bootstrap endpoint; keep #14 open. A full temporary-SQLite Workspace suite reported one failure and two errors outside the six passing bootstrap tests; investigate before claiming the suite green. The 015-D shell/navigation implementation was already present on main (`84de017`); the 2026-10-17 continuation corrected misleading Persian unsaved-change confirmation copy and added a focused Chrome shell check. Its local route/keyboard/mobile checks, web typecheck, production build, and Graphify pass. The broad legacy `verify-web.mjs` fails on its outdated public landing heading and was not counted. Next: 027-D dashboard summary. Preserve designs and keep PostgreSQL/server/Docker/physical acceptance for the final queue.

### 027-D checkpoint — 2026-10-17

A read-only Workspace summary endpoint and typed client now resolve canonical profile, analysis, action, proposed decision and document records under verified session and membership scope. The Workspace overview shows one next action and at most three contextual shortcuts; the account Workspace list shows an isolated next-step link for each active Workspace. No health score/recommendation inference or client-side persistence was added. Focused API tests pass 3/3 on temporary SQLite; Django/migration checks, OpenAPI 70-operation validation, TS, production build, localhost browser check, and Graphify update pass. Final PostgreSQL/server/Docker/physical checks remain pending; leave #27 open.

Next follow the dependency order in `LUNA_GUIDED_PACKETS.md` and `LUNA_COMPLETE_DESIGN_PACKETS.md`. Prefer the first independently implementable backend adapter; persist/reconcile guided answers only through canonical typed modules. Do not persist `toolNotes`, `_step`, or broad answer JSON. Preserve unknowns, exact method versions, and unresolved research blockers. Re-run authenticated GitHub identity verification before remote mutations; Hamrez95 only.
