import { describe, expect, it } from 'vitest';
import { baselineScenario } from '../scenario';
import { priceOffer, rankOffers } from './offers';

const scenario = baselineScenario(0.06, 0.025, 0.035);

describe('the banks’ offers', () => {
  it('prices an offer like the engine’s own mix: the first payment, the worst, and the cost over the loan', () => {
    const priced = priceOffer({ bank: 'בנק א', tracks: [{ type: 'FIXED_UNLINKED', amount: 1_000_000, annualRate: 0.05, termMonths: 300 }] }, scenario)!;
    expect(priced.amount).toBe(1_000_000);
    // A fixed, unlinked track: one payment throughout, the annuity of a million at 5% over 25 years.
    expect(priced.initialPayment).toBeCloseTo(5_846, 0);
    expect(priced.maxPayment).toBeCloseTo(priced.initialPayment, 0);
    expect(priced.cost).toBeCloseTo(priced.totalPaid - 1_000_000, 0);
    expect(priced.rate).toBeCloseTo(0.05, 6);
  });

  it('leaves out tracks it cannot price, and an offer with none', () => {
    expect(priceOffer({ bank: 'בנק א', tracks: [{ type: 'PRIME', amount: 0, annualRate: 0.05, termMonths: 300 }] }, scenario)).toBeUndefined();
    expect(priceOffer({ bank: 'בנק א', tracks: [{ type: 'FIXED_UNLINKED', amount: 500_000, annualRate: 0.4, termMonths: 300 }] }, scenario)).toBeUndefined();
  });

  it('ranks by what each shekel borrowed costs, so different amounts still compare', () => {
    const cheap = priceOffer({ bank: 'זול', tracks: [{ type: 'FIXED_UNLINKED', amount: 1_200_000, annualRate: 0.045, termMonths: 300 }] }, scenario)!;
    const dear = priceOffer({ bank: 'יקר', tracks: [{ type: 'FIXED_UNLINKED', amount: 800_000, annualRate: 0.052, termMonths: 300 }] }, scenario)!;
    // The cheaper one costs more in shekels, being larger, and still comes first.
    expect(cheap.cost).toBeGreaterThan(dear.cost);
    expect(rankOffers([dear, cheap]).map((offer) => offer.label)).toEqual(['זול', 'יקר']);
  });
});
