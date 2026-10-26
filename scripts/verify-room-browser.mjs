import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.ANKA_QA_URL||'http://127.0.0.1:18771';
const screenshots=process.env.ANKA_QA_SCREENSHOTS||'/private/tmp/anka-room-screenshots';
fs.mkdirSync(screenshots,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||chromium.executablePath(),args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const errors=[],hostFrames=[],guestFrames=[];
let host,guest;
try{
 const owner=await browser.newContext({viewport:{width:1440,height:900}});
 const visitor=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 for(const context of[owner,visitor])await context.addInitScript(()=>{const previous=JSON.parse(localStorage.getItem('anka-desert-strike-settings-v1')||'{}');localStorage.setItem('anka-desert-strike-settings-v1',JSON.stringify({...previous,quality:'low',muted:true}));window.__qaFrames=0;function count(){window.__qaFrames++;requestAnimationFrame(count);}requestAnimationFrame(count);});
 const login=await owner.request.post(base+'/api/auth/login',{data:{username:process.env.ANKA_QA_USER||'qa-owner',password:process.env.ANKA_QA_PASSWORD||'local-room-test-only'}});
 assert.equal(login.status(),200,await login.text());
 host=await owner.newPage();guest=await visitor.newPage();
 for(const [page,frames]of[[host,hostFrames],[guest,guestFrames]]){
  page.on('pageerror',error=>errors.push(error.message));
  page.on('websocket',ws=>ws.on('framereceived',event=>{try{frames.push(JSON.parse(String(event.payload)));}catch{}}));
 }
 await host.goto(base+'/anka-outpost-strike');
 await host.frameLocator('iframe[title="ANKA 前线对决"]').getByRole('button',{name:'邀请好友 · 双人对战'}).waitFor({timeout:30000});
 await host.screenshot({path:screenshots+'/2026-10-26-anka-launcher.png'});
 await host.goto(base+'/play/anka-outpost-strike');
 await host.getByRole('button',{name:'切换到第三人称',exact:true}).click();
 await host.reload();
 await host.getByRole('button',{name:'切换到第一人称',exact:true}).click({timeout:30000});
 await host.getByRole('button',{name:'选择模式：主线闯关',exact:true}).click();
 await host.getByRole('button',{name:'开始任务',exact:true}).click();
 await host.locator('.battle-hud').waitFor();
 await host.getByRole('button',{name:'切换到第三人称',exact:true}).click();
 await host.getByRole('button',{name:'切换到第一人称',exact:true}).waitFor();
 await host.keyboard.press('KeyV');
 await host.getByRole('button',{name:'切换到第三人称',exact:true}).waitFor();
 await host.locator('.game-viewport canvas').click({position:{x:720,y:450},force:true});
 await host.waitForFunction(()=>!!document.pointerLockElement,{timeout:5000});
 await host.keyboard.press('Escape');
 await host.getByRole('button',{name:'继续游戏',exact:true}).click();
 await host.screenshot({path:screenshots+'/2026-10-26-first-person.png'});
 const shield=host.getByRole('button',{name:'启用护盾 / Q',exact:true}).locator('b');
 const initialCharges=Number(await shield.textContent());
 // In the story arena the shield supply is six metres straight ahead.
 for(let attempt=0;attempt<30&&Number(await shield.textContent())===initialCharges;attempt++){
  const pickup=host.getByRole('button',{name:'拾取附近道具',exact:true});
  if(await pickup.isVisible()&&await pickup.isEnabled())await pickup.click();
  else{await host.keyboard.down('KeyW');await host.waitForTimeout(350);await host.keyboard.up('KeyW');}
 }
 assert.ok(Number(await shield.textContent())>initialCharges,'ground supply must be collectible through real controls');
 await host.screenshot({path:screenshots+'/2026-10-26-pickup.png'});
 await host.keyboard.press('Escape');
 await host.getByRole('button',{name:'返回基地',exact:false}).click();
 await host.getByRole('button',{name:'邀请好友 · 双人对战'}).click({timeout:30000});
 await host.getByRole('heading',{name:'好友对战'}).waitFor();
 const invitation=await host.getByLabel('邀请链接',{exact:true}).inputValue();
 assert.ok(invitation.includes('#invite='));
 await host.locator('.qr-frame img').waitFor();
 await host.screenshot({path:screenshots+'/2026-10-26-desktop.png'});
 await guest.goto(invitation);
 await guest.getByLabel('你的游戏昵称').fill('小雨');
 await guest.getByRole('button',{name:'加入游戏',exact:true}).click();
 await guest.getByRole('heading',{name:'好友对战'}).waitFor({timeout:30000});
 await host.getByRole('heading',{name:'小雨'}).waitFor();
 await host.getByRole('button',{name:/丛林遗迹/}).click();
 await guest.locator('.room-maps button.selected').filter({hasText:'丛林遗迹'}).waitFor();
 await guest.getByRole('button',{name:'小杰 · 突击',exact:true}).click();
 await guest.getByRole('button',{name:'我准备好了',exact:true}).click();
 await host.getByRole('button',{name:'我准备好了',exact:true}).click();
 await guest.locator('.room-screen').evaluate(el=>{el.scrollTop=0;});
 await guest.screenshot({path:screenshots+'/2026-10-26-mobile.png'});
 await host.getByRole('button',{name:'开始对战 →',exact:true}).click();
 await host.locator('.room-screen').waitFor({state:'hidden',timeout:20000});
 await guest.locator('.room-screen').waitFor({state:'hidden',timeout:20000});
 await host.keyboard.down('KeyW');await host.waitForTimeout(600);await host.keyboard.up('KeyW');
 await guest.keyboard.down('KeyD');await guest.waitForTimeout(600);await guest.keyboard.up('KeyD');
 for(let attempt=0;attempt<20&&guestFrames.filter(f=>f.type==='game'&&f.payload?.type==='pvp-state').length<12;attempt++)await guest.waitForTimeout(1000);
 const states=guestFrames.filter(f=>f.type==='game'&&f.payload?.type==='pvp-state');
 assert.ok(states.length>10,'guest must receive real host game snapshots');
 assert.ok(hostFrames.some(f=>f.type==='game'&&f.payload?.type==='player'),'host must receive real guest movements');
 assert.notDeepEqual(states[0].payload.players[0].p,states.at(-1).payload.players[0].p,'owner movement must be synchronized');
 await host.screenshot({path:screenshots+'/2026-10-26-online.png'});
 const me=await visitor.request.get(base+'/api/auth/me');assert.equal((await me.json()).username,null);
 assert.equal((await visitor.request.get(base+'/api/settings')).status(),401);
 const cookie=(await visitor.cookies()).find(c=>c.name==='anka_guest_session');assert.ok(cookie?.httpOnly);
 assert.ok(cookie.expires-Date.now()/1000>86300,'guest auth must last 24 hours');
 // Page refresh must retain the guest identity and safely reset the active round.
 await guest.reload();await guest.getByRole('heading',{name:'好友对战'}).waitFor({timeout:30000});
 await host.getByRole('heading',{name:'好友对战'}).waitFor();
 // A new round uses the same visitor identity, and can select another map.
 const firstRound=states[0].round;
 await host.getByRole('button',{name:/雪地要塞/}).click();
 await guest.locator('.room-maps button.selected').filter({hasText:'雪地要塞'}).waitFor();
 await guest.getByRole('button',{name:'我准备好了',exact:true}).click();
 await host.getByRole('button',{name:'我准备好了',exact:true}).click();
 await host.getByRole('button',{name:'开始对战 →',exact:true}).click();
 await host.locator('.room-screen').waitFor({state:'hidden',timeout:20000});
 await guest.locator('.room-screen').waitFor({state:'hidden',timeout:20000});
 assert.ok(guestFrames.some(f=>f.type==='room'&&f.room.phase==='playing'&&f.room.round!==firstRound));
 assert.equal((await visitor.cookies()).find(c=>c.name==='anka_guest_session').value,cookie.value);
 await guest.screenshot({path:screenshots+'/2026-10-26-mobile-online.png'});
 await host.getByRole('button',{name:'返回大厅',exact:true}).click();
 await host.getByRole('heading',{name:'好友对战'}).waitFor();
 await host.getByRole('button',{name:'移除好友，重新邀请'}).click();
 await guest.getByRole('heading',{name:'房间已结束'}).waitFor();
 assert.equal(await host.getByLabel('邀请链接',{exact:true}).count(),0,'consumed invitation must not be reused');
 await host.getByRole('button',{name:'重新生成',exact:true}).click();
 assert.notEqual(await host.getByLabel('邀请链接',{exact:true}).inputValue(),invitation);
 await host.getByRole('button',{name:'离开房间 ↗'}).click();
 assert.deepEqual(errors,[],'no browser runtime errors');
 console.log(JSON.stringify({desktop:'1440x900',mobile:'390x844',firstPerson:'button and keyboard passed',groundPickup:'real controls passed',nativeAnkaLauncher:'passed',inviteRedemption:'passed',qr:'rendered locally',lobby:'passed',websocketSnapshots:states.length,movement:'synchronized',guestScope:'passed',sessionHours:24,refresh:'passed',rematch:'same identity, new map',revocation:'passed',inviteRotation:'passed',pageErrors:errors.length}));
}catch(error){
 for(const [label,page]of[['host',host],['guest',guest]])if(page){await page.screenshot({path:screenshots+`/failed-${label}.png`}).catch(()=>{});console.error(label,'raf',await page.evaluate(()=>window.__qaFrames),(await page.locator('body').innerText()).slice(0,1300));}
 console.error('Runtime errors:',errors,'Frame counts:',{host:hostFrames.length,guest:guestFrames.length,hostGame:hostFrames.filter(f=>f.type==='game').length,guestGame:guestFrames.filter(f=>f.type==='game').length});throw error;
}finally{await browser.close();}
