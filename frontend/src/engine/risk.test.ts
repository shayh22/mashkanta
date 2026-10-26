import { describe, expect, it } from 'vitest';
import { cpiRisk, levelOf, ltvRisk, overallRisk, primeRisk, ptiRisk } from './risk';

describe('risk indicators', () => {
  it('switches level strictly above each threshold', () => {
    expect(levelOf(0.4, 0.4, 0.5)).toBe('LOW');
    expect(levelOf(0.4001, 0.4, 0.5)).toBe('MEDIUM');
    expect(levelOf(0.5, 0.4, 0.5)).toBe('MEDIUM');
    expect(levelOf(0.5001, 0.4, 0.5)).toBe('HIGH');
  });

  it('uses the Directive 329 thresholds', () => {
    expect(ltvRisk(0.5).level).toBe('LOW');
    expect(ltvRisk(0.6).level).toBe('MEDIUM');
    expect(ltvRisk(0.71).level).toBe('HIGH');
    expect(ptiRisk(0.45).level).toBe('MEDIUM');
    expect(primeRisk(2 / 3).level).toBe('MEDIUM');
    expect(primeRisk(0.7).level).toBe('HIGH');
    expect(cpiRisk(0.2).level).toBe('LOW');
  });

  it('pins a non-finite ratio to the top of the dial and reports the worst level overall', () => {
    expect(ptiRisk(Infinity).value).toBe(0.7);
    expect(ptiRisk(Infinity).level).toBe('HIGH');
    expect(overallRisk([ltvRisk(0.3), ptiRisk(0.45)])).toBe('MEDIUM');
    expect(overallRisk([ltvRisk(0.3), cpiRisk(0.1)])).toBe('LOW');
    expect(overallRisk([ltvRisk(0.9), cpiRisk(0.1)])).toBe('HIGH');
  });
});
