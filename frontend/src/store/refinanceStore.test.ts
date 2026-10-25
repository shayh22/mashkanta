import { beforeEach, describe, expect, it } from 'vitest';
import { compareRoutes } from '../engine/refinance';
import { scenarioOf } from '../lib/api';
import { outstandingBalance, tracksValid, useRefinance } from './refinanceStore';

describe('refinance store', () => {
  beforeEach(() => useRefinance.getState().reset());

  it('ships a default mortgage the engine can analyse end to end', () => {
    const state = useRefinance.getState();
    expect(tracksValid(state.tracks)).toBe(true);
    const scenario = scenarioOf();
    const cheaper = state.tracks.map((track) => ({
      id: track.id,
      type: track.type,
      amount: track.balance,
      annualRate: track.annualRate - 0.01,
      termMonths: track.remainingMonths,
    }));
    const comparison = compareRoutes(state.tracks, cheaper, state.routes, {
      scenario,
      discountRate: state.discountRate,
      ltv: outstandingBalance(state.tracks) / state.propertyValue,
      noticeGiven: state.noticeGiven,
      dayOfMonth: state.dayOfMonth,
      cpiAnnual: scenario.cpiAnnual,
    });
    expect(comparison.internal.monthlySaving).toBeGreaterThan(0);
  });

  it('seeds the manual proposal from the automatic one only when it is empty', () => {
    const seed = [{ id: 'x', type: 'PRIME' as const, amount: 1, annualRate: 0.05, termMonths: 12 }];
    useRefinance.getState().setProposalMode('MANUAL', seed);
    expect(useRefinance.getState().manualProposal).toEqual(seed);
    useRefinance.getState().setProposalMode('MANUAL', [{ ...seed[0]!, id: 'y' }]);
    expect(useRefinance.getState().manualProposal[0]!.id).toBe('x');
  });

  it('rejects incomplete tracks and clamps the repayment day', () => {
    const { tracks, updateTrack, setDayOfMonth } = useRefinance.getState();
    updateTrack(tracks[0]!.id, { remainingMonths: 0 });
    expect(tracksValid(useRefinance.getState().tracks)).toBe(false);
    setDayOfMonth(45);
    expect(useRefinance.getState().dayOfMonth).toBe(31);
  });

  it('edits one route without touching the other', () => {
    useRefinance.getState().setRouteCost('EXTERNAL', { appraisal: 3_000 });
    const { routes } = useRefinance.getState();
    expect(routes.EXTERNAL.costs.appraisal).toBe(3_000);
    expect(routes.INTERNAL.costs.appraisal).toBe(0);
  });
});
