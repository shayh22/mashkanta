import { describe, expect, it, vi } from 'vitest';
import type { ConsultRequest } from '../src/engine/money/consultRequest';
import { handleConsult } from './consult';
import { HOURLY_LIMIT } from './openrouter';

function fakeCache() {
  const store = new Map<string, Response>();
  return {
    match: async (request: Request) => store.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => void store.set(request.url, response),
  } as unknown as Cache;
}

const env = { OPENROUTER_API_KEY: 'sk-test' };
const REQUEST: ConsultRequest = { step: 'flow', question: 'באוגוסט היה בונוס', facts: [{ label: 'הכנסה חודשית ממוצעת', value: 15_000 }] };
const ANSWER = { answer: 'הבונוס חד-פעמי', points: ['לא לבנות עליו'] };
const post = (body: unknown, origin = 'https://app.test') =>
  new Request('https://app.test/api/consult', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
    body: JSON.stringify(body),
  });
const answering = (content: unknown) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] })));

describe('screen advice endpoint', () => {
  it('sends the validated screen facts and words with a strict schema, and returns the answer', async () => {
    const upstream = answering(ANSWER);
    const response = await handleConsult(post({ ...REQUEST, account: '12-345' }), env, fakeCache(), upstream);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { answer: unknown }).answer).toEqual(ANSWER);
    const sent = JSON.parse((upstream.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.response_format.json_schema).toMatchObject({ name: 'screenAdvice', strict: true });
    expect(sent.provider).toEqual({ data_collection: 'deny' });
    expect(JSON.parse(sent.messages[1].content)).toEqual(REQUEST);
  });

  it('refuses other sites, bad requests and an unconfigured key without calling the model', async () => {
    const upstream = answering(ANSWER);
    expect((await handleConsult(post(REQUEST, 'https://evil.test'), env, fakeCache(), upstream)).status).toBe(403);
    expect((await handleConsult(post({ ...REQUEST, step: 'x' }), env, fakeCache(), upstream)).status).toBe(400);
    expect((await handleConsult(post(REQUEST), {}, fakeCache(), upstream)).status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rate limits per visitor', async () => {
    const cache = fakeCache();
    const upstream = answering(ANSWER);
    for (let i = 0; i < HOURLY_LIMIT; i++) {
      expect((await handleConsult(post(REQUEST), env, cache, upstream)).status).toBe(200);
    }
    expect((await handleConsult(post(REQUEST), env, cache, upstream)).status).toBe(429);
  });

  it('turns an answer that is not one into an error', async () => {
    expect((await handleConsult(post(REQUEST), env, fakeCache(), answering({ nothing: true }))).status).toBe(502);
  });
});
