import { beforeEach, describe, expect, it } from 'vitest';
import { validateExplainRequest } from '../engine/mixExplanation';
import { compareRoutes, likeForLikeProposal, withKeptTracks } from '../engine/refinance';
import { optimalRefinance } from '../engine/refinanceOptimal';
import { outstandingBalance, useRefinance, type ProposalMode } from '../store/refinanceStore';
import { useWizard } from '../store/wizardStore';
import { optimize, scenarioOf } from './api';
import { mortgageExplainRequest, refinanceExplainRequest } from './explainRequest';

/**
 * The requests built here go to `/api/explain`, whose validator refuses anything out of shape. These
 * tests build them from real engine output and run them through that same validator, so a figure
 * the app produces can never be one the Worker turns away.
 */

beforeEach(() => {
  useWizard.getState().reset();
  useRefinance.getState().reset();
});

describe('explaining a new mortgage', () => {
  it("passes the Worker's validator unchanged for the engine's mix", async () => {
    const profile = useWizard.getState().profile;
    const request = mortgageExplainRequest(await optimize(profile), profile);
    expect(validateExplainRequest(request)).toEqual(request);
    expect(request.chosenBy).toBe('ENGINE');
    expect(request.comparisons.map((c) => c.id)).toEqual(['BASKET_FIXED_UNLINKED', 'BASKET_THIRDS', 'BASKET_PRIME_FIXED']);
    expect(request.mix.tracks.reduce((sum, track) => sum + track.share, 0)).toBeCloseTo(1, 6);
  });

  it("marks a hand-built mix as the borrower's, measures it against the engine, and names its breaches", async () => {
    const profile = useWizard.getState().profile;
    const result = await optimize(profile, undefined, 0.5, { PRIME: 0.8, FIXED_UNLINKED: 0.2 });
    const request = mortgageExplainRequest(result, profile);
    expect(validateExplainRequest(request)).toEqual(request);
    expect(request.chosenBy).toBe('BORROWER');
    expect(request.comparisons[0]!.id).toBe('ENGINE_OPTIMUM');
    expect(request.ruleBreaches).toEqual(expect.arrayContaining(['PRIME_SHARE', 'VARIABLE_SHARE', 'FIXED_FLOOR']));
  });
});

describe('explaining a refinance', () => {
  const analyse = (mode: ProposalMode) => {
    const state = useRefinance.getState();
    const scenario = scenarioOf();
    const ltv = outstandingBalance(state.tracks) / state.propertyValue;
    const proposal =
      mode === 'OPTIMAL'
        ? withKeptTracks(
            optimalRefinance(state.tracks, new Set(), state.propertyValue, useWizard.getState().profile, state.percentile, scenario)!
              .proposal,
            state.tracks,
            new Set(),
          )
        : likeForLikeProposal(state.tracks, ltv, state.percentile, new Set(), scenario.primeAnnual);
    const comparison = compareRoutes(state.tracks, proposal, state.routes, {
      scenario,
      discountRate: state.discountRate,
      ltv,
      noticeGiven: state.noticeGiven,
      dayOfMonth: state.dayOfMonth,
      cpiAnnual: scenario.cpiAnnual,
    });
    return refinanceExplainRequest(comparison, proposal, mode, ltv, scenario, 5);
  };

  it.each(['OPTIMAL', 'AUTO'] as const)('passes the validator for the %s proposal', (mode) => {
    const request = analyse(mode);
    expect(validateExplainRequest(request)).toEqual(request);
    expect(request.context).toBe('REFINANCE');
    expect(request.comparisons.map((c) => c.id)).toEqual(['CURRENT_MORTGAGE']);
    expect(request.mix.tracks.reduce((sum, track) => sum + track.share, 0)).toBeCloseTo(1, 6);
  });

  it("says who chose the mix, and sends the risk tolerance only for the engine's choice", () => {
    expect(analyse('OPTIMAL')).toMatchObject({ chosenBy: 'ENGINE', riskTolerance: 5 });
    const sameMix = analyse('AUTO');
    expect(sameMix.chosenBy).toBe('LIKE_FOR_LIKE');
    expect(sameMix.riskTolerance).toBeUndefined();
  });
});
