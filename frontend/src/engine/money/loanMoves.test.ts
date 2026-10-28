import { describe, expect, it } from 'vitest';
import { annuity, loanMoves, validTerms } from './loanMoves';

describe('moves for a loan', () => {
  it('prices the schedule as a Spitzer annuity', () => {
    // 100,000 at 6% over 10 years: 1,110.21 a month.
    expect(annuity(100_000, 0.06, 120)).toBeCloseTo(1_110.21, 2);
    expect(annuity(12_000, 0, 12)).toBe(1_000);
    expect(annuity(0, 0.05, 12)).toBe(0);
  });

  it('prices what a move costs against the terms, not a stated payment above them', () => {
    const terms = { balance: 100_000, annualRate: 0.06, remainingMonths: 24 };
    const plain = loanMoves(terms, 60);
    const stated = loanMoves(terms, 60, 6_000);
    expect(stated.KEEP.monthly).toBe(6_000);
    expect(stated.BALLOON.extraCost).toBeCloseTo(plain.BALLOON.extraCost, 6);
    expect(stated.EXTEND.extraCost).toBeCloseTo(plain.EXTEND.extraCost, 6);
    expect(loanMoves({ ...terms, annualRate: 0 }, 60).EXTEND.extraCost).toBe(0);
  });

  it('a balloon pays only the interest, and the whole balance at the end', () => {
    const moves = loanMoves({ balance: 100_000, annualRate: 0.06, remainingMonths: 24 }, 60);
    expect(moves.BALLOON.monthly).toBeCloseTo(500, 6);
    expect(moves.BALLOON.atEnd).toBe(100_000);
    expect(moves.BALLOON.total).toBeCloseTo(500 * 24 + 100_000, 6);
    // Lower now, dearer in all.
    expect(moves.BALLOON.monthly).toBeLessThan(moves.KEEP.monthly);
    expect(moves.BALLOON.extraCost).toBeGreaterThan(0);
  });

  it('extending lowers the payment and costs more interest', () => {
    const moves = loanMoves({ balance: 100_000, annualRate: 0.06, remainingMonths: 24 }, 60);
    expect(moves.EXTEND.months).toBe(60);
    expect(moves.EXTEND.monthly).toBeCloseTo(annuity(100_000, 0.06, 60), 6);
    expect(moves.EXTEND.monthly).toBeLessThan(moves.KEEP.monthly);
    expect(moves.EXTEND.extraCost).toBeGreaterThan(0);
    // Never shorter than the loan already is.
    expect(loanMoves({ balance: 100_000, annualRate: 0.06, remainingMonths: 24 }, 12).EXTEND.months).toBe(25);
  });

  it('keeps the payment the statement shows, when there is one', () => {
    const moves = loanMoves({ balance: 60_000, annualRate: 0.05, remainingMonths: 20 }, 48, 3_208);
    expect(moves.KEEP.monthly).toBe(3_208);
    expect(moves.KEEP.total).toBe(3_208 * 20);
  });

  it('accepts only terms that can be priced', () => {
    expect(validTerms({ balance: 1, annualRate: 0.05, remainingMonths: 12 })).toBe(true);
    expect(validTerms({ balance: 0, annualRate: 0.05, remainingMonths: 12 })).toBe(false);
    expect(validTerms({ balance: 1, annualRate: 0.7, remainingMonths: 12 })).toBe(false);
    expect(validTerms({ balance: 1, annualRate: 0.05 })).toBe(false);
  });
});
