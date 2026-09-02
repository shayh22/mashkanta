import type { TrackType } from '../lib/types';
import { priceMix } from './amortization';
import { atPercentile, percentileOf, rateFor } from './baseline';
import type { MacroScenario } from './scenario';
import { initialRate, TRACKS, trackFromRate, type TrackSpec } from './tracks';

/** The percentile that counts as "best in market" — the top decile of observed deals. */
const BEST_IN_MARKET_PERCENTILE = 0.1;

export interface TrackOpportunity {
  readonly track: TrackType;
  readonly hebrewName: string;
  readonly amount: number;
  readonly offeredRate: number;
  readonly medianRate: number;
  readonly bestRate: number;
  /** Where the quote sits, 0 being best in market. */
  readonly percentile: number;
  /** Offered less median; positive means worse than average. */
  readonly gapToMedian: number;
}

export interface OpportunityReport {
  /** 0..100, higher is better. */
  readonly score: number;
  readonly grade: string;
  readonly marketPercentile: number;
  readonly offeredWeightedRate: number;
  readonly bestWeightedRate: number;
  readonly totalPaidAsOffered: number;
  readonly totalPaidAtBest: number;
  /** The difference — the prize for negotiating. */
  readonly potentialSaving: number;
  readonly monthlySaving: number;
  readonly tracks: readonly TrackOpportunity[];
  readonly narrative: string;
}

/**
 * Answers the question the whole platform exists for: is this offer any good, and what is the gap
 * to a well-negotiated one worth in shekels?
 *
 * The gap is priced, not asserted: the borrower's own mix is re-run at best-in-market rates and the
 * lifetime difference is the number reported.
 */
export function scoreOffer(
  offered: readonly TrackSpec[],
  ltv: number,
  scenario: MacroScenario,
): OpportunityReport {
  const asOffered = priceMix(offered, scenario);

  const perTrack: TrackOpportunity[] = [];
  const improved: TrackSpec[] = [];
  let weightedPercentile = 0;

  for (const spec of offered) {
    if (spec.amount <= 0) {
      continue;
    }
    const market = rateFor(spec.type, ltv, spec.termMonths);
    const offeredRate = initialRate(spec, scenario);
    const bestRate = atPercentile(market, BEST_IN_MARKET_PERCENTILE);
    const percentile = percentileOf(market, offeredRate);

    weightedPercentile += percentile * spec.amount;
    perTrack.push({
      track: spec.type,
      hebrewName: TRACKS[spec.type].hebrewName,
      amount: spec.amount,
      offeredRate,
      medianRate: market.medianRate,
      bestRate,
      percentile,
      gapToMedian: offeredRate - market.medianRate,
    });

    improved.push(
      trackFromRate(spec.type, spec.amount, spec.termMonths, Math.min(offeredRate, bestRate), scenario, spec.method, spec.graceMonths),
    );
  }

  const atBest = priceMix(improved, scenario);
  const principal = asOffered.totalPrincipal;
  weightedPercentile = principal > 0 ? weightedPercentile / principal : 0;

  // A score of 100 means the offer already sits at the top decile of the market.
  const score = Math.round(Math.max(0, Math.min(100, 100 * (1 - weightedPercentile))));
  const potentialSaving = asOffered.totalPaid - atBest.totalPaid;

  return {
    score,
    grade: grade(score),
    marketPercentile: weightedPercentile,
    offeredWeightedRate: asOffered.weightedInitialRate,
    bestWeightedRate: atBest.weightedInitialRate,
    totalPaidAsOffered: asOffered.totalPaid,
    totalPaidAtBest: atBest.totalPaid,
    potentialSaving,
    monthlySaving: asOffered.initialPayment - atBest.initialPayment,
    tracks: perTrack,
    narrative: narrative(score, potentialSaving),
  };
}

function grade(score: number): string {
  if (score >= 85) return 'מצוין';
  if (score >= 70) return 'טוב';
  if (score >= 50) return 'ממוצע';
  if (score >= 30) return 'מתחת לממוצע';
  return 'יקר';
}

function narrative(score: number, saving: number): string {
  if (saving < 1000) {
    return 'ההצעה שקיבלת כבר קרובה מאוד לטובות ביותר בשוק. אין כמעט מקום למשא ומתן נוסף.';
  }
  return `ההצעה מדורגת ${score} מתוך 100 מול השוק. סגירה בריביות של העשירון העליון תחסוך כ-${Math.round(saving).toLocaleString('he-IL')} ₪ לאורך חיי ההלוואה.`;
}
