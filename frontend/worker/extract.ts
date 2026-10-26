import { AI_INSTRUCTIONS, AI_SCHEMAS, validateAiRequest, type AiRequest } from '../src/engine/aiExtraction';

/**
 * `/api/extract`: reads a document the local parsers did not recognise, through OpenRouter.
 *
 * The OpenRouter key is a Worker secret and never reaches the browser. The endpoint only answers
 * same-origin requests, caps each visitor's requests per hour, bounds the payload, and keeps
 * nothing: the document is forwarded, the structured answer returned, and neither is logged.
 */

export interface ExtractEnv {
  /** Set with `wrangler secret put OPENROUTER_API_KEY` or in the dashboard; absent = feature off. */
  readonly OPENROUTER_API_KEY?: string;
  /** Any OpenRouter model that reads images and supports structured outputs. */
  readonly OPENROUTER_MODEL?: string;
}

/**
 * Chosen by benchmark (26.10.2026, five synthetic Hebrew documents: consumer loans as text and as a
 * screenshot, a mortgage statement as text and as a scan, an offer letter — 71 fields): the only
 * model of the ten cheapest with images and structured outputs to read every field right, twice in
 * a row. Cheaper models misread scans (gemma-3-4b 79%, gpt-4.1-nano 89%, gemini-2.5-flash-lite 90%,
 * gemma-3-12b 92%, nex-n2.5-mini 94–97%). About $0.0006 a document.
 */
export const DEFAULT_MODEL = 'anthropic/claude-haiku-5.5';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
/** Requests per visitor (IP) per hour. A document is one request; this is a guard against abuse. */
export const HOURLY_LIMIT = 20;
const MAX_BODY_BYTES = 20 * 1024 * 1024;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });

/**
 * A per-IP hourly counter in the edge cache. Not atomic and per data centre — enough to stop a
 * script from running up the bill, which is all it is for; set a credit limit on the key as well.
 */
async function overLimit(request: Request, cache: Cache): Promise<boolean> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const hour = Math.floor(Date.now() / 3_600_000);
  const key = new Request(`https://rate-limit.invalid/extract/${encodeURIComponent(ip)}/${hour}`);
  const count = Number((await (await cache.match(key))?.text()) ?? 0);
  if (count >= HOURLY_LIMIT) {
    return true;
  }
  await cache.put(key, new Response(String(count + 1), { headers: { 'cache-control': 'max-age=3600' } }));
  return false;
}

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
  const configured = Boolean(env.OPENROUTER_API_KEY);
  if (request.method === 'GET') {
    return json({ enabled: configured }, 200);
  }
  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }
  if (!configured) {
    return json({ error: 'not configured' }, 503);
  }
  // Same-origin only: a browser on another site cannot spend this key.
  const origin = request.headers.get('origin');
  if (!origin || new URL(origin).host !== new URL(request.url).host) {
    return json({ error: 'forbidden' }, 403);
  }
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return json({ error: 'too large' }, 413);
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
  if (await overLimit(request, cache)) {
    return json({ error: 'rate limited' }, 429);
  }

  const model = env.OPENROUTER_MODEL || DEFAULT_MODEL;
  let upstream: Response;
  try {
    upstream = await fetcher(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'content-type': 'application/json',
        'http-referer': new URL(request.url).origin,
        'x-title': 'mashkanta',
      },
      body: JSON.stringify({
        model,
        messages: messages(parsed),
        temperature: 0,
        max_tokens: 4000,
        response_format: {
          type: 'json_schema',
          json_schema: { name: parsed.kind, strict: true, schema: AI_SCHEMAS[parsed.kind] },
        },
        // Do not let OpenRouter route to providers that train on or retain prompts.
        provider: { data_collection: 'deny' },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return json({ error: 'upstream unavailable' }, 502);
  }
  if (!upstream.ok) {
    return json({ error: `upstream ${upstream.status}` }, 502);
  }
  const answer = (await upstream.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = answer.choices?.[0]?.message?.content;
  try {
    const data = typeof content === 'string' ? JSON.parse(content) : content;
    return json({ kind: parsed.kind, model, data }, 200);
  } catch {
    return json({ error: 'unreadable answer' }, 502);
  }
}
