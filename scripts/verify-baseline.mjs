import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:process.env.STRATEGY_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
const url=process.env.STRATEGY_URL||'http://localhost:4173';
const out=process.env.STRATINO_SCREENSHOT_DIR||'test-results/baseline';
await mkdir(out,{recursive:true});
const observations=[];
try{
 const page=await browser.newPage({serviceWorkers:'block'});
 for(const [width,language,theme] of [[1440,'fa','light'],[360,'fa','dark'],[768,'en','dark'],[1280,'en','light']]){
  await page.setViewportSize({width,height:960});await page.goto(url+'/#settings');await page.waitForSelector('#main h1');
  await page.locator('[data-preference="language"]').selectOption(language);await page.locator('[data-preference="theme"]').selectOption(theme);
  await page.evaluate(()=>location.hash='overview');await page.waitForSelector('.strategy-banner');
  assert.equal(await page.getAttribute('html','lang'),language);assert.equal(await page.getAttribute('html','data-theme'),theme);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(overflow,false,`${width}/${language}/${theme} horizontal overflow`);
  await page.screenshot({path:`${out}/overview-${width}-${language}-${theme}.png`,fullPage:true,animations:'disabled'});
  observations.push({width,language,theme,overflow});
 }
 await writeFile(`${out}/checks.json`,JSON.stringify(observations,null,2)+'\n');console.log(JSON.stringify(observations));
}finally{await browser.close();}
