import { isUsable } from '../src/engine/boiMarket';
import { readMarket } from './market';

/**
 * The only server code in the deployment: `/api/market`, which reads the Bank of Israel figures on
 * the app's behalf. Every other path is served from static assets without reaching this script
 * (`run_worker_first` in wrangler.toml lists only `/api/*`).
 *
 * Results are cached at the edge for six hours, so the statistics service sees a handful of
 * requests a day however many people open the app. A forced refresh (`?fresh=1`) skips the cache
 * unless the cached copy is under a minute old.
 */

interface Env {
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
}

interface Context {
  waitUntil(promise: Promise<unknown>): void;
}

const EDGE_TTL_SECONDS = 6 * 60 * 60;
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
    if (url.pathname !== '/api/market') {
      return env.ASSETS.fetch(request);
    }
    if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405, 'no-store');
    }

    const cache = (caches as unknown as { default: Cache }).default;
    const key = new Request(`${url.origin}/api/market`);
    const cached = await cache.match(key);
    const cachedAt = Number(cached?.headers.get('x-fetched-at') ?? 0);
    if (cached && (!url.searchParams.has('fresh') || Date.now() - cachedAt < MIN_FRESH_INTERVAL_MS)) {
      return cached;
    }

    const market = await readMarket(fetch);
    if (!isUsable(market)) {
      return cached ?? json({ error: 'Bank of Israel data unavailable', missing: market.missing }, 502, 'no-store');
    }
    // The browser keeps it briefly; the edge keeps it for EDGE_TTL_SECONDS.
    const response = json(market, 200, `public, max-age=300, s-maxage=${EDGE_TTL_SECONDS}`);
    response.headers.set('x-fetched-at', String(Date.now()));
    context.waitUntil(cache.put(key, response.clone()));
    return response;
  },
};
