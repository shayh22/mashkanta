import { useMemo } from 'react';
import { create } from 'zustand';
import { analyseCombined, type CombinedMove } from '../engine/combined';
import { bestRoute } from '../lib/routes';
import type { RefinanceComparison } from '../engine/refinance';
import { useConsolidation } from './consolidationStore';
import { useRefinanceAnalysis, type RefinanceView } from './refinanceStore';

interface CombinedSettings {
  /** Roll the refinance's fees and switching costs into the all-purpose loan. */
  financeCosts: boolean;
  setFinanceCosts: (value: boolean) => void;
}

export const useCombinedSettings = create<CombinedSettings>((set) => ({
  financeCosts: true,
  setFinanceCosts: (financeCosts) => set({ financeCosts }),
}));

export interface CombinedView extends RefinanceView {
  comparison?: RefinanceComparison;
  move?: CombinedMove;
}

/**
 * Refinance and consolidation in one move: the mortgage comes from the refinance inputs (or an
 * imported statement), the household and its debts from the consolidation inputs, and the better
 * refinance route is the one taken.
 */
export function useCombinedMove(): CombinedView {
  const refinance = useRefinanceAnalysis();
  const netIncome = useConsolidation((state) => state.netIncome);
  const debts = useConsolidation((state) => state.debts);
  const property = useConsolidation((state) => state.property);
  const terms = useConsolidation((state) => state.terms);
  const financeCosts = useCombinedSettings((state) => state.financeCosts);

  const move = useMemo(() => {
    const comparison = refinance.comparison;
    if (!comparison) {
      return undefined;
    }
    return analyseCombined({ netIncome, debts, property, terms }, bestRoute(comparison), {
      financeUpfrontCosts: financeCosts,
    });
  }, [refinance.comparison, netIncome, debts, property, terms, financeCosts]);

  return { ...refinance, move };
}
