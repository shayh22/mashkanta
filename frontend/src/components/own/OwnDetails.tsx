import type { ConsolidationAnalysis } from '../../engine/consolidation';
import type { RefinanceComparison } from '../../engine/refinance';
import { MarketTrends } from '../MarketTrends';
import { CombinedComparison } from '../consolidation/CombinedMoveCard';
import { BeforeAfterPanel, RegulatoryPanel } from '../consolidation/ConsolidationResults';
import { RefinanceCharts, RefinanceFees, RouteComparison } from '../refinance/RefinanceResults';

/**
 * The folded sections of the homeowner's result that draw charts. They live in their own module so
 * the charting library loads with the result, not with the first screen.
 */
export function FeesDetails({ comparison, ltv }: { comparison: RefinanceComparison; ltv: number }) {
  return (
    <>
      <RouteComparison comparison={comparison} />
      <RefinanceFees comparison={comparison} />
      <RefinanceCharts comparison={comparison} ltv={ltv} />
    </>
  );
}

export function ConsolidationDetails({ analysis }: { analysis: ConsolidationAnalysis }) {
  return (
    <>
      <RegulatoryPanel analysis={analysis} />
      <BeforeAfterPanel analysis={analysis} />
      <CombinedComparison />
    </>
  );
}

export { MarketTrends };
