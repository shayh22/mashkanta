import { useMemo } from 'react';
import { ActionPlanReport } from '../components/ActionPlanReport';
import { RiskPanel } from '../components/charts/RiskGauge';
import { WaterfallChart } from '../components/charts/WaterfallChart';
import { CombinedComparison } from '../components/consolidation/CombinedMoveCard';
import { StatementImporter } from '../components/refinance/StatementImporter';
import { Card, Stat } from '../components/ui';
import { combinedPlan } from '../engine/actionPlan';
import { combinedSteps } from '../engine/combined';
import { ltvRisk, primeRisk, ptiRisk } from '../engine/risk';
import { scenarioOf } from '../lib/api';
import { formatCurrency, formatPercent, formatSignedCurrency } from '../lib/format';
import { useCombinedMove } from '../store/combinedStore';
import { useConsolidation } from '../store/consolidationStore';
import { outstandingBalance, useRefinance } from '../store/refinanceStore';
import { useWizard } from '../store/wizardStore';

/**
 * Refinancing the mortgage and consolidating debt as one move. The inputs are the ones already
 * entered in the two single-move modes — this page puts them side by side, re-tests the
 * consolidation against the refinanced mortgage, and gives one plan for both.
 */
export function CombinedPage() {
  const { move, comparison, proposal, ltv } = useCombinedMove();
  const tracks = useRefinance((state) => state.tracks);
  const noticeGiven = useRefinance((state) => state.noticeGiven);
  const netIncome = useConsolidation((state) => state.netIncome);
  const debts = useConsolidation((state) => state.debts);
  const macro = useWizard((state) => state.macro);

  const plan = useMemo(
    () =>
      move && comparison
        ? combinedPlan(move, comparison, proposal, ltv, scenarioOf(macro).primeAnnual, noticeGiven)
        : undefined,
    [move, comparison, proposal, ltv, macro, noticeGiven],
  );

  const included = debts.filter((debt) => debt.include && debt.balance > 0);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <Card
        title="מיחזור ואיחוד באותו מהלך"
        subtitle="מיחזור המשכנתא משנה את ההחזר הקיים על הנכס ואת חלק המשתנה — ולכן גם כמה מותר לאחד לפי הוראת בנק ישראל מ-1.10.2026. כאן רואים את שני המהלכים יחד."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <section className="card-muted" aria-labelledby="combined-mortgage">
            <div className="flex items-start justify-between gap-2">
              <h3 id="combined-mortgage" className="text-sm font-semibold text-ink">
                🔄 המשכנתא
              </h3>
              <a href="#/refinance" className="text-xs font-medium text-brand-700">
                עריכה
              </a>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <Stat
                label="יתרה"
                value={formatCurrency(outstandingBalance(tracks))}
                note={`${tracks.length} מסלולים`}
              />
              <Stat
                label="החזר היום"
                value={comparison ? formatCurrency(comparison.internal.currentPayment) : '—'}
              />
            </dl>
          </section>
          <section className="card-muted" aria-labelledby="combined-household">
            <div className="flex items-start justify-between gap-2">
              <h3 id="combined-household" className="text-sm font-semibold text-ink">
                🧩 משק הבית וההלוואות
              </h3>
              <a href="#/consolidation" className="text-xs font-medium text-brand-700">
                עריכה
              </a>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <Stat label="הכנסה נטו" value={formatCurrency(netIncome)} />
              <Stat
                label="לאיחוד"
                value={formatCurrency(included.reduce((sum, debt) => sum + debt.balance, 0))}
                note={`${included.length} מתוך ${debts.length} הלוואות`}
              />
            </dl>
          </section>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">
            ייבוא המשכנתא מדוח הבנק
          </summary>
          <div className="mt-3">
            <StatementImporter />
          </div>
        </details>
      </Card>

      {move && (
        <section
          className={`animate-fade-up rounded-2xl border p-5 ${
            move.combined.regulation.feasible
              ? 'border-emerald-500/30 bg-emerald-500/10 text-positive'
              : 'border-rose-500/30 bg-rose-500/10 text-negative'
          }`}
          aria-live="polite"
          aria-label="תוצאת המהלך המשולב"
        >
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="החזר חודשי היום" value={formatCurrency(move.paymentToday)} />
            <Stat label="אחרי שני המהלכים" value={formatCurrency(move.paymentAfter)} />
            <Stat
              label="חמצן תזרימי"
              value={`${formatSignedCurrency(move.paymentToday - move.paymentAfter)} לחודש`}
              tone={move.paymentAfter < move.paymentToday ? 'positive' : 'negative'}
              note={`מתוכם מהמיחזור: ${formatSignedCurrency(move.extraReliefFromRefinance)}`}
            />
            <Stat
              label="PTI לפי 1.10.2026"
              value={
                move.combined.regulation.ptiExempt ? 'פטור' : formatPercent(move.combined.regulation.pti, 1)
              }
              note={`איחוד בלבד: ${
                move.consolidationOnly.regulation.ptiExempt
                  ? 'פטור'
                  : formatPercent(move.consolidationOnly.regulation.pti, 1)
              }`}
            />
          </dl>
        </section>
      )}

      <CombinedComparison />

      {move && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="min-w-0">
            <WaterfallChart
              title="מפל ההחזר החודשי — שני המהלכים"
              subtitle="ההחזר היום, השינוי במשכנתא הממוחזרת, ההלוואות שנסגרות וההלוואה החדשה."
              start={move.paymentToday}
              steps={combinedSteps(move)}
              endLabel="אחרי"
            />
          </div>
          <div className="min-w-0">
            <RiskPanel
              indicators={[
                ltvRisk(move.combined.regulation.ltvAfter),
                ptiRisk(move.combined.regulation.pti),
                primeRisk(move.combined.regulation.variableShareAfter),
              ]}
            />
          </div>
        </div>
      )}

      {plan && <ActionPlanReport plan={plan} />}
    </div>
  );
}
