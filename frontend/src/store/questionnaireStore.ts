import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CATALOG } from '../engine/flow/catalog';
import { GOALS, stepsFor, type AnswerValue, type Answers, type Goal, type Step } from '../engine/flow/flow';
import { isSampleDebts, useConsolidation } from './consolidationStore';
import { useMoney } from './moneyStore';
import { browserStorage, storageKey } from './persistence';
import { isSampleTracks, useRefinance } from './refinanceStore';

/**
 * Where the household is in the questionnaire, and what it answered. Kept on the device only, so
 * the next visit picks up where this one stopped. Documents are not answers: whether one has been
 * read is asked of the store that read it (see `useFlowAnswers`).
 */

/** Before the questions: the opening screen. After them: the result. */
export const START = 'START';
export const DONE = 'DONE';

interface QuestionnaireState {
  goals: Goal[];
  answers: Record<string, AnswerValue>;
  /** A screen's id, START or DONE. */
  at: string;
  setGoals: (goals: readonly Goal[]) => void;
  answer: (field: string, value: AnswerValue | undefined) => void;
  go: (at: string) => void;
  reset: () => void;
}

export const useQuestionnaire = create<QuestionnaireState>()(
  persist(
    (set) => ({
      goals: [],
      answers: {},
      at: START,
      setGoals: (goals) => set({ goals: GOALS.filter((goal) => goals.includes(goal)) }),
      answer: (field, value) =>
        set((state) => {
          const answers = { ...state.answers };
          if (value === undefined) {
            delete answers[field];
          } else {
            answers[field] = value;
          }
          return { answers };
        }),
      go: (at) => set({ at }),
      reset: () => set({ goals: [], answers: {}, at: START }),
    }),
    {
      name: storageKey('questionnaire'),
      version: 1,
      storage: browserStorage,
      partialize: (state) => ({ goals: state.goals, answers: state.answers, at: state.at }),
    },
  ),
);

/** The answers, with each document question answered by whether that document has been read. */
export function useFlowAnswers(): Answers {
  const answers = useQuestionnaire((state) => state.answers);
  const tracks = useRefinance((state) => state.tracks);
  const debts = useConsolidation((state) => state.debts);
  const statements = useMoney((state) => state.files.some((file) => file.statement));
  return useMemo(() => {
    const read: Record<string, boolean> = {
      mortgageReport: !isSampleTracks(tracks),
      loansReport: debts.length > 0 && !isSampleDebts(debts),
      statementsFiles: statements,
    };
    const merged: Record<string, AnswerValue> = { ...answers };
    for (const [field, done] of Object.entries(read)) {
      if (done) {
        merged[field] = true;
      }
    }
    return merged;
  }, [answers, tracks, debts, statements]);
}

/** The screens for the goals chosen, as the answers so far shape them. */
export function useFlowSteps(answers: Answers): Step[] {
  const goals = useQuestionnaire((state) => state.goals);
  return useMemo(() => stepsFor(CATALOG, goals, answers), [goals, answers]);
}
