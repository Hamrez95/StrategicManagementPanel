"""Apply the reviewed terminology corrections to canonical lesson files."""
import json
import re
from content_voice import ROOT, dump

ACCOUNTING = [
 'رویداد اقتصادی (Economic event): اتفاقی که می‌تونه وضعیت اقتصادی کسب‌وکار رو تغییر بده. حسابداری مالی (Financial accounting): ثبت و گزارش اطلاعات برای استفاده‌کنندگان بیرون سازمان. حسابداری مدیریتی (Managerial accounting): آماده‌کردن اطلاعات برای تصمیم‌های داخل سازمان؛ هر تصمیم مهم الزاماً ثبت مالی جدا نداره.',
 'دارایی (Asset): منبع اقتصادی فعلی که سازمان کنترلش می‌کنه. بدهی (Liability): تعهد فعلی برای انتقال یک منبع اقتصادی. حقوق مالکانه (Equity): حق باقی‌ماندهٔ مالکان پس از کسر بدهی‌ها از دارایی‌ها. معادلهٔ حسابداری (Accounting equation): دارایی = بدهی + حقوق مالکانه؛ افزایش دارایی همیشه به معنی سود نیست.',
 'سند مبنا (Source document): مدرکی مثل فاکتور که رویداد رو پشتیبانی می‌کنه. ردپای رسیدگی (Audit trail): مسیر قابل پیگیری از گزارش به ثبت و سند. تفکیک وظایف (Segregation of duties): جداکردن ایجاد، تأیید و کنترل یک رویداد برای کاهش خطا و سوءاستفاده؛ جای بررسی واقعی رو نمی‌گیره.',
 'مبنای حسابداری (Accounting basis): قاعدهٔ تعیین زمان شناسایی درآمد و هزینه. دورهٔ گزارش (Reporting period): بازه‌ای که گزارش دربارهٔ اون حرف می‌زنه. قضاوت حسابداری (Accounting judgement): انتخابی که با داده و قواعد گزارشگری انجام می‌شه؛ با حدس بدون سند فرق داره.',
 'مبنای تعهدی (Accrual basis): رویداد رو با تحقق شرایط شناسایی ثبت می‌کنیم، نه صرفاً زمان پرداخت پول. درآمد (Revenue): عایدی فعالیت عادی طبق قواعد شناسایی. وجه نقد (Cash): پول در دسترس. حساب دریافتنی (Accounts receivable): طلب از مشتری؛ درآمد و دریافت وجه ممکنه در دو زمان متفاوت رخ بدن.',
 'صورت سود و زیان (Income statement): درآمد و هزینهٔ یک دوره رو خلاصه می‌کنه. صورت وضعیت مالی یا ترازنامه (Balance sheet): دارایی، بدهی و حقوق مالکانه رو در یک تاریخ نشون می‌ده. صورت جریان نقد (Cash flow statement): دریافت و پرداخت وجه در طول دوره رو توضیح می‌ده؛ هر سه گزارش رو کنار هم بخون.',
 'نقدینگی (Liquidity): توان پرداخت تعهدهای نزدیک به سررسید. سودآوری (Profitability): توان ایجاد سود در دوره. سرمایهٔ در گردش خالص (Net working capital): دارایی جاری منهای بدهی جاری. حساب دریافتنی (Receivable) هنوز وجه نقد نیست؛ سود مثبت به‌تنهایی پرداخت به‌موقع رو تضمین نمی‌کنه.',
 'واقعیت گزارش‌شده (Reported fact): عدد یا توضیحی که منبع، دوره و تعریف مشخص داره. تفسیر مدیریت (Management interpretation): توضیح مدیریت دربارهٔ معنای اون داده. قابلیت مقایسه (Comparability): امکان مقایسه با تعریف و مبنای سازگار؛ هم‌زمانی دو تغییر، رابطهٔ علّی رو ثابت نمی‌کنه.',
 'هزینهٔ ثابت (Fixed cost): در دامنهٔ مربوط، مجموعش با حجم تغییر نمی‌کنه. هزینهٔ متغیر (Variable cost): مجموعش با محرک فعالیت تغییر می‌کنه. هزینهٔ مرتبط (Relevant cost): هزینه‌ای که بین گزینه‌های تصمیم فرق داره. دامنهٔ مربوط (Relevant range): محدوده‌ای که فرض رفتار هزینه در اون معتبره.',
 'حاشیهٔ مشارکت (Contribution margin): قیمت فروش منهای هزینهٔ متغیر؛ برای پوشش هزینهٔ ثابت و بعد سود باقی می‌مونه. نقطهٔ سربه‌سر (Break-even point): حجم یا فروشی که درآمد کل با هزینهٔ کل برابر می‌شه. نسبت حاشیهٔ مشارکت (Contribution margin ratio): حاشیه تقسیم بر فروش، با مبنای واحد یا کلِ سازگار.',
 'تحلیل حساسیت (Sensitivity analysis): تغییر نتیجه رو با تغییر یک فرض می‌سنجیم. محدودیت ظرفیت (Capacity constraint): سقفی که تحویل خدمت یا تولید رو محدود می‌کنه. هزینهٔ فرصت (Opportunity cost): منفعت بهترین گزینه‌ای که کنار می‌ذاریم؛ رشد فروش همیشه رشد سود نیست.',
 'حاشیهٔ واحد (Unit contribution margin): قیمت هر واحد منهای هزینهٔ متغیر همون واحد. حاشیهٔ کل (Total contribution margin): حاشیهٔ واحد ضرب در تعداد. حجم جبرانی (Required compensating volume): تعداد لازم برای حفظ حاشیهٔ کل پس از تغییر قیمت؛ باید قید ظرفیت و فرض هزینهٔ متغیر رو هم بررسی کنی.',
 'بودجه (Budget): ترجمهٔ برنامه به مقدارها و زمان‌های مورد انتظار. محرک بودجه (Budget driver): فرضی مثل تعداد سفارش که مقدارهای دیگر به اون وابسته‌ان. سناریو (Scenario): مجموعه‌ای سازگار از فرض‌ها؛ سناریوی بدبینانه صرفاً کم‌کردن یک درصد از همهٔ عددها نیست.',
 'انحراف بودجه (Budget variance): تفاوت عملکرد واقعی با مبنای بودجه. بودجهٔ انعطاف‌پذیر (Flexible budget): بودجه‌ای که برای حجم واقعی فعالیت تنظیم شده. انحراف نرخ و کارایی (Rate and efficiency variances): دو منشأ متفاوت اختلاف؛ پیش از نسبت‌دادن علت، پایهٔ مقایسه رو هم‌سطح کن.',
 'تطبیق حساب‌ها (Reconciliation): بررسی سازگاری دو منبع یا مانده و توضیح اختلاف. منشأ داده (Data provenance): اینکه داده از کجا اومده و چه تبدیل‌هایی داشته. کنترل داخلی (Internal control): فرایندهایی برای کاهش ریسک خطا؛ گزارش تولیدشده با AI هم به شاهد و بازبینی نیاز داره.',
 'خط مبنا (Baseline): زمان، هزینه و خطای فرایند فعلی برای مقایسه. هزینهٔ کل مالکیت (Total cost of ownership): هزینهٔ راه‌اندازی، اتصال، استفاده، نگهداری و خروج در دامنهٔ مشخص. رسیدگی به استثنا (Exception handling): بررسی مواردی که از قاعدهٔ عادی خارجن؛ صرفه‌جویی ظاهری نباید هزینهٔ این بخش رو پنهان کنه.',
]

OPERATIONS = {
 'C06-ST01-L01':'واحد جریان (Flow unit): چیزی مثل سفارش که در فرایند دنبال می‌کنی. زمان فعالیت (Processing time): زمان کار مستقیم. زمان انتظار (Waiting time): مدت توقف در صف. زمان جریان (Flow time): کل زمان ورود تا خروج. بازکاری (Rework): انجام دوبارهٔ کار به‌خاطر نقص یا اطلاعات ناکامل.',
 'C06-ST01-L02':'ظرفیت اسمی (Design capacity): نرخ خروج تحت فرض‌های طراحی. ظرفیت مؤثر (Effective capacity): ظرفیت با درنظرگرفتن محدودیت‌های معمول. نرخ خروج (Throughput rate): تعداد کار تکمیل‌شده در واحد زمان. گلوگاه (Bottleneck): محدودکنندهٔ جریان. بهره‌برداری (Utilization): نسبت نرخ واقعی به ظرفیت تعریف‌شده؛ واحد و بازه باید سازگار باشن.',
 'C06-ST01-L03':'کار در جریان (Work in process, L): میانگین تعداد واحدهای داخل سیستم. نرخ خروج (Throughput rate, λ): تعداد خروج در واحد زمان. زمان جریان (Flow time, W): میانگین مدت حضور هر واحد. قانون لیتل (Little’s law): رابطهٔ L = λ × W با مرز و میانگین‌های سازگار؛ صفِ رو به رشد رو با فرض پایداری اشتباه نگیر.',
 'C06-ST01-L04':'ظرفیت خط (Line capacity): حد نرخ جریان طبق فرض‌های مدل. نرخ حل نهایی (Resolution throughput): پرونده‌های واقعاً حل‌شده در بازه. نرخ بازگشایی (Reopen rate): سهم پرونده‌هایی که دوباره باز می‌شن. پیش‌چاپ (Preprint): نسخهٔ پژوهش پیش از تکمیل داوری نهایی؛ با نسخهٔ منتشرشده یکی نیست.',
 'C06-ST02-L01':'نیاز مشتری (Customer requirement): نتیجهٔ مورد انتظار مشتری. مشخصهٔ کیفیت (Quality characteristic): ویژگی قابل سنجش. نقص (Defect): ناهماهنگی با شرط تعریف‌شده. تعریف عملیاتی (Operational definition): قاعدهٔ روشن برای مشاهده و شمارش؛ شاخص فقط بخشی از کیفیت رو نشون می‌ده.',
 'C06-ST02-L02':'پیشگیری (Prevention): هزینه برای جلوگیری از نقص. ارزیابی (Appraisal): هزینهٔ بررسی کیفیت. شکست داخلی (Internal failure): نقصی که پیش از رسیدن به مشتری پیدا می‌شه. شکست بیرونی (External failure): نقصی که بعد از تحویل آشکار می‌شه. هزینهٔ بازکاری (Rework cost): منابع مصرف‌شده برای اصلاح یا تکرار کار.',
 'C06-ST02-L03':'خط مبنا (Baseline): وضعیت پیش از تغییر برای مقایسه. پیامد اصلی (Primary outcome): نتیجه‌ای که از قبل برای سنجش انتخاب می‌کنی. شاخص محافظ (Guardrail metric): معیاری برای دیدن آسیب ناخواسته. عامل مخدوشگر (Confounder): عاملی که تفسیر اثر رو منحرف می‌کنه. مقیاس‌پذیری (Scalability): امکان گسترش با توجه به شرایط مهم.',
 'C06-ST02-L04':'بهره‌وری (Productivity): خروجی نسبت به ورودی، با تعریف روشن از هر دو. خروجی خام (Raw output): شمار کارها پیش از بررسی کیفیت نهایی. حل پایدار (Durable resolution): حل مسئله بدون بازگشت در افق تعریف‌شده. بازی با شاخص (Metric gaming): بهترکردن عدد به زیان هدف. حد کیفیت (Quality threshold): شرطی که نباید قربانی سرعت بشه.',
 'C06-ST03-L01':'موجودی چرخه‌ای (Cycle stock): موجودی ناشی از سفارش‌های دوره‌ای. ذخیرهٔ اطمینان (Safety stock): پوشش نوسان تقاضا یا تأمین. هزینهٔ سفارش (Ordering cost): هزینهٔ هر نوبت سفارش. هزینهٔ نگهداری (Holding cost): هزینهٔ نگه‌داشتن موجودی. هزینهٔ کمبود (Stockout cost): پیامد نداشتن موجودی. نقطهٔ سفارش مجدد (Reorder point): سطح فعال‌کردن سفارش.',
 'C06-ST03-L02':'مقدار اقتصادی سفارش (Economic order quantity, EOQ): مقدار سفارش در مدل سادهٔ توازن هزینهٔ سفارش و نگهداری. تقاضا (D): تقاضای دوره. هزینهٔ سفارش (S): هزینهٔ هر نوبت. هزینهٔ نگهداری (H): هزینهٔ سالانهٔ هر واحد. مقدار بهینه (Q*): خروجی مدل با همین فرض‌ها؛ چرخهٔ سفارش فاصلهٔ دو سفارش متوالیه.',
 'C06-ST03-L03':'زمان تأمین (Lead time): فاصلهٔ سفارش تا دریافت. نقطهٔ سفارش مجدد (Reorder point, ROP): تقاضای زمان تأمین به‌علاوهٔ ذخیرهٔ اطمینان در مدل این درس. انحراف معیار (Standard deviation): سنجهٔ پراکندگی. سطح خدمت (Service level): معیار مشخصِ برآورده‌شدن تقاضا؛ احتمال نبود کمبود در یک چرخه با سهم تقاضای تأمین‌شده یکی نیست.',
 'C06-ST04-L01':'گره (Node): عضو شبکه مثل کارخانه یا انبار. پیوند (Link): رابطهٔ جریان میان گره‌ها. زنجیرهٔ چندلایه (Multi-tier supply chain): رابطه‌های مستقیم و تأمین‌کنندگانِ تأمین‌کنندگان. تک‌منبعی (Single sourcing): اتکا به یک منبع. دیدپذیری (Visibility): دسترسی به اطلاعات معتبر جریان؛ چند تأمین‌کننده ممکنه وابستگی مشترک داشته باشن.',
 'C06-ST04-L02':'محرک ریسک (Risk trigger): نشانه‌ای برای فعال‌کردن بررسی یا اقدام. زمان بازیابی (Time to recover): مدت برگشت به سطح عملکرد تعریف‌شده. سطح خدمت (Service level): معیار خدمت مورد تعهد. ظرفیت رزرو (Reserve capacity): توان نگه‌داشته‌شده برای نیاز آینده. زیان مورد انتظار (Expected loss): میانگین وزن‌دار پیامدها با احتمال‌های فرض‌شده.',
 'C06-ST04-L03':'تاب‌آوری (Resilience): توان آماده‌شدن، پاسخ و بازیابی در اختلال. افزونگی (Redundancy): منابع اضافه برای حفظ خدمت. تنوع‌بخشی (Diversification): پخش وابستگی میان گزینه‌ها. سرمایهٔ در گردش (Working capital): منابع درگیر در چرخهٔ عملیات. چابکی (Agility): توان پاسخ مناسب و به‌موقع؛ هر افزایش افزونگی الزاماً به‌صرفه نیست.',
 'C06-ST04-L04':'دیدپذیری (Visibility): اطلاعات قابل اتکا دربارهٔ وضعیت زنجیره. هشدار کاذب (False alarm): هشدار بدون رخداد هدف. هشدار ازدست‌رفته (Missed detection): رخدادی که هشدار نگرفته. زمان پیش‌آگاهی (Warning lead time): فاصلهٔ هشدار تا رخداد. منشأ داده (Data provenance): مسیر تولید و تبدیل داده. پاسخ‌گویی (Accountability): نقش مسئول تصمیم و پیامد.',
}
STATS={
 'C08-ST01-L01':'جامعه (Population): مجموعه‌ای که درباره‌ش نتیجه می‌گیری. نمونه (Sample): بخش مشاهده‌شده از جامعه. واحد مشاهده (Observation unit): چیزی که هر ردیف داده دربارهٔ اونه. متغیر (Variable): ویژگی سنجیده‌شده. شناسه (Identifier): برچسب تمایز رکوردها. آماره (Statistic) از نمونه محاسبه می‌شه؛ پارامتر (Parameter) ویژگی جامعه‌ست. منشأ داده (Provenance) مسیر تولید داده رو روشن می‌کنه.',
 'C08-ST01-L03':'محور (Axis): بُعد نمایش داده. مقیاس (Scale): قاعدهٔ تبدیل مقدار به فاصلهٔ بصری. مخرج (Denominator): پایهٔ محاسبهٔ یک نسبت. نرخ (Rate): تعداد رخداد نسبت به پایه و بازهٔ تعریف‌شده. نمونهٔ داوطلبانه (Voluntary response sample): نمونه‌ای که افراد خودشون ورود به اون رو انتخاب کرده‌ان. هیستوگرام (Histogram): نمایش فراوانی در بازه‌های عددی.',
 'C08-ST01-L04':'ترکیب نمونه (Sample composition): سهم گروه‌های مختلف در داده. مخرج (Denominator): پایه‌ای که درصد یا نسبت از اون ساخته شده. بازسازی محاسبه (Reproduction): رسیدن دوباره به عدد با داده و روش مشخص. راستی‌آزمایی (Verification): بررسی ادعا در برابر شاهد. منشأ ادعا (Claim provenance): مسیر رسیدن ادعا به داده یا منبع اولیه.',
}
PAIRS={
 'نیاز':'Need','متغیر بخش‌بندی':'Segmentation variable','بخش':'Segment','جذابیت':'Market attractiveness','تناسب':'Strategic fit','بازار هدف':'Target market','مخاطب':'Audience','تمرکز':'Focus',
 'چارچوب رقابتی':'Competitive frame of reference','منفعت':'Benefit','عامل تمایز':'Point of difference','دلیل باور':'Reason to believe','جایگاه':'Positioning','اعتبار سازه':'Construct validity','خط پایه':'Baseline','شاخص زیان':'Harm metric','نمایندگی نمونه':'Sample representativeness','آزمون بیرونی':'External validation',
 'منفعت هسته‌ای':'Core benefit','پیشنهاد واقعی':'Actual offering','خدمت تکمیلی':'Augmented service','تجربهٔ مشتری':'Customer experience','نقطهٔ تماس':'Touchpoint','هزینهٔ متغیر':'Variable cost','هزینهٔ ثابت':'Fixed cost','حاشیهٔ مشارکت':'Contribution margin','کشش':'Elasticity','تخفیف':'Discount',
 'واسطه':'Intermediary','حذف واسطه':'Disintermediation','تعارض کانال':'Channel conflict','تعارض عمودی':'Vertical conflict','تعارض افقی':'Horizontal conflict','همه‌کاناله':'Omnichannel','گروه مداخله':'Treatment group','گروه کنترل':'Control group','معیار اصلی':'Primary outcome','اثر افزایشی':'Incremental effect','انتساب':'Attribution','شاخص نمایشی':'Vanity metric','شاخص تصمیم':'Actionable metric','تکرارپذیری':'Replicability',
 'ادراک':'Perception','اسناد درونی':'Internal attribution','اسناد بیرونی':'External attribution','سوگیری':'Bias','شاهد رفتاری':'Behavioral evidence','توانایی':'Ability','وضوح نقش':'Role clarity','محیط عملکرد':'Performance context','انگیزه':'Motivation','انتظار':'Expectancy','ورودی':'Input','پیامد':'Outcome','انصاف ادراک‌شده':'Perceived equity','رفتار جانشین':'Goal displacement','شاخص محافظ':'Guardrail metric',
 'رفتار قابل مشاهده':'Observable behavior','بازخورد توسعه‌ای':'Developmental feedback','نمرهٔ الگوریتمی':'Algorithmic score','خطای اندازه‌گیری':'Measurement error','بازبینی انسانی':'Human review','تیم':'Team','وابستگی وظیفه':'Task interdependence','پاسخ‌گویی متقابل':'Mutual accountability','هنجار':'Norm','امنیت روانی':'Psychological safety',
 'تعارض وظیفه':'Task conflict','تعارض رابطه':'Relationship conflict','بازگویی فعال':'Reflective listening','هنجار ارتباطی':'Communication norm','موضوع‌محوری':'Issue focus','آزمایش میدانی':'Field experiment','پیش‌ثبت':'Preregistration','متغیر مستقل':'Independent variable','قابلیت تعمیم':'Generalizability','واحد تحلیل':'Unit of analysis','حد ادعا':'Claim scope','نظارت انسانی':'Human oversight','فرضیهٔ محلی':'Local hypothesis',
 'ساختار رسمی':'Formal structure','شبکهٔ غیررسمی':'Informal network','دامنهٔ کنترل':'Span of control','تمرکز':'Centralization','واگذاری اختیار':'Delegation','مصنوع فرهنگی':'Cultural artifact','ارزش اعلام‌شده':'Espoused value','فرض بنیادین':'Basic underlying assumption','تناسب فرهنگی':'Culture fit','ساختار وظیفه‌ای':'Functional structure','ساختار محصولی/منطقه‌ای':'Divisional structure','ماتریس':'Matrix structure','دامنهٔ اختیار':'Decision authority','هزینهٔ هماهنگی':'Coordination cost',
 'مدیریت الگوریتمی':'Algorithmic management','هدف مدل':'Model objective','سوگیری داده':'Data bias','پاسخ‌گویی':'Accountability','تحلیل شغل':'Job analysis','شرح نقش':'Role description','معیار انتخاب':'Selection criterion','مصاحبهٔ ساختاریافته':'Structured interview','نمونه‌کار':'Work sample','مدیریت عملکرد':'Performance management','بازخورد رفتاری':'Behavioral feedback','شاخص نتیجه':'Outcome metric','انصاف رویه‌ای':'Procedural justice','ذی‌نفع':'Stakeholder','ائتلاف تغییر':'Change coalition','مقاومت':'Resistance','اجرای آزمایشی':'Pilot','خط مبنا':'Baseline','تحلیل وظیفه':'Task analysis','تقویت کار':'Augmentation','جانشینی وظیفه':'Task substitution','گذار شغلی':'Job transition',
}

def main():
    count=0;preserved=0
    for p in sorted((ROOT/'content').glob('*/lessons/*.json')):
        l=json.loads(p.read_text(encoding='utf-8'));card=next((c for c in l['learning_cards'] if c.get('type')=='key_terms'),None)
        if not card:continue
        text=None
        if l['id'].startswith('C01-'):
            stage=int(l['id'][6:8]);lesson=int(l['id'][-2:]);text=ACCOUNTING[(stage-1)*4+lesson-1]
        elif l['id'] in OPERATIONS:text=OPERATIONS[l['id']]
        elif l['id'] in STATS:text=STATS[l['id']]
        if text:
            if l['id'].startswith('C01-') or l['id']=='C06-ST03-L03':
                new_id=l['id']+'-TERMS-REVIEW'
                existing=next((c for c in l['learning_cards'] if c['id']==new_id),None)
                if not existing:
                    card['type']='explanation';card['title']='رابطه‌ها و محدودیت‌های این مفهوم'
                    l['learning_cards'].append({'id':new_id,'type':'key_terms','title':'اصطلاح‌هایی که توی منابع می‌بینی','text':text});preserved+=1
                else:existing['text']=text
            else:card['text']=text
            count+=1
        elif not re.search('[A-Za-z]{2}',card['text']):
            original=card['text']
            for fa,en in sorted(PAIRS.items(),key=lambda x:len(x[0]),reverse=True):
                if fa=='تمرکز' and l['id'].startswith('C04'):en='Market focus'
                card['text']=re.sub(r'(?<![آ-ی\u200c])'+re.escape(fa)+r'(?=[:؛، =]| با |،)',lambda m:fa+' ('+en+')',card['text'],count=1)
            if original!=card['text']:count+=1
        dump(p,l)
    print(json.dumps({'term_cards_corrected':count,'explanations_preserved_as_separate_cards':preserved}))

if __name__=='__main__':main()
