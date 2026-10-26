import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { AnkaGame } from '../game/engine.js';
import { createWorld } from '../game/world.js';
import { WEAPONS, MAPS } from '../game/config.js';

import { fixture } from './game-fixture.mjs';
const p=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const results=[];
for(const map of MAPS){
 const g=fixture(map.id);await g.start({map:map.id,mode:'story',character:'male'});
 assert.equal(g.state.phase,'playing');assert.equal(g.state.ammo,28);assert.ok(!g.collision(g.player.group.position.x,g.player.group.position.z));
 // Full three-wave mission including real spawning and Boss phases.
 const encountered=new Set();for(let tick=0;tick<1800&&g.state.phase==='playing';tick++){
  g.state.hp=120;g.invulnerable=1;g.frame(tick*45);
  for(const e of [...g.enemies]){encountered.add(e.kind);if(e.kind==='boss'){e.hp=e.maxHp*.3;g.updateEnemies(0);assert.equal(g.state.boss.phase,3);}g.damageEnemy(e,10000);}
 }
 assert.equal(g.state.phase,'victory',`${map.id} must complete all 3 waves`);assert.equal(g.state.wave,3);assert.ok(encountered.has('boss'));assert.ok(g.state.kills>=20);
 g.clearBattle();g.world.dispose();results.push({map:map.id,mission:'passed',kills:g.state.kills,enemies:[...encountered]});
}
const g=fixture();await g.start({mode:'survival'});g.nextWave();g.state.wave=4;g.nextWave();assert.ok(g.pendingSpawns.includes('boss'));
g.state.hp=30;g.medkit();assert.equal(g.state.hp,95);assert.equal(g.state.medkits,2);g.shield();assert.equal(g.state.shield,80);g.invulnerable=0;g.takeDamage(25);assert.equal(g.state.hp,95);assert.equal(g.state.shield,55);
for(let i=0;i<WEAPONS.length;i++){g.setWeapon(i);g.fireCooldown=0;g.reloadLeft=0;g.aimDirection=()=>p(0,0,-1);g.fire();assert.equal(g.state.ammo,WEAPONS[i].mag-1);g.reload();assert.ok(g.reloadLeft>0);g.keys.clear();g.updatePlayer(WEAPONS[i].reload+.01);assert.equal(g.state.ammo,WEAPONS[i].mag);}
g.rollCooldown=0;g.grounded=true;g.roll();assert.equal(g.rollLeft,.58);assert.ok(g.invulnerable>0);g.rollLeft=0;g.grounded=true;g.jump();assert.equal(g.velocityY,6.5);g.state.hp=1;g.invulnerable=0;g.takeDamage(200);assert.equal(g.state.phase,'defeat');g.clearBattle();g.world.dispose();
results.push({weapons:7,magazineReload:'passed',shieldDamageHealing:'passed',jumpRoll:'passed',survivalBoss:'passed',defeat:'passed'});

const multiplayer=fixture();const sent=[];multiplayer.network={connected:true,isHost:true,localId:'host',broadcast:payload=>sent.push(payload),send:payload=>sent.push(payload)};await multiplayer.start({mode:'versus'});
const remoteActor={group:new THREE.Group(),dispose(){this.group.removeFromParent()},update(){}};remoteActor.group.position.set(0,0,3);multiplayer.remotes.set('guest',{actor:remoteActor,hp:120,target:p(0,0,3)});
multiplayer.resolveShot(p(0,1.1,6),p(0,0,-1),WEAPONS[1],'host');assert.equal(multiplayer.matchScores.host.kills,1);assert.equal(multiplayer.state.score,100);assert.ok(sent.some(m=>m.type==='damage'&&m.to==='guest'));
multiplayer.state.mode='coop';multiplayer.invulnerable=0;multiplayer.takeDamage(200);assert.equal(multiplayer.state.phase,'playing');assert.equal(multiplayer.deadTimer,30);remoteActor.group.position.copy(multiplayer.player.group.position).add(p(1,0,0));await multiplayer.consumeNetwork({type:'revive',to:'host'},'guest');assert.equal(multiplayer.state.hp,70);
multiplayer.network={connected:true,isHost:false,localId:'guest',send(){}};await multiplayer.consumeNetwork({type:'session',session:'round-two',mode:'versus',map:'desert'},'host');assert.equal(multiplayer.roundId,'round-two');assert.equal(multiplayer.state.hp,120);await multiplayer.consumeNetwork({type:'world',wave:1,remaining:0,score:999,scores:{guest:{score:200,kills:2}},enemies:[]},'host');assert.equal(multiplayer.state.score,200);assert.equal(multiplayer.state.kills,2);
multiplayer.clearBattle();multiplayer.world.dispose();results.push({pvpScoring:'passed',coopRevive:'passed',roundRestart:'passed',guestScoreSnapshot:'passed'});
await fs.mkdir('reports/game',{recursive:true});await fs.writeFile('reports/game/controller-checks.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
