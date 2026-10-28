import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { isUsable } from './src/engine/boiMarket';
import { handleExplain } from './worker/explain';
import { handleExtract } from './worker/extract';
import { handleAdvise } from './worker/advise';
import { handleCategorize } from './worker/categorize';
import { handleConsult } from './worker/consult';
import { handleNoam } from './worker/noam';
import { handlePlan } from './worker/plan';
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
  // The same document endpoint as production, with the key from the environment and an
  // in-memory stand-in for the edge cache.
  const memory = new Map<string, Response>();
  const cache = {
    match: async (key: Request) => memory.get(key.url)?.clone(),
    put: async (key: Request, value: Response) => void memory.set(key.url, value),
  } as unknown as Cache;
  const ROUTES = {
    '/api/extract': handleExtract,
    '/api/explain': handleExplain,
    '/api/plan': handlePlan,
    '/api/categorize': handleCategorize,
    '/api/advise': handleAdvise,
    '/api/consult': handleConsult,
    '/api/noam': handleNoam,
  };
  const extract: Connect.NextHandleFunction = (request, response, next) => {
    const route = Object.entries(ROUTES).find(([path]) => request.url?.startsWith(path))?.[1];
    if (!route) {
      next();
      return;
    }
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const origin = `http://${request.headers.host}`;
      const forwarded = new Request(`${origin}${request.url}`, {
        method: request.method,
        headers: { 'content-type': 'application/json', origin: String(request.headers.origin ?? origin) },
        body: request.method === 'POST' ? Buffer.concat(chunks) : undefined,
      });
      route(forwarded, { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, OPENROUTER_MODEL: process.env.OPENROUTER_MODEL }, cache, fetch)
        .then(async (result) => {
          response.statusCode = result.status;
          response.setHeader('content-type', 'application/json; charset=utf-8');
          response.end(await result.text());
        })
        .catch(next);
    });
  };
  return {
    name: 'market-api',
    configureServer: (server) => void server.middlewares.use(handler).use(extract),
    configurePreviewServer: (server) => void server.middlewares.use(handler).use(extract),
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
