import { EXPLAIN_INSTRUCTIONS, EXPLAIN_SCHEMA, toExplanation, validateExplainRequest } from '../src/engine/mixExplanation';
import { completeJson, json, overLimit, refuse, type OpenRouterEnv } from './openrouter';

/**
 * `/api/explain`: puts a mortgage mix the engine already priced into plain Hebrew. The request is
 * figures and fixed codes only (see `mixExplanation.ts`), so the endpoint cannot be steered into
 * answering anything else.
 */

const MAX_BODY_BYTES = 16 * 1024;

export async function handleExplain(request: Request, env: OpenRouterEnv, cache: Cache, fetcher: typeof fetch): Promise<Response> {
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
  const parsed = validateExplainRequest(body);
  if (typeof parsed === 'string') {
    return json({ error: parsed }, 400);
  }
  if (await overLimit(request, cache, 'explain')) {
    return json({ error: 'rate limited' }, 429);
  }
  const result = await completeJson(request, env, fetcher, {
    name: 'mixExplanation',
    schema: EXPLAIN_SCHEMA,
    messages: [
      { role: 'system', content: EXPLAIN_INSTRUCTIONS },
      { role: 'user', content: JSON.stringify(parsed) },
    ],
    // Hebrew costs several tokens a word; a cut-off answer is unreadable JSON.
    maxTokens: 4000,
    temperature: 0.2,
  });
  if (result instanceof Response) {
    return result;
  }
  const explanation = toExplanation(result.data);
  return explanation ? json({ model: result.model, explanation }, 200) : json({ error: 'unreadable answer' }, 502);
}
