/**
 * What a loan could do instead of what it does now: keep its schedule, turn into a balloon (only
 * the interest each month, the whole balance at the end), or stretch over more years. Each move is
 * priced by its monthly payment, what is left to pay at the end, and what it costs in all against
 * keeping the loan as it is — a lower payment is never free, and the summary says what it costs.
 */

export type LoanMoveKind = 'KEEP' | 'BALLOON' | 'EXTEND';

export interface LoanTerms {
  readonly balance: number;
  /** Nominal, a year: 0.08 for 8%. */
  readonly annualRate: number;
  readonly remainingMonths: number;
}

export interface LoanMoveResult {
  readonly kind: LoanMoveKind;
  readonly monthly: number;
  readonly months: number;
  /** Paid at the end on top of the last monthly payment: the whole balance, for a balloon. */
  readonly atEnd: number;
  /** Everything paid from now to the end. */
  readonly total: number;
  /** Against keeping the loan: positive costs more. */
  readonly extraCost: number;
}

/** The fixed monthly payment that clears a balance over a number of months (Spitzer). */
export function annuity(balance: number, annualRate: number, months: number): number {
  if (months <= 0 || balance <= 0) {
    return 0;
  }
  const r = annualRate / 12;
  return r === 0 ? balance / months : (balance * r) / (1 - (1 + r) ** -months);
}

export const validTerms = (terms: Partial<LoanTerms>): terms is LoanTerms =>
  typeof terms.balance === 'number' &&
  terms.balance > 0 &&
  typeof terms.annualRate === 'number' &&
  terms.annualRate >= 0 &&
  terms.annualRate < 0.5 &&
  typeof terms.remainingMonths === 'number' &&
  terms.remainingMonths >= 1 &&
  terms.remainingMonths <= 480;

/**
 * The three moves for a loan. Keeping it pays what the statement shows when given, otherwise the
 * schedule the terms imply; a balloon pays the interest a month and the balance at the end, over
 * the same months; extending re-spreads the balance over `extendMonths`.
 */
export function loanMoves(terms: LoanTerms, extendMonths: number, statedPayment?: number): Record<LoanMoveKind, LoanMoveResult> {
  const months = Math.round(terms.remainingMonths);
  const keepMonthly = statedPayment && statedPayment > 0 ? statedPayment : annuity(terms.balance, terms.annualRate, months);
  const keepTotal = keepMonthly * months;
  // What a move costs is measured against the terms themselves: a stated payment above them (an
  // insurance riding on it) would otherwise make a dearer loan look cheaper.
  const termsTotal = annuity(terms.balance, terms.annualRate, months) * months;
  const interestOnly = (terms.balance * terms.annualRate) / 12;
  const balloonTotal = interestOnly * months + terms.balance;
  const longer = Math.round(Math.min(480, Math.max(months + 1, extendMonths)));
  const extendMonthly = annuity(terms.balance, terms.annualRate, longer);
  const extendTotal = extendMonthly * longer;
  return {
    KEEP: { kind: 'KEEP', monthly: keepMonthly, months, atEnd: 0, total: keepTotal, extraCost: 0 },
    BALLOON: { kind: 'BALLOON', monthly: interestOnly, months, atEnd: terms.balance, total: balloonTotal, extraCost: Math.max(0, balloonTotal - termsTotal) },
    EXTEND: { kind: 'EXTEND', monthly: extendMonthly, months: longer, atEnd: 0, total: extendTotal, extraCost: Math.max(0, extendTotal - termsTotal) },
  };
}
