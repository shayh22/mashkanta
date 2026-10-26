import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MODEL, handleExtract, HOURLY_LIMIT } from './extract';

function fakeCache() {
  const store = new Map<string, Response>();
  return {
    match: async (request: Request) => store.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => void store.set(request.url, response),
  } as unknown as Cache;
}

const env = { OPENROUTER_API_KEY: 'sk-test' };
const post = (body: unknown, origin = 'https://app.test', ip = '1.2.3.4') =>
  new Request('https://app.test/api/extract', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });

const answering = (content: unknown) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] })));

describe('document extraction endpoint', () => {
  it('reports whether it is configured, without revealing the key', async () => {
    const on = await handleExtract(new Request('https://app.test/api/extract'), env, fakeCache(), fetch);
    expect(await on.json()).toEqual({ enabled: true });
    const off = await handleExtract(new Request('https://app.test/api/extract'), {}, fakeCache(), fetch);
    expect(await off.json()).toEqual({ enabled: false });
  });

  it('forwards redacted text with a strict schema and returns the structured answer', async () => {
    const upstream = answering({ loans: [] });
    const response = await handleExtract(post({ kind: 'consumerLoans', text: 'יתרה 84,500' }), env, fakeCache(), upstream);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: 'consumerLoans', model: DEFAULT_MODEL, data: { loans: [] } });
    const [url, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    const sent = JSON.parse(init.body as string);
    expect(sent.response_format.json_schema).toMatchObject({ name: 'consumerLoans', strict: true });
    expect(sent.provider).toEqual({ data_collection: 'deny' });
    expect(JSON.stringify(sent.messages)).toContain('יתרה 84,500');
  });

  it('sends page images as image parts', async () => {
    const upstream = answering({ bank: null, tracks: [] });
    await handleExtract(post({ kind: 'offer', images: ['data:image/png;base64,AAAA'] }), env, fakeCache(), upstream);
    const sent = JSON.parse((upstream.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.messages[1].content).toEqual([{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }]);
  });

  it('refuses when unconfigured, from another site, or with a bad request', async () => {
    const upstream = answering({});
    expect((await handleExtract(post({ kind: 'offer', text: 'x' }), {}, fakeCache(), upstream)).status).toBe(503);
    expect((await handleExtract(post({ kind: 'offer', text: 'x' }, 'https://evil.test'), env, fakeCache(), upstream)).status).toBe(403);
    expect((await handleExtract(post({ kind: 'payroll', text: 'x' }), env, fakeCache(), upstream)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('caps each visitor\'s requests per hour', async () => {
    const cache = fakeCache();
    const upstream = answering({ loans: [] });
    for (let i = 0; i < HOURLY_LIMIT; i++) {
      expect((await handleExtract(post({ kind: 'consumerLoans', text: 'x' }), env, cache, upstream)).status).toBe(200);
    }
    expect((await handleExtract(post({ kind: 'consumerLoans', text: 'x' }), env, cache, upstream)).status).toBe(429);
    expect((await handleExtract(post({ kind: 'consumerLoans', text: 'x' }, undefined, '5.6.7.8'), env, cache, upstream)).status).toBe(200);
  });

  it('reports an upstream failure or an unreadable answer as a gateway error', async () => {
    const failing = vi.fn(async () => new Response('nope', { status: 500 }));
    expect((await handleExtract(post({ kind: 'offer', text: 'x' }), env, fakeCache(), failing)).status).toBe(502);
    const garbled = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'not json' } }] })));
    expect((await handleExtract(post({ kind: 'offer', text: 'x' }), env, fakeCache(), garbled)).status).toBe(502);
  });
});
