import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({
 plugins:[vue()],
 build:{rollupOptions:{input:{game:fileURLToPath(new URL('./index.html',import.meta.url)),characters:fileURLToPath(new URL('./characters.html',import.meta.url))}}},
});
