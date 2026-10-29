const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
const distance=(a,b)=>['yaw','pitch','roll'].reduce((sum,k)=>sum+wrap(a[k]-b[k])**2,0);
/** Choose the continuous YXZ solution, including pitch beyond 90 degrees. */
function angles(q,previous){
 const [w,x,y,z]=q,s=clamp(2*(w*x-y*z),-1,1);
 let a={yaw:Math.atan2(2*(w*y+x*z),1-2*(x*x+y*y)),pitch:Math.asin(s),
  roll:Math.atan2(2*(w*z+x*y),1-2*(x*x+z*z))};
 if(Math.abs(s)>1-1e-7){
  // Heading/roll are coupled at a vertical pose; retain heading instead of amplifying noise.
  a.yaw=previous.yaw;a.roll=wrap(Math.sign(s)*(a.yaw-2*Math.atan2(y,w)));
 }
 // Near the reference, the principal chart is unique and small. Never retain an
 // equivalent (180,180,180) Euler solution after a closed three-dimensional path.
 if(Math.abs(w)>Math.SQRT1_2)return a;
 const b={yaw:wrap(a.yaw+Math.PI),pitch:a.pitch>=0?Math.PI-a.pitch:-Math.PI-a.pitch,roll:wrap(a.roll+Math.PI)};
 return distance(b,previous)<distance(a,previous)?b:a;
}
/** Complete reference-relative orientation; latest pose replaces, never accumulates. */
export class ControllerPose {
 constructor(game){this.game=game;this.anchor=null;this.binding='';this.lastId=null;this.alignCurrent=false;}
 bind(id){if(id!==this.binding){this.binding=id;this.lastId=null;this.rebase();}}
 rebase(alignCurrent=false){this.anchor=null;this.angles={yaw:0,pitch:0,roll:0};this.alignCurrent=alignCurrent;}
 turn(degrees){
  const radians=degrees*Math.PI/180;this.game.lookYaw-=radians;
  if(this.anchor)this.anchor.yaw-=radians;
 }
 apply(pose,look={yaw:0,pitch:0}){
  const g=this.game,scale=pose.gain??1,newReference=this.lastId!==pose.id;
  if(newReference)this.angles={yaw:0,pitch:0,roll:0};
  this.angles=angles(pose.q,this.angles||{yaw:0,pitch:0,roll:0});
  const yaw=-this.angles.yaw*scale,pitch=this.angles.pitch*scale;
  if(!this.anchor||this.anchor.id!==pose.id){
   // A delayed first packet is already relative to calibration: do not swallow its rotation.
   const align=this.alignCurrent&&!newReference;
   this.anchor={id:pose.id,yaw:g.lookYaw-(align?yaw:0),pitch:g.lookPitch-(align?pitch:0)};
   this.alignCurrent=false;
  }
  this.lastId=pose.id;this.anchor.yaw-=look.yaw*Math.PI/180;this.anchor.pitch+=look.pitch*Math.PI/180;
  g.lookYaw=this.anchor.yaw+yaw;
  const first=g.state.perspective==='first';
  g.lookPitch=clamp(this.anchor.pitch+pitch,first?-1.25:-.5,first?1.25:.38);
 }
}
