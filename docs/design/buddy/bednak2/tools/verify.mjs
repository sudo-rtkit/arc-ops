// Artifact-only offline browser verification, no app or server.
import {chromium} from '@playwright/test';
import {PNG} from 'pngjs';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),path=p=>fileURLToPath(new URL(p,root));
const browser=await chromium.launch({channel:'msedge',headless:true});
const report={levelPixelMatches:0,states:0,expressions:0,wardrobeSelections:0,transforms:0,errors:[],remoteRequests:[]};
try{
 const page=await browser.newPage({viewport:{width:1200,height:1000}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.remoteRequests.push(r.url())});
 await page.goto(new URL('preview.html',root).href);await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('snímek'));
 await page.locator('#pause').click();await page.locator('#reduced').uncheck();
 for(const variant of ['corner','detail']){
  await page.locator('#variant').selectOption(variant);await page.waitForFunction(v=>document.querySelector('#status').textContent.includes(v==='corner'?'96 px':'128 px'),variant);
  for(let level=0;level<=75;level++){
   await page.locator('#level').fill(String(level));await page.waitForFunction(l=>document.querySelector('#status').textContent.includes(`level ${l} ·`),level);
   const png=await page.locator('#sprite').evaluate(c=>c.toDataURL().split(',')[1]);const actual=PNG.sync.read(Buffer.from(png,'base64')),expected=PNG.sync.read(await readFile(path(`${variant}/levels/${String(level).padStart(2,'0')}.png`)));
   assert.equal(actual.width,expected.width);assert.deepEqual(actual.data,expected.data,`${variant}/${level}`);report.levelPixelMatches++;
  }
  const manifest=JSON.parse(await readFile(path(variant==='corner'?'ops-layers.json':'ops-layers-detail.json'),'utf8'));
  for(const state of Object.keys(manifest.states)){await page.locator('#state').selectOption(state);await page.waitForFunction(label=>document.querySelector('#status').textContent.includes(label),manifest.states[state].label);report.states++}
  for(let i=0;i<8;i++){await page.locator('#expression').selectOption(String(i));report.expressions++}
  await page.locator('#expression').selectOption('');await page.locator('#state').selectOption('idle');
  for(const p of manifest.parts){await page.locator(`[data-slot="${p.slot}"]`).selectOption(p.id);report.wardrobeSelections++}
  await page.locator('#level').fill('0');assert.equal(await page.locator('[data-slot="antenna"] option:disabled').count(),0,'collection retained');
  await page.locator('#scale').selectOption('2');await page.waitForFunction(n=>document.querySelector('#sprite').getBoundingClientRect().width===n*2,manifest.frameSize.width);assert.equal(await page.locator('#sprite').evaluate(c=>c.getBoundingClientRect().width),manifest.frameSize.width*2);
  await page.locator('#scale').selectOption('1');await page.locator('#reduced').check();
  for(const level of [0,15,30,45]){await page.locator('#level').fill(String(level));await page.locator('#transform').click();await page.waitForFunction(l=>document.querySelector('#level').value===String(l),level+15);report.transforms++}
  await page.locator('#reduced').uncheck();await page.locator('#level').fill('60');await page.locator('#bg').selectOption('busy');
  await page.screenshot({path:path(`tools/preview-${variant}.png`),fullPage:true});
 }
 for(const mode of ['factual','friendly','cheeky']){await page.locator('#personality').selectOption(mode);assert.ok((await page.locator('#bubble').innerText()).length>20)}
 await page.locator('#say').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('2/24'));
 for(const bg of ['darkbusy','busy','light','check']){await page.locator('#bg').selectOption(bg);assert.equal(await page.locator('#stage').getAttribute('class'),bg)}
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.remoteRequests,[]);
 report.result='PASS';await writeFile(path('tools/browser-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close()}
