import * as THREE from 'three';
import { AnkaGame } from '../game/engine.js';
import { createWorld } from '../game/world.js';
// Exercise the actual game controller without a browser/GPU; visual QA is separate.
globalThis.document={exitPointerLock(){}};
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
const p=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);

export function fixture(map='desert'){
 const g=Object.create(AnkaGame.prototype);
 const makeActor=kind=>({kind,group:new THREE.Group(),setWeapon(){},fire(){},muzzle(){return this.group.position.clone().add(p(0,1.15,0))},update(){},dispose(){this.group.removeFromParent()}});const actor=makeActor('male');
 Object.assign(g,{createDuelActor:makeActor,state:{phase:'menu',map,character:'male',maxHp:120},scene:new THREE.Scene(),sun:new THREE.DirectionalLight(),projectileGeometry:new THREE.SphereGeometry(.1,8,6),projectileMaterials:{player:new THREE.MeshBasicMaterial(),enemy:new THREE.MeshBasicMaterial()},world:createWorld(map),player:actor,buddy:null,network:null,ready:Promise.resolve(),enemies:[],pickups:[],projectiles:[],telegraphs:[],remotes:new Map(),nextEnemy:1,keys:new Set(),touchMove:{x:0,y:0},heldFire:false,aimNdc:new THREE.Vector2(),raycaster:new THREE.Raycaster(),camera:new THREE.PerspectiveCamera(58,1,.08,180),listeners:[],now:0,lastTime:0,uiTimer:0,netTimer:0,noticeTime:0,comboTime:0,rollCooldown:0,grounded:true,onState(){},renderer:{render(){}}});
 const effects=['unlockAudio','reload','heal','shield','fire','impact','explosion','damage','update'];g.fx=Object.fromEntries(effects.map(k=>[k,()=>{}]));g.fx.damagePulse=0;return g;
}
