import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { sendAsset } from './scripts/http-assets.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const compression={name:'anka-asset-compression',configureServer(server){
 server.middlewares.use((req,res,next)=>{
  if(!['GET','HEAD'].includes(req.method))return next();
  const pathname=decodeURIComponent((req.url||'').split('?')[0]);
  if(!pathname.endsWith('.glb'))return next();
  const file=path.resolve(root,pathname.slice(1));
  if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile())return next();
  sendAsset(req,res,file);
 });
},configurePreviewServer(server){
 server.middlewares.use((req,res,next)=>{
  if(!['GET','HEAD'].includes(req.method))return next();
  const pathname=decodeURIComponent((req.url||'').split('?')[0]);
  const directory=path.join(root,'dist');
  const file=path.resolve(directory,'.'+pathname);
  if(!file.startsWith(directory+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return next();
  sendAsset(req,res,file,{development:false});
 });
}};
export default defineConfig({
 base:'./',
 define:{__ANKA_BUILD__:JSON.stringify('development')},
 plugins:[vue(),compression],
 server:{watch:{ignored:['**/sites/**','**/reports/**','**/source/**']}},
 build:{rollupOptions:{input:{game:fileURLToPath(new URL('./index.html',import.meta.url)),characters:fileURLToPath(new URL('./characters.html',import.meta.url))}}},
});
