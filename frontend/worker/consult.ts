import { CONSULT_INSTRUCTIONS, CONSULT_SCHEMA, toConsultAnswer, validateConsultRequest } from '../src/engine/money/consultRequest';
import { completeJson, json, overLimit, refuse, type OpenRouterEnv } from './openrouter';

/**
 * `/api/consult`: a short answer about the screen of the household journey the borrower is on,
 * from that screen's totals and what they wrote (see `consultRequest.ts`).
 */

const MAX_BODY_BYTES = 12 * 1024;

export async function handleConsult(request: Request, env: OpenRouterEnv, cache: Cache, fetcher: typeof fetch): Promise<Response> {
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
  const parsed = validateConsultRequest(body);
  if (typeof parsed === 'string') {
    return json({ error: parsed }, 400);
  }
  if (await overLimit(request, cache, 'consult')) {
    return json({ error: 'rate limited' }, 429);
  }
  const result = await completeJson(request, env, fetcher, {
    name: 'screenAdvice',
    schema: CONSULT_SCHEMA,
    messages: [
      { role: 'system', content: CONSULT_INSTRUCTIONS },
      { role: 'user', content: JSON.stringify(parsed) },
    ],
    // Hebrew costs several tokens a word; a cut-off answer is unreadable JSON.
    maxTokens: 3000,
    temperature: 0.2,
  });
  if (result instanceof Response) {
    return result;
  }
  return toConsultAnswer(result.data) ? json({ model: result.model, answer: result.data }, 200) : json({ error: 'unreadable answer' }, 502);
}
