import { useEffect, useMemo, useState } from 'react';
import { compareVisits, newPublication, type VisitChange, type VisitSnapshot } from '../engine/visits';
import { monthLabel } from '../engine/liveMarket';
import { formatCurrency, formatPercent } from '../lib/format';
import { bestRoute } from '../lib/routes';
import { useConsolidationAnalysis } from '../store/consolidationStore';
import { useMarket } from '../store/marketStore';
import { useRefinanceAnalysis } from '../store/refinanceStore';
import { previousVisitSnapshot, useVisits } from '../store/visitStore';

/** A visit less than this long after the last one is the same sitting, not a return. */
const SAME_SITTING_MS = 30 * 60 * 1000;

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' });

const show = (change: VisitChange, value: number) =>
  change.unit === 'rate' ? formatPercent(value) : formatCurrency(value);

/**
 * "Since your last visit": what moved in the market and what that did to the borrower's own
 * results. Worked out once, as soon as fresh market figures arrive, so later edits in this visit
 * do not show up as news. The snapshot it compares against lives only in this browser.
 */
export function SinceLastVisit() {
  const status = useMarket((state) => state.status);
  const market = useMarket((state) => state.market);
  const visited = useVisits((state) => state.visited);
  const save = useVisits((state) => state.save);
  const refinance = useRefinanceAnalysis();
  const consolidation = useConsolidationAnalysis();
  const [report, setReport] = useState<{ since: string; changes: VisitChange[]; published?: string }>();
  const [dismissed, setDismissed] = useState(false);

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
      refinance:
        best && visited.includes('refinance')
          ? { monthlySaving: best.monthlySaving, netPresentValue: best.netPresentValue }
          : undefined,
      consolidation:
        visited.includes('consolidation') || visited.includes('combined')
          ? {
              monthlyRelief: consolidation.monthlyRelief,
              maxFeasibleLoan: consolidation.regulation.maxFeasibleLoan,
            }
          : undefined,
    };
  }, [market, refinance.comparison, consolidation, visited]);

  // Compare once, on the first fresh market read of this visit.
  useEffect(() => {
    if (status !== 'ready' || report) {
      return;
    }
    const previous = previousVisitSnapshot();
    if (previous && Date.now() - Date.parse(previous.at) > SAME_SITTING_MS) {
      setReport({ since: previous.at, changes: compareVisits(previous, current), published: newPublication(previous, current) });
    } else {
      setReport({ since: '', changes: [] });
    }
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
    <section className="no-print mt-4 px-4" aria-label="מה השתנה מאז הביקור הקודם">
      <div className="card mx-auto flex w-full max-w-6xl flex-col gap-3 border-brand-500/30 bg-brand-50/60 sm:flex-row sm:items-start">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-lg" aria-hidden>
          🔔
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">מאז הביקור הקודם ({date(report.since)})</h2>
          {report.published && (
            <p className="mt-0.5 text-xs text-ink-soft">
              בנק ישראל פרסם את ממוצעי המשכנתאות של {monthLabel(report.published)}.
            </p>
          )}
          {report.changes.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {report.changes.map((change) => (
                <li
                  key={change.id}
                  className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 py-1 text-xs"
                >
                  <span
                    aria-hidden
                    className={change.tone === 'good' ? 'text-positive' : change.tone === 'bad' ? 'text-negative' : 'text-ink-soft'}
                  >
                    {change.to > change.from ? '▲' : '▼'}
                  </span>
                  <span className="text-ink-muted">{change.label}:</span>
                  <span className="tabular font-medium text-ink">
                    {show(change, change.from)} ← {show(change, change.to)}
                  </span>
                  <span className={`text-[11px] ${change.tone === 'good' ? 'text-positive' : 'text-negative'}`}>
                    {change.tone === 'good' ? 'לטובתך' : 'לרעתך'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" className="btn-ghost self-start" onClick={() => setDismissed(true)}>
          הבנתי
        </button>
      </div>
    </section>
  );
}
