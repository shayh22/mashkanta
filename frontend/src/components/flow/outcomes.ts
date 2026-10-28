import { useMemo } from 'react';
import type { Answers } from '../../engine/flow/flow';
import type { RecoverySnapshot, RefinanceSnapshot } from '../../engine/flow/share';
import { decisionsOf, freedBy } from '../../engine/money/decisions';
import { bestRoute } from '../../lib/routes';
import { useMoneyCategories, useMonthlyPicture } from '../../store/moneyStore';
import { useQuestionnaire } from '../../store/questionnaireStore';
import { isSampleTracks, useRefinance, useRefinanceAnalysis } from '../../store/refinanceStore';
import { useRefinanceAnswers } from './hooks';

/**
 * The results the screens after the questions share — worked out where they are read, not where
 * they are shown, so moving between the screens loses nothing: the decisions the household left
 * out are kept on the device.
 */

export function useRecoveryOutcome() {
  const picture = useMonthlyPicture();
  const explanations = useMoneyCategories((state) => state.explanations);
  const skipped = useQuestionnaire((state) => state.skipped);
  const toggle = useQuestionnaire((state) => state.toggleSkipped);
  const decisions = useMemo(() => (picture ? decisionsOf(picture, explanations) : []), [picture, explanations]);
  const chosen = useMemo(() => new Set(decisions.map((decision) => decision.key).filter((key) => !skipped.includes(key))), [decisions, skipped]);
  const today = picture ? picture.income - picture.spending : 0;
  const after = today + freedBy(decisions, chosen);
  return { picture, explanations, decisions, chosen, today, after, toggle };
}

/** The recovery plan's figures, for a shared link: the statements themselves never leave the device. */
export function useRecoverySnapshot(): RecoverySnapshot | undefined {
  const { picture, decisions, chosen, today, after } = useRecoveryOutcome();
  return useMemo(
    () =>
      picture
        ? {
            months: picture.months.length,
            today: Math.round(today),
            after: Math.round(after),
            decisions: decisions.filter((decision) => chosen.has(decision.key)).map((decision) => ({ label: decision.label, monthly: Math.round(decision.monthly) })),
          }
        : undefined,
    [picture, today, after, decisions, chosen],
  );
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
