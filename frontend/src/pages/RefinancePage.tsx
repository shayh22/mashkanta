import { ExistingTracksEditor } from '../components/refinance/ExistingTracksEditor';
import { ProposalEditor, RefinanceSettings } from '../components/refinance/ProposalEditor';
import { RefinanceResults } from '../components/refinance/RefinanceResults';
import { useMemo } from 'react';
import { ActionPlanReport } from '../components/ActionPlanReport';
import { Card } from '../components/ui';
import { refinancePlan } from '../engine/actionPlan';
import { scenarioOf } from '../lib/api';
import { useRefinance } from '../store/refinanceStore';
import { useWizard } from '../store/wizardStore';
import { useRefinanceAnalysis } from '../store/refinanceStore';

/**
 * "Should I refinance?" The analysis recomputes on every keystroke — it is pure arithmetic over a
 * few hundred months and takes a few milliseconds, so there is no submit button to forget.
 */
export function RefinancePage() {
  const { proposal, comparison, ltv } = useRefinanceAnalysis();
  const noticeGiven = useRefinance((state) => state.noticeGiven);
  const macro = useWizard((state) => state.macro);
  const plan = useMemo(
    () => comparison && refinancePlan(comparison, proposal, ltv, scenarioOf(macro).primeAnnual, noticeGiven),
    [comparison, proposal, ltv, macro, noticeGiven],
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <ExistingTracksEditor />
          <ProposalEditor proposal={proposal} />
          <RefinanceSettings />
        </div>
        <div className="min-w-0 space-y-5">
          {comparison ? (
            <RefinanceResults comparison={comparison} ltv={ltv} />
          ) : (
            <Card title="תוצאות">
              <p className="text-sm text-ink-soft">
                השלימו לכל מסלול יתרה, ריבית ויתרת תקופה, והניתוח יופיע כאן מיד.
              </p>
            </Card>
          )}
        </div>
      </div>
      {plan && <ActionPlanReport plan={plan} />}
    </div>
  );
}
