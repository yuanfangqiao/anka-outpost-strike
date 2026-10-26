import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import validator from 'gltf-validator';
if(typeof globalThis.ProgressEvent==='undefined')globalThis.ProgressEvent=class{constructor(type,init={}){this.type=type;Object.assign(this,init)}};
const summaries=[];
for(const id of ['male_scout','female_striker']){
 const file=`assets/characters/mixamo/${id}_aim.glb`;
 const data=await fs.readFile(file),size=data.readUInt32LE(12),doc=JSON.parse(data.toString('utf8',20,20+size));
 const report=await validator.validateBytes(new Uint8Array(data),{maxIssues:100});
 const expected=['Idle','Walk','Run','Jump','TripoShoot','AimRaise','AimLower','AimIdle','Shoot','CrouchIdle','CrouchWalk','Roll','Victory','Reload','Hurt','Death'];
 const names=doc.animations.map(a=>a.name);for(const n of expected)if(!names.includes(n))throw Error(`${id} missing ${n}`);
 if(report.issues.numErrors)throw Error(JSON.stringify(report.issues));
 const binStart=20+size,binSize=data.readUInt32LE(binStart),binary=data.subarray(binStart+8,binStart+8+binSize);
 const root=doc.nodes[doc.scenes[doc.scene||0].nodes[0]];
 const record={id,file,bytes:data.length,errors:report.issues.numErrors,warnings:report.issues.numWarnings,messages:report.issues.messages,clips:names,bones:doc.skins[0].joints.length,root,skinSamples:[],poseChecks:[]};
 doc.buffers[0].uri='data:application/octet-stream;base64,'+binary.toString('base64');delete doc.images;delete doc.textures;delete doc.samplers;
 for(const m of doc.materials){delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;delete m.pbrMetallicRoughness?.baseColorTexture;delete m.pbrMetallicRoughness?.metallicRoughnessTexture;}
 const gltf=await new GLTFLoader().parseAsync(JSON.stringify(doc),'');
 const scene=gltf.scene,mixer=new THREE.AnimationMixer(scene),meshes=[];scene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o)});
 const p=new THREE.Vector3();
 for(const name of expected){
  mixer.stopAllAction();const clip=gltf.animations.find(c=>c.name===name),a=mixer.clipAction(clip).reset().play();a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;
  const samples=[];
  for(const fraction of [0,.25,.5,.75,.9999]){
   mixer.setTime(clip.duration*fraction);scene.updateMatrixWorld(true);const box=new THREE.Box3();
   for(const mesh of meshes){mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,p);p.applyMatrix4(mesh.matrixWorld);if(!Number.isFinite(p.lengthSq()))throw Error('NaN skinning');box.expandByPoint(p)}}
   const extent=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
   if(extent.y<(['Roll','Death'].includes(name)?.15:.7)||extent.y>3.2||Math.max(extent.x,extent.z)>4||center.length()>4)throw Error(`${id}/${name} invalid bounds ${extent.toArray()}`);
   samples.push({fraction,min:box.min.toArray(),max:box.max.toArray()});
   if(name==='AimRaise'&&fraction===.9999){const joints={};scene.traverse(o=>{if(o.isBone&&/(LeftHand|RightHand|LeftArm|RightArm)$/.test(o.name))joints[o.name]={position:o.getWorldPosition(new THREE.Vector3()).toArray(),quaternion_xyzw:o.getWorldQuaternion(new THREE.Quaternion()).toArray()}});record.aimEndRuntimeJoints=joints;}
  }
  record.skinSamples.push({name,duration:clip.duration,samples});
 }
 // Hold remains stationary and Shoot ends on the same steady pose.
 const findBone=ending=>{let found;scene.traverse(o=>{if(o.isBone&&o.name.endsWith(ending))found=o});return found};
 for(const name of ['AimIdle','Shoot']){
  mixer.stopAllAction();const clip=gltf.animations.find(c=>c.name===name),a=mixer.clipAction(clip).reset().play();a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;
  const hands=[];
  for(const t of [0,clip.duration/2,clip.duration*.9999]){mixer.setTime(t);scene.updateMatrixWorld(true);hands.push(['LeftHand','RightHand'].map(n=>findBone(n).getWorldPosition(new THREE.Vector3()).toArray()))}
  record.poseChecks.push({name,hands,endpointDistance:Math.max(...hands[0].map((v,i)=>new THREE.Vector3(...v).distanceTo(new THREE.Vector3(...hands[2][i]))))});
 }
 summaries.push(record);console.log(id,record.bytes,'bytes',record.bones,'bones',names.join(', '),'validated');
}
await fs.writeFile('reports/mixamo/validation.json',JSON.stringify(summaries,null,2));
