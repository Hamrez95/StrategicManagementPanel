# Evidence model

منبع مفهومی: SRC-CORE-CIPD-EVIDENCE؛ قرارداد زیر synthesis محصول است، نه استاندارد منتشرشده CIPD.

Claim و Evidence دو موجودیت جدا هستند. Claim دارای id، statement، business_context، claim_type، owner، version، created_at، expires_at، status و evidence_links است.

claim_type یکی از fact، estimate، hypothesis، assumption است. نوع claim کیفیت آن را تضمین نمی‌کند؛ fact نیز ممکن است scope اشتباه یا منبع منقضی داشته باشد.

Evidence دارای id، origin (internal_data / external_evidence / experiment / customer_interview / expert_judgment)، provenance، method، observed_at، period، sample، population، permission_scope، source_id، limitations و supports/refutes است. این originها به‌جای مخلوط‌کردن fact با interview، در محور جدا نگهداری می‌شوند.

یک interview برای اثبات prevalence بازار کافی نیست. experiment به allocation، comparator، outcome و uncertainty نیاز دارد. داده داخلی هم بدون reconciliation و denominator معتبر، high confidence نیست. evidence مخالف حذف نشود؛ linked claim برای هر segment ممکن است نتیجه متفاوت داشته باشد.

در هر recommendation، input snapshot و evidence ids ذخیره شوند. داده تکراری از یک منبع را independent evidence نشمارید. حداقل‌سازی اطلاعات شخصی، مجوز Workspace و retention policy در integration آینده لازم است؛ خود این مجموعه فقط دانش عمومی دارد.
