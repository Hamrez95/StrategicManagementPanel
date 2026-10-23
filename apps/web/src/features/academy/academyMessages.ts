// Semantic UI keys; Persian is the complete-document fallback until another content locale is ready.
export const academyMessages = {
  fa: {
    path: 'مسیر من',
    catalog: 'حوزه‌ها',
    review: 'مرور',
    guide: 'راهنما',
    continue: 'ادامه',
    previous: 'قبلی',
    check: 'بررسی جواب',
    retry: 'تلاش دوباره',
    saveNote: 'ذخیرهٔ یادداشت',
    note: 'یادداشت من',
    sources: 'منابع این درس‌نامه',
    loading: 'داریم محتوا رو باز می‌کنیم…',
    draft: 'نسخهٔ پیش‌نویس؛ بازبینی علمی و بررسی با یادگیرنده هنوز کامل نشده.',
    guest:
      'برای ذخیرهٔ پیشرفت و یادداشت‌هات وارد حسابت شو. بدون ورود هم می‌تونی نمونه‌های رایگان رو ببینی.',
    independentNotice:
      'این مرور برای تمرینه؛ بانک سؤال مستقل هنوز اعتبارسنجی نشده و نتیجه‌اش گواهی تسلط نیست.',
    reused: 'تمرین تکراری از سؤال قبلی',
    saved: 'در حسابت ذخیره شد.',
    notSaved: 'ذخیره نشد؛ نوشته‌ات اینجا مونده. دوباره تلاش کن.',
    correct: 'درست جواب دادی.',
    incorrect: 'این جواب درست نیست؛ دلیلش رو ببین.',
    openReview: 'پاسخت ثبت شد. با معیارهای زیر مرورش کن؛ این فعالیت نمرهٔ خودکار نداره.',
  },
} as const;
export const academyCopy = academyMessages.fa;
