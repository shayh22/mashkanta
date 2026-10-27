import { describe, expect, it, vi } from 'vitest';
import type { PlanRequest } from '../src/engine/planRequest';
import { HOURLY_LIMIT } from './openrouter';
import { handlePlan } from './plan';

function fakeCache() {
  const store = new Map<string, Response>();
  return {
    match: async (request: Request) => store.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => void store.set(request.url, response),
  } as unknown as Cache;
}

const env = { OPENROUTER_API_KEY: 'sk-test' };
const REQUEST: PlanRequest = {
  goal: 'להוריד את ההחזר בלי לגעת בקבועה',
  tracks: [
    { index: 0, type: 'PRIME', balance: 400_000, annualRate: 0.062, remainingMonths: 240, marketRate: 0.058, refinanceFee: 60 },
    { index: 1, type: 'FIXED_UNLINKED', balance: 300_000, annualRate: 0.04, remainingMonths: 240, marketRate: 0.05, refinanceFee: 20_000 },
  ],
  monthlyPayment: 5_000,
};
const post = (body: unknown, origin = 'https://app.test') =>
  new Request('https://app.test/api/plan', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
    body: JSON.stringify(body),
  });
const ANSWER = {
  actions: [
    { index: 0, action: 'REFINANCE', newType: 'PRIME', termYears: 30, prepayAmount: null },
    { index: 1, action: 'KEEP', newType: null, termYears: null, prepayAmount: null },
  ],
  summary: 'מאריכים את הפריים ושומרים את הקבועה',
  cautions: [],
};
const answering = (content: unknown) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] })));

describe('track plan endpoint', () => {
  it('sends only the validated request, with a strict schema, and returns the plan', async () => {
    const upstream = answering(ANSWER);
    const response = await handlePlan(post({ ...REQUEST, email: 'a@b.c' }), env, fakeCache(), upstream);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { plan: unknown }).plan).toEqual(ANSWER);
    const sent = JSON.parse((upstream.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.response_format.json_schema).toMatchObject({ name: 'trackPlan', strict: true });
    expect(sent.provider).toEqual({ data_collection: 'deny' });
    expect(JSON.parse(sent.messages[1].content)).toEqual(REQUEST);
  });

  it('holds the answer to the request before it leaves the Worker', async () => {
    const wild = {
      ...ANSWER,
      actions: [
        { index: 0, action: 'PREPAY', newType: null, termYears: null, prepayAmount: 9e9 },
        { index: 5, action: 'REFINANCE', newType: 'PRIME', termYears: 30, prepayAmount: null },
      ],
    };
    const response = await handlePlan(post(REQUEST), env, fakeCache(), answering(wild));
    const { plan } = (await response.json()) as { plan: typeof ANSWER };
    expect(plan.actions).toEqual([{ index: 0, action: 'PREPAY', newType: null, termYears: null, prepayAmount: 400_000 }]);
  });

  it('refuses other sites, bad requests and an unconfigured key without calling the model', async () => {
    const upstream = answering(ANSWER);
    expect((await handlePlan(post(REQUEST, 'https://evil.test'), env, fakeCache(), upstream)).status).toBe(403);
    expect((await handlePlan(post({ ...REQUEST, goal: '' }), env, fakeCache(), upstream)).status).toBe(400);
    expect((await handlePlan(post(REQUEST), {}, fakeCache(), upstream)).status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rate limits per visitor', async () => {
    const cache = fakeCache();
    const upstream = answering(ANSWER);
    for (let i = 0; i < HOURLY_LIMIT; i++) {
      expect((await handlePlan(post(REQUEST), env, cache, upstream)).status).toBe(200);
    }
    expect((await handlePlan(post(REQUEST), env, cache, upstream)).status).toBe(429);
  });

  it('turns an answer that is not a plan into an error', async () => {
    expect((await handlePlan(post(REQUEST), env, fakeCache(), answering({ nothing: true }))).status).toBe(502);
  });
});
