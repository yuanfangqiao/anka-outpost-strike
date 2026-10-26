import { Vector3 } from 'three';
import { NavigationGrid } from './navigation.js';
import { WEAPONS } from './config.js';

export const SUPPLY_NAMES={health:'医疗补给',ammo:'弹药箱',shield:'护盾装置',grenade:'手雷补给',medkit:'医疗包'};
export const SUPPLY_RESPAWN=24;
const positions=[['health',-9,3.5],['health',9,-3.5],['ammo',-5,-6],['ammo',5,6],['shield',0,5],['grenade',0,-5],['medkit',-10,-7],['medkit',10,7]];

export function supplyStations(world){
 const nav=new NavigationGrid(world),scale=world.duel?1.35:1;
 return positions.map(([kind,x,z],i)=>{
  const index=nav.nearest(new Vector3(x*scale,0,z*scale));
  return {id:`supply-${i}`,kind,p:nav.point(index%nav.width,Math.floor(index/nav.width))};
 });
}

export function canTakeSupply(p,kind){
 if(p.hp<=0)return false;
 if(kind==='health')return p.hp<120;
 if(kind==='ammo')return p.inventory.some((item,i)=>item.reserve<WEAPONS[i].reserve*2);
 if(kind==='shield')return p.shieldCharges<4;
 if(kind==='medkit')return p.medkits<5;
 return p.grenades<6;
}

export function applySupply(p,kind){
 if(!canTakeSupply(p,kind))return false;
 if(kind==='health')p.hp=Math.min(120,p.hp+45);
 else if(kind==='ammo')p.inventory.forEach((item,i)=>{item.reserve=Math.min(WEAPONS[i].reserve*2,item.reserve+WEAPONS[i].mag*2);});
 else if(kind==='shield')p.shieldCharges=Math.min(4,p.shieldCharges+1);
 else if(kind==='medkit')p.medkits=Math.min(5,p.medkits+1);
 else p.grenades=Math.min(6,p.grenades+2);
 return true;
}

export class SupplyField{
 constructor(game){
  this.game=game;
  for(const node of game.pickups)node.mesh.removeFromParent();game.pickups=[];
  for(const station of supplyStations(game.world)){
   game.addPickup(station.kind,station.p,true);
   game.pickups.at(-1).id=station.id;
  }
 }
 get nodes(){return this.game.pickups;}
 inReach(node,position,radius=1.25){
  const p=node.mesh.position;
  return node.cooldown===0&&Math.hypot(p.x-position.x,p.z-position.z)<=radius&&Math.abs(position.y-(node.baseY-.45))<1.6
   &&!this.game.blocked(position.clone().add(new Vector3(0,1.15,0)),p.clone().add(new Vector3(0,.2,0)));
 }
 nearest(position,radius=2.4){return this.nodes.filter(node=>this.inReach(node,position,radius)).sort((a,b)=>a.mesh.position.distanceTo(position)-b.mesh.position.distanceTo(position))[0];}
 claim(node,p,position,radius=1.25){
  if(!this.inReach(node,position,radius)||!applySupply(p,node.kind))return false;
  node.cooldown=node.persistent?SUPPLY_RESPAWN:Infinity;node.mesh.visible=false;return true;
 }
 cool(dt){for(const node of this.nodes)if(Number.isFinite(node.cooldown))node.cooldown=Math.max(0,node.cooldown-dt);}
 render(dt){
  const g=this.game;
  for(const node of this.nodes){node.mesh.visible=node.cooldown===0;if(!node.mesh.visible)continue;
   node.mesh.rotation.y+=dt*.8;node.mesh.position.y=node.baseY+Math.sin(g.now*2)*.13;}
  const nearby=g.state.hp>0?this.nearest(g.player.group.position):null;
  const player={...g.state,inventory:g.inventory};
  g.state.pickup=nearby?{id:nearby.id,kind:nearby.kind,label:SUPPLY_NAMES[nearby.kind],full:!canTakeSupply(player,nearby.kind)}:null;
 }
 collectLocal(node,radius=1.25){
  const g=this.game,p={...g.state,inventory:g.inventory};
  if(!this.claim(node,p,g.player.group.position,radius))return false;
  for(const key of ['hp','medkits','grenades','shieldCharges'])g.state[key]=p[key];
  g.state.pickup=null;g.selectInventory();g.fx.heal(g.player.group.position);g.notice(`已拾取${SUPPLY_NAMES[node.kind]}`);g.emit();return true;
 }
 offline(dt){this.cool(dt);if(this.game.state.hp>0)for(const node of this.nodes)this.collectLocal(node);this.render(dt);this.game.pickups=this.nodes.filter(node=>{if(node.cooldown===Infinity){node.mesh.removeFromParent();return false;}return true;});}
 authoritative(dt,players,onClaim){
  this.cool(dt);
  for(const p of Object.values(players))if(p.hp>0)for(const node of this.nodes){
   if(this.claim(node,p,new Vector3(...p.p)))onClaim(node,p);
  }
 }
 snapshot(){return this.nodes.map(node=>({id:node.id,cooldown:Math.round(node.cooldown*100)/100}));}
 receive(snapshot){
  if(!Array.isArray(snapshot))return;
  for(const entry of snapshot){const node=this.nodes.find(p=>p.id===entry.id);if(node&&Number.isFinite(entry.cooldown)&&entry.cooldown>=0&&entry.cooldown<=SUPPLY_RESPAWN)node.cooldown=entry.cooldown;}
 }
}
