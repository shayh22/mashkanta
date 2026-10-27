import { ADVICE_INSTRUCTIONS, ADVICE_SCHEMA, toAdvice, validateAdviceRequest } from '../src/engine/money/adviceRequest';
import { completeJson, json, overLimit, refuse, type OpenRouterEnv } from './openrouter';

/**
 * `/api/advise`: a few steps toward the household's goal, from its monthly totals (see
 * `adviceRequest.ts`). Only totals come in — no business names, dates or accounts.
 */

const MAX_BODY_BYTES = 16 * 1024;

export async function handleAdvise(request: Request, env: OpenRouterEnv, cache: Cache, fetcher: typeof fetch): Promise<Response> {
  const refusal = refuse(request, env, MAX_BODY_BYTES);
  if (refusal) {
    return refusal;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const parsed = validateAdviceRequest(body);
  if (typeof parsed === 'string') {
    return json({ error: parsed }, 400);
  }
  if (await overLimit(request, cache, 'advise')) {
    return json({ error: 'rate limited' }, 429);
  }
  const result = await completeJson(request, env, fetcher, {
    name: 'householdAdvice',
    schema: ADVICE_SCHEMA,
    messages: [
      { role: 'system', content: ADVICE_INSTRUCTIONS },
      { role: 'user', content: JSON.stringify(parsed) },
    ],
    // Hebrew costs several tokens a word; a cut-off answer is unreadable JSON.
    maxTokens: 4000,
    temperature: 0.2,
  });
  if (result instanceof Response) {
    return result;
  }
  // The browser holds the answer to the request before using it; here it only has to be advice.
  return toAdvice(result.data, parsed) ? json({ model: result.model, advice: result.data }, 200) : json({ error: 'unreadable answer' }, 502);
}
