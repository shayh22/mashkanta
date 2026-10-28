import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buyPlan, stabilityOf } from '../../engine/flow/buyProfile';
import type { Answers } from '../../engine/flow/flow';
import { refinanceEstimate } from '../../engine/flow/refinancePlan';
import { optimize } from '../../lib/api';
import { useConsolidation } from '../../store/consolidationStore';
import { useMarket } from '../../store/marketStore';
import { useRefinance } from '../../store/refinanceStore';
import { DEFAULT_PROFILE, useWizard } from '../../store/wizardStore';

/**
 * The questionnaire's results, computed once and shared by the result and its details: the same
 * query key, so opening the details does not run the engine again.
 */

export function useBuyResult(answers: Answers) {
  const macro = useWizard((state) => state.macro);
  const market = useMarket((state) => state.version);
  const plan = useMemo(() => buyPlan(answers, DEFAULT_PROFILE), [answers]);
  const profile = plan?.kind === 'LOAN' ? plan.profile : undefined;
  const result = useQuery({
    queryKey: ['flow-buy', profile, macro, market],
    queryFn: () => optimize(profile!, macro, 0.5),
    enabled: !!profile,
    staleTime: Infinity,
    retry: false,
  });
  return { plan, result };
}

export function useRefinanceEstimate(answers: Answers) {
  const macro = useWizard((state) => state.macro);
  const market = useMarket((state) => state.version);
  const estimate = useMemo(() => refinanceEstimate(answers, DEFAULT_PROFILE), [answers]);
  const profile = estimate?.kind === 'ESTIMATE' ? estimate.profile : undefined;
  const result = useQuery({
    queryKey: ['flow-refinance', profile, macro, market],
    queryFn: () => optimize(profile!, macro, 0.5),
    enabled: !!profile,
    staleTime: Infinity,
    retry: false,
  });
  return { estimate, result };
}

/** The answers the homeowner's analysis reads — the home's value, the income, the appetite for risk — entered once. */
export function useRefinanceAnswers(answers: Answers) {
  useEffect(() => {
    if (typeof answers.homeValue === 'number') {
      useRefinance.getState().setPropertyValue(answers.homeValue);
    }
    if (typeof answers.netIncome === 'number') {
      useConsolidation.getState().setNetIncome(answers.netIncome);
    }
    const stability = stabilityOf(answers);
    const wizard = useWizard.getState();
    wizard.setProfile({ riskTolerance: stability.riskTolerance });
    wizard.setPreferences(stability.primePreference, stability.stablePreference, stability.dynamicPreference);
  }, [answers]);
}
