import { isUsable } from '../src/engine/boiMarket';
import { handleExplain } from './explain';
import { handleExtract, type ExtractEnv } from './extract';
import { handleAdvise } from './advise';
import { handleNoam } from './noam';
import { handlePlan } from './plan';
import { readMarket } from './market';

/**
 * The only server code in the deployment, seven routes; every other path is served from static
 * assets without reaching this script (`run_worker_first` in wrangler.toml lists only `/api/*`):
 * - `/api/market` reads the Bank of Israel figures on the app's behalf;
 * - `/api/extract` reads an unrecognised document through OpenRouter (see `extract.ts`);
 * - `/api/explain` puts a priced mortgage mix into words through OpenRouter (see `explain.ts`);
 * - `/api/plan` turns a homeowner's goal into an action per mortgage track (see `plan.ts`);
 * - `/api/advise` turns a household's monthly totals and goal into a few steps (see `advise.ts`);
 * - `/api/noam` is the questionnaire's guide (see `noam.ts`).
 *
 * Market results are cached at the edge for six hours, so the statistics service sees a handful of
 * requests a day however many people open the app. A forced refresh (`?fresh=1`) skips the cache
 * unless the cached copy is under a minute old.
 */

interface Env extends ExtractEnv {
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
}

interface Context {
  waitUntil(promise: Promise<unknown>): void;
}

const EDGE_TTL_SECONDS = 6 * 60 * 60;
/**
 * Part of the cache key. Bump it whenever the response gains or changes a field, or a deploy keeps
 * serving the previous shape from the edge for up to EDGE_TTL_SECONDS.
 */
const SCHEMA_VERSION = 3;
const MIN_FRESH_INTERVAL_MS = 60_000;

const json = (body: unknown, status: number, cacheControl: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
      'x-content-type-options': 'nosniff',
    },
  });

export default {
  async fetch(request: Request, env: Env, context: Context): Promise<Response> {
    const url = new URL(request.url);
    const cache = (caches as unknown as { default: Cache }).default;
    if (url.pathname === '/api/extract') {
      return handleExtract(request, env, cache, fetch);
    }
    if (url.pathname === '/api/explain') {
      return handleExplain(request, env, cache, fetch);
    }
    if (url.pathname === '/api/plan') {
      return handlePlan(request, env, cache, fetch);
    }
    if (url.pathname === '/api/advise') {
      return handleAdvise(request, env, cache, fetch);
    }
    if (url.pathname === '/api/noam') {
      return handleNoam(request, env, cache, fetch);
    }
    // An API path with no handler — one removed, or mistyped — says so rather than serving the page.
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/market') {
      return json({ error: 'not found' }, 404, 'no-store');
    }
    if (url.pathname !== '/api/market') {
      return env.ASSETS.fetch(request);
    }
    if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405, 'no-store');
    }

    const key = new Request(`${url.origin}/api/market?v=${SCHEMA_VERSION}`);
    const cached = await cache.match(key);
    const cachedAt = Number(cached?.headers.get('x-fetched-at') ?? 0);
    if (cached && (!url.searchParams.has('fresh') || Date.now() - cachedAt < MIN_FRESH_INTERVAL_MS)) {
      return cached;
    }

    const market = await readMarket(fetch);
    if (!isUsable(market)) {
      return cached ?? json({ error: 'Bank of Israel data unavailable', missing: market.missing }, 502, 'no-store');
    }
    // A read that lost one of the files (a timeout, a bad day upstream) must not displace a complete
    // one for six hours: serve the complete copy if there is one, otherwise the partial one uncached.
    if (market.missing.length > 0) {
      return cached ?? json(market, 200, 'no-store');
    }
    // The browser keeps it briefly; the edge keeps it for EDGE_TTL_SECONDS.
    const response = json(market, 200, `public, max-age=300, s-maxage=${EDGE_TTL_SECONDS}`);
    response.headers.set('x-fetched-at', String(Date.now()));
    context.waitUntil(cache.put(key, response.clone()));
    return response;
  },
};
