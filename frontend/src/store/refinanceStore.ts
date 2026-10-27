import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { scenarioOf } from '../lib/api';
import { useMarketVersion } from './marketVersion';
import type { ExistingTrack } from '../engine/prepayment';
import {
  compareRoutes,
  trackByTrack,
  withKeptTracks,
  type TrackVerdict,
  DEFAULT_ROUTES,
  likeForLikeProposal,
  type ProposedTrack,
  type RefinanceComparison,
  type RouteAnalysis,
  type RefinanceRoute,
  type RouteKind,
  type SwitchingCosts,
} from '../engine/refinance';
import { optimalRefinance, type Household, type OptimalRefinance } from '../engine/refinanceOptimal';
import type { MacroScenario } from '../engine/scenario';
import { useWizard } from './wizardStore';
import { useConsolidation, useConsolidationAnalysis } from './consolidationStore';
import { useHasDebts } from './flowStore';
import { bestRoute } from '../lib/routes';
import { browserStorage, storageKey, uniqueId } from './persistence';

/** AUTO: the same tracks at market prices. OPTIMAL: a new mix chosen by the engine. MANUAL: a quote typed in. */
export type ProposalMode = 'AUTO' | 'OPTIMAL' | 'MANUAL';

/** Row ids key React lists and pair an existing track with its proposed replacement. */
export const newTrackId = () => uniqueId('t');

const DEFAULT_TRACKS: ExistingTrack[] = [
  {
    id: newTrackId(),
    type: 'PRIME',
    balance: 420_000,
    annualRate: 0.0625,
    remainingMonths: 264,
    monthsElapsed: 48,
  },
  {
    id: newTrackId(),
    type: 'FIXED_UNLINKED',
    balance: 380_000,
    annualRate: 0.061,
    remainingMonths: 264,
    monthsElapsed: 48,
  },
  {
    id: newTrackId(),
    type: 'FIXED_LINKED',
    balance: 260_000,
    annualRate: 0.039,
    remainingMonths: 204,
    monthsElapsed: 48,
  },
];

interface RefinanceState {
  propertyValue: number;
  tracks: ExistingTrack[];
  proposalMode: ProposalMode;
  /** Where in the market distribution the automatic proposal is priced; 0.3 is a negotiated deal. */
  percentile: number;
  manualProposal: ProposedTrack[];
  /** Tracks left as they are in a partial refinance. */
  keptIds: string[];
  noticeGiven: boolean;
  dayOfMonth: number;
  discountRate: number;
  routes: Record<RouteKind, RefinanceRoute>;

  setPropertyValue: (value: number) => void;
  setTracks: (tracks: ExistingTrack[]) => void;
  /** Replaces the whole mortgage, as an import does: selections and quoted proposals no longer apply. */
  importTracks: (tracks: ExistingTrack[]) => void;
  addTrack: () => void;
  updateTrack: (id: string, patch: Partial<ExistingTrack>) => void;
  removeTrack: (id: string) => void;
  setProposalMode: (mode: ProposalMode, seed?: ProposedTrack[]) => void;
  /** A bank's offer read from a document: it becomes the proposal, in place of anything typed before. */
  importOffer: (tracks: ProposedTrack[]) => void;
  setPercentile: (percentile: number) => void;
  updateProposed: (id: string, patch: Partial<ProposedTrack>) => void;
  addProposed: () => void;
  removeProposed: (id: string) => void;
  toggleKept: (id: string) => void;
  setKeptIds: (ids: string[]) => void;
  setNoticeGiven: (value: boolean) => void;
  setDayOfMonth: (value: number) => void;
  setDiscountRate: (value: number) => void;
  setRouteCost: (kind: RouteKind, patch: Partial<SwitchingCosts>) => void;
  setRouteDelta: (kind: RouteKind, rateDelta: number) => void;
  reset: () => void;
}

const INITIAL = {
  propertyValue: 2_300_000,
  tracks: DEFAULT_TRACKS,
  // The engine's own choice of mix, so the result always shows a mix chosen for the borrower.
  proposalMode: 'OPTIMAL' as ProposalMode,
  percentile: 0.3,
  manualProposal: [] as ProposedTrack[],
  keptIds: [] as string[],
  noticeGiven: true,
  dayOfMonth: 20,
  discountRate: 0.04,
  routes: DEFAULT_ROUTES,
};

export const useRefinance = create<RefinanceState>()(
  persist(
    (set) => ({
      ...INITIAL,

      setPropertyValue: (propertyValue) => set({ propertyValue }),
      setTracks: (tracks) => set({ tracks }),
      importTracks: (tracks) => set({ tracks, keptIds: [], manualProposal: [], proposalMode: 'OPTIMAL' }),
      addTrack: () =>
        set((state) => ({
          tracks: [
            ...state.tracks,
            {
              id: newTrackId(),
              type: 'FIXED_UNLINKED',
              balance: 200_000,
              annualRate: 0.055,
              remainingMonths: 240,
              monthsElapsed: 36,
            },
          ],
        })),
      updateTrack: (id, patch) =>
        set((state) => ({
          tracks: state.tracks.map((track) => {
            if (track.id !== id) {
              return track;
            }
            const updated = { ...track, ...patch };
            // The bank's stated fee was for the track as it appeared on the statement; once the
            // borrower changes what is being repaid, the fee falls back to the estimate.
            const repriced = (['type', 'balance', 'annualRate', 'remainingMonths'] as const).some(
              (key) => key in patch && patch[key] !== track[key],
            );
            return repriced ? { ...updated, statedFee: undefined } : updated;
          }),
        })),
      removeTrack: (id) =>
        set((state) => ({
          tracks: state.tracks.filter((track) => track.id !== id),
          keptIds: state.keptIds.filter((kept) => kept !== id),
        })),
      toggleKept: (id) =>
        set((state) => ({
          keptIds: state.keptIds.includes(id)
            ? state.keptIds.filter((kept) => kept !== id)
            : [...state.keptIds, id],
        })),
      setKeptIds: (keptIds) => set({ keptIds }),

      setProposalMode: (proposalMode, seed) =>
        set((state) => ({
          proposalMode,
          // Switching to manual starts from the automatic proposal, so the borrower edits a sensible
          // mix rather than an empty table.
          manualProposal:
            proposalMode === 'MANUAL' && state.manualProposal.length === 0 && seed
              ? seed
              : state.manualProposal,
        })),
      importOffer: (manualProposal) => set({ manualProposal, proposalMode: 'MANUAL' }),
      setPercentile: (percentile) => set({ percentile }),
      updateProposed: (id, patch) =>
        set((state) => ({
          manualProposal: state.manualProposal.map((track) =>
            track.id === id ? { ...track, ...patch } : track,
          ),
        })),
      addProposed: () =>
        set((state) => ({
          manualProposal: [
            ...state.manualProposal,
            { id: newTrackId(), type: 'FIXED_UNLINKED', amount: 100_000, annualRate: 0.05, termMonths: 240 },
          ],
        })),
      removeProposed: (id) =>
        set((state) => ({ manualProposal: state.manualProposal.filter((track) => track.id !== id) })),

      setNoticeGiven: (noticeGiven) => set({ noticeGiven }),
      setDayOfMonth: (dayOfMonth) => set({ dayOfMonth: Math.min(31, Math.max(1, Math.round(dayOfMonth))) }),
      setDiscountRate: (discountRate) => set({ discountRate }),
      setRouteCost: (kind, patch) =>
        set((state) => ({
          routes: {
            ...state.routes,
            [kind]: { ...state.routes[kind], costs: { ...state.routes[kind].costs, ...patch } },
          },
        })),
      setRouteDelta: (kind, rateDelta) =>
        set((state) => ({ routes: { ...state.routes, [kind]: { ...state.routes[kind], rateDelta } } })),
      reset: () => set(INITIAL),
    }),
    {
      name: storageKey('refinance'),
      version: 2,
      storage: browserStorage,
      // Version 1 defaulted to re-pricing the same mix; the engine's choice is the default now.
      migrate: (persisted, version) => {
        const state = persisted as { proposalMode?: ProposalMode } | undefined;
        return version < 2 && state?.proposalMode === 'AUTO' ? { ...state, proposalMode: 'OPTIMAL' } : (persisted as object);
      },
      partialize: (state) => ({
        propertyValue: state.propertyValue,
        tracks: state.tracks,
        proposalMode: state.proposalMode,
        percentile: state.percentile,
        manualProposal: state.manualProposal,
        keptIds: state.keptIds,
        noticeGiven: state.noticeGiven,
        dayOfMonth: state.dayOfMonth,
        discountRate: state.discountRate,
        routes: state.routes,
      }),
    },
  ),
);

export function outstandingBalance(tracks: readonly ExistingTrack[]): number {
  return tracks.reduce((sum, track) => sum + Math.max(0, track.balance), 0);
}

/** True when every track has the numbers the engine needs. */
export function tracksValid(tracks: readonly ExistingTrack[]): boolean {
  return (
    tracks.length > 0 &&
    tracks.every((track) => track.balance > 0 && track.annualRate >= 0 && track.remainingMonths >= 1)
  );
}

export interface RefinanceView {
  ltv: number;
  balance: number;
  proposal: ProposedTrack[];
  comparison?: RefinanceComparison;
  /** Each track refinanced on its own at the current bank. */
  perTrack: TrackVerdict[];
  /** The engine's run: the proposal itself in OPTIMAL mode, the yardstick in the others. */
  optimal?: OptimalRefinance;
  /** When the proposal is not the engine's (an offer, or the same mix), the engine's mix priced the same way. */
  engine?: RouteAnalysis;
}

/**
 * The optimal-mix search takes a tenth of a second, and several views ask for the same one (the
 * result screen, the "since your last visit" banner). The last answer is kept and reused while its
 * inputs, and the market table it was priced against, are unchanged.
 */
let lastOptimal: { key: string; value: OptimalRefinance | undefined } | undefined;
function cachedOptimalRefinance(
  marketVersion: number,
  tracks: readonly ExistingTrack[],
  kept: ReadonlySet<string>,
  propertyValue: number,
  household: Household,
  percentile: number,
  scenario: MacroScenario,
): OptimalRefinance | undefined {
  const key = JSON.stringify([marketVersion, tracks, [...kept].sort(), propertyValue, household, percentile, scenario]);
  if (lastOptimal?.key !== key) {
    lastOptimal = { key, value: optimalRefinance(tracks, kept, propertyValue, household, percentile, scenario) ?? undefined };
  }
  return lastOptimal.value;
}

/** The whole analysis, recomputed only when an input changes. It takes a few milliseconds. */
export function useRefinanceAnalysis(): RefinanceView {
  const state = useRefinance();
  const macro = useWizard((wizard) => wizard.macro);
  // The household behind the optimal mix: income from the homeowner's inputs, appetite for risk as
  // set in the wizard, and the monthly payments that sit beside the mortgage — the loans that stay,
  // and the all-purpose loan that replaces the ones being consolidated. Only these fields are read,
  // so typing elsewhere in the wizard does not re-run the search.
  const riskTolerance = useWizard((wizard) => wizard.profile.riskTolerance);
  const volatilityCapacity = useWizard((wizard) => wizard.profile.volatilityCapacity);
  const primePreference = useWizard((wizard) => wizard.profile.primePreference);
  const stablePreference = useWizard((wizard) => wizard.profile.stablePreference);
  const dynamicPreference = useWizard((wizard) => wizard.profile.dynamicPreference);
  const netIncome = useConsolidation((consolidation) => consolidation.netIncome);
  const debts = useConsolidation((consolidation) => consolidation.debts);
  const consolidation = useConsolidationAnalysis();
  const hasDebts = useHasDebts();
  const consolidationPayment = hasDebts && consolidation.included.length > 0 ? consolidation.allocation.payment : 0;
  const household = useMemo(
    () => ({
      riskTolerance,
      volatilityCapacity,
      primePreference,
      stablePreference,
      dynamicPreference,
      monthlyNetIncome: netIncome,
      existingMonthlyObligations: hasDebts
        ? debts.filter((debt) => !debt.include).reduce((sum, debt) => sum + Math.max(0, debt.monthlyPayment), 0) +
          consolidationPayment
        : 0,
    }),
    [riskTolerance, volatilityCapacity, primePreference, stablePreference, dynamicPreference, netIncome, debts, hasDebts, consolidationPayment],
  );
  const marketVersion = useMarketVersion();

  // The search takes a tenth of a second, so it runs only on its own inputs. It runs in every mode:
  // an offer or the same mix re-priced is always shown against what the engine would choose.
  const optimal = useMemo(
    () =>
      cachedOptimalRefinance(
        marketVersion,
        state.tracks,
        new Set(state.keptIds),
        state.propertyValue,
        household,
        state.percentile,
        scenarioOf(macro),
      ),
    [state.tracks, state.keptIds, state.propertyValue, household, state.percentile, macro, marketVersion],
  );

  return useMemo(() => {
    const balance = outstandingBalance(state.tracks);
    const ltv = state.propertyValue > 0 ? balance / state.propertyValue : 0;
    const kept = new Set(state.keptIds);
    const scenario = scenarioOf(macro);
    const proposal =
      state.proposalMode === 'AUTO'
        ? likeForLikeProposal(state.tracks, ltv, state.percentile, kept, scenario.primeAnnual)
        : state.proposalMode === 'OPTIMAL'
          ? withKeptTracks(optimal?.proposal ?? [], state.tracks, kept)
          : withKeptTracks(state.manualProposal, state.tracks, kept);
    if (!tracksValid(state.tracks) || proposal.length === 0) {
      return { ltv, balance, proposal, perTrack: [], optimal };
    }
    const options = {
      scenario,
      discountRate: state.discountRate,
      ltv,
      noticeGiven: state.noticeGiven,
      dayOfMonth: state.dayOfMonth,
      cpiAnnual: scenario.cpiAnnual,
    };
    const comparison = compareRoutes(state.tracks, proposal, state.routes, options);
    const perTrack = trackByTrack(state.tracks, state.percentile, options);
    const engine =
      state.proposalMode !== 'OPTIMAL' && optimal
        ? bestRoute(compareRoutes(state.tracks, withKeptTracks(optimal.proposal, state.tracks, kept), state.routes, options))
        : undefined;
    return { ltv, balance, proposal, comparison, perTrack, optimal, engine };
    // marketVersion is not read in the body: the engine prices against the live market table, and
    // this is how a change to that table reaches the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.tracks,
    state.propertyValue,
    state.proposalMode,
    state.percentile,
    state.manualProposal,
    state.keptIds,
    state.routes,
    state.discountRate,
    state.noticeGiven,
    state.dayOfMonth,
    macro,
    marketVersion,
    optimal,
  ]);
}
