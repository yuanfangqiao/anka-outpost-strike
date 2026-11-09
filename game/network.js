/** Anka-authenticated room transport. No credentials in game URLs or storage. */
export const APP_ID='anka-outpost-strike';
export const BUILD_ID=typeof __ANKA_BUILD__==='string'?__ANKA_BUILD__:'development';
const LAST_ROOM='anka-frontline-room';
const lostAccess=error=>[401,403,410].includes(error.status)||error.code==='room_not_found';

export async function roomRequest(path,body){
 const response=await fetch('/api/rooms/'+APP_ID+path,{credentials:'same-origin',cache:'no-store',
  signal:AbortSignal.timeout(8000),
  ...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
 const data=response.headers.get('content-type')?.includes('application/json')?await response.json():{};
 if(!response.ok){const error=Error(data.detail?.message||data.detail||'房间服务暂时不可用');error.code=data.detail?.error;error.status=response.status;throw error;}
 return data;
}

export class GameNetwork{
 constructor({onEvent=()=>{},onStatus=()=>{},onRoom=()=>{}}={}){
  Object.assign(this,{onEvent,onStatus,onRoom,room:null,socket:null,localId:'',offset:0,ping:0});
  this.epoch=0;this.retries=0;this.currentRound='';this.closed=true;
  this.wake=()=>{
   if(this.status?.state==='disconnected')this.reconnect();
  };
  window.addEventListener('online',this.wake);
 }
 get isHost(){return this.room?.host===this.localId;}
 get connected(){return this.authenticated&&this.socket?.readyState===1&&!this.closed;}
 get peerCount(){return Object.values(this.room?.players||{}).filter(p=>p.online).length;}
 get roomCode(){return this.room?.code||'';}
 get mode(){return this.room?.mode||'versus';}
 now(){return Date.now()/1000+this.offset;}
 async host(config={}){
  this._status('hosting');
  const epoch=this.epoch;
  const data=await roomRequest('',{character:config.character||'male'});
  if(epoch!==this.epoch)return data;
  this._stop();this.closed=false;this._accept(data.room);this._connect();return data;
 }
 async restore(){
  this.closed=false;
  this._status('joining');
  const epoch=++this.epoch;
  const match=location.pathname.match(/^\/play\/anka-outpost-strike\/([A-Za-z0-9_-]+)$/);
  let rid=match?.[1];if(!rid)try{rid=sessionStorage.getItem(LAST_ROOM);}catch{}
  try{
   let data;
   if(rid){
    try{
     data=await roomRequest('/'+encodeURIComponent(rid));
     if(!data?.room)throw Error('房间状态暂未返回');
    }
    catch(error){if(match||!lostAccess(error))throw error;}
   }
   if(!data?.room&&!match)data=await roomRequest('/current');
   if(epoch!==this.epoch)return false;
   if(!data?.room){this._remember('');this._status('offline');return false;}
   this._accept(data.room);this._connect();return true;
  }catch(error){
   if(epoch!==this.epoch)return false;
   if(lostAccess(error)){
    this._remember('');this._status('error',error.message);
   }else if(rid||!error.status||error.status>=500){
    this._schedule(()=>this.restore());
   }else this._status('offline');
   return false;
  }
 }
 _remember(id){
  try{if(id)sessionStorage.setItem(LAST_ROOM,id);else sessionStorage.removeItem(LAST_ROOM);}catch{}
 }
 _accept(room){
  if(this.room?.id===room.id&&this.room.revision>room.revision)return;
  this.room=room;this.localId=room.self;this.offset=room.server_time-Date.now()/1000;
  if(room.phase==='closed')this._remember('');
  else this._remember(room.id);
  this._status(this.connected?'connected':this.status?.state==='disconnected'?'disconnected':'joining',this.status?.state==='disconnected'&&!this.connected?this.status.error:'');
  this.onRoom(room);
 }
 _connect(){
  if(this.closed||!this.room)return;
  const epoch=++this.epoch;
  const protocol=location.protocol==='https:'?'wss:':'ws:';
  const socket=new WebSocket(`${protocol}//${location.host}/api/rooms/${APP_ID}/${this.room.id}/ws`);
  this.socket=socket;this.authenticated=false;
  let lastMessage=Date.now();
  this.heartbeat=setInterval(()=>{
   if(epoch!==this.epoch)return;
   if(Date.now()-lastMessage>12000){this.reconnect();return;}
   if(socket.readyState===1&&socket.bufferedAmount<128*1024)socket.send(JSON.stringify({type:'ping',sent:Date.now()}));
  },3000);
  socket.onopen=()=>{
   if(epoch!==this.epoch)return;
   socket.send(JSON.stringify({type:'hello',protocol:1,build:BUILD_ID,round:this.currentRound}));
  };
  socket.onmessage=event=>{
   if(epoch!==this.epoch)return;
   try{
    const frame=JSON.parse(event.data);lastMessage=Date.now();
    if(frame.type==='room'){
     this.authenticated=true;this.retries=0;this._accept(frame.room);
    }else if(frame.type==='game'&&this.connected&&this.room.phase==='playing'&&frame.round===this.currentRound){
     this.onEvent(frame.payload,frame.from);
    }else if(frame.type==='pong'&&this.authenticated){
     this.ping=Math.max(0,Date.now()-frame.sent);this.offset=frame.server_time+this.ping/2000-Date.now()/1000;this._status('connected');
    }else if(frame.type==='closed')this._terminate(frame.message);
   }catch(error){console.error('Room message',error);}
  };
  socket.onclose=event=>{
   if(epoch!==this.epoch)return;
   clearInterval(this.heartbeat);this.authenticated=false;this.socket=null;
   if(event.code===4409||event.code===4410){
    this._status('error',event.reason||(event.code===4410?'此玩家已在另一个页面进入房间':'游戏版本已变化，请刷新页面'));
    return;
   }
   this._schedule(()=>this.reconnect());
  };
 }
 _schedule(callback){
  this._status('disconnected','连接中断，正在重连…');
  clearTimeout(this.retry);
  this.retry=setTimeout(callback,Math.min(5000,500*2**Math.min(4,this.retries++)));
 }
 async reconnect(){
  if(!this.room){this.restore();return;}
  if(this.room.phase==='closed')return;
  const rid=this.room.id;
  this._stop();this.closed=false;this._status('disconnected','连接中断，正在重连…');
  const epoch=this.epoch;
  try{
   const data=await roomRequest('/'+encodeURIComponent(rid));
   if(epoch!==this.epoch)return;
   this._accept(data.room);this._connect();
  }catch(error){
   if(epoch!==this.epoch)return;
   if(lostAccess(error))this._terminate(error.message);
   else this._schedule(()=>this.reconnect());
  }
 }
 _terminate(message){
  this._stop();this._remember('');this.room={...this.room,phase:'closed',notice:message};
  this._status('error',message);this.onRoom(this.room);
 }
 _status(state,error=''){
  this.status={state,error,code:this.roomCode,peers:this.peerCount,members:Object.keys(this.room?.players||{}),
   localId:this.localId,isHost:this.isHost,mode:this.mode,ping:this.ping};this.onStatus(this.status);
 }
 async command(action,args={}){
  if(!this.room)throw Error('请先进入房间');
  const rid=this.room.id;
  const data=await roomRequest(`/${rid}/command`,{action,args});
  if(this.room?.id===rid&&this.room.phase!=='closed'&&action!=='leave')this._accept(data.room);
  return data.room;
 }
 refreshInvite(){
  return roomRequest(`/${this.room.id}/invite`,{});
 }
 send(payload){
  const allowed=this.isHost?['pvp-state','pvp-effect','pvp-finish']:['player','action'];
  if(!this.connected||this.room.phase!=='playing'||!allowed.includes(payload.type)||this.socket.bufferedAmount>128*1024)return 0;
  const frame=JSON.stringify({type:'game',round:this.currentRound,payload});
  if(new TextEncoder().encode(frame).length>32*1024)return 0;this.socket.send(frame);return 1;
 }
 broadcast(payload){return this.send(payload);}
 async leave(){
  if(this.room&&this.room.phase!=='closed'){
   try{await this.command('leave');}
   catch(error){if(!lostAccess(error))throw error;}
  }
  this._stop();this.room=null;this.localId='';this.currentRound='';
  this._remember('');this.onRoom(null);this._status('closed');
 }
 _stop(){
  this.closed=true;this.authenticated=false;this.epoch++;
  clearTimeout(this.retry);clearInterval(this.heartbeat);this.socket?.close();this.socket=null;
 }
 close(){this._stop();window.removeEventListener('online',this.wake);}
}
