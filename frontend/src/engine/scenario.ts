/** The macro-economic path a simulation is priced against. Ported from the Java `MacroScenario`. */

/** Bank of Israel prime as of the last synchronisation, used when the caller sends nothing. */
export const DEFAULT_PRIME = 0.0575;
/** Central Bureau of Statistics trailing inflation. */
export const DEFAULT_CPI = 0.024;
/** 5-year non-linked government bond yield, the anchor for variable tracks. */
export const DEFAULT_ANCHOR = 0.042;

export interface MacroScenario {
  readonly primeAnnual: number;
  readonly cpiAnnual: number;
  readonly variableAnchorAnnual: number;
  /** Additive shift to prime from `shockStartMonth`. */
  readonly primeShock: number;
  /** Additive shift to annual inflation from `shockStartMonth`. */
  readonly cpiShock: number;
  readonly anchorShock: number;
  /** First 1-based month in which the shocks apply. */
  readonly shockStartMonth: number;
  readonly label: string;
}

/** The unshocked baseline built from the current published anchors. */
export function baselineScenario(
  primeAnnual = DEFAULT_PRIME,
  cpiAnnual = DEFAULT_CPI,
  anchorAnnual = DEFAULT_ANCHOR,
): MacroScenario {
  return {
    primeAnnual,
    cpiAnnual,
    variableAnchorAnnual: anchorAnnual,
    primeShock: 0,
    cpiShock: 0,
    anchorShock: 0,
    shockStartMonth: 1,
    label: 'תרחיש בסיס',
  };
}

/**
 * Derives a shocked copy. Prime and the bond anchor move together — they share a policy driver,
 * and shocking prime alone would flatter any mix holding variable tracks.
 */
export function withShock(
  scenario: MacroScenario,
  ratePoints: number,
  cpiPoints: number,
  startMonth: number,
  label: string,
): MacroScenario {
  return {
    ...scenario,
    primeShock: ratePoints,
    cpiShock: cpiPoints,
    anchorShock: ratePoints,
    shockStartMonth: Math.max(1, startMonth),
    label,
  };
}

/** Prime rate in effect during the given 1-based month, floored at zero. */
export function primeAt(scenario: MacroScenario, month: number): number {
  return Math.max(0, scenario.primeAnnual + (month >= scenario.shockStartMonth ? scenario.primeShock : 0));
}

/** Variable-track anchor in effect during the given 1-based month, floored at zero. */
export function anchorAt(scenario: MacroScenario, month: number): number {
  return Math.max(
    0,
    scenario.variableAnchorAnnual + (month >= scenario.shockStartMonth ? scenario.anchorShock : 0),
  );
}

/** Annual inflation in effect during the given 1-based month. Deflation is permitted. */
export function cpiAnnualAt(scenario: MacroScenario, month: number): number {
  return scenario.cpiAnnual + (month >= scenario.shockStartMonth ? scenario.cpiShock : 0);
}

/** Geometric monthly inflation derived from the annual figure in effect that month. */
export function monthlyInflationAt(scenario: MacroScenario, month: number): number {
  return Math.pow(1 + cpiAnnualAt(scenario, month), 1 / 12) - 1;
}
