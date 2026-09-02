import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The dev and preview servers both talk to the Spring Boot backend on 8080. In production the
  // two are served from the same origin behind the CDN, so no proxy is involved there.
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          // Only the framework belongs in the eagerly loaded vendor chunk. Everything else in
          // node_modules is pulled in by the charting library, which the results page lazy-loads,
          // so keeping it out of vendor is what makes the first paint cheap.
          if (/node_modules\/(react|react-dom|scheduler|@tanstack)\//.test(id)) {
            return 'vendor';
          }
          return 'charts';
        },
      },
    },
  },
});
