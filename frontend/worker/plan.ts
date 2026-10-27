import { PLAN_INSTRUCTIONS, PLAN_SCHEMA, toPlanAnswer, validatePlanRequest } from '../src/engine/planRequest';
import { completeJson, json, overLimit, refuse, type OpenRouterEnv } from './openrouter';

/**
 * `/api/plan`: turns a homeowner's goal, in their own words, into an action per mortgage track
 * (see `planRequest.ts`). The answer is a strict schema of actions; the browser bounds it to the
 * mortgage and the engine prices it, so the model's reply is never shown as a figure.
 */

const MAX_BODY_BYTES = 16 * 1024;

export async function handlePlan(request: Request, env: OpenRouterEnv, cache: Cache, fetcher: typeof fetch): Promise<Response> {
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
  const parsed = validatePlanRequest(body);
  if (typeof parsed === 'string') {
    return json({ error: parsed }, 400);
  }
  if (await overLimit(request, cache, 'plan')) {
    return json({ error: 'rate limited' }, 429);
  }
  const result = await completeJson(request, env, fetcher, {
    name: 'trackPlan',
    schema: PLAN_SCHEMA,
    messages: [
      { role: 'system', content: PLAN_INSTRUCTIONS },
      { role: 'user', content: JSON.stringify(parsed) },
    ],
    // Hebrew costs several tokens a word; a cut-off answer is unreadable JSON.
    maxTokens: 4000,
    temperature: 0.2,
  });
  if (result instanceof Response) {
    return result;
  }
  // The browser holds the answer to the tracks before using it; here it only has to be a plan.
  return toPlanAnswer(result.data, parsed.tracks)
    ? json({ model: result.model, plan: result.data }, 200)
    : json({ error: 'unreadable answer' }, 502);
}
