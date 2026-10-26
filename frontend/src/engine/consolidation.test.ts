import { describe, expect, it } from 'vitest';
import {
  analyseConsolidation,
  CONSOLIDATION_LIMITS,
  isShortTerm,
  legacyMaxNewPayment,
  maxNewPayment,
  maxSecuredTotal,
  maxVariableForNewLoan,
  recommendDebt,
  consumerLoanAverage,
  CONSUMER_LOAN_AVERAGE_SEED,
  repayWithExtra,
  type ConsolidationInput,
  type ConsumerDebt,
} from './consolidation';
import { applyLiveMarket } from './liveMarket';
import { payment } from './math';

const debt = (patch: Partial<ConsumerDebt>): ConsumerDebt => ({
  id: 'd',
  kind: 'CAR',
  label: 'רכב',
  balance: 80_000,
  annualRate: 0.09,
  monthlyPayment: 2_000,
  remainingMonths: 48,
  include: true,
  ...patch,
});

const base: ConsolidationInput = {
  netIncome: 24_000,
  debts: [
    debt({
      id: 'car',
      kind: 'CAR',
      balance: 90_000,
      annualRate: 0.085,
      monthlyPayment: 2_200,
      remainingMonths: 48,
    }),
    debt({
      id: 'card',
      kind: 'CREDIT_CARD',
      balance: 45_000,
      annualRate: 0.14,
      monthlyPayment: 1_600,
      remainingMonths: 36,
    }),
    debt({
      id: 'short',
      kind: 'OTHER',
      balance: 12_000,
      annualRate: 0.07,
      monthlyPayment: 1_100,
      remainingMonths: 11,
      include: false,
    }),
  ],
  property: {
    value: 2_000_000,
    mortgageBalance: 700_000,
    mortgagePayment: 4_800,
    mortgageRemainingMonths: 240,
    mortgageVariableBalance: 300_000,
    priorAllPurposeBalance: 0,
  },
  terms: {
    termMonths: 180,
    variableRate: 0.065,
    fixedRate: 0.068,
    preferredVariableShare: 0.5,
    extraCash: 0,
    closingCosts: 0,
  },
};

describe('October 2026 payment-to-income formula', () => {
  it('reproduces the published example: 5,650 before, 2,650 after', () => {
    expect(legacyMaxNewPayment(20_000, 2_700, 6_000, 0.5)).toBeCloseTo(5_650, 6);
    expect(maxNewPayment(20_000, 2_700, 6_000, 0.5)).toBeCloseTo(2_650, 6);
  });

  it('removes half a shekel more of capacity for every shekel already paid on the property', () => {
    const delta = legacyMaxNewPayment(20_000, 0, 1_000, 0.5) - maxNewPayment(20_000, 0, 1_000, 0.5);
    expect(delta).toBeCloseTo(500, 6);
  });

  it('puts the existing secured payment in the numerator of the ratio', () => {
    const result = analyseConsolidation(base);
    const { regulation, allocation } = result;
    // F counts only the debts kept that have more than 18 months left: the short one is excluded.
    expect(regulation.otherObligations).toBe(0);
    expect(regulation.existingSecuredPayment).toBe(4_800);
    expect(regulation.pti).toBeCloseTo((allocation.payment + 4_800) / 24_000, 10);
    expect(regulation.legacyPti).toBeCloseTo(allocation.payment / (24_000 - 4_800), 10);
  });

  it('ignores an existing mortgage with 18 months or less left', () => {
    const result = analyseConsolidation({
      ...base,
      property: { ...base.property, mortgageRemainingMonths: 18 },
    });
    expect(result.regulation.existingSecuredPayment).toBe(0);
  });

  it('counts a kept debt in F only when it has more than 18 months left', () => {
    const keptLong = analyseConsolidation({
      ...base,
      debts: base.debts.map((d) => (d.id === 'car' ? { ...d, include: false } : d)),
    });
    expect(keptLong.regulation.otherObligations).toBe(2_200);
    expect(isShortTerm({ remainingMonths: 18 })).toBe(true);
    expect(isShortTerm({ remainingMonths: 19 })).toBe(false);
  });

  it('blocks above 50%, warns between 40% and 50%', () => {
    const tight = analyseConsolidation({ ...base, netIncome: 9_000 });
    expect(tight.regulation.pti).toBeGreaterThan(0.5);
    expect(tight.regulation.feasible).toBe(false);
    expect(tight.regulation.findings.find((f) => f.code === 'CONS_PTI')?.level).toBe('BLOCKING');

    const middle = analyseConsolidation({ ...base, netIncome: 13_500 });
    expect(middle.regulation.pti).toBeGreaterThan(0.4);
    expect(middle.regulation.pti).toBeLessThanOrEqual(0.5);
    expect(middle.regulation.feasible).toBe(true);
    expect(middle.regulation.bankFeasible).toBe(false);
  });
});

describe('cumulative LTV', () => {
  it('allows 50%, or 70% when the part above 50% stays within ₪200,000', () => {
    // 2M home: 50% = 1M, 70% = 1.4M, but 1M + 200K = 1.2M binds.
    expect(maxSecuredTotal(2_000_000)).toBe(1_200_000);
    // 800K home: 70% = 560K binds before 400K + 200K = 600K.
    expect(maxSecuredTotal(800_000)).toBeCloseTo(560_000, 6);
  });

  it('classifies the three LTV states at their boundaries', () => {
    const at = (mortgageBalance: number) =>
      analyseConsolidation({ ...base, property: { ...base.property, mortgageBalance } }).regulation;
    // The consolidation loan is 135,000 (car + card).
    expect(at(865_000).ltvStatus).toBe('BASE');
    expect(at(865_001).ltvStatus).toBe('RELIEF');
    expect(at(1_065_000).ltvStatus).toBe('RELIEF');
    expect(at(1_065_001).ltvStatus).toBe('EXCEEDED');
    expect(at(1_065_001).feasible).toBe(false);
  });

  it('counts earlier all-purpose loans toward the ₪200,000 above 50%', () => {
    const result = analyseConsolidation({
      ...base,
      property: { ...base.property, mortgageBalance: 900_000, priorAllPurposeBalance: 150_000 },
    });
    expect(result.regulation.reliefUsed).toBeCloseTo(900_000 + 150_000 + 135_000 - 1_000_000, 6);
    expect(result.regulation.ltvRoom).toBeCloseTo(1_200_000 - 1_050_000, 6);
  });
});

describe('two-thirds variable on all credit secured by the property', () => {
  it('reproduces the published example: 80,000 variable of a 300,000 loan', () => {
    expect(maxVariableForNewLoan(1_200_000, 720_000)).toBeCloseTo(80_000, 6);
  });

  it('moves the excess into the fixed track and reports it', () => {
    const result = analyseConsolidation({
      ...base,
      debts: [debt({ id: 'big', balance: 300_000, monthlyPayment: 6_000, remainingMonths: 60 })],
      property: {
        ...base.property,
        value: 3_000_000,
        mortgageBalance: 900_000,
        mortgageVariableBalance: 720_000,
      },
      terms: { ...base.terms, preferredVariableShare: 1 },
    });
    expect(result.allocation.variableAmount).toBeCloseTo(80_000, 6);
    expect(result.allocation.fixedAmount).toBeCloseTo(220_000, 6);
    expect(result.allocation.variableCapped).toBe(true);
    expect(result.regulation.variableShareAfter).toBeCloseTo(2 / 3, 6);
  });
});

describe('₪120,000 all-purpose exemption', () => {
  const small = (balance: number, prior = 0) =>
    analyseConsolidation({
      ...base,
      netIncome: 9_000,
      debts: [debt({ id: 'x', balance, monthlyPayment: 3_000 })],
      property: { ...base.property, priorAllPurposeBalance: prior },
      terms: { ...base.terms, preferredVariableShare: 1 },
    }).regulation;

  it('exempts up to and including ₪120,000 cumulatively, and not a shekel more', () => {
    expect(small(120_000).ptiExempt).toBe(true);
    expect(small(120_000).feasible).toBe(true);
    expect(small(120_001).ptiExempt).toBe(false);
    expect(small(80_000, 40_000).ptiExempt).toBe(true);
    expect(small(80_000, 40_001).ptiExempt).toBe(false);
  });

  it('lifts the two-thirds cap within the exemption', () => {
    expect(small(100_000).maxVariableNew).toBe(100_000);
    expect(small(100_000).variableExempt).toBe(true);
  });
});

describe('cash flow and lifetime cost', () => {
  it('measures relief as the drop in total monthly payments', () => {
    const result = analyseConsolidation(base);
    expect(result.paymentBefore).toBe(4_800 + 2_200 + 1_600 + 1_100);
    expect(result.paymentAfter).toBeCloseTo(4_800 + 1_100 + result.allocation.payment, 6);
    expect(result.monthlyRelief).toBeGreaterThan(0);
    // Spreading 3–4 years of debt over 15 years costs more in total.
    expect(result.extraLifetimeCost).toBeGreaterThan(0);
    expect(result.includedRemainingCost).toBe(2_200 * 48 + 1_600 * 36);
  });

  it('prices each track as a level annuity', () => {
    const { allocation } = analyseConsolidation(base);
    expect(allocation.amount).toBe(135_000);
    expect(allocation.variablePayment).toBeCloseTo(payment(67_500, 0.065 / 12, 180), 6);
    expect(allocation.fixedPayment).toBeCloseTo(payment(67_500, 0.068 / 12, 180), 6);
  });

  it('builds a timeline whose first month matches before and after', () => {
    const result = analyseConsolidation(base);
    expect(result.timeline[0]!.before).toBeCloseTo(result.paymentBefore, 6);
    expect(result.timeline[0]!.after).toBeCloseTo(result.paymentAfter, 6);
  });
});

describe('smart term shortening', () => {
  it('repays in the full term with no extra and shortens monotonically as the extra grows', () => {
    const { allocation } = analyseConsolidation(base);
    const none = repayWithExtra(allocation, 0);
    expect(none.months).toBe(allocation.termMonths);
    expect(none.totalPaid).toBeCloseTo(allocation.payment * allocation.termMonths, 0);
    const some = repayWithExtra(allocation, 500);
    const more = repayWithExtra(allocation, 1_500);
    expect(some.months).toBeLessThan(none.months);
    expect(more.months).toBeLessThan(some.months);
    expect(more.totalPaid).toBeLessThan(some.totalPaid);
  });

  it('finds the smallest share of the relief that keeps the total no higher than today', () => {
    const result = analyseConsolidation(base);
    const share = result.breakEvenShare;
    expect(share).toBeDefined();
    expect(share!).toBeGreaterThan(0);
    expect(share!).toBeLessThanOrEqual(1);
    const target = result.includedRemainingCost;
    const at = (s: number) => repayWithExtra(result.allocation, result.monthlyRelief * s).totalPaid;
    expect(at(share!)).toBeLessThanOrEqual(target + 1e-6);
    expect(at(Math.max(0, share! - 0.01))).toBeGreaterThan(target);
  });
});

describe('debt recommendations', () => {
  it('keeps short debts out and consolidates expensive long ones', () => {
    expect(recommendDebt(debt({ remainingMonths: 12, annualRate: 0.08 }), 0.065).action).toBe('KEEP');
    expect(
      recommendDebt(debt({ kind: 'CREDIT_CARD', remainingMonths: 12, annualRate: 0.16 }), 0.065).action,
    ).toBe('OPTIONAL');
    expect(recommendDebt(debt({ remainingMonths: 40, annualRate: 0.1 }), 0.065).action).toBe('CONSOLIDATE');
    expect(recommendDebt(debt({ remainingMonths: 40, annualRate: 0.06 }), 0.065).action).toBe('KEEP');
    expect(CONSOLIDATION_LIMITS.SHORT_TERM_MONTHS).toBe(18);
  });

  it('flags loans priced a point or more above the consumer-loan average', () => {
    const average = consumerLoanAverage().rate;
    expect(recommendDebt(debt({ annualRate: average + 0.02 }), 0.065).aboveMarket).toBeCloseTo(0.02, 10);
    expect(recommendDebt(debt({ annualRate: average + 0.005 }), 0.065).aboveMarket).toBeUndefined();
    // Exactly a point above, as typed in percent (8.9% against 7.9%), counts.
    expect(recommendDebt(debt({ annualRate: 0.089 }), 0.065).aboveMarket).toBeDefined();
    // Overdrafts are a different product from installment loans.
    expect(recommendDebt(debt({ kind: 'OVERDRAFT', annualRate: 0.14 }), 0.065).aboveMarket).toBeUndefined();
  });

  it('measures against the live average once it is known', () => {
    const live = { fetchedAt: '2026-10-26T08:00:00Z', missing: [], consumerUnsecured: { value: 0.1, asOf: '2026-09' } };
    try {
      applyLiveMarket(live);
      expect(consumerLoanAverage()).toEqual({ rate: 0.1, asOf: '2026-09' });
      expect(recommendDebt(debt({ annualRate: 0.105 }), 0.065).aboveMarket).toBeUndefined();
    } finally {
      applyLiveMarket(undefined);
    }
    expect(consumerLoanAverage().rate).toBe(CONSUMER_LOAN_AVERAGE_SEED);
  });
});

describe('a debt marked for consolidation with nothing left to repay', () => {
  it('counts in the payment-to-income test exactly as it counts in the cash flow', () => {
    const empty = debt({
      id: 'empty',
      balance: 0,
      monthlyPayment: 1_500,
      remainingMonths: 60,
      include: true,
    });
    const result = analyseConsolidation({ ...base, debts: [...base.debts, empty] });
    expect(result.kept.some((d) => d.id === 'empty')).toBe(true);
    expect(result.regulation.otherObligations).toBe(1_500);
    expect(result.paymentAfter).toBeCloseTo(4_800 + 1_100 + 1_500 + result.allocation.payment, 6);
  });
});
