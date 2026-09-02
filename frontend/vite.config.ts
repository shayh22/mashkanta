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
          // Only the framework belongs in the eagerly loaded vendor chunk.
          if (/node_modules\/(react|react-dom|scheduler|@tanstack)\//.test(id)) {
            return 'vendor';
          }
          // pdf.js is only reached when someone drops an approval-in-principle on the upload
          // screen. It must not ride along with the charts, which every results page loads.
          if (/node_modules\/pdfjs-dist/.test(id)) {
            return 'pdf';
          }
          // Everything else here is pulled in by the charting library, which the results page
          // lazy-loads, so keeping it out of vendor is what makes the first paint cheap.
          return 'charts';
        },
      },
    },
  },
});
