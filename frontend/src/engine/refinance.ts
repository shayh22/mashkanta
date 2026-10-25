import type { TrackType } from '../lib/types';
import { priceMix, paymentAt, type MixResult } from './amortization';
import { atPercentile, rateFor } from './baseline';
import { monthlyRate } from './math';
import {
  quotePrepayment,
  type ExistingTrack,
  type PrepaymentOptions,
  type PrepaymentQuote,
} from './prepayment';
import type { MacroScenario } from './scenario';
import { trackFromRate, type TrackSpec } from './tracks';

/**
 * Decides whether refinancing an existing mortgage pays, and by which route.
 *
 * Ported in spirit from the Java `RefinanceService`, extended with the two routes an Israeli
 * borrower actually has: re-pricing at the current bank (no switching costs, but usually a smaller
 * rate improvement) or moving to a competitor (better price, but appraisal, file opening and
 * re-registering the lien). A route that saves money every month but never recovers its upfront
 * cost inside the remaining term is not a saving, and the breakeven month is what exposes that.
 */

/** A track of the replacement mortgage. */
export interface ProposedTrack {
  readonly id: string;
  readonly type: TrackType;
  readonly amount: number;
  readonly annualRate: number;
  readonly termMonths: number;
}

export interface SwitchingCosts {
  readonly fileOpening: number;
  readonly appraisal: number;
  readonly registration: number;
  readonly legal: number;
}

export type RouteKind = 'INTERNAL' | 'EXTERNAL';

export interface RefinanceRoute {
  readonly kind: RouteKind;
  /** Added to every proposed rate on this route: a competitor bidding for the loan prices sharper. */
  readonly rateDelta: number;
  readonly costs: SwitchingCosts;
}

/** Typical costs, indicative only — the UI lets the borrower overwrite every one. */
export const DEFAULT_ROUTES: Record<RouteKind, RefinanceRoute> = {
  INTERNAL: {
    kind: 'INTERNAL',
    rateDelta: 0,
    costs: { fileOpening: 0, appraisal: 0, registration: 0, legal: 0 },
  },
  EXTERNAL: {
    kind: 'EXTERNAL',
    rateDelta: -0.0015,
    costs: { fileOpening: 360, appraisal: 2_000, registration: 1_200, legal: 0 },
  },
};

export type RefinanceVerdict = 'IMMEDIATE' | 'LONG_TERM' | 'NOT_WORTHWHILE';

export const VERDICT_LABELS: Record<RefinanceVerdict, string> = {
  IMMEDIATE: 'מיחזור משתלם מיידית',
  LONG_TERM: 'משתלם לטווח ארוך',
  NOT_WORTHWHILE: 'לא משתלם כלכלית כרגע',
};

/** A breakeven inside this many months counts as immediately worthwhile. */
export const IMMEDIATE_BREAKEVEN_MONTHS = 12;

export interface SavingPoint {
  readonly month: number;
  readonly cumulativeSaving: number;
  readonly currentPayment: number;
  readonly proposedPayment: number;
}

export interface RouteAnalysis {
  readonly route: RefinanceRoute;
  readonly current: MixResult;
  readonly proposed: MixResult;
  readonly prepayment: PrepaymentQuote;
  readonly switchingCost: number;
  /** Everything paid on the day of the switch: early repayment fees plus switching costs. */
  readonly upfrontCost: number;
  readonly currentPayment: number;
  readonly proposedPayment: number;
  readonly monthlySaving: number;
  /** Lifetime saving net of the upfront cost, undiscounted. */
  readonly lifetimeSaving: number;
  readonly netPresentValue: number;
  /** First month cumulative savings cover the upfront cost; 0 when they never do. */
  readonly breakevenMonth: number;
  readonly verdict: RefinanceVerdict;
  /** Monthly cumulative path, for the breakeven chart. */
  readonly path: readonly SavingPoint[];
}

export interface RefinanceComparison {
  readonly internal: RouteAnalysis;
  readonly external: RouteAnalysis;
  readonly best: RouteKind;
}

export interface RefinanceOptions extends PrepaymentOptions {
  readonly scenario: MacroScenario;
  /** Annual rate both payment streams are discounted at for the NPV. */
  readonly discountRate: number;
  /** Current loan-to-value, which sets the market rate bucket. */
  readonly ltv: number;
}

export function totalCosts(costs: SwitchingCosts): number {
  return costs.fileOpening + costs.appraisal + costs.registration + costs.legal;
}

/** The current mortgage as engine specs: each track runs from today for its remaining term. */
export function existingSpecs(tracks: readonly ExistingTrack[], scenario: MacroScenario): TrackSpec[] {
  return tracks
    .filter((track) => track.balance > 0 && track.remainingMonths > 0)
    .map((track) => trackFromRate(track.type, track.balance, track.remainingMonths, track.annualRate, scenario));
}

export function proposedSpecs(
  tracks: readonly ProposedTrack[],
  scenario: MacroScenario,
  rateDelta = 0,
): TrackSpec[] {
  return tracks
    .filter((track) => track.amount > 0 && track.termMonths > 0)
    .map((track) =>
      trackFromRate(track.type, track.amount, track.termMonths, Math.max(0, track.annualRate + rateDelta), scenario),
    );
}

/** Today's published average for a track over its remaining term — the fee's discount rate. */
export function marketAverageFor(track: ExistingTrack, ltv: number): number {
  return rateFor(track.type, ltv, track.remainingMonths).medianRate;
}

/**
 * A like-for-like replacement: the same tracks and terms, re-priced at the market. Keeping the
 * structure fixed isolates the price improvement — a mix change is a separate decision.
 *
 * Eligibility (directed) loans are carried over unchanged: they are subsidised below market and
 * refinancing them would throw the subsidy away.
 */
export function likeForLikeProposal(
  tracks: readonly ExistingTrack[],
  ltv: number,
  percentile: number,
): ProposedTrack[] {
  return tracks
    .filter((track) => track.balance > 0 && track.remainingMonths > 0)
    .map((track) => ({
      id: track.id,
      type: track.type,
      amount: track.balance,
      termMonths: track.remainingMonths,
      annualRate:
        track.type === 'ELIGIBILITY'
          ? track.annualRate
          : atPercentile(rateFor(track.type, ltv, track.remainingMonths), percentile),
    }));
}

function verdictOf(npv: number, breakeven: number, horizon: number): RefinanceVerdict {
  if (npv <= 0 || breakeven === 0 || breakeven > horizon) {
    return 'NOT_WORTHWHILE';
  }
  return breakeven <= IMMEDIATE_BREAKEVEN_MONTHS ? 'IMMEDIATE' : 'LONG_TERM';
}

/** Analyses one route end to end. */
export function analyseRoute(
  existing: readonly ExistingTrack[],
  proposed: readonly ProposedTrack[],
  route: RefinanceRoute,
  options: RefinanceOptions,
): RouteAnalysis {
  const current = priceMix(existingSpecs(existing, options.scenario), options.scenario);
  const replacement = priceMix(proposedSpecs(proposed, options.scenario, route.rateDelta), options.scenario);

  // Eligibility tracks carried over unchanged are not repaid, so they carry no fee.
  const carried = new Set(
    proposed.filter((track) => track.type === 'ELIGIBILITY').map((track) => track.id),
  );
  const repaid = existing.filter((track) => !(track.type === 'ELIGIBILITY' && carried.has(track.id)));
  const prepayment = quotePrepayment(repaid, (track) => marketAverageFor(track, options.ltv), options);

  const switchingCost = totalCosts(route.costs);
  const upfrontCost = prepayment.total + switchingCost;
  const horizon = Math.max(current.termMonths, replacement.termMonths);
  const factor = 1 / (1 + monthlyRate(options.discountRate));

  const path: SavingPoint[] = [];
  let cumulative = -upfrontCost;
  let breakeven = 0;
  let npv = -upfrontCost;
  let discount = 1;
  for (let month = 1; month <= horizon; month++) {
    const currentPayment = paymentAt(current, month);
    const proposedPayment = paymentAt(replacement, month);
    const saving = currentPayment - proposedPayment;
    cumulative += saving;
    discount *= factor;
    npv += saving * discount;
    if (breakeven === 0 && cumulative >= 0) {
      breakeven = month;
    }
    path.push({ month, cumulativeSaving: cumulative, currentPayment, proposedPayment });
  }

  return {
    route,
    current,
    proposed: replacement,
    prepayment,
    switchingCost,
    upfrontCost,
    currentPayment: current.initialPayment,
    proposedPayment: replacement.initialPayment,
    monthlySaving: current.initialPayment - replacement.initialPayment,
    lifetimeSaving: current.totalPaid - replacement.totalPaid - upfrontCost,
    netPresentValue: npv,
    breakevenMonth: breakeven,
    verdict: verdictOf(npv, breakeven, horizon),
    path,
  };
}

/** Runs both routes on the same proposal and names the better one by NPV. */
export function compareRoutes(
  existing: readonly ExistingTrack[],
  proposed: readonly ProposedTrack[],
  routes: Record<RouteKind, RefinanceRoute>,
  options: RefinanceOptions,
): RefinanceComparison {
  const internal = analyseRoute(existing, proposed, routes.INTERNAL, options);
  const external = analyseRoute(existing, proposed, routes.EXTERNAL, options);
  return {
    internal,
    external,
    best: external.netPresentValue > internal.netPresentValue ? 'EXTERNAL' : 'INTERNAL',
  };
}

/** A one-sentence Hebrew explanation of a route's verdict. */
export function explainVerdict(analysis: RouteAnalysis): string {
  const fee = Math.round(analysis.upfrontCost).toLocaleString('he-IL');
  const npv = Math.round(analysis.netPresentValue).toLocaleString('he-IL');
  switch (analysis.verdict) {
    case 'IMMEDIATE':
      return `עלות מעבר של ${fee} ₪ מוחזרת תוך ${analysis.breakevenMonth} חודשים, וערך נוכחי נקי של ${npv} ₪ לטובת המיחזור.`;
    case 'LONG_TERM':
      return `עלות מעבר של ${fee} ₪ מוחזרת רק בחודש ${analysis.breakevenMonth}; המיחזור משתלם אם תחזיקו את ההלוואה לפחות עד אז.`;
    default:
      return analysis.breakevenMonth === 0
        ? `החיסכון בהחזרים אינו מכסה עלות מעבר של ${fee} ₪ לאורך יתרת התקופה.`
        : `הערך הנוכחי הנקי שלילי (${npv} ₪) — החיסכון העתידי שווה היום פחות מעלות המעבר.`;
  }
}
