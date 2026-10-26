import { describe, expect, it } from 'vitest';
import { rateFor } from './baseline';
import { scoreOffer } from './opportunity';
import { likeForLikeProposal } from './refinance';
import { baselineScenario, DEFAULT_PRIME } from './scenario';
import { trackFromRate } from './tracks';

describe('prime-relative market rates', () => {
  it('moves the prime distribution one for one with prime and leaves other tracks alone', () => {
    const atDefault = rateFor('PRIME', 0.5, 300);
    const lower = rateFor('PRIME', 0.5, 300, DEFAULT_PRIME - 0.01);
    expect(lower.medianRate).toBeCloseTo(atDefault.medianRate - 0.01, 12);
    expect(lower.bestRate).toBeCloseTo(atDefault.bestRate - 0.01, 12);
    expect(rateFor('FIXED_UNLINKED', 0.5, 300, 0.03)).toEqual(rateFor('FIXED_UNLINKED', 0.5, 300));
    expect(rateFor('PRIME', 0.5, 300, DEFAULT_PRIME)).toBe(atDefault);
  });

  it('scores the same margin the same way whatever prime is', () => {
    const score = (prime: number) => {
      const scenario = baselineScenario(prime);
      const offer = trackFromRate('PRIME', 500_000, 300, prime - 0.006, scenario);
      return scoreOffer([offer], 0.5, scenario).marketPercentile;
    };
    expect(score(0.0475)).toBeCloseTo(score(DEFAULT_PRIME), 10);
  });

  it('proposes prime at the market margin over the prime in force', () => {
    const track = {
      id: 'p',
      type: 'PRIME' as const,
      balance: 300_000,
      annualRate: 0.0425,
      remainingMonths: 280,
      monthsElapsed: 70,
    };
    const [atDefault] = likeForLikeProposal([track], 0.4, 0.3);
    const [atLower] = likeForLikeProposal([track], 0.4, 0.3, new Set(), 0.0475);
    expect(atLower!.annualRate).toBeCloseTo(atDefault!.annualRate - 0.01, 12);
  });
});
