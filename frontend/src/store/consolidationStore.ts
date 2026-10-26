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
import type { LiveMarket } from '../engine/boiMarket';
import { liveMarket } from '../engine/liveMarket';
import { DEFAULT_PRIME } from '../engine/scenario';
import { browserStorage, storageKey, uniqueId } from './persistence';
import { useMarketVersion } from './marketVersion';
import { ALL_PURPOSE_MARGIN } from '../engine/actionPlan';

export const newDebtId = () => uniqueId('d');

/** The offered all-purpose loan rates: the live published averages when known, else August 2026's. */
export function allPurposeRates(market?: LiveMarket): Pick<ConsolidationTerms, 'variableRate' | 'fixedRate'> {
  // Bank of Israel averages for loans secured on a home, unlinked: variable as prime plus the
  // average margin, fixed as published. Seeded at August 2026 (about prime + 1.5, fixed 6.61%).
  const prime = market?.prime?.value ?? DEFAULT_PRIME;
  return {
    variableRate: prime + (market?.allPurpose?.variableMarginOverPrime ?? ALL_PURPOSE_MARGIN.ceiling),
    fixedRate: market?.allPurpose?.fixedUnlinked ?? 0.0661,
  };
}

export const DEFAULT_TERMS: ConsolidationTerms = {
  termMonths: 180,
  ...allPurposeRates(),
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
  /** Debts read from a document: added to the list, or replacing it. */
  importDebts: (debts: ConsumerDebt[], replace: boolean) => void;
  /** Includes every debt the engine recommends consolidating and leaves the rest out. */
  applyRecommendations: (blendedRate: number) => void;
  setReinvestShare: (share: number) => void;
  /**
   * Moves the offered rates from one market's averages to another's — but only while they are
   * still the previous averages, so rates the borrower typed in from a real offer are never touched.
   */
  syncMarketRates: (previous: ReturnType<typeof allPurposeRates>, next: ReturnType<typeof allPurposeRates>) => void;
  reset: () => void;
}

/**
 * Version 1 seeded the offered rates at the old prime (5.75%): 6.50% variable, 6.85% fixed.
 * Untouched, they would never match a later default and so never follow the market; move them to
 * today's defaults. Rates the borrower changed are kept.
 */
export function migrateConsolidation(persisted: unknown, version: number): unknown {
  const state = persisted as { terms?: ConsolidationTerms } | undefined;
  const terms = state?.terms;
  const legacy =
    terms && Math.abs(terms.variableRate - 0.065) < 1e-6 && Math.abs(terms.fixedRate - 0.0685) < 1e-6;
  return version < 2 && legacy ? { ...state, terms: { ...terms, ...allPurposeRates() } } : persisted;
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
      syncMarketRates: (previous, next) =>
        set((state) => {
          const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;
          const untouched =
            same(state.terms.variableRate, previous.variableRate) && same(state.terms.fixedRate, previous.fixedRate);
          return untouched ? { terms: { ...state.terms, ...next } } : {};
        }),
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
      importDebts: (debts, replace) => set((state) => ({ debts: replace ? debts : [...state.debts, ...debts] })),
      applyRecommendations: (blendedRate) =>
        set((state) => ({
          debts: state.debts.map((debt) => ({
            ...debt,
            include: recommendDebt(debt, blendedRate).action === 'CONSOLIDATE',
          })),
        })),
      setReinvestShare: (reinvestShare) => set({ reinvestShare: Math.min(1, Math.max(0, reinvestShare)) }),
      reset: () => set({ ...INITIAL, terms: { ...DEFAULT_TERMS, ...allPurposeRates(liveMarket()) } }),
    }),
    {
      name: storageKey('consolidation'),
      version: 2,
      migrate: (persisted, version) => migrateConsolidation(persisted, version) as ConsolidationState,
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
  const marketVersion = useMarketVersion();
  return useMemo(
    () => analyseConsolidation({ netIncome, debts, property, terms }),
    // marketVersion is not read in the body: debts are measured against the live consumer-loan
    // average, and this is how a change to it reaches the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [netIncome, debts, property, terms, marketVersion],
  );
}
