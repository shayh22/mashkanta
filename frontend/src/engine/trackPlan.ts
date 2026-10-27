import type { TrackType } from '../lib/types';
import { paymentAt, priceMix, type MixResult } from './amortization';
import { atPercentile, rateFor } from './baseline';
import { monthlyRate } from './math';
import { PREPAYMENT, quotePrepayment, type ExistingTrack, type PrepaymentQuote } from './prepayment';
import {
  existingSpecs,
  marketAverageFor,
  totalCosts,
  type ProposedTrack,
  type RefinanceOptions,
  type RefinanceRoute,
  type RefinanceVerdict,
} from './refinance';
import { trackFromRate, type TrackSpec } from './tracks';

/**
 * Working the mortgage track by track instead of refinancing all of it: keep a track, refinance it
 * into another track or term at the market's price, or repay part of it from savings. A cheap track
 * — one below today's market — is usually worth keeping as it is; this prices any such plan the way
 * a full refinance is priced, with the fees the Banking Order allows and the cash it takes.
 */

export type TrackAction =
  | { readonly kind: 'KEEP' }
  | { readonly kind: 'REFINANCE'; readonly type: TrackType; readonly termMonths: number }
  | { readonly kind: 'PREPAY'; readonly amount: number };

export interface TrackPlanOptions extends RefinanceOptions {
  /** Where in the market distribution new tracks are priced; 0.5 is the published average. */
  readonly percentile: number;
  /** The current bank's route: its switching costs apply once anything is refinanced. */
  readonly route: RefinanceRoute;
}

export interface TrackPlanResult {
  readonly current: MixResult;
  readonly proposed: MixResult;
  /** The mortgage after the plan, track by track. */
  readonly proposal: readonly ProposedTrack[];
  readonly fees: PrepaymentQuote;
  readonly switchingCost: number;
  /** Savings put into the mortgage. */
  readonly cash: number;
  /** Everything paid on the day: fees, switching costs and the cash repaid. */
  readonly upfront: number;
  readonly currentPayment: number;
  readonly proposedPayment: number;
  readonly monthlySaving: number;
  readonly netPresentValue: number;
  /** First month the accumulated saving covers the upfront payment; 0 when it never does. */
  readonly breakevenMonth: number;
  readonly verdict: RefinanceVerdict;
  /** True when the plan changes nothing. */
  readonly unchanged: boolean;
}

/** The action a track takes when the plan says nothing about it. */
export const KEEP: TrackAction = { kind: 'KEEP' };

/** Terms a new track can take; whatever the engine prices is what the borrower is shown. */
export function clampTerm(months: number): number {
  return Math.round(Math.min(360, Math.max(12, months)));
}

/** The rate a track refinanced today gets: the market at the borrower's percentile, with the bank's own discount. */
export function refinanceRate(type: TrackType, termMonths: number, options: TrackPlanOptions): number {
  const market = atPercentile(rateFor(type, options.ltv, clampTerm(termMonths), options.scenario.primeAnnual), options.percentile);
  return Math.max(0, market + options.route.rateDelta);
}

/**
 * A track cheaper than refinancing it into the same kind and term would be: nothing a refinance buys
 * beats it. Priced exactly as a refinance in the plan is, so the mark and the advice cannot disagree.
 */
export function isGoodRate(track: ExistingTrack, options: TrackPlanOptions): boolean {
  return track.type !== 'ELIGIBILITY' && track.annualRate < refinanceRate(track.type, track.remainingMonths, options) - 0.001;
}

/** The part of a track repaid early, as a track of its own, so the fee is priced on that part only. */
function portionOf(track: ExistingTrack, amount: number): ExistingTrack {
  const share = track.balance > 0 ? amount / track.balance : 0;
  return {
    ...track,
    id: `${track.id}:prepaid`,
    balance: amount,
    ...(track.statedFee !== undefined ? { statedFee: track.statedFee * share } : {}),
  };
}

function mergeQuotes(a: PrepaymentQuote, b: PrepaymentQuote): PrepaymentQuote {
  const tracks = [...a.tracks, ...b.tracks];
  // One operational fee per early repayment, however many tracks it covers.
  const operationalFee = tracks.length > 0 ? PREPAYMENT.OPERATIONAL_FEE : 0;
  const feesOnly = (quote: PrepaymentQuote) => quote.total - quote.operationalFee;
  return {
    tracks,
    operationalFee,
    capitalizationFee: a.capitalizationFee + b.capitalizationFee,
    noticeFee: a.noticeFee + b.noticeFee,
    cpiFee: a.cpiFee + b.cpiFee,
    total: operationalFee + feesOnly(a) + feesOnly(b),
  };
}

export function analyseTrackPlan(
  existing: readonly ExistingTrack[],
  actions: Readonly<Record<string, TrackAction>>,
  options: TrackPlanOptions,
): TrackPlanResult {
  const live = existing.filter((track) => track.balance > 0 && track.remainingMonths > 0);
  const { scenario } = options;
  const marketRate = (track: ExistingTrack) => marketAverageFor(track, options.ltv, scenario.primeAnnual);

  const proposal: ProposedTrack[] = [];
  const specs: TrackSpec[] = [];
  const refinanced: ExistingTrack[] = [];
  const prepaid: ExistingTrack[] = [];
  let cash = 0;

  for (const track of live) {
    const action = actions[track.id] ?? KEEP;
    // A directed (eligibility) loan is subsidised: it can be repaid, never refinanced into the market.
    const kind = track.type === 'ELIGIBILITY' && action.kind === 'REFINANCE' ? 'KEEP' : action.kind;

    if (kind === 'REFINANCE' && action.kind === 'REFINANCE') {
      const termMonths = clampTerm(action.termMonths);
      const annualRate = refinanceRate(action.type, termMonths, options);
      proposal.push({ id: `${track.id}:new`, type: action.type, amount: track.balance, annualRate, termMonths });
      specs.push(trackFromRate(action.type, track.balance, termMonths, annualRate, scenario));
      refinanced.push(track);
      continue;
    }

    const amount = kind === 'PREPAY' && action.kind === 'PREPAY' ? Math.min(track.balance, Math.max(0, action.amount)) : 0;
    const left = track.balance - amount;
    if (amount > 0) {
      cash += amount;
      prepaid.push(portionOf(track, amount));
    }
    if (left > 0.5) {
      // What stays keeps its rate and its end date; the payment falls with the balance.
      proposal.push({
        id: track.id,
        type: track.type,
        amount: left,
        annualRate: track.annualRate,
        termMonths: track.remainingMonths,
        carriedOver: true,
      });
      specs.push(trackFromRate(track.type, left, track.remainingMonths, track.annualRate, scenario));
    }
  }

  // The same bank lends again what it refinances, so that part carries no no-notice fee; money
  // repaid from savings does.
  const fees = mergeQuotes(
    quotePrepayment(refinanced, marketRate, { ...options, relentShare: 1 }),
    quotePrepayment(prepaid, marketRate, { ...options, relentShare: 0 }),
  );
  const switchingCost = refinanced.length > 0 ? totalCosts(options.route.costs) : 0;
  const upfront = fees.total + switchingCost + cash;

  const current = priceMix(existingSpecs(live, scenario), scenario);
  const proposed = priceMix(specs, scenario);
  const horizon = Math.max(current.termMonths, proposed.termMonths);
  const factor = 1 / (1 + monthlyRate(options.discountRate));
  let cumulative = -upfront;
  let npv = -upfront;
  let discount = 1;
  let breakevenMonth = 0;
  for (let month = 1; month <= horizon; month++) {
    const saving = paymentAt(current, month) - paymentAt(proposed, month);
    cumulative += saving;
    discount *= factor;
    npv += saving * discount;
    if (breakevenMonth === 0 && cumulative >= 0) {
      breakevenMonth = month;
    }
  }

  const unchanged = refinanced.length === 0 && cash === 0;
  const verdict: RefinanceVerdict =
    unchanged || npv <= 0 || breakevenMonth === 0 ? 'NOT_WORTHWHILE' : breakevenMonth <= 12 ? 'IMMEDIATE' : 'LONG_TERM';

  return {
    current,
    proposed,
    proposal,
    fees,
    switchingCost,
    cash,
    upfront,
    currentPayment: current.initialPayment,
    proposedPayment: proposed.initialPayment,
    monthlySaving: current.initialPayment - proposed.initialPayment,
    netPresentValue: unchanged ? 0 : npv,
    breakevenMonth: unchanged ? 0 : breakevenMonth,
    verdict,
    unchanged,
  };
}
