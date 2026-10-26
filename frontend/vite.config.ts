import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { isUsable } from './src/engine/boiMarket';
import { readMarket } from './worker/market';

/**
 * `/api/market` for the dev and preview servers, doing what the Worker does in production. Without
 * it the app would fall back to its seeded figures whenever it runs locally.
 */
function marketApi(): Plugin {
  const handler: Connect.NextHandleFunction = (request, response, next) => {
    if (!request.url?.startsWith('/api/market')) {
      next();
      return;
    }
    readMarket(fetch)
      .then((market) => {
        response.statusCode = isUsable(market) ? 200 : 502;
        response.setHeader('content-type', 'application/json; charset=utf-8');
        response.end(JSON.stringify(market));
      })
      .catch(next);
  };
  return {
    name: 'market-api',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

export default defineConfig({
  plugins: [react(), marketApi()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          // Only the framework and the state stores belong in the eagerly loaded vendor chunk. The
          // stores must be listed: everything unlisted falls through to 'charts', and a store
          // landing there makes the entry chunk depend on - and preload - the whole charting library.
          if (/node_modules\/(react|react-dom|scheduler|@tanstack|zustand|use-sync-external-store)\//.test(id)) {
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
