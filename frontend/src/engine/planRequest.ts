import type { TrackType } from '../lib/types';
import type { TrackAction } from './trackPlan';

/**
 * "Tell us what you want" for the track playground: the borrower writes a goal in their own words,
 * and a model turns it into an action per track — keep, refinance into another track and term, or
 * repay part from savings. Shared by the browser, which builds the request and applies the answer,
 * and the Worker, which checks the request and forwards it.
 *
 * The model chooses actions only. Every figure the borrower then sees — payment, fees, cash, value —
 * is the engine's, computed from those actions; and the answer is bounded to the tracks that exist,
 * the track kinds the market has, and amounts no larger than a balance.
 */

const TRACK_TYPES: readonly TrackType[] = [
  'PRIME',
  'FIXED_UNLINKED',
  'FIXED_LINKED',
  'VARIABLE_UNLINKED',
  'VARIABLE_LINKED',
  'ELIGIBILITY',
];
const NEW_TYPES = TRACK_TYPES.filter((type) => type !== 'ELIGIBILITY');
export const PLAN_ACTIONS = ['KEEP', 'REFINANCE', 'PREPAY'] as const;
export const MAX_GOAL_LENGTH = 400;

export interface PlanTrack {
  /** Position in the mortgage, 0-based: the answer refers to tracks by it. */
  readonly index: number;
  readonly type: TrackType;
  readonly balance: number;
  readonly annualRate: number;
  readonly remainingMonths: number;
  /** Today's average rate for the same kind and term. */
  readonly marketRate: number;
  /** The early repayment fee for refinancing it today. */
  readonly refinanceFee: number;
}

export interface PlanRequest {
  /** The borrower's own words. */
  readonly goal: string;
  readonly tracks: readonly PlanTrack[];
  readonly monthlyPayment: number;
}

export interface PlanAnswer {
  readonly actions: Record<number, TrackAction>;
  readonly summary: string;
  readonly cautions: readonly string[];
}

const nullable = (type: string) => ({ type: [type, 'null'] });

export const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['actions', 'summary', 'cautions'],
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'action', 'newType', 'termYears', 'prepayAmount'],
        properties: {
          index: { type: 'integer' },
          action: { type: 'string', enum: [...PLAN_ACTIONS] },
          newType: { type: ['string', 'null'], enum: [...NEW_TYPES, null] },
          termYears: nullable('integer'),
          prepayAmount: nullable('number'),
        },
      },
    },
    summary: { type: 'string' },
    cautions: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const PLAN_INSTRUCTIONS = `You help an Israeli homeowner change their existing mortgage track by track instead of refinancing all of it.

You receive the borrower's goal in their own words (Hebrew) and their mortgage tracks: index, type, balance (ILS), annual rate, remaining months, today's market rate for the same kind of track, and the early-repayment fee to refinance it today.

Return one action per track:
- KEEP: leave it as it is. Prefer this for a track whose rate is below its market rate — it is cheaper than anything a refinance can buy — and for ELIGIBILITY tracks, which are subsidised.
- REFINANCE: replace it at today's market rate. Give newType (PRIME, FIXED_UNLINKED, FIXED_LINKED, VARIABLE_UNLINKED or VARIABLE_LINKED) and termYears (1–30). Never refinance an ELIGIBILITY track. A refinance only pays when the track's rate is clearly above its market rate and the fee is small against the saving.
- PREPAY: repay part of it from savings. Give prepayAmount in ILS, never more than the balance and never more than the borrower said they have. Prefer the track with the highest rate, and PRIME, which has no capitalization fee.
Unused fields are null.

Follow what the borrower asks for: a lower monthly payment favours a longer term; paying less overall favours a shorter term or prepaying the dearest track; certainty favours fixed unlinked; not touching a track means KEEP for it.

summary: one or two short Hebrew sentences, addressed to the borrower in the plural (אתם), saying what the plan does and why. Do not state figures you were not given — the calculator will show the payment, fees and value.
cautions: up to two short Hebrew sentences on what to check or what could go wrong; empty if none.
If the goal is not about this mortgage, return KEEP for every track and say so in summary. Return only the JSON the schema asks for.`;

const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Accepts exactly the request shape above, rebuilt field by field. Returns the reason when refused. */
export function validatePlanRequest(body: unknown): PlanRequest | string {
  const record = body as Record<string, unknown> | null;
  if (!record || typeof record !== 'object') {
    return 'not an object';
  }
  const goal = typeof record.goal === 'string' ? [...record.goal].map((char) => (char < ' ' || char === '\u007f' ? ' ' : char)).join('').trim() : '';
  if (goal.length < 3 || goal.length > MAX_GOAL_LENGTH) {
    return 'bad goal';
  }
  if (!finite(record.monthlyPayment, 0, 1e6)) {
    return 'bad payment';
  }
  const tracks = Array.isArray(record.tracks) ? (record.tracks as Record<string, unknown>[]) : null;
  if (!tracks || tracks.length === 0 || tracks.length > 12) {
    return 'bad tracks';
  }
  const clean: PlanTrack[] = [];
  for (const [position, track] of tracks.entries()) {
    if (
      !track ||
      track.index !== position ||
      typeof track.type !== 'string' ||
      !(TRACK_TYPES as readonly string[]).includes(track.type) ||
      !finite(track.balance, 0, 1e8) ||
      !finite(track.annualRate, -0.05, 0.5) ||
      !finite(track.remainingMonths, 1, 480) ||
      !finite(track.marketRate, -0.05, 0.5) ||
      !finite(track.refinanceFee, 0, 1e7)
    ) {
      return 'bad track';
    }
    clean.push({
      index: position,
      type: track.type as TrackType,
      balance: track.balance,
      annualRate: track.annualRate,
      remainingMonths: track.remainingMonths,
      marketRate: track.marketRate,
      refinanceFee: track.refinanceFee,
    });
  }
  return { goal, tracks: clean, monthlyPayment: record.monthlyPayment };
}

/**
 * The model's answer as actions the engine can price, held to the request: only tracks that exist,
 * no refinancing of an eligibility loan, terms within the rules, prepayments within the balance.
 * Anything out of bounds becomes KEEP rather than a guess. Null when it is not an answer at all.
 */
export function toPlanAnswer(data: unknown, tracks: readonly PlanTrack[]): PlanAnswer | null {
  const record = data as Record<string, unknown> | null;
  if (!record || typeof record !== 'object' || !Array.isArray(record.actions)) {
    return null;
  }
  const actions: Record<number, TrackAction> = {};
  for (const item of record.actions as Record<string, unknown>[]) {
    const track = typeof item?.index === 'number' ? tracks[item.index] : undefined;
    if (!track || actions[track.index]) {
      continue;
    }
    if (item.action === 'REFINANCE' && track.type !== 'ELIGIBILITY') {
      const type = (NEW_TYPES as readonly unknown[]).includes(item.newType) ? (item.newType as TrackType) : track.type;
      const years = finite(item.termYears, 1, 30) ? Math.round(item.termYears) : Math.round(track.remainingMonths / 12);
      actions[track.index] = { kind: 'REFINANCE', type, termMonths: Math.min(360, Math.max(12, years * 12)) };
    } else if (item.action === 'PREPAY' && finite(item.prepayAmount, 1, Number.MAX_SAFE_INTEGER)) {
      actions[track.index] = { kind: 'PREPAY', amount: Math.min(track.balance, Math.round(item.prepayAmount)) };
    } else {
      actions[track.index] = { kind: 'KEEP' };
    }
  }
  const text = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 300) : '');
  return {
    actions,
    summary: text(record.summary),
    cautions: (Array.isArray(record.cautions) ? record.cautions : []).map(text).filter(Boolean).slice(0, 2),
  };
}
