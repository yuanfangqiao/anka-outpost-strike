// Actual Anka production routes, browser decoding, cold transfer and warm cache.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.ANKA_QA_URL||'http://127.0.0.1:18772';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
await fs.mkdir('reports/optimization/visuals',{recursive:true});
const results=[],errors=[];
try{
 for(const [name,width,height,touch]of [['desktop',1440,900,false],['phone',390,844,true]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
  await context.addInitScript(()=>localStorage.setItem('anka-desert-strike-settings-v1',JSON.stringify({quality:'low',muted:true,perspective:'third'})));
  const login=await context.request.post(base+'/api/auth/login',{data:{username:process.env.ANKA_QA_USER||'controller-qa',password:process.env.ANKA_QA_PASSWORD||'controller-local-only'}});
  assert.equal(login.status(),200,'isolated QA login');
  const page=await context.newPage(),cdp=await context.newCDPSession(page);
  page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
  await cdp.send('Network.enable');
  let requests=new Map();
  cdp.on('Network.responseReceived',({requestId,response})=>requests.set(requestId,{
   url:new URL(response.url).pathname,status:response.status,encoding:response.headers['content-encoding']||response.headers['Content-Encoding']||'identity',
   fromDiskCache:!!response.fromDiskCache,bytes:0}));
  cdp.on('Network.loadingFinished',({requestId,encodedDataLength})=>{
   const request=requests.get(requestId);if(request)request.bytes=encodedDataLength;
  });
  await page.goto(base+'/play/anka-outpost-strike');
  await page.getByRole('button',{name:'开始人机对战',exact:true}).waitFor({timeout:30000});
  const cold=[...requests.values()];
  const models=cold.filter(r=>r.url.endsWith('.glb'));
  assert.equal(models.length,2,'exactly the two optimized characters are requested');
  assert.ok(models.every(r=>r.status===200&&['br','gzip'].includes(r.encoding)),'browser receives compressed models');
  const coldBytes=cold.reduce((n,r)=>n+r.bytes,0);
  assert.ok(coldBytes<2500000,`cold transfer ${coldBytes} exceeds 2.5 MB budget`);
  await page.screenshot({path:`reports/optimization/visuals/${name}-production-menu.png`});
  requests=new Map();await page.reload();
  await page.getByRole('button',{name:'开始人机对战',exact:true}).waitFor({timeout:30000});
  const warm=[...requests.values()],warmBytes=warm.reduce((n,r)=>n+r.bytes,0);
  assert.ok(warm.filter(r=>r.url.endsWith('.glb')).every(r=>r.bytes<1000),'warm models use cache');
  assert.ok(warmBytes<100000,`warm transfer ${warmBytes} exceeds 0.1 MB budget`);
  await page.getByRole('button',{name:'选择模式：主线闯关',exact:true}).click();
  await page.getByRole('button',{name:'开始任务',exact:true}).click();
  await page.locator('.phase-playing').waitFor();
  if(touch){
   await page.getByRole('button',{name:'跳跃',exact:true}).tap();
   const fire=page.getByRole('button',{name:'按住射击',exact:true});
   await fire.tap();
  }else await page.keyboard.press('KeyJ');
  await page.screenshot({path:`reports/optimization/visuals/${name}-production-playing.png`});
  results.push({name,coldBytes,warmBytes,cold,warm,startedGame:true});
  await context.close();console.log(name,'cold MB',coldBytes/1e6,'warm KB',warmBytes/1000);
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('reports/optimization/delivery.json',JSON.stringify({results,errors},null,2)+'\n');
}finally{await browser.close();}
