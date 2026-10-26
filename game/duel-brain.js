import * as THREE from 'three';
import { BehaviorTree, Selector, Sequence, Condition, Action, SUCCESS, FAILURE, RUNNING } from './behavior-tree.js';
const p=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

export class DuelBrain {
 constructor(duel){
  this.duel=duel;this.game=duel.game;this.bot=duel.bot;this.time=0;this.plan=null;this.memoryAge=0;this.heardAge=99;this.underFire=0;this.threatDamage=0;
  this.cooldowns={cover:1.5,flank:3,danger:0};this.coverCache=null;this.coverCacheAt=-99;this.searchIndex=0;this.lastSearchGoal=null;this.memoryLimit=30;
  const condition=(name,test)=>new Condition(name,()=>test());
  const action=(name,tick,enter=()=>{},exit=()=>{})=>new Action(name,{enter,tick,exit});
  const branch=(name,test,children,options={})=>new Sequence(name,[condition(name+'?',test),...children],options);
  const timed=(name,duration,state,shoot=false,crouch=false)=>{let until=0;return action(name,()=>{this.intent.state=state;this.intent.shoot=shoot;this.intent.crouch=crouch;return this.time>=until?SUCCESS:RUNNING;},()=>{until=this.time+duration;});};
  const move=(name,goal,state,timeout=3.5)=>{let until=0;return action(name,()=>{const target=goal();if(!target)return FAILURE;this.intent.goal=target;this.intent.state=state;this.intent.aim=true;if(dist(this.bot.actor.group.position,target)<.6)return SUCCESS;if(this.time>until){if(this.plan){this.cooldowns[this.plan.kind]=3;this.plan=null;}return FAILURE;}return RUNNING;},()=>{until=this.time+timeout;});};
  const finish=(kind,cooldown)=>action('完成'+kind,()=>{this.cooldowns[kind]=cooldown;this.plan=null;return SUCCESS;});
  const abort=kind=>()=>{if(this.plan?.kind===kind)this.plan=null;};
  const chooseCover=kind=>action('选择可达掩体',()=>{const cover=this.findCover(kind==='cover');if(!cover)return FAILURE;this.plan={kind,...cover};return SUCCESS;});
  const coverCycle=new Sequence('掩体探头循环',[
   chooseCover('cover'),move('进入掩体',()=>this.plan?.hide,'cover'),timed('隐蔽观察',.55,'hide',false,true),
   move('移到探头点',()=>this.plan?.peek,'peek',2.5),timed('探头点射',1.25,'peek',true),
   move('退回掩体',()=>this.plan?.hide,'reposition',2.5),finish('cover',5),
  ],{memory:true,onAbort:abort('cover')});
  const flankCycle=new Sequence('压制后绕侧',[
   action('规划侧翼路线',()=>{const goal=this.findFlank();if(!goal)return FAILURE;this.plan={kind:'flank',goal};return SUCCESS;}),
   timed('短时压制',1.05,'suppress',true),move('绕到侧翼',()=>this.plan?.goal,'flank',3.5),
   timed('侧翼开火',1.25,'attack',true),finish('flank',6),
  ],{memory:true,onAbort:abort('flank')});
  let reloadCover=null;
  this.tree=new BehaviorTree(new Selector('对战优先级',[
   branch('倒地',()=>this.bot.hp<=0,[action('等待复活',()=>{this.intent.state='dead';if(this.bot.respawn<=0){this.duel.respawnBot();return SUCCESS;}return RUNNING;})]),
   branch('出生保护',()=>this.bot.protection>0,[action('部署观察',()=>{this.intent.state='ready';return RUNNING;})]),
   branch('紧急避险',()=>this.plan?.kind==='danger'||(this.cooldowns.danger<=0&&(this.bot.hp<38||this.threatDamage>=28)),[
    new Sequence('脱离火线',[
     chooseCover('danger'),move('撤到掩体',()=>this.plan?.hide,'retreat',2.8),timed('受击后稳住',.7,'hide',false,true),finish('danger',8),
    ],{memory:true,onAbort:abort('danger')}),
   ]),
   branch('需要换弹',()=>this.bot.reload>0||this.bot.ammo<=3||this.reloadingPlan,[action('掩护换弹',()=>{this.intent.state='reload';this.intent.crouch=!!reloadCover;this.intent.goal=reloadCover;return this.bot.reload>0?RUNNING:SUCCESS;},()=>{this.reloadingPlan=true;reloadCover=this.findCover(false)?.hide||null;if(this.bot.ammo<24&&this.bot.reload<=0)this.bot.reload=1.7;},()=>{reloadCover=null;this.reloadingPlan=false;})]),
   branch('对手倒地',()=>this.game.state.hp<=0,[action('观察复活区',()=>{this.intent.state='watch';return RUNNING;})]),
   branch('战术交战',()=>this.visible||this.plan?.kind==='cover'||this.plan?.kind==='flank',[
    new Selector('选择战术',[
     branch('掩体攻防',()=>this.plan?.kind==='cover'||(this.cooldowns.cover<=0&&this.range<27&&!!this.findCover(true)),[coverCycle]),
     branch('压制绕侧',()=>this.plan?.kind==='flank'||(this.cooldowns.flank<=0&&this.range>8&&this.range<29),[flankCycle]),
     action('保持交火距离',()=>this.engage()),
    ]),
   ]),
   action('搜索最后位置与巡查',()=>this.search()),
  ]));
 }
 reset(position){this.tree.reset({});this.plan=null;this.bot.path=[];this.memoryAge=0;this.memoryLimit=Math.max(12,dist(this.bot.actor.group.position,position)/2.8+8);this.heardAge=99;this.threatDamage=0;this.underFire=0;this.lastSearchGoal=null;this.bot.lastSeen.copy(position);this.cooldowns.cover=1.5;this.cooldowns.flank=3;this.cooldowns.danger=0;this.coverCache=null;this.coverCacheAt=-99;}
 hearShot(position){if(this.bot.hp<=0||dist(this.bot.actor.group.position,position)>30||this.visible)return;this.bot.lastSeen.copy(position).add(p((this.duel.random()-.5)*3,0,(this.duel.random()-.5)*3)).setY(0);this.memoryAge=0;this.heardAge=0;this.lastSearchGoal=null;}
 hurt(amount){this.underFire=1.5;this.threatDamage+=amount;this.hearShot(this.game.player.group.position);}
 step(dt){
  this.time+=dt;this.memoryAge+=dt;this.heardAge+=dt;this.underFire=Math.max(0,this.underFire-dt);if(!this.underFire)this.threatDamage=0;
  for(const key of Object.keys(this.cooldowns))this.cooldowns[key]=Math.max(0,this.cooldowns[key]-dt);
  const pos=this.bot.actor.group.position,target=this.game.player.group.position,delta=target.clone().sub(pos).setY(0);this.range=delta.length();
  const forward=p(0,0,1).applyQuaternion(this.bot.actor.group.quaternion);const inView=this.range<3||forward.dot(delta.normalize())>Math.cos(THREE.MathUtils.degToRad(75));
  this.visible=this.bot.hp>0&&this.game.state.hp>0&&this.range<36&&inView&&!this.game.blocked(pos.clone().add(p(0,1.15,0)),target.clone().add(p(0,1.1,0)));
  if(this.visible){this.bot.lastSeen.copy(target);this.memoryAge=0;this.lastSearchGoal=null;}
  this.intent={goal:null,shoot:false,crouch:false,aim:this.visible,state:'search',lookAt:this.bot.lastSeen};
  this.tree.tick({dt,brain:this});return this.intent;
 }
 findCover(needsPeek){
  if(this.coverCacheAt+.6>this.time&&(this.coverCacheMode===needsPeek||(!needsPeek&&this.coverCache)))return this.coverCache;
  const g=this.game,b=this.bot,origin=b.actor.group.position,threat=b.lastSeen.clone().add(p(0,1.1,0)),candidates=[];
  for(const c of g.world.colliders){if(c.height<1.15)continue;const mx=(c.minX+c.maxX)/2,mz=(c.minZ+c.maxZ)/2;
   const corners=[p(c.minX-.9,0,c.minZ-.9),p(c.minX-.9,0,c.maxZ+.9),p(c.maxX+.9,0,c.minZ-.9),p(c.maxX+.9,0,c.maxZ+.9)];
   const points=[p(c.minX-.8,0,mz),p(c.maxX+.8,0,mz),p(mx,0,c.minZ-.8),p(mx,0,c.maxZ+.8),...corners];
   for(const hide of points){const d=dist(origin,hide);if(d>11||!this.duel.nav.clear(hide)||!g.blocked(hide.clone().add(p(0,1.1,0)),threat))continue;
    const peeks=[...corners,...corners.map(q=>q.clone().add(q.clone().sub(p(mx,0,mz)).normalize().multiplyScalar(.8)))];
    const peek=peeks.filter(q=>dist(q,hide)>.8&&dist(q,hide)<5&&this.duel.nav.clear(q)&&!g.blocked(q.clone().add(p(0,1.15,0)),threat)).sort((a,c)=>dist(a,hide)-dist(c,hide))[0];
    if(needsPeek&&!peek)continue;candidates.push({hide,peek,score:d+(peek?dist(hide,peek)*.4:0)+Math.abs(dist(hide,threat)-14)*.1});
   }
  }
  candidates.sort((a,b)=>a.score-b.score);this.coverCache=null;
  for(const candidate of candidates.slice(0,8)){if(!this.duel.nav.path(origin,candidate.hide).length)continue;if(candidate.peek&&!this.duel.nav.path(candidate.hide,candidate.peek).length)continue;this.coverCache=candidate;break;}
  this.coverCacheAt=this.time;this.coverCacheMode=needsPeek;return this.coverCache;
 }
 findFlank(){const pos=this.bot.actor.group.position,target=this.bot.lastSeen,toward=target.clone().sub(pos).setY(0).normalize(),side=p(-toward.z,0,toward.x),sign=this.duel.random()<.5?-1:1;
  for(const turn of [sign,-sign])for(const length of [5,3.5]){const goal=pos.clone().addScaledVector(side,turn*length).addScaledVector(toward,2);if(this.duel.nav.clear(goal)&&this.duel.nav.path(pos,goal).length)return goal;}this.cooldowns.flank=2;return null;
 }
 engage(){const b=this.bot,pos=b.actor.group.position,target=b.lastSeen,toward=target.clone().sub(pos).setY(0).normalize();this.intent.state=this.range>21?'engage':'attack';this.intent.shoot=true;
  if(this.range>19)this.intent.goal=target.clone().addScaledVector(toward,-13);
  else if(this.range<7)this.intent.goal=pos.clone().addScaledVector(toward,-4);
  else{if(!this.engageGoal||dist(pos,this.engageGoal)<.6||this.time>(this.engageUntil||0)){this.engageGoal=pos.clone().add(p(-toward.z,0,toward.x).multiplyScalar((this.duel.random()<.5?-1:1)*1.5));this.engageUntil=this.time+1.4;}this.intent.goal=this.engageGoal;}
  return RUNNING;
 }
 search(){this.intent.state=this.heardAge<3?'investigate':'search';const pos=this.bot.actor.group.position;
  if(this.memoryAge<this.memoryLimit&&dist(pos,this.bot.lastSeen)>1){this.intent.goal=this.bot.lastSeen;return RUNNING;}
  if(!this.lastSearchGoal||dist(pos,this.lastSearchGoal)<1||this.time>(this.searchUntil||0)){
   const remembered=this.memoryAge<this.memoryLimit,center=remembered?this.bot.lastSeen:p(0,0,0),angle=this.searchIndex++*Math.PI*.72,radius=remembered?3:8;
   const patrol=this.game.world.duelSpawns;
   const goal=!remembered&&patrol?.length?patrol[this.searchIndex%patrol.length]:center.clone().add(p(Math.sin(angle)*radius,0,Math.cos(angle)*radius));const cell=this.duel.nav.nearest(goal);this.lastSearchGoal=cell<0?this.game.world.playerSpawn:this.duel.nav.point(cell%this.duel.nav.width,Math.floor(cell/this.duel.nav.width));this.searchUntil=this.time+Math.max(4,dist(pos,this.lastSearchGoal)/3+3);
  }
  this.intent.goal=this.lastSearchGoal;this.intent.lookAt=this.lastSearchGoal;return RUNNING;
 }
 dispose(){this.tree.reset({});}
}
