import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('./',import.meta.url),path=n=>fileURLToPath(new URL(n,root));
const fixtures=JSON.parse(await readFile(path('manifest.json'),'utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});
const exports=[],errors=[],externalRequests=[],layoutChecks=[];
const page=await browser.newPage({viewport:{width:1920,height:1080}});
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))externalRequests.push(r.url())});
try{
for(const f of fixtures){
 await page.setViewportSize({width:f.width,height:f.height});await page.goto(new URL(f.name+'.html',root).href);
 await page.evaluate(async()=>{await Promise.all(['Inter','Chakra','Jet'].map(f=>document.fonts.load(`14px ${f}`)));await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});
 const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...document.querySelectorAll('.widget,.popover,.toolbar,.catalog-board')].filter(e=>{const b=e.getBoundingClientRect();return b.right>innerWidth+1||b.bottom>innerHeight+1||b.left<0||b.top<0}).map(e=>e.className),fonts:['Inter','Chakra','Jet'].map(f=>({family:f,loaded:document.fonts.check(`14px ${f}`)}))}));
 layoutChecks.push({fixture:f.name,...layout});
 await page.screenshot({path:path(f.name+'.png')});exports.push({file:f.name+'.png',width:f.width,height:f.height,dpr:1});
}
const hi=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2});
for(const [name,selector,out] of [['settings','.settings','settings@2x.png'],['drag','.edit-widget','widget@2x.png']]){
 await hi.goto(new URL(name+'.html',root).href);await hi.evaluate(()=>document.fonts.ready);await hi.locator(selector).first().screenshot({path:path(out)});const b=await hi.locator(selector).first().boundingBox();exports.push({file:out,width:b.width*2,height:b.height*2,dpr:2,crop:selector});
}await hi.close();
// Mathematical worst-case validation. Every text surface is protected to >=90%.
const rgb=h=>h.slice(1).match(/../g).map(v=>parseInt(v,16));
const mix=(a,b,x)=>a.map((v,i)=>v*x+b[i]*(1-x));
const lum=a=>a.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
const checks=[],raw=[];
for(const alpha of [.85,.30])for(const [bgName,bg] of [['white',[255,255,255]],['bright-warm',[255,245,220]],['busy-dark',[30,50,65]]])for(const fg of ['#F2EEE7','#C8C7C2','#A2A8AA','#F4AD82','#91CFAB']){
 const surface=mix(rgb('#1D2225'),bg,Math.max(alpha,.90));const value=ratio(rgb(fg),surface);
 checks.push({requestedOpacity:alpha,effectiveTextSurfaceOpacity:Math.max(alpha,.90),backdrop:bgName,foreground:fg,compositedRGB:surface,ratio:+value.toFixed(3),minimum:4.5,pass:value>=4.5});
 raw.push({requestedOpacity:alpha,backdrop:bgName,foreground:fg,ratio:+ratio(rgb(fg),mix(rgb('#1D2225'),bg,alpha)).toFixed(3),protected:false});
}
for(const fg of ['#E6D16F','#BAABF2','#F2AA88'])checks.push({role:'loot chip text',foreground:fg,background:'#171D20',ratio:+ratio(rgb(fg),rgb('#171D20')).toFixed(3),minimum:4.5,pass:ratio(rgb(fg),rgb('#171D20'))>=4.5});
checks.push({role:'accent button',foreground:'#241810',background:'#F4AD82',ratio:+ratio(rgb('#241810'),rgb('#F4AD82')).toFixed(3),minimum:4.5,pass:ratio(rgb('#241810'),rgb('#F4AD82'))>=4.5});
const uiChecks=[];for(const bg of ['#1D2225','#272D31'])for(const fg of ['#849095','#F4AD82'])uiChecks.push({foreground:fg,background:bg,ratio:+ratio(rgb(fg),rgb(bg)).toFixed(3),minimum:3,pass:ratio(rgb(fg),rgb(bg))>=3});
const report={scope:'Design fixtures only. No product build or native overlay test.',recommendedOpacity:.85,minimumRequestedOpacity:.30,textSurfaceFloor:.90,method:'WCAG sRGB relative luminance; alpha composition in encoded sRGB. Conservative text surface directly over pure white (ignores additional shell darkening). No blur, shadow, game dimming or stroke credit. White is component-wise brightest possible opaque sRGB pixel; busy fixture alternates white and bright bands.',checks,uiChecks,rawUnprotectedComparison:raw,minimumProtectedRatio:Math.min(...checks.map(x=>x.ratio)),exports,layoutChecks,errors,externalRequests,limitations:['Static HTML states; navigation only, not live dragging or persistence.','Windows focus, click-through, HDR, borderless games and mixed DPI need native validation.','Antialiasing and perception require implementation check; mathematical checks are not WCAG certification.']};
await writeFile(path('validation.json'),JSON.stringify(report,null,2));
const bad=layoutChecks.filter(x=>x.overflow||x.clipped.length||x.fonts.some(f=>!f.loaded));
console.log(JSON.stringify({exports:exports.length,contrastChecks:checks.length,minRatio:report.minimumProtectedRatio,bad,errors,externalRequests},null,2));
if(bad.length||errors.length||externalRequests.length||checks.some(x=>!x.pass)||uiChecks.some(x=>!x.pass))process.exitCode=1;
}finally{await browser.close()}
