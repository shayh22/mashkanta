import type { BorrowerProfileRequest, BuyerSegment } from '../../lib/types';
import { SEGMENT_MAX_LTV } from '../regulatory';
import type { Answers } from './flow';

/**
 * A buyer's answers as the mix engine's input. What the questionnaire does not ask — the term, the
 * eligibility loan's rate — comes from the engine's defaults; how much a monthly swing the household
 * can take is left to the engine to infer from its income.
 */

const SEGMENTS: readonly BuyerSegment[] = ['FIRST_HOME', 'UPGRADER', 'INVESTOR'];

/** "Stable or cheap?" as the engine's risk tolerance (1–10) and its split between prime, fixed and variable. */
export const STABILITY: Record<string, Pick<BorrowerProfileRequest, 'riskTolerance' | 'primePreference' | 'stablePreference' | 'dynamicPreference'>> = {
  STABLE: { riskTolerance: 3, primePreference: 0.15, stablePreference: 0.7, dynamicPreference: 0.15 },
  BALANCED: { riskTolerance: 5, primePreference: 0.25, stablePreference: 0.5, dynamicPreference: 0.25 },
  CHEAP: { riskTolerance: 8, primePreference: 0.45, stablePreference: 0.3, dynamicPreference: 0.25 },
};

export const stabilityOf = (answers: Answers) => STABILITY[answers.stability as string] ?? STABILITY.BALANCED!;

export type BuyPlan =
  /** The equity covers the price: there is no mortgage to price. */
  | { readonly kind: 'NO_LOAN'; readonly spare: number }
  | {
      readonly kind: 'LOAN';
      readonly profile: BorrowerProfileRequest;
      /** The loan the price and equity call for, and how far it is above the segment's ceiling. */
      readonly needed: number;
      readonly equityShort: number;
    };

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/** Undefined until the price, the kind of home, the equity and the income are answered. */
export function buyPlan(answers: Answers, defaults: BorrowerProfileRequest): BuyPlan | undefined {
  const price = num(answers.propertyValue);
  const equity = num(answers.equity);
  const income = num(answers.netIncome);
  const segment = SEGMENTS.find((each) => each === answers.segment);
  if (price === undefined || equity === undefined || income === undefined || !segment) {
    return undefined;
  }
  const needed = Math.round(price - equity);
  if (needed <= 0) {
    return { kind: 'NO_LOAN', spare: Math.max(0, -needed) };
  }
  // The bank lends at most the segment's share of the price; what is above it, the equity must cover.
  const ceiling = Math.floor(price * SEGMENT_MAX_LTV[segment]);
  const loanAmount = Math.min(needed, ceiling);
  const eligibility = answers.hasEligibility === 'YES' ? Math.min(num(answers.eligibilityAmount) ?? 0, loanAmount) : 0;
  return {
    kind: 'LOAN',
    needed,
    equityShort: Math.max(0, needed - ceiling),
    profile: {
      ...defaults,
      propertyValue: price,
      loanAmount,
      // Changed on the details screen; the engine's default until then.
      ...(num(answers.termYears) !== undefined && num(answers.termYears)! >= 4 && num(answers.termYears)! <= 30
        ? { termMonths: Math.round(num(answers.termYears)!) * 12 }
        : {}),
      segment,
      monthlyNetIncome: income,
      existingMonthlyObligations: answers.hasObligations === 'YES' ? (num(answers.obligations) ?? 0) : 0,
      ...stabilityOf(answers),
      // Left to the engine: a share of what the income leaves after the payment.
      volatilityCapacity: 0,
      liquidityEvents: [],
      eligibilityAmount: eligibility,
    },
  };
}
