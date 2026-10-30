// Offline, reproducible asset processing. Original runtime assets are never overwritten.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, prune, resample, weld, simplify, meshopt, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const root=path.resolve(import.meta.dirname,'..');
const backup=path.join(root,'source/model-backups/2026-10-30');
const out=path.join(root,'assets/characters/optimized');
const reportDir=path.join(root,'reports/optimization');
const variants=process.argv.includes('--variants')?['balanced','vertex']:['balanced'];
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
 'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder,
});
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
await Promise.all([fs.mkdir(backup,{recursive:true}),fs.mkdir(out,{recursive:true}),fs.mkdir(reportDir,{recursive:true})]);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=[],results=[];

function stats(doc){
 const r=doc.getRoot(),prims=r.listMeshes().flatMap(m=>m.listPrimitives());
 return {triangles:prims.reduce((n,p)=>n+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),
  vertices:prims.reduce((n,p)=>n+p.getAttribute('POSITION').getCount(),0),
  bones:r.listSkins().map(s=>s.listJoints().length),clips:r.listAnimations().map(a=>a.getName()),
  textures:r.listTextures().map(t=>({mime:t.getMimeType(),bytes:t.getImage()?.byteLength??0})),
  animationChannels:r.listAnimations().reduce((n,a)=>n+a.listChannels().length,0)};
}

async function vertexColors(doc){
 for(const mesh of doc.getRoot().listMeshes())for(const prim of mesh.listPrimitives()){
  const mat=prim.getMaterial(),texture=mat?.getBaseColorTexture(),uv=prim.getAttribute('TEXCOORD_0');
  if(!texture||!uv)throw Error('Vertex-color conversion requires a base-color texture and UVs');
  const {data,info}=await sharp(texture.getImage()).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const color=new Uint8Array(uv.getCount()*4),v=[];
  const linear=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
  for(let i=0;i<uv.getCount();i++){
   uv.getElement(i,v);
   const x=Math.max(0,Math.min(info.width-1,Math.round(v[0]*(info.width-1))));
   const y=Math.max(0,Math.min(info.height-1,Math.round(v[1]*(info.height-1))));
   for(let k=0;k<3;k++)color[i*4+k]=Math.round(linear(data[(y*info.width+x)*4+k]/255)*255);
   color[i*4+3]=255;
  }
  prim.setAttribute('COLOR_0',doc.createAccessor('Baked color',doc.getRoot().listBuffers()[0])
   .setType('VEC4').setArray(color).setNormalized(true));
 }
 for(const mat of doc.getRoot().listMaterials()){
  mat.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null);
  mat.setMetallicFactor(0).setRoughnessFactor(.58);
 }
}

for(const id of ['male_scout','female_striker']){
 const source=path.join(root,`assets/characters/mixamo/${id}_aim.glb`),saved=path.join(backup,`${id}_aim.glb`);
 const bytes=await fs.readFile(source);
 try{await fs.writeFile(saved,bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
 if(sha(await fs.readFile(saved))!==sha(bytes))throw Error(`Original differs from backup: ${id}`);
 manifest.push({file:path.relative(root,source),backup:path.relative(root,saved),bytes:bytes.length,sha256:sha(bytes)});
 for(const variant of variants){
  const doc=await io.read(saved),before=stats(doc);
  // Keep the original rig, names, all 16 clips, and material response.
  for(const a of doc.getRoot().listAnimations())a.setExtras({});
  for(const m of doc.getRoot().listMaterials())m.setExtras({});
  if(variant==='vertex')await vertexColors(doc);
  else{
   doc.createExtension(EXTTextureWebP).setRequired(true);
   const sizes=new Map();
   for(const m of doc.getRoot().listMaterials()){
    if(m.getBaseColorTexture())sizes.set(m.getBaseColorTexture(),[1024,90,false]);
    if(m.getNormalTexture())sizes.set(m.getNormalTexture(),[512,100,true]);
    if(m.getMetallicRoughnessTexture())sizes.set(m.getMetallicRoughnessTexture(),[256,100,true]);
   }
   for(const [texture,[size,quality,lossless]]of sizes){
    const image=await sharp(texture.getImage()).resize(size,size,{fit:'inside',withoutEnlargement:true})
     .webp({quality,lossless,effort:6}).toBuffer();
    texture.setImage(image).setMimeType('image/webp');
   }
  }
  // Retain tangents for the balanced variant's normal map.
  await doc.transform(prune({keepLeaves:true}),dedup(),weld());
  await doc.transform(simplify({simplifier:MeshoptSimplifier,ratio:.4,error:.002}));
  await doc.transform(
   resample({tolerance:1e-5}),dedup(),prune({keepLeaves:true}),unpartition(),
   meshopt({encoder:MeshoptEncoder,level:'high',quantizePosition:14,quantizeNormal:12,quantizeTexcoord:14,quantizeWeight:12}));
  const destination=variant==='balanced'?path.join(out,`${id}.glb`):path.join(reportDir,`candidates/${id}-${variant}.glb`);
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await io.write(destination,doc);
  const result={id,variant,file:path.relative(root,destination),originalBytes:bytes.length,
   optimizedBytes:(await fs.stat(destination)).size,before,after:stats(doc)};
  results.push(result);console.log(JSON.stringify(result));
 }
}
await fs.writeFile(path.join(backup,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(reportDir,'assets.json'),JSON.stringify(results,null,2)+'\n');
