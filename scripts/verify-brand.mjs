import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createSeed} from '../src/data.js';
const browser=await chromium.launch({headless:true,executablePath:process.env.STRATEGY_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({serviceWorkers:'block'});
 const old=createSeed();old.org.name='رویش';old.fin.revenue=12345;
 await page.addInitScript(data=>{if(!localStorage.getItem('royesh-strategy-v1'))localStorage.setItem('royesh-strategy-v1',JSON.stringify(data));},old);
 await page.goto((process.env.STRATEGY_URL||'http://localhost:4173/prototype/')+'/#settings');await page.waitForSelector('#main h1');
 assert.equal(await page.locator('.brand strong').innerText(),'استراتینو');
 await page.locator('[data-preference="language"]').selectOption('en');assert.equal(await page.locator('.brand strong').innerText(),'Stratino');
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export"]').click()]);assert.equal(download.suggestedFilename(),'stratino-strategy-backup.json');
 await page.reload();await page.waitForSelector('#main h1');
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('royesh-strategy-v1'))),old);
 console.log('PASS: product identity and backup name changed; legacy project records survive language change and refresh unchanged');
}finally{await browser.close();}
