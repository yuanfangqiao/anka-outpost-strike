import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Action, Condition, Sequence, Selector, BehaviorTree, SUCCESS, FAILURE, RUNNING } from '../game/behavior-tree.js';
import { NavigationGrid } from '../game/navigation.js';
import { fixture } from './game-fixture.mjs';
import * as THREE from 'three';

let urgent=false,entered=0,aborted=0;
const low=new Action('patrol',{enter(){entered++;},tick:()=>RUNNING,exit(c,status){if(status==='aborted')aborted++;}});
const tree=new BehaviorTree(new Selector('priority',[new Sequence('urgent',[new Condition('danger',()=>urgent),new Action('evade',{tick:()=>RUNNING})]),low]));
assert.equal(tree.tick({}),RUNNING);tree.tick({});assert.equal(entered,1);urgent=true;tree.tick({});assert.equal(aborted,1);assert.equal(low.active,false);urgent=false;tree.tick({});assert.equal(entered,2);tree.reset({});assert.equal(aborted,2);
let setup=0,waiting=true;const memory=new BehaviorTree(new Sequence('memory',[new Action('setup',{tick:()=>{setup++;return SUCCESS;}}),new Action('wait',{tick:()=>waiting?RUNNING:SUCCESS})],{memory:true}));
memory.tick({});memory.tick({});assert.equal(setup,1);waiting=false;assert.equal(memory.tick({}),SUCCESS);
assert.throws(()=>new Action('bad',{tick:()=>undefined}).tick({}),/invalid behavior status/);
assert.equal(new Selector('fallback',[new Condition('no',()=>false),new Action('yes')]).tick({}),SUCCESS);

const p=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),records=[];
async function arena(){const g=fixture();await g.start({mode:'versus'});g.world.colliders=[{minX:2,maxX:4,minZ:0,maxZ:2,height:1.8}];g.duel.nav=new NavigationGrid(g.world);g.player.group.position.set(0,0,9);g.duel.bot.actor.group.position.set(0,0,-2);g.duel.bot.actor.group.quaternion.identity();g.duel.bot.protection=0;g.invulnerable=0;g.takeDamage=()=>{};g.duel.brain.reset(g.player.group.position);return g;}

const cover=await arena(),cb=cover.duel.brain;cb.cooldowns.cover=0;cb.cooldowns.flank=99;const states=new Set(),shots=[];cover.fx.fire=()=>shots.push(cover.duel.bot.state);
for(let i=0;i<450;i++){cover.duel.update(.045);states.add(cover.duel.bot.state);}
for(const state of ['cover','hide','peek','reposition'])assert.ok(states.has(state),`missing cover phase ${state}`);assert.ok(shots.includes('peek'),'cover peek never fired');assert.ok(cb.tree instanceof BehaviorTree);
records.push({scenario:'cover-hide-peek-fire-reposition',states:[...states],peekShots:shots.filter(s=>s==='peek').length});cover.clearBattle();cover.world.dispose();

const flank=await arena(),fb=flank.duel.brain;fb.cooldowns.cover=99;fb.cooldowns.flank=0;const flankStates=new Set(),flankShots=[];flank.fx.fire=()=>flankShots.push(flank.duel.bot.state);
for(let i=0;i<180;i++){flank.duel.update(.045);flankStates.add(flank.duel.bot.state);}
for(const state of ['suppress','flank','attack'])assert.ok(flankStates.has(state),`missing flank phase ${state}`);assert.ok(flankShots.includes('suppress'));assert.ok(flankShots.includes('attack'));
records.push({scenario:'suppress-flank-fire',states:[...flankStates],shots:flankShots});flank.clearBattle();flank.world.dispose();

const danger=await arena(),db=danger.duel.brain;db.cooldowns.cover=99;db.cooldowns.flank=0;danger.duel.update(.045);assert.equal(db.plan.kind,'flank');danger.duel.damageBot(35);danger.duel.update(.045);assert.equal(db.plan.kind,'danger');assert.equal(danger.duel.bot.state,'retreat');assert.ok(db.tree.trace.some(n=>n.name==='紧急避险'&&n.status===RUNNING));
danger.duel.bot.ammo=0;db.cooldowns.danger=99;db.plan=null;danger.duel.update(.045);assert.equal(danger.duel.bot.state,'reload');assert.ok(danger.duel.bot.reload>0);assert.ok(!db.tree.trace.some(n=>n.name==='压制后绕侧'&&n.status===RUNNING));
records.push({scenario:'damage-and-reload-preemption',passed:true});danger.clearBattle();danger.world.dispose();

const sense=await arena(),sb=sense.duel.brain;sense.duel.bot.actor.group.position.set(0,0,0);sense.player.group.position.set(0,0,-8);sense.duel.bot.actor.group.quaternion.identity();sb.reset(p(4,0,4));sb.step(.045);assert.equal(sb.visible,false);const remembered=sense.duel.bot.lastSeen.clone();sense.player.group.position.set(12,0,-8);sb.step(.045);assert.ok(remembered.equals(sense.duel.bot.lastSeen),'hidden player was tracked through walls/back');
sb.hearShot(p(0,1.15,-8));assert.ok(sense.duel.bot.lastSeen.distanceTo(p(0,0,-8))<2.2);assert.equal(sb.heardAge,0);const soundIntent=sb.step(.045);assert.equal(soundIntent.state,'investigate');assert.ok(soundIntent.goal);
records.push({scenario:'field-of-view-memory-and-hearing',passed:true});sense.clearBattle();sense.world.dispose();

const stuck=await arena(),stb=stuck.duel.brain;stb.cooldowns.cover=0;stb.cooldowns.flank=99;stuck.moveObject=()=>{};for(let i=0;i<100;i++)stuck.duel.update(.045);assert.ok(stb.cooldowns.cover>0,'unreachable/stalled cover did not time out');assert.notEqual(stb.plan?.kind,'cover');stuck.clearBattle();stuck.world.dispose();
records.push({scenario:'movement-timeout-releases-plan',passed:true});
await fs.mkdir('reports/game',{recursive:true});await fs.writeFile('reports/game/behavior-tree-checks.json',JSON.stringify({core:{reactivePriority:true,abortCleanup:true,memorySequence:true,statusContract:true},tactics:records},null,2));console.log(JSON.stringify(records,null,2));
