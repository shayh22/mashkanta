import { priceMix, type MixResult } from '../amortization';
import type { MacroScenario } from '../scenario';
import { trackFromRate } from '../tracks';
import type { OfferTrack } from './offers';

/**
 * What if: the same mix, priced again on a path where prime rises and inflation changes a year
 * from now — so the question "what would I pay then" has an answer for the household's own tracks.
 */

/** The month the change starts: a year from now. */
export const SHOCK_MONTH = 13;

export interface WhatIf {
  readonly base: MixResult;
  readonly shocked: MixResult;
}

export function whatIf(tracks: readonly OfferTrack[], base: MacroScenario, primeUp: number, cpiAnnual: number): WhatIf | undefined {
  const live = tracks.filter((track) => track.amount > 0 && track.termMonths > 0);
  if (live.length === 0) {
    return undefined;
  }
  // Built once on today's path: a prime or variable track keeps its margin, and moves with the shock.
  const specs = live.map((track) => trackFromRate(track.type, track.amount, track.termMonths, track.annualRate, base));
  const shocked: MacroScenario = {
    ...base,
    primeShock: primeUp,
    anchorShock: primeUp,
    cpiShock: cpiAnnual - base.cpiAnnual,
    shockStartMonth: SHOCK_MONTH,
    label: 'מה אם',
  };
  return { base: priceMix(specs, base), shocked: priceMix(specs, shocked) };
}
