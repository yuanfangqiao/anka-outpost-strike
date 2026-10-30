<script setup>
import {ref,computed,onBeforeUnmount,watch} from 'vue';
import QRCode from 'qrcode';
import {DeviceReceiver} from './device-receiver.js';
const props=defineProps({game:Object,room:Object,phase:String,menuToolbar:Boolean,hudToolbar:Boolean});
const bluetoothLog=ref(''),bluetoothJson=ref('{"type":"feedback","event":"damage","strength":0.4,"durationMs":100}');
const bluetoothReady=ref(false),bluetoothBusy=ref(false);
const bluetoothSupported=!!globalThis.isSecureContext&&!!navigator.bluetooth?.requestDevice;
const connection=ref(bluetoothSupported?'bluetooth':'qr');
const show=ref(false),busy=ref(false),error=ref(''),qr=ref(''),pair=ref(null),device=ref(''),connected=ref(false),now=ref(Date.now()/1000);
let receiver=null;
const timer=setInterval(()=>{now.value=Date.now()/1000;},500);
const seconds=computed(()=>Math.max(0,Math.ceil((pair.value?.expiresAt||0)-now.value)));
watch([()=>props.game,()=>props.room?.id,()=>props.room?.self],()=>{
 receiver?.dispose();receiver=null;bluetoothReady.value=false;device.value='';connected.value=false;pair.value=null;qr.value='';show.value=false;
},{immediate:true});
watch(()=>props.phase,()=>receiver?.pulse());
function getReceiver(){
 if(!receiver)receiver=new DeviceReceiver(props.game,{room:()=>props.room,active:()=>!show.value,debug:frame=>{bluetoothLog.value=(JSON.stringify(frame)+'\n'+bluetoothLog.value).slice(0,5000);},status:frame=>{
  device.value=frame.deviceId??device.value;connected.value=!!frame.connected;
  if(frame.message)error.value=frame.message;
  if(frame.connected){show.value=false;pair.value=null;qr.value='';receiver?.input.resume();receiver?.pulse();}
 }});
 return receiver;
}
async function open(){
 if(!props.game)return;show.value=true;error.value='';getReceiver().input.release();getReceiver().pulse();
 try{await getReceiver().open();}catch(e){error.value=e.message;}
 if(!device.value&&connection.value==='qr')await generate();
 if(bluetoothSupported){try{await getReceiver().prepareBluetooth();bluetoothReady.value=true;}catch(e){error.value=e.message;}}
}
async function selectConnection(value){connection.value=value;error.value='';if(value==='qr'&&!device.value)await generate();}
async function generate(){
 busy.value=true;error.value='';pair.value=null;qr.value='';
 try{const data=await getReceiver().pair();pair.value=data;qr.value=await QRCode.toDataURL(data.url,{width:480,margin:4,errorCorrectionLevel:'M',color:{dark:'#000000',light:'#ffffff'}});}
 catch(e){error.value=e.message;}finally{busy.value=false;}
}
async function connectBluetooth(){bluetoothBusy.value=true;error.value='';try{await getReceiver().connectBluetooth();}catch(e){error.value=e.message;}finally{bluetoothBusy.value=false;}}
async function unbind(){busy.value=true;try{await receiver.unbind();device.value='';connected.value=false;pair.value=null;qr.value='';}catch(e){error.value=e.message;}finally{busy.value=false;}}
function close(){show.value=false;receiver?.input.resume();receiver?.pulse();}
async function sendBluetoothJson(){try{const frame=JSON.parse(bluetoothJson.value);if(!['feedback','leds'].includes(frame.type))throw Error('只允许feedback或leds测试命令');await receiver.gatt.feedback(frame);}catch(e){error.value=e.message;}}
async function copy(){try{await navigator.clipboard.writeText(pair.value.url);}catch{error.value='请选中下方链接手动复制';}}
onBeforeUnmount(()=>{clearInterval(timer);receiver?.dispose();});
</script>
<template>
 <div class="controller-tools" :class="{'is-menu':phase==='menu'}">
  <Teleport :to="hudToolbar?'#hud-toolbar':'#menu-toolbar'" :disabled="!menuToolbar&&!hudToolbar" defer>
  <button v-show="phase!=='paused'" class="controller-entry" @pointerdown.stop @click="open"><span :class="{online:connected}"/>{{connected?'手柄已连接':'手柄设备接入'}}</button>
  </Teleport>
  <div v-if="show" class="controller-overlay" @pointerdown.stop @click.self="close" role="dialog" aria-modal="true" aria-label="手柄设备接入">
   <section class="controller-modal"><button class="controller-close" @click="close" aria-label="关闭手柄配对">×</button>
    <h2>手柄设备接入</h2><p>控制当前玩家 · 手机或ESP-Mosaico二选一</p>
    <template v-if="device"><div class="controller-bound"><span :class="{online:connected}"/>{{connected?'当前手柄已连接':'手柄已绑定，等待重连'}}</div><button @click="close">继续游戏</button><button @click="unbind" :disabled="busy">解除绑定，更换设备</button></template>
    <template v-else>
     <div class="connection-tabs" role="tablist" aria-label="手柄连接方式"><button v-if="bluetoothSupported" role="tab" :aria-selected="connection==='bluetooth'" @click="selectConnection('bluetooth')">蓝牙直连</button><button role="tab" :aria-selected="connection==='qr'" @click="selectConnection('qr')">扫码接入</button></div>
     <template v-if="connection==='bluetooth'&&bluetoothSupported"><div class="bluetooth-symbol" aria-hidden="true">ᛒ</div><p>打开 Mosaico 蓝牙手柄应用，选择设备即可连接。<br>无需二维码、Wi-Fi 或服务器地址。</p><button @click="connectBluetooth" :disabled="!bluetoothReady||bluetoothBusy">{{bluetoothBusy?'正在连接蓝牙…':'连接蓝牙手柄'}}</button></template>
     <template v-else>
     <img v-if="qr&&seconds" class="controller-qr" :src="qr" alt="扫描二维码绑定当前玩家手柄">
     <div v-else class="controller-placeholder">{{busy?'正在生成二维码…':'二维码待生成 / 已过期'}}</div>
     <p>手机或 Wi-Fi 手柄扫码，绑定当前玩家。</p><p v-if="!bluetoothSupported">蓝牙直连请使用电脑Chrome/Edge和HTTPS或localhost；手机手柄仍可扫码接入。</p><p>{{seconds?`${seconds}秒内有效，扫码即绑定`:'点击重新生成二维码'}}</p>
     <button @click="generate" :disabled="busy">重新生成</button><button v-if="pair&&seconds" @click="copy">复制手柄链接</button>
     <details v-if="pair&&seconds"><summary>WebSocket调试地址</summary><input readonly :value="pair.wsUrl" @focus="$event.target.select()" aria-label="手柄WebSocket地址"><a :href="pair.url+'&debug=1'" target="_blank" rel="noopener">打开浏览器模拟手柄 ↗</a></details>
     </template>
    </template>
    <details v-if="receiver?.gatt?.session"><summary>蓝牙JSON调试</summary><textarea v-model="bluetoothJson" aria-label="蓝牙反馈JSON"/><button @click="sendBluetoothJson">发送蓝牙测试命令</button><pre>{{bluetoothLog}}</pre></details>
    <p v-if="error" class="controller-error" role="alert">{{error}}</p>
   </section>
  </div>
 </div>
</template>
<style scoped>
.controller-tools{position:absolute;top:24px;right:180px;z-index:45;font:12px Inter,"PingFang SC",sans-serif;color:#efdfb7}.controller-entry{min-height:40px;white-space:nowrap;display:flex;align-items:center;gap:7px;background:#102932e8;border:1px solid #c8d4c649;border-radius:9px;color:inherit;padding:10px 12px}.controller-entry span,.controller-bound span{display:inline-block;width:7px;height:7px;border-radius:50%;background:#ef7777}.controller-entry .online,.controller-bound .online{background:#82e795}.controller-overlay{position:fixed;inset:0;display:grid;place-items:center;padding:20px;background:#07131ec9;backdrop-filter:blur(9px);z-index:90}.controller-modal{position:relative;width:min(390px,100%);max-height:92dvh;overflow:auto;padding:28px;background:#142e3a;border:1px solid #d5bd8855;border-radius:20px;text-align:center;box-shadow:0 15px 70px #0008}.controller-modal h2{font-size:24px;margin:0 0 12px}.controller-modal p{color:#b1c7ca;line-height:1.6;font-size:12px}.controller-modal>button:not(.controller-close){padding:10px 14px;color:#efdfb7;border:1px solid #e1c48b66;background:#dbc08918;border-radius:9px;margin:5px}.controller-modal .controller-close{position:absolute;top:10px;right:12px;background:transparent;border:0;color:#afc2c5;font-size:26px}.controller-qr{width:240px;height:240px;max-width:100%;border-radius:12px;margin:8px 0}.controller-placeholder{height:220px;display:grid;place-items:center;color:#9ab4ba;border:1px dashed #d1c09744;border-radius:12px}.controller-bound{padding:30px 0;font-size:15px}.controller-bound span{margin-right:8px}.controller-modal .controller-error{color:#ffb9a5}.controller-modal details{margin-top:14px;text-align:left;font-size:11px}.controller-modal input{width:100%;margin:10px 0;padding:9px;background:#071820;color:#bad0d3;border:1px solid #8aa5aa55;border-radius:7px}.controller-modal a{color:#e3d3ae;display:block;text-align:center;margin:10px}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}@media(max-width:650px){.controller-tools{top:70px;right:12px}.controller-entry{font-size:10px;padding:8px}}@media(orientation:landscape) and (max-height:600px){.controller-tools{top:50px;right:12px}.controller-modal{padding:18px}.controller-qr{width:180px;height:180px}}
.connection-tabs{display:flex;gap:8px;margin:18px 0}.connection-tabs button{flex:1;padding:10px;color:#c4d4d4;border:1px solid #9ab7bb44;border-radius:9px;background:#0a1e28}.connection-tabs [aria-selected=true]{color:#ffe1a4;border-color:#e1c48b;background:#dbc08918}.bluetooth-symbol{font-size:100px;line-height:1.5;color:#75d5ff;text-shadow:0 0 28px #40b9ff66}.controller-modal textarea{width:100%;min-height:100px;background:#071820;color:#bad0d3}.controller-modal pre{max-height:180px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:10px}
</style>
