import { describe, expect, it } from 'vitest';
import type { ExistingTrack } from './prepayment';
import { optimalRefinance, type Household } from './refinanceOptimal';
import { LIMITS } from './regulatory';
import { baselineScenario } from './scenario';

const scenario = baselineScenario(0.0575, 0.024, 0.042);
const household: Household = {
  monthlyNetIncome: 30_000,
  existingMonthlyObligations: 1_000,
  riskTolerance: 5,
  volatilityCapacity: 1_500,
  primePreference: 0.25,
  stablePreference: 0.5,
  dynamicPreference: 0.25,
};
const tracks: ExistingTrack[] = [
  { id: 'p', type: 'PRIME', balance: 400_000, annualRate: 0.0625, remainingMonths: 250, monthsElapsed: 50 },
  { id: 'f', type: 'FIXED_UNLINKED', balance: 300_000, annualRate: 0.061, remainingMonths: 190, monthsElapsed: 50 },
  { id: 'e', type: 'ELIGIBILITY', balance: 100_000, annualRate: 0.03, remainingMonths: 250, monthsElapsed: 50 },
];

describe('optimal refinance mix', () => {
  it('rebuilds only the refinanced balance, over the longest remaining term rounded up to a year', () => {
    const optimal = optimalRefinance(tracks, new Set(), 2_000_000, household, 0.3, scenario)!;
    expect(optimal.refinancedAmount).toBe(700_000);
    const total = optimal.proposal.reduce((sum, track) => sum + track.amount, 0);
    expect(total).toBeCloseTo(700_000, 0);
    expect(new Set(optimal.proposal.map((track) => track.termMonths))).toEqual(new Set([252]));
    expect(optimal.proposal.some((track) => track.type === 'ELIGIBILITY')).toBe(false);
  });

  it('keeps the regulatory shape', () => {
    const { proposal } = optimalRefinance(tracks, new Set(), 2_000_000, household, 0.3, scenario)!;
    const share = (types: string[]) =>
      proposal.filter((track) => types.includes(track.type)).reduce((sum, track) => sum + track.amount, 0) / 700_000;
    expect(share(['PRIME'])).toBeLessThanOrEqual(LIMITS.MAX_PRIME_SHARE + LIMITS.SHARE_TOLERANCE);
    expect(share(['FIXED_UNLINKED', 'FIXED_LINKED'])).toBeGreaterThanOrEqual(LIMITS.MIN_FIXED_SHARE - LIMITS.SHARE_TOLERANCE);
  });

  it('leaves kept tracks out and counts their payment against the household', () => {
    const optimal = optimalRefinance(tracks, new Set(['f']), 2_000_000, household, 0.3, scenario)!;
    expect(optimal.refinancedAmount).toBe(400_000);
    expect(optimal.proposal.every((track) => track.id.startsWith('optimal-'))).toBe(true);
    // Other obligations as the engine saw them: the household's 1,000, the eligibility loan, and now
    // the kept fixed track's payment too.
    const obligations = (run: typeof optimal) =>
      (run.result.recommended.compliance.dti - run.result.recommended.compliance.pti) * household.monthlyNetIncome;
    const without = optimalRefinance(tracks, new Set(), 2_000_000, household, 0.3, scenario)!;
    expect(obligations(without)).toBeGreaterThan(1_400);
    expect(obligations(without)).toBeLessThan(1_700);
    expect(obligations(optimal) - obligations(without)).toBeGreaterThan(2_000);
  });

  it('returns nothing when no balance is being refinanced', () => {
    expect(optimalRefinance(tracks, new Set(['p', 'f']), 2_000_000, household, 0.3, scenario)).toBeNull();
    expect(optimalRefinance([], new Set(), 2_000_000, household, 0.3, scenario)).toBeNull();
  });
});
