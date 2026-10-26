// Thin Anka launcher. The game's Vue/Three.js runtime has its own Vite build.
export function setup(uiCtx) {
  const { defineComponent, h, onMounted, onUnmounted } = uiCtx.vue;
  const id = 'anka-outpost-strike';
  const component = defineComponent({
    setup() {
      let frame;
      const onMessage = event => {
        if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
        if (event.data?.type === 'anka-game-back-state') canGoBack = !!event.data.value;
      };
      let canGoBack = false;
      const unregister = uiCtx.navigation.register({appId:id, canGoBack:()=>canGoBack,
        back:()=>frame?.contentWindow?.postMessage({type:'anka-game-back'},location.origin)});
      onMounted(()=>window.addEventListener('message',onMessage));
      onUnmounted(()=>{unregister();window.removeEventListener('message',onMessage);});
      return ()=>h('div',{style:'width:100%;height:100%;overflow:hidden;background:#14252c'},[
        h('iframe',{ref:value=>{frame=value;},src:'/play/'+id,title:'ANKA 前线对决',
          allow:'fullscreen; gamepad; autoplay',referrerpolicy:'no-referrer',
          style:'display:block;width:100%;height:100%;border:0'})]);
    },
  });
  uiCtx.registerApp({id,title:'前线对决',icon:'crosshair',route:'/'+id,order:40,component,fullscreen:true});
}
