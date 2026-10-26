import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createWeapon } from './assets.js';

const urls={
 male:new URL('../assets/characters/mixamo/male_scout_aim.glb',import.meta.url).href,
 female:new URL('../assets/characters/mixamo/female_striker_aim.glb',import.meta.url).href,
};
const fallback={
 male:new URL('../assets/characters/tripo/male_scout_animated.glb',import.meta.url).href,
 female:new URL('../assets/characters/tripo/female_striker_animated.glb',import.meta.url).href,
};
const cache=new Map();
const UP=new THREE.Vector3(0,1,0);
const V=()=>new THREE.Vector3();
const Q=()=>new THREE.Quaternion();

export async function preloadActors(onProgress=()=>{}) {
 await Promise.all(['male','female'].map(async(kind)=>{
  const loader=new GLTFLoader();
  let gltf;
  try { gltf=await loader.loadAsync(urls[kind]); }
  catch { gltf=await loader.loadAsync(fallback[kind]); }
  cache.set(kind,gltf);onProgress(cache.size/2);
 }));
}

// Two-bone world-space IK works with both the original and retargeted bone rolls.
function solveArm(upper,forearm,hand,target,hint,strength=1) {
 if(!upper||!forearm||!hand)return;
 const a=upper.getWorldPosition(V()),b=forearm.getWorldPosition(V()),c=hand.getWorldPosition(V());
 const l1=a.distanceTo(b),l2=b.distanceTo(c);
 if(l1<1e-5||l2<1e-5)return;
 const delta=target.clone().sub(a),d=THREE.MathUtils.clamp(delta.length(),Math.abs(l1-l2)+.005,(l1+l2)*.985);
 const axis=delta.normalize();
 const bend=hint.clone().sub(a).addScaledVector(axis,-hint.clone().sub(a).dot(axis)).normalize();
 if(bend.lengthSq()<.01)bend.set(0,-1,0);
 const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));
 const elbow=a.clone().addScaledVector(axis,along).addScaledVector(bend,height);
 const world=upper.getWorldQuaternion(Q());
 const change=Q().setFromUnitVectors(b.sub(a).normalize(),elbow.clone().sub(a).normalize());
 const local=upper.parent.getWorldQuaternion(Q()).invert().multiply(change.multiply(world));
 upper.quaternion.slerp(local,strength);upper.updateWorldMatrix(false,true);
 const eb=forearm.getWorldPosition(V()),hc=hand.getWorldPosition(V());
 const desired=a.clone().addScaledVector(axis,d);
 const second=Q().setFromUnitVectors(hc.sub(eb).normalize(),desired.sub(eb).normalize());
 const next=forearm.parent.getWorldQuaternion(Q()).invert().multiply(second.multiply(forearm.getWorldQuaternion(Q())));
 forearm.quaternion.slerp(next,strength);forearm.updateWorldMatrix(false,true);
}

export class GameActor {
 constructor(kind='male') {
  const asset=cache.get(kind);if(!asset)throw new Error('Character assets not loaded');
  this.kind=kind;this.group=new THREE.Group();this.group.name='Player '+kind;
  this.visual=new THREE.Group();this.group.add(this.visual);
  this.model=clone(asset.scene);this.visual.add(this.model);
  this.mixer=new THREE.AnimationMixer(this.model);
  this.actions=Object.fromEntries(asset.animations.map(c=>[c.name,this.mixer.clipAction(c)]));
  this.bones={};
  this.model.traverse(o=>{if(o.isBone)this.bones[o.name.replace(/^.*:/,'').replace(/^mixamorig/,'')]=o;
   if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}
  });
  this.current=null;this.weapon=null;this.weaponId='';this.recoil=0;this.aimWeight=0;
  this.crouchWeight=0;this.rollTime=0;this.hurtTime=0;this.dead=false;
  this.play('Idle',0);
  const aim=asset.animations.find(c=>c.name==='AimIdle');
  if(aim){
   const upper=new THREE.AnimationClip('AimUpper',aim.duration,aim.tracks.filter(t=>/Spine|Shoulder|Arm|Hand|Neck|Head/.test(t.name)));
   this.aimAction=this.mixer.clipAction(upper).play();this.aimAction.weight=0;
  }
  this.setWeapon('rifle');
 }
 play(name,fade=.16,once=false) {
  const next=this.actions[name]||this.actions.Idle;if(!next||next===this.current)return;
  next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
  next.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);next.clampWhenFinished=once;next.play();
  if(this.current)next.crossFadeFrom(this.current,fade,false);
  this.current=next;this.actionName=name;
 }
 setWeapon(type) {
  if(type===this.weaponId)return;
  if(this.weapon)this.weapon.removeFromParent();
  this.weapon=createWeapon(type,this.kind==='female'?0xee74b0:0xe76e4b);
  const hand=this.bones.RightHand;
  if(hand){
   hand.add(this.weapon);this.group.updateMatrixWorld(true);
   const scale=hand.getWorldScale(V());this.weapon.scale.setScalar(1/Math.max(.01,Math.abs(scale.x)));
  }else this.visual.add(this.weapon);
  this.weaponId=type;
 }
 fire(){this.recoil=.075;}
 muzzle(){this.group.updateMatrixWorld(true);return this.weapon.userData.muzzleNode?.getWorldPosition(V())||this.weapon.localToWorld(this.weapon.userData.muzzle.clone());}
 update(dt,{moving=false,sprinting=false,aiming=true,crouching=false,jumping=false,rolling=0,reloading=0,pitch=0,victory=false,dead=false}={}) {
  this.dead=dead;const activeAim=aiming&&!dead&&!victory&&!rolling;if(activeAim&&!this.wasAiming)this.aimAge=0;this.aimAge=(this.aimAge||0)+dt;this.wasAiming=activeAim;
  this.hurtTime=Math.max(0,this.hurtTime-dt);
  const desired=dead?'Death':victory?'Victory':rolling>0?'Roll':jumping?'Jump':crouching?(moving?'CrouchWalk':'CrouchIdle'):reloading>0&&!moving?'Reload':this.hurtTime>0&&!moving?'Hurt':moving?'Run':activeAim?(this.aimAge<(this.actions.AimRaise?.getClip().duration||0)?'AimRaise':'AimIdle'):'Idle';
  this.play(this.actions[desired]?desired:(dead?'Idle':moving?'Run':'Idle'),.12,['Death','Roll','Hurt','Reload','AimRaise'].includes(desired));
  this.current?.setEffectiveTimeScale(moving?(sprinting?1.25:.86):1);
  if(desired==='Roll'&&this.actions.Roll){this.current.time=this.current.getClip().duration*Math.max(0,1-rolling/.58);this.current.setEffectiveTimeScale(0);}
  this.aimWeight=THREE.MathUtils.damp(this.aimWeight,aiming&&!dead&&!rolling&&!victory&&!(reloading>0)?1:0,14,dt);
  if(this.aimAction)this.aimAction.setEffectiveWeight(desired==='AimRaise'?0:this.aimWeight);
  this.mixer.update(dt);
  this.crouchWeight=THREE.MathUtils.damp(this.crouchWeight,crouching?1:0,14,dt);
  this.visual.position.y=0;this.model.position.y=0;
  this.visual.rotation.set(0,0,0);
  this.visual.scale.setScalar(1);
  if(rolling>0&&!this.actions.Roll){this.model.position.y=-1;this.visual.rotation.x=-Math.PI*2*(1-rolling/.58);this.visual.position.y=.85;this.visual.scale.setScalar(.72);}
  if(dead){if(!this.actions.Death){this.model.position.y=-1;this.visual.rotation.x=-Math.PI*.48;this.visual.position.y=.28;}this.weapon.visible=false;return;}
  this.weapon.visible=!victory;
  this.recoil=Math.max(0,this.recoil-dt*.65);
  this.group.updateMatrixWorld(true);
  if(this.aimWeight>.02&&!rolling&&!victory){
   const forward=new THREE.Vector3(0,0,1).applyQuaternion(this.group.quaternion);
   const right=new THREE.Vector3(-1,0,0).applyQuaternion(this.group.quaternion);
   const base=this.group.position;
   const grip=base.clone().addScaledVector(forward,.39-this.recoil).addScaledVector(right,.21);
   grip.y=base.y+1.15-.32*this.crouchWeight+Math.sin(pitch)*.28;
   if(reloading>0){grip.y-=.15;grip.addScaledVector(forward,-.1);}
   const rightHint=base.clone().addScaledVector(right,.8).addScaledVector(forward,.12);rightHint.y+=.65;
   solveArm(this.bones.RightArm,this.bones.RightForeArm,this.bones.RightHand,grip,rightHint,this.aimWeight*Math.min(1,this.aimAge/.86));
   this.group.updateMatrixWorld(true);
   const aim=this.group.getWorldQuaternion(Q()).multiply(Q().setFromAxisAngle(new THREE.Vector3(1,0,0),-pitch));
   if(reloading>0)aim.multiply(Q().setFromAxisAngle(new THREE.Vector3(0,0,1),-.45));
   const handQ=this.bones.RightHand?.getWorldQuaternion(Q());
   if(handQ)this.weapon.quaternion.copy(handQ.invert().multiply(aim));
   this.group.updateMatrixWorld(true);
   const leftTarget=this.weapon.localToWorld(this.weapon.userData.leftGrip.clone());
   const leftHint=base.clone().addScaledVector(right,-.75).addScaledVector(forward,.22);leftHint.y+=.65;
   if(reloading>0)leftTarget.y-=.22*Math.sin(reloading*10)**2;
   solveArm(this.bones.LeftArm,this.bones.LeftForeArm,this.bones.LeftHand,leftTarget,leftHint,this.aimWeight);
  }
  this.group.updateMatrixWorld(true);
 }
 dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.model);this.group.removeFromParent();}
}
