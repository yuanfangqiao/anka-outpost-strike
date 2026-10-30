import * as THREE from 'three';
import { createWorld } from './world.js';
import { createRobot, animateRobot, createPickup, createGrenade } from './assets.js';
import { CombatEffects } from './effects.js';
import { GameActor, preloadActors } from './actor.js';
import { WEAPONS, ENEMIES, MAPS, SAVE_KEY } from './config.js';

const v3=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const flatDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp=THREE.MathUtils.clamp;
const UP=v3(0,1,0);

export class AnkaGame {
 constructor(container,onState=()=>{}) {
  this.container=container;this.onState=onState;
  this.state={phase:'loading',loading:0,mode:'story',map:'desert',character:'male',hp:120,maxHp:120,shield:0,ammo:28,reserve:196,weapon:0,reloading:0,grenades:3,medkits:3,shieldCharges:2,wave:0,kills:0,score:0,elapsed:0,remaining:0,goal:0,boss:null,hit:false,message:'正在集结小队…',notice:'',combo:0,room:'',peers:1,network:'offline',muted:false,aimX:50,aimY:50,damagePulse:0,roundTime:180};
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;
  this.renderer.domElement.tabIndex=0;this.renderer.domElement.setAttribute('aria-label','ANKA 三维游戏画面');container.append(this.renderer.domElement);
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(58,1,.08,180);
  this.scene.add(new THREE.HemisphereLight(0xe6f3ff,0x8e653f,2.5));
  this.sun=new THREE.DirectionalLight(0xffe8c1,3.1);this.sun.position.set(-14,25,12);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);
  Object.assign(this.sun.shadow.camera,{left:-30,right:30,top:27,bottom:-27,near:1,far:85});this.sun.shadow.bias=-.00025;this.sun.shadow.normalBias=.04;
  this.scene.add(this.sun,this.sun.target);
  const fill=new THREE.DirectionalLight(0xb3d5f3,.65);fill.position.set(8,8,-15);this.scene.add(fill);
  this.projectileGeometry=new THREE.SphereGeometry(.1,8,6);this.projectileMaterials={enemy:new THREE.MeshBasicMaterial({color:0xff6046}),player:new THREE.MeshBasicMaterial({color:0x77e8ff})};this.fx=new CombatEffects(this.scene);this.world=null;this.player=null;this.buddy=null;
  this.matchScores={};this.enemies=[];this.pickups=[];this.projectiles=[];this.telegraphs=[];this.remotes=new Map();this.nextEnemy=1;this.network=null;
  this.keys=new Set();this.touchMove={x:0,y:0};this.heldFire=false;this.lookYaw=Math.PI;this.lookPitch=-.04;this.aimNdc=new THREE.Vector2(0,0);
  this.raycaster=new THREE.Raycaster();this.velocityY=0;this.grounded=true;this.rollLeft=0;this.rollCooldown=0;this.invulnerable=0;this.fireCooldown=0;this.reloadLeft=0;
  this.roundTimer=0;this.waveDelay=0;this.noticeTime=0;this.comboTime=0;this.netTimer=0;this.uiTimer=0;this.now=0;this.moving=false;this.deadTimer=0;
  this.inventory=WEAPONS.map(w=>({ammo:w.mag,reserve:w.reserve}));this.pendingSpawns=[];this.spawnTimer=0;
  this.listeners=[];this.bindInput();
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();
  this.setWorld('desert');
  this.lastTime=performance.now();this.renderer.setAnimationLoop(time=>this.frame(time));
  this.ready=this.load();
 }
 async load(){try{await preloadActors(p=>{this.state.loading=p;this.emit();});this.player=new GameActor('male');this.scene.add(this.player.group);this.player.group.position.set(1,0,5.4);this.player.group.rotation.y=Math.PI;
   this.buddy=new GameActor('female');this.scene.add(this.buddy.group);this.buddy.group.position.set(-.8,0,5);this.buddy.group.rotation.y=Math.PI;
   this.state.phase='menu';this.state.message='小队已就绪';this.emit();
  }catch(error){this.state.phase='error';this.state.message=error.message;this.emit();console.error(error);}}
 emit(){this.state.aimX=(this.aimNdc.x+1)*50;this.state.aimY=(1-this.aimNdc.y)*50;this.state.partner=this.buddy?{name:this.buddy.kind==='male'?'小杰':'小葵',hp:this.buddy.hp??120,maxHp:120}:null;this.state.damagePulse=this.fx.damagePulse;this.state.roundTime=Math.ceil(this.roundTimer);this.onState({...this.state,weaponInfo:WEAPONS[this.state.weapon]});}
 listen(target,name,fn,opts){target.addEventListener(name,fn,opts);this.listeners.push(()=>target.removeEventListener(name,fn,opts));}
 resize(){const w=this.container.clientWidth,h=this.container.clientHeight;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
 bindInput(){
  this.listen(window,'keydown',e=>{if(e.target instanceof HTMLInputElement)return;const code=e.code;
   if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(code))e.preventDefault();
   if(e.repeat)return;this.keys.add(code);
   if(code==='Escape'){if(this.state.phase==='playing')this.pause();else if(this.state.phase==='paused')this.resume();}
   if(this.state.phase!=='playing')return;
   if(code==='KeyR')this.reload();if(code==='Space')this.jump();if(code==='ShiftLeft'||code==='ShiftRight')this.roll();
   if(code==='KeyG')this.grenade();if(code==='KeyE')this.medkit();if(code==='KeyQ')this.shield();if(code==='KeyF')this.interact();
   if(/^Digit[1-7]$/.test(code))this.setWeapon(Number(code.slice(-1))-1);
  });
  this.listen(window,'keyup',e=>this.keys.delete(e.code));
  this.listen(window,'blur',()=>{this.keys.clear();this.heldFire=false;if(this.state.phase==='playing'&&!this.network?.connected)this.pause();});
  this.listen(this.renderer.domElement,'contextmenu',e=>e.preventDefault());
  this.listen(this.renderer.domElement,'pointerdown',e=>{if(e.pointerType==='touch')return;this.fx.unlockAudio();if(this.state.phase==='playing'){if(e.button===0)this.heldFire=true;if(e.button===2)this.keys.add('MouseRight');this.renderer.domElement.focus();}});
  this.listen(window,'pointerup',e=>{if(e.button===0)this.heldFire=false;if(e.button===2)this.keys.delete('MouseRight');});
  this.listen(this.renderer.domElement,'pointermove',e=>{if(this.state.phase!=='playing'||e.pointerType==='touch')return;
   if(document.pointerLockElement===this.renderer.domElement||e.buttons===2){this.lookYaw-=e.movementX*.0028;this.lookPitch=clamp(this.lookPitch-e.movementY*.002,-.5,.38);this.aimNdc.set(0,0);}
   else{const rect=this.renderer.domElement.getBoundingClientRect();this.aimNdc.set((e.clientX-rect.left)/rect.width*2-1,-((e.clientY-rect.top)/rect.height*2-1));}
  });
  this.listen(this.renderer.domElement,'wheel',e=>{if(this.state.phase!=='playing')return;e.preventDefault();this.setWeapon((this.state.weapon+(e.deltaY>0?1:6))%7);},{passive:false});
 }
 setWorld(theme){if(this.world){this.scene.remove(this.world.group);this.world.dispose?.();}this.world=createWorld(theme);this.scene.add(this.world.group);this.scene.background=new THREE.Color(this.world.lighting.sky);this.scene.fog=new THREE.FogExp2(this.world.lighting.fog,theme==='city'?.009:.006);this.sun.color.set(this.world.lighting.key);this.state.map=theme;}
 preview(theme,kind){if(this.state.phase!=='menu')return;if(theme!==this.state.map)this.setWorld(theme);if(this.player&&kind!==this.player.kind)this.replacePlayer(kind);}
 replacePlayer(kind){if(this.player)this.player.dispose();this.player=new GameActor(kind);this.scene.add(this.player.group);this.state.character=kind;if(this.state.phase==='menu'&&this.buddy?.kind===kind){this.buddy.dispose();this.buddy=new GameActor(kind==='male'?'female':'male');this.scene.add(this.buddy.group);}}
 async start(config={}){
  await this.ready;this.roundId=config.session||globalThis.crypto?.randomUUID?.()||String(Date.now());this.fx.unlockAudio();this.keys.clear();this.heldFire=false;
  this.clearBattle();if(config.map&&config.map!==this.state.map)this.setWorld(config.map);
  const kind=config.character||this.state.character;if(kind!==this.player.kind)this.replacePlayer(kind);
  this.state={...this.state,phase:'playing',mode:config.mode||'story',character:kind,hp:120,shield:0,weapon:0,reloading:0,grenades:3,medkits:3,shieldCharges:2,wave:0,kills:0,score:0,elapsed:0,boss:null,remaining:0,goal:0,hit:false,combo:0,notice:'',message:`${MAPS.find(m=>m.id===this.state.map)?.name||'前线'} · 清除机械威胁`};
  this.matchScores={};this.inventory=WEAPONS.map(w=>({ammo:w.mag,reserve:w.reserve}));this.selectInventory();
  this.player.group.position.copy(this.world.playerSpawn);if(this.network?.connected)this.player.group.position.x+=Math.max(0,(this.members||[]).indexOf(this.network.localId))*1.6;this.player.group.rotation.y=Math.PI;this.aimNdc.set(0,0);this.player.setWeapon('rifle');this.lookYaw=Math.PI;this.lookPitch=-.035;
  this.velocityY=0;this.rollLeft=0;this.reloadLeft=0;this.invulnerable=2;this.fireCooldown=0;this.deadTimer=0;this.roundTimer=180;this.waveDelay=2;this.camera.position.copy(this.world.playerSpawn).add(v3(.95,2.75,5.9));
  if(this.buddy)this.buddy.dispose();this.buddy=null;
  if(this.state.mode==='coop'&&!this.network?.connected){this.buddy=new GameActor(kind==='male'?'female':'male');this.buddy.hp=120;this.buddy.cooldown=0;this.buddy.down=0;this.buddy.group.position.copy(this.player.group.position).add(v3(1.5,0,1.8));this.scene.add(this.buddy.group);}
  this.placePickups();this.emit();this.sendSession();
 }
 clearBattle(){for(const e of this.enemies)e.mesh.removeFromParent();for(const p of this.pickups)p.mesh.removeFromParent();for(const p of this.projectiles)p.mesh.removeFromParent();for(const t of this.telegraphs)t.mesh.removeFromParent();this.enemies=[];this.pickups=[];this.projectiles=[];this.telegraphs=[];this.pendingSpawns=[];this.waveDelay=0;for(const r of this.remotes.values())r.actor.dispose();this.remotes.clear();}
 toMenu(){this.state.phase='menu';this.keys.clear();this.heldFire=false;document.exitPointerLock?.();this.clearBattle();this.player.dead=false;this.player.group.position.set(1,0,5.4);if(!this.buddy){this.buddy=new GameActor(this.player.kind==='male'?'female':'male');this.scene.add(this.buddy.group);}this.buddy.group.position.set(-.8,0,5);this.emit();}
 pause(){this.state.phase='paused';this.heldFire=false;document.exitPointerLock?.();this.emit();}
 resume(){this.state.phase='playing';this.keys.clear();this.sendSession();this.emit();}
 setMuted(value){this.state.muted=value;this.fx.setMuted(value);this.emit();}
 setQuality(value){this.state.quality=value;this.renderer.setPixelRatio(Math.min(devicePixelRatio,value==='low'?1:value==='high'?2:1.6));this.renderer.shadowMap.enabled=value!=='low';this.resize();}
 setNetwork(network){this.network=network;}
 networkStatus(status){this.members=status.members||[];if(Array.isArray(status.members)){for(const [id,r] of this.remotes)if(!status.members.includes(id)){r.actor.dispose();this.remotes.delete(id);}}this.state.network=status.state;this.state.room=status.code||'';this.state.peers=status.peers||1;this.emit();if(this.state.phase==='playing'&&this.network?.isHost)this.sendSession();}
 sendSession(){if(this.network?.isHost&&this.state.phase==='playing')this.network.broadcast({type:'session',session:this.roundId,mode:this.state.mode,map:this.state.map,hostKind:this.state.character});}
 async consumeNetwork(payload,id){
  if(!payload||typeof payload.type!=='string')return;
  if(payload.type==='ready'&&this.network?.isHost){this.sendSession();return;}
  if(payload.type==='session'&&!this.network?.isHost&&(payload.session!==this.roundId||this.state.phase!=='playing')){await this.start({session:payload.session,mode:payload.mode,map:payload.map,character:this.state.character});return;}
  if(payload.type==='player'){
   id=this.network.isHost?id:(payload.id||id);if(id===this.network.localId)return;
   if(!Array.isArray(payload.p)||payload.p.length!==3||payload.p.some(n=>!Number.isFinite(n)))return;
   let remote=this.remotes.get(id);if(!remote){const actor=new GameActor(payload.kind==='female'?'female':'male');this.scene.add(actor.group);remote={actor,target:v3(),hp:120,kind:payload.kind,shot:0};this.remotes.set(id,remote);}
   remote.target.fromArray(payload.p);remote.yaw=payload.yaw||0;remote.moving=!!payload.moving;if(!(this.state.mode==='versus'&&this.network.isHost))remote.hp=payload.hp;remote.dead=remote.hp<=0;remote.actor.setWeapon(WEAPONS[payload.weapon]?.id||'rifle');
   if(this.network.isHost)this.network.broadcast({...payload,id},id);
  }
  if(payload.type==='shot'){
   if(!Array.isArray(payload.from)||!Array.isArray(payload.direction))return;
   const from=v3().fromArray(payload.from),dir=v3().fromArray(payload.direction).normalize();const weapon=WEAPONS[payload.weapon]||WEAPONS[0];
   this.fx.fire(from,from.clone().addScaledVector(dir,35),{color:weapon.color});
   if(this.network.isHost){if(weapon.projectile)this.launchProjectile(from,dir.clone().multiplyScalar(weapon.projectile==='rocket'?24:18).add(v3(0,weapon.projectile==='rocket'?0:3,0)),{team:'player',shooter:id,damage:weapon.damage,radius:weapon.radius,gravity:weapon.projectile==='rocket'?0:9,fuse:weapon.projectile==='rocket'?2.5:1.8,kind:weapon.projectile});else for(let i=0;i<weapon.pellets;i++)this.resolveShot(from,dir.clone().add(v3((Math.random()-.5)*weapon.spread,(Math.random()-.5)*weapon.spread,0)).normalize(),weapon,id,false);this.network.broadcast(payload,id);}
  }
  if(payload.type==='revive'){
   if(this.network.isHost){const from=this.remotes.get(id)?.actor.group.position,to=payload.to===this.network.localId?this.player.group.position:this.remotes.get(payload.to)?.actor.group.position;if(!from||!to||flatDistance(from,to)>3)return;this.network.broadcast(payload);}
   if(payload.to===this.network.localId&&this.state.hp<=0){this.state.hp=70;this.deadTimer=0;this.invulnerable=2;this.notice('队友已将你救起');this.fx.heal(this.player.group.position);}
  }
  if(payload.type==='damage'&&!this.network?.isHost&&payload.to===this.network?.localId)this.takeDamage(payload.amount||0);
  if(payload.type==='grenade'&&this.network?.isHost&&Array.isArray(payload.from)&&Array.isArray(payload.velocity)){this.launchProjectile(v3().fromArray(payload.from),v3().fromArray(payload.velocity),{team:'player',shooter:id,damage:110,radius:3.8,gravity:13,fuse:1.4,kind:'grenade'});}
  if(payload.type==='explosion'&&!this.network?.isHost){const p=v3().fromArray(payload.p);this.fx.explosion(p,{radius:payload.radius||3});}
  if(payload.type==='world'&&!this.network?.isHost){
   this.state.wave=payload.wave;this.state.remaining=payload.remaining;this.state.score=this.state.mode==='versus'?(payload.scores?.[this.network.localId]?.score||0):payload.score;if(this.state.mode==='versus')this.state.kills=payload.scores?.[this.network.localId]?.kills||0;this.state.boss=payload.boss;this.state.message=payload.message;
   const seen=new Set();for(const data of payload.enemies||[]){seen.add(data.id);let enemy=this.enemies.find(e=>e.id===data.id);if(!enemy){enemy=this.makeEnemy(data.kind,v3().fromArray(data.p),data.id);}enemy.mesh.position.lerp(v3().fromArray(data.p),.7);enemy.mesh.rotation.y=data.yaw;enemy.hp=data.hp;}
   for(const e of this.enemies)if(!seen.has(e.id))e.mesh.removeFromParent();this.enemies=this.enemies.filter(e=>seen.has(e.id));
  }
  if(payload.type==='finish'&&!this.network?.isHost){this.matchScores=payload.scores||this.matchScores;this.finish(payload.win);}
 }
 selectInventory(){const item=this.inventory[this.state.weapon];this.state.ammo=item.ammo;this.state.reserve=item.reserve;}
 setWeapon(index){if(!this.player||index<0||index>=WEAPONS.length)return;this.reloadLeft=0;this.state.reloading=0;this.state.weapon=index;this.player.setWeapon(WEAPONS[index].id);this.selectInventory();this.emit();}
 reload(){if(this.state.phase!=='playing'||this.reloadLeft>0)return;const w=WEAPONS[this.state.weapon],item=this.inventory[this.state.weapon];if(item.ammo===w.mag||item.reserve<=0)return;this.reloadLeft=w.reload;this.fx.reload();this.notice('正在换弹');}
 jump(){if(!this.grounded||this.rollLeft>0)return;this.velocityY=6.5;this.grounded=false;this.notice('跃过障碍');}
 roll(){if(this.rollCooldown>0||!this.grounded)return;this.rollLeft=.58;this.rollCooldown=1.8;this.invulnerable=.5;this.notice('战术翻滚');}
 medkit(){if(this.state.medkits<=0||this.state.hp>=120)return;this.state.medkits--;this.state.hp=Math.min(120,this.state.hp+65);this.fx.heal(this.player.group.position);this.notice('生命恢复 +65');this.emit();}
 shield(){if(this.state.shieldCharges<=0)return;this.state.shieldCharges--;this.state.shield=Math.min(100,this.state.shield+80);this.fx.shield(this.player.group.position);this.notice('护盾已部署');this.emit();}
 grenade(){if(this.state.grenades<=0||this.state.phase!=='playing')return;this.state.grenades--;const dir=this.aimDirection();const pos=this.player.group.position.clone().add(v3(0,1.2,0)).addScaledVector(dir,.45);this.launchProjectile(pos,dir.clone().multiplyScalar(12).add(v3(0,5,0)),{team:'player',damage:110,radius:3.8,gravity:13,fuse:1.4,kind:'grenade'});if(this.network?.connected&&!this.network.isHost)this.network.send({type:'grenade',from:pos.toArray(),velocity:dir.clone().multiplyScalar(12).add(v3(0,5,0)).toArray()});this.notice('手雷投掷');this.emit();}
 interact(){if(this.state.mode==='coop'&&this.network?.connected){const down=[...this.remotes.entries()].find(([id,r])=>r.hp<=0&&flatDistance(this.player.group.position,r.actor.group.position)<3);if(down){const [id,r]=down;r.hp=70;this.network.send({type:'revive',to:id});this.notice('正在救起队友');return;}}if(this.buddy&&this.buddy.hp<=0&&flatDistance(this.player.group.position,this.buddy.group.position)<3){this.buddy.hp=80;this.buddy.down=0;this.fx.heal(this.buddy.group.position);this.notice('搭档已救起');}else this.notice('靠近补给自动拾取；搭档倒地后按 F 救援');}
 notice(text){this.state.notice=text;this.noticeTime=2.0;}
 collision(x,z,r=.34,height=0){return this.world.colliders.some(c=>height<c.height-.1&&x+r>c.minX&&x-r<c.maxX&&z+r>c.minZ&&z-r<c.maxZ);}
 moveObject(position,dx,dz,r=.34){const b=this.world.bounds;if(!this.collision(position.x+dx,position.z,r,position.y))position.x+=dx;if(!this.collision(position.x,position.z+dz,r,position.y))position.z+=dz;position.x=clamp(position.x,b.minX+.8,b.maxX-.8);position.z=clamp(position.z,b.minZ+.8,b.maxZ-.8);}
 blocked(from,to){for(const c of this.world.colliders){const min=v3(c.minX,0,c.minZ),max=v3(c.maxX,c.height,c.maxZ);const ray=new THREE.Ray(from.clone(),to.clone().sub(from).normalize());const hit=ray.intersectBox(new THREE.Box3(min,max),v3());if(hit&&hit.distanceTo(from)<from.distanceTo(to)-.15)return true;}return false;}
 aimTarget(){
  this.raycaster.setFromCamera(this.aimNdc,this.camera);const ray=this.raycaster.ray;let distance=70,target=null,near=.105;
  for(const c of this.world.colliders){const hit=ray.intersectBox(new THREE.Box3(v3(c.minX,0,c.minZ),v3(c.maxX,c.height,c.maxZ)),v3());if(hit)distance=Math.min(distance,ray.origin.distanceTo(hit));}
  for(const e of this.enemies){if(e.hp<=0)continue;const center=e.mesh.position.clone().add(v3(0,e.mesh.userData.aimHeight||1,0));const projected=center.clone().project(this.camera),d=Math.hypot(projected.x-this.aimNdc.x,projected.y-this.aimNdc.y);if(projected.z<1&&d<near&&!this.blocked(ray.origin,center)){near=d;target=center;}}
  return target||ray.at(distance,v3());
 }
 aimDirection(){return this.aimTarget().sub(this.player.muzzle()).normalize();}
 fire(){if(this.fireCooldown>0||this.reloadLeft>0||this.rollLeft>0||this.state.hp<=0)return;const w=WEAPONS[this.state.weapon],item=this.inventory[this.state.weapon];if(item.ammo<=0){this.reload();return;}item.ammo--;this.selectInventory();this.fireCooldown=1/w.rate;this.player.fire();const from=this.player.muzzle();const direction=this.aimDirection();
  if(w.projectile){this.launchProjectile(from,direction.clone().multiplyScalar(w.projectile==='rocket'?24:18).add(v3(0,w.projectile==='rocket'?0:3,0)),{team:'player',damage:w.damage,radius:w.radius,gravity:w.projectile==='rocket'?0:9,fuse:w.projectile==='rocket'?2.5:1.8,kind:w.projectile});}
  else for(let i=0;i<w.pellets;i++){const d=direction.clone().add(v3((Math.random()-.5)*w.spread,(Math.random()-.5)*w.spread,(Math.random()-.5)*w.spread)).normalize();const to=this.resolveShot(from,d,w,this.network?.localId||'local',true);if(i<3)this.fx.fire(from,to,{color:w.color,heavy:w.id==='sniper'});}
  if(this.network?.connected)this.network.send({type:'shot',from:from.toArray(),direction:direction.toArray(),weapon:this.state.weapon});
 }
 resolveShot(origin,direction,w,shooter='local',local=true){
  const ray=new THREE.Ray(origin,direction);let distance=w.range,hit=null;let isPlayer=false;for(const c of this.world.colliders){const point=ray.intersectBox(new THREE.Box3(v3(c.minX,0,c.minZ),v3(c.maxX,c.height,c.maxZ)),v3());if(point)distance=Math.min(distance,point.distanceTo(origin));}
  for(const e of this.enemies){if(e.hp<=0)continue;const center=e.mesh.position.clone().add(v3(0,e.mesh.userData.aimHeight||1,0));const t=center.clone().sub(origin).dot(direction);const radius=ENEMIES[e.kind].radius;if(t>0&&t<distance&&ray.distanceToPoint(center)<radius&&!this.blocked(origin,center)){distance=t;hit=e;}}
  if(this.state.mode==='versus'&&this.network?.isHost){
   const targets=[...this.remotes.entries()].filter(([id,r])=>id!==shooter&&r.hp>0).map(([id,r])=>({id,p:r.actor.group.position,hp:r.hp}));
   if(shooter!==this.network.localId&&this.state.hp>0)targets.push({id:this.network.localId,p:this.player.group.position,hp:this.state.hp});
   for(const target of targets){const center=target.p.clone().add(v3(0,1.1,0)),t=center.clone().sub(origin).dot(direction);if(t>0&&t<distance&&ray.distanceToPoint(center)<.55&&!this.blocked(origin,center)){distance=t;hit=target;isPlayer=true;}}
  }
  const point=origin.clone().addScaledVector(direction,distance);
  if(hit){this.fx.impact(point,{color:w.color});if(local)this.state.hit=true;
   if(isPlayer){if(hit.id===this.network.localId){const hp=this.state.hp;this.takeDamage(w.damage);if(hp>0&&this.state.hp<=0)this.awardPvPKill(shooter);}else{const remote=this.remotes.get(hit.id);if(remote)remote.hp=Math.max(0,remote.hp-w.damage);this.network.broadcast({type:'damage',to:hit.id,amount:w.damage});if(remote?.hp===0){remote.respawn=3;this.awardPvPKill(shooter);}}}
   else if(!this.network?.connected||this.network.isHost)this.damageEnemy(hit,w.damage,shooter,origin);
  }
  return point;
 }
 awardPvPKill(shooter){const result=this.matchScores[shooter]||(this.matchScores[shooter]={score:0,kills:0});result.score+=100;result.kills++;if(shooter===this.network?.localId){this.state.score=result.score;this.state.kills=result.kills;this.notice('击倒敌方先锋 +100');}}
 damageEnemy(enemy,damage,shooter='local',origin=null){if(enemy.hp<=0)return;let amount=damage;
  if(enemy.kind==='shield'&&origin){const forward=v3(0,0,1).applyQuaternion(enemy.mesh.quaternion),toward=origin.clone().sub(enemy.mesh.position).normalize();if(forward.dot(toward)>.35)amount*=.28;}
  enemy.hp-=amount;enemy.hitFlash=.09;
  if(enemy.hp<=0){this.fx.explosion(enemy.mesh.position.clone().add(v3(0,.7,0)),{radius:enemy.kind==='boss'?4:1.2});enemy.mesh.removeFromParent();this.state.kills++;this.state.combo=this.comboTime>0?this.state.combo+1:1;this.comboTime=2.6;this.state.score+=ENEMIES[enemy.kind].score*(1+Math.min(4,this.state.combo-1)*.15);
   if(Math.random()<.28)this.addPickup(Math.random()<.45?'health':'ammo',enemy.mesh.position);
   if(enemy.kind==='boss'){this.state.boss=null;this.notice('战争机甲已摧毁！');}
  }
 }
 launchProjectile(position,velocity,data){if(this.projectiles.length>100)return;const mesh=data.kind==='grenade'?createGrenade():new THREE.Mesh(this.projectileGeometry,this.projectileMaterials[data.team]||this.projectileMaterials.player);mesh.position.copy(position);this.scene.add(mesh);this.projectiles.push({mesh,velocity:velocity.clone(),life:data.fuse||3,...data});}
 explode(projectile){const pos=projectile.mesh.position;this.fx.explosion(pos,{radius:projectile.radius,color:projectile.team==='enemy'?0xff5536:0xffa048});
  if(projectile.team==='player'&&(!this.network?.connected||this.network.isHost)){for(const e of this.enemies){const d=e.mesh.position.distanceTo(pos);if(d<projectile.radius)this.damageEnemy(e,projectile.damage*(1-.65*d/projectile.radius));}}
  else if(projectile.team==='enemy'&&flatDistance(pos,this.player.group.position)<projectile.radius)this.takeDamage(projectile.damage);
  if(projectile.team==='player'&&this.state.mode==='versus'&&this.network?.isHost){const shooter=projectile.shooter||this.network.localId;for(const [id,r]of this.remotes)if(id!==shooter&&r.hp>0&&flatDistance(pos,r.actor.group.position)<projectile.radius){r.hp=Math.max(0,r.hp-projectile.damage);this.network.broadcast({type:'damage',to:id,amount:projectile.damage});if(r.hp===0){r.respawn=3;this.awardPvPKill(shooter);}}if(shooter!==this.network.localId&&this.state.hp>0&&flatDistance(pos,this.player.group.position)<projectile.radius){this.takeDamage(projectile.damage);if(this.state.hp<=0)this.awardPvPKill(shooter);}}
  this.network?.isHost&&this.network.broadcast({type:'explosion',p:pos.toArray(),radius:projectile.radius});
 }
 takeDamage(amount){if(this.invulnerable>0||this.state.hp<=0||this.state.phase!=='playing')return;const absorbed=Math.min(this.state.shield,amount);this.state.shield-=absorbed;this.state.hp=Math.max(0,this.state.hp-(amount-absorbed));this.fx.damage();this.player.hurtTime=.25;this.invulnerable=.12;this.emit();
  if(this.state.hp<=0){if(this.state.mode==='versus'){this.deadTimer=3;this.notice('重新部署倒计时');}else if(this.state.mode==='coop'&&(this.network?.connected||this.buddy?.hp>0)){this.deadTimer=30;this.notice('倒地：等待搭档救援');}else this.finish(false);}
 }
 placePickups(){for(const [kind,p] of [['health',[-8,0,8]],['ammo',[8,0,8]],['shield',[-8,0,-7]],['grenade',[8,0,-7]]])this.addPickup(kind,v3(...p),true);}
 addPickup(kind,pos,persistent=false){const mesh=createPickup(kind);mesh.position.copy(pos).y=.45;this.scene.add(mesh);this.pickups.push({mesh,kind,persistent,cooldown:0,baseY:.45});}
 collect(pickup){const kind=pickup.kind;if(kind==='health'){if(this.state.hp>=120)return;this.state.hp=Math.min(120,this.state.hp+45);this.fx.heal(this.player.group.position);this.notice('医疗补给 +45');}
  else if(kind==='ammo'){for(const [i,item]of this.inventory.entries())item.reserve=Math.min(WEAPONS[i].reserve*2,item.reserve+WEAPONS[i].mag*2);this.selectInventory();this.notice('全武器弹药补充');}
  else if(kind==='shield'){this.state.shieldCharges=Math.min(4,this.state.shieldCharges+1);this.notice('获得护盾装置');}
  else{this.state.grenades=Math.min(6,this.state.grenades+2);this.notice('手雷 +2');}
  pickup.mesh.visible=false;pickup.cooldown=pickup.persistent?24:Infinity;
 }
 nextWave(){this.state.wave++;const wave=this.state.wave,mode=this.state.mode;
  const versus=mode==='versus';if(versus&&this.network?.connected){this.state.message='团队对战 · 争夺击杀';return;}
  const boss=(mode==='survival'&&wave%5===0)||((mode==='story'||mode==='coop')&&wave===3);
  const count=boss?5:Math.min(17,5+wave*3);
  const available=wave===1?['walker','walker','drone','bomber']:['walker','sniper','drone','bomber','shield','elite'];
  this.pendingSpawns=Array.from({length:count},(_,i)=>available[(i+wave)%available.length]);if(boss)this.pendingSpawns.unshift('boss');
  this.state.goal=this.pendingSpawns.length;this.state.remaining=this.pendingSpawns.length;this.spawnTimer=.4;this.state.message=boss?'警报：战争机甲进入战场':`第 ${wave} 波 · 清除机器军团`;this.notice(boss?'BOSS APPROACHING':`WAVE ${String(wave).padStart(2,'0')}`);
  if(wave>1){this.state.hp=Math.min(120,this.state.hp+18);this.state.grenades=Math.min(6,this.state.grenades+1);}
 }
 makeEnemy(kind,position,id=null){const cfg=ENEMIES[kind]||ENEMIES.walker,mesh=createRobot(kind);mesh.position.copy(position);if(kind==='drone')mesh.position.y=1.7;this.scene.add(mesh);const e={id:id||this.nextEnemy++,kind,mesh,hp:cfg.hp*(1+Math.max(0,this.state.wave-1)*.12),maxHp:cfg.hp*(1+Math.max(0,this.state.wave-1)*.12),cooldown:1+Math.random(),phase:1,attackTimer:0,hitFlash:0};this.enemies.push(e);return e;}
 spawnEnemy(kind){const points=this.world.enemySpawns.filter(p=>flatDistance(p,this.player.group.position)>10);const p=(points.length?points:this.world.enemySpawns)[Math.floor(Math.random()*(points.length||this.world.enemySpawns.length))].clone();if(kind==='boss')p.set(0,0,-10);this.makeEnemy(kind,p);}
 telegraph(center,radius=4,damage=25){const geometry=new THREE.RingGeometry(radius-.08,radius,48);const material=new THREE.MeshBasicMaterial({color:0xff4e39,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false});const mesh=new THREE.Mesh(geometry,material);mesh.rotation.x=-Math.PI/2;mesh.position.copy(center);mesh.position.y=.04;this.scene.add(mesh);this.telegraphs.push({mesh,life:1.1,radius,damage});}
 updateEnemies(dt){const playerPos=this.player.group.position;
  for(const e of this.enemies){if(e.hp<=0)continue;const cfg=ENEMIES[e.kind];e.cooldown-=dt;
   const targets=this.state.hp>0?[{p:playerPos,kind:'local'}]:[];if(this.buddy&&this.buddy.hp>0)targets.push({p:this.buddy.group.position,kind:'buddy'});
   if(this.network?.isHost)for(const [id,r]of this.remotes)if(r.hp>0)targets.push({p:r.actor.group.position,kind:id});
   if(!targets.length)continue;targets.sort((a,b)=>flatDistance(e.mesh.position,a.p)-flatDistance(e.mesh.position,b.p));const target=targets[0],dist=flatDistance(e.mesh.position,target.p);
   const direction=target.p.clone().sub(e.mesh.position);direction.y=0;direction.normalize();e.mesh.rotation.y=Math.atan2(direction.x,direction.z);
   let speed=cfg.speed*(1+Math.min(20,Math.max(0,this.state.wave-1))*.025);if(e.kind==='boss'){e.phase=e.hp<e.maxHp*.33?3:e.hp<e.maxHp*.66?2:1;speed*=1+.15*(e.phase-1);this.state.boss={hp:e.hp,max:e.maxHp,phase:e.phase,name:cfg.name};}
   const stop=e.kind==='bomber'?1.2:e.kind==='sniper'?17:e.kind==='boss'?8:8;
   if(dist>stop){let dx=direction.x*speed*dt,dz=direction.z*speed*dt;if(e.kind==='drone'){e.mesh.position.x+=dx;e.mesh.position.z+=dz;}else{const before=e.mesh.position.clone();this.moveObject(e.mesh.position,dx,dz,cfg.radius*.8);if(flatDistance(before,e.mesh.position)<speed*dt*.15){this.moveObject(e.mesh.position,-direction.z*speed*dt,direction.x*speed*dt,cfg.radius*.8);}}}
   animateRobot(e.mesh,this.now,dist>stop?speed:0);
   if(e.cooldown<=0&&dist<cfg.range){
    const muzzle=e.mesh.position.clone().add(v3(0,e.mesh.userData.aimHeight||1,0)),aim=target.p.clone().add(v3(0,1.0,0));
    if(!this.blocked(muzzle,aim)){
     if(e.kind==='bomber'){this.fx.explosion(e.mesh.position,{radius:3});if(dist<3)this.damageTarget(target.kind,cfg.damage);e.hp=0;e.mesh.removeFromParent();}
     else if(e.kind==='boss'){
      if(e.phase>=2){this.telegraph(target.p.clone(),e.phase===3?5:3.8,30);if(e.phase===3)this.telegraph(target.p.clone().add(v3(3,0,-2)),3.5,25);}
      for(let i=0;i<e.phase;i++){const dir=aim.clone().sub(muzzle).normalize().add(v3((i-(e.phase-1)/2)*.09,0,0)).normalize();this.launchProjectile(muzzle,dir.multiplyScalar(12),{team:'enemy',damage:cfg.damage,radius:1.8,kind:'energy',fuse:3.5});}
     }else{this.fx.fire(muzzle,aim,{color:0xff6347});const movementPenalty=this.moving?.5:1;if(Math.random()<.65*movementPenalty)this.damageTarget(target.kind,cfg.damage);}
    }
    e.cooldown=cfg.interval/(e.kind==='boss'?1+.2*(e.phase-1):1);
   }
  }
  this.enemies=this.enemies.filter(e=>e.hp>0);this.state.remaining=this.enemies.length+this.pendingSpawns.length;
 }
 damageTarget(target,amount){if(target==='local')this.takeDamage(amount);else if(target==='buddy'){this.buddy.hp=Math.max(0,this.buddy.hp-amount);if(this.buddy.hp===0)this.notice('搭档倒地，靠近后按 F 救起');}else this.network?.broadcast({type:'damage',to:target,amount});}
 updateBuddy(dt){if(!this.buddy)return;const b=this.buddy;if(this.state.hp<=0&&b.hp>0&&flatDistance(this.player.group.position,b.group.position)<3){this.state.hp=70;this.deadTimer=0;this.invulnerable=2;this.notice('搭档已救起你');}if(b.hp<=0){b.update(dt,{dead:true});return;}b.cooldown-=dt;
  const desired=this.player.group.position.clone().add(v3(Math.sin(this.lookYaw+1.8)*2,0,Math.cos(this.lookYaw+1.8)*2));const delta=desired.clone().sub(b.group.position);let moving=delta.length()>1.2;
  if(moving){delta.normalize();this.moveObject(b.group.position,delta.x*4.5*dt,delta.z*4.5*dt);}
  const target=this.enemies.filter(e=>e.hp>0).sort((a,c)=>flatDistance(a.mesh.position,b.group.position)-flatDistance(c.mesh.position,b.group.position))[0];
  if(target){const dir=target.mesh.position.clone().sub(b.group.position);b.group.rotation.y=Math.atan2(dir.x,dir.z);if(b.cooldown<=0&&dir.length()<24&&!this.blocked(b.group.position.clone().add(v3(0,1.2,0)),target.mesh.position.clone().add(v3(0,1,0)))){this.fx.fire(b.muzzle(),target.mesh.position.clone().add(v3(0,1,0)),{color:0x67cbe9});this.damageEnemy(target,12);b.fire();b.cooldown=.4;}}
  else b.group.quaternion.copy(this.player.group.quaternion);
  b.update(dt,{moving,aiming:!!target});
 }
 updatePlayer(dt){
  this.invulnerable=Math.max(0,this.invulnerable-dt);this.fireCooldown=Math.max(0,this.fireCooldown-dt);this.rollCooldown=Math.max(0,this.rollCooldown-dt);this.rollLeft=Math.max(0,this.rollLeft-dt);
  if(this.state.hp<=0){this.player.update(dt,{dead:true});if(this.deadTimer>0){this.deadTimer-=dt;if(this.deadTimer<=0){if(this.state.mode==='coop'){this.finish(false);return;}this.state.hp=120;this.invulnerable=2;this.player.group.position.copy(this.world.enemySpawns[Math.floor(Math.random()*this.world.enemySpawns.length)]);}}return;}
  const k=this.keys;let x=(k.has('KeyD')||k.has('ArrowRight')?1:0)-(k.has('KeyA')||k.has('ArrowLeft')?1:0)+this.touchMove.x;
  let z=(k.has('KeyW')||k.has('ArrowUp')?1:0)-(k.has('KeyS')||k.has('ArrowDown')?1:0)-this.touchMove.y;
  const movement=v3(x,0,z);if(movement.length()>1)movement.normalize();this.moving=movement.lengthSq()>.01;
  const crouching=k.has('KeyC'),sprinting=k.has('AltLeft');const speed=this.rollLeft>0?12:crouching?2.4:sprinting?7.3:4.8;
  const forward=v3(Math.sin(this.lookYaw),0,Math.cos(this.lookYaw)),right=v3(-Math.cos(this.lookYaw),0,Math.sin(this.lookYaw));
  const delta=forward.clone().multiplyScalar(movement.z).addScaledVector(right,movement.x);
  if(this.rollLeft>0&&delta.lengthSq()<.01)delta.copy(forward);
  this.moveObject(this.player.group.position,delta.x*speed*dt,delta.z*speed*dt);
  this.velocityY-=18*dt;const oldY=this.player.group.position.y;let nextY=oldY+this.velocityY*dt,floor=0;
  if(this.velocityY<=0){for(const c of this.world.colliders)if(this.player.group.position.x>c.minX-.15&&this.player.group.position.x<c.maxX+.15&&this.player.group.position.z>c.minZ-.15&&this.player.group.position.z<c.maxZ+.15&&oldY>=c.height-.06&&nextY<=c.height)floor=Math.max(floor,c.height);}
  this.player.group.position.y=Math.max(floor,nextY);this.grounded=nextY<=floor;if(this.grounded)this.velocityY=0;
  // With a free cursor, turn toward the camera ray; pointer lock moves the camera.
  this.raycaster.setFromCamera(this.aimNdc,this.camera);const aimPoint=this.aimTarget();const aimDelta=aimPoint.sub(this.player.group.position.clone().add(v3(0,1.15,0)));const aimPitch=Math.atan2(aimDelta.y,Math.hypot(aimDelta.x,aimDelta.z));
  const yaw=Math.atan2(aimDelta.x,aimDelta.z);const q=new THREE.Quaternion().setFromAxisAngle(UP,yaw);this.player.group.quaternion.slerp(q,1-Math.exp(-16*dt));
  this.player.update(dt,{moving:this.moving,sprinting,crouching,jumping:!this.grounded,rolling:this.rollLeft,reloading:this.reloadLeft,pitch:clamp(aimPitch,-.8,.7),aiming:true});
  if(this.reloadLeft>0){this.reloadLeft-=dt;const w=WEAPONS[this.state.weapon];this.state.reloading=clamp(1-this.reloadLeft/w.reload,0,1);if(this.reloadLeft<=0){const item=this.inventory[this.state.weapon],count=Math.min(w.mag-item.ammo,item.reserve);item.ammo+=count;item.reserve-=count;this.selectInventory();this.state.reloading=0;}}
  if(this.heldFire||k.has('KeyJ'))this.fire();
 }
 updateProjectiles(dt){for(const p of this.projectiles){p.life-=dt;p.velocity.y-=(p.gravity||0)*dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.rotation.x+=dt*5;
   let hit=p.mesh.position.y<=.12||this.collision(p.mesh.position.x,p.mesh.position.z,.07,p.mesh.position.y);
   if(p.team==='player'){for(const e of this.enemies)if(e.hp>0&&p.mesh.position.distanceTo(e.mesh.position.clone().add(v3(0,.9,0)))<ENEMIES[e.kind].radius+.2){hit=true;break;}}
   else if(p.mesh.position.distanceTo(this.player.group.position.clone().add(v3(0,1,0)))<.6)hit=true;
   if((hit&&p.kind!=='grenade')||p.life<=0){this.explode(p);p.dead=true;p.mesh.removeFromParent();}
   else if(hit&&p.kind==='grenade'){p.mesh.position.y=Math.max(.15,p.mesh.position.y);p.velocity.y=Math.abs(p.velocity.y)*.45;p.velocity.x*=.65;p.velocity.z*=.65;}
  }this.projectiles=this.projectiles.filter(p=>!p.dead);
  for(const t of this.telegraphs){t.life-=dt;t.mesh.material.opacity=.3+.5*Math.sin(this.now*18)**2;if(t.life<=0){this.fx.explosion(t.mesh.position,{radius:t.radius});if(flatDistance(t.mesh.position,this.player.group.position)<t.radius)this.takeDamage(t.damage);t.mesh.removeFromParent();t.mesh.geometry.dispose();t.mesh.material.dispose();}}
  this.telegraphs=this.telegraphs.filter(t=>t.life>0);
 }
 updatePickups(dt){for(const p of this.pickups){if(p.cooldown>0){p.cooldown-=dt;p.mesh.visible=p.cooldown<=0;}if(!p.mesh.visible)continue;p.mesh.rotation.y+=dt*.8;p.mesh.position.y=p.baseY+Math.sin(this.now*2)*.13;if(flatDistance(p.mesh.position,this.player.group.position)<1.15)this.collect(p);}this.pickups=this.pickups.filter(p=>{if(p.cooldown===Infinity&&!p.mesh.visible){p.mesh.removeFromParent();return false;}return true;});}
 finish(win){if(!['playing','paused'].includes(this.state.phase))return;if(this.state.mode==='versus'&&this.network?.connected&&Object.keys(this.matchScores).length){const best=Math.max(...Object.values(this.matchScores).map(s=>s.score));win=(this.matchScores[this.network.localId]?.score||0)>=best;}this.state.phase=win?'victory':'defeat';this.state.message=win?'行动完成，小队凯旋':'任务失败，重新集结';if(this.state.mode==='versus')this.state.message=win?'回合结束 · 你赢得本场对战':'回合结束 · 再接再厉';this.heldFire=false;document.exitPointerLock?.();
  try{const save=JSON.parse(localStorage.getItem(SAVE_KEY)||'{}');save.bestScore=Math.max(save.bestScore||0,Math.round(this.state.score));save.totalKills=(save.totalKills||0)+this.state.kills;save.wins=(save.wins||0)+(win?1:0);localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch{}
  if(this.network?.isHost)this.network.broadcast({type:'finish',win,scores:this.matchScores});this.emit();
 }
 frame(time){const dt=Math.min(.045,Math.max(0,(time-this.lastTime)/1000));this.lastTime=time;this.now+=dt;this.fx.update(dt);this.world.update(dt,this.now);
  const phase=this.state.phase;
  if(phase==='playing'&&this.player){this.state.elapsed+=dt;this.state.hit=false;this.updateCamera(dt);this.updatePlayer(dt);this.updateBuddy(dt);
   if(!this.network?.connected||this.network.isHost){
    if(this.waveDelay>0){this.waveDelay-=dt;if(this.waveDelay<=0)this.nextWave();}
    if(this.pendingSpawns.length&&this.enemies.length<14){this.spawnTimer-=dt;if(this.spawnTimer<=0){this.spawnEnemy(this.pendingSpawns.shift());this.spawnTimer=.75;}}
    this.updateEnemies(dt);
    if(!(this.state.mode==='versus'&&this.network?.connected)&&this.state.wave>0&&!this.enemies.length&&!this.pendingSpawns.length&&this.waveDelay<=0){if((this.state.mode==='story'||this.state.mode==='coop')&&this.state.wave>=3)this.finish(true);else this.waveDelay=3;}
   }else for(const e of this.enemies)animateRobot(e.mesh,this.now,2);
   this.updateProjectiles(dt);this.updatePickups(dt);
   if(this.state.mode==='versus'){this.roundTimer-=dt;if(this.roundTimer<=0&&(!this.network?.connected||this.network.isHost))this.finish(true);}
   this.noticeTime=Math.max(0,this.noticeTime-dt);if(this.noticeTime===0)this.state.notice='';this.comboTime=Math.max(0,this.comboTime-dt);if(this.comboTime===0)this.state.combo=0;
   this.updateNetwork(dt);
  }else if(phase==='menu'&&this.player){this.player.group.position.set(1,0,5.4);this.player.group.rotation.y=.22;this.player.update(dt,{aiming:true});if(this.buddy){this.buddy.group.position.set(-.8,0,5);this.buddy.group.rotation.y=.1;this.buddy.update(dt,{aiming:true});}const t=this.now*.08;this.camera.position.set(Math.sin(t)*1.5+2.8,2.6,10.7);this.camera.lookAt(.1,1.05,5);}
  else if((phase==='victory'||phase==='defeat')&&this.player)this.player.update(dt,{victory:phase==='victory',dead:phase==='defeat'});
  for(const r of this.remotes.values()){if(this.state.mode==='versus'&&this.network?.isHost&&r.hp<=0){r.respawn=(r.respawn||3)-dt;if(r.respawn<=0){r.hp=120;r.dead=false;r.respawn=0;}}r.actor.group.position.lerp(r.target,1-Math.exp(-12*dt));r.actor.group.rotation.y=r.yaw||0;r.actor.update(dt,{moving:r.moving,aiming:true,dead:r.dead});}
  this.uiTimer-=dt;if(this.uiTimer<=0){this.emit();this.uiTimer=.1;}
  this.renderer.render(this.scene,this.camera);
 }
 updateCamera(dt){const p=this.player.group.position;const forward=v3(Math.sin(this.lookYaw),0,Math.cos(this.lookYaw)),right=v3(-Math.cos(this.lookYaw),0,Math.sin(this.lookYaw));const target=p.clone().add(v3(0,1.28,0)).addScaledVector(forward,9);target.y+=Math.sin(this.lookPitch)*8;
  const desired=p.clone().addScaledVector(forward,-5.9).addScaledVector(right,.95).add(v3(0,2.75,0));const pivot=p.clone().add(v3(0,1.35,0)),ray=new THREE.Ray(pivot,desired.clone().sub(pivot).normalize());let distance=pivot.distanceTo(desired);for(const c of this.world.colliders){const hit=ray.intersectBox(new THREE.Box3(v3(c.minX-.12,0,c.minZ-.12),v3(c.maxX+.12,c.height+.12,c.maxZ+.12)),v3());if(hit)distance=Math.min(distance,Math.max(.6,pivot.distanceTo(hit)-.2));}desired.copy(ray.at(distance,v3()));this.camera.position.lerp(desired,1-Math.exp(-10*dt));this.camera.lookAt(target);const fov=this.keys.has('MouseRight')&&this.state.weapon===1?35:58;this.camera.fov=THREE.MathUtils.damp(this.camera.fov,fov,10,dt);this.camera.updateProjectionMatrix();}
 updateNetwork(dt){if(!this.network?.connected)return;this.netTimer-=dt;if(this.netTimer>0)return;this.netTimer=.1;
  this.network.send({type:'player',id:this.network.localId,kind:this.state.character,p:this.player.group.position.toArray(),yaw:Math.atan2(v3(0,0,1).applyQuaternion(this.player.group.quaternion).x,v3(0,0,1).applyQuaternion(this.player.group.quaternion).z),moving:this.moving,hp:this.state.hp,weapon:this.state.weapon});
  if(this.network.isHost)this.network.broadcast({type:'world',wave:this.state.wave,remaining:this.state.remaining,score:this.state.score,scores:this.matchScores,boss:this.state.boss,message:this.state.message,enemies:this.enemies.map(e=>({id:e.id,kind:e.kind,p:e.mesh.position.toArray(),yaw:e.mesh.rotation.y,hp:e.hp}))});
 }
 minimap(){return{player:this.player?.group.position.toArray()||[0,0,0],yaw:this.player?Math.atan2(v3(0,0,1).applyQuaternion(this.player.group.quaternion).x,v3(0,0,1).applyQuaternion(this.player.group.quaternion).z):0,enemies:this.enemies.map(e=>({p:e.mesh.position.toArray(),boss:e.kind==='boss'})),buddy:this.buddy?.group.position.toArray(),remotes:[...this.remotes.values()].map(r=>r.actor.group.position.toArray()),colliders:this.world.colliders,bounds:this.world.bounds};}
 dispose(){this.renderer.setAnimationLoop(null);for(const remove of this.listeners)remove();this.observer.disconnect();this.clearBattle();this.player?.dispose();this.buddy?.dispose();this.fx.dispose();this.world.dispose?.();this.projectileGeometry.dispose();Object.values(this.projectileMaterials).forEach(m=>m.dispose());this.renderer.dispose();this.renderer.domElement.remove();}
}
