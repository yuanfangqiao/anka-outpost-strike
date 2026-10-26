import { Vector3 } from 'three';
import { NavigationGrid } from './navigation.js';

export const DUEL_SCALE=1.35;
const anchors=[[-9,13],[9,-13],[9,13],[-9,-13],[-2,15],[2,-15],[-17,7],[17,-7],[-17,-5],[17,5]];

// Tall solid cover interrupts the opening sightline; flanks remain traversable.
export function addDuelCover({box,collider}){
 for(const [x,z,w,d,h]of[[0,0,5.2,4,3.1],[-4,10,7,1.1,2.7],[4,-10,7,1.1,2.7],[-7,-3,1.2,5,2.5],[7,3,1.2,5,2.5]]){
  box(x,h/2,z,w,h,d,'metal',true);
  box(x,h+.07,z,w+.14,.14,d+.14,'wallLight');
  for(let i=-1;i<=1;i++)box(x+i*w/4,h*.58,z+d/2+.02,.08,h*.7,.04,'accent');
  collider(x,z,w,d,h,'duel-sightline-cover');
 }
 for(const [x,z]of[[-9,5],[9,-5]]){
  box(x,.65,z,3,1.3,1.2,'wood',true);
  collider(x,z,3,1.2,1.3,'duel-low-cover');
 }
}

export function spawnPoints(scale=DUEL_SCALE){return anchors.map(([x,z])=>new Vector3(x*scale,0,z*scale));}

export function hiddenFrom(game,position,opponents){
 return opponents.every(other=>[1.15,1.6,2].every(height=>game.blocked(
  position.clone().add(new Vector3(0,1.6,0)),other.clone().add(new Vector3(0,height,0)))));
}

export function chooseSpawn(game,opponents=[],previous=null,nav=new NavigationGrid(game.world)){
 if(!nav.spawnCandidates){
  const anchorIndex=nav.nearest(new Vector3(0,0,8));
  const anchor=nav.point(anchorIndex%nav.width,Math.floor(anchorIndex/nav.width));
  nav.spawnCandidates=(game.world.duelSpawns||[game.world.playerSpawn,...game.world.enemySpawns])
   .filter(p=>nav.clear(p)&&nav.path(p,anchor).length);
 }
 const candidates=nav.spawnCandidates;
 const distance=p=>opponents.length?Math.min(...opponents.map(q=>p.distanceTo(q))):0;
 const hidden=p=>opponents.length&&hiddenFrom(game,p,opponents);
 const score=p=>(hidden(p)?10000:0)+(distance(p)>=22?1000:0)+Math.min(48,distance(p))*5
  +(previous?Math.min(12,p.distanceTo(previous))*2:0);
 return [...candidates].sort((a,b)=>score(b)-score(a))[0]?.clone()||game.world.playerSpawn.clone();
}

export function opponentVisible(game,position){
 const eye=game.player.group.position.clone().add(new Vector3(0,1.6,0));
 return eye.distanceTo(position)<48&&!game.blocked(eye,position.clone().add(new Vector3(0,1.3,0)));
}
