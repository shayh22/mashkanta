import { useMemo } from 'react';
import { ActionPlanReport } from '../components/ActionPlanReport';
import { RiskPanel } from '../components/charts/RiskGauge';
import { WaterfallChart } from '../components/charts/WaterfallChart';
import { CombinedComparison } from '../components/consolidation/CombinedMoveCard';
import { StatementImporter } from '../components/refinance/StatementImporter';
import { PageTabs, SummaryBar, TabPanel } from '../components/PageTabs';
import { Card, Stat } from '../components/ui';
import { combinedPlan } from '../engine/actionPlan';
import { combinedSteps } from '../engine/combined';
import { ltvRisk, primeRisk, ptiRisk } from '../engine/risk';
import { scenarioOf } from '../lib/api';
import { formatCurrency, formatPercent, formatSignedCurrency } from '../lib/format';
import { usePageTab, type PageTab } from '../lib/pageTabs';
import { useCombinedMove } from '../store/combinedStore';
import { useConsolidation } from '../store/consolidationStore';
import { outstandingBalance, useRefinance } from '../store/refinanceStore';
import { useWizard } from '../store/wizardStore';

type Section = 'inputs' | 'compare' | 'cashflow' | 'plan';

const TABS: PageTab<Section>[] = [
  { id: 'inputs', label: 'הנתונים', icon: '📋' },
  { id: 'compare', label: 'איחוד בלבד מול משולב', icon: '⚖️' },
  { id: 'cashflow', label: 'תזרים וסיכון', icon: '💧' },
  { id: 'plan', label: 'תוכנית פעולה', icon: '✅' },
];

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
  const [section, setSection] = usePageTab('combined', TABS);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      {move ? (
        <SummaryBar
          label="תוצאת המהלך המשולב"
          tone={
            !move.combined.regulation.feasible
              ? 'negative'
              : move.paymentAfter < move.paymentToday
                ? 'positive'
                : 'caution'
          }
          eyebrow="מיחזור המשכנתא + איחוד ההלוואות"
          title={
            move.combined.regulation.feasible ? 'שני המהלכים יחד — בר-ביצוע' : 'המהלך המשולב חורג מהוראה 329'
          }
          figures={[
            {
              label: 'החזר חודשי כולל',
              value: formatCurrency(move.paymentAfter),
              note: `היום ${formatCurrency(move.paymentToday)}`,
            },
            {
              label: 'חמצן תזרימי',
              value: formatSignedCurrency(move.paymentToday - move.paymentAfter),
              tone: move.paymentAfter < move.paymentToday ? 'positive' : 'negative',
              note: `מתוכם מהמיחזור: ${formatSignedCurrency(move.extraReliefFromRefinance)}`,
            },
            {
              label: 'PTI לפי 1.10.2026',
              value: move.combined.regulation.ptiExempt ? 'פטור' : formatPercent(move.combined.regulation.pti, 1),
              note: `איחוד בלבד: ${
                move.consolidationOnly.regulation.ptiExempt
                  ? 'פטור'
                  : formatPercent(move.consolidationOnly.regulation.pti, 1)
              }`,
            },
            { label: 'מזומן ביום המהלך', value: formatCurrency(move.cashUpfront) },
          ]}
        />
      ) : (
        <SummaryBar
          label="תוצאת המהלך המשולב"
          tone="neutral"
          title="השלימו את נתוני המשכנתא כדי לראות את המהלך המשולב"
          figures={[]}
        />
      )}
      <PageTabs label="חלקי המהלך המשולב" idPrefix="combined" tabs={TABS} active={section} onSelect={setSection} />
      <TabPanel idPrefix="combined" tabs={TABS} active={section} onSelect={setSection}>
        {section === 'inputs' && (
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
                  <a href="#/refinance/data" className="text-xs font-medium text-brand-700">
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
                  <a href="#/consolidation/household" className="text-xs font-medium text-brand-700">
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
        )}

        {section === 'compare' && <CombinedComparison />}

        {section === 'cashflow' && move && (
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

        {section === 'plan' && plan && <ActionPlanReport plan={plan} />}
        {(section === 'cashflow' || section === 'plan') && !move && (
          <Card title="חסרים נתונים">
            <p className="text-sm text-ink-soft">השלימו את נתוני המשכנתא בלשונית "הנתונים".</p>
          </Card>
        )}
      </TabPanel>
    </div>
  );
}
