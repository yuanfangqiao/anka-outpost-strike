// Compile to a staging directory and promote only a complete, validated build.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { build } from 'vite';
const root=process.cwd(),hash=crypto.createHash('sha256');
function fingerprint(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name);if(entry.isDirectory())fingerprint(file);else{hash.update(path.relative(root,file));hash.update(fs.readFileSync(file));}}}
fingerprint(path.join(root,'game'));fingerprint(path.join(root,'assets'));
hash.update(fs.readFileSync('package-lock.json'));hash.update(fs.readFileSync('vite.config.js'));
const buildId=hash.digest('hex').slice(0,16),stage=path.join(root,`.dist-stage-${process.pid}`),backup=path.join(root,'.dist-previous'),out=path.join(root,'dist');
try{
 await build({define:{__ANKA_BUILD__:JSON.stringify(buildId)},build:{outDir:stage,emptyOutDir:true}});
 for(const file of ['index.html','assets'])if(!fs.existsSync(path.join(stage,file)))throw Error(`构建缺少 ${file}`);
 fs.writeFileSync(path.join(stage,'build.json'),JSON.stringify({build:buildId,protocol:1}));
 fs.rmSync(backup,{recursive:true,force:true});if(fs.existsSync(out))fs.renameSync(out,backup);
 try{fs.renameSync(stage,out);}catch(error){if(fs.existsSync(backup))fs.renameSync(backup,out);throw error;}
 fs.rmSync(backup,{recursive:true,force:true});console.log(`ANKA game build ${buildId}`);
}finally{fs.rmSync(stage,{recursive:true,force:true});}
