import { useMemo } from 'react';
import { priceMix } from '../../engine/amortization';
import type { Answers } from '../../engine/flow/flow';
import { priceOffer, rankOffers, type MortgageOffer, type PricedOffer } from '../../engine/flow/offers';
import { proposedSpecs } from '../../engine/refinance';
import { scenarioOf } from '../../lib/api';
import type { MixSummary } from '../../lib/types';
import { useMarketVersion } from '../../store/marketVersion';
import { useQuestionnaire } from '../../store/questionnaireStore';
import { isSampleTracks, useRefinance, useRefinanceAnalysis } from '../../store/refinanceStore';
import { useWizard } from '../../store/wizardStore';
import { useBuyResult, useRefinanceEstimate } from './hooks';

/** The banks' offers for a goal, priced and ranked, with the calculator's own mix among them. */

const MARKET = 'התמהיל של המחשבון';

const fromSummary = (label: string, summary: MixSummary): PricedOffer => ({
  label,
  amount: summary.totalPrincipal,
  initialPayment: summary.initialPayment,
  maxPayment: summary.maxPayment,
  totalPaid: summary.totalPaid,
  cost: summary.totalInterest + summary.totalIndexation,
  rate: summary.weightedInitialRate,
});

/** The calculator's own mix for the goal, priced like an offer; undefined until it is worked out. */
function useMarketMix(goal: MortgageOffer['for'], answers: Answers): PricedOffer | undefined {
  const { result: buy } = useBuyResult(goal === 'BUY' ? answers : {});
  const { result: estimate } = useRefinanceEstimate(goal === 'REFINANCE' ? answers : {});
  const tracks = useRefinance((state) => state.tracks);
  const { proposal } = useRefinanceAnalysis();
  const macro = useWizard((state) => state.macro);
  const market = useMarketVersion();
  return useMemo(() => {
    if (goal === 'BUY') {
      return buy.data ? fromSummary(MARKET, buy.data.recommended.summary) : undefined;
    }
    if (isSampleTracks(tracks)) {
      return estimate.data ? fromSummary(MARKET, estimate.data.recommended.summary) : undefined;
    }
    const scenario = scenarioOf(macro);
    const specs = proposedSpecs(proposal, scenario);
    if (specs.length === 0) {
      return undefined;
    }
    const mix = priceMix(specs, scenario);
    return {
      label: MARKET,
      amount: mix.totalPrincipal,
      initialPayment: mix.initialPayment,
      maxPayment: mix.maxPayment,
      totalPaid: mix.totalPaid,
      cost: mix.totalInterest + mix.totalIndexation,
      rate: mix.weightedInitialRate,
    };
    // market: the scenario reads the live market table.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal, buy.data, estimate.data, tracks, proposal, macro, market]);
}

/** The offers for one goal, priced and ranked, with the calculator's mix among them. */
export function useRankedOffers(goal: MortgageOffer['for'], answers: Answers) {
  const offers = useQuestionnaire((state) => state.offers);
  const macro = useWizard((state) => state.macro);
  const marketVersion = useMarketVersion();
  const marketMix = useMarketMix(goal, answers);
  const priced = useMemo(() => {
    const scenario = scenarioOf(macro);
    return offers
      .filter((offer) => offer.for === goal)
      .flatMap((offer) => {
        const each = priceOffer(offer, scenario);
        return each ? [{ ...each, id: offer.id }] : [];
      });
    // marketVersion: the scenario reads the live market table.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers, goal, macro, marketVersion]);
  const ranked = rankOffers([...priced, ...(marketMix ? [{ ...marketMix, id: 'market' }] : [])]);
  return { priced, marketMix, ranked };
}

