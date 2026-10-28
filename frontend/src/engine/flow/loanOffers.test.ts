import { describe, expect, it } from 'vitest';
import { priceLoan, rankLoans } from './loanOffers';

describe('loan offers', () => {
  it('prices an offer by its payment, and by everything paid with the fee', () => {
    const loan = priceLoan(50_000, { lender: 'א', annualRate: 0.06, months: 60, fee: 500 })!;
    // The annuity of fifty thousand at 6% over five years.
    expect(loan.monthly).toBeCloseTo(966.64, 1);
    expect(loan.total).toBeCloseTo(966.64 * 60 + 500, 0);
    expect(loan.cost).toBeCloseTo(loan.total - 50_000, 6);
  });

  it('ranks by the total, so a lower payment over longer does not pass for cheaper', () => {
    const short = priceLoan(50_000, { lender: 'קצרה', annualRate: 0.07, months: 48, fee: 0 })!;
    const long = priceLoan(50_000, { lender: 'ארוכה', annualRate: 0.06, months: 120, fee: 0 })!;
    expect(long.monthly).toBeLessThan(short.monthly);
    expect(rankLoans([long, short]).map((loan) => loan.label)).toEqual(['קצרה', 'ארוכה']);
  });

  it('prices nothing it cannot', () => {
    expect(priceLoan(0, { lender: 'א', annualRate: 0.06, months: 60, fee: 0 })).toBeUndefined();
    expect(priceLoan(10_000, { lender: 'א', annualRate: 0.06, months: 0, fee: 0 })).toBeUndefined();
  });
});
