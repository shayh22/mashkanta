import type { Answers, Goal } from '../../engine/flow/flow';
import type { RefinanceSnapshot } from '../../engine/flow/share';
import { formatCurrency, formatSignedCurrency } from '../../lib/format';
import { isSampleTracks, useRefinance } from '../../store/refinanceStore';
import { useBuyResult, useRefinanceEstimate } from './hooks';
import { useRankedOffers } from './offerHooks';
import { useImprovement } from './outcomes';

/**
 * The plan in a few lines: each figure as it is today, and as it is after what was chosen — the
 * mortgage's payment, the new home's, what is left in the account at the end of the month.
 */

interface Line {
  readonly label: string;
  readonly today?: string;
  readonly after: string;
  /** Whether after is the better side of today. */
  readonly better?: boolean;
}

export function PlanSummary({ goals, answers, refinance }: { goals: readonly Goal[]; answers: Answers; refinance?: RefinanceSnapshot }) {
  const lines = [...useBuyLine(goals, answers), ...useRefinanceLine(goals, answers, refinance), ...useAccountLines()];
  if (lines.length === 0) {
    return null;
  }
  return (
    <section aria-label="לפני ואחרי" className="flex flex-col gap-1 rounded-[20px] bg-flow-card p-4">
      <h3 className="pb-1 text-base font-extrabold">לפני ואחרי</h3>
      <dl className="flex flex-col">
        {lines.map((line) => (
          <div key={line.label} className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-b border-flow-line py-2 last:border-b-0">
            <dt className="text-[15px] font-bold">{line.label}</dt>
            <dd className="flex items-center gap-2 text-[15px] tabular-nums">
              {line.today && (
                <>
                  <span className="text-flow-muted">{line.today}</span>
                  <span aria-label="ואחרי">←</span>
                </>
              )}
              <span className={`font-extrabold ${line.better === false ? 'text-negative' : line.better ? 'text-flow-strong' : ''}`}>{line.after}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The new home's first payment: from the cheapest offer, or the calculator's mix until there is one. */
function useBuyLine(goals: readonly Goal[], answers: Answers): Line[] {
  const buying = goals.includes('BUY');
  const { plan } = useBuyResult(buying ? answers : {});
  const { ranked } = useRankedOffers('BUY', buying ? answers : {});
  if (!buying) {
    return [];
  }
  if (plan?.kind === 'NO_LOAN') {
    return [{ label: 'משכנתא לדירה', after: 'אין צורך' }];
  }
  const best = ranked.find((offer) => offer.id !== 'market') ?? ranked[0];
  return best ? [{ label: best.id === 'market' ? 'החזר חודשי לדירה, לפי המחשבון' : `החזר חודשי לדירה, ${best.label}`, after: formatCurrency(best.initialPayment) }] : [];
}

/** The mortgage's payment today, and after the refinance: exact from the report, else estimated. */
function useRefinanceLine(goals: readonly Goal[], answers: Answers, snapshot?: RefinanceSnapshot): Line[] {
  const refinancing = goals.includes('REFINANCE');
  const exact = !isSampleTracks(useRefinance((state) => state.tracks));
  const { estimate, result } = useRefinanceEstimate(refinancing && !exact ? answers : {});
  if (!refinancing) {
    return [];
  }
  if (exact && snapshot) {
    return [{ label: 'החזר המשכנתא', today: formatCurrency(snapshot.currentPayment), after: formatCurrency(snapshot.proposedPayment), better: snapshot.proposedPayment <= snapshot.currentPayment }];
  }
  const proposed = result.data?.recommended.summary.initialPayment;
  if (estimate?.kind === 'ESTIMATE' && proposed !== undefined) {
    return [{ label: 'החזר המשכנתא, בערך', today: formatCurrency(estimate.current.payment), after: formatCurrency(proposed), better: proposed <= estimate.current.payment }];
  }
  return [];
}

/** The month's end in the account, today and after the decisions; without statements, what the decisions free. */
function useAccountLines(): Line[] {
  const { picture, decisions, freed, today, after } = useImprovement();
  if (picture) {
    return [{ label: 'נשאר בסוף החודש', today: formatSignedCurrency(today), after: formatSignedCurrency(after), better: after >= 0 }];
  }
  return decisions.length > 0 ? [{ label: 'ההחלטות מפנות בחודש', after: formatCurrency(freed), better: true }] : [];
}
