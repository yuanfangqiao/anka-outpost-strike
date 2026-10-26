/** Anka-authenticated room transport. No credentials in game URLs or storage. */
export const APP_ID='anka-outpost-strike';
export const BUILD_ID=typeof __ANKA_BUILD__==='string'?__ANKA_BUILD__:'development';
const LAST_ROOM='anka-frontline-room';

export async function roomRequest(path,body){
 const response=await fetch('/api/rooms/'+APP_ID+path,{credentials:'same-origin',cache:'no-store',
  ...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
 let data={};try{data=await response.json();}catch{}
 if(!response.ok){const error=Error(data.detail?.message||data.detail||'房间服务暂时不可用');error.code=data.detail?.error;error.status=response.status;throw error;}
 return data;
}

export class GameNetwork{
 constructor({onEvent=()=>{},onStatus=()=>{},onRoom=()=>{}}={}){
  Object.assign(this,{onEvent,onStatus,onRoom,room:null,invite:null,socket:null,localId:'',offset:0,ping:0});
  this.epoch=0;this.retries=0;this.currentRound='';this.closed=true;
 }
 get isHost(){return this.room?.host===this.localId;}
 get connected(){return !!this.room&&this.socket?.readyState===1&&!this.closed;}
 get peerCount(){return Object.values(this.room?.players||{}).filter(p=>p.online).length;}
 get roomCode(){return this.room?.code||'';}
 get mode(){return 'versus';}
 now(){return Date.now()/1000+this.offset;}
 async host(config={}){
  const data=await roomRequest('',{map:config.map||'desert',character:config.character||'male',name:config.name||''});
  this._stop();this.closed=false;this.invite=data.invite;this._accept(data.room);this._connect();return data;
 }
 async restore(){
  const match=location.pathname.match(/^\/play\/anka-outpost-strike\/([A-Za-z0-9_-]+)$/);
  let rid=match?.[1];if(!rid)try{rid=sessionStorage.getItem(LAST_ROOM);}catch{}
  if(!rid)return false;
  try{const data=await roomRequest('/'+encodeURIComponent(rid));this.closed=false;this._accept(data.room);this._connect();return true;}
  catch(error){try{sessionStorage.removeItem(LAST_ROOM);}catch{}this._status('error',error.message);if(match)throw error;return false;}
 }
 _accept(room){
  if(this.room?.id===room.id&&this.room.revision>room.revision)return;
  this.room=room;this.localId=room.self;this.offset=room.server_time-Date.now()/1000;
  try{sessionStorage.setItem(LAST_ROOM,room.id);}catch{}
  this.onRoom(room);this._status(this.connected?'connected':'joining');
 }
 _connect(){
  if(this.closed||!this.room)return;
  const epoch=++this.epoch;
  const protocol=location.protocol==='https:'?'wss:':'ws:';
  const socket=new WebSocket(`${protocol}//${location.host}/api/rooms/${APP_ID}/${this.room.id}/ws`);
  this.socket=socket;
  socket.onopen=()=>{if(epoch!==this.epoch)return;this.retries=0;
   socket.send(JSON.stringify({type:'hello',protocol:1,build:BUILD_ID,round:this.currentRound}));
   this.heartbeat=setInterval(()=>{if(socket.readyState===1)socket.send(JSON.stringify({type:'ping',sent:Date.now()}));},3000);
  };
  socket.onmessage=event=>{
   if(epoch!==this.epoch)return;
   try{
    const frame=JSON.parse(event.data);
    if(frame.type==='room')this._accept(frame.room);
    if(frame.type==='game'&&frame.round===this.currentRound)this.onEvent(frame.payload,frame.from);
    if(frame.type==='pong'){this.ping=Math.max(0,Date.now()-frame.sent);this.offset=frame.server_time+this.ping/2000-Date.now()/1000;this._status('connected');}
    if(frame.type==='closed'){this.closed=true;this._status('error',frame.message);this.onRoom({...this.room,phase:'closed',notice:frame.message});socket.close();}
   }catch(error){console.error('Room message',error);}
  };
  socket.onerror=()=>this._status('disconnected','连接中断，正在重连…');
  socket.onclose=event=>{
   if(epoch!==this.epoch)return;clearInterval(this.heartbeat);
   if(this.closed)return;
   if([4401,4403,4409].includes(event.code)){this.closed=true;this._status('error',event.reason||'房间会话已失效');return;}
   this._status('disconnected','连接中断，正在重连…');
   this.retry=setTimeout(()=>this._connect(),Math.min(5000,500*2**Math.min(4,this.retries++)));
  };
 }
 _status(state,error=''){
  this.status={state,error,code:this.roomCode,peers:this.peerCount,members:Object.keys(this.room?.players||{}),
   localId:this.localId,isHost:this.isHost,mode:'versus',ping:this.ping};this.onStatus(this.status);
 }
 async command(action,args={}){
  if(!this.room)throw Error('请先进入房间');
  const data=await roomRequest(`/${this.room.id}/command`,{action,args});
  this._accept(data.room);return data.room;
 }
 async refreshInvite(){
  this.invite=await roomRequest(`/${this.room.id}/invite`,{});return this.invite;
 }
 send(payload){
  const allowed=this.isHost?['pvp-state','pvp-effect','pvp-finish']:['player','action'];
  if(!this.connected||this.room.phase!=='playing'||!allowed.includes(payload.type)||this.socket.bufferedAmount>128*1024)return 0;
  const frame=JSON.stringify({type:'game',round:this.currentRound,payload});
  if(frame.length>32*1024)return 0;this.socket.send(frame);return 1;
 }
 broadcast(payload){return this.send(payload);}
 async leave(){
  try{if(this.room&&!this.closed)await this.command('leave');}finally{
   this._stop();this.room=null;this.invite=null;this.localId='';
   try{sessionStorage.removeItem(LAST_ROOM);}catch{}this.onRoom(null);this._status('closed');
  }
 }
 _stop(){this.closed=true;this.epoch++;clearTimeout(this.retry);clearInterval(this.heartbeat);this.socket?.close();this.socket=null;}
 close(){this._stop();}
}
