import * as THREE from 'three';
import { NavigationGrid } from './navigation.js';
import { DuelBrain } from './duel-brain.js';
import { WEAPONS } from './config.js';
import { chooseSpawn } from './arena-layout.js';

const p=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const distChanged=(a,b)=>distance(a,b)>.7;
const names={cover:'进入掩体',hide:'隐蔽观察',peek:'探头点射',reposition:'退回掩体',suppress:'压制射击',attack:'瞄准交火',investigate:'循声搜索',watch:'观察复活区',search:'搜索目标',engage:'接近目标',flank:'绕到侧翼',retreat:'寻找掩体',reload:'换弹',dead:'等待复活',ready:'部署保护'};

// Local one-versus-one match: decisions use visibility, memory, health and ammo.
// No model service, server or paid generation is involved.
export class RuleDuel {
 constructor(game,actorFactory,{random=Math.random,target=10}={}){
  this.game=game;this.random=random;this.target=target;this.playerKills=0;this.botKills=0;this.playerProtection=2;this.result=null;
  this.nav=new NavigationGrid(game.world);this.bot={actor:actorFactory(game.player.kind==='male'?'female':'male'),hp:120,ammo:24,reload:0,respawn:0,protection:2,fireCooldown:0,decision:0,reaction:0,burst:0,strafe:1,state:'ready',retreat:0,lastSeen:game.player.group.position.clone(),path:[],pathTimer:0};
  game.scene.add(this.bot.actor.group);this.bot.actor.setWeapon('rifle');
  this.bot.actor.group.position.copy(this.spawn(game.player.group.position));
  this.bot.actor.group.rotation.y=0;
  this.ringGeometry=new THREE.RingGeometry(.43,.49,40);this.ringMaterial=new THREE.MeshBasicMaterial({color:0xff655a,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false});
  this.ring=new THREE.Mesh(this.ringGeometry,this.ringMaterial);this.ring.rotation.x=-Math.PI/2;game.scene.add(this.ring);
  this.brain=new DuelBrain(this);game.waveDelay=0;game.state.goal=target;game.state.message='蓝方 VS 红方人机 · 先得 10 分或三分钟内领先获胜';game.state.remaining=1;this.publish();
 }
 spawn(away){
  return chooseSpawn(this.game,[away],null,this.nav);
 }
 publish(){
  const g=this.game,b=this.bot,projected=b.actor.group.position.clone().add(p(0,b.crouching?1.95:2.25,0)).project(g.camera);
  g.state.duel={playerKills:this.playerKills,botKills:this.botKills,target:this.target,opponentName:b.actor.kind==='male'?'小杰':'小葵',opponentHp:Math.max(0,b.hp),opponentAmmo:b.ammo,opponentState:names[b.state]||b.state,aiType:'behavior-tree',aiPath:this.brain?.tree.trace.filter(n=>n.status==='running').map(n=>n.name)||[],opponentProtected:b.protection>0,respawn:Math.ceil(g.deadTimer),opponentRespawn:Math.ceil(b.respawn),result:this.result,label:{x:(projected.x+1)*50,y:(1-projected.y)*50,visible:b.hp>0&&!g.blocked(g.camera.position,b.actor.group.position.clone().add(p(0,b.crouching?1.5:1.8,0)))&&projected.z>-1&&projected.z<1&&Math.abs(projected.x)<.96&&Math.abs(projected.y)<.95}};
 }
 damageBot(amount){const b=this.bot;if(b.hp<=0||b.protection>0||this.game.state.phase!=='playing')return false;const before=b.hp;b.hp=Math.max(0,b.hp-amount);if(before>=35&&b.hp<35)b.retreat=3;b.actor.hurtTime=.5;this.brain?.hurt(amount);
  if(b.hp===0){b.respawn=3;b.state='dead';this.playerKills++;this.game.state.kills=this.playerKills;this.game.state.score=this.playerKills*100;this.game.notice('击倒红方 +1');this.game.fx.impact(b.actor.group.position.clone().add(p(0,1,0)),{color:0xff8878});this.checkEnd();}this.publish();return true;
 }
 playerDied(){this.botKills++;this.game.state.deaths=this.botKills;this.game.notice('你被击倒 · 3 秒后重新部署');this.checkEnd();this.publish();}
 checkEnd(timeUp=false){if(this.result)return;if(!timeUp&&this.playerKills<this.target&&this.botKills<this.target)return;this.result=this.playerKills===this.botKills?'draw':this.playerKills>this.botKills?'win':'lose';this.game.finish(this.result!=='lose');this.publish();}
 respawnPlayer(){const g=this.game;g.state.hp=120;g.state.shield=0;g.player.group.position.copy(this.spawn(this.bot.actor.group.position));this.bot.lastSeen.copy(g.player.group.position);this.bot.path=[];this.bot.decision=0;this.brain.reset(g.player.group.position);g.velocityY=0;g.grounded=true;g.invulnerable=2;this.playerProtection=2;g.reloadLeft=0;g.state.reloading=0;g.rollLeft=0;g.inventory=WEAPONS.map(w=>({ammo:w.mag,reserve:w.reserve}));g.selectInventory();g.state.grenades=3;g.state.medkits=3;g.state.shieldCharges=2;g.fireCooldown=.2;
  const d=this.bot.actor.group.position.clone().sub(g.player.group.position);g.lookYaw=Math.atan2(d.x,d.z);g.aimNdc.set(0,0);g.camera.position.copy(g.player.group.position).add(p(-Math.sin(g.lookYaw)*5.9,2.75,-Math.cos(g.lookYaw)*5.9));g.fx.shield(g.player.group.position);g.notice('重新部署 · 2 秒保护');
 }
 respawnBot(){const b=this.bot,g=this.game;b.hp=120;b.ammo=24;b.reload=0;b.protection=2;b.path=[];b.pathGoal=null;b.decision=0;b.reaction=0;b.burst=0;b.state='ready';b.actor.group.position.copy(this.spawn(g.player.group.position));b.lastSeen.copy(g.player.group.position);this.brain.needsReset=true;g.fx.shield(b.actor.group.position);}
 shoot(dt,visible,range){const b=this.bot,g=this.game;b.fireCooldown-=dt;if(!visible||range>32||g.state.hp<=0||g.invulnerable>.15){b.reaction=0;return;}b.reaction+=dt;
  if(b.reaction<.7||b.fireCooldown>0||b.reload>0||b.protection>0)return;
  if(b.ammo<=0){b.reload=1.7;b.state='reload';return;}
  const from=b.actor.muzzle(),target=b.lastSeen.clone().add(p(0,g.keys.has('KeyC')?.8:1.15,0));
  const error=(g.moving?.75:.28)+range*.009;target.x+=(this.random()-.5)*error*2;target.z+=(this.random()-.5)*error;target.y+=(this.random()-.5)*.38;
  const direction=target.sub(from).normalize(),ray=new THREE.Ray(from,direction);let hit=null;for(const y of g.keys.has('KeyC')?[.35,.75,1.15]:[.4,1,1.65]){const point=ray.intersectSphere(new THREE.Sphere(g.player.group.position.clone().add(p(0,y,0)),.3),p());if(point&&(!hit||point.distanceTo(from)<hit.distanceTo(from)))hit=point;}
  const to=hit||from.clone().addScaledVector(direction,Math.min(35,range+2));g.fx.fire(from,to,{color:0xff6555});b.actor.fire();b.ammo--;b.burst++;
  if(hit&&!g.blocked(from,hit))g.takeDamage(16);
  b.fireCooldown=b.burst>=3?.75:.2;if(b.burst>=3)b.burst=0;
 }
 update(dt){const g=this.game,b=this.bot;this.playerProtection=Math.max(0,this.playerProtection-dt);
  if(b.hp<=0)b.respawn-=dt;
  else{b.protection=Math.max(0,b.protection-dt);if(b.reload>0){b.reload=Math.max(0,b.reload-dt);if(b.reload===0){b.ammo=24;b.reaction=0;}}}
  const intent=this.brain.step(dt);if(this.brain.needsReset){this.brain.needsReset=false;this.brain.reset(b.lastSeen);intent.goal=null;intent.shoot=false;intent.state='ready';}
  this.ring.position.copy(b.actor.group.position).y=.025;this.ring.visible=b.hp>0;
  if(b.hp<=0){b.actor.update(dt,{dead:true});b.state='dead';this.publish();return;}
  const pos=b.actor.group.position;b.pathTimer-=dt;
  if(!intent.goal){b.path=[];b.pathGoal=null;}
  else if(!b.pathGoal||distChanged(b.pathGoal,intent.goal)||b.pathTimer<=0){b.path=this.nav.path(pos,intent.goal);b.pathGoal=intent.goal.clone();b.pathTimer=.5;}
  while(b.path.length&&distance(pos,b.path[0])<.22)b.path.shift();let moving=false;
  if(b.path.length){const delta=b.path[0].clone().sub(pos).setY(0),step=Math.min(delta.length(),(b.reload>0?2.8:intent.crouch?2.3:3.8)*dt);delta.normalize().multiplyScalar(step);const before=pos.clone();g.moveObject(pos,delta.x,delta.z,.34);moving=distance(before,pos)>.001;}
  const target=intent.lookAt||b.lastSeen,facing=target.clone().sub(pos);if(facing.lengthSq()>.01)b.actor.group.quaternion.slerp(new THREE.Quaternion().setFromAxisAngle(p(0,1,0),Math.atan2(facing.x,facing.z)),1-Math.exp(-9*dt));
  b.crouching=intent.crouch;const pitch=Math.atan2(target.y-pos.y,Math.max(.1,distance(pos,target)));b.actor.update(dt,{moving,aiming:intent.aim,reloading:b.reload,pitch,crouching:intent.crouch});
  b.state=intent.state;if(intent.shoot)this.shoot(dt,this.brain.visible,this.brain.range);else{b.fireCooldown-=dt;b.reaction=0;}
  this.publish();
 }
 dispose(){this.brain.dispose();this.bot.actor.dispose();this.ring.removeFromParent();this.ringGeometry.dispose();this.ringMaterial.dispose();}
}
