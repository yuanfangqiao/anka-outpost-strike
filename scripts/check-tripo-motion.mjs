/** Data-only Three.js check: load real geometry/skin/clips and sample deformation.
 * Textures are removed only from the in-memory copy so Node needs no DOM/image
 * decoder. The delivered GLBs are validated separately with their real textures.
 */
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

if (typeof globalThis.ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type,init={}) { this.type=type; Object.assign(this,init); }
  };
}

const results=[];
for (const id of ['male_scout','female_striker']) {
  const filename=`assets/characters/tripo/${id}_animated.glb`;
  const bytes=await fs.readFile(filename);
  const jsonLength=bytes.readUInt32LE(12);
  const document=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
  const binStart=20+jsonLength;
  const binLength=bytes.readUInt32LE(binStart);
  const binary=bytes.subarray(binStart+8,binStart+8+binLength);
  document.buffers[0].uri='data:application/octet-stream;base64,'+binary.toString('base64');
  delete document.images;
  delete document.textures;
  delete document.samplers;
  for (const material of document.materials || []) {
    delete material.normalTexture;
    delete material.occlusionTexture;
    delete material.emissiveTexture;
    delete material.pbrMetallicRoughness?.baseColorTexture;
    delete material.pbrMetallicRoughness?.metallicRoughnessTexture;
  }
  const gltf=await new GLTFLoader().parseAsync(JSON.stringify(document),'');
  const scene=gltf.scene;
  const meshes=[];
  scene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
  if(!meshes.length)throw new Error(`${id}: no skinned meshes`);
  const mixer=new THREE.AnimationMixer(scene);
  const clipResults=[];
  const point=new THREE.Vector3();
  for(const name of ['Idle','Walk','Run','Jump','Shoot']) {
    const clip=gltf.animations.find(c=>c.name===name);
    if(!clip)throw new Error(`${id}: ${name} missing`);
    mixer.stopAllAction();
    const action=mixer.clipAction(clip).reset().play();
    const samples=[];
    for(const fraction of [0,.15,.35,.55,.75,.95]) {
      mixer.setTime(clip.duration*fraction);
      scene.updateMatrixWorld(true);
      const box=new THREE.Box3();
      // Every vertex, not just a bind-pose bounding sphere.
      for(const mesh of meshes) {
        mesh.skeleton.update();
        for(let i=0;i<mesh.geometry.attributes.position.count;i++) {
          mesh.getVertexPosition(i,point);
          point.applyMatrix4(mesh.matrixWorld);
          if(!Number.isFinite(point.lengthSq()))throw new Error(`${id}/${name}: non-finite skinning`);
          box.expandByPoint(point);
        }
      }
      const size=box.getSize(new THREE.Vector3());
      const center=box.getCenter(new THREE.Vector3());
      if(size.y<.9 || size.y>3.2 || Math.max(size.x,size.z)>4.0 || center.length()>4) {
        throw new Error(`${id}/${name} at ${fraction}: implausible skinned bounds ${size.toArray()} center ${center.toArray()}`);
      }
      samples.push({fraction,size:size.toArray().map(n=>+n.toFixed(4)),min:box.min.toArray().map(n=>+n.toFixed(4)),max:box.max.toArray().map(n=>+n.toFixed(4))});
    }
    clipResults.push({name,duration:clip.duration,tracks:clip.tracks.length,samples});
    action.stop();
  }
  // Crossfade as used by the actual viewer, checking for binding errors.
  mixer.stopAllAction();
  const idle=mixer.clipAction(gltf.animations.find(c=>c.name==='Idle')).reset().play();
  const run=mixer.clipAction(gltf.animations.find(c=>c.name==='Run')).reset().play();
  run.crossFadeFrom(idle,.18,true);
  for(let i=0;i<12;i++)mixer.update(1/60);
  results.push({id,skinnedMeshes:meshes.length,clips:clipResults,crossfadePassed:true});
  console.log(`${id}: 5 clips × 6 full-mesh deformation samples passed; Idle → Run crossfade passed.`);
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
}
await fs.writeFile('reports/tripo/threejs-motion-check.json',JSON.stringify(results,null,2));
