import type { ExplainRequest, ExplainTrack } from '../engine/mixExplanation';
import type { ProposedTrack, RefinanceComparison } from '../engine/refinance';
import type { MacroScenario } from '../engine/scenario';
import type { ProposalMode } from '../store/refinanceStore';
import type { BorrowerProfileRequest, MixProposal, OptimizationResponse } from './types';

/**
 * The figures an AI explanation is given — built from what the engine already computed, and
 * nothing else: no name, no income, nothing the borrower typed as text.
 */

const BASKET_IDS: Record<string, ExplainRequest['comparisons'][number]['id']> = {
  BASKET_1: 'BASKET_FIXED_UNLINKED',
  BASKET_2: 'BASKET_THIRDS',
  BASKET_3: 'BASKET_PRIME_FIXED',
  OPTIMAL: 'ENGINE_OPTIMUM',
};

const figuresOf = (proposal: MixProposal) => ({
  initialPayment: proposal.summary.initialPayment,
  maxPayment: proposal.summary.maxPayment,
  totalPaid: proposal.summary.totalPaid,
});

export function mortgageExplainRequest(result: OptimizationResponse, profile: BorrowerProfileRequest): ExplainRequest {
  const chosen = result.recommended;
  const others = [...(result.engineOptimum ? [result.engineOptimum] : []), ...result.baskets];
  return {
    context: 'NEW_MORTGAGE',
    chosenBy: result.mode === 'MANUAL' ? 'BORROWER' : 'ENGINE',
    loanAmount: chosen.summary.totalPrincipal,
    termMonths: chosen.summary.termMonths,
    ltv: chosen.compliance.ltv,
    pti: chosen.compliance.pti,
    riskTolerance: profile.riskTolerance,
    market: { prime: result.macro.primeAnnual, inflation: result.macro.cpiAnnual },
    mix: {
      ...figuresOf(chosen),
      tracks: chosen.summary.allocations.map((allocation) => ({
        track: allocation.track,
        share: allocation.share,
        annualRate: allocation.annualRate,
        termMonths: allocation.termMonths,
      })),
    },
    worstStressPayment: chosen.stress.worstCase.maxPayment,
    comparisons: others
      .filter((proposal) => BASKET_IDS[proposal.id])
      .map((proposal) => ({ id: BASKET_IDS[proposal.id]!, ...figuresOf(proposal) })),
    ruleBreaches: chosen.compliance.findings.filter((finding) => finding.level === 'BLOCKING').map((finding) => finding.code),
  };
}

const CHOSEN_BY: Record<ProposalMode, ExplainRequest['chosenBy']> = {
  AUTO: 'LIKE_FOR_LIKE',
  OPTIMAL: 'ENGINE',
  MANUAL: 'BORROWER',
};

export function refinanceExplainRequest(
  comparison: RefinanceComparison,
  proposal: readonly ProposedTrack[],
  mode: ProposalMode,
  ltv: number,
  scenario: MacroScenario,
  riskTolerance?: number,
): ExplainRequest {
  const route = comparison[comparison.best === 'INTERNAL' ? 'internal' : 'external'];
  const total = proposal.reduce((sum, track) => sum + Math.max(0, track.amount), 0);
  const tracks: ExplainTrack[] = proposal
    .filter((track) => track.amount > 0)
    .map((track) => ({
      track: track.type,
      share: total > 0 ? track.amount / total : 0,
      annualRate: track.annualRate,
      termMonths: track.termMonths,
    }));
  return {
    context: 'REFINANCE',
    chosenBy: CHOSEN_BY[mode],
    loanAmount: route.proposed.totalPrincipal,
    termMonths: route.proposed.termMonths,
    ltv,
    ...(mode === 'OPTIMAL' && riskTolerance !== undefined ? { riskTolerance } : {}),
    market: { prime: scenario.primeAnnual, inflation: scenario.cpiAnnual },
    mix: {
      initialPayment: route.proposed.initialPayment,
      maxPayment: route.proposed.maxPayment,
      totalPaid: route.proposed.totalPaid,
      tracks,
    },
    comparisons: [
      {
        id: 'CURRENT_MORTGAGE',
        initialPayment: route.current.initialPayment,
        maxPayment: route.current.maxPayment,
        totalPaid: route.current.totalPaid,
      },
    ],
    ruleBreaches: [],
    refinance: {
      verdict: route.verdict,
      netPresentValue: route.netPresentValue,
      breakevenMonths: route.breakevenMonth,
      upfrontCosts: route.upfrontCost,
    },
  };
}
