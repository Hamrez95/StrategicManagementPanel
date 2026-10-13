const STOP_WORDS=new Set(['matrix','matrices','matrixes','page','section','tool','model','chart','lesson','formula','calculation','definition','explain','tutorial','what','is','are','the','of','for','a','an','ماتریس','ماتریسها','ماتریسهای','صفحه','بخش','ابزار','نمودار','درس','آموزش','فرمول','محاسبه','تعریف','توضیح','چیست']);

export const PAGE_SEARCH_TERMS={
  overview:'dashboard executive summary وضعیت کل شاخص ها',
  journey:'roadmap steps workflow شروع مسیر استراتژی',
  company:'company organization profile ICP ideal customer profile customer segmentation target segment مشتری ایده آل پروفایل مشتری مشتریان بخش بازار هدف',
  environment:'PESTEL macro external environment trends political economic social technology legal ecological pestel scan محیط کلان تحلیل محیطی عوامل محیطی',
  industry:'Porter five forces competition competitors market structure صنعت پورتر نیروهای رقابتی رقبا',
  internal:'VRIO value chain resources capabilities strengths weaknesses زنجیره ارزش منابع قابلیت قوت ضعف',
  matrices:'EFE IFE CPM SPACE BCG IE GE Ansoff Grand matrix analysis ماتریس ارزیابی',
  swot:'TOWS strengths weaknesses opportunities threats قوت ضعف فرصت تهدید سوات',
  qspm:'quantitative strategic planning matrix strategy selection جذابیت راهبرد انتخاب استراتژی برنامه ریزی کمی',
  finance:'business economics financial ratios ROA ROE NPV IRR CAC LTV CAGR ROI profitability margin cash flow cashflow break even investment discount rate اقتصاد مالی نسبت بازده دارایی حقوق صاحبان سهام ارزش فعلی خالص نرخ بازده داخلی هزینه جذب ارزش طول عمر حاشیه سود جریان نقدینگی نقطه سر به سر سرمایه گذاری نرخ تنزیل',
  scenarios:'scenario planning future uncertainty foresight سناریو آینده عدم قطعیت آینده نگری',
  execution:'implementation initiative owner roadmap milestone اجرا ابتکار مسئول برنامه اقدام',
  scorecard:'BSC balanced scorecard KPI metric objective strategy map کارت امتیازی متوازن شاخص کلیدی عملکرد نقشه استراتژی',
  risks:'risk mitigation probability impact response trigger ریسک احتمال اثر پاسخ کاهش',
  journal:'decision log hypothesis evidence assumption decision record دفتر تصمیم فرضیه شواهد فرضیات فرض',
  reports:'report export print pdf management report گزارش مدیریتی چاپ خروجی',
  learn:'learning library definition formula example آموزش یادگیری کتابخانه تعریف فرمول مثال',
  settings:'preferences appearance language theme dark light آموزش فعال سازی تنظیمات پوسته زبان'
};

export const MATRIX_SEARCH_TERMS={
  efe:'EFE external factor evaluation external factors opportunities threats عوامل خارجی محیط فرصت تهدید',
  ife:'IFE internal factor evaluation internal factors strengths weaknesses عوامل داخلی قوت ضعف',
  cpm:'CPM competitive profile matrix competitor comparison پروفایل رقابتی مقایسه رقبا',
  space:'SPACE strategic position action evaluation posture financial strength industry advantage stability جهت گیری راهبردی',
  bcg:'BCG growth share portfolio stars cash cows question marks dogs رشد سهم بازار سبد کسب و کار ستاره گاو شیرده علامت سوال سگ',
  ie:'IE internal external matrix portfolio cells داخلی خارجی سبد',
  ge:'GE McKinsey industry attractiveness competitive strength attractiveness power جذابیت صنعت قدرت رقابتی مک کینزی',
  ansoff:'Ansoff market penetration development product development diversification نفوذ بازار توسعه بازار توسعه محصول تنوع',
  grand:'Grand strategy matrix competitive position market growth ماتریس استراتژی اصلی موقعیت رقابتی رشد بازار'
};

export const CONCEPT_SEARCH_TERMS={
  icp:'ICP ideal customer profile customer company profile firmographic technographic target segment ideal customer مشتری ایده آل پروفایل شرکت مشتری هدف بخش بندی بازار',
  efe:'EFE external factor evaluation external opportunities threats ارزیابی عوامل خارجی فرصت تهدید',
  ife:'IFE internal factor evaluation internal strengths weaknesses ارزیابی عوامل داخلی قوت ضعف',
  qspm:'QSPM quantitative strategic planning matrix total attractiveness score جذابیت کل انتخاب راهبرد',
  bcg:'BCG growth share portfolio cash cow star question mark dog سهم رشد سبد سرمایه گذاری گاو شیرده',
  space:'SPACE strategic posture financial strength competitive advantage جهت گیری موقعیت مالی مزیت رقابتی',
  ie:'IE internal external portfolio matrix ماتریس داخلی خارجی',
  ge:'GE McKinsey industry attractiveness business strength جذابیت صنعت قدرت کسب و کار',
  ansoff:'Ansoff market product growth matrix ماتریس رشد محصول بازار',
  grand:'grand strategy competitive position market growth استراتژی اصلی موقعیت رقابتی',
  roa:'ROA return on assets asset profitability بازده دارایی سودآوری دارایی',
  roe:'ROE return on equity shareholders equity بازده حقوق صاحبان سهام',
  npv:'NPV net present value investment value ارزش فعلی خالص سرمایه گذاری',
  irr:'IRR internal rate of return نرخ بازده داخلی',
  cac:'CAC customer acquisition cost cost جذب مشتری هزینه جذب مشتری',
  ltv:'LTV lifetime value customer lifetime value ارزش طول عمر مشتری',
  cagr:'CAGR compound annual growth rate نرخ رشد مرکب سالانه',
  margin:'gross margin net margin contribution margin حاشیه سود ناخالص خالص مشارکت',
  bsc:'BSC balanced scorecard strategy map کارت امتیازی متوازن نقشه استراتژی',
  vrio:'VRIO valuable rare inimitable organized resources ارزشمند کمیاب تقلیدناپذیر سازماندهی',
  porter:'Porter five forces bargaining power suppliers buyers rivalry تهدید نیروهای پنجگانه پورتر',
  progress:'progress KPI objective actual target performance پیشرفت هدف عملکرد واقعی شاخص کلیدی',
  risk:'risk probability impact mitigation trigger ریسک احتمال اثر کاهش ریسک محرک',
  scenario:'scenario planning uncertainty forecast سناریو برنامه ریزی عدم قطعیت پیش بینی'
};

export function normalizeSearchText(value){
  return String(value??'').normalize('NFKC').toLocaleLowerCase()
    .replace(/[يى]/g,'ی').replace(/ك/g,'ک')
    .replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[\u200c\u200d\u200e\u200f\u202a-\u202e]/g,' ')
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}

export function searchItems(items,query,limit=15){
  const queryText=normalizeSearchText(query),allTerms=queryText.split(/\s+/).filter(Boolean);
  if(!allTerms.length)return items.slice(0,limit);
  const specificTerms=allTerms.filter(term=>!STOP_WORDS.has(term));
  const terms=specificTerms.length?specificTerms:allTerms;
  return items.map((item,index)=>{
    const title=normalizeSearchText(item.title),text=normalizeSearchText([item.title,item.route,item.type,item.keywords,item.description,item.content].join(' '));
    if(!terms.every(term=>text.includes(term)))return null;
    let score=0;
    for(const term of terms){
      if(title.split(' ').includes(term))score+=12;
      else if(title.split(' ').some(word=>word.startsWith(term)))score+=8;
      else if(title.includes(term))score+=5;
      else score+=1;
    }
    if(item.type==='صفحه'||item.type==='ماتریس')score+=32;
    if(item.route==='company'&&terms.includes('icp'))score+=24;
    if(item.route?.startsWith('matrices/')&&terms.some(term=>normalizeSearchText(item.route).includes(term)))score+=8;
    if(queryText.length>2&&title.includes(queryText))score+=16;
    return {item,index,score};
  }).filter(Boolean).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,limit).map(result=>result.item);
}
