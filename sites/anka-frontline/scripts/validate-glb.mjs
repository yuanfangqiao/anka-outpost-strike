import fs from 'node:fs/promises';
import path from 'node:path';
import validator from 'gltf-validator';

const results = [];
for (const file of ['male_scout.glb', 'female_striker.glb']) {
  const bytes = await fs.readFile(path.join('assets/characters', file));
  const report = await validator.validateBytes(new Uint8Array(bytes), { uri: file, maxIssues: 200 });
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20+jsonLength));
  const summary = {
    file, errors: report.issues.numErrors, warnings: report.issues.numWarnings,
    messages: report.issues.messages,
    clips: gltf.animations?.map(a => ({ name: a.name, channels: a.channels.length })) || [],
    bones: gltf.skins?.[0]?.joints.length,
    materials: gltf.materials?.length,
    primitives: gltf.meshes?.reduce((n,m) => n + m.primitives.length, 0),
    hasVertexColors: gltf.meshes?.every(m => m.primitives.every(p => p.attributes.COLOR_0 !== undefined)),
  };
  const expected = ['Idle','Run','Shoot','Jump','Victory'];
  if (summary.errors || expected.some(name => !summary.clips.some(clip => clip.name === name)) || !summary.hasVertexColors) process.exitCode = 1;
  results.push(summary);
  console.log(`${file}: ${summary.errors} errors, ${summary.warnings} warnings; ${summary.bones} bones; ${summary.clips.length} clips; ${summary.primitives} primitives`);
}
await fs.writeFile('reports/gltf-validation.json', JSON.stringify(results,null,2));
