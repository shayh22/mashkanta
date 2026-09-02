import { describe, expect, it } from 'vitest';
import { annualise, irr, monthlyRate, payment, presentValue } from './math';

/** Ported from the Java MortgageMathTest — the same assertions must hold in both engines. */
describe('mortgage math', () => {
  it('matches the standard annuity formula', () => {
    // ₪1,000,000 at 5% nominal over 30 years is a textbook 5,368.22 a month.
    expect(payment(1_000_000, 0.05 / 12, 360)).toBeCloseTo(5368.22, 2);
  });

  it('amortises the principal evenly at a zero rate', () => {
    expect(payment(120_000, 0, 120)).toBe(1_000);
  });

  it('inverts the payment calculation', () => {
    const pmt = payment(800_000, 0.04 / 12, 240);
    expect(presentValue(pmt, 0.04 / 12, 240)).toBeCloseTo(800_000, 2);
  });

  it('gives an IRR equal to the effective annual rate of a plain loan', () => {
    const periodic = monthlyRate(0.05);
    const pmt = payment(1_000_000, periodic, 360);
    const payments = new Array<number>(360).fill(pmt);

    expect(irr(1_000_000, payments)).toBeCloseTo(annualise(periodic), 6);
  });

  it('returns zero rather than a wrong answer on degenerate input', () => {
    expect(irr(0, [100])).toBe(0);
    expect(irr(100_000, [])).toBe(0);
  });
});
