import { describe, expect, it, vi } from 'vitest';
import { SAMPLE_REQUEST } from '../src/engine/mixExplanation.fixture';
import { handleExplain } from './explain';
import { HOURLY_LIMIT } from './openrouter';

function fakeCache() {
  const store = new Map<string, Response>();
  return {
    match: async (request: Request) => store.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => void store.set(request.url, response),
  } as unknown as Cache;
}

const env = { OPENROUTER_API_KEY: 'sk-test' };
const post = (body: unknown, origin = 'https://app.test') =>
  new Request('https://app.test/api/explain', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
    body: JSON.stringify(body),
  });
const ANSWER = { headline: 'תמהיל מאוזן', reasons: ['א'], risks: ['ב'], askTheBank: ['ג'] };
const answering = (content: unknown) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] })));

describe('mix explanation endpoint', () => {
  it('sends only the validated figures, with a strict schema, and returns the explanation', async () => {
    const upstream = answering(ANSWER);
    const response = await handleExplain(post({ ...SAMPLE_REQUEST, note: 'free text' }), env, fakeCache(), upstream);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { explanation: unknown }).explanation).toEqual(ANSWER);
    const sent = JSON.parse((upstream.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.response_format.json_schema).toMatchObject({ name: 'mixExplanation', strict: true });
    expect(sent.provider).toEqual({ data_collection: 'deny' });
    expect(sent.messages[1].content).not.toContain('free text');
    expect(JSON.parse(sent.messages[1].content)).toEqual(SAMPLE_REQUEST);
  });

  it('refuses other sites, bad requests and an unconfigured key without calling the model', async () => {
    const upstream = answering(ANSWER);
    expect((await handleExplain(post(SAMPLE_REQUEST, 'https://evil.test'), env, fakeCache(), upstream)).status).toBe(403);
    expect((await handleExplain(post({ question: 'hi' }), env, fakeCache(), upstream)).status).toBe(400);
    expect((await handleExplain(post(SAMPLE_REQUEST), {}, fakeCache(), upstream)).status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rate limits per visitor, separately from document reading', async () => {
    const cache = fakeCache();
    const upstream = answering(ANSWER);
    for (let i = 0; i < HOURLY_LIMIT; i++) {
      expect((await handleExplain(post(SAMPLE_REQUEST), env, cache, upstream)).status).toBe(200);
    }
    expect((await handleExplain(post(SAMPLE_REQUEST), env, cache, upstream)).status).toBe(429);
  });

  it('turns an answer that is not an explanation into an error', async () => {
    const response = await handleExplain(post(SAMPLE_REQUEST), env, fakeCache(), answering({ nothing: true }));
    expect(response.status).toBe(502);
  });
});
