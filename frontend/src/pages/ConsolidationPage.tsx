import {
  BeforeAfterPanel,
  ConsolidationRisk,
  ConsolidationWaterfall,
  RegulatoryPanel,
  ShorteningSimulator,
} from '../components/consolidation/ConsolidationResults';
import { DebtsTable, HouseholdCard, TermsCard } from '../components/consolidation/ConsolidationInputs';
import { useMemo } from 'react';
import { ActionPlanReport } from '../components/ActionPlanReport';
import { CombinedMoveCard } from '../components/consolidation/CombinedMoveCard';
import { consolidationPlan } from '../engine/actionPlan';
import { scenarioOf } from '../lib/api';
import { useConsolidationAnalysis } from '../store/consolidationStore';
import { useWizard } from '../store/wizardStore';

/**
 * Debt consolidation against the home. Inputs on one side, the regulatory verdict and the
 * cash-flow trade-off on the other, all live.
 */
export function ConsolidationPage() {
  const analysis = useConsolidationAnalysis();
  const macro = useWizard((state) => state.macro);
  const plan = useMemo(() => consolidationPlan(analysis, scenarioOf(macro).primeAnnual), [analysis, macro]);
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <HouseholdCard />
          <TermsCard analysis={analysis} />
        </div>
        <div className="min-w-0 space-y-5">
          <RegulatoryPanel analysis={analysis} />
        </div>
      </div>
      <DebtsTable analysis={analysis} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <ConsolidationWaterfall analysis={analysis} />
        </div>
        <div className="min-w-0">
          <ConsolidationRisk analysis={analysis} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <BeforeAfterPanel analysis={analysis} />
        </div>
        <div className="min-w-0">
          <ShorteningSimulator analysis={analysis} />
        </div>
      </div>
      <CombinedMoveCard />
      <ActionPlanReport plan={plan} />
    </div>
  );
}
