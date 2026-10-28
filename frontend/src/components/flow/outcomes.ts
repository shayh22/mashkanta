import { useMemo } from 'react';
import { priceMix, type MixResult } from '../../engine/amortization';
import type { Answers } from '../../engine/flow/flow';
import { impliedRate, REMAINING_MONTHS } from '../../engine/flow/refinancePlan';
import { existingSpecs } from '../../engine/refinance';
import { trackFromRate } from '../../engine/tracks';
import { scenarioOf } from '../../lib/api';
import type { RecoverySnapshot, RefinanceSnapshot } from '../../engine/flow/share';
import { adviceRequestOf, type AdviceRequest } from '../../engine/money/adviceRequest';
import { decisionsOf, freedBy, loanDecision, mortgageDecision, type CategoryTarget, type Decision } from '../../engine/money/decisions';
import type { MonthlyPicture } from '../../engine/money/picture';
import { bestRoute } from '../../lib/routes';
import { isSampleDebts, useConsolidation, useConsolidationAnalysis } from '../../store/consolidationStore';
import { planOf, useJourneyLoans } from '../../store/journeyLoans';
import { useMoney, useMoneyCategories, useMonthlyPicture } from '../../store/moneyStore';
import { useMortgageMove } from '../../store/mortgageMove';
import { useQuestionnaire } from '../../store/questionnaireStore';
import { useMarketVersion } from '../../store/marketVersion';
import { isSampleTracks, outstandingBalance, useRefinance, useRefinanceAnalysis } from '../../store/refinanceStore';
import { useWizard } from '../../store/wizardStore';
import { useRefinanceAnswers } from './hooks';

/**
 * The results the screens after the questions share — worked out where they are read, not where
 * they are shown, so moving between the screens loses nothing: the decisions the household left
 * out are kept on the device.
 */

/**
 * Every decision on the table, each with what it frees a month: refinancing the mortgage (from the
 * bank's report), a move for each loan, and from the statements what was marked to cancel, the
 * overdraft, the fees, a category back to its average. The ones left out are kept on the device.
 */
export function useImprovement() {
  const picture = useMonthlyPicture();
  const explanations = useMoneyCategories((state) => state.explanations);
  const loans = useJourneyLoans(picture);
  const plans = useMoney((state) => state.loans);
  const { route } = useMortgageMove();
  const skipped = useQuestionnaire((state) => state.skipped);
  const toggle = useQuestionnaire((state) => state.toggleSkipped);
  const targets = useAdviceTargets(picture);
  const consolidation = useConsolidationDecision();
  const decisions = useMemo(() => {
    // A loan folded into the mortgage has no move of its own: its payment is freed once.
    const folded = new Set(consolidation?.debtIds ?? []);
    return [
      ...(route ? [mortgageDecision(route)] : []),
      ...(consolidation ? [consolidation.decision] : []),
      ...loans.filter((loan) => !loan.debtId || !folded.has(loan.debtId)).map((loan) => loanDecision(loan, planOf(loan, plans))),
      ...(picture ? decisionsOf(picture, explanations, targets) : []),
    ].filter((decision): decision is Decision => !!decision);
  }, [route, consolidation, loans, plans, picture, explanations, targets]);
  const chosen = useMemo(() => new Set(decisions.map((decision) => decision.key).filter((key) => !skipped.includes(key))), [decisions, skipped]);
  const freed = freedBy(decisions, chosen);
  const today = picture ? picture.income - picture.spending : 0;
  const after = today + freed;
  return { picture, explanations, loans, decisions, chosen, freed, today, after, toggle };
}

/** Folding the loans marked into the mortgage, as a decision, when the household counts it. */
function useConsolidationDecision(): { decision: Decision; debtIds: string[] } | undefined {
  const counted = useQuestionnaire((state) => state.consolidate);
  const debts = useConsolidation((state) => state.debts);
  const analysis = useConsolidationAnalysis();
  return useMemo(() => {
    if (!counted || isSampleDebts(debts) || analysis.included.length === 0 || analysis.monthlyRelief < 1) {
      return undefined;
    }
    return {
      decision: {
        key: 'consolidate',
        label: 'לאחד את ההלוואות לתוך המשכנתא',
        monthly: analysis.monthlyRelief,
        source: 'debts',
        ...(analysis.extraLifetimeCost >= 1 ? { note: `עולה ${Math.round(analysis.extraLifetimeCost).toLocaleString('he-IL')} ₪ יותר בסך הכל` } : {}),
      },
      debtIds: analysis.included.map((debt) => debt.id),
    };
  }, [counted, debts, analysis]);
}

/** The totals נועם is asked about, as a key: a plan made for other totals is set aside. */
export const adviceKey = (request: AdviceRequest) => JSON.stringify({ ...request, goal: '', notes: [] });

/** נועם's category targets, each against what is spent there now; none once the statements changed. */
export function useAdviceTargets(picture: MonthlyPicture | undefined): CategoryTarget[] {
  const explanations = useMoneyCategories((state) => state.explanations);
  const advice = useQuestionnaire((state) => state.advice);
  return useMemo(() => {
    if (!picture || !advice) {
      return [];
    }
    const request = adviceRequestOf(picture, '', explanations);
    if (adviceKey(request) !== advice.for) {
      return [];
    }
    const spent = new Map(request.categories.map((category) => [category.id as string, category.monthly]));
    // One target per category: the last word on it counts.
    const byCategory = new Map(advice.advice.steps.flatMap((step) => (step.target ? [[step.target.category, step.target] as const] : [])));
    return [...byCategory.values()].map((target) => ({ category: target.category, current: spent.get(target.category) ?? 0, target: target.monthly }));
  }, [picture, advice, explanations]);
}

/** The recovery plan's figures, for a shared link: the statements themselves never leave the device. */
export function useRecoverySnapshot(): RecoverySnapshot | undefined {
  const { picture, decisions, chosen, today, after } = useImprovement();
  return useMemo(() => {
    if (!picture) {
      return undefined;
    }
    // A loan is named after the business on the statements: on a link it is only its number.
    let loan = 0;
    const kept = decisions
      .filter((decision) => chosen.has(decision.key))
      .map((decision) => ({
        label: decision.key.startsWith('loan:') ? `הלוואה ${++loan}${decision.label.slice(decision.label.lastIndexOf(':'))}` : decision.label,
        monthly: Math.round(decision.monthly),
      }));
    return { months: picture.months.length, today: Math.round(today), after: Math.round(after), decisions: kept };
  }, [picture, today, after, decisions, chosen]);
}

/** The exact refinance's figures, from the bank's report; undefined for an estimate, which a link works out again. */
export function useRefinanceSnapshot(answers: Answers, refinancing: boolean): RefinanceSnapshot | undefined {
  useRefinanceAnswers(answers, refinancing);
  const exact = !isSampleTracks(useRefinance((state) => state.tracks));
  const { comparison } = useRefinanceAnalysis();
  return useMemo(() => {
    const route = comparison ? bestRoute(comparison) : undefined;
    if (!refinancing || !exact || !comparison || !route) {
      return undefined;
    }
    return {
      currentPayment: Math.round(route.currentPayment),
      proposedPayment: Math.round(route.proposedPayment),
      monthlySaving: Math.round(route.monthlySaving),
      lifetimeSaving: Math.round(route.lifetimeSaving),
      upfrontCost: Math.round(route.upfrontCost),
      breakevenMonth: route.breakevenMonth,
      verdict: route.verdict,
      route: comparison.best,
    };
  }, [refinancing, exact, comparison]);
}

export interface MortgageToday {
  /** From the bank's report, every track; otherwise from the figures typed in. */
  readonly exact: boolean;
  readonly balance: number;
  readonly payment: number;
  /** For figures typed in: the term they stand for and the rate they imply. */
  readonly months?: number;
  readonly rate?: number;
  /** The mortgage as it stands, priced to its end: the path of the balance and what it costs. */
  readonly mix: MixResult;
}

/**
 * The mortgage as it stands today, priced to the end; undefined without one, or while the figures
 * typed in cannot be one mortgage.
 */
export function useMortgageToday(answers: Answers, hasMortgage: boolean): MortgageToday | undefined {
  const tracks = useRefinance((state) => state.tracks);
  const macro = useWizard((state) => state.macro);
  const market = useMarketVersion();
  return useMemo(() => {
    if (!hasMortgage) {
      return undefined;
    }
    const scenario = scenarioOf(macro);
    if (!isSampleTracks(tracks)) {
      const mix = priceMix(existingSpecs(tracks, scenario), scenario);
      return { exact: true, balance: outstandingBalance(tracks), payment: mix.initialPayment, mix };
    }
    const balance = typeof answers.mortgageBalance === 'number' ? answers.mortgageBalance : undefined;
    const payment = typeof answers.mortgagePayment === 'number' ? answers.mortgagePayment : undefined;
    if (answers.mortgageHow !== 'MANUAL' || balance === undefined || payment === undefined) {
      return undefined;
    }
    const months = REMAINING_MONTHS[answers.mortgageYears as string] ?? REMAINING_MONTHS.UNKNOWN!;
    const rate = impliedRate(balance, payment, months);
    if (rate === undefined) {
      return undefined;
    }
    const mix = priceMix([trackFromRate('FIXED_UNLINKED', balance, months, rate, scenario)], scenario);
    return { exact: false, balance, payment, months, rate, mix };
    // market: the scenario reads the live market table.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMortgage, tracks, macro, market, answers.mortgageHow, answers.mortgageBalance, answers.mortgagePayment, answers.mortgageYears]);
}
