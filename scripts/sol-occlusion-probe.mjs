// Representative front-wall/door bullet occlusion; detached view fixtures, no saved-world mutation.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
const out=resolve(process.env.BINCOV_OCCLUSION_OUT || 'test-results/sol-round3/occlusion');await mkdir(out,{recursive:true});
const input=resolve(process.env.BINCOV_OCCLUSION_HTML || 'dist/index.html');
const report={at:new Date().toISOString(),node:process.version,input,method:'Detached view-only bullets behind real front wall/closed door. Native worldRT RGB diff restricted to opaque pixels of each actual faded wall texture; every case also removes that occluder for a positive bullet-visibility control. Roof/ceiling removed, fixed camera/time, no simulation/save claim.',errors:[],requests:[]};
const browser=await chromium.launch(browserOptions);report.browser=browser.version();
try{
 const ctx=await browser.newContext({viewport:{width:1280,height:720},offline:true}),p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));ctx.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url());});
 await p.goto(pathToFileURL(input).href+'?test=1&sample=village');await p.locator('[data-action="enter"]').click();await p.locator('#seed').fill('42');await p.locator('[data-action="deploy"]').click();await p.waitForFunction(()=>!!window.__bincovSample?.host?.lastBatch);
 await p.evaluate(()=>{const d=window.__bincovSample.driver;d.freezeAI(true);d.door('resident-front',false);d.placePlayer({x:640,y:456},0,'coast');});
 await p.waitForTimeout(1000);
 const result=await p.evaluate(()=>{
  const h=window.__bincovSample.host,v=h.view;h.app.ticker.stop();
  const b=structuredClone(h.lastBatch);b.events=[];b.frame.bullets=[];for(const k in b.frame.revealed)b.frame.revealed[k]=true;
  const frontDoor=v.doors.get('resident-front');const frontWall=v.occluders.filter(o=>o.spec?.kind==='wall'&&o.spec.face==='ext'&&o.z===frontDoor?.z&&Math.abs(o.rect.x-frontDoor.rect.x)<=128).sort((a,b)=>Math.abs(a.rect.x-frontDoor.rect.x)-Math.abs(b.rect.x-frontDoor.rect.x))[0];const candidates=[frontWall,frontDoor];if(candidates.some(o=>!o))throw Error('Representative front-wall fixtures missing');
  const baseCamera={...v.camF},original=v.updateFades;
  const grab=()=>{v.render();const x=h.app.renderer.extract.pixels(v.worldRT);return{pixels:new Uint8Array(x.pixels),width:x.width,height:x.height};};
  const png=im=>{const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.putImageData(new ImageData(new Uint8ClampedArray(im.pixels),im.width,im.height),0,0);return c.toDataURL('image/png');};
  const compare=(a,b)=>{let changed=0;for(let i=0;i<a.pixels.length;i+=4)if(a.pixels[i]!==b.pixels[i]||a.pixels[i+1]!==b.pixels[i+1]||a.pixels[i+2]!==b.pixels[i+2])changed++;return changed;};
  const cases=[],images=[];
  for(const [index,o] of candidates.entries())for(const level of [0,1,2,3]){
   v.updateFades=function(...args){original.apply(this,args);for(const r of this.occluders)if(r.kind==='roof'||r.kind==='ceiling')r.sprite.visible=false;o.level=level;this.applyFade(o);};
   const present=()=>{v.camF={...baseCamera};v.time=1;v.shake=0;v.present(b,0);};
   b.frame.bullets=[];present();const before=grab();
   const uid='sol-occlusion-'+index+'-'+level,world={x:o.rect.x+16,y:o.rect.y+50+22};
   b.frame.bullets=[{uid,x:world.x-14,y:world.y,vx:760,vy:0,enemy:false,owner:'player'}];present();b.frame.bullets[0].x=world.x;present();const after=grab(),bullet=v.bullets.get(uid);
   const key=level?o.key+'|f'+level+'|'+o.keepBottom+'|'+(o.rect.x&3)+','+(o.rect.y&3):o.key;
   const c=v.tex.canvas(key),mask=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
   let opaqueChanged=0,changedThroughHoles=0,maskSamples=0;
   for(let y=0;y<after.height;y++)for(let x=0;x<after.width;x++){
    const i=(y*after.width+x)*4,wx=x+v.cam.x-o.rect.x,wy=y+v.cam.y-o.rect.y;
    if(wx<0||wy<0||wx>=c.width||wy>=c.height)continue;
    const solid=mask[(Math.floor(wy)*c.width+Math.floor(wx))*4+3]===255;
    if(solid&&wy===50&&wx>=2&&wx<=16)maskSamples++;
    const changed=before.pixels[i]!==after.pixels[i]||before.pixels[i+1]!==after.pixels[i+1]||before.pixels[i+2]!==after.pixels[i+2];
    if(changed){if(solid)opaqueChanged++;else changedThroughHoles++;}
   }
   o.sprite.visible=false;bullet.g.visible=false;const controlBefore=grab();bullet.g.visible=true;const controlAfter=grab(),controlChanged=compare(controlBefore,controlAfter);let controlOpaquePixels=0;for(let y=0;y<controlAfter.height;y++)for(let x=0;x<controlAfter.width;x++){const i=(y*controlAfter.width+x)*4,wx=Math.floor(x+v.cam.x-o.rect.x),wy=Math.floor(y+v.cam.y-o.rect.y);if(wx<0||wy<0||wx>=c.width||wy>=c.height||mask[(wy*c.width+wx)*4+3]!==255)continue;if(controlBefore.pixels[i]!==controlAfter.pixels[i]||controlBefore.pixels[i+1]!==controlAfter.pixels[i+1]||controlBefore.pixels[i+2]!==controlAfter.pixels[i+2])controlOpaquePixels++;}
   if(level===0){images.push({file:index?'closed-door-wall.png':'front-wall.png',url:png(after)});images.push({file:index?'closed-door-positive.png':'front-wall-positive.png',url:png(controlAfter)});}
   cases.push({kind:index?'closed-door':'front-wall',level,rect:o.rect,z:o.z,bulletY:world.y,bulletVisible:bullet.g.visible,opaqueSamplesOnTrail:maskSamples,opaqueChanged,changedThroughHoles,totalChanged:compare(before,after),controlChanged,controlOpaquePixels});
  }
  delete v.updateFades;h.app.ticker.start();return{cases,images,art:window.__bincovSample.counts().art};
 });
 for(const item of result.images)await writeFile(resolve(out,item.file),Buffer.from(item.url.split(',')[1],'base64'));
 report.art=result.art;report.cases=result.cases;
 for(const c of result.cases){assert.ok(c.bulletY<c.z);assert.equal(c.bulletVisible,true);assert.ok(c.opaqueSamplesOnTrail>0);assert.equal(c.opaqueChanged,0,JSON.stringify(c));assert.ok(c.controlChanged>0,JSON.stringify(c));assert.ok(c.controlOpaquePixels>0,JSON.stringify(c));if(c.level===0)assert.equal(c.totalChanged,0);}
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);report.status='passed';console.log('8/8 representative wall/door fade occlusion checks passed');
}catch(e){report.status='failed';report.failure=e.stack;process.exitCode=1;console.error(e);}
finally{await browser.close();await writeFile(resolve(out,'occlusion.json'),JSON.stringify(report,null,2)+'\n');}
