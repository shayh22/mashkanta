import { describe, expect, it, vi } from 'vitest';
import type { AdviceRequest } from '../src/engine/money/adviceRequest';
import { handleAdvise } from './advise';
import { HOURLY_LIMIT } from './openrouter';

function fakeCache() {
  const store = new Map<string, Response>();
  return {
    match: async (request: Request) => store.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => void store.set(request.url, response),
  } as unknown as Cache;
}

const env = { OPENROUTER_API_KEY: 'sk-test' };
const REQUEST: AdviceRequest = {
  goal: 'לצאת מהמינוס',
  income: 15_000,
  spending: 17_000,
  fixed: 8_000,
  oneOff: 0,
  months: 3,
  overdraft: null,
  categories: [{ id: 'DINING', monthly: 900 }],
  ideas: [],
};
const ANSWER = {
  summary: 'מצמצמים מסעדות',
  steps: [{ title: 'פחות מסעדות', detail: 'פעם בשבוע', category: 'DINING', targetMonthly: 600 }],
  cautions: [],
};
const post = (body: unknown, origin = 'https://app.test') =>
  new Request('https://app.test/api/advise', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
    body: JSON.stringify(body),
  });
const answering = (content: unknown) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] })));

describe('household advice endpoint', () => {
  it('sends the validated totals with a strict schema, and returns the advice', async () => {
    const upstream = answering(ANSWER);
    const response = await handleAdvise(post({ ...REQUEST, payees: ['שם'] }), env, fakeCache(), upstream);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { advice: unknown }).advice).toEqual(ANSWER);
    const sent = JSON.parse((upstream.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.response_format.json_schema).toMatchObject({ name: 'householdAdvice', strict: true });
    expect(sent.provider).toEqual({ data_collection: 'deny' });
    expect(JSON.parse(sent.messages[1].content)).toEqual(REQUEST);
  });

  it('refuses other sites, bad requests and an unconfigured key without calling the model', async () => {
    const upstream = answering(ANSWER);
    expect((await handleAdvise(post(REQUEST, 'https://evil.test'), env, fakeCache(), upstream)).status).toBe(403);
    expect((await handleAdvise(post({ ...REQUEST, goal: '' }), env, fakeCache(), upstream)).status).toBe(400);
    expect((await handleAdvise(post(REQUEST), {}, fakeCache(), upstream)).status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rate limits per visitor', async () => {
    const cache = fakeCache();
    const upstream = answering(ANSWER);
    for (let i = 0; i < HOURLY_LIMIT; i++) {
      expect((await handleAdvise(post(REQUEST), env, cache, upstream)).status).toBe(200);
    }
    expect((await handleAdvise(post(REQUEST), env, cache, upstream)).status).toBe(429);
  });

  it('turns an answer that is not advice into an error', async () => {
    expect((await handleAdvise(post(REQUEST), env, fakeCache(), answering({ nothing: true }))).status).toBe(502);
  });
});
