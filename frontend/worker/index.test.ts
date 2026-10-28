import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import br from '../src/engine/__fixtures__/boi/br.csv?raw';
import loans from '../src/engine/__fixtures__/boi/loans.csv?raw';
import mortgages from '../src/engine/__fixtures__/boi/mortgages.csv?raw';
import zcm from '../src/engine/__fixtures__/boi/zcm.csv?raw';
import worker from './index';

/** An edge cache that honours nothing but keys, which is all the Worker relies on. */
function fakeCache() {
  const store = new Map<string, Response>();
  return {
    store,
    match: async (request: Request) => store.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => void store.set(request.url, response),
  };
}

/** The statistics service, answering each dataflow from the fixtures unless told to fail it. */
function boi(failing: string[] = []) {
  const files: Record<string, string> = { '/BR/': br, '/ZCM/': zcm, '/BIR_MRTG_99/': mortgages, '/BIR/': loans };
  return vi.fn(async (url: string) => {
    const key = Object.keys(files).find((path) => url.includes(path))!;
    return failing.includes(key) ? new Response('down', { status: 503 }) : new Response(files[key]);
  });
}

const env = { ASSETS: { fetch: vi.fn(async () => new Response('asset')) } };
const pending: Promise<unknown>[] = [];
const context = { waitUntil: (promise: Promise<unknown>) => void pending.push(promise) };
const get = (path: string) => worker.fetch(new Request(`https://example.test${path}`), env, context);

describe('market worker', () => {
  let cache: ReturnType<typeof fakeCache>;
  beforeEach(() => {
    cache = fakeCache();
    vi.stubGlobal('caches', { default: cache });
  });
  afterEach(async () => {
    await Promise.all(pending.splice(0));
    vi.unstubAllGlobals();
  });

  it('serves a complete read and caches it at the edge', async () => {
    vi.stubGlobal('fetch', boi());
    const response = await get('/api/market');
    await Promise.all(pending.splice(0));

    expect(response.status).toBe(200);
    expect((await response.json()).missing).toEqual([]);
    expect(response.headers.get('cache-control')).toContain('s-maxage=21600');
    expect(cache.store.size).toBe(1);
  });

  it('does not let a partial read displace a complete one', async () => {
    vi.stubGlobal('fetch', boi());
    await get('/api/market');
    await Promise.all(pending.splice(0));

    // An hour later the mortgage file times out on a forced refresh.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 3_600_000);
    vi.stubGlobal('fetch', boi(['/BIR_MRTG_99/']));
    const response = await get('/api/market?fresh=1');

    expect((await response.json()).missing).toEqual([]);
    vi.restoreAllMocks();
  });

  it('returns a partial read uncached when there is nothing better', async () => {
    vi.stubGlobal('fetch', boi(['/BIR_MRTG_99/']));
    const response = await get('/api/market');

    expect(response.status).toBe(200);
    expect((await response.json()).missing).toContain('housing');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(cache.store.size).toBe(0);
  });

  it('answers a forced refresh from the edge within a minute of the last read', async () => {
    const upstream = boi();
    vi.stubGlobal('fetch', upstream);
    await get('/api/market');
    await Promise.all(pending.splice(0));
    const reads = upstream.mock.calls.length;

    const response = await get('/api/market?fresh=1');
    expect(response.status).toBe(200);
    expect(upstream.mock.calls.length).toBe(reads);
  });

  it('says the Bank of Israel is unavailable when nothing usable came back and nothing is cached', async () => {
    vi.stubGlobal('fetch', boi(['/BR/', '/ZCM/', '/BIR_MRTG_99/', '/BIR/']));
    const response = await get('/api/market');
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(cache.store.size).toBe(0);
  });

  it('only reads the market', async () => {
    const response = await worker.fetch(new Request('https://example.test/api/market', { method: 'POST' }), env, context);
    expect(response.status).toBe(405);
  });

  it('routes every AI path to its own handler, which says whether AI is on', async () => {
    for (const path of ['/api/extract', '/api/explain', '/api/plan', '/api/categorize', '/api/advise', '/api/consult']) {
      const response = await get(path);
      expect({ path, body: await response.json() }).toEqual({ path, body: { enabled: false } });
    }
    expect(env.ASSETS.fetch).not.toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('/api/') }));
  });

  it('leaves every other path to the static assets', async () => {
    const response = await get('/refinance');
    expect(await response.text()).toBe('asset');
  });
});
