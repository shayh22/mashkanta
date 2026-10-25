import { describe, expect, it } from 'vitest';
import { payment, presentValue } from './math';
import {
  futureCashFlows,
  monthsToReset,
  nextDiscountStep,
  PREPAYMENT,
  quotePrepayment,
  quoteTrack,
  seniorityDiscount,
  type ExistingTrack,
  type PrepaymentOptions,
} from './prepayment';

const options: PrepaymentOptions = { noticeGiven: false, dayOfMonth: 20, cpiAnnual: 0.024 };

const fixed = (patch: Partial<ExistingTrack> = {}): ExistingTrack => ({
  id: 't1',
  type: 'FIXED_UNLINKED',
  balance: 500_000,
  annualRate: 0.05,
  remainingMonths: 240,
  monthsElapsed: 24,
  ...patch,
});

describe('seniority discount', () => {
  it('follows the Order table for a regular bank loan', () => {
    expect(seniorityDiscount(0)).toBe(0);
    expect(seniorityDiscount(35)).toBe(0);
    expect(seniorityDiscount(36)).toBe(0.2);
    expect(seniorityDiscount(59)).toBe(0.2);
    expect(seniorityDiscount(60)).toBe(0.3);
    expect(seniorityDiscount(200)).toBe(0.3);
  });

  it('uses the steeper schedule for bank money lent alongside a directed loan', () => {
    expect(seniorityDiscount(11, true)).toBe(0);
    expect(seniorityDiscount(12, true)).toBe(0.1);
    expect(seniorityDiscount(24, true)).toBe(0.2);
    expect(seniorityDiscount(36, true)).toBe(0.3);
    expect(seniorityDiscount(48, true)).toBe(0.4);
    expect(seniorityDiscount(100, true)).toBe(0.4);
  });

  it('reports how far away the next step is', () => {
    expect(nextDiscountStep(30)).toEqual({ months: 6, discount: 0.2 });
    expect(nextDiscountStep(40)).toEqual({ months: 20, discount: 0.3 });
    expect(nextDiscountStep(60)).toBeUndefined();
  });
});

describe('capitalization fee', () => {
  it('equals the present value gap when the market rate has fallen', () => {
    const track = fixed();
    const quote = quoteTrack(track, 0.04, options);
    const level = payment(500_000, 0.05 / 12, 240);
    const expected = presentValue(level, 0.04 / 12, 240) - presentValue(level, 0.05 / 12, 240);
    expect(quote.grossCapitalizationFee).toBeCloseTo(expected, 4);
    // Discounting a 5% annuity at 5% gives back its principal.
    expect(presentValue(level, 0.05 / 12, 240)).toBeCloseTo(500_000, 4);
    expect(quote.seniorityDiscount).toBe(0);
    expect(quote.capitalizationFee).toBeCloseTo(expected, 4);
  });

  it('applies the seniority discount', () => {
    const young = quoteTrack(fixed({ monthsElapsed: 24 }), 0.04, options);
    const old = quoteTrack(fixed({ monthsElapsed: 72 }), 0.04, options);
    expect(old.capitalizationFee).toBeCloseTo(young.grossCapitalizationFee * 0.7, 4);
  });

  it('measures against the lower of the loan rate and the origination average', () => {
    // Loan at 5%, origination average 4.2%, market 4.5%: market is above the reference, so no fee.
    const quote = quoteTrack(fixed({ originationAverageRate: 0.042 }), 0.045, options);
    expect(quote.referenceRate).toBe(0.042);
    expect(quote.capitalizationFee).toBe(0);
  });

  it('charges nothing when rates have risen, and the gain offsets the other fees', () => {
    const quote = quoteTrack(fixed(), 0.06, options);
    expect(quote.capitalizationFee).toBe(0);
    expect(quote.noticeFee).toBe(0);
    expect(quote.borrowerGainOffset).toBeCloseTo(500, 6);
  });

  it('exempts prime and directed loans', () => {
    const prime = quoteTrack(fixed({ type: 'PRIME' }), 0.03, options);
    expect(prime.capitalizationFee).toBe(0);
    expect(prime.noticeFee).toBeCloseTo(500, 6);
    expect(prime.exemption).toBeDefined();

    const directed = quoteTrack(fixed({ type: 'ELIGIBILITY' }), 0.01, options);
    expect(directed.total).toBe(0);
  });

  it('stops a variable track at its next reset and adds the balance as the last flow', () => {
    const track: ExistingTrack = fixed({ type: 'VARIABLE_UNLINKED', monthsElapsed: 40 });
    expect(monthsToReset(track)).toBe(20);
    const flows = futureCashFlows(track);
    expect(flows).toHaveLength(20);
    expect(flows[19]).toBeGreaterThan(400_000);
    expect(flows[0]).toBeCloseTo(payment(500_000, 0.05 / 12, 240), 6);
  });

  it('charges only the operational fee on a variable track repaid on its reset date', () => {
    const quote = quotePrepayment([fixed({ type: 'VARIABLE_LINKED', monthsElapsed: 60 })], () => 0.01, {
      ...options,
      dayOfMonth: 1,
    });
    expect(quote.total).toBe(PREPAYMENT.OPERATIONAL_FEE);
  });
});

describe('notice, CPI and operational fees', () => {
  it('waives the notice fee when notice was given', () => {
    expect(quoteTrack(fixed(), 0.05, options).noticeFee).toBeCloseTo(500, 6);
    expect(quoteTrack(fixed(), 0.05, { ...options, noticeGiven: true }).noticeFee).toBe(0);
  });

  it('charges the average-CPI fee only on linked tracks repaid on days 1–15', () => {
    const linked = fixed({ type: 'FIXED_LINKED', annualRate: 0.03 });
    const early = quoteTrack(linked, 0.03, { ...options, dayOfMonth: 10 });
    const late = quoteTrack(linked, 0.03, { ...options, dayOfMonth: 16 });
    const monthly = Math.pow(1.024, 1 / 12) - 1;
    expect(early.cpiFee).toBeCloseTo(0.5 * monthly * 500_000, 6);
    expect(late.cpiFee).toBe(0);
    expect(quoteTrack(fixed(), 0.05, { ...options, dayOfMonth: 10 }).cpiFee).toBe(0);
  });

  it('adds the operational fee once per repayment, not per track', () => {
    const quote = quotePrepayment([fixed({ id: 'a' }), fixed({ id: 'b' })], () => 0.05, {
      ...options,
      noticeGiven: true,
    });
    expect(quote.operationalFee).toBe(60);
    expect(quote.total).toBe(60);
  });
});
