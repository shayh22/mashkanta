import { describe, expect, it, vi } from 'vitest';
import { handleCategorize } from './categorize';
import { HOURLY_LIMIT } from './openrouter';

function fakeCache() {
  const store = new Map<string, Response>();
  return {
    match: async (request: Request) => store.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => void store.set(request.url, response),
  } as unknown as Cache;
}

const env = { OPENROUTER_API_KEY: 'sk-test' };
const REQUEST = { payees: ['חנות צעצועים דוגמה', 'מאפיית דוגמה'] };
const ANSWER = { items: [{ index: 0, category: 'SHOPPING' }, { index: 1, category: 'GROCERIES' }] };
const post = (body: unknown, origin = 'https://app.test') =>
  new Request('https://app.test/api/categorize', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
    body: JSON.stringify(body),
  });
const answering = (content: unknown) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] })));

describe('business categories endpoint', () => {
  it('sends the names alone, indexed, with a strict schema, and returns the answer', async () => {
    const upstream = answering(ANSWER);
    const response = await handleCategorize(post({ ...REQUEST, total: 1234 }), env, fakeCache(), upstream);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { categories: unknown }).categories).toEqual(ANSWER);
    const sent = JSON.parse((upstream.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.response_format.json_schema).toMatchObject({ name: 'payeeCategories', strict: true });
    expect(sent.provider).toEqual({ data_collection: 'deny' });
    expect(JSON.parse(sent.messages[1].content)).toEqual([
      { index: 0, name: 'חנות צעצועים דוגמה' },
      { index: 1, name: 'מאפיית דוגמה' },
    ]);
  });

  it('refuses other sites, bad requests and an unconfigured key without calling the model', async () => {
    const upstream = answering(ANSWER);
    expect((await handleCategorize(post(REQUEST, 'https://evil.test'), env, fakeCache(), upstream)).status).toBe(403);
    expect((await handleCategorize(post({ payees: [] }), env, fakeCache(), upstream)).status).toBe(400);
    expect((await handleCategorize(post(REQUEST), {}, fakeCache(), upstream)).status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rate limits per visitor', async () => {
    const cache = fakeCache();
    const upstream = answering(ANSWER);
    for (let i = 0; i < HOURLY_LIMIT; i++) {
      expect((await handleCategorize(post(REQUEST), env, cache, upstream)).status).toBe(200);
    }
    expect((await handleCategorize(post(REQUEST), env, cache, upstream)).status).toBe(429);
  });

  it('turns an answer that is not a list of categories into an error', async () => {
    expect((await handleCategorize(post(REQUEST), env, fakeCache(), answering({ nothing: true }))).status).toBe(502);
  });
});
