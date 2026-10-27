import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { marketAverageFor, trackByTrack } from '../engine/refinance';
import type { PlanTrack } from '../engine/planRequest';
import { analyseTrackPlan, isGoodRate, KEEP, type TrackAction, type TrackPlanResult } from '../engine/trackPlan';
import { scenarioOf } from '../lib/api';
import { useMarketVersion } from './marketVersion';
import { browserStorage, storageKey } from './persistence';
import { outstandingBalance, tracksValid, useRefinance } from './refinanceStore';
import { useWizard } from './wizardStore';

/**
 * The borrower's own plan for the mortgage, track by track. Until they change something, the plan
 * follows the per-track verdicts: refinance a track where that pays, keep it where it does not.
 */
interface TrackPlanState {
  /** Actions the borrower chose, by track id; a track not here follows its verdict. */
  actions: Record<string, TrackAction>;
  setAction: (id: string, action: TrackAction) => void;
  /** A whole plan at once — from the AI box, or a reset (an empty plan). */
  replace: (actions: Record<string, TrackAction>) => void;
}

export const useTrackPlanStore = create<TrackPlanState>()(
  persist(
    (set) => ({
      actions: {},
      setAction: (id, action) => set((state) => ({ actions: { ...state.actions, [id]: action } })),
      replace: (actions) => set({ actions }),
    }),
    { name: storageKey('track-plan'), version: 1, storage: browserStorage, partialize: (state) => ({ actions: state.actions }) },
  ),
);

export interface TrackPlanView {
  /** The action each live track takes, the borrower's or its verdict's. */
  readonly actions: Readonly<Record<string, TrackAction>>;
  /** Tracks whose action is the verdict's, not the borrower's. */
  readonly suggested: ReadonlySet<string>;
  /** Tracks cheaper than today's market for their kind and term. */
  readonly goodRate: ReadonlySet<string>;
  readonly result?: TrackPlanResult;
  /** The live tracks as the AI box describes them, in order; `trackIds[i]` is `planTracks[i]`'s id. */
  readonly planTracks: readonly PlanTrack[];
  readonly trackIds: readonly string[];
}

export function useTrackPlan(): TrackPlanView {
  const chosen = useTrackPlanStore((state) => state.actions);
  const tracks = useRefinance((state) => state.tracks);
  const propertyValue = useRefinance((state) => state.propertyValue);
  const percentile = useRefinance((state) => state.percentile);
  const route = useRefinance((state) => state.routes.INTERNAL);
  const discountRate = useRefinance((state) => state.discountRate);
  const noticeGiven = useRefinance((state) => state.noticeGiven);
  const dayOfMonth = useRefinance((state) => state.dayOfMonth);
  const macro = useWizard((state) => state.macro);
  const marketVersion = useMarketVersion();

  return useMemo(() => {
    if (!tracksValid(tracks)) {
      return { actions: {}, suggested: new Set(), goodRate: new Set(), planTracks: [], trackIds: [] };
    }
    const scenario = scenarioOf(macro);
    const ltv = propertyValue > 0 ? outstandingBalance(tracks) / propertyValue : 0;
    const options = { scenario, discountRate, ltv, noticeGiven, dayOfMonth, cpiAnnual: scenario.cpiAnnual, percentile, route };
    const verdicts = new Map(trackByTrack(tracks, percentile, options).map((verdict) => [verdict.id, verdict]));
    const actions: Record<string, TrackAction> = {};
    const suggested = new Set<string>();
    for (const track of tracks) {
      const own = chosen[track.id];
      if (own) {
        actions[track.id] = own;
      } else {
        suggested.add(track.id);
        actions[track.id] = verdicts.get(track.id)?.worthwhile
          ? { kind: 'REFINANCE', type: track.type, termMonths: track.remainingMonths }
          : KEEP;
      }
    }
    const goodRate = new Set(tracks.filter((track) => isGoodRate(track, ltv, scenario.primeAnnual)).map((track) => track.id));
    const live = tracks.filter((track) => track.balance > 0 && track.remainingMonths > 0);
    const planTracks = live.map((track, index) => ({
      index,
      type: track.type,
      balance: Math.round(track.balance),
      annualRate: track.annualRate,
      remainingMonths: track.remainingMonths,
      marketRate: marketAverageFor(track, ltv, scenario.primeAnnual),
      refinanceFee: Math.round(verdicts.get(track.id)?.fee ?? 0),
    }));
    return {
      actions,
      suggested,
      goodRate,
      result: analyseTrackPlan(tracks, actions, options),
      planTracks,
      trackIds: live.map((track) => track.id),
    };
    // marketVersion: the engine prices against the live market table.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, tracks, propertyValue, percentile, route, discountRate, noticeGiven, dayOfMonth, macro, marketVersion]);
}
