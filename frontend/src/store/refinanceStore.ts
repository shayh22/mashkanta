import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { scenarioOf } from '../lib/api';
import { useMarketVersion } from './marketStore';
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
  proposalMode: 'AUTO' as ProposalMode,
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
      importTracks: (tracks) => set({ tracks, keptIds: [], manualProposal: [], proposalMode: 'AUTO' }),
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
}

/** The whole analysis, recomputed only when an input changes. It takes a few milliseconds. */
export function useRefinanceAnalysis(): RefinanceView {
  const state = useRefinance();
  const macro = useWizard((wizard) => wizard.macro);
  const marketVersion = useMarketVersion();

  return useMemo(() => {
    const balance = outstandingBalance(state.tracks);
    const ltv = state.propertyValue > 0 ? balance / state.propertyValue : 0;
    const kept = new Set(state.keptIds);
    const scenario = scenarioOf(macro);
    const proposal =
      state.proposalMode === 'AUTO'
        ? likeForLikeProposal(state.tracks, ltv, state.percentile, kept, scenario.primeAnnual)
        : withKeptTracks(state.manualProposal, state.tracks, kept);
    if (!tracksValid(state.tracks) || proposal.length === 0) {
      return { ltv, balance, proposal, perTrack: [] };
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
    return { ltv, balance, proposal, comparison, perTrack };
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
  ]);
}
