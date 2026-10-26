import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSampleDebts, useConsolidation } from './consolidationStore';
import { browserStorage, storageKey } from './persistence';

/**
 * The homeowner's path in two screens: what they have, then the result. Whether other loans are
 * part of the picture decides between a refinance alone and refinance with consolidation.
 */
interface FlowState {
  /** Undefined until the borrower answers; until then, loans they entered count as a yes. */
  hasDebts?: boolean;
  setHasDebts: (value: boolean) => void;
}

export const useFlow = create<FlowState>()(
  persist(
    (set) => ({
      setHasDebts: (hasDebts) => set({ hasDebts }),
    }),
    { name: storageKey('flow'), version: 1, storage: browserStorage, partialize: (state) => ({ hasDebts: state.hasDebts }) },
  ),
);

/** Whether the household's other loans are part of the check. */
export function useHasDebts(): boolean {
  const answer = useFlow((state) => state.hasDebts);
  const debts = useConsolidation((state) => state.debts);
  return answer ?? (debts.length > 0 && !isSampleDebts(debts));
}
