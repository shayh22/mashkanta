import { describe, expect, it } from 'vitest';
import { checkManualMix, normaliseShares, sharesTotal } from './manualMix';
import { optimize } from './optimizer';
import { profileRisk, type BorrowerProfile } from './profile';
import { baselineScenario } from './scenario';

describe('checking a hand-built mix', () => {
  it('accepts a mix that adds up and keeps the shape rules', () => {
    const check = checkManualMix({ PRIME: 1 / 3, FIXED_UNLINKED: 1 / 3, FIXED_LINKED: 1 / 3 });
    expect(check.totalError).toBeUndefined();
    expect(check.violations).toEqual([]);
    expect(check.fixedShare).toBeCloseTo(2 / 3, 10);
  });

  it('blocks shares that do not add up to 100%', () => {
    expect(checkManualMix({ PRIME: 0.5, FIXED_UNLINKED: 0.4 }).totalError).toContain('90%');
    expect(checkManualMix({ PRIME: 0.5, FIXED_UNLINKED: 0.6 }).totalError).toContain('110%');
  });

  it('flags too much prime, too much variable and too little fixed', () => {
    expect(checkManualMix({ PRIME: 0.8, FIXED_UNLINKED: 0.2 }).violations).toHaveLength(3);
    expect(checkManualMix({ PRIME: 0.3, VARIABLE_LINKED: 0.5, FIXED_LINKED: 0.2 }).violations).toEqual([
      'המסלולים בריבית משתנה (כולל פריים) עולים על שני שלישים מההלוואה.',
      'פחות משליש מההלוואה בריבית קבועה לכל התקופה.',
    ]);
  });

  it('counts an eligibility loan towards the fixed floor', () => {
    // 75% of the loan split 70/30 prime/fixed, 25% eligibility: fixed = 0.225 + 0.25.
    const check = checkManualMix({ PRIME: 0.6, FIXED_UNLINKED: 0.4 }, 0.25);
    expect(check.fixedShare).toBeCloseTo(0.55, 10);
    expect(check.primeShare).toBeCloseTo(0.45, 10);
    expect(check.violations).toEqual([]);
  });

  it('normalises shares and drops empty tracks', () => {
    expect(normaliseShares({ PRIME: 1, FIXED_UNLINKED: 3, FIXED_LINKED: 0 })).toEqual({ PRIME: 0.25, FIXED_UNLINKED: 0.75 });
    expect(normaliseShares({})).toBeUndefined();
    expect(sharesTotal({ PRIME: 0.2, VARIABLE_LINKED: 0.3 })).toBeCloseTo(0.5, 10);
  });
});

describe('optimizer with a hand-built mix', () => {
  const scenario = baselineScenario(0.0575, 0.024, 0.042);
  const borrower: BorrowerProfile = {
    propertyValue: 2_400_000,
    loanAmount: 1_600_000,
    termMonths: 300,
    segment: 'FIRST_HOME',
    monthlyNetIncome: 32_000,
    existingMonthlyObligations: 1_500,
    riskTolerance: 5,
    volatilityCapacity: 1_500,
    liquidityEvents: [],
    primePreference: 0.25,
    stablePreference: 0.5,
    dynamicPreference: 0.25,
    eligibilityAmount: 200_000,
    eligibilityRate: 0.03,
  };
  const manual = optimize(borrower, profileRisk(borrower), scenario, 0.5, { PRIME: 0.5, FIXED_LINKED: 0.5 });
  const auto = optimize(borrower, profileRisk(borrower), scenario, 0.5);

  it('prices exactly the mix given, with the eligibility loan beside it', () => {
    expect(manual.mode).toBe('MANUAL');
    expect(manual.recommended.id).toBe('MANUAL');
    const amounts = Object.fromEntries(manual.recommended.allocations.map((a) => [a.track, a.amount]));
    expect(amounts).toEqual({ PRIME: 700_000, FIXED_LINKED: 700_000, ELIGIBILITY: 200_000 });
  });

  it("keeps the engine's own choice as the yardstick, unchanged", () => {
    expect(manual.engineOptimum?.id).toBe('OPTIMAL');
    expect(manual.engineOptimum?.recommended).toBe(false);
    expect(manual.engineOptimum?.result.totalPaid).toBeCloseTo(auto.recommended.result.totalPaid, 2);
    const vsEngine = manual.savings.find((saving) => saving.againstId === 'OPTIMAL')!;
    expect(vsEngine.totalPaidSaving).toBeCloseTo(auto.recommended.result.totalPaid - manual.recommended.result.totalPaid, 2);
  });

  it('measures the baskets and the term options against the hand-built mix', () => {
    const basket = manual.baskets[0]!;
    expect(manual.savings.find((s) => s.againstId === basket.id)!.totalPaidSaving).toBeCloseTo(
      basket.result.totalPaid - manual.recommended.result.totalPaid,
      2,
    );
    const atTerm = manual.termSensitivity.find((option) => option.termMonths === 300)!;
    expect(atTerm.totalPaid).toBeCloseTo(manual.recommended.result.totalPaid, 0);
  });

  it('leaves the automatic run as it was', () => {
    expect(auto.mode).toBe('AUTO');
    expect(auto.engineOptimum).toBeUndefined();
    expect(auto.recommended.id).toBe('OPTIMAL');
    expect(auto.savings.map((s) => s.againstId)).toEqual(['BASKET_1', 'BASKET_2', 'BASKET_3']);
  });
});
