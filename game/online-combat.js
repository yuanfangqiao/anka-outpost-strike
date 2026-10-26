import * as THREE from 'three';
import { WEAPONS } from './config.js';
const v=(a)=>new THREE.Vector3(...a);
export const vector=a=>Array.isArray(a)&&a.length===3&&a.every(n=>Number.isFinite(n)&&Math.abs(n)<500);

export function damage(duel,target,amount,shooter){
 if(!duel.host||target.hp<=0||target.protection>0||target.immunity>0||duel.ended)return false;
 const shield=Math.min(target.shield,amount);target.shield-=shield;target.hp=Math.max(0,target.hp-amount+shield);target.immunity=.12;
 if(target.hp===0){target.deaths++;target.respawn=3;const killer=duel.players[shooter];if(killer&&killer!==target)killer.kills++;}
 duel.publish();if(Object.values(duel.players).some(p=>p.kills>=duel.room.rules.target))duel.finish();return true;
}

export function act(duel,id,payload){
 const g=duel.game,p=duel.players[id];if(!duel.host||!p||p.hp<=0||duel.ended)return;
 const weapon=Number.isInteger(payload.weapon)?payload.weapon:p.weapon;
 if(weapon<0||weapon>=WEAPONS.length)return;
 p.weapon=weapon;const w=WEAPONS[weapon],ammo=p.inventory[weapon],now=g.now;
 if(payload.action==='pickup'){
  const node=duel.supplies.nodes.find(node=>node.id===payload.pickupId);
  if(node&&duel.supplies.claim(node,p,v(p.p),2.4))duel.effect({kind:'pickup',supply:node.kind,player:id,p:node.mesh.position.toArray()});
 }else if(payload.action==='reload'){
  if(p.reload<=0&&ammo.ammo<w.mag&&ammo.reserve>0){p.reload=w.reload;p.reloadWeapon=weapon;}
 }else if(payload.action==='heal'){
  if(p.medkits>0&&p.hp<120){p.medkits--;p.hp=Math.min(120,p.hp+65);duel.effect({kind:'heal',p:p.p});}
 }else if(payload.action==='shield'){
  if(p.shieldCharges>0){p.shieldCharges--;p.shield=Math.min(100,p.shield+80);duel.effect({kind:'shield',p:p.p});}
 }else if(payload.action==='roll'){
  if(now-p.lastRoll>=1.8){p.lastRoll=now;p.immunity=Math.max(p.immunity,.5);}
 }else if(payload.action==='shot'||payload.action==='grenade'){
  if(!vector(payload.direction)||p.reload>0)return;
  const direction=v(payload.direction);if(direction.lengthSq()<.01)return;direction.normalize();
  const origin=v(p.p).add(new THREE.Vector3(0,payload.view==='first'?(p.crouching?1.08:1.58):1.15,0));
  if(payload.action==='grenade'){
   if(p.grenades<=0||now-p.lastGrenade<.5)return;p.grenades--;p.lastGrenade=now;
   g.launchProjectile(origin,direction.multiplyScalar(12).add(new THREE.Vector3(0,5,0)),{team:'player',shooter:id,damage:110,radius:3.8,gravity:13,fuse:1.4,kind:'grenade'});
  }else{
   if(now-p.lastShot<1/w.rate-.005||ammo.ammo<=0)return;
   p.lastShot=now;ammo.ammo--;p.protection=0;
   if(w.projectile){g.launchProjectile(origin,direction.clone().multiplyScalar(w.projectile==='rocket'?24:18).add(new THREE.Vector3(0,w.projectile==='rocket'?0:3,0)),{team:'player',shooter:id,damage:w.damage,radius:w.radius,gravity:w.projectile==='rocket'?0:9,fuse:w.projectile==='rocket'?2.5:1.8,kind:w.projectile});}
   else for(let i=0;i<w.pellets;i++){
    const dir=direction.clone().add(new THREE.Vector3((Math.random()-.5)*w.spread,(Math.random()-.5)*w.spread,(Math.random()-.5)*w.spread)).normalize();
    const ray=new THREE.Ray(origin,dir);let distance=w.range,target=null;
    for(const c of g.world.colliders){const hit=ray.intersectBox(new THREE.Box3(new THREE.Vector3(c.minX,0,c.minZ),new THREE.Vector3(c.maxX,c.height,c.maxZ)),new THREE.Vector3());if(hit)distance=Math.min(distance,hit.distanceTo(origin));}
    for(const other of Object.values(duel.players))if(other.id!==id&&other.hp>0){
     for(const height of other.crouching?[.35,.75,1.15]:[.4,1,1.65]){
      const hit=ray.intersectSphere(new THREE.Sphere(v(other.p).add(new THREE.Vector3(0,height,0)),.38),new THREE.Vector3());
      if(hit&&hit.distanceTo(origin)<distance){distance=hit.distanceTo(origin);target=other;}
     }
    }
    if(target)damage(duel,target,w.damage,id);
    if(i<3)duel.effect({kind:'shot',from:origin.toArray(),to:origin.clone().addScaledVector(dir,distance).toArray(),color:w.color,shooter:id,hit:!!target});
   }
  }
 }
 duel.publish();
}

export function explosion(duel,projectile){
 if(!duel.host)return;
 const pos=projectile.mesh.position;
 for(const p of Object.values(duel.players)){
  if(p.id===projectile.shooter||p.hp<=0)continue;
  const target=v(p.p).add(new THREE.Vector3(0,1,0)),distance=target.distanceTo(pos);
  if(distance<projectile.radius&&!duel.game.blocked(pos.clone().add(new THREE.Vector3(0,.1,0)),target))damage(duel,p,projectile.damage*(1-.65*distance/projectile.radius),projectile.shooter);
 }
 duel.effect({kind:'explosion',p:pos.toArray(),radius:projectile.radius});
}
