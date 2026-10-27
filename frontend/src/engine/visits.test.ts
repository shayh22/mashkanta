import { describe, expect, it } from 'vitest';
import { compareVisits, newPublication, type VisitSnapshot } from './visits';

const before: VisitSnapshot = {
  at: '2026-10-20T08:00:00Z',
  market: { prime: 0.05, fixedUnlinked: 0.0462, fixedLinked: 0.0329, variableLinked: 0.0319, housingAsOf: '2026-08' },
  refinance: { monthlySaving: 700, netPresentValue: 80_000 },
  consolidation: { monthlyRelief: 3_300, maxFeasibleLoan: 480_000 },
};

describe('changes since the last visit', () => {
  it('reports rates that moved, good news when they fell', () => {
    const after: VisitSnapshot = { ...before, market: { ...before.market, prime: 0.0475, fixedLinked: 0.0335 } };
    expect(compareVisits(before, after)).toEqual([
      { id: 'prime', label: 'ריבית הפריים', from: 0.05, to: 0.0475, unit: 'rate', tone: 'good' },
      { id: 'fixedLinked', label: 'ממוצע קבועה צמודה', from: 0.0329, to: 0.0335, unit: 'rate', tone: 'bad' },
    ]);
  });

  it('reports the borrower\'s own results, good news when they grew', () => {
    const after: VisitSnapshot = {
      ...before,
      refinance: { monthlySaving: 821, netPresentValue: 87_065 },
      consolidation: { monthlyRelief: 3_200, maxFeasibleLoan: 480_020 },
    };
    expect(compareVisits(before, after).map((change) => [change.id, change.tone])).toEqual([
      ['refinanceSaving', 'good'],
      ['refinanceNpv', 'good'],
      ['consolidationRelief', 'bad'],
    ]);
  });

  it('ignores noise and anything either visit lacks', () => {
    const after: VisitSnapshot = {
      at: '2026-10-26T08:00:00Z',
      market: { ...before.market, prime: 0.05 + 0.0002 },
      refinance: { monthlySaving: 720, netPresentValue: 80_010 },
    };
    expect(compareVisits(before, after)).toEqual([]);
    expect(compareVisits({ ...before, refinance: undefined }, { ...before, refinance: { monthlySaving: 0, netPresentValue: 0 } })).toEqual([]);
  });

  it('notes a new monthly publication of the averages', () => {
    expect(newPublication(before, { ...before, market: { ...before.market, housingAsOf: '2026-09' } })).toBe('2026-09');
    expect(newPublication(before, before)).toBeUndefined();
  });
});

describe('refinance figures for a different proposal', () => {
  const at = '2026-10-20T08:00:00.000Z';
  const market = { prime: 0.06 };
  it('are not reported as a change', () => {
    const before = { at, market, refinance: { monthlySaving: 400, netPresentValue: 30_000, mode: 'AUTO' } };
    const after = { at, market, refinance: { monthlySaving: 1_100, netPresentValue: 95_000, mode: 'OPTIMAL' } };
    expect(compareVisits(before, after)).toEqual([]);
    // Saved before the mode was recorded: not comparable either.
    expect(compareVisits({ at, market, refinance: { monthlySaving: 400, netPresentValue: 30_000 } }, after)).toEqual([]);
  });

  it('are compared as before for the same proposal', () => {
    const before = { at, market, refinance: { monthlySaving: 400, netPresentValue: 30_000, mode: 'OPTIMAL' } };
    const after = { at, market, refinance: { monthlySaving: 1_100, netPresentValue: 95_000, mode: 'OPTIMAL' } };
    expect(compareVisits(before, after).map((change) => change.id)).toEqual(['refinanceSaving', 'refinanceNpv']);
  });
});
