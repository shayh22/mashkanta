import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { VisitSnapshot } from '../engine/visits';
import { browserStorage, storageKey } from './persistence';

export type VisitedMode = 'mortgage' | 'refinance' | 'consolidation' | 'combined';

interface VisitState {
  /** The latest snapshot of this visit, kept so the next visit can compare against it. */
  last?: VisitSnapshot;
  /** Modes the borrower has opened; results are compared only for tools they actually used. */
  visited: VisitedMode[];
  markVisited: (mode: VisitedMode) => void;
  save: (snapshot: VisitSnapshot) => void;
}

/** The snapshot left by the previous visit, read once as the app loads, before this visit saves. */
let previousVisit: VisitSnapshot | undefined;
export const previousVisitSnapshot = () => previousVisit;

export const useVisits = create<VisitState>()(
  persist(
    (set) => ({
      visited: [],
      markVisited: (mode) =>
        set((state) => (state.visited.includes(mode) ? {} : { visited: [...state.visited, mode] })),
      save: (last) => set({ last }),
    }),
    {
      name: storageKey('visits'),
      version: 1,
      storage: browserStorage,
      partialize: (state) => ({ last: state.last, visited: state.visited }),
      onRehydrateStorage: () => (state) => {
        previousVisit = state?.last;
      },
    },
  ),
);
