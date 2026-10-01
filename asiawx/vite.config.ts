import {defineConfig} from 'vite';
export default defineConfig({worker:{format:'es'},build:{chunkSizeWarningLimit:1100,rollupOptions:{output:{manualChunks:{maplibre:['maplibre-gl']}}}}});
