import assert from 'node:assert/strict';
import {fixture} from './game-fixture.mjs';
import {DeviceInputRouter} from '../game/input-router.js';
import {OnlineDuel} from '../game/online-duel.js';
import {DeviceReceiver} from '../game/device-receiver.js';
const g=fixture();await g.start({mode:'story'});
const acks=[],feedback=[];let active=true;
const router=new DeviceInputRouter(g,{ack:f=>acks.push(f),feedback:f=>feedback.push(f),active:()=>active});
const frame=(buttons={fire:false,aim:false},move={x:0,y:0},look={yaw:0,pitch:0})=>({type:'input',move,look,buttons});
router.receive(frame({fire:true,aim:true}),100);router.tick(100);assert.equal(g.heldFire,false,'initial held input must wait for neutral');
router.receive(frame(),110);router.receive(frame({fire:true,aim:true},{x:1,y:0},{yaw:10,pitch:2}),120);
router.receive(frame({fire:true,aim:true},{x:0,y:1},{yaw:5,pitch:2}),125);
const yaw=g.lookYaw;router.tick(130);assert.equal(g.touchMove.y,-1);assert.equal(g.heldFire,true);assert.ok(g.keys.has('MouseRight'));
assert.ok(Math.abs(g.lookYaw-yaw+15*Math.PI/180)<1e-6,'summed look must survive coalescing');
router.tick(300);assert.equal(g.heldFire,false);assert.deepEqual(g.touchMove,{x:0,y:0});assert.ok(!g.keys.has('MouseRight'),'watchdog releases all held states');
router.receive(frame(),310);g.grounded=true;router.receive({type:'action',seq:1,action:'jump'},315);router.tick(320);
assert.equal(g.velocityY,6.5);assert.equal(acks.at(-1).status,'applied');
router.receive({type:'action',seq:2,action:'jump'},325);router.tick(330);assert.equal(acks.at(-1).status,'rejected');
g.state.hp=120;router.receive({type:'action',seq:3,action:'heal'},335);router.tick(340);assert.equal(acks.at(-1).status,'rejected');
router.receive({type:'action',seq:4,action:'reload'},345);router.tick(350);assert.equal(acks.at(-1).status,'rejected','full magazine is unavailable');
router.receive(frame({fire:false,aim:false},{x:1,y:0}),360);active=false;router.tick(370);assert.deepEqual(g.touchMove,{x:0,y:0});active=true;
router.suspended=true;router.receive(frame(),380);router.tick(380);assert.equal(router.armed,false);router.resume();
router.receive(frame(),390);g.state.ammo--;router.tick(395);assert.equal(feedback.at(-1).event,'shot');
g.state.hp-=10;router.tick(400);assert.equal(feedback.at(-1).event,'damage');
router.dispose();g.clearBattle();g.world.dispose();
const guest=fixture();const packets=[];
guest.network={connected:true,isHost:false,localId:'guest',send:p=>packets.push(p),broadcast(){},command:()=>Promise.resolve()};
await guest.start({mode:'versus'});
const room={host:'host',round:'r1',rules:{target:10,duration:180},players:{host:{name:'H',character:'male'},guest:{name:'G',character:'female'}}};
new OnlineDuel(guest,room);guest.state.hp=80;
const guestAcks=[],remote=new DeviceInputRouter(guest,{ack:f=>guestAcks.push(f)});
remote.receive(frame(),100);remote.receive({type:'action',seq:1,action:'heal'},110);remote.tick(120);
assert.equal(guestAcks.at(-1).status,'submitted','guest cannot claim host-authoritative application');assert.ok(packets.some(p=>p.action==='heal'));
remote.dispose();guest.clearBattle();guest.world.dispose();
console.log('Controller engine checks passed: neutral, movement/look, watchdog, actions, local takeover, feedback, online authority.');

// Delayed callbacks from a closed socket cannot release a new receiver session.
globalThis.location={origin:'https://anka.example',protocol:'https:'};
class Socket {
 static OPEN=1;
 constructor(){this.readyState=1;Socket.latest=this;}
 send(){}
 close(){this.readyState=3;}
 ready(){this.onmessage({data:JSON.stringify({type:'receiver_ready'})});}
}
globalThis.WebSocket=Socket;
const statuses=[],receiver=new DeviceReceiver(g,{status:frame=>statuses.push(frame)});
const first=receiver.open(),oldSocket=Socket.latest;oldSocket.ready();await first;receiver.close();
const second=receiver.open(),newSocket=Socket.latest;newSocket.ready();await second;
oldSocket.onclose();
assert.equal(receiver.socket,newSocket);assert.equal(statuses.length,0,'stale close must not affect a new connection');
receiver.dispose();
console.log('Controller connection checks passed: stale socket callbacks cannot stop a new session.');

const {ControllerPose}=await import('../game/controller-pose.js');
const view={lookYaw:.3,lookPitch:.1,state:{perspective:'first'}},pose=new ControllerPose(view);
const q=(axis,r)=>{const a=[Math.cos(r/2),0,0,0];a[axis+1]=Math.sin(r/2);return a;};
pose.bind('one');pose.apply({id:1,q:[1,0,0,0]});
pose.apply({id:1,q:q(0,1.5)});assert.equal(view.lookPitch,1.25);
pose.apply({id:1,q:[1,0,0,0]});assert.equal(view.lookPitch,.1,'pitch limit must not accumulate an offset');
for(const yaw of [.5,2,3.5,5,Math.PI*2])pose.apply({id:1,q:q(1,yaw)});
assert.ok(Math.abs(view.lookYaw-.3)<1e-8,'full yaw circle returns to anchor even after omitted packets');
pose.apply({id:1,q:q(1,.2)});assert.ok(view.lookYaw<.3,'retain existing gyro direction');
pose.apply({id:1,q:[1,0,0,0]},{yaw:10,pitch:0});
pose.apply({id:1,q:q(1,.3)});pose.apply({id:1,q:[1,0,0,0]});
assert.ok(Math.abs(view.lookYaw-(.3-10*Math.PI/180))<1e-8,'touch look changes the anchor');
console.log('Controller absolute quaternion checks passed: full turn, packet loss, pitch clamp return and touch offset.');

// A large flip must not fold down after 90 degrees or steal 180 degrees of yaw.
pose.rebase();view.lookYaw=.3;view.lookPitch=.1;
for(const degrees of [0,45,85,89.99,90,90.01,95,120,170,179]){
 pose.apply({id:2,q:q(0,degrees*Math.PI/180)});
 assert.ok(Math.abs(view.lookYaw-.3)<1e-5,`pitch ${degrees} must not reverse yaw`);
 if(degrees>=85)assert.equal(view.lookPitch,1.25,`pitch ${degrees} must stay clamped instead of folding`);
}
pose.apply({id:2,q:[1,0,0,0]});assert.ok(Math.abs(view.lookPitch-.1)<1e-8);
pose.rebase();view.lookYaw=.3;view.lookPitch=.1;
pose.apply({id:3,q:q(1,.5)});assert.ok(Math.abs(view.lookYaw-(.3-.5))<1e-8,'late first pose keeps its complete rotation');
const current=view.lookYaw;pose.rebase(true);pose.apply({id:3,q:q(1,.7)});
assert.ok(Math.abs(view.lookYaw-current)<1e-8,'explicit keyboard handback may align to current grip');
pose.rebase();view.lookYaw=.3;view.lookPitch=.1;
for(const degrees of [0,45,89,90,91,120,179,180]){
 pose.apply({id:4,q:q(2,degrees*Math.PI/180)});
 assert.ok(Math.abs(view.lookYaw-.3)<1e-8&&Math.abs(view.lookPitch-.1)<1e-8,'roll alone cannot become look yaw/pitch');
}
console.log('Controller orientation checks passed: vertical singularity, large pitch, roll isolation, delayed first pose and explicit handback.');
const mul=([a,b,c,d],[w,x,y,z])=>[a*w-b*x-c*y-d*z,a*x+b*w+c*z-d*y,a*y-b*z+c*w+d*x,a*z+b*y-c*x+d*w];
for(const sign of [-1,1]){
 pose.rebase();view.lookYaw=.3;view.lookPitch=0;pose.apply({id:5,q:[1,0,0,0]});
 for(const degrees of [30,85,89.99,90,90.01,100,120,170,120,90,60,0]){
  const pitch=sign*degrees*Math.PI/180,rotation=mul(mul(q(1,.4),q(0,pitch)),q(2,.2));
  pose.apply({id:5,q:rotation});
  assert.ok(Math.abs(view.lookYaw-(.3-.4))<1e-4,'combined roll/pitch cannot reverse heading at vertical');
  assert.ok(Math.abs(view.lookPitch-Math.max(-1.25,Math.min(1.25,pitch)))<1e-4);
 }
}
console.log('Controller compound pose checks passed: positive/negative vertical crossings with heading and roll.');

// Closed 3D paths can end in an equivalent nonzero Euler chart unless reference is canonical.
let seed=7;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
for(let trial=0;trial<200;trial++){
 pose.rebase();view.lookYaw=.3;view.lookPitch=.1;let rotation=[1,0,0,0];pose.apply({id:6,q:rotation});
 for(let segment=0;segment<5;segment++){
  let axis=[random()*2-1,random()*2-1,random()*2-1],n=Math.hypot(...axis),half=random()*5/40;axis=axis.map(x=>x/n);
  const step=[Math.cos(half),...axis.map(x=>x*Math.sin(half))];
  for(let i=0;i<20;i++){rotation=mul(rotation,step);pose.apply({id:6,q:rotation});}
 }
 const sign=rotation[0]<0?-1:1;
 for(let i=0;i<=40;i++){
  const t=i/40,raw=rotation.map((v,j)=>v*(1-t)+(j===0?sign:0)*t),n=Math.hypot(...raw);
  pose.apply({id:6,q:raw.map(v=>v/n)});
 }
 assert.ok(Math.abs(view.lookYaw-.3)<1e-6&&Math.abs(view.lookPitch-.1)<1e-6,'every closed 3D path must return to reference');
}
console.log('Controller closed-path checks passed: 200 deterministic mixed three-axis round trips.');

// Manual turn is an absolute snapshot, so coalescing, hold and release cannot repeat it.
const turnGame=fixture();await turnGame.start({mode:'story'});
const turnRouter=new DeviceInputRouter(turnGame),turnFrame=turn=>({...frame(),turn,pose:{id:1,q:[1,0,0,0]}});
turnRouter.bind('turn-device');turnRouter.receive(turnFrame(0),100);turnRouter.tick(100);
const turnStart=turnGame.lookYaw;
turnRouter.receive(turnFrame(45),110);turnRouter.tick(110);
assert.ok(Math.abs(turnGame.lookYaw-(turnStart-Math.PI/4))<1e-8);
for(let t=120;t<=240;t+=20){turnRouter.receive(turnFrame(45),t);turnRouter.tick(t);}
assert.ok(Math.abs(turnGame.lookYaw-(turnStart-Math.PI/4))<1e-8,'holding does not continuously rotate');
turnRouter.receive({...turnFrame(45),pose:{id:1,q:q(1,.2)}},250);turnRouter.tick(250);
turnRouter.receive(turnFrame(45),260);turnRouter.tick(260);
assert.ok(Math.abs(turnGame.lookYaw-(turnStart-Math.PI/4))<1e-8,'gyro return preserves manual turn');
turnRouter.release();turnRouter.receive(turnFrame(45),270);turnRouter.tick(270);
assert.ok(Math.abs(turnGame.lookYaw-(turnStart-Math.PI/4))<1e-8,'rearm does not reapply turn');
turnRouter.receive(turnFrame(170),280);turnRouter.tick(280);turnRouter.receive(turnFrame(-170),290);turnRouter.tick(290);
assert.ok(Math.abs(turnGame.lookYaw-(turnStart-190*Math.PI/180))<1e-8,'wrapped snapshots retain correct turn direction');
turnRouter.dispose();turnGame.clearBattle();turnGame.world.dispose();
console.log('Controller manual turn checks passed: coalescing, hold, gyro return, rearm and angle wrap.');

// Complete turn totals preserve direction for half-cell high-gain swipes over 180 degrees.
const fastGame=fixture();await fastGame.start({mode:'story'});
const fastRouter=new DeviceInputRouter(fastGame);
const totalFrame=turnTotal=>({...frame(),turn:((turnTotal+180)%360+360)%360-180,turnTotal,pose:{id:1,q:[1,0,0,0]}});
fastRouter.bind('fast-turn');fastRouter.receive(totalFrame(0),100);fastRouter.tick(100);
const fastStart=fastGame.lookYaw;
fastRouter.receive(totalFrame(90),110);fastRouter.receive(totalFrame(405),120);fastRouter.tick(125);
assert.ok(Math.abs(fastGame.lookYaw-(fastStart-405*Math.PI/180))<1e-8,'coalesced full circle keeps clockwise direction');
fastRouter.receive(totalFrame(585),130);fastRouter.tick(130);
assert.ok(Math.abs(fastGame.lookYaw-(fastStart-585*Math.PI/180))<1e-8,'exact 180-degree change keeps its sign');
fastRouter.receive(totalFrame(285),140);fastRouter.tick(140);
assert.ok(Math.abs(fastGame.lookYaw-(fastStart-285*Math.PI/180))<1e-8,'fast reversal retains the complete negative delta');
fastRouter.receive(totalFrame(285),150);fastRouter.tick(150);
assert.ok(Math.abs(fastGame.lookYaw-(fastStart-285*Math.PI/180))<1e-8,'stationary total cannot repeat rotation');
fastRouter.release();fastRouter.receive(totalFrame(900),160);fastRouter.tick(160);
assert.ok(Math.abs(fastGame.lookYaw-(fastStart-285*Math.PI/180))<1e-8,'rearm establishes total baseline without replay');
fastRouter.receive(totalFrame(960),170);fastRouter.tick(170);
assert.ok(Math.abs(fastGame.lookYaw-(fastStart-345*Math.PI/180))<1e-8);
fastRouter.bind('another-device');fastRouter.release();fastRouter.receive(totalFrame(0),180);fastRouter.tick(180);
assert.ok(Math.abs(fastGame.lookYaw-(fastStart-345*Math.PI/180))<1e-8,'new device total starts from its own baseline');
fastRouter.dispose();fastGame.clearBattle();fastGame.world.dispose();
console.log('Controller high-gain turn checks passed: coalescing, full circle, exact 180, reverse, hold, rearm and new binding.');
