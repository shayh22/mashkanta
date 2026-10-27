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
  /**
   * The existing track kept as it is — not repaid, so it carries no fee and no route pricing. Used
   * for eligibility loans and for tracks the borrower leaves out of a partial refinance.
   */
  readonly carriedOver?: boolean;
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
    .map((track) =>
      trackFromRate(track.type, track.balance, track.remainingMonths, track.annualRate, scenario),
    );
}

export function proposedSpecs(
  tracks: readonly ProposedTrack[],
  scenario: MacroScenario,
  rateDelta = 0,
): TrackSpec[] {
  return tracks
    .filter((track) => track.amount > 0 && track.termMonths > 0)
    .map((track) =>
      trackFromRate(
        track.type,
        track.amount,
        track.termMonths,
        // A carried-over track keeps its own rate: a competitor's sharper price only applies to
        // what it actually lends.
        Math.max(0, track.annualRate + (track.carriedOver ? 0 : rateDelta)),
        scenario,
      ),
    );
}

/** Today's published average for a track over its remaining term — the fee's discount rate. */
export function marketAverageFor(track: ExistingTrack, ltv: number, prime?: number): number {
  return rateFor(track.type, ltv, track.remainingMonths, prime).medianRate;
}

/** An existing track kept exactly as it is in the replacement mortgage. */
export function carryOver(track: ExistingTrack): ProposedTrack {
  return {
    id: track.id,
    type: track.type,
    amount: track.balance,
    termMonths: track.remainingMonths,
    annualRate: track.annualRate,
    carriedOver: true,
  };
}

/**
 * A like-for-like replacement: the same tracks and terms, re-priced at the market. Keeping the
 * structure fixed isolates the price improvement — a mix change is a separate decision.
 *
 * Eligibility (directed) loans are always carried over unchanged: they are subsidised below market
 * and refinancing them would throw the subsidy away. Tracks in `kept` are carried over too — a
 * partial refinance repays only the tracks worth repaying.
 */
export function likeForLikeProposal(
  tracks: readonly ExistingTrack[],
  ltv: number,
  percentile: number,
  kept: ReadonlySet<string> = new Set(),
  prime?: number,
): ProposedTrack[] {
  return tracks
    .filter((track) => track.balance > 0 && track.remainingMonths > 0)
    .map((track) =>
      track.type === 'ELIGIBILITY' || kept.has(track.id)
        ? carryOver(track)
        : {
            id: track.id,
            type: track.type,
            amount: track.balance,
            termMonths: track.remainingMonths,
            annualRate: atPercentile(rateFor(track.type, ltv, track.remainingMonths, prime), percentile),
          },
    );
}

/** A hand-entered proposal plus the kept and eligibility tracks carried over beside it. */
export function withKeptTracks(
  proposal: readonly ProposedTrack[],
  existing: readonly ExistingTrack[],
  kept: ReadonlySet<string>,
): ProposedTrack[] {
  // Eligibility loans are carried over whatever the hand-entered proposal says, exactly as in the
  // automatic one: a quoted mix that leaves them out would otherwise count them as repaid.
  const carried = existing
    .filter(
      (track) =>
        (kept.has(track.id) || track.type === 'ELIGIBILITY') &&
        track.balance > 0 &&
        track.remainingMonths > 0,
    )
    .map(carryOver);
  const carriedIds = new Set(carried.map((track) => track.id));
  return [...proposal.filter((track) => !carriedIds.has(track.id)), ...carried];
}

function verdictOf(npv: number, breakeven: number): RefinanceVerdict {
  if (npv <= 0 || breakeven === 0) {
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

  // Tracks carried over unchanged are not repaid, so they carry no fee.
  const carried = new Set(proposed.filter((track) => track.carriedOver).map((track) => track.id));
  const repaid = existing.filter((track) => !carried.has(track.id));
  // Refinancing at the same bank: the amount it lends again carries no no-notice fee.
  const repaidBalance = repaid.reduce((sum, track) => sum + track.balance, 0);
  const relent = proposed.filter((track) => !track.carriedOver).reduce((sum, track) => sum + track.amount, 0);
  const relentShare = route.kind === 'INTERNAL' && repaidBalance > 0 ? Math.min(1, relent / repaidBalance) : 0;
  const prepayment = quotePrepayment(
    repaid,
    (track) => marketAverageFor(track, options.ltv, options.scenario.primeAnnual),
    { ...options, relentShare },
  );

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
    verdict: verdictOf(npv, breakeven),
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

/** Whether refinancing one track on its own pays, at the current bank. */
export interface TrackVerdict {
  readonly id: string;
  readonly type: TrackType;
  readonly fee: number;
  readonly monthlySaving: number;
  readonly netPresentValue: number;
  readonly breakevenMonth: number;
  readonly worthwhile: boolean;
}

/**
 * Prices refinancing each track on its own, like for like at the current bank. A track that does
 * not pay on its own — usually a fixed track whose capitalization fee exceeds what re-pricing
 * saves — is a candidate to keep while the rest is refinanced.
 */
export function trackByTrack(
  existing: readonly ExistingTrack[],
  percentile: number,
  options: RefinanceOptions,
): TrackVerdict[] {
  return existing
    .filter((track) => track.type !== 'ELIGIBILITY' && track.balance > 0 && track.remainingMonths > 0)
    .map((track) => {
      const analysis = analyseRoute(
        [track],
        likeForLikeProposal([track], options.ltv, percentile, new Set(), options.scenario.primeAnnual),
        DEFAULT_ROUTES.INTERNAL,
        options,
      );
      return {
        id: track.id,
        type: track.type,
        fee: analysis.prepayment.total,
        monthlySaving: analysis.monthlySaving,
        netPresentValue: analysis.netPresentValue,
        breakevenMonth: analysis.breakevenMonth,
        worthwhile: analysis.netPresentValue > 0,
      };
    });
}

/**
 * A bank's refinance offer, as read from its document, made into a proposal. A track the document
 * gives no term for takes the longest term left on the mortgage being replaced; an eligibility loan
 * already on the mortgage stays as it is, so the offer's copy of it is not counted twice.
 */
export function offerToProposal(
  offer: readonly { track: TrackType; amount: number; annualRate: number; termMonths: number }[],
  existing: readonly ExistingTrack[],
  newId: () => string,
): ProposedTrack[] {
  const longest = Math.max(12, ...existing.map((track) => track.remainingMonths));
  const hasEligibility = existing.some((track) => track.type === 'ELIGIBILITY' && track.balance > 0);
  return offer
    .filter((track) => track.amount > 0 && !(hasEligibility && track.track === 'ELIGIBILITY'))
    .map((track) => ({
      id: newId(),
      type: track.track,
      amount: track.amount,
      annualRate: track.annualRate,
      termMonths: track.termMonths > 0 ? track.termMonths : longest,
    }));
}
