import { useMemo } from 'react';
import { ActionPlanReport } from '../components/ActionPlanReport';
import { CombinedLinkCard } from '../components/consolidation/CombinedMoveCard';
import { DebtsTable, HouseholdCard, TermsCard } from '../components/consolidation/ConsolidationInputs';
import {
  BeforeAfterPanel,
  ConsolidationRisk,
  ConsolidationWaterfall,
  RegulatoryPanel,
  ShorteningSimulator,
} from '../components/consolidation/ConsolidationResults';
import { PageTabs, SummaryBar, TabPanel } from '../components/PageTabs';
import { consolidationPlan } from '../engine/actionPlan';
import type { ConsolidationAnalysis } from '../engine/consolidation';
import { scenarioOf } from '../lib/api';
import { formatCurrency, formatPercent, formatSignedCurrency } from '../lib/format';
import { usePageTab, type PageTab } from '../lib/pageTabs';
import { useConsolidation, useConsolidationAnalysis } from '../store/consolidationStore';
import { useWizard } from '../store/wizardStore';

type Section = 'household' | 'debts' | 'regulation' | 'cashflow' | 'plan';

/**
 * Debt consolidation against the home, one question per tab: the household and the loan on offer,
 * which debts to fold in, whether Directive 329 allows it, what it does to the cash flow, and what
 * to do. The verdict and the monthly relief stay in view above the tabs.
 */
export function ConsolidationPage() {
  const analysis = useConsolidationAnalysis();
  const debts = useConsolidation((state) => state.debts);
  const macro = useWizard((state) => state.macro);
  const plan = useMemo(() => consolidationPlan(analysis, scenarioOf(macro).primeAnnual), [analysis, macro]);

  const included = debts.filter((debt) => debt.include).length;
  const blocked = !analysis.regulation.feasible;
  const tabs = useMemo<PageTab<Section>[]>(
    () => [
      { id: 'household', label: 'משק הבית וההלוואה', icon: '🏠' },
      { id: 'debts', label: 'ההלוואות לאיחוד', icon: '🧾', badge: `${included}/${debts.length}` },
      { id: 'regulation', label: 'רגולציה ומרווח', icon: '⚖️', badge: blocked ? '!' : undefined },
      { id: 'cashflow', label: 'תזרים ועלות', icon: '💧' },
      { id: 'plan', label: 'תוכנית פעולה', icon: '✅' },
    ],
    [included, debts.length, blocked],
  );
  const [section, setSection] = usePageTab('consolidation', tabs);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <ConsolidationSummary analysis={analysis} onDetails={() => setSection('regulation')} />
      <PageTabs label="חלקי איחוד ההלוואות" idPrefix="consolidation" tabs={tabs} active={section} onSelect={setSection} />
      <TabPanel idPrefix="consolidation" tabs={tabs} active={section} onSelect={setSection}>
        {section === 'household' && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="min-w-0">
              <HouseholdCard />
            </div>
            <div className="min-w-0">
              <TermsCard analysis={analysis} />
            </div>
          </div>
        )}
        {section === 'debts' && <DebtsTable analysis={analysis} />}
        {section === 'regulation' && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
            <div className="min-w-0">
              <RegulatoryPanel analysis={analysis} />
            </div>
            <div className="min-w-0">
              <ConsolidationRisk analysis={analysis} />
            </div>
          </div>
        )}
        {section === 'cashflow' && (
          <>
            <BeforeAfterPanel analysis={analysis} />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="min-w-0">
                <ConsolidationWaterfall analysis={analysis} />
              </div>
              <div className="min-w-0">
                <ShorteningSimulator analysis={analysis} />
              </div>
            </div>
          </>
        )}
        {section === 'plan' && <ActionPlanReport plan={plan} />}
      </TabPanel>
      <CombinedLinkCard />
    </div>
  );
}

function ConsolidationSummary({
  analysis,
  onDetails,
}: {
  analysis: ConsolidationAnalysis;
  onDetails: () => void;
}) {
  const r = analysis.regulation;
  const [tone, title] = !r.feasible
    ? (['negative', 'לא עומד בהוראה 329 כפי שהוגדר'] as const)
    : !r.bankFeasible
      ? (['caution', 'עומד ברגולציה, מעל מדיניות 40% בבנקים'] as const)
      : (['positive', 'בר-ביצוע לפי הוראת בנק ישראל'] as const);

  return (
    <SummaryBar
      label="סיכום איחוד ההלוואות"
      tone={tone}
      eyebrow={`איחוד ${formatCurrency(analysis.allocation.amount)} בהלוואה לכל מטרה`}
      title={title}
      action={
        <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={onDetails}>
          לפירוט הרגולציה
        </button>
      }
      figures={[
        {
          label: 'החזר חודשי כולל',
          value: formatCurrency(analysis.paymentAfter),
          note: `היום ${formatCurrency(analysis.paymentBefore)}`,
        },
        {
          label: 'חמצן תזרימי',
          value: formatSignedCurrency(analysis.monthlyRelief),
          tone: analysis.monthlyRelief > 0 ? 'positive' : 'negative',
        },
        {
          label: 'PTI לפי 1.10.2026',
          value: r.ptiExempt ? 'פטור' : formatPercent(r.pti, 1),
          tone: r.bankFeasible ? undefined : 'negative',
        },
        {
          label: 'מקסימום לאיחוד',
          value: formatCurrency(r.maxFeasibleLoan),
          note: r.exemptionRemaining > 0 ? `פטור עד ${formatCurrency(r.exemptionRemaining)}` : undefined,
        },
      ]}
    />
  );
}
