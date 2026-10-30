// Run against `npm run dev`. Uses real Chrome touch events, not a mocked controller.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||chromium.executablePath(),args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const base=process.env.ANKA_QA_URL||'http://127.0.0.1:5173';
const screenshots=process.env.ANKA_QA_SCREENSHOTS||new URL('../reports/game/mobile/',import.meta.url).pathname;
fs.mkdirSync(screenshots,{recursive:true});
const errors=[],results=[];let activePage;
const center=async locator=>{const b=await locator.boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2};};
const wait=(page,fn)=>page.waitForFunction(fn,{},{timeout:5000});
async function captureShot(page,name){
 await wait(page,()=>window.__qaGame.view.flashTime>.005&&window.__qaGame.fx._tracers.slots.some(t=>t.travel&&t.mesh.visible));
 await page.evaluate(()=>{const g=window.__qaGame;g.renderer.setAnimationLoop(null);g.emit();});
 await page.screenshot({path:`${screenshots}/${name}-shooting.png`});
 await page.evaluate(()=>{const g=window.__qaGame;g.lastTime=performance.now();g.renderer.setAnimationLoop(t=>g.frame(t));});
}
try{
 for(const [name,width,height,touch]of[['desktop',1440,900,false],['landscape',844,390,true],['portrait',390,844,true],['compact',568,320,true]]){
  const context=await browser.newContext({viewport:{width,height},screen:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
  await context.addInitScript(()=>localStorage.setItem('anka-desert-strike-settings-v1',JSON.stringify({quality:'low',muted:true,perspective:'first'})));
  const page=await context.newPage();activePage=page;page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
  await page.goto(base);await page.getByRole('button',{name:'开始人机对战',exact:true}).waitFor({timeout:30000});
  await page.screenshot({path:`${screenshots}/${name}-menu.png`});
  assert.equal(await page.locator('.controller-entry').count(),touch?0:1,'controller pairing is available only on desktop');
  await page.evaluate(()=>{window.__qaGame=document.querySelector('#app').__vue_app__._instance.setupState.engine;});
  await page.getByRole('button',{name:'选择模式：主线闯关',exact:true}).click();await page.getByRole('button',{name:'开始任务',exact:true}).click();
  await page.locator('.phase-playing').waitFor();
  const layout=await page.evaluate(()=>{const r=document.querySelector('.game-root'),g=window.__qaGame;return{width:r.clientWidth,height:r.clientHeight,rotated:r.classList.contains('mobile-rotated'),aspect:g.camera.aspect};});
  assert.equal(layout.width,Math.max(width,height));assert.equal(layout.height,Math.min(width,height));
  assert.ok(Math.abs(layout.aspect-layout.width/layout.height)<.01,'camera must follow the landscape viewport');
  if(!touch){
   await page.keyboard.down('KeyJ');await captureShot(page,name);await page.keyboard.up('KeyJ');
   assert.ok(await page.evaluate(()=>window.__qaGame.state.ammo<28));
   assert.equal(await page.getByRole('button',{name:'全屏横屏',exact:true}).isVisible(),false,'touch fullscreen button must stay hidden on desktop');
   await context.close();results.push({name,shots:'visible muzzle and traveling tracer'});continue;
  }
  const hitTargets=await page.evaluate(()=>['.mobile-fire','.mobile-aim','.mobile-jump','.mobile-roll','.mobile-crouch','.move-stick','.mobile-weapon-toggle','.reload-button','.shield-ability','.hud-top-buttons button[aria-label="暂停游戏"]'].map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{selector:s,visible:r.x>=0&&r.y>=0&&r.right<=innerWidth+.1&&r.bottom<=innerHeight+.1,reachable:e===hit||e.contains(hit)};}));
  assert.ok(hitTargets.every(t=>t.visible&&t.reachable),JSON.stringify(hitTargets));
  const cdp=await context.newCDPSession(page);
  const send=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({...p,radiusX:3,radiusY:3,force:1}))});
  const physical=(x,y)=>layout.rotated?{x:-y,y:x}:{x,y};
  // Every blank region, including the formerly excluded left 24%, turns the camera.
  for(const fraction of [.1,.45,.65]){
   const logical={x:layout.width*fraction,y:layout.height*.4};
   const point=layout.rotated?{x:layout.height-logical.y,y:logical.x}:logical;
   assert.ok(await page.evaluate(point=>document.elementFromPoint(point.x,point.y)?.classList.contains('touch-look-area'),point),'blank stage must accept look gestures');
   const yaw=await page.evaluate(()=>window.__qaGame.lookYaw),delta=physical(20,-8);
   const finger={id:9,...point};
   await send('touchStart',[finger]);
   await send('touchMove',[{...finger,x:finger.x+delta.x,y:finger.y+delta.y}]);
   await page.waitForFunction(yaw=>window.__qaGame.lookYaw<yaw-.05,yaw,{timeout:5000});
   await send('touchEnd',[]);
   assert.deepEqual(await page.evaluate(()=>window.__qaGame.touchMove),{x:0,y:0},'look gestures must not move the player');
   assert.equal(await page.evaluate(()=>window.__qaGame.heldFire),false,'look gestures must not fire');
  }
  const stick=await center(page.getByLabel('移动摇杆',{exact:true}));
  const delta=physical(0,-30),move={id:1,x:stick.x+delta.x,y:stick.y+delta.y};
  await send('touchStart',[{id:1,...stick}]);await send('touchMove',[move]);
  assert.ok(await page.evaluate(()=>window.__qaGame.touchMove.y<-.5),'up on the stick must move forward, including rotated portrait');
  const initial=await page.evaluate(()=>({p:window.__qaGame.player.group.position.toArray(),yaw:window.__qaGame.lookYaw,pitch:window.__qaGame.lookPitch,ammo:window.__qaGame.state.ammo}));
  const fire={id:2,...await center(page.getByRole('button',{name:'按住射击',exact:true}))};
  await send('touchStart',[move,fire]);await captureShot(page,name);
  const drag=physical(18,-9),fireDrag={...fire,x:fire.x+drag.x,y:fire.y+drag.y};await send('touchMove',[move,fireDrag]);
  await wait(page,()=>window.__qaGame.state.ammo<28);
  await page.waitForFunction(yaw=>window.__qaGame.lookYaw<yaw-.05,initial.yaw,{timeout:5000});
  const firing=await page.evaluate(()=>{const g=window.__qaGame;return{move:g.touchMove,held:g.heldFire,yaw:g.lookYaw,pitch:g.lookPitch,p:g.player.group.position.toArray()};});
  assert.equal(firing.held,true);assert.ok(firing.move.y<-.5);assert.ok(firing.yaw<initial.yaw-.05);assert.ok(firing.pitch>initial.pitch+.02);assert.notDeepEqual(firing.p,initial.p,'movement and firing must work together');
  await send('touchEnd',[fireDrag]);await wait(page,()=>!window.__qaGame.heldFire);
  assert.equal(await page.evaluate(()=>window.__qaGame.heldFire),false,'releasing fire must stop only firing');
  assert.ok(await page.evaluate(()=>window.__qaGame.touchMove.y<-.5),'other finger retains movement');
  const secondaryCharges=await page.evaluate(()=>window.__qaGame.state.shieldCharges),secondaryShield={id:3,...await center(page.getByRole('button',{name:'启用护盾 / Q',exact:true}))};
  await send('touchStart',[move,secondaryShield]);await send('touchEnd',[secondaryShield]);
  await page.waitForFunction(charges=>window.__qaGame.state.shieldCharges===charges-1,secondaryCharges,{timeout:5000});
  assert.ok(await page.evaluate(()=>window.__qaGame.touchMove.y<-.5),'a secondary finger can activate an ability while moving');
  await send('touchCancel',[]);await wait(page,()=>window.__qaGame.touchMove.x===0&&window.__qaGame.touchMove.y===0);assert.deepEqual(await page.evaluate(()=>window.__qaGame.touchMove),{x:0,y:0});
  await page.getByRole('button',{name:'瞄准',exact:true}).tap();assert.equal(await page.getByRole('button',{name:'瞄准',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'瞄准',exact:true}).tap();
  await page.getByRole('button',{name:'蹲伏',exact:true}).tap();assert.ok(await page.evaluate(()=>window.__qaGame.keys.has('KeyC')));await page.getByRole('button',{name:'蹲伏',exact:true}).tap();
  await page.getByRole('button',{name:'选择武器',exact:true}).tap();await page.getByRole('button',{name:'切换能量枪 / 7',exact:true}).tap();
  assert.equal(await page.evaluate(()=>window.__qaGame.state.weapon),6);assert.equal(await page.locator('.weapon-bar').isVisible(),false);
  await page.getByRole('button',{name:'选择武器',exact:true}).tap();await page.getByRole('button',{name:'切换突击步枪 / 1',exact:true}).tap();
  const charges=await page.evaluate(()=>window.__qaGame.state.shieldCharges);await page.getByRole('button',{name:'启用护盾 / Q',exact:true}).tap();assert.equal(await page.evaluate(()=>window.__qaGame.state.shieldCharges),charges-1);
  const grenades=await page.evaluate(()=>window.__qaGame.state.grenades);await page.getByRole('button',{name:'投掷手雷 / G',exact:true}).tap();assert.equal(await page.evaluate(()=>window.__qaGame.state.grenades),grenades-1);
  await page.getByRole('button',{name:'换弹 / R',exact:true}).tap();await wait(page,()=>window.__qaGame.reloadLeft>0||window.__qaGame.state.ammo===28);
  await page.getByRole('button',{name:'跳跃',exact:true}).tap();await wait(page,()=>window.__qaGame.player.group.position.y>0);
  await wait(page,()=>window.__qaGame.grounded);await page.getByRole('button',{name:'翻滚',exact:true}).tap();assert.ok(await page.evaluate(()=>window.__qaGame.rollLeft>0));
  // Pause with a third finger while both controls are captured.
  await send('touchStart',[{id:1,...stick}]);await send('touchMove',[move]);await send('touchStart',[move,fire]);
  const pause={id:3,...await center(page.getByRole('button',{name:'暂停游戏',exact:true}))};await send('touchStart',[move,fire,pause]);await send('touchEnd',[pause]);
  await page.locator('.phase-paused').waitFor();await send('touchCancel',[]);
  assert.deepEqual(await page.evaluate(()=>({held:window.__qaGame.heldFire,move:window.__qaGame.touchMove})),{held:false,move:{x:0,y:0}});
  await page.getByRole('button',{name:'继续游戏',exact:true}).tap();
  // A size/orientation change also releases captured input without waiting for pointerup.
  await send('touchStart',[{id:1,...stick}]);await send('touchMove',[move]);await send('touchStart',[move,fire]);
  await page.setViewportSize({width:height,height:width});
  await wait(page,()=>!window.__qaGame.heldFire&&window.__qaGame.touchMove.x===0&&window.__qaGame.touchMove.y===0);
  await send('touchCancel',[]);assert.equal(await page.locator('.mobile-fire.firing').count(),0);
  results.push({name,viewport:`${width}x${height}`,landscape:`${layout.width}x${layout.height}`,hitTargets:'reachable',multiTouch:'move + fire + drag aim',actions:'aim, crouch, weapon, shield, grenade, reload, jump, roll',release:'pointer cancel, pause, resize'});
  console.log(name,'touch checks passed');await context.close();
 }
 assert.deepEqual(errors,[],'no browser errors');fs.writeFileSync(`${screenshots}/checks.json`,JSON.stringify({results,pageErrors:errors},null,2));console.log(JSON.stringify({results,pageErrors:errors},null,2));
}catch(error){
 if(activePage&&!activePage.isClosed()){
  console.error('Input QA state',await activePage.evaluate(()=>({phase:window.__qaGame?.state.phase,hp:window.__qaGame?.state.hp})));
  await activePage.screenshot({path:`${screenshots}/failure.png`});
 }
 throw error;
}finally{await browser.close();}
