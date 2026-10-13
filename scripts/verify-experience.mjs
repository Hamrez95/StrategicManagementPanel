import {help} from '../src/data.js';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.STRATEGY_PLAYWRIGHT_MODULE || 'playwright');
const url=process.env.STRATEGY_URL || 'http://localhost:4173';
const browser=await chromium.launch({headless:true,executablePath:process.env.STRATEGY_BROWSER_EXECUTABLE || undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
const routes=['overview','journey','company','environment','industry','internal','matrices','swot','qspm','finance','scenarios','execution','scorecard','risks','journal','reports','learn','settings',...['efe','ife','cpm','space','bcg','ie','ge','ansoff','grand'].map(x=>'matrices/'+x)];
const tutorials=['company','matrices/efe','matrices/ife','qspm','matrices/bcg','finance'];
const errors=[],untranslated=[];let pagesChecked=0,tourSteps=0,backChecked=false;
await mkdir('test-results',{recursive:true});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const go=async route=>{await page.evaluate(r=>location.hash=r,route);await page.waitForFunction(r=>location.hash==='#'+r && document.querySelector('#main h1'),route);await page.waitForTimeout(30);};
  const screenshot=async name=>page.screenshot({path:`test-results/${name}.png`,fullPage:true,animations:'disabled'});
  await page.goto(url);await page.waitForSelector('#main h1');
  await screenshot('overview-light-fa');
  await go('settings');await page.locator('[data-setting="learning"]').uncheck();await page.locator('[data-setting="learning"]').check();
  const baseline=await page.evaluate(()=>JSON.parse(localStorage.getItem('royesh-strategy-v1')));
  await page.locator('[data-preference="theme"]').selectOption('dark');await page.locator('[data-preference="language"]').selectOption('en');assert.equal(await page.evaluate(()=>document.activeElement.dataset.preference),'language','Preference control restores focus');
  const afterPreferences=await page.evaluate(()=>JSON.parse(localStorage.getItem('royesh-strategy-v1')));
  assert.deepEqual(afterPreferences,baseline,'Presentation preferences must not change business records');
  await go('company');await page.locator('[data-action="companyEdit"]').click();
  assert.match(await page.locator('[name="name"]').inputValue(),/Royesh/);
  await page.locator('[form="company-form"]').click();
  const afterForm=await page.evaluate(()=>JSON.parse(localStorage.getItem('royesh-strategy-v1')));
  assert.deepEqual(afterForm.org,baseline.org,'Saving an unchanged localized form must preserve canonical values');
  await go('settings');await screenshot('settings-dark-en');
  for(const language of ['en','fa']){
    if(await page.getAttribute('html','lang')!==language)await page.locator('[data-action="language"]').click();
    for(const route of [...routes,...Object.keys(help).map(k=>'learn/'+k),'learn/sources']){
      await go(route);pagesChecked++;
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Desktop overflow: ${language}/${route}`);
      assert.ok(!/NaN|undefined|\[object Object\]/.test(await page.locator('#main').innerText()),route);
      if(language==='en'){
        const remaining=await page.evaluate(()=>{const result=[];const w=document.createTreeWalker(document.querySelector('#app'),4);let n;while(n=w.nextNode()){if(/[\u0600-\u06ff]/.test(n.nodeValue)&&n.parentElement.checkVisibility())result.push(n.nodeValue.trim());}return result;});
        untranslated.push(...remaining.map(text=>({route,text})));
      }
    }
  }
  await go('settings');await page.locator('[data-preference="motion"]').selectOption('reduced');
  for(const route of tutorials){
    await go(route);await page.locator('[data-action="tour"]').click();
    while(await page.locator('#guided-tour').count()){
      tourSteps++;
      if(route==='company'&&!backChecked&&(await page.locator('.tour-step-count').innerText()).startsWith('2 /')){await page.locator('[data-tour-action="back"]').click();assert.match(await page.locator('.tour-step-count').innerText(),/^1 \/ /);await page.locator('[data-tour-action="next"]').click();backChecked=true;}
      assert.equal(await page.evaluate(()=>document.querySelector('.tour-card').contains(document.activeElement)),true,'Tour focus');
      const box=await page.locator('.tour-card').boundingBox();assert.ok(box.x>=0 && box.y>=0 && box.x+box.width<=1441 && box.y+box.height<=1001,'Tour card fits desktop');
      if(route==='matrices/efe' && await page.locator('.tour-step-count').innerText()==='2 / 5')await screenshot('tutorial-efe-dark-fa');
      const next=page.locator('[data-tour-action="next"]');if(await next.count())await next.click();else await page.locator('[data-tour-action="finish"]').click();
    }
  }
  await go('company');await page.locator('[data-action="tour"]').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#guided-tour').count(),0);assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'tour','Tour restores focus');
  await page.setViewportSize({width:390,height:844});
  for(const language of ['en','fa']){if(await page.getAttribute('html','lang')!==language)await page.locator('[data-action="language"]').click();for(const route of routes){await go(route);pagesChecked++;assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Mobile overflow: ${language}/${route}`);}}
  await go('company');await page.locator('[data-action="tour"]').click();await page.locator('[data-tour-action="next"]').click();
  const mobileBox=await page.locator('.tour-card').boundingBox();assert.ok(mobileBox.x>=0&&mobileBox.y>=0&&mobileBox.x+mobileBox.width<=390&&mobileBox.y+mobileBox.height<=844,'Mobile tutorial fits');
  await page.screenshot({path:'test-results/tutorial-icp-mobile-fa.png',animations:'disabled'});await page.keyboard.press('Escape');
  await go('overview');await screenshot('overview-mobile-dark-fa');
  assert.equal(await page.locator('#main').evaluate(el=>getComputedStyle(el).animationName),'none','Reduced motion disables page animation');
  await go('settings');await page.locator('[data-preference="language"]').selectOption('en');await page.locator('[data-setting="learning"]').uncheck();
  await go('overview');assert.equal(await page.locator('[data-help], [data-action="tour"], .nav-item[href="#learn"]').count(),0,'Learning controls hidden');
  assert.equal(await page.locator('.mini-learn').isVisible(),false,'Learning card hidden');
  await page.evaluate(()=>location.hash='learn/roa');await page.waitForFunction(()=>location.hash==='#overview');
  await go('matrices/efe');await page.locator('[data-field="weight"]').first().fill('99');await page.locator('[data-field="weight"]').first().press('Tab');
  assert.equal(await page.locator('.guide.error').first().isVisible(),true,'Essential validation remains visible in professional mode');
  await page.reload();await page.waitForSelector('#main h1');
  assert.equal(await page.getAttribute('html','lang'),'en');assert.equal(await page.getAttribute('html','dir'),'ltr');assert.equal(await page.getAttribute('html','data-theme'),'dark');assert.equal(await page.getAttribute('html','data-learning'),'false');
  await page.locator('[data-action="search"]').click();await page.locator('#global-search').fill('return on assets');assert.ok(await page.locator('.search-result').count()>0,'English search');await page.keyboard.press('Escape');
  await go('matrices/efe');await page.locator('[data-field="weight"]').first().fill(String(baseline.external[0].weight));await page.locator('[data-field="weight"]').first().press('Tab');
  const lastRating=page.locator('[data-field="rating"]').last();await lastRating.scrollIntoViewIfNeeded();const originalRating=await lastRating.inputValue();const beforeScroll=await page.evaluate(()=>scrollY);await lastRating.selectOption(originalRating==='2'?'3':'2');assert.ok(Math.abs((await page.evaluate(()=>scrollY))-beforeScroll)<2,'Editing a matrix input preserves scroll position');await page.locator('[data-field="rating"]').last().selectOption(originalRating);
  await go('overview');await screenshot('professional-mobile-dark-en');
  const offlineContext=await browser.newContext({serviceWorkers:'allow'});const offlinePage=await offlineContext.newPage();offlinePage.on('pageerror',e=>errors.push(e.message));
  await offlinePage.goto(url);await offlinePage.evaluate(()=>navigator.serviceWorker.ready);await offlinePage.reload();await offlinePage.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await offlineContext.setOffline(true);await offlinePage.reload();await offlinePage.waitForSelector('#main h1');assert.ok(await offlinePage.locator('.offline').isVisible(),'Offline refresh');await offlineContext.close();
  assert.deepEqual(errors,[],'Browser runtime errors');assert.deepEqual(untranslated,[],'English visible strings must be localized');
  const result={pagesChecked,tourSteps,errors,untranslated,offlineRefresh:true,persistence:true,canonicalRecordsPreserved:true};
  await writeFile('test-results/experience.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} finally {await browser.close();}
