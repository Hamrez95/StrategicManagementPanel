from django.db import migrations, models


# Order matches the generated sheet left-to-right, then top-to-bottom.
# Biographical facts are sourced; suggested learning angles are editorial prompts.
LEADERS = [
    ('elon-musk', 'ایلان ماسک', 'بنیان‌گذار SpaceX و از مدیران Tesla. برای الهام گرفتن از مسیرش، به تبدیل یک چشم‌انداز بزرگ به محصول و زیرساخت فکر کن.', 'https://ir.spacex.com/leadership/default.aspx'),
    ('steve-jobs', 'استیو جابز', 'از هم‌بنیان‌گذاران Apple. مسیر ساخت محصولاتش می‌تونه نقطهٔ شروعی برای فکر کردن به تجربهٔ کاربر و تمرکز محصول باشه.', 'https://www.apple.com/stevejobs/'),
    ('bill-gates', 'بیل گیتس', 'از هم‌بنیان‌گذاران Microsoft. برای مسیر خودت، می‌تونی به ساخت کسب‌وکاری بر پایهٔ نرم‌افزار و نوآوری فکر کنی.', 'https://www.gatesfoundation.org/about/leadership/bill-gates'),
    ('warren-buffett', 'وارن بافت', 'از چهره‌های اصلی تاریخ Berkshire Hathaway. مسیرش می‌تونه انگیزه‌ای برای مطالعهٔ تخصیص سرمایه و نگاه بلندمدت باشه.', 'https://www.berkshirehathaway.com/news/sep1826.pdf'),
    ('jeff-bezos', 'جف بزوس', 'بنیان‌گذار Amazon. برای الهام گرفتن، می‌تونی مسیر تبدیل یک فروشگاه آنلاین به مجموعه‌ای از کسب‌وکارها رو بررسی کنی.', 'https://ir.aboutamazon.com/officers-and-directors/person-details/default.aspx?PersonId=19954'),
    ('indra-nooyi', 'ایندرا نویی', 'مدیرعامل پیشین PepsiCo، با سابقهٔ مدیریت مالی و استراتژی. مسیرش می‌تونه الهام‌بخش پیوند دادن تصمیم‌های مالی و جهت کسب‌وکار باشه.', 'https://ir.aboutamazon.com/officers-and-directors/person-details/default.aspx?ItemId=e5f7858e-89c5-4615-9236-295b354ef354'),
    ('mary-barra', 'مری بارا', 'از رهبران General Motors، با سابقه در مهندسی و توسعهٔ محصول. برای مسیرت، به پیوند دانش فنی و رهبری سازمان فکر کن.', 'https://www.gm.com/company/leadership'),
    ('lisa-su', 'لیزا سو', 'از رهبران AMD، با پیشینهٔ مهندسی و مدیریت کسب‌وکار. مسیرش می‌تونه انگیزه‌ای برای مطالعهٔ استراتژی محصول در صنعت فناوری باشه.', 'https://www.amd.com/en/corporate/leadership/lisa-su.html'),
    ('oprah-winfrey', 'اپرا وینفری', 'با Harpo Productions کسب‌وکار رسانه‌ای خودش رو گسترش داد. برای الهام گرفتن، می‌تونی مسیر تبدیل توان فردی به یک کسب‌وکار رو بررسی کنی.', 'https://www.hbs.edu/leadership/20th-century-leaders/details?profile=oprah_g_winfrey'),
    ('sara-blakely', 'سارا بلیکلی', 'بنیان‌گذار Spanx. مسیر ساخت محصولش می‌تونه انگیزه‌ای برای جدی گرفتن یک نیاز ملموس و پیگیری ایده تا اجرا باشه.', 'https://www.spanxfoundation.com/about/'),
    ('satya-nadella', 'ساتیا نادلا', 'از رهبران Microsoft، با سابقهٔ هدایت کسب‌وکار Cloud. برای الهام گرفتن، مسیر تغییر جهت یک سازمان بزرگ رو بررسی کن.', 'https://news.microsoft.com/source/exec/satya-nadella/'),
    ('sundar-pichai', 'سوندار پیچای', 'از رهبران Google و Alphabet. مسیرش می‌تونه نقطهٔ شروعی برای مطالعهٔ مدیریت محصول و رهبری در مقیاس بزرگ باشه.', 'https://abc.xyz/investor/'),
    ('jensen-huang', 'جنسن هوانگ', 'بنیان‌گذار NVIDIA. مسیر رشد این شرکت از گرافیک به محاسبات و AI می‌تونه الهام‌بخش بررسی فرصت‌های تازهٔ فناوری باشه.', 'https://www.nvidia.com/en-eu/about-nvidia/governance/management-team/jensen-huang/'),
    ('richard-branson', 'ریچارد برانسون', 'بنیان‌گذار Virgin که در چند صنعت توسعه پیدا کرد. برای مسیر خودت، می‌تونی فرصت‌ها و ریسک‌های گسترش یک برند رو بررسی کنی.', 'https://com.prod.loyalty.virgin.com/branson-family/richard-branson'),
    ('howard-schultz', 'هاوارد شولتز', 'از رهبران اصلی مسیر رشد Starbucks. تجربه‌اش می‌تونه انگیزه‌ای برای مطالعهٔ تجربهٔ مشتری و توسعهٔ یک برند خدماتی باشه.', 'https://investor.starbucks.com/news/financial-releases/news-details/2023/Starbucks-Announces-Transitions-to-Its-Board-of-Directors/default.aspx'),
    ('melanie-perkins', 'ملانی پرکینز', 'از هم‌بنیان‌گذاران Canva. مسیر این محصول می‌تونه الهام‌بخش ساده کردن یک کار پیچیده برای گروه بزرگی از کاربرها باشه.', 'https://www.canva.com/newsroom/news/author/melanie-perkins/'),
    ('whitney-wolfe-herd', 'ویتنی ولف هرد', 'بنیان‌گذار Bumble. برای الهام گرفتن، می‌تونی بررسی کنی چطور تعریف متفاوت از تجربهٔ کاربر به یک کسب‌وکار شکل می‌ده.', 'https://ir.bumble.com/overview/default.aspx'),
    ('sheryl-sandberg', 'شریل سندبرگ', 'مدیر ارشد عملیات پیشین Meta و بنیان‌گذار Lean In. مسیرش می‌تونه نقطهٔ شروعی برای مطالعهٔ رشد سازمان و فرصت‌های رهبری باشه.', 'https://leanin.org/about/author-biographies/'),
    ('ginni-rometty', 'جینی رومتی', 'مدیرعامل پیشین IBM. تجربهٔ تغییر سبد کسب‌وکار این شرکت می‌تونه الهام‌بخش مطالعهٔ تحول در سازمان‌های بزرگ باشه.', 'https://www.ibm.com/history/ginni-rometty'),
    ('melinda-french-gates', 'ملیندا فرنچ گیتس', 'از هم‌بنیان‌گذاران Gates Foundation و بنیان‌گذار Pivotal. برای مسیر خودت، به پیوند مدیریت منابع و اثر اجتماعی فکر کن.', 'https://www.gatesfoundation.org/about/leadership/melinda-french-gates'),
]


def seed(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'AccountAvatar')
    Avatar.objects.filter(category='original').update(is_active=False)
    for index, (slug, name, note, source) in enumerate(LEADERS):
        Avatar.objects.update_or_create(pk=slug, defaults={'title': name, 'character_name': name, 'leadership_note': note, 'source_url': source, 'category': 'public_figure', 'sprite_sheet': 'business-leaders-v1', 'sprite_index': index, 'sort_order': index, 'is_active': True})


def reverse(apps, schema_editor):
    Avatar = apps.get_model('accounts', 'AccountAvatar')
    Avatar.objects.filter(sprite_sheet='business-leaders-v1').update(is_active=False)
    Avatar.objects.filter(category='original').update(is_active=True)


class Migration(migrations.Migration):
    dependencies = [('accounts', '0006_avatar_character_profiles')]
    operations = [
        migrations.AddField(model_name='accountavatar', name='sprite_sheet', field=models.CharField(max_length=32, default='executives-v1')),
        migrations.AddField(model_name='accountavatar', name='source_url', field=models.URLField(blank=True, default='')),
        migrations.AlterField(model_name='accountavatar', name='sprite_index', field=models.PositiveSmallIntegerField()),
        migrations.AddConstraint(model_name='accountavatar', constraint=models.UniqueConstraint(fields=('sprite_sheet', 'sprite_index'), name='account_avatar_sheet_position')),
        migrations.RunPython(seed, reverse),
    ]
