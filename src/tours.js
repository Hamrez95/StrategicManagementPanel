import {preferences} from './preferences.js';
import {localize} from './i18n.js';
const step = (target, faTitle, enTitle, faText, enText) => ({target, title:{fa:faTitle,en:enTitle}, text:{fa:faText,en:enText}});
const intro = step('.page-head','از سؤال شروع کنیم','Start with the question','ابتدا مشخص کنید این صفحه به کدام تصمیم کمک می‌کند. اعداد نمونه‌اند؛ برای کار واقعی شواهد شرکت را جایگزین کنید.','Identify the decision this page supports. The figures are fictional: replace them with evidence from your own company.');
const finish = step('.head-actions','تحلیل را به اقدام وصل کنید','Turn analysis into action','نتیجه، فرضیات و شرط بازبینی را ثبت کنید. یک امتیاز یا نمودار به‌تنهایی تصمیم نهایی نیست.','Record the conclusion, assumptions and review trigger. A score or chart alone is not a final decision.');
const definitions = {
 overview:[intro,step('.strategy-banner','قدم بعدی شما','Your next step','مسیر شش‌مرحله‌ای یک فرایند تکرارشونده است. از این کارت به خروجی مرحله بعد بروید.','The six-stage workflow is iterative. This card takes you to the next deliverable.'),step('.metric','یک شاخص، یک دوره','One metric, one period','واحد، دوره مالی و مبنای مقایسه را بخوانید. ROA ماهانه را با ROA سالانه مقایسه نکنید.','Check the unit, accounting period and comparison baseline. Do not compare monthly ROA directly with annual ROA.'),step('.chart','عملکرد در برابر هدف','Actual versus target','خط پیوسته فروش نمونه و خط نقطه‌چین هدف است. فاصله را با علت و اقدام اصلاحی توضیح دهید.','The solid line is sample revenue; the dashed line is the target. Explain the gap with a cause and corrective action.'),finish],
 journey:[intro,step('.road-card','خروجی هر مرحله','A deliverable for every stage','این مسیر قفل ندارد. تکمیل فقط اعلام وضعیت تیم است؛ می‌توانید برای اصلاح فرض‌ها به مراحل قبل برگردید.','No stage is locked. Completion records your team’s progress. Return to earlier stages when assumptions change.'),finish],
 company:[intro,step('[data-tour="icp"]','ICP چیست؟','What is an ICP?','ICP توصیف مشتری یا شرکت ایده‌آل است، نه یک نسبت با فرمول ثابت. برای شرکت نمونه: شرکت‌های ۵۰ تا ۲۰۰۰ نفره با نیاز تغذیه سالم و بودجه مشخص.','An ideal customer profile describes the customer or company you can serve best. It is not a ratio with a universal formula. The sample company targets companies with 50–2,000 employees and a healthy-snack budget.'),step('.panel','ICP را با شاهد بسازید','Validate the profile','اندازه و صنعت، مسئله مشتری، بودجه، تصمیم‌گیرنده و معیار عدم‌پذیرش را بنویسید. با مصاحبه و داده خرید بررسی کنید کدام بخش سودآورتر و ماندگارتر است.','Document size and industry, customer problem, budget, decision-maker and disqualifiers. Validate the segment using interviews, purchase economics and retention.'),step('[data-action="companyEdit"]','پروفایل را اصلاح کنید','Update the company profile','مشتری هدف، مسئله اصلی و مرز انتخاب‌ها را در این فرم ثبت کنید. تغییرات در مرورگر ذخیره می‌شوند.','Use this form to record the target customer, central problem and boundaries of your strategy. Changes are saved locally.'),finish],
 environment:[intro,step('.cols-3 .panel','از روند به عامل','From a trend to a factor','PESTEL روندهای سیاسی، اقتصادی، اجتماعی، فناوری، محیط‌زیستی و حقوقی را بررسی می‌کند. برای هر عامل، اثر بر شرکت و منبع بنویسید.','PESTEL examines political, economic, social, technological, environmental and legal trends. Record a source and the effect on your company.'),step('.bar-chart','TAM، SAM و SOM','TAM, SAM and SOM','کل بازار، بازار قابل‌خدمت و سهم قابل‌دستیابی را با یک واحد و بازه زمانی بسنجید. SOM باید با ظرفیت فروش و وصول سازگار باشد.','Use consistent units and periods for total, serviceable and obtainable markets. SOM must fit your sales and collection capacity.'),finish],
 industry:[intro,step('.radar','پنج نیروی پورتر','Porter’s five forces','این تحلیل درباره ساختار صنعت است. امتیازهای ۱ تا ۵ فقط مقیاس کارگاهی این نمونه‌اند؛ رتبه علمی قطعی نیستند.','This analyzes industry structure. The 1–5 ratings are workshop scales in this prototype, not a standard Porter scoring formula.'),step('.data-table','مقایسه منصفانه رقبا','Compare competitors consistently','در CPM برای همه رقبا عوامل و وزن‌های یکسان انتخاب کنید. مجموع وزن‌ها ۱۰۰٪ است؛ رتبه ۱ تا ۴ با شاهد پشتیبانی شود.','In CPM, use the same factors and weights for every competitor. Weights total 100%; justify each 1–4 rating with evidence.'),finish],
 internal:[intro,step('.data-table','چهار سؤال VRIO','The four VRIO questions','ارزشمند، کمیاب، تقلید دشوار و قابل‌بهره‌برداری توسط سازمان؟ با لمس خانه‌ها پاسخ را تغییر دهید. چهار بله فقط کاندیدای مزیت پایدار است.','Valuable, rare, costly to imitate and supported by the organization? Click cells to change answers. Four yeses identify a candidate for sustained advantage.'),step('.value-chain','ارزش کجا ساخته می‌شود؟','Where is value created?','در هر فعالیت زنجیره ارزش، هزینه و تمایز را تحلیل کنید و قابلیت را به عملکرد واقعی پیوند دهید.','Examine cost and differentiation in each value-chain activity. Connect capabilities to observed performance.'),finish],
 matrices:[intro,step('.tool-card','ابزار مناسب مسئله','Choose the right tool','لازم نیست همه ماتریس‌ها را اجرا کنید. سؤال هر کارت مشخص می‌کند آن مدل در کدام تصمیم کمک می‌کند.','You do not need every matrix. Each card explains the decision its model can support.'),finish],
 swot:[intro,step('.swot-grid','چهار دسته، عوامل مستند','Four groups of evidenced factors','قوت و ضعف داخلی‌اند؛ فرصت و تهدید خارجی. عنوان کلی کافی نیست؛ عامل مشخص و شاهد لازم است.','Strengths and weaknesses are internal; opportunities and threats are external. Use specific, evidenced factors.'),step('.outline-card','TOWS: ترکیب به گزینه','TOWS: combine factors into options','قوت یا ضعف را با فرصت یا تهدید ترکیب کنید. برای هر گزینه یک اقدام محدود، هزینه و فرض قابل‌آزمون بنویسید.','Match strengths or weaknesses with opportunities or threats. Give each option a bounded action, cost and testable assumption.'),finish],
 qspm:[intro,step('.data-table tbody input[type="checkbox"]','عامل مرتبط است؟','Is this factor relevant?','اگر عامل روی انتخاب بین این گزینه‌ها اثر ندارد، آن را برای همه گزینه‌های همان ردیف کنار بگذارید.','If a factor does not influence the choice among these options, omit it from every option in that row.'),step('[data-q-score]','جذابیت AS و امتیاز TAS','Attractiveness AS and weighted TAS','AS در این نمونه ۱ تا ۴ است. TAS = وزن × AS. وزن خارجی و داخلی هرکدام جداگانه ۱۰۰٪ هستند.','Here AS runs from 1 to 4. TAS = weight × AS. External and internal factor weights each total 100% separately.'),step('.result-big','بالاتر یعنی جذاب‌تر، مشروط','Higher means relatively more attractive','مجموع بزرگ‌تر نشان‌دهنده جذابیت نسبی در همین گزینه‌ها و فرض‌هاست. ریسک، بودجه و امکان‌پذیری را جدا بررسی کنید.','A higher total means relatively greater attractiveness under these factors and assumptions. Check risk, funding and feasibility separately.'),finish],
 finance:[intro,step('.metric:has([data-help="roa"])','ROA را بخوانیم','Read ROA','سود خالص دوره ÷ متوسط دارایی‌های ابتدا و انتها × ۱۰۰. در نمونه: ۴۰۰ ÷ ۵۰۰۰ = ۸٪ ماهانه. دوره و صنعت باید یکسان باشند.','Net income ÷ average opening and closing assets × 100. Here: 400 ÷ 5,000 = 8% for the sample month. Compare consistent periods and industries.'),step('.metric:has([data-help="cac"])','CAC در کنار LTV','CAC alongside LTV','CAC = هزینه جذب ÷ مشتریان پرداخت‌کننده جدید. LTV اینجا برآورد حاشیه مشارکت است؛ آن را با کوهورت واقعی بررسی کنید.','CAC = acquisition spending ÷ new paying customers. LTV here estimates lifetime contribution; validate it with actual customer cohorts.'),step('#investment-form','سرمایه‌گذاری و NPV','Investment and NPV','جریان نقدی، نرخ تنزیل و مبنای تورم باید هماهنگ باشند. NPV مثبت فقط تحت همین فرض‌ها ارزش اضافه می‌کند.','Cash flows, discount rate and inflation basis must be consistent. Positive NPV adds value only under the stated assumptions.'),finish],
 scenarios:[intro,step('[data-scenario="growth"]','یک فرض را تغییر دهید','Change an assumption','رشد حجم با قیمت ثابت و رشد هزینه متغیر را جدا تغییر دهید. این یک آزمون حساسیت است، نه پیش‌بینی بازار.','Change volume growth at fixed prices and variable-unit cost separately. This is a sensitivity test, not a market forecast.'),step('.scenario-grid','از عدد به آینده متفاوت','From a number to distinct futures','برای هر آینده، روایت علّی، نشانه هشدار، پاسخ، مسئول و زمان بازبینی تعریف کنید.','Define a causal narrative, warning signal, response, owner and review date for each future.'),finish],
 execution:[intro,step('.kanban','از هدف به ابتکار','From objectives to initiatives','هر کارت به یک هدف متصل است و مسئول، بودجه، موعد و معیار پایان دارد. وضعیت را با ویرایش کارت تغییر دهید.','Each card links to an objective and has an owner, budget, due date and completion criterion. Edit a card to change its status.'),step('.task-card .progress','پیشرفت با نتیجه یکی نیست','Activity is not outcome','پیشرفت انجام کار را نشان می‌دهد. اثر واقعی ابتکار را در شاخص هدف مرتبط بسنجید.','Task progress measures delivery. Assess the initiative’s actual effect using its linked objective’s KPI.'),finish],
 scorecard:[intro,step('.data-table','مبنا، واقعی و هدف','Baseline, actual and target','پیشرفت = (واقعی − مبنا) ÷ (هدف − مبنا). برای شاخص کاهشی هم درست کار می‌کند؛ هدف نباید با مبنا یکسان باشد.','Progress = (actual − baseline) ÷ (target − baseline). It also works for decreasing metrics. The target must differ from the baseline.'),step('.score-map','نقشه استراتژی یک فرضیه است','A strategy map is a hypothesis','پیوند یادگیری، فرایند، مشتری و مالی را با داده و زمان تأخیر بررسی کنید. پیکان به معنی اثبات علت نیست.','Test links among learning, processes, customers and finance using data and time lags. An arrow does not prove causation.'),finish],
 risks:[intro,step('.heatmap','رتبه‌بندی ریسک','Prioritize risks','احتمال × اثر یک اولویت ترتیبی کارگاهی است. امتیاز ۲۰ به معنی دو برابر خسارت امتیاز ۱۰ نیست.','Likelihood × impact is a workshop ranking. A score of 20 does not mean twice the loss of a score of 10.'),step('.data-table','مالک، پاسخ و محرک','Owner, response and trigger','فقط رنگ ریسک کافی نیست؛ یک مسئول، پاسخ مشخص و نشانه فعال‌شدن بازبینی ثبت کنید.','A risk color is not enough. Assign an owner, concrete response and a trigger for review.'),finish],
 journal:[intro,step('.tabs','تصمیم، فرضیه یا شاهد؟','Decision, assumption or evidence?','واقعیت مشاهده‌شده را از باور آزمایش‌نشده و تصمیم گرفته‌شده جدا ثبت کنید. منبع و موعد بازبینی را نگه دارید.','Keep observed facts, untested beliefs and decisions distinct. Record sources and review dates.'),finish],
 reports:[intro,step('.report','گزارش زنده از داده شما','A live report from your data','گزارش از همین داده‌های مرورگر ساخته می‌شود. پیش از ارائه، فرضیات، دوره‌ها، منابع و شرط تغییر تصمیم را بازبینی کنید.','This report uses your local browser data. Review assumptions, periods, sources and conditions for changing a decision before sharing.'),finish],
 learn:[intro,step('.lesson-content, .tool-card, .source-card','تعریف، مثال و محدودیت','Definition, example and limits','هر مدل را با یک ورودی واقعی تمرین کنید. قبل از تغییر، نتیجه را حدس بزنید؛ بعد بگویید چه تصمیمی تغییر کرد.','Practice each model with a real input. Predict the result before changing it, then explain which decision changed.'),finish],
 settings:[intro,step('[data-preference="theme"]','ظاهر و زبان','Appearance and language','تم روشن، تیره یا سیستم و فارسی یا انگلیسی را انتخاب کنید. تنظیم‌ها روی همین دستگاه ذخیره می‌شوند.','Choose light, dark or system theme and Persian or English. Preferences are saved on this device.'),step('[data-setting="learning"]','یک کلید برای همه آموزش‌ها','One switch for all learning','با خاموش‌کردن این کلید، آموزش صفحه، علامت‌های اطلاعات و کتابخانه آموزشی پنهان می‌شوند. هشدارهای ضروری باقی می‌مانند.','Turning this switch off hides page tours, concept tips and the learning library. Essential validation warnings remain.')],
};
const matrixTours = {
 efe:[intro,step('[data-field="weight"]','وزن: اهمیت عامل','Weight: importance of the factor','وزن‌ها از صفر تا صد هستند و جمعشان باید ۱۰۰٪ باشد. وزن اهمیت عامل در صنعت است.','Weights range from 0 to 100 and must sum to 100%. They represent each factor’s importance in the industry.'),step('[data-field="rating"]','رتبه: پاسخ شرکت','Rating: the company’s response','در EFE رتبه ۱ پاسخ ضعیف و ۴ پاسخ عالی است؛ یک تهدید هم می‌تواند رتبه پاسخ ۴ داشته باشد.','In EFE, 1 means a poor response and 4 a superior response. The response to a threat can also score 4.'),step('.metric','امتیاز وزنی','Weighted score','وزن درصدی × رتبه ÷ ۱۰۰؛ سپس جمع همه ردیف‌ها. ۲٫۵ نقطه میانی مدل است، نه مرز اثبات‌شده موفقیت.','Percentage weight × rating ÷ 100, summed across rows. 2.5 is the model’s midpoint, not a proven success threshold.'),finish],
 ife:[intro,step('[data-field="weight"]','جمع وزن‌ها ۱۰۰٪','Weights sum to 100%','اهمیت عوامل داخلی را با شواهد و هدف تحلیل تعیین کنید.','Choose internal factor weights using evidence and the purpose of the analysis.'),step('[data-field="rating"]','قوت و ضعف رتبه‌های متفاوت دارند','Strengths and weaknesses use different ratings','ضعف عمده ۱، ضعف جزئی ۲، قوت جزئی ۳ و قوت عمده ۴. رابط انتخاب نادرست را محدود می‌کند.','Major weakness = 1, minor weakness = 2, minor strength = 3, major strength = 4. The interface restricts invalid choices.'),step('.metric','امتیاز داخلی','Internal assessment','هر ردیف وزن × رتبه است. نتیجه را همراه کیفیت شاهد و حساسیت وزن‌ها بخوانید.','Each row contributes weight × rating. Interpret the total alongside evidence quality and weight sensitivity.'),finish],
 bcg:[intro,step('.chart','دو محور BCG','The two BCG axes','سهم نسبی = سهم شرکت ÷ سهم بزرگ‌ترین رقیب. محور سهم از چپ به راست نزولی و لگاریتمی است؛ محور دوم رشد سالانه بازار.','Relative share = your share ÷ the largest competitor’s share. The share axis decreases left to right on a log scale; the other axis is annual market growth.'),step('[data-setting="bcgThreshold"]','مرز رشد وابسته به صنعت است','Growth threshold depends on the industry','مرز ۱۰٪ فقط فرض نمونه است. اندازه حباب از درآمد گرفته شده؛ سودآوری، نقدینگی و هم‌افزایی را جدا بسنجید.','10% is a sample assumption. Bubble size uses revenue. Assess profitability, cash generation and synergies separately.'),finish],
 space:[intro,step('[data-space="FS"]','دو مقیاس متفاوت','Two rating scales','FS و IS از ۱ تا ۶؛ CA و ES از منفی ۶ تا منفی ۱ هستند. هر بُعد میانگین سه مؤلفه است.','FS and IS use 1 to 6; CA and ES use −6 to −1. Each dimension averages three components.'),step('.chart','از امتیاز به بردار','From scores to a vector','X = IS + CA و Y = FS + ES. ناحیه فقط جهت کلی می‌دهد؛ نزدیک محور صفر، نتیجه مرزی است.','X = IS + CA and Y = FS + ES. The quadrant suggests a broad posture. Near zero, the result is borderline.'),finish],
 ie:[intro,step('.ie-grid','خانه از ورودی‌های زنده می‌آید','The cell uses live inputs','محور افقی IFE و محور عمودی EFE است. اگر وزن‌ها معتبر نباشند، هیچ خانه‌ای انتخاب نمی‌شود.','The horizontal axis is IFE and the vertical axis EFE. No cell is selected when weights are invalid.'),finish],
 ge:[intro,step('.ie-grid','قدرت و جذابیت','Strength and attractiveness','امتیازهای ۱ تا ۵ این نمونه تجمیعی و کارگاهی‌اند. برای کاربرد واقعی، عوامل و وزن‌ها را مستند کنید.','The 1–5 scores here are aggregate workshop ratings. Document the component factors and weights for real use.'),finish],
 ansoff:[intro,step('.swot-grid','محصول و بازار','Product and market','ترکیب فعلی یا جدید بودن محصول و بازار، چهار جهت رشد می‌سازد. برای هر جهت یک آزمایش مشخص ثبت کنید.','Existing or new products and markets form four growth directions. Record a concrete experiment for each viable direction.'),finish],
 grand:[intro,step('.swot-grid','یک جهت‌نمای کیفی','A qualitative orientation','قدرت رقابتی و رشد بازار باید شاهد داشته باشند. هر ناحیه خانواده‌ای از گزینه‌هاست، نه دستور خودکار.','Competitive strength and market growth need evidence. Each quadrant describes a family of options, not an automatic instruction.'),finish],
 cpm:definitions.industry,
};
export const tourAvailable = (view, sub) => Boolean(preferences.showTutorial && (view === 'matrices' && sub ? matrixTours[sub] : definitions[view]));
let active = null;
let returnFocus = null;
let previousOverflow = '';
const text = pair => pair[preferences.language];
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function stopTour() {
  if (!active) return;
  document.querySelector('#guided-tour')?.remove();
  document.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', position);
  window.removeEventListener('scroll', position, true);
  document.body.style.overflow = previousOverflow;
  const focus = returnFocus;
  active = null;
  if (focus?.isConnected) focus.focus({preventScroll:true});
}
export function startTour(view, sub) {
  if (!preferences.showTutorial) return;
  stopTour();
  const steps = (view === 'matrices' && sub ? matrixTours[sub] : definitions[view])?.filter(s => document.querySelector(s.target));
  if (!steps?.length) return;
  returnFocus = document.activeElement;
  previousOverflow = document.body.style.overflow;
  active = {steps,index:0};
  const layer = document.createElement('div');
  layer.id = 'guided-tour';
  layer.className = 'tour-layer';
  layer.innerHTML = '<div class="tour-spotlight"></div><section class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-description"></section>';
  document.body.append(layer);
  layer.addEventListener('click', event => {
    const action = event.target.closest('[data-tour-action]')?.dataset.tourAction;
    if (action === 'close' || action === 'finish') stopTour();
    if (action === 'next' && active) { active.index++; showStep(); }
    if (action === 'back' && active) { active.index--; showStep(); }
  });
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
  showStep();
}
function showStep() {
  if (!active) return;
  const s = active.steps[active.index];
  document.querySelector(s.target).scrollIntoView({block:'center',behavior:'instant'});
  const en = preferences.language === 'en';
  const card = document.querySelector('.tour-card');
  card.innerHTML = `<header><span>${en?'Page walkthrough':'آموزش این صفحه'}</span><button class="icon-btn" data-tour-action="close" aria-label="${en?'Close tutorial':'بستن آموزش'}">×</button></header><div class="tour-step-count" aria-live="polite">${active.index+1} / ${active.steps.length}</div><h2 id="tour-title">${escape(text(s.title))}</h2><p id="tour-description">${escape(text(s.text))}</p><div class="tour-dots" aria-hidden="true">${active.steps.map((_,i)=>`<i class="${i===active.index?'active':''}"></i>`).join('')}</div><footer><button class="btn" data-tour-action="back" ${active.index===0?'disabled':''}>${en?'Back':'قبلی'}</button><button class="btn primary" data-tour-action="${active.index===active.steps.length-1?'finish':'next'}">${active.index===active.steps.length-1?(en?'Finish':'پایان آموزش'):(en?'Next':'بعدی')}</button></footer>`;
  localize(card);
  position();
  card.querySelector('[data-tour-action="next"], [data-tour-action="finish"]').focus({preventScroll:true});
}
function position() {
  if (!active) return;
  const target = document.querySelector(active.steps[active.index].target);
  const r = target.getBoundingClientRect();
  const spotlight = document.querySelector('.tour-spotlight');
  const top = Math.max(76,r.top-7),left=Math.max(8,r.left-7);
  Object.assign(spotlight.style,{left:`${left}px`,top:`${top}px`,width:`${Math.min(r.width+14,innerWidth-left-8)}px`,height:`${Math.max(8,Math.min(r.bottom+7,innerHeight-8)-top)}px`});
  const card = document.querySelector('.tour-card');
  const w=Math.min(390,innerWidth-24),h=card.offsetHeight;
  const below=r.bottom+20;
  const y=innerWidth<=700?innerHeight-h-12:below+h<innerHeight-12?below:Math.max(12,r.top-h-20);
  Object.assign(card.style,{width:`${w}px`,left:`${Math.max(12,Math.min(innerWidth-w-12,r.left))}px`,top:`${Math.max(12,y)}px`});
}
function onKey(event) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); stopTour(); return; }
  if (event.key !== 'Tab') return;
  const buttons = [...document.querySelectorAll('.tour-card button:not(:disabled)')];
  const first=buttons[0],last=buttons.at(-1);
  if (event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
  if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
}
