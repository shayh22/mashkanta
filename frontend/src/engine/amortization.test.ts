import { describe, expect, it } from 'vitest';
import { paymentAt, priceMix, priceTrack, yearlySummary } from './amortization';
import { baselineScenario, withShock } from './scenario';
import { trackFromRate, type TrackSpec } from './tracks';

/** Ported from the Java AmortizationEngineTest — identical scenarios, identical expectations. */
describe('amortization engine', () => {
  const baseline = baselineScenario(0.0575, 0.024, 0.042);
  const noInflation = baselineScenario(0.0575, 0, 0.042);

  it('pays a flat instalment on a fixed non-linked Spitzer track and closes at zero', () => {
    const spec = trackFromRate('FIXED_UNLINKED', 1_000_000, 360, 0.05, baseline);
    const result = priceTrack(spec, baseline);

    expect(result.initialPayment).toBeCloseTo(5368.22, 1);
    expect(result.maxPayment).toBeCloseTo(result.initialPayment, 1);
    expect(result.schedule).toHaveLength(360);
    expect(result.schedule[359]!.closingBalance).toBeCloseTo(0, 2);
    expect(result.totalIndexation).toBe(0);
    expect(result.totalPaid).toBeCloseTo(result.amount + result.totalInterest, 0);
  });

  it('repays equal principal every month with falling payments', () => {
    const spec: TrackSpec = {
      type: 'FIXED_UNLINKED',
      amount: 600_000,
      termMonths: 240,
      fixedRate: 0.045,
      margin: 0,
      method: 'EQUAL_PRINCIPAL',
      graceMonths: 0,
    };
    const result = priceTrack(spec, baseline);

    expect(result.schedule[0]!.principal).toBeCloseTo(2500, 2);
    expect(result.schedule[120]!.principal).toBeCloseTo(2500, 2);
    expect(result.schedule[0]!.payment).toBeGreaterThan(result.schedule[239]!.payment);
    expect(result.schedule[239]!.closingBalance).toBeCloseTo(0, 2);

    // Equal principal repays faster, so it always costs less interest than the same Spitzer loan.
    const spitzer = priceTrack(trackFromRate('FIXED_UNLINKED', 600_000, 240, 0.045, baseline), baseline);
    expect(result.totalInterest).toBeLessThan(spitzer.totalInterest);
  });

  it('indexes a CPI-linked track and grows its payment with the index', () => {
    const spec = trackFromRate('FIXED_LINKED', 1_000_000, 300, 0.03, baseline);
    const withInflation = priceTrack(spec, baseline);
    const without = priceTrack(spec, noInflation);

    expect(withInflation.totalIndexation).toBeGreaterThan(0);
    expect(without.totalIndexation).toBeCloseTo(0, 6);
    expect(withInflation.maxPayment).toBeGreaterThan(withInflation.initialPayment);
    expect(withInflation.totalPaid).toBeGreaterThan(without.totalPaid);
    // Inflation inflates the nominal cost but not the real one.
    expect(withInflation.realIrr).toBeCloseTo(without.nominalIrr, 3);
  });

  it('reprices a prime track when the Bank of Israel moves', () => {
    const spec = trackFromRate('PRIME', 500_000, 240, 0.0525, baseline);
    const flat = priceTrack(spec, baseline);
    const shocked = priceTrack(spec, withShock(baseline, 0.02, 0, 1, 'shock'));

    expect(flat.initialRate).toBeCloseTo(0.0525, 9);
    expect(shocked.initialRate).toBeCloseTo(0.0725, 9);
    expect(shocked.initialPayment).toBeGreaterThan(flat.initialPayment);
  });

  it('holds a variable rate for the whole five-year window, then resets', () => {
    const spec = trackFromRate('VARIABLE_UNLINKED', 500_000, 240, 0.0478, baseline);
    const delayed = withShock(baseline, 0.015, 0, 37, 'delayed');
    const result = priceTrack(spec, delayed);

    // The shock lands in month 37 but the rate is fixed until the month-61 reset.
    expect(result.schedule[36]!.annualRate).toBeCloseTo(0.0478, 9);
    expect(result.schedule[59]!.annualRate).toBeCloseTo(0.0478, 9);
    expect(result.schedule[60]!.annualRate).toBeCloseTo(0.0628, 9);
  });

  it('pays interest only during grace, then amortises the full principal', () => {
    const spec: TrackSpec = {
      type: 'FIXED_UNLINKED',
      amount: 400_000,
      termMonths: 240,
      fixedRate: 0.05,
      margin: 0,
      method: 'GRACE',
      graceMonths: 24,
    };
    const result = priceTrack(spec, baseline);

    expect(result.schedule[0]!.principal).toBe(0);
    expect(result.schedule[23]!.closingBalance).toBeCloseTo(400_000, 2);
    expect(result.schedule[24]!.principal).toBeGreaterThan(0);
    expect(result.schedule[239]!.closingBalance).toBeCloseTo(0, 2);
  });

  it('capitalises interest into the final payment of a balloon', () => {
    const spec: TrackSpec = {
      type: 'FIXED_UNLINKED',
      amount: 300_000,
      termMonths: 24,
      fixedRate: 0.06,
      margin: 0,
      method: 'BALLOON',
      graceMonths: 0,
    };
    const result = priceTrack(spec, baseline);

    expect(result.initialPayment).toBe(0);
    // 300,000 compounding monthly at 6% for two years.
    expect(result.finalPayment).toBeCloseTo(300_000 * Math.pow(1 + 0.06 / 12, 24), 0);
    expect(result.totalPaid).toBeCloseTo(result.finalPayment, 2);
  });

  it('sums a mix month by month', () => {
    const specs = [
      trackFromRate('PRIME', 400_000, 240, 0.0525, baseline),
      trackFromRate('FIXED_UNLINKED', 600_000, 240, 0.0495, baseline),
    ];
    const mix = priceMix(specs, baseline);
    const prime = priceTrack(specs[0]!, baseline);
    const fixed = priceTrack(specs[1]!, baseline);

    expect(mix.totalPrincipal).toBe(1_000_000);
    expect(mix.initialPayment).toBeCloseTo(prime.initialPayment + fixed.initialPayment, 2);
    expect(mix.weightedInitialRate).toBeCloseTo(0.4 * 0.0525 + 0.6 * 0.0495, 9);
    expect(yearlySummary(mix)).toHaveLength(20);
    expect(yearlySummary(mix)[19]!.remainingBalance).toBeCloseTo(0, 1);
  });

  it('leaves the household paying only the longer track when terms differ', () => {
    const mix = priceMix(
      [
        trackFromRate('FIXED_UNLINKED', 300_000, 120, 0.045, baseline),
        trackFromRate('FIXED_UNLINKED', 700_000, 300, 0.0495, baseline),
      ],
      baseline,
    );

    expect(mix.termMonths).toBe(300);
    expect(paymentAt(mix, 120)).toBeGreaterThan(paymentAt(mix, 121));
    expect(paymentAt(mix, 301)).toBe(0);
  });
});
