import { CATEGORIZE_INSTRUCTIONS, CATEGORIZE_SCHEMA, toCategories, validateCategorizeRequest } from '../src/engine/money/categorizeRequest';
import { completeJson, json, overLimit, refuse, type OpenRouterEnv } from './openrouter';

/**
 * `/api/categorize`: a category for each business name the rules did not know (see
 * `categorizeRequest.ts`). Only names come in — no amounts, dates or accounts.
 */

const MAX_BODY_BYTES = 24 * 1024;

export async function handleCategorize(request: Request, env: OpenRouterEnv, cache: Cache, fetcher: typeof fetch): Promise<Response> {
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
  const parsed = validateCategorizeRequest(body);
  if (typeof parsed === 'string') {
    return json({ error: parsed }, 400);
  }
  if (await overLimit(request, cache, 'categorize')) {
    return json({ error: 'rate limited' }, 429);
  }
  const result = await completeJson(request, env, fetcher, {
    name: 'payeeCategories',
    schema: CATEGORIZE_SCHEMA,
    messages: [
      { role: 'system', content: CATEGORIZE_INSTRUCTIONS },
      { role: 'user', content: JSON.stringify(parsed.payees.map((name, index) => ({ index, name }))) },
    ],
    maxTokens: 4000,
    temperature: 0,
  });
  if (result instanceof Response) {
    return result;
  }
  // The browser holds the answer to the names before using it; here it only has to be an answer.
  return toCategories(result.data, parsed.payees)
    ? json({ model: result.model, categories: result.data }, 200)
    : json({ error: 'unreadable answer' }, 502);
}
