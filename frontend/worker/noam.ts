import { NOAM_INSTRUCTIONS, NOAM_SCHEMA, toNoamAnswer, validateNoamRequest } from '../src/engine/flow/noamRequest';
import { completeJson, json, overLimit, refuse, type OpenRouterEnv } from './openrouter';

/**
 * `/api/noam`: the questionnaire's guide answers a message on one screen — an explanation, a
 * recommendation, or the answers it read from the message (see `noamRequest.ts`).
 */

const MAX_BODY_BYTES = 16 * 1024;

export async function handleNoam(request: Request, env: OpenRouterEnv, cache: Cache, fetcher: typeof fetch): Promise<Response> {
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
  const parsed = validateNoamRequest(body);
  if (typeof parsed === 'string') {
    return json({ error: parsed }, 400);
  }
  if (await overLimit(request, cache, 'noam')) {
    return json({ error: 'rate limited' }, 429);
  }
  const result = await completeJson(request, env, fetcher, {
    name: 'noamReply',
    schema: NOAM_SCHEMA,
    messages: [
      { role: 'system', content: NOAM_INSTRUCTIONS },
      { role: 'user', content: JSON.stringify(parsed) },
    ],
    // Hebrew costs several tokens a word; a cut-off answer is unreadable JSON.
    maxTokens: 2000,
    temperature: 0.2,
  });
  if (result instanceof Response) {
    return result;
  }
  const answer = toNoamAnswer(result.data);
  return answer ? json({ model: result.model, answer }, 200) : json({ error: 'unreadable answer' }, 502);
}
