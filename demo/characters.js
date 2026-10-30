/** Tripo CN characters with retargeted Mixamo aiming and local game animation clips. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const CHARACTER_URLS = {
  male: new URL('../assets/characters/optimized/male_scout.glb', import.meta.url).href,
  female: new URL('../assets/characters/optimized/female_striker.glb', import.meta.url).href,
};

export async function loadCharacter(kind = 'male') {
  if (!CHARACTER_URLS[kind]) throw new Error(`Unknown character: ${kind}`);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(CHARACTER_URLS[kind]);
  const model = gltf.scene;
  const mixer = new THREE.AnimationMixer(model);
  const actions = Object.fromEntries(gltf.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
  let current;
  model.traverse(object => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      // Skinning is animated beyond the bind-pose bounding box.
      object.frustumCulled = false;
    }
  });
  function play(name, fade = 0.18) {
    const next = actions[name];
    if (!next) throw new Error(`Clip ${name} missing. Available: ${Object.keys(actions).join(', ')}`);
    if (next === current) return;
    const once=['Death','AimRaise','AimLower','Roll','Reload','Hurt'].includes(name);next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);next.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);next.clampWhenFinished=once;next.play();
    if (current) next.crossFadeFrom(current, fade, false);
    current = next;
  }
  play('Idle');
  // Mixamo's right hand is also the attachment point for a future weapon prop.
  let weaponSocket;
  model.traverse(object => {
    if (object.isBone && /righthand$/i.test(object.name)) weaponSocket = object;
  });
  return {
    model, mixer, actions, play,
    weaponSocket,
    update(delta) { mixer.update(Math.min(delta, 0.05)); },
    dispose() {
      mixer.stopAllAction(); mixer.uncacheRoot(model);
      model.traverse(object => {
        if (!object.isMesh) return;
        object.geometry.dispose();
        for (const material of [].concat(object.material)) material.dispose();
      });
    },
  };
}
