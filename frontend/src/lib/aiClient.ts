import { useQuery } from '@tanstack/react-query';
import type { AiDocumentKind } from '../engine/aiExtraction';

/** Served by the Worker in production and by a Vite middleware in development. */
const ENDPOINT = '/api/extract';

/** Whether document reading with AI is switched on (an OpenRouter key is configured). */
export function useAiEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['ai-enabled'],
    queryFn: async () => {
      const response = await fetch(ENDPOINT, { cache: 'no-store' });
      return response.ok ? ((await response.json()) as { enabled: boolean }).enabled : false;
    },
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  return data === true;
}

const ERRORS: Record<number, string> = {
  400: 'המסמך לא נשלח: הפורמט או הגודל אינם נתמכים.',
  403: 'הבקשה נדחתה.',
  413: 'המסמך גדול מדי לקריאה.',
  429: 'הגעתם למכסת הקריאות לשעה. נסו שוב מאוחר יותר.',
  502: 'שירות ה-AI לא החזיר תשובה תקינה. נסו שוב.',
  503: 'קריאת מסמכים עם AI אינה מופעלת כרגע.',
};

/** Sends a prepared document to the extraction endpoint and returns the model's structured answer. */
export async function extractWithAi(
  kind: AiDocumentKind,
  payload: { text?: string; images?: readonly string[] },
): Promise<unknown> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, ...payload }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    throw new Error(ERRORS[response.status] ?? `קריאת המסמך נכשלה (${response.status}).`);
  }
  return ((await response.json()) as { data: unknown }).data;
}
