import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';

// Synthetic UI contract fixture. PostgreSQL authorization/calculation tests live in test_scorecards.py.
const base = process.env.STRATINO_UI_URL || 'http://127.0.0.1:5193';
const folder = 'test-results/scorecards';
await mkdir(folder, {recursive: true});
const id = '00000000-0000-4000-8000-000000000001';
const goalId = '00000000-0000-4000-8000-000000000002';
const actionId = '00000000-0000-4000-8000-000000000003';
const decisionId = '00000000-0000-4000-8000-000000000004';
const now = '2026-10-29T09:00:00Z';
let cards = [], conflictNext = false, checks = 0;
let preferences = {theme:'light', language:'fa', motion:'auto', show_tutorial:false, device_sync_pending:false, updated_at:now};
let debugPage;
const browser = await chromium.launch({channel: process.platform === 'win32' ? 'chrome' : undefined});
try {
  const context = await browser.newContext({viewport:{width:1280,height:900}, serviceWorkers:'block'});
  const unexpected = [];
  await context.route(/\/api\/v1\//, async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    let body;
    if (path === '/api/v1/session/') body = {authenticated:true,user:{id,name:'مدیر آزمایشی',is_staff:false,profile_required:false},workspaces:[{id,name:'راهکار آزمایشی',role:'owner'}]};
    else if (path === '/api/v1/csrf/') return route.fulfill({json:{},headers:{'Set-Cookie':'csrftoken=synthetic-bsc; Path=/; SameSite=Lax'}});
    else if (path === '/api/v1/account/preferences/') {
      if(req.method() !== 'GET') preferences = {...preferences, ...req.postDataJSON()};
      body = preferences;
    } else if (path.endsWith('/execution/scorecards/')) {
      if(req.method()==='GET') body = {workspace_id:id,can_edit:true,cards};
      else {body = {...req.postDataJSON(),revision:1,reviews:[],created_at:now,updated_at:now};cards.push(body);}
    } else if (/\/scorecards\/.+\/observations\/$/.test(path)) {
      const input=req.postDataJSON();body=cards[0];
      const indicator=body.objectives.flatMap(o=>o.indicators).find(i=>i.id===input.indicator_id);
      indicator.observations ??= [];
      indicator.observations.push({id:crypto.randomUUID(),...input,definition_snapshot:{...indicator, observations:undefined},created_at:now});
      indicator.assessment={status:'off_target',actual:input.value,observed_on:input.observed_on,actual_unit:indicator.unit,definition_changed:false,difference:'12',baseline_progress_percent:'50',trend_delta:null,next_due:'2026-03-03',needs_review:true,missing:[]};
      body.revision++;
    } else if (/\/scorecards\/.+\/$/.test(path) && req.method()==='PATCH') {
      if(conflictNext) {conflictNext=false;return route.fulfill({status:409,json:{code:'revision_conflict',message:'نسخهٔ کارت تغییر کرده.',fields:{}}});}
      const input=req.postDataJSON(); assert.equal(input.created_at,undefined);assert.equal(input.updated_at,undefined);assert.equal(input.reviews,undefined);
      body={...input,revision:cards[0].revision+1,reviews:cards[0].reviews,created_at:now,updated_at:now};cards=[body];
    } else if (path.endsWith('/execution/')) body={workspace_id:id,role:'owner',today:'2026-10-29',horizon_end:'2027-01-29',history_limit:100,events:[],sources:[],members:[{id,name:'مدیر آزمایشی',role:'owner'}],goals:[{id:goalId,title:'هدف موجود',description:'',due_on:null,status:'active',revision:1,action_count:1,created_at:now,updated_at:now}],decisions:[{id:decisionId,title:'تصمیم موجود',rationale:'دلیل',assumptions:'فرض',review_trigger:'مرور دوره',status:'approved',revision:1,action_count:1,source:null,source_snapshot:{},created_at:now,updated_at:now}],actions:[{id:actionId,title:'اقدام موجود',description:'',due_on:'2026-12-01',status:'planned',revision:1,owner_id:id,owner_name:'مدیر آزمایشی',decision_id:decisionId,decision_title:'تصمیم موجود',goal_id:goalId,goal_title:'هدف موجود',overdue:false,created_at:now,updated_at:now}]};
    else {unexpected.push(path);return route.fulfill({status:404,json:{code:'fixture_missing'}});}
    await route.fulfill({status:req.method()==='POST'?201:200,json:body});
  });
  const page = await context.newPage();debugPage=page;
  const errors=[];page.on('pageerror', e=>errors.push(e.message));
  await page.goto(base+'/app/scorecards?from=C07-ST05-L03');
  await page.getByRole('link',{name:'راهکار آزمایشی',exact:true}).click();
  assert.match(page.url(), /tools\/scorecard\?from=C07-ST05-L03/);checks++;
  await page.getByRole('button',{name:'کارت تازه',exact:true}).click();
  await page.getByLabel('عنوان کارت',{exact:true}).fill('کارت راهبرد پشتیبانی');
  await page.getByLabel('دامنه؛ برای کدوم بخش کسب‌وکار؟').fill('واحد خدمات مشتری');
  await page.getByLabel('شروع دوره',{exact:true}).fill('2026-01-01');
  await page.getByLabel('پایان دوره',{exact:true}).fill('2026-12-31');
  await page.getByLabel('جهت‌گیری استراتژیک؛ دنبال چه تغییری هستی؟').fill('حل سریع و قابل اعتماد درخواست‌های مشتری');
  await page.getByRole('button',{name:'ذخیرهٔ کارت',exact:true}).click();
  await page.getByRole('status').filter({hasText:'ذخیره شد.'}).waitFor();checks++;
  await page.getByRole('button',{name:/هدف‌ها و شاخص‌ها/}).click();
  const process = page.locator('.bsc-perspective--process').first();
  await process.getByRole('button',{name:'افزودن هدف',exact:true}).click();
  await process.getByLabel('هدف استراتژیک',{exact:true}).fill('کاهش زمان حل درخواست');
  await process.getByText('پیوند با هدف و اقدام‌های موجود',{exact:true}).click();
  await process.getByLabel('هدف موجود',{exact:true}).selectOption(goalId);
  await process.getByLabel('اقدام موجود',{exact:true}).check();
  await process.getByRole('button',{name:'افزودن شاخص',exact:true}).click();
  await process.getByLabel('نام شاخص',{exact:true}).fill('میانهٔ زمان حل');
  await process.getByLabel('واحد سنجش',{exact:true}).fill('ساعت');
  await process.getByLabel('تعریف عملیاتی؛ دقیقاً چه چیزی سنجیده می‌شه؟').fill('میانهٔ زمان از ثبت تا حل درخواست‌های بسته‌شده در دوره');
  await process.getByLabel('جهت مطلوب',{exact:true}).selectOption('decrease');
  await process.getByLabel('مقدار هدف',{exact:true}).fill('۲۴');
  await process.getByLabel('مقدار خط پایه؛ خالی یعنی نامشخص').fill('۴۸');
  await process.getByLabel('تاریخ خط پایه',{exact:true}).fill('2026-01-01');
  await process.getByLabel('موعد تحقق',{exact:true}).fill('2026-12-01');
  await process.getByLabel('فاصلهٔ سنجش به روز',{exact:true}).fill('۳۰');
  await process.getByLabel('منبع داده',{exact:true}).fill('سامانهٔ درخواست‌ها');
  await process.getByLabel('مسئول شاخص',{exact:true}).selectOption(id);
  const customer=page.locator('.bsc-perspective--customer').first();
  await customer.getByRole('button',{name:'افزودن هدف',exact:true}).click();
  await customer.getByLabel('هدف استراتژیک',{exact:true}).fill('اعتماد مشتری');
  await page.getByRole('button',{name:'ذخیرهٔ کارت',exact:true}).click();
  await page.getByRole('status').filter({hasText:'ذخیره شد.'}).waitFor();
  assert.equal(cards[0].objectives[0].indicators[0].target,'24');
  assert.deepEqual(cards[0].objectives[0].action_ids,[actionId]);checks+=2;
  await page.reload();
  await page.getByRole('button',{name:/نقشهٔ استراتژی/}).click();
  await page.getByRole('button',{name:'افزودن فرضیهٔ رابطه',exact:true}).click();
  await page.getByLabel('چرا انتظار این رابطه رو داری؟').fill('حل دقیق‌تر ممکنه اعتماد رو تقویت کنه');
  await page.getByLabel('چطور بررسی‌اش می‌کنی؟').fill('زمان حل و بازخورد مشتری رو در دو دوره مقایسه می‌کنیم');
  await page.getByRole('button',{name:'ذخیرهٔ کارت',exact:true}).click();
  await page.getByRole('status').filter({hasText:'ذخیره شد.'}).waitFor();checks++;
  await page.getByRole('button',{name:/عملکرد و مرور/}).click();
  await page.getByLabel('شاخص',{exact:true}).selectOption(cards[0].objectives[0].indicators[0].id);
  await page.getByLabel('تاریخ مشاهده',{exact:true}).fill('2026-02-01');
  await page.getByLabel('مقدار واقعی؛ خالی یعنی نامشخص').fill('۳۶');
  await page.getByLabel('شواهد یا دلیل نامشخص‌بودن').fill('نمونهٔ آزمایشی درخواست‌های بسته‌شده');
  await page.getByRole('button',{name:'ثبت در تاریخچه',exact:true}).click();
  await page.locator('.bsc-reading').getByText('۳۶',{exact:true}).waitFor();checks++;
  await page.getByRole('button',{name:/جهت و دوره/}).click();
  await page.getByLabel('عنوان کارت',{exact:true}).fill('نوشتهٔ حفظ‌شده پس از تعارض');
  conflictNext=true;
  await page.getByRole('button',{name:'ذخیرهٔ کارت',exact:true}).click();
  await page.locator('.bsc-conflict').waitFor();
  assert.equal(await page.getByLabel('عنوان کارت',{exact:true}).inputValue(),'نوشتهٔ حفظ‌شده پس از تعارض');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'دریافت نوشته‌های من',exact:true}).click();
  assert.equal((await download).suggestedFilename(),'scorecard-draft.json');checks+=2;
  page.once('dialog', d=>d.accept());await page.getByRole('button',{name:'بازکردن نسخهٔ تازه',exact:true}).click();
  assert.equal(await page.getByLabel('عنوان کارت',{exact:true}).inputValue(),'کارت راهبرد پشتیبانی');
  const audits=[];
  for(const language of ['fa','en']) {
    if(language==='en') await page.getByRole('button',{name:'تغییر زبان به انگلیسی'}).click();
    for(const theme of ['light','dark']) {
      if(await page.getAttribute('html','data-theme')!==theme) await page.getByRole('switch',{name:language==='en'?'Dark theme':'تم تیره',exact:true}).click();
      await page.getByRole('button',{name:language==='en'?/Objectives and measures/:/هدف‌ها و شاخص‌ها/}).click();
      await page.locator('.bsc-indicator > summary').click();
      for(const width of [360,768,1280,1440]) {
        await page.setViewportSize({width,height:900});
        if(!(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))) {await page.screenshot({path:`${folder}/overflow.png`,fullPage:true});console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1||e.getBoundingClientRect().left< -1).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,text:e.textContent.slice(0,90)})).slice(-20)));throw new Error(`${language}/${theme}/${width} page overflow`);}
        await page.screenshot({path:`${folder}/editor-${language}-${theme}-${width}.png`,fullPage:true,animations:'disabled'});checks++;
      }
      const audit=await new AxeBuilder({page}).include('.bsc-page').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
      audits.push({language,theme,violations:audit.violations});
      assert.equal(audit.violations.length,0,JSON.stringify(audit.violations));
      // Close the retained details before the next theme iteration.
      await page.locator('.bsc-indicator > summary').click();
    }
    await page.getByRole('button',{name:language==='en'?'Report and PDF':'گزارش و PDF',exact:true}).click();
    await page.locator('.bsc-page .bsc-report').waitFor();await page.evaluate(()=>document.fonts.ready);
    await page.pdf({path:`${folder}/scorecard-${language}.pdf`,format:'A4',printBackground:true});
    assert.match(await page.locator('.bsc-page .bsc-report').innerText(),/۳۶|36/);checks++;
    await page.getByRole('button',{name:language==='en'?'Back to scorecard':'بازگشت به کارت',exact:true}).click();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  await writeFile(`${folder}/evidence.json`,JSON.stringify({checks,audits,errors,unexpected},null,2));
  console.log(`PASS: ${checks} BSC workflow/layout checks, 4 axe audits, FA/EN PDF, conflict preservation. Synthetic HTTP only; database tests are separate.`);
  await context.close();
} catch(error) {if(debugPage){console.log(await debugPage.locator('.bsc-page').innerText().catch(()=>debugPage.url()));await debugPage.screenshot({path:folder+'/failure.png',fullPage:true});}throw error;} finally {await browser.close();}
