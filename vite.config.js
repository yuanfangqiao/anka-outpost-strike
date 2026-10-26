import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
 base:'./',
 define:{__ANKA_BUILD__:JSON.stringify('development')},
 plugins:[vue()],
 server:{watch:{ignored:['**/sites/**','**/reports/**','**/source/**']}},
 build:{rollupOptions:{input:{game:fileURLToPath(new URL('./index.html',import.meta.url)),characters:fileURLToPath(new URL('./characters.html',import.meta.url))}}},
});
