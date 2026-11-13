// Offline canvas parity for the scan deliverable only; no app or web server.
import {chromium} from '@playwright/test';
import {PNG} from 'pngjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),names=['scan','scan-ok','scan-unsure'];
const browser=await chromium.launch({channel:'msedge',headless:true});
const report={result:'PASS',framePixelMatches:0,returnsToIdle:0,errors:[],remoteRequests:[]};
const cache=new Map();async function png(path){if(!cache.has(path))cache.set(path,PNG.sync.read(await readFile(new URL(path,root))));return cache.get(path)}
function paste(dst,src,sx,sy,w,h,dx,dy){for(let y=0;y<h;y++)for(let x=0;x<w;x++){let tx=dx+x,ty=dy+y;if(tx<0||ty<0||tx>=dst.width||ty>=dst.height)continue;let a=((sy+y)*src.width+sx+x)*4,b=(ty*dst.width+tx)*4;if(src.data[a+3])src.data.copy(dst.data,b,a,a+4)}}
try{
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.remoteRequests.push(r.url())});
 await page.goto(new URL('preview.html',root).href);await page.waitForFunction(()=>ready);
 await page.evaluate(()=>{paused=true;document.querySelector('#reduced').checked=false});
 for(const variant of ['corner','detail']){
  await page.selectOption('#variant',variant);await page.waitForFunction(v=>ready&&m.variant===v,variant);
  const m=JSON.parse(await readFile(new URL(variant==='corner'?'ops-layers.json':'ops-layers-detail.json',root),'utf8')),n=m.frameSize.width;
  for(const f of m.forms){
   const lv=f.levels[1];await page.locator('#level').fill(String(lv));
   for(const state of names){
    await page.selectOption('#state',state);const s=f.states[state];let start=0;
    for(let i=0;i<s.frameCount;i++){
     await page.evaluate(async t=>{elapsed=t;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))},start+1);await page.waitForFunction(i=>document.querySelector('#status').textContent.includes(` ${i+1}/`),i);
     const actual=PNG.sync.read(Buffer.from(await page.locator('#sprite').evaluate(c=>c.toDataURL().split(',')[1]),'base64')),expected=new PNG({width:n,height:n});expected.data.fill(0);
     const fr=s.frames[i],outfit=m.unlocks[lv].defaultOutfit;
     for(const slot of Object.keys(fr.zOrder).sort((a,b)=>fr.zOrder[a]-fr.zOrder[b])){
      if(slot==='body'){paste(expected,await png(s.file),i*n,0,n,n,0,0);continue}
      const p=m.parts.find(p=>p.id===outfit[slot]);if(!p)continue;
      const im=await png(p.file),[x,y]=fr.anchors[slot],[ox,oy]=p.offset;
      if(p.frameSource==='playerLevel'){let {width:w,height:h}=p.frameSize;paste(expected,im,lv*w,0,w,h,x+ox,y+oy)}else paste(expected,im,0,0,im.width,im.height,x+ox,y+oy);
     }
     assert.ok(actual.data.equals(expected.data),`${variant}/${f.id}/${state}/${i}: canvas differs`);report.framePixelMatches++;start+=s.durationsMs[i];
    }
    await page.evaluate(async t=>{elapsed=t;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))},start+1);await page.waitForFunction(()=>document.querySelector('#state').value==='idle');report.returnsToIdle++;
   }
  }
  await page.selectOption('#scale','4');await page.waitForFunction(n=>document.querySelector('#sprite').getBoundingClientRect().width===n*4,n);
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.remoteRequests,[]);
 await writeFile(new URL('tools/scan-browser-validation.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close()}
