import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import validator from 'gltf-validator';
if(!globalThis.ProgressEvent)globalThis.ProgressEvent=class{constructor(type,init={}){this.type=type;Object.assign(this,init);}};
async function load(file){
 const bytes=await fs.readFile(file),n=bytes.readUInt32LE(12),json=JSON.parse(bytes.toString('utf8',20,20+n));
 const offset=28+n,binary=bytes.subarray(offset,offset+bytes.readUInt32LE(20+n));
 json.buffers[0].uri='data:application/octet-stream;base64,'+binary.toString('base64');
 delete json.images;delete json.textures;delete json.samplers;
 for(const m of json.materials||[]){
  delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;
  delete m.pbrMetallicRoughness?.baseColorTexture;delete m.pbrMetallicRoughness?.metallicRoughnessTexture;
 }
 return {bytes,json,gltf:await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(JSON.stringify(json),'')};
}
function sample(gltf,name,fraction){
 const mixer=new THREE.AnimationMixer(gltf.scene),clip=gltf.animations.find(c=>c.name===name);
 const action=mixer.clipAction(clip).play();action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;
 mixer.setTime(clip.duration*fraction);gltf.scene.updateMatrixWorld(true);
 const box=new THREE.Box3(),point=new THREE.Vector3(),bones={};
 gltf.scene.traverse(o=>{
  if(o.isBone)bones[o.name]=o.getWorldPosition(new THREE.Vector3());
  if(o.isSkinnedMesh){
   o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i++){
    o.getVertexPosition(i,point).applyMatrix4(o.matrixWorld);
    assert.ok(Number.isFinite(point.lengthSq()),'finite skinning');box.expandByPoint(point);
   }
  }
 });
 mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);return {box,bones};
}
const results=[];
for(const id of ['male_scout','female_striker']){
 const original=await load(`assets/characters/mixamo/${id}_aim.glb`);
 const optimized=await load(`assets/characters/optimized/${id}.glb`);
 const backup=await fs.readFile(`source/model-backups/2026-10-30/${id}_aim.glb`);
 assert.deepEqual(backup,original.bytes,'backup must be byte-identical');
 const validation=await validator.validateBytes(new Uint8Array(optimized.bytes),{maxIssues:100});
 assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues));
 assert.equal(optimized.json.skins[0].joints.length,65);
 assert.deepEqual(optimized.gltf.animations.map(c=>c.name).sort(),original.gltf.animations.map(c=>c.name).sort());
 let maxBoneError=0,maxBoundsError=0,samples=0;
 for(const clip of original.gltf.animations){
  assert.ok(Math.abs(clip.duration-optimized.gltf.animations.find(c=>c.name===clip.name).duration)<.00001);
  for(const fraction of [0,.25,.5,.75,.9999]){
   const a=sample(original.gltf,clip.name,fraction),b=sample(optimized.gltf,clip.name,fraction);
   for(const [name,position]of Object.entries(a.bones)){
    assert.ok(b.bones[name],name);maxBoneError=Math.max(maxBoneError,position.distanceTo(b.bones[name]));
   }
   maxBoundsError=Math.max(maxBoundsError,a.box.min.distanceTo(b.box.min),a.box.max.distanceTo(b.box.max));samples++;
  }
 }
 assert.ok(maxBoneError<.002,`rig changed by ${maxBoneError}m`);
 assert.ok(maxBoundsError<.04,`deformed bounds changed by ${maxBoundsError}m`);
 const record={id,originalBytes:original.bytes.length,optimizedBytes:optimized.bytes.length,
  backupSHA256:crypto.createHash('sha256').update(backup).digest('hex'),bones:65,clips:16,samples,
  maxBoneError,maxBoundsError,validationErrors:validation.issues.numErrors,validationWarnings:validation.issues.numWarnings};
 results.push(record);console.log(JSON.stringify(record));
}
await fs.writeFile('reports/optimization/motion.json',JSON.stringify(results,null,2)+'\n');
