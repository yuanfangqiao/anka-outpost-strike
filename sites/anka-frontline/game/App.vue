<script setup>
import { onMounted, onBeforeUnmount, reactive, ref, nextTick } from 'vue';
import GameUI from './GameUI.vue';
import { AnkaGame } from './engine.js';
import { GameNetwork } from './network.js';
import { SETTINGS_KEY, SAVE_KEY } from './config.js';
const viewport=ref(null);
const state=reactive({phase:'loading',loading:0,map:'desert',mode:'story',character:'male',hp:120,maxHp:120,shield:0,ammo:28,reserve:196,weapon:0,grenades:3,medkits:3,shieldCharges:2,wave:0,kills:0,score:0,elapsed:0,remaining:0,message:'正在准备行动',notice:'',aimX:50,aimY:50});
const networkStatus=reactive({state:'offline',code:'',peers:1,error:'',members:[]});
let engine,network,lastConfig={map:'desert',mode:'story',character:'male'};
let settings={muted:false,quality:'medium'};
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
 try{
  engine=new AnkaGame(viewport.value,s=>{Object.assign(state,s);nextTick(drawMinimap);});
  network=new GameNetwork({onEvent:(payload,id)=>engine.consumeNetwork(payload,id).catch(console.error),onStatus:s=>{Object.assign(networkStatus,s);engine.networkStatus(s);}});
  engine.setNetwork(network);engine.setMuted(settings.muted);engine.setQuality(settings.quality);
 }catch(error){state.phase='error';state.message=`无法启动三维画面：${error.message}`;console.error(error);}
});
onBeforeUnmount(()=>{network?.close();engine?.dispose();});
async function start(config){if(network?.connected&&!network.isHost){networkStatus.error='请等待房主部署小队';return;}lastConfig={...lastConfig,...config};try{await engine.start(lastConfig);}catch(error){state.phase='error';state.message=error.message;}}
async function host(config){engine.fx.unlockAudio();lastConfig={...lastConfig,...config};try{await network.host(config.mode||'coop');engine.state.mode=config.mode||'coop';engine.preview(config.map,config.character);engine.emit();}catch(error){networkStatus.error=error.message;}}
async function join(config){engine.fx.unlockAudio();state.character=config.character||'male';engine.state.character=state.character;try{await network.join(config.code);state.mode=network.mode;network.send({type:'ready'});}catch(error){networkStatus.error=error.message;}}
function disconnect(){network?.close();engine?.toMenu();}
function menu(){network?.close();engine?.toMenu();}
function setFire(value){if(!engine)return;if(value)engine.fx.unlockAudio();engine.heldFire=value;}
function ability(id){if(!engine||state.phase!=='playing')return;if(id==='crouch'){engine.keys.has('KeyC')?engine.keys.delete('KeyC'):engine.keys.add('KeyC');}else engine[id]?.();}
function mute(value){settings.muted=value;engine?.setMuted(value);saveSettings();}
function quality(value){settings.quality=value;engine?.setQuality(value);saveSettings();}
function touchLook(delta){if(!engine)return;engine.lookYaw-=delta.x*.006;engine.lookPitch=Math.max(-.5,Math.min(.38,engine.lookPitch-delta.y*.004));engine.aimNdc.set(0,0);}
</script>
<template>
 <main class="game-root">
  <div ref="viewport" class="game-viewport"></div>
  <GameUI :state="state" :network-status="networkStatus" @start="start" @preview="engine?.preview($event.map,$event.character)" @pause="engine?.pause()" @resume="engine?.resume()" @menu="menu" @retry="start(lastConfig)" @weapon="engine?.setWeapon($event)" @ability="ability" @mute="mute" @quality="quality" @host="host" @join="join" @disconnect="disconnect" @touch-move="engine && (engine.touchMove=$event)" @touch-look="touchLook" @fire="setFire" />
 </main>
</template>
<style>
*{box-sizing:border-box}html,body,#app,.game-root,.game-viewport{width:100%;height:100%;margin:0;overflow:hidden}body{background:#172630;color:#fff;font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif}.game-root{position:relative}.game-viewport{position:absolute;inset:0}.game-viewport canvas{display:block;width:100%;height:100%;outline:none;touch-action:none}button,input,select{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid #ffe2a0;outline-offset:3px}button:disabled{cursor:wait}a{color:inherit}
</style>
