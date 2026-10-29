import {WEAPONS} from './config.js';
import {ControllerPose} from './controller-pose.js';
/** Device input uses the same engine actions as local controls and online hooks. */
export class DeviceInputRouter {
 constructor(game,{ack=()=>{},feedback=()=>{},active=()=>true}={}){
  Object.assign(this,{game,ack,feedback,active,owns:false,suspended:false,armed:false,last:0,
   move:{x:0,y:0},look:{yaw:0,pitch:0},buttons:{fire:false,aim:false},pulse:false,actions:[],crouch:false});
  this.turn=0;this.turnLast=0;this.turnTotal=this.turnTotalLast=null;this.binding='';this.poseView=new ControllerPose(game);this.pose=null;this.wasPlaying=false;
  this.takeover=e=>{if(e.isTrusted&&!/INPUT|TEXTAREA/.test(e.target?.tagName||'')&&
   (e.type==='keydown'||e.target===game.renderer?.domElement||e.target?.closest?.('.mobile-fire,.mobile-jump,.mobile-roll,.mobile-crouch,.move-stick,.ability-button,.weapon-bar,.pickup-prompt'))){this.release();this.suspended=true;}};
  if(typeof window!=='undefined')for(const name of ['keydown','pointerdown'])window.addEventListener(name,this.takeover,true);
 }
 receive(frame,now=performance.now()){
  if(frame.type==='release'){this.release();return;}
  if(frame.type==='action'){
   if(!this.suspended&&this.armed&&this.actions.length<32)this.actions.push({...frame,received:now});return;
  }
  if(frame.type!=='input')return;
  const neutral=!Object.values(frame.move).some(Boolean)&&!Object.values(frame.look).some(Boolean)&&!Object.values(frame.buttons).some(Boolean);
  const wasArmed=this.armed;
  if(neutral&&!this.suspended)this.armed=true;
  if(this.suspended||!this.armed)return;
  const total=Number.isFinite(frame.turnTotal)?frame.turnTotal:null;
  if(!wasArmed||(total===null)!==(this.turnTotal===null)){this.turnLast=frame.turn??0;this.turnTotalLast=total;}
  this.turn=frame.turn??0;this.turnTotal=total;
  this.last=now;this.move=frame.move;this.buttons=frame.buttons;this.pose=frame.pose||null;
  this.look.yaw+=frame.look.yaw;this.look.pitch+=frame.look.pitch;
  this.pulse ||= !!frame.pressedFire;
 }
 tick(now=performance.now()){
  const g=this.game;this.reportFeedback();
  const playing=g.state.phase==='playing';if(playing&&!this.wasPlaying)this.poseView.rebase();this.wasPlaying=playing;
  if(!this.active()||g.state.phase!=='playing'||g.state.hp<=0||now-this.last>150||this.suspended){this.release();return;}
  this.owns=true;g.touchMove={x:this.move.x,y:-this.move.y};g.heldFire=this.buttons.fire;
  this.buttons.aim?g.keys.add('MouseRight'):g.keys.delete('MouseRight');
  this.crouch?g.keys.add('KeyC'):g.keys.delete('KeyC');
  const turn=this.turnTotal!==null&&this.turnTotalLast!==null?this.turnTotal-this.turnTotalLast:
   ((this.turn-this.turnLast+180)%360+360)%360-180;
  this.turnLast=this.turn;this.turnTotalLast=this.turnTotal;
  if(turn)this.poseView.turn(turn);
  if(this.pose)this.poseView.apply(this.pose,this.look);
  else{
   g.lookYaw-=this.look.yaw*Math.PI/180;
   const lo=g.state.perspective==='first'?-1.25:-.5,hi=g.state.perspective==='first'?1.25:.38;
   g.lookPitch=Math.max(lo,Math.min(hi,g.lookPitch+this.look.pitch*Math.PI/180));
  }
  g.aimNdc.set(0,0);this.look={yaw:0,pitch:0};
  if(this.pulse&&!this.buttons.fire)g.fire();this.pulse=false;
  for(const event of this.actions.splice(0)){
   if(now-event.received>200){this.ack({type:'ack',seq:event.seq,status:'rejected',reason:'expired'});continue;}
   const applied=this.action(event.action);
   this.ack({type:'ack',seq:event.seq,status:applied===true?'applied':applied==='submitted'?'submitted':'rejected',reason:applied?'':'unavailable'});
  }
 }
 action(action){
  const g=this.game,s=g.state;
  if(action==='next_weapon'){g.setWeapon((s.weapon+1)%g.inventory.length);return true;}
  if(action==='toggle_crouch'){this.crouch=!this.crouch;this.crouch?g.keys.add('KeyC'):g.keys.delete('KeyC');g.emit();return true;}
  const method={jump:'jump',reload:'reload',grenade:'grenade',shield:'shield',heal:'medkit',roll:'roll',interact:'interact'}[action];
  if(!method)return false;
  if(action==='jump'&&(!g.grounded||g.rollLeft>0))return false;
  if(action==='roll'&&(g.rollCooldown>0||!g.grounded))return false;
  if(action==='grenade'&&s.grenades<=0)return false;
  if(action==='heal'&&(s.medkits<=0||s.hp>=s.maxHp))return false;
  if(action==='shield'&&s.shieldCharges<=0)return false;
  if(action==='reload'&&(g.reloadLeft>0||s.reserve<=0||s.ammo>=WEAPONS[s.weapon].mag))return false;
  const node=action==='interact'?g.supplies?.nearest(g.player.group.position):null;
  const near=actor=>actor&&actor.hp<=0&&Math.hypot(actor.group.position.x-g.player.group.position.x,actor.group.position.z-g.player.group.position.z)<3;
  const revivable=action==='interact'&&(near(g.buddy)||(s.mode==='coop'&&[...(g.remotes?.values()||[])].some(r=>near({...r.actor,hp:r.hp}))));
  if(action==='interact'&&!node&&!revivable)return false;
  const before={grenades:s.grenades,charges:s.shieldCharges,hp:s.hp,reload:g.online?.players[g.online.local]?.reload||g.reloadLeft,cooldown:node?.cooldown};
  g[method]();
  if(g.online&&!g.online.host&&['reload','grenade','shield','heal','interact'].includes(action))return 'submitted';
  if(action==='grenade')return s.grenades<before.grenades;
  if(action==='shield')return s.shieldCharges<before.charges;
  if(action==='heal')return s.hp>before.hp;
  if(action==='reload')return (g.online?.players[g.online.local]?.reload||g.reloadLeft)>before.reload;
  if(action==='interact'&&node)return node.cooldown>before.cooldown;
  return true;
 }
 reportFeedback(){
  const s=this.game.state,old=this.previousFeedback;this.previousFeedback={hp:s.hp,ammo:s.ammo,weapon:s.weapon,phase:s.phase,reloading:s.reloading};
  if(!old)return;
  let event='';
  if(old.hp>0&&s.hp<=0)event='death';
  else if(s.hp<old.hp)event='damage';
  else if(s.phase==='victory'&&old.phase!=='victory')event='win';
  else if(old.reloading>0&&s.reloading===0&&s.weapon===old.weapon&&s.ammo>old.ammo)event='reload_complete';
  else if(s.phase==='playing'&&s.weapon===old.weapon&&s.ammo<old.ammo)event='shot';
  if(event)this.feedback({type:'feedback',event,strength:event==='shot'?.2:.5,durationMs:event==='shot'?25:100});
 }
 release(){
  if(this.owns){const g=this.game;g.touchMove={x:0,y:0};g.heldFire=false;g.keys.delete('MouseRight');g.keys.delete('KeyC');}
  this.owns=false;this.armed=false;this.move={x:0,y:0};this.look={yaw:0,pitch:0};
  this.turn=this.turnLast;this.turnTotal=this.turnTotalLast;this.pose=null;this.buttons={fire:false,aim:false};this.pulse=false;this.actions=[];this.crouch=false;
 }
 bind(id){if(id!==this.binding){this.binding=id;this.turn=this.turnLast=0;this.turnTotal=this.turnTotalLast=null;}this.poseView.bind(id);}
 resume(){if(this.suspended)this.poseView.rebase(true);this.release();this.suspended=false;}
 dispose(){this.release();if(typeof window!=='undefined')for(const name of ['keydown','pointerdown'])window.removeEventListener(name,this.takeover,true);}
}
