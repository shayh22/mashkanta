import { useQuery } from '@tanstack/react-query';
import type { AiDocumentKind } from '../engine/aiExtraction';
import { toExplanation, type ExplainRequest, type MixExplanation } from '../engine/mixExplanation';
import { toAdvice, type Advice, type AdviceRequest } from '../engine/money/adviceRequest';
import { toCategories, type AiCategory } from '../engine/money/categorizeRequest';
import { toConsultAnswer, type ConsultAnswer, type ConsultRequest } from '../engine/money/consultRequest';
import { toPlanAnswer, type PlanAnswer, type PlanRequest } from '../engine/planRequest';

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

/** Asks for a plain-Hebrew explanation of a mix the engine has already priced. */
export async function explainMix(request: ExplainRequest): Promise<MixExplanation> {
  const response = await fetch('/api/explain', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? 'הגעתם למכסת ההסברים לשעה. נסו שוב מאוחר יותר.'
        : response.status === 503
          ? 'הסבר עם AI אינו מופעל כרגע.'
          : `ההסבר לא התקבל (${response.status}). נסו שוב.`,
    );
  }
  const explanation = toExplanation(((await response.json()) as { explanation?: unknown }).explanation);
  if (!explanation) {
    throw new Error('ההסבר שהתקבל לא תקין. נסו שוב.');
  }
  return explanation;
}

/** Asks for a track-by-track plan for the borrower's goal; the engine prices whatever comes back. */
export async function proposePlan(request: PlanRequest): Promise<PlanAnswer> {
  const response = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? 'הגעתם למכסת הבקשות לשעה. נסו שוב מאוחר יותר.'
        : response.status === 503
          ? 'AI אינו מופעל כרגע.'
          : `לא התקבלה הצעה (${response.status}). נסו שוב.`,
    );
  }
  const answer = toPlanAnswer(((await response.json()) as { plan?: unknown }).plan, request.tracks);
  if (!answer) {
    throw new Error('ההצעה שהתקבלה לא תקינה. נסו שוב.');
  }
  return answer;
}

/** A category for each business name the rules did not know; names only are sent. */
export async function categorizePayees(payees: readonly string[]): Promise<Record<string, AiCategory>> {
  const response = await fetch('/api/categorize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payees }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? 'הגעתם למכסת הבקשות לשעה. נסו שוב מאוחר יותר.'
        : response.status === 503
          ? 'AI אינו מופעל כרגע.'
          : `המיון לא הצליח (${response.status}). נסו שוב.`,
    );
  }
  const categories = toCategories(((await response.json()) as { categories?: unknown }).categories, payees);
  if (!categories) {
    throw new Error('התשובה שהתקבלה לא תקינה. נסו שוב.');
  }
  return categories;
}

/** A few steps toward the household's goal, from its monthly totals; the app prices the targets. */
export async function adviseHousehold(request: AdviceRequest): Promise<Advice> {
  const response = await fetch('/api/advise', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? 'הגעתם למכסת הבקשות לשעה. נסו שוב מאוחר יותר.'
        : response.status === 503
          ? 'AI אינו מופעל כרגע.'
          : `לא התקבלה תוכנית (${response.status}). נסו שוב.`,
    );
  }
  const advice = toAdvice(((await response.json()) as { advice?: unknown }).advice, request);
  if (!advice) {
    throw new Error('התוכנית שהתקבלה לא תקינה. נסו שוב.');
  }
  return advice;
}

/** A short answer about one screen of the household journey, from its totals and the household's words. */
export async function consultStep(request: ConsultRequest): Promise<ConsultAnswer> {
  const response = await fetch('/api/consult', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? 'הגעתם למכסת הבקשות לשעה. נסו שוב מאוחר יותר.'
        : response.status === 503
          ? 'AI אינו מופעל כרגע.'
          : `לא התקבלה תשובה (${response.status}). נסו שוב.`,
    );
  }
  const answer = toConsultAnswer(((await response.json()) as { answer?: unknown }).answer);
  if (!answer) {
    throw new Error('התשובה שהתקבלה לא תקינה. נסו שוב.');
  }
  return answer;
}
