import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
try{
 const {default:UI}=await server.ssrLoadModule('/game/GameUI.vue');
 const base={mode:'versus',map:'desert',character:'male',maxHp:120,hp:120,weapon:0,ammo:28,reserve:196,elapsed:40,roundTime:140,score:1000,kills:10};
 for(const [result,title,phase]of[['win','蓝方胜利','victory'],['lose','红方获胜','defeat'],['draw','双方平局','victory']]){
  const state={...base,phase,duel:{result,playerKills:result==='win'?10:2,botKills:result==='lose'?10:2,target:10,opponentHp:120,label:{visible:false}}};
  const html=await renderToString(createSSRApp(UI,{state}));assert.ok(html.includes(title));assert.ok(html.includes('最终比分'));assert.ok(html.includes('1 VS 1 · 规则人机'));assert.ok(!html.includes('据点已夺回'));
 }
 const html=await renderToString(createSSRApp(UI,{state:{...base,phase:'playing',duel:{playerKills:2,botKills:3,target:10,opponentName:'小葵',opponentState:'换弹',opponentHp:80,respawn:0,label:{x:50,y:40,visible:true}}}}));
 assert.ok(html.includes('双方对战计分'));assert.ok(html.includes('红方 · 规则人机'));assert.ok(html.includes('02:20'));assert.ok(html.includes('换弹'));
 console.log('Duel scoreboard, timer, opponent label and win/loss/draw results passed SSR checks.');
}finally{await server.close();}
