import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url),path=n=>fileURLToPath(new URL(n,root));
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:420,height:720},deviceScaleFactor:1});
const errors=[],network=[],results=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url())});
async function open(query=''){await page.goto(new URL('compact.html?export&'+query,root).href);await page.evaluate(()=>document.fonts.ready)}
try{
 for(const [name,query,height]of [['compact-cs.png','',720],['compact-en.png','lang=en',720],['compact-empty.png','empty',720],['compact-short.png','short',520]]){
  await page.setViewportSize({width:420,height});await open(query);
  const layout=await page.evaluate(()=>{const w=document.querySelector('.window'),c=document.querySelector('.content');return {width:w.offsetWidth,height:w.offsetHeight,overflow:c.scrollHeight>c.clientHeight,horizontal:document.documentElement.scrollWidth>420,fonts:['Chakra','Inter','Jet'].map(f=>document.fonts.check(`13px ${f}`)),footer:document.querySelector('.footer').getBoundingClientRect().bottom,scrollHeight:c.scrollHeight,clientHeight:c.clientHeight}});
  assert.equal(layout.width,420);assert.equal(layout.height,height);assert.equal(layout.horizontal,false);assert.equal(layout.overflow,false,JSON.stringify(layout));assert.ok(layout.fonts.every(Boolean));assert.ok(layout.footer<=height);
  await page.screenshot({path:path(name)});results.push({file:name,...layout});
 }
 await page.setViewportSize({width:1480,height:850});await open('transition');assert.equal(page.frames().length,3);for(const f of page.frames())await f.evaluate(()=>document.fonts.ready);await page.locator('.transition-board').screenshot({path:path('compact-to-full.png')});
 await page.setViewportSize({width:740,height:1000});await page.goto(new URL('compact.html',root).href);
 await page.locator('#pin').click();assert.equal(await page.locator('#pin').getAttribute('aria-pressed'),'true');
 await page.locator('#quests summary').click();assert.equal(await page.locator('#quests').getAttribute('open'),null);
 await page.locator('#expand').click();assert.ok(await page.locator('.window.full').count());await page.locator('#collapseFull').click();assert.equal(await page.locator('#quests').getAttribute('open'),null);
 await page.keyboard.press('Control+Shift+M');assert.ok(await page.locator('.window.full').count());await page.keyboard.press('Escape');assert.equal(await page.locator('.window.full').count(),0);
 await page.locator('#capture').click();assert.match(await page.locator('#toast').innerText(),/14/);await page.locator('#toastClose').click();assert.ok(await page.locator('#toast.hidden').count());
 await page.locator('#raid').click();assert.match(await page.locator('.full-body h1').innerText(),/Deník/);await page.locator('#collapseFull').click();await page.locator('#stash').click();assert.match(await page.locator('.full-body h1').innerText(),/Zásoba/);await page.locator('#collapseFull').click();
 await page.locator('#emptyToggle').check();assert.equal(await page.locator('.empty-state .primary').count(),1);await page.locator('#setup').click();assert.match(await page.locator('.full-body h1').innerText(),/Profil/);await page.locator('#collapseFull').click();
 await page.locator('#enToggle').check();assert.equal(await page.locator('html').getAttribute('lang'),'en');await page.locator('#shortToggle').check();
 await page.locator('#close').click();assert.ok(await page.locator('.dismissed').count());await page.locator('#restore').click();assert.equal(await page.locator('.dismissed').count(),0);
 await page.locator('#minimise').click();assert.ok(await page.locator('.minimised').count());await page.locator('#minimise').click();
 // All combinations of language, size and empty state must fit without nested scroll.
 for(const lang of ['cs','en'])for(const empty of [false,true])for(const short of [false,true]){await page.setViewportSize({width:420,height:short?520:720});await open(`lang=${lang}${empty?'&empty':''}${short?'&short':''}`);assert.equal(await page.locator('.content').evaluate(e=>e.scrollHeight>e.clientHeight),false,`${lang}/${empty}/${short}`)}
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
 await writeFile(path('validation.json'),JSON.stringify({exports:results,checks:'pin, disclosures, expand/collapse preserving sections, keyboard, capture toast, dismiss toast, raid, stash, setup, locale, short, close, restore, minimise, 8 state combinations',errors,network},null,2));
 console.log(JSON.stringify(results,null,2));
}finally{await browser.close()}
