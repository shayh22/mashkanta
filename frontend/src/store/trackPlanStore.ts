import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlanAnswer, PlanTrack } from '../engine/planRequest';
import {
  analyseTrackPlan,
  clampTerm,
  isGoodRate,
  KEEP,
  refinanceRate,
  type TrackAction,
  type TrackPlanResult,
} from '../engine/trackPlan';
import { scenarioOf } from '../lib/api';
import { useMarketVersion } from './marketVersion';
import { browserStorage, storageKey } from './persistence';
import { outstandingBalance, tracksValid, useRefinance } from './refinanceStore';
import { useWizard } from './wizardStore';

/**
 * The borrower's own plan for the mortgage, track by track. Until they change something, the plan
 * follows the advice for each track: refinance it where that pays on its own, keep it where not.
 */
interface TrackPlanState {
  /** Actions the borrower chose, by track id; a track not here follows the advice. */
  actions: Record<string, TrackAction>;
  setAction: (id: string, action: TrackAction) => void;
  /** A whole plan at once — from the AI box, or a reset (an empty plan). */
  replace: (actions: Record<string, TrackAction>) => void;
  /** The goal typed into the AI box, kept while the section is folded; never saved. */
  goal: string;
  setGoal: (goal: string) => void;
  /** The AI's last answer, with the tracks it was for. */
  answer?: { readonly tracksKey: string; readonly plan: PlanAnswer };
  setAnswer: (answer?: { tracksKey: string; plan: PlanAnswer }) => void;
}

export const useTrackPlanStore = create<TrackPlanState>()(
  persist(
    (set) => ({
      actions: {},
      setAction: (id, action) => set((state) => ({ actions: { ...state.actions, [id]: action } })),
      replace: (actions) => set({ actions }),
      goal: '',
      setGoal: (goal) => set({ goal }),
      answer: undefined,
      setAnswer: (answer) => set({ answer }),
    }),
    { name: storageKey('track-plan'), version: 1, storage: browserStorage, partialize: (state) => ({ actions: state.actions }) },
  ),
);

/** Identifies a set of tracks, so an answer is never applied to tracks it was not asked about. */
export const tracksKeyOf = (ids: readonly string[]) => ids.join('|');

export interface TrackPlanView {
  /** The action each live track takes, the borrower's or the advice's. */
  readonly actions: Readonly<Record<string, TrackAction>>;
  /** Tracks whose action is the advice, not the borrower's. */
  readonly suggested: ReadonlySet<string>;
  /** Tracks cheaper than refinancing them would be. */
  readonly goodRate: ReadonlySet<string>;
  readonly result?: TrackPlanResult;
  /** The live tracks as the AI box describes them, in order; `trackIds[i]` is `planTracks[i]`'s id. */
  readonly planTracks: readonly PlanTrack[];
  readonly trackIds: readonly string[];
}

const EMPTY: TrackPlanView = { actions: {}, suggested: new Set(), goodRate: new Set(), planTracks: [], trackIds: [] };

export function useTrackPlan(): TrackPlanView {
  const chosen = useTrackPlanStore((state) => state.actions);
  const tracks = useRefinance((state) => state.tracks);
  const keptIds = useRefinance((state) => state.keptIds);
  const propertyValue = useRefinance((state) => state.propertyValue);
  const percentile = useRefinance((state) => state.percentile);
  const route = useRefinance((state) => state.routes.INTERNAL);
  const discountRate = useRefinance((state) => state.discountRate);
  const noticeGiven = useRefinance((state) => state.noticeGiven);
  const dayOfMonth = useRefinance((state) => state.dayOfMonth);
  const macro = useWizard((state) => state.macro);
  const marketVersion = useMarketVersion();

  // The advice depends on the mortgage and the market only; the borrower's choices just overlay it.
  const advice = useMemo(() => {
    if (!tracksValid(tracks)) {
      return undefined;
    }
    const scenario = scenarioOf(macro);
    const ltv = propertyValue > 0 ? outstandingBalance(tracks) / propertyValue : 0;
    const options = { scenario, discountRate, ltv, noticeGiven, dayOfMonth, cpiAnnual: scenario.cpiAnnual, percentile, route };
    const live = tracks.filter((track) => track.balance > 0 && track.remainingMonths > 0);
    const goodRate = new Set(live.filter((track) => isGoodRate(track, options)).map((track) => track.id));
    const suggested: Record<string, TrackAction> = {};
    const fees: Record<string, number> = {};
    for (const track of live) {
      // Each track refinanced on its own, priced exactly as the playground prices it — with this
      // bank's switching costs and discount — so the advice never shows a losing plan.
      const refinance: TrackAction = { kind: 'REFINANCE', type: track.type, termMonths: clampTerm(track.remainingMonths) };
      const alone = analyseTrackPlan(tracks, { [track.id]: refinance }, options);
      fees[track.id] = alone.fees.total;
      const advised = !keptIds.includes(track.id) && !goodRate.has(track.id) && alone.netPresentValue > 0;
      suggested[track.id] = advised ? refinance : KEEP;
    }
    const planTracks = live.map((track, index) => ({
      index,
      type: track.type,
      balance: Math.round(track.balance),
      annualRate: track.annualRate,
      remainingMonths: track.remainingMonths,
      marketRate: refinanceRate(track.type, track.remainingMonths, options),
      refinanceFee: Math.round(fees[track.id] ?? 0),
    }));
    return { options, suggested, goodRate, planTracks, trackIds: live.map((track) => track.id) };
    // marketVersion: the engine prices against the live market table.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, keptIds, propertyValue, percentile, route, discountRate, noticeGiven, dayOfMonth, macro, marketVersion]);

  return useMemo(() => {
    if (!advice) {
      return EMPTY;
    }
    const actions: Record<string, TrackAction> = {};
    const suggested = new Set<string>();
    for (const id of advice.trackIds) {
      const own = chosen[id];
      if (!own) {
        suggested.add(id);
      }
      actions[id] = own ?? advice.suggested[id] ?? KEEP;
    }
    return {
      actions,
      suggested,
      goodRate: advice.goodRate,
      result: analyseTrackPlan(tracks, actions, advice.options),
      planTracks: advice.planTracks,
      trackIds: advice.trackIds,
    };
  }, [advice, chosen, tracks]);
}
