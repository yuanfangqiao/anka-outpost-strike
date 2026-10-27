/** Host simulates combat. Peers never grant themselves health, ammo or kills. */
import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { NavigationGrid } from './navigation.js';
import { act, explosion, vector } from './online-combat.js';
import { chooseSpawn } from './arena-layout.js';
import { SupplyField, SUPPLY_NAMES } from './supplies.js';
const point=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const inventory=()=>WEAPONS.map(w=>({ammo:w.mag,reserve:w.reserve}));

export class OnlineDuel{
 constructor(game,room){
  this.game=game;this.room=room;this.net=game.network;this.host=this.net.isHost;
  this.local=this.net.localId;this.players={};this.seq=0;this.received=-1;this.timer=0;this.ended=false;
  this.nav=new NavigationGrid(game.world);game.waveDelay=0;game.pendingSpawns=[];
  this.supplies=new SupplyField(game);game.supplies=this.supplies;
  for(const [id,info]of Object.entries(room.players)){
   this.players[id]={id,name:info.name,kind:info.character,hp:120,shield:0,kills:0,deaths:0,
    p:[],yaw:0,moving:false,crouching:false,weapon:0,inventory:inventory(),medkits:3,grenades:3,shieldCharges:2,
    protection:2,immunity:0,respawn:0,reload:0,spawn:0,lastShot:-100,lastGrenade:-100,lastRoll:-100,lastMove:game.now};
  }
  Object.values(this.players).forEach((p,i)=>this.spawn(p,i));
  game.roundTimer=room.rules.duration;game.online=this;this.publish();
 }
 spawn(p,index){
  const g=this.game,others=Object.values(this.players).filter(q=>q!==p&&q.p.length);
  const place=others.length?chooseSpawn(g,others.map(q=>point(...q.p)),p.p.length?point(...p.p):null,this.nav):g.world.playerSpawn.clone();
  Object.assign(p,{p:place.toArray(),hp:120,shield:0,protection:2,immunity:0,respawn:0,reload:0,
   inventory:inventory(),grenades:3,medkits:3,shieldCharges:2,spawn:p.spawn+1});
  if(p.id===this.local)this.positionLocal(p);
 }
 positionLocal(p){
  const g=this.game;g.player.group.position.fromArray(p.p);g.velocityY=0;g.grounded=true;
  g.lookYaw=Math.atan2(-p.p[0],-p.p[2]);
  g.aimNdc.set(0,0);g.deadTimer=0;g.reloadLeft=0;g.heldFire=false;
  g.camera.position.copy(g.player.group.position).add(point(-Math.sin(g.lookYaw)*5.9,2.75,-Math.cos(g.lookYaw)*5.9));
 }
 action(action,extra={}){
  const g=this.game,p=this.players[this.local];
  if(g.state.phase!=='playing'||!p||p.hp<=0)return;
  if(action==='shot'&&(g.fireCooldown>0||p.reload>0))return;
  if(action==='shot'&&p.inventory[g.state.weapon].ammo<=0){this.action('reload');return;}
  const payload={type:'action',action,weapon:g.state.weapon,view:g.state.perspective,...extra};
  if(action==='shot')g.fireCooldown=1/WEAPONS[g.state.weapon].rate;
  if(this.host){p.p=g.player.group.position.toArray();p.crouching=g.keys.has('KeyC');act(this,this.local,payload);}
  else this.net.send(payload);
 }
 effect(payload){this.showEffect(payload);this.net.broadcast({type:'pvp-effect',...payload});}
 showEffect(p){
  const g=this.game;
  if(p.kind==='shot'&&vector(p.from)&&vector(p.to)){if(p.shooter===this.local)g.showPlayerShot(point(...p.to),WEAPONS[p.weapon??g.state.weapon]);else g.fx.fire(point(...p.from),point(...p.to),{color:p.color});if(p.shooter===this.local&&p.hit){g.state.hit=true;g.hitTime=.14;}}
  else if(p.kind==='explosion'&&vector(p.p))g.fx.explosion(point(...p.p),{radius:p.radius});
  else if(p.kind==='heal'&&vector(p.p))g.fx.heal(point(...p.p));
  else if(p.kind==='shield'&&vector(p.p))g.fx.shield(point(...p.p));
  else if(p.kind==='pickup'&&p.player===this.local){g.notice(`已拾取${SUPPLY_NAMES[p.supply]||'补给'}`);g.fx.heal(g.player.group.position);}
 }
 consume(payload,id){
  if(!payload||typeof payload!=='object')return;
  if(this.host){
   const p=this.players[id];if(!p||id===this.local)return;
   if(payload.type==='action')act(this,id,payload);
   if(payload.type==='player'&&vector(payload.p)&&Number.isFinite(payload.yaw)&&p.hp>0){
    const next=point(...payload.p),old=point(...p.p),dt=Math.max(.02,Math.min(.3,this.game.now-p.lastMove));p.lastMove=this.game.now;
    if(next.distanceTo(old)>14*dt+.65||next.y<0||next.y>5)return;
    const corrected=old.clone();corrected.y=next.y;this.game.moveObject(corrected,next.x-old.x,next.z-old.z);
    p.p=corrected.toArray();p.yaw=payload.yaw;p.moving=!!payload.moving;p.crouching=!!payload.crouching;
    if(Number.isInteger(payload.weapon)&&payload.weapon>=0&&payload.weapon<7)p.weapon=payload.weapon;
   }
  }else if(id===this.room.host){
   if(payload.type==='pvp-state'&&Number.isInteger(payload.seq)&&payload.seq>this.received&&Array.isArray(payload.players)){
    if(payload.players.length!==2||!payload.players.every(p=>this.players[p.id]&&vector(p.p)&&Number.isFinite(p.hp)&&p.hp>=0&&p.hp<=120))return;
    this.received=payload.seq;
    for(const data of payload.players){const previous=this.players[data.id];this.players[data.id]={...previous,...data};
     if(data.id===this.local){if(data.spawn!==previous.spawn)this.positionLocal(data);else if(point(...data.p).distanceTo(this.game.player.group.position)>1.8)this.game.player.group.position.lerp(point(...data.p),.5);}}
    if(Number.isFinite(payload.remaining))this.game.roundTimer=Math.max(0,payload.remaining);this.supplies.receive(payload.supplies);this.publish();
   }else if(payload.type==='pvp-effect')this.showEffect(payload);
   else if(payload.type==='pvp-finish'&&payload.scores){for(const p of Object.values(this.players))p.kills=payload.scores[p.id]||0;this.finish(true);}
  }
 }
 tick(dt){
  const g=this.game,local=this.players[this.local];if(this.ended)return;
  if(this.host){
   if(this.net.now&&this.room.starts_at>0)g.roundTimer=Math.max(0,this.room.rules.duration-(this.net.now()-this.room.starts_at-(this.room.paused_total||0)));
   local.p=g.player.group.position.toArray();local.yaw=g.lookYaw;local.moving=g.moving;local.weapon=g.state.weapon;local.crouching=g.keys.has('KeyC');
   for(const p of Object.values(this.players)){
    p.protection=Math.max(0,p.protection-dt);p.immunity=Math.max(0,p.immunity-dt);
    if(p.hp<=0){p.respawn=Math.max(0,p.respawn-dt);if(p.respawn===0)this.spawn(p);}
    if(p.reload>0){p.reload=Math.max(0,p.reload-dt);if(p.reload===0){const item=p.inventory[p.reloadWeapon],amount=Math.min(WEAPONS[p.reloadWeapon].mag-item.ammo,item.reserve);item.ammo+=amount;item.reserve-=amount;}}
   }
   this.supplies.authoritative(dt,this.players,(node,p)=>this.effect({kind:'pickup',supply:node.kind,player:p.id,p:node.mesh.position.toArray()}));
  }
  this.publish();this.timer-=dt;if(this.timer>0)return;this.timer=.05;
  if(this.host)this.net.broadcast({type:'pvp-state',seq:++this.seq,remaining:g.roundTimer,players:Object.values(this.players),supplies:this.supplies.snapshot()});
  else this.net.send({type:'player',p:g.player.group.position.toArray(),yaw:g.lookYaw,moving:g.moving,crouching:g.keys.has('KeyC'),weapon:g.state.weapon});
 }
 publish(){
  const g=this.game,local=this.players[this.local],enemy=Object.values(this.players).find(p=>p.id!==this.local);if(!enemy||!local)return;
  const before=g.state.hp;Object.assign(g.state,{hp:local.hp,shield:local.shield,kills:local.kills,deaths:local.deaths,score:local.kills*100,grenades:local.grenades,medkits:local.medkits,shieldCharges:local.shieldCharges,reloading:local.reload/(WEAPONS[local.reloadWeapon||0].reload),message:'好友对战 · 先得 10 分或三分钟内领先获胜'});
  if(before>local.hp){g.fx.damage();g.player.hurtTime=.25;}
  g.inventory=local.inventory;g.selectInventory();g.deadTimer=local.respawn;g.invulnerable=Math.max(local.protection,local.immunity);
  let remote=g.remotes.get(enemy.id);
  if(!remote){const actor=g.createDuelActor(enemy.kind);g.scene.add(actor.group);remote={actor,target:point(...enemy.p)};actor.group.position.fromArray(enemy.p);g.remotes.set(enemy.id,remote);}
  Object.assign(remote,{hp:enemy.hp,dead:enemy.hp<=0,moving:enemy.moving,yaw:enemy.yaw});remote.target.fromArray(enemy.p);remote.actor.setWeapon(WEAPONS[enemy.weapon]?.id||'rifle');
  const projected=remote.actor.group.position.clone().add(point(0,2.25,0)).project(g.camera);
  g.state.elapsed=this.room.rules.duration-g.roundTimer;
  g.state.duel={aiType:'online',localRole:this.host?'host':'guest',playerKills:local.kills,botKills:enemy.kills,target:this.room.rules.target,
   opponentName:enemy.name,opponentHp:enemy.hp,opponentProtected:enemy.protection>0,opponentRespawn:Math.ceil(enemy.respawn),opponentState:enemy.hp<=0?'等待复活':'真人对战',respawn:Math.ceil(local.respawn),result:this.result,
   label:{x:(projected.x+1)*50,y:(1-projected.y)*50,visible:enemy.hp>0&&!g.blocked(g.camera.position,remote.actor.group.position.clone().add(point(0,1.6,0)))&&projected.z>-1&&projected.z<1&&Math.abs(projected.x)<.96&&Math.abs(projected.y)<.95}};
 }
 finish(remote=false){
  if(this.ended||(!this.host&&!remote))return;this.ended=true;
  const local=this.players[this.local],other=Object.values(this.players).find(p=>p.id!==this.local);
  this.result=local.kills===other.kills?'draw':local.kills>other.kills?'win':'lose';
  const g=this.game;this.publish();g.state.phase=this.result==='lose'?'defeat':'victory';g.heldFire=false;g.keys.clear();document.exitPointerLock?.();g.emit();
  if(this.host){this.net.broadcast({type:'pvp-finish',scores:Object.fromEntries(Object.values(this.players).map(p=>[p.id,p.kills]))});
   this.net.command('finished',{round:this.room.round}).catch(console.error);}
 }
 explode(projectile){explosion(this,projectile);}
 dispose(){this.ended=true;}
}
