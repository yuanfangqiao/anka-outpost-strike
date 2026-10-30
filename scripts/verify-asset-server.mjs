import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.ANKA_QA_URL||'http://127.0.0.1:5190';
const prefix='/plugins/anka-outpost-strike/';
const report=JSON.parse(await fs.readFile('reports/optimization/compression.json'));
const compiled=report.find(r=>r.file.endsWith('.glb'));
const original=await fs.readFile('dist/'+compiled.file);
const url=base+prefix+'dist/'+compiled.file;
for(const [accept,encoding]of [['br,gzip','br'],['gzip','gzip'],['br;q=0,gzip;q=0',null]]){
 const response=await fetch(url,{headers:{'Accept-Encoding':accept}});
 assert.equal(response.status,200);assert.equal(response.headers.get('content-encoding'),encoding);
 assert.equal(response.headers.get('content-type'),'model/gltf-binary');
 assert.ok(Buffer.from(await response.arrayBuffer()).equals(original));
 assert.match(response.headers.get('cache-control'),/private.*immutable/);
}
const head=await fetch(url,{method:'HEAD',headers:{'Accept-Encoding':'br'}});
assert.equal(head.status,200);assert.equal(head.headers.get('content-encoding'),'br');
assert.equal((await head.arrayBuffer()).byteLength,0);
const range=await fetch(url,{headers:{'Accept-Encoding':'br,gzip','Range':'bytes=10-29'}});
assert.equal(range.status,206);assert.equal(range.headers.get('content-encoding'),null);
assert.ok(Buffer.from(await range.arrayBuffer()).equals(original.subarray(10,30)));
const dynamic=await fetch(base+prefix+'assets/characters/optimized/male_scout.glb',{headers:{'Accept-Encoding':'gzip'}});
assert.equal(dynamic.headers.get('content-encoding'),'gzip');
assert.match(dynamic.headers.get('cache-control'),/no-store/);
assert.ok(Buffer.from(await dynamic.arrayBuffer()).equals(await fs.readFile('assets/characters/optimized/male_scout.glb')));
console.log('Anka Vite: Brotli/Gzip/identity, exact bytes, MIME, cache, HEAD, Range and dynamic Gzip passed.');
