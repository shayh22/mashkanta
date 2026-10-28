import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CATALOG } from '../engine/flow/catalog';
import type { LoanOffer } from '../engine/flow/loanOffers';
import type { MortgageOffer } from '../engine/flow/offers';
import type { ManualShares } from '../engine/manualMix';
import type { Advice } from '../engine/money/adviceRequest';
import { GOALS, stepsFor, type AnswerValue, type Answers, type Goal, type Step } from '../engine/flow/flow';
import { isSampleDebts, useConsolidation } from './consolidationStore';
import { monthlyPicture } from '../engine/money/picture';
import { explanationFor, recoveryAnswers, recoveryQuestions, type RecoveryQuestions } from '../engine/flow/recovery';
import { useMoney, useMoneyCategories } from './moneyStore';
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

/**
 * After the questions, the result in four screens: the situation today (DONE, the first), where it
 * can improve, the banks side by side, and the plan.
 */
export const RESULT_SCREENS = [DONE, 'improve', 'compare', 'plan'] as const;
export type ResultScreen = (typeof RESULT_SCREENS)[number];

/** Every screen for every goal: the banks screen compares mortgage offers, and loan offers too. */
export const resultScreensFor = (goals: readonly Goal[]): ResultScreen[] => (goals.length > 0 ? [...RESULT_SCREENS] : []);

interface QuestionnaireState {
  goals: Goal[];
  answers: Record<string, AnswerValue>;
  /** A screen's id, START or DONE. */
  at: string;
  setGoals: (goals: readonly Goal[]) => void;
  answer: (field: string, value: AnswerValue | undefined) => void;
  go: (at: string) => void;
  /** The tasks ticked off, by id. */
  done: string[];
  toggleDone: (task: string) => void;
  /** The recovery plan's decisions left out, by key. */
  skipped: string[];
  toggleSkipped: (decision: string) => void;
  /**
   * נועם's plan for the month, with the totals it was asked about: in memory only, like the
   * statements it was made from, and set aside once they change.
   */
  advice?: { readonly for: string; readonly goal: string; readonly advice: Advice };
  setAdvice: (advice: QuestionnaireState['advice']) => void;
  /** The offers from the banks, read or typed in: tracks and rates, no names. */
  offers: MortgageOffer[];
  addOffer: (offer: MortgageOffer) => void;
  removeOffer: (id: string) => void;
  /** Loan offers for one amount, compared by what each costs in all. */
  loanOffers: LoanOffer[];
  loanAmount?: number;
  addLoanOffer: (offer: LoanOffer) => void;
  removeLoanOffer: (id: string) => void;
  setLoanAmount: (amount: number | undefined) => void;
  /** A purchase's mix built by hand, share per track; the calculator's while undefined. */
  manualShares?: ManualShares;
  setManualShares: (shares: ManualShares | undefined) => void;
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
      done: [],
      toggleDone: (task) => set((state) => ({ done: state.done.includes(task) ? state.done.filter((each) => each !== task) : [...state.done, task] })),
      skipped: [],
      toggleSkipped: (decision) =>
        set((state) => ({ skipped: state.skipped.includes(decision) ? state.skipped.filter((each) => each !== decision) : [...state.skipped, decision] })),
      setAdvice: (advice) => set({ advice }),
      offers: [],
      addOffer: (offer) => set((state) => ({ offers: [...state.offers, offer] })),
      removeOffer: (id) => set((state) => ({ offers: state.offers.filter((offer) => offer.id !== id) })),
      loanOffers: [],
      addLoanOffer: (offer) => set((state) => ({ loanOffers: [...state.loanOffers, offer] })),
      removeLoanOffer: (id) => set((state) => ({ loanOffers: state.loanOffers.filter((offer) => offer.id !== id) })),
      setLoanAmount: (loanAmount) => set({ loanAmount }),
      setManualShares: (manualShares) => set({ manualShares }),
      reset: () => set({ goals: [], answers: {}, at: START, done: [], skipped: [], advice: undefined, offers: [], loanOffers: [], loanAmount: undefined, manualShares: undefined }),
    }),
    {
      name: storageKey('questionnaire'),
      version: 1,
      storage: browserStorage,
      partialize: (state) => ({ goals: state.goals, answers: state.answers, at: state.at, done: state.done, skipped: state.skipped, offers: state.offers, loanOffers: state.loanOffers, loanAmount: state.loanAmount, manualShares: state.manualShares }),
    },
  ),
);

const NO_QUESTIONS: RecoveryQuestions = { steps: [], payees: {} };

/** The recovery plan's questions about the household's own charges, once statements are read. */
export function useRecoveryQuestions(): RecoveryQuestions {
  const recovering = useQuestionnaire((state) => state.goals.includes('RECOVERY'));
  const files = useMoney((state) => state.files);
  return useMemo(() => {
    if (!recovering) {
      return NO_QUESTIONS;
    }
    // As the rules alone read the statements: answering a charge does not take it off the screen.
    const raw = monthlyPicture(files.flatMap((file) => (file.statement ? [file.statement] : [])), {});
    return raw ? recoveryQuestions(raw) : NO_QUESTIONS;
  }, [recovering, files]);
}

/** Records an answer: a recovery question's as what the household says about that business, any other in the questionnaire. */
export function useAnswer(): (field: string, value: AnswerValue | undefined) => void {
  const questions = useRecoveryQuestions();
  const answer = useQuestionnaire((state) => state.answer);
  const explain = useMoneyCategories((state) => state.explain);
  return (field, value) => {
    const said = explanationFor(questions, field, value);
    if (said) {
      explain(said.payee, said.patch);
    } else {
      answer(field, value);
    }
  };
}

/** The answers, with each document question answered by whether that document has been read. */
export function useFlowAnswers(): Answers {
  const answers = useQuestionnaire((state) => state.answers);
  const questions = useRecoveryQuestions();
  const explanations = useMoneyCategories((state) => state.explanations);
  const tracks = useRefinance((state) => state.tracks);
  const debts = useConsolidation((state) => state.debts);
  const statements = useMoney((state) => state.files.some((file) => file.statement));
  return useMemo(() => {
    const read: Record<string, boolean> = {
      mortgageReport: !isSampleTracks(tracks),
      loansReport: debts.length > 0 && !isSampleDebts(debts),
      statementsFiles: statements,
    };
    const merged: Record<string, AnswerValue> = { ...answers, ...recoveryAnswers(questions, explanations) };
    for (const [field, done] of Object.entries(read)) {
      if (done) {
        merged[field] = true;
      }
    }
    return merged;
  }, [answers, tracks, debts, statements, questions, explanations]);
}

/** The screens for the goals chosen, as the answers so far shape them. */
export function useFlowSteps(answers: Answers): Step[] {
  const goals = useQuestionnaire((state) => state.goals);
  const questions = useRecoveryQuestions();
  return useMemo(() => {
    const steps = stepsFor(CATALOG, goals, answers);
    // The household's own charges are asked right after its statements are read.
    const after = steps.findIndex((step) => step.id === 'statementsUpload');
    return after < 0 ? steps : [...steps.slice(0, after + 1), ...questions.steps, ...steps.slice(after + 1)];
  }, [goals, answers, questions]);
}
