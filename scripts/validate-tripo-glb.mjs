import fs from 'node:fs/promises';
import validator from 'gltf-validator';

const root = 'assets/characters/tripo';
const reports = [];
const clipNames = ['Idle','Walk','Run','Jump','Shoot'];
for (const id of ['male_scout','female_striker']) {
  const filename = `${root}/${id}_animated.glb`;
  const bytes = await fs.readFile(filename);
  const doc = JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  const check = await validator.validateBytes(new Uint8Array(bytes), { uri:filename, maxIssues:200 });
  let triangles = 0;
  for (const mesh of doc.meshes || []) {
    for (const primitive of mesh.primitives) {
      const count = doc.accessors[primitive.indices ?? primitive.attributes.POSITION].count;
      if ((primitive.mode ?? 4) !== 4) throw new Error(`${id}: non-triangle primitive`);
      triangles += count/3;
    }
  }
  const clips = (doc.animations || []).map(animation => {
    let duration = 0;
    for (const sampler of animation.samplers) {
      const accessor = doc.accessors[sampler.input];
      duration = Math.max(duration, accessor.max?.[0] || 0);
    }
    return {name:animation.name, duration, channels:animation.channels.length};
  });
  const summary = {
    id, filename, bytes:bytes.length, triangles,
    bones:doc.skins?.[0]?.joints.length || 0,
    materials:doc.materials?.length || 0,
    textures:doc.textures?.length || 0,
    embeddedImages:(doc.images || []).every(i => i.bufferView !== undefined || i.uri?.startsWith('data:')),
    baseColorTextured:(doc.materials || []).some(m => m.pbrMetallicRoughness?.baseColorTexture),
    clips, errors:check.issues.numErrors, warnings:check.issues.numWarnings,
    messages:check.issues.messages,
  };
  const failures = [];
  if (summary.errors) failures.push('glTF validation errors');
  if (!summary.bones) failures.push('skeleton missing');
  if (!summary.textures || !summary.baseColorTextured || !summary.embeddedImages) failures.push('self-contained textures missing');
  if (triangles > 20500) failures.push('over the 20k face budget');
  for (const name of clipNames) {
    const clip = clips.find(c => c.name === name);
    if (!clip || clip.channels < 2 || clip.duration <= 0) failures.push(`invalid ${name} clip`);
  }
  summary.failures = failures;
  if (failures.length) process.exitCode = 1;
  reports.push(summary);
  console.log(`${id}: ${triangles} triangles; ${summary.bones} bones; ${summary.textures} textures; ${clips.length} clips; ${summary.errors} errors, ${summary.warnings} warnings${failures.length ? '\n'+failures.join('\n') : ''}`);
}
await fs.writeFile('reports/tripo/gltf-validation.json',JSON.stringify(reports,null,2));
