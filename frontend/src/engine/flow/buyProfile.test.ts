import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../../store/wizardStore';
import { buyPlan } from './buyProfile';

const answers = {
  propertyValue: 2_000_000,
  segment: 'FIRST_HOME',
  equity: 600_000,
  hasEligibility: 'NO',
  netIncome: 22_000,
  hasObligations: 'NO',
  stability: 'BALANCED',
};

describe('a buyer’s answers as the engine’s input', () => {
  it('borrows the price less the equity, with the term and eligibility rate the engine assumes', () => {
    const plan = buyPlan(answers, DEFAULT_PROFILE);
    expect(plan).toMatchObject({
      kind: 'LOAN',
      needed: 1_400_000,
      equityShort: 0,
      profile: {
        propertyValue: 2_000_000,
        loanAmount: 1_400_000,
        segment: 'FIRST_HOME',
        monthlyNetIncome: 22_000,
        existingMonthlyObligations: 0,
        termMonths: DEFAULT_PROFILE.termMonths,
        eligibilityRate: DEFAULT_PROFILE.eligibilityRate,
        eligibilityAmount: 0,
        volatilityCapacity: 0,
        liquidityEvents: [],
      },
    });
  });

  it('lends no more than the segment’s ceiling, and says how much equity is missing', () => {
    // An upgrader may borrow 70%: 1,400,000 of 2,000,000, so 1,500,000 needs 100,000 more equity.
    const plan = buyPlan({ ...answers, segment: 'UPGRADER', equity: 500_000 }, DEFAULT_PROFILE);
    expect(plan).toMatchObject({ kind: 'LOAN', needed: 1_500_000, equityShort: 100_000, profile: { loanAmount: 1_400_000 } });
  });

  it('needs no mortgage when the equity covers the price', () => {
    expect(buyPlan({ ...answers, equity: 2_100_000 }, DEFAULT_PROFILE)).toEqual({ kind: 'NO_LOAN', spare: 100_000 });
    expect(buyPlan({ ...answers, equity: 2_000_000 }, DEFAULT_PROFILE)).toEqual({ kind: 'NO_LOAN', spare: 0 });
  });

  it('counts other repayments and an eligibility loan only when the household said so', () => {
    const plan = buyPlan({ ...answers, hasObligations: 'YES', obligations: 1_200, hasEligibility: 'YES', eligibilityAmount: 120_000 }, DEFAULT_PROFILE);
    expect(plan).toMatchObject({ profile: { existingMonthlyObligations: 1_200, eligibilityAmount: 120_000 } });
    const stale = buyPlan({ ...answers, hasObligations: 'NO', obligations: 1_200, hasEligibility: 'NO', eligibilityAmount: 120_000 }, DEFAULT_PROFILE);
    expect(stale).toMatchObject({ profile: { existingMonthlyObligations: 0, eligibilityAmount: 0 } });
  });

  it('reads "stable or cheap" as a lower or higher appetite for risk', () => {
    const tolerance = (stability: string) => {
      const plan = buyPlan({ ...answers, stability }, DEFAULT_PROFILE);
      return plan?.kind === 'LOAN' ? plan.profile : undefined;
    };
    expect(tolerance('STABLE')!.riskTolerance).toBeLessThan(tolerance('BALANCED')!.riskTolerance);
    expect(tolerance('CHEAP')!.riskTolerance).toBeGreaterThan(tolerance('BALANCED')!.riskTolerance);
    expect(tolerance('STABLE')!.stablePreference).toBeGreaterThan(tolerance('CHEAP')!.stablePreference);
  });

  it('waits for the price, the kind of home, the equity and the income', () => {
    for (const missing of ['propertyValue', 'segment', 'equity', 'netIncome']) {
      const partial: Record<string, unknown> = { ...answers };
      delete partial[missing];
      expect(buyPlan(partial as typeof answers, DEFAULT_PROFILE)).toBeUndefined();
    }
    expect(buyPlan({ ...answers, segment: 'REFINANCE' }, DEFAULT_PROFILE)).toBeUndefined();
  });
});
