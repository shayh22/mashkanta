import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  analyseConsolidation,
  recommendDebt,
  type ConsolidationAnalysis,
  type ConsolidationTerms,
  type ConsumerDebt,
  type PropertyPosition,
} from '../engine/consolidation';
import { DEFAULT_PRIME } from '../engine/scenario';
import { browserStorage, storageKey, uniqueId } from './persistence';

const newDebtId = () => uniqueId('d');

/** Prime plus a typical all-purpose margin, and a fixed rate a little above it. */
export const DEFAULT_TERMS: ConsolidationTerms = {
  termMonths: 180,
  // Bank of Israel averages for consumer loans secured on a home, August 2026: unlinked variable
  // about prime + 1.5, unlinked fixed 6.61%.
  variableRate: DEFAULT_PRIME + 0.015,
  fixedRate: 0.0661,
  preferredVariableShare: 0.5,
  extraCash: 0,
  closingCosts: 2_500,
};

const DEFAULT_DEBTS: ConsumerDebt[] = [
  {
    id: newDebtId(),
    kind: 'CAR',
    label: 'הלוואת רכב',
    balance: 95_000,
    annualRate: 0.089,
    monthlyPayment: 2_350,
    remainingMonths: 48,
    include: true,
  },
  {
    id: newDebtId(),
    kind: 'NON_BANK',
    label: 'הלוואה חוץ-בנקאית',
    balance: 60_000,
    annualRate: 0.135,
    monthlyPayment: 1_650,
    remainingMonths: 46,
    include: true,
  },
  {
    id: newDebtId(),
    kind: 'OVERDRAFT',
    label: 'מינוס קבוע',
    balance: 25_000,
    annualRate: 0.115,
    monthlyPayment: 900,
    remainingMonths: 36,
    include: true,
  },
  {
    id: newDebtId(),
    kind: 'CREDIT_CARD',
    label: 'עסקת קרדיט',
    balance: 9_000,
    annualRate: 0.12,
    monthlyPayment: 820,
    remainingMonths: 12,
    include: false,
  },
];

const DEFAULT_PROPERTY: PropertyPosition = {
  value: 2_200_000,
  mortgageBalance: 820_000,
  mortgagePayment: 5_400,
  mortgageRemainingMonths: 252,
  mortgageVariableBalance: 380_000,
  priorAllPurposeBalance: 0,
};

interface ConsolidationState {
  netIncome: number;
  debts: ConsumerDebt[];
  property: PropertyPosition;
  terms: ConsolidationTerms;
  /** Share of the monthly relief paid back into the loan in the shortening simulator. */
  reinvestShare: number;

  setNetIncome: (value: number) => void;
  setProperty: (patch: Partial<PropertyPosition>) => void;
  setTerms: (patch: Partial<ConsolidationTerms>) => void;
  addDebt: () => void;
  updateDebt: (id: string, patch: Partial<ConsumerDebt>) => void;
  removeDebt: (id: string) => void;
  /** Includes every debt the engine recommends consolidating and leaves the rest out. */
  applyRecommendations: (blendedRate: number) => void;
  setReinvestShare: (share: number) => void;
  reset: () => void;
}

const INITIAL = {
  netIncome: 26_000,
  debts: DEFAULT_DEBTS,
  property: DEFAULT_PROPERTY,
  terms: DEFAULT_TERMS,
  reinvestShare: 0.5,
};

export const useConsolidation = create<ConsolidationState>()(
  persist(
    (set) => ({
      ...INITIAL,
      setNetIncome: (netIncome) => set({ netIncome: Math.max(0, netIncome) }),
      setProperty: (patch) => set((state) => ({ property: { ...state.property, ...patch } })),
      setTerms: (patch) => set((state) => ({ terms: { ...state.terms, ...patch } })),
      addDebt: () =>
        set((state) => ({
          debts: [
            ...state.debts,
            {
              id: newDebtId(),
              kind: 'OTHER',
              label: 'הלוואה נוספת',
              balance: 30_000,
              annualRate: 0.09,
              monthlyPayment: 950,
              remainingMonths: 36,
              include: true,
            },
          ],
        })),
      updateDebt: (id, patch) =>
        set((state) => ({
          debts: state.debts.map((debt) => (debt.id === id ? { ...debt, ...patch } : debt)),
        })),
      removeDebt: (id) => set((state) => ({ debts: state.debts.filter((debt) => debt.id !== id) })),
      applyRecommendations: (blendedRate) =>
        set((state) => ({
          debts: state.debts.map((debt) => ({
            ...debt,
            include: recommendDebt(debt, blendedRate).action === 'CONSOLIDATE',
          })),
        })),
      setReinvestShare: (reinvestShare) => set({ reinvestShare: Math.min(1, Math.max(0, reinvestShare)) }),
      reset: () => set(INITIAL),
    }),
    {
      name: storageKey('consolidation'),
      version: 1,
      storage: browserStorage,
      partialize: (state) => ({
        netIncome: state.netIncome,
        debts: state.debts,
        property: state.property,
        terms: state.terms,
        reinvestShare: state.reinvestShare,
      }),
    },
  ),
);

/** The analysis, recomputed only when an input changes. */
export function useConsolidationAnalysis(): ConsolidationAnalysis {
  const netIncome = useConsolidation((state) => state.netIncome);
  const debts = useConsolidation((state) => state.debts);
  const property = useConsolidation((state) => state.property);
  const terms = useConsolidation((state) => state.terms);
  return useMemo(
    () => analyseConsolidation({ netIncome, debts, property, terms }),
    [netIncome, debts, property, terms],
  );
}
