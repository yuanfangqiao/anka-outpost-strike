<script setup>
import { onMounted, onBeforeUnmount, reactive, ref, nextTick } from 'vue';
import GameUI from './GameUI.vue';
import RoomLobby from './RoomLobby.vue';
import PlayControls from './PlayControls.vue';
import { AnkaGame } from './engine.js';
import { GameNetwork } from './network.js';
import { OnlineDuel } from './online-duel.js';
import { mobileViewport, gameDelta, enterLandscape, activateTouchButton, suppressTouchClick } from './mobile.js';
import './mobile.css';
import { SETTINGS_KEY, SAVE_KEY } from './config.js';
const viewport=ref(null);
const mobile=reactive(mobileViewport()),inputVersion=ref(0);
function resizeMobile(){Object.assign(mobile,mobileViewport());}
function clearControls(){if(!engine)return;engine.keys.clear();engine.touchMove={x:0,y:0};engine.heldFire=false;}
function deviceChanged(){clearControls();resizeMobile();inputVersion.value++;}
const room=ref(null),invite=ref(null),roomBusy=ref(false),roomError=ref(''),leavePrompt=ref(false);
let preparing='',disposed=false;
const state=reactive({phase:'loading',loading:0,map:'desert',mode:'versus',character:'male',hp:120,maxHp:120,shield:0,ammo:28,reserve:196,weapon:0,grenades:3,medkits:3,shieldCharges:2,wave:0,kills:0,score:0,elapsed:0,remaining:0,message:'正在准备行动',notice:'',aimX:50,aimY:50});
const networkStatus=reactive({state:'offline',code:'',peers:1,error:'',members:[]});
let engine,network,lastConfig={map:'desert',mode:'versus',character:'male'};
let settings={muted:false,quality:mobile.enabled?'low':'medium',perspective:'first'};
try{settings={...settings,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')};state.bestScore=JSON.parse(localStorage.getItem(SAVE_KEY)||'{}').bestScore||0;}catch{}
function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{}}
function drawMinimap(){
 const canvas=document.getElementById('minimap');if(!canvas||!engine)return;
 const ctx=canvas.getContext('2d'),m=engine.minimap(),w=canvas.width,h=canvas.height,b=m.bounds;
 const point=p=>[8+(p[0]-b.minX)/(b.maxX-b.minX)*(w-16),8+(p[2]-b.minZ)/(b.maxZ-b.minZ)*(h-16)];
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#14232be6';ctx.fillRect(0,0,w,h);
 ctx.strokeStyle='#a6c4cd18';ctx.lineWidth=1;for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(i*w/5,0);ctx.lineTo(i*w/5,h);ctx.moveTo(0,i*h/5);ctx.lineTo(w,i*h/5);ctx.stroke();}
 ctx.fillStyle='#cdb58b65';for(const c of m.colliders){const a=point([c.minX,0,c.minZ]),z=point([c.maxX,0,c.maxZ]);ctx.fillRect(a[0],a[1],z[0]-a[0],z[1]-a[1]);}
 const dot=(p,color,r=3)=>{const q=point(p);ctx.fillStyle=color;ctx.beginPath();ctx.arc(q[0],q[1],r,0,Math.PI*2);ctx.fill();};
 for(const e of m.enemies)dot(e.p,e.boss?'#ffb35c':'#f3655c',e.boss?5:2.5);
 if(m.buddy)dot(m.buddy,'#73dbed');for(const p of m.remotes)dot(p,state.mode==='versus'?'#ff9469':'#73dbed');
 const p=point(m.player);ctx.save();ctx.translate(...p);ctx.rotate(-m.yaw);ctx.fillStyle='#f8dfa7';ctx.beginPath();ctx.moveTo(0,6);ctx.lineTo(-4,-4);ctx.lineTo(0,-2);ctx.lineTo(4,-4);ctx.closePath();ctx.fill();ctx.restore();
 ctx.fillStyle='#e4d7b4';ctx.font='9px sans-serif';ctx.fillText('N',w/2-3,10);
}
onMounted(()=>{
 window.addEventListener('resize',deviceChanged);window.visualViewport?.addEventListener('resize',deviceChanged);
 window.addEventListener('orientationchange',deviceChanged);document.addEventListener('fullscreenchange',deviceChanged);
 try{
  engine=new AnkaGame(viewport.value,s=>{Object.assign(state,s);if(s.perspective&&settings.perspective!==s.perspective){settings.perspective=s.perspective;saveSettings();}nextTick(drawMinimap);window.parent.postMessage({type:'anka-game-back-state',value:!!room.value||!['menu','loading'].includes(s.phase)},location.origin);});
  network=new GameNetwork({onEvent:(payload,id)=>Promise.resolve(engine.consumeNetwork(payload,id)).catch(console.error),onStatus:s=>{Object.assign(networkStatus,s);engine.networkStatus(s);if(s.state==='disconnected'&&engine.online){engine.state.phase='waiting';engine.heldFire=false;engine.emit();}},onRoom:value=>syncRoom(value).catch(error=>{roomError.value=error.message;})});
  engine.setNetwork(network);engine.setPerspective(settings.perspective);engine.setMuted(settings.muted);engine.setQuality(settings.quality);
  network.restore().catch(error=>{roomError.value=error.message;});
  window.addEventListener('message',onHostBack);
 }catch(error){state.phase='error';state.message=`无法启动三维画面：${error.message}`;console.error(error);}
});
onBeforeUnmount(()=>{window.removeEventListener('resize',deviceChanged);window.visualViewport?.removeEventListener('resize',deviceChanged);window.removeEventListener('orientationchange',deviceChanged);document.removeEventListener('fullscreenchange',deviceChanged);disposed=true;window.removeEventListener('message',onHostBack);network?.close();engine?.dispose();});
async function syncRoom(value){
 room.value=value;if(!value||disposed)return;
 if(Object.keys(value.players).length>1)invite.value=null;
 if(value.phase==='closed'){roomError.value=value.notice;engine.heldFire=false;engine.state.phase='waiting';engine.emit();return;}
 await engine.ready;if(disposed||network.room?.id!==value.id)return;
 const me=value.players[value.self];if(!me)return;
 if(value.phase==='lobby'){
  if(engine.state.phase!=='menu')engine.toMenu();network.currentRound='';preparing='';
  engine.preview(value.map,me.character);engine.emit();return;
 }
 if(value.phase==='loading'&&preparing!==value.round){
  preparing=value.round;network.currentRound=value.round;
  try{
   await engine.start({session:value.round,map:value.map,mode:'versus',character:me.character});
   if(disposed||network.room?.round!==value.round)return;
   new OnlineDuel(engine,value);engine.state.phase='waiting';engine.emit();
   await network.command('loaded',{round:value.round});
  }catch(error){roomError.value='战场准备失败：'+error.message;}
 }
 if(engine.online&&engine.roundId===value.round){
  engine.online.room=value;
  if(value.phase==='playing'&&!engine.online.ended)engine.state.phase='playing';
  else if(['loading','countdown','reconnecting'].includes(value.phase)){engine.state.phase='waiting';engine.heldFire=false;engine.keys.clear();}
  engine.emit();
 }
}
async function roomAction({action,args={}}){if(roomBusy.value)return;roomBusy.value=true;roomError.value='';try{await network.command(action,args);}catch(error){roomError.value=error.message;}finally{roomBusy.value=false;}}
async function refreshInvite(){roomBusy.value=true;roomError.value='';try{invite.value=await network.refreshInvite();}catch(error){roomError.value=error.message;}finally{roomBusy.value=false;}}
async function leaveRoom(){try{await network.leave();}catch(error){console.error(error);}engine.toMenu();invite.value=null;roomError.value='';leavePrompt.value=false;preparing='';}
function retry(){if(room.value){if(network.isHost)roomAction({action:'lobby'});else roomError.value='请等待房主返回大厅，再次准备';}else start(lastConfig);}
function onHostBack(event){if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='anka-game-back')return;if(room.value)leavePrompt.value=true;else if(state.phase!=='menu')engine.toMenu();}
async function start(config){enterLandscape();if(network?.connected&&!network.isHost){networkStatus.error='请等待房主部署小队';return;}lastConfig={...lastConfig,...config};try{await engine.start(lastConfig);}catch(error){state.phase='error';state.message=error.message;}}
async function host(config){enterLandscape();engine.fx.unlockAudio();roomBusy.value=true;roomError.value='';lastConfig={...lastConfig,...config};try{const data=await network.host(config);invite.value=data.invite;}catch(error){networkStatus.error=error.message;roomError.value=error.message;}finally{roomBusy.value=false;}}
function join(){networkStatus.error='请打开房主分享的邀请链接，或扫描二维码加入。';}
function disconnect(){if(room.value)leaveRoom();else{network?.close();engine?.toMenu();}}
function menu(){if(room.value)retry();else engine?.toMenu();}
function setFire(value){if(!engine)return;if(value)engine.fx.unlockAudio();engine.heldFire=value;}
function ability(id){if(!engine||state.phase!=='playing')return;if(id==='crouch'){engine.keys.has('KeyC')?engine.keys.delete('KeyC'):engine.keys.add('KeyC');engine.emit();}else engine[id]?.();}
function setAim(value){if(!engine)return;value?engine.keys.add('MouseRight'):engine.keys.delete('MouseRight');engine.emit();}
function mute(value){settings.muted=value;engine?.setMuted(value);saveSettings();}
function quality(value){settings.quality=value;engine?.setQuality(value);saveSettings();}
function touchLook(delta){if(!engine||state.phase!=='playing')return;delta=gameDelta(delta,mobile.rotated);engine.lookYaw-=delta.x*.006;engine.lookPitch=Math.max(state.perspective==='first'?-1.25:-.5,Math.min(state.perspective==='first'?1.25:.38,engine.lookPitch-delta.y*.004));engine.aimNdc.set(0,0);}
</script>
<template>
 <main @pointerdown.capture="activateTouchButton" @click.capture="suppressTouchClick" class="game-root" :class="{'mobile-layout':mobile.enabled,'mobile-rotated':mobile.rotated}" :style="mobile.enabled?{width:`${mobile.width}px`,height:`${mobile.height}px`}:{}">
  <div ref="viewport" class="game-viewport"></div>
  <GameUI v-show="!room||['playing','finished'].includes(room.phase)" :state="state" :mobile="mobile.enabled" :rotated="mobile.rotated" :input-version="inputVersion" :network-status="networkStatus" @start="start" @preview="engine?.preview($event.map,$event.character)" @pause="engine?.pause()" @resume="engine?.resume()" @menu="menu" @retry="retry" @weapon="engine?.setWeapon($event)" @ability="ability" @mute="mute" @quality="quality" @host="host" @join="join" @disconnect="disconnect" @touch-move="engine && (engine.touchMove=$event)" @touch-look="touchLook" @fire="setFire" @aim="setAim" @fullscreen="enterLandscape" />
  <PlayControls v-if="!room||['playing','finished'].includes(room.phase)" :state="state" @perspective="engine?.setPerspective($event)" @interact="engine?.interact()" />
  <RoomLobby v-if="room&&(!['playing','finished'].includes(room.phase)||['disconnected','error'].includes(networkStatus.state))" :room="room" :invite="invite" :status="networkStatus" :busy="roomBusy" :error="roomError" @command="roomAction" @invite="refreshInvite" @leave="leaveRoom" />
  <div v-if="room&&['playing','finished'].includes(room.phase)" class="online-room-controls"><span>{{networkStatus.ping||'—'}} ms · {{room.code}}</span><button v-if="room.self===room.host" @click="roomAction({action:'lobby'})">返回大厅</button><button @click="leaveRoom">离开房间</button><p v-if="roomError" role="alert">{{roomError}}</p></div>
  <div v-if="leavePrompt" class="leave-room-dialog" role="dialog" aria-modal="true" aria-label="离开房间"><div><h2>离开这个房间？</h2><p>{{room?.self===room?.host?'离开后会关闭房间，好友也将结束访问。':'离开后需要新的邀请才能再次加入。'}}</p><button @click="leavePrompt=false">继续游戏</button><button @click="leaveRoom">离开房间</button></div></div>
 </main>
</template>
<style>
*{box-sizing:border-box}html,body,#app,.game-root,.game-viewport{width:100%;height:100%;margin:0;overflow:hidden}html,body{overscroll-behavior:none}body{background:#172630;color:#fff;font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif}.game-root{position:relative}.game-viewport{position:absolute;inset:0}.game-viewport canvas{display:block;width:100%;height:100%;outline:none;touch-action:none}button,input,select{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid #ffe2a0;outline-offset:3px}button:disabled{cursor:wait}a{color:inherit}
.online-room-controls{position:absolute;left:18px;bottom:24px;z-index:30;display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:320px;padding:8px 10px;background:#10242bd9;border:1px solid #abc9bc44;border-radius:9px;font-size:10px;color:#b8cdd0}.online-room-controls button{padding:6px 9px;background:#e7d3a422;border:1px solid #d7c59e55;border-radius:5px;color:#efdfba;font-size:10px}.online-room-controls p{flex-basis:100%;margin:3px 0;color:#ffc5ae}@media(max-width:600px){.online-room-controls{bottom:auto;top:245px;left:12px;max-width:210px}}@media(orientation:landscape) and (max-height:600px){.online-room-controls{top:auto;bottom:8px;left:8px;max-width:200px}}
.leave-room-dialog{position:absolute;inset:0;z-index:80;background:#081b24aa;display:grid;place-items:center;padding:24px}.leave-room-dialog>div{max-width:360px;padding:28px;background:#17313a;border:1px solid #ddc39466;border-radius:16px}.leave-room-dialog h2{font-size:21px;margin:0 0 15px}.leave-room-dialog p{font-size:13px;line-height:1.8;color:#b5c9cc}.leave-room-dialog button{padding:10px 15px;margin:10px 8px 0 0;color:#e9d8b6;border:1px solid #dcc59a55;border-radius:7px;background:#c5ad7c1a}
</style>
