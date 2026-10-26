/** Keep standalone AI modes intact while online combat uses shared authority. */
export function installOnlineHooks(Game){
 const wrap=(name,handler)=>{const original=Game.prototype[name];Game.prototype[name]=function(...args){return handler.call(this,original,...args);};};
 wrap('clearBattle',function(original,...args){this.online?.dispose();this.online=null;return original.apply(this,args);});
 wrap('consumeNetwork',function(original,payload,id){if(this.online)return this.online.consume(payload,id);return original.call(this,payload,id);});
 wrap('updateNetwork',function(original,dt){if(this.online)return this.online.tick(dt);return original.call(this,dt);});
 wrap('updatePickups',function(original,dt){if(this.online)return this.online.supplies.render(dt);return original.call(this,dt);});
 wrap('collect',function(original,...args){if(!this.online)return original.apply(this,args);});
 wrap('interact',function(original,...args){if(!this.online)return original.apply(this,args);const node=this.online.supplies.nearest(this.player.group.position);if(node)this.online.action('pickup',{pickupId:node.id});});
 for(const [method,action]of Object.entries({medkit:'heal',shield:'shield',reload:'reload',grenade:'grenade',fire:'shot'})){
  wrap(method,function(original,...args){if(!this.online)return original.apply(this,args);
   return this.online.action(action,['shot','grenade'].includes(action)?{direction:this.aimDirection().toArray()}:{});});
 }
 wrap('roll',function(original,...args){const available=this.rollCooldown<=0;const result=original.apply(this,args);if(this.online&&available)this.online.action('roll');return result;});
 wrap('explode',function(original,projectile){if(this.online)return this.online.explode(projectile);return original.call(this,projectile);});
 wrap('takeDamage',function(original,...args){if(!this.online)return original.apply(this,args);});
 wrap('updatePlayer',function(original,dt){
  if(this.online&&this.state.hp<=0){this.player.update(dt,{dead:true});this.heldFire=false;return;}
  return original.call(this,dt);
 });
 wrap('updateProjectiles',function(original,dt){if(this.online&&!this.online.host)return;
  if(this.online)for(const projectile of this.projectiles)for(const p of Object.values(this.online.players)){
   if(p.id!==projectile.shooter&&p.hp>0&&projectile.mesh.position.distanceTo({x:p.p[0],y:p.p[1]+1,z:p.p[2]})<.65)projectile.life=0;}
  return original.call(this,dt);
 });
 wrap('finish',function(original,...args){if(this.online)return this.online.finish();return original.apply(this,args);});
 wrap('pause',function(original,...args){if(this.online){this.heldFire=false;this.keys.clear();this.notice('联机比赛继续进行');return;}return original.apply(this,args);});
}
// Recoil also applies to standalone weapons and locally predicted online fire.
export function installViewRecoil(Game){
 const fire=Game.prototype.fire;
 Game.prototype.fire=function(...args){const before=this.fireCooldown;const result=fire.apply(this,args);if(this.view&&this.fireCooldown>before)this.view.kick=.07;return result;};
}
