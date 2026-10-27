import { PLAN_INSTRUCTIONS, PLAN_SCHEMA, toPlanAnswer, validatePlanRequest, type PlanAnswer } from '../src/engine/planRequest';
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
  const plan = toPlanAnswer(result.data, parsed.tracks);
  return plan ? json({ model: result.model, plan: { ...plan, actions: toActionList(plan) } }, 200) : json({ error: 'unreadable answer' }, 502);
}

/** Back to the schema's list shape, so the browser reads the same answer whichever side clamped it. */
function toActionList(plan: PlanAnswer) {
  return Object.entries(plan.actions).map(([index, action]) => ({
    index: Number(index),
    action: action.kind,
    newType: action.kind === 'REFINANCE' ? action.type : null,
    termYears: action.kind === 'REFINANCE' ? action.termMonths / 12 : null,
    prepayAmount: action.kind === 'PREPAY' ? action.amount : null,
  }));
}
