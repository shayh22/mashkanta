import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { scenarioOf } from '../lib/api';
import type { ExistingTrack } from '../engine/prepayment';
import {
  compareRoutes,
  DEFAULT_ROUTES,
  likeForLikeProposal,
  type ProposedTrack,
  type RefinanceComparison,
  type RefinanceRoute,
  type RouteKind,
  type SwitchingCosts,
} from '../engine/refinance';
import { useWizard } from './wizardStore';
import { browserStorage, storageKey, uniqueId } from './persistence';

export type ProposalMode = 'AUTO' | 'MANUAL';

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
  noticeGiven: boolean;
  dayOfMonth: number;
  discountRate: number;
  routes: Record<RouteKind, RefinanceRoute>;

  setPropertyValue: (value: number) => void;
  setTracks: (tracks: ExistingTrack[]) => void;
  addTrack: () => void;
  updateTrack: (id: string, patch: Partial<ExistingTrack>) => void;
  removeTrack: (id: string) => void;
  setProposalMode: (mode: ProposalMode, seed?: ProposedTrack[]) => void;
  setPercentile: (percentile: number) => void;
  updateProposed: (id: string, patch: Partial<ProposedTrack>) => void;
  addProposed: () => void;
  removeProposed: (id: string) => void;
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
  proposalMode: 'AUTO' as ProposalMode,
  percentile: 0.3,
  manualProposal: [] as ProposedTrack[],
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
          tracks: state.tracks.map((track) => (track.id === id ? { ...track, ...patch } : track)),
        })),
      removeTrack: (id) => set((state) => ({ tracks: state.tracks.filter((track) => track.id !== id) })),

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
      version: 1,
      storage: browserStorage,
      partialize: (state) => ({
        propertyValue: state.propertyValue,
        tracks: state.tracks,
        proposalMode: state.proposalMode,
        percentile: state.percentile,
        manualProposal: state.manualProposal,
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
}

/** The whole analysis, recomputed only when an input changes. It takes a few milliseconds. */
export function useRefinanceAnalysis(): RefinanceView {
  const state = useRefinance();
  const macro = useWizard((wizard) => wizard.macro);

  return useMemo(() => {
    const balance = outstandingBalance(state.tracks);
    const ltv = state.propertyValue > 0 ? balance / state.propertyValue : 0;
    const proposal =
      state.proposalMode === 'AUTO'
        ? likeForLikeProposal(state.tracks, ltv, state.percentile)
        : state.manualProposal;
    if (!tracksValid(state.tracks) || proposal.length === 0) {
      return { ltv, balance, proposal };
    }
    const scenario = scenarioOf(macro);
    const comparison = compareRoutes(state.tracks, proposal, state.routes, {
      scenario,
      discountRate: state.discountRate,
      ltv,
      noticeGiven: state.noticeGiven,
      dayOfMonth: state.dayOfMonth,
      cpiAnnual: scenario.cpiAnnual,
    });
    return { ltv, balance, proposal, comparison };
  }, [
    state.tracks,
    state.propertyValue,
    state.proposalMode,
    state.percentile,
    state.manualProposal,
    state.routes,
    state.discountRate,
    state.noticeGiven,
    state.dayOfMonth,
    macro,
  ]);
}
