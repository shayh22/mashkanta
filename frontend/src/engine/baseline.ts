import type { TrackType } from '../lib/types';
import { DEFAULT_PRIME } from './scenario';

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

const SOURCE = 'בנק ישראל — ריביות ממוצעות בהלוואות לדיור, אוגוסט 2026';
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

/** The month the seeded medians were calibrated to. */
export const BASELINE_AS_OF = '2026-08';

/**
 * Seed values calibrated to the Bank of Israel's average rates on new housing loans for August 2026
 * (statistics service, dataflow BIR_MRTG_99, housing loans A2C): fixed unlinked 4.62%, fixed
 * CPI-linked 3.29%, variable CPI-linked 1.64% benchmark + 1.55% margin = 3.19%, and unlinked
 * variable at a 0.49% average margin over a benchmark that tracks prime. Each track's middle LTV
 * bucket carries the published average; the buckets around it and the best/worst spread keep their
 * earlier shape, since the series is not published by LTV. Variable unlinked (5-year, bond-anchored)
 * has no separate series and keeps its earlier values.
 *
 * Prime figures are all-in at {@link DEFAULT_PRIME} and move with prime (see {@link rateFor}):
 * the market average is around prime + 0.5, a well-negotiated deal around prime + 0.2.
 */
export const BASELINE_RATES: readonly MarketRate[] = [
  rate('PRIME', 'UP_TO_45', 0.0484, 0.0514, 0.0554, 4200),
  rate('PRIME', 'FROM_45_TO_60', 0.0494, 0.0524, 0.0564, 5100),
  rate('PRIME', 'ABOVE_60', 0.0504, 0.0534, 0.0574, 6800),

  rate('FIXED_UNLINKED', 'UP_TO_45', 0.0405, 0.0445, 0.049, 3900),
  rate('FIXED_UNLINKED', 'FROM_45_TO_60', 0.042, 0.0462, 0.0508, 4700),
  rate('FIXED_UNLINKED', 'ABOVE_60', 0.0438, 0.0482, 0.053, 6300),

  rate('FIXED_LINKED', 'UP_TO_45', 0.0279, 0.0314, 0.0359, 2600),
  rate('FIXED_LINKED', 'FROM_45_TO_60', 0.0292, 0.0329, 0.0374, 3100),
  rate('FIXED_LINKED', 'ABOVE_60', 0.0309, 0.0349, 0.0396, 4100),

  rate('VARIABLE_UNLINKED', 'UP_TO_45', 0.044, 0.0478, 0.052, 1800),
  rate('VARIABLE_UNLINKED', 'FROM_45_TO_60', 0.0452, 0.0492, 0.0536, 2200),
  rate('VARIABLE_UNLINKED', 'ABOVE_60', 0.0468, 0.051, 0.0556, 2900),

  rate('VARIABLE_LINKED', 'UP_TO_45', 0.0269, 0.0304, 0.0346, 1500),
  rate('VARIABLE_LINKED', 'FROM_45_TO_60', 0.0282, 0.0319, 0.0362, 1900),
  rate('VARIABLE_LINKED', 'ABOVE_60', 0.0298, 0.0338, 0.0384, 2500),

  rate('ELIGIBILITY', 'UP_TO_45', 0.03, 0.03, 0.03, 0, SUBSIDISED),
  rate('ELIGIBILITY', 'FROM_45_TO_60', 0.03, 0.03, 0.03, 0, SUBSIDISED),
  rate('ELIGIBILITY', 'ABOVE_60', 0.03, 0.03, 0.03, 0, SUBSIDISED),
];

const INDEX = new Map<string, MarketRate>(
  BASELINE_RATES.map((entry) => [`${entry.track}:${entry.tier}`, entry]),
);

/** The seeded median in the middle LTV bucket — the one calibrated to the published average. */
export function seededAverage(track: TrackType): number {
  return INDEX.get(`${track}:FROM_45_TO_60`)!.medianRate;
}

/**
 * Per-track shifts that re-centre the seeded distributions on live published averages, with the
 * source those averages came from. Empty until live data arrives; see `liveMarket.ts`.
 */
let marketShift: { shifts: Partial<Record<TrackType, number>>; source?: string } = { shifts: {} };

export function setMarketShifts(shifts: Partial<Record<TrackType, number>>, source?: string): void {
  marketShift = { shifts, source };
}

/**
 * The table as currently priced: the seed, moved onto the live averages where they are known, with
 * prime rows at the given prime rate exactly as {@link rateFor} prices them.
 */
export function currentBaselineRates(prime = DEFAULT_PRIME): MarketRate[] {
  return BASELINE_RATES.map((entry) => {
    const shift = (marketShift.shifts[entry.track] ?? 0) + (entry.track === 'PRIME' ? prime - DEFAULT_PRIME : 0);
    if (shift === 0) {
      return { ...entry };
    }
    return {
      ...entry,
      bestRate: entry.bestRate + shift,
      medianRate: entry.medianRate + shift,
      worstRate: entry.worstRate + shift,
      source: marketShift.shifts[entry.track] === undefined ? entry.source : (marketShift.source ?? entry.source),
    };
  });
}

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

/**
 * The rate distribution for a track at the borrower's LTV, adjusted for the requested term.
 *
 * The seeded prime figures are all-in rates observed while prime stood at {@link DEFAULT_PRIME};
 * what lenders actually compete on is the margin. They are therefore moved one for one with the
 * prime rate in force, so a borrower who sets prime to 4.75% sees prime offered at the same
 * margin rather than at a margin that silently widened by a point.
 */
export function rateFor(track: TrackType, ltv: number, termMonths: number, prime = DEFAULT_PRIME): MarketRate {
  const base = INDEX.get(`${track}:${tierOf(ltv)}`);
  if (!base) {
    throw new Error(`no baseline rate for ${track}`);
  }
  const adjustment =
    termPremium(track, termMonths) +
    (track === 'PRIME' ? prime - DEFAULT_PRIME : 0) +
    (marketShift.shifts[track] ?? 0);
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
