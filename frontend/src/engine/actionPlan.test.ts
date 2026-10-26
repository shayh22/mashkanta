import { describe, expect, it } from 'vitest';
import {
  consolidationPlan,
  negotiationTargets,
  planToText,
  refinancePlan,
  termForPayment,
} from './actionPlan';
import { rateFor } from './baseline';
import { analyseConsolidation, type ConsolidationInput } from './consolidation';
import { payment } from './math';
import type { ExistingTrack } from './prepayment';
import { compareRoutes, DEFAULT_ROUTES, likeForLikeProposal } from './refinance';
import { baselineScenario, DEFAULT_PRIME } from './scenario';

const scenario = baselineScenario();
const ltv = 0.45;

/** End to end: payoff statement → both routes → the plan the borrower takes to the bank. */
function refinanceFlow(existing: ExistingTrack[], noticeGiven: boolean, dayOfMonth = 20) {
  const proposal = likeForLikeProposal(existing, ltv, 0.3);
  const comparison = compareRoutes(existing, proposal, DEFAULT_ROUTES, {
    scenario,
    discountRate: 0.04,
    ltv,
    noticeGiven,
    dayOfMonth,
    cpiAnnual: scenario.cpiAnnual,
  });
  return { comparison, plan: refinancePlan(comparison, proposal, ltv, DEFAULT_PRIME, noticeGiven) };
}

describe('refinance action plan', () => {
  const expensive: ExistingTrack[] = [
    { id: 'p', type: 'PRIME', balance: 500_000, annualRate: 0.0675, remainingMonths: 240, monthsElapsed: 30 },
    {
      id: 'f',
      type: 'FIXED_LINKED',
      balance: 300_000,
      annualRate: 0.045,
      remainingMonths: 240,
      monthsElapsed: 32,
    },
  ];

  it('recommends acting when the switch pays, and names the route', () => {
    const { comparison, plan } = refinanceFlow(expensive, true);
    expect(comparison.internal.verdict).not.toBe('NOT_WORTHWHILE');
    expect(plan.headline).toMatch(/משתלם/);
    expect(plan.sections[0]!.title).toBe('ההחלטה');
  });

  it('tells the borrower to give notice, move the date and wait for the discount step', () => {
    const { plan } = refinanceFlow(expensive, false, 5);
    const text = planToText(plan);
    expect(text).toContain('הודעה בכתב');
    expect(text).toContain('בין ה-16');
    // 32 months into a regular loan: the 20% step is 4 months away.
    expect(text).toContain('להמתין 4 חודשים');
  });

  it('advises against refinancing when nothing is saved', () => {
    const cheap: ExistingTrack[] = [
      {
        id: 'f',
        type: 'FIXED_UNLINKED',
        balance: 400_000,
        annualRate: 0.04,
        remainingMonths: 200,
        monthsElapsed: 70,
      },
    ];
    const { plan } = refinanceFlow(cheap, true);
    expect(plan.headline).toBe('לא למחזר כרגע.');
  });

  it('sets best-decile negotiation targets and expresses prime as a margin', () => {
    const targets = negotiationTargets(
      [
        { type: 'PRIME', annualRate: 0.06, termMonths: 240 },
        { type: 'FIXED_UNLINKED', annualRate: 0.055, termMonths: 240 },
        { type: 'ELIGIBILITY', annualRate: 0.03, termMonths: 240 },
      ],
      ltv,
      DEFAULT_PRIME,
    );
    expect(targets).toHaveLength(2);
    expect(targets[0]!.targetRate).toBe(rateFor('PRIME', ltv, 240).bestRate);
    expect(targets[0]!.targetMargin).toBeCloseTo(rateFor('PRIME', ltv, 240).bestRate - DEFAULT_PRIME, 10);
    expect(targets[1]!.targetMargin).toBeUndefined();
  });
});

const household: ConsolidationInput = {
  netIncome: 20_000,
  debts: [
    {
      id: 'car',
      kind: 'CAR',
      label: 'רכב',
      balance: 160_000,
      annualRate: 0.09,
      monthlyPayment: 3_300,
      remainingMonths: 56,
      include: true,
    },
    {
      id: 'nb',
      kind: 'NON_BANK',
      label: 'חוץ-בנקאית',
      balance: 70_000,
      annualRate: 0.14,
      monthlyPayment: 1_900,
      remainingMonths: 44,
      include: false,
    },
    {
      id: 'short',
      kind: 'OTHER',
      label: 'קצרה',
      balance: 8_000,
      annualRate: 0.07,
      monthlyPayment: 700,
      remainingMonths: 12,
      include: false,
    },
  ],
  property: {
    value: 2_000_000,
    mortgageBalance: 700_000,
    mortgagePayment: 5_200,
    mortgageRemainingMonths: 240,
    mortgageVariableBalance: 300_000,
    priorAllPurposeBalance: 0,
  },
  terms: {
    termMonths: 60,
    variableRate: DEFAULT_PRIME + 0.012,
    fixedRate: DEFAULT_PRIME + 0.013,
    preferredVariableShare: 0.5,
    extraCash: 0,
    closingCosts: 0,
  },
};

describe('consolidation action plan', () => {
  it('lists what to close and flags an expensive long debt left out', () => {
    const plan = consolidationPlan(analyseConsolidation(household), DEFAULT_PRIME);
    const text = planToText(plan);
    expect(text).toContain('לסגור: רכב');
    expect(text).toContain('שקלו לצרף: חוץ-בנקאית');
    expect(text).toContain('להשאיר: קצרה');
  });

  it('shows the ways back under the 40% policy ceiling when the payment is too high', () => {
    const analysis = analyseConsolidation(household);
    expect(analysis.regulation.bankFeasible).toBe(false);
    const text = planToText(consolidationPlan(analysis, DEFAULT_PRIME));
    expect(text).toContain('במסלול הפטור');
    expect(text).toContain('הארכת התקופה');
    expect(text).toContain('מקטין את F');
    expect(text).toContain('הקטינו את סכום האיחוד');
  });

  it('flags a margin above the usual ceiling for a secured all-purpose loan', () => {
    const plan = consolidationPlan(analyseConsolidation(household), DEFAULT_PRIME);
    const margin = plan.sections.at(-1)!.items.at(-1)!;
    expect(margin.priority).toBe('HIGH');
    expect(margin.detail).toContain('גבוהה מהמקובל');
  });

  it('finds the shortest whole-year term whose payment fits', () => {
    const term = termForPayment(160_000, 0.07, 2_000)!;
    expect(payment(160_000, 0.07 / 12, term)).toBeLessThanOrEqual(2_000);
    expect(payment(160_000, 0.07 / 12, term - 12)).toBeGreaterThan(2_000);
    expect(termForPayment(1_000_000, 0.07, 100)).toBeUndefined();
  });
});
