# ادامه دقیق کار — checkpoint 3، 2026-10-15

بخش موجود را دوباره تولید نکنید؛ این فهرست برنامه ادامه است.

1. STATUS.md، validation/report.json، research/unresolved-topics.md و catalog.json را بخوانید؛ validator را یک بار اجرا کنید. baseline این checkpoint: 31 metrics / 33 frameworks / 68 sources / 10 diagnostics / 11 rules. اختلاف شمارش را با تغییر فایل تطبیق دهید.
2. taxonomy/applicability-contract.json و field-mapping.json را مبنای mapping صریح قرار دهید؛ هر tag مبهم باید محور و شرط مشخص بگیرد. research/execution-additional/taxonomy-mapping.json فقط پیشنهاد است. در این فاز engine یا UI نسازید.
3. Strategy: research/strategy/README.md را reuse کنید؛ متن اصلی TOWS (Weihrich) و Ansoff را از ناشر/نویسنده بررسی کنید. اگر full text در دسترس نیست، gap را حفظ کنید؛ TOWS را از SWOT حدس نزنید.
4. Market/customer: JTBD/VPC/Five Forces موجود را reuse کنید؛ TAM/SAM/SOM و sampling را از منابع اصلی business school/statistical agencies استخراج کنید. assumptions، population/unit، segment، geography، time و uncertainty ثبت شود.
5. Product/growth: از research/product-growth/RESEARCH_NOTES.md ادامه دهید؛ AARRR، growth loops، channel economics و experiment design را منبع‌یابی کنید. تعریف‌های retention/activation فعلی را کپی نکنید؛ به MET-COHORT-RETENTION و MET-ACTIVATION-RATE ارجاع دهید.
6. Sales/marketing: pipeline forecasting، long-cycle/win-loss، pricing/discount، attribution و brand را بررسی کنید. درخت‌های long sales cycle، low win rate و high CAC با missing-data gate، فرضیه رقیب و مدل درآمد مشخص بسازید. denominatorهای فعلی حفظ یا version شوند.
7. Finance: research/finance/README.md و research/investment-risk/README.md را بخوانید؛ jurisdiction/accounting/currency ایران را مشخص کنید؛ سپس forecast/valuation/pricing را توسعه دهید. EBITDA=operating income یا LTV=ARPU/churn را بی‌شرط به‌کار نبرید.
8. Operations: از research/operations-people/README.md ادامه دهید؛ supply-chain، procurement، queues/capacity، constraint validation و resilience را از منابع اصلی اضافه کنید. throughput فیزیکی و accounting throughput یکی نشوند.
9. People/leadership: hiring، turnover، incentives/compensation، coaching، succession، decision rights و فرهنگ را از مطالعات اولیه پژوهش کنید؛ درخت‌های productivity، turnover و project delay بسازید. از همبستگی به اقدام خودکار نپرید.
10. Risk/transformation/innovation: turnaround، innovation portfolio و digital transformation را توسعه دهید؛ ادعای نویسنده را از independent outcome evidence جدا ثبت کنید. داشتن Kotter به معنای تکمیل تحول نیست.
11. AI: وضعیت revision رسمی NIST را دوباره بررسی کنید؛ NIST AI 600-1 را کامل مطالعه کنید (فعلاً release/excerpt). مطالعات جدید primary درباره productivity/quality/cost/automation bias با context/sample/method ثبت شوند.
12. Validation: هر batch را فوراً normalize/source/save و indexها را بازتولید کنید. قراردادها و branch adapterهای تازه صریح باشند. supplemental startup predicates/questions و import mappings هنوز آزمون رفتار جامع ندارند.
13. Expert/user study: شش persona را در جلسات واقعی آزمایش کنید؛ پیش از اجرا relevance، تعداد/زمان پرسش، unsupported recommendation و فهم uncertainty را تعریف کنید. confidence/maturity را پیش از score و health ranking کالیبره کنید.
14. پس از هر batch، STATUS.md، RESEARCH_LOG.md، SOURCE_INDEX.yaml، OPEN_QUESTIONS.md و همین فایل را با شمارش واقعی به‌روز کنید. هیچ gap با دانش بی‌منبع پر نشود.
