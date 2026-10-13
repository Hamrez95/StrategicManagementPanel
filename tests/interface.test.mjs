// A recording DOM harness, not a browser or a visual/layout test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSeed,help} from '../src/data.js';
import {documents,documentSections} from '../src/document-catalog.js';
const listeners={},windowListeners={},store=new Map(),nodes=new Map();
const node=()=>({innerHTML:'',hidden:true,style:{},dataset:{},classList:{add(){},remove(){}},append(){},focus(){},remove(){},click(){},setAttribute(){},removeAttribute(){}});
for(const key of ['#app','#overlay','#tooltip','#toasts','#search-results'])nodes.set(key,node());
globalThis.document={title:'',documentElement:node(),body:node(),activeElement:null,querySelector:selector=>nodes.get(selector)||null,querySelectorAll:()=>[],createElement:node,addEventListener:(event,callback)=>listeners[event]=callback};
globalThis.window={addEventListener:(event,callback)=>windowListeners[event]=callback,scrollTo(){},innerWidth:1440,innerHeight:900,print(){}};
globalThis.location={hash:'#overview'};
globalThis.localStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
globalThis.setTimeout=callback=>{callback();return 0;};
const NativeFormData=globalThis.FormData;
globalThis.FormData=class {constructor(form){this.entries=Object.entries(form.values)}[Symbol.iterator](){return this.entries[Symbol.iterator]()}};
await import('../src/app.js');
const html=()=>nodes.get('#app').innerHTML;
const go=route=>{location.hash='#'+route;windowListeners.hashchange();return html();};
const saved=()=>JSON.parse(store.get('royesh-strategy-v1'));
const change=(dataset,value,type='number')=>listeners.change({target:{dataset,value,type,checked:!!value,checkValidity:()=>true}});
const action=dataset=>listeners.click({target:{closest:selector=>selector==='[data-action]'?{dataset}:null}});
const submit=(id,values,dataset={})=>listeners.submit({preventDefault(){},target:{id,values,dataset,querySelectorAll:()=>[],reportValidity:()=>true}});

test('all main views, nine matrices, and all learning lessons render',()=>{
  assert.match(html(),/class="icon-btn theme-toggle"[^>]*>[^<]*<svg[\s\S]*?<span>تم<\/span>/,'The theme control has a visible text label');
  assert.match(html(),/data-action="language"[^>]*>EN<\/button>/,'The language control is visible in Persian mode');
  const routes=['overview','journey','company','environment','industry','internal','matrices','swot','qspm','finance','scenarios','execution','scorecard','risks','journal','reports','documents','learn','settings',...['efe','ife','cpm','space','bcg','ie','ge','ansoff','grand'].map(k=>'matrices/'+k),...Object.keys(help).map(k=>'learn/'+k),'learn/sources','journal/فرضیه'];
  for(const route of routes){const content=go(route);assert.ok(content.includes('<main'),route);assert.ok(content.includes('<h1'),route);assert.ok(!content.includes('[object Object]'),route);assert.ok(!content.includes('NaN'),route);assert.ok(!content.includes('undefined'),route);}
});
test('no placeholder navigation or unimplemented action buttons',async()=>{
  const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  const views=['overview','company','environment','industry','internal','matrices','matrices/efe','matrices/space','matrices/bcg','swot','qspm','finance','execution','scorecard','risks','journal','reports','documents','learn','settings'];
  for(const route of views){const content=go(route);assert.ok(!content.includes('href="#"'),route);for(const [,name] of content.matchAll(/data-action="([a-zA-Z]+)"/g)){assert.ok(app.includes(`action==='${name}'`),name);}}
});
test('weight changes persist and invalid groups suppress QSPM',async()=>{
  go('matrices/efe');await change({factor:'E1',collection:'external',field:'weight'},90);assert.equal(saved().external[0].weight,90);assert.ok(html().includes('نامعتبر'));assert.ok(go('qspm').includes('وزن‌ها معتبر نیستند'));await change({factor:'E1',collection:'external',field:'weight'},15);
});
test('QSPM relevance and AS change across linked data',async()=>{
  go('qspm');await change({qRelevant:'E1'},false,'checkbox');assert.equal(saved().qScores.E1.relevant,false);await change({qScore:'E1',index:'0'},2);assert.equal(saved().qScores.E1.as[0],2);
});
test('risk, goal, journal and initiative forms save actual records',()=>{
  const seed=createSeed();for(const [collection,item] of [['risks',seed.risks[0]],['objectives',seed.objectives[0]],['journal',seed.journal[0]],['initiatives',seed.initiatives[0]]]){go(collection==='objectives'?'scorecard':collection==='initiatives'?'execution':collection);submit('collection-form',{...item,title:'آزمون ذخیره '+collection},{collection,id:item.id});assert.ok(saved()[collection][0].title.startsWith('آزمون ذخیره'));assert.ok(html().includes('آزمون ذخیره'));}
});
test('company and financial data drive the view and latest trend',()=>{
  go('company');submit('company-form',{...createSeed().org,name:'شرکت آزمون',employees:'20'});assert.ok(html().includes('شرکت آزمون'));
  go('finance');submit('finance-form',{...createSeed().fin,revenue:3000});assert.equal(saved().trend.revenue.at(-1),3000);assert.equal(saved().fin.revenue,3000);
});
test('unsafe text is escaped, not executable HTML',()=>{
  go('journal');submit('collection-form',{...createSeed().journal[0],title:'<img src=x onerror=alert(1)>'},{collection:'journal',id:'D1'});assert.ok(html().includes('&lt;img'));assert.ok(!html().includes('<img src=x'));
});
test('investment form calculates and rejects malformed cash flows',()=>{
  go('finance');submit('investment-form',{initial:'1000',rate:'20',flows:'600,600'});assert.deepEqual(saved().investment.flows,[600,600]);assert.ok(html().includes('۸۳٫۳۳'));submit('investment-form',{initial:'1000',rate:'20',flows:'600,,600'});assert.deepEqual(saved().investment.flows,[600,600]);
});
test('stage completion and learning toggle are persistent',async()=>{
  go('journey');await action({action:'complete',index:'2'});assert.equal(saved().completed[2],true);await action({action:'learning'});assert.equal(saved().learning,false);assert.ok(!html().includes('data-help='));assert.ok(!html().includes('data-action="tour"'));
});
test('education control is prominent and explicitly shows on/off state',async()=>{
  let content=go('settings');if(!saved().learning){await change({setting:'learning'},true,'checkbox');content=html();}assert.ok(content.indexOf('class="learning-control"')<content.indexOf('ظاهر و زبان'));assert.match(content,/data-setting="learning"[^>]*checked/);assert.match(content,/آموزش: روشن/);
  await change({setting:'learning'},false,'checkbox');assert.equal(saved().learning,false);assert.match(html(),/آموزش: خاموش/);assert.match(html(),/حالت حرفه‌ای/);
  await change({setting:'learning'},true,'checkbox');assert.equal(saved().learning,true);
});
test('global search resolves ICP page and indexed specialized data',()=>{
  action({action:'search'});listeners.input({target:{id:'global-search',value:'ماتریس ICP',dataset:{}}});assert.match(nodes.get('#search-results').innerHTML,/href="#company"/);
  listeners.input({target:{id:'global-search',value:'دیرکرد وصول سفارش‌های سازمانی',dataset:{}}});assert.match(nodes.get('#search-results').innerHTML,/href="#risks"/);
  listeners.input({target:{id:'global-search',value:'BCG cash cow',dataset:{}}});assert.match(nodes.get('#search-results').innerHTML,/href="#matrices\/bcg"/);
  listeners.input({target:{id:'global-search',value:'One-page company summary',dataset:{}}});assert.match(nodes.get('#search-results').innerHTML,/href="#documents\/executive-onepage"/);
});
test('document library has bilingual records, no external-folder links, and multi-file controls',async()=>{
  let content=go('documents');assert.equal(documentSections.length,12);assert.equal(documents.length,60);
  assert.equal([...content.matchAll(/data-document-upload=/g)].length,documents.length);assert.match(content,/کتابخانه اسناد مدیریتی/);assert.match(content,/راهنمای نگارش/);assert.match(content,/سناریو و راهبردهای صلح/);
  assert.equal([...content.matchAll(/type="file" multiple/g)].length,documents.length);assert.doesNotMatch(content,/drive\.google\.com|\bDrive\b|بازکردن فایل منبع|Open source file/i);
  await change({preference:'language'},'en','select-one');content=html();assert.match(content,/Management document library/);assert.match(content,/data-document-upload=/);assert.match(content,/Add files/);assert.doesNotMatch(content,/drive\.google\.com|\bDrive\b|Open source file/i);
  await change({preference:'language'},'fa','select-one');
});
test('file attachment mock is visible for the session and never enters saved app data',async()=>{
  go('documents');await listeners.change({target:{dataset:{documentUpload:'executive-onepage'},files:[{name:'brief1.pdf',size:2048,type:'application/pdf'},{name:'forecast.xlsx',size:1024,type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}]}});
  await listeners.change({target:{dataset:{documentUpload:'executive-onepage'},files:[{name:'pitch.pptx',size:4096,type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}]}});
  assert.match(go('documents'),/brief1\.pdf/);assert.match(html(),/forecast\.xlsx/);assert.match(html(),/pitch\.pptx/);assert.match(html(),/۳ فایل انتخاب شده/);assert.equal(saved().documentAttachments,undefined);
  await action({action:'remove-document-file',docId:'executive-onepage',docFileIndex:'1'});assert.match(go('documents'),/brief1\.pdf/);assert.doesNotMatch(html(),/forecast\.xlsx/);assert.match(html(),/pitch\.pptx/);
  await action({action:'remove-document-file',docId:'executive-onepage',docFileIndex:'0'});assert.doesNotMatch(go('documents'),/brief1\.pdf/);assert.match(html(),/pitch\.pptx/);
});
test('all cached assets exist in build; font is self-hosted',async()=>{
  const sw=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');for(const [,asset] of sw.matchAll(/'(\/(?:src|assets)\/[^']+)'/g)){const path=asset.startsWith('/src/')?'..'+asset:'../public'+asset;assert.ok((await readFile(new URL(path,import.meta.url))).length>0,asset);}
  const font=await readFile(new URL('../public/assets/vazirmatn.woff2',import.meta.url));assert.equal(font.toString('ascii',0,4),'wOF2');
});
test('responsive, print, reduced motion and focus styles are present',async()=>{
  const css=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');for(const token of ['max-width:700px','max-width:920px','@media print','prefers-reduced-motion','focus-visible'])assert.ok(css.includes(token));globalThis.FormData=NativeFormData;
});
