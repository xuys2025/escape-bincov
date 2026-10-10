/** Isolated diagnostic; never run concurrently with other browser work or video capture. */
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const [file, out, throttleArg = '1'] = process.argv.slice(2);
const throttle = Number(throttleArg);
if (!file || !out || !Number.isFinite(throttle) || throttle < 1 || throttle > 20)
  throw new Error('Usage: node scripts/title-performance.mjs <offline-html> <report.json> [CPU slowdown 1..20]');
const browser = await chromium.launch(browserOptions);
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, offline: true, reducedMotion: 'no-preference' });
const page = await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(pathToFileURL(file).href+'?test=1&entry=tabs');
  await page.locator('.title-enter').waitFor();
  await page.waitForTimeout(1500);
  if (throttle > 1) {const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:throttle});}
  const result=await page.evaluate(async()=>{
    const game=window.__bincov.app.game, title=game.scene.getScene('Menu').title, renderer=game.renderer;
    const gl=renderer.gl, ext=gl?.getExtension('WEBGL_debug_renderer_info');
    const info={type:renderer.type,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};
    let draws=0, commands=0;
    const walk=o=>{if(o.type==='Graphics'){draws++;commands+=o.commandBuffer.length;}if(o.list) o.list.forEach(walk);};
    game.scene.getScene('Menu').children.list.forEach(walk);
    const render=[],update=[],frameCpu=[];let lastUpdate=0;
    const originalRender=renderer.render,originalUpdate=title.update;
    renderer.render=function(...args){const t=performance.now();const r=originalRender.apply(this,args);const duration=performance.now()-t;render.push(duration);frameCpu.push(duration+lastUpdate);return r;};
    title.update=function(...args){const t=performance.now();const r=originalUpdate.apply(this,args);lastUpdate=performance.now()-t;update.push(lastUpdate);return r;};
    const stats=a=>{a.sort((x,y)=>x-y);return {n:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1),over33:a.filter(x=>x>33.4).length};};
    const sample=()=>new Promise(done=>{let last;const frames=[];const start=performance.now();render.length=0;update.length=0;frameCpu.length=0;const tick=t=>{if(last!==undefined)frames.push(t-last);last=t;if(frames.length<360||t-start<8000)requestAnimationFrame(tick);else done({rafMs:stats(frames),renderCpuMs:stats([...render]),updateCpuMs:stats([...update]),combinedCpuMs:stats([...frameCpu])});};requestAnimationFrame(tick);});
    const on=await sample();
    document.querySelector('.title-motion').click();
    const off=await sample();
    renderer.render=originalRender;title.update=originalUpdate;
    return {info,graphicsObjects:draws,graphicsCommands:commands,on,off};
  });
  const report={date:new Date().toISOString(),browser:browser.version(),file,throttle,methodology:'1920x1080 headless Chrome, no video capture, at least 360 requestAnimationFrame intervals and 8 seconds per state; instrumented renderer/update CPU time excludes asynchronous GPU execution. Separate fresh browser profile, no player save. CPU slowdown is simulated, not a physical low-end device.',...result,errors};
  report.htmlSha256=createHash('sha256').update(await readFile(file)).digest('hex');
  report.browserArgs=browserOptions.args;
  await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
