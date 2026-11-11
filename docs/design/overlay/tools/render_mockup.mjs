// Offline design exports only. No app server, app storage, or source mutations.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const path = name => fileURLToPath(new URL(name, root));
await mkdir(path('states'), { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'cs-CZ' });
const page = await context.newPage();
const errors = [], remoteRequests = [], exports = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', req => { if (/^https?:/.test(req.url())) remoteRequests.push(req.url()); });
async function open(query) {
  await page.goto(new URL('overlay.html?' + query + '&freeze=1', root).href);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    const paths = ['assets/scene.svg', '../buddy/final/idle.png', '../buddy/final/done.png', '../buddy/final/unsure.png', '../buddy/final/scanning.png'];
    await Promise.all(paths.map(src => { const im = new Image(); im.src = src; return im.decode(); }));
  });
}
async function capture(name, query) {
  await open(query);
  const layout = await page.evaluate(() => {
    const c = document.querySelector('#content'), o = document.querySelector('#overlay');
    const approve = document.querySelector('#approve');
    const rect = el => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
    return {panel:rect(o), content:rect(c), scrollHeight:c.scrollHeight, clientHeight:c.clientHeight,
      horizontalOverflow:c.scrollWidth>c.clientWidth, approve:approve?rect(approve):null,
      fonts:['Inter','Chakra Petch','JetBrains Mono'].map(f => ({family:f, loaded:document.fonts.check(`14px "${f}"`)})),
      opacity:getComputedStyle(document.querySelector('.glass')).backgroundColor,
      rarity:Object.fromEntries(['common','uncommon','rare','epic','legendary'].map(r=>[r,getComputedStyle(document.documentElement).getPropertyValue('--rarity-'+r).trim()]))};
  });
  assert.equal(layout.panel.width,1100); assert.equal(layout.panel.height,760);
  assert.equal(layout.horizontalOverflow,false,name+' horizontal overflow');
  assert.equal(layout.scrollHeight,layout.clientHeight,name+' content below fold');
  assert.deepEqual(layout.rarity,{common:'#BEB7AF',uncommon:'#20B850',rare:'#00A8F0',epic:'#C83098',legendary:'#F8C000'});
  if(layout.approve) assert.ok(layout.approve.bottom<=layout.content.bottom-8,name+' approval below fold');
  assert.ok(layout.fonts.every(f=>f.loaded),'local fonts');
  await page.mouse.move(1850,1000);
  await page.screenshot({ path:path(name), animations:'disabled' });
  exports.push({file:name,query,width:1920,height:1080,layout});
}
try {
  for(const tab of ['overview','quests','shopping','capture']) await capture(tab+'.png','tab='+tab);
  for(const opacity of [70,90,100]) await capture(`states/opacity-${opacity}.png`,`tab=overview&opacity=${opacity}`);
  await capture('states/focus.png','tab=quests&focus=1');
  await capture('states/hover.png','tab=capture&hover=1');
  await capture('states/empty.png','tab=capture&mode=empty');
  await capture('states/error.png','tab=capture&mode=error');

  // Exercise the small mockup's controls, without invoking any app services.
  await open('tab=overview');
  await page.getByRole('tab',{name:/Úkoly/}).click();
  assert.equal(await page.getByRole('heading',{name:'Sledované operace'}).count(),1);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('heading',{name:'Co ještě doplnit'}).count(),1);
  const focusStyle=await page.getByRole('tab',{name:/Nákupy/}).evaluate(el=>({width:getComputedStyle(el).outlineWidth,style:getComputedStyle(el).outlineStyle}));
  assert.deepEqual(focusStyle,{width:'2px',style:'solid'});
  await page.getByRole('tab',{name:/Ze snímku/}).click();
  await page.locator('#approve').hover();
  await expect(page.locator('#approve')).toHaveCSS('background-color','rgb(255, 198, 159)');
  assert.equal(await page.locator('.approve:checked').count(),3);
  assert.equal(await page.locator('#uncertainCheck').isDisabled(),true);
  await page.locator('#resolve').click();
  assert.equal(await page.locator('.approve:checked').count(),4);
  await page.locator('.edit').fill('2');
  assert.equal(await page.locator('#uncertainCheck').isDisabled(),true);
  assert.equal(await page.locator('.approve:checked').count(),3);
  await page.locator('#approve').click();
  assert.match(await page.locator('#toast').textContent(),/Žádná data se neukládají/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#overlay').isVisible(),false);
  await page.locator('#reopen').click();
  assert.equal(await page.locator('#overlay').isVisible(),true);
  await page.locator('.ops').click();
  assert.equal(await page.locator('#overlay').isVisible(),false);
  assert.equal(remoteRequests.length,0,'offline requests');
  assert.equal(errors.length,0,'page errors');
  await writeFile(path('tools/render-validation.json'),JSON.stringify({status:'OK',errors,remoteRequests,exports,interactions:'tabs, arrow navigation, real focus ring, real hover colour, uncertain correction, explicit confirmation, Esc, Ops, reopening'},null,2)+'\n');
  console.log(JSON.stringify({status:'OK',exports:exports.map(e=>({file:e.file,contentHeight:e.layout.clientHeight,scrollHeight:e.layout.scrollHeight})),errors,remoteRequests},null,2));
} finally { await browser.close(); }
