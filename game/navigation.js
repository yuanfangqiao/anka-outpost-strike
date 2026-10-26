import { Vector3 } from 'three';

// A small static navigation grid. Diagonal steps cannot cut obstacle corners.
export class NavigationGrid {
 constructor(world,cell=1,radius=.48){
  this.world=world;this.cell=cell;this.radius=radius;
  this.minX=world.bounds.minX+1;this.minZ=world.bounds.minZ+1;
  this.width=Math.floor((world.bounds.maxX-this.minX-1)/cell)+1;
  this.height=Math.floor((world.bounds.maxZ-this.minZ-1)/cell)+1;
  this.free=new Uint8Array(this.width*this.height);
  for(let z=0;z<this.height;z++)for(let x=0;x<this.width;x++)this.free[z*this.width+x]=+this.clear(this.point(x,z));
 }
 point(x,z){return new Vector3(this.minX+x*this.cell,0,this.minZ+z*this.cell);}
 clear(p){const r=this.radius,b=this.world.bounds;return p.x>b.minX+r&&p.x<b.maxX-r&&p.z>b.minZ+r&&p.z<b.maxZ-r&&!this.world.colliders.some(c=>p.x+r>c.minX&&p.x-r<c.maxX&&p.z+r>c.minZ&&p.z-r<c.maxZ);}
 segment(a,b){const steps=Math.max(1,Math.ceil(a.distanceTo(b)/.25));for(let i=0;i<=steps;i++)if(!this.clear(a.clone().lerp(b,i/steps)))return false;return true;}
 nearest(p,reachable=false){let best=-1,distance=Infinity;for(let i=0;i<this.free.length;i++)if(this.free[i]){const q=this.point(i%this.width,Math.floor(i/this.width));const d=q.distanceToSquared(p);if(d<distance&&(!reachable||this.segment(p,q))){distance=d;best=i;}}return best;}
 path(from,to){
  if(!this.clear(from))return[];
  if(this.segment(from,to))return[to.clone().setY(0)];
  const start=this.nearest(from,true),goal=this.nearest(to);if(start<0||goal<0)return[];
  const costs=new Float64Array(this.free.length).fill(Infinity),parents=new Int32Array(this.free.length).fill(-1),closed=new Uint8Array(this.free.length),open=[];
  const gx=goal%this.width,gz=Math.floor(goal/this.width),h=i=>Math.hypot(i%this.width-gx,Math.floor(i/this.width)-gz);
  costs[start]=0;open.push({i:start,f:h(start)});
  while(open.length){let best=0;for(let n=1;n<open.length;n++)if(open[n].f<open[best].f)best=n;const {i}=open.splice(best,1)[0];if(closed[i])continue;
   if(i===goal){const route=[];for(let j=goal;j!==start;j=parents[j]){if(j<0)return[];route.push(this.point(j%this.width,Math.floor(j/this.width)));}route.reverse();if(this.segment(from,this.point(start%this.width,Math.floor(start/this.width))))route.unshift(this.point(start%this.width,Math.floor(start/this.width)));if(this.segment(route.at(-1)||from,to))route.push(to.clone().setY(0));return route;}
   closed[i]=1;const x=i%this.width,z=Math.floor(i/this.width);
   for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz)continue;const nx=x+dx,nz=z+dz;if(nx<0||nz<0||nx>=this.width||nz>=this.height)continue;const next=nz*this.width+nx;if(!this.free[next]||closed[next])continue;if(dx&&dz&&(!this.free[z*this.width+nx]||!this.free[nz*this.width+x]))continue;if(!this.segment(this.point(x,z),this.point(nx,nz)))continue;const cost=costs[i]+Math.hypot(dx,dz);if(cost<costs[next]){costs[next]=cost;parents[next]=i;open.push({i:next,f:cost+h(next)});}}
  }
  return[];
 }
}
