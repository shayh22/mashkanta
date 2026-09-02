import type { AmortizationMethod, TrackType } from '../lib/types';
import { anchorAt, primeAt, type MacroScenario } from './scenario';

/**
 * Static metadata for each Israeli mortgage track.
 *
 * Every track is characterised by three independent properties that drive the engine: whether the
 * principal is indexed to the CPI, whether the nominal rate can move, and — when it can — how often
 * it re-anchors.
 */
export interface TrackMeta {
  readonly hebrewName: string;
  readonly englishName: string;
  /** The outstanding balance is re-valued monthly by the consumer price index. */
  readonly cpiLinked: boolean;
  /** The nominal rate may change before maturity. */
  readonly variableRate: boolean;
  /** Months between rate re-anchoring; 0 for fixed tracks, 1 for prime. */
  readonly anchorResetMonths: number;
  /** The rate is quoted as a margin over the Bank of Israel prime rate. */
  readonly primeAnchored: boolean;
}

export const TRACKS: Record<TrackType, TrackMeta> = {
  PRIME: {
    hebrewName: 'פריים',
    englishName: 'Prime',
    cpiLinked: false,
    variableRate: true,
    anchorResetMonths: 1,
    primeAnchored: true,
  },
  FIXED_UNLINKED: {
    hebrewName: 'קבועה לא צמודה (קל"צ)',
    englishName: 'Fixed unlinked',
    cpiLinked: false,
    variableRate: false,
    anchorResetMonths: 0,
    primeAnchored: false,
  },
  FIXED_LINKED: {
    hebrewName: 'קבועה צמודה (ק"צ)',
    englishName: 'Fixed linked',
    cpiLinked: true,
    variableRate: false,
    anchorResetMonths: 0,
    primeAnchored: false,
  },
  VARIABLE_UNLINKED: {
    hebrewName: 'משתנה לא צמודה',
    englishName: 'Variable unlinked',
    cpiLinked: false,
    variableRate: true,
    anchorResetMonths: 60,
    primeAnchored: false,
  },
  VARIABLE_LINKED: {
    hebrewName: 'משתנה צמודה',
    englishName: 'Variable linked',
    cpiLinked: true,
    variableRate: true,
    anchorResetMonths: 60,
    primeAnchored: false,
  },
  ELIGIBILITY: {
    hebrewName: 'זכאות',
    englishName: 'Eligibility (subsidised)',
    cpiLinked: true,
    variableRate: false,
    anchorResetMonths: 0,
    primeAnchored: false,
  },
};

/**
 * Counts towards the "at least one third fixed" Bank of Israel constraint. A track qualifies only
 * when its rate cannot change for the whole term.
 */
export function isFixedForRegulation(track: TrackType): boolean {
  return !TRACKS[track].variableRate;
}

/**
 * One priced component of a mortgage mix.
 *
 * Fixed tracks carry their whole rate in `fixedRate`. Prime and variable tracks carry only the
 * bank's discretionary margin (מרווח הבנק) — the anchor comes from the scenario, which is what
 * makes stress testing meaningful: shocking prime re-prices every prime component automatically.
 */
export interface TrackSpec {
  readonly type: TrackType;
  readonly amount: number;
  readonly termMonths: number;
  readonly fixedRate: number;
  readonly margin: number;
  readonly method: AmortizationMethod;
  readonly graceMonths: number;
}

/**
 * Builds a spec from the rate the borrower was actually quoted. For anchored tracks the margin is
 * backed out of the quote, so the component keeps re-pricing correctly under shocks.
 */
export function trackFromRate(
  type: TrackType,
  amount: number,
  termMonths: number,
  annualRate: number,
  scenario: MacroScenario,
  method: AmortizationMethod = 'SPITZER',
  graceMonths = 0,
): TrackSpec {
  const meta = TRACKS[type];
  if (meta.primeAnchored) {
    return { type, amount, termMonths, fixedRate: 0, margin: annualRate - primeAt(scenario, 1), method, graceMonths };
  }
  if (meta.variableRate) {
    return { type, amount, termMonths, fixedRate: 0, margin: annualRate - anchorAt(scenario, 1), method, graceMonths };
  }
  return { type, amount, termMonths, fixedRate: annualRate, margin: 0, method, graceMonths };
}

/** The annual nominal rate charged during the given 1-based month. */
export function annualRateAt(spec: TrackSpec, month: number, scenario: MacroScenario): number {
  const meta = TRACKS[spec.type];
  if (meta.primeAnchored) {
    return Math.max(0, primeAt(scenario, month) + spec.margin);
  }
  if (meta.variableRate) {
    // The anchor is sampled once per reset window and then held for the whole window.
    const reset = meta.anchorResetMonths;
    const windowStart = Math.floor((month - 1) / reset) * reset + 1;
    return Math.max(0, anchorAt(scenario, windowStart) + spec.margin);
  }
  return Math.max(0, spec.fixedRate);
}

/** The rate the borrower sees on the offer sheet. */
export function initialRate(spec: TrackSpec, scenario: MacroScenario): number {
  return annualRateAt(spec, 1, scenario);
}

export function withAmount(spec: TrackSpec, amount: number): TrackSpec {
  return { ...spec, amount };
}

export function withTerm(spec: TrackSpec, termMonths: number): TrackSpec {
  return { ...spec, termMonths, graceMonths: Math.min(spec.graceMonths, Math.max(0, termMonths - 1)) };
}
