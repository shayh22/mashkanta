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

  it('keeps and un-keeps tracks, and forgets a kept id when its track is removed', () => {
    const id = useRefinance.getState().tracks[1]!.id;
    useRefinance.getState().toggleKept(id);
    expect(useRefinance.getState().keptIds).toEqual([id]);
    useRefinance.getState().toggleKept(id);
    expect(useRefinance.getState().keptIds).toEqual([]);
    useRefinance.getState().toggleKept(id);
    useRefinance.getState().removeTrack(id);
    expect(useRefinance.getState().keptIds).toEqual([]);
  });

  it('drops the bank fee once the borrower changes what is being repaid', () => {
    const track = { ...useRefinance.getState().tracks[0]!, statedFee: 250 };
    useRefinance.getState().setTracks([track]);
    useRefinance.getState().updateTrack(track.id, { monthsElapsed: 70 });
    expect(useRefinance.getState().tracks[0]!.statedFee).toBe(250);
    useRefinance.getState().updateTrack(track.id, { balance: track.balance + 1_000 });
    expect(useRefinance.getState().tracks[0]!.statedFee).toBeUndefined();
  });

  it('starts an import from a clean proposal, whatever mode the borrower was in', () => {
    const state = useRefinance.getState();
    state.setProposalMode('MANUAL', [
      { id: 'old', type: 'PRIME', amount: 1_000_000, annualRate: 0.05, termMonths: 300 },
    ]);
    state.toggleKept(state.tracks[0]!.id);
    state.importTracks([
      {
        id: 'new',
        type: 'PRIME',
        balance: 200_000,
        annualRate: 0.05,
        remainingMonths: 200,
        monthsElapsed: 20,
      },
    ]);
    const after = useRefinance.getState();
    expect(after.proposalMode).toBe('OPTIMAL');
    expect(after.manualProposal).toEqual([]);
    expect(after.keptIds).toEqual([]);
    expect(after.tracks.map((track) => track.id)).toEqual(['new']);
  });
});
