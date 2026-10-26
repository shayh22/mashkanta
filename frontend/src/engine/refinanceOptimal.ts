import { priceMix } from './amortization';
import { optimize, type OptimizationResult } from './optimizer';
import type { ExistingTrack } from './prepayment';
import { profileRisk, type BorrowerProfile } from './profile';
import { existingSpecs, type ProposedTrack } from './refinance';
import type { MacroScenario } from './scenario';

/** What the optimizer needs to know about the household, beyond the mortgage itself. */
export interface Household {
  readonly monthlyNetIncome: number;
  readonly existingMonthlyObligations: number;
  readonly riskTolerance: number;
  readonly volatilityCapacity: number;
  readonly primePreference: number;
  readonly stablePreference: number;
  readonly dynamicPreference: number;
}

export interface OptimalRefinance {
  /** The replacement for the refinanced tracks; kept and eligibility tracks are added by the caller. */
  readonly proposal: ProposedTrack[];
  readonly result: OptimizationResult;
  readonly refinancedAmount: number;
}

/**
 * The best new mix for the part of the mortgage being refinanced, chosen by the same engine as a
 * new mortgage. Kept tracks and eligibility loans stay as they are: their payments count against
 * the household's income, and the new mix is built for the balance that is actually repaid.
 *
 * The term is the longest remaining term among the refinanced tracks, so the comparison with the
 * current mortgage is not flattered by stretching the loan.
 */
export function optimalRefinance(
  tracks: readonly ExistingTrack[],
  kept: ReadonlySet<string>,
  propertyValue: number,
  household: Household,
  percentile: number,
  scenario: MacroScenario,
): OptimalRefinance | null {
  const live = tracks.filter((track) => track.balance > 0 && track.remainingMonths > 0);
  const stays = (track: ExistingTrack) => kept.has(track.id) || track.type === 'ELIGIBILITY';
  const refinanced = live.filter((track) => !stays(track));
  const amount = refinanced.reduce((sum, track) => sum + track.balance, 0);
  if (amount <= 0 || propertyValue <= 0) {
    return null;
  }
  const carried = live.filter(stays);
  const carriedPayment = carried.length > 0 ? priceMix(existingSpecs(carried, scenario), scenario).initialPayment : 0;
  const longest = Math.max(...refinanced.map((track) => track.remainingMonths));
  const termMonths = Math.min(360, Math.max(48, Math.ceil(longest / 12) * 12));

  const preferences = household.primePreference + household.stablePreference + household.dynamicPreference;
  const borrower: BorrowerProfile = {
    propertyValue,
    loanAmount: amount,
    termMonths,
    segment: 'REFINANCE',
    monthlyNetIncome: household.monthlyNetIncome,
    existingMonthlyObligations: household.existingMonthlyObligations + carriedPayment,
    riskTolerance: household.riskTolerance,
    volatilityCapacity: household.volatilityCapacity,
    liquidityEvents: [],
    primePreference: preferences > 0 ? household.primePreference / preferences : 0.25,
    stablePreference: preferences > 0 ? household.stablePreference / preferences : 0.5,
    dynamicPreference: preferences > 0 ? household.dynamicPreference / preferences : 0.25,
    eligibilityAmount: 0,
    eligibilityRate: 0,
  };
  const result = optimize(borrower, profileRisk(borrower), scenario, percentile);
  const proposal = result.recommended.allocations.map((allocation) => ({
    id: `optimal-${allocation.track}`,
    type: allocation.track,
    amount: allocation.amount,
    annualRate: allocation.annualRate,
    termMonths: allocation.termMonths,
  }));
  return { proposal, result, refinancedAmount: amount };
}
