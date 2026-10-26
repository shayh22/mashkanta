import { AI_INSTRUCTIONS, AI_SCHEMAS, validateAiRequest, type AiRequest } from '../src/engine/aiExtraction';
import { completeJson, json, overLimit, refuse, type OpenRouterEnv } from './openrouter';

export { DEFAULT_MODEL, HOURLY_LIMIT } from './openrouter';
export type ExtractEnv = OpenRouterEnv;

/**
 * `/api/extract`: reads a document the local parsers did not recognise, through OpenRouter.
 *
 * The endpoint only answers same-origin requests, caps each visitor's requests per hour, bounds the
 * payload, and keeps nothing: the document is forwarded, the structured answer returned, and
 * neither is logged.
 */

const MAX_BODY_BYTES = 20 * 1024 * 1024;

function messages(request: AiRequest) {
  const content: unknown[] = [];
  if (request.text) {
    content.push({ type: 'text', text: `Document text:\n\n${request.text}` });
  }
  for (const image of request.images ?? []) {
    content.push({ type: 'image_url', image_url: { url: image } });
  }
  return [
    { role: 'system', content: AI_INSTRUCTIONS[request.kind] },
    { role: 'user', content },
  ];
}

export async function handleExtract(request: Request, env: ExtractEnv, cache: Cache, fetcher: typeof fetch): Promise<Response> {
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
  const parsed = validateAiRequest(body);
  if (typeof parsed === 'string') {
    return json({ error: parsed }, 400);
  }
  if (await overLimit(request, cache, 'extract')) {
    return json({ error: 'rate limited' }, 429);
  }
  const result = await completeJson(request, env, fetcher, {
    name: parsed.kind,
    schema: AI_SCHEMAS[parsed.kind],
    messages: messages(parsed),
    maxTokens: 4000,
    temperature: 0,
  });
  return result instanceof Response ? result : json({ kind: parsed.kind, ...result }, 200);
}
