<script setup>
defineProps({state:Object,menuToolbar:Boolean,hudToolbar:Boolean});
const emit=defineEmits(['perspective','interact']);
</script>
<template>
 <div class="play-controls" :class="{'is-menu':state.phase==='menu'}" v-if="['menu','playing','paused'].includes(state.phase)">
  <Teleport :to="hudToolbar?'#hud-toolbar':'#menu-toolbar'" :disabled="!menuToolbar&&!hudToolbar" defer>
  <button v-show="state.phase!=='paused'" class="perspective-button" :aria-label="state.perspective==='first'?'切换到第三人称':'切换到第一人称'" :aria-pressed="state.perspective==='first'" @pointerdown.stop @click="emit('perspective',state.perspective==='first'?'third':'first')">
   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
   <span>{{state.perspective==='first'?'第一人称':'第三人称'}}</span><kbd>V</kbd>
  </button>
  </Teleport>
  <button v-if="state.phase==='playing'&&state.pickup" class="pickup-prompt" :disabled="state.pickup.full" aria-label="拾取附近道具" @pointerdown.stop @click="emit('interact')">
   <span class="pickup-mark">＋</span><span><strong>{{state.pickup.label}}</strong><small>{{state.pickup.full?'携带数量已满': '靠近自动拾取 · 点击 / F 拾取'}}</small></span><kbd>F</kbd>
  </button>
 </div>
</template>
<style scoped>
.play-controls{position:absolute;inset:0;pointer-events:none;z-index:12}.perspective-button,.pickup-prompt{pointer-events:auto;display:flex;align-items:center;gap:9px;background:#102932e8;border:1px solid #c8d4c649;border-radius:9px;color:#f2dfb7;box-shadow:0 4px 16px #04131b30}.perspective-button{position:absolute;right:350px;top:24px;padding:10px 12px;font-size:12px}.perspective-button svg{width:18px;height:18px}.play-controls kbd{font:10px system-ui;border:1px solid #b7c9bf50;border-radius:4px;padding:2px 4px;color:#aec4c6}.pickup-prompt{position:absolute;bottom:210px;left:50%;transform:translateX(-50%);padding:11px 16px;min-height:52px;text-align:left}.pickup-mark{font-size:27px;font-weight:300;color:#b0dfb3}.pickup-prompt strong{display:block;font-size:13px;font-weight:600}.pickup-prompt small{display:block;font-size:9px;color:#9eb8bc;margin-top:5px;white-space:nowrap}.pickup-prompt:disabled{opacity:.65;cursor:default}.pickup-prompt kbd{margin-left:12px}button:focus-visible{outline:2px solid #f2d29e;outline-offset:3px}
@media(max-width:650px){.perspective-button{right:12px;top:171px;gap:5px;padding:8px 6px;font-size:9px}.perspective-button svg{width:12px;height:12px}.perspective-button kbd,.pickup-prompt kbd{display:none}.pickup-prompt{bottom:265px;padding:9px 13px;min-height:48px}.pickup-prompt small{font-size:9px}}
@media(orientation:landscape) and (max-height:600px){.perspective-button{top:115px;right:12px;font-size:9px;padding:7px}.pickup-prompt{bottom:122px;padding:8px 12px;min-height:42px}}
</style>
