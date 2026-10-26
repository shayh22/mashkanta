import type { ExplainRequest } from './mixExplanation';

/** A synthetic request, shared by the module's tests and the endpoint's. */
export const SAMPLE_REQUEST: ExplainRequest = {
  context: 'NEW_MORTGAGE',
  chosenBy: 'ENGINE',
  loanAmount: 1_680_000,
  termMonths: 300,
  ltv: 0.7,
  pti: 0.31,
  riskTolerance: 5,
  market: { prime: 0.06, inflation: 0.024 },
  mix: {
    initialPayment: 9_800,
    maxPayment: 10_400,
    totalPaid: 3_050_000,
    tracks: [
      { track: 'PRIME', share: 0.33, annualRate: 0.0575, termMonths: 300 },
      { track: 'FIXED_UNLINKED', share: 0.67, annualRate: 0.049, termMonths: 300 },
    ],
  },
  worstStressPayment: 12_100,
  comparisons: [{ id: 'BASKET_THIRDS', initialPayment: 9_500, maxPayment: 11_000, totalPaid: 3_120_000 }],
  ruleBreaches: [],
};
