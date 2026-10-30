import {DeviceInputRouter} from './input-router.js';
const APP='anka-outpost-strike';
const runtimeId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');

export class DeviceReceiver{
 constructor(game,{room=()=>null,status=()=>{},active=()=>true,debug=()=>{}}={}){
  Object.assign(this,{game,room,status,active,runtime:runtimeId(),socket:null,closed:true,debug});
  this.pendingGatt=new Map();this.gattRequest=0;
  this.input=new DeviceInputRouter(game,{ack:frame=>this.send(frame),feedback:frame=>this.send(frame),active:()=>this.active()&&!document.hidden});
  game.deviceInput=this.input;
 }
 get base(){const room=this.room();return `/api/devices/${room&&room.self!==room.host?'share':'user'}/${APP}`;}
 get body(){return {runtime:this.runtime,room:this.room()?.id||''};}
 async open(){
  if(this.socket?.readyState===WebSocket.OPEN)return;
  if(this.opening)return this.opening;
  clearTimeout(this.retry);this.closed=false;const epoch=(this.epoch||0)+1;this.epoch=epoch;
  this.opening=new Promise((resolve,reject)=>{
   const url=new URL(this.base+'/receiver/ws',location.origin);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.search=new URLSearchParams(this.body);
   const ws=new WebSocket(url);this.socket=ws;
   const timeout=setTimeout(()=>{if(this.socket===ws){reject(Error('手柄接收端连接超时'));ws.close();}},10000);
   this.cancelOpen=()=>{clearTimeout(timeout);reject(Error('手柄接收端已关闭'));};
   ws.onmessage=event=>{
    if(this.socket!==ws)return;
    let frame;try{frame=JSON.parse(event.data);}catch{return;}
    if(frame.type==='receiver_ready'){clearTimeout(timeout);this.heartbeat=setInterval(()=>this.pulse(),1000);this.pulse();this.retries=0;this.fatal=false;resolve();}
    else if(frame.type==='binding'){this.input.bind(frame.deviceId);if(frame.transport!=='gatt'||!frame.connected)this.status(frame);}
    else if(frame.type==='gatt_authorized'||frame.type==='gatt_detached'||frame.type==='gatt_error'){const pending=this.pendingGatt.get(frame.requestId);if(pending){clearTimeout(pending.timer);this.pendingGatt.delete(frame.requestId);frame.type==='gatt_error'?pending.reject(Object.assign(Error(frame.message),{code:frame.code})):pending.resolve(frame);}}
    else if(frame.type==='gatt_revoked'){if(frame.code!=='replaced')this.gatt?.revoke(frame.message);}
    else if(['input','action','release'].includes(frame.type))this.input.receive(frame);
    else if(frame.type==='error'||frame.type==='closed'){this.fatal=['wrong_principal','binding_revoked','receiver_exists'].includes(frame.code);this.status({...frame,connected:false});reject(Error(frame.message||'手柄接收端已关闭'));ws.close();}
   };
   ws.onclose=()=>{if(this.socket!==ws)return;clearTimeout(timeout);this.cancelOpen=null;clearInterval(this.heartbeat);this.input.release();this.gatt?.failLease(Error('游戏授权通道已断开'));this.rejectGatt();this.status({connected:false,message:'游戏接收端已断开，正在重连'});reject(Error('游戏接收端已断开'));if(!this.closed&&!this.fatal)this.retry=setTimeout(()=>this.open().catch(()=>{}),Math.min(5000,400*2**Math.min(4,this.retries=(this.retries||0)+1)));};
   ws.onerror=()=>{if(this.socket===ws)reject(Error('无法连接设备服务，请检查Anka后端'));};
  }).finally(()=>{if(this.epoch===epoch)this.opening=null;});
  return this.opening;
 }
 send(frame){if(this.gatt&&!this.gatt.closed&&frame.type==='feedback'){this.gatt.feedback(frame).catch(()=>{});return;}if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(frame));}
 rejectGatt(){for(const p of this.pendingGatt.values()){clearTimeout(p.timer);p.reject(Error('游戏授权通道已断开'));}this.pendingGatt.clear();}
 gattAuthorize(frame){return new Promise((resolve,reject)=>{if(this.socket?.readyState!==WebSocket.OPEN){reject(Error('游戏授权通道尚未连接'));return;}const requestId=String(++this.gattRequest),timer=setTimeout(()=>{this.pendingGatt.delete(requestId);reject(Error('设备授权超时'));},3000);this.pendingGatt.set(requestId,{resolve,reject,timer});this.send({...frame,requestId});});}
 async prepareBluetooth(){if(!this.gatt){const path='/controller/assets/gatt-client.js';const {GattGamepad}=await import(/* @vite-ignore */ path);this.gatt=new GattGamepad({authorize:frame=>this.gattAuthorize(frame),onFrame:frame=>this.input.receive(frame),active:()=>this.active()&&!document.hidden&&!this.input.suspended&&this.game.state.phase==='playing',status:frame=>this.status(frame),debug:frame=>this.debug(frame)});}return this.gatt;}
 connectBluetooth(){if(!this.gatt)throw Error('蓝牙模块尚未就绪');return this.gatt.connect();}
 pulse(){this.send({type:'receiver',active:this.active()&&!document.hidden&&!this.input.suspended&&this.game.state.phase==='playing'});}
 async request(method){
  const result=await fetch(this.base+'/'+method,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(this.body)});
  let data={};try{data=await result.json();}catch{}
  if(!result.ok)throw Error(data.detail?.message||data.detail||'设备请求失败');
  return data;
 }
 async pair(){await this.open();return this.request('pairings');}
 async unbind(){const result=await this.request('unbind');this.gatt?.revoke();return result;}
 close(){this.gatt?.dispose();this.rejectGatt();clearTimeout(this.retry);this.closed=true;this.epoch=(this.epoch||0)+1;clearInterval(this.heartbeat);const ws=this.socket;this.socket=null;this.cancelOpen?.();this.cancelOpen=null;this.opening=null;ws?.close();this.input.release();}
 dispose(){this.close();this.input.dispose();if(this.game.deviceInput===this.input)this.game.deviceInput=null;}
}
