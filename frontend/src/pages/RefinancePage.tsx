import { ExistingTracksEditor } from '../components/refinance/ExistingTracksEditor';
import { ProposalEditor, RefinanceSettings } from '../components/refinance/ProposalEditor';
import { RefinanceResults } from '../components/refinance/RefinanceResults';
import { Card } from '../components/ui';
import { useRefinanceAnalysis } from '../store/refinanceStore';

/**
 * "Should I refinance?" The analysis recomputes on every keystroke — it is pure arithmetic over a
 * few hundred months and takes a few milliseconds, so there is no submit button to forget.
 */
export function RefinancePage() {
  const { proposal, comparison } = useRefinanceAnalysis();

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="min-w-0 space-y-5">
        <ExistingTracksEditor />
        <ProposalEditor proposal={proposal} />
        <RefinanceSettings />
      </div>
      <div className="min-w-0 space-y-5">
        {comparison ? (
          <RefinanceResults comparison={comparison} />
        ) : (
          <Card title="תוצאות">
            <p className="text-sm text-ink-soft">
              השלימו לכל מסלול יתרה, ריבית ויתרת תקופה, והניתוח יופיע כאן מיד.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
