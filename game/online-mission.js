import { ENEMIES } from './config.js';
import { Vector3 } from 'three';

function hazardId(game,hazard){
 return hazard.onlineId??=(game.online.nextHazard=(game.online.nextHazard||0)+1);
}

export function missionSnapshot(game){
 const {wave,remaining,goal,score,kills,boss,message,elapsed}=game.state;
 return {wave,remaining,goal,score,kills,boss,message,elapsed,
  enemies:game.enemies.filter(enemy=>enemy.hp>0).map(enemy=>({
   id:enemy.id,kind:enemy.kind,p:enemy.mesh.position.toArray(),yaw:enemy.mesh.rotation.y,hp:enemy.hp,
  })),
  projectiles:game.projectiles.map(projectile=>({
   id:hazardId(game,projectile),p:projectile.mesh.position.toArray(),team:projectile.team,kind:projectile.kind,
  })),
  telegraphs:game.telegraphs.map(telegraph=>({
   id:hazardId(game,telegraph),p:telegraph.mesh.position.toArray(),life:telegraph.life,radius:telegraph.radius,
  }))};
}

export function receiveMission(game,mission){
 const {wave,remaining,goal,score,kills,boss,message,elapsed,enemies}=mission;
 Object.assign(game.state,{wave,remaining,goal,score,kills,boss,message,elapsed});
 const current=new Map(game.enemies.map(enemy=>[enemy.id,enemy]));
 for(const data of enemies){
  if(!ENEMIES[data.kind])continue;
  const enemy=current.get(data.id)||game.makeEnemy(data.kind,game.player.group.position,data.id);
  enemy.mesh.position.fromArray(data.p);enemy.mesh.rotation.y=data.yaw;enemy.hp=data.hp;
  current.delete(data.id);
 }
 for(const enemy of current.values())enemy.mesh.removeFromParent();
 game.enemies=game.enemies.filter(enemy=>!current.has(enemy.id));
 game.projectiles=syncHazards(game.projectiles,mission.projectiles,data=>{
  game.launchProjectile(new Vector3(...data.p),new Vector3(),{team:data.team,kind:data.kind});
  return game.projectiles.at(-1);
 });
 game.telegraphs=syncHazards(game.telegraphs,mission.telegraphs,data=>{
  game.telegraph(new Vector3(...data.p),data.radius);
  return game.telegraphs.at(-1);
 },telegraph=>{
  telegraph.mesh.geometry.dispose();telegraph.mesh.material.dispose();
 });
}

function syncHazards(hazards,snapshot,create,dispose=()=>{}){
 const current=new Map(hazards.map(hazard=>[hazard.onlineId,hazard]));
 const visibleIds=new Set(snapshot.map(data=>data.id));
 for(let i=hazards.length-1;i>=0;i--){
  const hazard=hazards[i];if(visibleIds.has(hazard.onlineId))continue;
  hazard.mesh.removeFromParent();dispose(hazard);hazards.splice(i,1);
 }
 return snapshot.map(data=>{
  const hazard=current.get(data.id)||create(data);
  hazard.onlineId=data.id;hazard.mesh.position.fromArray(data.p);
  if(data.life!=null)hazard.mesh.material.opacity=.32+data.life*.35;
  return hazard;
 });
}
