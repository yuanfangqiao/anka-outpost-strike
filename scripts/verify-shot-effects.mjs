import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {fixture} from './game-fixture.mjs';
import {Perspective,updateGameCamera} from '../game/perspective.js';
import {CombatEffects} from '../game/effects.js';
import {WEAPONS} from '../game/config.js';
import {gameDelta,mobileViewport} from '../game/mobile.js';
import {OnlineDuel} from '../game/online-duel.js';
const v=(x=0,y=0,z=0)=>new Vector3(x,y,z);
const g=fixture();await g.start({mode:'story'});g.state.perspective='first';g.view=new Perspective(g);
for(const aspect of [1440/900,844/390,568/320])for(const ads of [false,true])for(let weapon=0;weapon<WEAPONS.length;weapon++){
 g.camera.aspect=aspect;g.state.weapon=weapon;ads?g.keys.add('MouseRight'):g.keys.delete('MouseRight');updateGameCamera(g,.2);g.view.sync(0);
 const actual=g.view.muzzleWorld().project(g.camera);
 const expected=g.view.weapon.userData.muzzleNode.getWorldPosition(v()).project(g.view.camera);
 assert.ok(Math.hypot(expected.x-actual.x,expected.y-actual.y)<1e-5,'visible tracer must start at the rendered muzzle, including ADS');
 assert.ok(Math.abs(actual.x)<1&&Math.abs(actual.y)<1,'muzzle must be visible');
}
g.keys.clear();g.state.weapon=0;g.view.sync(0);g.fx=new CombatEffects(g.scene,{muted:true});
const origin=g.shotOrigin(),ammo=g.inventory[0].ammo;g.fire();
assert.equal(g.inventory[0].ammo,ammo-1);assert.ok(g.shotOrigin().distanceTo(origin)<1e-8,'visual parallax must not move the gameplay ray');
const tracer=g.fx._tracers.slots.find(s=>s.travel&&s.life>0);assert.ok(tracer);assert.ok(tracer.start.distanceTo(origin)>.4,'tracer starts outside the camera');
assert.ok(g.view.flashTime>0);const before=tracer.mesh.position.clone();g.fx.update(.04);assert.ok(tracer.mesh.position.distanceTo(before)>1,'tracer travels forward');
for(let i=0;i<100;i++){g.fx.fire(v(),v(0,0,-20),{player:true});g.fx.update(.005);}
assert.equal(g.fx._tracers.slots.length,24,'rapid fire stays within the effect pool');g.fx.update(1);assert.ok(g.fx._tracers.slots.every(s=>!s.mesh.visible));
g.view.dispose();g.view=null;g.fx.dispose();g.clearBattle();g.world.dispose();
// Received host effects must use the local viewmodel only for our own shots.
const online=fixture();online.network={connected:true,isHost:false,localId:'guest',send(){},broadcast(){}};await online.start({mode:'versus'});
const duel=new OnlineDuel(online,{host:'host',round:'shots',rules:{duration:180,target:10},players:{host:{character:'male'},guest:{character:'female'}}});
const calls=[];online.fx.fire=(from,to,options)=>calls.push(options);
duel.showEffect({kind:'shot',from:[0,1,0],to:[0,1,-20],shooter:'guest',weapon:6});assert.equal(calls.at(-1).player,true);assert.equal(calls.at(-1).color,WEAPONS[6].color);
duel.showEffect({kind:'shot',from:[0,1,0],to:[0,1,-20],shooter:'host',color:0xff6555});assert.notEqual(calls.at(-1).player,true);
online.clearBattle();online.world.dispose();
assert.deepEqual(gameDelta({x:12,y:24},true),{x:24,y:-12});
const portrait=mobileViewport({innerWidth:390,innerHeight:844,matchMedia:()=>({matches:true})},{maxTouchPoints:5});assert.deepEqual(portrait,{enabled:true,rotated:true,width:844,height:390});
const desktop=mobileViewport({innerWidth:1440,innerHeight:900,matchMedia:()=>({matches:false})},{maxTouchPoints:0});assert.equal(desktop.enabled,false);
console.log('Muzzle projection: 42 weapon / ADS / viewport combinations; traveling tracers, bounded pools, online effects and landscape coordinate mapping passed.');
