import { describe, expect, it } from 'vitest';
import { paymentAt } from '../amortization';
import { baselineScenario } from '../scenario';
import { SHOCK_MONTH, whatIf } from './whatIf';

const base = baselineScenario(0.06, 0.025, 0.04);

describe('what if', () => {
  it('leaves a fixed, unlinked track as it is, whatever happens', () => {
    const result = whatIf([{ type: 'FIXED_UNLINKED', amount: 500_000, annualRate: 0.05, termMonths: 300 }], base, 0.03, 0.06)!;
    expect(paymentAt(result.shocked, SHOCK_MONTH + 1)).toBeCloseTo(paymentAt(result.base, SHOCK_MONTH + 1), 0);
    expect(result.shocked.totalPaid).toBeCloseTo(result.base.totalPaid, 0);
  });

  it('raises a prime track’s payment from a year on when prime rises, and not before', () => {
    const result = whatIf([{ type: 'PRIME', amount: 500_000, annualRate: 0.055, termMonths: 300 }], base, 0.02, base.cpiAnnual)!;
    expect(paymentAt(result.shocked, 1)).toBeCloseTo(paymentAt(result.base, 1), 0);
    expect(paymentAt(result.shocked, SHOCK_MONTH + 1)).toBeGreaterThan(paymentAt(result.base, SHOCK_MONTH + 1) + 400);
  });

  it('makes a linked track dearer when inflation runs higher', () => {
    const result = whatIf([{ type: 'FIXED_LINKED', amount: 500_000, annualRate: 0.035, termMonths: 300 }], base, 0, 0.05)!;
    expect(result.shocked.totalPaid).toBeGreaterThan(result.base.totalPaid);
    expect(result.shocked.maxPayment).toBeGreaterThan(result.base.maxPayment);
  });
});
