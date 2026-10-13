# آماده‌سازی توسعه استراتینو

Node.js حداقل 22.12؛ npm ci، سپس npm run check، npm test و npm run build.
برای بررسی مرورگر: npx playwright install chromium، اجرای node scripts/serve.mjs 4173، سپس npm run test:browser.

Graphify روی Windows/macOS/Linux: نصب uv، سپس `uv tool install graphifyy==0.9.89` و افزودن پوشه ابزارها به PATH طبق پیام نصب. skill مخصوص پروژه در ریپو موجود است؛ نصب مجدد لازم نیست.
اگر PATH مشکل دارد، متغیر STRATINO_GRAPHIFY را مسیر executable بده. `node scripts/check-setup.mjs` خطا را آشکار می‌کند. در ویندوز `$env:STRATINO_GRAPHIFY = 'C:\path\to\graphify.exe'`؛ پس از PATH صحیح متغیر لازم نیست.
اولین clone: `graphify . --code-only --no-viz`؛ سپس `graphify query 'routes calculations state preferences' --budget 1200`. گراف محلی است و از git دریافت نمی‌شود. بعد از تغییر کد `graphify update .`.

تفاوت نمونه و SaaS و ابزارهای حفظ‌شده در PARITY.md ثبت شده‌اند. رابط فعلی هیچ ورود واقعی ندارد؛ تنظیم theme/language در داده کسب‌وکار دست نمی‌برد. دستورالعمل Graphify و مهارت طراحی در AGENTS.md لازم‌الاجراست.
