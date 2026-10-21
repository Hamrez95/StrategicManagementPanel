/* Standalone content review; no account, purchase, or production progress. */
const data=JSON.parse(document.getElementById('catalogData').textContent);
const bundles=JSON.parse(document.getElementById('authoredData').textContent);
const $=id=>document.getElementById(id);
const f=n=>Number(n).toLocaleString('fa-IR');
const hasPersianLetters=text=>/[\u0621-\u063a\u0641-\u064a\u066e-\u066f\u0671-\u06d3\u06fa-\u06fc]/u.test(String(text));
const elt=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined){e.textContent=text;if(hasPersianLetters(text)&&/[A-Za-z]/.test(String(text))){e.replaceChildren();const parts=String(text).split(/([A-Za-z][A-Za-z0-9_.-]*(?: [A-Za-z0-9_.-]+)*)/g);for(const part of parts){if(/^[A-Za-z]/.test(part)){const bdi=document.createElement('bdi');bdi.dir='ltr';bdi.textContent=part;e.append(bdi);}else e.append(document.createTextNode(part));}}}if(text!==undefined&&!hasPersianLetters(text)&&/[=÷×]/.test(String(text))){e.dir='ltr';e.style.textAlign='start';}if(cls)e.className=cls;return e;};
const authoredLessons=new Map(),authoredStages=new Map(),authoredCourses=new Map();
for(const course of bundles.courses){authoredCourses.set(course.id,course);for(const st of course.stages){authoredStages.set(st.id,st);for(const l of st.lessons)authoredLessons.set(l.id,l);}}
const completed=new Set();
let currentCourse,currentLesson,cardIndex=0,bank=[],questionIndex=0,answers=[],mode='lesson',assessmentTitle='',resumeQuiz=false;
function action(label,handler,primary=false){const b=elt('button',label,primary?'primary':undefined);b.onclick=handler;return b;}
function dialog(title){$('lessonTitle').textContent=title;$('body').replaceChildren();if(!$('lesson').open)$('lesson').showModal();$('lesson').scrollTop=0;}
function returnPath(){$('lesson').close();draw();}
function courses(){const path=data.paths.find(p=>p.id===$('path').value);$('course').replaceChildren();for(const c of data.courses.filter(c=>path.course_ids.includes(c.id))){const o=elt('option',c.title);o.value=c.id;$('course').append(o);}if(path.id==='GENERAL')$('course').value='C07';draw();}
function draw(){
 currentCourse=data.courses.find(c=>c.id===$('course').value);if(!currentCourse)return;
 $('title').textContent=currentCourse.title;
 $('count').textContent=f(data.counts.courses_excluding_bridge)+" درس در نقشه؛ "+f(authoredLessons.size)+" درس‌نامهٔ نوشته‌شده برای بازبینی";
 const authoredCount=currentCourse.stages.flatMap(s=>s.lessons).filter(l=>authoredLessons.has(l.id)).length;
 $('subtitle').textContent=f(currentCourse.counts.stages)+" مرحله، "+f(authoredCount)+" از "+f(currentCourse.counts.lessons)+" درس‌نامه پیش‌نویس داره؛ متن‌های نوشته‌شده هنوز نیازمند بازبینی‌اند. ترتیب مطالعه پیشنهادیه.";
 const root=$('journey');root.replaceChildren();
 for(const st of currentCourse.stages){
  const box=elt('section',undefined,'stage');box.style.setProperty('--stage','var(--'+st.color_token+')');box.append(elt('h3',"مرحلهٔ "+f(st.order)+'؛ '+st.title));const nodes=elt('div',undefined,'nodes');
  st.lessons.forEach((l,i)=>{const b=elt('button',undefined,'node');b.setAttribute('aria-label',l.title);b.append(elt('span',completed.has(l.id)?'✓':f(i+1),'circle'));const label=elt('span');label.append(elt('span',l.title,'label'),elt('span',(authoredLessons.has(l.id)?"نوشته‌شده؛ در انتظار بازبینی":"طرح درس‌نامه")+(l.free_sample?" · نمونهٔ رایگان":''),'small'));b.append(label);b.onclick=()=>openLesson(l);nodes.append(b);});box.append(nodes);
  box.append(action("◇ مرور مرحله؛ "+f(st.checkpoint.item_count)+" پرسش",()=>{const stage=authoredStages.get(st.id);if(stage)startAssessment(stage.checkpoint.questions,'review',"مرور "+st.title);else{dialog("مرور "+st.title);$('body').append(elt('p',"پرسش‌های این مرحله هنوز نوشته نشده‌اند."));}}));root.append(box);
 }
 if(currentCourse.final_assessment){const end=elt('div',undefined,'end');const c=authoredCourses.get(currentCourse.id);end.append(elt('h3',"جمع‌بندی کل درس"));if(c?.final_assessment)end.append(elt('p',f(c.final_assessment.questions.length)+" پرسش برای مرور درس؛ بدون قفل دسترسی."),...(c.final_assessment.description?[elt('p',c.final_assessment.description,'note')]:[]),action("شروع جمع‌بندی درس",()=>startAssessment(c.final_assessment.questions,'final',"جمع‌بندی "+currentCourse.title),true));else end.append(elt('p',"بانک سؤال این درس در صف نگارشه."));root.append(end);}
}
function openLesson(outline){
 currentLesson=authoredLessons.get(outline.id);resumeQuiz=false;cardIndex=0;
 if(!currentLesson){dialog(outline.title);$('body').append(elt('p',"این جایگاه، طرح درس‌نامه‌ست؛ متن و تمرین اون هنوز نوشته نشده‌اند."),elt('p',"هدف پیشنهادی: "+outline.objective));return;}
 showCard();
}
function appendTable(card,container){
 const wrap=elt('div',undefined,'table-scroll'),table=elt('table'),caption=elt('caption',card.title);table.append(caption);
 const head=elt('thead'),row=elt('tr');card.table.columns.forEach(c=>{const th=elt('th',c);th.scope='col';row.append(th);});head.append(row);table.append(head);const body=elt('tbody');card.table.rows.forEach(values=>{const tr=elt('tr');values.forEach(v=>tr.append(elt('td',String(v))));body.append(tr);});table.append(body);wrap.append(table);container.append(wrap);
}
function showCard(){
 dialog(currentLesson.title);const c=currentLesson.learning_cards[cardIndex];$('body').append(elt('p',"آموزش "+f(cardIndex+1)+" از "+f(currentLesson.learning_cards.length),'steps'));
 const card=elt('div',undefined,'card');card.append(elt('h2',c.title),elt('p',c.text));
 if(c.table)appendTable(c,card);
 else if(c.elements){const d=elt('div',undefined,'diagram');d.setAttribute('role','img');d.setAttribute('aria-label',c.alt||c.elements.join('؛ '));c.elements.forEach(t=>d.append(elt('span',t)));card.append(d);}
 if(c.source_url){const a=elt('a',"دیدن منبع مثال واقعی");a.href=c.source_url;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}
 if(currentLesson.media_plan?.display_on_card_id===c.id)appendEducationalVisuals(currentLesson.media_plan,card);
 $('body').append(card);const actions=elt('div',undefined,'actions');if(cardIndex)actions.append(action("قبلی",()=>{cardIndex--;showCard();}));
 const last=cardIndex===currentLesson.learning_cards.length-1;
 actions.append(action(last?(resumeQuiz?"بازگشت به پرسش":"شروع تمرین"):"ادامه",()=>{if(!last){cardIndex++;showCard();}else if(resumeQuiz)showQuestion();else startAssessment(currentLesson.questions,'lesson',currentLesson.title);},true));
 if(resumeQuiz)actions.append(action("بازگشت به پرسش",showQuestion));
 actions.append(action("منابع و فعالیت کاربردی",showResources));$('body').append(actions);
}
function appendEducationalVisuals(plan,container){
 for(const asset of plan.assets||[]){
  const figure=elt('figure');figure.style.margin='20px 0';const wrap=elt('div',undefined,'table-scroll'),picture=elt('picture');
  if(asset.mobile_asset_ref){const source=elt('source');source.media='(max-width: 600px)';source.srcset=asset.mobile_asset_ref;picture.append(source);}
  const image=elt('img');image.src=asset.asset_ref;image.alt=asset.alt_text||plan.purpose;image.loading='lazy';image.style.width='100%';image.style.display='block';
  if(!asset.mobile_asset_ref)image.style.minWidth=(asset.desktop_width_px||1000)+'px';picture.append(image);wrap.append(picture);figure.append(wrap);
  if(asset.caption)figure.append(elt('figcaption',asset.caption,'note'));
  if(asset.long_description){const details=elt('details');details.append(elt('summary',"توضیح متنی تصویر"),elt('p',asset.long_description));figure.append(details);}
  container.append(figure);
 }
}
function showResources(){
 dialog("منابع و فعالیت؛ "+currentLesson.title);$('body').append(elt('p',currentLesson.objective));
 if(currentLesson.glossary?.length){$('body').append(elt('h2',"واژه‌های این مرحله"));for(const item of currentLesson.glossary)$('body').append(elt('p',item.term+'؛ '+item.definition));}
 if(currentLesson.practice_activity){const a=currentLesson.practice_activity;$('body').append(elt('h2',"فعالیت کاربردی"),elt('p',a.prompt));if(a.rubric)$('body').append(elt('p',"معیار بررسی: "+a.rubric.map(x=>typeof x==='string'?x:x.criterion).join('؛ ')));
  if(a.type==='numeric'){const label=elt('label',"پاسخ عددی؛ "+a.unit);label.htmlFor='numericAnswer';const input=elt('input');input.id='numericAnswer';input.inputMode='decimal';input.type='text';const feedback=elt('p');$('body').append(label,input,action("بررسی محاسبه",()=>{let raw=input.value.trim().replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/[٠-٩]/g,c=>"٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/٫/g,'.').replace(/−/g,'-');
   if(/^[+-]?\d{1,3}(?:[٬,]\d{3})+(?:\.\d+)?$/.test(raw))raw=raw.replace(/[٬,]/g,'');
   const value=Number(raw);const valid=raw!==''&&Number.isFinite(value);
   const prefix=!valid?"یک عدد معتبر وارد کن.":Math.abs(value-a.answer)<=a.absolute_tolerance?"درسته. ":"این محاسبه رو دوباره بررسی کن. ";
   feedback.replaceChildren(elt('span',prefix));if(valid)feedback.append(elt('bdi',a.solution));}),feedback);}
  else{const label=elt('label',"پاسخ پیشنهادی تو");label.htmlFor='practiceDraft';const input=elt('textarea');input.id='practiceDraft';input.rows=6;$('body').append(label,input,elt('p',"می‌تونی جوابت رو اینجا بنویسی و بررسی کنی. این پیش‌نمایش جواب رو ذخیره یا نمره‌گذاری نمی‌کنه؛ قبل از خروج کپی‌اش کن.",'note'));}
 }
 $('body').append(elt('h2',"منابع این درس‌نامه"));
 for(const r of currentLesson.source_links||[]){const p=elt('p'),a=elt('a',r.title||r.id);a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';p.append(a,document.createTextNode('؛ '+(r.scope||"مرجع مفهومی")));$('body').append(p);}
 $('body').append(action("بازگشت به آموزش",showCard,true));
}
function startAssessment(items,newMode,title){mode=newMode;assessmentTitle=title;bank=items;questionIndex=0;answers=[];resumeQuiz=false;showQuestion();}
function showQuestion(){
 dialog(assessmentTitle);const item=bank[questionIndex];let chosen=null,checked=false;
 $('body').append(elt('p',"پرسش "+f(questionIndex+1)+" از "+f(bank.length),'steps'),elt('h2',item.prompt));
 const options=elt('div',undefined,'options'),feedback=elt('div');const submit=action("ثبت پاسخ",()=>{},true);submit.disabled=true;
 for(const o of item.options){const b=action(o.text,()=>{if(checked)return;chosen=o.id;for(const child of options.children){child.classList.remove('chosen');child.setAttribute('aria-pressed','false');}b.classList.add('chosen');b.setAttribute('aria-pressed','true');submit.disabled=false;});b.className='option';b.setAttribute('aria-pressed','false');options.append(b);}
 const check=()=>{if(!chosen)return;checked=true;const correct=chosen===item.correct_option_id;if(answers[questionIndex]===undefined)answers[questionIndex]=correct;
 feedback.replaceChildren(elt('p',(correct?"درسته. ":"این نکته رو دوباره ببین: ")+(item.options.find(o=>o.id===chosen).feedback||item.explanation),'feedback'));
 if(correct){submit.textContent=questionIndex===bank.length-1?"دیدن جمع‌بندی":"پرسش بعدی";submit.onclick=()=>{if(questionIndex===bank.length-1)finish();else{questionIndex++;showQuestion();}};}
 else{submit.textContent="تلاش دوباره";submit.onclick=()=>{checked=false;chosen=null;submit.textContent="ثبت پاسخ";submit.disabled=true;submit.onclick=check;for(const child of options.children){child.classList.remove('chosen');child.setAttribute('aria-pressed','false');}};}
 };submit.onclick=check;$('body').append(options,feedback);const actions=elt('div',undefined,'actions');actions.append(submit);
 if(mode==='lesson')actions.append(action("بازگشت به آموزش",()=>{resumeQuiz=true;cardIndex=0;showCard();}));$('body').append(actions);
}
function finish(){
 dialog("جمع‌بندی تمرین");const score=answers.filter(Boolean).length;if(mode==='lesson')completed.add(currentLesson.id);
 $('body').append(elt('h2',"این تمرین رو مرور کردی"),elt('p',"پاسخ درست در تلاش اول: "+f(score)+" از "+f(bank.length)),elt('p',"این پیش‌نمایش سابقه‌ات رو در حساب ذخیره نمی‌کنه. درست‌جواب‌دادن بعد از دیدن پاسخ، با حل مستقل یک سؤال تازه فرق داره. نسخه‌های هم‌ارز تازه هنوز آماده نشده‌ان."));
 if(mode==='lesson'){const all=currentCourse.stages.flatMap(s=>s.lessons);const index=all.findIndex(l=>l.id===currentLesson.id);const next=all[index+1];if(next&&authoredLessons.has(next.id))$('body').append(action("درس‌نامهٔ بعدی",()=>{draw();openLesson(next);},true));}
 $('body').append(action("بازگشت به مسیر",returnPath));
}
for(const path of data.paths){const o=elt('option',path.title);o.value=path.id;$('path').append(o);}
$('path').onchange=courses;$('course').onchange=draw;$('close').onclick=returnPath;$('theme').onclick=()=>document.body.classList.toggle('dark');$('strategy').onclick=()=>{$('path').value='GENERAL';courses();};$('path').value='GENERAL';courses();

