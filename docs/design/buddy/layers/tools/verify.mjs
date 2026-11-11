// Offline HTML/artifact validation. No server and no application code.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=new URL('../',import.meta.url),path=n=>fileURLToPath(new URL(n,root));
await mkdir(path('tools/browser-proof'),{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1200,height:1100}}),errors=[],remote=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url())});
 await page.goto(new URL('preview.html',root).href);await page.waitForFunction(()=>window.opsPreview?.status.ready);
 const manifest=JSON.parse(await readFile(path('ops-layers.json'),'utf8'));
 assert.deepEqual(await page.evaluate(()=>opsPreview.data),manifest);
 await page.locator('#pause').click();
 for(let level=0;level<76;level++){
  await page.locator('#level').fill(String(level));
  await page.locator('#dark').screenshot({path:path(`tools/browser-proof/level-${String(level).padStart(2,'0')}.png`)});
 }
 await page.locator('#level').fill('0');
 assert.equal(await page.locator('#part-antenna option').count(),6,'collection survives lower level');
 const variants=[];
 await page.locator('#all').check();
 for(const level of [0,15,30,45,60]){
  await page.locator('#level').fill(String(level));
  for(const p of manifest.parts){await page.locator('#part-'+p.slot).selectOption(p.id);variants.push([level,p.id])}
  for(const state of Object.keys(manifest.states)){
   await page.locator('#state').selectOption(state);
   assert.equal((await page.evaluate(()=>opsPreview.status)).state,state);
  }
 }
 await page.locator('#state').selectOption('idle');await page.locator('#level').fill('60');await page.locator('#auto').click();
 const equipped=(await page.locator('#dark').screenshot()).toString('base64');
 for(const slot of Object.keys(manifest.slots))await page.locator('#visible-'+slot).uncheck();
 assert.notEqual((await page.locator('#dark').screenshot()).toString('base64'),equipped);
 for(const slot of Object.keys(manifest.slots))await page.locator('#visible-'+slot).check();
 await page.locator('#scale').selectOption('1');assert.equal(await page.locator('#dark').evaluate(c=>c.getBoundingClientRect().width),64);
 await page.locator('#scale').selectOption('2');assert.equal(await page.locator('#dark').evaluate(c=>c.getBoundingClientRect().width),128);
 await page.locator('#pause').click();
 const transitions=[];
 for(const level of [0,15,30,45]){
  await page.locator('#level').fill(String(level));await page.locator('#transform').click();
  assert.notEqual((await page.evaluate(()=>opsPreview.status)).transition,null);
  await page.waitForFunction(target=>opsPreview.status.level===target&&opsPreview.status.transition===null,level+15);
  transitions.push([level,level+15]);
 }
 assert.ok(await page.locator('#transform').isDisabled());
 await page.locator('#sparkle').click();assert.notEqual((await page.evaluate(()=>opsPreview.status)).sparkle,null);
 await page.waitForFunction(()=>opsPreview.status.sparkle===null);
 for(const state of ['done','unsure','alert']){
  await page.locator('#state').selectOption(state);await page.waitForFunction(()=>opsPreview.status.state==='idle');
 }
 await page.locator('#state').selectOption('scanning');const f=(await page.evaluate(()=>opsPreview.status)).frame;
 await page.waitForFunction(f=>opsPreview.status.frame!==f,f);
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>opsPreview.status.frame===0);const frozen=(await page.evaluate(()=>opsPreview.status)).frame;
 await page.waitForTimeout(250);assert.equal((await page.evaluate(()=>opsPreview.status)).frame,frozen);
 await page.locator('#level').fill('0');await page.locator('#transform').click();assert.equal((await page.evaluate(()=>opsPreview.status)).level,15);
 await page.locator('#state').selectOption('idle');await page.locator('#level').fill('60');
 await page.screenshot({path:path('composite/preview.png'),fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
 const report={result:'PASS',offlineFileURL:true,manifestMatchesJSON:true,canvasReferenceScreenshots:76,wardrobeSelections:variants.length,formsAndStates:35,transitions,scalePixels:[64,128],collectionPersistsWithinSession:true,toggles:true,oneShotReturnToIdle:true,sparkleCompletes:true,reducedMotion:true,errors,remote};
 await writeFile(path('tools/browser-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close()}

