import { useMemo } from 'react';
import type { Answers, Goal } from '../../engine/flow/flow';
import type { RefinanceSnapshot } from '../../engine/flow/share';
import { consumerLoanAverage } from '../../engine/consolidation';
import { priceLoan, rankLoans } from '../../engine/flow/loanOffers';
import { rankOffers } from '../../engine/flow/offers';
import { tasksFor, type TaskInput } from '../../engine/flow/tasks';
import { useQuestionnaire } from '../../store/questionnaireStore';
import { isSampleTracks, useRefinance } from '../../store/refinanceStore';
import { useBuyResult } from './hooks';
import { useRankedOffers } from './offerHooks';
import { useImprovement } from './outcomes';

/**
 * What to do now, under the results: the next steps, each ticked off on the device. The charges
 * marked to cancel are named here — on the device only; a shared link never carries them.
 */
export function TasksCard({ goals, answers, refinance }: { goals: readonly Goal[]; answers: Answers; refinance?: RefinanceSnapshot }) {
  const buy = useBuyTasks(goals, answers);
  const recovery = useRecoveryTasks(goals);
  const exact = !isSampleTracks(useRefinance((state) => state.tracks));
  const offers = [useBestOffer('BUY', goals, answers), useBestOffer('REFINANCE', goals, answers)].filter((offer) => !!offer);
  const loanOffer = useBestLoanOffer();
  const done = useQuestionnaire((state) => state.done);
  const toggle = useQuestionnaire((state) => state.toggleDone);

  const tasks = tasksFor({
    goals,
    answers,
    ...(buy ? { buy } : {}),
    // The exact result's verdict, once it is worked out; without the report, the way to it.
    ...(!exact ? { refinance: { exact: false } } : refinance ? { refinance: { exact: true, verdict: refinance.verdict, route: refinance.route } } : {}),
    ...(recovery ? { recovery } : {}),
    ...(offers.length > 0 ? { offers } : {}),
    ...(loanOffer ? { loanOffer } : {}),
  });
  if (tasks.length === 0) {
    return null;
  }
  const left = tasks.filter((task) => !done.includes(task.id)).length;
  return (
    <section aria-labelledby="tasks-title" className="flex flex-col gap-2 rounded-[20px] bg-flow-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="tasks-title" className="text-base font-extrabold">
          מה עושים עכשיו
        </h3>
        <span className="text-sm text-flow-muted">{left === 0 ? 'הכל בוצע ✓' : `נשארו ${left} מתוך ${tasks.length}`}</span>
      </div>
      <ul className="flex flex-col">
        {tasks.map((task) => {
          const checked = done.includes(task.id);
          return (
            <li key={task.id} className="border-b border-flow-line last:border-b-0">
              <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2 text-[15px]">
                <input type="checkbox" checked={checked} onChange={() => toggle(task.id)} className="h-5 w-5 shrink-0 accent-[rgb(var(--flow-strong))]" />
                <span className={checked ? 'text-flow-muted line-through' : 'font-bold'}>{task.text}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The cheapest offer the household got for a goal, if it got any. */
function useBestOffer(goal: 'BUY' | 'REFINANCE', goals: readonly Goal[], answers: Answers) {
  const { priced } = useRankedOffers(goal, goals.includes(goal) ? answers : {});
  const best = rankOffers(priced)[0];
  return best ? { goal, best: best.label, count: priced.length } : undefined;
}

/** The cheapest loan offer for the amount, against the market's average rate. */
function useBestLoanOffer() {
  const offers = useQuestionnaire((state) => state.loanOffers);
  const amount = useQuestionnaire((state) => state.loanAmount) ?? 0;
  const priced = offers.flatMap((offer) => {
    const loan = priceLoan(Math.max(amount, 1), offer);
    return loan ? [{ ...loan, rate: offer.annualRate }] : [];
  });
  const best = rankLoans(priced)[0];
  return best ? { best: best.label, count: priced.length, rate: best.rate, average: consumerLoanAverage().rate } : undefined;
}

function useBuyTasks(goals: readonly Goal[], answers: Answers): TaskInput['buy'] {
  const { plan, result } = useBuyResult(goals.includes('BUY') ? answers : {});
  if (!goals.includes('BUY') || plan?.kind !== 'LOAN' || !result.data) {
    return undefined;
  }
  const cheapest = [...result.data.bankQuotes].sort((a, b) => a.rank - b.rank)[0];
  const mix = result.data.recommended.summary.allocations
    .filter((track) => track.share > 0.0005)
    .map((track) => `${track.hebrewName} ${Math.round(track.share * 100)}%`)
    .join(', ');
  return { equityShort: plan.equityShort, ...(cheapest ? { cheapestBank: cheapest.hebrewName } : {}), ...(mix ? { mix } : {}) };
}

function useRecoveryTasks(goals: readonly Goal[]): TaskInput['recovery'] {
  const { picture, explanations, loans, decisions, chosen } = useImprovement();
  return useMemo(() => {
    const kept = decisions.filter((decision) => chosen.has(decision.key));
    const loanMoves = kept.filter((decision) => decision.key.startsWith('loan:')).map((decision) => ({ key: decision.key, label: decision.label }));
    const mortgage = kept.some((decision) => decision.key === 'mortgage');
    if (!picture) {
      // A recovery plan needs the statements; any household with loans has their moves.
      return goals.includes('RECOVERY') || loans.length > 0
        ? { hasStatements: !goals.includes('RECOVERY'), cancel: [], reduce: [], overdraft: false, fees: false, loanMoves, mortgage }
        : undefined;
    }
    // Only the decisions the household kept: a cancellation left out on the result is not a task.
    const payees = picture.spendingLines.flatMap((line) => line.payees.map((payee) => payee.description));
    const marked = (flexibility: 'CANCEL' | 'REDUCE') => [...new Set(payees.filter((payee) => explanations[payee]?.flexibility === flexibility))];
    return {
      hasStatements: true,
      cancel: chosen.has('cancel') ? marked('CANCEL') : [],
      reduce: marked('REDUCE'),
      overdraft: chosen.has('overdraft'),
      fees: chosen.has('fees'),
      loanMoves,
      mortgage,
    };
  }, [goals, picture, explanations, loans, decisions, chosen]);
}
