import { annuity } from '../money/loanMoves';

/**
 * Loan offers side by side: for the same amount, each lender's rate, term and opening fee make a
 * monthly payment and a total — the total is what ranks them, since a longer term lowers the
 * payment and raises the cost.
 */

export interface LoanOffer {
  readonly id: string;
  readonly lender: string;
  /** Nominal, a year: 0.08 for 8%. */
  readonly annualRate: number;
  readonly months: number;
  /** Paid once, at the start. */
  readonly fee: number;
}

export interface PricedLoan {
  readonly label: string;
  readonly monthly: number;
  readonly months: number;
  /** Every payment and the fee. */
  readonly total: number;
  /** Above the amount borrowed: interest and fee. */
  readonly cost: number;
}

export const validLoan = (offer: Pick<LoanOffer, 'annualRate' | 'months' | 'fee'>) =>
  offer.annualRate >= 0 && offer.annualRate < 0.5 && offer.months >= 1 && offer.months <= 480 && offer.fee >= 0;

export function priceLoan(amount: number, offer: Pick<LoanOffer, 'lender' | 'annualRate' | 'months' | 'fee'>): PricedLoan | undefined {
  if (amount <= 0 || !validLoan(offer)) {
    return undefined;
  }
  const monthly = annuity(amount, offer.annualRate, offer.months);
  const total = monthly * offer.months + offer.fee;
  return { label: offer.lender, monthly, months: offer.months, total, cost: total - amount };
}

/** Cheapest over the loan first. */
export const rankLoans = <T extends PricedLoan>(loans: readonly T[]): T[] => [...loans].sort((a, b) => a.total - b.total);
