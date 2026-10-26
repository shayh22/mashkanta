/**
 * What the two AI endpoints share: the OpenRouter call, the same-origin and rate-limit guards, and
 * the JSON response. The key is a Worker secret and never reaches the browser; nothing is logged.
 */

export interface OpenRouterEnv {
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
/** Requests per visitor (IP) per hour, per endpoint. A guard against abuse, not a quota. */
export const HOURLY_LIMIT = 20;

export const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });

/**
 * The checks every AI request passes before its body is read: configured, POST, same origin (a
 * browser on another site cannot spend this key) and within `maxBytes`. A GET reports whether the
 * feature is on. Returns the refusal, or null to go ahead.
 */
export function refuse(request: Request, env: OpenRouterEnv, maxBytes: number): Response | null {
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
  const origin = request.headers.get('origin');
  if (!origin || new URL(origin).host !== new URL(request.url).host) {
    return json({ error: 'forbidden' }, 403);
  }
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) {
    return json({ error: 'too large' }, 413);
  }
  return null;
}

/**
 * A per-IP hourly counter in the edge cache. Not atomic and per data centre — enough to stop a
 * script from running up the bill, which is all it is for; set a credit limit on the key as well.
 */
export async function overLimit(request: Request, cache: Cache, bucket: string): Promise<boolean> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const hour = Math.floor(Date.now() / 3_600_000);
  const key = new Request(`https://rate-limit.invalid/${bucket}/${encodeURIComponent(ip)}/${hour}`);
  const count = Number((await (await cache.match(key))?.text()) ?? 0);
  if (count >= HOURLY_LIMIT) {
    return true;
  }
  await cache.put(key, new Response(String(count + 1), { headers: { 'cache-control': 'max-age=3600' } }));
  return false;
}

/** Asks the model for JSON in `schema`; the parsed answer, or an error response. */
export async function completeJson(
  request: Request,
  env: OpenRouterEnv,
  fetcher: typeof fetch,
  call: { name: string; schema: unknown; messages: unknown[]; maxTokens: number; temperature: number },
): Promise<{ model: string; data: unknown } | Response> {
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
        messages: call.messages,
        temperature: call.temperature,
        max_tokens: call.maxTokens,
        response_format: { type: 'json_schema', json_schema: { name: call.name, strict: true, schema: call.schema } },
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
    return { model, data: typeof content === 'string' ? JSON.parse(content) : content };
  } catch {
    return json({ error: 'unreadable answer' }, 502);
  }
}
