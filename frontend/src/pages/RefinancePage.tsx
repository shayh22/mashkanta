import { useMemo } from 'react';
import { ActionPlanReport } from '../components/ActionPlanReport';
import { CombinedLinkCard } from '../components/consolidation/CombinedMoveCard';
import { MarketTrends } from '../components/MarketTrends';
import { MixExplainer } from '../components/MixExplainer';
import { PageTabs, SummaryBar, TabPanel, type SummaryTone } from '../components/PageTabs';
import { ExistingTracksEditor } from '../components/refinance/ExistingTracksEditor';
import { ProposalEditor, RefinanceSettings } from '../components/refinance/ProposalEditor';
import {
  RefinanceCharts,
  RefinanceFees,
  RefinanceVerdict,
  RouteComparison,
} from '../components/refinance/RefinanceResults';
import { TrackVerdicts } from '../components/refinance/TrackVerdicts';
import { Card } from '../components/ui';
import { refinancePlan } from '../engine/actionPlan';
import { VERDICT_LABELS, type RefinanceComparison, type RefinanceVerdict as Verdict } from '../engine/refinance';
import { scenarioOf } from '../lib/api';
import { refinanceExplainRequest } from '../lib/explainRequest';
import { formatCurrency, formatSignedCurrency } from '../lib/format';
import { usePageTab, type PageTab } from '../lib/pageTabs';
import { usePrinting } from '../lib/printing';
import { bestRoute, ROUTE_NAME } from '../lib/routes';
import { useRefinance, useRefinanceAnalysis } from '../store/refinanceStore';
import { useWizard } from '../store/wizardStore';

type Section = 'data' | 'tracks' | 'proposal' | 'results' | 'fees' | 'market' | 'plan';

const VERDICT_TONE: Record<Verdict, SummaryTone> = {
  IMMEDIATE: 'positive',
  LONG_TERM: 'caution',
  NOT_WORTHWHILE: 'negative',
};

/**
 * "Should I refinance?" in the order a borrower works through it: their mortgage, which tracks pay
 * to refinance, the offer to compare against, the result, the fees behind it, the market, and what to
 * do. The verdict stays in view above the tabs, and recomputes on every keystroke.
 */
export function RefinancePage() {
  const { proposal, comparison, ltv, perTrack, optimal } = useRefinanceAnalysis();
  const tracks = useRefinance((state) => state.tracks);
  const proposalMode = useRefinance((state) => state.proposalMode);
  const riskTolerance = useWizard((state) => state.profile.riskTolerance);
  const noticeGiven = useRefinance((state) => state.noticeGiven);
  const macro = useWizard((state) => state.macro);
  const plan = useMemo(
    () => comparison && refinancePlan(comparison, proposal, ltv, scenarioOf(macro).primeAnnual, noticeGiven),
    [comparison, proposal, ltv, macro, noticeGiven],
  );
  const explainRequest = useMemo(
    () =>
      comparison && refinanceExplainRequest(comparison, proposal, proposalMode, ltv, scenarioOf(macro), riskTolerance),
    [comparison, proposal, proposalMode, ltv, macro, riskTolerance],
  );

  const worthwhile = perTrack.filter((track) => track.worthwhile).length;
  const tabs = useMemo<PageTab<Section>[]>(
    () => [
      { id: 'data', label: 'המשכנתא שלי', icon: '📄', badge: tracks.length ? String(tracks.length) : undefined },
      {
        id: 'tracks',
        label: 'כדאיות לפי מסלול',
        icon: '🧭',
        badge: perTrack.length ? `${worthwhile}/${perTrack.length}` : undefined,
      },
      { id: 'proposal', label: 'ההצעה החלופית', icon: '✏️' },
      { id: 'results', label: 'תוצאות', icon: '📊' },
      { id: 'fees', label: 'עמלות', icon: '🧾' },
      { id: 'market', label: 'מגמות שוק', icon: '📈' },
      { id: 'plan', label: 'תוכנית פעולה', icon: '✅' },
    ],
    [tracks.length, perTrack.length, worthwhile],
  );
  const [section, setSection] = usePageTab('refinance', tabs);
  const printing = usePrinting();
  // Every section when printing, so a printed or saved report is complete.
  const shows = (id: Section) => printing || section === id;

  const missing = (
    <Card title="חסרים נתונים">
      <p className="text-sm text-ink-soft">
        השלימו לכל מסלול יתרה, ריבית ויתרת תקופה בלשונית "המשכנתא שלי", והניתוח יופיע כאן מיד.
      </p>
    </Card>
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <RefinanceSummary comparison={comparison} onDetails={() => setSection('results')} />
      <PageTabs label="חלקי בדיקת המיחזור" idPrefix="refinance" tabs={tabs} active={section} onSelect={setSection} />
      <TabPanel idPrefix="refinance" tabs={tabs} active={section} onSelect={setSection}>
        {shows('data') && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
            <div className="min-w-0">
              <ExistingTracksEditor />
            </div>
            <div className="min-w-0">
              <RefinanceSettings />
            </div>
          </div>
        )}
        {shows('tracks') && <TrackVerdicts verdicts={perTrack} />}
        {shows('proposal') && <ProposalEditor proposal={proposal} optimal={optimal} />}
        {shows('results') &&
          (comparison ? (
            <>
              <RefinanceVerdict comparison={comparison} />
              <MixExplainer request={explainRequest} />
              <RouteComparison comparison={comparison} />
              <RefinanceCharts comparison={comparison} ltv={ltv} />
            </>
          ) : (
            missing
          ))}
        {shows('fees') && (comparison ? <RefinanceFees comparison={comparison} /> : missing)}
        {shows('market') && <MarketTrends />}
        {shows('plan') && (plan ? <ActionPlanReport plan={plan} /> : missing)}
      </TabPanel>
      <CombinedLinkCard />
    </div>
  );
}

function RefinanceSummary({
  comparison,
  onDetails,
}: {
  comparison?: RefinanceComparison;
  onDetails: () => void;
}) {
  if (!comparison) {
    return (
      <SummaryBar
        label="סיכום בדיקת המיחזור"
        tone="neutral"
        title="הזינו את המשכנתא או ייבאו דוח מהבנק"
        figures={[]}
      />
    );
  }
  const best = bestRoute(comparison);
  return (
    <SummaryBar
      label="סיכום בדיקת המיחזור"
      tone={VERDICT_TONE[best.verdict]}
      eyebrow={`הדרך המשתלמת: ${ROUTE_NAME[comparison.best]}`}
      title={VERDICT_LABELS[best.verdict]}
      action={
        <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={onDetails}>
          לפירוט התוצאות
        </button>
      }
      figures={[
        {
          label: 'החזר חודשי',
          value: formatCurrency(best.proposedPayment),
          note: `היום ${formatCurrency(best.currentPayment)}`,
        },
        {
          label: 'חיסכון חודשי',
          value: formatSignedCurrency(best.monthlySaving),
          tone: best.monthlySaving > 0 ? 'positive' : 'negative',
        },
        {
          label: 'נקודת איזון',
          term: 'breakeven',
          value: best.breakevenMonth > 0 ? `חודש ${best.breakevenMonth}` : 'לא מושגת',
          note: `עלות מעבר ${formatCurrency(best.upfrontCost)}`,
        },
        {
          label: 'ערך נוכחי נקי',
          term: 'npv',
          value: formatSignedCurrency(best.netPresentValue),
          tone: best.netPresentValue > 0 ? 'positive' : 'negative',
        },
      ]}
    />
  );
}
