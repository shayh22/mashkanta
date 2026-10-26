import type { TrackType } from '../lib/types';

/**
 * Explaining a mortgage mix in plain Hebrew with AI — shared by the browser, which builds the
 * request, and the Worker, which checks it and forwards it to the model.
 *
 * The AI never chooses anything and never computes anything: the mix comes from the engine or from
 * the borrower, every figure from the engine, and the model only puts them into words. The request
 * is figures and fixed codes, nothing typed by the borrower and nothing that identifies them —
 * and the Worker accepts nothing else, so the endpoint cannot be used as a general chatbot.
 */

const TRACKS: readonly TrackType[] = [
  'PRIME',
  'FIXED_UNLINKED',
  'FIXED_LINKED',
  'VARIABLE_UNLINKED',
  'VARIABLE_LINKED',
  'ELIGIBILITY',
];

export const EXPLAIN_CONTEXTS = ['NEW_MORTGAGE', 'REFINANCE'] as const;
/** Who chose the mix being explained. */
export const EXPLAIN_CHOSEN_BY = ['ENGINE', 'BORROWER', 'LIKE_FOR_LIKE', 'BANK_OFFER'] as const;
/** What the mix may be compared with. */
export const EXPLAIN_COMPARISONS = [
  'ENGINE_OPTIMUM',
  'BASKET_FIXED_UNLINKED',
  'BASKET_THIRDS',
  'BASKET_PRIME_FIXED',
  'CURRENT_MORTGAGE',
] as const;
export const EXPLAIN_VERDICTS = ['IMMEDIATE', 'LONG_TERM', 'NOT_WORTHWHILE'] as const;

export interface ExplainTrack {
  readonly track: TrackType;
  /** Share of the loan, 0–1. */
  readonly share: number;
  readonly annualRate: number;
  readonly termMonths: number;
}

export interface ExplainFigures {
  readonly initialPayment: number;
  readonly maxPayment: number;
  readonly totalPaid: number;
}

export interface ExplainRequest {
  readonly context: (typeof EXPLAIN_CONTEXTS)[number];
  readonly chosenBy: (typeof EXPLAIN_CHOSEN_BY)[number];
  readonly loanAmount: number;
  readonly termMonths: number;
  readonly ltv: number;
  /** Payment to income, when the household's income is known. */
  readonly pti?: number;
  /** 1 (very conservative) to 10 (dynamic). */
  readonly riskTolerance?: number;
  readonly market: { readonly prime: number; readonly inflation: number };
  readonly mix: ExplainFigures & { readonly tracks: readonly ExplainTrack[] };
  /** Highest monthly payment in the engine's stress scenarios. */
  readonly worstStressPayment?: number;
  readonly comparisons: readonly (ExplainFigures & { readonly id: (typeof EXPLAIN_COMPARISONS)[number] })[];
  /** Rules of Directive 329 the mix breaks, as the engine's finding codes. */
  readonly ruleBreaches: readonly string[];
  readonly refinance?: {
    readonly verdict: (typeof EXPLAIN_VERDICTS)[number];
    readonly netPresentValue: number;
    /** Months until the saving covers the costs; 0 when it never does. */
    readonly breakevenMonths: number;
    readonly upfrontCosts: number;
  };
}

export interface MixExplanation {
  readonly headline: string;
  readonly reasons: readonly string[];
  readonly risks: readonly string[];
  readonly askTheBank: readonly string[];
}

const strings = (maxItems: number) => ({ type: 'array', items: { type: 'string' }, maxItems });

export const EXPLAIN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'reasons', 'risks', 'askTheBank'],
  properties: {
    headline: { type: 'string', description: 'One sentence: what this mix is and what it optimises for.' },
    reasons: { ...strings(4), description: 'Why the mix is built this way, 2–4 points.' },
    risks: { ...strings(3), description: 'What could make it cost more or hurt, 1–3 points.' },
    askTheBank: { ...strings(3), description: 'Questions worth asking the bank about this mix, 1–3.' },
  },
} as const;

export const EXPLAIN_INSTRUCTIONS = `You explain an Israeli mortgage mix to the borrower, in Hebrew.

You receive JSON with figures already computed by a calculation engine: the mix (track shares, rates, terms), its first and peak monthly payment and total cost, comparisons with other mixes, the stress-test peak payment, regulatory breaches and, for a refinance, the verdict.

Rules:
- Write in plain, warm Hebrew, addressing the borrower in the plural (אתם). No jargon without a short gloss.
- Use only figures that appear in the input. Never compute new numbers, never round them differently, never invent rates, banks or products.
- Explain, do not decide: no "you must" and no recommendation of a bank. When chosenBy is BORROWER, say honestly where the borrower's mix is weaker than ENGINE_OPTIMUM, if it is.
- Track names: PRIME = פריים, FIXED_UNLINKED = קבועה לא צמודה, FIXED_LINKED = קבועה צמודה, VARIABLE_UNLINKED = משתנה לא צמודה, VARIABLE_LINKED = משתנה צמודה, ELIGIBILITY = הלוואת זכאות. Shares are fractions of the loan; rates are annual fractions (0.05 = 5%).
- If ruleBreaches is not empty, the first risk must say that a bank cannot approve the mix as it is.
- Be brief: each item is one sentence of at most 25 words, 2–3 reasons, 1–2 risks, 1–2 questions. Return only the JSON the schema asks for.`;

const MAX_ITEM = 300;

/** The model's answer, trimmed and bounded; null when it is not an explanation at all. */
export function toExplanation(data: unknown): MixExplanation | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const record = data as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, MAX_ITEM) : '');
  const list = (value: unknown, max: number) =>
    (Array.isArray(value) ? value : []).map(text).filter((item) => item.length > 0).slice(0, max);
  const headline = text(record.headline);
  if (!headline) {
    return null;
  }
  return {
    headline,
    reasons: list(record.reasons, 4),
    risks: list(record.risks, 3),
    askTheBank: list(record.askTheBank, 3),
  };
}

const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

function figures(value: unknown): value is ExplainFigures {
  const record = value as Record<string, unknown> | null;
  return (
    !!record &&
    finite(record.initialPayment, 0, 1e6) &&
    finite(record.maxPayment, 0, 1e6) &&
    finite(record.totalPaid, 0, 1e9)
  );
}

/**
 * Accepts exactly the request shape above, rebuilt field by field so nothing unexpected — free
 * text above all — reaches the model. Returns the reason when the request is refused.
 */
export function validateExplainRequest(body: unknown): ExplainRequest | string {
  const record = body as Record<string, unknown> | null;
  if (!record || typeof record !== 'object') {
    return 'not an object';
  }
  if (!oneOf(EXPLAIN_CONTEXTS, record.context) || !oneOf(EXPLAIN_CHOSEN_BY, record.chosenBy)) {
    return 'bad context';
  }
  if (!finite(record.loanAmount, 1_000, 1e8) || !finite(record.termMonths, 1, 480) || !finite(record.ltv, 0, 1.5)) {
    return 'bad loan';
  }
  if (record.pti !== undefined && !finite(record.pti, 0, 5)) {
    return 'bad pti';
  }
  if (record.riskTolerance !== undefined && !finite(record.riskTolerance, 1, 10)) {
    return 'bad risk';
  }
  const market = record.market as Record<string, unknown> | null;
  if (!market || !finite(market.prime, -0.05, 0.5) || !finite(market.inflation, -0.2, 0.5)) {
    return 'bad market';
  }
  const mix = record.mix as Record<string, unknown> | null;
  const tracks = mix?.tracks;
  if (!figures(mix) || !Array.isArray(tracks) || tracks.length === 0 || tracks.length > 12) {
    return 'bad mix';
  }
  const cleanTracks: ExplainTrack[] = [];
  for (const track of tracks as Record<string, unknown>[]) {
    if (
      !track ||
      !oneOf(TRACKS, track.track) ||
      !finite(track.share, 0, 1) ||
      !finite(track.annualRate, -0.05, 0.5) ||
      !finite(track.termMonths, 1, 480)
    ) {
      return 'bad track';
    }
    cleanTracks.push({ track: track.track, share: track.share, annualRate: track.annualRate, termMonths: track.termMonths });
  }
  if (record.worstStressPayment !== undefined && !finite(record.worstStressPayment, 0, 1e6)) {
    return 'bad stress';
  }
  const comparisons = Array.isArray(record.comparisons) ? (record.comparisons as Record<string, unknown>[]) : null;
  if (!comparisons || comparisons.length > EXPLAIN_COMPARISONS.length) {
    return 'bad comparisons';
  }
  const cleanComparisons: ExplainRequest['comparisons'][number][] = [];
  for (const comparison of comparisons) {
    if (!comparison || !oneOf(EXPLAIN_COMPARISONS, comparison.id) || !figures(comparison)) {
      return 'bad comparison';
    }
    cleanComparisons.push({
      id: comparison.id,
      initialPayment: comparison.initialPayment,
      maxPayment: comparison.maxPayment,
      totalPaid: comparison.totalPaid,
    });
  }
  const breaches = Array.isArray(record.ruleBreaches) ? record.ruleBreaches : null;
  if (!breaches || breaches.length > 10 || !breaches.every((code) => typeof code === 'string' && /^[A-Z0-9_]{2,40}$/.test(code))) {
    return 'bad breaches';
  }
  let refinance: ExplainRequest['refinance'];
  if (record.refinance !== undefined) {
    const r = record.refinance as Record<string, unknown> | null;
    if (
      !r ||
      !oneOf(EXPLAIN_VERDICTS, r.verdict) ||
      !finite(r.netPresentValue, -1e8, 1e8) ||
      !finite(r.breakevenMonths, 0, 480) ||
      !finite(r.upfrontCosts, 0, 1e7)
    ) {
      return 'bad refinance';
    }
    refinance = {
      verdict: r.verdict,
      netPresentValue: r.netPresentValue,
      breakevenMonths: r.breakevenMonths,
      upfrontCosts: r.upfrontCosts,
    };
  }

  return {
    context: record.context,
    chosenBy: record.chosenBy,
    loanAmount: record.loanAmount,
    termMonths: record.termMonths,
    ltv: record.ltv,
    ...(record.pti !== undefined ? { pti: record.pti as number } : {}),
    ...(record.riskTolerance !== undefined ? { riskTolerance: record.riskTolerance as number } : {}),
    market: { prime: market.prime, inflation: market.inflation },
    mix: {
      initialPayment: mix.initialPayment,
      maxPayment: mix.maxPayment,
      totalPaid: mix.totalPaid,
      tracks: cleanTracks,
    },
    ...(record.worstStressPayment !== undefined ? { worstStressPayment: record.worstStressPayment as number } : {}),
    comparisons: cleanComparisons,
    ruleBreaches: breaches as string[],
    ...(refinance ? { refinance } : {}),
  };
}
