import type { BorrowerProfileRequest } from '../../lib/types';
import { annuity } from '../money/loanMoves';
import { stabilityOf } from './buyProfile';
import type { Answers } from './flow';

/**
 * A homeowner who typed the mortgage in rather than uploading the bank's report: the balance, the
 * payment and roughly how long is left. That is enough for an estimate — the rate the payment
 * implies, against the mix the engine would build today for the same balance and term — though
 * not for the early-repayment fee, which needs each track's own terms.
 */

/** Months left, from the household's rough answer. */
export const REMAINING_MONTHS: Record<string, number> = { UNDER_10: 96, TEN_20: 180, TWENTY_30: 300, UNKNOWN: 240 };

/** The annual rate at which `payment` repays `balance` in `months`; undefined when no rate between 0 and 20% does. */
export function impliedRate(balance: number, payment: number, months: number): number | undefined {
  if (balance <= 0 || payment <= 0 || months <= 0 || payment * months < balance || annuity(balance, 0.2, months) < payment) {
    return undefined;
  }
  let low = 0;
  let high = 0.2;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (annuity(balance, mid, months) < payment) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

export type RefinanceEstimate =
  | { readonly kind: 'IMPLAUSIBLE' }
  | {
      readonly kind: 'ESTIMATE';
      /** The mortgage as typed: its payment, months left and the rate they imply. */
      readonly current: { readonly balance: number; readonly payment: number; readonly months: number; readonly rate: number };
      /** The engine's input for a new mortgage of the same balance over the same term. */
      readonly profile: BorrowerProfileRequest;
    };

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/** Undefined until the balance, the payment, the home's value and the income are answered. */
export function refinanceEstimate(answers: Answers, defaults: BorrowerProfileRequest): RefinanceEstimate | undefined {
  const balance = num(answers.mortgageBalance);
  const payment = num(answers.mortgagePayment);
  const homeValue = num(answers.homeValue);
  const income = num(answers.netIncome);
  if (balance === undefined || payment === undefined || homeValue === undefined || income === undefined) {
    return undefined;
  }
  const months = REMAINING_MONTHS[answers.mortgageYears as string] ?? REMAINING_MONTHS.UNKNOWN!;
  const rate = impliedRate(balance, payment, months);
  if (rate === undefined) {
    return { kind: 'IMPLAUSIBLE' };
  }
  return {
    kind: 'ESTIMATE',
    current: { balance, payment, months, rate },
    profile: {
      ...defaults,
      propertyValue: homeValue,
      loanAmount: balance,
      // The same term, in whole years: a lower payment from stretching the loan is not a saving.
      termMonths: Math.min(360, Math.max(48, Math.round(months / 12) * 12)),
      segment: 'REFINANCE',
      monthlyNetIncome: income,
      existingMonthlyObligations: 0,
      ...stabilityOf(answers),
      volatilityCapacity: 0,
      liquidityEvents: [],
      eligibilityAmount: 0,
    },
  };
}
