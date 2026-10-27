import * as THREE from 'three';
import { createWeapon } from './assets.js';
import { WEAPONS } from './config.js';
const p=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
export const eyeHeight=game=>game.keys.has('KeyC')?1.08:1.58;

export function updateGameCamera(g,dt){
 const position=g.player.group.position,forward=p(Math.sin(g.lookYaw),0,Math.cos(g.lookYaw));
 if(g.state.perspective==='first'){
  g.aimNdc.set(0,0);g.camera.position.copy(position).add(p(0,eyeHeight(g),0));
  const direction=p(forward.x*Math.cos(g.lookPitch),Math.sin(g.lookPitch),forward.z*Math.cos(g.lookPitch));
  g.camera.lookAt(g.camera.position.clone().add(direction));
 }else{
  const right=p(-Math.cos(g.lookYaw),0,Math.sin(g.lookYaw));
  const target=position.clone().add(p(0,1.28,0)).addScaledVector(forward,9);target.y+=Math.sin(g.lookPitch)*8;
  const desired=position.clone().addScaledVector(forward,-5.9).addScaledVector(right,.95).add(p(0,2.75,0));
  const pivot=position.clone().add(p(0,1.35,0)),ray=new THREE.Ray(pivot,desired.clone().sub(pivot).normalize());let distance=pivot.distanceTo(desired);
  for(const c of g.world.colliders){const hit=ray.intersectBox(new THREE.Box3(p(c.minX-.12,0,c.minZ-.12),p(c.maxX+.12,c.height+.12,c.maxZ+.12)),p());if(hit)distance=Math.min(distance,Math.max(.6,pivot.distanceTo(hit)-.2));}
  g.camera.position.lerp(ray.at(distance,p()),1-Math.exp(-10*dt));g.camera.lookAt(target);
 }
 const ads=g.keys.has('MouseRight'),fov=ads?(g.state.weapon===1?32:55):(g.state.perspective==='first'?76:58);
 g.camera.fov=THREE.MathUtils.damp(g.camera.fov,fov,10,dt);g.camera.updateProjectionMatrix();g.camera.updateMatrixWorld(true);
}

export class Perspective{
 constructor(game){
  this.game=game;this.rig=new THREE.Group();this.rig.name='first-person-viewmodel';
  this.scene=new THREE.Scene();this.scene.add(this.rig);this.camera=new THREE.PerspectiveCamera(70,game.camera.aspect,.02,10);
  this.scene.add(new THREE.HemisphereLight(0xe6f3ff,0x8e735e,2.5));
  const light=new THREE.DirectionalLight(0xffefd8,3);light.position.set(-2,3,2);this.scene.add(light);
  this.weaponId='';this.kick=0;this.flashTime=0;this.ownedGeometries=[];this.ownedMaterials=[];
  const flashGeometry=new THREE.ConeGeometry(.065,.24,6),flashMaterial=new THREE.MeshBasicMaterial({color:0xffdd97,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  this.ownedGeometries.push(flashGeometry);this.ownedMaterials.push(flashMaterial);
  this.flash=new THREE.Mesh(flashGeometry,flashMaterial);this.flash.rotation.x=-Math.PI/2;this.flash.renderOrder=1003;this.flash.visible=false;this.rig.add(this.flash);
  const sleeve=new THREE.MeshStandardMaterial({color:0x344e5b,roughness:.9});
  const glove=new THREE.MeshStandardMaterial({color:0x182d36,roughness:.8});
  this.ownedMaterials.push(sleeve,glove);
  for(const [wrist,elbow]of[[p(.27,-.31,-.43),p(.48,-.62,-.04)],[p(.19,-.29,-.69),p(-.25,-.61,-.05)]]){
   const geometry=new THREE.CylinderGeometry(.06,.085,wrist.distanceTo(elbow),8);this.ownedGeometries.push(geometry);
   const arm=new THREE.Mesh(geometry,sleeve);arm.position.copy(wrist).add(elbow).multiplyScalar(.5);arm.quaternion.setFromUnitVectors(p(0,1,0),elbow.clone().sub(wrist).normalize());arm.renderOrder=1000;this.rig.add(arm);
   const handGeometry=new THREE.BoxGeometry(.12,.12,.17);this.ownedGeometries.push(handGeometry);const hand=new THREE.Mesh(handGeometry,glove);hand.position.copy(wrist);hand.renderOrder=1001;this.rig.add(hand);
  }
 }
 set(value){
  const g=this.game;g.state.perspective=value==='third'?'third':'first';g.aimNdc.set(0,0);g.lookPitch=THREE.MathUtils.clamp(g.lookPitch,-.5,.38);
  if(value==='third')document.exitPointerLock?.();this.sync(0);g.emit();
 }
 sync(dt){
  const g=this.game,active=g.state.perspective==='first'&&['playing','paused'].includes(g.state.phase);
  if(g.state.phase==='menu'&&g.camera.fov!==58){g.camera.fov=58;g.camera.updateProjectionMatrix();}
  if(g.player)g.player.group.visible=!active;
  this.rig.visible=active&&g.state.hp>0;if(!this.rig.visible){this.flashTime=0;this.flash.visible=false;return;}
  if(this.weaponId!==WEAPONS[g.state.weapon].id){
   this.weapon?.removeFromParent();this.weaponMaterials?.forEach(m=>m.dispose());
   this.weaponId=WEAPONS[g.state.weapon].id;this.weapon=createWeapon(this.weaponId);this.weaponMaterials=[];
   this.weapon.traverse(o=>{if(o.isMesh){o.material=o.material.clone();this.weaponMaterials.push(o.material);o.renderOrder=1002;o.castShadow=false;}});
   this.weapon.rotation.y=Math.PI;this.rig.add(this.weapon);
  }
  this.kick=Math.max(0,this.kick-dt*.45);const ads=g.keys.has('MouseRight');
  this.weapon.position.set(ads?.06:.25,-.30,-.43+this.kick);
  const reload=g.state.reloading>0?Math.sin(g.state.reloading*Math.PI)*.16:0;
  this.rig.position.set((g.camera.aspect<1?-.07:0)+(g.moving?Math.sin(g.now*9)*.007:0),-reload+(g.moving?Math.cos(g.now*18)*.005:0),0);
  this.flashTime=Math.max(0,this.flashTime-dt);this.flash.visible=this.flashTime>0;
  if(this.flash.visible){this.flash.position.copy(this.weapon.position).add(this.weapon.userData.muzzle.clone().applyQuaternion(this.weapon.quaternion));this.flash.position.z-=.08;this.flash.material.opacity=Math.min(1,this.flashTime/.035);this.flash.scale.setScalar(1+this.flashTime*5);}
  if(g.state.phase==='playing')updateGameCamera(g,dt);
 }
 flashShot(weapon){this.flashTime=.085;this.flash.material.color.set(weapon.id==='energy'?weapon.color:0xffdd97);}
 updateProjection(){
  this.camera.aspect=this.game.camera.aspect;
  this.camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(35))/Math.min(1,this.camera.aspect)));
  this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
 }
 muzzleWorld(){
  if(!this.weapon)return this.game.camera.localToWorld(p(.25,-.19,-.95));
  this.updateProjection();this.rig.updateMatrixWorld(true);
  const muzzle=this.weapon.userData.muzzleNode.getWorldPosition(p()),depth=Math.max(.4,-muzzle.z);
  // The gun has its own projection; preserve its screen position in the world camera.
  const ndc=muzzle.project(this.camera),g=this.game;
  const direction=p(ndc.x,ndc.y,.5).unproject(g.camera).sub(g.camera.position).normalize();
  return g.camera.position.clone().addScaledVector(direction,depth/direction.dot(g.camera.getWorldDirection(p())));
 }
 render(renderer){
  if(!this.rig.visible)return;
  this.updateProjection();
  const autoClear=renderer.autoClear;renderer.autoClear=false;renderer.clearDepth();
  renderer.render(this.scene,this.camera);renderer.autoClear=autoClear;
 }
 dispose(){
  if(this.game.player)this.game.player.group.visible=true;
  this.rig.removeFromParent();this.weaponMaterials?.forEach(m=>m.dispose());
  this.ownedMaterials.forEach(m=>m.dispose());this.ownedGeometries.forEach(g=>g.dispose());
 }
}

export function findAimTarget(g){
  g.raycaster.setFromCamera(g.aimNdc,g.camera);const ray=g.raycaster.ray;let distance=70,target=null,near=.105;
  for(const c of g.world.colliders){const hit=ray.intersectBox(new THREE.Box3(p(c.minX,0,c.minZ),p(c.maxX,c.height,c.maxZ)),p());if(hit)distance=Math.min(distance,ray.origin.distanceTo(hit));}
  for(const e of g.enemies){if(e.hp<=0)continue;const center=e.mesh.position.clone().add(p(0,e.mesh.userData.aimHeight||1,0));const projected=center.clone().project(g.camera),d=Math.hypot(projected.x-g.aimNdc.x,projected.y-g.aimNdc.y);if(projected.z<1&&d<near&&!g.blocked(ray.origin,center)){near=d;target=center;}}
  if(g.duel?.bot.hp>0){const center=g.duel.bot.actor.group.position.clone().add(p(0,g.duel.bot.crouching?.9:1.2,0)),projected=center.clone().project(g.camera);if(projected.z>-1&&projected.z<1&&Math.hypot(projected.x-g.aimNdc.x,projected.y-g.aimNdc.y)<near&&!g.blocked(ray.origin,center))target=center;}
  return target||ray.at(distance,p());
 }
