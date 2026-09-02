import type { TrackType } from '../lib/types';

/**
 * The LTV buckets the Bank of Israel publishes its average rate table by (קו המשווה).
 * Pricing steps at the bucket boundaries, not continuously.
 */
export type LtvTier = 'UP_TO_45' | 'FROM_45_TO_60' | 'ABOVE_60';

export function tierOf(ltv: number): LtvTier {
  if (ltv <= 0.45) {
    return 'UP_TO_45';
  }
  if (ltv <= 0.6) {
    return 'FROM_45_TO_60';
  }
  return 'ABOVE_60';
}

/** The observed distribution of all-in annual rates for one track in one LTV bucket. */
export interface MarketRate {
  readonly track: TrackType;
  readonly tier: LtvTier;
  /** 10th percentile — what a well-negotiated deal looks like. */
  readonly bestRate: number;
  /** 50th percentile — the Bank of Israel published average. */
  readonly medianRate: number;
  /** 90th percentile — an un-negotiated first offer. */
  readonly worstRate: number;
  readonly sampleSize: number;
  readonly source: string;
}

const SOURCE = 'בנק ישראל — ריביות ממוצעות חודשיות';
const SUBSIDISED = 'משרד הבינוי והשיכון — הלוואת זכאות';

const rate = (
  track: TrackType,
  tier: LtvTier,
  bestRate: number,
  medianRate: number,
  worstRate: number,
  sampleSize: number,
  source = SOURCE,
): MarketRate => ({ track, tier, bestRate, medianRate, worstRate, sampleSize, source });

/**
 * Seed values reflecting the Bank of Israel monthly average table for the current period.
 *
 * Prime figures are all-in (prime plus the typical negative bank margin): a well-negotiated deal
 * is around prime minus 0.7, while prime minus 0.2 is what an un-negotiated first offer looks like.
 */
export const BASELINE_RATES: readonly MarketRate[] = [
  rate('PRIME', 'UP_TO_45', 0.0475, 0.0505, 0.0545, 4200),
  rate('PRIME', 'FROM_45_TO_60', 0.0485, 0.0515, 0.0555, 5100),
  rate('PRIME', 'ABOVE_60', 0.0495, 0.0525, 0.0565, 6800),

  rate('FIXED_UNLINKED', 'UP_TO_45', 0.0455, 0.0495, 0.054, 3900),
  rate('FIXED_UNLINKED', 'FROM_45_TO_60', 0.047, 0.0512, 0.0558, 4700),
  rate('FIXED_UNLINKED', 'ABOVE_60', 0.0488, 0.0532, 0.058, 6300),

  rate('FIXED_LINKED', 'UP_TO_45', 0.0265, 0.03, 0.0345, 2600),
  rate('FIXED_LINKED', 'FROM_45_TO_60', 0.0278, 0.0315, 0.036, 3100),
  rate('FIXED_LINKED', 'ABOVE_60', 0.0295, 0.0335, 0.0382, 4100),

  rate('VARIABLE_UNLINKED', 'UP_TO_45', 0.044, 0.0478, 0.052, 1800),
  rate('VARIABLE_UNLINKED', 'FROM_45_TO_60', 0.0452, 0.0492, 0.0536, 2200),
  rate('VARIABLE_UNLINKED', 'ABOVE_60', 0.0468, 0.051, 0.0556, 2900),

  rate('VARIABLE_LINKED', 'UP_TO_45', 0.0215, 0.025, 0.0292, 1500),
  rate('VARIABLE_LINKED', 'FROM_45_TO_60', 0.0228, 0.0265, 0.0308, 1900),
  rate('VARIABLE_LINKED', 'ABOVE_60', 0.0244, 0.0284, 0.033, 2500),

  rate('ELIGIBILITY', 'UP_TO_45', 0.03, 0.03, 0.03, 0, SUBSIDISED),
  rate('ELIGIBILITY', 'FROM_45_TO_60', 0.03, 0.03, 0.03, 0, SUBSIDISED),
  rate('ELIGIBILITY', 'ABOVE_60', 0.03, 0.03, 0.03, 0, SUBSIDISED),
];

const INDEX = new Map<string, MarketRate>(
  BASELINE_RATES.map((entry) => [`${entry.track}:${entry.tier}`, entry]),
);

/**
 * Fixed-rate tracks price the lender's duration risk, so a 30-year quote sits above a 15-year one.
 * Prime carries no duration premium — it re-prices every month regardless of term.
 */
function termPremium(track: TrackType, termMonths: number): number {
  if (track === 'PRIME') {
    return 0;
  }
  const years = Math.floor(termMonths / 12);
  return Math.max(0, years - 20) * 0.0002 - Math.max(0, 20 - years) * 0.00025;
}

/** The rate distribution for a track at the borrower's LTV, adjusted for the requested term. */
export function rateFor(track: TrackType, ltv: number, termMonths: number): MarketRate {
  const base = INDEX.get(`${track}:${tierOf(ltv)}`);
  if (!base) {
    throw new Error(`no baseline rate for ${track}`);
  }
  const adjustment = termPremium(track, termMonths);
  if (adjustment === 0) {
    return base;
  }
  return {
    ...base,
    bestRate: base.bestRate + adjustment,
    medianRate: base.medianRate + adjustment,
    worstRate: base.worstRate + adjustment,
  };
}

/** Linearly interpolates the distribution at an arbitrary percentile in 0..1. */
export function atPercentile(entry: MarketRate, percentile: number): number {
  const p = Math.min(1, Math.max(0, percentile));
  if (p <= 0.5) {
    return entry.bestRate + (entry.medianRate - entry.bestRate) * (p / 0.5);
  }
  return entry.medianRate + (entry.worstRate - entry.medianRate) * ((p - 0.5) / 0.5);
}

/** Where a quoted rate sits in the distribution, 0 being best in market and 1 the worst. */
export function percentileOf(entry: MarketRate, value: number): number {
  if (value <= entry.bestRate) {
    return 0;
  }
  if (value >= entry.worstRate) {
    return 1;
  }
  if (value <= entry.medianRate) {
    return (0.5 * (value - entry.bestRate)) / Math.max(1e-9, entry.medianRate - entry.bestRate);
  }
  return 0.5 + (0.5 * (value - entry.medianRate)) / Math.max(1e-9, entry.worstRate - entry.medianRate);
}
