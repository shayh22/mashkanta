import { describe, expect, it } from 'vitest';
import { combinedPlan, planToText } from './actionPlan';
import { analyseCombined, positionFromMix } from './combined';
import type { ConsolidationInput } from './consolidation';
import type { ExistingTrack } from './prepayment';
import {
  analyseRoute,
  compareRoutes,
  DEFAULT_ROUTES,
  type ProposedTrack,
  type RefinanceOptions,
} from './refinance';
import { baselineScenario } from './scenario';

const options: RefinanceOptions = {
  scenario: baselineScenario(),
  discountRate: 0.04,
  ltv: 0.5,
  noticeGiven: true,
  dayOfMonth: 20,
  cpiAnnual: 0.024,
};

// A mortgage that is mostly variable, refinanced into a mostly fixed one at a lower rate.
const existing: ExistingTrack[] = [
  { id: 'p', type: 'PRIME', balance: 300_000, annualRate: 0.065, remainingMonths: 240, monthsElapsed: 60 },
  {
    id: 'v',
    type: 'VARIABLE_LINKED',
    balance: 300_000,
    annualRate: 0.059,
    remainingMonths: 240,
    monthsElapsed: 60,
  },
  {
    id: 'f',
    type: 'FIXED_UNLINKED',
    balance: 100_000,
    annualRate: 0.05,
    remainingMonths: 240,
    monthsElapsed: 60,
  },
];
const proposal: ProposedTrack[] = [
  { id: 'p', type: 'PRIME', amount: 200_000, annualRate: 0.05, termMonths: 240 },
  { id: 'v', type: 'FIXED_UNLINKED', amount: 500_000, annualRate: 0.048, termMonths: 240 },
];
const refinance = analyseRoute(existing, proposal, DEFAULT_ROUTES.INTERNAL, options);

const household: ConsolidationInput = {
  netIncome: 21_000,
  debts: [
    {
      id: 'car',
      kind: 'CAR',
      label: 'רכב',
      balance: 150_000,
      annualRate: 0.09,
      monthlyPayment: 3_100,
      remainingMonths: 56,
      include: true,
    },
  ],
  property: {
    value: 2_000_000,
    // Deliberately different from the refinance page: the combined move must use the refinance figures.
    mortgageBalance: 1,
    mortgagePayment: 1,
    mortgageRemainingMonths: 1,
    mortgageVariableBalance: 0,
    priorAllPurposeBalance: 0,
  },
  terms: {
    termMonths: 180,
    variableRate: 0.065,
    fixedRate: 0.068,
    preferredVariableShare: 1,
    extraCash: 0,
    closingCosts: 0,
  },
};

describe('refinance and consolidation in one move', () => {
  it('reads the mortgage position off a priced mix', () => {
    const position = positionFromMix(refinance.current);
    expect(position.mortgageBalance).toBeCloseTo(700_000, 6);
    expect(position.mortgageVariableBalance).toBeCloseTo(600_000, 6);
    expect(position.mortgagePayment).toBeCloseTo(refinance.currentPayment, 6);
    expect(position.mortgageRemainingMonths).toBe(240);
  });

  it('re-tests the consolidation against the refinanced mortgage', () => {
    const move = analyseCombined(household, refinance, { financeUpfrontCosts: false });
    expect(move.consolidationOnly.regulation.existingSecuredPayment).toBeCloseTo(refinance.currentPayment, 6);
    expect(move.combined.regulation.existingSecuredPayment).toBeCloseTo(refinance.proposedPayment, 6);
    expect(move.combined.regulation.pti).toBeLessThan(move.consolidationOnly.regulation.pti);
    expect(move.extraCreditRoom).toBeGreaterThanOrEqual(0);
  });

  it('frees variable room when the refinance moves variable tracks to fixed', () => {
    const move = analyseCombined(household, refinance, { financeUpfrontCosts: false });
    // Before: 600K of 850K secured is variable, so almost nothing new may be variable.
    expect(move.consolidationOnly.allocation.variableCapped).toBe(true);
    expect(move.combined.allocation.variableAmount).toBeGreaterThan(
      move.consolidationOnly.allocation.variableAmount,
    );
    expect(move.combined.regulation.variableShareAfter).toBeLessThan(
      move.consolidationOnly.regulation.variableShareAfter,
    );
  });

  it('adds the refinance saving to the consolidation relief, or rolls its costs into the loan', () => {
    const cash = analyseCombined(household, refinance, { financeUpfrontCosts: false });
    expect(cash.cashUpfront).toBeCloseTo(refinance.upfrontCost, 6);
    expect(cash.paymentToday - cash.paymentAfter).toBeCloseTo(
      cash.consolidationOnly.monthlyRelief + cash.extraReliefFromRefinance,
      6,
    );

    const financed = analyseCombined(household, refinance, { financeUpfrontCosts: true });
    expect(financed.cashUpfront).toBe(0);
    expect(financed.combined.allocation.amount).toBeCloseTo(
      cash.combined.allocation.amount + refinance.upfrontCost,
      6,
    );
    expect(financed.paymentAfter).toBeGreaterThan(cash.paymentAfter);
  });
});

describe('the combined action plan', () => {
  it('plans the refinance first and the consolidation second, under one bottom line', () => {
    const comparison = compareRoutes(existing, proposal, DEFAULT_ROUTES, options);
    const best = comparison.best === 'EXTERNAL' ? comparison.external : comparison.internal;
    const move = analyseCombined(household, best, { financeUpfrontCosts: false });
    const plan = combinedPlan(move, comparison, proposal, 0.5, options.scenario.primeAnnual, true);
    const titles = plan.sections.map((section) => section.title);
    expect(titles[0]).toBe('השורה התחתונה');
    const firstRefinance = titles.findIndex((title) => title.startsWith('מיחזור'));
    const firstConsolidation = titles.findIndex((title) => title.startsWith('איחוד'));
    expect(firstRefinance).toBeGreaterThan(0);
    expect(firstConsolidation).toBeGreaterThan(firstRefinance);
    // The consolidation's own bottom line is folded into the combined one, not repeated.
    expect(titles.filter((title) => title.includes('השורה התחתונה'))).toHaveLength(1);
    const text = planToText(plan);
    expect(text).toContain('קודם המיחזור');
    expect(text).toContain(`הכינו`);
  });
});
