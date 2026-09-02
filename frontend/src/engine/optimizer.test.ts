import { describe, expect, it } from 'vitest';
import { optimize, type MixProposal } from './optimizer';
import { profileRisk, type BorrowerProfile } from './profile';
import { baselineScenario } from './scenario';
import { LIMITS } from './regulatory';
import { isFixedForRegulation, TRACKS } from './tracks';
import type { TrackType } from '../lib/types';

/** Ported from the Java OptimizationServiceTest — the same invariants must hold. */
describe('optimizer', () => {
  const scenario = baselineScenario(0.0575, 0.024, 0.042);

  const firstHome = (riskTolerance: number): BorrowerProfile => ({
    propertyValue: 2_400_000,
    loanAmount: 1_680_000,
    termMonths: 300,
    segment: 'FIRST_HOME',
    monthlyNetIncome: 32_000,
    existingMonthlyObligations: 1_500,
    riskTolerance,
    volatilityCapacity: 1_500,
    liquidityEvents: [],
    primePreference: 0.25,
    stablePreference: 0.5,
    dynamicPreference: 0.25,
    eligibilityAmount: 0,
    eligibilityRate: 0,
  });

  const run = (borrower: BorrowerProfile) => optimize(borrower, profileRisk(borrower), scenario, 0.5);
  const share = (proposal: MixProposal, track: TrackType) =>
    proposal.allocations.filter((a) => a.track === track).reduce((sum, a) => sum + a.share, 0);
  const shareWhere = (proposal: MixProposal, predicate: (t: TrackType) => boolean) =>
    proposal.allocations.filter((a) => predicate(a.track)).reduce((sum, a) => sum + a.share, 0);

  it('always satisfies the Bank of Israel share rules at every risk tolerance', () => {
    for (let tolerance = 1; tolerance <= 10; tolerance++) {
      const recommended = run(firstHome(tolerance)).recommended;

      expect(share(recommended, 'PRIME')).toBeLessThanOrEqual(
        LIMITS.MAX_PRIME_SHARE + LIMITS.SHARE_TOLERANCE,
      );
      expect(shareWhere(recommended, isFixedForRegulation)).toBeGreaterThanOrEqual(
        LIMITS.MIN_FIXED_SHARE - LIMITS.SHARE_TOLERANCE,
      );
      expect(recommended.compliance.level).not.toBe('BLOCKING');
    }
  });

  it('allocates exactly the requested loan', () => {
    const allocated = run(firstHome(5)).recommended.allocations.reduce((sum, a) => sum + a.amount, 0);
    expect(allocated).toBeCloseTo(1_680_000, 0);
  });

  it('gives a conservative borrower less rate-sensitive principal than a dynamic one', () => {
    const variable = (p: MixProposal) => shareWhere(p, (t) => TRACKS[t].variableRate);
    expect(variable(run(firstHome(1)).recommended)).toBeLessThan(variable(run(firstHome(10)).recommended));
  });

  it('prices the three regulatory baskets with their mandated compositions', () => {
    const { baskets } = run(firstHome(5));
    const [basket1, basket2, basket3] = baskets;

    expect(share(basket1!, 'FIXED_UNLINKED')).toBeCloseTo(1, 6);

    expect(share(basket2!, 'PRIME')).toBeCloseTo(1 / 3, 6);
    expect(share(basket2!, 'FIXED_LINKED')).toBeCloseTo(1 / 3, 6);
    expect(share(basket2!, 'VARIABLE_LINKED')).toBeCloseTo(1 / 3, 6);

    expect(share(basket3!, 'PRIME')).toBeCloseTo(1 / 3, 6);
    expect(share(basket3!, 'FIXED_UNLINKED')).toBeCloseTo(2 / 3, 6);
    expect(basket3!.result.totalIndexation).toBe(0);
  });

  it('reports savings consistent with the basket numbers', () => {
    const result = run(firstHome(5));
    expect(result.savings).toHaveLength(3);
    for (const saving of result.savings) {
      const basket = result.baskets.find((b) => b.id === saving.againstId)!;
      expect(saving.totalPaidSaving).toBeCloseTo(
        basket.result.totalPaid - result.recommended.result.totalPaid,
        2,
      );
    }
  });

  it('locks a subsidised eligibility loan into the mix at its regulated rate', () => {
    const borrower: BorrowerProfile = { ...firstHome(5), eligibilityAmount: 200_000, eligibilityRate: 0.03 };
    const eligibility = run(borrower).recommended.allocations.find((a) => a.track === 'ELIGIBILITY');

    expect(eligibility).toBeDefined();
    expect(eligibility!.amount).toBeCloseTo(200_000, 0);
    expect(eligibility!.annualRate).toBeCloseTo(0.03, 9);
  });

  it('pushes away from fixed principal when a prepayment is planned', () => {
    const withoutEvent = firstHome(6);
    const withEvent: BorrowerProfile = {
      ...firstHome(6),
      liquidityEvents: [{ month: 48, amount: 300_000, source: 'קרן השתלמות', earmarkedForPrepayment: true }],
    };
    const fixed = (p: MixProposal) => shareWhere(p, isFixedForRegulation);

    expect(fixed(run(withEvent).recommended)).toBeLessThanOrEqual(fixed(run(withoutEvent).recommended));
  });

  it('tells a borrower who cannot afford any compliant mix which constraint was dropped', () => {
    const stretched: BorrowerProfile = {
      ...firstHome(3),
      propertyValue: 2_000_000,
      loanAmount: 1_400_000,
      termMonths: 180,
      monthlyNetIncome: 9_000,
      existingMonthlyObligations: 500,
      volatilityCapacity: 200,
    };
    const result = run(stretched);

    expect(result.relaxedConstraints.length).toBeGreaterThan(0);
    expect(result.recommended.compliance.level).toBe('BLOCKING');
  });

  it('completes fast enough to run in the browser on every keystroke-free submit', () => {
    run(firstHome(5)); // warm
    const result = run(firstHome(8));

    expect(result.candidatesEvaluated).toBeGreaterThan(100);
    // Generous ceiling for CI; the console line below reports the real figure.
    expect(result.computeMillis).toBeLessThan(2_000);
    console.log(
      `    optimizer: ${result.computeMillis}ms for ${result.candidatesEvaluated} candidates`,
    );
  });
});
