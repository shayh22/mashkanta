import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../../store/wizardStore';
import { annuity } from '../money/loanMoves';
import { impliedRate, refinanceEstimate } from './refinancePlan';

const answers = { mortgageHow: 'MANUAL', mortgageBalance: 800_000, mortgagePayment: 6_000, mortgageYears: 'TEN_20', homeValue: 2_200_000, netIncome: 25_000, stability: 'BALANCED' };

describe('the rate a payment implies', () => {
  it('is the rate at which the payment repays the balance in the months left', () => {
    const payment = annuity(800_000, 0.051, 180);
    expect(impliedRate(800_000, payment, 180)).toBeCloseTo(0.051, 6);
    expect(impliedRate(120_000, 1_000, 120)).toBeCloseTo(0, 6);
  });

  it('is nothing when no rate fits: a payment too small to repay, or too large to be a mortgage', () => {
    expect(impliedRate(800_000, 3_000, 180)).toBeUndefined();
    expect(impliedRate(800_000, 50_000, 180)).toBeUndefined();
    expect(impliedRate(0, 3_000, 180)).toBeUndefined();
  });
});

describe('a typed-in mortgage as a refinance estimate', () => {
  it('prices the same balance over the same term, in whole years, for this household', () => {
    const estimate = refinanceEstimate(answers, DEFAULT_PROFILE);
    expect(estimate).toMatchObject({
      kind: 'ESTIMATE',
      current: { balance: 800_000, payment: 6_000, months: 180 },
      profile: { segment: 'REFINANCE', propertyValue: 2_200_000, loanAmount: 800_000, termMonths: 180, monthlyNetIncome: 25_000, eligibilityAmount: 0 },
    });
    expect(estimate?.kind === 'ESTIMATE' && estimate.current.rate).toBeGreaterThan(0.04);
  });

  it('reads "don’t know" as twenty years, and says when the figures cannot be one mortgage', () => {
    expect(refinanceEstimate({ ...answers, mortgageYears: 'UNKNOWN' }, DEFAULT_PROFILE)).toMatchObject({ current: { months: 240 }, profile: { termMonths: 240 } });
    expect(refinanceEstimate({ ...answers, mortgagePayment: 2_000 }, DEFAULT_PROFILE)).toEqual({ kind: 'IMPLAUSIBLE' });
  });

  it('waits for the balance, the payment, the home’s value and the income', () => {
    for (const missing of ['mortgageBalance', 'mortgagePayment', 'homeValue', 'netIncome']) {
      const partial: Record<string, unknown> = { ...answers };
      delete partial[missing];
      expect(refinanceEstimate(partial as typeof answers, DEFAULT_PROFILE)).toBeUndefined();
    }
  });
});
