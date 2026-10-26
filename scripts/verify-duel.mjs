import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { fixture } from './game-fixture.mjs';
import { NavigationGrid } from '../game/navigation.js';
import { WEAPONS, MAPS } from '../game/config.js';
const p=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),results=[];
let seed=7;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);

for(const map of MAPS){const g=fixture(map.id);await g.start({mode:'versus',map:map.id});g.duel.random=random;
 assert.equal(g.enemies.length,0);assert.equal(g.pendingSpawns.length,0);assert.equal(g.waveDelay,0);assert.notEqual(g.duel.bot.actor.kind,g.player.kind);
 const nav=g.duel.nav;let routes=0;
 for(const spawn of g.world.enemySpawns){const route=nav.path(spawn,g.world.playerSpawn);if(!route.length)continue;let previous=spawn;for(const q of route){assert.ok(nav.clear(q),`${map.id} route point blocked`);assert.ok(nav.segment(previous,q),`${map.id} route crosses collider`);previous=q;}routes++;}
 assert.ok(routes>=3,`${map.id} needs reachable spawn routes`);
 const before=g.duel.bot.actor.group.position.clone();for(let tick=0;tick<180;tick++)g.frame(tick*45);assert.ok(before.distanceTo(g.duel.bot.actor.group.position)>1,'bot should navigate');assert.equal(g.state.wave,0);assert.equal(g.enemies.length,0);
 g.pause();const time=g.roundTimer,pos=g.duel.bot.actor.group.position.clone();for(let tick=180;tick<200;tick++)g.frame(tick*45);assert.equal(g.roundTimer,time);assert.ok(pos.equals(g.duel.bot.actor.group.position));
 results.push({map:map.id,navigableRoutes:routes,movement:'passed',pause:'passed',noRobotWaves:'passed'});g.clearBattle();g.world.dispose();
}

const g=fixture();await g.start({mode:'versus'});g.duel.random=random;
// Protection prevents a spawn kill, then normal hitscan must hit the human actor.
const d=g.duel,b=d.bot;b.actor.group.position.set(0,0,-3);g.resolveShot(p(0,1.1,1),p(0,0,-1),WEAPONS[1]);assert.equal(b.hp,120);
b.protection=0;g.resolveShot(p(0,1.1,1),p(0,0,-1),WEAPONS[1]);assert.equal(b.hp,0);assert.equal(d.playerKills,1);assert.equal(g.state.score,100);g.resolveShot(p(0,1.1,1),p(0,0,-1),WEAPONS[1]);assert.equal(d.playerKills,1);
d.update(3.01);assert.equal(b.hp,120);assert.ok(b.protection>0);
// Splash from player grenades/rockets also counts, and never crosses a wall.
b.protection=0;b.actor.group.position.set(0,0,-3);g.explode({mesh:{position:p(0,.8,-3)},team:'player',radius:4,damage:145});assert.equal(d.playerKills,2);
for(let i=2;i<10;i++){d.update(3.01);b.protection=0;d.damageBot(120);}assert.equal(g.state.phase,'victory');assert.equal(d.result,'win');assert.equal(d.playerKills,10);g.clearBattle();g.world.dispose();

const lose=fixture();await lose.start({mode:'versus'});lose.duel.random=random;
// The rule bot must actually fire, consume ammo, reload and hurt a stationary player.
let shots=0,reloading=false;lose.fx.fire=()=>shots++;
for(let tick=0;tick<1500&&lose.duel.botKills===0;tick++){lose.frame(tick*45);reloading ||= lose.duel.bot.reload>0;}
assert.ok(shots>0,'bot never fired');assert.ok(lose.duel.botKills>0,'bot never defeated a stationary player');assert.equal(lose.state.hp,0);
const meds=lose.state.medkits,grenades=lose.state.grenades;lose.medkit();lose.grenade();assert.equal(lose.state.hp,0);assert.equal(lose.state.medkits,meds);assert.equal(lose.state.grenades,grenades);
lose.updatePlayer(3.01);assert.equal(lose.state.hp,120);assert.equal(lose.inventory[0].ammo,28);assert.ok(lose.invulnerable>0);
// Check that the bot searches the new deployment area after repeated respawns.
for(let tick=Math.ceil(lose.lastTime/45)+1,end=tick+2200;tick<end&&lose.duel.botKills<3;tick++)lose.frame(tick*45);assert.ok(lose.duel.botKills>=3,'bot lost the opponent after respawn');
// Force an empty magazine to isolate reload behavior from aim randomness.
lose.state.hp=120;lose.deadTimer=0;lose.duel.bot.ammo=0;lose.duel.bot.protection=0;lose.duel.bot.fireCooldown=0;lose.duel.bot.reaction=1;lose.invulnerable=0;lose.duel.shoot(.1,true,10);assert.ok(lose.duel.bot.reload>0);for(let i=0;i<38;i++)lose.duel.update(.045);assert.equal(lose.duel.bot.ammo,24);
while(lose.duel.botKills<10){lose.state.hp=120;lose.invulnerable=0;lose.takeDamage(200);}assert.equal(lose.state.phase,'defeat');assert.equal(lose.duel.result,'lose');lose.clearBattle();lose.world.dispose();

const wall=fixture();await wall.start({mode:'versus'});wall.player.group.position.set(0,0,5);wall.duel.bot.actor.group.position.set(0,0,-5);wall.duel.bot.protection=0;wall.invulnerable=0;wall.world.colliders.push({minX:-2,maxX:2,minZ:-2,maxZ:2,height:4});wall.duel.nav=new NavigationGrid(wall.world);wall.duel.bot.decision=100;wall.duel.bot.path=[];
for(let i=0;i<50;i++)wall.duel.update(.045);assert.equal(wall.state.hp,120);assert.equal(wall.duel.bot.ammo,24);wall.roundTimer=0;wall.duel.checkEnd(true);assert.equal(wall.duel.result,'draw');wall.clearBattle();wall.world.dispose();

const retry=fixture();await retry.start({mode:'versus'});const old=retry.duel;old.playerKills=4;old.botKills=3;await retry.start({mode:'versus'});assert.notEqual(retry.duel,old);assert.equal(retry.duel.playerKills,0);assert.equal(retry.duel.botKills,0);assert.equal(retry.roundTimer,180);assert.equal(old.ring.parent,null);retry.clearBattle();assert.equal(retry.state.duel,null);retry.world.dispose();
results.push({humanHitscan:'passed',splash:'passed',spawnProtection:'passed',firstToTen:'passed',botShooting:'passed',botReload:'passed',respawn:'passed',deadAbilitiesBlocked:'passed',wallsBlockFire:'passed',timeLimitDraw:'passed',retryCleanup:'passed',observedShots:shots});
await fs.mkdir('reports/game',{recursive:true});await fs.writeFile('reports/game/duel-checks.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
