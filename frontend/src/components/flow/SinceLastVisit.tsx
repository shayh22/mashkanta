import { useEffect, useMemo, useState } from 'react';
import { monthLabel } from '../../engine/liveMarket';
import { compareVisits, newPublication, type VisitChange, type VisitSnapshot } from '../../engine/visits';
import { formatCurrency, formatPercent } from '../../lib/format';
import { bestRoute } from '../../lib/routes';
import { useConsolidationAnalysis } from '../../store/consolidationStore';
import { useMarket } from '../../store/marketStore';
import { useQuestionnaire } from '../../store/questionnaireStore';
import { isSampleTracks, useRefinance, useRefinanceAnalysis } from '../../store/refinanceStore';
import { previousVisitSnapshot, useVisits } from '../../store/visitStore';

/**
 * "Since your last visit", in the questionnaire: what moved in the market and what it did to the
 * household's own results, worked out once, when fresh market figures arrive — so changes made in
 * this visit are not news. The snapshot it compares against lives only on this device.
 */

/** A visit less than this long after the last one is the same sitting, not a return. */
const SAME_SITTING_MS = 30 * 60 * 1000;

const date = (iso: string) => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' });
const show = (change: VisitChange, value: number) => (change.unit === 'rate' ? formatPercent(value) : formatCurrency(value));

export function SinceLastVisitCard() {
  const status = useMarket((state) => state.status);
  const market = useMarket((state) => state.market);
  const goals = useQuestionnaire((state) => state.goals);
  const consolidate = useQuestionnaire((state) => state.consolidate);
  const visited = useVisits((state) => state.visited);
  const markVisited = useVisits((state) => state.markVisited);
  const save = useVisits((state) => state.save);
  const tracks = useRefinance((state) => state.tracks);
  const proposalMode = useRefinance((state) => state.proposalMode);
  const refinance = useRefinanceAnalysis();
  const consolidation = useConsolidationAnalysis();
  const [report, setReport] = useState<{ since: string; changes: VisitChange[]; published?: string }>();
  const [dismissed, setDismissed] = useState(false);

  // The results compared are the ones the household works with in the questionnaire.
  useEffect(() => {
    if (goals.includes('REFINANCE') && !isSampleTracks(tracks)) {
      markVisited('refinance');
    }
    if (consolidate) {
      markVisited('consolidation');
    }
  }, [goals, tracks, consolidate, markVisited]);

  const current = useMemo<VisitSnapshot>(() => {
    const best = refinance.comparison && bestRoute(refinance.comparison);
    return {
      at: new Date().toISOString(),
      market: {
        prime: market?.prime?.value,
        fixedUnlinked: market?.housing?.fixedUnlinked,
        fixedLinked: market?.housing?.fixedLinked,
        variableLinked: market?.housing?.variableLinked,
        housingAsOf: market?.housing?.asOf,
      },
      refinance: best && visited.includes('refinance') ? { monthlySaving: best.monthlySaving, netPresentValue: best.netPresentValue, mode: proposalMode } : undefined,
      consolidation: visited.includes('consolidation') ? { monthlyRelief: consolidation.monthlyRelief, maxFeasibleLoan: consolidation.regulation.maxFeasibleLoan } : undefined,
    };
  }, [market, refinance.comparison, consolidation, visited, proposalMode]);

  // Compare once, on the first fresh market read of this visit.
  useEffect(() => {
    if (status !== 'ready' || report) {
      return;
    }
    const previous = previousVisitSnapshot();
    setReport(
      previous && Date.now() - Date.parse(previous.at) > SAME_SITTING_MS
        ? { since: previous.at, changes: compareVisits(previous, current), published: newPublication(previous, current) }
        : { since: '', changes: [] },
    );
  }, [status, current, report]);

  // Keep the snapshot current, so the next visit compares against how this one ended.
  useEffect(() => {
    if (status === 'ready') {
      save(current);
    }
  }, [status, current, save]);

  if (dismissed || !report || (report.changes.length === 0 && !report.published)) {
    return null;
  }
  return (
    <section aria-label="מה השתנה מאז הביקור הקודם" className="no-print flex flex-col gap-2 rounded-[20px] border-2 border-flow-strong/40 bg-flow-card p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-extrabold">מאז הביקור הקודם ({date(report.since)})</h3>
        <button type="button" onClick={() => setDismissed(true)} className="min-h-9 px-2 text-sm font-bold underline">
          הבנתי
        </button>
      </div>
      {report.published && <p className="text-sm text-flow-muted">בנק ישראל פרסם את ממוצעי המשכנתאות של {monthLabel(report.published)}.</p>}
      {report.changes.length > 0 && (
        <ul className="flex flex-col">
          {report.changes.map((change) => (
            <li key={change.id} className="flex min-h-11 items-center justify-between gap-2 border-b border-flow-line py-1.5 text-[15px] last:border-b-0">
              <span className="font-bold">{change.label}</span>
              <span className="flex items-center gap-2 tabular-nums">
                {show(change, change.from)} ← {show(change, change.to)}
                <span className={`text-xs font-bold ${change.tone === 'good' ? 'text-flow-strong' : change.tone === 'bad' ? 'text-negative' : 'text-flow-muted'}`}>
                  {change.tone === 'good' ? 'לטובתכם' : change.tone === 'bad' ? 'לרעתכם' : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
